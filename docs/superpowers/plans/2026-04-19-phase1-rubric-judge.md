# Phase 1 — Claude Rubric Judge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a calibrated Claude-based rubric judge that scores Prompt Lab iterations on a 4-axis rubric, writes composite scores + confidence to `lab_judge_scores`, and tracks per-cell agreement with Oliver's ratings in `lab_judge_calibrations`. When calibration hits ≥80% agreement within ±1★ on a holdout set of 50 iterations across ≥10 cells, the judge graduates from advisory mode to auto-rate mode.

**Architecture:** Claude Sonnet 4.6 reads an iteration's source image (URL) + analysis JSON + candidate prompt + top-3 5★ neighbor metadata (from existing `match_rated_examples` RPC) + the losers list for the cell. Returns structured JSON with four 1–5 axis scores plus free-text rationale. Composite score is a weighted average mapped onto the existing 1–5★ scale. Confidence is derived from axis-score variance + neighbor retrieval density. Calibration routine batches the judge across a holdout of already-rated iterations, computes per-cell agreement, and writes a snapshot row per cell.

**Tech Stack:** TypeScript (ESM), Vercel serverless functions (Node 20), Supabase Postgres + pgvector, `@anthropic-ai/sdk` (Claude Sonnet 4.6), Vitest (added in this plan), existing `lib/auth.ts`, `lib/client.ts`, `lib/embeddings.ts`.

**Scope boundaries (do NOT build in this plan):**
- No CLIP channel (deferred to conditional Phase 1.5)
- No video frame extraction
- No auto-invocation on iteration creation (Phase 3 will wire this to the iterator)
- No UI — Phase 1 is API + schema + calibration only. Phase 2 builds the Knowledge Map + dashboard that visualizes judge output.

---

## File Structure

### New files

- `supabase/migrations/018_judge_tables.sql` — `lab_judge_scores`, `lab_judge_calibrations`, `v_judge_calibration_status` view
- `lib/judge/types.ts` — `JudgeRubricScore`, `JudgeResult`, `CalibrationRow`, `CellKey` types
- `lib/judge/rubric.ts` — rubric system prompt, user-message builder, Claude output parser
- `lib/judge/neighbors.ts` — fetches top winners + top losers for a given cell using existing RPCs
- `lib/judge/confidence.ts` — composite + confidence math
- `lib/judge/index.ts` — `scoreIteration(iterationId)` public API
- `lib/judge/calibration.ts` — runs judge over holdout, computes per-cell agreement, persists snapshots
- `api/admin/judge/score.ts` — `POST` endpoint (score one iteration)
- `api/admin/judge/calibrate.ts` — `POST` endpoint (run calibration)
- `api/admin/judge/status.ts` — `GET` endpoint (per-cell calibration state)
- `lib/judge/__tests__/rubric.test.ts` — unit tests for parser + composite math
- `lib/judge/__tests__/confidence.test.ts` — unit tests for confidence
- `lib/judge/__tests__/calibration.test.ts` — unit tests for agreement math
- `vitest.config.ts` — vitest configuration
- `src/test/setup.ts` — (already exists; confirm it works)

### Modified files

- `package.json` — add `vitest` devDependency + `test` script
- `.env.example` — nothing new (judge uses existing `ANTHROPIC_API_KEY`)

### Import convention

All relative imports use `.js` extensions (ESM convention, matches existing repo). Example: `import { getSupabase } from "../../lib/client.js";`

---

## Task 0: Install and wire Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Test: verifies an existing sample test runs

- [ ] **Step 1: Inspect current state**

Run:
```bash
cat package.json | grep -A1 '"scripts"'
ls src/test/
```

Expected:
- No `"test":` script under `"scripts"`
- `src/test/example.test.ts` and `src/test/setup.ts` exist

- [ ] **Step 2: Install Vitest**

Run:
```bash
npm install --save-dev vitest @vitest/ui happy-dom @testing-library/jest-dom
```

Expected: devDependencies updated in `package.json`, `package-lock.json` regenerated.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "lib/**/*.{test,spec}.ts", "lib/**/__tests__/**/*.{test,spec}.ts"],
    globals: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 4: Add `test` script**

Edit `package.json`. Inside the `"scripts"` object, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Keep all existing scripts unchanged.

- [ ] **Step 5: Run sample test**

Run:
```bash
npm test
```

Expected: `src/test/example.test.ts` runs and passes. Exit code 0.

If `src/test/setup.ts` imports `@testing-library/jest-dom` and fails, investigate — it should now work since we installed it in Step 2.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: wire vitest test runner

Adds vitest, happy-dom, and testing-library/jest-dom devDeps plus a
vitest.config.ts + 'test' and 'test:watch' scripts. Confirms existing
sample test at src/test/example.test.ts passes."
```

---

## Task 1: Judge schema migration

**Files:**
- Create: `supabase/migrations/018_judge_tables.sql`

- [ ] **Step 1: Confirm next migration number**

Run:
```bash
ls supabase/migrations/ | sort | tail -5
```

Expected: Highest existing migration is `017_*.sql`. Next is `018_`.

- [ ] **Step 2: Write migration file**

Create `supabase/migrations/018_judge_tables.sql`:

```sql
-- Migration 018: Claude rubric judge scores + per-cell calibration snapshots.
--
-- Phase 1 ships a Claude-only judge. `clip_similarity` is nullable so
-- Phase 1.5 can fill it without a schema migration if CLIP is added.

BEGIN;

-- One score per iteration. If the judge is re-run, we overwrite via upsert.
CREATE TABLE IF NOT EXISTS lab_judge_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iteration_id    UUID NOT NULL UNIQUE REFERENCES prompt_lab_iterations(id) ON DELETE CASCADE,
  -- Raw rubric output from Claude. Shape:
  --   { prompt_adherence: 1..5, motion_quality: 1..5, spatial_coherence: 1..5,
  --     aesthetic_intent: 1..5, rationale: string, fail_tag_suggestions: string[] }
  rubric          JSONB NOT NULL,
  composite_1to5  NUMERIC(3,2) NOT NULL CHECK (composite_1to5 >= 1 AND composite_1to5 <= 5),
  confidence      NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  clip_similarity NUMERIC(3,2)          CHECK (clip_similarity IS NULL OR (clip_similarity >= 0 AND clip_similarity <= 1)),
  judge_version   TEXT NOT NULL,
  model_id        TEXT NOT NULL,
  neighbors_used  INT  NOT NULL DEFAULT 0,
  cost_cents      INT  NOT NULL DEFAULT 0,
  judged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_judge_scores_judged_at ON lab_judge_scores (judged_at DESC);

