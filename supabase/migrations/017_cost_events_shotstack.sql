-- cost_events is the ledger backing the Finances + Overview dashboards.
-- It was created outside the migrations folder (pre-dates 001) and may
-- carry a CHECK constraint on `provider` that pins the allowed set to
-- anthropic/runway/kling/luma. This migration widens that set to
-- include shotstack (assembly) + openai (embeddings), which are already
-- flowing through recordCostEvent in code but would fail the check.
--
-- The DO block makes it idempotent: if no CHECK is there, nothing
-- happens; if one exists, it's dropped and re-added with the wider set.
-- 2026-04-19

begin;

do $$
declare
  con_name text;
begin
  select con.conname into con_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'cost_events'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%provider%'
  limit 1;
  if con_name is not null then
    execute format('alter table public.cost_events drop constraint %I', con_name);
  end if;
end$$;

alter table public.cost_events
  add constraint cost_events_provider_check
  check (provider in ('anthropic', 'runway', 'kling', 'luma', 'shotstack', 'openai'));

-- Also widen unit_type to permit 'renders' (Shotstack billing unit).
do $$
declare
  con_name text;
begin
  select con.conname into con_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'cost_events'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%unit_type%'
  limit 1;
  if con_name is not null then
    execute format('alter table public.cost_events drop constraint %I', con_name);
  end if;
end$$;

alter table public.cost_events
  add constraint cost_events_unit_type_check
  check (unit_type is null or unit_type in ('tokens', 'credits', 'kling_units', 'renders'));

commit;
