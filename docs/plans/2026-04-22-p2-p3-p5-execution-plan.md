# P2 + P3 + P5 Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute three pre-cooked skeleton branches (P2 Gemini auto-judge, P3 image embeddings, P5 Thompson SKU router) end-to-end — replace API-binding TODOs with real calls, apply migrations via Supabase MCP, merge to main, deploy via git push (Vercel auto-deploy), verify runtime.

**Architecture:** Each phase already has a complete skeleton (migration + typed TS module with stub + tests passing) on its own branch. Remaining work is surgical: swap TODO blocks for real provider API calls, seed/verify data, wire integration hooks, merge. Each phase is independent — can execute serially, pausing between phases for Oliver's review.

**Tech Stack:** TypeScript, Vite + React 18, Vercel serverless (Node 20 ESM), Supabase (Postgres + pgvector), Supabase MCP for migrations, Vercel MCP for deploy monitoring, AtlasCloud video, `@google/genai` for Gemini (judge + embeddings), vitest.

**Scope note:** This plan covers three independent subsystems. Sections are fully independent — if any phase hits a blocker, skip it and continue with the others.

**Reference branches (already pre-cooked, pre-review):**
- `session/p2-s1-implementation-draft` (`171c260`) — P2 skeleton; Opus review flagged I6/I7 (missing tests)
- `session/p3-s1-implementation-draft` (`255d265`) — P3 skeleton; Opus review cleared
- `session/p5-s1-implementation-draft` (`ea0c46a`) — P5 math + C2/C3 fixes; Opus review cleared

**Reference docs to keep open:**
- `docs/state/P2-IMPLEMENTATION-STATUS.md` (branch p2)
- `docs/state/P3-IMPLEMENTATION-STATUS.md` (branch p3)
- `docs/state/P5-IMPLEMENTATION-STATUS.md` (branch p5)
- `docs/state/JUDGE-RUBRIC-V1.md` (branch `session/p2-rubric-design`)
- `docs/specs/p5-thompson-router-design.md` (branch `session/p5-thompson-design`)
- `docs/audits/p3-image-embedding-provider-decision.md` (branch `session/p3-embedding-preflight`)

**Cost budget:** P2 ~$0.10 (3-5 judge calls at ~$0.02 each to verify). P3 ~$0.10 (1 photo verify + small backfill). P5 $0 (logic-only). Total: ~$0.20.

**Ordering rule:** Execute P5 → P3 → P2.
- P5 first because it's zero external API cost (pure logic + DB); least risky.
- P3 second because backfill is one-shot (fire script once, done).
- P2 last because it wires into `finalizeLabRender` (prod code path) and needs live validation with a real render.

Each phase ends with: commit → merge to main → push → Vercel deploy → verify runtime logs. After the last phase: final Opus review + HANDOFF update + memory sync.

---

## Phase P5 — Wire Thompson router (dry-run mode)

**Duration target:** 45 minutes.

**Preconditions:** main at `9aeaf8e` or later. Migrations 031 + 032 already applied in prod.

**End state:** `router_bucket_stats` + `router_shadow_log` tables live in prod. `pickArm` integrated into `resolveDecision` behind `USE_THOMPSON_ROUTER` env flag (default `false` = existing behavior). `submitLabRender` writes a `router_shadow_log` row for every render.

### Task P5.1: Merge P5 branch into main

**Files:** none (git operation)

- [ ] **Step 1: Verify P5 branch + main state**

```bash
git status
git log --oneline main -3
git log --oneline session/p5-s1-implementation-draft -3
```

Expected: main clean, HEAD at `9aeaf8e` or later. P5 branch head at `ea0c46a`.

- [ ] **Step 2: Merge P5 with no-fast-forward**

```bash
git checkout main
git merge --no-ff session/p5-s1-implementation-draft -m "$(cat <<'EOF'
merge(p5): Thompson router math kernel + migrations + C2/C3 fixes

Merges session/p5-s1-implementation-draft (4ceb580 + ea0c46a):
- Migration 038: router_bucket_stats + router_shadow_log (additive)
- lib/providers/thompson-router.ts: pure-logic bandit module (20/20 tests)
- scripts/refresh-router-bucket-stats.ts: seed script (dry-run default)
- C2/C3 fixes from Opus review (numeric(10,2), room_type query)

NOT wired into submitLabRender yet — that's Phase P5.3/P5.4 of the
execution plan. Merge lands the kernel; subsequent tasks wire it behind
USE_THOMPSON_ROUTER env flag (default false = existing behavior).
EOF
)"
```

Expected: merge commit created. Working tree clean.

- [ ] **Step 3: Verify typecheck + tests pass on main**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: typecheck clean; 100/100 tests pass (80 from P1 + 20 new Thompson).

### Task P5.2: Apply migration 038 to prod via Supabase MCP

**Files:** none (DB operation)

- [ ] **Step 1: Read migration file**

```bash
cat supabase/migrations/038_thompson_router.sql
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
- `project_id`: `vrhmaeywqsohlztoouxu`
- `name`: `thompson_router`
- `query`: full contents of `supabase/migrations/038_thompson_router.sql`

Expected: `{"success":true}`.

- [ ] **Step 3: Verify tables exist**

Use `mcp__plugin_supabase_supabase__execute_sql`:

```sql
SELECT table_name,
       (SELECT count(*) FROM information_schema.columns
        WHERE table_name = t.table_name) AS col_count
FROM information_schema.tables t
WHERE table_name IN ('router_bucket_stats', 'router_shadow_log');
```

Expected: 2 rows, `router_bucket_stats` (11 cols including alpha/beta/judge_alpha/judge_beta as numeric), `router_shadow_log` (5 cols).

- [ ] **Step 4: Verify numeric(10,2) type on alpha/beta**

```sql
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name = 'router_bucket_stats'
  AND column_name IN ('alpha', 'beta', 'judge_alpha', 'judge_beta');
```

Expected: 4 rows with `data_type='numeric'`, `numeric_precision=10`, `numeric_scale=2`.

### Task P5.3: Wire pickArm into resolveDecision behind feature flag

**Files:**
- Modify: `lib/providers/router.ts` (around `resolveDecision` at line ~98)
- Test: `lib/providers/router.test.ts` (extend with flag-on flag-off tests)

- [ ] **Step 1: Read existing resolveDecision**

Open `lib/providers/router.ts`. Locate the `resolveDecision` function (exported). Current body returns `{ provider: "atlas", modelKey: <sku>, fallback: undefined }` where `<sku>` = `skuOverride` if valid else `V1_DEFAULT_SKU`.

- [ ] **Step 2: Add feature-flag-aware path**

Create a new helper that loads bucket arms from the DB and calls `pickArm`:

```typescript
// At the top of router.ts, near other imports:
import { getSupabase } from "../client.js";
import { pickArm, type BucketArm, type BucketArms, type ThompsonDecision } from "./thompson-router.js";

