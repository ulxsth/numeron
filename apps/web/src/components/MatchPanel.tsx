import { ITEM_LABELS } from '../domain/constants'
import type { Room, TimelineEntry } from '../domain/types'
import { formatGuessLogLine, formatItemEventLine, formatSecretDigitsForDisplay } from '../domain/utils'

type Props = {
  room: Room
  userId: string
  dl: number
  mySecretDigits: string | null
  timeline: TimelineEntry[]
  doubleRevealLabel: string | null
  waitingDoubleReveal: boolean
  pickDoubleRevealSlot: boolean
  canSubmitGuess: boolean
  doubleCallHint: string | null
  guessInput: string
  onGuessInputChange: (v: string) => void
  onGuess: () => void
  onDoubleRevealPick: (slot: number) => void
  canUseDouble: boolean
  canHighlow: boolean
  canTarget: boolean
  canSlash: boolean
  canShuffle: boolean
  canChange: boolean
  onDoubleStart: () => void
  onItemHighlow: () => void
  onItemTarget: () => void
  onItemSlash: () => void
  onItemShuffle: () => void
  onItemChange: () => void
  targetDigitInput: string
  onTargetDigitInputChange: (v: string) => void
  changeSlotSafe: number
  onChangeSlot: (slot: number) => void
  changeNewDigit: string
  onChangeNewDigitChange: (v: string) => void
}

