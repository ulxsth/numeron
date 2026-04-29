/**
 * Hit & Blow 採点（桁内の重複なし前提）。
 */

const validateDigitsDistinct = (label: string, ns: number[]) => {
  const bad =
    ns.length === 0 || ns.some((n) => !Number.isInteger(n) || n < 0 || n > 9)
  if (bad) throw new TypeError(`${label}: 各桁は 0–9 の整数である必要がある`)
  if (new Set(ns).size !== ns.length) throw new Error(`${label}: 桁の重複は許可されない`)
}

export function scoreHitBlowWithDigits(
  secret: number[],
  guess: number[],
): {
  hit: number
  blow: number
} {
  validateDigitsDistinct('secret', secret)
  validateDigitsDistinct('guess', guess)
  if (guess.length !== secret.length) {
    throw new Error('secret と guess の桁数が一致しない')
  }

  let hit = 0
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) hit++
  }

  const secretCounts = new Map<number, number>()
  const guessCounts = new Map<number, number>()
  for (let i = 0; i < secret.length; i++) {
    const s = secret[i]
    const g = guess[i]
    if (s === g) continue
    secretCounts.set(s, (secretCounts.get(s) ?? 0) + 1)
    guessCounts.set(g, (guessCounts.get(g) ?? 0) + 1)
  }

  let blow = 0
  for (const [digit, gc] of guessCounts) {
    const sc = secretCounts.get(digit) ?? 0
    blow += Math.min(sc, gc)
  }

  return { hit, blow }
}

/** DB・入力共有用: 数字配列を固定長の文字列に。 */
export function digitsToString(digits: number[]): string {
  validateDigitsDistinct('digits', digits)
  return digits.map(String).join('')
}

/** Trim なし。ちょうど digitLength 文字の 0–9 列のみ受け付ける。 */
export function parseDigitsString(raw: string, digitLength: 3 | 4): number[] {
  if (raw.length !== digitLength) {
    throw new DigitStringError(
      `桁数が必要な長さ (${digitLength}) と一致しない（${raw.length}）`,
    )
  }
  if (!/^[0-9]+$/.test(raw)) {
    throw new DigitStringError('数字以外の文字が含まれている')
  }
  const nums = [...raw].map((c) => c.charCodeAt(0) - 48)
  if (new Set(nums).size !== nums.length) {
    throw new DigitStringError('桁の重複は許可されない')
  }
  return nums
}

export class DigitStringError extends Error {
  override name = 'DigitStringError'
}

/** 採点（文字列入力 → core と同一式）。 */
export function scoreHitBlowFromStrings(
  secretRaw: string,
  guessRaw: string,
  digitLength: 3 | 4,
): { hit: number; blow: number } {
  const secret = parseDigitsString(secretRaw, digitLength)
  const guess = parseDigitsString(guessRaw, digitLength)
  return scoreHitBlowWithDigits(secret, guess)
}
