# Render Pipeline Bug Audit — 2026-04-23

**Date:** 2026-04-23
**Reviewer:** Opus 1M subagent (read-only, 45-min budget)
**Branch:** `main` @ `8fc42e3`
**Scope:** render → clip → judge → cost_event path after today's P1/P2/P3/P5 landings and hotfix `4000050`.

**Files under audit:**

- `api/admin/prompt-lab/render.ts`
- `api/admin/prompt-lab/rerender.ts`
- `lib/prompt-lab.ts` (`submitLabRender`, `finalizeLabRender`)
- `lib/providers/atlas.ts`
- `lib/providers/router.ts` (`resolveDecision`, `resolveDecisionAsync`, `loadBucketArms`)
- `lib/providers/thompson-router.ts`
- `api/cron/poll-lab-renders.ts`
- `lib/services/end-frame.ts`
- `lib/providers/gemini-judge.ts`
- `lib/embeddings-image.ts`
- `lib/db.ts::recordCostEvent` / `addPropertyCost`

---

## 1. Executive summary

**One CRITICAL bug that strongly resembles the `4000050` class:** `api/cron/poll-lab-renders.ts:115` still filters Phase-2 finalization to `provider === "kling" || provider === "runway"`, so **every Atlas-routed Lab render since P1 landed is skipped and never finalized**. `submitLabRender` returns `provider: "atlas"` for all V1 Atlas SKUs, and that is exactly what render.ts writes to the iteration row — which the cron then discards. After today's `4000050`, single-image renders route to `kling-v2-6-pro` via Atlas, so they fall into this hole. Paired renders are in the same hole. This almost certainly maps 1:1 to the "stuck 85+ min" symptom Oliver saw; the end-frame fix unblocks paired stalls, but Atlas iterations still never finalize.

**Second class of bug:** both `render.ts` and `rerender.ts` submit the provider job **before** updating the iteration row with `provider_task_id`. If that UPDATE fails (e.g. connection blip, RLS, unique constraint), the Atlas job is orphaned — billed by Atlas, but the cron can never find it. Money leak path.

**Third class:** `finalizeLabRender`'s cost_event records `provider: "atlas"` hard-coded even when it's finalizing native Kling or Runway (escape-hatch rerender path), so cost attribution is wrong for any non-Atlas Lab iteration. Compounded by the fact that `model_used` is also hard-coded to `"kling-v2-6-pro"` on the escape-hatch path regardless of the actual provider used.

---

## 2. Critical

### C1. Atlas Lab renders are never finalized by the cron — every V1 iteration is orphaned

**File:** `api/cron/poll-lab-renders.ts:115` (and :47 for the queued-path mirror)

```ts
if (!row.provider || (row.provider !== "kling" && row.provider !== "runway")) {
  results.push({ id: row.id, phase: "finalize", status: "skip: unknown provider" });
  continue;
}
```

**Root cause:** When P1 made Atlas the default Lab router (and `AtlasProvider.name = "atlas"`), `render.ts:110` started persisting `provider = "atlas"` on the iteration row. This poll cron filter was never updated to accept `"atlas"`. `finalizeLabRender` itself accepts `provider: "kling" | "runway" | "atlas"` in its signature (`lib/prompt-lab.ts:650`) — only the cron is stale.

**Blast radius:**
- Every V1 Prompt Lab iteration rendered via `api/admin/prompt-lab/render.ts` since the P1 deploy has `provider = "atlas"` → cron skips forever → `clip_url` never populated → iteration stuck in "Rendering…" UI state.
- The 30-minute timeout at `poll-lab-renders.ts:121` ALSO requires `row.provider === "kling" || "runway"` to reach, because the skip at :115 `continue`s before the timeout check runs. So Atlas iterations never even get marked as timed out — they stay visually active indefinitely.
- The "stuck 85+ min" symptom Oliver attributed to kling-v2-1-pair paired routing is ALSO explained by this filter. Even unpaired Atlas renders would have been stuck.