export function MatchPanel({
  room,
  userId,
  dl,
  mySecretDigits,
  timeline,
  doubleRevealLabel,
  waitingDoubleReveal,
  pickDoubleRevealSlot,
  canSubmitGuess,
  doubleCallHint,
  guessInput,
  onGuessInputChange,
  onGuess,
  onDoubleRevealPick,
  canUseDouble,
  canHighlow,
  canTarget,
  canSlash,
  canShuffle,
  canChange,
  onDoubleStart,
  onItemHighlow,
  onItemTarget,
  onItemSlash,
  onItemShuffle,
  onItemChange,
  targetDigitInput,
  onTargetDigitInputChange,
  changeSlotSafe,
  onChangeSlot,
  changeNewDigit,
  onChangeNewDigitChange,
}: Props) {
  return (
    <>
      {mySecretDigits ? (
        <div
          style={{
            marginTop: '1rem',
            padding: '10px 12px',
            borderRadius: 6,
            border: '1px solid #ddd',
            background: '#fafafa',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: '#555' }}>あなたのナンバー（左から · CHANGE の桁と一致）</div>
          <p
            style={{
              marginTop: 6,
              marginBottom: 0,
              fontSize: '1.2rem',
              letterSpacing: '0.18em',
              fontVariantNumeric: 'tabular-nums',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {formatSecretDigitsForDisplay(mySecretDigits)}
          </p>
        </div>
      ) : null}
      <div style={{ marginTop: '1rem' }}>
        <h2 style={{ fontSize: '1rem' }}>コール & アイテム履歴</h2>
        {doubleRevealLabel ? (
          <p style={{ fontSize: '0.9rem', color: '#0a5', marginBottom: 8 }}>{doubleRevealLabel}</p>
        ) : null}
        <ul style={{ paddingLeft: '1.2rem' }}>
          {timeline.map((t) =>
            t.kind === 'g' ? (
              <li key={`g-${t.guess.id}`}>{formatGuessLogLine(t.guess, userId)}</li>
            ) : (
              <li key={`i-${t.ev.id}`} style={{ color: '#274' }}>
                {formatItemEventLine(t.ev, userId, t.secretPayload)}
              </li>
            ),
          )}
        </ul>
      </div>
      {room.status === 'playing' && waitingDoubleReveal ? (
        <p style={{ marginTop: '1rem', color: '#444' }}>
          ダブル中。相手に「どの桁を開示するか」選んでもらってね。
        </p>
      ) : null}
      {room.status === 'playing' && pickDoubleRevealSlot ? (
        <div style={{ marginTop: '1rem' }}>
          <h2 style={{ fontSize: '1rem' }}>相手のダブル: 開示する桁</h2>
          <p style={{ fontSize: '0.88rem', color: '#555' }}>左から 1 … {dl} のどれかを選んでね。</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {Array.from({ length: dl }, (_, i) => i + 1).map((slot) => (
              <button key={slot} type="button" onClick={() => void onDoubleRevealPick(slot)}>
                {slot} 桁目
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {room.status === 'playing' && canSubmitGuess ? (
        <div style={{ marginTop: '1rem' }}>
          <h2 style={{ fontSize: '1rem' }}>あなたの手番</h2>
          {doubleCallHint ? <p style={{ fontSize: '0.88rem', color: '#555' }}>{doubleCallHint}</p> : null}
          <input
            inputMode="numeric"
            placeholder={`${dl} 桁・重複なし`}
            value={guessInput}
            onChange={(e) => onGuessInputChange(e.target.value)}
          />
          <button type="button" style={{ marginLeft: 8 }} onClick={() => void onGuess()}>
            コール
          </button>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'stretch',
              gap: 10,
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid #ddd',
            }}
          >
            {(
              [
                {
                  key: 'DOUBLE' as const,
                  label: ITEM_LABELS.DOUBLE,
                  active: canUseDouble,
                  body: (
                    <button
                      type="button"
                      disabled={!canUseDouble}
                      onClick={() => void onDoubleStart()}
                      style={{ width: '100%', fontSize: '0.8rem' }}
                    >
                      使用
                    </button>
                  ),
                },
                {
                  key: 'HIGHLOW' as const,
                  label: ITEM_LABELS.HIGHLOW,
                  active: canHighlow,
                  body: (
                    <button type="button" disabled={!canHighlow} onClick={() => void onItemHighlow()} style={{ width: '100%' }}>
                      使用
                    </button>
                  ),
                },
                {
                  key: 'TARGET' as const,
                  label: ITEM_LABELS.TARGET,
                  active: canTarget,
                  body: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input
                        inputMode="numeric"
                        placeholder="0–9"
                        value={targetDigitInput}
                        onChange={(e) => onTargetDigitInputChange(e.target.value)}
                        disabled={!canTarget}
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                      <button type="button" disabled={!canTarget} onClick={() => void onItemTarget()} style={{ width: '100%' }}>
                        実行
                      </button>
                    </div>
                  ),
                },
                {
                  key: 'SLASH' as const,
                  label: ITEM_LABELS.SLASH,
                  active: canSlash,
                  body: (
                    <button type="button" disabled={!canSlash} onClick={() => void onItemSlash()} style={{ width: '100%' }}>
                      使用
                    </button>
                  ),
                },
                {
                  key: 'SHUFFLE' as const,
                  label: ITEM_LABELS.SHUFFLE,
                  active: canShuffle,
                  body: (
                    <button
                      type="button"
                      disabled={!canShuffle}
                      onClick={() => void onItemShuffle()}
                      style={{ width: '100%', fontSize: '0.8rem' }}
                    >
                      使用
                    </button>
                  ),
                },
                {
                  key: 'CHANGE' as const,
                  label: ITEM_LABELS.CHANGE,
                  active: canChange,
                  body: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <select
                        value={changeSlotSafe}
                        onChange={(e) => onChangeSlot(Number(e.target.value))}
                        disabled={!canChange}
                        style={{ width: '100%' }}
                      >
                        {Array.from({ length: dl }, (_, i) => i + 1).map((slot) => (
                          <option key={slot} value={slot}>
                            {slot} 桁
                          </option>
                        ))}
                      </select>
                      <input
                        inputMode="numeric"
                        placeholder="新桁"
                        value={changeNewDigit}
                        onChange={(e) => onChangeNewDigitChange(e.target.value)}
                        disabled={!canChange}
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                      <button type="button" disabled={!canChange} onClick={() => void onItemChange()} style={{ width: '100%' }}>
                        実行
                      </button>
                    </div>
                  ),
                },
              ] as const
            ).map(({ key, label, active, body }) => (
              <div
                key={key}
                style={{
                  flex: '1 1 92px',
                  minWidth: 88,
                  maxWidth: 140,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: 8,
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  background: '#fafafa',
                  opacity: active ? 1 : 0.5,
                }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.25 }}>{label}</div>
                {body}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {room.status === 'playing' && !canSubmitGuess && !pickDoubleRevealSlot && !waitingDoubleReveal ? (
        <p style={{ marginTop: '1rem', color: '#444' }}>相手の手番だよ</p>
      ) : null}
      {room.status === 'finished' ? (
        <p style={{ marginTop: '1rem', fontWeight: 600 }}>
          {room.winner_user_id === userId ? 'あなたの勝ち' : 'あなたの負け'}
        </p>
      ) : null}
    </>
  )
}
