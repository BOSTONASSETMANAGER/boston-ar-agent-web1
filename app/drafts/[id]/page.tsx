import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAgentDBClient } from '@/lib/agent-db/server'
import DraftPreviewClient from '@/components/preview/DraftPreviewClient'

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/drafts/${id}`)

  let draft: any = null
  try {
    const db = createAgentDBClient()
    const { data } = await db.from('agent_drafts').select('*').eq('id', id).single()
    draft = data
  } catch {
    // agent DB not configured
  }

  if (!draft) notFound()

  // Full-bleed: no max-w container aquí para no aplastar el `width:100vw` del
  // template editorial. Las acciones (título + publicar) viven en el header
  // adentro de DraftPreviewClient con su propio contenedor.
  return <DraftPreviewClient draft={draft} />
}
