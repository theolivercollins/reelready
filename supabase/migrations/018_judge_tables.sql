-- Migration 018: Claude rubric judge scores + per-cell calibration snapshots.
--
-- Phase 1 ships a Claude-only judge. `clip_similarity` is nullable so
-- Phase 1.5 can fill it without a schema migration if CLIP is added.

BEGIN;

-- One score per iteration. If the judge is re-run, we overwrite via upsert.
CREATE TABLE IF NOT EXISTS lab_judge_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iteration_id    UUID NOT NULL UNIQUE REFERENCES prompt_lab_iterations(id) ON DELETE CASCADE,
  -- Raw rubric output from Claude. Shape:
  --   { prompt_adherence: 1..5, motion_quality: 1..5, spatial_coherence: 1..5,
  --     aesthetic_intent: 1..5, rationale: string, fail_tag_suggestions: string[] }
  rubric          JSONB NOT NULL,
  composite_1to5  NUMERIC(3,2) NOT NULL CHECK (composite_1to5 >= 1 AND composite_1to5 <= 5),
  confidence      NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  clip_similarity NUMERIC(3,2)          CHECK (clip_similarity IS NULL OR (clip_similarity >= 0 AND clip_similarity <= 1)),
  judge_version   TEXT NOT NULL,
  model_id        TEXT NOT NULL,
  neighbors_used  INT  NOT NULL DEFAULT 0,
  cost_cents      INT  NOT NULL DEFAULT 0,
  judged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_judge_scores_judged_at ON lab_judge_scores (judged_at DESC);

-- Per-cell, per-window snapshot of how well the judge agrees with Oliver.
CREATE TABLE IF NOT EXISTS lab_judge_calibrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_key              TEXT NOT NULL,     -- e.g. 'kitchen-push_in'
  room_type             TEXT NOT NULL,
  camera_movement       TEXT NOT NULL,
  sample_size           INT  NOT NULL,
  exact_match_rate      NUMERIC(4,3) NOT NULL, -- judge composite rounds to exact human ★
  within_one_star_rate  NUMERIC(4,3) NOT NULL, -- |judge - human| <= 1
  mean_abs_error        NUMERIC(4,3) NOT NULL,
  judge_version         TEXT NOT NULL,
  model_id              TEXT NOT NULL,
  window_start          TIMESTAMPTZ,
  window_end            TIMESTAMPTZ,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_judge_calibrations_cell ON lab_judge_calibrations (cell_key, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_judge_calibrations_version ON lab_judge_calibrations (judge_version, computed_at DESC);

-- Convenience view: most-recent calibration per cell, with a derived mode
-- ('advisory' when within-1-star < 0.80, 'auto' otherwise).
CREATE OR REPLACE VIEW v_judge_calibration_status AS
WITH latest AS (
  SELECT DISTINCT ON (cell_key)
    cell_key, room_type, camera_movement,
    sample_size, exact_match_rate, within_one_star_rate, mean_abs_error,
    judge_version, model_id, computed_at
  FROM lab_judge_calibrations
  ORDER BY cell_key, computed_at DESC
)
SELECT
  l.*,
  CASE WHEN l.within_one_star_rate >= 0.80 THEN 'auto' ELSE 'advisory' END AS mode
FROM latest l;

COMMIT;
