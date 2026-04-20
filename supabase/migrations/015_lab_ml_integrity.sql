-- Prompt Lab data integrity for the learning loop.
--
-- Three fixes, all motivated by auditing how Lab feedback is parsed
-- by the director + losers retrieval:
--
-- 1. The refiner's self-authored rationale is currently stored in
--    `prompt_lab_iterations.user_comment` with a "[refiner rationale] "
--    prefix. That column is fed back into DIRECTOR as "admin note: ..."
--    via the unified retrieval RPCs, so the model is treating Claude's
--    own explanation as if it were Oliver's feedback. Split into a
--    dedicated `refiner_rationale` column and migrate existing rows.
--
-- 2. `auto_promote` on rating=5 (rate.ts) no longer dedups by cosine
--    distance. Without a uniqueness constraint on source_iteration_id,
--    a user who clicks the 5th star twice creates two recipe rows for
--    the same iteration. Lock it down with a partial unique index so
--    the second insert is a no-op.
--
-- 3. Some early iterations had `rating` set without either an analysis
--    JSON or a director output — those poison the mining bucket stats.
--    Add a guard view for "complete" iterations so downstream code can
--    opt in without re-implementing the filter.
--
-- 2026-04-19

begin;

-- 1. Split refiner rationale from user_comment.
alter table public.prompt_lab_iterations
  add column if not exists refiner_rationale text;

update public.prompt_lab_iterations
set
  refiner_rationale = substring(user_comment from 21),
  user_comment = null
where user_comment is not null
  and refiner_rationale is null
  and user_comment like '[refiner rationale] %';

-- 2. Dedup recipes by source iteration. Partial unique index — allows
--    many NULL source_iteration_ids (manual recipes built from scratch)
--    but at most one recipe per iteration.
create unique index if not exists prompt_lab_recipes_source_iteration_unique
  on public.prompt_lab_recipes (source_iteration_id)
  where source_iteration_id is not null and status = 'active';

-- 3. Convenience view: iterations that are actually usable for learning.
--    Mining, retrieval, and proposal evidence should prefer this view so
--    half-built iterations don't contaminate bucket averages.
create or replace view public.prompt_lab_iterations_complete as
  select *
  from public.prompt_lab_iterations
  where analysis_json is not null
    and director_output_json is not null
    and (
      analysis_json ? 'room_type'
      or (analysis_json ->> 'room_type') is not null
    );

grant select on public.prompt_lab_iterations_complete to authenticated, service_role;

commit;
