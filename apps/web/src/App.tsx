import {
  DigitStringError,
  digitsToString,
  parseDigitsString,
} from '@numeron/core'
import { useCallback, useEffect, useState } from 'react'
import { getSupabase, isSupabaseConfigured } from './lib/supabase'

type Room = {
  id: string
  short_code: string
  status: string
  digit_length: number
  created_by: string
  current_turn_user_id: string | null
  winner_user_id: string | null
  match_wins_required: number
  match_wins: Record<string, number>
  current_game_index: number
  double_attacker_id?: string | null
  double_phase?: string | null
  double_reveal_slot?: number | null
  double_reveal_digit?: string | null
}

type GuessRow = {
  id: string
  room_id: string
  guesser_id: string
  digits: string
  hit: number
  blow: number
  created_at: string
}

const ITEM_KINDS = ['DOUBLE', 'HIGHLOW', 'TARGET', 'SLASH', 'SHUFFLE', 'CHANGE'] as const
type ItemKind = (typeof ITEM_KINDS)[number]

const ITEM_LABELS: Record<ItemKind, string> = {
  DOUBLE: 'ダブル',
  HIGHLOW: 'HIGH&LOW',
  TARGET: 'ターゲット',
  SLASH: 'スラッシュ',
  SHUFFLE: 'シャッフル',
  CHANGE: 'チェンジ',
}

type ItemCardRow = {
  room_id: string
  user_id: string
  item_kind: ItemKind
  used_at: string | null
}

type ItemEventRow = {
  id: string
  room_id: string
  actor_id: string
  item_kind: Exclude<ItemKind, 'DOUBLE'>
  public_data: Record<string, unknown>
  created_at: string
}

type TimelineEntry =
  | { sortKey: string; kind: 'g'; guess: GuessRow }
  | { sortKey: string; kind: 'i'; ev: ItemEventRow; secretPayload: Record<string, unknown> | null }

function orderedItemSlots(rows: ItemCardRow[], uid: string): { kind: ItemKind; used: boolean }[] {
  return ITEM_KINDS.map((kind) => {
    const row = rows.find((r) => r.user_id === uid && r.item_kind === kind)
    return { kind, used: Boolean(row?.used_at) }
  })
}

function randomShortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

function errMessage(e: unknown): string {
  if (e instanceof DigitStringError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}

function roomStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'lobby':
      return 'ロビー'
    case 'waiting':
      return 'ナンバー設定'
    case 'playing':
      return '対局中'
    case 'finished':
      return '終了'
    default:
      return status ?? '…'
  }
}

// アイテムイベントのテキストを生成
function formatItemEventLine(
  ev: ItemEventRow,
  viewerId: string,
  secretPayload: Record<string, unknown> | null,
): string {
  const you = ev.actor_id === viewerId
  const who = you ? 'あなた' : '相手'
  switch (ev.item_kind) {
    case 'HIGHLOW': {
      if (you && secretPayload?.levels && Array.isArray(secretPayload.levels)) {
        return `HIGH&LOW（${who}）→ ${(secretPayload.levels as string[]).join('')}`
      }
      return `HIGH&LOW（${who}）`
    }
    case 'TARGET': {
      const q = ev.public_data.queried_digit
      const base =
        typeof q === 'number' || typeof q === 'string' ? `ターゲット ${q}（${who}）` : `ターゲット（${who}）`
      if (you && secretPayload && typeof secretPayload.contains === 'boolean') {
        if (secretPayload.contains && typeof secretPayload.slot === 'number') {
          return `${base} → 含む · 左から ${secretPayload.slot} 桁目`
        }
        return `${base} → 含まない`
      }
      return base
    }
    case 'SLASH': {
      if (you && secretPayload && typeof secretPayload.spread === 'number') {
        return `スラッシュ（${who}）→ 差 ${String(secretPayload.spread)}`
      }
      return `スラッシュ（${who}）`
    }
    case 'SHUFFLE':
      return `シャッフル（${who}・自分の並び変更）`
    case 'CHANGE': {
      const sl = ev.public_data.slot
      return `チェンジ（${who}${typeof sl === 'number' ? ` · ${sl} 桁目` : ''}）`
    }
    default:
      return `${ev.item_kind}（${who}）`
  }
}

const DEFAULT_DIGIT_LENGTH: 3 | 4 = 3
const DEFAULT_MATCH_WINS_REQUIRED = 1

