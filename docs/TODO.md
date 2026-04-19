# TODO

See `docs/PROJECT-STATE.md` for full project state and `docs/PROMPT-LAB-PLAN.md` for the Lab's roadmap.

## Critical (blocking quality)

- [ ] **Retry-scene endpoint (production)** — stuck Kling scenes at `needs_review` from property `6f508e16` can't be resubmitted without re-running the whole pipeline. Needs `POST /api/scenes/:id/resubmit` + dashboard button.

- [ ] **scene_ratings denormalization (production)** — ratings FK cascade-deletes on rerun. Denormalize `rated_prompt`, `rated_camera_movement`, `rated_room_type`, `rated_provider` onto the rating row and switch FK to `ON DELETE SET NULL`. Oliver has lost 7+ ratings to this.

- [ ] **Production pipeline base64→URL fix** — 4 places in `lib/pipeline.ts` still send base64 image data to providers. Lab is fixed (URL-based for both Claude vision and Runway/Kling). Apply the same pattern to prod.

- [ ] **Failover error classification (production)** — `lib/pipeline.ts` excludes provider on ANY error. Only 401/402/400 should trigger failover; 5xx and rate-limit errors should retry.

## High priority

- [ ] **Lab → production promotion** — once a `lab_prompt_overrides` row stabilizes (10+ renders at 4+★), expose an explicit "promote to production DIRECTOR_SYSTEM" button that writes a new `prompt_revisions` entry. Production currently has no path to benefit from Lab learning.

- [ ] **Spatial grounding** — designed in `docs/superpowers/specs/2026-04-15-spatial-grounding-design.md`. Would give the director coordinate-level composition awareness for motion planning. PAUSED — unblock when ready. Plan at `docs/superpowers/plans/2026-04-15-spatial-grounding.md`.

- [ ] **Shotstack reverse clips** — push_in/pull_out rhythm in assembled videos. Discussed but not built. Would improve pacing of final stitched output.

- [ ] **Structured failure tags on ratings** — proposed, not built. Would give the learning loop richer signal than star ratings alone (e.g. "motion_too_fast", "wrong_framing", "hallucinated_element").

- [ ] **Shotstack cost tracking** — renders don't log a `cost_events` row. Add per-render flat estimate (~$0.10).

- [ ] **Client-side photo compression** — resize to 2048px / JPEG 85 before upload to cut transfer + storage cost.

## Medium priority

- [ ] **Supabase Realtime subscriptions** — dashboard polls every 3s (prod) / 15s (Lab list). Switch to Realtime for cheaper live updates.

- [ ] **Email/webhook notifications** — notify submitting agent when a video is complete.

- [ ] **daily_stats aggregation cron** — table exists, nothing populates it.

- [ ] **Hourly throughput stats endpoint** — Overview dashboard chart.

- [ ] **Settings page backend** — persist to DB (currently React state only).

- [ ] **Lab cost dashboard** — sum of Lab `cost_cents` per batch, visible on the list header.

- [ ] **Lab data generation** — continue using the Prompt Lab to rate iterations across real archetypes. Every 5★ now auto-promotes (dedup removed). The learning loop needs volume to compound.

## Low priority / Phase 2

- [ ] **Full automated QC (production)** — frame extraction needs FFmpeg. Options: Vercel Sandbox, external frame API, self-hosted worker.

- [ ] **Additional providers** — Pika, Seadance. Higgsfield deferred permanently (see `docs/HIGGSFIELD-INTEGRATION.md`).

- [ ] **Beat detection for music sync** — align transitions to beats.

- [ ] **Smart vertical cropping** — subject-aware offset for 9:16.

- [ ] **Brokerage branding templates** — logo + brand colors per brokerage.

- [ ] **Auth upgrade** — agent accounts, operator accounts, API keys.

- [ ] **Visual-embedding option for Lab** — embed the IMAGE not just the analysis text. Higher fidelity, more cost.

- [ ] **Clean up `match_lab_iterations` RPC** — unused since unified embeddings shipped. Still in DB.

## Done 2026-04-15 through 2026-04-19

- [x] Unified embeddings — `scenes.embedding` + HNSW index + `match_rated_examples` RPC + `embedScene()` + backfill (7 prod scenes)
- [x] Negative signal — `match_loser_examples` RPC + "AVOID THESE PATTERNS" block + "Avoiding N losers" chip
- [x] "DO NOT REPEAT" block — prior non-5★ prompts injected on re-analyze
- [x] Kling concurrency guard — `countKlingInFlight()`, auto-fallback, render queue with 30-min expiry
- [x] Re-render with different provider — `rerender.ts` endpoint + "Try with: Kling/Runway" buttons
- [x] Recipe improvements — dedup removed, auto-fill archetype, green success banner
- [x] Organize mode + archive — multi-select, batch move, archive/unarchive, collapse chevrons
- [x] Lab analyze >5MB photos — base64 → URL-based Claude vision
- [x] Lab render >5MB photos — `sourceImageUrl` on `GenerateClipParams`
- [x] Rating on any iteration — no longer gated on `isLatest`
- [x] "Ready for approval" persists after rating — fixed
- [x] Migrations 009–013

## Done 2026-04-14 PM

- [x] Director: reveal foreground must appear in key_features (M2B)
- [x] Prompt Lab core (M-Lab-1 through M-Lab-4)
- [x] Prompt Lab learning loop — pgvector + similarity retrieval + auto-promote recipes + rule mining
- [x] Async Lab renders + cron finalizer
- [x] Drag-drop batches + filter chips + Completed badge + Ready for approval state
- [x] Development dashboard + session notes + nav reorg

## Done earlier (2026-04-14 AM and prior)

See `docs/PROJECT-STATE.md` "What shipped" sections for full history.
