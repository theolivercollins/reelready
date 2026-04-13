# Listing Elevate — Project State (Handoff)

Last updated: **2026-04-13** (end of session)

This is the authoritative state-of-the-project document. Read this first when
entering the repo. If something here conflicts with code you see in the repo,
trust the code and update this doc.

---

## Product

**Listing Elevate** (formerly ReelReady, formerly Key Frame) is a real estate
AI video automation pipeline. Agents upload 10–60 property photos; the
system produces cinematic walkthrough video clips using AI analysis,
shot planning, and multi-provider video generation. Individual clips are
the deliverable for now — we cut FFmpeg stitching from scope until the
per-clip output is reliably good.

**Live URL:** https://reelready-eight.vercel.app (custom domain not yet
pointed at Vercel; the Supabase project is named `reelready` and the
GitHub repo is `theolivercollins/reelready`. Those rename to Listing
Elevate later — they're operational concerns, not blockers).

**Primary user today:** Oliver (role=admin, oliver@recasi.com). No other
users. No payment collection yet. No agent signup approval flow yet.

---

## Communication style Oliver expects

Oliver has explicitly asked for plain language, bottom-line answers, no
jargon, and direct action rather than multi-option prompts. Things that
annoy him:
- Long responses with headers and bullet lists when a sentence would do.
- Presenting A/B/C paths when one has a clear vote.
- Restating a plan before executing it.
- Technical vocabulary that obscures the point ("persistent text block",
  "FastAPI validator", "Promise.allSettled").
- Asking "do you want me to…" when he already said "just do it".

When he asks "what are you thinking?" he means: say the bottom line in one
or two sentences, then act. When he says "any questions?" he means: ask
the few that actually block work, not a safety-checklist of five.

Writing more than necessary has been flagged multiple times. Default to
short. Expand only when he asks for the long version.

---

## Pipeline stages (current)

File: `lib/pipeline.ts`. `runPipeline(propertyId)` executes in order:

1. **Intake** — verify at least 5 photos exist in `photos` table.
2. **Analysis** (`runAnalysis`) — Claude Sonnet 4.6 vision scores every
   photo on `quality_score`, `aesthetic_score`, `depth_rating`, room type,
   key features, selected/discarded with reason. Batched 8 photos per API
   call. Writes the fields back to the `photos` row.
3. **Style Guide** (`runPropertyStyleGuide`) — NEW. One Claude vision pass
   sees ALL selected photos and produces a structured `PropertyStyleGuide`
   JSON (exterior materials, interior palette, kitchen, living, bedrooms,
   bathrooms, outdoor features). Saved to `properties.style_guide`.
4. **Scripting** (`runScripting`) — Director Claude call picks 10–16 scenes
   from the selected photos with per-room quotas. Output JSON is parsed
   and inserted into `scenes`. The property's style guide is appended to
   the director's user message so any scene framing a doorway includes
   an accurate description of the real adjacent room instead of letting
   the downstream video model invent one.
5. **Pre-flight QA** (`runPreflightQA`) — Claude reviews each scene's
   source photo + prompt + camera movement and returns a 0–10 stability
   score plus a revised prompt. If score < 8 and a revised prompt is
   returned, the scene row is updated with the revision. Never blocks.
6. **Generation + inline QC** (`runGenerationWithQC`) — for each scene,
   submits to the chosen provider (Runway or Kling), persists the
   `provider_task_id` IMMEDIATELY (before polling, so cron can recover
   if the function dies), polls until complete, downloads the mp4,
   uploads to Supabase Storage at
   `{propertyId}/clips/scene_{num}_v{attempt}.mp4`. Concurrency is
   capped at 4 via a pull-based worker pool to respect Kling's parallel
   task limit. QC currently auto-passes (real frame-extraction QC is
   deferred — needs ffmpeg infra).
7. **Assembly** (`runAssembly`) — no stitching today. Just marks the
   property complete, sets thumbnail_url from the first passed clip,
   records processing_time_ms.

Out-of-band but critical:
- **Cron backstop** — `api/cron/poll-scenes.ts` runs every 60s (`vercel.json`
  `crons` entry). Picks up scenes with `provider_task_id` set but
  `clip_url IS NULL`, polls the provider, downloads completed clips,
  records costs. Finalizes a property once all its scenes have settled.
  Prevents stranded clips when the main pipeline function hits Vercel's
  300s `maxDuration`.

