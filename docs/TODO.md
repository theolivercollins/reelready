# TODO

See `docs/PROJECT-STATE.md` for full project state, architecture, and recent changes. This file is the short punch list of open work.

## Critical (blocking quality)

- [ ] **Kitchen quota tuning** — Director's aesthetic-first tiebreaker is too sticky and sometimes picks only 2 kitchen clips when it should pick 3. Loosen so the second kitchen angle is chosen from a complementary composition even if its aesthetic score is slightly lower. `lib/prompts/director.ts`.

- [ ] **feature_closeup validation** — New sub-variant added to the 11-verb vocab + 8 cinematographer shot styles. Not yet proven on Runway output. Generate 3-5 samples (tub, chandelier, range, faucet, front door hardware) and confirm Runway keeps the subject in focus with shallow DoF rather than drifting to a wide.

- [ ] **Stuck Kling scenes** — 5 scenes from the last run are sitting at `needs_review` after Kling 1102 balance errors. Need a manual "retry scene" endpoint + dashboard button so a single failed scene can be re-submitted without re-running the whole pipeline.

## High priority

- [ ] **scene_ratings cascade fix** — Ratings currently FK to `scenes.id` with cascade delete. If a property is re-run, old scene rows are deleted and historical ratings vanish. Denormalize room_type, camera_movement, prompt, provider, clip_url onto `scene_ratings` at rating time so the learning corpus survives scene deletion.

- [ ] **Failover error classification** — `lib/pipeline.ts` currently excludes a provider from fallback on ANY error. A transient 429/500 from Runway should retry; only permanent errors (auth, invalid request, content policy) should trigger failover to Kling.

- [ ] **Shotstack cost tracking** — Assembly stage runs through Shotstack when `SHOTSTACK_API_KEY` is set, but no cost_events row is written. Add a per-render flat estimate (~$0.10) until Shotstack exposes usage in the render callback.

- [ ] **Client-side photo compression** — Large phone photos (5-15MB) should be resized to max 2048px / JPEG 85 before upload to Supabase Storage. Use `browser-image-compression`. Cuts upload time and storage cost.

## Medium priority

- [ ] **Supabase Realtime subscriptions** — Dashboard currently polls every 3s. Switch to Realtime channels on `properties`, `scenes`, `pipeline_logs` for cheaper live updates.

- [ ] **Email/webhook notifications** — Notify the submitting agent when a video is complete. `properties.submitted_by` can hold an email. Send via Resend.

- [ ] **daily_stats aggregation cron** — Table exists, nothing populates it. Daily Vercel Cron that aggregates completed properties, clips, retries, costs, and avg processing time.

- [ ] **Hourly throughput stats endpoint** — Overview dashboard chart still says "Coming soon". Needs `/api/stats/hourly` feeding time-series data.

- [ ] **Settings page backend** — `src/pages/dashboard/Settings.tsx` is local React state only. Persist to a `settings` table or env vars.

## Low priority / Phase 2

- [ ] **Full automated QC** — All clips currently auto-pass. QC evaluator prompt exists (`lib/prompts/qc-evaluator.ts`) but frame extraction needs FFmpeg (not available in Vercel Functions). Options: Vercel Sandbox, external frame API, or self-hosted worker.

- [ ] **Additional providers** — Pika, Seadance when APIs are accessible. Higgsfield is deferred — see `docs/HIGGSFIELD-INTEGRATION.md`.

- [ ] **Beat detection for music sync** — Align clip transitions to beats in the selected music track.

- [ ] **Smart vertical cropping** — Use photo analysis (subject position) to offset the 9:16 crop toward the main subject instead of a center crop.

- [ ] **Brokerage branding templates** — Logo upload, brand colors, standard intro/outro per brokerage.

- [ ] **Auth** — No authentication today. Need agent accounts, operator accounts, and API keys.
