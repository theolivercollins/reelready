-- Scene allocation bookkeeping. Adds the columns the dynamic allocator
-- needs to persist its decisions, plus a per-property per-room table
-- the Superview reads to explain exactly what the engine did.
--
-- Spec: docs/SCENE-ALLOCATION-PLAN.md §2 + docs/WALKTHROUGH-ROADMAP.md R1.
-- v1 scope: the allocator scores + flags existing scenes rather than
-- inventing new ones. Columns for "redistribution_bonus" etc. are still
-- reserved so the v2 reshape-and-gap-fill path can populate them
-- without another migration.

-- ── scenes: per-scene allocation bookkeeping ──────────────────────────
ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS allocation_reason TEXT
    CHECK (allocation_reason IS NULL OR allocation_reason IN (
      'primary',
      'fallback_low_qa',
      'redistribution_bonus',
      'same_photo_alt_movement',
      'coverage_gap_fill_inside',
      'coverage_gap_fill_outside',
      'coverage_gap_fill_unique'
    )),
  ADD COLUMN IF NOT EXISTS source_photo_qa_score NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS dynamic_qa_threshold NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS trimmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trimmed_reason TEXT;

-- Skip trimmed scenes during generation via an index so the poller / pipeline
-- can filter them out cheaply.
CREATE INDEX IF NOT EXISTS idx_scenes_not_trimmed
  ON public.scenes (property_id)
  WHERE trimmed = FALSE;

-- ── properties: rollup of allocation summary + warnings ────────────────
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS allocation_summary JSONB,
  ADD COLUMN IF NOT EXISTS allocation_warnings TEXT[] NOT NULL DEFAULT '{}';

-- ── allocation_decisions: one row per room_type per property ───────────
CREATE TABLE IF NOT EXISTS public.allocation_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_type TEXT NOT NULL,
  photos_present INT NOT NULL DEFAULT 0,
  photos_eligible INT NOT NULL DEFAULT 0,
  range_min INT NOT NULL DEFAULT 0,
  range_max INT NOT NULL DEFAULT 0,
  clips_assigned_first_pass INT NOT NULL DEFAULT 0,
  clips_added_by_redistribution INT NOT NULL DEFAULT 0,
  clips_trimmed_by_cap INT NOT NULL DEFAULT 0,
  final_clip_count INT NOT NULL DEFAULT 0,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  avg_photo_qa_score NUMERIC(3,1),
  best_photo_qa_score NUMERIC(3,1),
  threshold_applied NUMERIC(3,1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id, room_type)
);

CREATE INDEX IF NOT EXISTS idx_allocation_decisions_property
  ON public.allocation_decisions (property_id);

-- RLS: admins can read all allocation_decisions. Service role bypasses RLS
-- for the pipeline writes.
ALTER TABLE public.allocation_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read allocation_decisions"
  ON public.allocation_decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  );
