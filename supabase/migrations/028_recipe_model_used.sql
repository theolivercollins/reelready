-- M.2d: Add model_used to prompt_lab_recipes so SKU-level rating signal
-- propagates into future director decisions instead of generalizing to the
-- provider family ("kling" / "runway"). Backfill from source iteration's
-- model_used where resolvable. Extend match_rated_examples and
-- match_loser_examples to project model_used per branch so the director
-- sees [5★ · kitchen · push_in · kling-v2-6-pro] instead of [5★ · kitchen
-- · push_in · kling].
--
-- Branches preserved from the pre-existing definitions:
--   (1) Legacy lab iterations  → prompt_lab_iterations (has `provider`,
--       no model_used). Map provider → canonical model_used string.
--   (2) Prod scene_ratings denorm view (from migration 014) — rated_*
--       columns plus scenes/photos fallback. Map rated_provider → model.
--   (3) Phase 2.8 listing iterations — prompt_lab_listing_scene_iterations
--       carries model_used natively; project it directly.
--
-- Legacy Kling renders pre-date the SKU fanout — they all went through the
-- v2.0 native endpoint. Map provider='kling' → 'kling-v2-native' so
-- retrieval no longer shows a generic "kling" label.

ALTER TABLE prompt_lab_recipes ADD COLUMN IF NOT EXISTS model_used text;

-- Backfill from Phase 2.8 listing iterations (source_iteration_id may
-- reference prompt_lab_listing_scene_iterations directly).
UPDATE prompt_lab_recipes r
SET model_used = i.model_used
FROM prompt_lab_listing_scene_iterations i
WHERE r.source_iteration_id = i.id
  AND r.model_used IS NULL;

-- Legacy Lab iterations don't have model_used — map provider → canonical
-- SKU so retrieval never sees NULL.
UPDATE prompt_lab_recipes r
SET model_used = CASE li.provider
  WHEN 'kling' THEN 'kling-v2-native'
  WHEN 'runway' THEN 'runway'
  WHEN 'luma' THEN 'luma'
  ELSE NULL
END
FROM prompt_lab_iterations li
WHERE r.source_iteration_id = li.id
  AND r.model_used IS NULL
  AND li.provider IS NOT NULL;

-- Return-type changes require DROP before CREATE (Postgres rejects
-- CREATE OR REPLACE when OUT parameters differ, even if name/args match).
DROP FUNCTION IF EXISTS public.match_rated_examples(vector, int, int);
DROP FUNCTION IF EXISTS public.match_loser_examples(vector, int, int);

