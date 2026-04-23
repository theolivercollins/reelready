# UI Surface Bug Audit — 2026-04-23

**Date:** 2026-04-23
**Reviewer:** Opus 1M subagent (read-only, 45-min budget)
**Branch:** `main` @ `8fc42e3`
**Scope:** Client + client-adjacent surface touched during the 2026-04-22/23 UI push: SKU selector / cost chip / Try-another-SKU, Provider Advanced toggle, judge chip, Override panel, Rating Ledger judge column, and the `5731 26f` hotfix that surfaced SKU-rerender buttons on failed iterations.

**Files under audit:**

- `src/pages/dashboard/PromptLab.tsx` (~1818 lines)
- `src/pages/dashboard/RatingLedger.tsx` (473 lines)
- `src/lib/promptLabApi.ts`
- `src/lib/ratingLedgerApi.ts`
- `api/admin/prompt-lab/override-judge.ts`
- `api/admin/prompt-lab/finalize-with-judge.ts`
- `api/admin/rating-ledger.ts`
- Supporting: `lib/prompts/judge-rubric.ts`, `lib/prompt-lab.ts::finalizeLabRender`, `api/admin/prompt-lab/rate.ts`

---

## Summary

Hotfix `5731 26f` unblocked the immediate SKU-rerender-on-failure gap. Audit found **3 critical**, **5 important**, and **7 minor** issues — most concentrated in the JudgeChip / Override path (Q4, Q5, Q6) and the Advanced-provider toggle (Q11). No security or data-integrity defects; these are UX traps and latent runtime edge cases.

**Top 3 critical findings (UX-visible, can cause silent wrong renders or data hides):**

1. **`Advanced ▸` toggle is one-way + `providerChoice` is sticky across checkbox toggles.** Once user expands Advanced and picks `Kling` / `Runway`, there is no UI control to collapse back or clear the selection. If they later un-tick `Render for real` (busy on something else), then re-tick it, the provider override silently remains on Kling native (burning pre-paid credits instead of Atlas billing). This is exactly the footgun flagged in Q11 — and it is real.
2. **`judge_error` branch of `JudgeChip` returns early and hides the Override button.** If the judge fails (retries exhausted, 400, schema miss) `judge_error` is populated and `judge_rating_overall` is null; the chip renders a truncated error and *no* path to open `OverridePanel`. Oliver cannot calibrate on the exact cases the judge most needs calibration on. (Q4, Q5).
3. **`judge_error` can overwrite a previously successful judge result and hide it.** `finalizeLabRender` and `finalize-with-judge.ts` both write `judge_error` on failure without clearing / preserving the prior `judge_rating_json`. Because `JudgeChip` checks `judge_error` **first** (line 1197), the UI flips from "5/5 · Motion 5 · …" to "Judge failed", even though the prior data is still in the row. Looks like data loss; isn't (data is still in DB), but perception is "my judge rating disappeared". (Q4).

**UX bugs that need user-facing explanations (not just code fixes):**

- The `Advanced ▸` toggle behavior — users need to know that collapsing is not possible mid-session and that `providerChoice` persists. Either collapse needs to re-set `providerChoice` to `"auto"`, or there needs to be a visible chip showing the *current* choice at all times (e.g. "Provider: Kling native — reset").
- The `Disagreements only` toggle in RatingLedger is **client-side and page-local**: on an unfiltered page-2 with no disagreements, the UI says "No disagreements found in this page" — this is currently in the code but needs clearer language since the top counter still shows the **unfiltered** `total`. Users will be confused by "50 rows" but only seeing 0 rows.
- Judge-only rows (judge rated, human unrated) are invisible in RatingLedger because `fetchLegacyLab` in `api/admin/rating-ledger.ts` filters on `.not("rating", "is", null)` at the DB level. If the product direction is "human-vs-judge side-by-side," judge-only rows should be surfaced so the user can rate them; right now they're invisible.

---

## Critical

### C1. `Advanced ▸` toggle is one-way; `providerChoice` is sticky

**File:** `src/pages/dashboard/PromptLab.tsx:1691–1713`

