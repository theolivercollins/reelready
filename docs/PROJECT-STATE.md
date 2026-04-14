# Listing Elevate — Project State (Handoff)

Last updated: **2026-04-14** (late-session sync after 30+ commits of pipeline work)

This is the authoritative state-of-the-project doc. Read it first when entering
the repo. If something here conflicts with code you see, trust the code and
update this doc.

---

## Product

**Listing Elevate** is a real estate AI video automation pipeline. Agents
upload 10–60 property photos; the system produces cinematic walkthrough
video clips using AI analysis, shot planning, and multi-provider video
generation. Individual clips are the deliverable today; Shotstack assembly
is wired in but optional (gated on `SHOTSTACK_API_KEY`).

- **Live URL:** `https://www.listingelevate.com` (custom domain, pointing at Vercel)
- **Legacy URLs:** `reelready-eight.vercel.app` (still works), historic names: Real Estate Pipeline, ReelReady, Key Frame
- **Repo:** `theolivercollins/reelready` (repo rename pending, doesn't block)
- **Local path:** `/Users/oliverhelgemo/real-estate-pipeline`
- **Primary user:** Oliver (`oliver@recasi.com`, `user_profiles.role='admin'`). Sole admin. Agent signup flow exists (magic link → profile row with role='user') but no approval/invitation gate yet.

## Communication preferences Oliver expects

Oliver wants plain language, bottom-line answers, no jargon, direct action.
Things he's flagged as annoying:

- Long responses with headers and bullet lists when a sentence would do
- Presenting A/B/C options when one has a clear vote
- Restating a plan before executing it
- Technical vocabulary that obscures the point
- Asking "do you want me to…" when he already said go
- Emotional adjectives in status updates ("great!", "huge win", etc.)

Bottom line: short, terse, pick the right path, say what you did, move on.

---

## Pipeline stages (current, as shipped)

File: `lib/pipeline.ts`. `runPipeline(propertyId)` executes in order:

1. **Stamp `pipeline_started_at`** — new column. Cron finalization uses this (not `properties.created_at`) to compute `processing_time_ms` so reruns don't show "737 minutes".

2. **Prompt revision snapshot** (best-effort, non-blocking) — hashes every
   system prompt (`PHOTO_ANALYSIS_SYSTEM`, `DIRECTOR_SYSTEM`, `STYLE_GUIDE_SYSTEM`,
   `QC_SYSTEM`, `PROMPT_QA_SYSTEM` — the last is dead code but still hashed for
   continuity) and inserts into `prompt_revisions` if any body changed since
   the last recorded version. Feeds the Learning → Changelog tab.

3. **Intake** — verify ≥5 photos.

4. **Analysis** (`runAnalysis`) — Claude Sonnet 4.6 vision analyzes each photo
   in batches of 8. Returns per photo: `room_type`, `quality_score`,
   `aesthetic_score`, `depth_rating`, **rich specific `key_features`** (3–6
   named descriptors, not generic nouns — "dark espresso waterfall island
   with three bronze pendant lights overhead"), **`composition`** (1–2 sentence
   spatial layout description), `suggested_discard` / `discard_reason`,
   **`video_viable`**, **`suggested_motion`**, **`motion_rationale`**.
   The analyzer is told to reject doorway-trap photos (front-door-open foyers,
   hallways ending at a doorway, any room with >25% of the frame dominated
   by an unseen-space opening).

5. **Style Guide** (`runPropertyStyleGuide`) — one extra Claude vision pass
   seeing all selected photos at once, producing a structured `PropertyStyleGuide`
   JSON (exterior materials, interior palette, kitchen, living, bedrooms,
   bathrooms, outdoor features). Saved to `properties.style_guide`.
   **IMPORTANT:** the guide is NOT injected into the director's user message
   anymore — it's stored for potential future use (keyframe providers,
   multi-image context when a provider supports it) but the director runs
   without it because injection was bloating prompts and regressing output.

6. **Scripting** (`runScripting`) — Director picks 10–16 scenes from the viable
   selected photos. Writes a short one-sentence cinematography-verb prompt per
   scene. Injects **past rating examples** (up to 5 winners with rating≥4 and
   up to 5 losers with rating≤2 from the last 30 days) into the user message
   as a "PAST GENERATIONS" block. This is the self-improving learning loop.

