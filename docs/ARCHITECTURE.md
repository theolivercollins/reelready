# Architecture

## System Overview

ReelReady is a 6-stage pipeline that converts property photo sets into cinematic walkthrough videos. The frontend (Vite + React) handles photo uploads and dashboard display. The backend (Vercel Serverless Functions) orchestrates the pipeline stages. Supabase provides the database (Postgres) and file storage. Claude Sonnet handles photo analysis and scripting. Three video generation providers (Runway, Kling, Luma) produce the actual clips.

## Pipeline Stages

```
Agent uploads photos via /upload page
            │
            ▼
┌───────────────────────────┐
│  STAGE 1: Intake          │  Photos already in Supabase Storage
│  Verify >= 5 photos exist │  (uploaded by frontend via Supabase JS client)
└───────────┬───────────────┘
            ▼
┌───────────────────────────┐
│  STAGE 2: Analysis        │  Claude Sonnet vision evaluates each photo
│  Classify, score, select  │  Batches of 8 images per API call
│  10-12 photos chosen      │  Selection algorithm: required rooms + aesthetic ranking
└───────────┬───────────────┘
            ▼
┌───────────────────────────┐
│  STAGE 3: Scripting       │  Claude Sonnet plans the shot list
│  Camera movement per shot │  10-12 ordered scenes with prompts
│  Duration, mood, music    │  Provider preference per scene
└───────────┬───────────────┘
            ▼
┌───────────────────────────┐
│  STAGE 4+5: Generate + QC │  All scenes generated in parallel
│  Provider routing per room│  Each clip: generate → QC → retry if rejected
│  Up to 2 retries per clip │  Currently QC auto-passes (phase 2 pending)
│  Clips stored in Storage  │  Scenes marked needs_review after max retries
└───────────┬───────────────┘
            ▼
┌───────────────────────────┐
│  STAGE 6: Assembly        │  Currently: stores individual clips, marks complete
│  FFmpeg stitching pending │  Future: crossfade transitions, audio, text overlays
│  Sets thumbnail URL       │  Needs external FFmpeg service (no binary on Vercel)
└───────────────────────────┘
```

## Data Flow

```
Frontend (Upload page)
    │
    ├─── Upload photos to Supabase Storage (property-photos bucket)
    │    via supabase.storage.from('property-photos').upload(...)
    │
    ├─── POST /api/properties (address, price, beds, baths, agent, photoPaths)
    │    Creates property row + photo rows in Postgres
    │
    └─── POST /api/pipeline/{propertyId} (fire-and-forget, 300s timeout)
         │
         ├── Stage 2: Fetch photos from Storage URLs → send to Claude vision
         │   └── Update photos table with room_type, scores, selected flag
         │
         ├── Stage 3: Send selected photo metadata to Claude
         │   └── Insert scenes into scenes table
         │
         ├── Stage 4+5: For each scene in parallel:
         │   ├── Fetch source photo from Storage URL
         │   ├── Select provider (router.ts) based on room type
         │   ├── Submit to provider API (image-to-video)
         │   ├── Poll until complete (3s interval, 180s timeout)
         │   ├── Download clip → upload to property-videos bucket
         │   ├── Run QC (currently auto-passes)
         │   └── Update scene row with clip_url, cost, timing
         │
         └── Stage 6: Mark property as complete
             └── Set thumbnail_url, processing_time_ms

Dashboard (React)
    │
    ├─── GET /api/properties (list, paginated, filterable)
    ├─── GET /api/properties/:id (detail with photos + scenes)
    ├─── GET /api/stats/overview (today's metrics)
    ├─── GET /api/stats/daily (historical stats)
    ├─── GET /api/logs (pipeline logs, filterable)
    │
    └─── HITL actions:
         ├── POST /api/scenes/:id/approve
         ├── POST /api/scenes/:id/retry  (with new prompt)
         └── POST /api/scenes/:id/skip
```

## Supabase Schema

### properties

| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| created_at | timestamptz | Submission time |
| updated_at | timestamptz | Last status change |
| address | text | Property address |
| price | integer | Listing price in dollars |
| bedrooms | integer | Bedroom count |
| bathrooms | numeric | Bathroom count (supports 2.5) |
| listing_agent | text | Agent name |
| brokerage | text | Brokerage name (nullable) |
| status | text | queued, analyzing, scripting, generating, qc, assembling, complete, failed, needs_review |
| photo_count | integer | Total uploaded photos |
| selected_photo_count | integer | Photos selected for video |
| total_cost_cents | integer | Accumulated API costs in cents |
| processing_time_ms | integer | Total wall-clock processing time (nullable) |
| horizontal_video_url | text | Final 16:9 video URL (nullable) |
| vertical_video_url | text | Final 9:16 video URL (nullable) |
| thumbnail_url | text | Thumbnail image URL (nullable) |
| submitted_by | text | Submitter identifier (nullable) |

### photos

| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| property_id | uuid (FK) | References properties.id |
| created_at | timestamptz | Upload time |
| file_url | text | Public URL in Supabase Storage |
| file_name | text | Original filename (nullable) |
| room_type | text | Classified room type (nullable, set in Stage 2) |
| quality_score | numeric | Technical quality 1-10 (nullable) |
| aesthetic_score | numeric | Cinematic potential 1-10 (nullable) |
| depth_rating | text | high, medium, low (nullable) |
| selected | boolean | Whether photo was selected for video |
| discard_reason | text | Why photo was not selected (nullable) |
| key_features | text[] | Notable features array (nullable) |

### scenes

| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| property_id | uuid (FK) | References properties.id |
| photo_id | uuid (FK) | References photos.id |
| scene_number | integer | Order in the video (1-based) |
| camera_movement | text | orbital_slow, dolly_left_to_right, dolly_right_to_left, slow_pan, parallax, push_in, pull_out |
| prompt | text | Video generation prompt |
| duration_seconds | numeric | Target clip duration |
| status | text | pending, generating, qc_pass, qc_soft_reject, qc_hard_reject, retry_1, retry_2, failed, needs_review |
| provider | text | runway, kling, luma (nullable) |
| generation_cost_cents | integer | Cost of generation in cents (nullable) |
| generation_time_ms | integer | Generation wall-clock time (nullable) |
| clip_url | text | URL of generated clip in Storage (nullable) |
| attempt_count | integer | Number of generation attempts |
| qc_verdict | text | pass, soft_reject, hard_reject, auto_pass (nullable) |
| qc_issues | jsonb[] | Array of QC issue objects (nullable) |
| qc_confidence | numeric | QC confidence score 0-1 (nullable) |

### pipeline_logs

| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| property_id | uuid (FK) | References properties.id |
| scene_id | uuid (FK) | References scenes.id (nullable) |
| created_at | timestamptz | Log timestamp |
| stage | text | intake, analysis, scripting, generation, qc, assembly, delivery |
| level | text | info, warn, error, debug |
| message | text | Human-readable log message |
| metadata | jsonb | Structured metadata (nullable) |

### daily_stats

| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| date | date | Stats date |
| properties_completed | integer | Videos completed that day |
| properties_failed | integer | Failures that day |
| total_clips_generated | integer | Total clips generated |
| total_retries | integer | Total retry attempts |
| total_cost_cents | integer | Total API spend in cents |
| avg_processing_time_ms | integer | Average processing time (nullable) |
| avg_cost_per_video_cents | integer | Average cost per video (nullable) |

## Storage Buckets

| Bucket | Contents | Access |
|---|---|---|
| `property-photos` | Raw uploaded property photos, organized as `{tempId}/raw/{filename}` | Public read (for pipeline to fetch), public upload (for frontend) |
| `property-videos` | Generated video clips, organized as `{propertyId}/clips/scene_{N}_v{attempt}.mp4` | Public read |

## Vercel Functions

All API endpoints are Vercel Serverless Functions in the `api/` directory. Routing is configured in `vercel.json` to map URL patterns to handler files.