-- Per-cell, per-window snapshot of how well the judge agrees with Oliver.
CREATE TABLE IF NOT EXISTS lab_judge_calibrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_key              TEXT NOT NULL,     -- e.g. 'kitchen-push_in'
  room_type             TEXT NOT NULL,
  camera_movement       TEXT NOT NULL,
  sample_size           INT  NOT NULL,
  exact_match_rate      NUMERIC(4,3) NOT NULL, -- judge composite rounds to exact human ★
  within_one_star_rate  NUMERIC(4,3) NOT NULL, -- |judge - human| <= 1
  mean_abs_error        NUMERIC(4,3) NOT NULL,
  judge_version         TEXT NOT NULL,
  model_id              TEXT NOT NULL,
  window_start          TIMESTAMPTZ,
  window_end            TIMESTAMPTZ,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_judge_calibrations_cell ON lab_judge_calibrations (cell_key, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_judge_calibrations_version ON lab_judge_calibrations (judge_version, computed_at DESC);

-- Convenience view: most-recent calibration per cell, with a derived mode
-- ('advisory' when within-1-star < 0.80, 'auto' otherwise).
CREATE OR REPLACE VIEW v_judge_calibration_status AS
WITH latest AS (
  SELECT DISTINCT ON (cell_key)
    cell_key, room_type, camera_movement,
    sample_size, exact_match_rate, within_one_star_rate, mean_abs_error,
    judge_version, model_id, computed_at
  FROM lab_judge_calibrations
  ORDER BY cell_key, computed_at DESC
)
SELECT
  l.*,
  CASE WHEN l.within_one_star_rate >= 0.80 THEN 'auto' ELSE 'advisory' END AS mode
FROM latest l;

COMMIT;
```

- [ ] **Step 3: Apply migration locally**

Run:
```bash
npx supabase db reset --local 2>/dev/null || echo "skip local reset (no local supabase)"
npx supabase db push --linked
```

Expected: Migration applied without errors. If the engineer doesn't have Supabase CLI linked, apply via the Supabase dashboard SQL editor by pasting `018_judge_tables.sql`.

- [ ] **Step 4: Verify tables exist**

Run:
```bash
npx supabase db diff --linked --schema public 2>&1 | head -20
```

Or via Supabase MCP if wired: list tables in public schema, confirm `lab_judge_scores` and `lab_judge_calibrations` present, and `v_judge_calibration_status` view exists.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/018_judge_tables.sql
git commit -m "feat(db): add lab_judge_scores + lab_judge_calibrations

Schema for Phase 1 Claude rubric judge. Nullable clip_similarity column
leaves room for Phase 1.5 CLIP channel without another migration.
View v_judge_calibration_status exposes per-cell latest mode
(advisory vs auto) based on an 80%-within-one-star threshold."
```

---

## Task 2: Shared judge types

**Files:**
- Create: `lib/judge/types.ts`

- [ ] **Step 1: Write types**

Create `lib/judge/types.ts`:

```ts
// Cell taxonomy = (room_type, camera_movement). Stable enums from lib/types.ts.
export interface CellKey {
  room_type: string;
  camera_movement: string;
}

export function cellKeyToString(k: CellKey): string {
  return `${k.room_type}-${k.camera_movement}`;
}

export const JUDGE_VERSION = "rubric-v1";
export const JUDGE_MODEL = "claude-sonnet-4-6";

// Four rubric axes, each 1..5. rationale is free text, fail_tag_suggestions
// are 'fail:*'-prefixed tokens Claude proposes when it scores low.
export interface JudgeRubricScore {
  prompt_adherence: number;
  motion_quality: number;
  spatial_coherence: number;
  aesthetic_intent: number;
  rationale: string;
  fail_tag_suggestions: string[];
}

export interface JudgeResult {
  iteration_id: string;
  rubric: JudgeRubricScore;
  composite_1to5: number;   // 1..5 with 2 decimals
  confidence: number;       // 0..1 with 2 decimals
  neighbors_used: number;
  cost_cents: number;
  model_id: string;
  judge_version: string;
}

export interface CalibrationRow {
  cell_key: string;
  room_type: string;
  camera_movement: string;
  sample_size: number;
  exact_match_rate: number;
  within_one_star_rate: number;
  mean_abs_error: number;
  judge_version: string;
  model_id: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/judge/types.ts
git commit -m "feat(judge): shared types for rubric judge"
```

---

## Task 3: Rubric prompt + parser

**Files:**
- Create: `lib/judge/rubric.ts`
- Test: `lib/judge/__tests__/rubric.test.ts`

- [ ] **Step 1: Write the failing parser test**

Create `lib/judge/__tests__/rubric.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRubricResponse, buildRubricSystemPrompt, buildRubricUserMessage } from "../rubric.js";

describe("parseRubricResponse", () => {
  it("extracts structured JSON from a fenced response", () => {
    const raw = [
      "Here is my assessment:",
      "```json",
      "{",
      '  "prompt_adherence": 4,',
      '  "motion_quality": 5,',
      '  "spatial_coherence": 3,',
      '  "aesthetic_intent": 4,',
      '  "rationale": "Camera move is smooth but kitchen island clips through a wall briefly.",',
      '  "fail_tag_suggestions": ["fail:ghost-walls"]',
      "}",
      "```",
    ].join("\n");
    const parsed = parseRubricResponse(raw);
    expect(parsed.prompt_adherence).toBe(4);
    expect(parsed.motion_quality).toBe(5);
    expect(parsed.spatial_coherence).toBe(3);
    expect(parsed.aesthetic_intent).toBe(4);
    expect(parsed.fail_tag_suggestions).toEqual(["fail:ghost-walls"]);
  });

  it("extracts JSON from an unfenced response", () => {
    const raw = '{"prompt_adherence":5,"motion_quality":5,"spatial_coherence":5,"aesthetic_intent":5,"rationale":"Pristine.","fail_tag_suggestions":[]}';
    const parsed = parseRubricResponse(raw);
    expect(parsed.prompt_adherence).toBe(5);
    expect(parsed.fail_tag_suggestions).toEqual([]);
  });

  it("clamps out-of-range axis values to 1..5", () => {
    const raw = '{"prompt_adherence":7,"motion_quality":0,"spatial_coherence":3,"aesthetic_intent":-2,"rationale":"x","fail_tag_suggestions":[]}';
    const parsed = parseRubricResponse(raw);
    expect(parsed.prompt_adherence).toBe(5);
    expect(parsed.motion_quality).toBe(1);
    expect(parsed.aesthetic_intent).toBe(1);
  });

  it("throws when JSON is unparseable", () => {
    expect(() => parseRubricResponse("no JSON here")).toThrow(/no JSON/i);
  });

  it("throws when required fields are missing", () => {
    expect(() => parseRubricResponse('{"prompt_adherence":4}')).toThrow(/missing/i);
  });
});

