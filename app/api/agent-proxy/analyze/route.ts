import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAgentDBClient } from '@/lib/agent-db/server'
import { callAgent } from '@/lib/agent-client'

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

async function saveErrorDraft(params: {
  user_id: string
  fileName: string
  fileType: 'pdf' | 'csv' | null
  category: string
  message: string
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

  const upstream = new FormData()
  upstream.append('file', file, fileName)
  upstream.append('instruction', typeof instruction === 'string' ? instruction : '')
  upstream.append('category', category)
  upstream.append('user_id', user.id)

  // 1. Llamar al agente
  let agentData: any = null
  let agentErrorMsg = ''
  try {
    const res = await callAgent('/analyze', { method: 'POST', body: upstream })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      agentErrorMsg = `agente respondió ${res.status}: ${text.slice(0, 500)}`
    } else {
      agentData = await res.json()
    }
  } catch (e) {
    agentErrorMsg = `no se pudo contactar al agente: ${String(e).slice(0, 400)}`
  }

  if (!agentData) {
    const errId = await saveErrorDraft({
      user_id: user.id,
      fileName,
      fileType,
      category,
      message: agentErrorMsg || 'agente devolvió vacío',
    })
    return NextResponse.json(
      { error: agentErrorMsg || 'No se pudo contactar al agente', draft_id: errId },
      { status: 502 },
    )
  }

  const htmlContent = agentData.html_content || agentData.draft_html || ''

  // 2. Persistir — exitoso o con HTML vacío (marca como error)
  try {
    const db = createAgentDBClient()
    const payload = htmlContent
      ? {
          author_id: user.id,
          title: agentData.title ?? 'Sin título',
          slug: agentData.slug ?? null,
          excerpt: agentData.excerpt ?? null,
          category: agentData.category ?? category,
          html_content: htmlContent,
          source_file_name: fileName,
          source_file_type: fileType,
          agent_session_id: agentData.session_id ?? null,
          chat_history: agentData.chat_history ?? [],
          status: 'pending_review',
        }
      : {
          author_id: user.id,
          title: agentData.title ?? `Error generando (${fileName})`,
          slug: agentData.slug ?? null,
          excerpt: agentData.excerpt ?? null,
          category: agentData.category ?? category,
          html_content: null,
          source_file_name: fileName,
          source_file_type: fileType,
          agent_session_id: agentData.session_id ?? null,
          chat_history: agentData.chat_history ?? [],
          status: 'error',
          error_message:
            'El agente completó el request pero no produjo HTML válido (posiblemente el modelo no llamó a finalize_html).',
        }

    const { data: draft, error } = await db
      .from('agent_drafts')
      .insert(payload)
      .select('id, status')
      .single()

    if (error) {
      console.error('[analyze] agent_drafts insert error:', error)
      return NextResponse.json(
        { error: 'No se pudo guardar el draft', detail: error.message, code: error.code },
        { status: 500 },
      )
    }

    return NextResponse.json({
      draft_id: draft.id,
      status: draft.status,
      ok: draft.status !== 'error',
    })
  } catch (e) {
    console.error('[analyze] unexpected error:', e)
    return NextResponse.json(
      { error: 'No se pudo guardar el draft', detail: String(e) },
      { status: 500 },
    )
  }
}
