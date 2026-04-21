> **ARCHIVED — SUPERSEDED.** Moved 2026-04-21. See [../README.md](../README.md) for why and for the canonical replacement.
>
> Last updated: (original content preserved unchanged below)
>
> See also:
> - [../README.md](../README.md)
> - [../../HANDOFF.md](../../HANDOFF.md)
> - [../../state/PROJECT-STATE.md](../../state/PROJECT-STATE.md)

# ReelReady — Backend Architecture

## System Overview

The backend is a **durable workflow pipeline** that processes property photo sets into finished videos. Each property submission triggers a 6-stage pipeline that runs autonomously with <5% human intervention.

```
Agent Upload → API → Queue → Pipeline Worker → Delivery
                              │
                    ┌─────────┴─────────────┐
                    │  STAGE 1: Intake       │ Download + normalize photos
                    │  STAGE 2: Analyze      │ Vision LLM classifies + ranks
                    │  STAGE 3: Script       │ LLM generates shot plan
                    │  STAGE 4: Generate     │ Video gen APIs (parallel)
                    │  STAGE 5: QC           │ Vision LLM evaluates clips
                    │  STAGE 6: Assemble     │ FFmpeg stitch + overlay
                    └────────────────────────┘
                              │
                    Dashboard ← real-time status via Supabase Realtime
```

---

## Tech Stack

| Layer | Tech | Why |
|---|---|---|
| Frontend + Dashboard | Lovable (Next.js + Supabase) | Rapid UI iteration |
| API + Pipeline Orchestration | Node.js (TypeScript) | Single language, async-native |
| Workflow Engine | BullMQ on Redis | Durable job queue, retries, priorities, concurrency control |
| Database | Supabase (Postgres) | Real-time subscriptions for dashboard, auth built-in |
| File Storage | Supabase Storage (or S3) | Photo + video storage with signed URLs |
| Video Processing | FFmpeg | Industry standard, runs anywhere |
| Vision LLM | Claude API (claude-sonnet-4-6) | Best vision + structured output combo |
| Video Generation | Runway Gen-4 API (primary), Kling API (secondary), Luma API (fallback) | API-accessible, high quality |
| Hosting | Vercel (API routes) + Railway/Fly.io (workers) | Workers need long-running processes, not serverless |

---

## Pipeline Detail — Stage by Stage

### Stage 1: Intake & Normalization

**Trigger:** POST to `/api/properties` with photo uploads + metadata.

**Process:**
1. Validate inputs (address, price, bed/ba, agent required; 10-60 photos)
2. Insert `properties` row with status `queued`
3. Upload raw photos to Supabase Storage under `properties/{property_id}/raw/`
4. Insert `photos` rows for each uploaded file
5. Enqueue Stage 2 job in BullMQ

**Normalization worker (runs as part of Stage 2 kickoff):**
- Convert HEIC → JPEG
- Auto-orient from EXIF
- Resize to max 2048px on longest edge (balance quality vs API cost)
- Store normalized versions at `properties/{property_id}/normalized/`

**Duration:** ~2-5 seconds for 30-50 photos

---

### Stage 2: Photo Analysis & Ranking

**Process:**
1. Pull all normalized photos for the property
2. Send to Claude claude-sonnet-4-6 vision in batches of 5-8 images per request (cost optimization)
3. For each photo, extract structured JSON:

```json
{
  "room_type": "kitchen",
  "quality_score": 8.2,
  "aesthetic_score": 7.5,
  "depth_rating": "high",
  "key_features": ["granite island", "pendant lighting", "open concept"],
  "suggested_discard": false,
  "discard_reason": null
}
```

4. Update `photos` table with analysis results
5. Run selection algorithm:
   - Ensure minimum coverage: 1 exterior_front, 1 exterior_back/aerial, 1 kitchen, 1 living_room, 1 master_bedroom, 1 bathroom
   - Fill remaining slots (target 10-12 total) by highest `aesthetic_score`
   - Deduplicate by room_type (max 2 per type)
   - Prefer `depth_rating: "high"` when scores are close
6. Mark selected photos (`selected = true`)
7. Update property `selected_photo_count`
8. Log all decisions to `pipeline_logs`
9. Enqueue Stage 3

**LLM Prompt Structure:**
```
System: You are a real estate photography analyst. For each image, evaluate 
its suitability for AI video generation. Photos with strong depth, good 
lighting, and clear architectural lines produce the best animated results. 
Rate conservatively — an 8+ should be genuinely impressive.

Return a JSON array matching the input image order.
```

**Duration:** ~10-15 seconds (2-3 batch API calls)  
**Cost:** ~$0.06-0.10 (vision tokens for 30-50 images)

---

### Stage 3: Shot Planning & Scripting