/**
 * Load the bandit arms for a (room_type, camera_movement) bucket from
 * router_bucket_stats. Returns null if the table is empty (migration not
 * seeded yet) or if the query fails — callers fall back to V1_DEFAULT_SKU.
 *
 * This is a SHALLOW query — expected < 10 rows per bucket. Cached per-scene
 * caller, not per-process (each render does its own read). If this becomes
 * hot (>100 renders/min), add an in-memory TTL cache.
 */
async function loadBucketArms(
  roomType: string,
  movement: string,
): Promise<BucketArms | null> {
  try {
    const { data, error } = await getSupabase()
      .from("router_bucket_stats")
      .select("sku, alpha, beta, enabled")
      .eq("room_type", roomType)
      .eq("camera_movement", movement);
    if (error || !data) return null;
    const arms: BucketArm[] = data
      .filter((r) => (V1_ATLAS_SKUS as readonly string[]).includes(r.sku))
      .map((r) => ({
        sku: r.sku as V1AtlasSku,
        alpha: Number(r.alpha ?? 0),
        beta: Number(r.beta ?? 0),
        enabled: Boolean(r.enabled),
        trial_count: Number(r.alpha ?? 0) + Number(r.beta ?? 0),
      }));
    return { room_type: roomType, camera_movement: movement, arms };
  } catch {
    return null;
  }
}

/**
 * Thompson-aware resolveDecision. When USE_THOMPSON_ROUTER !== 'true',
 * returns the existing behavior exactly. When enabled, loads bucket
 * arms and calls pickArm; falls back to static decision on any failure.
 *
 * Returns a ThompsonDecision-augmented ProviderDecision when Thompson is
 * consulted (so callers can log the bandit state to router_shadow_log).
 */
export async function resolveDecisionAsync(
  input: ResolveDecisionInput,
): Promise<{ decision: ProviderDecision; thompson?: ThompsonDecision }> {
  // Always compute the static decision — used as fallback and as the
  // shadow-log comparison baseline.
  const staticDecision = resolveDecision(input);

  if (process.env.USE_THOMPSON_ROUTER !== "true") {
    return { decision: staticDecision };
  }

  const arms = await loadBucketArms(input.roomType, input.movement);
  if (!arms || arms.arms.length === 0) {
    return { decision: staticDecision };
  }

  const thompson = pickArm(arms, V1_DEFAULT_SKU);
  return {
    decision: {
      provider: "atlas",
      modelKey: thompson.sku,
      fallback: undefined,
    },
    thompson,
  };
}
```

**DO NOT modify the existing synchronous `resolveDecision` function.** Non-Thompson callers continue to use it unchanged. Thompson-aware callers (just `submitLabRender`) use the new `resolveDecisionAsync`.

- [ ] **Step 3: Add the flag-awareness tests**

Append to `lib/providers/router.test.ts`:

```typescript
import { resolveDecisionAsync } from "./router.js";

describe("resolveDecisionAsync — feature-flag behavior", () => {
  const ORIGINAL_FLAG = process.env.USE_THOMPSON_ROUTER;
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.USE_THOMPSON_ROUTER;
    else process.env.USE_THOMPSON_ROUTER = ORIGINAL_FLAG;
  });

  it("returns static decision when flag unset", async () => {
    delete process.env.USE_THOMPSON_ROUTER;
    const r = await resolveDecisionAsync({
      roomType: "kitchen",
      movement: "push_in",
      skuOverride: null,
    });
    expect(r.decision.provider).toBe("atlas");
    expect(r.decision.modelKey).toBe(V1_DEFAULT_SKU);
    expect(r.thompson).toBeUndefined();
  });

  it("returns static decision when flag is 'false'", async () => {
    process.env.USE_THOMPSON_ROUTER = "false";
    const r = await resolveDecisionAsync({
      roomType: "kitchen",
      movement: "push_in",
      skuOverride: null,
    });
    expect(r.thompson).toBeUndefined();
  });

  // When flag = true but DB has no arms, falls back to static.
  // Full live-DB integration test deferred to P5 Session 2 A/B audit.
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run lib/providers/router.test.ts
```

Expected: all tests pass (6 existing + new async tests).

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/providers/router.ts lib/providers/router.test.ts
git commit -m "$(cat <<'EOF'
feat(p5): wire pickArm into resolveDecisionAsync behind USE_THOMPSON_ROUTER

Adds resolveDecisionAsync(input) that loads bucket arms from
router_bucket_stats and calls pickArm when USE_THOMPSON_ROUTER=true.
Falls back to static decision on any failure (empty table, DB error,
missing bucket). Default behavior (flag unset/false) is unchanged.

The original synchronous resolveDecision stays intact — it's the
canonical static path and serves as the shadow-log comparison baseline
in Task P5.4.

Tests cover flag-off behavior. Full bucket-populated A/B flow lands in
P5 Session 2 (2026-05-01).
EOF
)"
```

### Task P5.4: Shadow-log in submitLabRender

**Files:**
- Modify: `lib/prompt-lab.ts::submitLabRender` (where it currently calls `resolveDecision`)

- [ ] **Step 1: Locate the resolveDecision call in submitLabRender**

```bash
grep -n "resolveDecision\|resolveDecisionAsync" lib/prompt-lab.ts
```

Identify the line where `submitLabRender` calls `resolveDecision` for non-paired scenes.

- [ ] **Step 2: Swap to async + log**

Replace the resolveDecision call with:

```typescript
// Non-paired: Thompson-aware routing + shadow log.
const { decision, thompson } = await resolveDecisionAsync({
  roomType: params.roomType,
  movement: params.scene.camera_movement,
  skuOverride: params.sku ?? null,
});

// Also compute what static would have picked (already done inside
// resolveDecisionAsync, but we need the record for the log).
const staticDecision = resolveDecision({
  roomType: params.roomType,
  movement: params.scene.camera_movement,
  skuOverride: params.sku ?? null,
});

resolvedSku = decision.modelKey as V1AtlasSku;
process.env.ATLAS_VIDEO_MODEL = resolvedSku;
provider = new AtlasProvider(resolvedSku);
```

Import `resolveDecisionAsync` at the top of the file alongside the existing `resolveDecision` import.

After the provider is instantiated and the jobId is returned from `provider.generateClip`, add the shadow-log write. This needs the iteration_id, which is NOT in scope of `submitLabRender` — so we log from the CALLER instead. Decision: add a simple `logRouterShadow` helper and call it from the render + rerender endpoints after `submitLabRender` returns.

**Revised approach (cleaner):** `submitLabRender` returns `thompson` in its result; the calling endpoints persist to `router_shadow_log`.

Extend the return type:

```typescript
export async function submitLabRender(params: {
  // ...existing params
}): Promise<{
  jobId: string;
  provider: string;
  sku: V1AtlasSku;
  thompson?: ThompsonDecision;  // present only when flag on + bucket exists
  staticSku: V1AtlasSku;  // what the static router would have picked
}> {
  // ...existing code replaced per above...
  return {
    jobId,
    provider: provider.name,
    sku: resolvedSku as V1AtlasSku,
    thompson,
    staticSku: staticDecision.modelKey as V1AtlasSku,
  };
}
```

- [ ] **Step 3: Add shadow-log write to render.ts**

File: `api/admin/prompt-lab/render.ts`

After the supabase update that persists `model_used`, add:

```typescript
// Shadow-log: record what Thompson picked vs what static would have picked.
// Non-blocking; failures are logged but don't fail the render.
try {
  await supabase.from("router_shadow_log").insert({
    iteration_id,
    thompson_decision_json: thompson
      ? {
          sku: thompson.sku,
          reason: thompson.reason,
          sampled_theta: thompson.sampled_theta ?? null,
          arm_state: thompson.arm_state,
        }
      : { sku: resolvedSku, reason: "flag_off" },
    static_decision_json: { sku: staticSku },
    divergence_reason:
      thompson && thompson.sku !== staticSku
        ? `thompson.${thompson.reason}(theta=${thompson.sampled_theta ?? "n/a"})`
        : null,
  });
} catch (err) {
  console.error("[router_shadow_log] insert failed:", err);
}
```

Where `thompson`, `resolvedSku`, `staticSku` come from destructuring the `submitLabRender` return.

- [ ] **Step 4: Add shadow-log write to rerender.ts**

Same pattern as Step 3 but in `api/admin/prompt-lab/rerender.ts`.

- [ ] **Step 5: Run tests + typecheck**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: all tests pass; typecheck clean. (The existing `prompt-lab.test.ts` mocks will need updates to return the new `thompson` and `staticSku` fields — adjust accordingly.)

- [ ] **Step 6: Commit**

```bash
git add lib/prompt-lab.ts api/admin/prompt-lab/render.ts api/admin/prompt-lab/rerender.ts
git commit -m "$(cat <<'EOF'
feat(p5): shadow-log Thompson vs static decision on every Lab render

submitLabRender now returns { thompson?, staticSku } alongside { jobId,
provider, sku }. render + rerender endpoints persist a router_shadow_log
row per iteration capturing:
- Thompson's decision JSON (sku, reason, sampled_theta, arm_state) OR
  a flag_off sentinel when USE_THOMPSON_ROUTER !== 'true'
- Static baseline sku (what the non-Thompson router would have picked)
- Divergence reason (null if same, else thompson-reason-string)

Non-blocking: insert failures log to stderr but don't fail the render.
Matches the P5 design §10.4 dry-run A/B comparison pattern.

With USE_THOMPSON_ROUTER unset (the default), every shadow-log row
has thompson_decision_json.reason='flag_off' and divergence_reason=null.
That's expected pre-rollout; the dry-run data accumulates for the
P5 Session 2 (2026-05-01) A/B audit.
EOF
)"
```

### Task P5.5: Push + verify deploy

- [ ] **Step 1: Push main**

```bash
git push origin main
```

Expected: push succeeds.

- [ ] **Step 2: Monitor Vercel deploy via MCP**

Use `mcp__plugin_vercel_vercel__list_deployments` with:
- `teamId`: `team_Vn3CcvEwB2S4Bi3BeWw4Hit6`
- `projectId`: `prj_ZJRb76Pu05FHirZsHNH17MuJcL00`

Identify the new deployment's ID for the latest commit.

- [ ] **Step 3: Poll until READY**

Use `mcp__plugin_vercel_vercel__get_deployment` with the new deployment ID. State should transition BUILDING → READY. If ERROR, fetch build logs and report.

- [ ] **Step 4: Verify no new runtime errors**

Use `mcp__plugin_vercel_vercel__get_runtime_logs` after deploy hits READY. Any new errors related to router/shadow_log should be flagged. Pre-existing `poll-listing-iterations` errors are not caused by P5.

---

## Phase P3 — Wire image embeddings (enable backfill)

**Duration target:** 30 minutes.

**Preconditions:** P5 pushed + verified.

**End state:** migration 034 applied in prod. `embedImage` calls real Gemini API behind `ENABLE_IMAGE_EMBEDDINGS` flag. Backfill script run against all 150+ photos + 100+ sessions.

### Task P3.1: Merge P3 branch

- [ ] **Step 1: Merge**

```bash
git checkout main
git merge --no-ff session/p3-s1-implementation-draft -m "$(cat <<'EOF'
merge(p3): image embeddings skeleton — migration 034 + backfill + tests

Merges session/p3-s1-implementation-draft (255d265):
- Migration 034: image_embedding vector(768) + HNSW indexes on photos
  and prompt_lab_sessions
- lib/embeddings-image.ts: skeleton (kill-switch + Gemini binding TODO)
- lib/embeddings-image.test.ts: 7/7 tests
- scripts/backfill-image-embeddings.ts: dry-run default

Gemini binding is filled in by P3 S1 Task 2 below.
EOF
)"
```

- [ ] **Step 2: Verify tests**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: 107/107 passing (100 from P1+P5 + 7 P3); typecheck clean.

### Task P3.2: Apply migration 034 via Supabase MCP

- [ ] **Step 1: Read migration**

```bash
cat supabase/migrations/034_image_embeddings.sql
```

- [ ] **Step 2: Apply via MCP**

`mcp__plugin_supabase_supabase__apply_migration`:
- `project_id`: `vrhmaeywqsohlztoouxu`
- `name`: `image_embeddings`
- `query`: full contents of 034

- [ ] **Step 3: Verify columns**

```sql
SELECT table_name, column_name, udt_name
FROM information_schema.columns
WHERE column_name IN ('image_embedding', 'image_embedding_model', 'image_embedding_at')
  AND table_name IN ('photos', 'prompt_lab_sessions');
```

Expected: 6 rows. `image_embedding` columns should have `udt_name='vector'`.

### Task P3.3: Fill Gemini binding in embeddings-image.ts

**Files:**
- Modify: `lib/embeddings-image.ts` (replace TODO(p3-s1) block)

- [ ] **Step 1: Read the current stub**

```bash
grep -n "TODO(p3-s1)" lib/embeddings-image.ts
```

- [ ] **Step 2: Read gemini-analyzer.ts for the SDK pattern**

```bash
head -100 lib/providers/gemini-analyzer.ts
```

Note the `@google/genai` import pattern, API key usage, and response shape.

- [ ] **Step 3: Implement the Gemini embedding call**

Replace the TODO(p3-s1) block in `lib/embeddings-image.ts::embedImage` with:

