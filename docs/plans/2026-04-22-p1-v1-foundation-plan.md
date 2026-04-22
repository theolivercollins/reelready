# P1 — V1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make V1 Prompt Lab Oliver's daily-driver iteration tool by swapping Lab renders to Atlas (default `kling-v2-6-pro`), capturing SKU on every iteration, adding a SKU selector + cost chip to the UI, hiding V2 surface entries, and committing one live V1 trace.

**Architecture:** Three-layer change. (1) DB: migration `031` adds `model_used` + `sku_source` columns to `prompt_lab_iterations`. (2) Backend: `router.ts` returns SKU-aware `ProviderDecision` for non-paired scenes; `submitLabRender` accepts `sku` param, threads it to `AtlasProvider`, returns it to API handlers which persist `model_used`; `finalizeLabRender` logs a `cost_event` with SKU metadata. (3) UI: `IterationCard` gets a shadcn SKU `<select>` plus inline cost chip; session header shows aggregated $/5s chip; `TopNav` renames "Prompt Lab (legacy)" → "Prompt Lab" and hides the Listings Lab nav entry (URL still works).

**Tech Stack:** TypeScript, Vite + React 18 + Tailwind + shadcn/ui, Vercel serverless (Node 20 ESM), Supabase (Postgres), AtlasCloud video provider, OpenAI embeddings, Anthropic SDK, vitest for unit tests, zod available but not currently used in API handlers.

**Reference docs to keep open while executing:**
- `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md` — parent spec (section P1)
- `docs/sessions/2026-04-22-window-A-coordinator.md` — coordinator handoff
- `docs/state/PROJECT-STATE.md` — authoritative state
- `docs/HANDOFF.md` — "Right now" surface, updated before push

**Scope note:** This plan is P1 only. Phases P2–P7 each get their own implementation plan at execution time per parent spec convention.

**Cost budget:** ~$1 Atlas (one V1 validation render + one v2-master comparison pull if needed). $0 OpenAI/Gemini beyond baseline.

**North Star mapping:** Serves #2 (SKU-granular retrieval precision) + #4 (can't converge on right-SKU-per-bucket without SKU labels on training data).

**File Structure (new or modified):**

- Create: `supabase/migrations/031_prompt_lab_iterations_sku.sql`
- Create: `docs/state/MODEL-VERSIONS.md`
- Create: `docs/specs/2026-04-22-v1-lab-ux-plan.md`
- Create: `docs/audits/kling-v2master-vs-v26pro-2026-04-22.md` (produced by subagent)
- Create: `docs/traces/v1-trace-<session_id>-2026-04-22.md` (live trace artifact)
- Create: `docs/sessions/2026-04-21-park-ledger.md` (branch park note)
- Create: `docs/sessions/2026-04-21-park-router.md` (branch park note)
- Modify: `lib/providers/router.ts` (SKU decision for non-paired scenes)
- Modify: `lib/prompt-lab.ts` (submitLabRender signature + return; finalizeLabRender cost_event)
- Modify: `api/admin/prompt-lab/render.ts` (accept `sku` body param; persist `model_used`)
- Modify: `api/admin/prompt-lab/rerender.ts` (accept `sku` body param; persist `model_used`)
- Modify: `scripts/trace-director-prompt.ts` (+ `scripts/trace-director-prompt.impl.ts` if exists) (V1 session mode)
- Modify: `src/components/TopNav.tsx` (rename + hide V2)
- Modify: `src/pages/dashboard/PromptLab.tsx` (SKU selector + cost chip + try-other-SKU)
- Modify: `docs/HANDOFF.md` + `docs/state/PROJECT-STATE.md` (session closeout)
- Modify: `/Users/oliverhelgemo/.claude/projects/-Users-oliverhelgemo/memory/project_v1_ml_roadmap.md` + `MEMORY.md` (status update)

---

## Phase 0 — Open block (yesterday's closeout)

**Duration target:** 30 minutes. Blocks Phase 1.

### Task 1: Environment preflight

**Files:** (no file changes — verification only)

- [ ] **Step 1.1: Verify Atlas wallet has balance**

Run:
```bash
node -e 'fetch("https://api.atlascloud.ai/v1/account/balance", {headers:{Authorization:"Bearer "+process.env.ATLASCLOUD_API_KEY}}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2)))'
```
(Alternative: the repo may have `scripts/atlas-balance.ts` — if so, run `npx tsx scripts/atlas-balance.ts` instead.)

Expected: JSON body with a positive credit / balance field. If zero, **stop and tell Oliver** — he said he topped up; this verifies defensively.

- [ ] **Step 1.2: Verify migration tooling**

Run:
```bash
ls supabase/migrations/ | tail -5
npx supabase --version 2>&1 | head -1
```
Expected: `030_photo_camera_state.sql` is the latest file; `supabase` CLI is installed (any recent version).

- [ ] **Step 1.3: Verify test runner**

Run:
```bash
npx vitest --version
```
Expected: `4.1.x`.

- [ ] **Step 1.4: Confirm main is clean-ish and at expected commit**

Run:
```bash
git status
git log --oneline -1
```
Expected: On `main`. Unstaged: `docs/audits/test-render-log-2026-04-21.md`. Untracked: `docs/sessions/2026-04-21-window-B-round-2.md`, `docs/sessions/2026-04-21-window-B.md`, `docs/sessions/2026-04-22-window-A-coordinator.md`, `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md`. Latest commit: `c8c830e docs(brief): Window E — OG Prompt Lab data-capture enrichment`.

If anything differs significantly: **stop and report** before modifying state.

### Task 2: Commit yesterday's dangling state

**Files:**
- Modify: `docs/audits/test-render-log-2026-04-21.md` (already dirty)
- Untracked: `docs/sessions/2026-04-21-window-B-round-2.md`, `docs/sessions/2026-04-21-window-B.md`

- [ ] **Step 2.1: Stage yesterday's closeout artifacts**

```bash
git add docs/audits/test-render-log-2026-04-21.md \
        docs/sessions/2026-04-21-window-B-round-2.md \
        docs/sessions/2026-04-21-window-B.md
```

- [ ] **Step 2.2: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs(closeout): Window B session notes + render log from 2026-04-21

Dangling artifacts from yesterday's 4-window engagement pattern — Window B
(DA.1 regression-diff) session summaries plus shared render log. Closing out
before starting 2026-04-22 P1 V1 Foundation work.
EOF
)"
```

Expected: `[main <sha>] docs(closeout)...` with 3 files changed.

### Task 3: Selective merge v3-strip from `session/router-2026-04-21`

**Goal:** Bring commit `0b6f874` (strip kling-v3-pro from every single-image bucket) onto main via cherry-pick. Leave the rest of the branch parked.

**Files:** Whatever `0b6f874` touched (likely `lib/providers/router.ts`, router config, possibly docs). Cherry-pick will surface the list.

- [ ] **Step 3.1: Inspect the commit before cherry-picking**

```bash
git show --stat 0b6f874
```
Expected: a changeset limited to router / config + session-doc updates. Review for collateral.

- [ ] **Step 3.2: Cherry-pick with no-commit so you can inspect**

```bash
git cherry-pick -n 0b6f874
git status
git diff --stat --staged
```
Expected: `lib/providers/router.ts` and related files staged. No unrelated changes. If conflict: resolve preferring main's other recent edits; the semantic intent is "remove kling-v3-pro from bucket defaults".

- [ ] **Step 3.3: Commit with a clarifying message**

```bash
git commit -m "$(cat <<'EOF'
router: strip kling-v3-pro from single-image bucket defaults (cherry-pick 0b6f874)

Cherry-picked from session/router-2026-04-21 (Window D Round 2). The rest of
that branch (router-grid scaffolding + rating-prep docs) stays parked — no
router-table coming in the back-on-track path; P5 replaces with Thompson
sampling.
EOF
)"
```

- [ ] **Step 3.4: Smoke-test router still compiles**

```bash
npx tsc --noEmit
```
Expected: no errors in `lib/providers/router.ts`.

### Task 4: Park orphan branches with park notes

**Files:**
- Create: `docs/sessions/2026-04-21-park-ledger.md`
- Create: `docs/sessions/2026-04-21-park-router.md`

- [ ] **Step 4.1: Write the ledger park note**

Create `docs/sessions/2026-04-21-park-ledger.md`:
```markdown
# Park note — `session/ledger-2026-04-21`

Parked: 2026-04-22
Decision: keep the branch alive; do not merge into main.
Reason: the bucket-progress ledger feeds a V2 surface (paired-image router
visibility). V2 work is paused per `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md`.

When to revive: when we return to paired-image / V2 work, or when we need a
live bucket scoreboard outside of V1's retrieval-match UI (which lands in P3).

Last commit on branch: `a64cd75 feat(ledger): Window C R2.3 docs + memory for bucket scoreboard`.

Contacts: Oliver.
```

- [ ] **Step 4.2: Write the router park note**

Create `docs/sessions/2026-04-21-park-router.md`:
```markdown
# Park note — `session/router-2026-04-21`

