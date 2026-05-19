import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChatComposer from '@/components/chat/ChatComposer'

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/chat')

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--saas-primary)' }}>
          Nuevo análisis
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--saas-muted)' }}>
          Sube un archivo financiero e indícale al agente qué analizar.
        </p>
      </header>
      <ChatComposer />
    </main>
  )
}
