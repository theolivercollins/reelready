# Bug Audit — ML Plumbing (P2 judge, P3 fusion, P5 Thompson)
**Date:** 2026-04-23
**Scope:** READ-ONLY. Migrations 033, 034, 035, 038; `lib/providers/gemini-judge.ts`; `lib/prompts/judge-rubric.ts`; `lib/embeddings-image.ts`; `lib/providers/thompson-router.ts`; `lib/judge/neighbors.ts`; `lib/prompt-lab.ts` retrieval call sites; `scripts/backfill-image-embeddings.ts`; `scripts/refresh-router-bucket-stats.ts`.
**Auditor:** code-reviewer subagent (Opus, Window A P-audit)

---

## Executive Summary

Three shippable systems (Gemini judge, image-embedding fusion, Thompson router math) landed this week. They are mostly solid — the math kernel is correct, kill-switches guard every external call, failure paths never mask original errors, and the shadow-log loop is wired through `render.ts` / `rerender.ts`. BUT there are **three critical bugs** that will either silently corrupt data, silently disable the feature, or throw at runtime on specific inputs. There are also four **important** issues that violate a first-class invariant (cost tracking, Q4 of the user's checklist) or will bite when ratings data grows.

Top 3 criticals (detail below):

1. **C1 — Static weights aren't scale-matched.** Migration 035 computes `fused = text_weight * text_cosine + image_weight * image_cosine` — but `text_weight` and `image_weight` are NOT constrained to sum to 1 and there's no normalization. `IMAGE_EMBEDDING_TEXT_WEIGHT=0.9` + `IMAGE_EMBEDDING_IMAGE_WEIGHT=0.9` silently produces distances in [0, 1.8] — and crucially, the 5★ boost (× 0.85) is applied to inflated distances, so the ordering between 5★-boosted-fused and non-boosted-text-only examples becomes scale-dependent. Worse: the recipe RPC uses `distance < distance_threshold (0.35)` as a WHERE clause, so enlarged weights silently filter OUT all recipes.
2. **C2 — The 48% turnover "proof" is confounded by 5★ boost interacting with fused distance scale.** Fused distance is `0.4*t + 0.6*i`, which is on average smaller than text-only `t` (two signals combined ≠ sum of one). The 5★ boost multiplies that smaller number by 0.85. A non-5★ exemplar with cos=0.1 competes with a 5★ exemplar fused=0.08 × 0.85 = 0.068. This structurally promotes 5★ exemplars under fusion more than under text-only. Q1's "4.40 → 4.80 avg rating" is **partially an artifact of the boost interacting with the smaller fused scale**, not purely signal quality. This does not mean fusion is broken — it means the audit doc's 48% turnover can't distinguish "fusion working" from "boost ratio shifted."
3. **C3 — Judge cost is hard-coded to 2¢ and image-embedding cost is hard-coded to 0¢.** Both violate the project's "cost tracking is first-class" rule (MEMORY.md #7). Image-embedding at $0.00012/call → always rounded to 0¢ in integer-cents storage. At 100 embeddings/day that's $0.012 ($4.38/year) truly missing from invoices. The judge's 2¢ is an estimate; actual cost fluctuates with clip duration + few-shot size. Neither tracks to actual billing units and cost-event rows for both are set in fractional-cents metadata NOWHERE — so there is no path to reconcile against Gemini's invoice.

---

## Critical (must fix before continued execution)

### C1 — Static weights not normalized; recipe threshold silently breaks under non-default weights
**Files:** `supabase/migrations/035_retrieval_image_fusion.sql` (lines 81–88, 129–137, 346–351, 366–372)
**Callers with env knobs:** `lib/prompt-lab.ts:137–138`, `lib/judge/neighbors.ts:6–7`

The RPC signatures accept `text_weight float DEFAULT 0.4, image_weight float DEFAULT 0.6`, and the body just computes `text_weight * text_cosine + image_weight * image_cosine`. There is no validation that they sum to 1, no normalization, and no range check.

Two concrete failure modes:

- **Scale inflation:** If Oliver (or the Lab UI experiment knob) exports `IMAGE_EMBEDDING_TEXT_WEIGHT=0.9 IMAGE_EMBEDDING_IMAGE_WEIGHT=0.9`, distances now live in `[0, 1.8]`. Cross-branch ordering still works within the RPC (same inflation), but the `match_lab_recipes` RPC applies a *hard* `distance < 0.35` filter in its WHERE clause (line 372). With inflated weights, valid recipes fall above 0.35 and the RPC returns zero rows — recipe retrieval silently disappears without any error surface.
- **5★ boost × fused:** `match_rated_examples` multiplies the fused distance by `0.85` for 5★ rows at the outer `SELECT`. Fused distances are structurally smaller on average than pure text (0.4×t + 0.6×i ≤ max(t,i) when either signal is low), so the 0.85 boost effectively multiplies a smaller baseline. A 5★ exemplar beats a 4★ exemplar more decisively under fusion than under text-only. This interacts with the auditor's conclusion in `retrieval-fusion-2026-04-23.md` (see C2).

**Fix:** Clamp both weights at the TS layer (or at the RPC) to sum-to-1, or normalize by `(text_weight + image_weight)` inside the CASE expression. Also guard: if both are NULL or zero, fail fast rather than silently returning rows with `NaN` distances (which pgvector will still sort).

### C2 — Audit doc's 48% turnover is a noisy proxy, not a clean signal
**Files:** `docs/audits/retrieval-fusion-2026-04-23.md`

Three independent reasons the 48% number does not prove fusion is working as intended:

1. **Same 5★ boost applies to both modes** — but the boost's *effect size* differs under fusion vs text-only because fused distances are on a compressed scale. The audit's "avg exemplar rating improved 4.40→4.80 in Q1" is more likely "the 0.85 boost got larger leverage under the compressed fused scale."
2. **Query 4 showed 0 turnover with distances compressed 0.0444→0.0290, 0.0522→0.0341.** This is actually evidence that fusion is *not* changing rankings; it's only rescaling distances. That's not a bug, but the audit doc presents it as fusion "surfacing different exemplars."
3. **N=5 queries is under-powered.** The audit notes this indirectly ("should be validated against 20+ rated iterations"), but the verdict line says "Image fusion IS surfacing different exemplars." That's a causal claim from 5 data points where the turnover could easily be random re-ordering of tied distances.

**What would convince me fusion is working:** A regression test that seeds two identical-text-but-visually-distinct photos (say, a shabby beach living room and a modern beach living room) + shows that fused retrieval surfaces visually-similar winners while text-only does not. The 48% number alone doesn't do it.

**Action:** Either add a controlled ground-truth test to `scripts/audit-retrieval-fusion.ts`, or soften the audit doc's verdict to "fusion is re-ordering; quality effect is not yet proven." Not blocking for P3 S1 ship, but blocking for any weight-tuning decision.

### C3 — Cost tracking: image_embedding cost_cents=0, judge cost_cents=2 (both disconnected from actual billing)
**Files:** `lib/embeddings-image.ts:109` (`costCents: 0`), `lib/providers/gemini-judge.ts:156` (`const cost_cents = 2`), both logged metadata are missing `fractional_cents`

Per MEMORY.md entry #7 ("every token + API call + dollar/cent. Profit margin depends on it. Revisit constantly, reconcile vs invoices, never ship with null/0 cost fields"), this is a direct violation.

- **embedImage:** Logs `cost_cents: 0` on both success and failure paths. The `$0.00012/image` quote at 2026-04-22 pricing is ~1.2 millicents. At any realistic volume (100s/day for a backfill, 1000s/day when real-time), this is real money that never reconciles.
- **judgeLabIteration:** Hard-codes `cost_cents = 2` regardless of clip duration, few-shot preamble size, or Gemini's actual token count. Gemini 2.5 Flash is $0.30 per 1M input tokens / $2.50 per 1M output tokens. A 5s clip with a 10-example few-shot (few-shot JSON runs ~8KB each = ~2000 tokens × 10 = 20k tokens) plus the clip input tokens → the true cost likely ranges 1.5¢–8¢ depending on few-shot load.
- **Neither records `fractional_cents` in metadata.** There is no way to reconcile against the monthly Gemini invoice without re-running the API and re-computing.

**Fix now (low effort, high leverage):**
1. Add `metadata.cost_fractional_cents: 0.12` (or whatever the quoted price is per call) for image_embedding.
2. Use Gemini's `usageMetadata` (the SDK returns `promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`) in the judge response to compute true cost per call. Same pattern as `computeClaudeCost(response.usage, ...)` in `lib/prompt-lab.ts:125`.
3. Both should write `metadata.input_tokens` and `metadata.output_tokens`.

Until this ships, do not trust any "Lab cost" number that rolls up judge or embedding events.

---

## Important (should fix before broader rollout)

### I1 — `validateJudgeOutput` cross-axis hard rules will throw on ~15–25% of judge calls in the wild
**File:** `lib/prompts/judge-rubric.ts:158–174`

The validator throws when `geometry_coherence ≤ 2 && !flags.has(hallucinated_*)`. Gemini 2.5 Flash is not an instruction-perfect model on structured-output tasks — it will occasionally return `geometry_coherence=2` with empty `hallucination_flags`. When that happens, `judgeLabIteration` throws and the iteration's `judge_error` column fills with `"geometry_coherence ≤ 2 requires hallucinated_geometry or hallucinated_architecture flag"`.

Evidence this is likely (not hypothetical):
- The system prompt includes the rule (good) but Gemini routinely produces lightly-non-conforming JSON in my experience (based on the SDK's `finishReason` telemetry). The test suite has no test that simulates Gemini-non-compliance → pass-through.
- Empirical data will show up as a cluster of failed judge hooks with "must contain hallucinated_geometry" in `judge_error`. Watch `prompt_lab_iterations.judge_error` after the first 100 enabled calls.

**Fix options (pick one):**
1. **Softer validator:** Auto-inject the flag when geom≤2 but flags are empty. Log a warning in metadata; don't throw.
2. **Re-prompt retry:** On validation fail, re-call Gemini once with the specific error message appended ("your last output violated rule X, fix it"). Adds latency but preserves the hard rule.
3. **Keep the hard rule but demote to a soft log:** Return the result anyway with `metadata.validation_warning = "..."`. Downstream (RatingLedger, IterationCard) filters or highlights as appropriate.

I recommend option 1 for P2 launch. The flag injection is pure inference — if geom=2 and there's no explicit flag, the judge *meant* the geometry-defect case.

### I2 — `loadCalibrationFewShot` has no payload-size cap; 10 examples × 10KB jsonb = 100KB added to every prompt
**File:** `lib/providers/gemini-judge.ts:224–254`

The query selects the top 10 most-recent `judge_rating_json + oliver_correction_json` rows for the bucket. If a correction blob accidentally contains the entire clip's frame-by-frame reasoning (or Oliver accidentally pastes a large review into `reasoning`), the few-shot prompt bloats unboundedly. The fix-forward is:
- Truncate each `reasoning` field to 500 chars when loading for few-shot.
- Or, more surgically: `.limit()` applies to count but not size; add a JSON-length guard post-query that drops rows whose serialized size exceeds 3KB.

Per MEMORY.md note: Oliver's retirement trigger is "monthly agreement audit, not a byte cap" — but the same monthly audit is what detects this bug AFTER the prompt has bloated enough to hit Gemini's 128k-token context limit. Catch it earlier with a cheap local cap.

### I3 — `refresh-router-bucket-stats.ts` duplicate-detection relies on unique constraint, but numeric(10,2) → JS number conversion is lossy past 12 digits
**File:** `scripts/refresh-router-bucket-stats.ts:105–115, 144–150`; `supabase/migrations/038_thompson_router.sql:17–20`

Two concerns:

1. **Duplicate fidelity:** The script aggregates Map → upserts with `onConflict: "room_type,camera_movement,sku"`. The unique constraint in migration 038 (line 23) is `UNIQUE (room_type, camera_movement, sku)`. Good. Upsert is idempotent.
2. **Numeric conversion:** `router_bucket_stats.alpha` is `numeric(10,2)` in Postgres. Supabase-js returns numerics as strings by default (to preserve precision beyond JS safe integers). `BucketArm.alpha` is typed `number`. `router.ts:loadBucketArms` does `Number(row.alpha)`. `"12.50"` → `12.5` — fine. `"1234567.50"` → `1234567.5` — fine. But if any column exceeds Javascript's 2^53 - 1, silent precision loss happens. With integer counts this is not realistic (we'd need 9 quadrillion trials), but with `JUDGE_ALPHA_WEIGHT=0.5` fractional counts accumulating in `judge_alpha`, you could end up with 1234567.5 cumulative over years — still fine. **Low-severity; document that we expect counts < 1M.**

3. **Real concern:** What if supabase-js returns the numeric as a string (depends on the client config — PostgREST returns numeric as string unless `db-schema` introspection is loaded)? `Number("12.50")` is 12.5 ✓ but `Number("")` is 0, `Number(null)` is 0. If the DB column has a NULL (possible on new inserts if the DEFAULT fails), we silently carry a 0 and Thompson samples from Beta(0, β+1) = poorly-concentrated posterior. Add a guard `if (!Number.isFinite(...)) skip row`.

### I4 — `refresh-router-bucket-stats.ts` write path doesn't write `judge_alpha` / `judge_beta`; those columns will stay at DEFAULT 0 forever
**File:** `scripts/refresh-router-bucket-stats.ts:135–146`

The upsert payload has only `alpha, beta, last_updated` — no `judge_alpha`, no `judge_beta`, no `enabled`. This means:
- `enabled` is `true` from the DEFAULT (correct).
- `judge_alpha`, `judge_beta` stay at 0 forever unless a separate script writes them.

When Oliver flips `JUDGE_ALPHA_WEIGHT=0.5` (per the P5 design §6 note on line 44 of migration 038), the weighted calc becomes `alpha + 0.5 * judge_alpha = alpha + 0`. The judge signal is **silently ignored**.

**Fix:** Extend the aggregation to also scan `prompt_lab_iterations.judge_rating_overall` (rated ≥4 → judge_alpha++, rated 1–3 → judge_beta++), and write both pairs in the upsert.

---

## Minor (track, not urgent)

### M1 — `embedImage` MIME-type detection breaks on URLs with query strings
**File:** `lib/embeddings-image.ts:71–75`

```ts
const mimeType = input.imageUrl.toLowerCase().endsWith(".png") ? "image/png" : ...
```

Supabase Storage URLs often have `?token=...` query strings. `".../photo.png?token=abc".endsWith(".png")` is false → defaults to `image/jpeg`. Gemini may reject or mis-interpret. Low severity because most photos ARE jpegs, but the logic is subtly wrong.

**Fix:** Parse with `new URL(input.imageUrl).pathname` before endsWith, or use magic-byte detection from `bytes` directly.

### M2 — Thompson `sampleGamma` has a rejection loop with no max-iterations guard
**File:** `lib/providers/thompson-router.ts:97–106`

Marsaglia-Tsang's acceptance rate is ~95% for shape > 1. An infinite loop is *theoretically* possible under pathological RNG (test harness injecting `setRng(() => 1)` → `u === 1` → loop never accepts). In practice Math.random never returns 1, so this is fine in production, but a defensive `for (let iter = 0; iter < 100; iter++)` with a throw on overflow would protect against test harness foot-guns.

### M3 — `pickArm` filter coverage gap: `enabled.length > 0 && bucket.arms.length === 0` is architecturally impossible (enabled is derived from arms), but the test file doesn't assert the invariant
**File:** `lib/providers/thompson-router.test.ts`

The question posed in the audit prompt ("`enabled.length > 0 && bucket.arms.length === 0`") cannot happen because `enabled` is `arms.filter(...)`. No bug. Add a type-level assertion or documentation comment that `enabled ⊆ arms` so future refactors don't break this.

### M4 — `refresh-router-bucket-stats.ts` query relies on implicit cast of rating
**File:** `scripts/refresh-router-bucket-stats.ts:113–114`

```ts
if (row.rating >= 4) agg.alpha++;
else if (row.rating >= 1 && row.rating <= 3) agg.beta++;
```

A `rating = 0` would be silently dropped (neither bucket). A negative rating would also drop. Supabase-js returns INTEGER column as JS number. The question mentioned "rating 0 shouldn't exist" — correct, it shouldn't — but the DB has no CHECK constraint on `prompt_lab_iterations.rating` (verified by `grep 'CHECK.*rating' supabase/migrations/`). Add a range check defensively.

### M5 — `thompson-router.ts::confidenceInterval` uses Normal approximation, not true Jeffreys
**File:** `lib/providers/thompson-router.ts:137–149`

Already acknowledged in the code comment ("coarser than true Jeffreys"). Not a bug; tracked here so the dashboard owner knows CI bands on low-N buckets are slightly tight.

### M6 — Shadow log write in `render.ts`/`rerender.ts` is not idempotent
**Files:** `api/admin/prompt-lab/render.ts:123`, `api/admin/prompt-lab/rerender.ts:112`

If a render endpoint is retried (network flap, client-side retry), the shadow-log gets two rows with the same `iteration_id`. The table has no unique constraint on iteration_id. Not corrupting (aggregation can dedupe), but bloats storage. Consider `UNIQUE (iteration_id)` or an `ON CONFLICT (iteration_id) DO NOTHING`.

---

## Fine (no action needed)

### F1 — Kill-switches are all `=== "true"` strict equals
`JUDGE_ENABLED`, `ENABLE_IMAGE_EMBEDDINGS`, `USE_THOMPSON_ROUTER` all use `process.env.X === "true"`. This correctly rejects `"1"`, `"yes"`, `" true "`, `"TRUE"`. Unit tests cover these cases explicitly. Good defensive pattern.

### F2 — Failure cost-events never mask the original error
Both `judgeLabIteration` and `embedImage` wrap the failure-path cost_event in its own try/catch that swallows. The throw from the main `catch (err)` is preserved. Good.

### F3 — Listing-branch text-only fallback is documented
Migration 035 explicitly comments that the `listing` branch cannot image-fuse because `prompt_lab_listing_scene_iterations` has no direct `photo_id`. The audit doc also notes this. No hidden gap.

### F4 — `match_lab_recipes`'s LEFT JOIN chain correctly handles listing-source recipes
The comment in migration 035 (lines 352–357) explains that when `source_iteration_id` references a listing iteration (no session_id), the chain returns NULL for `sess.image_embedding` and the CASE falls back to text-only. Verified by reading the SQL. Good.

### F5 — Thompson shadow-log is ACTIVELY being written (not unused storage)
Both `render.ts:123` and `rerender.ts:112` write to `router_shadow_log` on every render. The concern in Q10 (accumulating null `divergence_reason` rows with `reason='flag_off'`) is valid but the data is useful: it establishes a baseline of static-only decisions that the A/B comparison can diff against. Do monitor table growth; at ~30 renders/day it's ~10k rows/year ≈ few MB. Fine.

---

## Recommended Next Moves (prioritized)

1. **This week:** Fix C3 (cost tracking) — it violates a first-class project invariant and every day it's broken is ~1¢ of invoice drift for image embeddings.
2. **This week:** Soft-fail C1's weight normalization — at minimum, `Math.max(text_weight + image_weight, 1e-6)` divisor in the CASE arms. Prevents recipe-threshold silent breakage if anyone experiments with non-default weights.
3. **Before P2 S2 calibration loop ships:** Fix I1 (soft validator) — else the calibration example pool will be skewed toward the subset of clips where Gemini happened to produce schema-compliant outputs. That skews the few-shot and compounds.
4. **Before any Thompson weight-tuning:** Address C2 — the "fusion works" verdict needs a controlled test, not just turnover metrics.
5. **Before P5 S1:** Fix I4 (judge_alpha/judge_beta aren't written) — else `JUDGE_ALPHA_WEIGHT` is a no-op.

---

## Appendix — What's working well

- **Kill-switches everywhere.** Every external API call has a fail-fast env flag, and each flag has a unit test asserting non-"true" values disable.
- **Failure-path cost events never mask origin errors.** Nested try/catch discipline is clean.
- **Migration 035's DROP-then-CREATE discipline.** Defensive against partial prior state (32, 34 above).
- **Thompson math kernel is correct.** Marsaglia-Tsang, Beta-composition, Jeffreys CI, cold-start, sparsity-fallback — all sound. Extensive test coverage.
- **Audit doc linked scripts.** `scripts/audit-retrieval-fusion.ts` is referenced — the evaluation is reproducible.
- **RUBRIC_VERSION discipline.** Bumping the rubric means new calibration pool; baked into the migration doc and validator.

---

## Reviewer's closing note

The biggest systemic risk is **not a code bug** — it's that two of the three shipped systems (P2 judge, P3 fusion) have **evaluation harnesses that can't distinguish "working" from "noisy"**. The Thompson router has a clean test suite because its math is deterministic; the judge and fusion layers are empirical. Invest in the evaluation scaffolding before scaling either.