Parked: 2026-04-22
Decision: keep branch alive; do NOT merge remainder. The v3-strip commit
(`0b6f874`) was cherry-picked to main on 2026-04-22.

Reason: the router-grid scaffolding on this branch is the manual rating-grid
approach rejected by the 2026-04-22 spec. P5 (Thompson-sampling SKU router)
supersedes it. The rating-prep docs + seed scripts stay parked as reference
only.

When to revive: only if Thompson sampling (P5) fails and we need to fall back
to a hand-curated grid. Unlikely.

Head of branch: `0b6f874 Window D Round 2: strip kling-v3-pro from every single-image bucket` (now on main).

Contacts: Oliver.
```

- [ ] **Step 4.3: Commit park notes**

```bash
git add docs/sessions/2026-04-21-park-ledger.md docs/sessions/2026-04-21-park-router.md
git commit -m "$(cat <<'EOF'
docs(sessions): park notes for ledger + router branches

Per P1 spec: keep both branches alive on disk; do not merge. Ledger feeds V2
surface (paused). Router grid is superseded by P5 Thompson sampling. v3-strip
commit already cherry-picked to main.
EOF
)"
```

### Task 5: Commit the P1 parent spec + today's session handoff

**Files (already untracked on disk):**
- `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md`
- `docs/sessions/2026-04-22-window-A-coordinator.md`

- [ ] **Step 5.1: Stage both**

```bash
git add docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md \
        docs/sessions/2026-04-22-window-A-coordinator.md \
        docs/plans/2026-04-22-p1-v1-foundation-plan.md
```

- [ ] **Step 5.2: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs(plan): V1 primary tool + ML roadmap spec + P1 implementation plan

Multi-day program spec (P1–P7) landing V1 as Oliver's daily-driver Lab with a
calibrated ML feedback loop — auto-judge (P2), hybrid retrieval + reranker
(P3), scale hardening (P4), Thompson SKU router (P5), active learning (P6),
promote-to-prod flywheel (P7). P1 implementation plan included for today's
execution. Supersedes the active V1/ML sections of back-on-track-plan.md.
EOF
)"
```

---

## Phase 1 — Backend: Atlas routing + SKU capture

**Duration target:** 2–3 hours. Must complete before UI work.

### Task 6: Migration 031 — `model_used` + `sku_source` columns

**Files:**
- Create: `supabase/migrations/031_prompt_lab_iterations_sku.sql`
- Test: `supabase/migrations/031_prompt_lab_iterations_sku.test.sql` (smoke, psql-executable)

- [ ] **Step 6.1: Write the migration file**

Create `supabase/migrations/031_prompt_lab_iterations_sku.sql`:
```sql
-- P1 — capture the Atlas SKU (e.g. "kling-v2-6-pro") on every Lab iteration.
-- Per the V1 foundation spec: ML loop needs SKU-granular signal from day one
-- so retrieval + router (P5) can converge on right-SKU-per-bucket without a
-- hand-curated rating grid.

ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS model_used text;

ALTER TABLE prompt_lab_iterations
  ADD COLUMN IF NOT EXISTS sku_source text
    NOT NULL DEFAULT 'unknown'
    CHECK (sku_source IN ('captured_at_render', 'recovered', 'unknown'));

COMMENT ON COLUMN prompt_lab_iterations.model_used IS
  'The AtlasCloud model slug (e.g. "kling-v2-6-pro") that actually served this
   render. Populated by the render + rerender endpoints at submit time.
   Legacy rows written before P1 (2026-04-22) are null + sku_source=unknown;
   P4 backfill recovers a subset.';

COMMENT ON COLUMN prompt_lab_iterations.sku_source IS
  'Provenance of model_used: captured_at_render (written at submission),
   recovered (inferred later via P4 backfill heuristics), unknown (pre-P1).';

CREATE INDEX IF NOT EXISTS idx_prompt_lab_iterations_model_used
  ON prompt_lab_iterations (model_used)
  WHERE model_used IS NOT NULL;
```

- [ ] **Step 6.2: Apply locally (or against the linked Supabase project if local is down)**

If local Supabase available:
```bash
npx supabase db reset --local   # OR:
npx supabase migration up --local
```

If only remote is available:
```bash
npx supabase db push
```
(Confirm with Oliver before pushing to remote if the Supabase project is shared.)

- [ ] **Step 6.3: Verify schema**

```bash
psql "$SUPABASE_DB_URL" -c "\d prompt_lab_iterations" | grep -E "model_used|sku_source"
```
Expected:
```
 model_used                | text                     |           |          |
 sku_source                | text                     |           | not null | 'unknown'::text
```

- [ ] **Step 6.4: Commit**

```bash
git add supabase/migrations/031_prompt_lab_iterations_sku.sql
git commit -m "$(cat <<'EOF'
migration(031): capture SKU + provenance on prompt_lab_iterations

Adds model_used (nullable text, Atlas slug) + sku_source (enum: captured_at_render
| recovered | unknown, default unknown). Partial index on model_used.

Serves P1 deliverable #3. Enables SKU-granular retrieval + P5 Thompson router.
Legacy rows pre-P1 stay null/unknown; P4 backfill recovers a subset.
EOF
)"
```

### Task 7: Router — SKU decision for non-paired scenes

**Files:**
- Modify: `lib/providers/router.ts` (around `resolveDecision`, lines ~98–136)
- Modify: `lib/providers/router.ts` (exports — add SKU constants)
- Test: `lib/providers/router.test.ts` (new file, vitest)

- [ ] **Step 7.1: Add the SKU constants export**

At the top of `lib/providers/router.ts`, after existing imports, add:
```typescript
/**
 * Atlas SKUs valid as first-try defaults for V1 (single-image) Lab renders.
 * Keep this list in sync with `ATLAS_MODELS` in `lib/providers/atlas.ts`.
 * Paired-image SKUs (kling-v2-1-pair) are NOT in this list — they are routed
 * separately in `selectProviderForScene()`.
 */
export const V1_ATLAS_SKUS = [
  "kling-v2-6-pro",
  "kling-v2-master",
  "kling-v3-std",
  "kling-o3-pro",
] as const;
export type V1AtlasSku = (typeof V1_ATLAS_SKUS)[number];

export const V1_DEFAULT_SKU: V1AtlasSku = "kling-v2-6-pro";
```

Note: `kling-v3-pro` is intentionally excluded (stripped on main via cherry-pick in Task 3). `kling-v2-1-pair` is paired-only.

- [ ] **Step 7.2: Write the failing test**

Create `lib/providers/router.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  V1_ATLAS_SKUS,
  V1_DEFAULT_SKU,
  resolveDecision,
} from "./router.js";

describe("router — V1 Atlas SKU decision", () => {
  it("exposes V1_DEFAULT_SKU = kling-v2-6-pro", () => {
    expect(V1_DEFAULT_SKU).toBe("kling-v2-6-pro");
  });

  it("V1_ATLAS_SKUS does not include kling-v3-pro (stripped on 2026-04-22)", () => {
    expect(V1_ATLAS_SKUS as readonly string[]).not.toContain("kling-v3-pro");
  });

  it("V1_ATLAS_SKUS does not include kling-v2-1-pair (paired-only)", () => {
    expect(V1_ATLAS_SKUS as readonly string[]).not.toContain("kling-v2-1-pair");
  });

  it("resolveDecision returns atlas + V1_DEFAULT_SKU when sku not specified", () => {
    const decision = resolveDecision({
      roomType: "living_room",
      movement: "pan_right",
      skuOverride: null,
    });
    expect(decision.provider).toBe("atlas");
    expect(decision.modelKey).toBe(V1_DEFAULT_SKU);
  });

  it("resolveDecision honors skuOverride when provided + valid", () => {
    const decision = resolveDecision({
      roomType: "kitchen",
      movement: "push_in",
      skuOverride: "kling-v2-master",
    });
    expect(decision.provider).toBe("atlas");
    expect(decision.modelKey).toBe("kling-v2-master");
  });
});
```

- [ ] **Step 7.3: Run — expect failure**

```bash
npx vitest run lib/providers/router.test.ts
```
Expected: test file runs; fails because `resolveDecision` signature does not yet accept `skuOverride` / does not set `modelKey`. (May instead fail with a shape mismatch — that's fine; we're about to fix it.)

- [ ] **Step 7.4: Update `resolveDecision`**

Open `lib/providers/router.ts`. Locate `resolveDecision` (around lines 98–136). Change its input type to accept an optional `skuOverride` and always return `{ provider: "atlas", modelKey: <resolved-sku> }` for non-paired scenes. Representative shape:

```typescript
export interface ResolveDecisionInput {
  roomType: string;
  movement: string;
  skuOverride?: V1AtlasSku | null;
}

export function resolveDecision(input: ResolveDecisionInput): ProviderDecision {
  const sku: V1AtlasSku =
    input.skuOverride && (V1_ATLAS_SKUS as readonly string[]).includes(input.skuOverride)
      ? input.skuOverride
      : V1_DEFAULT_SKU;

  // Preserve any prior interior/exterior dispatch if present; it now only
  // adjusts the fallback, not the primary SKU. Primary is always V1_DEFAULT_SKU
  // unless the caller specified otherwise.
  return {
    provider: "atlas",
    modelKey: sku,
    fallback: undefined,
  };
}
```

