# Back on Track — Video Generation Mastery Design

Last updated: 2026-04-20

See also:
- [../HANDOFF.md](../HANDOFF.md) — current phase state
- [../plans/back-on-track-plan.md](../plans/back-on-track-plan.md) — condensed plan
- [../audits/ML-AUDIT-2026-04-20.md](../audits/ML-AUDIT-2026-04-20.md) — Phase M.1 verdict
- [../state/PROJECT-STATE.md](../state/PROJECT-STATE.md) — what's shipped
- [../archive/completed-plans/2026-04-20-phase-a-spine-and-m1-trace.md](../archive/completed-plans/2026-04-20-phase-a-spine-and-m1-trace.md) — Phase A + M.1 execution plan (completed)

**Date:** 2026-04-20
**Status:** Approved for implementation planning — Phases A, M.1, DQ, DM, CI, C shipped; M.2 and B are the remaining work
**Owner:** Oliver

## Context

Listing Elevate's original goal is a fully-autonomous real estate listing video pipeline: agent uploads 10–60 photos → finished cinematic MP4 (9:16 / 16:9) → delivered by email. Zero human-in-the-loop.

Over the past ~2 weeks we built a capable Prompt Lab and learning loop (legacy single-photo Lab + Phase 2.8 listings Lab), shipped an extensive production-readiness merge (migrations 014–017, smart failover, Lab→prod promotion, Shotstack cost tracking), and on 2026-04-20 evening pivoted the Lab to Atlas Cloud with `kling-v3-pro` as the default across six Kling SKUs.

Three problems remain:

1. **Video generation is not mastered.** Clip quality has not been proven client-ready across room types + shot types. The Atlas / Kling v3 pivot was made without a head-to-head evaluation. Kling v3 has a known shake issue; the mitigation (stability prefix + negative prompt) shipped but has not been visually validated.
2. **The Lab UX is not intuitive.** "Always wondering what's next to improve" — the UI treats all scenes equally and leaves the user to pick. This friction will compound during the head-to-head work that generates 40–60 iterations.
3. **The ML learning loop may be silently broken.** Legacy Lab ratings were supposed to feed production via OpenAI embeddings + `match_rated_examples` retrieval. The user believes this never actually worked. If true, months of rating signal are inert.

The right sequencing is **fix the Lab → verify the learning loop → settle the model question → complete production generation**. Everything downstream of generation (Shotstack assembly polish, email delivery, order form persistence, voiceover, branding) is explicitly deferred per the user's ordering: video generation → video final production → video delivery → video ordering.

## Goals (in scope)

- **G1.** A single, intuitive Lab that feels step-by-step. The Lab becomes the data-generation and R&D surface; eventually it is used only for new-model / new-capability testing once autonomous generation ships.
- **G2.** Confirmed end-to-end learning loop: rating → embedding → retrieval → director injection, with a repeatable trace script as a regression guard.
- **G3.** Consolidated data capture surfaces. One canonical rating + feedback model per iteration / scene. No duplicate fields capturing the same signal.
- **G4.** Evidence-based model routing. A routing table mapping (room × movement) → winning SKU, derived from a bounded head-to-head on one real listing.
- **G5.** Production pipeline that can generate a full property video autonomously, using the winning SKUs, with duration-aware direction (15s / 30s / 60s).

## Non-goals (deferred to post-mastery)

- Shotstack assembly polish (reverse clips, beat sync, smart vertical cropping)
- Email / webhook delivery (Resend)
- Order form persistence (duration, orientation, voiceover toggles, custom request)
- Eleven Labs voiceover API, voice clone
- Brokerage branding render (logo, colors)
- Music pipeline
- Feature shots as a first-class scene type (lightly planned for 30s / 60s director but not separately implemented)
- Legacy Lab UI retirement (legacy UI stays visible to preserve rated data; table `prompt_lab_sessions` + `prompt_lab_iterations` and `v_rated_pool` UNION branch are preserved)
- Autonomous Lab runner (Phase 3 — post-mastery)
- Client-side photo compression, realtime subscriptions, full production QC

## Success criteria

