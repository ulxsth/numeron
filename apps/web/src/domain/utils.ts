import { DigitStringError } from '@numeron/core'
import { ITEM_KINDS, type ItemKind } from './constants'
import type { ItemCardRow, ItemEventRow } from './types'

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

export function roomStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'lobby':
      return 'ロビー'
    case 'waiting':
      return 'ナンバー設定'
    case 'playing':
      return '対局中'
    case 'finished':
      return '終了'
    default:
      return status ?? '…'
  }
}

/** アイテムイベントのテキストを生成 */
export function formatItemEventLine(
  ev: ItemEventRow,
  viewerId: string,
  secretPayload: Record<string, unknown> | null,
): string {
  const you = ev.actor_id === viewerId
  const who = you ? 'あなた' : '相手'
  switch (ev.item_kind) {
    case 'HIGHLOW': {
      if (you && secretPayload?.levels && Array.isArray(secretPayload.levels)) {
        return `HIGH&LOW（${who}）→ ${(secretPayload.levels as string[]).join('')}`
      }
      return `HIGH&LOW（${who}）`
    }
    case 'TARGET': {
      const q = ev.public_data.queried_digit
      const base =
        typeof q === 'number' || typeof q === 'string' ? `ターゲット ${q}（${who}）` : `ターゲット（${who}）`
      if (you && secretPayload && typeof secretPayload.contains === 'boolean') {
        if (secretPayload.contains && typeof secretPayload.slot === 'number') {
          return `${base} → 含む · 左から ${secretPayload.slot} 桁目`
        }
        return `${base} → 含まない`
      }
      return base
    }
    case 'SLASH': {
      if (you && secretPayload && typeof secretPayload.spread === 'number') {
        return `スラッシュ（${who}）→ 差 ${String(secretPayload.spread)}`
      }
      return `スラッシュ（${who}）`
    }
    case 'SHUFFLE':
      return `シャッフル（${who}・自分の並び変更）`
    case 'CHANGE': {
      const sl = ev.public_data.slot
      return `チェンジ（${who}${typeof sl === 'number' ? ` · ${sl} 桁目` : ''}）`
    }
    default:
      return `${ev.item_kind}（${who}）`
  }
}
