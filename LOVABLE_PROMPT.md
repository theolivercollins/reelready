# Lovable Build Prompt — ReelReady Dashboard

Paste everything below this line into Lovable as your initial prompt.

---

Build a full-stack real estate video automation platform called **ReelReady**. It has two interfaces: an **Agent Upload Portal** and an **Operations Dashboard**. Use Tailwind CSS, shadcn/ui components, dark mode by default with a toggle. Supabase for database and auth. The design should feel like a premium SaaS ops tool — think Linear meets Vercel Dashboard. Monospace accents for data, clean sans-serif for UI text.

## Color Palette
- Background: zinc-950
- Cards/surfaces: zinc-900 with zinc-800 borders
- Primary accent: emerald-500 (success/active states)
- Warning: amber-500
- Error: rose-500
- Processing/in-progress: blue-500
- Text primary: zinc-50
- Text secondary: zinc-400

---

## DATABASE SCHEMA (Supabase)

### Table: `properties`
- `id` uuid PK default gen_random_uuid()
- `created_at` timestamptz default now()
- `updated_at` timestamptz
- `address` text NOT NULL
- `price` integer NOT NULL
- `bedrooms` integer NOT NULL
- `bathrooms` numeric NOT NULL
- `listing_agent` text NOT NULL
- `brokerage` text
- `status` text NOT NULL default 'queued' — enum: queued, analyzing, scripting, generating, qc, assembling, complete, failed, needs_review
- `photo_count` integer default 0
- `selected_photo_count` integer default 0
- `total_cost_cents` integer default 0
- `processing_time_ms` integer
- `horizontal_video_url` text
- `vertical_video_url` text
- `thumbnail_url` text
- `submitted_by` uuid FK to auth.users

### Table: `photos`
- `id` uuid PK
- `property_id` uuid FK to properties
- `created_at` timestamptz default now()
- `file_url` text NOT NULL
- `file_name` text
- `room_type` text — kitchen, living_room, master_bedroom, bedroom, bathroom, exterior_front, exterior_back, pool, aerial, dining, hallway, garage, other
- `quality_score` numeric
- `aesthetic_score` numeric
- `depth_rating` text — high, medium, low
- `selected` boolean default false
- `discard_reason` text

### Table: `scenes`
- `id` uuid PK
- `property_id` uuid FK to properties
- `photo_id` uuid FK to photos
- `scene_number` integer NOT NULL
- `camera_movement` text — orbital_slow, dolly_left_to_right, dolly_right_to_left, slow_pan, parallax, push_in, pull_out
- `prompt` text NOT NULL
- `duration_seconds` numeric default 3.5
- `status` text default 'pending' — pending, generating, qc_pass, qc_soft_reject, qc_hard_reject, retry_1, retry_2, failed, needs_review
- `provider` text — runway, kling, luma
- `generation_cost_cents` integer
- `generation_time_ms` integer
- `clip_url` text
- `attempt_count` integer default 0
- `qc_verdict` text
- `qc_issues` jsonb
- `qc_confidence` numeric

### Table: `pipeline_logs`
- `id` uuid PK
- `property_id` uuid FK to properties
- `scene_id` uuid FK to scenes (nullable)
- `created_at` timestamptz default now()
- `stage` text NOT NULL — intake, analysis, scripting, generation, qc, assembly, delivery
- `level` text default 'info' — info, warn, error, debug
- `message` text NOT NULL
- `metadata` jsonb

### Table: `daily_stats`
- `id` uuid PK
- `date` date NOT NULL unique
- `properties_completed` integer default 0
- `properties_failed` integer default 0
- `total_clips_generated` integer default 0
- `total_retries` integer default 0
- `total_cost_cents` integer default 0
- `avg_processing_time_ms` integer
- `avg_cost_per_video_cents` integer

---

## PAGE 1: Agent Upload Portal (`/upload`)

This is the page real estate agents see. It should feel premium and simple — no clutter.

### Header
- ReelReady logo (text logo, bold, emerald accent on "Reel")
- Tagline below logo: "AI-powered property videos in minutes"

