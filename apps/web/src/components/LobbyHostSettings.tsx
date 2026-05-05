type Props = {
  lobbyDraftDigit: 3 | 4
  onLobbyDraftDigitChange: (v: 3 | 4) => void
  lobbyDraftMatchWins: number
  onLobbyDraftMatchWinsChange: (v: number) => void
  onSaveLobbySettings: (overrides?: { digitLength?: 3 | 4; matchWinsRequired?: number }) => void
}

export function LobbyHostSettings({
  lobbyDraftDigit,
  onLobbyDraftDigitChange,
  lobbyDraftMatchWins,
  onLobbyDraftMatchWinsChange,
  onSaveLobbySettings,
}: Props) {
  return (
    <div
      style={{
        marginTop: '1.25rem',
        padding: '14px 16px',
        border: '1px solid #e0e0e0',
        borderRadius: 4,
        background: '#fff',
      }}
    >
      <h2 style={{ fontSize: '1rem', marginTop: 0, marginBottom: '0.65rem' }}>ルール</h2>
      <label style={{ display: 'block', marginBottom: 8 }}>
        桁数{' '}
        <select
          value={lobbyDraftDigit}
          onChange={(e) => {
            const v = Number(e.target.value) as 3 | 4
            onLobbyDraftDigitChange(v)
            void onSaveLobbySettings({ digitLength: v })
          }}
        >
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        マッチ先取（1 = 1 ゲームのみ）{' '}
        <select
          value={lobbyDraftMatchWins}
          onChange={(e) => {
            const n = Number(e.target.value)
            onLobbyDraftMatchWinsChange(n)
            void onSaveLobbySettings({ matchWinsRequired: n })
          }}
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
