import { digitsToString, parseDigitsString } from '@numeron/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_DIGIT_LENGTH,
  DEFAULT_MATCH_WINS_REQUIRED,
  type ItemKind,
} from '../domain/constants'
import type { GuessRow, ItemCardRow, ItemEventRow, Room, TimelineEntry } from '../domain/types'
import { errMessage, randomShortCode } from '../domain/utils'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'

export function useNumeronGame() {
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

  async function handleSaveLobbySettings(overrides?: {
    digitLength?: 3 | 4
    matchWinsRequired?: number
  }) {
    setError(null)
    if (!roomId || !room) return
    const digitLength = overrides?.digitLength ?? lobbyDraftDigit
    const matchWinsRequired = overrides?.matchWinsRequired ?? lobbyDraftMatchWins
    const { error: e } = await getSupabase().rpc('room_update_lobby_settings', {
      p_room_id: roomId,
      p_digit_length: digitLength,
      p_match_wins_required: matchWinsRequired,
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

  const derived = useMemo(() => {
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
      room?.status === 'playing' && myTurn && doublePhase == null && hasUnusedDouble
    const doubleCallHint =
      doublePhase === 'first_call'
        ? 'ダブル: 1 コール目'
        : doublePhase === 'second_call'
          ? 'ダブル: 2 コール目'
          : null
    const hasMySecret = Boolean(mySecretDigits)
    const waitingForOpponentSecret =
      room != null && memberCount === 2 && room.status === 'waiting' && hasMySecret
    const winsReq = room?.match_wins_required ?? 1
    const mw = room?.match_wins as Record<string, number> | undefined
    const myMatchWins = userId != null && mw != null ? Number(mw[userId] ?? 0) : 0
    const oppUid = userId != null ? (memberUserIds.find((id) => id !== userId) ?? null) : null
    const oppMatchWins = oppUid != null && mw != null ? Number(mw[oppUid] ?? 0) : 0

    const hasUnusedItem = (k: ItemKind) =>
      Boolean(userId) && itemCards.some((c) => c.user_id === userId && c.item_kind === k && !c.used_at)
    const canUseNonDoubleItem = room?.status === 'playing' && myTurn && doublePhase == null
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

    return {
      dl,
      myTurn,
      doublePhase,
      doubleAttackerId,
      canSubmitGuess,
      waitingDoubleReveal,
      pickDoubleRevealSlot,
      doubleRevealLabel,
      hasUnusedDouble,
      canUseDouble,
      doubleCallHint,
      hasMySecret,
      waitingForOpponentSecret,
      winsReq,
      myMatchWins,
      oppUid,
      oppMatchWins,
      timeline,
      changeSlotSafe,
      aloneInLobby,
      twoInLobby,
      isRoomHost,
      roomCode,
      canHighlow,
      canTarget,
      canSlash,
      canShuffle,
      canChange,
    }
  }, [
    room,
    userId,
    itemCards,
    memberCount,
    mySecretDigits,
    memberUserIds,
    guesses,
    itemEvents,
    itemSecretPayloads,
    changeSlot,
  ])

  return {
    booting,
    userId,
    roomId,
    room,
    memberCount,
    error,
    joinCode,
    setJoinCode,
    secretInput,
    setSecretInput,
    guessInput,
    setGuessInput,
    lobbyDraftDigit,
    setLobbyDraftDigit,
    lobbyDraftMatchWins,
    setLobbyDraftMatchWins,
    codeCopiedHint,
    itemCards,
    targetDigitInput,
    setTargetDigitInput,
    changeNewDigit,
    setChangeNewDigit,
    derived,
    setChangeSlot,
    handleCreateRoom,
    handleJoinRoom,
    leaveRoom,
    handleSaveLobbySettings,
    copyRoomCode,
    handleHostBeginSecretSetup,
    handleSaveSecret,
    handleGuess,
    handleDoubleStart,
    handleDoubleRevealPick,
    handleItemHighlow,
    handleItemTarget,
    handleItemSlash,
    handleItemShuffle,
    handleItemChange,
    isSupabaseConfigured,
  }
}