-- ---------------------------------------------------------------------
-- match_rated_examples — winners (rating >= min_rating, 5★ boost preserved)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.match_rated_examples(
  query_embedding vector(1536),
  min_rating int DEFAULT 4,
  match_count int DEFAULT 5
)
RETURNS TABLE(
  source text,
  example_id uuid,
  rating int,
  analysis_json jsonb,
  director_output_json jsonb,
  prompt text,
  camera_movement text,
  model_used text,
  clip_url text,
  tags text[],
  comment text,
  refinement text,
  distance float
) AS $$
  WITH lab AS (
    SELECT
      'lab'::text AS source,
      i.id AS example_id,
      i.rating,
      i.analysis_json,
      i.director_output_json,
      NULL::text AS prompt,
      NULL::text AS camera_movement,
      CASE i.provider
        WHEN 'kling' THEN 'kling-v2-native'
        WHEN 'runway' THEN 'runway'
        WHEN 'luma' THEN 'luma'
        ELSE NULL
      END AS model_used,
      i.clip_url,
      i.tags,
      i.user_comment AS comment,
      i.refinement_instruction AS refinement,
      (i.embedding <=> query_embedding) * CASE WHEN i.rating = 5 THEN 0.85 ELSE 1.0 END AS distance
    FROM public.prompt_lab_iterations i
    WHERE i.embedding IS NOT NULL
      AND i.rating IS NOT NULL
      AND i.rating >= min_rating
  ),
  prod AS (
    SELECT
      'prod'::text AS source,
      r.id AS example_id,
      r.rating,
      jsonb_build_object(
        'room_type', COALESCE(r.rated_room_type, p.room_type),
        'key_features', COALESCE(r.rated_photo_key_features, p.key_features),
        'composition', COALESCE(r.rated_composition, p.composition),
        'aesthetic_score', COALESCE(r.rated_aesthetic_score, p.aesthetic_score),
        'depth_rating', COALESCE(r.rated_depth_rating, p.depth_rating),
        'suggested_motion', p.suggested_motion,
        'motion_rationale', p.motion_rationale,
        'video_viable', p.video_viable
      ) AS analysis_json,
      jsonb_build_object(
        'scene_number', s.scene_number,
        'camera_movement', COALESCE(r.rated_camera_movement, s.camera_movement::text),
        'prompt', COALESCE(r.rated_prompt, s.prompt),
        'duration_seconds', COALESCE(r.rated_duration_seconds, s.duration_seconds),
        'provider_preference', COALESCE(r.rated_provider, s.provider)
      ) AS director_output_json,
      COALESCE(r.rated_prompt, s.prompt) AS prompt,
      COALESCE(r.rated_camera_movement, s.camera_movement::text) AS camera_movement,
      CASE COALESCE(r.rated_provider, s.provider)
        WHEN 'kling' THEN 'kling-v2-native'
        WHEN 'runway' THEN 'runway'
        WHEN 'luma' THEN 'luma'
        ELSE NULL
      END AS model_used,
      COALESCE(r.rated_clip_url, s.clip_url) AS clip_url,
      r.tags,
      r.comment,
      NULL::text AS refinement,
      (COALESCE(r.rated_embedding, s.embedding) <=> query_embedding) * CASE WHEN r.rating = 5 THEN 0.85 ELSE 1.0 END AS distance
    FROM public.scene_ratings r
    LEFT JOIN public.scenes s ON s.id = r.scene_id
    LEFT JOIN public.photos p ON p.id = s.photo_id
    WHERE r.rating >= min_rating
      AND COALESCE(r.rated_embedding, s.embedding) IS NOT NULL
  ),
  listing AS (
    SELECT
      'listing'::text AS source,
      i.id AS example_id,
      i.rating,
      NULL::jsonb AS analysis_json,
      NULL::jsonb AS director_output_json,
      i.director_prompt AS prompt,
      sc.camera_movement::text AS camera_movement,
      i.model_used,
      i.clip_url,
      i.tags,
      i.user_comment AS comment,
      NULL::text AS refinement,
      (i.embedding <=> query_embedding) * CASE WHEN i.rating = 5 THEN 0.85 ELSE 1.0 END AS distance
    FROM public.prompt_lab_listing_scene_iterations i
    JOIN public.prompt_lab_listing_scenes sc ON sc.id = i.scene_id
    WHERE i.embedding IS NOT NULL
      AND i.rating IS NOT NULL
      AND i.rating >= min_rating
      AND NOT COALESCE(i.archived, false)
  )
  SELECT * FROM lab
  UNION ALL SELECT * FROM prod
  UNION ALL SELECT * FROM listing
  ORDER BY distance ASC
  LIMIT match_count;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- match_loser_examples — losers (rating <= max_rating). No 5★ boost since
