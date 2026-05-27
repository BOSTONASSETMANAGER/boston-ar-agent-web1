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

type AnalyzeResponse = {
  draft_id?: string
  status?: string
  deduped?: boolean
  error?: string
}

export default function ChatComposer() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('instruction', values.instruction || '')
      fd.append('category', values.category)

      const res = await fetch('/api/agent-proxy/analyze', { method: 'POST', body: fd })
      const json: AnalyzeResponse = await res.json().catch(() => ({}))

      // Fire-and-forget contract: 200 (deduped) or 202 (accepted, processing) are success.
      if (res.status !== 200 && res.status !== 202) {
        throw new Error(json.error || `Error ${res.status}`)
      }
      if (!json.draft_id) {
        throw new Error('Respuesta inválida del proxy (sin draft_id).')
      }

      // Pasamos `?deduped=1` para que /drafts/[id] muestre el aviso de reuso.
      // Decisión: query param > toast porque sobrevive a la navegación sin
      // necesidad de un store global ni librería de notificaciones.
      const qs = json.deduped ? '?deduped=1' : ''
      router.push(`/drafts/${json.draft_id}${qs}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setSubmitting(false)
    }
    // Si todo salió bien dejamos `submitting=true` hasta que la navegación
    // ocurra; evita doble-submit y el botón sigue mostrando el spinner.
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

      <button
        type="submit"
        disabled={submitting}
        className="nav-btn nav-btn-solid w-full justify-center disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Enviando…
          </>
        ) : (
          'Analizar'
        )}
      </button>
    </form>
  )
}
