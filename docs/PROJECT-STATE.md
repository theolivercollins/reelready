# Listing Elevate — Project State (Handoff)

Last updated: **2026-04-19** — post unified embeddings, negative signal, Kling concurrency guard, re-render, organize mode.

Authoritative state doc. Read first when entering the repo. If anything here conflicts with the code, trust the code and update this doc.

---

## Product

**Listing Elevate** is a real estate AI video automation pipeline. Agents upload 10–60 property photos; the system produces cinematic walkthrough clips via Claude vision analysis + shot planning + multi-provider generation (Kling / Runway / Luma). Individual clips are the deliverable today; Shotstack assembly is wired in and active when `SHOTSTACK_API_KEY` is set.

- **Live URL:** `https://www.listingelevate.com` (Vercel custom domain)
- **Legacy URLs:** `reelready-eight.vercel.app` (works), historic: Real Estate Pipeline, ReelReady, Key Frame
- **Repo:** `theolivercollins/reelready` on GitHub (rename pending, doesn't block)
- **Local path:** `/Users/oliverhelgemo/real-estate-pipeline`
- **Primary user:** Oliver (`oliver@recasi.com`, `user_profiles.role='admin'`). Sole admin. Agent signup via magic link exists; no approval gate yet.

## Communication preferences

Oliver wants plain language, bottom-line answers, no jargon, direct action. Things flagged as annoying:
- Long responses with headers and bullet lists when a sentence would do
- Presenting A/B/C options when one has a clear vote
- Restating a plan before executing it
- Emotional adjectives in status updates
- Asking "do you want me to…" when he already said go

**New rule (2026-04-14):** Do not push to GitHub or deploy to Vercel without explicit permission in the same turn. Local commits are fine. Wait for "push", "deploy", "ship it", etc.

---

## Pipeline stages (main product — unchanged this session)

`lib/pipeline.ts` `runPipeline(propertyId)` runs in order:

1. **Stamp `pipeline_started_at`** — cron uses this for timing, not `properties.created_at`
2. **Prompt revision snapshot** — hashes every system prompt, inserts `prompt_revisions` row if changed
3. **Intake** — verify ≥5 photos
4. **Analysis** — Claude Sonnet 4.6 vision per photo: room, quality, aesthetic, depth, key_features, composition, video_viable, suggested_motion
5. **Style guide** — built and stored on `properties.style_guide` but NOT injected into director (bloat regression)
6. **Scripting** — director picks 10–16 scenes. PAST GENERATIONS block (winners ≥4, losers ≤2, last 30 days) injected as in-context learning
7. **Generation SUBMIT** — fire-and-forget. Submits to provider, persists `provider_task_id`, exits in ~30s
8. **Cron finalize** — `/api/cron/poll-scenes` every minute: downloads clips, records cost, flips property to complete. Shotstack stitches if key is set.

Preflight QA and inline QC were deleted on 2026-04-14 AM. They were regressing output.

### Camera vocabulary (11 verbs + 8 cinematographer sub-variants)

Active: `push_in · pull_out · orbit · parallax · dolly_left_to_right · dolly_right_to_left · reveal · drone_push_in · drone_pull_back · top_down · low_angle_glide · feature_closeup`

Banned (not emitted): `tilt_up · tilt_down · crane_up · crane_down · slow_pan · orbital_slow`. Vertical-only motions don't map to real-estate shot types.

Sub-variants (prompt-level styles within an existing verb): Straight Push, Straight Push Curve, Straight Push with Rise, Orbiting Detail Rise and Drop, Cowboy Lift, PTF Orbit, Detail Slider, Top Down Detail.

### Reveal hardening (shipped 2026-04-14 PM)

`lib/prompts/director.ts`: reveal prompts must name a foreground that appears verbatim in the photo's `key_features`. A reveal whose foreground is invented (e.g. "reveal past the kitchen island corner" when the photo has no island) is banned. Director falls back to push_in or dolly.

### Scene allocation quotas

Kitchen 2–3 (hard min 2, pick 3 with 3+ viable photos w/ depth=high or aesthetic≥8), living_room 2 (hard min 2), master_bedroom 2 (hard min 2), dining 1, pool 2 (if present), lanai 1, bathroom 1–2, exterior_front 2–3, aerial 1–2, bedrooms 1–2 each, extras 1–2 total.

### Router

Movement first, room type as tiebreaker. `lib/providers/router.ts`.

- Runway: `push_in · pull_out · feature_closeup · drone_* · top_down · orbit (exterior)`
- Kling: `dolly_* · parallax · reveal · low_angle_glide · orbit (interior)`

---

## Prompt Lab (new subsystem — shipped 2026-04-14 PM)

An admin-only iterative prompt-refinement workbench at `/dashboard/development/prompt-lab`. Separate from production — changes here do not touch `lib/pipeline.ts` or production director output.

### Why

Only 7 rated scenes in prod (0 kitchen, 0 living). Can't tune director prompts from data that doesn't exist. Lab generates that data on-demand without running a full property.

### Capabilities

**Upload & generate:** drag-drop multi-file upload on the list page. Each image becomes a session; with auto-analyze on, `PHOTO_ANALYSIS_SYSTEM` + `DIRECTOR_SYSTEM` run per session in parallel. Result: the proposed camera_movement + prompt for every uploaded photo in one shot.

**Batches:** sessions can carry a `batch_label` (e.g. "Smith property"). List view groups by batch. Session cards are draggable — drop on another batch header to move, drop on the "create new batch" zone at the bottom to make a new group. Click a batch title to rename all its sessions at once.

**Filter chips per batch:** All / Need to start / In progress / Completed. "Need to start" means no admin feedback yet (no rating, tag, comment, or refinement). "Completed" means any iteration rated 5★ OR any iteration became the source of a recipe.

**Card states on the list view:**
- `Rendering` amber pill over thumbnail while any iteration has `provider_task_id` set + no `clip_url` + no error
- `Ready for approval` sky banner when there's a rendered clip with no rating
- `✓ Completed` emerald badge (top-right) when 5★ rated or promoted to recipe
- Auto-refreshes every 15s when any session is active (visibility-gated)

**Detail view (`/dashboard/development/prompt-lab/:sessionId`):** click-to-edit label in header; iteration stack with newest on top. Latest iteration has 2px foreground border + "Latest · active" pill. Older iterations muted. Each iteration card shows analysis summary, director prompt, retrieval chips ("Based on N similar wins" / "Recipe · archetype"), render controls on latest, rating widget + chat.

**Render (async — shipped 2026-04-14 PM, concurrency guard 2026-04-15):** fire-and-forget. Render endpoint submits to Kling/Runway and stores `provider_task_id`. `/api/cron/poll-lab-renders` runs every minute in two phases: Phase 1 submits queued renders when a slot opens, Phase 2 finalizes in-flight renders (downloads clips, uploads to Supabase Storage `property-videos/prompt-lab/<session>/<iteration>.mp4`, sets `clip_url`). Safe to navigate away mid-render. Provider picker (Auto / Kling / Runway) on each render control.

**Kling concurrency guard (shipped 2026-04-15):** `countKlingInFlight()` checks Lab + prod in-flight Kling jobs against 4-concurrent cap. Auto mode falls back to Runway when Kling is full. Explicit Kling selection queues the render (`render_queued_at` column, migration 012). Queued renders auto-submit when a slot opens; 30-min expiry. Violet "Queued — waiting for slot" UI indicator.

**Re-render with different provider (shipped 2026-04-17):** "Try with: Kling / Runway" buttons on iterations with clips. Endpoint `api/admin/prompt-lab/rerender.ts` clones the iteration and submits to the specified provider. Each provider attempt gets its own iteration with its own rating, so recipes capture the winning provider.

**Rating on any iteration (fixed 2026-04-15):** rating widget no longer gated on `isLatest` — can rate older iterations. "Ready for approval" banner clears once any iteration in a session has feedback.

**Save rating** button (separate from Refine) persists rating + tags + comment without forcing a new iteration.

**Refine** button: Claude gets the previous iteration + user feedback + exemplars from similarity retrieval, proposes a revised director prompt, creates a new iteration.

**Organize mode + archive (shipped 2026-04-17):** "Organize" button toggles multi-select mode with checkboxes on session cards. Selection actions: group into batch, move to batch, archive, unarchive. Collapse chevrons on batch headers hide/show card grids. Sessions filtered out when archived; "Show archived" toggle. Grey "Archived" badge on archived cards. Migration 013: `archived boolean` on `prompt_lab_sessions`.

### Learning loop (the ML part — shipped 2026-04-14 PM, extended 2026-04-15+)

Three layered mechanisms. Retrieval now pulls from a unified pool of Lab + production ratings.

**1. Similarity retrieval (few-shot)** — every iteration's analysis gets embedded via OpenAI `text-embedding-3-small` (1536 dim) and stored in `prompt_lab_iterations.embedding`. Production scenes also embed on insert via `embedScene(sceneId)` in `lib/db.ts`. On each new analyze, the new photo's embedding queries `match_rated_examples` RPC (unified — pools Lab iterations + prod `scene_ratings` with `rating >= 4` and rating-weighted cosine distance). Top-5 exemplars (with tags/comment/refinement) are injected into the director user message as a "PAST WINNERS ON STRUCTURALLY SIMILAR PHOTOS" block. Same retrieval runs on Refine. The old `match_lab_iterations` RPC still exists in DB but is unused.

**Negative signal (shipped 2026-04-15):** `match_loser_examples` RPC pools low-rated (<=2★) Lab iterations + prod scene_ratings. `retrieveSimilarLosers` + `renderLoserBlock` inject an "AVOID THESE PATTERNS" block into the director user prompt alongside winners. Both analyze.ts and refine.ts call loser retrieval in parallel with winner retrieval. Rose-colored "Avoiding N losers" chip in Lab UI.

**"DO NOT REPEAT" block (shipped 2026-04-15–19):** when re-analyzing a session, all prior non-5★ prompts are injected as a "DO NOT REPEAT" block so the director avoids repeating failed approaches.

**2. Recipe library** — `prompt_lab_recipes` table keyed by archetype + room_type + camera_movement. Auto-populated on rating=5 unconditionally (dedup removed 2026-04-17 — every 5★ now promotes). Manual "Promote to recipe" button pre-fills `room_camera_YYMMDD-slug` archetype pattern. Green success banner for auto-promote confirmation. When a new photo's embedding matches a recipe within distance 0.35 on the same room_type, director gets a "VALIDATED RECIPE MATCH" block instructing it to use the template verbatim after feature substitution. `times_applied` increments per use. Recipes UI at `/dashboard/development/prompt-lab/recipes`: list, edit, archive, delete.

**3. Rule mining + proposals** — `/dashboard/development/proposals` page. "Run rule mining" aggregates rated Lab iterations by (room × movement × provider) bucket, passes winners + losers + evidence to Claude with `DIRECTOR_PATCH_SYSTEM`, which returns a unified diff + per-change citations. Admin reviews (diff + bucket evidence), clicks Apply → new `lab_prompt_overrides` row. Lab's director resolves the override at call time; production director does NOT consult overrides. Reject is one click, audit-logged on the proposal row.

### Data model

- **`prompt_lab_sessions`** — id, created_by, image_url, image_path, label, archetype, batch_label, archived (boolean, migration 013), created_at
- **`prompt_lab_iterations`** — id, session_id, iteration_number, analysis_json, analysis_prompt_hash, director_output_json, director_prompt_hash, clip_url, provider, provider_task_id, render_submitted_at, render_queued_at (migration 012), render_error, cost_cents, rating, tags, user_comment, refinement_instruction, embedding vector(1536), embedding_model, retrieval_metadata, created_at
- **`scenes`** — (production) now includes `embedding vector(1536)` + HNSW partial index (m=16, ef_construction=64, where not null) via migration 009
- **`prompt_lab_recipes`** — id, archetype, room_type, camera_movement, provider, composition_signature, prompt_template, source_iteration_id, rating_at_promotion, promoted_by, promoted_at, times_applied, embedding vector(1536), status
- **`lab_prompt_overrides`** — prompt_name, body, body_hash, is_active (UNIQUE partial index on active rows)
- **`lab_prompt_proposals`** — prompt_name, base_body_hash, proposed_diff, proposed_body, evidence JSONB, rationale, status, reviewed_at, reviewed_by
- **`dev_session_notes`** — session_date, objective, accomplishments (for the Development dashboard working log)

RPC helpers: `match_rated_examples` (unified retrieval), `match_loser_examples` (negative signal), `match_lab_recipes`, `recipe_exists_near`. Legacy: `match_lab_iterations` (unused).

### Lab key files

| File | Purpose |
|---|---|
| `lib/prompt-lab.ts` | Core helpers: analyze, direct, refine, submit/finalize render, retrieve exemplars/recipes, resolve override |
| `lib/embeddings.ts` | OpenAI text-embedding-3-small wrapper |
| `lib/prompts/director-patch.ts` | DIRECTOR_PATCH_SYSTEM meta-prompt for rule mining |
| `api/admin/prompt-lab/sessions.ts` | List + create (with batch_label) |
| `api/admin/prompt-lab/[sessionId].ts` | Detail + PATCH (label, archetype, batch_label) + DELETE |
| `api/admin/prompt-lab/analyze.ts` | Run analyze + director with retrieval injection |
| `api/admin/prompt-lab/refine.ts` | Save feedback + generate refined iteration |
| `api/admin/prompt-lab/render.ts` | Submit provider job (async) |
| `api/admin/prompt-lab/rate.ts` | Save rating; auto-promote 5★ to recipe if novel |
| `api/admin/prompt-lab/recipes.ts` | GET list + POST promote + PATCH edit + DELETE |
| `api/admin/prompt-lab/rerender.ts` | Clone iteration + submit to specified provider (NEW 2026-04-17) |
| `api/admin/prompt-lab/mine.ts` | Aggregate evidence, run DIRECTOR_PATCH_SYSTEM, store proposal |
| `api/admin/prompt-lab/proposals.ts` | List + apply/reject |
| `api/cron/poll-lab-renders.ts` | Phase 1 submit queued + Phase 2 finalize in-flight (rewritten 2026-04-15) |
| `scripts/backfill-scene-embeddings.ts` | One-shot: embed existing prod scenes (ran, 7 scenes) |
| `src/pages/dashboard/PromptLab.tsx` | Main Lab UI (list + detail) |
| `src/pages/dashboard/PromptLabRecipes.tsx` | Recipe library UI |
| `src/pages/dashboard/PromptProposals.tsx` | Rule-mining proposals UI |
| `src/pages/dashboard/Development.tsx` | Landing page: session notes, links, changelog |

---

## Dashboard nav (reorg shipped 2026-04-14 PM)

TopNav sub-nav now: Overview · Pipeline · Listings · Logs · Finances · **Development** (dropdown) · Settings.

Development dropdown: Overview · Learning · Prompt Lab · Recipes · Proposals.

Legacy routes `/dashboard/learning` and `/dashboard/prompt-lab` 404 — all moved under `/dashboard/development/*`.

Development landing (`/dashboard/development`) shows:
- Session notes — per-session objective + accomplishments log (CRUD via `/api/admin/dev-notes`)
- Quick-link cards to Learning, Prompt Lab, Recipes, Proposals
- Prompt revision changelog summary (latest version per prompt)
- Static "How it works" reference: pipeline stages, router, vocabulary, key tables

---

## Providers (credit status 2026-04-19)

| Provider | Status | Notes |
|---|---|---|
| Runway | Active | Now accepts URL-based image input (bypass 5MB base64 cap). Fallback target when Kling is full |
| Kling | Active | 4-concurrent cap enforced by concurrency guard. Auto-fallback to Runway when full. Explicit Kling queues with 30-min expiry. Now accepts URL-based image input |
| Luma | Coded, not wired | |
| Higgsfield | Scaffolded, not wired (deferred — see `docs/HIGGSFIELD-INTEGRATION.md`) | |
| Shotstack | Active if key set. Stage + prod keys exist in `.env` | |
| OpenAI | Embeddings for Lab + prod scene retrieval (unified pool). `OPENAI_API_KEY` live in Vercel prod + preview |

---

## Cost tracking

`cost_events` table, `recordCostEvent` helper in `lib/db.ts`. Every Claude call + Runway/Kling/Shotstack render logged with tokens / credits / units + cent estimates. Lab iterations include analysis + director + render cost in `prompt_lab_iterations.cost_cents` (rounded to int — non-int fractional cents caused a 500 early in the Lab build).

---

## Known bugs / gotchas

- **`scene_ratings` cascade on rerun** (production) — rerun deletes scenes, cascades rating rows. Denormalization onto rating rows is a planned TODO.
- **Failover too aggressive** — excludes provider on any exception. Should only exclude on permanent errors (401/402/400).
- **Runway ignores non-push motion** — router avoids sending those to Runway now; fallback path could still misroute.
- **Stale `needs_review` Kling scenes from earlier property** — manual retry endpoint still not built for production.
- **Shotstack cost not in `cost_events`** — still TODO.
- **Production pipeline base64 image input** — 4 places in `lib/pipeline.ts` still use base64 instead of URL. Lab is fixed; prod is not.
- **File-revert mystery** — unresolved. All Shotstack MVP files + the entire Lab build survived multiple sessions; probably dormant or specific to certain paths.
- **Prompt QA dead code** — `lib/prompts/prompt-qa.ts` + body of `runPreflightQA` in pipeline.ts still present. Never called. Prune later.

### Fixed since last refresh (2026-04-15 through 2026-04-19)

- **Lab analyze >5MB photos** — `analyzeSingleImage` switched from base64 to URL-based Claude vision input.
- **Lab render >5MB photos** — `GenerateClipParams` extended with `sourceImageUrl`; Runway + Kling prefer URL over base64.
- **Rating on any iteration** — rating widget no longer gated on `isLatest`.
- **"Ready for approval" persists after rating** — fixed; banner clears once any iteration in a session has feedback.
- **Director repeats prompts** — new "DO NOT REPEAT" block injected with all prior non-5★ prompts when re-analyzing a session.

---

## What shipped 2026-04-15 through 2026-04-19 — reverse chronological

### Organize mode + archive (2026-04-17)
- "Organize" button toggles multi-select mode with checkboxes on session cards
- Selection actions: group into batch, move to batch, archive, unarchive
- Collapse chevrons on batch headers — hide/show card grids
- Migration 013: `archived boolean` on prompt_lab_sessions
- Sessions filtered out when archived; "Show archived" toggle; grey "Archived" badge

### Re-render with different provider (2026-04-17)
- `api/admin/prompt-lab/rerender.ts`: clones iteration, submits to specified provider
- "Try with: Kling / Runway" buttons on iterations with clips
- Each provider attempt gets own iteration → own rating → recipe captures winning provider

### Recipe improvements (2026-04-17)
- Dedup removed: every 5★ now promotes to recipe unconditionally
- Auto-fill archetype: manual promote pre-fills `room_camera_YYMMDD-slug` pattern
- Green success banner for auto-promote confirmation (was using red error channel)

### Kling concurrency guard + render queue (2026-04-15)
- `countKlingInFlight()` checks Lab + prod in-flight Kling jobs
- Auto mode: falls back to Runway when Kling is full
- Explicit Kling: queues the render (migration 012: `render_queued_at`)
- Cron `poll-lab-renders.ts` rewritten with Phase 1 (submit queued) + Phase 2 (finalize in-flight)
- Queued renders auto-submit when slot opens, 30-min expiry
- Violet "Queued — waiting for slot" UI indicator

### Negative signal / losers retrieval (2026-04-15)
- Migration 011: `match_loser_examples` RPC — pools low-rated (<=2★) Lab iterations + prod scene_ratings
- `retrieveSimilarLosers` + `renderLoserBlock` — "AVOID THESE PATTERNS" block in director prompt
- Rose-colored "Avoiding N losers" chip in Lab UI

### Unified embeddings (2026-04-15)
- Migration 009: `scenes.embedding vector(1536)` + HNSW partial index
- Migration 010: Extended `match_rated_examples` to return tags/comment/refinement
- `embedScene(sceneId)` in lib/db.ts — embeds each scene on insert
- Backfill script `scripts/backfill-scene-embeddings.ts` — ran, 7 prod scenes embedded
- Lab retrieval switched from `match_lab_iterations` to `match_rated_examples` — unified pool of Lab + prod ratings

### Bug fixes (2026-04-15 through 2026-04-19)
- Lab analyze >5MB photos: switched to URL-based Claude vision input
- Lab render >5MB photos: Runway + Kling prefer URL over base64
- Rating on any iteration: no longer gated on `isLatest`
- "Ready for approval" persists after rating: fixed — banner clears on feedback
- Director repeats prompts: new "DO NOT REPEAT" block with prior non-5★ prompts

### Design docs (2026-04-15)
- Spec: `docs/superpowers/specs/2026-04-15-spatial-grounding-design.md` — spatial grounding + unified embeddings (spatial half PAUSED)
- Plan: `docs/superpowers/plans/2026-04-15-unified-embeddings.md` — executed, complete
- Plan: `docs/superpowers/plans/2026-04-15-spatial-grounding.md` — PAUSED, annotated

---

## What shipped 2026-04-14 PM — reverse chronological

### Prompt Lab learning loop + async renders
- **Rendering state on list cards**: amber spinner over thumbnail, "Ready for approval" sky banner when clip exists but not rated, auto-refresh 15s when active.
- **Completed = any 5★ iteration OR recipe-promoted**. Was previously only recipe-promoted — dedup skips meant 5★ could stay "Ready for approval" indefinitely.
- **Latest iteration highlight**: 2px foreground border + pill; older iterations muted + opacity 0.8.
- **"Need to start" redefined**: means no admin feedback (rating/tag/comment/refinement), not "no iterations". Auto-analyzed-only sessions count as Need to start.
- **Per-batch filter chips**: All · Need to start · In progress · Completed with live counts.
- **Completed badge** on card thumbnails.
- **Drag-drop batches**: session cards draggable between batch headers; bottom drop-zone creates a new batch on drop; click batch title to rename all.
- **Multi-file upload + real file dropzone** on the new-session panel.
- **Batch label** field on sessions; grouped list view.
- **Auto-promote 5★ to recipe** with cosine-distance dedup (0.2 threshold).
- **Rating-weighted retrieval** — 5★ rank 15% closer than 4★ at same cosine distance.
- **Save rating** button (no forced refine).
- **Render persistence** — downloads provider CDN URL + re-uploads to Supabase Storage so clips survive CDN expiry + CORS.
- **Fire-and-forget render + cron finalizer** — render endpoint submits + returns; `/api/cron/poll-lab-renders` every minute downloads completed + sets clip_url. 30-min hard timeout.
- **Render UI**: provider picker (Auto/Kling/Runway), pending badge, render_error display, "open in new tab" link.
- **Rule-mining system** (M-L-4): DIRECTOR_PATCH_SYSTEM meta-prompt, mine endpoint, proposals page with diff + evidence buckets, apply → `lab_prompt_overrides` that Lab's director resolves at call time (prod untouched).
- **Recipe library** (M-L-3): table + promote button + UI at `/recipes`. Archetype matching in analyze.
- **Similarity retrieval** (M-L-2): pgvector + HNSW + `match_lab_iterations`/`match_lab_recipes` RPCs. "Based on N similar wins" / "Recipe · archetype" chips.
- **pgvector + embeddings** (M-L-1): enabled extension, added embedding columns, OpenAI wrapper, backfill script.

### Development dashboard
- New nav reorg: **Development** dropdown replaces separate Learning + Prompt Lab entries.
- New `/dashboard/development` landing page with **session notes** (working log, CRUD).
- `dev_session_notes` table, `/api/admin/dev-notes` endpoint.

### Prompt Lab core (earlier in the day)
- Initial M-Lab-1 through M-Lab-4 scaffolding: sessions + iterations tables, analyze + direct + refine + render endpoints, upload flow, iteration UI, rating widget, PromoteRecipeControl, Development page.

### Director prompt
- **M2B**: reveal hardening — foreground element must appear in photo's `key_features`, bans hallucinated reveals.

---

## Migrations applied

| # | Name | What |
|---|---|---|
| 002 | `prompt_lab` | sessions + iterations tables + admin RLS |
| 003 | `dev_session_notes` | Development working-log table |
| 004 | `lab_learning` | pgvector, embedding columns, recipes + overrides + proposals |
| 005 | `voyage_embeddings` | briefly swapped to Voyage (1024 dim) |
| 006 | `openai_embeddings` | reverted to OpenAI text-embedding-3-small (1536 dim) |
| 007 | `batches_and_weighted_retrieval` | batch_label + rating-weighted `match_lab_iterations` + `recipe_exists_near` |
| 008 | `lab_render_async` | provider_task_id + render_error + render_submitted_at |
| 009 | `scene_embeddings` | `scenes.embedding vector(1536)` + HNSW partial index + `match_rated_examples` RPC |
| 010 | `match_rated_extended` | `match_rated_examples` returns tags/comment/refinement |
| 011 | `match_loser_examples` | RPC for low-rated (<=2★) Lab + prod retrieval |
| 012 | `render_queued_at` | `render_queued_at` column on prompt_lab_iterations |
| 013 | `session_archived` | `archived boolean` on prompt_lab_sessions |

SQL files in `supabase/migrations/` for record; MCP `apply_migration` is the live path.

---

## Immediate next actions (start here next session)

1. **Spatial grounding** — designed (`docs/superpowers/specs/2026-04-15-spatial-grounding-design.md`), PAUSED. Would give the director coordinate-level composition awareness. Unblock when ready.
2. **Shotstack reverse clips** — push_in/pull_out rhythm in assembled videos discussed but not built.
3. **Production base64→URL fix** — 4 places in `lib/pipeline.ts` still send base64. Lab is fixed; prod needs the same treatment.
4. **Retry-scene endpoint for PRODUCTION** — stuck Kling scenes from property `6f508e16` still need a manual retry. Not built yet.
5. **scene_ratings denormalization for PRODUCTION** — still the highest-value fix for the production learning loop.
6. **Lab → production promotion flow** — Lab changes stay Lab-only. Need explicit "promote to production DIRECTOR_SYSTEM" path.
7. **Structured failure tags on ratings** — proposed, not built. Would give the learning loop richer signal than star ratings alone.
8. **Use the Lab** — continue rating aggressively; every 5★ now auto-promotes to recipe (dedup removed).

---

## Files that matter most

| File | Purpose |
|---|---|
| `lib/pipeline.ts` | Production pipeline orchestrator |
| `lib/prompts/photo-analysis.ts` | Per-room vocab, video_viable rules, suggested_motion |
| `lib/prompts/director.ts` | 11-verb + 8 sub-variant vocab, exterior hard rules, reveal foreground rule (HARDENED 2026-04-14 PM) |
| `lib/prompts/director-patch.ts` | Meta-prompt for Lab rule mining |
| `lib/prompts/style-guide.ts` | Property style guide (built, not injected) |
| `lib/prompt-lab.ts` | Lab core helpers (NEW) |
| `lib/embeddings.ts` | OpenAI embeddings wrapper (NEW) |
| `lib/providers/router.ts` | Camera-movement-first routing |
| `lib/providers/runway.ts` / `kling.ts` | Generation providers |
| `lib/providers/shotstack.ts` | Assembly provider (active if key) |
| `lib/db.ts` | DB helpers including recordCostEvent, upsertSceneRating, fetchRatedExamples, recordPromptRevisionIfChanged |
| `api/pipeline/[propertyId].ts` | Production pipeline entrypoint |
| `api/cron/poll-scenes.ts` | Production cron backstop |
| `api/cron/poll-lab-renders.ts` | Lab render cron (NEW) |
| `api/admin/prompt-lab/*` | Lab endpoints |
| `api/admin/dev-notes.ts` | Development dashboard session notes |
| `src/pages/dashboard/PromptLab.tsx` | Main Lab UI |
| `src/pages/dashboard/PromptLabRecipes.tsx` | Recipe library |
| `src/pages/dashboard/PromptProposals.tsx` | Rule-mining proposals |
| `src/pages/dashboard/Development.tsx` | Dev landing page |
| `src/components/TopNav.tsx` | Global sticky nav with Development dropdown |
| `docs/PROJECT-STATE.md` | This file |
| `docs/PROMPT-LAB-PLAN.md` | Lab design + milestone status |
| `docs/TODO.md` | Current open work |
| `docs/superpowers/specs/2026-04-15-spatial-grounding-design.md` | Spatial grounding design (PAUSED) |
| `docs/superpowers/plans/2026-04-15-unified-embeddings.md` | Unified embeddings plan (COMPLETE) |

---

## One-liner for next session

> Read `docs/PROJECT-STATE.md` first. Prod pipeline is fire-and-forget + cron; all 6 stages unchanged. **Prompt Lab** now has unified embeddings (Lab + prod), negative signal retrieval, Kling concurrency guard with render queue, re-render with different provider, organize mode + archive, and recipe auto-promote on every 5★. Lab changes stay Lab-only — nothing flows back to production yet. Next: spatial grounding (designed, paused), prod base64→URL fix, prod retry-scene endpoint, Lab→prod promotion flow, scene_ratings denormalization.
