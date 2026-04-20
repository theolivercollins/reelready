# Autonomous Prompt Lab — Self-Improving Video Generation

**Date:** 2026-04-19
**Status:** Design draft, awaiting review
**Branch:** `feature/machine-learning-improvement`
**Repo:** `real-estate-pipeline` (Listing Elevate)

---

## Goals (Oliver's own words, preserved for reference)

1. **20× the current ML iteration throughput.** Oliver has spent hours manually rating + refining inside the Prompt Lab. An agent should do what he was doing — run the rate → refine → re-render loop autonomously.
   - *How the 20× actually happens (MVP, single agent):* agent doesn't wait between renders, evaluates prompt candidates in LLM-only mode (free + near-instant), and runs while Oliver sleeps or works on other things. Effective throughput gain is *wall-clock-hours-for-Oliver*, not literal parallelism. Multi-agent parallelism is a later phase.
2. **Visibility of the machine's knowledge.** It should be known, benchmarked, easily accessible. We should see how much more iteration is needed until the machine produces 10/10 results for every possible scene/angle/movement combination.
3. **See strengths + weaknesses at a glance.** Which scene types is it great at (e.g., kitchen tunnel push_in), which is it bad at (e.g., northern wooded-cabin exteriors), so Oliver can direct resources at the weak cells.
4. **Gap detection + how to fill.** The dev portal should show lack-of-knowledge regions and the path to fill them.
5. **Mistake prevention at both dev AND production level.** A failure that's been seen once should not recur for a paying customer.
6. **Chat + feedback to the agent.** Oliver can talk to a Claude Sonnet-backed agent mid-run, give direction, and rate both outputs *and* the agent's decisions.
7. **Rework Prompt Lab UI.** The current UI is not user-friendly. This project's IA refresh should make viewing iterations efficient and distinguish human vs. agent runs with logs.

---

## Non-Goals (explicit)

- **Full Prompt Lab redesign from scratch.** IA refresh only. Existing flows keep their mental model.
- **Multi-agent parallelism.** MVP is one autonomous agent at a time.
- **A new video-generation provider.** We work with Kling + Runway + (maybe) Luma + (maybe) Higgsfield. A cheaper provider is a later optimization.
- **Automated promote-to-prod.** Every prod override stays gated by Oliver.
- **Prod pipeline consumption of failure-tags.** Only approved director-body overrides flow to prod; raw failure-tag data stays Lab-scoped.

---

## Current State (what's already built, confirmed by code inspection 2026-04-19)

- **Unified retrieval already pools Lab + prod ratings** via `match_rated_examples` RPC + `match_loser_examples` RPC (pgvector, cosine distance, rating-weighted).
- **Lab → prod promotion flow is BUILT.** `/api/admin/prompt-lab/promote-to-prod.ts` with a readiness gate (≥10 clips under override, avg ≥4.0★, winners ≥ 2× losers, `force` bypass). Prod director reads via `resolveProductionPrompt` → `prompt_revisions` table.
- **Cost tracking exists.** `cost_events` table records per-provider spend per pipeline stage.
- **Recipe library + rule mining + proposals** all live at `/dashboard/development/proposals` and `/prompt-lab/recipes`.
- **Current iteration UI lives at** `/dashboard/development/prompt-lab`. Cluttered; distinction between human refinement and future agent runs does not exist.
- **Providers:** Kling v2-master (pro mode only, ~$0.30–0.40 / 5s); Runway Gen-4 Turbo (720p fixed, ~$0.30–0.50 / 5s); Luma Ray2 (flexible duration, ~$0.40–0.60). No sub-10¢ mode exists today.

---

## Architecture Overview

Five components, implemented in four phases.

