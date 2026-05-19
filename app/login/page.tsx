'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})
type FormValues = z.infer<typeof schema>

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const redirectTo = params.get('redirect') || '/'
  const urlError = params.get('error')
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword(values)
      if (error) {
        setServerError(error.message)
        return
      }
      router.push(redirectTo)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="boston-card w-full max-w-md">
      <h1 className="mb-1 text-2xl font-bold" style={{ color: 'var(--saas-primary)' }}>
        Iniciar sesión
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--saas-muted)' }}>
        Acceso interno — Boston AR
      </p>

      {urlError === 'unauthorized' && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Tu cuenta no tiene permisos para acceder a este panel.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            {...register('email')}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[color:var(--saas-accent)]"
            style={{ borderColor: 'var(--saas-border)' }}
            autoComplete="email"
          />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Contraseña</label>
          <input
            type="password"
            {...register('password')}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[color:var(--saas-accent)]"
            style={{ borderColor: 'var(--saas-border)' }}
            autoComplete="current-password"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        {serverError && <p className="text-sm text-red-600">{serverError}</p>}

        <button
          type="submit"
          disabled={loading}
          className="nav-btn nav-btn-solid w-full justify-center disabled:opacity-60"
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <Suspense fallback={<div className="boston-card w-full max-w-md">Cargando…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
