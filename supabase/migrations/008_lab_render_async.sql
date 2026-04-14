-- Fire-and-forget Lab renders: submit provider task, return task_id,
-- let cron poll + finalize. Mirrors the main pipeline pattern.

ALTER TABLE public.prompt_lab_iterations
  ADD COLUMN provider_task_id TEXT,
  ADD COLUMN render_error TEXT,
  ADD COLUMN render_submitted_at TIMESTAMPTZ;

CREATE INDEX idx_lab_iter_pending_render
  ON public.prompt_lab_iterations(provider_task_id)
  WHERE provider_task_id IS NOT NULL AND clip_url IS NULL;