**Why it may not have been caught earlier:** the listing-lab pipeline has its own cron (`api/cron/poll-listing-iterations.ts`) that DOES handle Atlas correctly via `pickProvider(model_used)`. If Oliver's 2026-04-22/23 work was mostly through Listings Lab, Prompt Lab standalone renders quietly accumulated in the stuck state. The standalone Prompt Lab is what the UI at `src/pages/dashboard/PromptLab.tsx` uses.

**Suggested fix:** Drop `&& row.provider !== "atlas"` (add it to the allow-list), and update the same filter at `poll-lab-renders.ts:47` for the queued-submit path. The cost_events insert at :154-176 also uses `row.provider` directly; extending the provider enum there is trivial.

**Verification:** Query DB for `SELECT id, provider, provider_task_id, clip_url, render_submitted_at FROM prompt_lab_iterations WHERE provider = 'atlas' AND clip_url IS NULL AND render_error IS NULL AND provider_task_id IS NOT NULL ORDER BY render_submitted_at DESC LIMIT 20;` — every row there is a stuck Atlas render the cron refuses to touch.

---

### C2. Atlas job submitted but iteration update fails → orphaned billing

**Files:** `api/admin/prompt-lab/render.ts:97-120`, `api/admin/prompt-lab/rerender.ts:91-109`

```ts
const { jobId, provider, sku: resolvedSku, ... } = await submitLabRender({...});   // REAL ATLAS SUBMIT

const { data: updated, error: uErr } = await supabase
  .from("prompt_lab_iterations")
  .update({ provider, provider_task_id: jobId, ... })  // if this fails, jobId is LOST
  .eq("id", iteration_id)
  .select()
  .single();
if (uErr) return res.status(500).json({ error: uErr.message });
```

**Root cause:** `submitLabRender` has the side effect of calling `provider.generateClip()` which fires the Atlas HTTP POST and charges the account. After that returns, the UPDATE is not transactional with the provider call. If the UPDATE fails:
- Atlas has an active job — it WILL render the video.
- The iteration row has no `provider_task_id` → `poll-lab-renders.ts` filter `.not("provider_task_id", "is", null)` excludes it.
- The output URL expires on the provider CDN (Atlas/Kling both have 7-day expiry).
- We pay Atlas but deliver nothing.

**Why it can fail:** any Supabase hiccup, an RLS check we add later, a malformed `metadata` (not currently an issue), or the outer Vercel maxDuration (60s) firing just after `generateClip` returns.

**Suggested fix:** Either (a) pre-flight a "reservation" insert with provider_task_id="pending:<local-id>" before calling generateClip, then UPDATE with the real jobId; or (b) catch the UPDATE error and make a second attempt before returning 500. Bonus: log jobId + iterationId to console so ops can reconcile manually.

**Blast radius:** low likelihood per render, high cost per occurrence. At Atlas's 60¢/clip today, a single orphan = 60¢ real dollars gone. Over 1000 renders / week this is minor; but during a DB outage it could compound fast.

---

### C3. `finalizeLabRender` hard-codes `provider: "atlas"` on all Lab cost_events

**File:** `lib/prompt-lab.ts:702-716`

```ts
await recordCostEvent({
  propertyId: ...,
  stage: "generation",
  provider: "atlas",          // ← always atlas, even for kling/runway escape-hatch renders
  unitsConsumed: 1,
  unitType: "renders",
  costCents: computedCostCents,
  metadata: { sku: iteration?.model_used ?? "unknown", ... },
});
```

**Root cause:** `finalizeLabRender`'s provider arg can be `"kling" | "runway" | "atlas"`, and the polling cron passes the iteration's actual provider. But the cost_event hard-codes `"atlas"`. Similarly `computedCostCents` comes from `AtlasProvider.checkStatus`'s `priceCentsPerClip`, which is per-second × 5. For native Kling renders that path is nonsensical — `result.costCents` would be whatever the Kling provider returns.

**Impact:**
- Dashboard finance reports attribute native Kling renders to Atlas, double-counting Atlas spend and under-counting Kling/credits usage.
- The `metadata.sku` field pulls from `iteration.model_used`, which is also wrong for escape-hatch paths (see C4 below) — so the fallback metadata is ALSO unreliable.
- This violates the "cost tracking first-class" directive in Oliver's memory.

