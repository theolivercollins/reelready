# V1 Primary Tool + ML Roadmap — Multi-Day Design

Last updated: 2026-04-22
Owner: Oliver
Designer: Coordinator (Window A, 2026-04-22)

## Purpose of this document

Define the multi-day, multi-session program that (a) lands V1 Prompt Lab as Oliver's daily-driver iteration tool today, and (b) layers on the ML upgrades that make V1's feedback loop scale-safe, self-calibrating, and genuinely competitive — without ever violating the four North Stars.

This document is the canonical design. Implementation plans per phase are produced by `superpowers:writing-plans` downstream of this spec.

## North Stars (reference — do not alter)

1. **No HITL** — pipeline self-operates.
2. **No hallucinations** — director respects source photo + past ratings.
3. **No wasted money** — right SKU first try; failover only on error.
4. **Right SKU per (room × movement)** — driven by existing signal, not fresh rating grid.

Every phase in this plan is mapped back to one or more of these criteria. If a proposed task can't be mapped, it is out of scope.

## Terminology decisions (final)

- **V1** = the "current way we work": Kling v2 family (default `kling-v2-6-pro`), single-image generation, production-connected. The Prompt Lab that was called "legacy" is renamed to simply **Prompt Lab**. V1 describes the model / routing / retrieval stack, not just the UI surface.
- **V2** = the paused future: Kling 3 family, paired-image (start+end frame) generation, forward-looking motion vocab (orbit-paired, pull_out-paired). Hidden from nav, preserved on disk, fully reversible.
- **Model V1 / Model V2** is the internal terminology in docs + code comments. Nav surfaces say "Prompt Lab" (V1) with V2 entries removed.

## Current state snapshot (reference)

### ML loop — audit verdict (2026-04-20)

**Working with gaps.** The rating → embedding → retrieval → director-injection chain is live end-to-end. 108 rated legacy Lab iterations + 7 prod scene ratings + 6 Phase-2.8 listing-Lab iterations feed retrieval via three RPCs (`match_rated_examples`, `match_loser_examples`, `match_lab_recipes`). Director user message on live traces is ~22k chars with all three retrieval blocks present. OpenAI `text-embedding-3-small` is the embedding model. All 24 prod scenes embedded after M.2 backfill.

**Gaps:**
- Legacy iterations store `provider` only, not SKU.
- Legacy Lab photos have no Gemini `analysis_json` (prod photos got it yesterday via DA.1).
- Lab → prod promotion pathway: 0 overrides ever promoted.
- Rule-mining proposals: 0 active overrides.
- No auto-evaluator; all feedback is manual ratings.
- Retrieval is cosine-only, single-vector, no reranker, no hybrid, no image embeddings.

### Inherited branches + dangling state

| Artifact | Disposition |
|---|---|
| `session/ledger-2026-04-21` (bucket-progress scoreboard) | Park. Feeds V2 surface. Kept alive for revival. |
| `session/router-2026-04-21` (router-grid + v3-strip) | Selectively merge v3-strip commit only. Park rest. |
| Dangling on main: render-log edit + 2 Window B session notes | Commit as yesterday's closeout. |
| Brief: `2026-04-21-window-B-round-3-vocab-cleanup.md` | Mark DEFERRED — touches paired-image zone. |
| Brief: `2026-04-21-window-E-og-prompt-lab-data-capture.md` | Re-scoped and folded into Phase P4 below. |

## Architectural principles

Principles that govern every phase. These override per-phase tactical choices when in conflict.

1. **Three-channel retrieval is non-negotiable.** Winners + losers + recipes. Each carries a distinct signal (positive steering / negative steering / authority). Collapsing to one channel violates North Star #2 directly.
2. **Scale-first data architecture.** Every embedding, rating, and recipe carries property_id + photo_id + room_type + camera_movement + SKU + created_at. Retrieval can always scope, filter, or cluster. No "soup of vectors" state.
3. **Reversibility.** Every phase ships behind a feature flag or additive schema. Rollback is a config/flag change, never a migration revert.
4. **No scrapping.** V2 paths, dead pathways, and old briefs stay on disk with comment headers explaining their state. Archive folder for anything that must come out of active view.
5. **Cost-event discipline.** Every new external API call logs a `cost_event` row, even $0. Non-negotiable per project policy.
6. **Docs + memory synchronized.** Every phase commit updates `docs/HANDOFF.md`, `docs/state/PROJECT-STATE.md`, and relevant memory files in the same push.
7. **Evidence before claims.** Every phase has a measurable success criterion. Success is claimed only with committed evidence (trace output, metric deltas, before/after screenshots).
8. **Subagent model tier discipline.** Opus for design/audit/ambiguity. Sonnet for bounded implementation. Haiku only for trivial mechanical tasks.

## Phase map