If the existing `resolveDecision` has interior/exterior branches or other callers (e.g. `selectDecision`), preserve that logic but thread the `skuOverride` through. The only hard requirement is: **for non-paired scenes, `modelKey` is always populated with a value from `V1_ATLAS_SKUS`**.

Also confirm `selectProviderForScene()` still wraps around this and still routes paired scenes (`scene.endPhotoId`) to `{ provider: "atlas", modelKey: "kling-v2-1-pair" }` unchanged.

- [ ] **Step 7.5: Run tests — expect pass**

```bash
npx vitest run lib/providers/router.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 7.6: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors. If any callsite breaks because of the changed input signature, fix callsites to pass `skuOverride: null` as default.

- [ ] **Step 7.7: Commit**

```bash
git add lib/providers/router.ts lib/providers/router.test.ts
git commit -m "$(cat <<'EOF'
router(v1): SKU-aware decision + V1_DEFAULT_SKU = kling-v2-6-pro

Non-paired scenes now resolve to { provider: "atlas", modelKey: <sku> } with
SKU = override if supplied and valid, else V1_DEFAULT_SKU. Paired scenes
(kling-v2-1-pair) unchanged. V1_ATLAS_SKUS excludes kling-v3-pro (stripped on
2026-04-22) and kling-v2-1-pair (paired-only).

Serves P1 deliverable #1.
EOF
)"
```

### Task 8: `submitLabRender` — accept and thread SKU

**Files:**
- Modify: `lib/prompt-lab.ts` (lines ~514–554, `submitLabRender`)
- Test: `lib/prompt-lab.test.ts` (new file, focused on SKU threading)

- [ ] **Step 8.1: Write the failing test**

Create `lib/prompt-lab.test.ts` (if not present) or append to existing:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// NOTE: This test mocks the Atlas provider to assert SKU threading without
// hitting the network. The real end-to-end verification happens in Task 12.

vi.mock("./providers/atlas.js", () => ({
  AtlasProvider: vi.fn().mockImplementation((sku?: string) => ({
    name: "atlas",
    configuredSku: sku,
    generateClip: vi.fn().mockResolvedValue({ jobId: "mock-job-123" }),
  })),
}));

vi.mock("./providers/router.js", async () => {
  const actual = await vi.importActual<typeof import("./providers/router.js")>("./providers/router.js");
  return {
    ...actual,
    selectProvider: vi.fn(),
    selectProviderForScene: vi.fn(),
  };
});

import { submitLabRender } from "./prompt-lab.js";

describe("submitLabRender — SKU threading", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the resolved SKU alongside provider + jobId", async () => {
    const result = await submitLabRender({
      imageUrl: "https://example.com/photo.jpg",
      scene: { camera_movement: "pan_right" } as any,
      roomType: "living_room" as any,
      sku: "kling-v2-master",
    });
    expect(result).toMatchObject({
      provider: "atlas",
      sku: "kling-v2-master",
      jobId: expect.any(String),
    });
  });

  it("defaults SKU to kling-v2-6-pro when sku param omitted", async () => {
    const result = await submitLabRender({
      imageUrl: "https://example.com/photo.jpg",
      scene: { camera_movement: "pan_right" } as any,
      roomType: "living_room" as any,
    });
    expect(result.sku).toBe("kling-v2-6-pro");
  });
});
```

- [ ] **Step 8.2: Run — expect failure**

```bash
npx vitest run lib/prompt-lab.test.ts
```
Expected: failure. `submitLabRender` does not yet accept `sku` + does not return `sku`.

- [ ] **Step 8.3: Update `submitLabRender`**

In `lib/prompt-lab.ts` around lines 514–554:

Change the signature:
```typescript
export async function submitLabRender(params: {
  imageUrl: string;
  scene: DirectorSceneOutput;
  roomType: RoomType;
  providerOverride?: "kling" | "runway" | "atlas" | null;  // "atlas" added for explicit routing
  sku?: V1AtlasSku | null;
  endImageUrl?: string | null;
}): Promise<{ jobId: string; provider: string; sku: V1AtlasSku }>
```

(Import `V1AtlasSku` and `V1_DEFAULT_SKU` from `./providers/router.js` at the top of the file.)

Inside the function body, replace the provider-selection block with Atlas-primary routing. The old `selectProvider(...)` call stays only as a fallback for paired scenes (`params.endImageUrl`) — otherwise route to Atlas via `resolveDecision`. Resolve the effective SKU once and return it:

```typescript
const isPaired = Boolean(params.endImageUrl);
let provider: IVideoProvider;
let resolvedSku: V1AtlasSku | "kling-v2-1-pair";

if (isPaired) {
  // Paired-image scenes keep the existing routing (V2 territory).
  provider = new AtlasProvider();
  resolvedSku = "kling-v2-1-pair";
} else {
  const decision = resolveDecision({
    roomType: params.roomType,
    movement: params.scene.camera_movement,
    skuOverride: params.sku ?? null,
  });
  // decision.modelKey is guaranteed for non-paired flows.
  resolvedSku = decision.modelKey as V1AtlasSku;
  process.env.ATLAS_VIDEO_MODEL = resolvedSku;  // AtlasProvider reads this on ctor
  provider = new AtlasProvider();
}

// Existing kling-capacity guard becomes a no-op for V1 default path (provider
// is atlas, not kling). Keep the guard for explicit providerOverride === "kling".
if (params.providerOverride === "kling") {
  const inFlight = await countKlingInFlight();
  if (inFlight >= KLING_CONCURRENCY_LIMIT) {
    throw new ProviderCapacityError("kling", inFlight, KLING_CONCURRENCY_LIMIT);
  }
  provider = new KlingProvider();
  resolvedSku = resolvedSku;  // keep whatever was decided for display; kling native ignores it
}
```

At the return, include `sku`:
```typescript
return { jobId, provider: provider.name, sku: resolvedSku as V1AtlasSku };
```

**Note on the env-var handoff:** `AtlasProvider` currently reads `ATLAS_VIDEO_MODEL` from `process.env` in its constructor. The minimal change above sets the env var just-in-time before construction. A cleaner refactor is to let `AtlasProvider` accept the model as a constructor arg. Prefer the constructor-arg refactor if time permits — it avoids global state mutation:

```typescript
// lib/providers/atlas.ts (refactor sketch, only if time permits)
constructor(modelOverride?: string) {
  const key = process.env.ATLASCLOUD_API_KEY;
  if (!key) throw new Error("ATLASCLOUD_API_KEY is required for AtlasProvider");
  this.apiKey = key;
  const modelName = modelOverride ?? process.env.ATLAS_VIDEO_MODEL ?? "kling-v2-6-pro";
  const descriptor = ATLAS_MODELS[modelName];
  if (!descriptor) throw new Error(`ATLAS_VIDEO_MODEL=${modelName} not registered. Valid: ${Object.keys(ATLAS_MODELS).join(", ")}`);
  this.model = descriptor;
}
```

Then `new AtlasProvider(resolvedSku)` instead of the env-var dance.

- [ ] **Step 8.4: Run tests — expect pass**

```bash
npx vitest run lib/prompt-lab.test.ts lib/providers/router.test.ts
```
Expected: all pass.

- [ ] **Step 8.5: Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors. If any callsite breaks (likely `api/admin/prompt-lab/render.ts` + `rerender.ts` and `lib/pipeline.ts` if it calls `submitLabRender` — check with grep), note the breakage to fix in Task 9.

```bash
grep -rn "submitLabRender" --include="*.ts" --include="*.tsx"
```

- [ ] **Step 8.6: Commit**

```bash
git add lib/prompt-lab.ts lib/prompt-lab.test.ts lib/providers/atlas.ts
git commit -m "$(cat <<'EOF'
prompt-lab: submitLabRender accepts + returns SKU (V1 Atlas path)

submitLabRender now accepts { sku?: V1AtlasSku | null } and returns the
resolved SKU alongside jobId + provider name. Non-paired scenes route to
Atlas via resolveDecision; paired scenes keep "kling-v2-1-pair". Kling
native path preserved behind providerOverride === "kling" for manual escape
hatch. AtlasProvider accepts modelOverride ctor arg (avoids global env mutation).

Serves P1 deliverable #1.
EOF
)"
```

### Task 9: Render + rerender endpoints — accept `sku`, persist `model_used`

**Files:**
- Modify: `api/admin/prompt-lab/render.ts`
- Modify: `api/admin/prompt-lab/rerender.ts`
- Test: `api/admin/prompt-lab/render.test.ts` (new file, contract-level)

- [ ] **Step 9.1: Write the failing contract test**

