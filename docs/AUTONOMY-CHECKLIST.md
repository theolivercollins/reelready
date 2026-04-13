# Autonomy Checklist — Closing the Human-in-the-Loop

Last updated: **2026-04-13**
Status: Audit + plan. The "Status" column shows where each HITL point
is right now; the "Target" column is what "no human in the loop" means
for it.

Primary goal reference: `docs/WALKTHROUGH-SPEC.md` §2.4.

This doc enumerates every place in the pipeline where a human is
either required or permitted to intervene today. Each one gets a
target state and a closure plan. The goal is that a property moves
from agent-click-submit to playable clips with **zero** admin actions
on the golden path.

---

## 1. HITL inventory (code-audited 2026-04-13)

### 1.1 Pipeline-internal gates

#### G1 — `needs_review` escalation on < 6 passing clips
- **Where**: `lib/pipeline.ts:688-715` (generation + inline QC loop).
- **Trigger**: After all retries, if any scene landed in `needs_review`
  AND fewer than 6 scenes passed, the property itself is flagged
  `needs_review` and the run halts.
- **Today**: A human admin must click rerun, manually retry the scene,
  or approve a borderline scene in the Superview.
- **Target**: Never reach this state on the golden path. Pre-generation
  QA + coverage enforcement + retries + provider failover should
  yield ≥6 passing clips on every reasonable property. If fewer
  than 6 passes remain after all automated recovery, the failure
  reason is a real blocker (provider outage, no photos, etc.) and
  the property moves to `blocked`, not `needs_review`.
- **Closure plan**:
  1. Ship the dynamic scene allocator (`docs/SCENE-ALLOCATION-PLAN.md`)
     so weak photos are filtered *before* generation, reducing the
     pass rate collapse that triggers this gate.
  2. Improve inline retry logic to try an alternate camera movement
     AND an alternate provider before giving up on a scene.
  3. Lower the 6-clip floor to 4 for properties with <8 eligible
     photos, since the floor shouldn't exceed the supply.
  4. When the floor can't be met because of genuine provider
     unavailability, transition to `blocked` with a reason string
     instead of `needs_review`. `needs_review` becomes extinct.

#### G2 — Pre-flight QA auto-revise (non-blocking)
- **Where**: `lib/pipeline.ts:439-555` (`runPreflightQA`) +
  `lib/prompts/prompt-qa.ts`.
- **Trigger**: Every scene pre-generation. If Claude returns a
  stability score <8 and a revised prompt, the scene row is updated.
- **Today**: Fully automatic. No human required.
- **Target**: Stay automatic. This is already the model citizen of
  the pipeline. Future work: also let it rewrite `camera_movement`
  when the prompt is unrescuable with the current movement (requires
  allowing the pre-flight QA prompt to return a replacement movement).
- **Closure plan**: extend `PromptQAResult` to include
  `revised_camera_movement?: CameraMovement` and respect it in
  `runPreflightQA`.

#### G3 — `suggested_discard` photo filter
- **Where**: `lib/prompts/photo-analysis.ts` output + `selectPhotos`
  in `lib/pipeline.ts:214-257`.
- **Today**: Fully automatic. Claude flags photos as discarded with a
  reason; the selector excludes them. Dashboard shows the reason to
  admin but does not require a decision.
- **Target**: No change. This is already zero-HITL.

#### G4 — Provider failover on retry
- **Where**: `lib/pipeline.ts` (retry loop) + `lib/providers/router.ts`
  `selectProvider`.
- **Today**: Fully automatic. Failed provider excluded; next attempt
  uses a different one.
- **Target**: Keep automatic. Refine to only exclude on "permanent"
  errors (auth, balance, bad request) so transient 5xx/429 don't
  permanently burn a provider for the scene. Documented in
  `docs/PROJECT-STATE.md` "Retry failover" section.

### 1.2 Admin endpoints that exist today

#### E1 — `POST /api/scenes/[id]/approve`
- **Where**: `api/scenes/[id]/approve.ts`.
- **Today**: Marks a `needs_review` scene as `complete`. Admin-only.
  Used after manual QC in the Superview.
- **Target**: Deprecate. If G1 goes extinct, this endpoint has no
  callers on the golden path. Keep it as a break-glass for now but
  remove the UI affordance once the allocator + coverage work lands.
- **Closure plan**: after shipping G1's replacement, leave the API
  live but hide the "Approve" button in `src/pages/dashboard/PropertyDetail.tsx`.

#### E2 — `POST /api/scenes/[id]/retry`
- **Where**: `api/scenes/[id]/retry.ts`. Accepts `{ prompt }`.
- **Today**: Writes a new prompt, resets scene to `pending`.
  **Important**: the TODO at line 34 shows the regeneration trigger
  is not wired — admin edits do not actually run the scene. This is
  a half-finished feature that should either be completed or removed.
- **Target**: Remove. Manual prompt editing is incompatible with
  "no human in the loop." If the pre-flight QA + failover can't
  produce a passing clip, the fix is upstream (better photo analysis,
  better style guide, better director), not an admin typing a
  better prompt.
- **Closure plan**: delete the endpoint and the "Retry with prompt"
  UI in the Superview. Leave a simple "Regenerate scene" button that
  re-runs the automated pipeline for that one scene with no human
  input.

#### E3 — `POST /api/properties/[id]/rerun`
- **Where**: `api/properties/[id]/rerun.ts`.
- **Today**: Full reset — wipes scenes, logs, cost, state → queued.
  The client then kicks off the pipeline.
