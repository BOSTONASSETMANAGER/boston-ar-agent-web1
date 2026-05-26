'use client'

import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useState, useRef } from 'react'
import { Upload, FileText, Loader2 } from 'lucide-react'
import { CATEGORIES, CATEGORY_LABELS, type Category } from '@/lib/categories'

type FormValues = {
  instruction: string
  category: Category | ''
}

type ProgressEvent =
  | { type: 'analyze_start'; filename: string; size_bytes: number; category: string }
  | { type: 'tool_use'; name: string; summary?: string }
  | { type: 'model_done'; stop_reason: string; duration_ms: number; input_tokens: number; output_tokens: number; cache_read: number; cache_create: number }
  | { type: 'result'; session_id: string; title?: string; slug?: string }
  | { type: 'heartbeat'; t: number }
  | { type: 'dedup_hit'; draft_id: string; status: string; title?: string; window_minutes: number }
  | { type: 'draft_saved'; draft_id: string | null; status: string | null; ok: boolean }
  | { type: 'error'; message: string }

function describeEvent(e: ProgressEvent): string | null {
  switch (e.type) {
    case 'analyze_start':
      return `Recibido ${e.filename} (${(e.size_bytes / 1024).toFixed(1)} KB) · ${e.category}`
    case 'tool_use':
      return `🔧 ${e.name}${e.summary ? ` · ${e.summary}` : ''}`
    case 'model_done':
      return `Modelo terminó · ${e.stop_reason} · ${(e.duration_ms / 1000).toFixed(1)}s · ${e.output_tokens} tok out`
    case 'result':
      return `Resultado generado · ${e.title || 'sin título'}`
    case 'dedup_hit':
      return `Detectado análisis reciente de este archivo (≤${e.window_minutes}min). Reusando draft existente.`
    case 'error':
      return `❌ ${e.message}`
    default:
      return null
  }
}

export default function ChatComposer() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { instruction: '', category: '' },
  })

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) setFile(f)
  }

  function pushProgress(line: string) {
    setProgress((prev) => [...prev, `${new Date().toLocaleTimeString('es-AR', { hour12: false })} · ${line}`])
  }

  async function consumeStream(res: Response): Promise<{ draftId: string | null; ok: boolean; lastError: string | null }> {
    if (!res.body) {
      return { draftId: null, ok: false, lastError: 'respuesta sin cuerpo' }
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffered = ''
    let draftId: string | null = null
    let ok = false
    let lastError: string | null = null

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffered += decoder.decode(value, { stream: true })
      const parts = buffered.split('\n\n')
      buffered = parts.pop() || ''
      for (const p of parts) {
        const dataLine = p.split('\n').find((l) => l.startsWith('data: '))
        if (!dataLine) continue
        try {
          const evt = JSON.parse(dataLine.slice(6)) as ProgressEvent
          if (evt.type === 'draft_saved') {
            draftId = evt.draft_id
            ok = evt.ok
            continue
          }
          if (evt.type === 'error') {
            lastError = evt.message
          }
          const line = describeEvent(evt)
          if (line) pushProgress(line)
        } catch {
          /* ignore parse failure */
        }
      }
    }
    return { draftId, ok, lastError }
  }

  async function onSubmit(values: FormValues) {
    if (!file) {
      setError('Selecciona un archivo (.pdf o .csv)')
      return
    }
    if (!values.category) {
      setError('Elegí la categoría del informe')
      return
    }
    setError(null)
    setProgress([])
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('instruction', values.instruction || '')
      fd.append('category', values.category)
      const res = await fetch('/api/agent-proxy/analyze', { method: 'POST', body: fd })

      const ct = res.headers.get('content-type') || ''
      if (!res.ok && !ct.includes('text/event-stream')) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Error ${res.status}`)
      }

      const { draftId, ok, lastError } = await consumeStream(res)
      if (draftId) {
        router.push(`/drafts/${draftId}`)
        return
      }
      throw new Error(lastError || 'El agente cerró sin entregar un draft.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="boston-card space-y-5">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition hover:bg-slate-50"
        style={{ borderColor: 'var(--saas-border)' }}
      >
        {file ? (
          <>
            <FileText size={32} style={{ color: 'var(--saas-accent)' }} />
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs" style={{ color: 'var(--saas-muted)' }}>
              {(file.size / 1024).toFixed(1)} KB — click para cambiar
            </p>
          </>
        ) : (
          <>
            <Upload size={32} style={{ color: 'var(--saas-muted)' }} />
            <p className="text-sm font-medium">Suelta un archivo aquí o haz click</p>
            <p className="text-xs" style={{ color: 'var(--saas-muted)' }}>PDF o CSV — incluyendo gráficos e imágenes</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.csv"
          className="hidden"
          onChange={onFile}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Categoría del informe</label>
        <select
          {...register('category', { required: 'Elegí la categoría' })}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[color:var(--saas-accent)]"
          style={{ borderColor: 'var(--saas-border)', background: '#fff' }}
        >
          <option value="">— Elegí una categoría —</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        {errors.category && (
          <p className="mt-1 text-xs text-red-600">{errors.category.message}</p>
        )}
        <p className="mt-1 text-xs" style={{ color: 'var(--saas-muted)' }}>
          Determina la estética y la plantilla editorial que va a usar el agente.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Instrucción <span style={{ color: 'var(--saas-muted)' }}>(opcional)</span>
        </label>
        <textarea
          {...register('instruction')}
          rows={3}
          placeholder="Ej: destacá los bonos corporativos. Dejalo vacío para que el agente genere el reporte estándar a partir del archivo."
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[color:var(--saas-accent)]"
          style={{ borderColor: 'var(--saas-border)' }}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {(submitting || progress.length > 0) && (
        <div
          className="rounded-md border px-3 py-2 text-xs font-mono"
          style={{ borderColor: 'var(--saas-border)', background: '#0a0a0a', color: '#EAEAEA', maxHeight: 220, overflowY: 'auto' }}
        >
          {progress.length === 0 ? (
            <p style={{ color: '#6B6B6B' }}>Iniciando análisis…</p>
          ) : (
            progress.map((line, i) => (
              <div key={i} style={{ color: i === progress.length - 1 ? '#EAEAEA' : '#6B6B6B' }}>
                {line}
              </div>
            ))
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="nav-btn nav-btn-solid w-full justify-center disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Analizando…
          </>
        ) : (
          'Analizar'
        )}
      </button>
    </form>
  )
}