Create `api/admin/prompt-lab/render.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";

// Mock submitLabRender so the handler runs end-to-end without hitting the network.
vi.mock("../../../lib/prompt-lab.js", () => ({
  submitLabRender: vi.fn().mockResolvedValue({
    jobId: "mock-job-123",
    provider: "atlas",
    sku: "kling-v2-master",
  }),
  __esModule: true,
}));

// Mock Supabase client to capture the .update() payload.
const updateCapture = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
vi.mock("../../../lib/db.js", () => ({
  getSupabase: () => ({
    from: () => ({
      update: updateCapture,
      select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: mockIteration, error: null }) }) }),
    }),
  }),
}));

const mockIteration = {
  id: "iter-1",
  session_id: "sess-1",
  director_output_json: { camera_movement: "pan_right" },
  prompt_lab_sessions: { image_url: "https://x/p.jpg", room_type: "living_room" },
};

describe("render.ts handler — SKU body param", () => {
  it("forwards sku to submitLabRender + writes model_used on iteration row", async () => {
    const { default: handler } = await import("./render.js");
    const req: any = {
      method: "POST",
      headers: { authorization: "Bearer admin-token" },
      body: { iteration_id: "iter-1", sku: "kling-v2-master" },
    };
    const res: any = { status: vi.fn(() => res), json: vi.fn(), setHeader: vi.fn() };
    await handler(req, res);
    const updateArg = updateCapture.mock.calls[0][0];
    expect(updateArg).toMatchObject({
      model_used: "kling-v2-master",
      sku_source: "captured_at_render",
      provider: "atlas",
    });
  });
});
```

(Adjust the `requireAdmin` mock or admin-token handling to match the actual auth middleware — inspect `lib/admin-auth.ts` or wherever `requireAdmin` lives and mock accordingly.)

- [ ] **Step 9.2: Run — expect failure**

```bash
npx vitest run api/admin/prompt-lab/render.test.ts
```

- [ ] **Step 9.3: Update `api/admin/prompt-lab/render.ts`**

Replace the body-param read + submit + update blocks:
```typescript
// Top of handler, after requireAdmin:
const { iteration_id, provider: providerOverride, sku } = (req.body ?? {}) as {
  iteration_id?: string;
  provider?: "kling" | "runway" | "atlas" | null;
  sku?: V1AtlasSku | null;
};
if (!iteration_id) return res.status(400).json({ error: "iteration_id required" });

// Optional: validate SKU against V1_ATLAS_SKUS if present.
if (sku !== undefined && sku !== null && !(V1_ATLAS_SKUS as readonly string[]).includes(sku)) {
  return res.status(400).json({ error: `invalid sku: ${sku}` });
}

// ...(existing fetch iteration + session code)

const { jobId, provider, sku: resolvedSku } = await submitLabRender({
  imageUrl,
  scene,
  roomType,
  sku: sku ?? null,
  endImageUrl,
  providerOverride: providerOverride ?? null,
});

await supabase
  .from("prompt_lab_iterations")
  .update({
    provider,
    provider_task_id: jobId,
    model_used: resolvedSku,
    sku_source: "captured_at_render",
    render_submitted_at: new Date().toISOString(),
    render_error: null,
  })
  .eq("id", iteration_id);

return res.status(200).json({ jobId, provider, sku: resolvedSku });
```

Add imports at top:
```typescript
import { V1_ATLAS_SKUS, type V1AtlasSku } from "../../../lib/providers/router.js";
```

- [ ] **Step 9.4: Apply the same changes to `api/admin/prompt-lab/rerender.ts`**

Mirror the three-field update (`model_used`, `sku_source: 'captured_at_render'`, `provider`) on the newly created iteration row. Accept `sku` in the body params; default to `null` (router picks default). rerender's signature also reads a source iteration — if that source has `model_used` set, you MAY default the new render's `sku` to the same value to make "try the same SKU again" frictionless. Oliver's explicit `sku` body param still wins.

```typescript
const { source_iteration_id, provider: providerOverride, sku: skuOverride } = (req.body ?? {}) as {
  source_iteration_id?: string;
  provider?: "kling" | "runway" | "atlas";
  sku?: V1AtlasSku | null;
};
// ...fetch source iteration (already exists)
const effectiveSku: V1AtlasSku | null = skuOverride ?? (source.model_used as V1AtlasSku | null) ?? null;
// Pass effectiveSku to submitLabRender and persist on the new iteration row.
```

- [ ] **Step 9.5: Run tests — expect pass**

```bash
npx vitest run api/admin/prompt-lab/render.test.ts
npx tsc --noEmit
```

- [ ] **Step 9.6: Commit**

```bash
git add api/admin/prompt-lab/render.ts api/admin/prompt-lab/rerender.ts api/admin/prompt-lab/render.test.ts
git commit -m "$(cat <<'EOF'
api(prompt-lab): accept sku body param + persist model_used on render

render.ts + rerender.ts now accept optional sku (V1AtlasSku). Validates
against V1_ATLAS_SKUS, threads to submitLabRender, and writes
{ model_used, sku_source: 'captured_at_render' } on the iteration row.

rerender defaults sku to the source iteration's model_used (frictionless
"same SKU again"), overridable by explicit body param.

Serves P1 deliverable #2.
EOF
)"
```

### Task 10: `finalizeLabRender` — log `cost_event` for Atlas Lab renders

**Goal:** Every Lab render produces a `cost_events` row with the SKU in metadata — compliant with the "cost-events are first-class, log even $0" policy. Previously Lab only wrote `cost_cents` on the iteration row.

**Files:**
- Modify: `lib/prompt-lab.ts` (function `finalizeLabRender`, around line 556)
- Test: `lib/prompt-lab.test.ts` (extend existing)

- [ ] **Step 10.1: Inspect current `finalizeLabRender` to confirm where cost lands**

Open `lib/prompt-lab.ts` line 556+. Look for the section where `cost_cents` is calculated + persisted on the iteration row. That is the insertion point for a `recordCostEvent` call.

- [ ] **Step 10.2: Write the failing test**

Append to `lib/prompt-lab.test.ts`:
```typescript
import { finalizeLabRender } from "./prompt-lab.js";

describe("finalizeLabRender — cost_event emission", () => {
  it("calls recordCostEvent with stage=generation, provider=atlas, metadata.sku", async () => {
    const recordCostEvent = vi.fn().mockResolvedValue(undefined);
    vi.doMock("./db.js", () => ({
      getSupabase: () => ({ /* ... */ }),
      recordCostEvent,
      addPropertyCost: vi.fn(),
    }));

    await finalizeLabRender({
      iterationId: "iter-1",
      clipUrl: "https://x/clip.mp4",
      costCents: 6,           // 6¢ = kling-v2-6-pro ~5s
      modelUsed: "kling-v2-6-pro",
      // ...other finalize params matching actual signature
    });

    expect(recordCostEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "generation",
        provider: "atlas",
        costCents: 6,
        metadata: expect.objectContaining({
          sku: "kling-v2-6-pro",
          surface: "lab",
          iteration_id: "iter-1",
        }),
      }),
    );
  });
});
```

