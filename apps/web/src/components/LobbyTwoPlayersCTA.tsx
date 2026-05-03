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
      }}
    >
      {!isRoomHost ? (
        <p style={{ margin: '0 0 10px', fontSize: '0.88rem', color: '#444' }}>ルール: {room.digit_length} 桁 · マッチ先取 {room.match_wins_required}</p>
      ) : null}
      {isRoomHost ? (
        <>
          <button type="button" onClick={() => void onHostBeginSecretSetup()}>
            はじめる
          </button>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#444' }}>ホストが開始するまで待ってね。</p>
      )}
    </div>
  )
}
