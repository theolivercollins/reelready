-- Migration 036: Normalize fusion weights inside retrieval RPCs.
--
-- Audit B Critical C1: match_rated_examples / match_loser_examples /
-- match_lab_recipes accepted raw text_weight + image_weight floats with no
-- sum-to-1 constraint. Inflated weights (e.g. 0.9 + 0.9 = 1.8) shift the
-- fused distance scale AND silently break match_lab_recipes's hard
-- distance < 0.35 cutoff (returns zero recipes).
--
-- Fix: DROP + CREATE with weight normalization at the top of each RPC via a
-- norm CTE. Normalized weights always sum to 1.0 regardless of caller input.
-- NULLIF guards against both-weights-zero divide-by-zero (falls through to
-- text-only in that case, same as when either embedding is NULL).
--
-- Signature is UNCHANGED — callers need no updates.

-- Drop all existing variants.
DROP FUNCTION IF EXISTS public.match_rated_examples(vector, int, int);
DROP FUNCTION IF EXISTS public.match_loser_examples(vector, int, int);
DROP FUNCTION IF EXISTS public.match_lab_recipes(vector, text, float, int);
DROP FUNCTION IF EXISTS public.match_rated_examples(vector, int, int, vector, float, float);
DROP FUNCTION IF EXISTS public.match_loser_examples(vector, int, int, vector, float, float);
DROP FUNCTION IF EXISTS public.match_lab_recipes(vector, text, float, int, vector, float, float);

-- -------------------------------------------------------------------------
-- match_rated_examples — winners (rating >= min_rating, 5★ boost preserved)
-- -------------------------------------------------------------------------
CREATE FUNCTION public.match_rated_examples(
  query_embedding       vector(1536),
  min_rating            int     DEFAULT 4,
  match_count           int     DEFAULT 5,
  query_image_embedding vector(768) DEFAULT NULL,
  text_weight           float   DEFAULT 0.4,
  image_weight          float   DEFAULT 0.6
)
RETURNS TABLE(
  source               text,
  example_id           uuid,
  rating               int,
  analysis_json        jsonb,
  director_output_json jsonb,
  prompt               text,
  camera_movement      text,
  model_used           text,
  clip_url             text,
  tags                 text[],
  comment              text,
  refinement           text,
  distance             float
) AS $$
  -- Normalize weights so they always sum to 1.0; guards against inflated
  -- env-var overrides silently breaking the distance-threshold cutoffs.
  -- NULLIF prevents divide-by-zero when both weights are 0 (falls to text-only).
  WITH norm AS (
    SELECT
      CASE WHEN NULLIF(text_weight + image_weight, 0) IS NULL THEN 1.0
           ELSE text_weight / (text_weight + image_weight) END AS w_text,
      CASE WHEN NULLIF(text_weight + image_weight, 0) IS NULL THEN 0.0
           ELSE image_weight / (text_weight + image_weight) END AS w_image
  ),
  lab AS (
    SELECT
      'lab'::text AS source,
      i.id AS example_id,
      i.rating,
      i.analysis_json,
      i.director_output_json,
      NULL::text AS prompt,
      NULL::text AS camera_movement,
      CASE i.provider
        WHEN 'kling'   THEN 'kling-v2-native'
        WHEN 'runway'  THEN 'runway'
        WHEN 'luma'    THEN 'luma'
        ELSE NULL
      END AS model_used,
      i.clip_url,
      i.tags,
      i.user_comment AS comment,
      i.refinement_instruction AS refinement,
      (
        CASE
          WHEN query_image_embedding IS NULL OR s.image_embedding IS NULL
            THEN (i.embedding <=> query_embedding)
          ELSE (SELECT w_text FROM norm) * (i.embedding <=> query_embedding)
             + (SELECT w_image FROM norm) * (s.image_embedding <=> query_image_embedding)
        END
      ) * CASE WHEN i.rating = 5 THEN 0.85 ELSE 1.0 END AS distance
    FROM public.prompt_lab_iterations i
    LEFT JOIN public.prompt_lab_sessions s ON s.id = i.session_id
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
        'room_type',        COALESCE(r.rated_room_type,          p.room_type),
        'key_features',     COALESCE(r.rated_photo_key_features, p.key_features),
        'composition',      COALESCE(r.rated_composition,        p.composition),
        'aesthetic_score',  COALESCE(r.rated_aesthetic_score,    p.aesthetic_score),
        'depth_rating',     COALESCE(r.rated_depth_rating,       p.depth_rating),
        'suggested_motion', p.suggested_motion,
        'motion_rationale', p.motion_rationale,
        'video_viable',     p.video_viable
      ) AS analysis_json,
      jsonb_build_object(
        'scene_number',       s.scene_number,
        'camera_movement',    COALESCE(r.rated_camera_movement, s.camera_movement::text),
        'prompt',             COALESCE(r.rated_prompt,          s.prompt),
        'duration_seconds',   COALESCE(r.rated_duration_seconds, s.duration_seconds),
        'provider_preference', COALESCE(r.rated_provider,       s.provider)
      ) AS director_output_json,
      COALESCE(r.rated_prompt,         s.prompt)             AS prompt,
      COALESCE(r.rated_camera_movement, s.camera_movement::text) AS camera_movement,
      CASE COALESCE(r.rated_provider, s.provider)
        WHEN 'kling'  THEN 'kling-v2-native'
        WHEN 'runway' THEN 'runway'
        WHEN 'luma'   THEN 'luma'
        ELSE NULL
      END AS model_used,
      COALESCE(r.rated_clip_url, s.clip_url) AS clip_url,
      r.tags,
      r.comment,
      NULL::text AS refinement,
      (
        CASE
          WHEN query_image_embedding IS NULL OR p.image_embedding IS NULL
            THEN (COALESCE(r.rated_embedding, s.embedding) <=> query_embedding)
          ELSE (SELECT w_text FROM norm) * (COALESCE(r.rated_embedding, s.embedding) <=> query_embedding)
             + (SELECT w_image FROM norm) * (p.image_embedding <=> query_image_embedding)
        END
      ) * CASE WHEN r.rating = 5 THEN 0.85 ELSE 1.0 END AS distance
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
      -- listing branch: no direct photo_id on prompt_lab_listing_scenes;
      -- text-only fallback. Fused ranking gap noted in audit doc.
      (i.embedding <=> query_embedding)
        * CASE WHEN i.rating = 5 THEN 0.85 ELSE 1.0 END AS distance
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

