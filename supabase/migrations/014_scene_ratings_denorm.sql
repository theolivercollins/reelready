-- Denormalize scene_ratings so a rerun that deletes scenes does NOT cascade
-- the rating row or strip the training signal. Before this migration, a
-- rerun of property X wiped every admin rating on that property's scenes
-- because scenes.id was the FK + ON DELETE CASCADE.
--
-- Strategy:
--   1. Add denormalized columns that duplicate the rated context
--      (prompt, camera_movement, room_type, provider, photo features,
--      composition, aesthetic_score, depth_rating, embedding) at the time
--      of rating. These are the columns the unified retrieval RPCs join
--      against.
--   2. Backfill existing rows from scenes + photos.
--   3. Switch the FK to ON DELETE SET NULL so ratings survive a rerun.
--   4. Update match_rated_examples + match_loser_examples so production
--      rows are served from the denormalized columns when the original
--      scene is gone (or when the scene still exists, prefer the live
--      columns so an edited prompt shows the current text).
--
-- After this migration, Oliver's "lost 7+ ratings to rerun" bug is fixed:
-- the rating survives with all the context the director needs to learn
-- from.
-- 2026-04-19

begin;

-- 1. Add denormalized columns.
alter table public.scene_ratings
  add column if not exists rated_prompt text,
  add column if not exists rated_camera_movement text,
  add column if not exists rated_room_type text,
  add column if not exists rated_provider text,
  add column if not exists rated_photo_key_features text[],
  add column if not exists rated_composition text,
  add column if not exists rated_aesthetic_score int,
  add column if not exists rated_depth_rating text,
  add column if not exists rated_duration_seconds int,
  add column if not exists rated_clip_url text,
  add column if not exists rated_embedding vector(1536),
  add column if not exists rated_embedding_model text,
  add column if not exists rated_snapshot_at timestamptz;

-- 2. Backfill from the current join. For every existing rating whose scene
--    still exists, copy the live context into the denormalized columns.
update public.scene_ratings r
set
  rated_prompt = s.prompt,
  rated_camera_movement = s.camera_movement::text,
  rated_room_type = p.room_type,
  rated_provider = s.provider,
  rated_photo_key_features = p.key_features,
  rated_composition = p.composition,
  rated_aesthetic_score = p.aesthetic_score,
  rated_depth_rating = p.depth_rating,
  rated_duration_seconds = s.duration_seconds,
  rated_clip_url = s.clip_url,
  rated_embedding = s.embedding,
  rated_embedding_model = s.embedding_model,
  rated_snapshot_at = coalesce(r.updated_at, r.created_at)
from public.scenes s
join public.photos p on p.id = s.photo_id
where r.scene_id = s.id
  and r.rated_snapshot_at is null;

