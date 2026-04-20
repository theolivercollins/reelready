# Phase 2 — Knowledge Map + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a visual 14×12 knowledge map at `/dashboard/development/knowledge-map` that colors every (room_type × camera_movement) cell by its learning state (untested / weak / okay / strong / golden), lets Oliver click any cell to see its rated iterations, active recipe/override, fail-tag histogram, and spend, plus a calibration panel that reuses Phase 1's judge status endpoint and a cost meter that rolls up `cost_events`. Seeding is extended so Lab sessions can be tagged with a cell_key.

**Architecture:** A new Postgres view `v_knowledge_map_cells` enumerates all 168 cells (14 room types × 12 active camera verbs) via `CROSS JOIN`, left-joins rated iterations pooled from Lab + prod (already denormalized on `scene_ratings`), rolls up counts + averages + fail-tag histograms, and exposes a derived `state` column. Three read-only admin endpoints serve the grid, per-cell drill-down, and cost rollup. Two React pages render the grid heatmap and cell drill-down. Seed upload gets an optional `cell_key` field on `prompt_lab_sessions` so curated references land in the right cell without waiting for a real user upload.

**Tech Stack:** TypeScript (ESM), Vercel Serverless Functions (Node 20), Supabase Postgres + pgvector, React 18 + Vite + Tailwind + shadcn/ui, Vitest (already wired in Phase 1).

**Scope boundaries (do NOT build in this plan):**

- No UMAP 2D projection (Phase 2.5)
- No embedding-cluster overlay inside cells (Phase 2.5)
- No "Fill Now" button — the autonomous iterator is Phase 3
- No Prompt Lab IA refresh (Phase 4)
- No UI for deprecated camera verbs (`orbital_slow`, `slow_pan`, `tilt_up`, `crane_up`, `tilt_down`, `crane_down`). Historical data in those verbs stays queryable but does not appear as cells on the grid.
- No mobile responsiveness

---

## File Structure

### New files

- `supabase/migrations/019_knowledge_map.sql` — cell vocab tables, `v_knowledge_map_cells` view, `prompt_lab_sessions.cell_key` column, indexes
- `lib/knowledge-map/types.ts` — `CellState`, `CellSummary`, `CellDrillDown`, `FailTagCount`
- `lib/knowledge-map/state.ts` — pure state-classifier function
- `lib/knowledge-map/cells.ts` — list + drill-down data loaders
- `lib/knowledge-map/cost.ts` — cost rollup loader
- `lib/knowledge-map/__tests__/state.test.ts` — unit tests for state classifier
- `api/admin/knowledge-map/cells.ts` — `GET` list endpoint
- `api/admin/knowledge-map/cell/[cellKey].ts` — `GET` drill-down endpoint
- `api/admin/knowledge-map/cost.ts` — `GET` cost rollup endpoint
- `src/lib/knowledgeMapApi.ts` — frontend API client
- `src/pages/dashboard/KnowledgeMap.tsx` — grid + calibration panel + cost meter
- `src/pages/dashboard/KnowledgeMapCell.tsx` — drill-down page

### Modified files

- `api/admin/prompt-lab/sessions.ts` — accept optional `cell_key` on session creation
- `src/App.tsx` — two new routes + imports
- `src/pages/dashboard/Development.tsx` — new "Knowledge Map" quick-link card

### Import convention

All relative imports use `.js` extensions (ESM), matching the existing repo. Example: `import { getSupabase } from "../client.js";`

---

## Task 1: Migration 019 — cell vocab, view, cell_key column

**Files:**
- Create: `supabase/migrations/019_knowledge_map.sql`

- [ ] **Step 1: Confirm next migration number**

Run:
```bash
ls supabase/migrations/ | sort | tail -3
```
Expected: highest is `018_judge_tables.sql`. Next is `019_`.

- [ ] **Step 2: Write migration**

Create `supabase/migrations/019_knowledge_map.sql`:

```sql
-- Migration 019: Knowledge Map — per-cell learning-state aggregation over
-- pooled Lab iterations + production scene_ratings. Cells enumerated via
-- CROSS JOIN of the two active taxonomies so untested cells exist as rows
-- with sample_size=0.

BEGIN;

-- Active taxonomies. Rows here are what shows up on the grid; deprecated
-- verbs (orbital_slow, tilt_up, etc.) stay in historical data but don't
-- appear as cells.
CREATE TABLE IF NOT EXISTS knowledge_map_room_types (
  room_type TEXT PRIMARY KEY
);
INSERT INTO knowledge_map_room_types (room_type) VALUES
  ('kitchen'), ('living_room'), ('master_bedroom'), ('bedroom'), ('bathroom'),
  ('exterior_front'), ('exterior_back'), ('pool'), ('aerial'), ('dining'),
  ('hallway'), ('garage'), ('foyer'), ('other')
ON CONFLICT (room_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS knowledge_map_camera_verbs (
  camera_movement TEXT PRIMARY KEY
);
INSERT INTO knowledge_map_camera_verbs (camera_movement) VALUES
  ('push_in'), ('pull_out'), ('orbit'), ('parallax'),
  ('dolly_left_to_right'), ('dolly_right_to_left'), ('reveal'),
  ('drone_push_in'), ('drone_pull_back'), ('top_down'),
  ('low_angle_glide'), ('feature_closeup')
ON CONFLICT (camera_movement) DO NOTHING;

-- Optional cell tagging on Lab sessions, so curated seed images land in
-- the intended cell without waiting for the usual room_type/verb
-- inference. NULL = not explicitly tagged.
ALTER TABLE prompt_lab_sessions
  ADD COLUMN IF NOT EXISTS cell_key TEXT;

CREATE INDEX IF NOT EXISTS idx_prompt_lab_sessions_cell_key
  ON prompt_lab_sessions (cell_key)
  WHERE cell_key IS NOT NULL;

-- Pool of rated rows across Lab + prod, one row per rated iteration or
-- rated scene. Columns normalized so the view can aggregate uniformly.
CREATE OR REPLACE VIEW v_rated_pool AS
SELECT
  'lab'::TEXT                                AS source,
  i.id                                       AS id,
  (i.analysis_json ->> 'room_type')          AS room_type,
  (i.director_output_json ->> 'camera_movement') AS camera_movement,
  i.rating                                   AS rating,
  i.tags                                     AS tags,
  i.created_at                               AS rated_at
FROM prompt_lab_iterations i
WHERE i.rating IS NOT NULL
UNION ALL
SELECT
  'prod'::TEXT                               AS source,
  sr.id                                      AS id,
  sr.rated_room_type                         AS room_type,
  sr.rated_camera_movement                   AS camera_movement,
  sr.rating                                  AS rating,
  sr.tags                                    AS tags,
  sr.rated_snapshot_at                       AS rated_at
FROM scene_ratings sr
WHERE sr.rating IS NOT NULL
  AND sr.rated_room_type IS NOT NULL
  AND sr.rated_camera_movement IS NOT NULL;

-- Main view. 168 rows (14 x 12) even when no data exists yet.
CREATE OR REPLACE VIEW v_knowledge_map_cells AS
WITH cells AS (
  SELECT r.room_type, v.camera_movement,
         r.room_type || '-' || v.camera_movement AS cell_key
  FROM knowledge_map_room_types r
  CROSS JOIN knowledge_map_camera_verbs v
),
pool AS (
  SELECT * FROM v_rated_pool
),
agg AS (
  SELECT
    p.room_type, p.camera_movement,
    COUNT(*)                                             AS sample_size,
    AVG(p.rating)::NUMERIC(3,2)                          AS avg_rating,
    COUNT(*) FILTER (WHERE p.rating = 5)                 AS five_star_count,
    COUNT(*) FILTER (WHERE p.rating <= 2)                AS loser_count,
    MAX(p.rated_at)                                      AS last_rated_at
  FROM pool p
  GROUP BY p.room_type, p.camera_movement
),
fail_tag_hist AS (
  -- Aggregate fail:* tag frequencies per cell.
  SELECT p.room_type, p.camera_movement,
         jsonb_object_agg(tag, cnt) AS fail_tags
  FROM (
    SELECT p.room_type, p.camera_movement, t AS tag, COUNT(*) AS cnt
    FROM pool p, LATERAL unnest(p.tags) t
    WHERE t LIKE 'fail:%'
    GROUP BY p.room_type, p.camera_movement, t
  ) p
  GROUP BY p.room_type, p.camera_movement
),
recipe_counts AS (
  SELECT room_type, camera_movement, COUNT(*) AS active_recipe_count
  FROM prompt_lab_recipes
  WHERE status = 'active'
  GROUP BY room_type, camera_movement
)
SELECT
  c.cell_key,
  c.room_type,
  c.camera_movement,
  COALESCE(a.sample_size, 0)                              AS sample_size,
  a.avg_rating,
  COALESCE(a.five_star_count, 0)                          AS five_star_count,
  COALESCE(a.loser_count, 0)                              AS loser_count,
  a.last_rated_at,
  COALESCE(f.fail_tags, '{}'::JSONB)                      AS fail_tags,
  COALESCE(rc.active_recipe_count, 0)                     AS active_recipe_count,
  -- Derived state. Order of checks matters:
  --   untested   -> zero samples
  --   golden     -> >=2 5-star ratings
  --   weak       -> avg <=2 OR loser_count >= 0.5*sample_size
  --   strong     -> avg >= 4.0
  --   okay       -> everything in between
  CASE
    WHEN COALESCE(a.sample_size, 0) = 0                                        THEN 'untested'
    WHEN COALESCE(a.five_star_count, 0) >= 2                                   THEN 'golden'
    WHEN a.avg_rating <= 2.0
      OR a.loser_count::NUMERIC / GREATEST(a.sample_size, 1) >= 0.5           THEN 'weak'
    WHEN a.avg_rating >= 4.0                                                   THEN 'strong'
    ELSE 'okay'
  END                                                     AS state
FROM cells c
LEFT JOIN agg a         ON a.room_type = c.room_type AND a.camera_movement = c.camera_movement
LEFT JOIN fail_tag_hist f ON f.room_type = c.room_type AND f.camera_movement = c.camera_movement
LEFT JOIN recipe_counts rc ON rc.room_type = c.room_type AND rc.camera_movement = c.camera_movement;

COMMIT;
```

- [ ] **Step 3: Apply migration**

The controller applies via Supabase MCP `apply_migration`. Implementer: do NOT run `supabase db push`. Commit the file only.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/019_knowledge_map.sql
git commit -m "feat(db): knowledge map view + cell vocab + session cell_key

Cross-joins the 14 active room types with the 12 active camera verbs
to guarantee every cell (168 total) appears on the grid, even when
empty. Pools Lab iterations + denormalized prod scene_ratings into
v_rated_pool, aggregates counts + avg + loser count + fail:* tag
histogram, and derives a state column (untested/weak/okay/strong/
golden) in SQL so callers read a single pre-classified row per cell.
Adds optional cell_key on prompt_lab_sessions for curated seed
uploads."
```

---

## Task 2: Shared knowledge-map types

**Files:**
- Create: `lib/knowledge-map/types.ts`

- [ ] **Step 1: Write types**

Create `lib/knowledge-map/types.ts`:

```ts
// Derived in SQL (see migration 019 v_knowledge_map_cells.state).
export type CellState = "untested" | "weak" | "okay" | "strong" | "golden";

export interface FailTagCount {
  tag: string;   // e.g. "fail:ghost-walls"
  count: number;
}

export interface CellSummary {
  cell_key: string;            // e.g. "kitchen-push_in"
  room_type: string;
  camera_movement: string;
  sample_size: number;
  avg_rating: number | null;   // null when sample_size = 0
  five_star_count: number;
  loser_count: number;
  last_rated_at: string | null;
  fail_tags: FailTagCount[];   // sorted desc by count, top 10
  active_recipe_count: number;
  state: CellState;
}

export interface CellDrillDownIteration {
  id: string;
  source: "lab" | "prod";
  iteration_number: number | null;
  rating: number | null;
  tags: string[];
  provider: string | null;
  clip_url: string | null;
  source_image_url: string | null;
  created_at: string;
  judge_composite: number | null;
}

export interface CellDrillDownRecipe {
  id: string;
  archetype: string;
  rating_at_promotion: number;
  times_applied: number;
  prompt_template: string;
  promoted_at: string;
}

export interface CellDrillDownOverride {
  id: string;
  prompt_name: string;
  body_hash: string;
  is_active: boolean;
  created_at: string;
}

export interface CellDrillDown extends CellSummary {
  iterations: CellDrillDownIteration[];  // up to 50, sorted desc by created_at
  recipes: CellDrillDownRecipe[];
  overrides: CellDrillDownOverride[];
  total_cost_cents: number;              // judge + generation cost scoped to this cell
}

export interface CostRollupRow {
  provider: string;
  stage: string;
  units_consumed: number | null;
  cost_cents: number;
  event_count: number;
}

export interface CostRollup {
  total_cents: number;
  by_provider_and_stage: CostRollupRow[];
  judge_total_cents: number;  // from lab_judge_scores.cost_cents sum
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/knowledge-map/types.ts
git commit -m "feat(knowledge-map): shared types for cells + drill-down + cost"
```

---

## Task 3: State classifier (pure function, TDD)

The view already computes `state` in SQL, but a pure TS classifier is useful for test data, for the frontend to recompute on hypothetical numbers (e.g., "what state will I reach after N more 5★s?"), and as a place the classification rules live in one tested place.

**Files:**
- Create: `lib/knowledge-map/state.ts`
- Test: `lib/knowledge-map/__tests__/state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/knowledge-map/__tests__/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyCellState } from "../state.js";

