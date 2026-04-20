# TODO

See `docs/PROJECT-STATE.md` for full project state and `docs/PROMPT-LAB-PLAN.md` for the legacy Lab's roadmap.

## Critical (blocking quality)

- [ ] **Validate shake fix on fresh Atlas renders** — stability prefix + `negative_prompt` now ship every render but only affect new iterations. Render one push-in and one top-down, visually confirm reduced shake. If still shaky, lower cfg_scale (Atlas default ~0.5, try 0.3–0.4).
- [ ] **Production pipeline base64→URL fix** — 4 places in `lib/pipeline.ts` still send base64. Lab is fixed (URL-based); prod needs the same treatment.

## Phase 3 prerequisites (autonomous iterator foundations)

- [ ] **Prompt rewrite pass at render time** — replace the raw `"ADDITIONAL USER DIRECTIVES FROM PRIOR ITERATIONS:"` concat in render.ts with a Sonnet call that rewrites director_prompt cleanly incorporating refinement_notes. The `update_director_prompt` chat tool is a partial fix but not automatic.
- [ ] **Route paired scenes to `kling-v2-1-pair`** — it's the purpose-built start-end-frame SKU at $0.076. Currently only reachable via "Generate all" checkboxes. Should auto-select when `scene.use_end_frame=true && scene.end_photo_id != null`.
- [ ] **Expanded v_rated_pool usage** — the listings director now reads it for retrieval. Autonomous iterator will also need it for scene-level decisions (which model performs best on kitchens, etc.). Build `rated-pool-analytics.ts` helpers.
- [ ] **Budget + stop conditions** — per-listing and per-scene spend caps, stop at 4★+ reached or N iterations. Needed before enabling any autonomous loop.
- [ ] **Scene prioritization logic** — which scene does the iterator tackle first? Lowest best-rating? Most variance across iterations? Oldest unreviewed?

## High priority

- [ ] **Spatial grounding** — designed in `docs/superpowers/specs/2026-04-15-spatial-grounding-design.md`. Coordinate-level composition awareness for motion planning. Plan at `docs/superpowers/plans/2026-04-15-spatial-grounding.md`. PAUSED.
- [ ] **Shotstack assembly for Lab listings** — the legacy Lab and prod both assemble final videos via Shotstack, but listings Lab currently produces standalone iterations only. Wire in a "Assemble listing" action that composes the top-rated iteration per scene into a final walkthrough.
- [ ] **Shotstack reverse clips** — push_in/pull_out rhythm in assembled videos. Discussed but not built.
- [ ] **Client-side photo compression** — resize to 2048px / JPEG 85 before upload to cut transfer + storage cost.
- [ ] **Delete legacy iteration chat UI path** — the endpoint + DB column remain but unused. Once confident no downstream code reads it, remove.

## Medium priority

- [ ] **Supabase Realtime subscriptions** — dashboard polls every 5s (listing detail while analyzing/directing/rendering). Switch to Realtime for cheaper live updates.
- [ ] **Email/webhook notifications** — notify submitting agent when a video is complete.
- [ ] **daily_stats aggregation cron** — table exists, nothing populates it.
- [ ] **Hourly throughput stats endpoint** — Overview dashboard chart.
- [ ] **Settings page backend** — persist to DB (currently React state only).
- [ ] **Lab cost dashboard** — sum of Lab `cost_cents` per batch, visible on the list header. Listings side partially covered by the per-model breakdown in header stats.
- [ ] **Recipe analytics for listings Lab** — surface which recipes have highest hit rate on listings (times_applied count already exists).
- [ ] **Iteration-chat history viewer** — the data is still in `prompt_lab_listing_scene_iterations.chat_messages`; no UI surfaces it now that scene chat is primary.

## Low priority / Phase 2

- [ ] **Full automated QC (production)** — frame extraction needs FFmpeg. Options: Vercel Sandbox, external frame API, self-hosted worker.
- [ ] **Additional providers** — Pika, Seadance. Higgsfield deferred permanently.
- [ ] **Beat detection for music sync** — align transitions to beats.
- [ ] **Smart vertical cropping** — subject-aware offset for 9:16.
- [ ] **Brokerage branding templates** — logo + brand colors per brokerage.
- [ ] **Auth upgrade** — agent accounts, operator accounts, API keys.
- [ ] **Visual-embedding option for Lab** — embed the IMAGE not just the analysis text. Higher fidelity, more cost.
- [ ] **Clean up `match_lab_iterations` RPC** — unused since unified embeddings shipped. Still in DB.

## Done 2026-04-20 (evening — Phase 2.8 Listings Lab)

