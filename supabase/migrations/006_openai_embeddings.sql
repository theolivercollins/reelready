-- Swap back from Voyage voyage-3 (1024) to OpenAI text-embedding-3-small
-- (1536). Safe — no rows had embeddings yet. Rebuild indexes + RPCs.

DROP INDEX IF EXISTS idx_prompt_lab_iterations_embedding;
DROP INDEX IF EXISTS idx_recipes_embedding;

ALTER TABLE public.prompt_lab_iterations
  ALTER COLUMN embedding TYPE vector(1536);

ALTER TABLE public.prompt_lab_recipes
  ALTER COLUMN embedding TYPE vector(1536);

CREATE INDEX idx_prompt_lab_iterations_embedding
  ON public.prompt_lab_iterations USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_recipes_embedding
  ON public.prompt_lab_recipes USING hnsw (embedding vector_cosine_ops);

DROP FUNCTION IF EXISTS public.match_lab_iterations(vector, int, int);
DROP FUNCTION IF EXISTS public.match_lab_recipes(vector, text, float, int);

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
    (i.embedding <=> query_embedding) AS distance
  FROM public.prompt_lab_iterations i
  WHERE i.embedding IS NOT NULL AND i.rating IS NOT NULL AND i.rating >= min_rating
  ORDER BY i.embedding <=> query_embedding LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_lab_recipes(
  query_embedding vector(1536),
  room_type_filter text DEFAULT NULL,
  distance_threshold float DEFAULT 0.35,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid, archetype text, room_type text, camera_movement text, provider text,
  composition_signature jsonb, prompt_template text, times_applied int, distance float
)
LANGUAGE sql STABLE AS $$
  SELECT r.id, r.archetype, r.room_type, r.camera_movement, r.provider,
    r.composition_signature, r.prompt_template, r.times_applied,
    (r.embedding <=> query_embedding) AS distance
  FROM public.prompt_lab_recipes r
  WHERE r.embedding IS NOT NULL AND r.status = 'active'
    AND (room_type_filter IS NULL OR r.room_type = room_type_filter)
    AND (r.embedding <=> query_embedding) < distance_threshold
  ORDER BY r.embedding <=> query_embedding LIMIT match_count;
$$;
