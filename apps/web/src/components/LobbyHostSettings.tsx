type Props = {
  lobbyDraftDigit: 3 | 4
  onLobbyDraftDigitChange: (v: 3 | 4) => void
  lobbyDraftMatchWins: number
  onLobbyDraftMatchWinsChange: (v: number) => void
  onSaveLobbySettings: () => void
}

export function LobbyHostSettings({
  lobbyDraftDigit,
  onLobbyDraftDigitChange,
  lobbyDraftMatchWins,
  onLobbyDraftMatchWinsChange,
  onSaveLobbySettings,
}: Props) {
  return (
    <div style={{ marginTop: '1rem', padding: '0.85rem', border: '1px solid #ddd', borderRadius: 8 }}>
      <h2 style={{ fontSize: '1rem', marginTop: 0 }}>ルール（ロビー中は変更可）</h2>
      <p style={{ fontSize: '0.82rem', color: '#555', marginTop: 4 }}>
        「ナンバー設定を始める」までいつでも変えられるよ。2 人そろってもホストだけが編集できる。
      </p>
      <label style={{ display: 'block', marginBottom: 8 }}>
        桁数{' '}
        <select value={lobbyDraftDigit} onChange={(e) => onLobbyDraftDigitChange(Number(e.target.value) as 3 | 4)}>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        マッチ先取（1 = 1 ゲームのみ）{' '}
        <select
          value={lobbyDraftMatchWins}
          onChange={(e) => onLobbyDraftMatchWinsChange(Number(e.target.value))}
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => void onSaveLobbySettings()}>
        ルールを反映
      </button>
    </div>
  )
}
