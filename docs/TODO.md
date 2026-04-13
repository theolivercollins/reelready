# TODO

This is the general backlog. For the ordered work toward the primary
goal, see `docs/WALKTHROUGH-ROADMAP.md` instead — that doc is the
authority on sequencing.

The primary goal is stated in `docs/WALKTHROUGH-SPEC.md`. If a backlog
item below doesn't move one of the acceptance-test boxes there, it's
secondary work.

---

## Primary-goal track (see roadmap for detail)

These are the roadmap items mirrored here for a single-page read.
Details, dependencies, and file lists live in `docs/WALKTHROUGH-ROADMAP.md`.

- [ ] **R1** — Ship the dynamic scene allocator.
      Spec: `docs/SCENE-ALLOCATION-PLAN.md`. Unblocked.
- [ ] **R2** — Ship the coverage enforcer (Stage 3.7).
      Spec: `docs/COVERAGE-MODEL.md §4`. Depends on R1 + R3.
- [ ] **R3** — Canonical `unique_tags` vocabulary.
      Spec: `docs/COVERAGE-MODEL.md §4.3`. Unblocked.
- [ ] **R4** — Arc reorder pass.
      Spec: `docs/COVERAGE-MODEL.md §4.4`. Depends on R1.
- [ ] **R5** — Style guide v2 adjacent-room constraint blocks.
      Spec: `docs/MULTI-IMAGE-CONTEXT-PLAN.md` Strategy 1 extension.
- [ ] **R6** — Higgsfield first-last-frame provider.
      Spec: `docs/HIGGSFIELD-INTEGRATION.md`. Gated on Oliver's probe-video
      decision.
- [ ] **R7** — Motion-verification QC pass.
      Spec: new, in `docs/WALKTHROUGH-ROADMAP.md §R7`.
- [ ] **R8** — Frame-extraction QC evaluator v2.
      Blocker: infra decision (Vercel Sandbox vs Railway vs external API).
- [ ] **R9** — Autonomy closure — remove retry endpoint, hide Approve
      button, rename `needs_review → blocked`.
      Spec: `docs/AUTONOMY-CHECKLIST.md §3`. Gated on R1 + R2 shipped
      and green on ≥20 real runs.
- [ ] **R10** — Post-goal: agent email notifications + FFmpeg stitching.

---

## Reliability / observability

- [ ] **Full automated QC** — placeholder auto-pass today. Feeds into R7 + R8.
- [ ] **Supabase Realtime subscriptions** — dashboard currently polls for
      pipeline status. Live updates on `properties` / `scenes` /
      `pipeline_logs` are a DX win, not a goal-blocker.
- [ ] **Daily stats aggregation** — `daily_stats` table exists but nothing
      populates it. Vercel cron at midnight UTC.
- [ ] **Kling concurrency tuning** — `GENERATION_CONCURRENCY=4` today;
      confirm with Oliver when he upgrades plan tier.
- [ ] **`KLING_CENTS_PER_UNIT` env** — currently 0 (trial plan). Update in
      Vercel Production env when Oliver upgrades.
- [ ] **Smarter provider failover** — today we permanently exclude a
      provider after any failure on a scene. Should distinguish
      transient (5xx/429) from permanent (auth/balance/bad request).
      Referenced in `docs/AUTONOMY-CHECKLIST.md §1.1 G4` and
      `docs/PROJECT-STATE.md §Retry failover`.

---

## Product gaps (post-goal)

- [ ] **Agent delivery** — no email/webhook when a property completes.
      No agent-facing property list. The agent round-trip is invisible
      after click-submit.
- [ ] **FFmpeg stitching** — `lib/utils/ffmpeg.ts` exists but can't run
      on Vercel Functions. Options: Shotstack, Creatomate, Vercel
      Sandbox, Railway/Fly worker.
- [ ] **Client-side photo compression** — large photos (5–15MB) slow
      uploads. Add in-browser resize (max 2048px, JPEG q85).
- [ ] **Upload size / progress handling** — no enforcement beyond the
      batch counter. Very large sets time out.
- [ ] **Hourly throughput stats endpoint** — Overview dashboard chart
      shows "Coming soon."
- [ ] **Settings page backend** — `src/pages/dashboard/Settings.tsx` uses
      local React state only.

---

## Out of scope (explicitly deferred)

These were considered and pushed out — listed here so they don't
re-surface as "missing":

- **Google Drive link intake** — cut in commit `4b3384c`. Dead code.
- **Auth / agent accounts** — deferred until output quality is good.
- **Stripe / payments** — deferred until output quality is good.
- **Voiceover narration** — explicit non-goal in
  `docs/WALKTHROUGH-SPEC.md §4`.
- **Agent-selectable style presets** — explicit non-goal. One house
  style for now.
- **Brokerage branding templates** — phase 2.
- **Manual prompt override UI for agents** — will never ship. Violates
  the "no human in the loop" constraint.

---

## Cleanup / chore

- [ ] `index.html` still has Lovable meta tags and old title. Update
      to Listing Elevate branding.
- [ ] Delete `api/scenes/[id]/retry.ts` (half-finished; R9).
- [ ] Hide Superview "Approve" button once R9 lands.
- [ ] Delete `lib/utils/ffmpeg.ts` stub, or move it behind a feature
      flag so it doesn't bitrot until R10.
