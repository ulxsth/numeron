import { describe, expect, it } from 'vitest'
import {
  DigitStringError,
  parseDigitsString,
  scoreHitBlowFromStrings,
  scoreHitBlowWithDigits,
} from './index.js'

/** Postgres public.compute_hit_blow と突き合わせ用のベクトル。 */
describe('scoreHitBlowWithDigits', () => {
  it('123 vs 312 → 0 hit 3 blow', () => {
    expect(scoreHitBlowWithDigits([1, 2, 3], [3, 1, 2])).toEqual({
      hit: 0,
      blow: 3,
    })
  })

  it('123 vs 120 → 2 hit 0 blow', () => {
    expect(scoreHitBlowWithDigits([1, 2, 3], [1, 2, 0])).toEqual({
      hit: 2,
      blow: 0,
    })
  })

  it('4 桁: 0192 vs 9210 → 0 hit 4 blow', () => {
    expect(scoreHitBlowWithDigits([0, 1, 9, 2], [9, 2, 1, 0])).toEqual({
      hit: 0,
      blow: 4,
    })
  })

  it('完全一致で digit_length hit', () => {
    expect(scoreHitBlowWithDigits([5, 6, 7], [5, 6, 7])).toEqual({
      hit: 3,
      blow: 0,
    })
  })
})

describe('parseDigitsString', () => {
  it('先頭 0 を許す', () => {
    expect(parseDigitsString('012', 3)).toEqual([0, 1, 2])
  })

  it('重複で DigitStringError', () => {
    expect(() => parseDigitsString('112', 3)).toThrow(DigitStringError)
  })

  it('長さ不一致で DigitStringError', () => {
    expect(() => parseDigitsString('12', 3)).toThrow(DigitStringError)
  })
})

describe('scoreHitBlowFromStrings', () => {
  it('文字列経路が配列と一致', () => {
    expect(scoreHitBlowFromStrings('123', '120', 3)).toEqual(
      scoreHitBlowWithDigits([1, 2, 3], [1, 2, 0]),
    )
  })
})
