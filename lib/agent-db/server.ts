// SERVICE ROLE — server-only. Authorization enforced in API route handlers.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createAgentDBClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_AGENT_SUPABASE_URL
  const serviceKey = process.env.AGENT_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.warn(
      '[agent-db/server] NEXT_PUBLIC_AGENT_SUPABASE_URL or AGENT_SUPABASE_SERVICE_ROLE_KEY missing — agent DB calls will fail until configured.',
    )
  }
  return createClient(url ?? 'http://localhost', serviceKey ?? 'service', {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
