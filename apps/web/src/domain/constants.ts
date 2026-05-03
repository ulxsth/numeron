export const ITEM_KINDS = ['DOUBLE', 'HIGHLOW', 'TARGET', 'SLASH', 'SHUFFLE', 'CHANGE'] as const
export type ItemKind = (typeof ITEM_KINDS)[number]

export const ITEM_LABELS: Record<ItemKind, string> = {
  DOUBLE: 'DOUBLE',
  HIGHLOW: 'HIGH&LOW',
  TARGET: 'TARGET',
  SLASH: 'SLASH',
  SHUFFLE: 'SHUFFLE',
  CHANGE: 'CHANGE',
}

export const DEFAULT_DIGIT_LENGTH: 3 | 4 = 3
export const DEFAULT_MATCH_WINS_REQUIRED = 1