**Suggested fix:** Pass actual provider + SKU into `finalizeLabRender`'s cost_event, and branch on provider to call the right pricing function (`atlasClipCostCents(modelKey)` for Atlas, kling-native pricing for Kling, runway pricing for Runway). The logic already exists in `poll-listing-iterations.ts`; mirror it.

---

### C4. Escape-hatch rerender mislabels `model_used` + ignores user SKU pick

**File:** `lib/prompt-lab.ts:593-610`, `api/admin/prompt-lab/rerender.ts:91-109`

```ts
if (params.providerOverride === "kling" || params.providerOverride === "runway") {
  provider = getProviderByName(params.providerOverride);
  ...
  resolvedSku = "kling-v2-6-pro";   // hardcoded; IGNORES params.sku
  staticSku = resolvedSku;
}
```

Then rerender.ts line 99-109 stamps `model_used = resolvedSku = "kling-v2-6-pro"` on an iteration that was actually rendered by native Kling v2-master or Runway. Two issues:

1. **User intent violated:** the "Retry on another SKU" UI button at `PromptLab.tsx:1635-1653` calls `handleRerender(id, "atlas", sku)`. Good — that avoids the escape hatch. But if a user ever selects a specific SKU from the (now-hidden) Advanced Provider dropdown while also picking "kling" or "runway", their SKU pick is silently dropped. The UI doesn't expose both together today, but the API contract is misleading — if a future UI surfaces Kling/Runway with SKU, the SKU will be thrown away.

2. **Data pollution for learning:** the rating ledger, Thompson router `router_bucket_stats`, and retrieval RPCs all key on `model_used`. A native Kling render stamped "kling-v2-6-pro" poisons the Atlas v2-6-pro arm stats with a Kling-v2-native outcome. The P5 Thompson dry-run stats will drift as long as escape-hatch renders are happening.

**Suggested fix:** For the escape hatch, set `resolvedSku = "kling-v2-native"` (for kling) or `"runway-gen4"` (for runway), and add those as recognized values in `V1_ATLAS_SKUS` filtering code or handle them separately upstream.

---

## 3. Important

### I1. Fire-and-forget judge IIFE is unsafe on Vercel serverless

**File:** `lib/prompt-lab.ts:721-796`

`finalizeLabRender` kicks off an anonymous async IIFE for the Gemini judge AFTER computing `persistedUrl`. The cron response returns as soon as `finalizeLabRender`'s outer function returns, but the judge call (+21s per the gemini-judge comment) continues in the background. Vercel serverless explicitly does not guarantee background work completes — once `res.json(...)` returns in the cron handler, the Lambda can be frozen or destroyed. The judge IIFE is at high risk of being killed mid-request.

**Symptoms that would prove this is happening:**
- `judge_rating_json` NULL on many completed iterations despite JUDGE_ENABLED=true.
- Gemini API billing partial charges for started-but-not-completed video-understanding calls.
- `judge_error` column empty (because the catch never fires — the process just dies).

**Suggested fix:** Move the judge to an explicit endpoint (`api/admin/prompt-lab/finalize-with-judge.ts` already exists) and call it synchronously from the cron inside the same request's async flow, awaited. The finalize-with-judge endpoint's 21s latency fits within the cron's `maxDuration = 120`.

Alternative: rely on a separate cron (`poll-lab-judges`) that picks up `clip_url IS NOT NULL AND judge_rating_json IS NULL`. This is the cleanest pattern for Vercel.

---

### I2. Concurrent poll-cron runs can double-fire cost_events + judge

**Files:** `api/cron/poll-lab-renders.ts:114-189`, `lib/prompt-lab.ts:702-796`

The poll cron runs every minute. Its SELECT filter includes `.is("clip_url", null)` — but the UPDATE that sets `clip_url` happens AFTER `finalizeLabRender` returns (line 183-189). If `finalizeLabRender` takes >60s (download clip, upload to Storage, fire judge), two successive cron invocations can both pick up the same iteration.

