-- Unified embeddings: scene embedding column + pooled retrieval RPC
-- 2026-04-15

-- 1. Add embedding to scenes for unified retrieval
alter table public.scenes
  add column if not exists embedding vector(1536),
  add column if not exists embedding_model text;

create index if not exists scenes_embedding_hnsw
  on public.scenes using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where embedding is not null;

-- 2. Unified retrieval RPC: pool Lab iterations + rated production scenes.
-- Returns top-N examples ordered by rating-weighted cosine distance.
-- Weighting: 5-star entries treated as ~15% closer than 4-star.
create or replace function public.match_rated_examples(
  query_embedding vector(1536),
  min_rating int default 4,
  match_count int default 5
)
returns table (
  source text,
  example_id uuid,
  rating int,
  analysis_json jsonb,
  director_output_json jsonb,
  prompt text,
  camera_movement text,
  clip_url text,
  distance float
)
language sql stable as $$
  with lab as (
    select
      'lab'::text as source,
      i.id as example_id,
      i.rating,
      i.analysis_json,
      i.director_output_json,
      null::text as prompt,
      null::text as camera_movement,
      i.clip_url,
      (i.embedding <=> query_embedding) * case when i.rating = 5 then 0.85 else 1.0 end as distance
    from public.prompt_lab_iterations i
    where i.embedding is not null
      and i.rating is not null
      and i.rating >= min_rating
  ),
  prod as (
    select
      'prod'::text as source,
      s.id as example_id,
      r.rating,
      jsonb_build_object(
        'room_type', p.room_type,
        'key_features', p.key_features,
        'composition', p.composition,
        'aesthetic_score', p.aesthetic_score,
        'depth_rating', p.depth_rating,
        'suggested_motion', p.suggested_motion,
        'motion_rationale', p.motion_rationale,
        'video_viable', p.video_viable
      ) as analysis_json,
      jsonb_build_object(
        'scene_number', s.scene_number,
        'camera_movement', s.camera_movement,
        'prompt', s.prompt,
        'duration_seconds', s.duration_seconds,
        'provider_preference', s.provider
      ) as director_output_json,
      s.prompt,
      s.camera_movement::text,
      s.clip_url,
      (s.embedding <=> query_embedding) * case when r.rating = 5 then 0.85 else 1.0 end as distance
    from public.scenes s
    join public.scene_ratings r on r.scene_id = s.id
    join public.photos p on p.id = s.photo_id
    where s.embedding is not null
      and r.rating >= min_rating
  )
  select * from lab
  union all
  select * from prod
  order by distance asc
  limit match_count;
$$;

grant execute on function public.match_rated_examples(vector, int, int) to authenticated, service_role;
