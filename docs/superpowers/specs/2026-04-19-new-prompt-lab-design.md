# New Prompt Lab — Multi-Photo Listings + Model-Resilient Architecture

**Date:** 2026-04-19
**Status:** Design draft, subagent-driven implementation next
**Branch:** `feature/machine-learning-improvement`
**Repo:** `real-estate-pipeline` (Listing Elevate)

---

## Goals (Oliver's own words from the brainstorm)

1. **Upload a batch of photos and run for the batch.** Right now seven sessions and batches feel like two ideas that should be one. New unit: a "listing" — upload 10-30 photos as one, see which pair up, see the prompt each scene gets.
2. **Build around Kling 3.0 for now, but stay dynamic.** We'll use a different model in a few months. The system must not ossify around one provider's prompt style. Recipes + prompts need structure that survives model swaps while preserving signal from all past ratings.
3. **Core unit of rating is still a generated clip.** Per-iteration 1-5★, same as today's Lab. Listings are the CONTEXT; ratings are still per-clip. Preserves all existing retrieval + recipe + proposals infrastructure.
4. **Functional end-frame with real photo pairing.** When a drone wide-shot + ground facade shot exist in the same listing, the director pairs them. You see the pair. You see the prompt. You render. You compare to the no-pair rendering.
5. **Model A/B comparison available per scene.** Default is whatever the listing locked to (Kling 3.0). Per-scene "try with Wan 2.7" button clones the scene as a new iteration on the other model.
6. **Archive old Prompt Lab, don't delete.** Legacy data and pages stay read-only. New Lab is the live one.

---

## Non-Goals (explicit)

