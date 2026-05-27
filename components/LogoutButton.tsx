import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default function LogoutButton({ variant = 'glass' }: { variant?: 'glass' | 'text' }) {
  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }
  const className =
    variant === 'text'
      ? 'text-sm underline-offset-2 hover:underline'
      : 'nav-btn nav-btn-glass'
  return (
    <form action={signOut}>
      <button
        type="submit"
        className={className}
        style={variant === 'text' ? { color: 'var(--saas-muted)' } : undefined}
      >
        Cerrar sesión
      </button>
    </form>
  )
}