-- 3. HNSW index on the denormalized embedding so retrieval works even when
--    the source scene row has been deleted.
create index if not exists scene_ratings_rated_embedding_hnsw
  on public.scene_ratings using hnsw (rated_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where rated_embedding is not null;

-- 4. Flip the FK to ON DELETE SET NULL. We have to drop + re-add; Postgres
--    does not support altering the action clause in place.
do $$
declare
  fk_name text;
begin
  select con.conname into fk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'scene_ratings'
    and con.contype = 'f'
    and exists (
      select 1
      from pg_attribute att
      where att.attrelid = con.conrelid
        and att.attnum = any(con.conkey)
        and att.attname = 'scene_id'
    );
  if fk_name is not null then
    execute format('alter table public.scene_ratings drop constraint %I', fk_name);
  end if;
end$$;

alter table public.scene_ratings
  alter column scene_id drop not null;

alter table public.scene_ratings
  add constraint scene_ratings_scene_id_fkey
  foreign key (scene_id)
  references public.scenes(id)
  on delete set null;

-- 5. Same fix for property_id — a rerun can orphan the property too if we
--    ever wipe a full property record, so don't lose the rating.
do $$
declare
  fk_name text;
begin
  select con.conname into fk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'scene_ratings'
    and con.contype = 'f'
    and exists (
      select 1
      from pg_attribute att
      where att.attrelid = con.conrelid
        and att.attnum = any(con.conkey)
        and att.attname = 'property_id'
    );
  if fk_name is not null then
    execute format('alter table public.scene_ratings drop constraint %I', fk_name);
  end if;
end$$;

alter table public.scene_ratings
  alter column property_id drop not null;

alter table public.scene_ratings
  add constraint scene_ratings_property_id_fkey
  foreign key (property_id)
  references public.properties(id)
  on delete set null;

-- 6. Rebuild the unified retrieval RPCs to read production examples from
--    the denormalized columns first, falling back to the live join only
--    when the denorm columns are null (legacy rows pre-backfill).
--
--    This is what lets a 5★ rating survive property rerun: match_rated_examples
--    now reads r.rated_prompt + r.rated_embedding directly, so the join to
--    scenes is no longer required for the row to return.
drop function if exists public.match_rated_examples(vector, int, int);

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
  tags text[],
  comment text,
  refinement text,
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
      i.tags,
      i.user_comment as comment,
      i.refinement_instruction as refinement,
      (i.embedding <=> query_embedding) * case when i.rating = 5 then 0.85 else 1.0 end as distance
    from public.prompt_lab_iterations i
    where i.embedding is not null
      and i.rating is not null
      and i.rating >= min_rating
  ),
  prod as (
    select
      'prod'::text as source,
      r.id as example_id,
      r.rating,
      jsonb_build_object(
        'room_type', coalesce(r.rated_room_type, p.room_type),
        'key_features', coalesce(r.rated_photo_key_features, p.key_features),
        'composition', coalesce(r.rated_composition, p.composition),
        'aesthetic_score', coalesce(r.rated_aesthetic_score, p.aesthetic_score),
        'depth_rating', coalesce(r.rated_depth_rating, p.depth_rating),
        'suggested_motion', p.suggested_motion,
        'motion_rationale', p.motion_rationale,
        'video_viable', p.video_viable
      ) as analysis_json,
      jsonb_build_object(
        'scene_number', s.scene_number,
        'camera_movement', coalesce(r.rated_camera_movement, s.camera_movement::text),
        'prompt', coalesce(r.rated_prompt, s.prompt),
        'duration_seconds', coalesce(r.rated_duration_seconds, s.duration_seconds),
        'provider_preference', coalesce(r.rated_provider, s.provider)
      ) as director_output_json,
      coalesce(r.rated_prompt, s.prompt) as prompt,
      coalesce(r.rated_camera_movement, s.camera_movement::text) as camera_movement,
      coalesce(r.rated_clip_url, s.clip_url) as clip_url,
      r.tags,
      r.comment,
      null::text as refinement,
      (coalesce(r.rated_embedding, s.embedding) <=> query_embedding)
        * case when r.rating = 5 then 0.85 else 1.0 end as distance
    from public.scene_ratings r
    left join public.scenes s on s.id = r.scene_id
    left join public.photos p on p.id = s.photo_id
    where r.rating >= min_rating
      and coalesce(r.rated_embedding, s.embedding) is not null
  )
  select * from lab
  union all
  select * from prod
  order by distance asc
  limit match_count;
$$;

grant execute on function public.match_rated_examples(vector, int, int) to authenticated, service_role;

drop function if exists public.match_loser_examples(vector, int, int);

create or replace function public.match_loser_examples(
  query_embedding vector(1536),
  max_rating int default 2,
  match_count int default 3
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
  tags text[],
  comment text,
  refinement text,
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
      i.tags,
      i.user_comment as comment,
      i.refinement_instruction as refinement,
      (i.embedding <=> query_embedding) as distance
    from public.prompt_lab_iterations i
    where i.embedding is not null
      and i.rating is not null
      and i.rating <= max_rating
  ),
  prod as (
    select
      'prod'::text as source,
      r.id as example_id,
      r.rating,
      jsonb_build_object(
        'room_type', coalesce(r.rated_room_type, p.room_type),
        'key_features', coalesce(r.rated_photo_key_features, p.key_features),
        'composition', coalesce(r.rated_composition, p.composition),
        'aesthetic_score', coalesce(r.rated_aesthetic_score, p.aesthetic_score),
        'depth_rating', coalesce(r.rated_depth_rating, p.depth_rating),
        'suggested_motion', p.suggested_motion,
        'motion_rationale', p.motion_rationale,
        'video_viable', p.video_viable
      ) as analysis_json,
      jsonb_build_object(
        'scene_number', s.scene_number,
        'camera_movement', coalesce(r.rated_camera_movement, s.camera_movement::text),
        'prompt', coalesce(r.rated_prompt, s.prompt),
        'duration_seconds', coalesce(r.rated_duration_seconds, s.duration_seconds),
        'provider_preference', coalesce(r.rated_provider, s.provider)
      ) as director_output_json,
      coalesce(r.rated_prompt, s.prompt) as prompt,
      coalesce(r.rated_camera_movement, s.camera_movement::text) as camera_movement,
      coalesce(r.rated_clip_url, s.clip_url) as clip_url,
      r.tags,
      r.comment,
      null::text as refinement,
      (coalesce(r.rated_embedding, s.embedding) <=> query_embedding) as distance
    from public.scene_ratings r
    left join public.scenes s on s.id = r.scene_id
    left join public.photos p on p.id = s.photo_id
    where r.rating <= max_rating
      and coalesce(r.rated_embedding, s.embedding) is not null
  )
  select * from lab
  union all
  select * from prod
  order by distance asc
  limit match_count;
$$;

grant execute on function public.match_loser_examples(vector, int, int) to authenticated, service_role;

commit;