---

## Providers

All three currently-integrated providers are single-image image-to-video
and take one reference photo per clip.

| Provider | Model | Status | Notes |
|---|---|---|---|
| Runway | `gen4_turbo` | **Active** | Duration snapped to 5 or 10. Credits parsed from `creditsUsed`/`usage.credits` in the task response. `RUNWAY_CENTS_PER_CREDIT` env (default 1). |
| Kling | `kling-v2-master` | **Active** | Duration snapped to `"5"` or `"10"`. `cfg_scale: 0.75`. Long `negative_prompt` forbidding room exit, hallucinated doorways, scene change, warping. Plan parallel cap ≈ 5 (hit `1303` errors on bursts). Units fixed at 10/clip; `KLING_CENTS_PER_UNIT` env default 0 (trial plan). |
| Luma | Ray 2 | Coded but not exercised recently | `frame0` only — `frame1` keyframe slot exists but not wired. See `lib/providers/luma.ts`. |

Router: `lib/providers/router.ts`. Room-type → provider mapping, plus
`getEnabledProviders()` based on env vars.

**Higgsfield** — NEW, SCAFFOLDED BUT NOT WIRED. See
`lib/providers/higgsfield.ts` (single-image shape) and
`scripts/test-higgsfield.ts` (probe harness). First-last-frame keyframe
mode is verified working — see `docs/CREDENTIALS.md` for the exact
endpoint and parameter names. Next session's main integration work.

### Retry failover

If a provider attempt fails, the scene's retry loop adds the failed
provider to `excludeProviders` and the next attempt fails over to a
different provider via `selectProvider`. The failed provider is excluded
for the rest of the scene's retries. This is slightly too aggressive on
transient errors (e.g. Runway 500 → never tries Runway again for that
scene) — a refinement for later would be to only exclude on "permanent"
errors (auth, balance, bad request) and retry same provider on 5xx/429.

---

## Video output quality — current problem surface

The core product problem right now is that the generated clips are not
polished enough to ship. Specific failure modes Oliver has called out,
in priority order:

1. **Camera escapes the room.** The model starts in the living room and
   walks out through a visible sliding door, inventing a fake yard
   beyond. Or pushes past a doorway into a hallucinated hallway.
   MITIGATION: Director prompt now has an ABSOLUTE RULE forbidding
   room exit. Kling provider now sends a negative_prompt that
   reinforces this. Pre-flight QA catches and revises prompts that
   look risky.

2. **Invented adjacent rooms.** Scene 3 (living room) shows a kitchen
   visible through an opening to the left. Kling invents a fake
   kitchen that doesn't match the actual kitchen photographed in
   scene 4. MITIGATION: NEW Property Style Guide pre-pass generates
   a property-wide vocabulary that is injected into every scene's
   prompt, so when the living room prompt mentions the visible kitchen
   it describes the REAL cabinets/counters/lighting instead of leaving
   the model to guess.

