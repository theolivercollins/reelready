alter table public.prompt_lab_sessions add column if not exists archived boolean not null default false;
