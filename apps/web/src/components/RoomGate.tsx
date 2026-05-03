type Props = {
  joinCode: string
  onJoinCodeChange: (v: string) => void
  onCreateRoom: () => void
  onJoinRoom: () => void
}

export function RoomGate({ joinCode, onJoinCodeChange, onCreateRoom, onJoinRoom }: Props) {
  return (
    <section style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ fontSize: '1rem' }}>ルーム作成</h2>
        <button type="button" onClick={() => void onCreateRoom()}>
          作成
        </button>
      </div>
      <div>
        <h2 style={{ fontSize: '1rem' }}>参加</h2>
        <input
          placeholder="ルームコード"
          value={joinCode}
          onChange={(e) => onJoinCodeChange(e.target.value)}
          style={{ marginRight: 8 }}
        />
        <button type="button" onClick={() => void onJoinRoom()}>
          参加
        </button>
      </div>
    </section>
  )
}
