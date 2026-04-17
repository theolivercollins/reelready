-- Render queue: track iterations waiting for a provider slot
-- 2026-04-17

alter table public.prompt_lab_iterations
  add column if not exists render_queued_at timestamptz;
