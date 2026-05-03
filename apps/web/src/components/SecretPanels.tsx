import type { Room } from '../domain/types'

type Props = {
  room: Room
  dl: number
  winsReq: number
  memberCount: number
  secretInput: string
  onSecretInputChange: (v: string) => void
  onSaveSecret: () => void
  hasMySecret: boolean
  waitingForOpponentSecret: boolean
}

export function SecretPanels({
  room,
  dl,
  winsReq,
  memberCount,
  secretInput,
  onSecretInputChange,
  onSaveSecret,
  hasMySecret,
  waitingForOpponentSecret,
}: Props) {
  return (
    <>
      {!hasMySecret && room.status === 'waiting' ? (
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
            onChange={(e) => onSecretInputChange(e.target.value)}
          />
          <button type="button" style={{ marginLeft: 8 }} onClick={() => void onSaveSecret()}>
            決定
          </button>
        </div>
      ) : null}

      {hasMySecret && room.status === 'waiting' ? (
        <p style={{ marginTop: '1rem', color: '#444' }}>
          {memberCount < 2
            ? '相手の参加を待ってる'
            : waitingForOpponentSecret
              ? '相手の秘密登録を待ってる'
              : '開始待ち'}
        </p>
      ) : null}
    </>
  )
}
