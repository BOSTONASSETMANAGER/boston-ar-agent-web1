import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAgentDBClient } from '@/lib/agent-db/server'
import { callAgent } from '@/lib/agent-client'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ session_id: string }> },
) {
  const { session_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { message, draft_id } = body as { message?: string; draft_id?: string }
  if (!message) return NextResponse.json({ error: 'message requerido' }, { status: 400 })

  let upstream: Response
  try {
    upstream = await callAgent(`/chat/${session_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, author_id: user.id }),
    })
  } catch {
    return NextResponse.json({ error: 'Agente no disponible' }, { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `Agente ${upstream.status}` }, { status: 502 })
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let finalHtml: string | null = null
  let assistantText = ''
  let bufferedEvents = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          bufferedEvents += chunk
          const parts = bufferedEvents.split('\n\n')
          bufferedEvents = parts.pop() || ''
          for (const p of parts) {
            const dataLine = p.split('\n').find((l) => l.startsWith('data: '))
            if (dataLine) {
              try {
                const evt = JSON.parse(dataLine.slice(6))
                if (evt.type === 'text') assistantText += evt.content || ''
                if (evt.type === 'html_update' && typeof evt.html === 'string') {
                  finalHtml = evt.html
                }
              } catch {
                // ignore parse failures
              }
            }
            controller.enqueue(encoder.encode(p + '\n\n'))
          }
        }
        if (bufferedEvents) controller.enqueue(encoder.encode(bufferedEvents))
      } finally {
        controller.close()
        // Persist updates after stream ends
        if (draft_id) {
          try {
            const db = createAgentDBClient()
            const update: Record<string, unknown> = {}
            if (finalHtml) update.html_content = finalHtml
            const { data: current } = await db
              .from('agent_drafts')
              .select('chat_history')
              .eq('id', draft_id)
              .single()
            const history = Array.isArray(current?.chat_history) ? current.chat_history : []
            history.push({ role: 'user', content: message })
            if (assistantText) history.push({ role: 'assistant', content: assistantText })
            update.chat_history = history
            if (Object.keys(update).length > 0) {
              await db.from('agent_drafts').update(update).eq('id', draft_id)
            }
          } catch {
            // swallow — stream already delivered
          }
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
