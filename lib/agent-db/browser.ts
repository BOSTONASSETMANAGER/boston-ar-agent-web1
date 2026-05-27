'use client'

// Browser-side client for the AGENT Supabase project (drafts, sessions, chat_history).
// Uses the publishable/anon key — safe to ship to client. Service-role lives only in
// `lib/agent-db/server.ts`.
//
// Primary use case: Supabase Realtime subscriptions on `agent_drafts` so the
// `/drafts/[id]` page can react when the VPS agent finishes processing.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function createAgentDBBrowserClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_AGENT_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_AGENT_SUPABASE_PUBLISHABLE_KEY
  if (!url || !anonKey) {
    console.warn(
      '[agent-db/browser] NEXT_PUBLIC_AGENT_SUPABASE_URL or NEXT_PUBLIC_AGENT_SUPABASE_PUBLISHABLE_KEY missing — realtime subscriptions will fail until configured.',
    )
  }
  _client = createClient(url ?? 'http://localhost', anonKey ?? 'anon', {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 5 } },
  })
  return _client
}