**Process:**
1. Pull selected photos with their analysis metadata
2. Send to Claude claude-sonnet-4-6 with the Director system prompt
3. LLM returns ordered scene list:

```json
{
  "mood": "modern_luxury",
  "music_tag": "upbeat_elegant",
  "scenes": [
    {
      "scene_number": 1,
      "photo_id": "uuid",
      "room_type": "exterior_front",
      "camera_movement": "orbital_slow",
      "movement_direction": "clockwise",
      "prompt": "Cinematic slow orbital shot rotating clockwise around a modern two-story Mediterranean home with terracotta roof, palm trees in foreground, clear blue sky, golden hour warm lighting, smooth steady camera movement, photorealistic, 4K",
      "duration_seconds": 4,
      "provider_preference": "runway"
    }
  ]
}
```

4. Insert `scenes` rows
5. Enqueue Stage 4 (which fans out to parallel clip generation)

**Camera Movement Mapping (encoded in system prompt):**

| Room Type | Primary Movement | Fallback | Notes |
|---|---|---|---|
| exterior_front | orbital_slow | dolly_left_to_right | Establish the property |
| exterior_back | slow_pan | parallax | Show outdoor space |
| aerial | orbital_slow | slow_pan | Wide establishing |
| kitchen | dolly_left_to_right | slow_pan | Follow counter line |
| living_room | dolly_right_to_left | slow_pan | Emphasize depth |
| master_bedroom | dolly_right_to_left | slow_pan | Bed as anchor |
| bedroom | slow_pan | dolly_left_to_right | Keep it simple |
| bathroom | slow_pan | push_in | Compact spaces |
| dining | dolly_left_to_right | slow_pan | Table as anchor |
| pool | parallax | slow_pan | Foreground/background depth |
| hallway | push_in | dolly_left_to_right | Create depth |

**Scene Ordering Logic:**
1. Exterior establishing (front)
2. Entry/foyer (if available)
3. Main living areas (living → kitchen → dining)
4. Bedrooms (master first, then others)
5. Bathrooms
6. Special features (pool, gym, theater, view)
7. Exterior closing (back/aerial)

**Duration:** ~3-5 seconds (single LLM call)  
**Cost:** ~$0.02

---

### Stage 4: Video Generation (Parallel)

**This is the most complex and expensive stage.**

**Process:**
1. Receive scene list from Stage 3
2. Fan out: create one BullMQ job per scene, all running concurrently
3. Each scene job:
   a. Select provider based on `provider_preference` + routing rules + availability
   b. Upload source photo to provider's API
   c. Submit generation request with the crafted prompt
   d. Poll for completion (most APIs are async — submit then poll)
   e. Download generated clip
   f. Store at `properties/{property_id}/clips/{scene_number}.mp4`
   g. Update `scenes` row with clip_url, cost, generation_time, provider
   h. Enqueue QC check for this clip (Stage 5, per-clip)

**Provider Abstraction Layer:**

```typescript
interface VideoProvider {
  name: string;
  generateClip(params: {
    sourceImage: Buffer;
    prompt: string;
    durationSeconds: number;
    aspectRatio: '16:9' | '9:16';
  }): Promise<{
    jobId: string;
    estimatedSeconds: number;
  }>;
  checkStatus(jobId: string): Promise<{
    status: 'processing' | 'complete' | 'failed';
    videoUrl?: string;
    costCents?: number;
  }>;
  downloadClip(videoUrl: string): Promise<Buffer>;
}
```

Implementations: `RunwayProvider`, `KlingProvider`, `LumaProvider`

**Provider Routing Logic:**
```
1. Check if provider_preference is set and that provider is enabled → use it
2. Check room_type routing table in settings → use mapped provider  
3. Fall back to priority-ordered provider list
4. On failure → retry with next provider in priority order
```

**Concurrency Control:**
- BullMQ concurrency set per provider (respect API rate limits)
- Runway: 5 concurrent generations
- Kling: 10 concurrent generations  
- Luma: 5 concurrent generations
- Total per property: all clips in parallel (limited by provider concurrency)

**Cost Tracking:**
- Each provider returns cost or we calculate from known pricing
- Update `scenes.generation_cost_cents` per clip
- Aggregate to `properties.total_cost_cents`

**Duration:** ~60-120 seconds wall clock (clips generate in parallel)  
**Cost:** ~$2.00-4.50 per property (10-12 clips at $0.15-0.40 each)

---

### Stage 5: Quality Control (Per-Clip)

**Process (runs per clip, immediately after generation):**
1. Extract 5 evenly-spaced frames from the clip (FFmpeg)
2. Send frames to Claude claude-sonnet-4-6 vision with QC prompt
3. Receive structured verdict:

```json
{
  "verdict": "pass",
  "confidence": 0.92,
  "issues": [],
  "motion_quality": "smooth",
  "architectural_integrity": "intact",
  "lighting_consistency": "stable"
}
```

**Verdict handling:**
- `pass` (confidence >= threshold) → mark scene as `qc_pass`, proceed
- `soft_reject` → modify prompt (append corrective instructions), retry with same provider
- `hard_reject` → retry with different provider
- After max retries (configurable, default 2) → mark as `needs_review`, flag for HITL

**Prompt Modification on Soft Reject:**
```
Original: "Cinematic dolly shot through modern kitchen..."
Modified: "Cinematic dolly shot through modern kitchen... 
Ensure architectural lines remain straight and stable. 
Avoid any warping or distortion of walls, counters, and cabinets.
Maintain consistent lighting throughout the entire clip."
```

**When ALL clips for a property have passed QC → enqueue Stage 6**

**Duration:** ~3-5 seconds per clip (vision API call)  
**Cost:** ~$0.01-0.02 per clip QC check

---

### Stage 6: Assembly & Delivery

**Process:**
1. Pull all approved clips in scene order
2. Run FFmpeg pipeline:

```bash
# Step 1: Normalize all clips to consistent format
for each clip:
  ffmpeg -i clip_N.mp4 -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -r 30 -c:v libx264 -pix_fmt yuv420p normalized_N.mp4

# Step 2: Concatenate with crossfade transitions
ffmpeg -i n1.mp4 -i n2.mp4 ... -filter_complex "xfade=transition=fade:duration=0.4:offset=3.1, ..." output_horizontal.mp4

# Step 3: Add audio track
ffmpeg -i output_horizontal.mp4 -i music_track.mp3 -filter_complex "[1:a]afade=t=out:st=28:d=2[a]" -map 0:v -map "[a]" -shortest with_audio.mp4

# Step 4: Add text overlays
ffmpeg -i with_audio.mp4 -vf "drawtext=text='123 Palm Ave':fontsize=42:fontcolor=white:x=(w-tw)/2:y=h-120:enable='between(t,0,2.5)',drawtext=text='$1,250,000 | 4 BD | 3 BA':fontsize=36:fontcolor=white:x=(w-tw)/2:y=h-80:enable='between(t,26,30)'" final_horizontal.mp4

# Step 5: Create vertical version (smart crop)
ffmpeg -i final_horizontal.mp4 -vf "crop=ih*9/16:ih:(iw-ih*9/16)/2:0" final_vertical.mp4
```

3. Upload final videos to Supabase Storage
4. Update `properties` row: status → `complete`, set video URLs, processing_time
5. Log completion to `pipeline_logs`
6. Send notification (email/webhook) to the submitting agent

**Smart Vertical Cropping:**
- Default: center crop from horizontal
- Enhancement: use the photo analysis from Stage 2 to determine subject position and offset the crop accordingly (e.g., if the kitchen island is left-of-center, shift crop left)

**Duration:** ~10-20 seconds  
**Cost:** ~$0.03-0.05 (compute only)

---

## Job Queue Architecture (BullMQ)

```
Queues:
├── intake          (concurrency: 10)
├── analysis        (concurrency: 5)   — limited by LLM API rate
├── scripting       (concurrency: 10)
├── generation      (concurrency: 20)  — sub-limited per provider
│   ├── runway      (concurrency: 5)
│   ├── kling       (concurrency: 10)
│   └── luma        (concurrency: 5)
├── qc              (concurrency: 10)
├── assembly        (concurrency: 3)   — CPU-bound FFmpeg
└── delivery        (concurrency: 10)
```

**Retry Policy:**
- All stages: 3 retries with exponential backoff
- Generation: 2 retries per clip (then flag for review)
- Dead letter queue for persistent failures → triggers alert