```
┌───────────────────────────────────────────────────────────────┐
│                     Autonomous Prompt Lab                     │
│                                                               │
│  ┌────────────────┐    ┌────────────────┐   ┌──────────────┐  │
│  │ Hybrid Judge   │◄───┤ Autonomous     │──►│ Knowledge    │  │
│  │ (Claude+CLIP)  │    │ Iterator       │   │ Map          │  │
│  │ + calibration  │    │ (LLM→render)   │   │ (168 cells)  │  │
│  └───────┬────────┘    └────────┬───────┘   └──────┬───────┘  │
│          │                      │                  │          │
│          ▼                      ▼                  ▼          │
│  ┌───────────────────────────────────────────────────────┐    │
│  │           Mistake-Prevention Layer                    │    │
│  │    (fail:* tags → proposals → promote-to-prod gate)   │    │
│  └───────────────────────────────────────────────────────┘    │
│                              │                                │
│                              ▼                                │
│  ┌───────────────────────────────────────────────────────┐    │
│  │               Dev Portal Views                        │    │
│  │  Map + UMAP / Cell Detail / Judge Calibration / Cost  │    │
│  └───────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

---

## Component 1: Hybrid Judge

### Purpose

Produce a score + confidence for any rendered iteration *or* candidate prompt, automatically, calibrated against Oliver's ratings. This is the load-bearing component — without a trustworthy scoring signal, everything downstream optimizes against nothing.

### Design

- **Two scoring channels:**
  - **Claude LLM-judge** — structured rubric scoring on four axes: prompt-adherence (did the clip show what the prompt asked?), motion-quality (is the camera move smooth/coherent?), spatial-coherence (do walls/geometry hold up?), aesthetic (does it look like a 5★ real-estate clip?). Each axis 1–5. Composite score = weighted average. Uses Claude Sonnet with vision input (clip frames + prompt + analysis JSON).
  - **CLIP-similarity reference model** — embedding distance between the candidate clip (or key frames) and a *golden set* of Oliver's 5★ rated clips in the same cell. Outputs 0–1 similarity.
- **Composite score:** weighted blend (initial 70/30 Claude/CLIP, tunable). Mapped onto the existing 1–5★ scale so it plugs into existing retrieval + recipe infra without schema change.
- **Confidence:** function of (a) agreement between Claude and CLIP channels, (b) distance to nearest rated neighbor in embedding space. Low confidence when channels disagree OR when the cell has few rated examples.

### Calibration

- **Holdout set:** ≥30 existing rated iterations per cell *that have at least 3 rated examples*. Sparse cells are flagged as un-calibrated — judge cannot rate there until Oliver seeds it.
- **Agreement bar:** initial threshold **80% within ±1★ of Oliver's rating**. Below that, judge runs in *advisory mode* (suggests a rating, Oliver rates manually). Above, judge auto-rates high-confidence cases; low-confidence → queued for Oliver.
- **Auto-tightening:** agreement bar rises as corpus grows. +5 percentage points per doubling of rated corpus, capped at 95%.
- **Drift watch:** if judge's rolling-30-day agreement drops below the bar, auto-revert to advisory until re-calibrated.

### Storage

- New table: `lab_judge_scores` (iteration_id FK, claude_score, claude_rationale JSONB, clip_similarity, confidence, composite_1to5, judged_at, judge_version).
- New table: `lab_judge_calibrations` (snapshot of agreement rate per cell, per window).

### Open technical questions

- Frame-extraction from clip URL for CLIP: use `@napi-rs/canvas` or fetch a thumbnail the provider already generates? [To resolve during Phase 1 implementation.]
- Do we rate by frame-set or full clip? Initial answer: 3 sampled frames (first/mid/last) fed to both Claude and CLIP. Cheaper than full-clip analysis, empirically sufficient for scoring.

---

## Component 2: Knowledge Map

### Purpose

Benchmark and visualize the machine's strengths/weaknesses across the full space of possible scene outputs. Answers: "where is the machine great, okay, and bad?" and "what does it not know at all?"

### Structure

**Primary grid: 14 room_types × 12 camera_verbs = 168 cells.** (Exact enum values from `lib/types.ts`.)

Each cell has:

- **State:**
  - `untested` — zero iterations
  - `weak` — avg rating ≤ 2★ OR ≥50% of iterations are losers
  - `okay` — avg 3.0–3.9★
  - `strong` — avg ≥ 4.0★
  - `golden` — ≥2 iterations rated ≥5★ (reuses existing recipe-promotion threshold). **This is the "10/10" state** Oliver's goal #2 refers to. "Full coverage = 10/10 on every cell" means all 168 cells are `golden`.
- **Sample size** (number of rated iterations in cell)
- **Failure tags histogram** — count of `fail:*` prefixed tags across the cell's iterations
- **Top recipe** (if any exists for that cell)
- **Active override** (if any, scoped to that cell's director prompt)

### Embedding-cluster overlay

Inside each cell, iterations are clustered by their image embedding (existing `text-embedding-3-small`, same as today's retrieval). Clusters auto-labeled by Claude (e.g., "snowy-cabin exteriors", "sunlit-suburban exteriors"). Each cluster shows its own mini-state, so a cell can be `strong` overall but surface a `weak` sub-cluster like "northern wooded exteriors" — the exact case Oliver flagged.

### UMAP view

2D projection of the full iteration corpus (Lab + prod ratings pooled). Points colored by composite rating. Empty regions = unknown knowledge. Click a region to seed a new iteration there.

### Storage

- No new schema for the grid itself — it's a view/aggregate over `prompt_lab_iterations` + `scene_ratings` (denormalized columns from migration 014 already have room + verb + rating + embedding).
- New RPC: `get_knowledge_map_cells()` returning cell state + sample size + fail-tag histogram.
- New view: `v_knowledge_map_cells` for easier querying.
- Cluster labels cached in `lab_cell_clusters` (cell_key, cluster_id, label, centroid_embedding, member_ids[], last_computed_at).

### Seeding (how cells get populated)

Per Q3c:

- **From real user uploads** — any prod scene that lands in a cell adds to the map automatically (already happens via unified retrieval).
- **From curated seed images** — Oliver uploads reference photos into the cell (uses existing Lab upload UI, tagged with the cell key). This is how untested cells like `aerial × drone_pull_back` get bootstrapped without waiting for a real listing.

---

## Component 3: Autonomous Iterator

### Purpose

The agent that actually iterates: picks seeds, generates candidate prompts, renders top candidates, reads the judge, refines, and reports. This is the "20× throughput" component.

### Two-phase loop (resolves Q12 cost concern)

**Phase A — Prompt-space exploration (LLM-only, effectively free):**

1. Agent pulls seed image(s) for the target cell.
2. Agent uses the existing retrieval stack (winners, losers, recipes) to ground itself.
3. Agent asks Claude to generate **N=5 candidate prompt variants** covering different angles/composition/mood.
4. Agent runs the judge's LLM channel *on each candidate prompt* (text-only: rubric-score the prompt's predicted adherence, motion quality, spatial risk, aesthetic intent). Picks top 1–2.
5. Uses `lib/prompts/director-patch.ts`-style reasoning to critique and potentially re-generate weak candidates before rendering.

**Phase B — Render verification (paid):**

6. Agent submits top 1–2 candidates to provider (via existing `lib/providers/router.ts`, respecting Kling concurrency guard).
7. On render complete → judge scores the clip (full Claude+CLIP hybrid).
8. Composite score + confidence logged. Recipe auto-promoted if ≥5★ (existing behavior).
9. If not `strong` yet → agent loops back to Phase A, injecting the failure-tag from the just-rated clip into the losers block.

### Stopping conditions

- **Cell reaches `strong`** → agent reports success, shuts down.
- **8 render iterations completed** → agent pauses, surfaces a summary, waits for Oliver to:
  - Press **Continue** (starts another 8-iter batch, same cell)
  - **Chat** (feedback steers the next batch — see Component 3c)
  - **Stop** (agent halts, cell stays in current state)
- **Budget ceiling** (new setting: default $20 per cell run, hard stop).
- **Diminishing returns** — if the last 3 clips scored within ±0.3 of each other, agent flags "stuck, human input needed" even before the 8-iter cap.

### 3c — Agent chat (per Q10)

- Each autonomous run has a chat thread stored in `lab_agent_runs` + `lab_agent_messages` tables.
- Oliver can message **pre-run** (to set direction) and **during idle gaps between renders** (side-channel feedback that flavors the *next* candidate prompt — does NOT pause in-flight Kling calls, since those cost real money regardless).
- Agent is Claude Sonnet with system prompt that loads: current cell context, winners/losers retrieval, recipes, recent iteration history, failure-tag list, budget remaining, Oliver's chat messages.
- Agent thinks out loud in the thread: "Trying push_in with warmer tones next — the last two had color drift toward blue."
- Oliver can interject: "stop emphasizing sunlight for this cell — these cabins are usually overcast."

### Feedback loops (per Q11)

- **Output feedback:** standard 1–5★ + tags on individual iterations. Feeds the judge calibration + retrieval. (Existing flow.)
- **Decision feedback:** thumbs-up/down on the agent's *prompt choice* or *refinement reasoning*, stored as `lab_decision_feedback` (run_id, step_id, signal, note). Used to fine-tune the agent's system prompt over time via an automated "decision critique" proposal (extends existing rule-mining flow).

### Storage

- `lab_agent_runs` (id, cell_key, status, started_at, ended_at, budget_cents_cap, budget_cents_spent, iterations_run, final_state, started_by)
- `lab_agent_messages` (run_id, role ('oliver'|'agent'|'system'), content, created_at)
- `lab_decision_feedback` (run_id, step_id, signal, note, created_at)

---

## Component 4: Mistake-Prevention Layer

### Purpose

Same mistake shouldn't recur — at Lab OR production level (per Goal 5).

### Mechanism

1. **Failure-tag vocabulary** (see Tag Scheme below) — every low-rated iteration gets one or more `fail:*` tags. Auto-generated by Claude during judging, editable by Oliver.
2. **Pattern mining** (extends existing `lab_prompt_proposals`) — when a `fail:*` tag recurs ≥N times in a cell (default N=3), the rule-miner generates a diff to the director prompt that explicitly guards against the pattern. Proposal lands in `/dashboard/development/proposals` with evidence.
3. **Lab-side application** — Oliver approves → `lab_prompt_overrides.is_active = true`. All Lab renders for that cell now use the override (already wired via `resolveDirectorPrompt` override resolver).
4. **Prod-side application** — uses **existing** `promote-to-prod.ts` endpoint. Readiness gate (≥10 rendered clips, avg ≥4.0, winners 2× losers) must pass. Oliver one-click-promotes → creates `prompt_revisions` row with source='lab_promotion'. Prod director reads this via `resolveProductionPrompt` on next pipeline run.

### Prod director consulting the knowledge map at scene-gen time

In addition to reading the promoted prompt body, prod director will query `match_loser_examples` for the current scene's embedding (it already uses `match_rated_examples` for winners). The retrieved losers are injected as an "AVOID THESE PATTERNS" block in the prod director system message — same mechanism Lab uses today, extended to prod.

**Scope note:** this is a code change in `lib/pipeline.ts` scripting stage, minimal additional cost (one pgvector query per scene, cached).

### Tag scheme

Resolve Oliver's Q on existing tags: **prefix convention.** Existing freeform `tags` column holds both descriptive user tags and new `fail:*`-prefixed failure tags. Filterable in UI via `tags && ARRAY['fail:ghost-walls', ...]`. No schema migration.

Initial failure-tag vocabulary (extensible by Claude during judging):

- `fail:ghost-walls` — scene passes through geometry that shouldn't be traversable
- `fail:warped-geometry` — architectural distortion (bent walls, impossible corners)
- `fail:wrong-season` — snow when image was summer, etc.
- `fail:wrong-motion` — prompted push_in but clip orbits
- `fail:prompt-ignored` — major prompt element absent from output
- `fail:artifacts` — visible generation artifacts, flicker, morphing
- `fail:color-drift` — color cast that doesn't match source image
- `fail:frozen` — insufficient motion
- `fail:over-motion` — too much motion, nauseating
- `fail:lost-subject` — camera leaves the focal subject

---

## Component 5: Dev Portal Views (IA Refresh)

Per Q9 (B): incremental polish + new surfaces. Existing routes keep their mental model; new concepts get proper homes.

### New top-level route

- `/dashboard/development/knowledge-map`
  - **Grid view** (default): 14×12 heatmap, cells colored by state (gray/red/yellow/green/gold). Click cell → drill-down.
  - **UMAP view**: 2D scatter of all iterations, colored by composite rating. Click region → seed new iteration / fill cell.
  - **Calibration panel**: judge agreement %, drift chart, confidence distribution, per-cell calibration status.
  - **Cost meter**: daily/weekly spend rollup from `cost_events`, per-cell cost summary, budget alerts.

### Cell drill-down page

`/dashboard/development/knowledge-map/[cellKey]` (e.g., `kitchen-push_in`):
- Cell state summary (state, sample size, avg rating, fail-tag histogram)
- Sub-cluster list (auto-labeled embedding clusters inside the cell, each with own mini-state)
- Iteration history table with filters: **human** / **agent** / **all**, rating range, date range
- Active override + recipe (if any), with "promote to prod" button (gated by readiness view)
- **Fill Now** button → launches an autonomous agent run on this cell

### Existing Prompt Lab IA refresh

At `/dashboard/development/prompt-lab`:
- **Source badge on every iteration**: 🧑 human / 🤖 agent. Filterable.
- **Agent run thread view** — for iterations generated by an agent, show the chat thread + decision log inline.
- **Collapse old sessions by default**, surface "In progress" and "Needs your review" at the top.
- **Cleaner cards**: current card is cluttered; proposal is to show image → rating + ★ → one-line prompt summary → expand-for-full-prompt, versus the current always-expanded mess.
- **Move administrative controls** (organize mode, archive, batch management) into a toolbar instead of being interspersed with content.

(Exact wireframes to be produced during Phase 2 implementation plan; this spec captures the IA intent.)

### New sub-routes for agent activity

- `/dashboard/development/agent-runs` — list of autonomous runs across all cells with status, cost, outcome
- `/dashboard/development/agent-runs/[runId]` — detailed run view: chat thread, iteration log, judge scores, Oliver's decision feedback

---

## Data Flow

### Human iteration (existing, unchanged)

```
Oliver uploads image → analyze → director → render → rate 1-5★ + tags
→ embedding stored → feeds match_rated_examples + match_loser_examples
→ 5★ auto-promotes to recipe
```

### Agent iteration (new)

```
Oliver clicks "Fill Now" on cell
→ lab_agent_runs row created
→ Agent loads cell context (retrieval, recipes, history, Oliver's chat)
→ Phase A: 5 candidate prompts generated + LLM-scored
→ Phase B: top 1-2 rendered → judge scores (Claude + CLIP)
→ judge_score persisted, iteration rated, embedding stored
→ If <strong: loop back to Phase A with new losers injected
→ At 8 iterations: pause, await Oliver (continue/chat/stop)
```

### Failure → prevention flow (new)

```
Low-rated iteration → Claude suggests fail:* tags during judging
→ Tag stored in iterations.tags (prefix convention)
→ When fail:foo recurs ≥3 times in a cell → miner generates proposal
→ Proposal lands in /proposals UI
→ Oliver approves → lab_prompt_overrides.is_active = true
→ Readiness view (existing) monitors clip count + avg rating under override
→ When gate passes → Oliver clicks "promote to prod"
→ prompt_revisions row created, source='lab_promotion'
→ Prod director consumes via resolveProductionPrompt on next pipeline run
→ Same mistake prevented at prod
```

---

## Cost Model

### Per cell run

- Phase A (LLM exploration): ~5 prompt candidates × ~$0.02 Claude = **~$0.10**
- Phase B (renders): 2 candidates × ~$0.30 = **~$0.60**
- Judge scoring: 2 clips × Claude vision ~$0.03 + CLIP free = **~$0.06**
- **Total per cell run (best case — reaches strong in one batch): ~$0.76**
- **At 8-iter cap: ~$3.00** (8 renders × $0.30 + Phase A + judge overhead)

### Mapping the full grid once

168 cells × ~$0.76 (optimistic) = **~$128**
168 cells × ~$3.00 (pessimistic, every cell hits cap) = **~$504**

### Optimization tracks (not Phase 1 — noted for later)

- [ ] Kling `mode: "std"` if OpenClaw package / cheaper tier exposes it
- [ ] Wire up Higgsfield if its pricing undercuts Runway
- [ ] Judge a single sampled frame instead of 3 for Phase B
- [ ] Shorten iteration duration to 3s if provider allows

---

## Phasing (4 implementation plans, one per phase)

### Phase 1 — Hybrid Judge + Calibration

Load-bearing. Blocks everything else.

- Build Claude LLM-judge with rubric
- Build CLIP-similarity channel
- Build calibration routine against existing rated corpus
- Land `lab_judge_scores` + `lab_judge_calibrations` tables
- Expose judge as an API endpoint for manual "score this iteration" use

**Success criterion:** judge achieves ≥80% agreement (within ±1★) against a 50-iteration holdout set on at least 10 cells. Where calibration succeeds, the judge can auto-rate. Where it doesn't, it runs in advisory mode.

### Phase 2 — Knowledge Map + Dashboard (read-only visualization first)

- Build `get_knowledge_map_cells` RPC + `v_knowledge_map_cells` view
- Build cluster labeling job + `lab_cell_clusters` table
- Build `/dashboard/development/knowledge-map` grid + UMAP views
- Build cell drill-down page (read-only; no Fill Now button yet)
- Build calibration panel + cost meter
- Seed uploads extended to accept cell-key tagging

**Success criterion:** Oliver can open the map, see state of all 168 cells, identify gaps, view recipes/overrides per cell. No active iteration yet.

### Phase 3 — Autonomous Iterator

- Build the two-phase iterator worker (Phase A LLM exploration + Phase B render verification)
- Build `lab_agent_runs` + `lab_agent_messages` + `lab_decision_feedback` tables
- Build agent chat UI on run detail page
- Wire "Fill Now" button on cell drill-down
- Wire continue/chat/stop controls at 8-iter pause
- Extend Prompt Lab to show source badges + filters (human vs agent)
- Implement prod director failure-tag-aware retrieval (inject losers block in prod scripting stage)

**Success criterion:** Oliver clicks Fill Now on an untested cell, agent runs 8 iterations, produces at least one ≥4★ clip by the judge, chat thread captures the decisions, cost meter reflects actual spend.

### Phase 4 — Mistake-Prevention + Prod Bridge polish

- Implement fail:* tag auto-generation in the judge
- Extend `lab_prompt_proposals` rule-mining to include per-cell failure-tag-driven proposals
- Ship prod director change to consume `match_loser_examples` at scripting stage
- IA refresh finalization (Prompt Lab cleanup per §Component 5)
- Documentation + Oliver's operator runbook

**Success criterion:** A failure that was fixed in Lab cannot recur at prod (verified by end-to-end test).

---

## Out of Scope / Deferred

- Multi-cell parallel agent runs
- Automated prod-promote (always gated by Oliver)
- New video-gen provider integration (Higgsfield, self-hosted SVD, etc.)
- Cross-property "listing personality" tuning
- Mobile-responsive dashboard

---

## Future Work (post-MVP, do NOT build during this project)

### Eliminate pullouts at render time; synthesize via Shotstack reverse

**Hypothesis (Oliver, 2026-04-19):** pullout-style camera moves (`pull_out`, `drone_pull_back`) trigger hallucinations — the generator invents geometry that wasn't in the source image because it has to "fill in" what's being revealed as the camera retreats. Push-ins don't have this problem because they zoom into existing pixels.

**Proposed fix (to be designed later):**
1. Recipe / director change: stop generating pullout-style clips at the provider level. The director plans the scene in terms of push_in variants only.
2. Assembly-time reversal: at the Shotstack assembly stage, if the scene's *intended* motion was a pullout, reverse the rendered push_in clip. Visually: a push_in played backwards ≈ a pullout.
3. Knowledge-map implication: the `pull_out` and `drone_pull_back` columns may fold into their push counterparts once this lands (reducing the grid from 14×12 = 168 cells to ~14×10 = 140 cells). Decide during that design cycle.

**Why deferred:** autonomous iteration + knowledge map must exist first. Those give us the data to confirm the hallucination hypothesis empirically (compare fail-tag rates between push_in and pull_out cells) before we commit to a provider-level recipe change.

**Trigger to pick this up:** after Phase 4 is shipped and the knowledge map has ≥20 rated iterations in at least one pullout cell.

**Dependency:** builds on the already-discussed "Shotstack reverse clips for rhythm" idea — see `docs/SHOTSTACK-INTEGRATION-PLAN.md`.

---

## Open Questions

1. **Cheaper Kling tier via OpenClaw package.** Oliver to confirm purchase + tier availability. If it exposes `mode: "std"`, we retrofit `lib/providers/kling.ts` in Phase 3.
2. **CLIP model choice.** OpenAI's CLIP via local inference, or a managed embedding API? Decide in Phase 1 implementation plan.
3. **UMAP library.** Client-side (`umap-js`) or precomputed server-side? Leaning server-side so it's fast to render.
4. **Seed curation UX.** Does Oliver need a way to *bulk* seed reference images from existing property photos, or does single-upload suffice? Decide in Phase 2.

---

## Glossary

- **Cell** — one (room_type, camera_verb) pair on the knowledge map; 168 total.
- **Sub-cluster** — an auto-discovered embedding cluster inside a cell (e.g., "snowy-cabin exteriors" inside `exterior_front × reveal`).
- **Cell state** — one of `untested` / `weak` / `okay` / `strong` / `golden`.
- **Judge** — the hybrid Claude+CLIP scoring system.
- **Agent** — an autonomous Prompt Lab run; one per cell at a time in MVP.
- **Fill Now** — the UI trigger that launches an agent run on a cell.
- **Decision feedback** — meta-rating on the agent's prompt choice or reasoning, distinct from output rating.
- **Promote to prod** — the already-built flow that moves a Lab override into `prompt_revisions` for production director use.
