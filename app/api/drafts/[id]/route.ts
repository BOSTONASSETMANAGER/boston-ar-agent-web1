import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAgentDBClient } from '@/lib/agent-db/server'

async function getAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, role: null }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return { user, role: profile?.role ?? null }
}

function canAccess(draft: { author_id: string | null }, user: { id: string }, role: string | null) {
  return role === 'admin' || draft.author_id === user.id
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, role } = await getAuth()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const db = createAgentDBClient()
  const { data, error } = await db.from('agent_drafts').select('*').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!canAccess(data, user, role)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, role } = await getAuth()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const db = createAgentDBClient()
  const { data: existing } = await db.from('agent_drafts').select('author_id').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!canAccess(existing, user, role)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const patch = await req.json().catch(() => ({}))
  const allowed = ['title', 'category', 'html_content', 'status', 'metadata']
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (k in patch) update[k] = patch[k]
  const { data, error } = await db.from('agent_drafts').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, role } = await getAuth()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const db = createAgentDBClient()
  const { data: existing } = await db.from('agent_drafts').select('author_id').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!canAccess(existing, user, role)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const { error } = await db.from('agent_drafts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
