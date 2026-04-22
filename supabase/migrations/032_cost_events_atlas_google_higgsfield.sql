-- Widen cost_events.provider CHECK to match the TypeScript recordCostEvent
-- signature in lib/db.ts. Without this, the atlas Lab cost_events emitted
-- by P1 Task 10 (finalizeLabRender) silently fail the CHECK and get
-- swallowed by the try/catch wrapper — breaking the "cost tracking is
-- first-class" policy.
--
-- Also adds 'google' (Gemini judge — P2) and 'higgsfield' (already in the
-- TypeScript type) so the next two phases don't need another widening.
--
-- Pattern matches migration 017; idempotent drop-and-readd.
-- 2026-04-22

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
  check (provider in (
    'anthropic',
    'runway',
    'kling',
    'luma',
    'shotstack',
    'openai',
    'atlas',
    'google',
    'higgsfield'
  ));

commit;