3. **Motion name ignored.** Kling interprets "slow pan" as push-in,
   "parallax" as push-in, etc. MITIGATION: Director now writes prompts
   in plain-language motion sentences ("The camera translates slowly
   sideways. Elements close to the camera appear to move faster than
   elements further away…") instead of using jargon movement names.
   The `camera_movement` enum field is stored in the DB but NEVER
   appears in the prompt string sent to the model.

4. **Monotonous movement.** Previously over-used `slow_pan`. MITIGATION:
   Director prompt forces at least 5 different camera movements across
   10-16 scenes, caps `slow_pan` at ≤1 scene, requires consecutive
   scenes to differ.

5. **Stranded videos.** Kling task completed on Kling's server but
   pipeline function died before fetching the mp4. MITIGATION: task IDs
   are persisted to `scenes.provider_task_id` BEFORE polling, and the
   cron backstop picks up orphans within 60 seconds.

6. **Runway "basic push-in" limitation.** Oliver noted Runway gen4_turbo
   tends to produce push-in regardless of prompt. This is a known
   model limitation. Expected to be softened by Kling picking up the
   varied-motion scenes, and potentially by Higgsfield first-last-frame
   handling dolly/pan scenes (next session).

---

## Cost tracking

File: `lib/utils/claude-cost.ts` (Claude pricing math) + `lib/db.ts`
`recordCostEvent()` + `cost_events` table.

**All estimates were deleted.** There is no longer any `cost-tracker.ts`
guessing-per-second. Every API call now records a real line item:

- Claude Sonnet 4.6: `response.usage.input_tokens` + `output_tokens` +
  cache fields → cents at $3/MTok in, $15/MTok out, $0.30/MTok cache
  read, $3.75/MTok cache write. Recorded as stage=analysis or scripting
  (style-guide rows have `stage_detail: "style_guide"` in metadata).
- Runway: `creditsUsed` parsed from task response →
  `RUNWAY_CENTS_PER_CREDIT` env (default 1 = $0.01/credit).
- Kling: fixed 10 units per 5s clip → `KLING_CENTS_PER_UNIT` env
  (default 0 for trial plan — UPDATE THIS when Oliver upgrades).
- Cron backstop path also records via `recordCostEvent` when it
  recovers an orphan clip, so no accounting gap.

`properties.total_cost_cents` is now atomically updated by
`recordCostEvent` — should equal `SUM(cost_events.cost_cents)` for the
property, always.

Superview in `src/pages/dashboard/PropertyDetail.tsx` has a **Cost
Breakdown card** that renders one row per cost_event with stage,
provider, scene number, units, cost. Old pre-cost-rewrite properties
will just show an empty breakdown; that's expected.

---

## Dashboard / admin surface

Admin gate: `src/components/ProtectedRoute.tsx` `RequireAdmin` checks
`profile.role === "admin"`. Oliver's `user_profiles` row already has
`role='admin'` (user_id=`29a51ea1-0339-47e3-9666-dd8985c00b0d`). An
earlier orphan row with `role='admin'` but a different user_id
(`709e5dd8-...`) was deleted. DO NOT recreate it.

The dashboard is at `/dashboard` (overview, pipeline, properties,
properties/:id, logs, settings). The admin property detail page
(`PropertyDetail.tsx`) is the **Superview** — it surfaces:
- Header + stats strip (cost, time, clips delivered)
- Rerun button
- Deliverables card (inline video players + download per clip)
- Cost Breakdown card
- Tabs: Photos (real thumbnails with Q/A scores + full discard reason
  text under each card), Shot Plan (verbatim prompts + per-scene
  metadata + inline clip players), Timeline (chronological log), System
  Prompts (fetched from `/api/admin/prompts`).

Global TopNav (`src/components/TopNav.tsx`) is sticky on every page,
auth-aware (signed-out: Sign In / Get Started; signed-in user: Upload +
Account dropdown; admin: Upload + Dashboard + avatar dropdown). Homepage
variant is dark translucent over the hero video; other pages are light
translucent.

Homepage link for admins routes to `/dashboard` instead of `/account`
via `profile.role === "admin"` check in `src/pages/Index.tsx`.

Font pairing: Inter (body), Inter (display and mono too — Oliver or a
linter flattened it back to all-Inter after I tried Space Grotesk).
Don't touch unless he asks.

---

## Database schema notes (Supabase project `reelready` / `vrhmaeywqsohlztoouxu`)

- `properties` — added `drive_link`, `style_guide` (jsonb).
- `photos` — has `file_url`, `file_name`, `room_type`, `quality_score`,
  `aesthetic_score`, `depth_rating`, `key_features` (jsonb), `selected`,
  `discard_reason`.
- `scenes` — added `provider_task_id` (text), `submitted_at` (timestamptz).
  Partial index `idx_scenes_pending_poll` on the two columns for the cron.
- `pipeline_logs` — unchanged.
- `cost_events` — NEW. Columns: `id`, `property_id`, `scene_id`, `stage`,
  `provider`, `units_consumed`, `unit_type`, `cost_cents`, `metadata`,
  `created_at`. Indexed on `(property_id, created_at)`.
- `user_profiles` — unchanged.
- `daily_stats` — exists but not populated.

---

## What shipped in this session (2026-04-13)

Reverse chronological, grouped by theme:

### Kling output quality (in order of recency)
- Property Style Guide pre-pass (new stage) — `lib/prompts/style-guide.ts`
  + `runPropertyStyleGuide` in `lib/pipeline.ts` + `properties.style_guide`
  column. Director user prompt now includes the full style guide JSON.
- Pre-flight QA stage (new) — `lib/prompts/prompt-qa.ts` +
  `runPreflightQA` in `lib/pipeline.ts`. Auto-revises low-confidence
  prompts, never blocks.
- Director rewrite — room quotas (front 2-3, living 2, kitchen 1-2,
  master 1-2, baths 1-2, pool 2, etc.), plain-language motion sentences
  instead of jargon, 15 per-room templates, 120-word cap.
- Kling provider — `cfg_scale: 0.75` + long `negative_prompt` + model
  `kling-v2-master` + duration snap to "5"/"10".
- Runway provider — duration snap to 5/10.
- Failover — retry loop excludes failed provider on subsequent attempts.
- Concurrency cap — `GENERATION_CONCURRENCY` env (default 4) pull-based
  worker pool.

### Cost accuracy
- Deleted `lib/utils/cost-tracker.ts` estimates.
- New `cost_events` table, `recordCostEvent()` helper, `computeClaudeCost()`.
- Runway/Kling parse real units from task responses.
- Superview Cost Breakdown card.

### Reliability
- Task IDs persisted to `scenes.provider_task_id` before polling.
- Cron backstop `api/cron/poll-scenes.ts` every 60s picks up orphans.
- Fixed rerun endpoint: was double-triggering the pipeline AND leaving
  old scene rows behind. Now resets state + scenes + logs + totals and
  DOES NOT run the pipeline itself (client triggers it once).
- Recovery endpoint `api/admin/recover-kling.ts` for one-shot retrieval
  of already-completed Kling tasks by task_id.

### UI
- Global sticky TopNav on every page.
- Homepage / Upload / Login / Account / Dashboard rebranded to
  "Listing Elevate", old "Key Frame" / "ReelReady" wordmarks removed.
- Drive intake cut from Upload.tsx (was the root cause of the first
  "0 photos" failure — user was submitting via drive link but there was
  no drive downloader).
- PropertyDetail photo cards now show full discard reason as a persistent
  text block under each thumbnail.

### Admin / auth
- Confirmed `RequireAdmin` gate routes admins past `/account` to
  `/dashboard`. Fixed the orphan `user_profiles` row that was blocking
  Oliver. Homepage nav link now routes admins to `/dashboard`.
- `/api/admin/prompts` returns the three Claude system prompts so the
  Superview System Prompts tab can render them.

### Planning docs (unimplemented — live in `docs/`)
- `docs/SCENE-ALLOCATION-PLAN.md` — dynamic room-type quota allocator
  with redistribution and QA-score eligibility. Replaces the current
  simple "pick X clips per room" logic. Has pseudocode and migration
  plan. NOT YET IMPLEMENTED — this is a spec for next session.
- `docs/MULTI-IMAGE-CONTEXT-PLAN.md` — research on how to give the video
  model property-wide context. Recommends the Property Style Guide
  (SHIPPED), shot-selection heuristics to avoid doorway-framed photos
  (NOT SHIPPED), keyframe bracketing (applies to Luma and Higgsfield —
  NOT SHIPPED), strengthened prompt anchors (SHIPPED).
- `docs/HIGGSFIELD-INTEGRATION.md` — how to run the probe script,
  decide whether to wire Higgsfield into the router, and what env vars
  to set.
- `docs/REDESIGN-BRIEF.md`, `docs/REDESIGN-AUDIT.md` — external UI
  redesign work happening on the `ui-redesign` branch in parallel.
  Not our direct concern; don't step on those files.

---

## Higgsfield integration status (key decision surface for next session)

**Verified:** Higgsfield auth works with the keys in `docs/CREDENTIALS.md`.
Single-image baseline (`POST /higgsfield-ai/dop/standard`) generates
real video clips end to end. First-last-frame mode
(`POST /higgsfield-ai/dop/standard/first-last-frame`) with body
`{ image_url, end_image, prompt, duration }` **is confirmed working** —
produced clip
`https://cloud-cdn.higgsfield.ai/32b4fa89-6049-4d57-84e1-cbe46b7f70ef/aa4c398c-8e22-45ef-8be5-1d6fd6cb6193.mp4`
in ~110 seconds. Credit balance: ~500 at session end, minus whatever two
probe runs consumed.

**Not verified:** whether a true multi-reference field (e.g. `reference_images`)
is actually used by the model or silently dropped by the FastAPI handler.
This would need a visual A/B comparison of two clips, which is Oliver's
call to make.

**Scaffolded but not wired:**
- `scripts/test-higgsfield.ts` — probe harness (committed).
- `lib/providers/higgsfield.ts` — `HiggsfieldProvider` implementing
  `IVideoProvider` for the single-image shape. NOT yet imported by
  `router.ts`. Needs extension to support keyframe mode — the
  `IVideoProvider.generateClip` interface takes exactly one image
  buffer today; keyframe mode needs a second.

**Oliver's stance:** He added the 500 credits specifically because he
likes the keyframe concept. He wants Higgsfield integrated around
first-last-frame mode as the next major piece of work.

---

## Immediate next actions (start here next session)

1. **Show Oliver the probe video.** Link:
   `https://cloud-cdn.higgsfield.ai/32b4fa89-6049-4d57-84e1-cbe46b7f70ef/aa4c398c-8e22-45ef-8be5-1d6fd6cb6193.mp4`
   Ask whether the output quality is worth integrating. If yes, proceed
   to step 2. If no, pivot to the scene-allocation plan (item 6).

2. **Extend `IVideoProvider` to support optional keyframe pair input.**
   Add `endImage?: Buffer` (or `endImageUrl?: string`) to `GenerateClipParams`
   in `lib/providers/provider.interface.ts`. Runway and Kling implementations
   ignore it. Higgsfield uses it when present.

3. **Finish `HiggsfieldProvider`.** Make `generateClip` accept a data URL
   or upload the buffer to Supabase Storage temp and send a public URL.
   Support both single-image mode (default endpoint) and keyframe mode
   (first-last-frame endpoint, triggered when `endImage` is set). Parse
   credit usage from the response if present and return `providerUnits` +
   `providerUnitType: "credits"`. Map `completed/failed/nsfw/queued/in_progress`
   to our `complete/failed/processing`.

4. **Wire into router.** Add Higgsfield to `lib/providers/router.ts`
   `getEnabledProviders()` (checks for `HIGGSFIELD_API_KEY` + `HIGGSFIELD_API_SECRET`).
   Routing choice: make Higgsfield the preferred provider for scenes
   that have two eligible photos of the same room AND whose
   `camera_movement` is `dolly_left_to_right`, `dolly_right_to_left`,
   `slow_pan`, or `parallax` (movements that naturally interpolate
   between two anchor frames). Fall back to Kling/Runway otherwise.

5. **Director handoff.** Update the director prompt to optionally pick
   a second "end-frame photo" for scenes that it routes to Higgsfield.
   The scene row needs a way to store the second photo — add an
   optional `end_photo_id` column to `scenes`.

6. **Scene allocation ruleset** (`docs/SCENE-ALLOCATION-PLAN.md`). Dynamic
   per-room quotas with QA-score eligibility and cross-room
   redistribution. There is a full spec doc — implement it next. Affects
   `lib/prompts/director.ts` and/or a new post-director allocator in
   `lib/pipeline.ts`. Key requirements from Oliver:
   - Pass threshold is dynamic per room based on the complexity of
     that room's photos (rougher geometry → lower bar).
   - Hard min: 1 clip per present room, fall back to `push_in` if the
     photo isn't great.
   - Redistribution priority is dynamic by QA score, not a fixed list.
   - Total clip time ≤ 60 seconds.
   - Same photo can be used twice with different camera movements.

7. **Kling concurrency cap tuning.** Currently `GENERATION_CONCURRENCY=4`.
   Oliver has not confirmed his Kling plan's actual parallel cap. Ask
   next time he wants to tune it up.

8. **`KLING_CENTS_PER_UNIT` env.** Currently 0 (trial plan). Update in
   Vercel Production env when Oliver upgrades to a paid Kling plan.

---

## Open questions still waiting on Oliver

None blocking. He may circle back on:
- Whether to true-multi-reference verify on Higgsfield (needs a visual
  A/B comparison).
- Whether the Property Style Guide improved Kling output on the next
  real test run (waiting for him to run a fresh property).
- Custom domain `listingelevate.com` pointing at Vercel — operational,
  not a code task.
- Payment / Stripe integration — deferred until output quality is good.
- Agent signup flow — deferred until output quality is good.
- Email notifications when a property completes — deferred.

---

## Gotchas / things not to break

- **Don't commit `docs/CREDENTIALS.md`.** It's in `.gitignore`. The
  Higgsfield key + secret live there. Keep them out of git.
- **Don't modify files on the `ui-redesign` branch.** External work is
  happening in parallel on `src/components/ui/*`, `tailwind.config.ts`,
  `src/index.css`, marketing/docs. Only touch files that are clearly
  pipeline-related.
- **Don't re-add hardcoded cost estimates.** `lib/utils/cost-tracker.ts`
  is deleted on purpose.
- **Don't remove the cron poll backstop.** Even if the inline poll
  succeeds 99% of the time, the 1% stranded-clip case eats money.
- **Don't use jargon camera movement names inside the prompt strings.**
  The director prompt explicitly forbids `"parallax"`, `"dolly left to right"`,
  `"slow pan"` etc. in the generated prompt. Models misinterpret them.
  The enum values still exist in the DB / types but ONLY for routing,
  not for prompts.
- **Don't add Next.js patterns.** The frontend is Vite + React Router
  SPA. The linter/hooks try to recommend `'use client'` directives and
  async `searchParams` — they're wrong for this repo.
- **Don't auto-reset the property status without also deleting scenes.**
  The rerun bug that caused property `6f508e16` to show $8.69 / duplicate
  scenes came from the old rerun endpoint running the pipeline without
  wiping scenes first. The fix is already in place but worth remembering.

---

## Recent commits (reverse chronological, main branch)

Use `git log --oneline -30` for the full list. Highlights since the
rebrand:

- `71c4830` — Property Style Guide pre-pass
- `2392886` — Room quotas, plain-language motion prompts, pre-flight QA,
  full discard reason UI
- `c796bfe` — Real per-call cost tracking (delete estimates)
- `b239edc` — Persist task IDs + cron backstop
- `cb2d609` — Kling stranded-task recovery endpoint
- `a1ff3b8` — Concurrency cap 4
- `368b3d4` — Kling negative_prompt + camera movement diversity
- `c0421fc` — Rerun resets state, stops double-triggering
- `da4efe8` — Rebrand to Listing Elevate in homepage nav + routing fix

---

## Files that matter most

- `lib/pipeline.ts` — the whole pipeline orchestrator.
- `lib/prompts/director.ts` — scene list + prompts.
- `lib/prompts/prompt-qa.ts` — pre-flight QA.
- `lib/prompts/style-guide.ts` — property vocabulary pre-pass.
- `lib/prompts/photo-analysis.ts` — per-photo scoring.
- `lib/providers/router.ts` — provider selection.
- `lib/providers/runway.ts`, `kling.ts`, `luma.ts`, `higgsfield.ts`
- `lib/db.ts` — all DB helpers including `recordCostEvent`.
- `lib/utils/claude-cost.ts` — Claude pricing math.
- `api/pipeline/[propertyId].ts` — entrypoint that calls `runPipeline`.
- `api/cron/poll-scenes.ts` — backstop poller.
- `api/admin/recover-kling.ts` — one-shot task ID recovery.
- `api/admin/prompts.ts` — returns the 3 system prompts to the dashboard.
- `src/pages/dashboard/PropertyDetail.tsx` — the Superview.
- `src/components/TopNav.tsx` — global sticky nav.
- `docs/CREDENTIALS.md` — local only, gitignored.
- `docs/PROJECT-STATE.md` — this file.
- `docs/SCENE-ALLOCATION-PLAN.md` — next major implementation target.
- `docs/HIGGSFIELD-INTEGRATION.md` — how to test and wire Higgsfield.
- `scripts/test-higgsfield.ts` — probe harness.

---

## One-liner for the next session

> Read `docs/PROJECT-STATE.md` first. Next task is Higgsfield first-last-frame
> integration (see docs/HIGGSFIELD-INTEGRATION.md + docs/CREDENTIALS.md).
> Start by asking Oliver what he thought of the probe clip.
