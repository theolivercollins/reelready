# TODO

See `docs/PROJECT-STATE.md` for full project state and `docs/PROMPT-LAB-PLAN.md` for the Lab's roadmap.

## Critical (blocking quality)

- [x] **Retry-scene endpoint (production)** — shipped 2026-04-20. `POST /api/scenes/:id/resubmit` + `POST /api/scenes/:id/retry` both do full regeneration with failover; dashboard surfaces Resubmit / Try <other provider> / Edit + resubmit buttons on any needs_review/failed scene in `PropertyDetail` + `Pipeline`. Uses `classifyProviderError` to distinguish permanent errors (failover) from capacity/transient (let cron retry).

- [x] **scene_ratings denormalization (production)** — shipped 2026-04-20. Migration 014 adds `rated_*` columns, backfills, switches FK to `ON DELETE SET NULL`, and rewrites `match_rated_examples` + `match_loser_examples` to read denorm columns first. `upsertSceneRating` + `fetchRatedExamples` updated. Ratings now survive rerun.

- [ ] **Lab data generation** — use the Prompt Lab to rate 30+ interior iterations across real archetypes. The learning loop is shipped but inert until there's data.

## High priority

- [x] **Lab → production promotion** — shipped 2026-04-20. `POST /api/admin/prompt-lab/promote-to-prod` writes a new `prompt_revisions` row with `source='lab_promotion'` + audit link back to the override. Production's `resolveProductionPrompt` helper reads the latest promoted revision at pipeline run time; `/dashboard/development/proposals` shows a readiness gate (≥10 renders, avg ≥4.0, winners ≥2× losers) with Promote / Force buttons.

- [x] **Failover error classification (production)** — shipped 2026-04-20. `lib/providers/errors.ts` classifies errors as `permanent | capacity | transient | unknown`. `runGenerationSubmit` + the retry/resubmit endpoints fail over only on permanent errors; capacity + transient errors leave the scene pending for cron retry.

- [x] **Shotstack cost tracking** — shipped 2026-04-20. `runAssembly` now logs one `cost_events` row per aspect-ratio render; widened `recordCostEvent` provider enum. `SHOTSTACK_CENTS_PER_RENDER` env (default 10¢) lets us tune without a deploy. Migration 017 widens the provider/unit_type CHECK constraints.

- [ ] **Client-side photo compression** — resize to 2048px / JPEG 85 before upload to cut transfer + storage cost.

## Medium priority

- [ ] **Supabase Realtime subscriptions** — dashboard polls every 3s (prod) / 15s (Lab list). Switch to Realtime for cheaper live updates.

- [ ] **Email/webhook notifications** — notify submitting agent when a video is complete.

- [ ] **daily_stats aggregation cron** — table exists, nothing populates it.

- [ ] **Hourly throughput stats endpoint** — Overview dashboard chart.

- [ ] **Settings page backend** — persist to DB (currently React state only).

- [ ] **Lab cost dashboard** — sum of Lab `cost_cents` per batch, visible on the list header.

## Low priority / Phase 2

- [ ] **Full automated QC (production)** — frame extraction needs FFmpeg. Options: Vercel Sandbox, external frame API, self-hosted worker.

- [ ] **Additional providers** — Pika, Seadance. Higgsfield deferred permanently (see `docs/HIGGSFIELD-INTEGRATION.md`).

- [ ] **Beat detection for music sync** — align transitions to beats.

- [ ] **Smart vertical cropping** — subject-aware offset for 9:16.

- [ ] **Brokerage branding templates** — logo + brand colors per brokerage.

- [ ] **Auth upgrade** — agent accounts, operator accounts, API keys.

- [ ] **Visual-embedding option for Lab** — embed the IMAGE not just the analysis text. Higher fidelity, more cost.

## Done this session (2026-04-20)

- [x] Migration 014 — denormalize scene_ratings + FK to SET NULL + updated unified retrieval RPCs
- [x] Migration 015 — Lab ML integrity: split `refiner_rationale` from `user_comment`, partial-unique recipes per source iteration, `prompt_lab_iterations_complete` view
- [x] Migration 016 — `lab_prompt_override_readiness` view, promotion audit columns on `lab_prompt_overrides`, `source` column on `prompt_revisions`
- [x] Migration 017 — widen cost_events `provider` + `unit_type` CHECK constraints to cover shotstack/openai/renders
- [x] Shotstack cost tracking per assembly render (horizontal + vertical separately logged)
- [x] `lib/providers/errors.ts` + classified failover in submit/retry/resubmit
- [x] `api/scenes/:id/resubmit` + updated `retry.ts` that actually dispatches to the provider
- [x] Dashboard UI: `ResubmitControls` on PropertyDetail, inline buttons on Pipeline `needs_review` list
- [x] Split refiner rationale from user_comment in Lab retrieval + mining (fix ML signal contamination)
- [x] Recipe dedup: one recipe per iteration enforced by DB partial unique index + rate.ts guard
- [x] `resolveProductionPrompt` so production director picks up promoted Lab overrides at run time
- [x] `api/admin/prompt-lab/promote-to-prod` + readiness view + Promote/Force UI on proposals page

## Done 2026-04-14 PM

- [x] Director: reveal foreground must appear in key_features (M2B)
- [x] Prompt Lab core (M-Lab-1 through M-Lab-4)
- [x] Prompt Lab learning loop — pgvector + similarity retrieval + auto-promote recipes + rule mining
- [x] Async Lab renders + cron finalizer
- [x] Drag-drop batches + filter chips + Completed badge + Ready for approval state
- [x] Development dashboard + session notes + nav reorg

## Done earlier (2026-04-14 AM and prior)

See `docs/PROJECT-STATE.md` "What shipped" sections for full history.
