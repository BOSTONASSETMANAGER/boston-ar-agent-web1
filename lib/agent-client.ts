const DEFAULT_BASE = 'http://localhost:8787'

export function agentBaseUrl(): string {
  return process.env.AGENT_URL || DEFAULT_BASE
}

export function callAgent(path: string, init: RequestInit = {}): Promise<Response> {
  const base = agentBaseUrl()
  const url = path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`
  const token = process.env.AGENT_TOKEN
  const headers = new Headers(init.headers || {})
  if (token) headers.set('X-Agent-Token', token)
  return fetch(url, { ...init, headers })
}
