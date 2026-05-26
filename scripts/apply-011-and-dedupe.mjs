// One-off: delete duplicate ERROR drafts of "Informe Sector Externo 05.2026.pdf"
// generated today by the Cloudflare 524 → client-retry loop.
// Migration 011 is applied separately via Supabase Dashboard SQL Editor.
// Usage: node scripts/apply-011-and-dedupe.mjs [--apply]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) {
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  }
} catch {
  /* env file missing — rely on shell env */
}

const url = process.env.NEXT_PUBLIC_AGENT_SUPABASE_URL
const key = process.env.AGENT_SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_AGENT_SUPABASE_URL or AGENT_SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const db = createClient(url, key, { auth: { persistSession: false } })

const TARGET_FILE = 'Informe Sector Externo 05.2026.pdf'

const { data, error } = await db
  .from('agent_drafts')
  .select('id, status, source_file_name, created_at, error_message')
  .eq('source_file_name', TARGET_FILE)
  .eq('status', 'error')
  .order('created_at', { ascending: false })
if (error) {
  console.error(error)
  process.exit(1)
}

console.log(`found ${data.length} error draft(s) of "${TARGET_FILE}":`)
data.forEach((d, i) =>
  console.log(`  ${i === 0 ? 'KEEP ' : 'DROP '} ${d.id}  ${d.created_at}`),
)

const toDelete = data.slice(1).map((d) => d.id)
console.log(`\nwould delete ${toDelete.length} duplicate(s)`)
if (!APPLY) {
  console.log('[dry-run] pass --apply to commit')
  process.exit(0)
}

const { error: delErr } = await db.from('agent_drafts').delete().in('id', toDelete)
if (delErr) {
  console.error('delete failed:', delErr)
  process.exit(1)
}
console.log('deleted:', toDelete)