```typescript
import { GoogleGenAI } from "@google/genai";

// ... inside embedImage, replacing the TODO block:
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY required for image embeddings");

// Fetch image bytes if not supplied.
let bytes = input.imageBytes;
if (!bytes) {
  const res = await fetch(input.imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  bytes = Buffer.from(await res.arrayBuffer());
}
const mimeType = input.imageUrl.endsWith(".png")
  ? "image/png"
  : input.imageUrl.endsWith(".webp")
    ? "image/webp"
    : "image/jpeg";

const genai = new GoogleGenAI({ apiKey });
const resp = await genai.models.embedContent({
  model: IMAGE_EMBEDDING_MODEL,
  contents: [
    {
      parts: [
        {
          inlineData: {
            mimeType,
            data: bytes.toString("base64"),
          },
        },
      ],
    },
  ],
  config: { outputDimensionality: IMAGE_EMBEDDING_DIM },
});

const vector = resp.embeddings?.[0]?.values;
if (!vector || vector.length !== IMAGE_EMBEDDING_DIM) {
  throw new Error(
    `Unexpected embedding shape: got ${vector?.length ?? 0}, expected ${IMAGE_EMBEDDING_DIM}`,
  );
}

// Cost-event on success (estimated 0.012¢ per image = ~$0.00012).
const latency_ms = Date.now() - startedAt;
try {
  await recordCostEvent({
    propertyId: "00000000-0000-0000-0000-000000000000",
    sceneId: null,
    stage: "analysis",
    provider: "google",
    unitsConsumed: 1,
    unitType: "tokens",
    costCents: 0,  // sub-cent — track as 0 until pricing confirmed via invoice
    metadata: {
      subtype: "image_embedding",
      surface: input.surface,
      photo_id: input.photoId ?? null,
      session_id: input.sessionId ?? null,
      model: IMAGE_EMBEDDING_MODEL,
      dim: IMAGE_EMBEDDING_DIM,
      latency_ms,
    },
  });
} catch { /* non-fatal */ }

return { vector, model: IMAGE_EMBEDDING_MODEL, dim: IMAGE_EMBEDDING_DIM };
```

The SDK call shape is the key uncertainty — if the real `@google/genai` version returns a different shape, the `resp.embeddings?.[0]?.values` line is what to adjust. Verify by inspecting the response on the first real call.

- [ ] **Step 4: Update the test to cover the success path**

Mock `@google/genai` in `lib/embeddings-image.test.ts`:

```typescript
import { vi } from "vitest";
vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      embedContent: vi.fn().mockResolvedValue({
        embeddings: [{ values: new Array(768).fill(0.01) }],
      }),
    },
  })),
}));

// ... in an existing "enabled" describe block, replace the unwired-error
// assertion with a success assertion:
it("returns ImageEmbedding on success path", async () => {
  process.env.ENABLE_IMAGE_EMBEDDINGS = "true";
  const r = await embedImage({
    imageUrl: "https://example.com/p.jpg",
    imageBytes: Buffer.from([1, 2, 3]),
    surface: "lab",
  });
  expect(r.vector.length).toBe(768);
  expect(r.model).toBe("gemini-embedding-2");
  expect(r.dim).toBe(768);
});
```

- [ ] **Step 5: Run tests + typecheck**

```bash
npx vitest run lib/embeddings-image.test.ts
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add lib/embeddings-image.ts lib/embeddings-image.test.ts
git commit -m "$(cat <<'EOF'
feat(p3): fill Gemini embedContent binding in embeddings-image.ts

Replaces the TODO(p3-s1) stub with the real @google/genai call. Uses
models.embedContent with inlineData + outputDimensionality: 768. Fetches
image bytes from imageUrl if not pre-supplied. Emits cost_event on
success (costCents=0 for now; revisit after first invoice).

Kill-switch + kill-switch test unchanged. Success-path test mocks
@google/genai to verify shape validation.
EOF
)"
```

### Task P3.4: Verify billing on one photo

- [ ] **Step 1: Pick one photo to probe**

```bash
psql "$SUPABASE_DB_URL" -c "SELECT id, image_url FROM photos WHERE image_embedding IS NULL LIMIT 1;" 2>/dev/null || \
  node -e 'import("./lib/client.js").then(({getSupabase}) => getSupabase().from("photos").select("id,image_url").is("image_embedding",null).limit(1).then(r => console.log(JSON.stringify(r.data,null,2))))'
```

- [ ] **Step 2: Run the backfill for that one photo**

```bash
ENABLE_IMAGE_EMBEDDINGS=true npx tsx scripts/backfill-image-embeddings.ts --target photos --limit 1 --write
```

Expected: `embedded photo_id=<id>`, no errors.

- [ ] **Step 3: Verify the row has an embedding**

```sql
-- via supabase MCP execute_sql or psql
SELECT id, image_embedding_model, image_embedding_at,
       array_length(image_embedding::float8[], 1) AS dim
FROM photos
WHERE id = '<photo_id_from_step_1>';
```

Expected: `dim=768`, `image_embedding_model='gemini-embedding-2'`.

- [ ] **Step 4: Verify cost_event landed**

```sql
SELECT provider, stage, metadata->>'subtype', metadata->>'photo_id'
FROM cost_events
WHERE metadata->>'subtype' = 'image_embedding'
ORDER BY created_at DESC
LIMIT 3;
```

Expected: at least 1 row with `provider='google'`, `stage='analysis'`, `metadata.subtype='image_embedding'`.

### Task P3.5: Run full backfill

- [ ] **Step 1: Dry-run first**

```bash
ENABLE_IMAGE_EMBEDDINGS=true npx tsx scripts/backfill-image-embeddings.ts --target both --limit 1000
```

Expected: logs "would embed" for every photo + session that still has `image_embedding IS NULL`. Count matches expectations (~150 photos + ~100 sessions).

- [ ] **Step 2: Actual backfill**

```bash
ENABLE_IMAGE_EMBEDDINGS=true npx tsx scripts/backfill-image-embeddings.ts --target both --limit 1000 --write
```

Expected: each row logged as embedded. Total cost reported at the end. Should be $0.00-$0.05.

- [ ] **Step 3: Verify coverage**

```sql
SELECT
  (SELECT count(*) FROM photos WHERE image_embedding IS NOT NULL) AS photos_embedded,
  (SELECT count(*) FROM photos) AS photos_total,
  (SELECT count(*) FROM prompt_lab_sessions WHERE image_embedding IS NOT NULL) AS sessions_embedded,
  (SELECT count(*) FROM prompt_lab_sessions) AS sessions_total;
```

Expected: `photos_embedded / photos_total` and `sessions_embedded / sessions_total` both > 0.9. Any gap is failed-embed rows — spot-check logs.

### Task P3.6: Push + verify deploy

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Monitor Vercel deploy via MCP**

Same pattern as P5.5.

---

## Phase P2 — Wire Gemini judge (fire-and-forget hook)

**Duration target:** 75 minutes.

**Preconditions:** P5 + P3 pushed + verified. P2 branch at `171c260`.