export function App() {
  const [booting, setBooting] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [mySecretDigits, setMySecretDigits] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [secretInput, setSecretInput] = useState('')
  const [guessInput, setGuessInput] = useState('')
  const [memberUserIds, setMemberUserIds] = useState<string[]>([])
  const [itemCards, setItemCards] = useState<ItemCardRow[]>([])
  const [itemEvents, setItemEvents] = useState<ItemEventRow[]>([])
  const [itemSecretPayloads, setItemSecretPayloads] = useState<Record<string, Record<string, unknown>>>({})
  const [targetDigitInput, setTargetDigitInput] = useState('')
  const [changeSlot, setChangeSlot] = useState(1)
  const [changeNewDigit, setChangeNewDigit] = useState('')
  const [lobbyDraftDigit, setLobbyDraftDigit] = useState<3 | 4>(3)
  const [lobbyDraftMatchWins, setLobbyDraftMatchWins] = useState(1)
  const [codeCopiedHint, setCodeCopiedHint] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshAll = useCallback(async () => {
    if (!roomId || !userId) return
    const [roomRes, guessesRes, secretRes, membersRes, cardsRes, eventsRes] = await Promise.all([
      getSupabase().from('rooms').select('*').eq('id', roomId).single(),
      getSupabase().from('guesses').select('*').eq('room_id', roomId).order('created_at', { ascending: true }),
      getSupabase()
        .from('room_secrets')
        .select('digits')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle(),
      getSupabase().from('room_members').select('user_id').eq('room_id', roomId),
      getSupabase().from('room_item_cards').select('*').eq('room_id', roomId),
      getSupabase()
        .from('room_item_events')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true }),
    ])
    if (roomRes.error) {
      setError(roomRes.error.message)
      return
    }
    if (guessesRes.error) {
      setError(guessesRes.error.message)
      return
    }
    if (secretRes.error) {
      setError(secretRes.error.message)
      return
    }
    if (membersRes.error) {
      setError(membersRes.error.message)
      return
    }
    if (cardsRes.error) {
      setError(cardsRes.error.message)
      return
    }
    if (eventsRes.error) {
      setError(eventsRes.error.message)
      return
    }
    const evs = (eventsRes.data as ItemEventRow[]) ?? []
    setRoom(roomRes.data as Room)
    setGuesses((guessesRes.data as GuessRow[]) ?? [])
    setMySecretDigits(secretRes.data?.digits ?? null)
    setMemberCount(membersRes.data?.length ?? 0)
    setMemberUserIds((membersRes.data ?? []).map((row) => row.user_id as string))
    setItemCards((cardsRes.data as ItemCardRow[]) ?? [])
    setItemEvents(evs)

    const evIds = evs.map((e) => e.id)
    if (evIds.length === 0) {
      setItemSecretPayloads({})
    } else {
      const secRes = await getSupabase()
        .from('room_item_event_secrets')
        .select('event_id, payload')
        .in('event_id', evIds)
      if (secRes.error) {
        setError(secRes.error.message)
        return
      }
      const map: Record<string, Record<string, unknown>> = {}
      for (const row of (secRes.data as { event_id: string; payload: Record<string, unknown> }[]) ?? []) {
        map[row.event_id] = row.payload
      }
      setItemSecretPayloads(map)
    }
  }, [roomId, userId])

  useEffect(() => {
    if (!room || room.status !== 'lobby') return
    setLobbyDraftDigit(room.digit_length as 3 | 4)
    setLobbyDraftMatchWins(room.match_wins_required)
  }, [room?.id, room?.digit_length, room?.match_wins_required, room?.status])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setBooting(false)
      return
    }
    let alive = true
    void (async () => {
      const sb = getSupabase()
      const {
        data: { session },
      } = await sb.auth.getSession()
      if (session) {
        const { data: u, error: validateErr } = await sb.auth.getUser()
        if (validateErr || !u.user) {
          await sb.auth.signOut()
          const { error: e } = await sb.auth.signInAnonymously()
          if (e) {
            if (alive) {
              setError(e.message)
              setBooting(false)
            }
            return
          }
        }
      } else {
        const { error: e } = await sb.auth.signInAnonymously()
        if (e) {
          if (alive) {
            setError(e.message)
            setBooting(false)
          }
          return
        }
      }
      const {
        data: { session: s2 },
      } = await sb.auth.getSession()
      if (alive) {
        setUserId(s2?.user.id ?? null)
        setBooting(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!roomId || !isSupabaseConfigured) return
    const filterRoom = `id=eq.${roomId}`
    const filterGuess = `room_id=eq.${roomId}`
    const filterCards = `room_id=eq.${roomId}`
    const filterItemEvents = `room_id=eq.${roomId}`
    const ch = getSupabase()
      .channel(`public:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: filterRoom }, () => {
        void refreshAll()
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'guesses', filter: filterGuess },
        () => {
          void refreshAll()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_item_cards', filter: filterCards },
        () => {
          void refreshAll()
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_item_events', filter: filterItemEvents },
        () => {
          void refreshAll()
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
        () => {
          void refreshAll()
        },
      )
      .subscribe()
    void refreshAll()
    return () => {
      void getSupabase().removeChannel(ch)
    }
  }, [roomId, refreshAll])

  async function handleCreateRoom() {
    setError(null)
    if (!userId) return
    const code = randomShortCode()
    const { data: created, error: e1 } = await getSupabase()
      .from('rooms')
      .insert({
        short_code: code,
        status: 'lobby',
        digit_length: DEFAULT_DIGIT_LENGTH,
        match_wins_required: DEFAULT_MATCH_WINS_REQUIRED,
      })
      .select()
      .single()
    if (e1) {
      setError(e1.message)
      return
    }
    const { error: e2 } = await getSupabase().from('room_members').insert({ room_id: created.id, user_id: userId })
    if (e2) {
      setError(e2.message)
      return
    }
    setRoom(created as Room)
    setRoomId(created.id as string)
  }

  async function handleJoinRoom() {
    setError(null)
    if (!userId) return
    const code = joinCode.trim().toUpperCase()
    if (!code) {
      setError('ルームコードを入れてね')
      return
    }
    const { data: found, error: e0 } = await getSupabase().from('rooms').select('id').eq('short_code', code).maybeSingle()
    if (e0) {
      setError(e0.message)
      return
    }
    if (!found) {
      setError('ルームが見つからない')
      return
    }
    const { data: already, error: e1 } = await getSupabase()
      .from('room_members')
      .select('user_id')
      .eq('room_id', found.id)
      .eq('user_id', userId)
      .maybeSingle()
    if (e1) {
      setError(e1.message)
      return
    }
    if (!already) {
      const { error: e2 } = await getSupabase().from('room_members').insert({ room_id: found.id, user_id: userId })
      if (e2) {
        setError(e2.message)
        return
      }
    }
    setRoomId(found.id as string)
  }

  async function handleSaveLobbySettings() {
    setError(null)
    if (!roomId || !room) return
    const { error: e } = await getSupabase().rpc('room_update_lobby_settings', {
      p_room_id: roomId,
      p_digit_length: lobbyDraftDigit,
      p_match_wins_required: lobbyDraftMatchWins,
    })
    if (e) {
      setError(e.message)
      return
    }
    await refreshAll()
  }

  async function copyRoomCode() {
    setError(null)
    const code = room?.short_code ?? ''
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCodeCopiedHint(true)
      window.setTimeout(() => setCodeCopiedHint(false), 2000)
    } catch {
      setError('コードのコピーに失敗したよ')
    }
  }

  async function handleHostBeginSecretSetup() {
    setError(null)
    if (!roomId) return
    const { error: e } = await getSupabase().rpc('room_host_begin_secret_setup', { p_room_id: roomId })
    if (e) {
      setError(e.message)
      return
    }
    await refreshAll()
  }

  async function handleSaveSecret() {
    setError(null)
    if (!userId || !roomId || !room) return
    const raw = secretInput.trim()
    try {
      const nums = parseDigitsString(raw, room.digit_length as 3 | 4)
      const canonical = digitsToString(nums)
      const { error: e } = await getSupabase().from('room_secrets').upsert(
        { room_id: roomId, user_id: userId, digits: canonical },
        { onConflict: 'room_id,user_id' },
      )
      if (e) {
        setError(e.message)
        return
      }
      setSecretInput('')
      await refreshAll()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  async function handleGuess() {
    setError(null)
    if (!userId || !roomId || !room) return
    const raw = guessInput.trim()
    try {
      parseDigitsString(raw, room.digit_length as 3 | 4)
      const { error: e } = await getSupabase().from('guesses').insert({
        room_id: roomId,
        guesser_id: userId,
        digits: raw,
      })
      if (e) {
        setError(e.message)
        return
      }
      setGuessInput('')
      await refreshAll()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  async function handleDoubleStart() {
    setError(null)
    if (!roomId) return
    const { error: e } = await getSupabase().rpc('double_start', { p_room_id: roomId })
    if (e) {
      setError(e.message)
      return
    }
    await refreshAll()
  }

  async function handleDoubleRevealPick(slot: number) {
    setError(null)
    if (!roomId) return
    const { error: e } = await getSupabase().rpc('double_submit_reveal_slot', {
      p_room_id: roomId,
      p_slot: slot,
    })
    if (e) {
      setError(e.message)
      return
    }
    await refreshAll()
  }

  async function handleItemHighlow() {
    setError(null)
    if (!roomId) return
    const { error: e } = await getSupabase().rpc('item_highlow_use', { p_room_id: roomId })
    if (e) {
      setError(e.message)
      return
    }
    await refreshAll()
  }

  async function handleItemTarget() {
    setError(null)
    if (!roomId) return
    const d = Number.parseInt(targetDigitInput.trim(), 10)
    if (!Number.isInteger(d) || d < 0 || d > 9) {
      setError('ターゲットは 0〜9 の 1 桁で入れてね')
      return
    }
    const { error: e } = await getSupabase().rpc('item_target_use', { p_room_id: roomId, p_digit: d })
    if (e) {
      setError(e.message)
      return
    }
    setTargetDigitInput('')
    await refreshAll()
  }

  async function handleItemSlash() {
    setError(null)
    if (!roomId) return
    const { error: e } = await getSupabase().rpc('item_slash_use', { p_room_id: roomId })
    if (e) {
      setError(e.message)
      return
    }
    await refreshAll()
  }

  async function handleItemShuffle() {
    setError(null)
    if (!roomId) return
    const { error: e } = await getSupabase().rpc('item_shuffle_use', { p_room_id: roomId })
    if (e) {
      setError(e.message)
      return
    }
    await refreshAll()
  }

  async function handleItemChange() {
    setError(null)
    if (!roomId || !room) return
    const d = Number.parseInt(changeNewDigit.trim(), 10)
    if (!Number.isInteger(d) || d < 0 || d > 9) {
      setError('チェンジ先は 0〜9 で入れてね')
      return
    }
    const { error: e } = await getSupabase().rpc('item_change_use', {
      p_room_id: roomId,
      p_slot: changeSlot,
      p_new_digit: d,
    })
    if (e) {
      setError(e.message)
      return
    }
    setChangeNewDigit('')
    await refreshAll()
  }

  function leaveRoom() {
    setRoomId(null)
    setRoom(null)
    setGuesses([])
    setMemberCount(0)
    setMemberUserIds([])
    setItemCards([])
    setItemEvents([])
    setItemSecretPayloads({})
    setMySecretDigits(null)
    setTargetDigitInput('')
    setChangeNewDigit('')
    setCodeCopiedHint(false)
    setError(null)
  }

  if (!isSupabaseConfigured) {
    return (
      <main style={{ fontFamily: 'system-ui', padding: '1.5rem', maxWidth: 520 }}>
        <h1 style={{ fontSize: '1.25rem' }}>Numeron</h1>
        <p style={{ color: '#b00' }}>
          環境変数が無いよ。`.env` に `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` を設定してね（`.env.example`
          参照）。ローカルなら `supabase start` のあと Studio / CLI でキーを確認できる。
        </p>
      </main>
    )
  }

  if (booting || !userId) {
    return (
      <main style={{ fontFamily: 'system-ui', padding: '1.5rem' }}>
        <p style={{ color: '#444' }}>準備中…</p>
        {error ? <p style={{ color: '#b00' }}>{error}</p> : null}
      </main>
    )
  }

  const dl = room?.digit_length ?? DEFAULT_DIGIT_LENGTH
  const myTurn = room?.status === 'playing' && room.current_turn_user_id === userId
  const doublePhase = room?.double_phase ?? null
  const doubleAttackerId = room?.double_attacker_id ?? null
  const canSubmitGuess =
    room?.status === 'playing' &&
    myTurn &&
    doublePhase !== 'await_reveal' &&
    (doublePhase === null || doublePhase === 'first_call' || doublePhase === 'second_call')
  const waitingDoubleReveal =
    room?.status === 'playing' && doublePhase === 'await_reveal' && doubleAttackerId === userId
  const pickDoubleRevealSlot =
    room?.status === 'playing' &&
    doublePhase === 'await_reveal' &&
    Boolean(doubleAttackerId) &&
    doubleAttackerId !== userId
  const doubleRevealLabel =
    room?.double_reveal_slot != null && room?.double_reveal_digit
      ? `ダブル開示: 左から ${room.double_reveal_slot} 桁目は ${room.double_reveal_digit}`
      : null
  const hasUnusedDouble =
    Boolean(userId) && itemCards.some((c) => c.user_id === userId && c.item_kind === 'DOUBLE' && !c.used_at)
  const canUseDouble =
    room?.status === 'playing' &&
    myTurn &&
    doublePhase == null &&
    hasUnusedDouble
  const doubleCallHint =
    doublePhase === 'first_call'
      ? 'ダブル: 1 コール目'
      : doublePhase === 'second_call'
        ? 'ダブル: 2 コール目（このあと手番が相手に戻る）'
        : null
  const hasMySecret = Boolean(mySecretDigits)
  const waitingForOpponentSecret =
    room && memberCount === 2 && room.status === 'waiting' && hasMySecret
  const winsReq = room?.match_wins_required ?? 1
  const mw = room?.match_wins as Record<string, number> | undefined
  const myMatchWins = userId && mw ? Number(mw[userId] ?? 0) : 0
  const oppUid = memberUserIds.find((id) => id !== userId) ?? null
  const oppMatchWins = oppUid && mw ? Number(mw[oppUid] ?? 0) : 0

  const hasUnusedItem = (k: ItemKind) =>
    Boolean(userId) && itemCards.some((c) => c.user_id === userId && c.item_kind === k && !c.used_at)
  const canUseNonDoubleItem =
    room?.status === 'playing' && myTurn && doublePhase == null
  const canHighlow = canUseNonDoubleItem && hasUnusedItem('HIGHLOW')
  const canTarget = canUseNonDoubleItem && hasUnusedItem('TARGET')
  const canSlash = canUseNonDoubleItem && hasUnusedItem('SLASH')
  const canShuffle = canUseNonDoubleItem && hasUnusedItem('SHUFFLE')
  const canChange = canUseNonDoubleItem && hasUnusedItem('CHANGE')

  const timeline: TimelineEntry[] = [
    ...guesses.map((g) => ({ sortKey: `${g.created_at}\0${g.id}`, kind: 'g' as const, guess: g })),
    ...itemEvents.map((ev) => ({
      sortKey: `${ev.created_at}\0${ev.id}`,
      kind: 'i' as const,
      ev,
      secretPayload: itemSecretPayloads[ev.id] ?? null,
    })),
  ].sort((a, b) => {
    const c = a.sortKey.localeCompare(b.sortKey)
    return c !== 0 ? c : 0
  })

  const changeSlotSafe = Math.min(Math.max(1, changeSlot), dl)
  const aloneInLobby = Boolean(room && room.status === 'lobby' && memberCount === 1)
  const twoInLobby = Boolean(room && room.status === 'lobby' && memberCount === 2)
  const isRoomHost = Boolean(room && userId && room.created_by === userId)
  const roomCode = room?.short_code ?? ''

  return (
    <main style={{ fontFamily: 'system-ui', padding: '1.5rem', maxWidth: 560 }}>
      <h1 style={{ fontSize: '1.25rem' }}>Numeron（第1段）</h1>
      <p style={{ color: '#555', fontSize: '0.9rem' }}>
        双方向・交互コール。ルームに入ってから桁数と BO（先取）を決められるよ。
      </p>

      {error ? (
        <p style={{ color: '#b00', marginTop: '1rem' }} role="alert">
          {error}
        </p>
      ) : null}

      {!roomId ? (
        <section style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1rem' }}>ルーム作成</h2>
            <p style={{ fontSize: '0.88rem', color: '#555', marginBottom: 8 }}>
              デフォルトは 3 桁・1 ゲーム。入室後（ひとりのロビー）で変えられるよ。
            </p>
            <button type="button" onClick={() => void handleCreateRoom()}>
              作成
            </button>
          </div>
          <div>
            <h2 style={{ fontSize: '1rem' }}>参加</h2>
            <input
              placeholder="ルームコード"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              style={{ marginRight: 8 }}
            />
            <button type="button" onClick={() => void handleJoinRoom()}>
              参加
            </button>
          </div>
        </section>
      ) : (
        <section style={{ marginTop: '1.25rem' }}>
          <div
            style={{
              padding: '1rem',
              borderRadius: 8,
              border: '1px solid #ccc',
              background: '#f8f8f8',
              marginBottom: '1rem',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#555' }}>ルームコード（相手に送る）</p>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '1.75rem',
                fontFamily: 'ui-monospace, monospace',
                letterSpacing: '0.12em',
                fontWeight: 600,
              }}
            >
              {roomCode || '…'}
            </p>
            {roomCode ? (
              <p style={{ margin: '10px 0 0', fontSize: '0.88rem', color: '#444' }}>
                <button type="button" onClick={() => void copyRoomCode()} style={{ marginRight: 10 }}>
                  クリップボードにコピー
                </button>
                {codeCopiedHint ? <span style={{ color: '#0a5' }}>コピーしたよ</span> : null}
              </p>
            ) : null}
            {aloneInLobby || twoInLobby ? (
              <p style={{ margin: '10px 0 0', fontSize: '0.88rem', color: '#333' }}>
                {aloneInLobby
                  ? '相手が入るまでここで待てるよ。ルールを決めてから、2 人そろったらホストがナンバー設定を開くよ。'
                  : 'ホストが「ナンバー設定を始める」を押すと、ここから秘密を登録できるようになるよ。'}
              </p>
            ) : null}
          </div>
          <p style={{ fontSize: '0.9rem', color: '#444' }}>
            メンバー {memberCount} / 2 · {roomStatusLabel(room?.status)}
            {room && winsReq > 1 ? (
              <>
                {' '}
                · マッチ 先取 {winsReq} · ゲーム {room.current_game_index ?? 1} · 勝数 {myMatchWins}–
                {oppMatchWins}
              </>
            ) : null}
          </p>
          <button type="button" style={{ marginTop: 8 }} onClick={leaveRoom}>
            別ルームへ
          </button>

          {aloneInLobby ? (
            <div style={{ marginTop: '1rem', padding: '0.85rem', border: '1px solid #ddd', borderRadius: 8 }}>
              <h2 style={{ fontSize: '1rem', marginTop: 0 }}>ルール（相手が来るまで変更可）</h2>
              <p style={{ fontSize: '0.82rem', color: '#555', marginTop: 4 }}>
                2 人目が参加したら固定されるよ。
              </p>
              <label style={{ display: 'block', marginBottom: 8 }}>
                桁数{' '}
                <select
                  value={lobbyDraftDigit}
                  onChange={(e) => setLobbyDraftDigit(Number(e.target.value) as 3 | 4)}
                >
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                マッチ先取（1 = 1 ゲームのみ）{' '}
                <select
                  value={lobbyDraftMatchWins}
                  onChange={(e) => setLobbyDraftMatchWins(Number(e.target.value))}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => void handleSaveLobbySettings()}>
                ルールを反映
              </button>
            </div>
          ) : null}

          {twoInLobby ? (
            <div style={{ marginTop: '1rem', padding: '0.85rem', border: '1px solid #cce', borderRadius: 8, background: '#f6f9fc' }}>
              {isRoomHost ? (
                <>
                  <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#333' }}>
                    二人そろったよ。準備ができたらナンバー設定に進んでね。
                  </p>
                  <button type="button" onClick={() => void handleHostBeginSecretSetup()}>
                    ナンバー設定を始める
                  </button>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#444' }}>ホストが開始するまで待ってね。</p>
              )}
            </div>
          ) : null}

          {memberCount >= 2 && userId && room && room.status !== 'lobby' ? (
            <div style={{ marginTop: '1rem', fontSize: '0.88rem', color: '#333' }}>
              <h2 style={{ fontSize: '1rem' }}>アイテム（マッチ通算・各 1 回）</h2>
              <p style={{ color: '#555', marginTop: 4 }}>
                BO 中はゲームが変わっても使用済みは戻らない。ダブルは手番に使える（連続 2 コール）。
              </p>
              {itemCards.length === 0 ? (
                <p style={{ color: '#888' }}>カード行がまだ無いよ。`room_item_cards` のマイグレーションを当ててね。</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', marginTop: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>あなた</div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                      {orderedItemSlots(itemCards, userId).map(({ kind, used }) => (
                        <li key={kind} style={{ color: used ? '#888' : undefined }}>
                          {ITEM_LABELS[kind]}
                          {used ? ' · 使用済' : ' · 未使用'}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {oppUid ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>相手</div>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                        {orderedItemSlots(itemCards, oppUid).map(({ kind, used }) => (
                          <li key={kind} style={{ color: used ? '#888' : undefined }}>
                            {ITEM_LABELS[kind]}
                            {used ? ' · 使用済' : ' · 未使用'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : memberCount === 1 ? (
            <p style={{ marginTop: '0.75rem', fontSize: '0.88rem', color: '#666' }}>
              相手が入室しホストが開始すると、アイテムカードが 6 種×1 枚ずつ配られるよ。
            </p>
          ) : null}

          {!hasMySecret && room && room.status === 'waiting' ? (
            <div style={{ marginTop: '1rem' }}>
              <h2 style={{ fontSize: '1rem' }}>あなたの秘密 {dl} 桁</h2>
              {room.status === 'waiting' && winsReq > 1 && (room.current_game_index ?? 1) > 1 ? (
                <p style={{ fontSize: '0.85rem', color: '#555' }}>
                  マッチ継続 · 第 {room.current_game_index} ゲーム。新しい秘密を登録してね。
                </p>
              ) : null}
              <input
                inputMode="numeric"
                placeholder={`${dl} 桁・重複なし`}
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
              />
              <button type="button" style={{ marginLeft: 8 }} onClick={() => void handleSaveSecret()}>
                決定
              </button>
            </div>
          ) : null}

          {hasMySecret && room?.status === 'waiting' ? (
            <p style={{ marginTop: '1rem', color: '#444' }}>
              {memberCount < 2
                ? '相手の参加を待ってる'
                : waitingForOpponentSecret
                  ? '相手の秘密登録を待ってる'
                  : '開始待ち'}
            </p>
          ) : null}

          {room?.status === 'playing' || room?.status === 'finished' ? (
            <>
              <div style={{ marginTop: '1rem' }}>
                <h2 style={{ fontSize: '1rem' }}>コール & アイテム履歴</h2>
                {doubleRevealLabel ? (
                  <p style={{ fontSize: '0.9rem', color: '#0a5', marginBottom: 8 }}>{doubleRevealLabel}</p>
                ) : null}
                <ul style={{ paddingLeft: '1.2rem' }}>
                  {timeline.map((t) =>
                    t.kind === 'g' ? (
                      <li key={`g-${t.guess.id}`}>
                        {t.guess.digits} → Hit {t.guess.hit} / Blow {t.guess.blow}
                        {t.guess.guesser_id === userId ? '（あなた）' : ''}
                      </li>
                    ) : (
                      <li key={`i-${t.ev.id}`} style={{ color: '#274' }}>
                        {formatItemEventLine(t.ev, userId, t.secretPayload)}
                      </li>
                    ),
                  )}
                </ul>
              </div>
              {room.status === 'playing' && waitingDoubleReveal ? (
                <p style={{ marginTop: '1rem', color: '#444' }}>
                  ダブル中。相手に「どの桁を開示するか」選んでもらってね。
                </p>
              ) : null}
              {room.status === 'playing' && pickDoubleRevealSlot ? (
                <div style={{ marginTop: '1rem' }}>
                  <h2 style={{ fontSize: '1rem' }}>相手のダブル: 開示する桁</h2>
                  <p style={{ fontSize: '0.88rem', color: '#555' }}>左から 1 … {dl} のどれかを選んでね。</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {Array.from({ length: dl }, (_, i) => i + 1).map((slot) => (
                      <button key={slot} type="button" onClick={() => void handleDoubleRevealPick(slot)}>
                        {slot} 桁目
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {room.status === 'playing' && canSubmitGuess ? (
                <div style={{ marginTop: '1rem' }}>
                  <h2 style={{ fontSize: '1rem' }}>あなたの手番</h2>
                  {doubleCallHint ? (
                    <p style={{ fontSize: '0.88rem', color: '#555' }}>{doubleCallHint}</p>
                  ) : null}
                  <input
                    inputMode="numeric"
                    placeholder={`${dl} 桁・重複なし`}
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                  />
                  <button type="button" style={{ marginLeft: 8 }} onClick={() => void handleGuess()}>
                    コール
                  </button>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'stretch',
                      gap: 10,
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: '1px solid #ddd',
                    }}
                  >
                    <p style={{ width: '100%', fontSize: '0.82rem', color: '#555', margin: '0 0 4px' }}>
                      アイテム（未使用のみ操作可。HIGH&LOW は H(5–9)/L(0–4)。スラッシュは min/max/差・昇順桁列）
                    </p>
                    {(
                      [
                        {
                          key: 'DOUBLE' as const,
                          label: ITEM_LABELS.DOUBLE,
                          active: canUseDouble,
                          body: (
                            <button
                              type="button"
                              disabled={!canUseDouble}
                              onClick={() => void handleDoubleStart()}
                              style={{ width: '100%', fontSize: '0.8rem' }}
                            >
                              使用（2 連コール）
                            </button>
                          ),
                        },
                        {
                          key: 'HIGHLOW' as const,
                          label: ITEM_LABELS.HIGHLOW,
                          active: canHighlow,
                          body: (
                            <button
                              type="button"
                              disabled={!canHighlow}
                              onClick={() => void handleItemHighlow()}
                              style={{ width: '100%' }}
                            >
                              使用
                            </button>
                          ),
                        },
                        {
                          key: 'TARGET' as const,
                          label: ITEM_LABELS.TARGET,
                          active: canTarget,
                          body: (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <input
                                inputMode="numeric"
                                placeholder="0–9"
                                value={targetDigitInput}
                                onChange={(e) => setTargetDigitInput(e.target.value)}
                                disabled={!canTarget}
                                style={{ width: '100%', boxSizing: 'border-box' }}
                              />
                              <button
                                type="button"
                                disabled={!canTarget}
                                onClick={() => void handleItemTarget()}
                                style={{ width: '100%' }}
                              >
                                実行
                              </button>
                            </div>
                          ),
                        },
                        {
                          key: 'SLASH' as const,
                          label: ITEM_LABELS.SLASH,
                          active: canSlash,
                          body: (
                            <button
                              type="button"
                              disabled={!canSlash}
                              onClick={() => void handleItemSlash()}
                              style={{ width: '100%' }}
                            >
                              使用
                            </button>
                          ),
                        },
                        {
                          key: 'SHUFFLE' as const,
                          label: ITEM_LABELS.SHUFFLE,
                          active: canShuffle,
                          body: (
                            <button
                              type="button"
                              disabled={!canShuffle}
                              onClick={() => void handleItemShuffle()}
                              style={{ width: '100%', fontSize: '0.8rem' }}
                            >
                              使用
                            </button>
                          ),
                        },
                        {
                          key: 'CHANGE' as const,
                          label: ITEM_LABELS.CHANGE,
                          active: canChange,
                          body: (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <select
                                value={changeSlotSafe}
                                onChange={(e) => setChangeSlot(Number(e.target.value))}
                                disabled={!canChange}
                                style={{ width: '100%' }}
                              >
                                {Array.from({ length: dl }, (_, i) => i + 1).map((slot) => (
                                  <option key={slot} value={slot}>
                                    {slot} 桁
                                  </option>
                                ))}
                              </select>
                              <input
                                inputMode="numeric"
                                placeholder="新桁"
                                value={changeNewDigit}
                                onChange={(e) => setChangeNewDigit(e.target.value)}
                                disabled={!canChange}
                                style={{ width: '100%', boxSizing: 'border-box' }}
                              />
                              <button
                                type="button"
                                disabled={!canChange}
                                onClick={() => void handleItemChange()}
                                style={{ width: '100%' }}
                              >
                                実行
                              </button>
                            </div>
                          ),
                        },
                      ] as const
                    ).map(({ key, label, active, body }) => (
                      <div
                        key={key}
                        style={{
                          flex: '1 1 92px',
                          minWidth: 88,
                          maxWidth: 140,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          padding: 8,
                          border: '1px solid #ddd',
                          borderRadius: 6,
                          background: '#fafafa',
                          opacity: active ? 1 : 0.5,
                        }}
                      >
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.25 }}>{label}</div>
                        {body}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {room.status === 'playing' &&
              !canSubmitGuess &&
              !pickDoubleRevealSlot &&
              !waitingDoubleReveal ? (
                <p style={{ marginTop: '1rem', color: '#444' }}>相手の手番だよ</p>
              ) : null}
              {room.status === 'finished' ? (
                <p style={{ marginTop: '1rem', fontWeight: 600 }}>
                  {room.winner_user_id === userId ? 'あなたの勝ち' : 'あなたの負け'}
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      )}
    </main>
  )
}
