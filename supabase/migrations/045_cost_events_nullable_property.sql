-- 045_cost_events_nullable_property.sql
-- Allow cost_events.property_id to be NULL for system-scoped events
-- (rule mining, lab embeddings, lab analyze, lab recipes, lab generation).
--
-- Bug observed 2026-04-28: every Lab cost insert at sites that send
-- property_id: null (mine.ts, prompt-lab.ts auto-promote, analyze.ts,
-- recipes.ts, poll-lab-renders.ts) silently failed the NOT NULL constraint.
-- The error was masked by Supabase's {error} return + a try/catch that
-- never fires because the JS client doesn't throw.
--
-- 30-day audit showed 378 Lab iterations but only 17 lab-path cost rows.
-- Effective rule_mining + lab_embedding cost telemetry was zero in prod.
ALTER TABLE public.cost_events ALTER COLUMN property_id DROP NOT NULL;

COMMENT ON COLUMN public.cost_events.property_id IS
  'Nullable: system-scoped events (rule mining, lab embeddings, etc.) have no associated property.';
