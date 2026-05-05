type Props = {
  roomCode: string
  codeCopiedHint: boolean
  onCopy: () => void
}

export function RoomCodeCard({ roomCode, codeCopiedHint, onCopy }: Props) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 4,
        border: '1px solid #e0e0e0',
        background: '#fff',
        marginBottom: '1rem',
      }}
    >
      <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>ルームコード</p>
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
          <button type="button" onClick={() => void onCopy()} style={{ marginRight: 10 }}>
            クリップボードにコピー
          </button>
          {codeCopiedHint ? <span style={{ color: '#555' }}>コピーしたよ</span> : null}
        </p>
      ) : null}
    </div>
  )
}