### Upload Form (centered card, max-w-2xl)
Fields:
1. **Property Address** — text input, required
2. **Listing Price** — currency input with $ prefix, required
3. **Bedrooms** — number input, required
4. **Bathrooms** — number input (allow 0.5 increments), required
5. **Listing Agent** — text input, required
6. **Brokerage** — text input, optional
7. **Photo Upload** — large drag-and-drop zone. Accept jpg, jpeg, png, heic, webp. Show file count and total size after upload. Min 10, max 60 photos. Show a grid preview of uploaded thumbnails (4 columns, small thumbnails with file names). Allow removing individual photos by clicking an X on each thumbnail.
8. **Submit button** — "Generate Video" — emerald-500 bg, full width, large. Disabled until required fields filled and min 10 photos uploaded.

### After Submit
Show a confirmation card:
- "Your video is being generated"
- Animated progress indicator
- "Tracking ID: PROP-XXXX" (short ID)
- "Estimated completion: ~3 minutes"
- "We'll notify you when it's ready"
- A link to a status page: `/status/[property_id]`

---

## PAGE 2: Property Status Page (`/status/[id]`)

Public page agents can check. Minimal, clean.

- Property address as heading
- Current stage shown as a **horizontal stepper/progress bar** with 6 stages:
  1. Uploaded
  2. Analyzing Photos
  3. Planning Shots
  4. Generating Video
  5. Quality Check
  6. Complete
- Active stage pulses with blue-500 animation
- Completed stages show emerald-500 checkmark
- Below the stepper: estimated time remaining
- When complete: show video preview player (horizontal) with a download button for both formats (16:9 and 9:16)

---

## PAGE 3: Operations Dashboard (`/dashboard`)

Protected by Supabase auth (email/password login). This is the internal ops view.

### Top Navigation Bar
- ReelReady logo (left)
- Nav items: Overview, Pipeline, Properties, Logs, Settings
- User avatar + dropdown (right)

### Overview Tab (`/dashboard`)

**Top stats row** — 6 stat cards in a grid:
1. **Today's Properties** — count completed / count total, with a small sparkline
2. **In Pipeline** — count of properties currently processing
3. **Avg Processing Time** — in minutes/seconds
4. **Success Rate** — percentage of properties completed without HITL
5. **Today's Cost** — dollar amount
6. **Avg Cost/Video** — dollar amount

**Pipeline Throughput Chart** (below stats)
- Area chart showing properties completed per hour over last 24 hours
- Emerald fill, zinc-800 grid lines

**Cost Breakdown Chart** (next to throughput)
- Stacked bar chart: generation cost vs LLM cost vs compute cost, per day, last 7 days

**Active Pipeline** (below charts)
- Live-updating table showing all properties currently in the pipeline
- Columns: Property Address, Stage (with colored badge), Progress (mini progress bar), Time Elapsed, Clips Done/Total, Retries, Est. Remaining
- Each row is clickable, navigates to the property detail view
- Rows should subtly pulse/highlight when their stage changes

**Recent Completions** (below active pipeline)
- Table of last 20 completed properties
- Columns: Property Address, Completed At, Processing Time, Total Cost, Clips Generated, Retries, Status (badge: success/needs_review/failed), Actions (view, rerun)

---

### Pipeline Tab (`/dashboard/pipeline`)

Visual Kanban-style pipeline view. 6 columns representing the stages:
1. **Queued** — cards waiting to start
2. **Analyzing** — photo analysis in progress
3. **Scripting** — shot plan being generated
4. **Generating** — video clips being created
5. **QC** — quality check in progress
6. **Assembling** — final video being built

Each card shows:
- Property address (truncated)
- Time in current stage
- Mini progress indicator
- If in Generating stage: show "5/12 clips" style progress

Cards auto-move between columns in real-time as status updates arrive.

A separate section below the Kanban for **"Needs Review"** — properties or individual clips that failed automated QC and need human intervention. Each shows the clip thumbnail, the QC rejection reason, and buttons to "Approve Anyway", "Edit Prompt & Retry", or "Skip Clip".

---

### Properties Tab (`/dashboard/properties`)