**End state:** migration 033 applied. `gemini-judge.ts` calls real Gemini API. `finalize-with-judge` endpoint exists. `finalizeLabRender` fires judge as non-blocking hook behind `JUDGE_ENABLED` flag (default `false`). Missing tests (I6/I7) added. One verification render with judge enabled.

### Task P2.1: Merge P2 branch

- [ ] **Step 1: Merge**

```bash
git checkout main
git merge --no-ff session/p2-s1-implementation-draft -m "$(cat <<'EOF'
merge(p2): Gemini auto-judge skeleton — migration 033 + rubric + stub

Merges session/p2-s1-implementation-draft (171c260):
- Migration 033: judge_rating_json + 6 siblings on prompt_lab_iterations
  + judge_calibration_examples table
- lib/prompts/judge-rubric.ts: RUBRIC_VERSION, JUDGE_SYSTEM_PROMPT,
  HALLUCINATION_FLAGS enum, validateJudgeOutput with cross-axis rules
- lib/prompts/judge-rubric.test.ts: 10/10 tests
- lib/providers/gemini-judge.ts: skeleton (binding TODO, JUDGE_ENABLED
  kill-switch)

Gemini binding + endpoint + fire-and-forget hook land in the next tasks.
EOF
)"
```

- [ ] **Step 2: Verify**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: 117/117 passing; clean.

### Task P2.2: Apply migration 033 via Supabase MCP

- [ ] **Step 1: Apply**

`mcp__plugin_supabase_supabase__apply_migration`:
- `project_id`: `vrhmaeywqsohlztoouxu`
- `name`: `prompt_lab_iterations_judge`
- `query`: contents of `supabase/migrations/033_prompt_lab_iterations_judge.sql`

- [ ] **Step 2: Verify**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'prompt_lab_iterations'
  AND column_name LIKE 'judge_%';
```

Expected: 7 rows (judge_rating_json, judge_rating_overall, judge_rated_at, judge_model, judge_version, judge_error, judge_cost_cents).

```sql
SELECT * FROM information_schema.tables WHERE table_name = 'judge_calibration_examples';
```

Expected: 1 row.

### Task P2.3: Fill Gemini binding in gemini-judge.ts

**Files:**
- Modify: `lib/providers/gemini-judge.ts` (replace TODO(p2-s1) block)
- Create: `lib/providers/gemini-judge.test.ts` (addresses I6 from Opus review)
- Modify: `lib/prompts/judge-rubric.test.ts` (add positive cross-axis tests per I7)

- [ ] **Step 1: Replace the TODO block with real Gemini call**

In `lib/providers/gemini-judge.ts`, inside the `try` block where the TODO is:

```typescript
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY required for judge");

// Fetch 6 frames from the clip (Oliver Q2: 6-frame sampling to start).
// First-pass implementation: pass the clip URL directly to Gemini's
// video-understanding endpoint. If the SDK/model doesn't accept
// arbitrary clip URLs (common on hosted clip URLs behind signed auth),
// fall back to extracting 6 keyframes via the clipUrl directly.

// For this first landing, pass the clip URL as a videoData part. The
// Gemini API accepts inline video via fileData with fileUri for
// publicly-fetchable URLs OR inlineData with base64 for downloaded
// bytes. Atlas clip URLs are public (for a window), so fileUri works.
const genai = new GoogleGenAI({ apiKey });

// Build the rubric prompt with optional few-shot examples prepended.
const fewShot = (input.calibrationExamples ?? [])
  .slice(0, 3)
  .map(
    (ex, i) => `Example ${i + 1} (from a similar bucket):\nJudge rating: ${JSON.stringify(ex.judge_rating_json)}${ex.oliver_correction_json ? `\nOliver's correction: ${JSON.stringify(ex.oliver_correction_json)}` : ""}`,
  )
  .join("\n\n");

// Fetch photo bytes if supplied.
const photoInline = input.photoBytes
  ? [{ inlineData: { mimeType: "image/jpeg", data: input.photoBytes.toString("base64") } }]
  : [];

const userPrompt = [
  fewShot ? `CALIBRATION EXAMPLES:\n${fewShot}\n\n---\n` : "",
  `Director intended camera_movement: ${input.cameraMovement}`,
  `Room: ${input.roomType}`,
  `Director prompt: ${input.directorPrompt}`,
  `\nJudge the clip below against the rubric. Return only the JSON schema.`,
].join("\n");

const resp = await genai.models.generateContent({
  model: judge_model,
  contents: [
    {
      parts: [
        { text: JUDGE_SYSTEM_PROMPT + "\n\n" + userPrompt },
        ...photoInline,
        { fileData: { fileUri: input.clipUrl, mimeType: "video/mp4" } },
      ],
    },
  ],
  config: {
    responseMimeType: "application/json",
    temperature: 0.1,
  },
});

const rawText = resp.text ?? "";
let parsed: unknown;
try {
  parsed = JSON.parse(rawText);
} catch (err) {
  throw new Error(`Judge returned non-JSON: ${rawText.slice(0, 200)}`);
}

const validation = validateJudgeOutput(parsed);
if (!validation.ok) {
  throw new Error(`Judge output validation failed: ${validation.error}`);
}

const latency_ms = Date.now() - startedAt;
const cost_cents = 2; // ~$0.02 per call estimate; revisit after invoice

// Log cost_event on success.
try {
  await recordCostEvent({
    propertyId: "00000000-0000-0000-0000-000000000000",
    sceneId: null,
    stage: "analysis",
    provider: "google",
    unitsConsumed: 1,
    unitType: "tokens",
    costCents: cost_cents,
    metadata: {
      subtype: "judge",
      surface: "lab",
      iteration_id: input.iterationId,
      judge_model,
      judge_version: RUBRIC_VERSION,
      latency_ms,
    },
  });
} catch { /* non-fatal */ }

