import type { Room } from '../domain/types'
import { formatSecretDigitsForDisplay } from '../domain/utils'

type Props = {
  room: Room
  dl: number
  winsReq: number
  memberCount: number
  mySecretDigits: string | null
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
  mySecretDigits,
  secretInput,
  onSecretInputChange,
  onSaveSecret,
  hasMySecret,
  waitingForOpponentSecret,
}: Props) {
  return (
    <>
      {!hasMySecret && room.status === 'waiting' ? (
        <div style={{ marginTop: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', marginTop: 0, marginBottom: '0.35rem' }}>あなたのナンバー（{dl} 桁）</h2>
          {room.status === 'waiting' && winsReq > 1 && (room.current_game_index ?? 1) > 1 ? (
            <p style={{ fontSize: '0.85rem', color: '#5a5a5a', marginTop: 0, marginBottom: '0.65rem', lineHeight: 1.45 }}>
              マッチ継続 · 第 {room.current_game_index} ゲーム。新しいナンバーを登録してね。
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
        <div style={{ marginTop: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', marginTop: 0, marginBottom: '0.35rem' }}>あなたのナンバー（左から）</h2>
          <p
            style={{
              marginTop: 0,
              marginBottom: 0,
              fontSize: '1.2rem',
              letterSpacing: '0.18em',
              fontVariantNumeric: 'tabular-nums',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {mySecretDigits ? formatSecretDigitsForDisplay(mySecretDigits) : '…'}
          </p>
          <p style={{ marginTop: '0.75rem', color: '#444', marginBottom: 0, lineHeight: 1.45 }}>
            {memberCount < 2
              ? '相手の参加を待ってる'
              : waitingForOpponentSecret
                ? '相手のナンバー登録を待ってる'
                : '開始待ち'}
          </p>
        </div>
      ) : null}
    </>
  )
}
