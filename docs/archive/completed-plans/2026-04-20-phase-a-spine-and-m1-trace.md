> **ARCHIVED — COMPLETED PLAN.** Moved 2026-04-21. Work shipped; preserved as execution record.
>
> Last updated: (original content preserved unchanged below)
>
> See also:
> - [../README.md](../README.md)
> - [../../state/PROJECT-STATE.md](../../state/PROJECT-STATE.md)
> - [../../HANDOFF.md](../../HANDOFF.md)

# Phase A (Lab UX Spine) + Phase M.1 (Director-Prompt Trace) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Listings Lab around an explicit "next-action spine" so the user always knows the single next thing to do, while a parallel subagent runs `scripts/trace-director-prompt.ts` to prove (or refute) that the rating → embedding → retrieval → director-injection chain works end-to-end.

**Architecture:** Two pure resolver functions (`labSceneStatus`, `labNextAction`) feed a listing-level `NextActionBanner` component and per-scene status chips in the existing `ShotPlanTable`. Mutations use in-place optimistic updates in `LabListingDetail.tsx` (rollback on error) — no React Query migration, no schema changes. In parallel, a TypeScript CLI script mirrors `directListingScenes` retrieval logic to reconstruct the exact director user message for any listing/property and writes a human-readable transcript + audit summary.

**Tech Stack:** React 18 + TypeScript + Tailwind + shadcn/ui (existing), Vitest (already configured in `vitest.config.ts`), Supabase JS client (service role for the script), `tsx` for script execution (already used by `scripts/backfill-*.ts`).

**Parts:** This plan has two parallel parts. Part 1 (Phase A, Tasks A1–A9) is the main-thread work. Part 2 (Phase M.1, Tasks M1–M6) runs as a read-only subagent in parallel with Part 1. The Phase M.1 verdict informs Phase M.2 (which has its own later plan).

---

## File Structure

### Phase A (new + modified)

| Path | Responsibility | Create / Modify |
|---|---|---|
| `src/lib/labSceneStatus.ts` | Pure resolver: scene + iterations → `SceneStatus` | Create |
| `src/lib/labSceneStatus.test.ts` | Unit tests for scene status resolver | Create |
| `src/lib/labNextAction.ts` | Pure resolver: listing → `NextAction` descriptor | Create |
| `src/lib/labNextAction.test.ts` | Unit tests for next-action resolver | Create |
| `src/components/lab/NextActionBanner.tsx` | Banner UI that consumes `labNextAction` | Create |
| `src/components/lab/ShotPlanTable.tsx` | Add status chip per row using `labSceneStatus` + reorder rows by priority | Modify |
| `src/pages/dashboard/LabListingDetail.tsx` | Render banner; add optimistic rate/archive mutation helpers; pass resolver output to table | Modify |
| `src/lib/labListingsApi.ts` | (No change — mutations stay here as API wrappers; optimistic logic lives in the page) | — |

### Phase M.1 (new)

| Path | Responsibility | Create / Modify |
|---|---|---|
| `scripts/trace-director-prompt.ts` | CLI: reconstruct director user message + run retrieval RPCs + print audit checklist | Create |
| `docs/ML-AUDIT-2026-04-20.md` | Audit report: findings per checklist, verdict, recommended M.2 actions | Create |

---

# Part 1 — Phase A: Lab UX Spine

## Task A1: Scene Status Resolver (pure function + tests)

**Files:**
- Create: `src/lib/labSceneStatus.ts`
- Test: `src/lib/labSceneStatus.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/labSceneStatus.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveSceneStatus, type SceneStatusInput } from "./labSceneStatus";
import type { LabListingScene, LabListingIteration } from "./labListingsApi";

function scene(overrides: Partial<LabListingScene> = {}): LabListingScene {
  return {
    id: "s1",
    listing_id: "l1",
    scene_number: 1,
    photo_id: "p1",
    end_photo_id: null,
    end_image_url: null,
    room_type: "kitchen",
    camera_movement: "push_in",
    director_prompt: "test",
    director_intent: {},
    refinement_notes: null,
    use_end_frame: false,
    archived: false,
    chat_messages: [],
    created_at: "2026-04-20T00:00:00Z",
    ...overrides,
  };
}

function iter(overrides: Partial<LabListingIteration> = {}): LabListingIteration {
  return {
    id: "i1",
    scene_id: "s1",
    iteration_number: 1,
    director_prompt: "test",
    model_used: "kling-v3-pro",
    provider_task_id: null,
    clip_url: null,
    rating: null,
    tags: null,
    user_comment: null,
    cost_cents: 0,
    status: "queued",
    render_error: null,
    chat_messages: [],
    rating_reasons: [],
    archived: false,
    created_at: "2026-04-20T00:00:00Z",
    ...overrides,
  };
}

describe("resolveSceneStatus", () => {
  it("returns 'archived' when scene.archived is true", () => {
    const input: SceneStatusInput = { scene: scene({ archived: true }), iterations: [] };
    expect(resolveSceneStatus(input).kind).toBe("archived");
  });

  it("returns 'needs_first_render' when scene has no iterations", () => {
    const input: SceneStatusInput = { scene: scene(), iterations: [] };
    expect(resolveSceneStatus(input).kind).toBe("needs_first_render");
  });

  it("returns 'rendering' when latest iteration has task_id but no clip_url and no error", () => {
    const input: SceneStatusInput = {
      scene: scene(),
      iterations: [iter({ provider_task_id: "tsk_1", clip_url: null, render_error: null })],
    };
    expect(resolveSceneStatus(input).kind).toBe("rendering");
  });

  it("returns 'needs_rating' when latest iteration has clip but rating IS NULL", () => {
    const input: SceneStatusInput = {
      scene: scene(),
      iterations: [iter({ clip_url: "https://x/y.mp4", rating: null, status: "rendered" })],
    };
    expect(resolveSceneStatus(input).kind).toBe("needs_rating");
  });

  it("returns 'iterating' when latest rating is 1-3 and refinement_notes exist", () => {
    const input: SceneStatusInput = {
      scene: scene({ refinement_notes: "make it slower" }),
      iterations: [iter({ clip_url: "https://x/y.mp4", rating: 2, status: "rated" })],
    };
    expect(resolveSceneStatus(input).kind).toBe("iterating");
  });

  it("returns 'done' when any iteration is rated >= 4", () => {
    const input: SceneStatusInput = {
      scene: scene(),
      iterations: [
        iter({ id: "i1", iteration_number: 1, clip_url: "https://x/1.mp4", rating: 2 }),
        iter({ id: "i2", iteration_number: 2, clip_url: "https://x/2.mp4", rating: 5 }),
      ],
    };
    expect(resolveSceneStatus(input).kind).toBe("done");
  });

  it("ignores archived iterations when computing status", () => {
    const input: SceneStatusInput = {
      scene: scene(),
      iterations: [iter({ clip_url: "https://x/y.mp4", rating: 5, archived: true })],
    };
    expect(resolveSceneStatus(input).kind).toBe("needs_first_render");
  });

  it("returns 'failed' when latest iteration has render_error", () => {
    const input: SceneStatusInput = {
      scene: scene(),
      iterations: [iter({ provider_task_id: "tsk_1", render_error: "timeout", status: "failed" })],
    };
    expect(resolveSceneStatus(input).kind).toBe("failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- src/lib/labSceneStatus.test.ts
```