Consequences:
1. `finalizeLabRender` fires TWO `cost_events` rows (`lib/prompt-lab.ts:702`) → double-billed in finance reports.
2. Two judge IIFEs run on the same iteration → two Gemini API calls (~2¢ × 2 = 4¢ wasted) → two judge cost_events.
3. The iteration's `cost_cents` UPDATE at `poll-lab-renders.ts:186-188` is ADDITIVE (`row.cost_cents + outcome.costCents`) — so two runs double the billed cost on the iteration row while finance reports triple-count (two cost_events + one inflated iteration cost).

**Mitigations already in place:** None. The query filter is best-effort; there's no advisory lock / `FOR UPDATE SKIP LOCKED` equivalent.

**Suggested fix:** Before calling `finalizeLabRender`, do a conditional UPDATE that stamps a sentinel `finalizing_at = now()` and continues only if the row wasn't already being finalized. Or: set `clip_url` to a sentinel (`"pending-upload"`) atomically in a pre-flight UPDATE, so the second cron's `.is("clip_url", null)` filter excludes it. Cleanest: separate the download/upload from the DB commit into a single transaction guarded by a claim column.

---

### I3. `submitLabRender::isPaired = Boolean(params.endImageUrl)` is brittle

**File:** `lib/prompt-lab.ts:611-617`

```ts
} else if (params.endImageUrl) {
  resolvedSku = "kling-v2-1-pair" as unknown as V1AtlasSku;
  provider = new AtlasProvider("kling-v2-1-pair");
  staticSku = resolvedSku;
}
```

This is the exact detection that caused today's `4000050` bug. The fix moved the `endImageUrl` gate UP the call stack (render.ts now only sets endImageUrl when `director.end_photo_id` exists), but the function itself still treats ANY non-null `endImageUrl` as a paired render. If a future caller passes `endImageUrl` for any other purpose (e.g. "nudge end-frame" experimentation), the same class of bug recurs.