describe("classifyCellState", () => {
  it("returns 'untested' when sample_size = 0", () => {
    expect(classifyCellState({ sample_size: 0, avg_rating: null, five_star_count: 0, loser_count: 0 })).toBe("untested");
  });

  it("returns 'golden' when five_star_count >= 2 regardless of other stats", () => {
    expect(classifyCellState({ sample_size: 10, avg_rating: 3.5, five_star_count: 2, loser_count: 0 })).toBe("golden");
    expect(classifyCellState({ sample_size: 3, avg_rating: 3.0, five_star_count: 3, loser_count: 0 })).toBe("golden");
  });

  it("returns 'weak' when avg_rating <= 2.0", () => {
    expect(classifyCellState({ sample_size: 5, avg_rating: 1.8, five_star_count: 0, loser_count: 3 })).toBe("weak");
  });

  it("returns 'weak' when losers are at least half the samples", () => {
    expect(classifyCellState({ sample_size: 10, avg_rating: 3.0, five_star_count: 0, loser_count: 5 })).toBe("weak");
  });

  it("returns 'strong' when avg_rating >= 4.0 with only one 5-star", () => {
    expect(classifyCellState({ sample_size: 5, avg_rating: 4.2, five_star_count: 1, loser_count: 0 })).toBe("strong");
  });

  it("returns 'okay' for middling averages", () => {
    expect(classifyCellState({ sample_size: 5, avg_rating: 3.2, five_star_count: 0, loser_count: 0 })).toBe("okay");
  });

  it("treats null avg_rating as okay when sample exists but rating is NaN — defensive", () => {
    // Shouldn't happen in practice (any sample has a rating), but sanity.
    expect(classifyCellState({ sample_size: 1, avg_rating: null, five_star_count: 0, loser_count: 0 })).toBe("okay");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/knowledge-map/__tests__/state.test.ts`
Expected: FAIL with "Cannot find module '../state.js'".

- [ ] **Step 3: Implement `lib/knowledge-map/state.ts`**

Create `lib/knowledge-map/state.ts`:

```ts
import type { CellState } from "./types.js";

export interface CellStateInputs {
  sample_size: number;
  avg_rating: number | null;
  five_star_count: number;
  loser_count: number;
}

// Mirror of the CASE expression in v_knowledge_map_cells (migration 019).
// Having the same logic in TS + SQL lets the frontend preview state for
// hypothetical numbers without a round-trip.
export function classifyCellState(x: CellStateInputs): CellState {
  if (x.sample_size <= 0) return "untested";
  if (x.five_star_count >= 2) return "golden";
  if (x.avg_rating !== null && x.avg_rating <= 2.0) return "weak";
  if (x.sample_size > 0 && x.loser_count / x.sample_size >= 0.5) return "weak";
  if (x.avg_rating !== null && x.avg_rating >= 4.0) return "strong";
  return "okay";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/knowledge-map/__tests__/state.test.ts`
Expected: PASS, 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/knowledge-map/state.ts lib/knowledge-map/__tests__/state.test.ts
git commit -m "feat(knowledge-map): pure state classifier matching the SQL view

Same logic as v_knowledge_map_cells.state, re-exported in TS so the
frontend can recompute state for hypothetical inputs without a DB
round-trip. 7 unit tests covering every branch including the
defensive null avg_rating path."
```

---

## Task 4: Cells list loader + API

**Files:**
- Create: `lib/knowledge-map/cells.ts`
- Create: `api/admin/knowledge-map/cells.ts`

- [ ] **Step 1: Write `lib/knowledge-map/cells.ts`**

Create `lib/knowledge-map/cells.ts`:

```ts
import { getSupabase } from "../client.js";
import type { CellSummary, FailTagCount } from "./types.js";

// Returns all 168 cells from v_knowledge_map_cells. Fail-tag histogram
// is flattened from JSONB into a sorted array (top 10 by count).
export async function listCells(): Promise<CellSummary[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("v_knowledge_map_cells")
    .select("*")
    .order("room_type")
    .order("camera_movement");
  if (error) throw new Error(`list cells failed: ${error.message}`);
  return (data ?? []).map(rowToSummary);
}

function rowToSummary(r: Record<string, unknown>): CellSummary {
  const rawTags = (r.fail_tags ?? {}) as Record<string, number>;
  const fail_tags: FailTagCount[] = Object.entries(rawTags)
    .map(([tag, count]) => ({ tag, count: Number(count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return {
    cell_key: String(r.cell_key),
    room_type: String(r.room_type),
    camera_movement: String(r.camera_movement),
    sample_size: Number(r.sample_size ?? 0),
    avg_rating: r.avg_rating === null || r.avg_rating === undefined ? null : Number(r.avg_rating),
    five_star_count: Number(r.five_star_count ?? 0),
    loser_count: Number(r.loser_count ?? 0),
    last_rated_at: r.last_rated_at === null || r.last_rated_at === undefined ? null : String(r.last_rated_at),
    fail_tags,
    active_recipe_count: Number(r.active_recipe_count ?? 0),
    state: String(r.state) as CellSummary["state"],
  };
}
```

- [ ] **Step 2: Write `api/admin/knowledge-map/cells.ts`**

Create `api/admin/knowledge-map/cells.ts`:

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { listCells } from "../../../lib/knowledge-map/cells.js";

// GET /api/admin/knowledge-map/cells
// Returns all 168 cells with state + sample summary.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  try {
    const cells = await listCells();
    const byState = cells.reduce<Record<string, number>>((acc, c) => {
      acc[c.state] = (acc[c.state] ?? 0) + 1;
      return acc;
    }, {});
    return res.status(200).json({
      cells,
      summary: {
        total_cells: cells.length,
        by_state: byState,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "knowledge-map" | head`
Expected: no errors from the new files.

- [ ] **Step 4: Commit**

```bash
git add lib/knowledge-map/cells.ts api/admin/knowledge-map/cells.ts
git commit -m "feat(knowledge-map): cells list loader + GET /cells endpoint

Loader reads v_knowledge_map_cells, maps JSONB fail_tags into a
sorted top-10 array, and the endpoint wraps it with a by-state
summary count so the grid header can render totals without a
second pass over the cells array."
```

---

## Task 5: Cell drill-down loader + API

**Files:**
- Create: `api/admin/knowledge-map/cell/[cellKey].ts`

The drill-down combines the cell summary (one row from the view), the recent rated iterations in that cell (up to 50, pooled Lab + prod), active recipes/overrides, and a cost total.

- [ ] **Step 1: Extend `lib/knowledge-map/cells.ts` with drill-down loader**

Open `lib/knowledge-map/cells.ts` and append:

```ts
import type {
  CellDrillDown,
  CellDrillDownIteration,
  CellDrillDownRecipe,
  CellDrillDownOverride,
} from "./types.js";

export async function getCellDrillDown(cellKey: string): Promise<CellDrillDown | null> {
  const supabase = getSupabase();
  const [roomType, cameraMovement] = cellKey.split("-", 2);
  if (!roomType || !cameraMovement) throw new Error(`Invalid cell_key: ${cellKey}`);

  // 1. Base summary row.
  const { data: summaryRow, error: summaryErr } = await supabase
    .from("v_knowledge_map_cells")
    .select("*")
    .eq("cell_key", cellKey)
    .maybeSingle();
  if (summaryErr) throw new Error(`fetch cell summary failed: ${summaryErr.message}`);
  if (!summaryRow) return null;
  const summary = rowToSummary(summaryRow);

  // 2. Iterations — pooled Lab + prod, newest first, up to 50. Fetch
  //    separately because v_rated_pool doesn't expose the clip/source
  //    image urls we need for the drill-down gallery.
  const { data: labRows, error: labErr } = await supabase
    .from("prompt_lab_iterations")
    .select(`
      id, iteration_number, rating, tags, provider, clip_url, created_at,
      analysis_json, director_output_json,
      prompt_lab_sessions(image_url)
    `)
    .not("rating", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (labErr) throw new Error(`fetch lab iterations failed: ${labErr.message}`);

  const labFiltered = (labRows ?? []).filter((r) => {
    const a = (r as { analysis_json?: { room_type?: string } }).analysis_json ?? {};
    const d = (r as { director_output_json?: { camera_movement?: string } }).director_output_json ?? {};
    return a.room_type === roomType && d.camera_movement === cameraMovement;
  });

  const { data: prodRows, error: prodErr } = await supabase
    .from("scene_ratings")
    .select("id, rating, tags, rated_provider, rated_clip_url, rated_snapshot_at")
    .eq("rated_room_type", roomType)
    .eq("rated_camera_movement", cameraMovement)
    .not("rating", "is", null)
    .order("rated_snapshot_at", { ascending: false })
    .limit(50);
  if (prodErr) throw new Error(`fetch prod ratings failed: ${prodErr.message}`);

  type LabRow = {
    id: string; iteration_number: number | null; rating: number; tags: string[] | null;
    provider: string | null; clip_url: string | null; created_at: string;
    prompt_lab_sessions: { image_url: string | null } | { image_url: string | null }[] | null;
  };
  type ProdRow = {
    id: string; rating: number; tags: string[] | null;
    rated_provider: string | null; rated_clip_url: string | null; rated_snapshot_at: string;
  };

  const labIters: CellDrillDownIteration[] = labFiltered.slice(0, 50).map((raw) => {
    const r = raw as unknown as LabRow;
    const session = Array.isArray(r.prompt_lab_sessions) ? r.prompt_lab_sessions[0] : r.prompt_lab_sessions;
    return {
      id: r.id,
      source: "lab",
      iteration_number: r.iteration_number,
      rating: r.rating,
      tags: r.tags ?? [],
      provider: r.provider,
      clip_url: r.clip_url,
      source_image_url: session?.image_url ?? null,
      created_at: r.created_at,
      judge_composite: null,
    };
  });

  const prodIters: CellDrillDownIteration[] = (prodRows ?? []).map((raw) => {
    const r = raw as ProdRow;
    return {
      id: r.id,
      source: "prod",
      iteration_number: null,
      rating: r.rating,
      tags: r.tags ?? [],
      provider: r.rated_provider,
      clip_url: r.rated_clip_url,
      source_image_url: null,
      created_at: r.rated_snapshot_at,
      judge_composite: null,
    };
  });

  // 3. Judge scores for Lab iterations (prod scenes aren't judge-scored yet).
  const labIds = labIters.map((i) => i.id);
  if (labIds.length > 0) {
    const { data: scoreRows } = await supabase
      .from("lab_judge_scores")
      .select("iteration_id, composite_1to5")
      .in("iteration_id", labIds);
    const scoreMap = new Map<string, number>();
    for (const s of scoreRows ?? []) {
      const r = s as { iteration_id: string; composite_1to5: number };
      scoreMap.set(r.iteration_id, Number(r.composite_1to5));
    }
    for (const i of labIters) {
      const v = scoreMap.get(i.id);
      if (v !== undefined) i.judge_composite = v;
    }
  }

  // 4. Active recipes in this cell.
  const { data: recipeRows, error: recipeErr } = await supabase
    .from("prompt_lab_recipes")
    .select("id, archetype, rating_at_promotion, times_applied, prompt_template, promoted_at")
    .eq("room_type", roomType)
    .eq("camera_movement", cameraMovement)
    .eq("status", "active")
    .order("promoted_at", { ascending: false });
  if (recipeErr) throw new Error(`fetch recipes failed: ${recipeErr.message}`);
  const recipes: CellDrillDownRecipe[] = (recipeRows ?? []).map((raw) => {
    const r = raw as {
      id: string; archetype: string; rating_at_promotion: number;
      times_applied: number; prompt_template: string; promoted_at: string;
    };
    return {
      id: r.id,
      archetype: r.archetype,
      rating_at_promotion: r.rating_at_promotion,
      times_applied: r.times_applied,
      prompt_template: r.prompt_template,
      promoted_at: r.promoted_at,
    };
  });

  // 5. Active overrides (Lab-scoped). The scope-to-cell is implicit via
  //    the override's prompt_name, which the rule miner uses conventions
  //    like director:kitchen:push_in. For MVP we return all active
  //    overrides and let the UI filter by prompt_name substring.
  const { data: overrideRows, error: overrideErr } = await supabase
    .from("lab_prompt_overrides")
    .select("id, prompt_name, body_hash, is_active, created_at")
    .eq("is_active", true);
  if (overrideErr) throw new Error(`fetch overrides failed: ${overrideErr.message}`);
  const overrides: CellDrillDownOverride[] = (overrideRows ?? [])
    .map((raw) => {
      const r = raw as { id: string; prompt_name: string; body_hash: string; is_active: boolean; created_at: string };
      return {
        id: r.id,
        prompt_name: r.prompt_name,
        body_hash: r.body_hash,
        is_active: r.is_active,
        created_at: r.created_at,
      };
    })
    .filter((o) => o.prompt_name.includes(cellKey) || o.prompt_name.includes(roomType) || o.prompt_name.includes(cameraMovement));

  // 6. Total cost — Lab judge cost for this cell's iterations +
  //    generation cost from cost_events scoped to property_ids that
  //    include the cell. For Phase 2 MVP, we sum just the judge cost
  //    (which is clearly cell-scoped) and expose it as total_cost_cents;
  //    full cost_events rollup with per-cell attribution is Phase 3.
  let total_cost_cents = 0;
  if (labIds.length > 0) {
    const { data: costRows } = await supabase
      .from("lab_judge_scores")
      .select("cost_cents")
      .in("iteration_id", labIds);
    for (const c of costRows ?? []) {
      total_cost_cents += Number((c as { cost_cents?: number }).cost_cents ?? 0);
    }
  }

  const combinedIters = [...labIters, ...prodIters]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);

  return {
    ...summary,
    iterations: combinedIters,
    recipes,
    overrides,
    total_cost_cents,
  };
}
```

- [ ] **Step 2: Write `api/admin/knowledge-map/cell/[cellKey].ts`**

Create `api/admin/knowledge-map/cell/[cellKey].ts`:

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../../lib/auth.js";
import { getCellDrillDown } from "../../../../lib/knowledge-map/cells.js";

// GET /api/admin/knowledge-map/cell/[cellKey]
// Returns everything the drill-down page needs for one cell.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const cellKey = String(req.query.cellKey ?? "");
  if (!cellKey || !cellKey.includes("-")) {
    return res.status(400).json({ error: "cellKey must be 'room_type-camera_movement'" });
  }

  try {
    const data = await getCellDrillDown(cellKey);
    if (!data) return res.status(404).json({ error: "cell not found" });
    return res.status(200).json({ cell: data });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "knowledge-map" | head`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/knowledge-map/cells.ts api/admin/knowledge-map/cell/[cellKey].ts
git commit -m "feat(knowledge-map): cell drill-down loader + endpoint

Combines: cell summary row, up to 50 pooled iterations (Lab +
prod sorted by created_at desc), joined Lab judge composite score,
active recipes in the cell, active Lab overrides matching the
cell name, and a judge-side cost total. Recipe + override queries
run in parallel with the iteration queries to keep total latency
flat."
```

---

## Task 6: Cost rollup loader + API

**Files:**
- Create: `lib/knowledge-map/cost.ts`
- Create: `api/admin/knowledge-map/cost.ts`

- [ ] **Step 1: Write `lib/knowledge-map/cost.ts`**

Create `lib/knowledge-map/cost.ts`:

```ts
import { getSupabase } from "../client.js";
import type { CostRollup, CostRollupRow } from "./types.js";

// Reads from cost_events (generation/analysis/etc.) + lab_judge_scores
// (judge calls). Lab-only for Phase 2 — full per-cell attribution is
// Phase 3 when the iterator writes richer metadata on cost_events.
export async function getCostRollup(opts: { sinceDaysBack?: number } = {}): Promise<CostRollup> {
  const supabase = getSupabase();
  const since = new Date();
  since.setDate(since.getDate() - (opts.sinceDaysBack ?? 30));
  const sinceIso = since.toISOString();

  const { data: eventRows, error: eventErr } = await supabase
    .from("cost_events")
    .select("provider, stage, units_consumed, cost_cents")
    .gte("created_at", sinceIso);
  if (eventErr) throw new Error(`cost_events fetch failed: ${eventErr.message}`);

  const groupKey = (r: { provider: string; stage: string }) => `${r.provider}::${r.stage}`;
  const grouped = new Map<string, CostRollupRow>();
  let totalCents = 0;
  for (const raw of eventRows ?? []) {
    const r = raw as { provider: string; stage: string; units_consumed: number | null; cost_cents: number };
    const key = groupKey(r);
    const existing = grouped.get(key);
    if (existing) {
      existing.cost_cents += Number(r.cost_cents ?? 0);
      existing.units_consumed = (existing.units_consumed ?? 0) + Number(r.units_consumed ?? 0);
      existing.event_count += 1;
    } else {
      grouped.set(key, {
        provider: r.provider,
        stage: r.stage,
        units_consumed: r.units_consumed ?? 0,
        cost_cents: Number(r.cost_cents ?? 0),
        event_count: 1,
      });
    }
    totalCents += Number(r.cost_cents ?? 0);
  }

  const { data: judgeRows, error: judgeErr } = await supabase
    .from("lab_judge_scores")
    .select("cost_cents")
    .gte("judged_at", sinceIso);
  if (judgeErr) throw new Error(`judge cost fetch failed: ${judgeErr.message}`);
  let judgeTotal = 0;
  for (const j of judgeRows ?? []) {
    judgeTotal += Number((j as { cost_cents?: number }).cost_cents ?? 0);
  }

  return {
    total_cents: totalCents + judgeTotal,
    by_provider_and_stage: Array.from(grouped.values()).sort((a, b) => b.cost_cents - a.cost_cents),
    judge_total_cents: judgeTotal,
  };
}
```

- [ ] **Step 2: Write `api/admin/knowledge-map/cost.ts`**

Create `api/admin/knowledge-map/cost.ts`:

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getCostRollup } from "../../../lib/knowledge-map/cost.js";

// GET /api/admin/knowledge-map/cost?days=30
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const days = Math.max(1, Math.min(365, Number(req.query.days ?? 30)));
  try {
    const rollup = await getCostRollup({ sinceDaysBack: days });
    return res.status(200).json({ days, ...rollup });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "knowledge-map" | head`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/knowledge-map/cost.ts api/admin/knowledge-map/cost.ts
git commit -m "feat(knowledge-map): cost rollup loader + GET /cost endpoint

Aggregates cost_events by (provider, stage) over the last N days
(default 30) and adds the lab_judge_scores total separately so the
UI can show 'judge overhead' vs 'generation/analysis spend'. No
per-cell attribution yet — that lands in Phase 3 when the iterator
writes cell_key onto cost_events metadata."
```

---

## Task 7: Frontend API client

**Files:**
- Create: `src/lib/knowledgeMapApi.ts`

- [ ] **Step 1: Write the client**

Create `src/lib/knowledgeMapApi.ts`:

```ts
import { supabase } from "@/lib/supabase";
import type {
  CellSummary,
  CellDrillDown,
  CostRollup,
} from "../../lib/knowledge-map/types.js";

async function authedFetch<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  const res = await fetch(path, { headers });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body as T;
}

export async function fetchCells(): Promise<{
  cells: CellSummary[];
  summary: { total_cells: number; by_state: Record<string, number> };
}> {
  return authedFetch("/api/admin/knowledge-map/cells");
}

export async function fetchCellDrillDown(cellKey: string): Promise<{ cell: CellDrillDown }> {
  return authedFetch(`/api/admin/knowledge-map/cell/${encodeURIComponent(cellKey)}`);
}

export async function fetchCostRollup(days = 30): Promise<{ days: number } & CostRollup> {
  return authedFetch(`/api/admin/knowledge-map/cost?days=${days}`);
}

// Phase 1 judge status — reused for the calibration panel on the map page.
export interface CalibrationStatusSummary {
  total_cells_calibrated: number;
  cells_auto: number;
  cells_advisory: number;
  overall_within_one_star: number;
}

export async function fetchCalibrationStatus(): Promise<{
  cells: Array<{
    cell_key: string;
    mode: "auto" | "advisory";
    within_one_star_rate: number;
    sample_size: number;
  }>;
  summary: CalibrationStatusSummary;
}> {
  return authedFetch("/api/admin/judge/status");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/knowledgeMapApi.ts
git commit -m "feat(knowledge-map): frontend API client

Wraps the three Phase 2 endpoints (cells, cell[cellKey], cost) plus
reuses /api/admin/judge/status for the calibration panel. Every call
attaches the Supabase session token in Authorization: Bearer format
matching src/lib/devApi.ts and src/lib/promptLabApi.ts."
```

---

## Task 8: Knowledge Map grid page

**Files:**
- Create: `src/pages/dashboard/KnowledgeMap.tsx`

- [ ] **Step 1: Write the page**

Create `src/pages/dashboard/KnowledgeMap.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchCells,
  fetchCalibrationStatus,
  fetchCostRollup,
  type CalibrationStatusSummary,
} from "@/lib/knowledgeMapApi";
import type { CellSummary } from "../../../lib/knowledge-map/types.js";

type ByStateCounts = Record<string, number>;

const ROWS: string[] = [
  "kitchen", "living_room", "master_bedroom", "bedroom", "bathroom",
  "exterior_front", "exterior_back", "pool", "aerial", "dining",
  "hallway", "garage", "foyer", "other",
];
const COLS: string[] = [
  "push_in", "pull_out", "orbit", "parallax",
  "dolly_left_to_right", "dolly_right_to_left", "reveal",
  "drone_push_in", "drone_pull_back", "top_down",
  "low_angle_glide", "feature_closeup",
];

const STATE_COLOR: Record<string, string> = {
  untested: "bg-muted/50 text-muted-foreground",
  weak:     "bg-red-500/20 text-red-700 dark:text-red-300",
  okay:     "bg-amber-400/20 text-amber-700 dark:text-amber-300",
  strong:   "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  golden:   "bg-amber-300/80 text-amber-900 dark:text-amber-100 font-semibold",
};

const STATE_LABEL: Record<string, string> = {
  untested: "Untested",
  weak: "Weak",
  okay: "Okay",
  strong: "Strong",
  golden: "Golden",
};

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-border bg-background p-4">
      <div className="label text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function KnowledgeMap() {
  const [cells, setCells] = useState<CellSummary[] | null>(null);
  const [counts, setCounts] = useState<ByStateCounts>({});
  const [calibration, setCalibration] = useState<CalibrationStatusSummary | null>(null);
  const [costTotalCents, setCostTotalCents] = useState<number | null>(null);
  const [judgeCostCents, setJudgeCostCents] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [cellsResp, calResp, costResp] = await Promise.all([
        fetchCells(),
        fetchCalibrationStatus().catch(() => null),
        fetchCostRollup(30).catch(() => null),
      ]);
      setCells(cellsResp.cells);
      setCounts(cellsResp.summary.by_state);
      setCalibration(calResp?.summary ?? null);
      setCostTotalCents(costResp?.total_cents ?? null);
      setJudgeCostCents(costResp?.judge_total_cents ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const cellLookup = useMemo(() => {
    const m = new Map<string, CellSummary>();
    for (const c of cells ?? []) m.set(c.cell_key, c);
    return m;
  }, [cells]);

  return (
    <div className="space-y-10">
      <div>
        <span className="label text-muted-foreground">— Knowledge Map</span>
        <h2 className="mt-3 flex items-center gap-3 text-3xl font-semibold tracking-[-0.02em]">
          <MapIcon className="h-6 w-6 text-muted-foreground" />
          Machine learning coverage at a glance
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Every {ROWS.length}×{COLS.length} = 168 scene cell (room type × camera verb) colored by its learning state.
          Click any cell to see the iterations, recipes, overrides, and fail-tag patterns backing that cell.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatBlock label="Golden cells" value={String(counts.golden ?? 0)} sub="≥ 2 five-star ratings — 10/10 ready" />
        <StatBlock label="Strong cells" value={String(counts.strong ?? 0)} sub="avg rating ≥ 4.0" />
        <StatBlock label="Weak + losers" value={String(counts.weak ?? 0)} sub="avg ≤ 2 or half losers" />
        <StatBlock label="Untested" value={String(counts.untested ?? 0)} sub="zero rated iterations" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatBlock
          label="Judge calibration"
          value={calibration ? `${Math.round((calibration.overall_within_one_star ?? 0) * 100)}%` : "—"}
          sub={calibration ? `${calibration.cells_auto} auto / ${calibration.cells_advisory} advisory` : "Not calibrated yet"}
        />
        <StatBlock
          label="Spend, last 30 days"
          value={costTotalCents !== null ? `$${(costTotalCents / 100).toFixed(2)}` : "—"}
          sub="All providers, all stages"
        />
        <StatBlock
          label="Judge overhead, last 30 days"
          value={judgeCostCents !== null ? `$${(judgeCostCents / 100).toFixed(2)}` : "—"}
          sub="Claude rubric judge calls"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {(["untested", "weak", "okay", "strong", "golden"] as const).map((s) => (
            <span key={s} className={`inline-flex items-center gap-2 border border-border px-2 py-1 text-[11px] ${STATE_COLOR[s]}`}>
              <span className={`inline-block h-2 w-2 ${STATE_COLOR[s].split(" ")[0]}`} />
              {STATE_LABEL[s]}
            </span>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="overflow-x-auto border border-border">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-40 bg-background p-2 text-left text-muted-foreground">room \ verb</th>
              {COLS.map((verb) => (
                <th key={verb} className="border-l border-border bg-background p-2 text-left text-muted-foreground whitespace-nowrap">
                  {verb}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((room) => (
              <tr key={room} className="border-t border-border">
                <th className="sticky left-0 z-10 w-40 bg-background p-2 text-left font-medium whitespace-nowrap">{room}</th>
                {COLS.map((verb) => {
                  const key = `${room}-${verb}`;
                  const c = cellLookup.get(key);
                  const state = c?.state ?? "untested";
                  const bg = STATE_COLOR[state] ?? STATE_COLOR.untested;
                  return (
                    <td key={key} className="border-l border-border p-0">
                      <Link
                        to={`/dashboard/development/knowledge-map/${encodeURIComponent(key)}`}
                        className={`block h-14 w-full px-2 py-2 transition-opacity hover:opacity-80 ${bg}`}
                        title={c ? `${c.sample_size} samples · avg ${c.avg_rating ?? "—"} · ${STATE_LABEL[state]}` : STATE_LABEL[state]}
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span>{c?.sample_size ?? 0}</span>
                          {c?.five_star_count ? <span className="font-semibold">★{c.five_star_count}</span> : null}
                        </div>
                        {c?.avg_rating !== null && c?.avg_rating !== undefined && (
                          <div className="mt-1 text-[10px] opacity-80">avg {Number(c.avg_rating).toFixed(1)}</div>
                        )}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "knowledgemap" | head`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashboard/KnowledgeMap.tsx
git commit -m "feat(dashboard): knowledge map grid page

14x12 heatmap colored by cell state (untested/weak/okay/strong/
golden). Top row of stat blocks shows the cell-state counts,
followed by a second row showing judge calibration overall
agreement, total 30-day spend, and judge overhead. Legend chips
line up with the CSS classes. Clicking any cell routes to the
drill-down page."
```

---

## Task 9: Cell drill-down page

**Files:**
- Create: `src/pages/dashboard/KnowledgeMapCell.tsx`

- [ ] **Step 1: Write the page**

Create `src/pages/dashboard/KnowledgeMapCell.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, ArrowLeft, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchCellDrillDown } from "@/lib/knowledgeMapApi";
import type { CellDrillDown } from "../../../lib/knowledge-map/types.js";

const STATE_COLOR: Record<string, string> = {
  untested: "text-muted-foreground",
  weak: "text-red-600 dark:text-red-400",
  okay: "text-amber-600 dark:text-amber-300",
  strong: "text-emerald-600 dark:text-emerald-300",
  golden: "text-amber-700 dark:text-amber-100 font-semibold",
};

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3 w-3 ${n <= rating ? "fill-foreground text-foreground" : "text-muted-foreground/30"}`} />
      ))}
    </span>
  );
}

export default function KnowledgeMapCell() {
  const { cellKey = "" } = useParams();
  const [data, setData] = useState<CellDrillDown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetchCellDrillDown(cellKey);
        if (!cancelled) setData(resp.cell);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [cellKey]);

  return (
    <div className="space-y-10">
      <div>
        <Link to="/dashboard/development/knowledge-map" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> back to map
        </Link>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.02em]">{cellKey}</h2>
        {data && (
          <p className="mt-2 text-sm text-muted-foreground">
            <span className={STATE_COLOR[data.state]}>{data.state}</span> · {data.sample_size} samples
            {data.avg_rating !== null && <> · avg {Number(data.avg_rating).toFixed(2)}</>}
            {data.five_star_count > 0 && <> · ★5 × {data.five_star_count}</>}
            {data.loser_count > 0 && <> · losers × {data.loser_count}</>}
          </p>
        )}
      </div>

      {error && <div className="border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

      {data && (
        <>
          <section className="border border-border bg-background p-6">
            <span className="label text-muted-foreground">Failure tag histogram</span>
            {data.fail_tags.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No fail:* tags recorded in this cell.</p>
            ) : (
              <ul className="mt-3 grid gap-2 md:grid-cols-2">
                {data.fail_tags.map((f) => (
                  <li key={f.tag} className="flex items-center justify-between border border-border p-2 text-xs">
                    <span className="font-mono">{f.tag}</span>
                    <span className="text-muted-foreground">{f.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border border-border bg-background p-6">
            <span className="label text-muted-foreground">Active recipes</span>
            {data.recipes.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No active recipes in this cell.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.recipes.map((r) => (
                  <li key={r.id} className="border border-border p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono">{r.archetype}</span>
                      <span className="text-muted-foreground">★{r.rating_at_promotion} · applied {r.times_applied}×</span>
                    </div>
                    <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-[10px] text-muted-foreground">{r.prompt_template}</pre>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border border-border bg-background p-6">
            <span className="label text-muted-foreground">Overrides matching this cell</span>
            {data.overrides.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.overrides.map((o) => (
                  <li key={o.id} className="flex items-center justify-between border border-border p-2 text-xs">
                    <span className="font-mono">{o.prompt_name}</span>
                    <span className="text-muted-foreground">{o.body_hash.slice(0, 10)}…</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border border-border bg-background p-6">
            <span className="label text-muted-foreground">Recent iterations ({data.iterations.length})</span>
            {data.iterations.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No rated iterations yet.</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {data.iterations.map((i) => (
                  <div key={`${i.source}-${i.id}`} className="border border-border bg-background p-3 text-xs">
                    {i.source_image_url && (
                      <img src={i.source_image_url} alt="" className="mb-2 aspect-video w-full object-cover" loading="lazy" />
                    )}
                    <div className="flex items-center justify-between">
                      <Stars rating={i.rating} />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{i.source}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {i.provider ?? "—"}
                      {i.judge_composite !== null && <> · judge {Number(i.judge_composite).toFixed(2)}</>}
                    </div>
                    {i.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {i.tags.slice(0, 4).map((t) => (
                          <span key={t} className={`border border-border px-1 py-0.5 text-[9px] ${t.startsWith("fail:") ? "text-red-600" : "text-muted-foreground"}`}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="text-right text-[11px] text-muted-foreground">
            Spend scoped to this cell (judge only so far): ${(data.total_cost_cents / 100).toFixed(2)}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "knowledgemap" | head`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashboard/KnowledgeMapCell.tsx
git commit -m "feat(dashboard): knowledge map cell drill-down page

Four sections: failure-tag histogram, active recipes (with expandable
prompt templates), active overrides matching the cell, and a gallery
of up to 50 recent iterations with rating stars, source badge (lab
vs prod), provider, judge composite score, and tag chips (fail:*
tags get a red accent). Cell-scoped spend shown in the footer."
```

---

## Task 10: Wire routes + dashboard link

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/dashboard/Development.tsx`

- [ ] **Step 1: Add imports + routes in `src/App.tsx`**

Open `src/App.tsx`. Add after the existing dashboard page imports:

```ts
import DashboardKnowledgeMap from "./pages/dashboard/KnowledgeMap";
import DashboardKnowledgeMapCell from "./pages/dashboard/KnowledgeMapCell";
```

Add inside the `<Dashboard>` route element, alongside the other `development/*` routes:

```tsx
<Route path="development/knowledge-map" element={<DashboardKnowledgeMap />} />
<Route path="development/knowledge-map/:cellKey" element={<DashboardKnowledgeMapCell />} />
```

Place them after the `development/proposals` line and before `development/prompt-lab/:sessionId`.

- [ ] **Step 2: Add dashboard link card in `src/pages/dashboard/Development.tsx`**

Open `src/pages/dashboard/Development.tsx`.

In the `lucide-react` import, append `Map`:

```ts
import { Loader2, Plus, Trash2, Sparkles, FlaskConical, ArrowRight, GitPullRequest, Map as MapIcon } from "lucide-react";
```

In the "Quick links" grid (the `<div className="grid gap-4 md:grid-cols-2">` block), after the "Prompt proposals" card and before the closing `</div>`, add:

```tsx
<Link
  to="/dashboard/development/knowledge-map"
  className="group border border-border bg-background p-6 transition hover:border-foreground"
>
  <div className="flex items-center gap-3">
    <MapIcon className="h-5 w-5 text-muted-foreground group-hover:text-foreground" />
    <div className="label text-muted-foreground group-hover:text-foreground">Knowledge map</div>
    <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-foreground" />
  </div>
  <p className="mt-3 text-sm text-muted-foreground">
    Every (room type × camera verb) cell colored by learning state. See at a glance which scenes the machine is great at (golden), okay at, weak at, and has never been tested in. Click any cell to drill into its iterations, recipes, overrides, and fail-tag patterns.
  </p>
</Link>
```

- [ ] **Step 3: Build + typecheck**

Run: `npm run build 2>&1 | tail -20`
Expected: `built in X.XXs` with no errors related to the new pages.

Run: `npx tsc --noEmit 2>&1 | head -15`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/pages/dashboard/Development.tsx
git commit -m "feat(dashboard): wire Knowledge Map routes + dashboard link card"
```

---

## Task 11: Seed upload cell-key tagging

**Files:**
- Modify: `api/admin/prompt-lab/sessions.ts`

The UI changes for cell-key tagging on upload are intentionally deferred — MVP is that the API accepts the field so curated seeds can be tagged via a direct POST or a small future admin helper. The front-end upload form gets a cell_key dropdown in Phase 3 when the iterator actually reads it.

- [ ] **Step 1: Inspect the existing sessions endpoint**

Run: `sed -n '1,80p' api/admin/prompt-lab/sessions.ts`
Expected: a POST handler that creates a `prompt_lab_sessions` row from an uploaded image.

- [ ] **Step 2: Extend the create-session POST to accept cell_key**

Find the block in `api/admin/prompt-lab/sessions.ts` where the session row is inserted. Read the surrounding shape before editing.

Modify the POST body-parsing to accept `cell_key?: string | null`, validate that it has the form `<room>-<verb>` when non-null, and include it in the insert.

Concretely, locate the code that constructs the insert payload. Before the `.insert({ ... })` call, add a parsed `cell_key` field. Example transformation (your actual file will have more context — keep the rest unchanged):

Before:
```ts
const { data, error } = await supabase
  .from("prompt_lab_sessions")
  .insert({
    created_by: auth.user.id,
    image_url,
    image_path,
    label,
    archetype,
  })
  .select()
  .single();
```

After:
```ts
const body = (req.body ?? {}) as { cell_key?: string | null };
const cellKey = typeof body.cell_key === "string" && body.cell_key.includes("-")
  ? body.cell_key
  : null;

const { data, error } = await supabase
  .from("prompt_lab_sessions")
  .insert({
    created_by: auth.user.id,
    image_url,
    image_path,
    label,
    archetype,
    cell_key: cellKey,
  })
  .select()
  .single();
```

**Important:** if the endpoint already destructures body fields for `label` / `archetype`, extend that destructure to include `cell_key` rather than redeclaring `body`. Match the existing coding style.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -iE "sessions" | head`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `grep -n "cell_key" api/admin/prompt-lab/sessions.ts`
Expected: at least one match showing the column being written.

- [ ] **Step 5: Commit**

```bash
git add api/admin/prompt-lab/sessions.ts
git commit -m "feat(prompt-lab): accept optional cell_key on session creation

Lets callers tag a seed upload with a room_type-camera_movement cell
so curated reference images land in the intended cell. Validates
the hyphen-split shape but does not strictly enforce membership in
the active taxonomy — Phase 3 can tighten that when the iterator
starts reading the column."
```

---

## Task 12: Apply the migration + end-to-end smoke

This task is a manual verification run. It requires the migration to have been applied and the preview deployment to be live, so it is the last step.

**Files:** none created.

- [ ] **Step 1: Apply migration 019**

The controller applies `supabase/migrations/019_knowledge_map.sql` via Supabase MCP `apply_migration`. Implementer: verify the migration file has been committed; do not run `supabase db push`.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: All tests from Phase 1 (19) plus 7 new state-classifier tests = **26 passing**, zero failures.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `built in X.XXs`, no errors mentioning `KnowledgeMap`.

- [ ] **Step 4: Push + preview verification**

```bash
git push
```

Wait for Vercel preview to deploy. Then in a browser, logged in as admin on the preview:

1. Navigate to `/dashboard/development` — a new "Knowledge map" card appears under Prompt proposals
2. Click it — grid loads, 14 rows × 12 columns = 168 cells, top stats populate, legend chips line up
3. Click a cell with `sample_size > 0` — drill-down shows rating histogram, recipes (if any), iterations gallery
4. Click "back to map" — returns to grid
5. Hit Refresh — stats update without a full-page reload

Expected qualitative checks:
- Golden count > 0 if any 5★+5★ cells exist in your data
- Untested count is likely ~150+ on first load (most cells are empty)
- Calibration panel shows 0% if you haven't run `/api/admin/judge/calibrate` yet — that's fine
- Spend number is non-zero if you've run any production pipelines in the last 30 days

- [ ] **Step 5: Record the Phase 2 milestone**

Append to `docs/PROMPT-LAB-PLAN.md`:

```markdown
#### Phase 2 Knowledge Map shipped — <YYYY-MM-DD>

- 14×12 grid live at /dashboard/development/knowledge-map
- Cells colored by state (untested/weak/okay/strong/golden)
- Drill-down shows iterations, recipes, overrides, fail-tag histogram
- Calibration panel + 30-day cost meter
- Seed upload accepts optional cell_key
- Deferred to 2.5: UMAP projection, embedding-cluster overlay inside cells
```

Then commit:

```bash
git add docs/PROMPT-LAB-PLAN.md
git commit -m "docs: Phase 2 Knowledge Map shipped"
```

---

## Self-Review Checklist

**Spec coverage check:**

| Spec item (from §Phase 2) | Task |
|---|---|
| Build `get_knowledge_map_cells` RPC + `v_knowledge_map_cells` view | Task 1 (view; the list endpoint is the RPC-equivalent) |
| Build cluster labeling job + `lab_cell_clusters` table | **Deferred to Phase 2.5** — noted in scope boundaries |
| Build `/dashboard/development/knowledge-map` grid view | Task 8 |
| UMAP view | **Deferred to Phase 2.5** — noted in scope boundaries |
| Build cell drill-down page (read-only; no Fill Now button yet) | Task 9 |
| Build calibration panel | Task 8 (StatBlock reading `/api/admin/judge/status`) |
| Build cost meter | Tasks 6 + 8 |
| Seed uploads extended to accept cell-key tagging | Task 11 |

**Placeholder scan:** Task 11 Step 2 shows "Before/After" snippets rather than a single exact edit because `api/admin/prompt-lab/sessions.ts` already exists and has more context than the excerpt shows; the step tells the engineer what to add, matches existing style, and includes the full added code. This is deliberate, not a placeholder. Task 12 contains `<YYYY-MM-DD>` in a ledger entry — that is runtime data the engineer substitutes at completion time.

**Type consistency:** `CellSummary`, `CellDrillDown`, `CellState`, `FailTagCount`, `CellDrillDownIteration`, `CellDrillDownRecipe`, `CellDrillDownOverride`, `CostRollup`, `CostRollupRow`, `CalibrationStatusSummary` — all defined in Task 2 (or in Task 7 for the Calibration Summary consumed by the frontend), imported consistently across Tasks 4-10. Function names: `classifyCellState`, `listCells`, `getCellDrillDown`, `getCostRollup`, `fetchCells`, `fetchCellDrillDown`, `fetchCostRollup`, `fetchCalibrationStatus` — unique, no aliasing.

**Ambiguity check:** Task 5's Step 1 appends to `lib/knowledge-map/cells.ts` (created in Task 4) — explicitly labelled as an extend, not a rewrite. Task 10 Steps 1-2 tell the engineer exactly where to place insertions relative to existing code rather than asserting a full-file replacement.

**Out-of-scope reminders:** UMAP, embedding clusters, Fill Now button, Prompt Lab IA refresh, upload UI for cell_key, per-cell cost attribution on cost_events — all explicitly deferred.

---

## Handoff

After Task 12's qualitative checks pass → Phase 2 milestone is met and we can begin Phase 3 (Autonomous Iterator + agent chat).

If any cell's UI rendering looks wrong — e.g., cells all appear untested despite rated data existing — first check: are the ratings embedded in `prompt_lab_iterations.rating` with `analysis_json->>'room_type'` populated, or are they sitting only in the `analysis_json.room_type` path that doesn't exist on some older rows? Use the `v_rated_pool` view to inspect pooled data directly.