return {
  ...validation.result,
  judge_model,
  judge_version: RUBRIC_VERSION,
  latency_ms,
  cost_cents,
};
```

- [ ] **Step 2: Write `lib/providers/gemini-judge.test.ts` (addresses I6)**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          motion_faithfulness: 4,
          geometry_coherence: 5,
          room_consistency: 5,
          hallucination_flags: [],
          confidence: 4,
          reasoning: "Clean push-in; walls hold; one room.",
          overall: 4,
        }),
      }),
    },
  })),
}));

import { judgeLabIteration, JudgeDisabledError } from "./gemini-judge.js";

const ORIGINAL = process.env.JUDGE_ENABLED;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.JUDGE_ENABLED;
  else process.env.JUDGE_ENABLED = ORIGINAL;
});

const BASE = {
  clipUrl: "https://example.com/clip.mp4",
  directorPrompt: "slow push-in",
  cameraMovement: "push_in",
  roomType: "kitchen",
  iterationId: "iter-abc",
};

describe("judgeLabIteration — kill-switch", () => {
  beforeEach(() => { delete process.env.JUDGE_ENABLED; });

  it("throws JudgeDisabledError when flag unset", async () => {
    await expect(judgeLabIteration(BASE)).rejects.toBeInstanceOf(JudgeDisabledError);
  });

  it("throws JudgeDisabledError when flag is not 'true'", async () => {
    process.env.JUDGE_ENABLED = "1";
    await expect(judgeLabIteration(BASE)).rejects.toBeInstanceOf(JudgeDisabledError);
  });
});

describe("judgeLabIteration — success path", () => {
  beforeEach(() => { process.env.JUDGE_ENABLED = "true"; process.env.GEMINI_API_KEY = "test-key"; });

  it("returns validated JudgeOutput on clean response", async () => {
    const r = await judgeLabIteration(BASE);
    expect(r.motion_faithfulness).toBe(4);
    expect(r.overall).toBe(4);
    expect(r.judge_version).toBe("v1.0");
    expect(r.cost_cents).toBeGreaterThanOrEqual(0);
    expect(r.latency_ms).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 3: Add positive cross-axis tests to judge-rubric.test.ts (addresses I7)**

```typescript
// Append to the existing "validateJudgeOutput — cross-axis hard rules" describe:

it("motion_faithfulness ≤ 2 WITH motion-defect flag passes", () => {
  const r = validateJudgeOutput({
    motion_faithfulness: 2,
    geometry_coherence: 4,
    room_consistency: 4,
    hallucination_flags: ["wrong_motion_direction"],
    confidence: 3,
    reasoning: "rotated opposite to prompt",
    overall: 3,
  });
  expect(r.ok).toBe(true);
});

it("room_consistency ≤ 2 WITH camera_exited_room flag passes", () => {
  const r = validateJudgeOutput({
    motion_faithfulness: 4,
    geometry_coherence: 4,
    room_consistency: 1,
    hallucination_flags: ["camera_exited_room"],
    confidence: 3,
    reasoning: "walked through door to hallway",
    overall: 3,
  });
  expect(r.ok).toBe(true);
});
```

- [ ] **Step 4: Run tests + typecheck**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/providers/gemini-judge.ts lib/providers/gemini-judge.test.ts lib/prompts/judge-rubric.test.ts
git commit -m "$(cat <<'EOF'
feat(p2): fill Gemini judge binding + kill-switch test + hard-rule positives

Binding: gemini-judge.ts::judgeLabIteration now calls @google/genai
models.generateContent with the clip as fileData videoUrl (Atlas clips
are public for a window; video-understanding path), the source photo
as inlineData, JUDGE_SYSTEM_PROMPT as the system text, and few-shot
calibration examples (if supplied) prepended. Uses
responseMimeType='application/json' + temperature=0.1 to force JSON.
Parses + validates via validateJudgeOutput. Cost-event on success
(costCents=2 estimate until first invoice).

Tests (addresses Opus review I6 + I7):
- lib/providers/gemini-judge.test.ts: kill-switch both directions +
  success-path validation (mocked Gemini)
- judge-rubric.test.ts: positive hard-rule tests for motion≤2 + room≤2
  (symmetric to the existing geometry≤2 positive)

JUDGE_ENABLED kill-switch default remains 'false' — no accidental spend.
EOF
)"
```

### Task P2.4: Create finalize-with-judge endpoint

**Files:**
- Create: `api/admin/prompt-lab/finalize-with-judge.ts`

- [ ] **Step 1: Inspect an existing admin endpoint for the pattern**

```bash
head -40 api/admin/prompt-lab/render.ts
```

Note: `requireAdmin(req, res)` auth pattern, Supabase access via `getSupabase()`.

- [ ] **Step 2: Write the endpoint**

Create `api/admin/prompt-lab/finalize-with-judge.ts`:

```typescript
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabase } from "../../../lib/db.js";
import { requireAdmin } from "../../../lib/admin-auth.js";
import { judgeLabIteration, JudgeDisabledError } from "../../../lib/providers/gemini-judge.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const { iteration_id } = (req.body ?? {}) as { iteration_id?: string };
  if (!iteration_id) return res.status(400).json({ error: "iteration_id required" });

  const supabase = getSupabase();

  // Load iteration + session.
  const { data: iter, error: iterErr } = await supabase
    .from("prompt_lab_iterations")
    .select(
      "id, director_output_json, clip_url, model_used, analysis_json, prompt_lab_sessions!inner(id, image_url, room_type, archetype)",
    )
    .eq("id", iteration_id)
    .single();
  if (iterErr || !iter) return res.status(404).json({ error: "iteration not found" });
  if (!iter.clip_url) return res.status(400).json({ error: "iteration has no clip_url (not yet rendered)" });

  const session = (iter.prompt_lab_sessions as unknown) as {
    id: string;
    image_url: string;
    room_type?: string | null;
    archetype?: string | null;
  };

  const director = iter.director_output_json as { camera_movement?: string; prompt?: string } | null;

  // Try to fetch photo bytes (non-fatal — if fetch fails, the judge call still
  // runs with clip only).
  let photoBytes: Buffer | undefined;
  try {
    const r = await fetch(session.image_url);
    if (r.ok) photoBytes = Buffer.from(await r.arrayBuffer());
  } catch { /* non-fatal */ }

  try {
    const result = await judgeLabIteration({
      clipUrl: iter.clip_url,
      photoBytes,
      directorPrompt: director?.prompt ?? "",
      cameraMovement: director?.camera_movement ?? "unknown",
      roomType: (iter.analysis_json as any)?.room_type ?? session.archetype ?? "unknown",
      iterationId: iter.id,
    });

    await supabase
      .from("prompt_lab_iterations")
      .update({
        judge_rating_json: result,
        judge_rating_overall: result.overall,
        judge_rated_at: new Date().toISOString(),
        judge_model: result.judge_model,
        judge_version: result.judge_version,
        judge_cost_cents: result.cost_cents,
        judge_error: null,
      })
      .eq("id", iter.id);

    return res.status(200).json({ ok: true, result });
  } catch (err) {
    if (err instanceof JudgeDisabledError) {
      return res.status(503).json({ error: "judge_disabled", message: err.message });
    }
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("prompt_lab_iterations")
      .update({
        judge_error: message,
        judge_rated_at: new Date().toISOString(),
      })
      .eq("id", iter.id);
    return res.status(500).json({ error: "judge_failed", message });
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean. If `requireAdmin` import path differs, grep for the actual location and fix.

- [ ] **Step 4: Commit**

```bash
git add api/admin/prompt-lab/finalize-with-judge.ts
git commit -m "$(cat <<'EOF'
feat(p2): /api/admin/prompt-lab/finalize-with-judge endpoint

