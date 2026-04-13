# Walkthrough Roadmap — How We Reach the Primary Goal

Last updated: **2026-04-13**
Status: Sequencing doc. Every item maps back to a specific
acceptance-test box in `docs/WALKTHROUGH-SPEC.md §3`.

This is the single ordered list of engineering work needed to hit
the primary goal. It does not replace `docs/TODO.md` (general-purpose
backlog) or `docs/PROJECT-STATE.md` (session handoff) — it threads
through the subset of work that directly moves the acceptance test.

---

## 1. Acceptance-test coverage matrix

Cross-reference of every §3 box in `WALKTHROUGH-SPEC.md` against the
roadmap items that move it. Any box with no roadmap item is a red
flag and should be filled in.

| Acceptance box | Mapped work |
|---|---|
| ≥1 exterior in final shot list | R2 Coverage enforcer |
| ≥1 interior in final shot list | R2 Coverage enforcer |
| ≥1 unique-feature clip | R2 Coverage enforcer + R3 unique-tags |
| Axes distributed across arc | R4 Arc reorder |
| Opening is exterior/aerial | R4 Arc reorder |
| Closing is exterior / aerial / hero | R4 Arc reorder |
| Interior clips in tour order | R4 Arc reorder |
| No two consecutive same movement | (already live, director §62-65) |
| ≥5 distinct movements | (already live, director) |
| Zero camera exit clips | R5 Style-guide pass (live) + R6 Higgsfield keyframes + R8 QC evaluator v2 |
| Zero hallucinated adjacent rooms | R5 Style-guide pass (live) + R6 Higgsfield + R8 QC evaluator v2 |
| Zero people/text/watermark | R8 QC evaluator v2 |
| Zero warped geometry | R8 QC evaluator v2 |
| No last-2-3-seconds collapse | R11 tail-decay fix |
| Motion matches intent | R7 Motion-verification QC |
| 10–16 clips, ≤60s total | R1 Scene allocator (cap enforcement) |
| Reached `complete` with zero admin actions | R1 + R2 + R9 Autonomy closure |
| Zero `needs_review` scenes | R9 Autonomy closure |
| Zero manual retries | R9 Autonomy closure |

Every primary-goal box has at least one roadmap item.

---

## 2. Work items (ordered)

The order reflects dependencies and value-per-unit-work. Items
marked **[live]** already shipped and are here for traceability.

### R0 — Style guide + director room quotas + plain-language motion [live]
- **Shipped**: commits `71c4830`, `2392886`.
- **What it moved**: anti-hallucination (adjacent-room accuracy),
  motion interpretation, camera-movement diversity.
- **Still outstanding**: see R5 for next cut of style-guide content.

### R1 — Dynamic scene allocator
- **Spec**: `docs/SCENE-ALLOCATION-PLAN.md` (complete).
- **What it moves**: `10–16 clips, ≤60s`, `reached complete with no
  admin actions` (indirectly, by filtering weak photos before they
  burn retries), `zero needs_review` (by not sending doomed scenes
  to generation).
- **Blocker**: photo QA scores need to be persisted on `scenes` rows
  *before* the allocator runs. Currently `runPreflightQA` updates
  prompts on scenes but doesn't persist the score itself. Add a
  `source_photo_qa_score` column and write it in `runPreflightQA`.
- **Files**:
  - `lib/pipeline.ts` — add `runSceneAllocation` as Stage 3.6.
  - `lib/prompts/director.ts` — trim hardcoded quota rules.
  - `supabase/migrations/*` — add the columns from
    `SCENE-ALLOCATION-PLAN.md §2`.
  - `src/pages/dashboard/PropertyDetail.tsx` — Allocation card.
- **Done when**: a test property produces an allocation_decisions row
  per room; Superview shows the table; no regressions in existing
  pass rate on the reference San Massimo property.
- **Depends on**: nothing. Can start immediately.

