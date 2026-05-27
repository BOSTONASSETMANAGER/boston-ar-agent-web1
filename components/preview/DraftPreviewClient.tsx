'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { statusMeta } from '@/lib/draft-status'
import { AUTHORS, AUTHOR_BY_CATEGORY, isCategory } from '@/lib/categories'
import { createAgentDBBrowserClient } from '@/lib/agent-db/browser'

type Draft = {
  id: string
  title: string | null
  category: string | null
  status: string | null
  html_content: string | null
  error_message?: string | null
}

export default function DraftPreviewClient({
  draft,
  deduped = false,
}: {
  draft: Draft
  deduped?: boolean
}) {
  const router = useRouter()
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDedupedBanner, setShowDedupedBanner] = useState(deduped)
  // Mirror status/error_message localmente para reaccionar a eventos realtime
  // sin esperar al server-render (que igual disparamos con router.refresh()).
  const [liveStatus, setLiveStatus] = useState<string | null>(draft.status)
  const [liveError, setLiveError] = useState<string | null>(draft.error_message ?? null)

  const isProcessing = liveStatus === 'processing'

  // Realtime subscription: escuchamos UPDATEs sobre agent_drafts filtrado por id.
  // Cuando el VPS termine y pase de 'processing' → 'pending_review' (o 'error'),
  // refrescamos el Server Component que ya tiene el HTML completo.
  useEffect(() => {
    // Solo nos suscribimos si todavía no llegamos a un estado terminal.
    if (liveStatus && liveStatus !== 'processing') return

    const supabase = createAgentDBBrowserClient()
    const channel = supabase
      .channel(`agent_drafts:${draft.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agent_drafts',
          filter: `id=eq.${draft.id}`,
        },
        (payload: any) => {
          const newRow = payload?.new ?? {}
          const newStatus = (newRow.status ?? null) as string | null
          const newErr = (newRow.error_message ?? null) as string | null
          setLiveStatus(newStatus)
          setLiveError(newErr)
          if (newStatus && newStatus !== 'processing') {
            // El Server Component re-fetcha el draft completo (incluido html_content).
            router.refresh()
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [draft.id, liveStatus, router])

  const defaultAuthor = useMemo(() => {
    if (draft.category && isCategory(draft.category)) {
      return AUTHOR_BY_CATEGORY[draft.category]
    }
    return AUTHORS[0]
  }, [draft.category])
  const [authorName, setAuthorName] = useState<string>(defaultAuthor)

  async function publish() {
    setPublishing(true)
    setError(null)
    try {
      const res = await fetch(`/api/drafts/${draft.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorName }),
      })
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
  const s = statusMeta(liveStatus)

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
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
              style={{ background: s.bg, color: s.fg, borderColor: s.border }}
            >
              {isProcessing ? 'Procesando' : s.label}
            </span>
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--saas-muted)' }}>
              <span className="uppercase tracking-wider">Autor</span>
              <select
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                disabled={publishing || liveStatus === 'published' || isProcessing}
                className="rounded-md border px-2 py-1 text-xs font-medium"
                style={{ borderColor: 'var(--saas-border)', color: 'var(--saas-primary)', background: '#fff' }}
              >
                {AUTHORS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <button
              onClick={publish}
              disabled={publishing || liveStatus === 'published' || !html || isProcessing}
              className="nav-btn nav-btn-solid disabled:opacity-60"
            >
              {publishing ? 'Publicando…' : liveStatus === 'published' ? 'Publicado' : 'Publicar'}
            </button>
          </div>
        </div>
        {error && (
          <div className="mx-auto max-w-6xl px-6 pb-2 text-sm text-red-600">{error}</div>
        )}
        {showDedupedBanner && (
          <div className="mx-auto max-w-6xl px-6 pb-2">
            <div
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs"
              style={{ borderColor: '#f0c674', background: '#fff8e1', color: '#7a5200' }}
            >
              <span>
                Detectado un análisis reciente del mismo archivo. Estás viendo el draft existente en lugar de generar uno nuevo.
              </span>
              <button
                onClick={() => setShowDedupedBanner(false)}
                className="font-semibold uppercase tracking-wider"
                style={{ color: '#7a5200' }}
              >
                Ocultar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Estado processing: spinner + mensaje. El Server Component se refresca
          automáticamente cuando el realtime nos avise que pasó a un estado terminal. */}
      {isProcessing ? (
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <Loader2
            size={48}
            className="mx-auto animate-spin"
            style={{ color: 'var(--saas-accent)' }}
          />
          <h2 className="mt-6 text-xl font-semibold" style={{ color: 'var(--saas-primary)' }}>
            Procesando informe…
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--saas-muted)' }}>
            El agente está analizando el archivo y redactando el reporte editorial. Esto puede tomar entre 4 y 6 minutos.
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--saas-muted)' }}>
            Podés dejar esta pestaña abierta — se actualiza sola cuando termine.
          </p>
        </div>
      ) : liveStatus === 'error' ? (
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <p className="text-lg font-semibold" style={{ color: '#a61b1b' }}>
            El agente no pudo terminar este draft.
          </p>
          {liveError && (
            <pre
              className="mx-auto mt-4 max-w-3xl whitespace-pre-wrap rounded-md border p-4 text-left text-xs"
              style={{ borderColor: '#e57373', background: '#fdecea', color: '#a61b1b' }}
            >
              {liveError}
            </pre>
          )}
        </div>
      ) : html ? (
        /* Preview full-bleed — el HTML editorial usa `width:100vw` en sus secciones,
           por eso no lo envolvemos en ningún contenedor con max-width. */
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <p className="text-lg font-semibold" style={{ color: '#a61b1b' }}>
            Este draft no tiene HTML para mostrar.
          </p>
          {liveError && (
            <pre
              className="mx-auto mt-4 max-w-3xl whitespace-pre-wrap rounded-md border p-4 text-left text-xs"
              style={{ borderColor: '#e57373', background: '#fdecea', color: '#a61b1b' }}
            >
              {liveError}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
