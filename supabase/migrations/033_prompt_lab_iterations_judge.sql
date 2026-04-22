-- P2 — Gemini auto-judge columns + calibration-examples table.
-- Design: `docs/state/JUDGE-RUBRIC-V1.md` on branch session/p2-rubric-design.
-- Pre-cooked 2026-04-22 on branch session/p2-s1-implementation-draft.
-- Not applied. Not wired to a live endpoint yet. P2 Session 1 (2026-04-23)
-- handles enablement behind the JUDGE_ENABLED env flag.

-- Judge result columns on prompt_lab_iterations.
ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS judge_rating_json jsonb;

ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS judge_rating_overall integer
    CHECK (judge_rating_overall IS NULL OR (judge_rating_overall >= 1 AND judge_rating_overall <= 5));

ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS judge_rated_at timestamptz;

ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS judge_model text;

ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS judge_version text;

ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS judge_error text;

ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS judge_cost_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN prompt_lab_iterations.judge_rating_json IS
  'Full Gemini rubric JSON output: { motion_faithfulness, geometry_coherence,
   room_consistency, hallucination_flags[], confidence, reasoning, overall }.
   Schema validated by lib/prompts/judge-rubric.ts::validateJudgeOutput.';

COMMENT ON COLUMN prompt_lab_iterations.judge_rating_overall IS
  'Aggregate 1-5 derived from the 5 axes per rubric formula. Indexed for
   dashboard queries without needing to unpack jsonb.';

COMMENT ON COLUMN prompt_lab_iterations.judge_version IS
  'Rubric version e.g. "v1.0". Major bump on axis/schema breaks; re-baselines.';

CREATE INDEX IF NOT EXISTS idx_prompt_lab_iterations_judge_rating_overall
  ON prompt_lab_iterations (judge_rating_overall)
  WHERE judge_rating_overall IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prompt_lab_iterations_judge_model
  ON prompt_lab_iterations (judge_model, judge_version)
  WHERE judge_model IS NOT NULL;

-- Calibration examples table. Seeds the judge's few-shot pool from Oliver's
-- corrections. P2 Session 2 wires the "Override" button that writes here.
CREATE TABLE IF NOT EXISTS judge_calibration_examples (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iteration_id          uuid NOT NULL REFERENCES prompt_lab_iterations(id) ON DELETE CASCADE,
  human_rating          integer CHECK (human_rating IS NULL OR (human_rating >= 1 AND human_rating <= 5)),
  judge_rating_json     jsonb,
  oliver_correction_json jsonb,
  correction_reason     text,
  room_type             text,
  camera_movement       text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_judge_calibration_examples_bucket
  ON judge_calibration_examples (room_type, camera_movement, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_judge_calibration_examples_iteration
  ON judge_calibration_examples (iteration_id);

COMMENT ON TABLE judge_calibration_examples IS
  'Few-shot pool for Gemini judge. Each row is either a seed from v0 pool
   (docs/state/JUDGE-RUBRIC-V1.md §calibration-pool) or an Oliver-override
   captured via the P2 S2 "Override" button. Judge pre-pends top-K examples
   per (room_type × camera_movement) bucket before each call.';
