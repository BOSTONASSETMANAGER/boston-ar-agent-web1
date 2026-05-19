import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    console.warn('[supabase/client] NEXT_PUBLIC_SUPABASE_URL/ANON_KEY no configurados')
  }
  return createBrowserClient(url ?? 'http://localhost', anonKey ?? 'anon')
}