7. **Generation SUBMIT** (`runGenerationSubmit`) — **Fire-and-forget.** Worker
   pool of 4 (configurable via `GENERATION_CONCURRENCY`) submits each scene
   to its routed provider and persists `provider_task_id` + `submitted_at`.
   Does NOT poll. Does NOT download. Pipeline function exits in ~15–30s
   regardless of clip count.

8. **Return** — pipeline function exits. A log entry says "All scenes
   submitted to providers. Cron backstop will collect clips + finalize."

Out-of-band:

- **Cron** (`api/cron/poll-scenes.ts`, runs every minute per `vercel.json`
  `crons` entry) picks up scenes with `provider_task_id` set and `clip_url`
  still null. For each, calls `provider.checkStatus`, downloads completed
  clips, records real cost (with fallback estimate when the provider doesn't
  return credit usage: Runway ~5 credits/sec, Kling fixed 10 units/clip),
  and flips the property to `complete` / `needs_review` once all scenes
  have settled. **Doesn't finalize** if any scene is still `pending` without
  a `provider_task_id` — preventing false "complete" on abandoned scenes.

- **Preflight QA** (`runPreflightQA`) was removed from the pipeline on
  2026-04-14. File `lib/prompts/prompt-qa.ts` still exists as dead code but
  is not called. Reason: it was burning ~95s of the 300s function budget on
  12 sequential Claude vision calls AND silently rewriting the director's
  short crisp prompts into 80-word narrative paragraphs with banned verbs
  like `slow_pan`. The director + video_viable filter + per-room feature
  vocab + rating learning loop are the real quality levers. QA was adding
  more regressions than it prevented.

- **Inline QC** (`runQCForScene`) was removed at the same time. All clips
  auto-pass today; real QC with frame extraction is deferred pending an
  ffmpeg-capable runtime.

- **Assembly** (`runAssembly`) moved to inside the Shotstack integration.
  The pipeline function does NOT call assembly inline anymore — it returns
  after submission. Cron finalizes. Shotstack stitching (if `SHOTSTACK_API_KEY`
  is set) runs as part of the finalize flow. Otherwise individual clips are
  the deliverable.

---

## Camera movement vocabulary (11 verbs + 8 sub-variants)

The `CameraMovement` enum is 11 active values plus 4 legacy-only values that
only exist so historical scene rows still typecheck. The analyzer and
director are banned from emitting the legacy values.

**Active (11):**

```
push_in · pull_out · orbit · parallax
dolly_left_to_right · dolly_right_to_left
reveal · drone_push_in · drone_pull_back · top_down
low_angle_glide · feature_closeup
```

**Legacy (banned, not emitted):** `orbital_slow`, `slow_pan`, `tilt_up`,
`tilt_down`, `crane_up`, `crane_down`. Vertical motions don't map to
real-estate shot types — floors and ceilings aren't hero subjects, and
source photos have no overhead starting frame for a crane to descend from.

**8 cinematographer sub-variants** (prompt-level styles the director picks
within an existing verb, not new enum values — see `lib/prompts/director.ts`
"CINEMATOGRAPHER SHOT STYLES" section):

| Shot style | Mapped verb | Prompt style |
|---|---|---|
| Straight Push | `push_in` | "slow cinematic straight push centered on [subject]" |
| Straight Push Curve | `push_in` | "slow cinematic straight push with gentle curve toward [subject]" |
| Straight Push with Rise | `push_in` | "slow cinematic straight push rising upward toward [subject]" |
| Orbiting Detail Rise and Drop | `orbit` | "slow cinematic orbit rising and dropping around [subject]" |
| Cowboy Lift | `orbit` | "tight 50mm cinematic orbit lifting around [subject] with foreground depth" |
| PTF Orbit | `orbit` | "advanced 50mm cinematic orbit wrapping around [subject] rising upward" |
| Detail Slider | `dolly_left_to_right` | "cinematic detail slider tracking across [subject], perfectly level horizontals" |
| Top Down Detail | `top_down` | "cinematic top down detail pulling back from [subject] with foreground framing" |

**Vertical-motion rule** (resolving an apparent contradiction): *pure*
vertical motion is banned (tilt up alone, camera ending staring at a
ceiling). Vertical motion as ONE component of a richer 3D move (push with
rise, orbit with lift, top-down pulling back with an upward tilt) is
allowed — the distinction is the terminal framing. Don't end on a ceiling.

