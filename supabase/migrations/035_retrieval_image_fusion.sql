-- P3 Session 1: Retrieval RPCs with optional image-embedding fusion.
--
-- Adds a second query embedding (768-dim Gemini image vector) to the three
-- retrieval RPCs. When both the query image embedding and the exemplar's
-- image embedding are present, the distance is fused:
--
--   fused_distance = text_weight * text_cosine + image_weight * image_cosine
--
-- Default weights: text_weight=0.4, image_weight=0.6 (image signal preferred
-- for visual ranking tasks). When either embedding is missing, the RPC falls
-- back to text-only cosine — 100% backwards compatible with existing callers
-- that omit query_image_embedding.
--
-- Image embedding joins per branch:
--   lab     → prompt_lab_sessions.image_embedding (via i.session_id)
--   prod    → photos.image_embedding (via scenes.photo_id)
--   listing → text-only (NULL::vector(768)); prompt_lab_listing_scenes has
--             no direct photo_id; skipping join per spec note.
--
-- 5★ boost (× 0.85) on match_rated_examples preserved; applied to fused
-- distance at the end per branch.
--
-- Return columns are UNCHANGED vs migration 028 — callers that omit the new
-- optional params see identical behaviour.

-- Drop all three functions first (return-type changes require it).
DROP FUNCTION IF EXISTS public.match_rated_examples(vector, int, int);
DROP FUNCTION IF EXISTS public.match_loser_examples(vector, int, int);
DROP FUNCTION IF EXISTS public.match_lab_recipes(vector, text, float, int);

-- Also drop any pre-existing 5-param versions from earlier attempts.
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
          ELSE text_weight * (i.embedding <=> query_embedding)
             + image_weight * (s.image_embedding <=> query_image_embedding)
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
          ELSE text_weight * (COALESCE(r.rated_embedding, s.embedding) <=> query_embedding)
             + image_weight * (p.image_embedding <=> query_image_embedding)
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
        ELSE text_weight * (i.embedding <=> query_embedding)
           + image_weight * (s.image_embedding <=> query_image_embedding)
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
        ELSE text_weight * (COALESCE(r.rated_embedding, s.embedding) <=> query_embedding)
           + image_weight * (p.image_embedding <=> query_image_embedding)
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
-- Image join: source_iteration_id → prompt_lab_iterations.session_id →
--             prompt_lab_sessions.image_embedding.
-- (source_iteration_id may also reference prompt_lab_listing_scene_iterations
-- which has no session_id / image_embedding — handled by the LEFT JOIN chain;
-- those rows simply return NULL for img_emb and fall back to text-only.)
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
      ELSE text_weight * (r.embedding <=> query_embedding)
         + image_weight * (sess.image_embedding <=> query_image_embedding)
    END AS distance
  FROM public.prompt_lab_recipes r
  -- Resolve source_iteration_id → session → image_embedding.
  -- source_iteration_id may reference prompt_lab_iterations (legacy lab)
  -- or prompt_lab_listing_scene_iterations (Phase 2.8). Only lab iterations
  -- carry a session_id → image_embedding chain; listing iters fall back to
  -- text-only naturally via NULL sess.image_embedding.
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
        ELSE text_weight * (r.embedding <=> query_embedding)
           + image_weight * (sess.image_embedding <=> query_image_embedding)
      END
    ) < distance_threshold
  ORDER BY distance ASC
  LIMIT match_count;
$$;
