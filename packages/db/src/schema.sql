-- Run this in Supabase SQL Editor to create all tables

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  address text not null,
  price integer not null,
  bedrooms integer not null,
  bathrooms numeric not null,
  listing_agent text not null,
  brokerage text,
  status text not null default 'queued',
  photo_count integer default 0,
  selected_photo_count integer default 0,
  total_cost_cents integer default 0,
  processing_time_ms integer,
  horizontal_video_url text,
  vertical_video_url text,
  thumbnail_url text,
  submitted_by uuid references auth.users
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties on delete cascade,
  created_at timestamptz not null default now(),
  file_url text not null,
  file_name text,
  room_type text,
  quality_score numeric,
  aesthetic_score numeric,
  depth_rating text,
  selected boolean default false,
  discard_reason text,
  key_features jsonb
);

create table if not exists scenes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties on delete cascade,
  photo_id uuid not null references photos on delete cascade,
  scene_number integer not null,
  camera_movement text not null,
  prompt text not null,
  duration_seconds numeric default 3.5,
  status text default 'pending',
  provider text,
  generation_cost_cents integer,
  generation_time_ms integer,
  clip_url text,
  attempt_count integer default 0,
  qc_verdict text,
  qc_issues jsonb,
  qc_confidence numeric
);

create table if not exists pipeline_logs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties on delete cascade,
  scene_id uuid references scenes on delete cascade,
  created_at timestamptz not null default now(),
  stage text not null,
  level text default 'info',
  message text not null,
  metadata jsonb
);

create table if not exists daily_stats (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  properties_completed integer default 0,
  properties_failed integer default 0,
  total_clips_generated integer default 0,
  total_retries integer default 0,
  total_cost_cents integer default 0,
  avg_processing_time_ms integer,
  avg_cost_per_video_cents integer
);

-- Indexes for dashboard queries
create index if not exists idx_properties_status on properties (status);
create index if not exists idx_properties_created on properties (created_at desc);
create index if not exists idx_photos_property on photos (property_id);
create index if not exists idx_scenes_property on scenes (property_id);
create index if not exists idx_scenes_status on scenes (status);
create index if not exists idx_logs_property on pipeline_logs (property_id);
create index if not exists idx_logs_created on pipeline_logs (created_at desc);
create index if not exists idx_logs_stage on pipeline_logs (stage);

-- Enable realtime for dashboard
alter publication supabase_realtime add table properties;
alter publication supabase_realtime add table scenes;
alter publication supabase_realtime add table pipeline_logs;