Admin-auth-gated POST { iteration_id }. Loads iteration + session,
fetches source photo bytes (non-fatal if unreachable), calls
judgeLabIteration, persists judge_rating_json + judge_rating_overall
+ judge_rated_at + judge_model + judge_version + judge_cost_cents
on success OR judge_error on failure.

Returns 503 when JUDGE_ENABLED is off (client can use this as a probe).
Returns 500 with error message on other failures — iteration row
records the failure for audit.
EOF
)"
```

### Task P2.5: Fire-and-forget hook in finalizeLabRender

**Files:**
- Modify: `lib/prompt-lab.ts::finalizeLabRender` (after cost_events emission)

- [ ] **Step 1: Locate finalizeLabRender**

```bash
grep -n "export async function finalizeLabRender\|recordCostEvent.*atlas" lib/prompt-lab.ts
```

- [ ] **Step 2: Add post-finalize hook**

After the `recordCostEvent` call inside `finalizeLabRender`, add:

```typescript
// Fire-and-forget judge hook — doesn't block clip delivery.
if (process.env.JUDGE_ENABLED === "true") {
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  // Internal-only; uses a service admin token. If ADMIN_INTERNAL_TOKEN
  // isn't set, skip — we don't want to fail finalize for judge wiring.
  const token = process.env.ADMIN_INTERNAL_TOKEN;
  if (token) {
    fetch(`${baseUrl}/api/admin/prompt-lab/finalize-with-judge`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ iteration_id: iterationId }),
    }).catch((err) => {
      console.error("[judge] fire-and-forget failed:", err);
    });
  }
}
```

**Note:** the `ADMIN_INTERNAL_TOKEN` env var is the coordinator's escape hatch — it lets the backend call its own admin endpoint without a user session. If you prefer to call `judgeLabIteration` directly in-process (no HTTP hop), that's simpler but couples the finalize flow to the judge's memory footprint. For P2 S1, HTTP hop is fine — it's non-blocking and mirrors how fire-and-forget patterns run in prod today.

**Alternative (simpler):** import `judgeLabIteration` directly and call it async. Let me recommend this: avoid the HTTP hop to keep the pathway debuggable.

Simpler version:

```typescript
// Fire-and-forget judge hook — doesn't block clip delivery.
if (process.env.JUDGE_ENABLED === "true") {
  (async () => {
    try {
      const { judgeLabIteration } = await import("./providers/gemini-judge.js");
      // Fetch photo bytes non-fatally.
      let photoBytes: Buffer | undefined;
      try {
        const r = await fetch(session.image_url);
        if (r.ok) photoBytes = Buffer.from(await r.arrayBuffer());
      } catch { /* non-fatal */ }

      const result = await judgeLabIteration({
        clipUrl: clipUrl,  // already in scope from finalize
        photoBytes,
        directorPrompt: iteration.director_output_json?.prompt ?? "",
        cameraMovement: iteration.director_output_json?.camera_movement ?? "unknown",
        roomType: session.archetype ?? "unknown",
        iterationId,
      });

      await getSupabase()
        .from("prompt_lab_iterations")
        .update({
          judge_rating_json: result,
          judge_rating_overall: result.overall,
          judge_rated_at: new Date().toISOString(),
          judge_model: result.judge_model,
          judge_version: result.judge_version,
          judge_cost_cents: result.cost_cents,
          judge_error: null,
        })
        .eq("id", iterationId);
    } catch (err) {
      console.error("[judge] hook failed (non-fatal):", err);
      // Record error on iteration row so it's visible.
      try {
        await getSupabase()
          .from("prompt_lab_iterations")
          .update({ judge_error: err instanceof Error ? err.message : String(err), judge_rated_at: new Date().toISOString() })
          .eq("id", iterationId);
      } catch { /* nested; give up */ }
    }
  })();
}
```

Use the simpler version. Remove the HTTP-hop version from the imports.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/prompt-lab.ts
git commit -m "$(cat <<'EOF'
feat(p2): fire-and-forget judge hook in finalizeLabRender

After cost_event emission, if JUDGE_ENABLED === 'true', fires an async
IIFE that (1) fetches photo bytes non-fatally, (2) calls judgeLabIteration
directly (no HTTP hop), (3) persists judge_rating_json + siblings on
success, OR persists judge_error on any failure.

Non-blocking: the promise is not awaited, so clip delivery + iteration
update are unaffected by judge latency (~5-8s expected).

When JUDGE_ENABLED unset, the block is inert — no calls, no cost.
EOF
)"
```

### Task P2.6: Seed calibration examples

**Files:**
- Create: `scripts/seed-judge-calibration.ts` (one-off seed)

- [ ] **Step 1: Get the 10 calibration examples from the rubric branch**

```bash
git show session/p2-rubric-design:docs/state/JUDGE-RUBRIC-V1.md | grep -A 200 "Calibration pool" | head -300
```

Extract the 10 examples (5 × 5★, 5 × 1★) and their metadata (iteration IDs, ideal rubric answers).

- [ ] **Step 2: Write the seed script**

Create `scripts/seed-judge-calibration.ts`:

```typescript
#!/usr/bin/env -S npx tsx

/**
 * Seed judge_calibration_examples with the v0 pool from the rubric
 * (docs/state/JUDGE-RUBRIC-V1.md). Idempotent: ON CONFLICT DO NOTHING
 * on iteration_id. Run ONCE; subsequent runs are no-ops.
 */

import * as fs from "fs";
import * as path from "path";
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
import { getSupabase } from "../lib/client.js";

interface SeedRow {
  iteration_id: string;
  human_rating: number;
  judge_rating_json: Record<string, unknown>;
  room_type: string;
  camera_movement: string;
}

// Fill these in from docs/state/JUDGE-RUBRIC-V1.md section 4.
// Each row is one canonical calibration example.
const SEEDS: SeedRow[] = [
  // TODO: populate from rubric. Keep as empty array if rubric-specific IDs
  // aren't available in this DB. That's fine — P2 S2 will seed via UI.
];

async function main() {
  if (SEEDS.length === 0) {
    console.log("No seed rows in script; rubric examples may not exist in this DB. Skipping.");
    return;
  }
  const supabase = getSupabase();
  const rows = SEEDS.map((s) => ({
    iteration_id: s.iteration_id,
    human_rating: s.human_rating,
    judge_rating_json: s.judge_rating_json,
    room_type: s.room_type,
    camera_movement: s.camera_movement,
  }));
  const { error } = await supabase
    .from("judge_calibration_examples")
    .upsert(rows, { onConflict: "iteration_id" });
  if (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
  console.log(`Seeded ${rows.length} calibration examples.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**NOTE:** the actual seed rows need to come from the Window B calibration pool. If the iteration_ids from that pool aren't guaranteed to exist in prod DB, leave `SEEDS = []` and note in the commit message that seeding is deferred to P2 Session 2 (UI-driven). That's acceptable per Oliver's Q4 decision.

