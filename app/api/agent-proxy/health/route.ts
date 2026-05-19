import { NextResponse } from 'next/server'
import { callAgent } from '@/lib/agent-client'

export async function GET() {
  try {
    const res = await callAgent('/health', { method: 'GET' })
    if (!res.ok) {
      return NextResponse.json({ status: 'offline', code: res.status }, { status: 502 })
    }
    const data = await res.json().catch(() => ({ status: 'online' }))
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ status: 'offline' }, { status: 502 })
  }
}
