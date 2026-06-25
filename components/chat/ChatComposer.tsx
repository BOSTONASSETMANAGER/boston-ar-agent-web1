'use client'

import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { useState, useRef } from 'react'
import { Upload, FileText, Loader2 } from 'lucide-react'
import { CATEGORIES, CATEGORY_LABELS, isDualCategory, type Category } from '@/lib/categories'

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

type DropzoneProps = {
  label: string
  file: File | null
  inputRef: React.RefObject<HTMLInputElement | null>
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
}

function Dropzone({ label, file, inputRef, onChange, onDrop }: DropzoneProps) {
  return (
    <div className="flex-1">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--saas-muted)' }}>
        {label}
      </p>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
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
          ref={inputRef}
          type="file"
          accept=".pdf,.csv"
          className="hidden"
          onChange={onChange}
        />
      </div>
    </div>
  )
}

export default function ChatComposer() {
  const router = useRouter()

  // Single-mode state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)

  // Optional image attachment (prensa only)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [image, setImage] = useState<File | null>(null)

  // Dual-mode state
  const fileInputFreeRef = useRef<HTMLInputElement>(null)
  const fileInputPaidRef = useRef<HTMLInputElement>(null)
  const [fileFree, setFileFree] = useState<File | null>(null)
  const [filePaid, setFilePaid] = useState<File | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { instruction: '', category: '' },
  })

  const selectedCategory = watch('category')
  const dual = isDualCategory(selectedCategory)
  const isPrensa = selectedCategory === 'prensa'

  function handleCategoryChange(prev: Category | '', next: Category | '') {
    // Clear files when switching between dual and single modes
    if (isDualCategory(prev) !== isDualCategory(next)) {
      setFile(null)
      setFileFree(null)
      setFilePaid(null)
    }
    // Clear the optional image when leaving prensa
    if (next !== 'prensa') {
      setImage(null)
    }
  }

  function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setImage(f)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) setFile(f)
  }

  function onFileFree(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setFileFree(f)
  }

  function onDropFree(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) setFileFree(f)
  }

  function onFilePaid(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setFilePaid(f)
  }

  function onDropPaid(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) setFilePaid(f)
  }

  async function onSubmit(values: FormValues) {
    if (!values.category) {
      setError('Elegí la categoría del informe')
      return
    }

    if (dual) {
      if (!fileFree || !filePaid) {
        setError('Seleccioná ambos archivos PDF (gratis y pago)')
        return
      }
    } else {
      if (!file) {
        setError('Selecciona un archivo (.pdf o .csv)')
        return
      }
    }

    setError(null)
    setSubmitting(true)
    try {
      const fd = new FormData()
      if (dual) {
        fd.append('file_free', fileFree!)
        fd.append('file_paid', filePaid!)
      } else {
        fd.append('file', file!)
      }
      fd.append('instruction', values.instruction || '')
      fd.append('category', values.category)
      if (image && values.category === 'prensa') {
        fd.append('image', image)
      }

      const res = await fetch('/api/agent-proxy/analyze', { method: 'POST', body: fd })
      const json: AnalyzeResponse = await res.json().catch(() => ({}))

      // Fire-and-forget contract: 200 (deduped) or 202 (accepted, processing) are success.
      if (res.status !== 200 && res.status !== 202) {
        throw new Error(json.error || `Error ${res.status}`)
      }
      if (!json.draft_id) {
        throw new Error('Respuesta inválida del proxy (sin draft_id).')
      }

      // Reset the optional image after a successful submit.
      setImage(null)

      // Pasamos `?deduped=1` para que /drafts/[id] muestre el aviso de reuso.
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
      <div>
        <label className="mb-1 block text-sm font-medium">Categoría del informe</label>
        <select
          {...register('category', {
            required: 'Elegí la categoría',
            onChange: (e) => handleCategoryChange(selectedCategory, e.target.value as Category | ''),
          })}
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

      {dual ? (
        <div className="flex gap-4">
          <Dropzone
            label="PDF · Contenido gratis"
            file={fileFree}
            inputRef={fileInputFreeRef}
            onChange={onFileFree}
            onDrop={onDropFree}
          />
          <Dropzone
            label="PDF · Contenido pago"
            file={filePaid}
            inputRef={fileInputPaidRef}
            onChange={onFilePaid}
            onDrop={onDropPaid}
          />
        </div>
      ) : (
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
      )}

      {isPrensa && (
        <div>
          <label className="mb-1 block text-sm font-medium">
            Imagen <span style={{ color: 'var(--saas-muted)' }}>(opcional)</span>
          </label>
          {image ? (
            <div
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--saas-border)', background: '#fff' }}
            >
              <span className="flex items-center gap-2 truncate">
                <FileText size={16} style={{ color: 'var(--saas-accent)' }} />
                <span className="truncate">{image.name}</span>
                <span className="shrink-0 text-xs" style={{ color: 'var(--saas-muted)' }}>
                  {(image.size / 1024).toFixed(1)} KB
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setImage(null)
                  if (imageInputRef.current) imageInputRef.current.value = ''
                }}
                className="shrink-0 text-xs font-medium text-red-600 hover:underline"
              >
                quitar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm transition hover:bg-slate-50"
              style={{ borderColor: 'var(--saas-border)' }}
            >
              <Upload size={16} style={{ color: 'var(--saas-muted)' }} />
              Adjuntar una imagen (PNG, JPG, WEBP o GIF)
            </button>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={onImage}
          />
        </div>
      )}

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
