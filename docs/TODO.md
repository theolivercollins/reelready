# TODO

See `docs/PROJECT-STATE.md` for full project state and `docs/PROMPT-LAB-PLAN.md` for the Lab's roadmap.

## Critical (blocking quality)

- [ ] **Retry-scene endpoint (production)** — stuck Kling scenes at `needs_review` from property `6f508e16` can't be resubmitted without re-running the whole pipeline. Needs `POST /api/scenes/:id/resubmit` + dashboard button.

- [ ] **scene_ratings denormalization (production)** — ratings FK cascade-deletes on rerun. Denormalize `rated_prompt`, `rated_camera_movement`, `rated_room_type`, `rated_provider` onto the rating row and switch FK to `ON DELETE SET NULL`. Oliver has lost 7+ ratings to this.

- [ ] **Lab data generation** — use the Prompt Lab to rate 30+ interior iterations across real archetypes. The learning loop is shipped but inert until there's data.

## High priority

- [ ] **Lab → production promotion** — once a `lab_prompt_overrides` row stabilizes (10+ renders at 4+★), expose an explicit "promote to production DIRECTOR_SYSTEM" button that writes a new `prompt_revisions` entry. Production currently has no path to benefit from Lab learning.

- [ ] **Failover error classification (production)** — `lib/pipeline.ts` excludes provider on ANY error. Only 401/402/400 should trigger failover; 5xx and rate-limit errors should retry.

- [ ] **Shotstack cost tracking** — renders don't log a `cost_events` row. Add per-render flat estimate (~$0.10).

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

## Done this session (2026-04-14 PM)

- [x] Director: reveal foreground must appear in key_features (M2B)
- [x] Prompt Lab core (M-Lab-1 through M-Lab-4)
- [x] Prompt Lab learning loop — pgvector + similarity retrieval + auto-promote recipes + rule mining
- [x] Async Lab renders + cron finalizer
- [x] Drag-drop batches + filter chips + Completed badge + Ready for approval state
- [x] Development dashboard + session notes + nav reorg

## Done earlier (2026-04-14 AM and prior)

See `docs/PROJECT-STATE.md` "What shipped" sections for full history.
