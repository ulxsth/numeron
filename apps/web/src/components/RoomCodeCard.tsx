type Props = {
  roomCode: string
  codeCopiedHint: boolean
  aloneInLobby: boolean
  twoInLobby: boolean
  onCopy: () => void
}

export function RoomCodeCard({ roomCode, codeCopiedHint, aloneInLobby, twoInLobby, onCopy }: Props) {
  return (
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
          <button type="button" onClick={() => void onCopy()} style={{ marginRight: 10 }}>
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
  )
}
