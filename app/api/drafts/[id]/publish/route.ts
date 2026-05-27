import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSSRClient } from '@/lib/supabase/server'
import { createAgentDBClient } from '@/lib/agent-db/server'
import { createClient } from '@supabase/supabase-js'
import { AUTHORS, CATEGORIES, CATEGORY_POLICY, getDefaultAuthor, type Author, type Category } from '@/lib/categories'

function slugify(input: string) {
  return input
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Override opcional del autor desde el body — si no viene, usamos el default
  // por categoría definido en lib/categories.ts.
  let bodyAuthor: string | null = null
  try {
    const body = await req.json().catch(() => null)
    if (body && typeof body.authorName === 'string') {
      bodyAuthor = body.authorName.trim() || null
    }
  } catch {
    bodyAuthor = null
  }

  const sb = await createSSRClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? null
  if (!role || !['admin', 'autor'].includes(role)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  // 1) Read draft from agent DB
  const agentDb = createAgentDBClient()
  const { data: draft, error: draftErr } = await agentDb
    .from('agent_drafts')
    .select('*')
    .eq('id', id)
    .single()
  if (draftErr || !draft) return NextResponse.json({ error: 'Draft no encontrado' }, { status: 404 })
  if (role !== 'admin' && draft.author_id !== user.id) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  if (draft.status === 'published') {
    return NextResponse.json({ error: 'Draft ya publicado' }, { status: 409 })
  }

  const category = draft.category as Category
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: `Categoría inválida: ${category}. Esperado: ${CATEGORIES.join(', ')}` },
      { status: 400 },
    )
  }
  const access_level = CATEGORY_POLICY[category]

  // Resolver author_name: override del body si es uno de los autores conocidos
  // o texto libre no vacío; fallback al default por categoría.
  const author_name: string = bodyAuthor
    ? ((AUTHORS as readonly string[]).includes(bodyAuthor) ? (bodyAuthor as Author) : bodyAuthor)
    : getDefaultAuthor(category)

  // 2) Insert into boston-ar posts with service role
  const bostonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const bostonServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!bostonUrl || !bostonServiceKey) {
    return NextResponse.json(
      { error: 'Boston-ar service key no configurado' },
      { status: 500 },
    )
  }
  const bostonDb = createClient(bostonUrl, bostonServiceKey, { auth: { persistSession: false } })

  const title = draft.title || 'Sin título'
  const slug = `${slugify(title)}-${Date.now().toString(36)}`
  const excerpt = (draft.metadata && typeof draft.metadata === 'object' && 'excerpt' in draft.metadata)
    ? String((draft.metadata as Record<string, unknown>).excerpt)
    : null

  const { data: post, error: postErr } = await bostonDb
    .from('posts')
    .insert({
      title,
      slug,
      excerpt,
      html_content: draft.html_content,
      category,
      access_level,
      published: true,
      author_id: user.id,
      author_name,
    })
    .select('id, slug')
    .single()
  if (postErr) {
    return NextResponse.json({ error: `Error al publicar: ${postErr.message}` }, { status: 500 })
  }

  // 3) Mark draft as published
  await agentDb
    .from('agent_drafts')
    .update({ status: 'published', published_post_id: post.id })
    .eq('id', id)

  return NextResponse.json({ ok: true, post_id: post.id, slug: post.slug })
}
