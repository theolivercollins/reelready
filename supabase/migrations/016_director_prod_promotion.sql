-- Lab → production promotion for DIRECTOR_SYSTEM (and any future
-- lab_prompt_overrides body). The Lab already ships overrides used by
-- `resolveDirectorSystem` in Lab calls, but production's pipeline
-- reads the literal DIRECTOR_SYSTEM constant and ignores overrides.
--
-- This migration adds the audit columns needed to promote a stabilized
-- override into production's `prompt_revisions` log so the next
-- pipeline run picks it up via `recordPromptRevisionIfChanged`. The
-- actual "write DIRECTOR_SYSTEM body to disk" step is handled by the
-- api endpoint in `api/admin/prompt-lab/promote-to-prod.ts`; this
-- migration only records that the promotion happened.
--
-- 2026-04-19

begin;

-- Promotion audit columns on the override row.
alter table public.lab_prompt_overrides
  add column if not exists promoted_to_prod_at timestamptz,
  add column if not exists promoted_to_prod_by uuid references auth.users(id),
  add column if not exists promoted_prompt_revision_id uuid,
  add column if not exists promotion_note text;

-- Stats snapshot column so the promotion endpoint can persist "this
-- override was promoted after N renders, avg rating X" without having
-- to re-query the rating data on every UI render.
alter table public.lab_prompt_overrides
  add column if not exists cohort_stats jsonb;

-- Readiness threshold tracker — computed lazily, but the UI needs a
-- quick way to see whether an override has enough signal to justify
-- promotion. 10 renders at avg ≥ 4 is the baseline.
create or replace view public.lab_prompt_override_readiness as
with active as (
  select * from public.lab_prompt_overrides where is_active
),
cohort as (
  select
    o.id as override_id,
    o.prompt_name,
    o.body,
    o.body_hash,
    o.created_at as override_created_at,
    count(i.*) filter (where i.rating is not null) as rated_count,
    avg(i.rating::numeric) filter (where i.rating is not null) as avg_rating,
    count(i.*) filter (where i.rating >= 4) as winners,
    count(i.*) filter (where i.rating <= 2) as losers,
    count(i.*) filter (where i.clip_url is not null) as rendered_count
  from active o
  left join public.prompt_lab_iterations i
    on i.director_prompt_hash = o.body_hash
    and i.created_at >= o.created_at
  group by o.id, o.prompt_name, o.body, o.body_hash, o.created_at
)
select
  *,
  (rendered_count >= 10 and coalesce(avg_rating, 0) >= 4.0 and winners >= 2 * losers)
    as ready_for_promotion
from cohort;

grant select on public.lab_prompt_override_readiness to authenticated, service_role;

-- Audit column on prompt_revisions so production can tell at a glance
-- which revisions came from a Lab-promoted override vs. a hand-edit.
alter table public.prompt_revisions
  add column if not exists source text,
  add column if not exists source_override_id uuid references public.lab_prompt_overrides(id) on delete set null;

commit;
