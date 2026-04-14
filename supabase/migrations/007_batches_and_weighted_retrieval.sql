-- Batch grouping on sessions + rating-weighted retrieval.

ALTER TABLE public.prompt_lab_sessions
  ADD COLUMN batch_label TEXT;

CREATE INDEX idx_prompt_lab_sessions_batch ON public.prompt_lab_sessions(batch_label) WHERE batch_label IS NOT NULL;

-- Weight retrieval by rating: rating=5 effectively 15% closer than rating=4
-- for the same cosine distance. Makes 5-stars rank higher within a bucket.
DROP FUNCTION IF EXISTS public.match_lab_iterations(vector, int, int);

CREATE OR REPLACE FUNCTION public.match_lab_iterations(
  query_embedding vector(1536),
  min_rating int DEFAULT 4,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid, session_id uuid, iteration_number int,
  analysis_json jsonb, director_output_json jsonb,
  rating int, tags text[], user_comment text, refinement_instruction text,
  clip_url text, provider text, distance float
)
LANGUAGE sql STABLE AS $$
  SELECT i.id, i.session_id, i.iteration_number, i.analysis_json, i.director_output_json,
    i.rating, i.tags, i.user_comment, i.refinement_instruction, i.clip_url, i.provider,
    ((i.embedding <=> query_embedding) * (1 - (i.rating - 4) * 0.15)) AS distance
  FROM public.prompt_lab_iterations i
  WHERE i.embedding IS NOT NULL AND i.rating IS NOT NULL AND i.rating >= min_rating
  ORDER BY (i.embedding <=> query_embedding) * (1 - (i.rating - 4) * 0.15) ASC
  LIMIT match_count;
$$;

-- Dedup check for auto-promote: is there an active recipe within distance 0.2
-- of this embedding + same room_type? If yes, skip auto-promote.
CREATE OR REPLACE FUNCTION public.recipe_exists_near(
  query_embedding vector(1536),
  room_type_filter text,
  distance_threshold float DEFAULT 0.2
)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.prompt_lab_recipes
    WHERE status = 'active' AND room_type = room_type_filter
      AND embedding IS NOT NULL
      AND (embedding <=> query_embedding) < distance_threshold
  );
$$;