-- -------------------------------------------------------------------------
-- match_loser_examples — losers (rating <= max_rating). No 5★ boost.
-- -------------------------------------------------------------------------
CREATE FUNCTION public.match_loser_examples(
  query_embedding       vector(1536),
  max_rating            int     DEFAULT 2,
  match_count           int     DEFAULT 3,
  query_image_embedding vector(768) DEFAULT NULL,
  text_weight           float   DEFAULT 0.4,
  image_weight          float   DEFAULT 0.6
)
RETURNS TABLE(
  source               text,
  example_id           uuid,
  rating               int,
  analysis_json        jsonb,
  director_output_json jsonb,
  prompt               text,
  camera_movement      text,
  model_used           text,
  clip_url             text,
  tags                 text[],
  comment              text,
  refinement           text,
  distance             float
) AS $$
  WITH norm AS (
    SELECT
      CASE WHEN NULLIF(text_weight + image_weight, 0) IS NULL THEN 1.0
           ELSE text_weight / (text_weight + image_weight) END AS w_text,
      CASE WHEN NULLIF(text_weight + image_weight, 0) IS NULL THEN 0.0
           ELSE image_weight / (text_weight + image_weight) END AS w_image
  ),
  lab AS (
    SELECT
      'lab'::text AS source,
      i.id AS example_id,
      i.rating,
      i.analysis_json,
      i.director_output_json,
      NULL::text AS prompt,
      NULL::text AS camera_movement,
      CASE i.provider
        WHEN 'kling'   THEN 'kling-v2-native'
        WHEN 'runway'  THEN 'runway'
        WHEN 'luma'    THEN 'luma'
        ELSE NULL
      END AS model_used,
      i.clip_url,
      i.tags,
      i.user_comment AS comment,
      i.refinement_instruction AS refinement,
      CASE
        WHEN query_image_embedding IS NULL OR s.image_embedding IS NULL
          THEN (i.embedding <=> query_embedding)
        ELSE (SELECT w_text FROM norm) * (i.embedding <=> query_embedding)
           + (SELECT w_image FROM norm) * (s.image_embedding <=> query_image_embedding)
      END AS distance
    FROM public.prompt_lab_iterations i
    LEFT JOIN public.prompt_lab_sessions s ON s.id = i.session_id
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
        'room_type',        COALESCE(r.rated_room_type,          p.room_type),
        'key_features',     COALESCE(r.rated_photo_key_features, p.key_features),
        'composition',      COALESCE(r.rated_composition,        p.composition),
        'aesthetic_score',  COALESCE(r.rated_aesthetic_score,    p.aesthetic_score),
        'depth_rating',     COALESCE(r.rated_depth_rating,       p.depth_rating),
        'suggested_motion', p.suggested_motion,
        'motion_rationale', p.motion_rationale,
        'video_viable',     p.video_viable
      ) AS analysis_json,
      jsonb_build_object(
        'scene_number',       s.scene_number,
        'camera_movement',    COALESCE(r.rated_camera_movement, s.camera_movement::text),
        'prompt',             COALESCE(r.rated_prompt,          s.prompt),
        'duration_seconds',   COALESCE(r.rated_duration_seconds, s.duration_seconds),
        'provider_preference', COALESCE(r.rated_provider,       s.provider)
      ) AS director_output_json,
      COALESCE(r.rated_prompt,          s.prompt)                  AS prompt,
      COALESCE(r.rated_camera_movement, s.camera_movement::text)   AS camera_movement,
      CASE COALESCE(r.rated_provider, s.provider)
        WHEN 'kling'  THEN 'kling-v2-native'
        WHEN 'runway' THEN 'runway'
        WHEN 'luma'   THEN 'luma'
        ELSE NULL
      END AS model_used,
      COALESCE(r.rated_clip_url, s.clip_url) AS clip_url,
      r.tags,
      r.comment,
      NULL::text AS refinement,
      CASE
        WHEN query_image_embedding IS NULL OR p.image_embedding IS NULL
          THEN (COALESCE(r.rated_embedding, s.embedding) <=> query_embedding)
        ELSE (SELECT w_text FROM norm) * (COALESCE(r.rated_embedding, s.embedding) <=> query_embedding)
           + (SELECT w_image FROM norm) * (p.image_embedding <=> query_image_embedding)
      END AS distance
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
      -- listing branch: text-only fallback (no photo_id linkage).
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

