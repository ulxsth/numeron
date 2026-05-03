import { ITEM_LABELS } from '../domain/constants'
import type { ItemCardRow, Room } from '../domain/types'
import { orderedItemSlots } from '../domain/utils'

type Props = {
  userId: string
  room: Room
  memberCount: number
  itemCards: ItemCardRow[]
  oppUid: string | null
}

export function ItemDeckSummary({ userId, room, memberCount, itemCards, oppUid }: Props) {
  if (memberCount >= 2 && room.status !== 'lobby') {
    return (
      <div style={{ marginTop: '1rem', fontSize: '0.88rem', color: '#333' }}>
        <h2 style={{ fontSize: '1rem' }}>アイテム（マッチ通算・各 1 回）</h2>
        <p style={{ color: '#555', marginTop: 4 }}>
          BO 中はゲームが変わっても使用済みは戻らない。ダブルは手番に使える（連続 2 コール）。
        </p>
        {itemCards.length === 0 ? (
          <p style={{ color: '#888' }}>カード行がまだ無いよ。`room_item_cards` のマイグレーションを当ててね。</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', marginTop: 8 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>あなた</div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {orderedItemSlots(itemCards, userId).map(({ kind, used }) => (
                  <li key={kind} style={{ color: used ? '#888' : undefined }}>
                    {ITEM_LABELS[kind]}
                    {used ? ' · 使用済' : ' · 未使用'}
                  </li>
                ))}
              </ul>
            </div>
            {oppUid ? (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>相手</div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {orderedItemSlots(itemCards, oppUid).map(({ kind, used }) => (
                    <li key={kind} style={{ color: used ? '#888' : undefined }}>
                      {ITEM_LABELS[kind]}
                      {used ? ' · 使用済' : ' · 未使用'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    )
  }
  if (memberCount === 1) {
    return (
      <p style={{ marginTop: '0.75rem', fontSize: '0.88rem', color: '#666' }}>
        相手が入室しホストが開始すると、アイテムカードが 6 種×1 枚ずつ配られるよ。
      </p>
    )
  }
  return null
}