(If `finalizeLabRender` doesn't currently accept `modelUsed`, that means the iteration row is fetched inside — fetch it and read `model_used` from there. The test should match whatever final design.)

- [ ] **Step 10.3: Run — expect failure**

- [ ] **Step 10.4: Implement**

Inside `finalizeLabRender`, after the `cost_cents` is computed and the iteration row updated, add:
```typescript
await recordCostEvent({
  propertyId: session.property_id ?? LAB_SYNTHETIC_PROPERTY_ID,
  sceneId: null,
  stage: "generation",
  provider: "atlas",
  unitsConsumed: 1,
  unitType: "renders",
  costCents: computedCostCents,
  metadata: {
    sku: iteration.model_used ?? "unknown",
    surface: "lab",
    iteration_id: iterationId,
    session_id: session.id,
  },
});
```

If `session.property_id` is null for Lab sessions (they're usually synthetic), define a stable `LAB_SYNTHETIC_PROPERTY_ID` at the top of `lib/prompt-lab.ts` as a zero-UUID or similar. **Verify `cost_events.property_id` is NOT NOT-NULL** — check `supabase/migrations/` for `cost_events` definition. If it IS NOT-NULL, either (a) use the session's synthetic UUID or (b) modify the `cost_events` table in migration 031 to make `property_id` nullable. Prefer (a) — schema changes to `cost_events` are out of P1 scope.

- [ ] **Step 10.5: Run tests + typecheck — expect pass**

```bash
npx vitest run lib/prompt-lab.test.ts
npx tsc --noEmit
```

- [ ] **Step 10.6: Commit**

```bash
git add lib/prompt-lab.ts lib/prompt-lab.test.ts
git commit -m "$(cat <<'EOF'
prompt-lab: emit cost_event on Lab render finalization (Atlas surface)

Every Lab render now writes a cost_events row with stage=generation,
provider=atlas, metadata={ sku, surface: 'lab', iteration_id }. Complies with
the first-class-cost-events policy. Dashboard aggregations will pick up Lab
spend automatically.

Serves P1 success criterion "cost logged".
EOF
)"
```

### Task 11: Extend `trace-director-prompt.ts` with V1 session mode

**Files:**
- Modify: `scripts/trace-director-prompt.ts`
- Modify or create: `scripts/trace-director-prompt.impl.ts` (add `traceV1Session`)

- [ ] **Step 11.1: Read the impl file to understand shape**

```bash
cat scripts/trace-director-prompt.impl.ts 2>/dev/null | head -80 || \
  echo "impl file does not exist — will be created inline"
```

If `impl.ts` exists, mirror its `traceListing` pattern. If not, create it with `traceListing`, `traceProperty`, and `traceV1Session` as three exported async functions.

- [ ] **Step 11.2: Add `--v1-session` to the argv parser**

In `scripts/trace-director-prompt.ts` line 34–46, extend `Mode` and `parseArgs`:
```typescript
type Mode =
  | { kind: "listing"; id: string }
  | { kind: "property"; id: string }
  | { kind: "v1-session"; id: string };

function parseArgs(): Mode {
  const args = process.argv.slice(2);
  const pairs: Array<[string, Mode["kind"]]> = [
    ["--listing", "listing"],
    ["--property", "property"],
    ["--v1-session", "v1-session"],
  ];
  for (const [flag, kind] of pairs) {
    const idx = args.indexOf(flag);
    if (idx >= 0 && args[idx + 1]) return { kind, id: args[idx + 1] };
  }
  console.error(
    "Usage: npx tsx scripts/trace-director-prompt.ts " +
      "(--listing <id> | --property <id> | --v1-session <prompt_lab_session_id>)",
  );
  process.exit(2);
}
```

And in `main()`:
```typescript
if (mode.kind === "v1-session") {
  const { traceV1Session } = await import("./trace-director-prompt.impl.js");
  await traceV1Session(mode.id);
  return;
}
```

- [ ] **Step 11.3: Implement `traceV1Session` in the impl file**

`traceV1Session(sessionId: string)` should:
1. Fetch the `prompt_lab_sessions` row by id — get `image_url`, `room_type`, `analysis_json` (if any).
2. Fetch the latest `prompt_lab_iterations` row for that session — get `director_output_json`, `director_prompt_hash`, `model_used`, `rating`.
3. Re-run the director chain exactly as `lib/prompt-lab.ts` does for rerenders — reach into the same director-prompt builder so the transcript matches what a real call would produce.
4. Write a markdown trace to `/tmp/director-trace-v1-<sessionId>.md` (matching the pattern of existing `docs/traces/director-trace-*.md` files).
5. Include the three retrieval blocks (WINNERS / LOSERS / RECIPE MATCH) with their row counts, so the success-criterion check is visible at a glance.

Rather than duplicating director-prompt logic, **import the prompt builder from `lib/prompt-lab.ts`** or from wherever it lives. If it's not cleanly extractable, this task includes a small refactor: extract the "build director user message" helper and re-export it.

Exact code depends on the impl file state — write the minimal code that produces a readable trace file with the three retrieval blocks rendered as sections.

- [ ] **Step 11.4: Smoke-run against an existing V1 session**

First find one:
```bash
psql "$SUPABASE_DB_URL" -c "SELECT id FROM prompt_lab_sessions ORDER BY created_at DESC LIMIT 1;"
```

Then:
```bash
npx tsx scripts/trace-director-prompt.ts --v1-session <id>
```
Expected: writes `/tmp/director-trace-v1-<id>.md`. Open it and confirm the three retrieval blocks are populated.

- [ ] **Step 11.5: Copy the trace artifact into the repo**

```bash
cp /tmp/director-trace-v1-<id>.md docs/traces/v1-trace-<id>-2026-04-22.md
```

- [ ] **Step 11.6: Typecheck + commit**

```bash
npx tsc --noEmit
git add scripts/trace-director-prompt.ts scripts/trace-director-prompt.impl.ts docs/traces/v1-trace-<id>-2026-04-22.md
git commit -m "$(cat <<'EOF'
scripts(trace): --v1-session mode + one live V1 trace committed

Adds traceV1Session(sessionId) that re-runs the director chain against a
prompt_lab_sessions row and writes a readable markdown transcript with
WINNERS / LOSERS / RECIPE MATCH retrieval blocks inline.

docs/traces/v1-trace-<id>-2026-04-22.md — live trace artifact satisfying
the P1 success criterion "V1 trace transcript shows populated retrieval
blocks against a real V1 session".

Serves P1 deliverable #7.
EOF
)"
```

### Task 12: End-to-end smoke — one V1 render

**Files:** no new files; this is a live validation.

- [ ] **Step 12.1: Start the dev server**

```bash
npm run dev
```
(Run in a second terminal or background. Record the PID for later shutdown.)

- [ ] **Step 12.2: Create a new Prompt Lab session via UI**

Open `http://localhost:5173/dashboard/development/prompt-lab` (URL may differ; confirm via `TopNav.tsx` → "Prompt Lab (legacy)" link's `to` prop).

Upload a test photo. Note the new `prompt_lab_sessions.id`.

- [ ] **Step 12.3: Trigger a render with default SKU (no sku param yet — UI comes in Task 15)**

Via curl against the running dev server (admin auth required — adapt to local admin token pattern):
```bash
curl -X POST http://localhost:5173/api/admin/prompt-lab/render \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"iteration_id":"<new-iter-id>"}'
```

Expected response: `{ "jobId": "...", "provider": "atlas", "sku": "kling-v2-6-pro" }`.

- [ ] **Step 12.4: Wait for render completion (Atlas ~40–90s)**

Poll the iteration row until `clip_url` is non-null:
```bash
watch -n 5 "psql \"\$SUPABASE_DB_URL\" -c \"SELECT id, provider, model_used, sku_source, cost_cents, clip_url IS NOT NULL AS has_clip FROM prompt_lab_iterations WHERE id = '<iter-id>';\""
```

Expected final state:
- `provider = 'atlas'`
- `model_used = 'kling-v2-6-pro'`
- `sku_source = 'captured_at_render'`
- `cost_cents` = ~6 (for a 5s kling-v2-6-pro render)
- `has_clip = true`

- [ ] **Step 12.5: Verify cost_event landed**

```bash
psql "$SUPABASE_DB_URL" -c "SELECT stage, provider, cost_cents, metadata FROM cost_events WHERE metadata->>'iteration_id' = '<iter-id>';"
```
Expected: one row. `provider='atlas'`, `metadata->>'sku' = 'kling-v2-6-pro'`, `metadata->>'surface' = 'lab'`.

- [ ] **Step 12.6: Record the smoke-test outcome**

Append a short block to `docs/audits/test-render-log-2026-04-21.md` (rename to `test-render-log.md` or create `test-render-log-2026-04-22.md` if preferred) with:
- Date, session_id, iteration_id
- `model_used`, `cost_cents`, `cost_event` id
- Subjective quality note (did the clip look broken?)

- [ ] **Step 12.7: Commit the audit entry**

```bash
git add docs/audits/<file>.md
git commit -m "audit(p1-smoke): first V1 render via Atlas landed clean — <iter-id>"
```

---

## Phase 2 — UI: SKU selector + cost chip + nav

**Duration target:** 2 hours. Phase 0 + Phase 1 must be complete.

### Task 13: Dispatch Sonnet subagent — v2-master vs v2-6-pro research

Kicked off early (parallel with Task 15/16 UI work). Produces `docs/audits/kling-v2master-vs-v26pro-2026-04-22.md`.

- [ ] **Step 13.1: Draft the brief**

Create `docs/briefs/2026-04-22-sonnet-v2master-research.md`:
```markdown
# Brief — v2-master vs v2-6-pro prompt-equivalence research

**Subagent:** Sonnet
**Scope:** bounded research + one markdown deliverable
**Budget:** 20–30 min, $0

**Goal:** Determine whether the same director prompt produces semantically
equivalent motion on `kling-v2-master` and `kling-v2-6-pro`. Verdict is
Confirmed-equivalent / Confirmed-different / Validate-day-1.

**Required reading:**
- Official Kuaishou / Kling release notes for v2.0 master vs v2.6 pro (search)
- Oliver's prior rating intuition: V2.6 Pro = best for single-image; V2 Master = different prompting contract (memory: project_kling_sku_observations.md)
- lib/providers/atlas.ts lines 40–90 (Atlas model descriptors)

**Scope:** produce a 1–2 page audit note at
`docs/audits/kling-v2master-vs-v26pro-2026-04-22.md` with sections:
1. Public docs summary (cite URLs + dates)
2. Prompt contract differences observed
3. Verdict (one of the three above)
4. If "Validate-day-1": a specific 2-render A/B plan

**Must-NOT:** submit renders; change any code; commit any changes outside
the audit file.
```

- [ ] **Step 13.2: Dispatch via Agent tool**

Launch the agent (Sonnet, bounded) with the brief. Pass the brief inline in the prompt. Expected result: one file at `docs/audits/kling-v2master-vs-v26pro-2026-04-22.md`.

- [ ] **Step 13.3: Commit when returned**

```bash
git add docs/audits/kling-v2master-vs-v26pro-2026-04-22.md docs/briefs/2026-04-22-sonnet-v2master-research.md
git commit -m "audit: kling v2-master vs v2-6-pro research — <verdict>"
```

### Task 14: Dispatch Sonnet subagent — V1 UX friction audit

Produces the friction-points list that feeds the deferred UX plan (Task 19).

- [ ] **Step 14.1: Draft the brief**

Create `docs/briefs/2026-04-22-sonnet-v1-ux-audit.md`:
```markdown
# Brief — V1 Prompt Lab UX friction audit

**Subagent:** Sonnet
**Scope:** read-only audit + one markdown deliverable
**Budget:** 30–45 min, $0

**Goal:** Walk the V1 Prompt Lab UI (src/pages/dashboard/PromptLab.tsx) and
enumerate friction points Oliver hits in daily use. Output feeds the UX plan
at docs/specs/2026-04-22-v1-lab-ux-plan.md.

**Required reading:**
- src/pages/dashboard/PromptLab.tsx (full file)
- docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md section P1
- Memory: project_prompt_lab.md

**Deliverable:** docs/audits/v1-lab-ux-friction-2026-04-22.md with sections:
1. Upload flow friction
2. Session-list friction
3. Iteration-card friction (rating, tagging, re-render)
4. Cost visibility gaps
5. Retrieval visibility gaps (preview of what P3 will surface)
6. Proposed quick wins (< 1h effort)
7. Proposed medium wins (1–4h effort)
8. Out-of-scope-for-UX observations flagged for other phases

**Must-NOT:** change any code or UI; commit any changes outside the audit + brief.
```

- [ ] **Step 14.2: Dispatch via Agent tool, commit when done**

```bash
git add docs/briefs/2026-04-22-sonnet-v1-ux-audit.md docs/audits/v1-lab-ux-friction-2026-04-22.md
git commit -m "audit: V1 Prompt Lab UX friction points (for 2026-04-22 UX plan)"
```

### Task 15: SKU selector + `$/5s` cost chip

**Files:**
- Modify: `src/pages/dashboard/PromptLab.tsx` (IterationCard render-controls region + SessionDetail header)

- [ ] **Step 15.1: Add an SKU constant + cost table at top of `PromptLab.tsx`**

After existing imports:
```typescript
// V1 Atlas SKUs available to pick per iteration. Kept in sync with
// lib/providers/atlas.ts ATLAS_MODELS + lib/providers/router.ts V1_ATLAS_SKUS.
const V1_SKU_OPTIONS = [
  { value: "kling-v2-6-pro",  label: "v2.6 Pro (default)", centsPer5s: 6 },
  { value: "kling-v2-master", label: "v2 Master",          centsPer5s: 22 },
  { value: "kling-v3-std",    label: "v3 Std",             centsPer5s: 7 },
  { value: "kling-o3-pro",    label: "o3 Pro",             centsPer5s: 10 },
] as const;

type V1Sku = (typeof V1_SKU_OPTIONS)[number]["value"];
const DEFAULT_V1_SKU: V1Sku = "kling-v2-6-pro";
```

- [ ] **Step 15.2: Add SKU state to IterationCard**

Inside `IterationCard` function body (line ~1162), add:
```typescript
const [sku, setSku] = useState<V1Sku>(
  (iteration.model_used as V1Sku | null) ?? DEFAULT_V1_SKU,
);
```

- [ ] **Step 15.3: Add the selector + cost chip to the render controls area (lines 1356–1387)**

Replace the render-controls flex row with:
```typescript
<div className="flex items-center gap-2 text-xs">
  <label className="text-muted-foreground">Render on:</label>
  <select
    value={sku}
    onChange={(e) => setSku(e.target.value as V1Sku)}
    className="border border-border bg-background px-2 py-1 text-xs"
    disabled={rendering}
  >
    {V1_SKU_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label} — {(opt.centsPer5s / 100).toFixed(2)}$/5s
      </option>
    ))}
  </select>
  <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
    ≈ ${(V1_SKU_OPTIONS.find(o => o.value === sku)!.centsPer5s / 100).toFixed(2)}
  </span>
  {/* existing render-for-real checkbox + render button, updated to forward sku */}
</div>
```

- [ ] **Step 15.4: Forward `sku` in the render API call**

Find the `fetch("/api/admin/prompt-lab/render", ...)` call inside `IterationCard` (typically in a `handleRender` function). Update the JSON body:
```typescript
body: JSON.stringify({
  iteration_id: iteration.id,
  sku,  // <-- added
}),
```

- [ ] **Step 15.5: Add the aggregate cost chip to SessionDetail header (around line 916)**

Next to the existing total-cost display, add a per-5s average if the session has ≥ 1 rendered iteration:
```tsx
{iterations.length > 0 && (
  <span className="text-xs text-muted-foreground">
    avg ${(iterations.reduce((s, i) => s + (i.cost_cents ?? 0), 0) / iterations.length / 100).toFixed(2)}/clip
  </span>
)}
```

- [ ] **Step 15.6: Smoke-test in browser**

Reload the Prompt Lab page in dev. Confirm:
- SKU selector renders on every iteration card
- Default selection is "v2.6 Pro (default)"
- Cost chip updates when selection changes
- Render button still works + triggers a real render with the selected SKU
- After render completes, `iteration.model_used` matches selection

- [ ] **Step 15.7: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/pages/dashboard/PromptLab.tsx
git commit -m "$(cat <<'EOF'
ui(lab): per-iteration SKU selector + cost chip + session avg chip

IterationCard gets a native <select> for the 4 V1 SKUs (v2.6 Pro default,
v2 Master, v3 Std, o3 Pro) with inline $/5s label and live cost chip.
Session header shows avg $/clip once any iteration has rendered.

render API call forwards the selected sku to the backend, which persists
model_used + sku_source=captured_at_render (see api/.../render.ts).

Serves P1 deliverable #4.
EOF
)"
```

### Task 16: Per-iteration "Try another SKU" control

**Files:**
- Modify: `src/pages/dashboard/PromptLab.tsx` (IterationCard — extend existing "Try with Kling/Runway" area, lines 1326–1349)

- [ ] **Step 16.1: Add a second row of SKU swap buttons**

Below the existing `[Kling | Runway]` try-with buttons, add (only shown if `iteration.clip_url` exists):
```tsx
{iteration.clip_url && (
  <div className="mt-2 flex items-center gap-2 text-xs">
    <span className="text-muted-foreground">Try another SKU:</span>
    {V1_SKU_OPTIONS
      .filter((opt) => opt.value !== iteration.model_used)
      .map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => handleRerenderWithSku(opt.value)}
          disabled={rerendering}
          className="border border-border px-2 py-0.5 hover:bg-muted"
          title={`${(opt.centsPer5s / 100).toFixed(2)}$/5s`}
        >
          {opt.label.split(" ")[0]}
        </button>
      ))}
  </div>
)}
```

- [ ] **Step 16.2: Implement `handleRerenderWithSku`**

```typescript
async function handleRerenderWithSku(targetSku: V1Sku) {
  setRerendering(true);
  try {
    const res = await fetch("/api/admin/prompt-lab/rerender", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        source_iteration_id: iteration.id,
        provider: "atlas",
        sku: targetSku,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    await refetchSession();  // or whatever re-fetches the iteration list
  } finally {
    setRerendering(false);
  }
}
```

- [ ] **Step 16.3: Smoke-test**

Click "Try another SKU → v2 Master" on an existing iteration. Confirm a new iteration is created with `model_used = 'kling-v2-master'`.

- [ ] **Step 16.4: Commit**

```bash
git add src/pages/dashboard/PromptLab.tsx
git commit -m "$(cat <<'EOF'
ui(lab): per-iteration "Try another SKU" re-render shortcut

Adds a second button row under the existing Kling/Runway try-with controls,
offering one-click rerender on any of the other 3 V1 SKUs. Disabled when
rerendering. Only visible after the initial clip is rendered.

Serves P1 deliverable #4.
EOF
)"
```

### Task 17: TopNav — rename + verify V2-hide semantics

**Files:**
- Modify: `src/components/TopNav.tsx` (lines 43–94, `DevelopmentNav`)

- [ ] **Step 17.1: Inventory nav entries to understand V2 scope**

Currently in nav (per explore report):
- `/dashboard/development` → "Overview"
- `/dashboard/development/lab` → "Lab" (← Listings Lab; paired-image surface = V2-adjacent)
- `/dashboard/development/prompt-lab` → "Prompt Lab (legacy)" (← V1)
- `/dashboard/development/prompt-lab/recipes` → "Recipes"
- `/dashboard/development/proposals` → "Proposals"
- `/dashboard/rating-ledger` → "Rating ledger"

P1 spec success criterion: **V2 entries reachable by direct URL (Listings Lab still loads at `/dashboard/development/lab/listings`)**.

Decision: **hide the "Lab" nav entry** (Listings Lab) — the URL still works. Rename "Prompt Lab (legacy)" → "Prompt Lab". Keep "Recipes", "Proposals", "Rating ledger", "Overview".

- [ ] **Step 17.2: Apply nav changes**

Replace the `DropdownMenuContent` body:
```tsx
<DropdownMenuContent align="start" className="w-48">
  <DropdownMenuItem asChild>
    <Link to="/dashboard/development" className="cursor-pointer">
      <Code2 className="mr-2 h-4 w-4" /> Overview
    </Link>
  </DropdownMenuItem>
  <DropdownMenuItem asChild>
    <Link to="/dashboard/development/prompt-lab" className="cursor-pointer">
      <Beaker className="mr-2 h-4 w-4" /> Prompt Lab
    </Link>
  </DropdownMenuItem>
  <DropdownMenuItem asChild>
    <Link to="/dashboard/development/prompt-lab/recipes" className="cursor-pointer">
      <BookOpen className="mr-2 h-4 w-4" /> Recipes
    </Link>
  </DropdownMenuItem>
  <DropdownMenuItem asChild>
    <Link to="/dashboard/development/proposals" className="cursor-pointer">
      <GitPullRequest className="mr-2 h-4 w-4" /> Proposals
    </Link>
  </DropdownMenuItem>
  <DropdownMenuItem asChild>
    <Link to="/dashboard/rating-ledger" className="cursor-pointer">
      <ListChecks className="mr-2 h-4 w-4" /> Rating ledger
    </Link>
  </DropdownMenuItem>