- **Phase A:** a listing with 10+ scenes feels one-click-at-a-time to work through. "What's next?" is always answered by the UI, not by the user hunting.
- **Phase M:** `scripts/trace-director-prompt.ts` produces a director prompt transcript on any listing / property and the transcript either (a) shows the PAST WINNERS / LOSERS / RECIPE blocks populated with real data — meaning the loop works — or (b) shows them missing / empty, in which case we fix the chain before Phase B.
- **Phase B:** a routing table committed as `lib/providers/router-table.ts` listing one winning SKU per (room × movement) bucket, where "winning" means ≥80% of that SKU's iterations in the bucket rated 4★+ AND Oliver's qualitative "client-ready" sign-off.
- **Phase C:** pipeline can produce a full property of clips routed per the table, with duration-aware scene count (15s=4, 30s=6–8, 60s=12), no base64 image payloads, and lazy failover from native Kling to Atlas on credit depletion.

---

## Phase A — Lab "next-action spine" UX redesign

**Estimated effort:** 3–5 days. Frontend-only. No schema changes.

### What

Rework `LabListingDetail.tsx` around an explicit per-scene lifecycle + a top-of-page "Next action" banner. Per-scene status is derived from existing data:

| State | Derivation | Visual |
|---|---|---|
| **Needs first render** | scene has no iterations | sky chip |
| **Rendering** | any iteration has `provider_task_id` set with no `clip_url` and no `render_error` | amber pulse |
| **Needs rating** | latest iteration has `clip_url` and `rating IS NULL` | teal chip |
| **Iterating** | latest iteration has a rating 1–3 AND unpinned refinement_notes exist | violet chip |
| **Done** | any iteration rated ≥ 4 | emerald chip |
| **Archived** | `scene.archived = true` | grey; hidden by default |

The "Next action" banner resolves by priority across all non-archived scenes in the listing: Needs rating → Needs first render → Rendering → Iterating. It shows the single next thing with a one-click advance ("Render 3 scenes that need first pass", "Rate scene 4", etc.).

### Components

- **`NextActionBanner.tsx`** — listing-level banner. Reads scenes, computes the next action, renders a CTA. Pure function of state; optimistic updates from parent keep it responsive.
- **`ShotPlanTable.tsx`** — per-scene row gets a status chip. Clicking a row focuses the scene. Row order by priority (matches banner logic).
- **`SceneCard.tsx`** — no structural change; each section (prompt, iterations, chat, refinement notes) gets a local "next step" hint where obvious (e.g. "Rate this iteration →" on an unrated iteration).
- **Optimistic mutation helpers in `labListingsApi.ts`** — wrap rate / archive / refine so the UI flips state immediately, rolls back on API error.

### Subagent dispatch

- Subagent 1: state-machine + next-action resolver logic (pure TS, unit tests optional)
- Subagent 2: UI rewrite (banner + chip set + row layout)
- Main thread: integration, optimistic update wiring, browser verification

### Out of scope for A

- Schema changes
- Scene chat / iteration chat reorganization (keep as-is)
- Compare / GenerateAll modals (keep as-is)
- Legacy Lab UI changes

---

## Phase M — ML pipeline audit + simplify

**Estimated effort:** 2–3 days. Overlaps with Phase A. Step M.1 is read-only and runs as a parallel subagent at Phase A start. Step M.2 runs after Phase A lands.

### Step M.1 — End-to-end trace (read-only, parallel with A start)

Build `scripts/trace-director-prompt.ts`:

- Accepts `--listing <id>` OR `--property <id>`
- Reconstructs the exact user message the director received at its most recent call: fetches analysis, retrieval queries (`match_rated_examples`, `match_loser_examples`, `match_lab_recipes`), assembles the same block concatenation as `directListingScenes` / prod pipeline
- Writes full transcript to `/tmp/director-trace-<id>.md`
- Prints a checklist summary:
  - Embedding present on each photo? (`prompt_lab_listing_photos.embedding` NOT NULL)
  - Past Winners block present and non-empty?
  - Past Losers block present and non-empty?
  - Recipe match block present?
  - Did `resolveProductionPrompt` return a promoted override, or baseline?
  - How many iterations / scene_ratings exist in each pool (Lab sessions, prod scene_ratings, listing iterations)?

