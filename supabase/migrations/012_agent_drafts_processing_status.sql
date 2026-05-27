-- Migration 012: 'processing' status + realtime publication
-- Target project: hsnpveroqzmhppfsfaua (Agent DB)
--
-- The Vercel proxy now inserts agent_drafts with status='processing'
-- immediately, then fires the VPS agent without awaiting completion.
-- The agent writes the final HTML directly to the row via service-role.
-- Frontend subscribes via Supabase realtime to detect status transitions.

ALTER TABLE public.agent_drafts
  DROP CONSTRAINT IF EXISTS agent_drafts_status_check;

ALTER TABLE public.agent_drafts
  ADD CONSTRAINT agent_drafts_status_check
    CHECK (status IN ('processing','pending_review','approved','rejected','published','error'));

-- Realtime: ensure the table is in the realtime publication and
-- emits full rows so the client receives all columns on UPDATE.
ALTER TABLE public.agent_drafts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agent_drafts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_drafts;
  END IF;
END $$;
