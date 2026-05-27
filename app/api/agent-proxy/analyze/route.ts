import { NextRequest, NextResponse, after } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAgentDBClient } from '@/lib/agent-db/server'
import { callAgent } from '@/lib/agent-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const DEDUP_WINDOW_MIN = 5

async function requireAuthedRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthenticated' as const, user: null, role: null }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const role = profile?.role ?? null
  if (!role || !['admin', 'autor'].includes(role)) {
    return { error: 'forbidden' as const, user, role }
  }
  return { error: null, user, role }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthedRole()
  if (auth.error === 'unauthenticated') {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (auth.error === 'forbidden') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  const user = auth.user!

  const fd = await req.formData()
  const file = fd.get('file')
  const instruction = fd.get('instruction')
  const category = fd.get('category')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file es requerido' }, { status: 400 })
  }
  if (typeof category !== 'string' || !category) {
    return NextResponse.json({ error: 'category es requerido' }, { status: 400 })
  }

  const fileName = (file as File).name || 'upload.bin'
  const fileType: 'pdf' | 'csv' | null = fileName.toLowerCase().endsWith('.csv')
    ? 'csv'
    : fileName.toLowerCase().endsWith('.pdf')
      ? 'pdf'
      : null

  const fileBuf = Buffer.from(await file.arrayBuffer())
  const sourceHash = createHash('sha256').update(fileBuf).digest('hex')

  const db = createAgentDBClient()

  // 1) Dedup window check
  const sinceIso = new Date(Date.now() - DEDUP_WINDOW_MIN * 60 * 1000).toISOString()
  const { data: dupRows } = await db
    .from('agent_drafts')
    .select('id, status')
    .eq('author_id', user.id)
    .eq('source_hash', sourceHash)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
  const dup = Array.isArray(dupRows) && dupRows.length > 0 ? dupRows[0] : null

  if (dup) {
    return NextResponse.json(
      { draft_id: dup.id, status: dup.status, deduped: true },
      { status: 200 },
    )
  }

  // 2) Insert placeholder draft in 'processing' state
  const { data: draft, error: insertErr } = await db
    .from('agent_drafts')
    .insert({
      author_id: user.id,
      title: `Procesando ${fileName}…`,
      category,
      source_file_name: fileName,
      source_file_type: fileType,
      source_hash: sourceHash,
      status: 'processing',
    })
    .select('id')
    .single()

  if (insertErr || !draft?.id) {
    console.error('[analyze] failed to insert processing draft:', insertErr)
    return NextResponse.json(
      { error: `no se pudo crear el draft: ${insertErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  const draftId = draft.id as string

  // 3) Build upstream form (must await blob construction *before* returning)
  const upstreamForm = new FormData()
  upstreamForm.append('file', new Blob([fileBuf]), fileName)
  upstreamForm.append('instruction', typeof instruction === 'string' ? instruction : '')
  upstreamForm.append('category', category)
  upstreamForm.append('user_id', user.id)
  upstreamForm.append('draft_id', draftId)

  // 4) Fire-and-forget kickoff. `after()` keeps the runtime alive after the
  // response is flushed so the upstream fetch isn't cancelled mid-flight.
  // The agent is responsible for writing the final result back to Supabase
  // (matching on draft_id), so we don't await/read the response body here.
  after(async () => {
    try {
      const resp = await callAgent('/analyze/stream', {
        method: 'POST',
        body: upstreamForm,
      })
      // Drain the body briefly to avoid keep-alive leaks; we don't parse it.
      // The agent writes results directly to the DB via draft_id.
      if (resp.body) {
        const reader = resp.body.getReader()
        // Best-effort: read until done, ignoring contents.
        // Wrapped in its own try so a stream error doesn't crash the runtime.
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done } = await reader.read()
            if (done) break
          }
        } catch (streamErr) {
          console.error('[analyze] upstream stream drain error:', streamErr)
        }
      }
    } catch (e) {
      console.error('[analyze] upstream kickoff failed:', e)
    }
  })

  // 5) Return immediately
  return NextResponse.json(
    { draft_id: draftId, status: 'processing', deduped: false },
    { status: 202 },
  )
}