- [ ] **Step 3: Run (or skip if SEEDS empty)**

```bash
npx tsx scripts/seed-judge-calibration.ts
```

Expected: "Seeded N calibration examples" OR "Skipping".

- [ ] **Step 4: Commit the script**

```bash
git add scripts/seed-judge-calibration.ts
git commit -m "$(cat <<'EOF'
feat(p2): seed-judge-calibration.ts scaffold

Idempotent upsert into judge_calibration_examples. SEEDS array is
empty by default — P2 S2 UI-driven override flow is the primary
seeding path per Oliver's Q4 decision. This script exists as a
one-off path if the rubric's v0 example IDs are accessible in prod.
EOF
)"
```

### Task P2.7: Enable judge on one test render

- [ ] **Step 1: Set env var in Vercel project**

Via Vercel dashboard (MCP doesn't have env-var-set tooling exposed):
1. Go to https://vercel.com/recasi/listingelevate/settings/environment-variables
2. Add `JUDGE_ENABLED=true` for Production environment
3. Redeploy (or wait for next deploy)

**Alternative** if you want to test without affecting prod traffic: enable only on Preview and deploy a preview branch.

- [ ] **Step 2: Trigger one Lab render in prod**

Open `https://www.listingelevate.com/dashboard/development/prompt-lab`, create a new session, run one render. Cost: ~$0.60 (v2-6-pro) + ~$0.02 (judge) = $0.62.

- [ ] **Step 3: Verify judge ran**

Via Supabase MCP execute_sql:

```sql
SELECT id, rating, judge_rating_overall, judge_model, judge_version, judge_rated_at, judge_error, judge_cost_cents, judge_rating_json
FROM prompt_lab_iterations
WHERE session_id IN (
  SELECT id FROM prompt_lab_sessions ORDER BY created_at DESC LIMIT 1
)
ORDER BY created_at DESC LIMIT 3;
```

Expected: `judge_rating_overall IS NOT NULL`, `judge_error IS NULL`, `judge_rating_json` populated with the 5-axis rubric.

- [ ] **Step 4: Verify cost_event landed**

```sql
SELECT stage, provider, metadata->>'subtype', cost_cents, created_at
FROM cost_events
WHERE metadata->>'subtype' = 'judge'
ORDER BY created_at DESC LIMIT 3;
```

Expected: row with `stage='analysis'`, `provider='google'`, `cost_cents=2`.

### Task P2.8: Push + verify deploy

Same pattern as P5.5 / P3.6.

---

## Final wrap — after P2 + P3 + P5 all merged to prod

- [ ] **Wrap.1: Update HANDOFF.md "Right now" section**

Rewrite to reflect P2/P3/P5 shipped. List the three migration pairs (031+032 from P1, 033, 034, 038). Add shipping-log entries for all new commits.

- [ ] **Wrap.2: Archive branches**

```bash
git branch -d session/p2-s1-implementation-draft session/p3-s1-implementation-draft session/p5-s1-implementation-draft
# Design branches stay for reference:
# session/p2-rubric-design, session/p3-embedding-preflight, session/p5-thompson-design
```

- [ ] **Wrap.3: Update memory files**

In `~/.claude/projects/-Users-oliverhelgemo/memory/`:
- `project_p2_judge_rubric.md` — status bump to "shipped to prod 2026-04-22"
- `project_p3_embedding_preflight.md` — same
- `project_p5_thompson_design.md` — same
- `project_v1_ml_roadmap.md` — reflect P2/P3/P5 shipped; next phase P4 on 2026-04-28
- `MEMORY.md` — one-line bumps

- [ ] **Wrap.4: Commit docs + push**

```bash
git add docs/HANDOFF.md docs/state/PROJECT-STATE.md
git commit -m "docs(state): P2 + P3 + P5 shipped to prod (2026-04-22 consolidation)"
git push origin main
```

- [ ] **Wrap.5: Final Vercel deploy monitor**

Confirm the docs-only deploy also hits READY. Report final state.

---

## Success criteria — final verification

- [ ] SC1: `SELECT count(*) FROM prompt_lab_iterations WHERE model_used IS NOT NULL` > 0 (P1)
- [ ] SC2: `SELECT count(*) FROM cost_events WHERE provider='atlas'` > 0 (P1)
- [ ] SC3: `SELECT count(*) FROM photos WHERE image_embedding IS NOT NULL` > 100 (P3 backfill)
- [ ] SC4: `SELECT count(*) FROM router_bucket_stats` > 0 (P5 seed OR first Lab render)
- [ ] SC5: `SELECT count(*) FROM router_shadow_log` > 0 (first Lab render with shadow-log)
- [ ] SC6: `SELECT count(*) FROM prompt_lab_iterations WHERE judge_rating_overall IS NOT NULL` >= 1 (P2 verification)
- [ ] SC7: `git log origin/main --oneline -20` shows all P2/P3/P5 merges + fix commits
- [ ] SC8: `https://www.listingelevate.com` loads, Lab works, no 500s on render

All 8 green → done with the week's ML loop.

---

## Risks + mitigations

| Risk | If it hits | Do |
|---|---|---|
| `@google/genai` `embedContent` shape differs from spec | P3.4 Step 3 verification fails with shape error | Inspect `resp` at runtime; adjust `resp.embeddings?.[0]?.values` path |
| Gemini video-understanding doesn't accept Atlas clip URLs | P2.7 Step 3 shows `judge_error` with fetch failure | Fall back to frame-extract via ffmpeg; or delay to P2 S2 |
| Atlas clip URL expires before judge fires | judge_error says "URL 404" | Add URL-refresh logic OR download bytes before judge call |
| Gemini billing 403 on embeddings endpoint | P3.4 Step 2 fails with 403 | Disable flag; escalate to Oliver (Q2 was "defer to first call") |
| `ADMIN_INTERNAL_TOKEN` not set | P2.5 simpler version has no HTTP call; not applicable (we chose direct-call) | N/A (we picked direct-call path) |
| `requireAdmin` import path is different | P2.4 Step 3 tsc fails | Grep for `requireAdmin` def, fix import |
| Backfill hits Gemini rate limit | P3.5 Step 2 slow/429s | Add sleep between calls; batch to 10/sec max |
| Shadow-log insert rate causes DB pressure | prod DB monitor shows load spikes | Drop index temporarily; batch inserts; make insert async via pg_notify |

---

## Out of scope — do NOT implement

- Actual P5 A/B audit (2026-05-01, P5 S2 deliverable)
- P2 Session 2 UI chip in IterationCard (2026-04-24)
- P3 hybrid retrieval RPC + RetrievalPanel UI (P3 S2, 2026-04-26)
- P3 reranker (P3 S3, 2026-04-27)
- P4 per-photo enrichment backfill beyond what P3 ships today (2026-04-28)
- P6 pairwise UX
- P7 promote-to-prod runbook activation
