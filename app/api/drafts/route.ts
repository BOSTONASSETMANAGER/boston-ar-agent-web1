import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAgentDBClient } from '@/lib/agent-db/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  try {
    const db = createAgentDBClient()
    const { data, count, error } = await db
      .from('agent_drafts')
      .select('id,title,category,status,created_at', { count: 'exact' })
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) throw error
    return NextResponse.json({ items: data ?? [], total: count ?? 0, limit, offset })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'No usar directamente. Usa /api/agent-proxy/analyze para crear drafts.' },
    { status: 405 },
  )
}
