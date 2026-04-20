-- Scene-level chat (feedback before first render),
-- archive flag on iterations (soft hide, keeps lifetime rating signal),
-- structured rating reasons for training signal across listings.

ALTER TABLE prompt_lab_listing_scenes
  ADD COLUMN IF NOT EXISTS chat_messages JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE prompt_lab_listing_scene_iterations
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE prompt_lab_listing_scene_iterations
  ADD COLUMN IF NOT EXISTS rating_reasons TEXT[] NOT NULL DEFAULT '{}';
