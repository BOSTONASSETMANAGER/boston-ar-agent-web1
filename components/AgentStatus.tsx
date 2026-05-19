'use client'

import { useEffect, useState } from 'react'

type Status = 'online' | 'offline' | 'unknown'

export default function AgentStatus() {
  const [status, setStatus] = useState<Status>('unknown')

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch('/api/agent-proxy/health', { cache: 'no-store' })
        if (cancelled) return
        setStatus(res.ok ? 'online' : 'offline')
      } catch {
        if (!cancelled) setStatus('offline')
      }
    }
    check()
    const id = setInterval(check, 10000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (status === 'online') return <span className="pill pill-online">🟢 Agente online</span>
  if (status === 'offline') return <span className="pill pill-offline">🔴 Agente offline</span>
  return <span className="pill pill-pending">⏳ Verificando…</span>
}