```
P1 (today, 2026-04-22)  — V1 Foundation
  │
  ├─► P2 (2026-04-23 to 2026-04-24, 2 sessions) — Gemini Auto-Judge
  │     │
  │     └─► unblocks feedback scale for every subsequent phase
  │
  ├─► P3 (2026-04-25 to 2026-04-27, 3 sessions) — Retrieval Upgrade
  │     │
  │     ├─ image embeddings (exoskeleton match)
  │     ├─ hybrid retrieval (dense + sparse)
  │     └─ reranker + percentage-match UI
  │
  ├─► P4 (2026-04-28 to 2026-04-29, 2 sessions) — Scale Hardening
  │     │
  │     ├─ per-photo Gemini analysis (V1 photos + historical)
  │     ├─ MMR diversity-preserving retrieval
  │     └─ hallucination-risk propagation
  │
  ├─► P5 (2026-04-30 to 2026-05-01, 2 sessions) — Adaptive Routing
  │     │
  │     └─ Thompson-sampling SKU router (replaces static router-table)
  │
  ├─► P6 (2026-05-02, 1 session) — Active Learning + Pairwise UX
  │
  └─► P7 (ongoing after P1) — Promote-to-Prod Flywheel activation
```

---

## P1 — V1 Foundation (today, 2026-04-22)

### Purpose

Make V1 Oliver's daily-driver iteration tool. Lock default SKU to `kling-v2-6-pro` via Atlas. Add in-Lab SKU selector + cost chip. Hide V2. Capture SKU on every V1 iteration so the ML loop produces SKU-granular signal from day one.

### North Star mapping

Serves #2 (better retrieval when SKU-granular) + #4 (can't converge on right-SKU-per-bucket without SKU labels on the training data).

### Session structure (single window, today)

| Block | Duration | Work |
|---|---|---|
| Open | 30 min | Consolidate yesterday (merge v3-strip commit, park C/D branches, commit dangling state) |
| Round 1 | 2–3 h | V1 routing swap + SKU capture migration + trace-script mode |
| Round 2 | 2 h | V1 UI SKU selector + cost chip + nav rename + V2 hiding |
| Wrap | 45 min | v2-master-vs-v2-6-pro research note; write V1 UX plan; update HANDOFF/PROJECT-STATE/memory |

### Subagent mix

- **Sonnet subagent (1)** — v2-master-vs-v2-6-pro web research + comparison note. Bounded scope, produces `docs/audits/kling-v2master-vs-v26pro-2026-04-22.md`.
- **Sonnet subagent (2)** — V1 UX audit read of `PromptLab.tsx`, produces friction-points list for the deferred UX plan.
- Coordinator (main session) — all code changes, migration, commits, merges.

### Deliverables