### R2 — Coverage enforcer (Stage 3.7)
- **Spec**: `docs/COVERAGE-MODEL.md` §4.
- **What it moves**: all three axis boxes in §3, `reached complete
  with no admin actions`.
- **Files**:
  - `lib/pipeline.ts` — `runCoverageEnforcement` after allocation.
  - `lib/coverage.ts` — new module with `enforceCoverage`,
    `fallbackCandidate`, `insertGapFillScene`.
  - `supabase/migrations/*` — add `coverage_axis` (nullable) to
    `scenes`.
  - `src/pages/dashboard/PropertyDetail.tsx` — Coverage card.
- **Done when**: all five cases in `COVERAGE-MODEL.md §6` pass in
  a dry-run harness against snapshot data.
- **Depends on**: R1 (to reshape the scene list before coverage
  runs) and R3 (to deterministically identify unique features).

### R3 — Canonical `unique_tags` vocabulary
- **Spec**: `docs/COVERAGE-MODEL.md §4.3`.
- **What it moves**: `≥1 unique-feature clip`.
- **Files**:
  - `lib/types.ts` — add `UniqueTag` enum.
  - `lib/prompts/photo-analysis.ts` — extend output schema with
    `unique_tags: UniqueTag[]`.
  - `lib/prompts/style-guide.ts` — extend `notable_features` entries
    with `tags: UniqueTag[]` and `photo_ids: string[]`.
  - `supabase/migrations/*` — `photos.unique_tags text[]`.
- **Done when**: the San Massimo and a hero-pool test property each
  return ≥2 `unique_tags` per property, with at least one matching
  an existing photo.
- **Depends on**: nothing. Can run in parallel with R1.

### R4 — Arc reorder pass
- **Spec**: `docs/COVERAGE-MODEL.md §4.4`.
- **What it moves**: arc ordering boxes in `WALKTHROUGH-SPEC.md §3`.
- **Files**:
  - `lib/coverage.ts` — add `reorderArc` that sorts the final
    scene array using a room-class-based key.
- **Done when**: a synthetic scene list where the director returned
  scenes in random order comes back ordered opener → primary interior
  → private interior → highlight → closer.
- **Depends on**: R1 (so there's a stable scene list to reorder).

### R5 — Style guide v2: adjacent-room constraint blocks
- **Spec**: `docs/MULTI-IMAGE-CONTEXT-PLAN.md` Strategy 1 (partial,
  baseline already shipped).
- **What it moves**: `zero hallucinated adjacent rooms`, `camera exit`
  quality boxes.
- **Work**: when `photo.visible_openings = true` (field from R3),
  director appends a 40–80 word "adjacent-room constraint block" to
  that scene's prompt using the style guide's adjacent-room
  description. The block explicitly describes the real cabinetry,
  palette, and lighting the model should render through the opening.
- **Files**:
  - `lib/prompts/photo-analysis.ts` — add `visible_openings`,
    `opening_types[]`, `opening_prominence`.
  - `lib/prompts/director.ts` — inject constraint block.
- **Done when**: the San Massimo living-room scene 3 prompt contains
  an adjacent-room block referencing the real kitchen from the style
  guide.
- **Depends on**: nothing directly. Complements R6.

### R6 — Higgsfield first-last-frame provider
- **Spec**: `docs/HIGGSFIELD-INTEGRATION.md` + `docs/PROJECT-STATE.md`
  §"Higgsfield integration status" + §"Immediate next actions" items
  1–5.
- **What it moves**: `zero hallucinated adjacent rooms`, `motion
  matches intent` for parallax / dolly / slow_pan scenes.
- **Work**: extend `IVideoProvider.generateClip` with an optional
  `endImage`, finish `HiggsfieldProvider`, wire into
  `lib/providers/router.ts`, add optional `end_photo_id` to scenes,
  have the director pick a second end-frame photo for eligible
  scenes.
- **Depends on**: Oliver's go/no-go on the probe clip (see
  `PROJECT-STATE.md §Immediate next actions #1`).

