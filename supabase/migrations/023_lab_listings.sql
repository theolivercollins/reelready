-- Migration 023: New Prompt Lab — multi-photo listings + pair-aware
-- scenes + iterations + model-resilient intent capture.
--
-- Legacy prompt_lab_sessions + prompt_lab_iterations are UNTOUCHED —
-- they remain fully functional under the old Lab route. Ratings from
-- both old and new Labs flow to the unified v_rated_pool used by
-- director retrieval.

BEGIN;

CREATE TABLE IF NOT EXISTS prompt_lab_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_name TEXT NOT NULL DEFAULT 'kling-v3-pro',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','analyzing','directing','ready_to_render','rendering','complete','failed')),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  total_cost_cents INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_prompt_lab_listings_created_by
  ON prompt_lab_listings (created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS prompt_lab_listing_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES prompt_lab_listings(id) ON DELETE CASCADE,
  photo_index INT NOT NULL,
  image_url TEXT NOT NULL,
  image_path TEXT NOT NULL,
  analysis_json JSONB,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, photo_index)
);

CREATE INDEX IF NOT EXISTS idx_prompt_lab_listing_photos_listing
  ON prompt_lab_listing_photos (listing_id, photo_index);

CREATE TABLE IF NOT EXISTS prompt_lab_listing_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES prompt_lab_listings(id) ON DELETE CASCADE,
  scene_number INT NOT NULL,
  photo_id UUID NOT NULL REFERENCES prompt_lab_listing_photos(id) ON DELETE RESTRICT,
  end_photo_id UUID REFERENCES prompt_lab_listing_photos(id) ON DELETE SET NULL,
  end_image_url TEXT,
  room_type TEXT NOT NULL,
  camera_movement TEXT NOT NULL,
  director_prompt TEXT NOT NULL,
  director_intent JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, scene_number)
);

CREATE INDEX IF NOT EXISTS idx_lab_listing_scenes_listing
  ON prompt_lab_listing_scenes (listing_id, scene_number);

CREATE TABLE IF NOT EXISTS prompt_lab_listing_scene_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES prompt_lab_listing_scenes(id) ON DELETE CASCADE,
  iteration_number INT NOT NULL,
  director_prompt TEXT NOT NULL,
  model_used TEXT NOT NULL,
  provider_task_id TEXT,
  clip_url TEXT,
  rating INT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  tags TEXT[],
  user_comment TEXT,
  cost_cents INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','submitting','rendering','rendered','rated','failed')),
  render_error TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scene_id, iteration_number)
);

CREATE INDEX IF NOT EXISTS idx_lab_listing_iters_scene
  ON prompt_lab_listing_scene_iterations (scene_id, iteration_number);
CREATE INDEX IF NOT EXISTS idx_lab_listing_iters_rating
  ON prompt_lab_listing_scene_iterations (rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lab_listing_iters_task
  ON prompt_lab_listing_scene_iterations (provider_task_id) WHERE provider_task_id IS NOT NULL;

CREATE OR REPLACE VIEW v_rated_pool AS
SELECT
  'lab'::TEXT                                AS source,
  i.id                                       AS id,
  (i.analysis_json ->> 'room_type')          AS room_type,
  (i.director_output_json ->> 'camera_movement') AS camera_movement,
  i.rating                                   AS rating,
  i.tags                                     AS tags,
  i.created_at                               AS rated_at
FROM prompt_lab_iterations i
WHERE i.rating IS NOT NULL

UNION ALL

SELECT
  'prod'::TEXT,
  sr.id,
  sr.rated_room_type,
  sr.rated_camera_movement,
  sr.rating,
  sr.tags,
  sr.rated_snapshot_at
FROM scene_ratings sr
WHERE sr.rating IS NOT NULL
  AND sr.rated_room_type IS NOT NULL
  AND sr.rated_camera_movement IS NOT NULL

UNION ALL

SELECT
  'lab_listing'::TEXT,
  it.id,
  s.room_type,
  s.camera_movement,
  it.rating,
  it.tags,
  it.created_at
FROM prompt_lab_listing_scene_iterations it
JOIN prompt_lab_listing_scenes s ON s.id = it.scene_id
WHERE it.rating IS NOT NULL;

COMMIT;
