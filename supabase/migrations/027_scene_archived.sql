-- Scene-level archive flag. Users want to hide planned or rendered
-- scenes they're no longer interested in, without losing their
-- iterations or rating signal. The ShotPlanTable filters archived
-- out by default; Render-all and Re-direct skip them.

ALTER TABLE prompt_lab_listing_scenes
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