</DropdownMenuContent>
```

(Remove the `FlaskConical` import if now unused.)

- [ ] **Step 17.3: Verify `/dashboard/development/lab/listings` still routes**

Browse to it in dev. Expected: the page loads. If 404, inspect the React Router config (`src/App.tsx` or `src/routes.tsx`) to confirm the route is registered; do NOT add a new route — the success criterion is about preserving an existing one.

- [ ] **Step 17.4: Verify `/dashboard/development/lab` (the removed nav target) still routes**

Same direct-URL check. Removing it from nav does NOT remove it from the route table.

- [ ] **Step 17.5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/TopNav.tsx
git commit -m "$(cat <<'EOF'
ui(nav): rename "Prompt Lab (legacy)" → "Prompt Lab"; hide Listings Lab entry

Per P1 V1 Foundation: V1 Prompt Lab becomes the daily driver; Listings Lab
(paired-image / V2 surface) hidden from nav but reachable by direct URL
(/dashboard/development/lab and /dashboard/development/lab/listings both
still load).

Serves P1 deliverable #5 + success criterion "V2 entries reachable by direct URL".
EOF
)"
```

---

## Phase 3 — Wrap: docs, memory, deferred-UX plan

**Duration target:** 45 minutes.

### Task 18: Create `docs/state/MODEL-VERSIONS.md`