-- this only surfaces low-rated examples.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.match_loser_examples(
  query_embedding vector(1536),
  max_rating int DEFAULT 2,
  match_count int DEFAULT 3
)
RETURNS TABLE(
  source text,
  example_id uuid,
  rating int,
  analysis_json jsonb,
  director_output_json jsonb,
  prompt text,
  camera_movement text,
  model_used text,
  clip_url text,
  tags text[],
  comment text,
  refinement text,
  distance float
) AS $$
  WITH lab AS (
    SELECT
      'lab'::text AS source,
      i.id AS example_id,
      i.rating,
      i.analysis_json,
      i.director_output_json,
      NULL::text AS prompt,
      NULL::text AS camera_movement,
      CASE i.provider
        WHEN 'kling' THEN 'kling-v2-native'
        WHEN 'runway' THEN 'runway'
        WHEN 'luma' THEN 'luma'
        ELSE NULL
      END AS model_used,
      i.clip_url,
      i.tags,
      i.user_comment AS comment,
      i.refinement_instruction AS refinement,
      (i.embedding <=> query_embedding) AS distance
    FROM public.prompt_lab_iterations i
    WHERE i.embedding IS NOT NULL
      AND i.rating IS NOT NULL
      AND i.rating <= max_rating
  ),
  prod AS (
    SELECT
      'prod'::text AS source,
      r.id AS example_id,
      r.rating,
      jsonb_build_object(
        'room_type', COALESCE(r.rated_room_type, p.room_type),
        'key_features', COALESCE(r.rated_photo_key_features, p.key_features),
        'composition', COALESCE(r.rated_composition, p.composition),
        'aesthetic_score', COALESCE(r.rated_aesthetic_score, p.aesthetic_score),
        'depth_rating', COALESCE(r.rated_depth_rating, p.depth_rating),
        'suggested_motion', p.suggested_motion,
        'motion_rationale', p.motion_rationale,
        'video_viable', p.video_viable
      ) AS analysis_json,
      jsonb_build_object(
        'scene_number', s.scene_number,
        'camera_movement', COALESCE(r.rated_camera_movement, s.camera_movement::text),
        'prompt', COALESCE(r.rated_prompt, s.prompt),
        'duration_seconds', COALESCE(r.rated_duration_seconds, s.duration_seconds),
        'provider_preference', COALESCE(r.rated_provider, s.provider)
      ) AS director_output_json,
      COALESCE(r.rated_prompt, s.prompt) AS prompt,
      COALESCE(r.rated_camera_movement, s.camera_movement::text) AS camera_movement,
      CASE COALESCE(r.rated_provider, s.provider)
        WHEN 'kling' THEN 'kling-v2-native'
        WHEN 'runway' THEN 'runway'
        WHEN 'luma' THEN 'luma'
        ELSE NULL
      END AS model_used,
      COALESCE(r.rated_clip_url, s.clip_url) AS clip_url,
      r.tags,
      r.comment,
      NULL::text AS refinement,
      (COALESCE(r.rated_embedding, s.embedding) <=> query_embedding) AS distance
    FROM public.scene_ratings r
    LEFT JOIN public.scenes s ON s.id = r.scene_id
    LEFT JOIN public.photos p ON p.id = s.photo_id
    WHERE r.rating <= max_rating
      AND COALESCE(r.rated_embedding, s.embedding) IS NOT NULL
  ),
  listing AS (
    SELECT
      'listing'::text AS source,
      i.id AS example_id,
      i.rating,
      NULL::jsonb AS analysis_json,
      NULL::jsonb AS director_output_json,
      i.director_prompt AS prompt,
      sc.camera_movement::text AS camera_movement,
      i.model_used,
      i.clip_url,
      i.tags,
      i.user_comment AS comment,
      NULL::text AS refinement,
      (i.embedding <=> query_embedding) AS distance
    FROM public.prompt_lab_listing_scene_iterations i
    JOIN public.prompt_lab_listing_scenes sc ON sc.id = i.scene_id
    WHERE i.embedding IS NOT NULL
      AND i.rating IS NOT NULL
      AND i.rating <= max_rating
      AND NOT COALESCE(i.archived, false)
  )
  SELECT * FROM lab
  UNION ALL SELECT * FROM prod
  UNION ALL SELECT * FROM listing
  ORDER BY distance ASC
  LIMIT match_count;
$$ LANGUAGE sql STABLE;