**Run on three inputs:**
1. A recent Phase 2.8 listing
2. A legacy Lab session Oliver rated heavily
3. A production property (ideally one that ran after 2026-04-19 merge)

**Verdict determines M.2 shape:**
- If chain works → M.2 focuses on simplifying capture surfaces + removing dead code
- If chain is broken at any step → fixing the chain becomes the highest-priority task in the whole plan, executed inside M.2 ahead of further cleanup

### Step M.2 — Consolidate (after Phase A lands)

#### M.2a — Capture surface consolidation

Canonical per-iteration fields (keep, writing): `rating`, `rating_reasons`, `user_comment`, `embedding`.
Canonical per-scene fields (keep, writing): `refinement_notes`, `director_prompt`, `chat_messages`.

Soft-deprecate (stop writing, keep reading per user directive Q6-B):
- `iteration.tags` — superseded by `rating_reasons`
- `iteration.refinement_instruction` — legacy single-photo Lab field; superseded by scene-level `refinement_notes`
- `iteration.chat_messages` — superseded by scene-level `chat_messages`

Writing-path audit: verify every INSERT / UPDATE path in `api/admin/prompt-lab/**` and `lib/prompt-lab*.ts` no longer writes the deprecated fields. Reading paths preserved so historical rated data still surfaces.

#### M.2b — Retrieval path pruning

- Delete `match_lab_iterations` RPC (docs flag as unused; verify no call sites, then drop)
- Delete `lib/prompts/prompt-qa.ts` + the dead body of `runPreflightQA` in `lib/pipeline.ts`
- Evaluate rule mining (`DIRECTOR_PATCH_SYSTEM` → `lab_prompt_overrides` → `lab_prompt_proposals`): if no proposal has ever been `applied` and promoted to prod, tag the pathway "keep, simplify" — leave the tables but hide the UI from the main nav until needed. Not a delete.
- Evaluate Lab→prod promotion (`resolveProductionPrompt` → `prompt_revisions`): if no override has ever been promoted, confirm it falls through to baseline cleanly and document the readiness gate. Keep.
- Evaluate recipe bloat: every 4★+ now promotes unconditionally. Count recipes per (room_type × camera_movement). If any bucket has > 10 recipes, add a soft cap (keep top N by rating + recency) rather than re-introducing dedup distance.

#### M.2c — Deliverables

- `docs/ML-DATA-FLOW.md` — one-page canonical map: capture surface → storage field → retrieval query → director injection block. Includes a "what gets stored where" table and a sequence diagram for one render.
- `scripts/trace-director-prompt.ts` committed as regression guard
- Audit report appended to this spec (or to `docs/ML-AUDIT-2026-04-20.md`) with findings per bullet above

#### M.2d — SKU-level signal capture (added 2026-04-20 post-audit)

**Problem discovered during Phase M.1:** `prompt_lab_recipes` stores `provider` ("kling" / "runway") but not `model_used` / SKU. When you rate a `kling-v2-6-pro` iteration 5★, the recipe + `match_rated_examples` both generalize to `provider = "kling"`. The next render picks `ATLAS_VIDEO_MODEL` (default `kling-v3-pro`), ignoring the SKU signal entirely.

This was acceptable when Kling was one endpoint with one model. Atlas Cloud shipped six Kling SKUs 2026-04-20 evening; the learning layer hasn't caught up.

**Fix scope:**

