-- Extend Gemini auto-judge to the Listing Lab table.
-- Mirrors migration 033 (judge columns on prompt_lab_iterations) for the
-- listing-scene iteration table. Without this the Listing Lab clips never
-- get a judge rating because there's nowhere to put it.

ALTER TABLE prompt_lab_listing_scene_iterations
  ADD COLUMN IF NOT EXISTS judge_rating_json jsonb;

ALTER TABLE prompt_lab_listing_scene_iterations
  ADD COLUMN IF NOT EXISTS judge_rating_overall integer
    CHECK (judge_rating_overall IS NULL OR (judge_rating_overall >= 1 AND judge_rating_overall <= 5));

ALTER TABLE prompt_lab_listing_scene_iterations
  ADD COLUMN IF NOT EXISTS judge_rated_at timestamptz;

ALTER TABLE prompt_lab_listing_scene_iterations
  ADD COLUMN IF NOT EXISTS judge_model text;

ALTER TABLE prompt_lab_listing_scene_iterations
  ADD COLUMN IF NOT EXISTS judge_version text;

ALTER TABLE prompt_lab_listing_scene_iterations
  ADD COLUMN IF NOT EXISTS judge_error text;

ALTER TABLE prompt_lab_listing_scene_iterations
  ADD COLUMN IF NOT EXISTS judge_cost_cents integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_plsi_judge_rating_overall
  ON prompt_lab_listing_scene_iterations (judge_rating_overall)
  WHERE judge_rating_overall IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plsi_judge_model
  ON prompt_lab_listing_scene_iterations (judge_model, judge_version)
  WHERE judge_model IS NOT NULL;