- `showAdvancedProvider` can flip `false → true` but there is no `false` affordance anywhere once expanded. `providerChoice` state independently persists.
- If user un-ticks `renderForReal`, the select is just `disabled={!renderForReal || rendering}` — it is NOT reset. Re-ticking `Render for real` re-enables the select with the old `providerChoice` intact.
- Click path: `Advanced ▸` → `Kling native` → refine multiple times → untick → retick → Render. The next render is on Kling NATIVE, bypassing Atlas SKU routing. There is no visible cue because the SKU dropdown next to it still shows a Kling SKU (`v2.6 Pro (default)`), implying Atlas.
- Fix direction: add an explicit "reset to Atlas" link next to the expanded select, OR collapse back when `providerChoice === "auto"`, OR always show the resolved provider (e.g. "Provider: Kling native — reset").

### C2. `JudgeChip` `judge_error` branch has no Override path

**File:** `src/pages/dashboard/PromptLab.tsx:1197–1208` + `1248–1267`

- `if (iteration.judge_error) return <div>Judge failed…</div>` — early return, *before* any `<OverridePanel>` mount point.
- Q5 / Q6 directly asked about this: "The panel pre-fills from `judge_rating_json`. What if `judge_rating_json` is null?" — `OverridePanel` itself handles null via `j?.motion_faithfulness ?? 3` defaults (safe), but the user can't reach it.
- **Consequence:** the calibration loop cannot learn from judge failures — which is precisely where human correction would be most valuable (unusual camera-movement × room-type buckets that the judge didn't even produce a rubric for).
- Fix direction: in the `judge_error` branch, render the failure chip PLUS an "Override manually" button that opens `OverridePanel` with empty defaults.

### C3. `judge_error` overwrites visible `judge_rating_json`

**Files:** `lib/prompt-lab.ts:782–794`, `api/admin/prompt-lab/finalize-with-judge.ts:92–99`

- Both failure paths write `judge_error: <msg>` + `judge_rated_at`. Neither clears prior `judge_rating_json` / `judge_rating_overall`.
- `JudgeChip` (PromptLab.tsx:1197) checks `judge_error` *first* and returns the failure UI. The prior successful rubric is hidden.
- Triggering scenario: automated re-hit of `finalize-with-judge` after a successful judge run (e.g. Oliver clicks something, a retry harness re-calls it, or a future cron re-judges stale rows). Not currently happening but no guard prevents it.
- Fix direction: either (a) in failure writer, only set `judge_error` when `judge_rating_json` is still null; or (b) in `JudgeChip`, prefer `judge_rating_json` if present, and render `judge_error` as a secondary "last retry failed" banner below.

---

## Important

### I1. Invalid `V1AtlasSku` cast when `iteration.model_used` is a legacy / paired SKU

**File:** `src/pages/dashboard/PromptLab.tsx:1455–1457`

```tsx
const [sku, setSku] = useState<V1AtlasSku>(
  (iteration.model_used as V1AtlasSku | null) ?? V1_DEFAULT_SKU,
);
```

- `V1_ATLAS_SKUS` = `["kling-v2-6-pro","kling-v2-master","kling-v3-std","kling-o3-pro"]`. The cast silently accepts strings like `"kling-v2-1-pair"` (today's stuck-iteration SKU), `"kling-v2-native"`, `"runway-gen-4"`, etc.
- If such an iteration ever reaches the render-controls branch (rare, because render controls are gated on `!provider_task_id`), the cost chip at line 1688 computes `V1_SKU_COST_CENTS[sku] / 100` → `NaN` → renders `≈ $NaN/5s`. The `<select>` is uncontrolled because no `<option>` matches.
- Fix direction: validate at default-state construction using the real `includes` check, e.g. `(V1_ATLAS_SKUS as readonly string[]).includes(iteration.model_used ?? "") ? iteration.model_used : V1_DEFAULT_SKU`.

### I2. `result.auto_promoted.tier` is read but not typed on the client API

**File:** `src/pages/dashboard/PromptLab.tsx:873` vs `src/lib/promptLabApi.ts:154`

- Client fn `rateIteration` declares return as `{ iteration; auto_promoted: { id: string; archetype: string } | null }` — no `tier`.
- `PromptLab.tsx:873` reads `result.auto_promoted.tier === "backup"`.
- Server (`api/admin/prompt-lab/rate.ts:109`) does return `tier`, so at runtime this works. TypeScript does not catch the mismatch because the access is on a narrowed object and the field is missing from the type.
- Fix direction: extend the Promise signature in `promptLabApi.ts::rateIteration` to include `tier: "primary" | "backup"`.

### I3. `LabIteration` type is missing several persisted fields the DB returns

**File:** `src/lib/promptLabApi.ts:23–80`

The `[sessionId].ts` GET endpoint does `supabase.from("prompt_lab_iterations").select()` (all columns), so the API returns — but the type excludes:

- `end_image_url` (used by C0 paired-frame logic)
- `end_photo_id`
- `sku_source` (`"captured_at_render"` vs other)
- `judge_cost_cents`
- `judge_rated_at`
- `thompson_decision_json` (if projected onto iteration rows — currently on `router_shadow_log`, so maybe not)

Not a runtime bug (UI can't reference them without casting), but any new UI piece wanting these has to cast. Suggest adding them to `LabIteration` (all optional / nullable).

### I4. OverridePanel cross-axis validation mismatch between client and server

**Files:** `src/pages/dashboard/PromptLab.tsx:1302–1326` (client), `lib/prompts/judge-rubric.ts:152–175` (server validator).

- Server `validateJudgeOutput` enforces 3 cross-axis hard rules: `geom ≤ 2 ⇒ hallucinated_geometry|hallucinated_architecture`, `motion ≤ 2 ⇒ motion-defect flag`, `room ≤ 2 ⇒ camera_exited_room|other_structural_defect`.
- Client OverridePanel has no such check. User can set Geometry = 1 with zero flags → client submits → server returns 400 → `fetchJSON` throws `"400: {"error":"geometry_coherence ≤ 2 requires hallucinated_geometry or hallucinated_architecture flag"}"` → user sees raw JSON in the error banner.
- UX is salvageable but ugly. Fix direction: add client-side pre-submit check that mirrors the 3 hard rules and surfaces them as inline field errors near the sliders.

### I5. RatingLedger "Disagreements only" is client-side + page-local; counter is misleading

**File:** `src/pages/dashboard/RatingLedger.tsx:87–93` + `173–175`

- Filter happens post-fetch on the current page only (`rows.filter(...)`). Server-side pagination is unaware.
- The top-right counter still reads the unfiltered `total` ("50 rows"), but `visibleRows.length` can be 0 or 1. Users will think the filter is broken.
- "Judge rated an unrated iteration" (Q8): `fetchLegacyLab` filters `.not("rating", "is", null)` at the DB, so judge-only rows never appear; the delta branch `r.judge_rating_overall == null || r.rating == null` returns false — consistent with "not a disagreement" given the absent human rating.
- Fix direction: either (a) add a server param `min_delta=2` to push filtering server-side and correct the total, or (b) at minimum, when `showOnlyDisagreements` is on, show "N of M on this page match" instead of just "M rows".

---

## Minor

### M1. `V1AtlasSku` cost chip ignores `iteration.cost_cents` after render

**File:** `src/pages/dashboard/PromptLab.tsx:1687–1689`

The `≈ $X/5s` chip is tied to the selector state `sku`, which is correct **before** render. After render, the chip disappears entirely because render controls are gated on `!clip_url`. There is no per-iteration cost chip showing actual `cost_cents`. Totals are shown in the header (line 913, 941) and that IS correct (uses `iteration.cost_cents`). Post-render the per-iteration cost is accessible via the header total only. Not a bug per Q10 (current C1-fixed cost is correct), but a minor gap — adding an "actual cost: $0.60" chip next to the clip player would close the loop.

### M2. "Retry on another SKU" filters `s !== iteration.model_used` without V1 membership check

**File:** `src/pages/dashboard/PromptLab.tsx:1640–1653`

`V1_ATLAS_SKUS.filter((s) => s !== iteration.model_used)` — if `iteration.model_used` is `"kling-v2-1-pair"`, the filter removes nothing (because `kling-v2-1-pair` isn't in V1_ATLAS_SKUS), so all 4 V1 SKUs show up. That is *desired* behavior (user stuck on a paired SKU should see all V1 options). Just flagging that the logic relies on this subtle interaction; a future rename of V1 SKUs could accidentally filter out the current one twice or zero times.

### M3. `skuOptions` in RatingLedger comes from current page only

**File:** `src/pages/dashboard/RatingLedger.tsx:79–85`

Dropdown contents depend on what's on screen. Page 1 might show 3 SKUs, page 2 might show 4. Switching pages refills the dropdown mid-interaction. Minor UX quirk.

### M4. Cost chip `V1_SKU_COST_CENTS` is duplicated from `lib/providers/atlas.ts::ATLAS_MODELS.priceCentsPerClip`

**File:** `src/pages/dashboard/PromptLab.tsx:42–47`

Comment says "must match ATLAS_MODELS". Drift is possible on any provider pricing change. Since admin surface, probably fine — but adding a shared export from `lib/providers/atlas.ts` would eliminate the drift risk.

### M5. `overrideJudgeRating` does NOT clear `judge_error` after a successful human override

**File:** `api/admin/prompt-lab/override-judge.ts:56–68`

Only inserts into `judge_calibration_examples`. It does NOT update `prompt_lab_iterations.judge_error`. So if an iteration has `judge_error` set, the chip shows "Judge failed" even after Oliver overrode it (assuming we fixed C2 and exposed an Override path in that branch). Fix direction: if `iter.judge_error` is set, in the same txn clear it and optionally write the corrected rubric to `judge_rating_json` / `judge_rating_overall`.

### M6. Override panel's `reasoning` field is required but `correction_reason` is optional — inconsistent with server semantics

**Files:** `src/pages/dashboard/PromptLab.tsx:1302–1306`, `api/admin/prompt-lab/override-judge.ts:63`

Client requires `reasoning` (which goes into `oliver_correction_json.reasoning`). Server only requires `corrected_rating_json` validation (which requires non-empty reasoning) and accepts `correction_reason` as optional. Consistent with the DB semantics (`correction_reason` documents WHY Oliver disagreed vs the WHAT already in the corrected rubric). Label hierarchy in UI is fine; no fix needed. Flagging for completeness.

### M7. `fetchJSON` surfaces raw `"<status>: <body>"` strings — 401 vs 400 vs 500 look the same to the user

**File:** `src/lib/promptLabApi.ts:92–95`

Not a bug (matches every other admin client fn in this file — pattern is consistent per Q7). Just noting that on token expiry the user sees `"401: "` with no actionable guidance. Admin-only surface, low priority.

---

## Not a Bug (checked, all good)

- **Q1 visibility gates on failed iterations:** Save Rating (gated on `director`), Refine (gated on `director`), Promote to Recipe (gated on `rating >= 4 && director`), JudgeChip (gated on judge actually having run — judge path requires `clip_url` so it never runs on failed, correctly hides). Only real gap was SKU retry row, fixed in `5731 26f`.
- **Q2 `onRerenderWithSku` threading:** Threaded from `SessionDetail` → every `IterationCard` in the map at line 1000. No conditional branches skip it. Typed as optional (`onRerenderWithSku?:`) but always passed in practice.
- **Q3 LabIteration type:** Covers judge_* fields; missing some peripheral fields (see I3) but nothing the audited UI actively uses without a cast.
- **Q7 auth pattern consistency:** `overrideJudgeRating` uses the same `fetchJSON` helper → same `Bearer` injection → same 401 surface. Identical to other admin client fns.
- **Q8 JudgeCell color bands for null human:** Correct — when `humanRating == null`, `delta = null` → returns grey "Judge: X/5" with no color band. No crash, sane render.

---

## Recommended order of fixes

1. **C2** (add Override button in `judge_error` branch) — smallest diff, highest leverage for the calibration loop.
2. **C1** (Advanced toggle collapse + reset) — prevents silent Kling-native bills.
3. **C3** (preserve `judge_rating_json` on retry failure) — 5-line guard in the writer.
4. **I4** (client-side cross-axis validation) — stops 400 roundtrips.
5. **I5 + counter copy** (server-side disagreements filter OR at least correct counter).
6. **I1** (SKU default validation) — defensive, unblocks any legacy rows.
7. **I2 / I3** (type completeness) — quality-of-life, no runtime.