### R7 — Motion-verification QC pass
- **Spec**: new, not yet specced.
- **What it moves**: `on-screen motion matches intent`.
- **Work**: after a clip is produced, a Claude vision pass inspects
  ~6 frames from the clip and compares the observed motion to the
  `camera_movement` field. If mismatched (e.g. Runway produced a
  push-in when the director asked for a parallax), mark the scene
  for **automatic** retry with failover to a provider that handles
  that movement better.
- **Files**: new `lib/prompts/motion-verify.ts`, extend
  `runGenerationWithQC` in `lib/pipeline.ts`.
- **Depends on**: frame extraction (see R8).

### R8 — Frame-extraction QC evaluator v2
- **Spec**: stub in `docs/TODO.md` "Full automated QC".
- **What it moves**: `zero people/text/watermark`, `zero warped
  geometry`, `zero hallucinated adjacent rooms` (as a detector, not
  a preventer — paired with R5 and R6).
- **Options** (pick one before starting): Vercel Sandbox with ffmpeg,
  external frame-extraction API, or a small Railway/Fly worker.
- **Work**: extract N frames per clip, run `qc-evaluator.ts` (already
  written) against them, fail the clip on any violation, trigger
  an automatic retry with provider failover.
- **Depends on**: infra decision. Oliver owns.

### R9 — Autonomy closure
- **Spec**: `docs/AUTONOMY-CHECKLIST.md` §3.
- **What it moves**: `zero admin actions`, `zero needs_review`,
  `zero manual retries`.
- **Work**: delete `api/scenes/[id]/retry.ts` (half-finished),
  hide Approve button in Superview, add smarter provider-failover
  classifier, rename `needs_review` → `blocked` for genuine failures,
  remove all "action" affordances from the golden path.
- **Depends on**: R1 + R2 shipped and green on ≥20 real runs.

### R10 — Delivery + stitch (post-goal)
- **Spec**: `docs/TODO.md` (email notifications, FFmpeg stitching).
- **What it moves**: product experience, not the primary goal
  acceptance test.
- **Depends on**: primary goal green first.

### R11 — Last-2-3-seconds decay fix
- **Spec**: new, stated here. Rationale in
  `docs/PROJECT-STATE.md` §"Video output quality" item 7.
- **What it moves**: the "no clip degrades in the final 2-3 seconds"
  box in `docs/WALKTHROUGH-SPEC.md §3`.
- **Failure pattern**: Oliver has observed across the clip library
  (Kling, Runway, Higgsfield probe) that the first ~60-70% of a clip
  holds architectural coherence, then the final 2-3 seconds collapse —
  geometry warps, anchors drift, invented rooms appear. Consistent
  enough across providers to be treated as a model-attention decay
  pattern, not a prompt bug.
- **Work** — four stacked mitigations, each independently shippable:
  1. **Cap duration at 5s.** Change the director's duration map so
     every scene requests 5s from the provider. This sacrifices the
     "4-second opener" convention but sidesteps the 10s decay tail
     entirely. ~1 hour. File: `lib/prompts/director.ts:195-205`.
  2. **First-last-frame on interior anchor shots.** When R6 lands,
     route any interior scene whose camera_movement is in
     `{parallax, dolly_*, slow_pan}` through Higgsfield with a second
     anchor frame. Grounding both ends reduces late-stage drift.
  3. **Tail trim at stitch time.** When R10 (FFmpeg assembly) lands,
     trim the last 1.0s of every clip with a 300ms ease-out fade.
     Produces a cleaner cut even if the source clip has a late
     wobble. Not available until we have FFmpeg infra.
  4. **QC sampling weighted to the tail.** When R8 (frame extraction)
     lands, sample frames at `[0.2, 0.4, 0.6, 0.75, 0.85, 0.92, 0.98]`
     of clip duration (tail-weighted) and run the QC evaluator. Fail
     the clip if late frames score worse than early frames by >1
     point. Triggers an automatic retry with a different provider.
