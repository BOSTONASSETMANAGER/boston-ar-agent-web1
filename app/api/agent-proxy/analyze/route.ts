import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAgentDBClient } from '@/lib/agent-db/server'
import { callAgent } from '@/lib/agent-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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

function sseEvent(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

async function saveErrorDraft(params: {
  user_id: string
  fileName: string
  fileType: 'pdf' | 'csv' | null
  category: string
  message: string
  source_hash: string | null
}): Promise<string | null> {
  try {
    const db = createAgentDBClient()
    const { data, error } = await db
      .from('agent_drafts')
      .insert({
        author_id: params.user_id,
        title: `Error generando (${params.fileName})`,
        category: params.category,
        source_file_name: params.fileName,
        source_file_type: params.fileType,
        source_hash: params.source_hash,
        status: 'error',
        error_message: params.message.slice(0, 2000),
      })
      .select('id')
      .single()
    if (error) {
      console.error('[analyze] failed to persist error draft:', error)
      return null
    }
    return data?.id ?? null
  } catch (e) {
    console.error('[analyze] exception persisting error draft:', e)
    return null
  }
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

  const sinceIso = new Date(Date.now() - DEDUP_WINDOW_MIN * 60 * 1000).toISOString()
  const { data: dupRows } = await db
    .from('agent_drafts')
    .select('id, status, title')
    .eq('author_id', user.id)
    .eq('source_hash', sourceHash)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
  const dup = Array.isArray(dupRows) && dupRows.length > 0 ? dupRows[0] : null

  if (dup) {
    const dupStream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()
        controller.enqueue(
          enc.encode(
            sseEvent({
              type: 'dedup_hit',
              draft_id: dup.id,
              status: dup.status,
              title: dup.title,
              window_minutes: DEDUP_WINDOW_MIN,
            }),
          ),
        )
        controller.enqueue(enc.encode(sseEvent({ type: 'draft_saved', draft_id: dup.id, status: dup.status })))
        controller.close()
      },
    })
    return new Response(dupStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  const upstreamForm = new FormData()
  upstreamForm.append('file', new Blob([fileBuf]), fileName)
  upstreamForm.append('instruction', typeof instruction === 'string' ? instruction : '')
  upstreamForm.append('category', category)
  upstreamForm.append('user_id', user.id)

  let upstream: Response
  try {
    upstream = await callAgent('/analyze/stream', { method: 'POST', body: upstreamForm })
  } catch (e) {
    const msg = `no se pudo contactar al agente: ${String(e).slice(0, 400)}`
    const errId = await saveErrorDraft({
      user_id: user.id,
      fileName,
      fileType,
      category,
      message: msg,
      source_hash: sourceHash,
    })
    return NextResponse.json({ error: msg, draft_id: errId }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    const msg = `agente respondió ${upstream.status}: ${text.slice(0, 500)}`
    const errId = await saveErrorDraft({
      user_id: user.id,
      fileName,
      fileType,
      category,
      message: msg,
      source_hash: sourceHash,
    })
    return NextResponse.json({ error: msg, draft_id: errId }, { status: 502 })
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  let finalResult: Record<string, unknown> | null = null
  let streamError: string | null = null
  let buffered = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          buffered += chunk
          const parts = buffered.split('\n\n')
          buffered = parts.pop() || ''
          for (const p of parts) {
            if (!p) continue
            const dataLine = p.split('\n').find((l) => l.startsWith('data: '))
            if (dataLine) {
              try {
                const evt = JSON.parse(dataLine.slice(6))
                if (evt && typeof evt === 'object') {
                  if (evt.type === 'result') finalResult = evt
                  if (evt.type === 'error') streamError = String(evt.message || 'error desconocido')
                }
              } catch {
                /* ignore */
              }
            }
            controller.enqueue(encoder.encode(p + '\n\n'))
          }
        }
        if (buffered) {
          const dataLine = buffered.split('\n').find((l) => l.startsWith('data: '))
          if (dataLine) {
            try {
              const evt = JSON.parse(dataLine.slice(6))
              if (evt?.type === 'result') finalResult = evt
              if (evt?.type === 'error') streamError = String(evt.message || 'error desconocido')
            } catch {
              /* ignore */
            }
          }
          controller.enqueue(encoder.encode(buffered))
        }
      } catch (e) {
        streamError = `stream interrumpido: ${String(e).slice(0, 300)}`
        controller.enqueue(encoder.encode(sseEvent({ type: 'error', message: streamError })))
      } finally {
        let draftId: string | null = null
        let draftStatus: string | null = null
        const html = finalResult
          ? (finalResult.html_content as string | undefined) || (finalResult.draft_html as string | undefined) || ''
          : ''

        try {
          if (finalResult && html) {
            const { data: draft, error } = await db
              .from('agent_drafts')
              .insert({
                author_id: user.id,
                title: (finalResult.title as string | undefined) ?? 'Sin título',
                slug: (finalResult.slug as string | undefined) ?? null,
                excerpt: (finalResult.excerpt as string | undefined) ?? null,
                category: (finalResult.category as string | undefined) ?? category,
                html_content: html,
                source_file_name: fileName,
                source_file_type: fileType,
                source_hash: sourceHash,
                agent_session_id: (finalResult.session_id as string | undefined) ?? null,
                chat_history: [],
                status: 'pending_review',
              })
              .select('id, status')
              .single()
            if (error) {
              controller.enqueue(
                encoder.encode(sseEvent({ type: 'error', message: `db insert error: ${error.message}` })),
              )
            } else if (draft) {
              draftId = draft.id
              draftStatus = draft.status
            }
          } else {
            const msg =
              streamError ||
              (finalResult
                ? 'el agente completó el request pero no produjo HTML válido'
                : 'el agente cerró el stream sin emitir resultado')
            const errId = await saveErrorDraft({
              user_id: user.id,
              fileName,
              fileType,
              category,
              message: msg,
              source_hash: sourceHash,
            })
            draftId = errId
            draftStatus = 'error'
          }
        } catch (e) {
          controller.enqueue(
            encoder.encode(sseEvent({ type: 'error', message: `db exception: ${String(e).slice(0, 300)}` })),
          )
        }

        controller.enqueue(
          encoder.encode(
            sseEvent({
              type: 'draft_saved',
              draft_id: draftId,
              status: draftStatus,
              ok: draftStatus !== 'error' && draftStatus !== null,
            }),
          ),
        )
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
