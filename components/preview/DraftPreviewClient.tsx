'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { statusMeta } from '@/lib/draft-status'

type Draft = {
  id: string
  title: string | null
  category: string | null
  status: string | null
  html_content: string | null
  error_message?: string | null
}

export default function DraftPreviewClient({ draft }: { draft: Draft }) {
  const router = useRouter()
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function publish() {
    setPublishing(true)
    setError(null)
    try {
      const res = await fetch(`/api/drafts/${draft.id}/publish`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Error ${res.status}`)
      }
      router.push('/')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al publicar')
    } finally {
      setPublishing(false)
    }
  }

  const html = draft.html_content
  const s = statusMeta(draft.status)

  return (
    <div style={{ background: '#f8f9ff', minHeight: '100vh' }}>
      {/* Sticky toolbar full-width, sobre el preview */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--saas-border)',
        }}
      >
        <div className="mx-auto max-w-6xl px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/drafts"
              className="inline-flex items-center gap-1 text-sm font-medium"
              style={{ color: 'var(--saas-muted)' }}
            >
              <ArrowLeft size={16} /> Drafts
            </Link>
            <span className="text-sm" style={{ color: 'var(--saas-border)' }}>|</span>
            <div className="min-w-0">
              <div
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--saas-primary)', maxWidth: '560px' }}
                title={draft.title || undefined}
              >
                {draft.title || '(sin título)'}
              </div>
              <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--saas-muted)' }}>
                {draft.category || '—'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{ background: s.bg, color: s.fg, borderColor: s.border }}
            >
              {s.label}
            </span>
            <button
              onClick={publish}
              disabled={publishing || draft.status === 'published' || !html}
              className="nav-btn nav-btn-solid disabled:opacity-60"
            >
              {publishing ? 'Publicando…' : draft.status === 'published' ? 'Publicado' : 'Publicar'}
            </button>
          </div>
        </div>
        {error && (
          <div className="mx-auto max-w-6xl px-6 pb-2 text-sm text-red-600">{error}</div>
        )}
      </div>

      {/* Preview full-bleed — el HTML editorial usa `width:100vw` en sus secciones,
          por eso no lo envolvemos en ningún contenedor con max-width. */}
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <p className="text-lg font-semibold" style={{ color: '#a61b1b' }}>
            Este draft no tiene HTML para mostrar.
          </p>
          {draft.error_message && (
            <pre
              className="mx-auto mt-4 max-w-3xl whitespace-pre-wrap rounded-md border p-4 text-left text-xs"
              style={{ borderColor: '#e57373', background: '#fdecea', color: '#a61b1b' }}
            >
              {draft.error_message}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
