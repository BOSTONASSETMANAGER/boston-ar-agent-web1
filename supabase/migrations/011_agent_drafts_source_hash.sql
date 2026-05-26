-- Migration 011: deduplication via source_hash on agent_drafts
-- Target project: hsnpveroqzmhppfsfaua (Agent DB)
--
-- Adds SHA-256 hash of the uploaded source bytes. The Next.js proxy
-- /api/agent-proxy/analyze hashes the uploaded file and, before invoking
-- the VPS agent, looks for a recent draft with the same hash + author_id.
-- If found within DEDUP_WINDOW_MIN minutes, the request is short-circuited
-- and the existing draft_id is returned to the client. This prevents the
-- pattern where a Cloudflare 524 timeout makes the client retry while the
-- upstream agent is still completing the original request.

ALTER TABLE public.agent_drafts
  ADD COLUMN IF NOT EXISTS source_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_drafts_dedup
  ON public.agent_drafts(author_id, source_hash, created_at DESC)
  WHERE source_hash IS NOT NULL;

COMMENT ON COLUMN public.agent_drafts.source_hash IS
  'SHA-256 hex of the uploaded source file bytes, used for short-window dedup in /api/agent-proxy/analyze.';