- **Target**: Keep as a break-glass for iterating on prompts during
  development. Not on the golden path. An automated backstop already
  handles stranded clips via `api/cron/poll-scenes.ts`.

#### E4 — `POST /api/admin/recover-kling` (one-shot)
- **Where**: `api/admin/recover-kling.ts`.
- **Today**: Given a Kling task ID, fetches the completed clip.
- **Target**: Keep as a break-glass. Should virtually never be needed
  once the cron backstop proves out in production.

#### E5 — `GET /api/admin/prompts`
- **Where**: `api/admin/prompts.ts`.
- **Today**: Read-only view of the three system prompts for the
  Superview.
- **Target**: Read-only is fine; it's not a HITL gate, just
  observability.

### 1.3 Upload-side human steps

#### U1 — Photo upload by agent
- **Where**: `src/pages/Upload.tsx` → `POST /api/properties`.
- **Today**: The agent uploads photos. Drive intake was cut, so the
  only path in is drag-and-drop in the browser.
- **Target**: This is the agent-side transaction, not a HITL on the
  pipeline side. It's allowed. The "no human in the loop" constraint
  applies from submit → complete, not before submit.

#### U2 — Room labeling / photo tagging
- **Today**: None. Claude labels room types automatically.
- **Target**: Never re-introduce manual tagging.

#### U3 — Drive link intake
- **Status**: Cut in commit `4b3384c`. No HITL, just dead.
- **Target**: If re-introduced, it must be zero-HITL: paste a link,
  pipeline fetches photos, no review step.

### 1.4 Post-generation steps

#### P1 — Delivery to agent
- **Today**: No automated delivery. Admin sees clips in Superview;
  agent currently has no view or notification.
- **Target**: Email notification + an agent-facing page listing their
  properties' clips, triggered by `properties.status → complete`.
  This is a product gap, not a HITL gate, but it's on the same path.
- **Closure plan**: see `docs/TODO.md` "Email/webhook notifications."

#### P2 — Stitched final video
- **Today**: Not produced. Individual clips are the deliverable.
- **Target**: Eventually stitch automatically. No HITL at any point
  in the stitch.

---

## 2. Status table (one row per HITL point)

| ID | Description | Current | Target | Blocker |
|---|---|---|---|---|
| G1 | `needs_review` on <6 passing | HITL | extinct / `blocked` only | allocator + coverage enforcer |
| G2 | Pre-flight prompt auto-revise | automatic ✓ | automatic ✓ | — |
| G3 | `suggested_discard` photo filter | automatic ✓ | automatic ✓ | — |
| G4 | Provider failover | automatic ✓ | smarter failover | permanent-vs-transient classifier |
| E1 | `/api/scenes/[id]/approve` | HITL available | deprecated | G1 extinct |
| E2 | `/api/scenes/[id]/retry` | HITL (half-broken) | removed | commit removal |
| E3 | `/api/properties/[id]/rerun` | break-glass | break-glass | — |
| E4 | `/api/admin/recover-kling` | break-glass | break-glass | — |
| E5 | `/api/admin/prompts` | read-only | read-only | — |
| P1 | Delivery to agent | none | email + agent page | product work |
| P2 | Stitched video | none | automatic | FFmpeg infra |

**Goal state**: every row in this table is either automatic, read-only,
or break-glass only (accessible but never used on the golden path).

---

## 3. Order of closure

1. **Ship the allocator + coverage enforcer** (one track).
   Outcome: G1 can't fire on normal properties. E1 and E2 become
   unreferenced on the golden path.
2. **Smarter failover classifier** (half-day). Outcome: G4 better.
3. **Remove E2** and hide E1 in the Superview UI. Outcome: admin
   can't even click the buttons.
4. **Replace G1's `needs_review` state with `blocked` + reason**.
   Outcome: observability for genuine failures without a
   manual-action gate.
5. **Ship P1** (email + agent view). Outcome: full agent round-trip
   is automated.
6. **Ship P2** (stitched video). Outcome: cinematic walkthrough is
   a single downloadable asset.

At step 4, the "no human in the loop" box in
`docs/WALKTHROUGH-SPEC.md §3` is satisfied for the pipeline itself.
Steps 5–6 complete the product experience but are not strictly
required to pass the spec.

---

## 4. Invariants to hold while closing

1. **No new admin affordances** get added to the Superview UI
   during this work. If a button would require a click on the golden
   path, it's a regression.
2. **Break-glass endpoints keep working**. We don't want the admin
   backstop removed until the automation is proven on ≥20 real
   runs.
3. **`needs_review` does not become a silent success path**. If
   the allocator merely suppresses the escalation without raising
   quality, we've moved the HITL point underground, not removed it.
   Every run that *would have* been `needs_review` under the old
   rules should be logged with a reason even after the rename to
   `blocked`.
4. **The observability layer stays rich**. Removing HITL doesn't
   mean removing visibility. The Superview still shows every
   decision the automation made; admins just can't override them on
   the golden path.

---

## 5. Related docs

- `docs/WALKTHROUGH-SPEC.md` — the primary goal.
- `docs/COVERAGE-MODEL.md` — coverage enforcement spec.
- `docs/SCENE-ALLOCATION-PLAN.md` — dynamic allocator spec.
- `docs/WALKTHROUGH-ROADMAP.md` — sequencing of the above.
- `docs/PROJECT-STATE.md` — live session handoff.