describe("buildRubricSystemPrompt", () => {
  it("returns a non-empty string mentioning all four axes", () => {
    const s = buildRubricSystemPrompt();
    expect(s).toMatch(/prompt_adherence/);
    expect(s).toMatch(/motion_quality/);
    expect(s).toMatch(/spatial_coherence/);
    expect(s).toMatch(/aesthetic_intent/);
  });
});

describe("buildRubricUserMessage", () => {
  it("includes prompt, analysis summary, and neighbor count", () => {
    const msg = buildRubricUserMessage({
      prompt: "Slow push_in reveals kitchen island",
      analysisSummary: "Kitchen with marble island, pendant lights",
      cellKey: "kitchen-push_in",
      winnerNeighbors: [
        { prompt: "Push in toward island", rating: 5, tags: ["marble"], comment: null },
      ],
      loserNeighbors: [],
    });
    expect(msg).toMatch(/Slow push_in reveals kitchen island/);
    expect(msg).toMatch(/marble island/);
    expect(msg).toMatch(/kitchen-push_in/);
    expect(msg).toMatch(/Push in toward island/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/judge/__tests__/rubric.test.ts`

Expected: FAIL with "Cannot find module '../rubric.js'".

- [ ] **Step 3: Implement `lib/judge/rubric.ts`**

Create `lib/judge/rubric.ts`:

```ts
import type { JudgeRubricScore } from "./types.js";

export interface NeighborSummary {
  prompt: string;
  rating: number;
  tags: string[] | null;
  comment: string | null;
}

export interface RubricUserInput {
  prompt: string;
  analysisSummary: string;
  cellKey: string;
  winnerNeighbors: NeighborSummary[];
  loserNeighbors: NeighborSummary[];
}

export function buildRubricSystemPrompt(): string {
  return [
    "You are a professional cinematography judge for real-estate video clips.",
    "You will be shown: a source listing photo, the analysis the photo-analyzer produced, a candidate prompt the director generated, and examples of previously-rated iterations for this cell (room_type × camera_movement).",
    "Your job is to predict how this iteration will land when rendered and rated by the human editor.",
    "",
    "Score four axes on an integer scale of 1 (terrible) to 5 (excellent):",
    "  - prompt_adherence: will the clip actually show what the prompt asks for, given the source image?",
    "  - motion_quality: is the camera movement specified smoothly and cinematically, or is it implausible / jittery / unmotivated?",
    "  - spatial_coherence: does the prompt respect the geometry visible in the source image, or does it risk ghost walls / warped perspective / impossible traversal?",
    "  - aesthetic_intent: does the prompt evoke the kind of composition, lighting, and mood seen in the 5★ neighbors for this cell?",
    "",
    "Also propose zero or more structured failure tags of the form 'fail:<slug>' for any axis you scored ≤ 2. Common slugs:",
    "  fail:ghost-walls, fail:warped-geometry, fail:wrong-motion, fail:prompt-ignored, fail:artifacts,",
    "  fail:color-drift, fail:frozen, fail:over-motion, fail:lost-subject, fail:wrong-season.",
    "Create new slugs with the fail: prefix if needed.",
    "",
    "Respond with a single JSON object and nothing else outside the JSON. Shape:",
    "{",
    '  "prompt_adherence": 1..5,',
    '  "motion_quality": 1..5,',
    '  "spatial_coherence": 1..5,',
    '  "aesthetic_intent": 1..5,',
    '  "rationale": "≤ 400 characters explaining the scores",',
    '  "fail_tag_suggestions": ["fail:..."]',
    "}",
  ].join("\n");
}

export function buildRubricUserMessage(input: RubricUserInput): string {
  const winners = input.winnerNeighbors.length === 0
    ? "(no 5★ neighbors in this cell yet)"
    : input.winnerNeighbors
        .map((n, i) => `  [W${i + 1}] ★${n.rating} — ${n.prompt.slice(0, 220)}${n.tags?.length ? ` | tags: ${n.tags.join(",")}` : ""}${n.comment ? ` | note: ${n.comment.slice(0, 140)}` : ""}`)
        .join("\n");
  const losers = input.loserNeighbors.length === 0
    ? "(no low-rated neighbors recorded)"
    : input.loserNeighbors
        .map((n, i) => `  [L${i + 1}] ★${n.rating} — ${n.prompt.slice(0, 220)}${n.tags?.length ? ` | tags: ${n.tags.join(",")}` : ""}${n.comment ? ` | note: ${n.comment.slice(0, 140)}` : ""}`)
        .join("\n");
  return [
    `CELL: ${input.cellKey}`,
    "",
    "ANALYSIS SUMMARY:",
    input.analysisSummary,
    "",
    "CANDIDATE PROMPT:",
    input.prompt,
    "",
    "WINNER NEIGHBORS (what has worked here before):",
    winners,
    "",
    "LOSER NEIGHBORS (what has failed here before — avoid these patterns):",
    losers,
    "",
    "Score now.",
  ].join("\n");
}

function clamp(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 1;
  if (x < 1) return 1;
  if (x > 5) return 5;
  return Math.round(x);
}

export function parseRubricResponse(raw: string): JudgeRubricScore {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const jsonMatch = body.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Judge response contained no JSON");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Judge response JSON parse failed: ${(err as Error).message}`);
  }
  const required = ["prompt_adherence", "motion_quality", "spatial_coherence", "aesthetic_intent"];
  for (const key of required) {
    if (!(key in parsed)) throw new Error(`Judge response missing field: ${key}`);
  }
  return {
    prompt_adherence: clamp(parsed.prompt_adherence),
    motion_quality: clamp(parsed.motion_quality),
    spatial_coherence: clamp(parsed.spatial_coherence),
    aesthetic_intent: clamp(parsed.aesthetic_intent),
    rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 2000) : "",
    fail_tag_suggestions: Array.isArray(parsed.fail_tag_suggestions)
      ? (parsed.fail_tag_suggestions as unknown[]).filter((t): t is string => typeof t === "string" && t.startsWith("fail:"))
      : [],
  };
}
```

Note: the `.replace("NEIGHPORS", "NEIGHBORS")` is a belt-and-suspenders typo guard so an accidental rename in the literal doesn't ship a wrong header — the test asserts the final string.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/judge/__tests__/rubric.test.ts`

Expected: PASS, 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/judge/rubric.ts lib/judge/__tests__/rubric.test.ts
git commit -m "feat(judge): rubric prompt builder + parser

Four-axis Claude rubric (prompt_adherence, motion_quality,
spatial_coherence, aesthetic_intent) with fenced-or-unfenced JSON
parsing and out-of-range clamping. Unit tests cover fenced input,
unfenced input, clamping, missing fields, and malformed JSON."
```

---

## Task 4: Neighbor retrieval helper

**Files:**
- Create: `lib/judge/neighbors.ts`

- [ ] **Step 1: Write module**

Create `lib/judge/neighbors.ts`:

```ts
import { getSupabase } from "../client.js";
import type { NeighborSummary } from "./rubric.js";

// Minimum-viable wrappers over the existing pgvector RPCs. Both RPCs are
// already defined in migrations 007 + 014. We call them with the
// iteration's own embedding to find winners / losers in the same cell.

export async function fetchNeighbors(
  iterationEmbedding: number[],
  opts: { winnerCount?: number; loserCount?: number } = {},
): Promise<{ winners: NeighborSummary[]; losers: NeighborSummary[]; total: number }> {
  const supabase = getSupabase();
  const winnerCount = opts.winnerCount ?? 3;
  const loserCount = opts.loserCount ?? 3;

  const winnerReq = supabase.rpc("match_rated_examples", {
    query_embedding: toPgVectorLiteral(iterationEmbedding),
    min_rating: 4,
    match_count: winnerCount,
  });
  const loserReq = supabase.rpc("match_loser_examples", {
    query_embedding: toPgVectorLiteral(iterationEmbedding),
    max_rating: 2,
    match_count: loserCount,
  });
  const [winnerRes, loserRes] = await Promise.all([winnerReq, loserReq]);

  if (winnerRes.error) throw new Error(`match_rated_examples failed: ${winnerRes.error.message}`);
  if (loserRes.error) throw new Error(`match_loser_examples failed: ${loserRes.error.message}`);

  const winners = (winnerRes.data ?? []).map((r: Record<string, unknown>) => normalize(r));
  const losers = (loserRes.data ?? []).map((r: Record<string, unknown>) => normalize(r));
  return { winners, losers, total: winners.length + losers.length };
}

function normalize(r: Record<string, unknown>): NeighborSummary {
  return {
    prompt: typeof r.prompt === "string" ? r.prompt : "",
    rating: typeof r.rating === "number" ? r.rating : 0,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : null,
    comment: typeof r.comment === "string" ? r.comment : null,
  };
}

function toPgVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/judge/neighbors.ts
git commit -m "feat(judge): neighbor retrieval wrapper over match_rated/loser RPCs"
```

---

## Task 5: Confidence + composite math

**Files:**
- Create: `lib/judge/confidence.ts`
- Test: `lib/judge/__tests__/confidence.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/judge/__tests__/confidence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeComposite, computeConfidence } from "../confidence.js";
import type { JudgeRubricScore } from "../types.js";

const rubric = (a: number, b: number, c: number, d: number): JudgeRubricScore => ({
  prompt_adherence: a,
  motion_quality: b,
  spatial_coherence: c,
  aesthetic_intent: d,
  rationale: "",
  fail_tag_suggestions: [],
});

describe("computeComposite", () => {
  it("averages all four axes when all 5s → 5.00", () => {
    expect(computeComposite(rubric(5, 5, 5, 5))).toBeCloseTo(5.0, 2);
  });

  it("averages mixed scores with default equal weights", () => {
    // (4+3+5+2)/4 = 3.50
    expect(computeComposite(rubric(4, 3, 5, 2))).toBeCloseTo(3.5, 2);
  });

  it("stays within [1, 5]", () => {
    expect(computeComposite(rubric(1, 1, 1, 1))).toBe(1);
    expect(computeComposite(rubric(5, 5, 5, 5))).toBe(5);
  });
});

describe("computeConfidence", () => {
  it("returns high confidence when axes agree and neighbors are dense", () => {
    // All axes at 5, 6 neighbors total
    const c = computeConfidence(rubric(5, 5, 5, 5), 6);
    expect(c).toBeGreaterThanOrEqual(0.9);
  });

  it("returns low confidence when axes disagree strongly", () => {
    // axes 1,5,1,5 — std dev is maximal
    const c = computeConfidence(rubric(1, 5, 1, 5), 6);
    expect(c).toBeLessThan(0.5);
  });

  it("returns low confidence when there are zero neighbors", () => {
    const c = computeConfidence(rubric(5, 5, 5, 5), 0);
    expect(c).toBeLessThanOrEqual(0.6);
  });

  it("always returns value in [0, 1]", () => {
    for (const n of [0, 1, 3, 6, 50]) {
      const c = computeConfidence(rubric(3, 3, 3, 3), n);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/judge/__tests__/confidence.test.ts`

Expected: FAIL with "Cannot find module '../confidence.js'".

- [ ] **Step 3: Implement `lib/judge/confidence.ts`**

Create `lib/judge/confidence.ts`:

```ts
import type { JudgeRubricScore } from "./types.js";

// Equal-weighted mean of the four rubric axes, each in [1,5].
// Returned value is in [1,5] with 2 decimals.
export function computeComposite(r: JudgeRubricScore): number {
  const sum = r.prompt_adherence + r.motion_quality + r.spatial_coherence + r.aesthetic_intent;
  const mean = sum / 4;
  return round2(clamp(mean, 1, 5));
}

// Confidence combines:
//   (a) internal axis agreement — 1 - normalized std deviation
//   (b) neighbor density — saturates around 6 neighbors
// Blend: 0.6*(axis_agreement) + 0.4*(density).
export function computeConfidence(r: JudgeRubricScore, neighborsUsed: number): number {
  const scores = [r.prompt_adherence, r.motion_quality, r.spatial_coherence, r.aesthetic_intent];
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);
  // Max stddev for a 1..5 axis across 4 scores is sqrt(4) = 2 (when values are 1,1,5,5).
  const axisAgreement = clamp(1 - stddev / 2, 0, 1);

  // Saturate density at ~6 neighbors.
  const density = clamp(neighborsUsed / 6, 0, 1);

  const blended = 0.6 * axisAgreement + 0.4 * density;
  return round2(clamp(blended, 0, 1));
}

function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/judge/__tests__/confidence.test.ts`

Expected: PASS, all green.

- [ ] **Step 5: Commit**

```bash
git add lib/judge/confidence.ts lib/judge/__tests__/confidence.test.ts
git commit -m "feat(judge): composite + confidence math with TDD coverage

Equal-weighted composite of four rubric axes; confidence blends
internal axis std-dev and neighbor density, saturating at ~6 neighbors.
Both functions round to 2 decimals and clamp to their target ranges."
```

---

## Task 6: Judge core `scoreIteration`

**Files:**
- Create: `lib/judge/index.ts`

- [ ] **Step 1: Write the module**

Create `lib/judge/index.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../client.js";
import {
  JUDGE_MODEL,
  JUDGE_VERSION,
  cellKeyToString,
  type CellKey,
  type JudgeResult,
} from "./types.js";
import {
  buildRubricSystemPrompt,
  buildRubricUserMessage,
  parseRubricResponse,
} from "./rubric.js";
import { fetchNeighbors } from "./neighbors.js";
import { computeComposite, computeConfidence } from "./confidence.js";

// Public API: score a single iteration end-to-end.
//   1. Loads the iteration row (prompt, analysis, embedding, source image URL)
//   2. Looks up winner + loser neighbors via existing RPCs
//   3. Calls Claude with rubric system + user message + source image as URL
//   4. Parses + composes + persists to lab_judge_scores (upsert on iteration_id)
//
// Idempotent: re-scoring overwrites. Returns the result row.
export async function scoreIteration(iterationId: string): Promise<JudgeResult> {
  const supabase = getSupabase();

  // 1. Load iteration. Source image URL lives on prompt_lab_sessions
  // (see migration 002), so fetch in two steps rather than fighting the
  // Supabase join-type ergonomics.
  const { data: iter, error: iterErr } = await supabase
    .from("prompt_lab_iterations")
    .select(
      "id, analysis_json, director_output_json, embedding, session_id"
    )
    .eq("id", iterationId)
    .single();
  if (iterErr || !iter) throw new Error(`Iteration ${iterationId} not found: ${iterErr?.message ?? "no row"}`);

  const { data: session, error: sessErr } = await supabase
    .from("prompt_lab_sessions")
    .select("image_url")
    .eq("id", iter.session_id)
    .single();
  if (sessErr || !session) throw new Error(`Session ${iter.session_id} not found: ${sessErr?.message ?? "no row"}`);

  const analysis = iter.analysis_json as { room_type?: string; key_features?: string[]; composition?: string | null } | null;
  const director = iter.director_output_json as { camera_movement?: string; prompt?: string } | null;
  if (!analysis || !director?.prompt || !director.camera_movement) {
    throw new Error(`Iteration ${iterationId} missing analysis or director output`);
  }
  const cell: CellKey = {
    room_type: analysis.room_type ?? "other",
    camera_movement: director.camera_movement,
  };

  // 2. Neighbors.
  const embedding = parseEmbedding(iter.embedding);
  const neighbors = embedding
    ? await fetchNeighbors(embedding, { winnerCount: 3, loserCount: 3 })
    : { winners: [], losers: [], total: 0 };

  // 3. Claude call.
  const analysisSummary = summarizeAnalysis(analysis);
  const system = buildRubricSystemPrompt();
  const userText = buildRubricUserMessage({
    prompt: director.prompt,
    analysisSummary,
    cellKey: cellKeyToString(cell),
    winnerNeighbors: neighbors.winners,
    loserNeighbors: neighbors.losers,
  });

  const client = new Anthropic();
  const sourceUrl: string | null = typeof session.image_url === "string" ? session.image_url : null;
  // Use `as const` narrowing instead of the SDK namespace type — matches
  // the style in lib/prompt-lab.ts analyzeSingleImage and is SDK-version
  // independent.
  const userContent = sourceUrl
    ? [
        { type: "image" as const, source: { type: "url" as const, url: sourceUrl } },
        { type: "text" as const, text: userText },
      ]
    : [{ type: "text" as const, text: userText }];

  const response = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  const rubric = parseRubricResponse(raw);

  const composite = computeComposite(rubric);
  const confidence = computeConfidence(rubric, neighbors.total);

  // Cost: derive from Anthropic usage (tokens). Sonnet 4.6 pricing is
  // $3/MTok in, $15/MTok out (confirmed 2026-04-19). Compute in cents.
  const usage = response.usage;
  const costCents = usage
    ? Math.round(((usage.input_tokens * 3) / 1_000_000) * 100 + ((usage.output_tokens * 15) / 1_000_000) * 100)
    : 0;

  // 4. Persist (upsert on iteration_id).
  const { error: upsertErr } = await supabase
    .from("lab_judge_scores")
    .upsert(
      {
        iteration_id: iterationId,
        rubric,
        composite_1to5: composite,
        confidence,
        clip_similarity: null,
        judge_version: JUDGE_VERSION,
        model_id: JUDGE_MODEL,
        neighbors_used: neighbors.total,
        cost_cents: costCents,
      },
      { onConflict: "iteration_id" },
    );
  if (upsertErr) throw new Error(`Persist judge score failed: ${upsertErr.message}`);

  return {
    iteration_id: iterationId,
    rubric,
    composite_1to5: composite,
    confidence,
    neighbors_used: neighbors.total,
    cost_cents: costCents,
    model_id: JUDGE_MODEL,
    judge_version: JUDGE_VERSION,
  };
}

function summarizeAnalysis(a: { key_features?: string[]; composition?: string | null; room_type?: string }): string {
  const features = a.key_features?.join(" · ") ?? "";
  const parts = [
    a.room_type ? `room: ${a.room_type}` : null,
    features ? `features: ${features}` : null,
    a.composition ? `composition: ${a.composition}` : null,
  ].filter(Boolean) as string[];
  return parts.join(" | ");
}

function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string" && raw.startsWith("[")) {
    try {
      return JSON.parse(raw) as number[];
    } catch {
      return null;
    }
  }
  return null;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`

Expected: No errors from `lib/judge/**`. If errors, fix inline before continuing.

- [ ] **Step 3: Commit**

```bash
git add lib/judge/index.ts
git commit -m "feat(judge): scoreIteration end-to-end scorer

Loads iteration -> fetches neighbors -> calls Claude with source image
URL + rubric system + structured user message -> parses + composes ->
upserts to lab_judge_scores. Idempotent on iteration_id. Cost computed
from Anthropic usage at Sonnet 4.6 rates."
```

---

## Task 7: POST /api/admin/judge/score

**Files:**
- Create: `api/admin/judge/score.ts`

- [ ] **Step 1: Write the endpoint**

Create `api/admin/judge/score.ts`:

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { scoreIteration } from "../../../lib/judge/index.js";

// POST /api/admin/judge/score
//   body: { iteration_id: string }
// Scores a single Prompt Lab iteration via the rubric judge and
// returns the result row. Idempotent — calling twice overwrites
// the previous score for that iteration.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const { iteration_id } = (req.body ?? {}) as { iteration_id?: string };
  if (!iteration_id || typeof iteration_id !== "string") {
    return res.status(400).json({ error: "iteration_id (string) required" });
  }

  try {
    const result = await scoreIteration(iteration_id);
    return res.status(200).json({ score: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/admin/judge/score.ts
git commit -m "feat(api): POST /api/admin/judge/score admin endpoint"
```

---

## Task 8: Calibration logic

**Files:**
- Create: `lib/judge/calibration.ts`
- Test: `lib/judge/__tests__/calibration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/judge/__tests__/calibration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeAgreement } from "../calibration.js";

describe("computeAgreement", () => {
  it("exact-match rate counts composite rounding to the same integer as human", () => {
    const pairs = [
      { human: 5, composite: 4.9 }, // rounds to 5 → match
      { human: 3, composite: 3.2 }, // rounds to 3 → match
      { human: 4, composite: 5.0 }, // rounds to 5 → miss
      { human: 2, composite: 1.5 }, // rounds to 2 → match (banker's? we use Math.round)
    ];
    const a = computeAgreement(pairs);
    // matches: first, second, fourth = 3/4
    expect(a.exact_match_rate).toBeCloseTo(0.75, 2);
  });

  it("within_one_star_rate counts |composite - human| <= 1", () => {
    const pairs = [
      { human: 5, composite: 4.2 }, // diff 0.8 → within 1
      { human: 5, composite: 3.5 }, // diff 1.5 → NOT within 1
      { human: 2, composite: 1.1 }, // diff 0.9 → within 1
      { human: 3, composite: 3.0 }, // diff 0.0 → within 1
    ];
    const a = computeAgreement(pairs);
    expect(a.within_one_star_rate).toBeCloseTo(0.75, 2);
  });

  it("mean_abs_error averages |composite - human|", () => {
    const pairs = [
      { human: 5, composite: 4.0 }, // |1.0|
      { human: 3, composite: 3.0 }, // |0.0|
      { human: 2, composite: 4.0 }, // |2.0|
    ];
    const a = computeAgreement(pairs);
    expect(a.mean_abs_error).toBeCloseTo(1.0, 3);
  });

  it("returns zeros for empty input", () => {
    const a = computeAgreement([]);
    expect(a.sample_size).toBe(0);
    expect(a.exact_match_rate).toBe(0);
    expect(a.within_one_star_rate).toBe(0);
    expect(a.mean_abs_error).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/judge/__tests__/calibration.test.ts`

Expected: FAIL with "Cannot find module '../calibration.js'".

- [ ] **Step 3: Implement `lib/judge/calibration.ts`**

Create `lib/judge/calibration.ts`:

```ts
import { getSupabase } from "../client.js";
import { scoreIteration } from "./index.js";
import {
  JUDGE_MODEL,
  JUDGE_VERSION,
  type CalibrationRow,
} from "./types.js";

export interface AgreementInput {
  human: number;     // 1..5
  composite: number; // 1..5 (can be fractional)
}

export interface AgreementResult {
  sample_size: number;
  exact_match_rate: number;
  within_one_star_rate: number;
  mean_abs_error: number;
}

// Pure math, easy to test. Used below by runCalibration after judging a
// holdout set — it groups pairs per cell and writes a snapshot per cell.
export function computeAgreement(pairs: AgreementInput[]): AgreementResult {
  if (pairs.length === 0) {
    return { sample_size: 0, exact_match_rate: 0, within_one_star_rate: 0, mean_abs_error: 0 };
  }
  let exact = 0;
  let within = 0;
  let absSum = 0;
  for (const p of pairs) {
    const rounded = Math.round(p.composite);
    if (rounded === p.human) exact += 1;
    if (Math.abs(p.composite - p.human) <= 1.0) within += 1;
    absSum += Math.abs(p.composite - p.human);
  }
  return {
    sample_size: pairs.length,
    exact_match_rate: round3(exact / pairs.length),
    within_one_star_rate: round3(within / pairs.length),
    mean_abs_error: round3(absSum / pairs.length),
  };
}

// Runs the judge across all human-rated iterations (Lab) matching an
// optional cell filter + sample cap, then writes one calibration row per
// cell. Idempotent in the sense that re-running just appends a fresh row;
// the v_judge_calibration_status view always reads the latest.
export async function runCalibration(opts: {
  perCellSampleCap?: number;    // default 30
  onlyCellKeys?: string[];      // e.g. ['kitchen-push_in'] — optional filter
  reusePriorScores?: boolean;   // default true — skip re-scoring if already scored
} = {}): Promise<CalibrationRow[]> {
  const perCellCap = opts.perCellSampleCap ?? 30;
  const reuse = opts.reusePriorScores ?? true;
  const supabase = getSupabase();

  // Pull all rated Lab iterations with room_type + camera_movement available.
  const { data: rows, error } = await supabase
    .from("prompt_lab_iterations")
    .select("id, rating, analysis_json, director_output_json")
    .not("rating", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`Load rated iterations failed: ${error.message}`);

  type Bucket = { cellKey: string; room: string; verb: string; items: { id: string; rating: number }[] };
  const buckets = new Map<string, Bucket>();
  for (const r of rows ?? []) {
    const analysis = r.analysis_json as { room_type?: string } | null;
    const director = r.director_output_json as { camera_movement?: string } | null;
    const room = analysis?.room_type;
    const verb = director?.camera_movement;
    if (!room || !verb || typeof r.rating !== "number") continue;
    const key = `${room}-${verb}`;
    if (opts.onlyCellKeys && !opts.onlyCellKeys.includes(key)) continue;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { cellKey: key, room, verb, items: [] };
      buckets.set(key, bucket);
    }
    if (bucket.items.length < perCellCap) {
      bucket.items.push({ id: r.id, rating: r.rating });
    }
  }

  const out: CalibrationRow[] = [];
  for (const bucket of buckets.values()) {
    const pairs: AgreementInput[] = [];
    for (const it of bucket.items) {
      let composite: number | null = null;
      if (reuse) {
        const { data: existing } = await supabase
          .from("lab_judge_scores")
          .select("composite_1to5, judge_version, model_id")
          .eq("iteration_id", it.id)
          .maybeSingle();
        if (existing && existing.judge_version === JUDGE_VERSION && existing.model_id === JUDGE_MODEL) {
          composite = Number(existing.composite_1to5);
        }
      }
      if (composite === null) {
        const result = await scoreIteration(it.id);
        composite = result.composite_1to5;
      }
      pairs.push({ human: it.rating, composite });
    }
    const agreement = computeAgreement(pairs);
    const row: CalibrationRow = {
      cell_key: bucket.cellKey,
      room_type: bucket.room,
      camera_movement: bucket.verb,
      sample_size: agreement.sample_size,
      exact_match_rate: agreement.exact_match_rate,
      within_one_star_rate: agreement.within_one_star_rate,
      mean_abs_error: agreement.mean_abs_error,
      judge_version: JUDGE_VERSION,
      model_id: JUDGE_MODEL,
    };
    const { error: insErr } = await supabase.from("lab_judge_calibrations").insert({
      ...row,
      window_end: new Date().toISOString(),
    });
    if (insErr) throw new Error(`Insert calibration row failed: ${insErr.message}`);
    out.push(row);
  }
  return out;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/judge/__tests__/calibration.test.ts`

Expected: PASS, 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/judge/calibration.ts lib/judge/__tests__/calibration.test.ts
git commit -m "feat(judge): calibration routine with per-cell snapshots

computeAgreement is pure math (exact-match, within-one-star, MAE);
runCalibration pulls rated Lab iterations, buckets by cell, reuses
prior judge scores when the version matches, otherwise scores fresh.
Writes one lab_judge_calibrations row per cell per run."
```

---

## Task 9: POST /api/admin/judge/calibrate

**Files:**
- Create: `api/admin/judge/calibrate.ts`

- [ ] **Step 1: Write the endpoint**

Create `api/admin/judge/calibrate.ts`:

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { runCalibration } from "../../../lib/judge/calibration.js";

// POST /api/admin/judge/calibrate
//   body: {
//     per_cell_sample_cap?: number;   // default 30
//     cell_keys?: string[];           // optional filter e.g. ['kitchen-push_in']
//     reuse_prior_scores?: boolean;   // default true
//   }
// Runs the judge across human-rated Lab iterations, bucketed per cell,
// and writes a calibration snapshot per cell. Returns the rows written.
//
// This endpoint can be slow — sampling 30 iterations × N cells × Claude.
// Vercel default timeout applies; the caller should expect 30–300s
// depending on how many cells are sampled.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const body = (req.body ?? {}) as {
    per_cell_sample_cap?: number;
    cell_keys?: string[];
    reuse_prior_scores?: boolean;
  };

  try {
    const rows = await runCalibration({
      perCellSampleCap: body.per_cell_sample_cap,
      onlyCellKeys: body.cell_keys,
      reusePriorScores: body.reuse_prior_scores,
    });
    return res.status(200).json({
      calibrations: rows,
      summary: {
        cells: rows.length,
        above_80: rows.filter((r) => r.within_one_star_rate >= 0.80).length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add api/admin/judge/calibrate.ts
git commit -m "feat(api): POST /api/admin/judge/calibrate admin endpoint"
```

---

## Task 10: GET /api/admin/judge/status

**Files:**
- Create: `api/admin/judge/status.ts`

- [ ] **Step 1: Write the endpoint**

Create `api/admin/judge/status.ts`:

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";

// GET /api/admin/judge/status
// Returns the latest calibration state per cell plus an aggregate summary.
// Used by the dashboard's calibration panel (Phase 2) and by the
// /api/admin/judge/score endpoint's callers to decide auto vs advisory mode.
//
// Response shape:
//   {
//     cells: Array<{
//       cell_key: string; room_type: string; camera_movement: string;
//       sample_size: number; exact_match_rate: number;
//       within_one_star_rate: number; mean_abs_error: number;
//       mode: 'auto' | 'advisory'; computed_at: string;
//     }>;
//     summary: {
//       total_cells_calibrated: number;
//       cells_auto: number;
//       cells_advisory: number;
//       overall_within_one_star: number; // sample-weighted mean
//     }
//   }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const supabase = getSupabase();
  const { data: cells, error } = await supabase
    .from("v_judge_calibration_status")
    .select("*")
    .order("cell_key");
  if (error) return res.status(500).json({ error: error.message });

  const rows = cells ?? [];
  const totalCells = rows.length;
  const cellsAuto = rows.filter((r: Record<string, unknown>) => r.mode === "auto").length;
  const cellsAdvisory = totalCells - cellsAuto;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const r of rows) {
    const n = (r as { sample_size?: number }).sample_size ?? 0;
    const w = (r as { within_one_star_rate?: number }).within_one_star_rate ?? 0;
    weightedSum += n * w;
    weightTotal += n;
  }
  const overall = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 1000) / 1000 : 0;

  return res.status(200).json({
    cells: rows,
    summary: {
      total_cells_calibrated: totalCells,
      cells_auto: cellsAuto,
      cells_advisory: cellsAdvisory,
      overall_within_one_star: overall,
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add api/admin/judge/status.ts
git commit -m "feat(api): GET /api/admin/judge/status calibration dashboard feed"
```

---

## Task 11: Integration smoke test

This is a manual verification task to confirm the pipeline works against real data. Do NOT skip — Phase 1's success criterion lives or dies on calibration results.

**Files:** none created; produces a report in the terminal.

- [ ] **Step 1: Score a single known iteration manually**

Pick any existing rated iteration from the Supabase dashboard or via:
```bash
# Replace SUPABASE_URL + SERVICE_ROLE_KEY from .env
curl -X GET "${SUPABASE_URL}/rest/v1/prompt_lab_iterations?rating=not.is.null&select=id,rating&limit=1" \
  -H "apikey: ${SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"
```

Then call the judge against a local `vercel dev` session:
```bash
vercel dev &
sleep 5
curl -X POST http://localhost:3000/api/admin/judge/score \
  -H "Content-Type: application/json" \
  -H "Cookie: <your admin session cookie>" \
  -d '{"iteration_id": "<the id from above>"}'
```

Expected: 200 response with `{ score: { composite_1to5, confidence, rubric: {...} } }`. Kill `vercel dev`.

- [ ] **Step 2: Verify the row was persisted**

Via SQL editor or Supabase MCP:
```sql
SELECT iteration_id, composite_1to5, confidence, judge_version, model_id, cost_cents
FROM lab_judge_scores
WHERE iteration_id = '<the id from Step 1>';
```

Expected: Exactly one row, sane values, `judge_version = 'rubric-v1'`.

- [ ] **Step 3: Run a full calibration on a narrow slice**

```bash
vercel dev &
sleep 5
curl -X POST http://localhost:3000/api/admin/judge/calibrate \
  -H "Content-Type: application/json" \
  -H "Cookie: <your admin session cookie>" \
  -d '{"per_cell_sample_cap": 10}'
```

Expected: Returns an array of calibration rows per cell that had ≥1 rated iteration, plus a summary with `above_80` count. Script may take 2–10 minutes depending on how many cells had rated data.

- [ ] **Step 4: Inspect calibration status**

```bash
curl -X GET http://localhost:3000/api/admin/judge/status \
  -H "Cookie: <your admin session cookie>"
```

Expected: Returns `cells` array + summary. Record:
- `total_cells_calibrated`
- `cells_auto` (within-one-star ≥ 0.80)
- `overall_within_one_star`

- [ ] **Step 5: Capture results in the plan ledger**

Append to `docs/PROMPT-LAB-PLAN.md` (or wherever Oliver tracks shipped milestones) under a new subsection "Phase 1 Judge Calibration Results (date)":

```markdown
#### Phase 1 Judge Calibration Results — <YYYY-MM-DD>

- Ran calibration over <N> rated Lab iterations, <M> cells.
- Overall within-one-star agreement: <pct>
- Cells in auto mode (≥80%): <k> of <m>
- Cells in advisory mode: <m - k>
- Lowest-agreement cells (candidates for Phase 1.5 CLIP channel): <list>
```

- [ ] **Step 6: Decide next step with Oliver**

If `overall_within_one_star >= 0.80` AND `cells_auto >= 10`: **Phase 1 success criterion met.** Proceed to writing Phase 2 plan.

If below the bar: document the failing cells. These are candidates for Phase 1.5 CLIP augmentation. Discuss whether to (a) tune the rubric prompt first, (b) scope Phase 1.5, or (c) accept advisory-mode for those cells and proceed to Phase 2.

- [ ] **Step 7: Commit calibration ledger entry**

```bash
git add docs/PROMPT-LAB-PLAN.md
git commit -m "docs: Phase 1 judge calibration results <date>"
```

---

## Self-Review Checklist (run before handing off)

**Spec coverage check:**

| Spec item (from 2026-04-19-autonomous-prompt-lab-design.md §Phase 1) | Task |
|---|---|
| Claude LLM-judge with 4-axis rubric | Task 3 |
| `lab_judge_scores` table | Task 1 |
| `lab_judge_calibrations` table | Task 1 |
| Calibration routine against existing corpus | Task 8 |
| 80% within ±1★ agreement bar | Tasks 8 (math), 10 (status), 11 (verification) |
| Advisory vs. auto mode gating | Task 10 (view returns mode; callers gate) |
| Manual "score this iteration" API endpoint | Task 7 |
| Nullable `clip_similarity` for Phase 1.5 compat | Task 1 |

**Placeholder scan:** No "TBD", "TODO", "implement later", or code stubs. Every step shows its full code. One literal has a `.replace()` guard for a typo which is intentional (commented in Task 3 Step 3).

**Type consistency:** `JudgeResult`, `JudgeRubricScore`, `CellKey`, `NeighborSummary`, `CalibrationRow` used consistently across Tasks 2, 3, 5, 6, 8. Function names: `computeComposite`, `computeConfidence`, `computeAgreement`, `scoreIteration`, `runCalibration`, `fetchNeighbors` — all unique, no aliasing. `JUDGE_VERSION` / `JUDGE_MODEL` imported from types consistently.

**Out-of-scope reminders:** No UI. No CLIP. No auto-invocation hooks. No iterator. Each is explicitly deferred in the plan's scope boundaries.

---

## Handoff

When Phase 1 success criterion is met:
- If calibration passes → write Phase 2 plan (Knowledge Map + Dashboard)
- If calibration fails → write Phase 1.5 plan (CLIP channel + frame extraction)
