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
  const [createDigitLen, setCreateDigitLen] = useState<3 | 4>(4)
  const [error, setError] = useState<string | null>(null)

  const refreshAll = useCallback(async () => {
    if (!roomId || !userId) return
    const [roomRes, guessesRes, secretRes, membersRes] = await Promise.all([
      getSupabase().from('rooms').select('*').eq('id', roomId).single(),
      getSupabase().from('guesses').select('*').eq('room_id', roomId).order('created_at', { ascending: true }),
      getSupabase()
        .from('room_secrets')
        .select('digits')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle(),
      getSupabase().from('room_members').select('user_id').eq('room_id', roomId),
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
    setRoom(roomRes.data as Room)
    setGuesses((guessesRes.data as GuessRow[]) ?? [])
    setMySecretDigits(secretRes.data?.digits ?? null)
    setMemberCount(membersRes.data?.length ?? 0)
  }, [roomId, userId])

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
        status: 'waiting',
        digit_length: createDigitLen,
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
    const { error: e2 } = await getSupabase().from('room_members').insert({ room_id: found.id, user_id: userId })
    if (e2) {
      setError(e2.message)
      return
    }
    setRoomId(found.id as string)
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

  function leaveRoom() {
    setRoomId(null)
    setRoom(null)
    setGuesses([])
    setMemberCount(0)
    setMySecretDigits(null)
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

  const dl = room?.digit_length ?? createDigitLen
  const myTurn = room?.status === 'playing' && room.current_turn_user_id === userId
  const hasMySecret = Boolean(mySecretDigits)
  const waitingForOpponentSecret =
    room && memberCount === 2 && room.status === 'waiting' && hasMySecret

  return (
    <main style={{ fontFamily: 'system-ui', padding: '1.5rem', maxWidth: 560 }}>
      <h1 style={{ fontSize: '1.25rem' }}>Numeron（第1段）</h1>
      <p style={{ color: '#555', fontSize: '0.9rem' }}>
        双方向・交互コール。先に相手の番号を当てたら勝ち。
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
            <label style={{ display: 'block', marginBottom: 8 }}>
              桁数{' '}
              <select value={createDigitLen} onChange={(e) => setCreateDigitLen(Number(e.target.value) as 3 | 4)}>
                <option value={4}>4</option>
                <option value={3}>3</option>
              </select>
            </label>
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
          <p>
            コード: <strong>{room?.short_code ?? '…'}</strong>（相手に共有）
          </p>
          <p style={{ fontSize: '0.9rem', color: '#444' }}>
            メンバー {memberCount} / 2 · 状態 {room?.status ?? '…'}
          </p>
          <button type="button" style={{ marginTop: 8 }} onClick={leaveRoom}>
            別ルームへ
          </button>

          {!hasMySecret && room ? (
            <div style={{ marginTop: '1rem' }}>
              <h2 style={{ fontSize: '1rem' }}>あなたの秘密 {dl} 桁</h2>
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
                <h2 style={{ fontSize: '1rem' }}>コール履歴</h2>
                <ul style={{ paddingLeft: '1.2rem' }}>
                  {guesses.map((g) => (
                    <li key={g.id}>
                      {g.digits} → Hit {g.hit} / Blow {g.blow}
                      {g.guesser_id === userId ? '（あなた）' : ''}
                    </li>
                  ))}
                </ul>
              </div>
              {room.status === 'playing' && myTurn ? (
                <div style={{ marginTop: '1rem' }}>
                  <h2 style={{ fontSize: '1rem' }}>あなたの手番</h2>
                  <input
                    inputMode="numeric"
                    placeholder={`${dl} 桁・重複なし`}
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                  />
                  <button type="button" style={{ marginLeft: 8 }} onClick={() => void handleGuess()}>
                    コール
                  </button>
                </div>
              ) : null}
              {room.status === 'playing' && !myTurn ? (
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