Expected: all 8 tests FAIL with "Cannot find module './labSceneStatus'".

- [ ] **Step 3: Implement the resolver**

Create `src/lib/labSceneStatus.ts`:

```ts
import type { LabListingScene, LabListingIteration } from "./labListingsApi";

export type SceneStatusKind =
  | "archived"
  | "needs_first_render"
  | "rendering"
  | "failed"
  | "needs_rating"
  | "iterating"
  | "done";

export interface SceneStatus {
  kind: SceneStatusKind;
  latestIteration: LabListingIteration | null;
  bestRating: number | null;
}

export interface SceneStatusInput {
  scene: LabListingScene;
  iterations: LabListingIteration[];
}

export function resolveSceneStatus({ scene, iterations }: SceneStatusInput): SceneStatus {
  if (scene.archived) {
    return { kind: "archived", latestIteration: null, bestRating: null };
  }

  const visible = iterations.filter((i) => !i.archived);
  const byNum = [...visible].sort((a, b) => b.iteration_number - a.iteration_number);
  const latest = byNum[0] ?? null;
  const bestRating = visible.reduce<number | null>((best, i) => {
    if (i.rating === null) return best;
    return best === null || i.rating > best ? i.rating : best;
  }, null);

  if (visible.length === 0) {
    return { kind: "needs_first_render", latestIteration: null, bestRating: null };
  }

  if (bestRating !== null && bestRating >= 4) {
    return { kind: "done", latestIteration: latest, bestRating };
  }

  if (latest) {
    if (latest.render_error) {
      return { kind: "failed", latestIteration: latest, bestRating };
    }
    if (latest.provider_task_id && !latest.clip_url) {
      return { kind: "rendering", latestIteration: latest, bestRating };
    }
    if (latest.clip_url && latest.rating === null) {
      return { kind: "needs_rating", latestIteration: latest, bestRating };
    }
    if (
      latest.rating !== null &&
      latest.rating <= 3 &&
      scene.refinement_notes &&
      scene.refinement_notes.trim().length > 0
    ) {
      return { kind: "iterating", latestIteration: latest, bestRating };
    }
  }

  return { kind: "needs_rating", latestIteration: latest, bestRating };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- src/lib/labSceneStatus.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/labSceneStatus.ts src/lib/labSceneStatus.test.ts
git commit -m "feat(lab): add pure scene status resolver for spine UX"
```

---

## Task A2: Next-Action Resolver (pure function + tests)

**Files:**
- Create: `src/lib/labNextAction.ts`
- Test: `src/lib/labNextAction.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/labNextAction.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveNextAction } from "./labNextAction";
import type { LabListingScene, LabListingIteration } from "./labListingsApi";

function scene(id: string, overrides: Partial<LabListingScene> = {}): LabListingScene {
  return {
    id,
    listing_id: "l1",
    scene_number: 1,
    photo_id: "p1",
    end_photo_id: null,
    end_image_url: null,
    room_type: "kitchen",
    camera_movement: "push_in",
    director_prompt: "test",
    director_intent: {},
    refinement_notes: null,
    use_end_frame: false,
    archived: false,
    chat_messages: [],
    created_at: "2026-04-20T00:00:00Z",
    ...overrides,
  };
}

function iter(sceneId: string, overrides: Partial<LabListingIteration> = {}): LabListingIteration {
  return {
    id: "i" + Math.random().toString(36).slice(2, 7),
    scene_id: sceneId,
    iteration_number: 1,
    director_prompt: "test",
    model_used: "kling-v3-pro",
    provider_task_id: null,
    clip_url: null,
    rating: null,
    tags: null,
    user_comment: null,
    cost_cents: 0,
    status: "queued",
    render_error: null,
    chat_messages: [],
    rating_reasons: [],
    archived: false,
    created_at: "2026-04-20T00:00:00Z",
    ...overrides,
  };
}

describe("resolveNextAction", () => {
  it("returns 'all_done' when all non-archived scenes are done", () => {
    const scenes = [scene("s1"), scene("s2")];
    const iterations = [
      iter("s1", { clip_url: "x", rating: 5 }),
      iter("s2", { clip_url: "x", rating: 4 }),
    ];
    const action = resolveNextAction({ scenes, iterations });
    expect(action.kind).toBe("all_done");
  });

  it("prioritizes 'rate' over 'render' when both are pending", () => {
    const scenes = [scene("s1"), scene("s2")];
    const iterations = [iter("s2", { clip_url: "https://x/y.mp4", rating: null, status: "rendered" })];
    const action = resolveNextAction({ scenes, iterations });
    expect(action.kind).toBe("rate");
    expect(action.sceneId).toBe("s2");
  });

  it("returns 'render_batch' listing all scenes that need a first render", () => {
    const scenes = [scene("s1"), scene("s2"), scene("s3")];
    const iterations = [iter("s2", { clip_url: "x", rating: 5 })];
    const action = resolveNextAction({ scenes, iterations });
    expect(action.kind).toBe("render_batch");
    if (action.kind === "render_batch") {
      expect(action.sceneIds.sort()).toEqual(["s1", "s3"]);
    }
  });

  it("returns 'waiting' when all pending work is rendering", () => {
    const scenes = [scene("s1")];
    const iterations = [iter("s1", { provider_task_id: "tsk" })];
    const action = resolveNextAction({ scenes, iterations });
    expect(action.kind).toBe("waiting");
  });

  it("returns 'retry_failed' when a scene has a failed latest iteration", () => {
    const scenes = [scene("s1")];
    const iterations = [iter("s1", { provider_task_id: "tsk", render_error: "timeout", status: "failed" })];
    const action = resolveNextAction({ scenes, iterations });
    expect(action.kind).toBe("retry_failed");
    if (action.kind === "retry_failed") expect(action.sceneId).toBe("s1");
  });

  it("ignores archived scenes", () => {
    const scenes = [scene("s1", { archived: true }), scene("s2")];
    const iterations = [iter("s2", { clip_url: "x", rating: 5 })];
    const action = resolveNextAction({ scenes, iterations });
    expect(action.kind).toBe("all_done");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- src/lib/labNextAction.test.ts
```

Expected: all 6 tests FAIL with "Cannot find module './labNextAction'".

- [ ] **Step 3: Implement the resolver**

Create `src/lib/labNextAction.ts`:

```ts
import type { LabListingScene, LabListingIteration } from "./labListingsApi";
import { resolveSceneStatus, type SceneStatus } from "./labSceneStatus";

export type NextAction =
  | { kind: "all_done"; cta: string }
  | { kind: "rate"; sceneId: string; cta: string }
  | { kind: "retry_failed"; sceneId: string; cta: string }
  | { kind: "render_batch"; sceneIds: string[]; cta: string }
  | { kind: "iterate"; sceneId: string; cta: string }
  | { kind: "waiting"; cta: string };

export interface NextActionInput {
  scenes: LabListingScene[];
  iterations: LabListingIteration[];
}

interface ScoredScene {
  scene: LabListingScene;
  status: SceneStatus;
}

export function resolveNextAction({ scenes, iterations }: NextActionInput): NextAction {
  const scored: ScoredScene[] = scenes
    .filter((s) => !s.archived)
    .map((s) => ({
      scene: s,
      status: resolveSceneStatus({
        scene: s,
        iterations: iterations.filter((i) => i.scene_id === s.id),
      }),
    }));

  if (scored.length === 0) {
    return { kind: "all_done", cta: "No scenes planned" };
  }

  const byKind = (k: SceneStatus["kind"]) => scored.filter((x) => x.status.kind === k);

  const needsRating = byKind("needs_rating");
  if (needsRating.length > 0) {
    const s = needsRating[0].scene;
    return {
      kind: "rate",
      sceneId: s.id,
      cta: `Rate scene ${s.scene_number} — ${s.room_type} (${needsRating.length} unrated)`,
    };
  }

  const failed = byKind("failed");
  if (failed.length > 0) {
    const s = failed[0].scene;
    return {
      kind: "retry_failed",
      sceneId: s.id,
      cta: `Retry scene ${s.scene_number} — ${s.room_type} (render failed)`,
    };
  }

  const needsRender = byKind("needs_first_render");
  if (needsRender.length > 0) {
    return {
      kind: "render_batch",
      sceneIds: needsRender.map((x) => x.scene.id),
      cta: `Render ${needsRender.length} scene${needsRender.length === 1 ? "" : "s"} that need a first pass`,
    };
  }

  const iterating = byKind("iterating");
  if (iterating.length > 0) {
    const s = iterating[0].scene;
    return {
      kind: "iterate",
      sceneId: s.id,
      cta: `Iterate scene ${s.scene_number} — refinement notes pending`,
    };
  }

  const rendering = byKind("rendering");
  if (rendering.length > 0) {
    return {
      kind: "waiting",
      cta: `Waiting for ${rendering.length} render${rendering.length === 1 ? "" : "s"} to finish`,
    };
  }

  return { kind: "all_done", cta: "All scenes rated ≥ 4★" };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npm test -- src/lib/labNextAction.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/labNextAction.ts src/lib/labNextAction.test.ts
git commit -m "feat(lab): add pure next-action resolver for listing spine"
```

---

## Task A3: NextActionBanner Component

**Files:**
- Create: `src/components/lab/NextActionBanner.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/lab/NextActionBanner.tsx`:

```tsx
import { Loader2, Play, Star, RefreshCw, Wrench, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NextAction } from "@/lib/labNextAction";

interface NextActionBannerProps {
  action: NextAction;
  busy?: boolean;
  onRate: (sceneId: string) => void;
  onRenderBatch: (sceneIds: string[]) => void;
  onRetry: (sceneId: string) => void;
  onIterate: (sceneId: string) => void;
}

const KIND_STYLE: Record<NextAction["kind"], string> = {
  rate: "border-teal-500/40 bg-teal-500/10 text-teal-700",
  render_batch: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  retry_failed: "border-red-500/40 bg-red-500/10 text-red-700",
  iterate: "border-violet-500/40 bg-violet-500/10 text-violet-700",
  waiting: "border-amber-400/40 bg-amber-400/10 text-amber-700",
  all_done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
};

export function NextActionBanner({ action, busy, onRate, onRenderBatch, onRetry, onIterate }: NextActionBannerProps) {
  const Icon = busy
    ? Loader2
    : action.kind === "rate"
    ? Star
    : action.kind === "render_batch"
    ? Play
    : action.kind === "retry_failed"
    ? RefreshCw
    : action.kind === "iterate"
    ? Wrench
    : action.kind === "all_done"
    ? Check
    : Loader2;

  function handleClick() {
    if (action.kind === "rate") onRate(action.sceneId);
    else if (action.kind === "render_batch") onRenderBatch(action.sceneIds);
    else if (action.kind === "retry_failed") onRetry(action.sceneId);
    else if (action.kind === "iterate") onIterate(action.sceneId);
  }

  const actionable = action.kind === "rate" || action.kind === "render_batch" || action.kind === "retry_failed" || action.kind === "iterate";

  return (
    <div className={`flex items-center justify-between gap-3 border px-4 py-3 ${KIND_STYLE[action.kind]}`}>
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${busy || action.kind === "waiting" ? "animate-spin" : ""}`} />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider opacity-70">Next action</div>
          <div className="truncate text-sm font-medium">{action.cta}</div>
        </div>
      </div>
      {actionable && (
        <Button size="sm" onClick={handleClick} disabled={busy}>
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Go
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check the file**

```
npx tsc --noEmit -p tsconfig.json 2>&1 | grep NextActionBanner || echo "OK"
```

Expected: prints `OK` (no errors about the new file).

- [ ] **Step 3: Commit**

```bash
git add src/components/lab/NextActionBanner.tsx
git commit -m "feat(lab): add NextActionBanner component"
```

---

## Task A4: ShotPlanTable — status chips + priority ordering

**Files:**
- Modify: `src/components/lab/ShotPlanTable.tsx`

- [ ] **Step 1: Replace local status derivation with resolver**

Replace the `latestStatus` + `statusColor` computation (lines ~46–62 of the existing file) with resolver-driven chips, and reorder rows by priority.

In `src/components/lab/ShotPlanTable.tsx`, at the top, add:

```tsx
import { resolveSceneStatus, type SceneStatusKind } from "@/lib/labSceneStatus";
```

Replace the existing `useMemo` block (lines 17–23) with this one that also sorts by priority:

```tsx
const PRIORITY: Record<SceneStatusKind, number> = {
  needs_rating: 0,
  failed: 1,
  iterating: 2,
  needs_first_render: 3,
  rendering: 4,
  done: 5,
  archived: 6,
};

const { scenes, archivedCount } = useMemo(() => {
  const arch = allScenes.filter((s) => s.archived).length;
  const visible = showArchived ? allScenes : allScenes.filter((s) => !s.archived);
  const sorted = [...visible].sort((a, b) => {
    const sa = resolveSceneStatus({ scene: a, iterations: iterations.filter((i) => i.scene_id === a.id) });
    const sb = resolveSceneStatus({ scene: b, iterations: iterations.filter((i) => i.scene_id === b.id) });
    const diff = PRIORITY[sa.kind] - PRIORITY[sb.kind];
    if (diff !== 0) return diff;
    return a.scene_number - b.scene_number;
  });
  return { scenes: sorted, archivedCount: arch };
}, [allScenes, iterations, showArchived]);
```

Then inside the `{scenes.map((s) => { ... })}` block, replace the `latestStatus` + `statusColor` derivation (lines 46–62) with:

```tsx
const status = resolveSceneStatus({
  scene: s,
  iterations: sceneIters,
});
const statusLabel: Record<SceneStatusKind, string> = {
  needs_rating: "rate",
  needs_first_render: "render",
  rendering: "rendering",
  iterating: "iterate",
  failed: "failed",
  done: "done",
  archived: "archived",
};
const statusColor: Record<SceneStatusKind, string> = {
  needs_rating: "border-teal-500/40 bg-teal-500/10 text-teal-700",
  needs_first_render: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  rendering: "border-amber-400/40 bg-amber-400/10 text-amber-700",
  iterating: "border-violet-500/40 bg-violet-500/10 text-violet-700",
  failed: "border-red-500/40 bg-red-500/10 text-red-700",
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  archived: "border-border bg-muted text-muted-foreground",
};
```

Replace the existing status `<span>` block (lines 97–104) with:

```tsx
<span className="text-right">
  <span className={`inline-block border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${statusColor[status.kind]}`}>
    {statusLabel[status.kind]}
  </span>
</span>
```

(The archived chip is no longer shown as a separate badge because archived scenes already get `opacity-60` via `s.archived ? "opacity-60" : ""` and the status chip shows "archived" when appropriate.)

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit -p tsconfig.json 2>&1 | grep ShotPlanTable || echo "OK"
```

Expected: `OK`.

- [ ] **Step 3: Manual browser check**

Start the dev server:

```
npm run dev
```

Navigate to `/dashboard/development/lab` → click any listing with multiple scenes in different states. Verify:
- Chips are colored correctly per state
- Rows sort: needs_rating first, then failed, iterating, needs_first_render, rendering, done, archived

- [ ] **Step 4: Commit**

```bash
git add src/components/lab/ShotPlanTable.tsx
git commit -m "feat(lab): priority-sorted status chips in ShotPlanTable"
```

---

## Task A5: Optimistic rate mutation in LabListingDetail

**Files:**
- Modify: `src/pages/dashboard/LabListingDetail.tsx`

- [ ] **Step 1: Add optimistic rate helper to the page**

In `src/pages/dashboard/LabListingDetail.tsx`, add below the existing imports:

```tsx
import { rateIteration as rateIterationApi } from "@/lib/labListingsApi";
```

Add this handler inside the `LabListingDetail` component, below `archive()`:

```tsx
async function rateOptimistic(iterId: string, patch: {
  rating?: number | null;
  reasons?: string[] | null;
  comment?: string | null;
  archived?: boolean;
}): Promise<void> {
  const prev = iterations;
  setIterations((cur) =>
    cur.map((i) =>
      i.id === iterId
        ? {
            ...i,
            rating: patch.rating !== undefined ? patch.rating : i.rating,
            rating_reasons: patch.reasons ?? i.rating_reasons,
            user_comment: patch.comment !== undefined ? patch.comment : i.user_comment,
            archived: patch.archived !== undefined ? patch.archived : i.archived,
          }
        : i,
    ),
  );
  try {
    const res = await rateIterationApi(id, iterId, patch);
    setIterations((cur) => cur.map((i) => (i.id === iterId ? res.iteration : i)));
  } catch (err) {
    setIterations(prev);
    setError(err instanceof Error ? err.message : String(err));
  }
}
```

- [ ] **Step 2: Pass `rateOptimistic` down to `SceneCard`**

Modify the `<SceneCard ... />` render (near line 202) — add the prop:

```tsx
<SceneCard
  listingId={id}
  scene={selectedScene}
  iterations={selectedIterations}
  photos={photos}
  defaultModel={listing.model_name}
  onReload={reload}
  onRateOptimistic={rateOptimistic}
/>
```

- [ ] **Step 3: Update `SceneCard` props to accept the new handler**

In `src/components/lab/SceneCard.tsx`, add the prop to the component's props interface:

```tsx
onRateOptimistic?: (iterId: string, patch: {
  rating?: number | null;
  reasons?: string[] | null;
  comment?: string | null;
  archived?: boolean;
}) => Promise<void>;
```

In the rate / archive call sites inside SceneCard (search for `rateIteration(` calls), replace them with `onRateOptimistic?.(` where one is provided, keeping the existing call as fallback. This is a minimal change: where `SceneCard` currently does `await rateIteration(...); onReload();`, replace with:

```tsx
if (onRateOptimistic) {
  await onRateOptimistic(iterId, { rating, reasons, comment });
} else {
  await rateIteration(listingId, iterId, { rating, reasons, comment });
  onReload();
}
```

- [ ] **Step 4: Type-check**

```
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors.

- [ ] **Step 5: Manual browser check**

```
npm run dev
```

Open any listing, rate an unrated iteration. Expected: star fills instantly (no round-trip wait). Confirm via Network tab that the POST returns and state is reconciled.

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboard/LabListingDetail.tsx src/components/lab/SceneCard.tsx
git commit -m "feat(lab): optimistic rate updates in LabListingDetail"
```

---

## Task A6: Optimistic scene archive

**Files:**
- Modify: `src/pages/dashboard/LabListingDetail.tsx`
- Modify: `src/components/lab/SceneCard.tsx`

- [ ] **Step 1: Add optimistic scene archive helper**

In `LabListingDetail.tsx`, below `rateOptimistic`:

```tsx
async function archiveSceneOptimistic(sceneId: string, archived: boolean): Promise<void> {
  const prev = scenes;
  setScenes((cur) => cur.map((s) => (s.id === sceneId ? { ...s, archived } : s)));
  try {
    const { setSceneArchived } = await import("@/lib/labListingsApi");
    await setSceneArchived(id, sceneId, archived);
  } catch (err) {
    setScenes(prev);
    setError(err instanceof Error ? err.message : String(err));
  }
}
```

(Static import is cleaner — move the import to the top of the file with the other `labListingsApi` imports if preferred. The inline import is shown above only because `setSceneArchived` isn't currently imported at file head.)

- [ ] **Step 2: Pass `archiveSceneOptimistic` to `SceneCard`**

Add prop:

```tsx
<SceneCard
  ...
  onArchiveSceneOptimistic={archiveSceneOptimistic}
/>
```

Update `SceneCard` props and its archive call site the same way as Task A5.

- [ ] **Step 3: Manual browser check**

```
npm run dev
```

Archive a scene from the SceneCard. Expected: scene disappears (or greys out if "Show archived" is on) instantly.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/LabListingDetail.tsx src/components/lab/SceneCard.tsx
git commit -m "feat(lab): optimistic scene archive"
```

---

## Task A7: Wire NextActionBanner into LabListingDetail

**Files:**
- Modify: `src/pages/dashboard/LabListingDetail.tsx`

- [ ] **Step 1: Add resolver + banner**

Add these imports at the top of `LabListingDetail.tsx`:

```tsx
import { NextActionBanner } from "@/components/lab/NextActionBanner";
import { resolveNextAction } from "@/lib/labNextAction";
```

Inside the component, compute the next action via `useMemo`:

```tsx
const nextAction = useMemo(() => resolveNextAction({ scenes, iterations }), [scenes, iterations]);
```

Add handlers that plug into the banner:

```tsx
function handleRateNext(sceneId: string) {
  setSelectedSceneId(sceneId);
  // Scroll SceneCard into view
  requestAnimationFrame(() => {
    document.querySelector(`[data-scene-id="${sceneId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

async function handleRenderBatch(sceneIds: string[]) {
  setActionLoading("next-action");
  try {
    await renderListing(id, { scene_ids: sceneIds });
    reload();
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    setActionLoading(null);
  }
}

function handleRetryFailed(sceneId: string) {
  setSelectedSceneId(sceneId);
  requestAnimationFrame(() => {
    document.querySelector(`[data-scene-id="${sceneId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function handleIterate(sceneId: string) {
  setSelectedSceneId(sceneId);
  requestAnimationFrame(() => {
    document.querySelector(`[data-scene-id="${sceneId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
```

Render the banner just above the `<ShotPlanTable ... />` (replacing nothing else):

```tsx
<NextActionBanner
  action={nextAction}
  busy={actionLoading === "next-action"}
  onRate={handleRateNext}
  onRenderBatch={handleRenderBatch}
  onRetry={handleRetryFailed}
  onIterate={handleIterate}
/>
```

- [ ] **Step 2: Add `data-scene-id` attribute to SceneCard root div**

In `src/components/lab/SceneCard.tsx`, add `data-scene-id={scene.id}` to the outermost `<div>` of the component (so scroll-to works).

- [ ] **Step 3: Type-check**

```
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Manual browser check**

```
npm run dev
```

Open a listing. Verify:
- Banner appears above ShotPlanTable with correct CTA text
- Clicking "Go" on a "render_batch" kicks off a render
- Clicking "Go" on "rate" scrolls to + selects that scene
- Banner updates correctly as you rate/render (watch live)

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/LabListingDetail.tsx src/components/lab/SceneCard.tsx
git commit -m "feat(lab): wire NextActionBanner into listing detail"
```

---

## Task A8: Unit tests for ShotPlanTable sort integration

**Files:**
- Test: `src/lib/labSceneStatus.test.ts` (add to existing)

- [ ] **Step 1: Add a sort-integration test**

Append to `src/lib/labSceneStatus.test.ts`:

```ts
describe("priority ordering for table rows", () => {
  const PRIORITY = {
    needs_rating: 0,
    failed: 1,
    iterating: 2,
    needs_first_render: 3,
    rendering: 4,
    done: 5,
    archived: 6,
  } as const;

  it("priorities are strictly increasing from needs_rating to archived", () => {
    const kinds: Array<keyof typeof PRIORITY> = [
      "needs_rating", "failed", "iterating", "needs_first_render", "rendering", "done", "archived",
    ];
    for (let i = 0; i < kinds.length - 1; i++) {
      expect(PRIORITY[kinds[i]]).toBeLessThan(PRIORITY[kinds[i + 1]]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```
npm test -- src/lib/labSceneStatus.test.ts
```

Expected: new test passes; 8 existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/labSceneStatus.test.ts
git commit -m "test(lab): verify priority ordering invariants"
```

---

## Task A9: End-to-end browser verification

- [ ] **Step 1: Run dev server**

```
npm run dev
```

- [ ] **Step 2: Verify golden path**

Navigate to `/dashboard/development/lab`. Open a listing with ≥ 5 scenes. Verify each in order:

1. **NextActionBanner** visible above ShotPlanTable, colored per state, correct CTA text.
2. **Priority sort**: scenes with unrated clips appear first, done scenes appear last.
3. **Status chips** match scene state in the table.
4. **Click "Go" on render_batch** kicks off a render (watch Network tab for POST `/listings/:id/render`).
5. **Click "Go" on rate** scrolls to and selects the target scene.
6. **Rate an iteration** — star fills instantly; banner updates without a full reload.
7. **Archive a scene** — scene disappears instantly (or greys if "Show archived" is on); banner recomputes.

- [ ] **Step 3: Verify no regressions**

Also exercise:
- Scene chat (streaming Haiku 4.5) still works
- Generate-all modal still works
- Compare modal still works for scenes with 2+ iterations
- Refine prompt still works

- [ ] **Step 4: If everything passes, tag the phase-A ship**

```bash
git tag phase-a-spine-ship
```

(Tag is local; do not push per project rule.)

---

# Part 2 — Phase M.1: Director-Prompt Trace Script

> This part runs in parallel with Part 1 as a subagent. It is read-only: no schema changes, no code changes to the running app. It produces one script + one audit report.

## Task M1: Script skeleton + CLI args

**Files:**
- Create: `scripts/trace-director-prompt.ts`

- [ ] **Step 1: Create the skeleton**

Create `scripts/trace-director-prompt.ts`:

```ts
#!/usr/bin/env -S npx tsx

/**
 * trace-director-prompt.ts
 *
 * Reconstructs the exact director user message for a listing or production
 * property by re-running the retrieval chain live. Writes a human-readable
 * transcript + audit checklist.
 *
 * Usage:
 *   npx tsx scripts/trace-director-prompt.ts --listing <listing_id>
 *   npx tsx scripts/trace-director-prompt.ts --property <property_id>
 *
 * Output: /tmp/director-trace-<id>.md
 */

import { getSupabase } from "../lib/client.js";

type Mode = { kind: "listing"; id: string } | { kind: "property"; id: string };

function parseArgs(): Mode {
  const args = process.argv.slice(2);
  const listingIdx = args.indexOf("--listing");
  const propertyIdx = args.indexOf("--property");
  if (listingIdx >= 0 && args[listingIdx + 1]) {
    return { kind: "listing", id: args[listingIdx + 1] };
  }
  if (propertyIdx >= 0 && args[propertyIdx + 1]) {
    return { kind: "property", id: args[propertyIdx + 1] };
  }
  console.error("Usage: npx tsx scripts/trace-director-prompt.ts (--listing <id> | --property <id>)");
  process.exit(2);
}

async function main() {
  const mode = parseArgs();
  console.log(`Tracing ${mode.kind} ${mode.id}...`);
  // Dispatch to listing or property tracer (implemented in later tasks)
  if (mode.kind === "listing") {
    const { traceListing } = await import("./trace-director-prompt.impl.js");
    await traceListing(mode.id);
  } else {
    const { traceProperty } = await import("./trace-director-prompt.impl.js");
    await traceProperty(mode.id);
  }
}

main().catch((err) => {
  console.error("Trace failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Create the impl stub**

Create `scripts/trace-director-prompt.impl.ts`:

```ts
export async function traceListing(listingId: string): Promise<void> {
  console.log(`[stub] traceListing(${listingId}) — implemented in Task M2`);
}

export async function traceProperty(propertyId: string): Promise<void> {
  console.log(`[stub] traceProperty(${propertyId}) — implemented in Task M3`);
}
```

- [ ] **Step 3: Verify script is runnable**

```
npx tsx scripts/trace-director-prompt.ts --listing abc123
```

Expected output:
```
Tracing listing abc123...
[stub] traceListing(abc123) — implemented in Task M2
```

- [ ] **Step 4: Commit**

```bash
git add scripts/trace-director-prompt.ts scripts/trace-director-prompt.impl.ts
git commit -m "chore(scripts): scaffold trace-director-prompt CLI"
```

---

## Task M2: Implement listing trace

**Files:**
- Modify: `scripts/trace-director-prompt.impl.ts`

- [ ] **Step 1: Implement `traceListing`**

Replace the contents of `scripts/trace-director-prompt.impl.ts`:

```ts
import { writeFile } from "node:fs/promises";
import { getSupabase } from "../lib/client.js";
import {
  retrieveMatchingRecipes,
  retrieveSimilarIterations,
  retrieveSimilarLosers,
  renderRecipeBlock,
  renderExemplarBlock,
  renderLoserBlock,
} from "../lib/prompt-lab.js";
import { DIRECTOR_SYSTEM, buildDirectorUserPrompt } from "../lib/prompts/director.js";
import { fromPgVector } from "../lib/embeddings.js";

interface TraceReport {
  kind: "listing" | "property";
  id: string;
  generatedAt: string;
  photosTotal: number;
  photosWithEmbedding: number;
  recipesCount: number;
  exemplarsCount: number;
  losersCount: number;
  pools: { labSessions: number; prodRatings: number; listingIterations: number };
  directorSystemLength: number;
  directorUserPromptLength: number;
  notes: string[];
  directorUserPrompt: string;
}

export async function traceListing(listingId: string): Promise<void> {
  const supabase = getSupabase();

  const { data: listing, error: listingErr } = await supabase
    .from("prompt_lab_listings")
    .select("*")
    .eq("id", listingId)
    .single();
  if (listingErr || !listing) throw new Error(`Listing ${listingId} not found: ${listingErr?.message}`);

  const { data: photos } = await supabase
    .from("prompt_lab_listing_photos")
    .select("*")
    .eq("listing_id", listingId)
    .order("photo_index", { ascending: true });
  const photosArr = photos ?? [];

  const { data: scenes } = await supabase
    .from("prompt_lab_listing_scenes")
    .select("*")
    .eq("listing_id", listingId)
    .order("scene_number", { ascending: true });

  // Pool counts
  const [{ count: labSessions }, { count: prodRatings }, { count: listingIterations }] = await Promise.all([
    supabase.from("prompt_lab_iterations").select("*", { count: "exact", head: true }),
    supabase.from("scene_ratings").select("*", { count: "exact", head: true }),
    supabase.from("prompt_lab_listing_scene_iterations").select("*", { count: "exact", head: true }),
  ]);

  // Run retrieval per photo and de-dupe across photos (mirrors directListingScenes)
  const allRecipes: Array<Awaited<ReturnType<typeof retrieveMatchingRecipes>>[number]> = [];
  const allExemplars: Array<Awaited<ReturnType<typeof retrieveSimilarIterations>>[number]> = [];
  const allLosers: Array<Awaited<ReturnType<typeof retrieveSimilarLosers>>[number]> = [];

  let photosWithEmbedding = 0;
  for (const p of photosArr) {
    if (!p.embedding) continue;
    photosWithEmbedding += 1;
    const vec = fromPgVector(p.embedding as unknown as string);
    try {
      const recipes = await retrieveMatchingRecipes({
        embedding: vec,
        roomType: (p.analysis_json as { room_type?: string } | null)?.room_type ?? "other",
        maxResults: 3,
      });
      allRecipes.push(...recipes);
    } catch { /* best-effort */ }
    try {
      const exemplars = await retrieveSimilarIterations({ embedding: vec, maxResults: 3 });
      allExemplars.push(...exemplars);
    } catch { /* best-effort */ }
    try {
      const losers = await retrieveSimilarLosers({ embedding: vec, maxResults: 3 });
      allLosers.push(...losers);
    } catch { /* best-effort */ }
  }

  const recipeBlock = allRecipes.length ? renderRecipeBlock(allRecipes) : "";
  const exemplarBlock = allExemplars.length ? renderExemplarBlock(allExemplars) : "";
  const loserBlock = allLosers.length ? renderLoserBlock(allLosers) : "";

  // Mirror buildDirectorUserPrompt with the analyses from photosArr
  const analyses = photosArr
    .map((p) => p.analysis_json)
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  const baseUserPrompt = buildDirectorUserPrompt({
    analyses,
    styleGuide: null,
    duration: null,
  } as Parameters<typeof buildDirectorUserPrompt>[0]);

  const directorUserPrompt = [baseUserPrompt, recipeBlock, exemplarBlock, loserBlock]
    .filter(Boolean)
    .join("\n\n");

  const notes: string[] = [];
  if (photosWithEmbedding === 0) notes.push("⚠️  No photos have embeddings — retrieval can't run. Check `embedding` column on `prompt_lab_listing_photos`.");
  if (photosWithEmbedding < photosArr.length) notes.push(`⚠️  Only ${photosWithEmbedding}/${photosArr.length} photos have embeddings.`);
  if (allRecipes.length === 0) notes.push("⚠️  No recipe matches — either no recipes exist or cosine distance exceeds threshold.");
  if (allExemplars.length === 0) notes.push("⚠️  No past-winner exemplars found — `match_rated_examples` returned empty. This likely means the learning loop hasn't produced enough 4★+ signal for this photo type.");
  if (allLosers.length === 0) notes.push("ℹ️  No loser exemplars found.");
  if (!scenes || scenes.length === 0) notes.push("ℹ️  Listing has no scenes yet (director hasn't run).");

  const report: TraceReport = {
    kind: "listing",
    id: listingId,
    generatedAt: new Date().toISOString(),
    photosTotal: photosArr.length,
    photosWithEmbedding,
    recipesCount: allRecipes.length,
    exemplarsCount: allExemplars.length,
    losersCount: allLosers.length,
    pools: { labSessions: labSessions ?? 0, prodRatings: prodRatings ?? 0, listingIterations: listingIterations ?? 0 },
    directorSystemLength: DIRECTOR_SYSTEM.length,
    directorUserPromptLength: directorUserPrompt.length,
    notes,
    directorUserPrompt,
  };

  await writeReport(report);
}

export async function traceProperty(propertyId: string): Promise<void> {
  // Implemented in Task M3
  throw new Error("traceProperty not yet implemented");
}

async function writeReport(r: TraceReport): Promise<void> {
  const md = [
    `# Director-Prompt Trace — ${r.kind} ${r.id}`,
    "",
    `Generated: ${r.generatedAt}`,
    "",
    "## Audit checklist",
    "",
    `- Photos total: **${r.photosTotal}**`,
    `- Photos with embedding: **${r.photosWithEmbedding}** ${r.photosWithEmbedding === r.photosTotal ? "✓" : "✗"}`,
    `- Recipe matches: **${r.recipesCount}**`,
    `- Past-winner exemplars: **${r.exemplarsCount}**`,
    `- Past-loser exemplars: **${r.losersCount}**`,
    `- Pool sizes: legacy Lab iters=${r.pools.labSessions}, prod scene_ratings=${r.pools.prodRatings}, listing iters=${r.pools.listingIterations}`,
    `- DIRECTOR_SYSTEM length: ${r.directorSystemLength} chars`,
    `- Director user prompt length: ${r.directorUserPromptLength} chars`,
    "",
    "## Notes",
    "",
    ...r.notes.map((n) => `- ${n}`),
    "",
    "## Full director user message",
    "",
    "```",
    r.directorUserPrompt,
    "```",
    "",
  ].join("\n");
  const { writeFile } = await import("node:fs/promises");
  const path = `/tmp/director-trace-${r.id}.md`;
  await writeFile(path, md, "utf8");
  console.log(`Wrote ${path}`);
  console.log("");
  console.log("Checklist summary:");
  console.log(`  Photos with embedding: ${r.photosWithEmbedding}/${r.photosTotal}`);
  console.log(`  Recipe matches: ${r.recipesCount}`);
  console.log(`  Exemplar matches: ${r.exemplarsCount}`);
  console.log(`  Loser matches: ${r.losersCount}`);
  for (const n of r.notes) console.log(`  ${n}`);
}
```

- [ ] **Step 2: Verify against a real listing**

Pick any listing_id from the dashboard. Run:

```
npx tsx scripts/trace-director-prompt.ts --listing <listing_id>
```

Expected: writes `/tmp/director-trace-<listing_id>.md`. Open the file and check that the checklist lines and the director user message are both populated (or that the notes explain *why* they're empty).

- [ ] **Step 3: Commit**

```bash
git add scripts/trace-director-prompt.impl.ts
git commit -m "feat(scripts): implement listing trace in trace-director-prompt"
```

---

## Task M3: Implement property trace

**Files:**
- Modify: `scripts/trace-director-prompt.impl.ts`

- [ ] **Step 1: Implement `traceProperty`**

Replace the stub `traceProperty` in `scripts/trace-director-prompt.impl.ts` with:

```ts
export async function traceProperty(propertyId: string): Promise<void> {
  const supabase = getSupabase();

  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .single();
  if (propErr || !property) throw new Error(`Property ${propertyId} not found: ${propErr?.message}`);

  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("property_id", propertyId)
    .order("order_index", { ascending: true });
  const photosArr = photos ?? [];

  const { data: scenes } = await supabase
    .from("scenes")
    .select("*")
    .eq("property_id", propertyId)
    .order("order_index", { ascending: true });

  const [{ count: labSessions }, { count: prodRatings }, { count: listingIterations }] = await Promise.all([
    supabase.from("prompt_lab_iterations").select("*", { count: "exact", head: true }),
    supabase.from("scene_ratings").select("*", { count: "exact", head: true }),
    supabase.from("prompt_lab_listing_scene_iterations").select("*", { count: "exact", head: true }),
  ]);

  // Production scenes carry their own embedding; retrieval runs per scene not per photo
  let scenesWithEmbedding = 0;
  const allRecipes: any[] = [];
  const allExemplars: any[] = [];
  const allLosers: any[] = [];

  for (const s of scenes ?? []) {
    if (!s.embedding) continue;
    scenesWithEmbedding += 1;
    const vec = fromPgVector(s.embedding as unknown as string);
    try {
      const recipes = await retrieveMatchingRecipes({ embedding: vec, roomType: s.room_type ?? "other", maxResults: 3 });
      allRecipes.push(...recipes);
    } catch { /* best-effort */ }
    try {
      const exemplars = await retrieveSimilarIterations({ embedding: vec, maxResults: 3 });
      allExemplars.push(...exemplars);
    } catch { /* best-effort */ }
    try {
      const losers = await retrieveSimilarLosers({ embedding: vec, maxResults: 3 });
      allLosers.push(...losers);
    } catch { /* best-effort */ }
  }

  const recipeBlock = allRecipes.length ? renderRecipeBlock(allRecipes) : "";
  const exemplarBlock = allExemplars.length ? renderExemplarBlock(allExemplars) : "";
  const loserBlock = allLosers.length ? renderLoserBlock(allLosers) : "";

  const analyses = photosArr
    .map((p) => p.analysis_json)
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  const baseUserPrompt = buildDirectorUserPrompt({
    analyses,
    styleGuide: null,
    duration: null,
  } as Parameters<typeof buildDirectorUserPrompt>[0]);

  const directorUserPrompt = [baseUserPrompt, recipeBlock, exemplarBlock, loserBlock]
    .filter(Boolean)
    .join("\n\n");

  const notes: string[] = [];
  if ((scenes?.length ?? 0) === 0) notes.push("ℹ️  Property has no scenes yet.");
  else if (scenesWithEmbedding === 0) notes.push("⚠️  No scenes have embeddings — `embedScene` may not have run. Check `scenes.embedding` column.");
  else if (scenesWithEmbedding < (scenes?.length ?? 0)) {
    notes.push(`⚠️  Only ${scenesWithEmbedding}/${scenes?.length ?? 0} scenes have embeddings.`);
  }
  if (allExemplars.length === 0) notes.push("⚠️  No past-winner exemplars for this property's scenes. Learning loop not contributing.");

  await writeReport({
    kind: "property",
    id: propertyId,
    generatedAt: new Date().toISOString(),
    photosTotal: photosArr.length,
    photosWithEmbedding: scenesWithEmbedding, // repurposed: report scenes-with-embedding count
    recipesCount: allRecipes.length,
    exemplarsCount: allExemplars.length,
    losersCount: allLosers.length,
    pools: { labSessions: labSessions ?? 0, prodRatings: prodRatings ?? 0, listingIterations: listingIterations ?? 0 },
    directorSystemLength: DIRECTOR_SYSTEM.length,
    directorUserPromptLength: directorUserPrompt.length,
    notes,
    directorUserPrompt,
  });
}
```

- [ ] **Step 2: Verify against a real property**

Pick a property_id that ran through the pipeline after 2026-04-19:

```
npx tsx scripts/trace-director-prompt.ts --property <property_id>
```

Expected: writes `/tmp/director-trace-<property_id>.md` with populated checklist.

- [ ] **Step 3: Commit**

```bash
git add scripts/trace-director-prompt.impl.ts
git commit -m "feat(scripts): implement property trace in trace-director-prompt"
```

---

## Task M4: Run on three targets + capture raw transcripts

- [ ] **Step 1: Identify three test targets**

Run these queries in Supabase SQL editor (or via `psql`) to pick:

```sql
-- Most-rated Phase 2.8 listing
SELECT pll.id, pll.name, COUNT(i.*) AS iter_count
FROM prompt_lab_listings pll
JOIN prompt_lab_listing_scenes s ON s.listing_id = pll.id
JOIN prompt_lab_listing_scene_iterations i ON i.scene_id = s.id
GROUP BY pll.id ORDER BY iter_count DESC LIMIT 3;

-- Legacy single-photo Lab session with most iterations
SELECT s.id, s.label, COUNT(i.*) AS iter_count
FROM prompt_lab_sessions s
JOIN prompt_lab_iterations i ON i.session_id = s.id
WHERE s.archived = false
GROUP BY s.id ORDER BY iter_count DESC LIMIT 3;

-- Recent production property that completed
SELECT id, address, created_at FROM properties
WHERE status = 'complete' AND created_at > '2026-04-19'
ORDER BY created_at DESC LIMIT 3;
```

Pick one ID from each category.

- [ ] **Step 2: Run the trace on each**

```
npx tsx scripts/trace-director-prompt.ts --listing <phase_28_listing_id> > /tmp/trace-listing.log 2>&1
npx tsx scripts/trace-director-prompt.ts --property <prod_property_id> > /tmp/trace-property.log 2>&1
```

Note: legacy single-photo Lab sessions aren't multi-photo listings. Skip the legacy Lab session trace for now — the listing trace and property trace cover both pool directions. (Add a `--session` mode in Task M.2 if the audit demands it.)

- [ ] **Step 3: Inspect the output files**

Open `/tmp/director-trace-<listing_id>.md` and `/tmp/director-trace-<property_id>.md` in an editor. For each, write down:
- Did the "Past-winner exemplars" count = 0? If so, the learning loop is NOT contributing.
- Did photos/scenes have embeddings? If not, the embedding step is broken.
- Is the director user prompt length reasonable (>500 chars)?

- [ ] **Step 4: Commit the raw traces**

```bash
mkdir -p docs/traces
cp /tmp/director-trace-*.md docs/traces/
git add docs/traces/
git commit -m "chore(audit): capture director-prompt traces for Phase M.1 audit"
```

---

## Task M5: Write the audit report + verdict

**Files:**
- Create: `docs/ML-AUDIT-2026-04-20.md`

- [ ] **Step 1: Write the audit**

Based on the trace outputs from Task M4, write `docs/ML-AUDIT-2026-04-20.md` with this structure:

```markdown
# ML Pipeline Audit — 2026-04-20

## Scope
Phase M.1 of the back-on-track plan. Question: does the rating → embedding → retrieval → director-injection chain work end-to-end?

## Method
Traced three inputs via `scripts/trace-director-prompt.ts`:
1. Most-rated Phase 2.8 listing — id `<xxx>`
2. Recent production property — id `<xxx>`

Raw transcripts preserved in `docs/traces/`.

## Findings

### Embedding coverage
- Phase 2.8 listing photos with embedding: <N>/<M>
- Production scenes with embedding: <N>/<M>
- Verdict: <OK | BROKEN | PARTIAL>

### Retrieval
- Recipe matches on listing trace: <count>
- Exemplar matches on listing trace: <count>
- Loser matches on listing trace: <count>
- Exemplar matches on property trace: <count>
- Verdict: <OK | BROKEN | UNDERPOPULATED>

### Injection into director user prompt
- Director user prompt length with retrieval: <N> chars
- Retrieval blocks present in prompt: <list>
- Verdict: <OK | BROKEN>

### Pool sizes
- Legacy Lab iterations: <N>
- Production scene_ratings: <N>
- Listing iterations: <N>

### Lab→prod promotion
- Any `lab_prompt_overrides` row with `promoted_at IS NOT NULL`? <yes/no>
- Production `prompt_revisions` with `source = 'lab_override'`? <yes/no>
- Verdict on `resolveProductionPrompt`: <live | never-used | falling-through>

## Overall verdict

**Chain is:** <WORKING | PARTIALLY BROKEN | BROKEN>

**Root causes found (if any):**
- <item>

## Recommended Phase M.2 actions

<Ordered list. If the chain works: proceed to M.2a capture-surface consolidation + M.2b retrieval pruning per the spec. If broken: fix the chain first as highest priority.>
```

- [ ] **Step 2: Commit**

```bash
git add docs/ML-AUDIT-2026-04-20.md
git commit -m "docs(audit): write Phase M.1 verdict + recommended M.2 actions"
```

---

## Task M6: Update PROJECT-STATE + memory files with verdict

**Files:**
- Modify: `docs/PROJECT-STATE.md`
- Modify: `/Users/oliverhelgemo/.claude/projects/-Users-oliverhelgemo/memory/project_back_on_track_plan.md`

- [ ] **Step 1: Append verdict to PROJECT-STATE.md**

Find the section "Immediate next actions" (near the bottom) and insert a new entry at the top:

```markdown
0. **Phase M.1 audit complete 2026-04-20** — verdict: <WORKING / BROKEN>. Full report at `docs/ML-AUDIT-2026-04-20.md`. Raw traces in `docs/traces/`.
```

- [ ] **Step 2: Update memory**

Append to `project_back_on_track_plan.md`:

```markdown
## Phase M.1 verdict (2026-04-20)

<WORKING | PARTIALLY BROKEN | BROKEN>. See `docs/ML-AUDIT-2026-04-20.md`. Next: <M.2 per spec | fix chain first>.
```

- [ ] **Step 3: Commit**

```bash
git add docs/PROJECT-STATE.md
git commit -m "docs: record Phase M.1 audit verdict in PROJECT-STATE"
```

---

## Self-review performed

- **Spec coverage:** Phase A §"Scope" (banner + chips + optimistic updates + no schema changes + existing functionality preserved) is covered by Tasks A1–A9. Phase M.1 §"Trace" (CLI on listing + property, retrieval reconstruction, checklist, three targets, verdict) is covered by Tasks M1–M6.
- **Placeholder scan:** No TBD / TODO placeholders. Every code step shows full code.
- **Type consistency:** `SceneStatusKind`, `NextAction`, `resolveSceneStatus`, `resolveNextAction`, `NextActionBanner` props are defined once and reused consistently across tasks.
- **Parallelism:** Part 2 is clearly marked as runnable in parallel with Part 1. No shared files. No dependency from Part 1 on Part 2 (or vice versa) within this plan.

---

## Execution notes

- No git push. No deploy. Commits stay local.
- If file-revert mystery hits, flag immediately — do not retry the edit in a loop.
- Phase A is frontend-only. Phase M.1 is read-only (one new script + one audit doc). Neither phase changes the database.
- Next plan will cover Phase M.2 (consolidate) once M.1 verdict is in.