- **Depends on**: Mitigation 1 is standalone. Mitigation 2 needs R6.
  Mitigation 3 needs R10. Mitigation 4 needs R8.
- **Done when**: a 20-clip sample scored against the acceptance
  box shows zero clips with worse late-frame scores than early-frame
  scores.

---

## 3. Parallelization

Work items that can run in parallel without stepping on each other:

- **Parallel lane A**: R1 (allocator) → R4 (arc reorder) → R9
  (autonomy closure).
- **Parallel lane B**: R3 (unique tags) → R2 (coverage enforcer).
  R2 merges lanes A and B.
- **Parallel lane C**: R5 (style guide v2) and R6 (Higgsfield)
  are independent and can each proceed as soon as their owner is
  ready.
- **Parallel lane D**: R7 + R8 (QC) can start any time after an
  infra decision.

```
[A] R1 ────► R4 ─────────────────────► R9
             │
[B] R3 ────► R2 ────┘
[C] R5 ─────────────────────► (quality gates feed into R8)
[C] R6 ─────────────────────► (quality gates feed into R8)
[D]           R8 ────► R7
```

R9 is gated on R1+R2 having run cleanly on real production traffic
for a meaningful sample (≥20 runs).

---

## 4. Session-level plan

Session tracking lives in `docs/PROJECT-STATE.md` §"Immediate next
actions". That list should always be a prefix of this roadmap's
ordering. If the session handoff and this roadmap diverge, the
roadmap wins for sequencing and the handoff wins for "what
actually happened."

Current session handoff's next-actions map to roadmap items as:

| PROJECT-STATE item | Roadmap item |
|---|---|
| 1. Show Oliver the probe video | R6 prerequisite |
| 2. Extend `IVideoProvider` for keyframes | R6 |
| 3. Finish `HiggsfieldProvider` | R6 |
| 4. Wire into router | R6 |
| 5. Director handoff for end-frame | R6 |
| 6. Scene allocation ruleset | R1 |
| 7. Kling concurrency tuning | orthogonal reliability |
| 8. `KLING_CENTS_PER_UNIT` env | orthogonal accounting |

R2, R3, R4, R5 (v2), R7, R8, R9, R10 are not yet on the session
handoff's "next actions" list. They should be added when this
session's handoff is refreshed (see todo: update PROJECT-STATE.md).

---

## 5. Measurement

A primary-goal run is measured by §3 of `WALKTHROUGH-SPEC.md`. Until
the QC evaluator v2 (R8) can score those boxes automatically, walk
the video manually and log pass/fail per box in the Superview
timeline as a comment on the property.

Target rollup metric: **"goal-passing rate"** = properties that hit
100% of §3 boxes divided by total properties in the window. Starting
baseline is probably 0% or near-zero; the roadmap items should each
move this measurably.

Secondary metrics:
- **`needs_review` rate** — should trend to zero as R1 + R2 + R9 land.
- **Hallucination detection rate** — R8 once available.
- **Per-run cost** — `cost_events` sum; should stay under $X per run
  (Oliver to set X).

---

## 6. Related docs

- `docs/WALKTHROUGH-SPEC.md` — the goal and acceptance test.
- `docs/COVERAGE-MODEL.md` — inside/outside/unique enforcement.
- `docs/AUTONOMY-CHECKLIST.md` — HITL audit.
- `docs/SHOT-VOCABULARY.md` — enum reference.
- `docs/SCENE-ALLOCATION-PLAN.md` — allocator spec (R1).
- `docs/MULTI-IMAGE-CONTEXT-PLAN.md` — anti-hallucination (R5).
- `docs/HIGGSFIELD-INTEGRATION.md` — Higgsfield (R6).
- `docs/PROJECT-STATE.md` — live handoff.
- `docs/TODO.md` — general backlog.