**Tripod:** explicitly NOT implemented. Image-to-video models can't produce
a true static shot. If a photo needs to read as static, use `feature_closeup`
with shallow depth of field.

---

## Director prompt writing rules (enforced)

See `lib/prompts/director.ts`. Every per-scene prompt MUST:

- Be ONE sentence under 20 words
- Use real cinematography verbs, not narrative paraphrase
- Reference a SPECIFIC named feature from the photo's `key_features`
  (not "the kitchen" but "the waterfall granite island")
- Include one style adjective (smooth / slow / steady / cinematic)
- Match the `camera_movement` enum value (e.g. enum `push_in` → prompt contains "push in")
- NEVER include stability anchors ("stay in the room", "no scene change", "photorealistic" — all implied)
- NEVER describe materials or colors in detail (photo already shows them)
- NEVER mention people, brand names, or personal items

**Reveal requires an explicit foreground element.** A doorway is NOT a
foreground element. The prompt must name a physical occluder the camera
passes past: "reveal past the kitchen island corner to the fireplace",
"reveal past the potted palm to the front door". Without the foreground,
reveal collapses into a generic push-in.

**Exterior HARD rules:**
- ONE focal subject per prompt (no lists of 3 targets)
- Banned "from X toward Y" construction on drone moves (confuses direction)
- Banned "revealing X, Y, and Z" lists (gives the model permission to invent)
- Drone moves may include altitude hints ("rooftop height", "high altitude")
- Structure: "[speed] cinematic drone [verb] at [altitude] toward/from/across [ONE focal]"

**Feature_closeup** requires a photo that already frames one statement
element tightly. Prompts use "with shallow depth of field" and "background
softly blurred" as style hints. Picked opportunistically, max 1–2 per video.

---

## Scene allocation quotas

From `DIRECTOR_SYSTEM`:

| Room type | Quota | Notes |
|---|---|---|
| exterior_front | 2–3 clips | Drone + ground-level both count |
| aerial | 1–2 clips | Counts toward exterior total |
| living_room | 2 clips | HARD min 2 when 2+ viable photos exist |
| kitchen | **2–3 clips** | HARD min 2; pick 3 when 3+ viable photos with depth_rating=high or aesthetic≥8 |
| dining | 1 clip | |
| exterior_back / backyard | 1 clip | |
| lanai | 1 clip (if present) | |
| pool | 2 clips (if present) | |
| master_bedroom | 2 clips | HARD min 2 when 2+ viable photos exist |
| bedroom (each additional) | 1–2 clips | |
| bathroom | 1–2 clips | |
| hallway / foyer / garage / "extras" | 1–2 clips total | Dining can fold in here |

Multi-clip rooms (kitchen, living_room, master_bedroom) MUST pick
complementary angles, not duplicates. An island shot + a cabinet wall
shot beats two island shots. The director is told to prefer variety
over raw aesthetic score when picking the second/third clip.

---

## Providers

| Provider | Model | Status | Notes |
|---|---|---|---|
| Runway | `gen4_turbo` | **Active** | Push-in specialist. Duration snapped to 5 or 10. `RUNWAY_CENTS_PER_CREDIT` env (default 1). |
| Kling | `kling-v2-master` | **Active** | Everything lateral/vertical/reveal/parallax. `cfg_scale: 0.75`. No `negative_prompt` (long anchors made it worse). 5-concurrent task cap on trial plan. `KLING_CENTS_PER_UNIT` env (default 0 on trial). |
| Luma | Ray 2 | Coded but not exercised | `lib/providers/luma.ts` exists, router doesn't send anything to Luma currently. `LUMA_API_KEY` env if we ever enable. |
| Higgsfield | DoP standard | **Scaffolded, not wired** | See `docs/HIGGSFIELD-INTEGRATION.md`. Keyframe (first-last-frame) mode verified to work via API but doesn't help for real-estate listings — listings don't contain burst-shot sequences, so the two "keyframes" are usually two different hero angles that can't be interpolated smoothly. Integration deferred. |
| Shotstack | Timeline API | **Active if key set** | `lib/providers/shotstack.ts`. Runway assembly happens in `runAssembly` if `SHOTSTACK_API_KEY` / `SHOTSTACK_API_KEY_STAGE` is set. Renders both 16:9 and 9:16 sequentially with crossfades + text overlays. Falls back to individual clips if key missing. |