**Files:**
- Create: `docs/state/MODEL-VERSIONS.md`

- [ ] **Step 18.1: Write the doc**

Create `docs/state/MODEL-VERSIONS.md`:
```markdown
# Model Versions — V1 and V2

Canonical terminology for Listing Elevate's generation stack. Settled 2026-04-22.

## V1 (current, daily-driver)

- **Family:** Kling v2 series on AtlasCloud
- **Default SKU:** `kling-v2-6-pro`
- **Available SKUs (non-paired):** `kling-v2-6-pro`, `kling-v2-master`, `kling-v3-std`, `kling-o3-pro`
- **Input:** single image
- **Surface:** Prompt Lab (renamed from "Prompt Lab (legacy)" on 2026-04-22)
- **Production pipeline:** active (all production renders route here)
- **Code pointers:**
  - `lib/providers/router.ts` → `V1_ATLAS_SKUS`, `V1_DEFAULT_SKU`, `resolveDecision()`
  - `lib/providers/atlas.ts` → `ATLAS_MODELS`
  - `lib/prompt-lab.ts` → `submitLabRender({ sku })`
  - `src/pages/dashboard/PromptLab.tsx` → `V1_SKU_OPTIONS`

## V2 (paused, preserved)

- **Family:** Kling v3 + v2.1 paired-image
- **Paired SKU:** `kling-v2-1-pair` (start-end-frame)
- **Status:** hidden from nav 2026-04-22; URL reachable (Listings Lab)
- **Input:** start + end photo
- **Surface:** Listings Lab at `/dashboard/development/lab` and `/dashboard/development/lab/listings`
- **Production pipeline:** not connected; V1 serves all prod renders
- **Code pointers:**
  - `lib/providers/router.ts` → `selectProviderForScene()` paired-scene branch
  - Parked branches: `session/ledger-2026-04-21` (ledger for V2 bucket visibility),
    `session/router-2026-04-21` (manual router grid — superseded by P5)

## Why this split

1. V1 is the feedback-loop target. ML roadmap phases P2–P7 operate on V1-surface data.
2. V2 is paused until V1 is stable + Thompson router (P5) has ≥ 2 weeks of signal.
3. No code is deleted; V2 paths stay on disk with comment headers and park notes.

## Rollback

V1 routing is the default. To revert to pre-2026-04-22 Kling-native defaults,
flip the SKU env var + revert the router commit. Data is preserved (migration 031
adds columns, never deletes).

## See also

- `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md` — full program spec
- `docs/plans/2026-04-22-p1-v1-foundation-plan.md` — this plan
```

- [ ] **Step 18.2: Commit**

```bash
git add docs/state/MODEL-VERSIONS.md
git commit -m "docs(state): MODEL-VERSIONS.md — canonical V1/V2 reference"
```

### Task 19: Create `docs/specs/2026-04-22-v1-lab-ux-plan.md` (deferred-implementation UX plan)

**Files:**
- Create: `docs/specs/2026-04-22-v1-lab-ux-plan.md`

- [ ] **Step 19.1: Draft the UX plan, seeded from the Task-14 friction audit**

Open `docs/audits/v1-lab-ux-friction-2026-04-22.md` (subagent output). Promote each friction point into a UX-plan entry with priority + rough estimate + dependency note.

Template structure for `docs/specs/2026-04-22-v1-lab-ux-plan.md`:
```markdown
# V1 Prompt Lab UX Plan (deferred implementation)

Last updated: 2026-04-22
Status: deferred — implementation scheduled after P2 auto-judge lands

## Purpose

Turn V1 Prompt Lab into Oliver's smoothest daily-driver surface. Addresses
friction points enumerated in `docs/audits/v1-lab-ux-friction-2026-04-22.md`.
Implementation bundles are sized so each can ship in one session.

## ML-roadmap integration

Some UX elements depend on downstream ML phases. Do NOT ship early:

| UX element | Blocks on | Lands |
|---|---|---|
| Retrieval match-percentage panel | P3 Session 2 | 2026-04-26 |
| Judge-rating chip in iteration card | P2 Session 1 | 2026-04-23 |
| "Rate these first" panel | P6 | 2026-05-02 |
| Bucket-progress scoreboard | P4 (retrieval-scope data) | 2026-04-28 |

## Quick wins (in scope for a future single UX session)

1. <from friction audit §6>
2. ...

## Medium wins

1. <from friction audit §7>
2. ...

## Non-goals for this plan

- No production pipeline UI (prod ships via email; no UI change there).
- No V2 UI work.
- No rename of "Prompt Lab" in user-facing strings (it's already "Prompt Lab").

## See also

- Friction audit: docs/audits/v1-lab-ux-friction-2026-04-22.md
- Program spec: docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md
```

Fill in the quick-wins + medium-wins from the subagent audit output.

- [ ] **Step 19.2: Commit**

```bash
git add docs/specs/2026-04-22-v1-lab-ux-plan.md
git commit -m "spec: V1 Prompt Lab UX plan (deferred; depends on P2+P3)"
```

### Task 20: Update HANDOFF + PROJECT-STATE

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `docs/state/PROJECT-STATE.md`

- [ ] **Step 20.1: Rewrite HANDOFF.md "Right now"**

Open `docs/HANDOFF.md`. Replace the "Right now" section with:
```markdown
## Right now

**P1 V1 Foundation landed (2026-04-22).** Lab renders now route through Atlas
with `kling-v2-6-pro` default. SKU captured on every iteration
(`model_used` + `sku_source` via migration 031). IterationCard has a per-SKU
selector + cost chip + "Try another SKU" shortcut. Nav renamed "Prompt Lab
(legacy)" → "Prompt Lab"; Listings Lab hidden (direct URL still works).
One live V1 trace committed at `docs/traces/v1-trace-<id>-2026-04-22.md`
— retrieval blocks populated, confirming the ML loop is SKU-ready.

**Next:** P2 Session 1 — Gemini auto-judge rubric + capture. 2026-04-23.
See `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md` section P2.

**Not yet pushed to production:** all P1 commits are local on `main`. Push
pending Oliver's explicit approval.
```

