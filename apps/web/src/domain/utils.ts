import { DigitStringError } from '@numeron/core'
import { ITEM_KINDS, ITEM_LABELS, type ItemKind } from './constants'
import type { GuessRow, ItemCardRow, ItemEventRow } from './types'

export function orderedItemSlots(rows: ItemCardRow[], uid: string): { kind: ItemKind; used: boolean }[] {
  return ITEM_KINDS.map((kind) => {
    const row = rows.find((r) => r.user_id === uid && r.item_kind === kind)
    return { kind, used: Boolean(row?.used_at) }
  })
}

export function randomShortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

export function errMessage(e: unknown): string {
  if (e instanceof DigitStringError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}

/** 自分のナンバー表示用（サーバー上の左からの並び） */
export function formatSecretDigitsForDisplay(digits: string): string {
  return digits.split('').join(' ')
}

export function roomStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'lobby':
      return 'ロビー'
    case 'waiting':
      return 'ナンバー設定'
    case 'between_games':
      return '結果確認'
    case 'playing':
      return '対局中'
    case 'finished':
      return '終了'
    default:
      return status ?? '…'
  }
}

const LOG_HIDDEN = '—'

function formatDoubleItemPublicLine(publicData: Record<string, unknown>): string {
  const slot = publicData.reveal_slot
  const digit = publicData.reveal_digit
  let mid = ''
  if (typeof slot === 'number' && typeof digit === 'string') {
    mid = `開示 左から ${slot} 桁目は ${digit}`
  } else {
    mid = '使用（開示桁の指定待ち）'
  }
  return mid
}

function levelsPayloadToString(levels: unknown): string | null {
  if (!Array.isArray(levels)) return null
  return levels.map((x) => String(x)).join('')
}

export function formatLogActorTag(viewerId: string, actorId: string): '[自分]' | '[相手]' {
  return actorId === viewerId ? '[自分]' : '[相手]'
}

function formatTimelineLine(tag: '[自分]' | '[相手]', subject: string, result: string): string {
  return `${tag} ${subject} → ${result}`
}

/** コール行: `[自分] 123 → Hit 1 / Blow 2` */
export function formatGuessLogLine(guess: GuessRow, viewerId: string): string {
  const tag = formatLogActorTag(viewerId, guess.guesser_id)
  return formatTimelineLine(tag, guess.digits, `Hit ${guess.hit} / Blow ${guess.blow}`)
}

/** アイテムログ: `[自分] HIGH&LOW → HLH` */
export function formatItemEventLine(
  ev: ItemEventRow,
  viewerId: string,
  secretPayload: Record<string, unknown> | null,
): string {
  const tag = formatLogActorTag(viewerId, ev.actor_id)
  const you = ev.actor_id === viewerId

  switch (ev.item_kind) {
    case 'DOUBLE': {
      const subject = ITEM_LABELS.DOUBLE
      return formatTimelineLine(tag, subject, formatDoubleItemPublicLine(ev.public_data))
    }
    case 'HIGHLOW': {
      const subject = ITEM_LABELS.HIGHLOW
      const lv = secretPayload ? levelsPayloadToString(secretPayload.levels) : null
      if (lv !== null && lv !== '') {
        return formatTimelineLine(tag, subject, lv)
      }
      return formatTimelineLine(tag, subject, LOG_HIDDEN)
    }
    case 'TARGET': {
      const q = ev.public_data.queried_digit
      const subject =
        typeof q === 'number' || typeof q === 'string' ? `${ITEM_LABELS.TARGET} ${q}` : ITEM_LABELS.TARGET
      if (secretPayload && typeof secretPayload.contains === 'boolean') {
        if (secretPayload.contains && typeof secretPayload.slot === 'number') {
          return formatTimelineLine(tag, subject, `含む・左から ${secretPayload.slot} 桁目`)
        }
        return formatTimelineLine(tag, subject, '含まない')
      }
      return formatTimelineLine(tag, subject, LOG_HIDDEN)
    }
    case 'SLASH': {
      const subject = ITEM_LABELS.SLASH
      if (secretPayload && typeof secretPayload.spread === 'number') {
        return formatTimelineLine(tag, subject, `差 ${String(secretPayload.spread)}`)
      }
      return formatTimelineLine(tag, subject, LOG_HIDDEN)
    }
    case 'SHUFFLE': {
      const subject = ITEM_LABELS.SHUFFLE
      const result = you ? '自分の並びを変更' : '相手の並びを変更'
      return formatTimelineLine(tag, subject, result)
    }
    case 'CHANGE': {
      const sl = ev.public_data.slot
      if (typeof sl === 'number') {
        return formatTimelineLine(tag, ITEM_LABELS.CHANGE, `左から ${sl} 桁目を変更`)
      }
      return formatTimelineLine(tag, ITEM_LABELS.CHANGE, LOG_HIDDEN)
    }
    default: {
      const k = ev.item_kind as string
      return formatTimelineLine(tag, k, LOG_HIDDEN)
    }
  }
}