### Router logic

File: `lib/providers/router.ts`. Routes by camera_movement first, room_type as tiebreaker:

| Movement | Provider | Reason |
|---|---|---|
| `push_in`, `pull_out`, `feature_closeup` | Runway | Runway's native strength (push-in bias) |
| `drone_push_in`, `drone_pull_back`, `top_down` | Runway | Sweeping outdoor arcs and straight-line aerials |
| `orbit` (exterior_front / exterior_back / aerial) | Runway | Exterior sweeping orbits |
| `orbit` (interior) | Kling | Interior arcs |
| `dolly_left_to_right`, `dolly_right_to_left` | Kling | Lateral motion |
| `parallax` | Kling | Layered depth |
| `reveal` | Kling | Foreground-pass motion |
| `low_angle_glide` | Kling | Horizontal floor-level glide |

**Failover on retry**: if a provider fails, it's added to `excludeProviders`
for subsequent attempts on that scene. Too aggressive on transient errors
(Runway 5xx, Kling 1303 parallel-limit) — should only exclude on 401/402/400
permanent errors. Known issue, low priority.

---

## Scene rating + learning loop

New tables:

- **`scene_ratings`**: `id`, `scene_id` (CASCADE delete), `property_id`,
  `rating` (1–5), `comment`, `tags` (text[]), `rated_by`, timestamps.
  One row per scene, upsertable.
- **`prompt_revisions`**: `id`, `prompt_name`, `version`, `body`, `note`,
  `body_hash`, `created_at`. Snapshots every system prompt when it
  changes. Inserted by `recordPromptRevisionIfChanged` at the top of
  each pipeline run.

Rating flow:

1. Admin rates clips in the Deliverables card on `/dashboard/properties/:id`
   (5-star widget + comment textarea + tag pills). Auto-saves on click/blur.
2. Server (`api/scenes/[id]/rate.ts`) verifies bearer JWT against
   `user_profiles.role='admin'` before accepting. Attributes `rated_by`
   to the admin user_id.
3. On next pipeline run, `runScripting` calls `fetchRatedExamples` twice
   (once for rating≥4 winners, once for rating≤2 losers with comments),
   limits 5 each, last 30 days. Builds a "PAST GENERATIONS" block and
   appends it to the director's user message. Claude's in-context learning
   does the rest — next run biases toward winning patterns and away from
   losing patterns without any fine-tuning.

**Known limit:** rating FK uses `ON DELETE CASCADE`. If a rerun deletes
scenes (which the rerun endpoint does), ratings tied to those scenes get
cascade-deleted. Should denormalize rating context onto the rating row
(prompt, camera_movement, room_type) so ratings survive scene deletion.
Outstanding TODO.

Learning dashboard at `/dashboard/learning`:

- **Feedback tab**: summary strip (total ratings, avg, 14-day trend bars),
  top 10 winners, top 10 losers with comments, avg rating per
  (room_type × camera_movement) combo, avg rating per provider
- **Changelog tab**: timeline of prompt revisions grouped by prompt_name,
  expandable bodies, noting which version was in force at each point

---

## Cost tracking

File: `lib/utils/claude-cost.ts` + `recordCostEvent` in `lib/db.ts` +
`cost_events` table.

**Every API call records a real line item:**

- **Claude Sonnet 4.6**: parsed from `response.usage` with real token
  counts. Prices: $3/MTok input, $15/MTok output, $0.30/MTok cache read,
  $3.75/MTok cache write. Per-stage metadata includes input/output/cache
  breakdowns.
- **Runway**: parses `creditsUsed` / `usage.credits` from task response
  if present. **Falls back to ~5 credits/sec × duration** when the
  provider omits the field (current state — Runway's API doesn't seem
  to return the field consistently). Multiplied by `RUNWAY_CENTS_PER_CREDIT`
  env (default 1 = $0.01/credit).
- **Kling**: fixed 10 units per clip at `kling-v2-master`. Multiplied by
  `KLING_CENTS_PER_UNIT` env (default 0 on trial plan — **update when
  Oliver moves to paid plan**).
- **Shotstack**: not yet recording per-render cost (TODO).

`properties.total_cost_cents` is atomically updated by `recordCostEvent`
— SUM of cost_events for a property should equal the property total.
Invariant breaks when ratings or scene cascades mutate history (see
cron poll-scenes cost event code path which also records).

