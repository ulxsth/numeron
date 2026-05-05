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
      <div style={{ marginTop: '1.25rem', fontSize: '0.88rem', color: '#222' }}>
        <h2 style={{ fontSize: '1rem', marginTop: 0, marginBottom: '0.35rem' }}>アイテム</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginTop: '0.5rem' }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: '#444', fontSize: '0.82rem' }}>あなた</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {orderedItemSlots(itemCards, userId).map(({ kind, used }) => (
                <li
                  key={kind}
                  style={{
                    color: used ? '#777' : '#222',
                    paddingLeft: 10,
                    marginBottom: 6,
                    borderLeft: `2px solid ${used ? '#e5e5e5' : '#c8c8c8'}`,
                    lineHeight: 1.4,
                  }}
                >
                  {ITEM_LABELS[kind]}
                  {used ? ' · 使用済' : ' · 未使用'}
                </li>
              ))}
            </ul>
          </div>
          {oppUid ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6, color: '#444', fontSize: '0.82rem' }}>相手</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {orderedItemSlots(itemCards, oppUid).map(({ kind, used }) => (
                  <li
                    key={kind}
                    style={{
                      color: used ? '#777' : '#222',
                      paddingLeft: 10,
                      marginBottom: 6,
                      borderLeft: `2px solid ${used ? '#e5e5e5' : '#c8c8c8'}`,
                      lineHeight: 1.4,
                    }}
                  >
                    {ITEM_LABELS[kind]}
                    {used ? ' · 使用済' : ' · 未使用'}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    )
  }
  if (memberCount === 1) {
    return <></>
  }
  return null
}