Searchable, filterable, sortable table of all properties.

**Filters bar:**
- Status dropdown (multi-select)
- Date range picker
- Search by address
- Sort by: date, cost, processing time

**Table columns:**
- Thumbnail (first photo)
- Address
- Agent
- Price
- Status (colored badge)
- Photos (count)
- Clips (generated/total)
- Cost
- Processing Time
- Created At
- Actions: View Detail, Download Videos, Rerun

**Property Detail View** (`/dashboard/properties/[id]`)

Full detail page for a single property:

**Header section:**
- Address, price, bed/ba, agent, brokerage
- Status badge
- Total cost, processing time
- Download buttons for both video formats
- "Rerun Pipeline" button

**Photo Grid section:**
- All uploaded photos in a grid (6 columns)
- Each photo shows: room type label, quality score badge, aesthetic score badge
- Selected photos have an emerald border, discarded photos are dimmed with discard reason on hover
- Toggle to show "Selected Only" vs "All Photos"

**Shot Plan section:**
- Ordered list of scenes
- Each scene shows: scene number, photo thumbnail, room type, camera movement (with an icon), prompt text, duration
- Status badge per scene: pending, generating (with spinner), passed, rejected, failed

**Scene Detail** (expandable per scene):
- Generated clip video player (if available)
- Provider used
- Generation time
- Cost
- QC verdict with confidence score
- QC issues listed
- Attempt history (show each retry with its result)

**Timeline/Logs section:**
- Chronological log of every pipeline event for this property
- Each log entry: timestamp, stage badge, level badge (info=zinc, warn=amber, error=rose), message
- Filterable by stage and level
- Auto-scrolls to bottom, live updates

---

### Logs Tab (`/dashboard/logs`)

Global log viewer across all properties.

- Real-time streaming log view (like a terminal)
- Each line: timestamp | property address (truncated) | stage badge | level badge | message
- Filter bar: stage dropdown, level dropdown, property search, date range
- Pause/resume auto-scroll toggle
- Export logs button (CSV)

---

### Settings Tab (`/dashboard/settings`)

- **API Keys section**: fields for Runway API key, Kling API key, Luma API key (masked input, save button per key)
- **Provider Routing**: toggle which providers are active, set priority order via drag-and-drop, set which provider handles which room types (dropdown per room type)
- **Quality Thresholds**: sliders for QC confidence threshold (0-1), max retries per clip (1-5), auto-approve confidence threshold
- **Cost Alerts**: set daily budget cap (dollar input), email alert threshold
- **Video Settings**: default clip duration (slider 2-5s), transition duration (slider 0.1-1.0s), output resolution dropdown
- **Music Library**: list of uploaded audio tracks with name, duration, mood tag. Upload new button. Set default track.
- **Brand Templates**: upload brokerage logos, set default font, colors for text overlays. Preview card showing how the opening/closing cards will look.
- **Notifications**: toggle email notifications for: video complete, pipeline failure, daily summary. Webhook URL field for custom integrations.

---

## GLOBAL UI PATTERNS

- All tables should have pagination (25 per page) and be responsive
- All real-time data should poll every 3 seconds OR use Supabase Realtime subscriptions
- Toast notifications for: upload success, video complete, pipeline error
- Loading states: use skeleton loaders, not spinners (except where noted)
- Empty states: friendly illustration + helpful message for every empty table/section
- All costs should display in dollars with 2 decimal places
- All timestamps should be relative ("2m ago") with exact time on hover
- Mobile responsive: upload page must work perfectly on mobile, dashboard can be desktop-optimized

---

## SEED DATA

Generate realistic seed data so the dashboard looks populated on first load:
- 15 completed properties with realistic addresses, costs ($1.80-$5.20 range), processing times (2-4 minutes)
- 4 properties currently in different pipeline stages
- 1 property in "needs_review" status with 2 clips that failed QC
- 200+ log entries spread across the properties
- 7 days of daily_stats data showing gradual increase in volume
- Realistic room type distribution across photos

This seed data should be insertable via a Supabase seed script or loaded on first dashboard visit.
