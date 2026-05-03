type Props = {
  error: string | null
}

export function AuthBooting({ error }: Props) {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '1.5rem' }}>
      <p style={{ color: '#444' }}>準備中…</p>
      {error ? <p style={{ color: '#b00' }}>{error}</p> : null}
    </main>
  )
}
