# Boston AR — Agente Analista (Web UI)

Internal Next.js 16 app for Boston Asset Manager employees to:
- Upload financial data (PDF/CSV)
- Interact with the Claude-powered analyst agent
- Review and edit HTML drafts
- Publish final reports to the public boston-ar site

## Stack

- Next.js 16 (App Router) + React 19
- Tailwind v4 + shared boston-ar design tokens
- Supabase SSR (auth against boston-ar DB)
- Supabase service role (drafts in agent DB `hsnpveroqzmhppfsfaua`)
- Proxies to Python FastAPI agent at `AGENT_URL`

## Run

```bash
cp .env.local.example .env.local   # fill keys
npm install
npm run dev                         # http://localhost:3100
```

## Related

Obsidian index: `E:\main\Proyectos\Boston Asset Manager - Sitio Web.md`