-- -------------------------------------------------------------------------
-- match_lab_recipes — recipe retrieval with optional image-embedding fusion.
-- -------------------------------------------------------------------------
CREATE FUNCTION public.match_lab_recipes(
  query_embedding       vector(1536),
  room_type_filter      text    DEFAULT NULL,
  distance_threshold    float   DEFAULT 0.35,
  match_count           int     DEFAULT 3,
  query_image_embedding vector(768) DEFAULT NULL,
  text_weight           float   DEFAULT 0.4,
  image_weight          float   DEFAULT 0.6
)
RETURNS TABLE (
  id                   uuid,
  archetype            text,
  room_type            text,
  camera_movement      text,
  provider             text,
  composition_signature jsonb,
  prompt_template      text,
  times_applied        int,
  distance             float
)
LANGUAGE sql STABLE AS $$
  WITH norm AS (
    SELECT
      CASE WHEN NULLIF(text_weight + image_weight, 0) IS NULL THEN 1.0
           ELSE text_weight / (text_weight + image_weight) END AS w_text,
      CASE WHEN NULLIF(text_weight + image_weight, 0) IS NULL THEN 0.0
           ELSE image_weight / (text_weight + image_weight) END AS w_image
  )
  SELECT
    r.id,
    r.archetype,
    r.room_type,
    r.camera_movement,
    r.provider,
    r.composition_signature,
    r.prompt_template,
    r.times_applied,
    CASE
      WHEN query_image_embedding IS NULL OR sess.image_embedding IS NULL
        THEN (r.embedding <=> query_embedding)
      ELSE (SELECT w_text FROM norm) * (r.embedding <=> query_embedding)
         + (SELECT w_image FROM norm) * (sess.image_embedding <=> query_image_embedding)
    END AS distance
  FROM public.prompt_lab_recipes r
  LEFT JOIN public.prompt_lab_iterations li
    ON li.id = r.source_iteration_id
  LEFT JOIN public.prompt_lab_sessions sess
    ON sess.id = li.session_id
  WHERE r.embedding IS NOT NULL
    AND r.status = 'active'
    AND (room_type_filter IS NULL OR r.room_type = room_type_filter)
    AND (
      CASE
        WHEN query_image_embedding IS NULL OR sess.image_embedding IS NULL
          THEN (r.embedding <=> query_embedding)
        ELSE (SELECT w_text FROM norm) * (r.embedding <=> query_embedding)
           + (SELECT w_image FROM norm) * (sess.image_embedding <=> query_image_embedding)
      END
    ) < distance_threshold
  ORDER BY distance ASC
  LIMIT match_count;
$$;
