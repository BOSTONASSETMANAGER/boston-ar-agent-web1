import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAgentDBClient } from '@/lib/agent-db/server'
import LogoutButton from '@/components/LogoutButton'
import { statusMeta } from '@/lib/draft-status'

type Draft = {
  id: string
  title: string | null
  category: string | null
  status: string | null
  created_at: string
  author_id: string | null
  source_file_name: string | null
  error_message: string | null
}

export default async function DraftsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/drafts')

  let drafts: Draft[] = []
  let loadError: string | null = null
  try {
    const db = createAgentDBClient()
    const { data, error } = await db
      .from('agent_drafts')
      .select('id,title,category,status,created_at,author_id,source_file_name,error_message')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) loadError = error.message
    drafts = (data as Draft[]) || []
  } catch (e) {
    loadError = String(e)
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--saas-primary)' }}>
            Drafts
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--saas-muted)' }}>
            {drafts.length === 0 ? 'Sin drafts todavía' : `${drafts.length} draft${drafts.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="nav-btn nav-btn-glass">Dashboard</Link>
          <Link href="/chat" className="nav-btn nav-btn-solid">Nuevo análisis</Link>
          <LogoutButton />
        </div>
      </header>

      {loadError && (
        <div
          className="mb-4 rounded-md border p-3 text-sm"
          style={{ borderColor: '#e57373', background: '#fdecea', color: '#a61b1b' }}
        >
          Error cargando drafts: {loadError}
        </div>
      )}

      <section className="boston-card" style={{ padding: 0 }}>
        {drafts.length === 0 ? (
          <p className="p-8 text-center" style={{ color: 'var(--saas-muted)' }}>
            No hay drafts aún. <Link href="/chat" className="font-semibold" style={{ color: 'var(--saas-accent)' }}>Creá el primero →</Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs uppercase tracking-wider"
                  style={{ background: 'var(--saas-light)', color: 'var(--saas-muted)' }}
                >
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Archivo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Creado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => {
                  const s = statusMeta(d.status)
                  return (
                    <tr key={d.id} className="border-t" style={{ borderColor: 'var(--saas-border)' }}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{d.title || '(sin título)'}</div>
                        {d.error_message && (
                          <div className="mt-0.5 text-xs" style={{ color: '#a61b1b' }}>
                            {d.error_message.length > 120 ? d.error_message.slice(0, 120) + '…' : d.error_message}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--saas-muted)' }}>
                        {d.category || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--saas-muted)' }}>
                        {d.source_file_name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold"
                          style={{ background: s.bg, color: s.fg, borderColor: s.border }}
                        >
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--saas-muted)' }}>
                        {new Date(d.created_at).toLocaleString('es-AR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/drafts/${d.id}`}
                          className="font-semibold"
                          style={{ color: 'var(--saas-accent)' }}
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