- No deletion of `prompt_lab_sessions` / `prompt_lab_iterations` data. Those tables stay. Existing ratings continue feeding unified retrieval.
- No automated rendering — user clicks "Render all" or per-scene "Render" to commit spend. No silent $-burning.
- No multi-admin collaboration on a listing (single-user Lab — admins are already few; concurrent edits aren't a real concern).
- No direct integration with production property pipeline yet (Lab listing → prod property promotion is a later plan).
- No intent-to-prompt RENDERER in this plan. We capture structured intent; the renderer (for future model swaps) ships separately.
- No chat-with-agent UI (Phase 3).

---

## Design Principle: Model-Resilient by Default

The one architectural rule driving every decision: **separate intent from phrasing.**

| Concept | Meaning | Storage |
|---|---|---|
| **Intent** | What the scene is trying to achieve — room type, motion, focal subject, style adjectives, mood | Structured JSONB (`director_intent`) |
| **Phrasing** | The exact text sent to the model — "smooth cinematic push in toward the waterfall granite island" | Plain text (`director_prompt`) |
| **Rating** | Quality signal on the rendered output | Integer 1-5★, per iteration |
| **Model** | Which Atlas model produced the clip | String (`model_used`) |

When Kling v3.0 Pro gets replaced by v4 or Wan v3 in 6 months:

- All existing **intent + rating pairs** stay valid signal ("kitchen × push_in with waterfall-island focus tends to score 4.5★").
- Stored **phrasings** become stale — tuned to an old model's prompt-adherence profile.
- A new (simple) intent-to-phrasing renderer generates fresh prompts for the new model from stored intents, using the new model's style conventions.
- Ratings continue to flow into the SAME retrieval + recipe + proposal infrastructure. Previous high-rated (room, motion, subject, style) tuples act as seed data for the new model, not as verbatim templates.

This is why Phase 2.8 captures intent NOW even though we don't need the renderer yet. Adding the JSONB field is cheap; retrofitting intent capture across thousands of historical iterations would be expensive.

---

## Architecture Overview

### Three-level hierarchy (new)

```
prompt_lab_listings  (one per "test property")
  ├── prompt_lab_listing_photos  (10-30 per listing)
  └── prompt_lab_listing_scenes  (1 per planned clip)
        └── prompt_lab_listing_scene_iterations  (≥1 per scene — one per render attempt)
```

- **Listing** — container. Locks a default model, holds all uploaded photos.
- **Photo** — one image within a listing. Photo-analyzer runs per-photo, sets room_type + features + embedding.
- **Scene** — one clip the director plans. Has one start photo, optionally one end photo (pair). Captures intent + initial phrasing.
- **Iteration** — one render attempt on a scene. Has model, clip_url, rating, tags. Multiple iterations per scene enable A/B with different models, prompt refinements, or re-renders.

### Legacy preservation

| Old table | What happens |
|---|---|
| `prompt_lab_sessions` | Untouched. Read-only in legacy Lab route. |
| `prompt_lab_iterations` | Untouched. Ratings continue flowing to unified retrieval via `v_rated_pool`. |
| `prompt_lab_recipes` | Shared between old + new Lab. Both populate it on 4★+ ratings. |
| `lab_prompt_overrides` / `lab_prompt_proposals` | Unchanged. |

### Unified retrieval (already model-agnostic)

`v_rated_pool` already unions Lab iterations + prod scene ratings. Extend it with a third UNION branch for `prompt_lab_listing_scene_iterations`. Retrieval at director time pools across all three sources, weighting by rating and cosine distance — no change to existing winner/loser RPCs.

---

## Data Model (Migration 023)

```sql
CREATE TABLE prompt_lab_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Atlas model selected at creation time. Locks for the listing's
  -- default renders; per-scene overrides are stored on iteration.
  model_name TEXT NOT NULL DEFAULT 'kling-v3-pro',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','analyzing','directing','ready_to_render','rendering','complete','failed')),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  total_cost_cents INT NOT NULL DEFAULT 0
);

CREATE TABLE prompt_lab_listing_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES prompt_lab_listings(id) ON DELETE CASCADE,
  photo_index INT NOT NULL,
  image_url TEXT NOT NULL,
  image_path TEXT NOT NULL,
  analysis_json JSONB,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, photo_index)
);

CREATE TABLE prompt_lab_listing_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES prompt_lab_listings(id) ON DELETE CASCADE,
  scene_number INT NOT NULL,
  photo_id UUID NOT NULL REFERENCES prompt_lab_listing_photos(id) ON DELETE RESTRICT,
  end_photo_id UUID REFERENCES prompt_lab_listing_photos(id) ON DELETE SET NULL,
  end_image_url TEXT,                -- resolved (paired photo URL or crop variant)
  room_type TEXT NOT NULL,
  camera_movement TEXT NOT NULL,
  director_prompt TEXT NOT NULL,     -- phrasing
  director_intent JSONB NOT NULL,    -- structured intent (model-agnostic)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, scene_number)
);

CREATE TABLE prompt_lab_listing_scene_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES prompt_lab_listing_scenes(id) ON DELETE CASCADE,
  iteration_number INT NOT NULL,
  director_prompt TEXT NOT NULL,      -- may equal scene prompt, or be a refinement
  model_used TEXT NOT NULL,           -- "kling-v3-pro" | "wan-2.7" | future
  provider_task_id TEXT,
  clip_url TEXT,
  rating INT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  tags TEXT[],
  user_comment TEXT,
  cost_cents INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','submitting','rendering','rendered','rated','failed')),
  render_error TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scene_id, iteration_number)
);

CREATE INDEX idx_lab_listing_scenes_listing ON prompt_lab_listing_scenes (listing_id, scene_number);
CREATE INDEX idx_lab_listing_iters_scene ON prompt_lab_listing_scene_iterations (scene_id, iteration_number);
CREATE INDEX idx_lab_listing_iters_rating ON prompt_lab_listing_scene_iterations (rating) WHERE rating IS NOT NULL;
CREATE INDEX idx_lab_listing_photos_listing ON prompt_lab_listing_photos (listing_id, photo_index);

-- Extend v_rated_pool to include the new table. Ratings from new Lab
-- listings flow to the same unified retrieval that prod + legacy Lab use.
CREATE OR REPLACE VIEW v_rated_pool AS
SELECT
  'lab'::TEXT                       AS source,
  i.id                              AS id,
  (i.analysis_json ->> 'room_type') AS room_type,
  (i.director_output_json ->> 'camera_movement') AS camera_movement,
  i.rating                          AS rating,
  i.tags                            AS tags,
  i.created_at                      AS rated_at
FROM prompt_lab_iterations i
WHERE i.rating IS NOT NULL

UNION ALL

SELECT
  'prod'::TEXT,
  sr.id,
  sr.rated_room_type,
  sr.rated_camera_movement,
  sr.rating,
  sr.tags,
  sr.rated_snapshot_at
FROM scene_ratings sr
WHERE sr.rating IS NOT NULL
  AND sr.rated_room_type IS NOT NULL
  AND sr.rated_camera_movement IS NOT NULL

UNION ALL

SELECT
  'lab_listing'::TEXT,
  it.id,
  s.room_type,
  s.camera_movement,
  it.rating,
  it.tags,
  it.created_at
FROM prompt_lab_listing_scene_iterations it
JOIN prompt_lab_listing_scenes s ON s.id = it.scene_id
WHERE it.rating IS NOT NULL;
```

---

## Director Intent Shape

```ts
interface DirectorIntent {
  room_type: string;                  // "kitchen" | "exterior_front" | ...
  motion: string;                     // "push_in" | "orbit" | "reveal" | ...
  subject: string;                    // "waterfall granite island" (named feature)
  end_subject: string | null;         // "range wall" when paired, else null
  style: string[];                    // ["smooth", "cinematic"] | ["steady", "cinematic"]
  mood: string;                       // "luxury" | "warm" | "modern" | ...
  shot_style: string | null;          // "Cowboy Lift" | "PTF Orbit" | ... | null
  foreground_element: string | null;  // only populated for reveal verb
}
```

Captured alongside the verbatim `director_prompt` for every scene. When a future model swap happens, a renderer takes `DirectorIntent + target_model` → fresh phrasing. For Phase 2.8, we only capture + store; renderer is future work.

---

## UI

### Three new pages + nav changes

**1. `/dashboard/development/lab` (new main Lab)**

- Header: "Prompt Lab" title, "Create new listing" button, filter pills (All / Draft / Rendering / Complete)
- Grid of listing cards:
  - Thumbnail (first photo)
  - Listing name
  - Model badge (Kling 3.0 / Wan 2.7)
  - Status pill
  - Scene count + rated-count ("7 / 12 rated")
  - Total cost
- Footer link: "Legacy Prompt Lab →" (points to old `/prompt-lab` route)

**2. `/dashboard/development/lab/new`**

- Name input (optional — auto-generated from first upload if blank)
- Model selector: `Kling 3.0` (default, radio) / `Wan 2.7`
- Drag-drop multi-file upload zone (10-30 photos recommended)
- Notes textarea (what you're testing — e.g., "cabin exterior pullout test")
- "Upload & Analyze" button — creates listing, uploads to Supabase Storage, fires analyzer for each photo in parallel, lands you on the listing detail page

**3. `/dashboard/development/lab/[listingId]`**

- Header: name, status, model badge, total cost, age
- Photo grid section: all uploaded photos with room_type + video_viable tags from analyzer
- Scenes section:
  - Scene cards vertically. Each card:
    - **Pair visualization** at top: start photo + (arrow) + end photo (or "crop fallback" label if not paired)
    - Camera verb + room type chips
    - Director prompt (shown + editable with "Refine" button)
    - Director intent (expandable JSON view)
    - Iterations (one per render attempt):
      - Model chip
      - Video player with rendered clip
      - Rating stars (1-5★) — click to rate
      - Tags input + Comment textarea
      - "Re-render" (same prompt, same model) / "Try with [other model]" buttons
    - "+ New iteration" with free-form prompt override
- Actions bar: "Render all unrendered" / "Re-analyze" / "Archive listing"

**Legacy Lab preservation**

- `/dashboard/development/prompt-lab` — kept functional but removed from main nav
- Small "Legacy Prompt Lab (read-only)" link in `/dashboard/development` card grid, tagged with an "archived" chip
- The old UI still works for historical session review + existing ratings / recipes remain editable (so we don't break existing workflow mid-transition)

---

## Data Flow

### Creating a listing

```
User uploads N photos
  → POST /api/admin/prompt-lab/listings
     - creates prompt_lab_listings row (status='draft')
     - uploads each photo to Supabase Storage
     - inserts N prompt_lab_listing_photos rows (photo_index 0..N-1)
     - status → 'analyzing'
  → fires photo-analyzer in parallel per photo (existing `analyzeSingleImage`)
     - each completes → prompt_lab_listing_photos.analysis_json populated
     - compute + store embedding via existing `embedTextSafe`
  → when all photos analyzed → status='directing'
  → runs director against the full photo list (existing `directFromPhotos` code, adapted)
     - director sees all analyses + all embeddings
     - outputs scene plan with start photo_id per scene + optional end_photo_id
     - director also outputs structured intent per scene
  → insert prompt_lab_listing_scenes rows (one per scene)
     - resolve end_image_url via resolveEndFrameUrl (paired photo OR crop)
  → status='ready_to_render'
```

### Rendering a scene

```
User clicks "Render all unrendered" or per-scene "Render"
  → POST /api/admin/prompt-lab/listings/[listingId]/render
     - body: scene_id[] | "all"
     - for each scene: create prompt_lab_listing_scene_iterations row (status='queued')
       - iteration_number = 1 (or next available for this scene)
       - director_prompt = scene.director_prompt (initial)
       - model_used = listing.model_name
       - end_image_url = scene.end_image_url
     - submit to AtlasProvider (existing lib/providers/atlas.ts)
     - poll result (existing cron or polling mechanism)
     - on complete: update iteration with clip_url, cost_cents, status='rendered'
```

### Rating an iteration

```
User clicks a star rating on an iteration
  → POST /api/admin/prompt-lab/listings/[listingId]/iterations/[iterId]/rate
     - update rating + tags + user_comment on prompt_lab_listing_scene_iterations
     - if rating ≥ 4: auto-promote to prompt_lab_recipes
       (same dedup-removed logic as current Lab)
     - v_rated_pool view includes the new rating automatically
       → next retrieval call reads it
```

### Per-scene model A/B

```
User clicks "Try with Wan 2.7" on scene 3
  → POST /api/admin/prompt-lab/listings/[listingId]/render
     - body: { scene_ids: [<scene-3-id>], model_override: "wan-2.7" }
     - creates a NEW iteration on the scene with model_used='wan-2.7'
     - renders to Atlas with Wan backend
  → UI shows both iterations stacked under scene 3 — side-by-side comparison
```

---

## API Endpoints (new)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/prompt-lab/listings` | Create listing, accept photo uploads (multipart), kick off analyzer |
| `GET` | `/api/admin/prompt-lab/listings` | List all listings, with filter/pagination |
| `GET` | `/api/admin/prompt-lab/listings/[id]` | Full listing detail (photos + scenes + iterations) |
| `PATCH` | `/api/admin/prompt-lab/listings/[id]` | Update name / notes / archived flag |
| `POST` | `/api/admin/prompt-lab/listings/[id]/direct` | Re-run director on listing (or initial run if draft) |
| `POST` | `/api/admin/prompt-lab/listings/[id]/render` | Render scenes (body: `{scene_ids, model_override?}`) |
| `POST` | `/api/admin/prompt-lab/listings/[id]/iterations/[iterId]/rate` | Rate an iteration |
| `PATCH` | `/api/admin/prompt-lab/listings/[id]/scenes/[sceneId]` | Edit scene prompt (refinement path) |

### Polling

Existing Atlas polling already works off `provider_task_id`. Reuse for listing iterations — cron endpoint `/api/cron/poll-listing-iterations` checks `status='rendering'` rows every minute, finalizes or fails.

---

## Backend services (new / adapted)

- `lib/prompt-lab-listings.ts` — orchestration of listing lifecycle (create, analyze-all, direct, render-scene). Separate file from the legacy `lib/prompt-lab.ts` to keep logic isolated.
- `lib/prompts/director.ts` — extend director system prompt to output `director_intent` per scene. Backwards-compatible (adds a field, doesn't break existing callers).
- `lib/services/end-frame.ts` — no change. Already handles pair-or-crop.
- `lib/providers/atlas.ts` — no change. Already handles Kling v3.0 + Wan 2.7 per `ATLAS_VIDEO_MODEL` env OR the per-call model override (need to verify provider accepts a runtime model parameter, not just env).

### Provider runtime override check

The existing `AtlasProvider` reads `ATLAS_VIDEO_MODEL` at constructor time. For per-scene model override, we need either:
- Pass model as part of `GenerateClipParams` (extend the interface), OR
- Instantiate a fresh `AtlasProvider` per render with a temp env override (ugly)

Cleanest: add an optional `modelOverride?: string` to `GenerateClipParams`. AtlasProvider prefers `modelOverride` if set, else falls back to env. This is a small change to Phase 2.7's provider that Phase 2.8 requires.

---

## Navigation

`src/pages/dashboard/Development.tsx`:

- REMOVE the "Prompt Lab" link to `/dashboard/development/prompt-lab` from primary nav
- ADD new "Prompt Lab" link to `/dashboard/development/lab`
- ADD small "Legacy Prompt Lab" link at the bottom of the dashboard, tagged "archived"

`src/App.tsx`:

- Add three new routes: `/dashboard/development/lab`, `/dashboard/development/lab/new`, `/dashboard/development/lab/[listingId]`
- Keep existing `/dashboard/development/prompt-lab` routes intact

---

## Verification Gate (what "functional" means)

Before pushing to preview, the following must be true:

**1. End-to-end pair creation + render**
- Create a listing with a drone-wide + facade photo explicitly meant to pair
- Director's output includes `end_photo_id` on at least one scene
- Scene card UI shows the pair visualization correctly
- Render that scene — Atlas request payload includes `end_image` field matching the paired photo's URL
- Resulting clip actually plays with the motion starting at the drone frame and ending on the facade frame (visually verified on playback)

**2. Cost flows correctly**
- After a render, `cost_events` shows `provider='atlas'` rows
- `prompt_lab_listings.total_cost_cents` updates from summing iteration costs

**3. Model A/B works**
- On a rendered scene, click "Try with Wan 2.7"
- New iteration appears under same scene with `model_used='wan-2.7'`
- Atlas request uses `last_image` field (not `end_image`) for that iteration

**4. Rating flows to retrieval**
- Rate a clip 5★ in the new Lab
- Run director against another listing (or on prod)
- Confirm that 5★ rating shows up in winner retrieval via `v_rated_pool`

**5. Legacy Lab still works**
- Navigate to `/dashboard/development/prompt-lab` directly
- Existing sessions list loads
- Can view an old session's iterations
- Can rate an old iteration (legacy flow unchanged)

**6. Tests pass**
- All existing 38 tests still green
- New tests for listing create + scene pair resolution + per-iteration model override

**7. Build clean**
- `npm run build` succeeds
- `npx tsc --noEmit -p tsconfig.api.json` produces no new errors

If any of these fail, iterate before pushing to preview.

---

## Implementation Plan Pointer

Next step: invoke `writing-plans` skill to produce `docs/superpowers/plans/2026-04-19-phase2.8-new-prompt-lab.md` with bite-size TDD tasks.

Expected plan size: ~15 tasks.

---

## Glossary

- **Listing** — the Lab's top-level unit. A set of photos meant to be tested as if they were a real property.
- **Scene** — one clip in the listing's director output. Has a start photo, optional end photo, intent, and initial phrasing.
- **Iteration** — one render attempt on a scene. Multiple iterations per scene enable model A/B, prompt refinement, re-rendering.
- **Intent** — structured, model-agnostic description of what a scene is trying to achieve. Survives model swaps.
- **Phrasing** — the exact prompt string sent to the model. Model-specific; expected to regenerate on model swaps.
- **Legacy Lab** — the current `/dashboard/development/prompt-lab` pages. Stays functional, hidden from primary nav, tagged "archived."
