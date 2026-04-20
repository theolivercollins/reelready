-- Iteration chat + per-scene refinement notes
-- Per-iteration conversation + per-scene accumulated directives
-- that influence the NEXT render of the same scene.

ALTER TABLE prompt_lab_listing_scene_iterations
  ADD COLUMN IF NOT EXISTS chat_messages JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE prompt_lab_listing_scenes
  ADD COLUMN IF NOT EXISTS refinement_notes TEXT;
