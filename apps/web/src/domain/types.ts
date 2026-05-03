import type { ItemKind } from './constants'

export type Room = {
  id: string
  short_code: string
  status: string
  digit_length: number
  created_by: string
  current_turn_user_id: string | null
  winner_user_id: string | null
  match_wins_required: number
  match_wins: Record<string, number>
  current_game_index: number
  double_attacker_id?: string | null
  double_phase?: string | null
  double_reveal_slot?: number | null
  double_reveal_digit?: string | null
}

export type GuessRow = {
  id: string
  room_id: string
  guesser_id: string
  digits: string
  hit: number
  blow: number
  created_at: string
}

export type ItemCardRow = {
  room_id: string
  user_id: string
  item_kind: ItemKind
  used_at: string | null
}

export type ItemEventRow = {
  id: string
  room_id: string
  actor_id: string
  item_kind: Exclude<ItemKind, 'DOUBLE'>
  public_data: Record<string, unknown>
  created_at: string
}

export type TimelineEntry =
  | { sortKey: string; kind: 'g'; guess: GuessRow }
  | { sortKey: string; kind: 'i'; ev: ItemEventRow; secretPayload: Record<string, unknown> | null }