- [x] Atlas Cloud integration — 6 Kling SKUs registered (v3-pro, v3-std, v2.6-pro, v2.1-pair, v2-master, o3-pro); Wan 2.7 removed
- [x] Atlas output-URL parser fix — handles `outputs: string[]` (Atlas actual shape) in addition to `Array<{url}>`. All prior "finished without an output URL" iterations recovered.
- [x] Migration 023 — 4 new tables for listings Lab; `v_rated_pool` extended with 3rd UNION branch
- [x] Migration 024 — iteration.chat_messages, scene.refinement_notes
- [x] Migration 025 — scene.use_end_frame; backfill `false` for end_photo_id IS NULL
- [x] Migration 026 — scene.chat_messages, iteration.archived, iteration.rating_reasons
- [x] Migration 027 — scene.archived
- [x] Cron-based listing lifecycle — `poll-listing-lifecycle` + `poll-listing-iterations` (fire-and-forget doesn't survive Vercel)
- [x] Scene-level streaming chat (Haiku 4.5) with `save_future_instruction` + `update_director_prompt` tools
- [x] Rating reasons modal + fixed taxonomy (6 positive / 15 negative / other)
- [x] Scene archive (hide from shot plan) + iteration archive (soft hide, keeps signal)
- [x] End-frame toggle; stop auto-cropping on unpaired scenes
- [x] Shake mitigation — stability prefix + negative_prompt on every Atlas render
- [x] Recipe + exemplar + loser retrieval restored in listings director (reads `prompt_lab_recipes`, `v_rated_pool`)
- [x] Per-iteration actions — Regenerate, Show prompt, Copy, Archive, Delete
- [x] Generate-all-models modal + A/B/C/D Compare modal
- [x] Master-detail UI — ShotPlanTable + focused SceneCard; newest iteration auto-expanded, others collapsed
- [x] Per-scene end-frame chip, Render-all skips archived scenes
- [x] LabListingNew default-model picker — all 6 Kling options with prices

## Done 2026-04-20 (morning — legacy Lab)

- [x] Banner system overhaul — "Generation approval needed" (sky blue) + "Iteration approval needed" (teal), based on latest iteration only; card sorting by priority within batches
- [x] 4★ backup recipes — auto-promote 4★ as backup (`backup_` archetype prefix, `rating_at_promotion=4`); 4★+ marks session completed
- [x] Refine from any iteration — refine controls ungated from `isLatest`; can branch from older iterations
- [x] Recipe dedup fully removed — dropped `prompt_lab_recipes_source_iteration_unique` index; every 4★+ promotes unconditionally
- [x] Production readiness merge — migrations 014–017, error classification, resolveProductionPrompt, resubmit endpoint, promote-to-prod endpoint, smart failover, Shotstack cost tracking, dashboard resubmit buttons
- [x] Bug fix: duplicate recipe 500 on double-click
- [x] Bug fix: SyntaxError in sessions.ts from conflict resolution

## Done 2026-04-19 (production-readiness merge, commit 65dcc7d)

- [x] scene_ratings denormalization — migration 014
- [x] Failover error classification — `lib/providers/errors.ts`
- [x] Shotstack cost tracking — migration 017
- [x] Retry-scene endpoint (production) — `api/scenes/[id]/resubmit.ts`
- [x] Lab→prod promotion flow — `promote-to-prod.ts` + `resolveProductionPrompt` + migration 016
- [x] Refiner rationale split — migration 015
- [x] Migrations 014–017

## Done 2026-04-15 through 2026-04-19

- [x] Unified embeddings — `scenes.embedding` + HNSW + `match_rated_examples` + backfill
- [x] Negative signal — `match_loser_examples` + "AVOID THESE PATTERNS" block
- [x] "DO NOT REPEAT" block — prior non-5★ prompts injected on re-analyze
- [x] Kling concurrency guard — `countKlingInFlight()`, auto-fallback, render queue
- [x] Re-render with different provider — `rerender.ts`
- [x] Recipe improvements — dedup removed, auto-fill archetype, green success banner
- [x] Organize mode + archive — multi-select, batch move, archive/unarchive
- [x] Lab analyze + render >5MB photos — URL-based input
- [x] Rating on any iteration — ungated from `isLatest`
- [x] Migrations 009–013

## Done 2026-04-14 PM

- [x] Director: reveal foreground must appear in key_features (M2B)
- [x] Prompt Lab core (M-Lab-1 through M-Lab-4)
- [x] Prompt Lab learning loop — pgvector + similarity retrieval + auto-promote recipes + rule mining
- [x] Async Lab renders + cron finalizer
- [x] Drag-drop batches + filter chips + Completed badge + Ready for approval state
- [x] Development dashboard + session notes + nav reorg

## Done earlier

See `docs/PROJECT-STATE.md` "What shipped" sections for full history.