**Priority System:**
- Default priority: 0
- Rush orders: priority -1 (processed first)
- Retries: priority +1 (don't block fresh work)

---

## Real-Time Dashboard Updates

The dashboard stays live via **Supabase Realtime**:

1. Pipeline workers update `properties.status` and `scenes.status` in Postgres
2. Supabase Realtime pushes row changes to subscribed dashboard clients
3. Dashboard subscribes to:
   - `properties` table changes (for pipeline Kanban and overview stats)
   - `scenes` table changes (for per-clip progress on property detail view)
   - `pipeline_logs` inserts (for live log viewer)

**No polling needed.** The dashboard is reactive to database writes.

---

## Cost Tracking System

Every billable operation logs its cost:

| Operation | How Cost is Captured |
|---|---|
| Photo analysis (LLM) | Token count from API response × price per token |
| Shot scripting (LLM) | Token count from API response × price per token |
| Video generation | Provider API returns cost, or calculated from duration × rate |
| QC analysis (LLM) | Token count from API response × price per token |
| Compute (FFmpeg, workers) | Estimated from processing time × instance cost/sec |

Costs roll up: `scenes.generation_cost_cents` → `properties.total_cost_cents` → `daily_stats`

A background job aggregates `daily_stats` every hour.

---

## HITL Review System

When a clip exceeds max retries:
1. Scene marked `needs_review`
2. Property status set to `needs_review` 
3. Dashboard "Needs Review" section shows:
   - The source photo
   - The generated clip (last attempt)
   - QC rejection reasons
   - The prompt used
4. Operator can:
   - **Approve Anyway** → override QC, mark as passed
   - **Edit Prompt & Retry** → modify the prompt text, trigger new generation
   - **Skip Clip** → remove scene from final video, adjust assembly
   - **Swap Photo** → pick a different photo from the property's set, re-script and re-generate

Target: <5% of total clips require review. At 20 properties × 11 clips = 220 clips/day, that's ~11 clips needing human attention per day (~15-20 minutes of human time).

---

## Scaling Considerations

**20 properties/day (launch):**
- 1 worker instance handles everything
- ~$60-100/day in API costs
- Single Redis instance for BullMQ

**100 properties/day (growth):**
- 3-5 worker instances (horizontally scaled)
- Provider rate limits become the bottleneck — add more providers or negotiate higher limits
- ~$300-500/day in API costs
- Redis cluster for BullMQ

**500+ properties/day (scale):**
- Dedicated worker pools per stage
- Multiple provider accounts for rate limit multiplication
- Move to managed queue (SQS/Cloud Tasks) if BullMQ/Redis hits limits
- Negotiate volume pricing with video gen providers
- ~$1,500-2,500/day in API costs

---

## API Endpoints

```
POST   /api/properties              — Create property + upload photos
GET    /api/properties/:id          — Get property detail
GET    /api/properties/:id/status   — Public status endpoint (for agents)
POST   /api/properties/:id/rerun    — Re-trigger pipeline from a specific stage
GET    /api/properties               — List properties (paginated, filtered)

GET    /api/scenes/:id              — Get scene detail with QC history
POST   /api/scenes/:id/approve      — HITL: approve despite QC failure
POST   /api/scenes/:id/retry        — HITL: retry with modified prompt
POST   /api/scenes/:id/skip         — HITL: skip this scene

GET    /api/logs                    — Query pipeline logs
GET    /api/stats/daily             — Get daily aggregated stats
GET    /api/stats/overview          — Get current overview metrics

GET    /api/settings                — Get pipeline settings
PUT    /api/settings                — Update pipeline settings

POST   /api/webhooks/generation-complete  — Callback from video gen providers
```

---

## Environment Variables

```
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Redis (BullMQ)
REDIS_URL=

# LLM
ANTHROPIC_API_KEY=

# Video Generation Providers
RUNWAY_API_KEY=
RUNWAY_API_VERSION=
KLING_API_KEY=
LUMA_API_KEY=

# Notifications
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
NOTIFICATION_FROM_EMAIL=
WEBHOOK_SECRET=

# Pipeline Config
MAX_RETRIES_PER_CLIP=2
QC_CONFIDENCE_THRESHOLD=0.75
QC_AUTO_APPROVE_THRESHOLD=0.95
DEFAULT_CLIP_DURATION=3.5
TRANSITION_DURATION=0.4
```

---

## Directory Structure

```
reelready/
├── apps/
│   └── web/                     # Next.js app (Lovable-generated dashboard)
├── packages/
│   ├── pipeline/                # Core pipeline logic
│   │   ├── stages/
│   │   │   ├── intake.ts
│   │   │   ├── analyze.ts
│   │   │   ├── script.ts
│   │   │   ├── generate.ts
│   │   │   ├── qc.ts
│   │   │   └── assemble.ts
│   │   ├── providers/
│   │   │   ├── provider.interface.ts
│   │   │   ├── runway.ts
│   │   │   ├── kling.ts
│   │   │   └── luma.ts
│   │   ├── prompts/
│   │   │   ├── photo-analysis.ts
│   │   │   ├── director.ts
│   │   │   └── qc-evaluator.ts
│   │   ├── queue/
│   │   │   ├── setup.ts
│   │   │   └── workers.ts
│   │   └── utils/
│   │       ├── ffmpeg.ts
│   │       ├── cost-tracker.ts
│   │       └── image-processing.ts
│   └── db/                      # Shared database types + queries
│       ├── schema.ts
│       └── queries.ts
├── worker/                      # Standalone worker process
│   └── index.ts                 # Starts BullMQ workers
├── docker-compose.yml           # Redis + worker for local dev
├── package.json
└── turbo.json
```