| Method | Path | Handler | Timeout | Description |
|---|---|---|---|---|
| GET | /api/properties | api/properties/index.ts | 10s | List properties (paginated, filterable by status/search) |
| POST | /api/properties | api/properties/index.ts | 10s | Create property + register photo records |
| GET | /api/properties/:id | api/properties/[id].ts | 10s | Property detail with photos and scenes |
| GET | /api/properties/:id/status | api/properties/[id]/status.ts | 10s | Public status for tracking page |
| POST | /api/properties/:id/rerun | api/properties/[id]/rerun.ts | 300s | Re-trigger pipeline from scratch |
| POST | /api/pipeline/:propertyId | api/pipeline/[propertyId].ts | 300s | Execute full pipeline (long-running) |
| GET | /api/scenes/:id | api/scenes/[id]/index.ts | 10s | Scene detail with associated logs |
| POST | /api/scenes/:id/approve | api/scenes/[id]/approve.ts | 10s | HITL: manually approve a scene |
| POST | /api/scenes/:id/retry | api/scenes/[id]/retry.ts | 300s | HITL: retry scene with new prompt |
| POST | /api/scenes/:id/skip | api/scenes/[id]/skip.ts | 10s | HITL: skip a scene |
| GET | /api/logs | api/logs.ts | 10s | Pipeline logs (paginated, filterable) |
| GET | /api/stats/overview | api/stats/overview.ts | 10s | Dashboard overview metrics |
| GET | /api/stats/daily | api/stats/daily.ts | 10s | Daily aggregated stats |

Functions with `maxDuration = 300` exported can run up to 300 seconds (5 minutes). This is used for the pipeline execution and scene retry endpoints.

## Provider Abstraction

All video generation providers implement the `IVideoProvider` interface:

```typescript
interface IVideoProvider {
  name: VideoProvider;
  generateClip(params: GenerateClipParams): Promise<GenerationJob>;
  checkStatus(jobId: string): Promise<GenerationResult>;
  downloadClip(videoUrl: string): Promise<Buffer>;
}
```

### Provider Routing (lib/providers/router.ts)

The router selects which provider handles each scene based on three factors, in priority order:

1. **Explicit preference** -- if the director prompt specified a `provider_preference`, use it (if that provider is enabled)
2. **Room-type routing** -- a static mapping determines the best provider per room type:
   - **Runway** (Gen-4 Turbo): exterior_front, exterior_back, aerial, other
   - **Kling** (v2 Pro): kitchen, living_room, master_bedroom, bedroom, bathroom, dining, hallway, foyer, garage
   - **Luma** (Ray2): pool
3. **Fallback order**: runway -> kling -> luma (first available)

Provider availability is determined by which API keys are configured in environment variables.

### Provider Details

| Provider | API Base | Model | Auth | Duration Range |
|---|---|---|---|---|
| Runway | api.dev.runwayml.com/v1 | gen4_turbo | Bearer token | 5-10s |
| Kling | api.klingai.com/v1 | kling-v2 (pro mode) | JWT (HMAC-SHA256) | Per-second |
| Luma | api.lumalabs.ai/dream-machine/v1 | ray2 | Bearer token | Per-second |

All providers use an async pattern: submit a generation job, then poll for completion at 3-second intervals with a 180-second timeout.

## How the Pipeline Runs

1. The frontend uploads photos directly to Supabase Storage from the browser using the anon key.
2. The frontend calls `POST /api/properties` with the property metadata and the storage paths of the uploaded photos. This creates the property and photo records in Postgres.
3. The frontend immediately fires `POST /api/pipeline/{propertyId}` as a fire-and-forget request. This Vercel Function has a 300-second timeout.
4. The pipeline function runs all 6 stages synchronously within that single function invocation. Stages 4+5 (generation + QC) process all scenes in parallel using `Promise.allSettled`.
5. The dashboard polls the API endpoints to show progress. (Supabase Realtime subscriptions are planned but not yet implemented.)