1. **Migration 028:** Add `model_used text` column to `prompt_lab_recipes`. Backfill from `prompt_lab_iterations.provider` (legacy Lab — best we can do) and `prompt_lab_listing_scene_iterations.model_used` (Phase 2.8) where recipe FK resolves.
2. **Extend `match_rated_examples` RPC** to return `model_used` alongside `camera_movement`, `rating`, etc. Extend `RetrievedExemplar` type in `lib/prompt-lab.ts`.
3. **Update exemplar/recipe block rendering** — `renderExemplarBlock` + `renderRecipeBlock` surface the winning SKU to the director, e.g. `[5★ · kitchen · push_in · kling-v2-6-pro]`.
4. **Auto-promote on rate:** when a new recipe is created from a 4★+ iteration (`api/admin/prompt-lab/listings/[id]/iterations/[iterId]/rate.ts` + the legacy Lab rate endpoint), write `model_used` onto the new recipe.
5. **No director-output schema change.** The director still returns `provider_preference`; the new signal lives in the in-context exemplars + recipes. Whether the director should start returning `model_preference` is a follow-up decision deferred to post-mastery.
6. **Static router integration (Phase C consumer):** `lib/providers/router-table.ts` (from Phase B) is the deterministic layer. M.2d makes rating signal *also* propagate via retrieval when an exact recipe match exists. Both layers coexist.

**Why do this inside Phase M.2 instead of Phase B:** Phase B generates ~40–60 new rated iterations. Without M.2d, those ratings inform a one-shot static table and then stop producing signal. With M.2d, every rating during Phase B *also* becomes SKU-granular retrieval signal that keeps helping future listings without needing another manual head-to-head.

**Cost:** one migration + ~3 code paths + RPC update. Roughly half a day. Blocks Phase B in the sense that Phase B's ratings have more value if M.2d lands first.

**Updated sequencing:**

```
Phase A (Lab UX spine)  ————————————————————|
Phase M.1 trace (parallel subagent)  —————|
                                          ↓ verdict
Phase M.2 (consolidate)                   |
  ├─ M.2a capture surfaces                |
  ├─ M.2b retrieval pruning               |
  ├─ M.2c deliverables                    |
  └─ M.2d SKU signal capture ← NEW        |
                                          ↓
Phase B (head-to-head)
                                          ↓
Phase C (router swap, base64→URL, duration-aware director)
```

---

## Phase B — Model head-to-head

**Estimated effort:** 1–2 days of active rating by Oliver; coordination by the assistant.

### Setup

Upload one fresh real listing (10–12 photos). Coverage requirement: kitchen, living room, at least one bedroom, exterior front, drone / aerial, pool if present, one paired scene (start + end frame). The listing runs through the redesigned Lab + audited learning loop.

### Matrix

For each scene, use Generate-all-models to render across the candidate set:

| SKU | Role | When to use |
|---|---|---|
| Native Kling v2.0 | Burn pre-paid credits first | Any shot type v2.0 supports, until 402 / credit-exhausted error; then failover to Atlas v2-master |
| Atlas `kling-v2.6-pro` | Primary candidate (docs say "smoother motion", cheaper) | All shot types |
| Atlas `kling-v3-pro` | Newest default; validates shake fix | All shot types |
| Atlas `kling-v2.1-pair` | Purpose-built for paired scenes | Paired scenes only |
| Atlas `kling-o3-pro` | Premium spot-check | Sample on 2–3 scenes only (expensive, $0.095) |
| Runway | Exterior / drone specialist | Exterior + drone shots only |

### Exit criteria (user directive Q4 — hybrid A+B)

**Qualitative:** Oliver eyeballs the winning SKU's outputs across buckets and signs off as "client-ready."

**Quantitative floor:** for each (room × movement) bucket that has ≥ 3 iterations, the winning SKU must rate 4★+ on ≥ 80% of its iterations in that bucket.

If the floor is met but Oliver says not client-ready, we iterate more in the Lab before moving on. If Oliver signs off but the floor is not met for some buckets, those buckets are marked "provisional" in the routing table and revisited after more signal.

### Output

`lib/providers/router-table.ts` — one row per (room_type, camera_movement) with primary SKU + fallback chain. Check the shake fix specifically on any v3-pro winning row.

---

## Phase C — Production end-to-end (tight)

**Estimated effort:** 2–3 days. Three parallel subagents (C.1 / C.2 / C.3 are independent).

### C.1 — Router swap

- Add Atlas as a first-class provider in `lib/providers/router.ts` (it exists at `lib/providers/atlas.ts` but is Lab-only today)
- Route per `router-table.ts` from Phase B
- Native Kling preferred for shots where v2.0 is a winning SKU, while credits last
- Lazy failover on native Kling 402 / insufficient-credit error → Atlas `kling-v2-master` (same v2.0 shot semantics)
- Preserve Runway for its winning rows (exteriors / drone)
- `GenerateClipParams` already carries `sourceImageUrl` — use it consistently from router