Add a "Recent shipping" entry at the top of the log section:
```markdown
### 2026-04-22 — P1 V1 Foundation (local, unpushed)
- Migration 031: `model_used` + `sku_source` on `prompt_lab_iterations`
- Router: SKU-aware `resolveDecision` + `V1_DEFAULT_SKU = kling-v2-6-pro`
- Endpoints: `render.ts` + `rerender.ts` accept `sku`, persist `model_used`
- `finalizeLabRender` emits `cost_events` row for Atlas Lab renders
- `scripts/trace-director-prompt.ts --v1-session` mode added
- UI: SKU selector + cost chip + "Try another SKU" in `PromptLab.tsx`
- Nav: rename + Listings Lab hide (URL preserved)
- Docs: `MODEL-VERSIONS.md`, `v1-lab-ux-plan.md`, v2-master research note, UX friction audit
```

- [ ] **Step 20.2: Add a subsection to PROJECT-STATE.md**

After the "2026-04-21 — DA.1 Gemini-eyes" subsection, insert:
```markdown
---

## 2026-04-22 — P1 V1 Foundation (merged to main, unpushed)

V1 Prompt Lab becomes Oliver's daily-driver iteration tool. All P1 spec
deliverables landed in a single session. ML loop is now SKU-granular from
this point forward.

### What shipped

| Deliverable | Location |
|---|---|
| Migration 031 SKU capture | `supabase/migrations/031_prompt_lab_iterations_sku.sql` |
| Atlas SKU routing + default | `lib/providers/router.ts` |
| `submitLabRender` SKU threading | `lib/prompt-lab.ts` |
| Render + rerender endpoints | `api/admin/prompt-lab/{render,rerender}.ts` |
| `cost_events` for Lab | `lib/prompt-lab.ts::finalizeLabRender` |
| V1 trace mode | `scripts/trace-director-prompt.ts` |
| SKU selector + cost chip | `src/pages/dashboard/PromptLab.tsx` |
| Nav rename + V2 hide | `src/components/TopNav.tsx` |
| Model versions doc | `docs/state/MODEL-VERSIONS.md` |
| UX friction audit | `docs/audits/v1-lab-ux-friction-2026-04-22.md` |
| Deferred UX plan | `docs/specs/2026-04-22-v1-lab-ux-plan.md` |
| v2-master research | `docs/audits/kling-v2master-vs-v26pro-2026-04-22.md` |
| Live V1 trace | `docs/traces/v1-trace-<id>-2026-04-22.md` |

### Open questions from P1

(List anything the subagent research surfaced that changes P2+ plans — in
particular the v2-master verdict: Confirmed-equivalent / Confirmed-different /
Validate-day-1. If Confirmed-different, P2 rubric needs a per-SKU wrinkle.)

### Next

P2 Session 1 (Gemini auto-judge rubric + capture) — 2026-04-23.
```

- [ ] **Step 20.3: Commit**

```bash
git add docs/HANDOFF.md docs/state/PROJECT-STATE.md
git commit -m "docs(state): P1 V1 Foundation closeout — HANDOFF + PROJECT-STATE"
```

### Task 21: Update memory + final push decision

**Files:**
- Modify: `/Users/oliverhelgemo/.claude/projects/-Users-oliverhelgemo/memory/project_v1_ml_roadmap.md`
- Modify: `/Users/oliverhelgemo/.claude/projects/-Users-oliverhelgemo/memory/project_listing_elevate.md` (append: model_used + sku_source fields now on iteration schema; Lab routes through Atlas by default)
- Modify: `/Users/oliverhelgemo/.claude/projects/-Users-oliverhelgemo/memory/project_back_on_track_plan.md` (add one-line pointer: "Superseded for V1/ML work by project_v1_ml_roadmap.md as of 2026-04-22")

- [ ] **Step 21.1: Update `project_v1_ml_roadmap.md`**

Replace the `**State at session end 2026-04-22:**` paragraph with:
```markdown
**State at end of 2026-04-22:** Spec committed. P1 shipped (local, unpushed).
V1 is now the daily driver. SKU capture live; Atlas-routed renders; SKU
selector + cost chip in UI; nav renamed + V2 hidden; one V1 trace committed.
Next: P2 Session 1 (Gemini auto-judge rubric) — 2026-04-23.
```

- [ ] **Step 21.2: Update `project_listing_elevate.md`**

Append to the pipeline section (lines 38–44) or "Product promises" section:
```markdown
**V1 Lab surface (as of 2026-04-22):** Lab renders route through AtlasCloud
with per-iteration SKU selector (default `kling-v2-6-pro`). Every iteration
stores `model_used` + `sku_source` for ML-loop granularity. `cost_events`
emitted on every Lab finalize. UI at `/dashboard/development/prompt-lab`.
```

Also remove "Wan 2.7 registered briefly, removed 2026-04-20 evening" — stale — or leave if still informative. Judge based on memory-drift policy.

- [ ] **Step 21.3: Update `project_back_on_track_plan.md`**

Add the successor pointer at the top of the memory body:
```markdown
**Superseded for V1/ML work by `project_v1_ml_roadmap.md` as of 2026-04-22.**
Back-on-track plan's A/M.1/DQ/DM/CI/C/M.2 phases remain authoritative for
historical context; new V1/ML work follows the 2026-04-22 spec.
```

- [ ] **Step 21.4: `MEMORY.md` — no change needed**

The `project_v1_ml_roadmap.md` entry already exists in the index. Verify with `grep -n "v1_ml_roadmap" MEMORY.md`. If missing, add:
```
- [V1 primary tool + ML roadmap (2026-04-22)](project_v1_ml_roadmap.md) — multi-day program; P1 shipped 2026-04-22
```

- [ ] **Step 21.5: Do NOT push without explicit permission**

Stop here. Tell Oliver:
- P1 is fully implemented and committed locally.
- All P1 success criteria met (one V1 render on kling-v2-6-pro via Atlas with cost logged + model_used populated; trace committed; research note committed; nav changed; V2 URLs still reachable; orphan branches parked).
- Ask: "Push to `origin/main` now, or hold?"
- If Oliver approves: `git push origin main`. Otherwise: leave local.

---

## Success criteria — final verification

Before declaring P1 complete, re-run this checklist against live state:

- [ ] **SC1.** Run a fresh Lab render. Confirm in DB: `provider='atlas'`, `model_used='kling-v2-6-pro'`, `sku_source='captured_at_render'`, `cost_cents > 0`, and a matching `cost_events` row exists with `metadata->>'sku' = 'kling-v2-6-pro'`.
- [ ] **SC2.** Open `docs/traces/v1-trace-<id>-2026-04-22.md`. Confirm the three retrieval blocks (WINNERS / LOSERS / RECIPE MATCH) are present and non-empty.
- [ ] **SC3.** Open `docs/audits/kling-v2master-vs-v26pro-2026-04-22.md`. Verdict field is populated with one of: Confirmed-equivalent / Confirmed-different / Validate-day-1.
- [ ] **SC4.** Reload the dashboard in browser. Confirm: "Prompt Lab" (not "legacy"); no "Lab" entry visible. Visit `/dashboard/development/lab/listings` directly — page loads.
- [ ] **SC5.** `docs/state/MODEL-VERSIONS.md` exists and is coherent.
- [ ] **SC6.** `docs/sessions/2026-04-21-park-ledger.md` + `2026-04-21-park-router.md` exist and describe the respective branches.
- [ ] **SC7.** `git log --oneline -20` shows the P1 commits in order with clear messages.

All seven → P1 complete.

---

## Risks + mitigations (quick reference during execution)

| Risk | If it hits | Do |
|---|---|---|
| Atlas wallet returns $0 despite Oliver saying topped up | Task 1.1 fails | Stop; ask Oliver to verify via Atlas dashboard |
| `resolveDecision` breaks an existing callsite | Task 7.6 typecheck fails | Patch callsites to pass `skuOverride: null`; don't revert the change |
| `cost_events.property_id` is NOT NULL | Task 10 fails | Use `LAB_SYNTHETIC_PROPERTY_ID` with a stable zero-UUID; do NOT alter `cost_events` schema |
| Live V1 trace (Task 11) retrieval blocks empty | SC2 fails | Check if embedding backfill is up-to-date; if not, run `scripts/backfill-*-embeddings.ts` (defer — may bump out of P1 scope) |
| v2-master research returns "Confirmed-different" | Verdict changes P2 rubric | Note in HANDOFF; P2 session 1 absorbs the difference |
| UI renders break on IterationCard edit | SC1 path blocked | Check React Router config; open DevTools; fix inline before committing |
| Orphan branches have uncommitted state not captured in park note | Task 4 incomplete | Append a "dangling uncommitted edits" note to each park doc |

---

## Out of scope for P1 (do not implement)

- Gemini auto-judge (P2).
- Image embeddings (P3 Session 1).
- Hybrid retrieval or reranker (P3 Sessions 2–3).
- Per-photo Gemini enrichment on prompt_lab_sessions (P4 Session 1).
- Thompson router (P5).
- Any change to the production pipeline code path (`lib/pipeline.ts` `runAssembly` etc.).
- Any Kling v3 work.
- Paired-image flow (V2).
- Retrieval match-percentage UI (P3 Session 2).
- Production SKU rollout (always stays on default until P5 evidence review).