1. `lib/prompt-lab.ts::submitLabRender` — swaps native Kling → Atlas path, default model `kling-v2-6-pro`.
2. `api/admin/prompt-lab/render.ts` + `rerender.ts` — accept `sku` body param; write `model_used` on insert.
3. Migration `031_prompt_lab_iterations_sku.sql` — adds `prompt_lab_iterations.model_used text` + `prompt_lab_iterations.sku_source text` (`'captured_at_render' | 'recovered' | 'unknown'`, default `'unknown'`). (Migration numbers throughout this spec are sequential from highest-applied=030; each phase's implementation plan reconfirms the actual number at execution time.)
4. `PromptLab.tsx` — SKU selector dropdown + `$/5s` cost chip in session header; per-iteration "try other SKU" control.
5. `TopNav.tsx` — rename + V2 hide.
6. `docs/state/MODEL-VERSIONS.md` — canonical V1 vs V2 doc.
7. `scripts/trace-director-prompt.ts` — add V1 legacy-session mode; one live V1 trace committed under `docs/traces/`.
8. `docs/audits/kling-v2master-vs-v26pro-2026-04-22.md` — research note.
9. `docs/specs/2026-04-22-v1-lab-ux-plan.md` — deferred-implementation UX plan, including ML-roadmap section pointing to phases P2–P7 of this doc.
10. `docs/HANDOFF.md`, `docs/state/PROJECT-STATE.md`, memory updates.

### Success criteria

- [ ] One V1 render completes end-to-end on `kling-v2-6-pro` via Atlas, cost logged, `model_used` populated.
- [ ] V1 trace transcript shows populated PAST WINNERS / PAST LOSERS / RECIPE MATCH blocks against a real V1 session.
- [ ] Research note flags prompt-equivalence between v2-master and v2-6-pro as Confirmed-equivalent / Confirmed-different / Validate-day-1.
- [ ] `docs/state/MODEL-VERSIONS.md` + nav changes visible in browser.
- [ ] V2 entries reachable by direct URL (Listings Lab still loads at `/dashboard/development/lab/listings`).
- [ ] Yesterday's two orphan branches disposed (park notes written to each).

### Explicit non-goals

- No Kling 3 work.
- No paired-image/start-end-frame work.
- No auto-judge, no image embeddings, no reranker — those are P2/P3.
- No V1 UI polish beyond SKU selector + cost chip.
- No production pipeline changes.

### Cost budget

~$1 Atlas (one V1 validation render + one v2-master comparison pull if needed). $0 on OpenAI/Gemini beyond baseline.

---

## P2 — Gemini Auto-Judge (2026-04-23 → 2026-04-24, 2 sessions)

### Purpose

Multiply Oliver's rating throughput ~5× by installing a calibrated Gemini-as-judge on every V1 render. Oliver rates ~20% (the high-ambiguity ones); Gemini auto-rates the other ~80%. Oliver's corrections compound into Gemini's few-shot calibration pool. Direct attack on North Star #1 (no HITL) and indirect lift on #2 + #4 by growing the signal pool faster.

### Preconditions (from P1)

- V1 is daily driver.
- Migration 036 SKU capture live.
- Atlas wallet has headroom for ~$2/day auto-judge calls.

### Session 1 — Judge rubric + capture (2026-04-23)

**Objective:** Every V1 render gets a structured Gemini-rated scorecard stored alongside its row.

**Deliverables:**
1. `lib/providers/gemini-judge.ts` — Gemini vision call accepting (clip_url, prompt, director_output, photo_analysis) → structured JSON: `{motion_faithfulness: 1-5, geometry_coherence: 1-5, room_consistency: 1-5, hallucination_flags: string[], confidence: 1-5, reasoning: string}`.
2. Migration `032_prompt_lab_iterations_judge.sql` — adds `judge_rating_json jsonb`, `judge_rating_overall int`, `judge_rated_at timestamptz`, `judge_model text` (e.g., `gemini-3-flash`), `judge_version text` (rubric version).
3. `api/admin/prompt-lab/finalize-with-judge.ts` — new endpoint or hook into existing finalize path; called after `finalizeLabRender` when `clip_url` lands. Fires Gemini judge call, persists result, logs cost_event.
4. Cost event: `scope='judge_eval'`, `provider='google'`, `amount_cents` per call (expect ~2¢/call).
5. Rubric v1 documented at `docs/state/JUDGE-RUBRIC-V1.md` with examples.

**Success criteria:**
- 10 recent V1 iterations auto-scored with complete rubric fields populated.
- Average judge call latency <8s (background task; does not block UI).
- Cost events visible in dashboard with correct amounts.
- Zero judge-call crashes across 10 clips (error handling: on failure, log `judge_error` in cost_event metadata + leave `judge_rating_json` null).

**Subagent mix:**
- Opus subagent — rubric design. Produces `docs/state/JUDGE-RUBRIC-V1.md` with rigorous rubric + failure modes + 5-shot calibration example pool drawn from existing 5★ and 1★ clips.
- Sonnet subagent — Gemini provider implementation + endpoint wiring.
- Coordinator — migration, cost plumbing, smoke tests.

### Session 2 — Judge UI + human calibration (2026-04-24)

**Objective:** V1 UI shows judge rating alongside human rating; Oliver's corrections feed back into judge's few-shot pool.

**Deliverables:**
1. `PromptLab.tsx` IterationCard — add judge-rating display: overall score + per-axis chips + confidence indicator + "Override" button.
2. `api/admin/prompt-lab/override-judge.ts` — records Oliver's override with reasoning; appends corrected rating to `judge_calibration_examples` table.
3. Migration `033_judge_calibration_examples.sql` — table with (iteration_id, human_rating, judge_rating_json, oliver_correction, correction_reason, created_at). Used as few-shot fuel for subsequent judge calls.
4. `lib/providers/gemini-judge.ts` — reads top-10 recent calibration examples per (room × movement) bucket and prepends them as few-shot context before the rubric.
5. V1 ratings-list view: human rating and judge rating shown side-by-side with agreement/disagreement highlight.

**Success criteria:**
- 5 Oliver-corrections applied and visible as few-shot examples in next judge call (verify via trace).
- Judge-human agreement rate baseline captured (expected initially ~60–70%).
- No judge call exceeds $0.05 (would indicate few-shot context blew up).
- UI clearly distinguishes "human rated" / "judge rated" / "human overrode judge".

**Subagent mix:**
- Opus subagent — calibration-loop design audit (is the feedback mechanism stable or does it drift?). Produces audit note.
- Sonnet subagent — UI wiring.
- Coordinator — migration + backend.

### Risks + mitigations

- **Judge drift / echo chamber:** Gemini biases toward Oliver's current preferences, reinforces them, narrows exploration. Mitigation: rubric v1 requires judge to consider rubric axes independently; calibration examples are scoped per (room × movement) bucket, not globally; monthly calibration-drift audit in P7.
- **Judge cost overrun:** Mitigation: per-day spend ceiling in code (e.g., kill switch if judge spend > $10/day); dashboard chart.
- **Gemini model version changes behavior:** Mitigation: `judge_model` + `judge_version` columns make historical ratings traceable to rubric+model combo; version bump triggers re-baseline.

---

## P3 — Retrieval Upgrade (2026-04-25 → 2026-04-27, 3 sessions)

### Purpose

Replace cosine-only single-vector retrieval with image-embedding + hybrid dense-sparse + cross-encoder reranker retrieval. Surface percentage-match visibility in V1 UI (Oliver's exoskeleton idea, grounded in the actual mechanism).

### Preconditions (from P1/P2)

- P1 complete.
- P2 ideally complete (auto-judge pool helps validate retrieval precision lift).

### Session 1 — Image embeddings (2026-04-25)

**Objective:** Every V1 photo gets a pixel-level embedding alongside its text-description embedding. Retrieval queries both and fuses.

**Deliverables:**
1. `lib/embeddings-image.ts` — image embedding wrapper. **Preflight task for this session: verify which provider endpoint to use — Vertex AI `multimodalembedding@001` (1408-dim, requires GCP service account), Gemini Genai SDK's multimodal embeddings (if exposed in our current version), or CLIP via Replicate (512-dim, slower)**. Session begins with a 30-minute provider-feasibility audit; implementation chooses based on that.
2. Migration `034_photos_image_embedding.sql` — adds `photos.image_embedding vector(NNN)` where NNN matches chosen provider's output dim; same pattern on `prompt_lab_sessions.image_embedding`.
3. `scripts/backfill-image-embeddings.ts` — walks every photo + prompt_lab_session without `image_embedding`, embeds, writes. Dry-run + write flags. Cost-event per call.
4. Updated retrieval: `match_rated_examples` (and siblings) get a second query embedding (image) and a fused-ranking formula. Starting fusion: weighted average with weights `w_text=0.4, w_image=0.6` (image signal preferred on visual tasks).
5. Fusion weights documented + configurable via env var for tuning.

**Success criteria:**
- 100% of V1 photos have `image_embedding` populated after backfill.
- Side-by-side retrieval comparison on 5 test queries (old text-only vs new text+image fused) committed to `docs/audits/retrieval-fusion-2026-04-25.md`. Show improved top-5 relevance.
- Cost of backfill logged and within $3 (150 photos × $0.01–$0.02 each).

**Subagent mix:**
- Sonnet subagent — backfill script.
- Opus subagent — fusion-weight selection note (why 0.4/0.6? test 3 weight ratios against the 5 test queries, pick best, document).
- Coordinator — RPC updates + migration.

### Session 2 — Hybrid retrieval + percentage-match UI (2026-04-26)

**Objective:** Add BM25/keyword sparse retrieval on top of dense. Surface match-score as percentages in V1 UI (Oliver's exoskeleton visibility).

**Deliverables:**
1. Migration `035_iterations_tsvector.sql` — adds `prompt_lab_iterations.search_vector tsvector` generated from (director_prompt, tags, rating_reasons, user_comment); GIN index for search.
2. Updated `match_rated_examples` (and siblings) RPC — hybrid scoring: normalized cosine × 0.5 + normalized BM25 × 0.3 + normalized image-embedding cosine × 0.2 (initial weights; tune in P4).
3. `PromptLab.tsx` RetrievalPanel — new collapsible panel next to the iteration card showing:
   ```
   RETRIEVED FOR THIS PHOTO:
     ✓ Past winners  (top 82%, 3 shown)
     ✗ Past losers   (top 74%, 2 shown — director steered away)
     ★ Recipes       (top 79%, 1 shown)
   ```
   Each row click-expandable to show the specific exemplars + their ratings + click-through to source.
4. Match percentage = normalized hybrid score × 100, rounded. <50% match = retrieval cold-spot indicator.

**Success criteria:**
- Hybrid retrieval returns different ranked top-5 than cosine alone for ≥ 70% of queries (measurable via A/B script).
- V1 RetrievalPanel renders on every iteration with non-empty matches (or explicit "cold-spot" indicator when all <50%).
- Cold-spot detection fires on at least 1 iteration in 10 (sanity check the threshold).

**Subagent mix:**
- Sonnet subagent — RPC + migration.
- Opus subagent — UX audit of RetrievalPanel design (does it surface the right info without overwhelming?).
- Coordinator — backend plumbing + integration tests.

### Session 3 — Reranker (2026-04-27)

**Objective:** Add cross-encoder reranker pass that re-scores top-30 from hybrid down to top-5 for director injection.

**Deliverables:**
1. `lib/rerank.ts` — wrapper around Cohere Rerank API (primary) or BGE-reranker-v2-m3 via Replicate (fallback). Takes (query_text, top-K docs) → reranked list with fresh relevance scores.
2. Retrieval pipeline: hybrid returns top-30 → reranker scores → top-5 injected into director prompt.
3. Cost event: `scope='rerank'`, `provider='cohere' | 'replicate'`, expected ~0.1¢/call.
4. Reranker-off feature flag (env `DISABLE_RERANKER=true`) for rollback.
5. Before/after precision audit committed at `docs/audits/rerank-2026-04-27.md` — evaluate on P2 auto-judge pool (judge scores as ground truth).

**Success criteria:**
- Reranker precision@5 beats hybrid-only by ≥ 10 percentage points (measured against judge scores as ground truth on 50 scenes).
- Director call latency increase < 400ms (reranker runs in parallel with remaining director setup).
- Feature flag verified off = identical behavior to pre-reranker baseline.
- Zero reranker-call failures blocking a render (failure → log + fall back to hybrid-only top-5).

**Subagent mix:**
- Sonnet subagent — reranker wrapper.
- Opus subagent — precision-audit methodology + before/after report.
- Coordinator — integration + feature flag + cost plumbing.

### Phase P3 risks

- **Image-embedding API surface changes:** Gemini vision embedding endpoint is newer. Mitigation: abstract behind interface; fallback to CLIP via Replicate.
- **Fusion weights need tuning on more data:** P3 picks initial weights on 50–100 queries; revisit in P4 with judge-pool backing.
- **Latency creep:** Three retrieval passes might bloat director call. Mitigation: parallelize dense + sparse + image retrievals; rerank budget capped at 400ms.

---

## P4 — Scale Hardening (2026-04-28 → 2026-04-29, 2 sessions)

### Purpose

Handle the scale concern Oliver raised directly: as properties grow, retrieval must stay precise and diverse, not collapse into "all kitchens retrieve the same 5 kitchens." Install per-photo Gemini enrichment (motion_headroom, hallucination-risk flags) on every photo new or historical; add MMR diversity re-ranking; propagate hallucination priors.

### Preconditions

- P1–P3 complete.

### Session 1 — Photo enrichment at scale (2026-04-28)

**Objective:** Every V1 photo (and every new photo going forward) has Gemini `analysis_json` including motion_headroom, structural signature, and hallucination-risk flags.

This session absorbs the deferred Window E brief Parts A + B + D + E + F from 2026-04-21.

**Deliverables:**
1. Migration `036_prompt_lab_session_analysis.sql` — adds `prompt_lab_sessions.analysis_json jsonb`, `analysis_provider text`, `hallucination_risk text` (`'low' | 'med' | 'high'` — derived from analysis_json on write).
2. `scripts/backfill-legacy-lab-gemini.ts` — walks every `prompt_lab_sessions` row missing analysis_json, calls `analyzePhotoWithGemini`, persists. Dry-run first. Expected ~$0.40 for 150 sessions.
3. Async hook on new V1 session creation — after `prompt_lab_sessions` insert, fire `analyzePhotoWithGemini` without blocking response.
4. `prompt_lab_sessions.hallucination_risk` computed-from-analysis column (high if motion_headroom has 3+ hard bans; med if 1–2; low if 0).
5. Migration `037_unified_rated_pool_view.sql` — creates `v_unified_rated_pool` view unifying (legacy_lab, listings_lab, prod) per the original Window E brief. All retrieval queries switch to the view.
6. SKU recovery for legacy iterations per Window E Part E (expected 10–30% recovery rate).
7. Tag → rating_reasons normalization per Window E Part F.

**Success criteria:**
- 100% of `prompt_lab_sessions` rows have `analysis_json` populated.
- `v_unified_rated_pool` view returns expected row counts per surface (~55 listings_lab, ~108 legacy_lab, ~7+ prod).
- Async hook on new session creation confirmed not blocking response (before/after timing).
- Hallucination-risk classifier verified on 10 known-problem photos and 10 known-good photos.

**Subagent mix:**
- Sonnet subagent — backfill + async hook.
- Sonnet subagent — SKU recovery + tag normalization.
- Coordinator — migration + view + integration.

### Session 2 — MMR + hallucination-risk propagation (2026-04-29)

**Objective:** Retrieval returns diverse neighbors (not duplicates); director prompt surfaces hallucination-risk signal on the query photo.

**Deliverables:**
1. MMR (Maximal Marginal Relevance) re-ranking wrapper in `lib/retrieve.ts`. After hybrid + reranker, MMR re-orders top-K prioritizing diversity. λ parameter configurable (initial 0.7 — relevance-heavy).
2. Near-duplicate clustering via image-embedding cosine > 0.92 — duplicates collapse to one representative per cluster before MMR.
3. Director prompt update — adds a `PHOTO HALLUCINATION RISK` block pulled from `photos.hallucination_risk` + `prompt_lab_sessions.hallucination_risk`. For `high` risk, block includes warning: "Similar photos have historically produced [specific failure modes]. Bias toward conservative motion."
4. Hallucination-risk propagation via trigger — when a V1 iteration is rated ≤2★ with tags including hallucination-related reasons, a DB trigger or periodic job increments the source photo's hallucination_risk.
5. New photo cold-start: on first V1 session for a property, pull the top-5 structurally-similar historical photos (image-embedding cosine) and inherit their aggregated hallucination_risk as prior. Decays over time as real ratings land.

**Success criteria:**
- On a test property with 5 known-hallucination-prone photos, hallucination_risk propagation elevates them to `high` after 3 related 2★ ratings.
- MMR reduces duplicate retrieval (before/after on 5 queries: prior returned 3 near-dupes on avg, MMR returns ≤1).
- Cold-start prior applied on a new property, verified via trace — director prompt shows "similar historical photos flagged high-risk for [X]".
- Director prompt retrieval block chars unchanged ±5% (no bloat from new signal).

**Subagent mix:**
- Opus subagent — MMR parameter tuning + cold-start prior math audit (is the prior-decay function sensible?).
- Sonnet subagent — trigger + propagation plumbing.
- Coordinator — director prompt update + integration.

### Phase P4 risks

- **Trigger-based propagation race conditions:** Mitigation: use transactional batch job on a 15-min cron instead of per-row triggers. Simpler and debuggable.
- **Cold-start prior is wrong when new property is genuinely novel:** Mitigation: prior is weight-0.3 of final risk; first 3 real ratings on the property overwhelm it.
- **MMR with λ=0.7 still surfaces too-similar neighbors:** Mitigation: audit on 20 queries, adjust λ; fully configurable.

---

## P5 — Adaptive Routing (2026-04-30 → 2026-05-01, 2 sessions)

### Purpose

Replace static router-table logic with Thompson-sampling bandit per (room × movement × SKU) bucket. System self-bootstraps router decisions without a manual rating grid. Direct delivery of North Star #4.

### Preconditions

- P1–P4 complete.
- Rating pool has ≥ 200 SKU-granular iterations (estimate reached via P1 SKU capture + 1 week of V1 use).

### Session 1 — Bandit implementation (2026-04-30)

**Objective:** Each (room × movement × SKU) bucket modeled as a Beta-distributed arm. System samples from posterior to pick SKU per scene.

**Deliverables:**
1. Migration `038_router_bucket_stats.sql` — `router_bucket_stats (room_type, camera_movement, sku, alpha, beta, last_updated)` materialized from ratings.
2. `scripts/refresh-router-bucket-stats.ts` — recomputes alpha (sum of 4★+ ratings) + beta (sum of ≤3★ ratings) per bucket. Runs as cron every 4h.
3. `lib/providers/router.ts` — Thompson sampling: for the (room × movement) of a scene, sample from each SKU's Beta(alpha+1, beta+1), pick max. Falls back to v2.6-pro when bucket is cold (alpha+beta < 3).
4. `lib/providers/router.ts` feature flag `USE_THOMPSON_ROUTER=true`. Default off for Session 1 (dry-run mode: logs sampled decision alongside actual static-router decision; does not change real routing).
5. Dashboard: `/dashboard/development/router-bandit` showing each bucket's (alpha, beta, expected_win_rate, confidence_interval, trial_count).

**Success criteria:**
- Bucket stats populated for all (room × movement × SKU) triples with ≥ 1 rating.
- Dry-run mode shows Thompson vs static-router divergence rate (expected ~30% divergence after pool grows).
- Confidence-interval widths sensible (high for low-trial buckets, tight for high-trial buckets).

**Subagent mix:**
- Opus subagent — Thompson sampling design + cold-start rule + confidence-interval audit.
- Sonnet subagent — implementation + dashboard.
- Coordinator — migration + integration + feature flag.

### Session 2 — Adaptive rollout (2026-05-01)

**Objective:** Flip `USE_THOMPSON_ROUTER` to true for V1 iterations (not prod yet). Monitor. Prod rollout gated on evidence.

**Deliverables:**
1. Enable Thompson routing for V1 only. Prod still uses static router.
2. Daily bucket-stats refresh job hardened to cron.
3. A/B audit: 20 V1 scenes rendered under Thompson, 20 under static (random assignment). Judge scores from P2 rate both. `docs/audits/thompson-ab-2026-05-01.md` reports winner.
4. If Thompson ≥ static on judge score: propose prod rollout to Oliver (separate decision).
5. Bucket visualization on dashboard flags buckets where Thompson has flipped preference vs static (what it "learned").

**Success criteria:**
- Thompson A/B audit committed with 40 scene judge scores.
- No router bug causes a scene to render on a disallowed SKU (enforcement check: SKU must exist in router_bucket_stats with `enabled=true`).
- Feature flag off = immediate full revert to static router.

**Subagent mix:**
- Opus subagent — A/B audit methodology + interpretation.
- Sonnet subagent — cron hardening + dashboard.
- Coordinator — flag flip + monitoring.

### Phase P5 risks

- **Thompson converges to a local optimum before exploring enough:** Mitigation: cold-start rule forces each bucket to sample all SKUs at least 3× before any exploitation. This is baked in.
- **Bucket sparsity (some buckets have <3 ratings across all SKUs):** Mitigation: fallback to v2.6-pro static default.
- **Prod rollout without Oliver's explicit approval:** Not allowed by design — P5 Session 2 stops at V1-only rollout. Prod rollout is a separate decision after evidence review.

---

## P6 — Active Learning + Pairwise UX (2026-05-02, 1 session)

### Purpose

Route Oliver's limited rating time to the highest-leverage iterations (retrieval cold-spots, high-disagreement judge vs neighbors, bucket-sparsity). Add pairwise-preference A/B as a side-channel for stable ranking signal.

### Preconditions

- P1–P5 complete.
- Auto-judge running (P2) — needed to detect high-disagreement scenes.

### Deliverables

1. V1 Dashboard: "Rate these first" panel — surfaces 5 iterations where your rating would reduce router-bandit uncertainty most (metric: reduction in expected Beta variance).
2. Pairwise A/B modal — "Which is better, A or B?" drawn from retrieval cold-spots where two similar scenes got very different auto-judge scores. Bradley-Terry ranker updates hidden-state ELO per bucket.
3. Migration `039_pairwise_preferences.sql` — `pairwise_preferences (iter_a_id, iter_b_id, preferred_id, reasoner, created_at)`.
4. ELO feed-forward into retrieval fusion weights (preferred iterations get higher prior in their bucket).

### Success criteria

- "Rate these first" panel demonstrably changes Oliver's rating choices (self-reported + click-through logs).
- Pairwise modal used ≥ 20 times in first week.
- Bucket ranker ELO shows convergence on buckets with ≥ 10 pairwise comparisons.

### Subagent mix

- Opus subagent — active-learning leverage-metric design + audit.
- Sonnet subagent — pairwise UI + ELO backend.
- Coordinator — integration.

---

## P7 — Promote-to-Prod Flywheel (ongoing after P1)

### Purpose

Activate the pathway that has existed for months but never fired: turning proven V1 winners into production director-system-prompt overrides. This is the actual mechanism by which V1 learning compounds into prod quality.

### Cadence

Not a session. A weekly habit starting ~2026-05-05 once V1 has produced ≥ 5 recipe-worthy winners.

### Process (documented as a runbook)

1. Weekly review: list recipes with ≥ 3 iterations × ≥ 4.5 avg rating × 100% 4★+ consistency in the past 2 weeks.
2. For each, Oliver either:
   - (a) Promote to prod — creates `lab_prompt_overrides` row + activates it.
   - (b) Promote to recipe only — stays in retrieval pool.
   - (c) Reject — rating was situational, not generalizable.
3. Prod overrides tracked in a `/dashboard/overrides` view — Oliver can disable any time.
4. Success metric: first prod override deployed and not reverted within 2 weeks.

### Explicit non-goal

Auto-promotion. Every prod override requires an Oliver click. Rule-mining proposals (the dormant auto-suggest pathway) can surface *candidates* but cannot promote.

---

## Cross-cutting — Scale architecture

Unified data model that survives every phase. Core tables + invariants:

### Invariant columns on every retrieval source

Every row in `prompt_lab_iterations`, `prompt_lab_listing_scene_iterations`, and `scene_ratings` must have:
- A valid `photo_id` (or `image_url` for legacy) — joins back to the source photo.
- A `room_type` (from photo analysis).
- A `camera_movement` (director's motion verb).
- A `model_used` SKU (P1 fixes legacy gap).
- An `embedding` (text) + when P3 lands, an `image_embedding`.
- `rating` + `rating_reasons` if user-rated; `judge_rating_json` if auto-rated (P2).

### Retrieval always scoped/filtered

Retrieval queries NEVER run unscoped. Every call filters on at least room_type. Property_id optional filter for "retrieve only from this property's history" (not default; feature for specific use cases).

### Diversity invariant

After P4: every retrieval response passes through MMR. No two returned exemplars may have image-embedding cosine > 0.92 unless they are from different properties (explicit cross-property signal).

### Cold-start invariant

For any new property, retrieval uses structurally-similar historical properties as prior. Decays as real signal lands.

---

## Cross-cutting — Subagent strategy

| Task type | Model tier | Why |
|---|---|---|
| Design audit, rubric design, interpretation | Opus subagent | Non-trivial reasoning; judgment calls; cost justified |
| Bounded implementation (endpoint, migration, UI component) | Sonnet subagent | Clear spec → code; efficient |
| Trivial mechanical (rename, comment-add, boilerplate) | Haiku subagent | Cheap + fast |
| Coordinator (session main) | Opus (this session) | Cross-cutting decisions, merging, docs |
| Web research | Sonnet subagent | Bounded; produces report |

Subagent brief template for every phase session:
- Purpose + North Star mapping
- Required reading (files + docs)
- Scope (must-do list)
- Must-NOT-do list
- Exit criteria
- Budget + pivot triggers

---

## Cross-cutting — Rollback + safety

Every phase ships behind a feature flag or is additive-only schema.

| Phase | Rollback mechanism |
|---|---|
| P1 | Default SKU env var flip back to kling-v2-master; revert route change via git |
| P2 | `DISABLE_JUDGE=true` env var; judge columns remain but unused |
| P3 | `DISABLE_IMAGE_EMBEDDINGS`, `DISABLE_HYBRID`, `DISABLE_RERANKER` independent flags |
| P4 | Hallucination-risk field retained but ignored; MMR off via `DISABLE_MMR` |
| P5 | `USE_THOMPSON_ROUTER=false` reverts to static |
| P6 | Pairwise modal is opt-in; disabling is a nav change |
| P7 | Prod override disable button already exists (one click) |

No migration is ever reverted in rollback — all rollbacks are flag/config changes. Data is preserved.

---

## Cross-cutting — Success dashboard

A single dashboard page `/dashboard/development/ml-health` surfaces:
- Embedding coverage (% photos embedded, % iterations embedded, % with image embeddings after P3)
- Judge coverage + agreement rate with human (after P2)
- Retrieval precision@5 (against judge-score ground truth) — tracked over time
- Bucket bandit state (after P5): trial count + confidence interval per bucket
- Pathway usage: #recipes promoted, #overrides promoted-to-prod, #overrides active
- Cost per phase component: $/day on embeddings, $/day on judge, $/day on rerank

This dashboard is extended incrementally — each phase lands its own metric row(s).

---

## Out of scope — explicit non-goals for this program

- **No Kling 3 / V2 model work** until V1 is stable and Thompson router has ≥ 2 weeks of signal.
- **No paired-image / start-end-frame features** — infrastructure preserved, work paused.
- **No production pipeline rewrite** — prod keeps using baseline DIRECTOR_SYSTEM + unified retrieval. Overrides layer on top when Oliver promotes. No bottom-up rewrite.
- **No RLHF/DPO on the director model** during this program. Data volume too small.
- **No domain-fine-tuned embeddings** during this program. Revisit once pool ≥ 500.
- **No multi-user personalization** — single-user system until scale justifies it.

---

## Risks (program-wide)

| Risk | Severity | Mitigation |
|---|---|---|
| Phase P1 reveals v2-master ≠ v2-6-pro prompting (blows up "same prompting" assumption) | High | Research note in P1 validates before commit; Oliver reviews |
| Atlas wallet exhaustion mid-phase | Medium | Per-day spend ceilings in every code path that hits Atlas; dashboard monitors |
| Judge drift reinforces Oliver's current biases (echo chamber) | Medium | P2 calibration bucket-scoped; P5 bandit forces exploration; monthly audit |
| Retrieval precision lift claims don't hold up on small audit sample | Medium | Audits require ≥ 50 scenes; small samples flagged as preliminary |
| A phase lands partial (like yesterday's Atlas-wallet blocker) | Low | Each phase has explicit exit criteria + blocker-note protocol |
| Gemini judge model updates change rubric interpretation | Medium | `judge_version` + `judge_model` columns make history traceable; version-bump triggers re-baseline |

---

## Open questions

None at time of writing. All questions from brainstorming resolved:

- Q1 — V1 scope: all of it (personal daily driver + product flow unchanged).
- Q2 — V1 routing: Atlas.
- Q3 — today's UX scope: written plan only, no UX implementation today.
- Q4 — naming: V1/V2 internal; nav says "Prompt Lab".
- Q5 — v2-master vs v2-6-pro: research-only validation (Tier B path).
- Q6 — Settings UX in today: SKU selector + cost chip in scope; other polish deferred.
- Q7 — three-channel retrieval: preserved (Oliver accepted the pushback).
- Tier B (auto-judge): confirmed for P2.
- Scale concern: addressed in architectural principles + P4.

---

## Memory / docs touchpoints (updated same-pass with spec commit)

Per project policy, when this spec commits, the following update in the same commit or same session:

- `docs/HANDOFF.md` — "Right now" rewrites to point at this spec as active roadmap.
- `docs/state/PROJECT-STATE.md` — new subsection "2026-04-22 — V1 program kickoff".
- `docs/state/TODO.md` — phases added.
- Memory: `project_v1_ml_roadmap.md` (new) — index entry in MEMORY.md.
- Memory: `project_back_on_track_plan.md` — update to reference this as successor plan.