### C.2 — Production base64→URL fix

- Identify the 4 base64 sites in `lib/pipeline.ts` (flagged in `docs/TODO.md` as critical)
- Apply the same pattern Lab uses: pass Supabase Storage URL via `sourceImageUrl`
- Verify with one end-to-end prod pipeline run

### C.3 — Duration-aware director

Add `duration` param (15 | 30 | 60) to the director's input. Per Oliver's directive:

| Duration | Scene count | Per-clip length | Director prompt mode |
|---|---|---|---|
| 15s | 4 | 4s | "prominent features only — pick the single best shot per room and the curb appeal hero" |
| 30s | 6–8 | 5s | "add some detail — include secondary features and one feature closeup" |
| 60s | ~12 | 5s | "full detail pass — include all quotas from current allocation" |

The `duration` param is threaded through the Lab for testing (added to listing create + render flow). The order form is NOT wired yet — that's Phase 2 (video ordering). For now the Lab UI exposes a dropdown on listing create and the production pipeline accepts the param via request body.

Feature shots as a distinct scene type are deferred to post-mastery. The 30s / 60s director can allude to "one feature closeup" using the existing `feature_closeup` camera verb.

---

## Sequencing

```
Day 0 ──────────────────────────────────────────────────────────────
        Phase A (UX redesign)                          ┐
        ├─ subagent 1: state-machine / resolver        │ main + 2 subagents
        └─ subagent 2: UI rewrite                      ┘

        Phase M.1 (trace) ──────────── parallel read-only subagent
        ↓ verdict informs M.2

Day 5 ──────────────────────────────────────────────────────────────
        Phase M.2 (consolidate, code changes)
        ├─ M.2a capture surfaces
        ├─ M.2b retrieval pruning
        └─ M.2c deliverables (ML-DATA-FLOW.md, trace script, audit report)

Day 7 ──────────────────────────────────────────────────────────────
        Phase B (model head-to-head)
        ├─ Oliver rates; assistant orchestrates renders + tracks matrix
        └─ Output: router-table.ts

Day 9 ──────────────────────────────────────────────────────────────
        Phase C (three parallel subagents)
        ├─ C.1 router swap
        ├─ C.2 base64→URL fix
        └─ C.3 duration-aware director

Day 11: video generation mastered → Phase 2 post-mastery unlocked
```

## Governance

- **No git push. No Vercel deploy.** Commit locally after each phase lands. Wait for explicit "push" or "deploy" in-turn.
- `docs/PROJECT-STATE.md` updated at the end of each phase; memory files (`listing_elevate_handoff.md`, `reference_listing_elevate_docs.md`, etc.) updated in the same pass.
- File-revert mystery mitigation: save key decisions to memory as belt-and-braces; commit in small chunks; flag any silent revert immediately rather than retrying in a loop.
- Each phase produces a PR-shaped commit suitable for review even if we never push.

## Deferred backlog (logged in `docs/TODO.md` under "Phase 2 — post-mastery")

- Shotstack reverse clips for push_in / pull_out rhythm
- Shotstack assembly polish (beat sync, smart vertical crop)
- Email delivery via Resend
- Order form persistence (duration, orientation, brokerage branding, voiceover toggles)
- Eleven Labs voiceover API integration
- Voice clone
- Custom request text processing
- Music pipeline
- Brokerage branding render (logo, colors)
- Feature shots as a first-class scene type
- Legacy Lab UI retirement
- Autonomous Lab runner (Phase 3)
- Full production QC (frame extraction)

## Open questions (none blocking)

- If Phase M.1 finds the learning loop is broken, we may need to re-embed historical rated data. Script exists (`scripts/backfill-scene-embeddings.ts`, `scripts/backfill-lab-embeddings.ts`) — run or extend as needed.
- If Phase B's Kling native credits deplete mid-matrix, we lose a clean comparison between native and Atlas v2-master. Mitigation: run the native subset first to preserve budget for the comparison bucket.
