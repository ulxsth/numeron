export function SupabaseNotConfigured() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '1.5rem', maxWidth: 520 }}>
      <h1 style={{ fontSize: '1.25rem' }}>Numeron</h1>
      <p style={{ color: '#b00' }}>
        環境変数が無いよ。`.env` に `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` を設定してね（`.env.example`
        参照）。ローカルなら `supabase start` のあと Studio / CLI でキーを確認できる。
      </p>
    </main>
  )
}
