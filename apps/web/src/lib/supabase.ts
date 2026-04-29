import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

export const isSupabaseConfigured = Boolean(url && key)

let cached: SupabaseClient | null = null

/** URL / キーが揃っているときだけクライアントを作る（未設定で import 時に落とさない） */
export function getSupabase(): SupabaseClient {
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY を設定してね')
  }
  cached ??= createClient(url, key)
  return cached
}
