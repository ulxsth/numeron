import type { Room } from '../domain/types'

type Props = {
  room: Room
  isRoomHost: boolean
  onHostBeginSecretSetup: () => void
}

export function LobbyTwoPlayersCTA({ room, isRoomHost, onHostBeginSecretSetup }: Props) {
  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '0.85rem',
        border: '1px solid #cce',
        borderRadius: 8,
        background: '#f6f9fc',
      }}
    >
      {!isRoomHost ? (
        <p style={{ margin: '0 0 10px', fontSize: '0.88rem', color: '#444' }}>
          いまのルール: {room.digit_length} 桁 · マッチ先取 {room.match_wins_required}
          （ホストが直すまで変わることがあるよ）
        </p>
      ) : null}
      {isRoomHost ? (
        <>
          <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#333' }}>
            二人そろったよ。準備ができたらナンバー設定に進んでね。
          </p>
          <button type="button" onClick={() => void onHostBeginSecretSetup()}>
            ナンバー設定を始める
          </button>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#444' }}>ホストが開始するまで待ってね。</p>
      )}
    </div>
  )
}
