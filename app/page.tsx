import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAgentDBClient } from '@/lib/agent-db/server'
import AgentStatus from '@/components/AgentStatus'
import { statusMeta } from '@/lib/draft-status'

type Draft = {
  id: string
  title: string | null
  category: string | null
  status: string | null
  created_at: string
  source_file_name: string | null
  error_message: string | null
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let pending: Draft[] = []
  let published: Draft[] = []
  let errors: Draft[] = []
  try {
    const db = createAgentDBClient()
    const { data } = await db
      .from('agent_drafts')
      .select('id,title,category,status,created_at,source_file_name,error_message')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60)
    const all = (data as Draft[]) || []
    pending = all.filter((d) => d.status === 'pending_review' || d.status === 'approved' || d.status === 'rejected').slice(0, 5)
    published = all.filter((d) => d.status === 'published').slice(0, 5)
    errors = all.filter((d) => d.status === 'error').slice(0, 5)
  } catch {
    // agent DB not reachable — dejar listas vacías, middleware ya advierte si envs faltan
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--saas-primary)' }}>
            Dashboard
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--saas-muted)' }}>
            Bienvenido, {user.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AgentStatus />
          <Link href="/drafts" className="nav-btn nav-btn-glass">Ver todos</Link>
          <Link href="/chat" className="nav-btn nav-btn-solid">Nuevo análisis</Link>
        </div>
      </header>

      <section className="boston-card mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--saas-primary)' }}>
            Drafts pendientes
          </h2>
          <span className="text-xs" style={{ color: 'var(--saas-muted)' }}>
            {pending.length} visible{pending.length === 1 ? '' : 's'}
          </span>
        </div>
        <DraftList drafts={pending} emptyMsg="No hay drafts pendientes." />
      </section>

      <section className="boston-card mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--saas-primary)' }}>
            Últimos publicados
          </h2>
          <span className="text-xs" style={{ color: 'var(--saas-muted)' }}>
            {published.length}
          </span>
        </div>
        <DraftList drafts={published} emptyMsg="Aún no publicaste informes." />
      </section>

      {errors.length > 0 && (
        <section className="boston-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold" style={{ color: '#a61b1b' }}>
              Errores recientes
            </h2>
            <span className="text-xs" style={{ color: 'var(--saas-muted)' }}>
              {errors.length}
            </span>
          </div>
          <DraftList drafts={errors} emptyMsg="Sin errores." />
        </section>
      )}
    </main>
  )
}

function DraftList({ drafts, emptyMsg }: { drafts: Draft[]; emptyMsg: string }) {
  if (drafts.length === 0) {
    return <p style={{ color: 'var(--saas-muted)' }}>{emptyMsg}</p>
  }
  return (
    <ul className="divide-y" style={{ borderColor: 'var(--saas-border)' }}>
      {drafts.map((d) => {
        const s = statusMeta(d.status)
        return (
          <li key={d.id} className="py-3">
            <Link href={`/drafts/${d.id}`} className="flex flex-wrap items-start gap-3 hover:opacity-80">
              <span
                className="mt-0.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                style={{ background: s.bg, color: s.fg, borderColor: s.border }}
              >
                {s.label}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate" style={{ color: 'var(--saas-primary)' }}>
                  {d.title || '(sin título)'}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs" style={{ color: 'var(--saas-muted)' }}>
                  <span>{d.category || '—'}</span>
                  {d.source_file_name && <span className="font-mono">{d.source_file_name}</span>}
                  <span>
                    {new Date(d.created_at).toLocaleString('es-AR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                {d.error_message && (
                  <div className="mt-1 text-xs" style={{ color: '#a61b1b' }}>
                    {d.error_message.length > 140 ? d.error_message.slice(0, 140) + '…' : d.error_message}
                  </div>
                )}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