Superview Cost Breakdown card renders every event as `stage / provider /
scene / units / cost` with a total row. Old pre-rewrite property rows
have blank breakdowns (no cost events were recorded pre-rewrite).

---

## Photo analysis fields

New columns on `photos`:

- `video_viable` (bool) — filters out camera-trapped and doorway-trap photos
- `suggested_motion` (text) — one of the 11 active camera movements
- `motion_rationale` (text) — one short sentence naming a visible feature
- `composition` (text) — 1–2 sentence spatial layout description (foreground, midground, background, leading lines)
- `key_features` now holds 3–6 SPECIFIC named descriptors (not generic nouns)

Per-room feature vocabularies in `PHOTO_ANALYSIS_SYSTEM` tell Claude
what to look for once it identifies the room type — kitchen gets
island/sink/stovetop/range hood/wall ovens/cabinets/backsplash/pendants/
fridge/pantry/bar seating; living room gets sofa/fireplace/built-ins/
coffered ceiling/etc.; 13 vocabularies total (kitchen, living, dining,
master_bedroom, bedroom, bathroom, exterior_front, exterior_back, pool,
lanai, aerial, hallway/foyer/garage).

---

## Dashboard / admin surface

- **Global sticky TopNav** (`src/components/TopNav.tsx`) — Listing Elevate wordmark, auth-aware nav, admin dropdown. Renders on every page except homepage (which has its own nav).
- **`/dashboard`** — admin-only, gated by `RequireAdmin` which checks `profile.role === 'admin'`. Sub-nav: Overview, Pipeline, Listings, Logs, Learning, Finances, Settings.
- **`/dashboard/properties/:id`** (PropertyDetail / Superview):
  - Header with status pill + **LIVE** pulsing chip (while polling)
  - Stat strip (cost, time, photos, clips)
  - Deliverables card — inline clip players with 5-star rating widget + comment + tags, auto-saves
  - Cost Breakdown card
  - Tabs: Photos (thumbnails with Q/A scores, video_viable chip, suggested_motion, key_features bulleted, composition italicized, discard reason), Shot plan (verbatim prompts + inline players + copy buttons), Timeline, System prompts
  - **Live auto-refresh polling** — 3s interval while property is in a non-terminal status; pauses on tab hidden; resumes on tab focus; stops at terminal status
- **`/dashboard/learning`** — Feedback + Changelog tabs
- **`/dashboard/finances`** — external session work, revenue/expenses/token balances
- Homepage, Login, Upload, Account — UI redesigned by parallel session, do not touch unless explicitly asked

---

## DB schema (current)

- **`properties`**: + `drive_link`, + `style_guide jsonb`, + `pipeline_started_at timestamptz`
- **`photos`**: + `video_viable`, + `suggested_motion`, + `motion_rationale`, + `composition`; `key_features` now holds richer descriptors
- **`scenes`**: + `provider_task_id`, + `submitted_at`, partial index `idx_scenes_pending_poll`
- **`cost_events`**: new. Columns: `id`, `property_id`, `scene_id`, `stage`, `provider`, `units_consumed`, `unit_type`, `cost_cents`, `metadata jsonb`, `created_at`
- **`scene_ratings`**: new. Columns: `id`, `scene_id` (CASCADE), `property_id`, `rating (1-5)`, `comment`, `tags text[]`, `rated_by`, timestamps
- **`prompt_revisions`**: new. Columns: `id`, `prompt_name`, `version`, `body`, `note`, `body_hash`, `created_at`
- **`user_profiles`**, **`pipeline_logs`**, **`daily_stats`**: unchanged

---

## What shipped this session (2026-04-14)

Reverse chronological highlights:

### Vocabulary + shot styles
- Added 8 cinematographer shot sub-variants (straight push, straight push curve/rise, orbiting detail rise and drop, cowboy lift, PTF orbit, detail slider, top down detail). Mapped to existing verbs as prompt sub-variants.
- Deleted `tilt_down` and `crane_down` (same problem as the up variants).
- Deleted `tilt_up` and `crane_up` (awkward, vertical motions don't map to real-estate shot types).
- Expanded vocab from 7 to 14 verbs, then dropped to 11.
- Added `feature_closeup` shot type with shallow-DOF prompting.

### Director + prompt quality
- Reveal now requires a named foreground element.
- Kitchen quota bumped to 2–3 with complementary angles required.
- Exterior hard rules: single focal, no "from X toward Y", no multi-target lists, altitude hints.
- Rewrote all prompts as short one-sentence cinematography-verb style (banned narrative paraphrase, banned stability anchors).
- Removed style guide injection from director user message — guide still built and stored but not leaked.
- Removed preflight QA stage entirely — it was regressing output.

### Reliability + performance
- Fire-and-forget generation. Pipeline function submits + persists task IDs, exits in ~30s. Cron collects clips over the next few minutes. No more 300s timeout aborts.
- `pipeline_started_at` column for accurate run timing.
- Cron won't finalize property if any scene is `pending` without a task_id.
- Router by camera_movement first, room_type as tiebreaker (prevents Kling-specialty motions from being forced to Runway).
- Cron cost fallback estimate when provider omits credit usage.

### Analysis
- New `video_viable` field filters doorway traps and camera-trapped angles.
- New `composition` field — Claude's spatial layout description.
- `key_features` now require 3–6 specific named descriptors per photo.
- Per-room feature vocabularies baked into PHOTO_ANALYSIS_SYSTEM.
- `suggested_motion` picks from the 11 active verbs with explicit per-room motion-fit rules.

### Self-improvement loop
- New `scene_ratings` table with upsert endpoint.
- 5-star rating widget + comment + tag pills in the Deliverables card, auto-saves.
- Server-side admin JWT verification on the rate endpoint.
- `fetchRatedExamples` fetches winners + losers from last 30 days; injected into director user message as in-context learning.
- New `prompt_revisions` table + `recordPromptRevisionIfChanged` helper.
- Learning dashboard at `/dashboard/learning` with Feedback + Changelog tabs.

### UI
- Live auto-refresh polling on PropertyDetail (3s interval, pauses on tab hidden).
- Composition + rich key_features surfaced in Photos tab.
- Rating widget with tag pills (success tags: clean motion, cinematic, perfect, stayed in the room; failure tags: hallucinated architecture, wrong motion direction, camera exited room, warped geometry, added people/objects, too static/boring, too fast, low quality).

### Higgsfield
- Probe script verified first-last-frame keyframe mode works via API.
- Two test runs showed keyframe mode produces jittery output on similar photos and teleport-hallucinations on different photos.
- Decided NOT to wire Higgsfield into production. Keyframe mode structurally unsuited for real-estate listing photos (no burst-shot sequences exist in the source).
- `lib/providers/higgsfield.ts` stays as scaffolded dead code.

### Cost tracking
- Replaced all hardcoded cost estimates with real per-call tracking.
- Added Runway + Kling fallback estimates in cron poll-scenes.ts for when providers omit credit usage.

---

## Providers: current credit status

- **Runway**: topped up, active. Hits rooftop-level push_in / pull_out / drone / top_down / feature_closeup / exterior orbit.
- **Kling**: topped up after earlier session, went back to empty mid-session, topped up again at end of session. Current plan has a 5-concurrent-task cap (hit 1303 errors in burst submissions). `KLING_CENTS_PER_UNIT` still 0 on trial plan.
- **Higgsfield**: has ~490 credits remaining from the 500 loaded earlier. Not wired into production.

---

## Known bugs / gotchas

- **`scene_ratings` cascade on rerun**: rerun endpoint deletes scenes, which cascade-deletes associated ratings. Should denormalize rating context (prompt, movement, room_type, comment) onto the rating row so ratings survive. Oliver lost 7 ratings to this once already.
- **Failover too aggressive**: excludes provider on any exception including transient 5xx and 429/1303. Should classify errors and retry same provider on transient failures.
- **Kitchen quota sometimes picks 2 instead of 3** even when 3+ viable photos exist with aesthetic≥8. Director's aesthetic-first tiebreaker is too sticky. Consider adding explicit "pick 3 if count≥3" rule.
- **Runway ignores non-push motion**: scenes routed to Runway with dolly/tilt/reveal/parallax in the prompt still come back as push-ins. The router avoids sending those to Runway now, but if Kling is ever unavailable, those scenes fall through and produce the wrong motion.
- **Stale 2324 needs_review scenes**: current rerun of property `6f508e16` left 5 Kling scenes stuck at `needs_review` due to Kling balance errors at submit time. They won't auto-retry even though Kling is now topped up. Manual retry endpoint doesn't exist yet (TODO).
- **Shotstack assembly cost not recorded** in `cost_events`.
- **Prompt QA dead code**: `lib/prompts/prompt-qa.ts` and the `runPreflightQA` function body still exist but are never called. Leave for now, prune later.

---

## Immediate next actions (start here next session)

1. **Kitchen quota tuning**: hit the 3-clip case when it should fire. Look at the director's picking logic for multi-clip rooms. Preferably during the next full pipeline test.

2. **`scene_ratings` denormalization**: add columns `rated_prompt`, `rated_camera_movement`, `rated_room_type`, `rated_provider`. Populate on upsert. Change FK to `ON DELETE SET NULL` so rerun doesn't cascade-destroy the learning signal.

3. **Retry-scene endpoint**: `POST /api/scenes/:id/resubmit` that takes a scene_id, loads the scene, submits to the provider again with the existing prompt + camera_movement, persists new task_id, lets cron collect. Used for the stuck Kling scenes after a top-up.

4. **Failover error classification**: only exclude provider on 401/402/400 permanent errors. Retry same provider on 5xx and rate-limit errors.

5. **Shotstack cost tracking**: record per-render cost events when Shotstack assembles.

6. **Feature_closeup validation**: the first fire-and-forget run picked feature_closeup on the tub photo. Need to see if the clip actually reads as shallow-DOF on Runway output.

---

## Files that matter most

| File | Purpose |
|---|---|
| `lib/pipeline.ts` | Pipeline orchestrator |
| `lib/prompts/photo-analysis.ts` | Per-room vocab, video_viable rules, suggested_motion |
| `lib/prompts/director.ts` | 11-verb + 8 sub-variant vocab, exterior hard rules, shot style guidance |
| `lib/prompts/style-guide.ts` | Property style guide (built but not injected into director anymore) |
| `lib/prompts/prompt-qa.ts` | **Dead code** — kept for history, never called |
| `lib/prompts/qc-evaluator.ts` | Dead code — QC disabled (auto-pass) |
| `lib/providers/router.ts` | Camera-movement-first routing |
| `lib/providers/runway.ts` | Runway gen4_turbo |
| `lib/providers/kling.ts` | Kling v2-master, no negative_prompt, cfg_scale 0.75 |
| `lib/providers/higgsfield.ts` | Scaffolded, not wired |
| `lib/providers/shotstack.ts` | Active when SHOTSTACK_API_KEY is set |
| `lib/providers/luma.ts` | Unused |
| `lib/db.ts` | All DB helpers including recordCostEvent, upsertSceneRating, fetchRatedExamples, recordPromptRevisionIfChanged |
| `lib/utils/claude-cost.ts` | Claude token pricing |
| `api/pipeline/[propertyId].ts` | Entrypoint that calls runPipeline |
| `api/cron/poll-scenes.ts` | Backstop poller + property finalizer |
| `api/properties/[id]/rerun.ts` | Reset-only rerun endpoint |
| `api/properties/[id].ts` | Property detail (includes scenes w/ ratings + cost events) |
| `api/scenes/[id]/rate.ts` | Rating upsert (admin-verified) |
| `api/admin/learning.ts` | Aggregated feedback data |
| `api/admin/prompt-revisions.ts` | Changelog data |
| `api/admin/prompts.ts` | System prompts for Superview tab |
| `api/admin/recover-kling.ts` | One-shot stranded-task recovery |
| `src/pages/dashboard/PropertyDetail.tsx` | Superview with live polling + rating widget |
| `src/pages/dashboard/Learning.tsx` | Learning + changelog tab |
| `src/components/TopNav.tsx` | Global sticky nav |
| `docs/PROJECT-STATE.md` | This file |
| `docs/CREDENTIALS.md` | Local only, gitignored |
| `docs/TODO.md` | Current open work |
| `docs/HIGGSFIELD-INTEGRATION.md` | Higgsfield probe results + deferral decision |

---

## One-liner for next session

> Read `docs/PROJECT-STATE.md` first. The pipeline is in fire-and-forget mode
> with cron finalization. 11-verb vocab + 8 cinematographer shot styles.
> Preflight QA is dead, tilt/crane deleted. Next task: kitchen quota tuning,
> scene_ratings denormalization, retry-scene endpoint. Start by asking Oliver
> what he wants to prioritize.