**Safer contract:** have `submitLabRender` key on `scene.end_photo_id` directly (it's on the DirectorSceneOutput type — see `lib/prompts/director.ts:7`), and validate that `params.endImageUrl` is only present WHEN `scene.end_photo_id` is set. This would make the bug impossible to re-introduce at a caller.

Related: the paired path forces `model_used = "kling-v2-1-pair"`, which is NOT in `V1_ATLAS_SKUS`. Thompson + router-table analysis that filters to V1 SKUs silently drops paired renders. Flagging for Oliver to confirm intent.

---

### I4. Rerender drops `end_photo_id` from source iteration

**File:** `api/admin/prompt-lab/rerender.ts:66-97`

When rerendering a paired iteration (source has `director_output_json.end_photo_id`), the clone copies `director_output_json` (line 73) but does NOT pass `endImageUrl` into `submitLabRender` (line 91-97). Result: the new iteration is rendered as single-image, even though the source was paired. The cloned `director_output_json` still carries `end_photo_id`, so the iteration looks paired in the UI but the actual render used `kling-v2-6-pro`.

**Symptoms:**
- User hits "Retry on another SKU" on a paired scene → new iteration doesn't match the original's paired semantics → they can't actually comparison-rate SKUs on the paired variant.
- If the failed-iteration retry path includes paired scenes, they silently become single-image on retry.

**Suggested fix:** In rerender.ts, resolve endImageUrl from `source.director_output_json.end_photo_id` the same way render.ts does, and pass it to `submitLabRender`. This also re-syncs with the 4000050 fix: both submit paths now share the same "only pair if explicit" logic.

---

### I5. `LAB_SYNTHETIC_PROPERTY_ID` breaks `recordCostEvent` for judge + finalize

**File:** `lib/db.ts:367-392`, `lib/prompt-lab.ts:32, 703`, `lib/providers/gemini-judge.ts:160, 191`

```ts
// recordCostEvent:
const { error: insertErr } = await supabase.from("cost_events").insert({ property_id: event.propertyId, ... });
if (insertErr) throw insertErr;
if (event.costCents > 0) {
  await addPropertyCost(event.propertyId, Math.round(event.costCents));  // calls getProperty(id).single() — throws if no row
}
```

`addPropertyCost` loads the property row via `.single()` — which errors if the zero-UUID property row doesn't exist. And no migration inserts `00000000-0000-0000-0000-000000000000` into `properties`. So for every Lab-render + judge call:

- If property_id has FK + zero-UUID row doesn't exist: the insert itself fails → no cost_event stored → silent cost leak.
- If FK allows the zero-UUID OR the row is manually inserted: the insert succeeds, then `addPropertyCost` throws ("property not found") → bubbles up → wrapped by outer try/catch in finalizeLabRender (line 717) and gemini-judge (line 176) → swallowed as "non-fatal".

The outcome is silent. Either cost_events rows are missing (if FK-strict) or they're rolled up into a phantom zero-UUID property (muddying dashboards). Oliver's memory says "cost tracking first-class" — this is a blocker for accurate dollar accounting.

**Suggested fix:** Either (a) insert a real "Lab Synthetic" property row via migration with a stable UUID, or (b) make `recordCostEvent` accept `propertyId: null` and let poll-lab-renders-style direct inserts handle property-less rows (cost_events already allows property_id=null based on poll-lab-renders.ts:154 which inserts `property_id: null` directly). Option (b) is simpler and consistent with existing direct-insert callers.

---

### I6. Poll cron has no early exit when provider = "atlas" in queue-phase either

**File:** `api/cron/poll-lab-renders.ts:47`

Same filter as C1 applies to the Phase 1 "submit queued renders" loop. If an Atlas render hits `ProviderCapacityError` (only thrown for Kling at line 602 of prompt-lab.ts, so this is mostly theoretical for Atlas today), the queued-row path could become relevant later. Low priority but worth fixing in the same patch as C1.

---

## 4. Minor

### M1. `duration_seconds >= 7 ? 10 : 5` snap-down at `lib/prompt-lab.ts:640`

If director returns `duration_seconds: 6`, it snaps to 5 (not 10). Atlas's `clampDuration` also snaps to nearest allowed value (5 or 10). So on a 6s request we deliver 5s. Not wrong, but worth a comment clarifying the 7s threshold is intentional (rounds down under 7, up at 7+).

### M2. Shadow log `static_decision_json` for escape-hatch path is misleading

**File:** `api/admin/prompt-lab/render.ts:133`, `lib/prompt-lab.ts:608-610`

When the escape hatch fires (providerOverride=kling|runway), `staticSku` is set to `"kling-v2-6-pro"` (hardcoded). The shadow log then records `static_decision_json: { sku: "kling-v2-6-pro" }` even though the render went through KlingProvider (native) or RunwayProvider. A/B analysis of the shadow log would falsely credit Atlas for those outcomes.

### M3. `resolveDecisionAsync` casts `modelKey as V1AtlasSku` without runtime check

**File:** `lib/providers/router.ts:345`

```ts
const staticSku = staticDecision.modelKey as V1AtlasSku;
```

`resolveDecision` always populates `modelKey`, so this cast is safe today. But if a future edit makes modelKey optional, there's no defense — we'd silently stamp `undefined` into `staticSku` and break the shadow-log NOT NULL constraint at runtime. Cheap fix: `const staticSku = (staticDecision.modelKey ?? V1_DEFAULT_SKU) as V1AtlasSku;`

### M4. `poll-lab-renders.ts` timeout check happens AFTER the provider-filter skip

**File:** `api/cron/poll-lab-renders.ts:115-128`

The 30-minute timeout at :121 is only reached for kling/runway rows. Atlas rows (per C1) never reach the timeout check, so they never get marked timed out. When C1 is fixed, re-verify the timeout logic applies to Atlas too.

### M5. `end-frame.ts::resolveEndFrameUrl` synthesizes center-crop by default

**File:** `lib/services/end-frame.ts:19-28`

When `endPhotoUrl` is falsy, it SYNTHESIZES a crop instead of returning null. This is the exact behavior that caused `4000050` — `render.ts` used to always call this and get a non-null URL back. The fix moved the guard upstream (render.ts no longer calls it for single-image), but the function itself is still a trap for future callers. Consider splitting into two functions: `resolveEndFrameUrlStrict` (returns null if no paired photo) and `synthesizeEndFrame` (always crops). This makes the unsafe operation explicit at call sites.

### M6. `embedImage` cost_events always record `costCents: 0`

**File:** `lib/embeddings-image.ts:109, 134`

Gemini embedding is billed at ~$0.00012/image = 0.012¢. Rounded to integer cents, this is always 0. Over N=1000 images, actual spend is ~12¢; reported spend in dashboards is 0¢. Either switch cost_events to fractional cents (would require schema change), or accumulate 100-image batches and record 1¢ per batch. Low priority but compounds over the embeddings backfill.

---

## 5. What LOOKS fine

- **End-frame fix (`4000050`) is correct for `render.ts`.** The guard `if (director?.end_photo_id)` now gates both the session lookup and the `resolveEndFrameUrl` call. Single-image renders never call `resolveEndFrameUrl` anymore → `endImageUrl` stays null → `submitLabRender` doesn't flip paired mode. Verified in code.
- **SKU threading through `resolveDecisionAsync` → `AtlasProvider(resolvedSku)`** is correct for the non-paired path. `lib/prompt-lab.ts:620-628` + `AtlasProvider.resolveModel` at `atlas.ts:247-254` correctly honor the per-call SKU.
- **Migrations 031–038 applied.** (Based on file presence in `supabase/migrations/`.) Thompson tables 038 have NOT NULL constraints the inserts satisfy (both `thompson_decision_json` and `static_decision_json` are always objects).
- **Shadow log FK on iteration_id.** The insert ordering in `render.ts` (insert shadow_log AFTER the iteration UPDATE succeeds) + try/catch wrapping means FK failures don't bubble out of the render response.
- **Thompson math kernel is solid.** Test suite in `lib/providers/thompson-router.test.ts` covers Gamma/Beta samplers, cold-start, sparse bucket fallback, empty-arm fallback. `pickArm` never returns `sku: undefined`.
- **Gemini judge hard-error paths (API key missing, JUDGE_ENABLED=false, clip URL 404) all route through the outer try/catch in `finalizeLabRender`'s IIFE** and persist `judge_error` without crashing the cron. (Caveat: I1 — the IIFE itself is at risk of being killed.)
- **`submitLabRender` SKU validation** at `render.ts:34-41` correctly rejects unknown SKUs before touching the DB.
- **`finalize-with-judge.ts` path** is well-structured: validates iteration has clip_url, fetches photo bytes non-fatally, persists judge_error on failure. Serves as a solid pattern for the fix suggested in I1.
- **Rerender shadow-log null safety** is fine — `submitLabRender` always returns `staticSku: V1AtlasSku` regardless of code path.

---

## Appendix — Open questions for Oliver

1. **Are the 3 stuck iterations from today's `4000050` incident still sitting in the DB with `provider = "atlas"` and no `clip_url`?** If yes, they're proof-positive of C1 — fixing the cron filter will let the next run finalize them (Atlas jobs should still be resolvable via `checkStatus` since Atlas keeps results for ~7 days).
2. **Does the zero-UUID property row exist in production `properties`?** If yes, Lab cost_events have been rolling up into it since the beginning; dashboards may show a phantom "property" at the top of spend charts. If no, the recordCostEvent + addPropertyCost chain has been silently swallowing all Lab render + judge cost_events since P1/P2 landed — there's a real audit-data gap to backfill.
3. **Are native-Kling escape-hatch renders (rerender with provider="kling") still actively used?** If the UI doesn't expose that path anymore (hidden behind Advanced), then C4's "user SKU pick ignored" risk is dormant. But the `model_used = "kling-v2-6-pro"` mislabel persists for any render that did go through the escape hatch — it's polluting Thompson arm stats right now.
