# Spatial Grounding + Unified Embeddings — Implementation Plan

> **STATUS: PAUSED (2026-04-15).** The unified-embeddings half of this plan has been extracted and is being executed separately — see `2026-04-15-unified-embeddings.md`. The spatial-grounding half (Tasks 2, 3, 4, 5, 9 in this document) is shelved pending outcome of unified embeddings. Do NOT execute this plan as-is; the scenes + RPC pieces will already be in place when spatial work resumes. When resuming, re-read the spec and produce a spatial-only plan rather than running this document top-to-bottom.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the director where the camera is and what motions are physically possible from that pose, and unify production scene ratings with Lab iterations in a single retrieval pool so every piece of feedback teaches both environments.

**Architecture:** Widen per-photo analysis with `camera_pose`, `depth_zones`, `motion_viability` produced by the existing Claude Sonnet 4.6 vision pass. Persist as a single `photos.spatial_analysis` JSONB column. Director filters verb choice against `motion_viability[].viable === true` and emits `rationale` + `predicted_end_frame` on every scene. Separately, add `embedding vector(1536)` to `scenes`, embed on insert, backfill rated scenes, and replace `match_lab_iterations` with a unified `match_rated_examples` RPC that pools Lab iterations and rated production scenes.

**Tech Stack:** TypeScript ESM, Vite + React 18 frontend (untouched), Vercel Serverless Functions, Supabase Postgres (pgvector HNSW), Anthropic Claude Sonnet 4.6 vision, OpenAI `text-embedding-3-small`, Vitest (new, for pure-function tests).

**Reference spec:** `docs/superpowers/specs/2026-04-15-spatial-grounding-design.md`

**Out of scope (do not touch):** Shotstack / assembly / music / voiceover / branding / variant rendering / UI / Lab-to-prod promotion / renames. Explicitly deferred until clips clear the user's quality bar.

---

## Working Rules

- Commit after every task with a message prefixed `spatial:` (e.g. `spatial: add migration 009 schema + unified RPC`)
- Local commits only. Do NOT `git push`, do NOT `vercel deploy`. User gives explicit go on ship.
- DB changes via Supabase MCP `apply_migration` against project `vrhmaeywqsohlztoouxu` when ready to apply; file in `supabase/migrations/` is the record of truth.
- Keep every change inside the existing module boundaries; do not restructure unrelated files.
- If actual schema differs from what this plan assumes (e.g. `scenes` table has different column names), halt and surface the delta before editing — do not guess.

---

## File Structure

**New**
- `supabase/migrations/009_spatial_grounding_and_unified_embeddings.sql` — widen photos + scenes + scene_ratings, add HNSW index, add unified RPC
- `lib/prompts/spatial-schema.ts` — zod/TS types for `SpatialAnalysis` (camera_pose, depth_zones, motion_viability) + the inline schema string reused in prompts
- `scripts/backfill-scene-embeddings.ts` — one-shot idempotent backfill over rated production scenes
- `scripts/eval-spatial-grounding.ts` — fixture harness that runs analysis + director on 20 held-out photos and reports viability-compliance %
- `fixtures/spatial-grounding/photos.json` — manifest of held-out test photos (storage URLs + expected-viable-verb annotations, human-curated)
- `tests/director-viability.test.ts` — Vitest unit tests for the viability filter logic
- `vitest.config.ts` — minimal Vitest config

**Modified**
- `lib/prompts/photo-analysis.ts` — extend `PhotoAnalysisResult`, widen JSON schema emitted by `PHOTO_ANALYSIS_SYSTEM`
- `lib/prompts/director.ts` — extend `DirectorSceneOutput` with `rationale` + `predicted_end_frame`; rewrite verb-selection rules around viability; widen `buildDirectorUserPrompt` input type
- `lib/pipeline.ts` — persist spatial_analysis on `updatePhotoAnalysis`, pass spatial fields into `buildDirectorUserPrompt`, embed each scene on insert
- `lib/db.ts` — extend `updatePhotoAnalysis` to write `spatial_analysis`, add `embedSceneOnInsert` helper, add `matchRatedExamples` thin wrapper
- `lib/prompt-lab.ts` — swap retrieval RPC from `match_lab_iterations` to `match_rated_examples`
- `lib/embeddings.ts` — extend `buildAnalysisText` to include spatial fields so embeddings reflect spatial fingerprint
- `package.json` — add `vitest` devDependency + `test` script

---

## Task 0: Install Vitest + write one smoke test

**Why first:** downstream tasks assume a working test runner. Keep scope minimal; we're not rewriting the test strategy for the whole repo.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Add vitest to package.json**

Run:
```bash
cd /Users/oliverhelgemo/real-estate-pipeline
npm i -D vitest@^1.6.0
```

Then add to `package.json` `scripts` block:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
```

- [ ] **Step 3: Create `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: `1 passed` for `tests/smoke.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/smoke.test.ts
git commit -m "spatial: add vitest + smoke test"
```

---

## Task 1: Migration 009 — schema + unified RPC

**Files:**
- Create: `supabase/migrations/009_spatial_grounding_and_unified_embeddings.sql`

**Before editing:** inspect the actual `photos` and `scenes` table columns to confirm they do not already have `spatial_analysis` / `embedding`. Run via Supabase MCP `list_tables` against project `vrhmaeywqsohlztoouxu`. If the tables have different names, halt and surface.

- [ ] **Step 1: Write the migration**

`supabase/migrations/009_spatial_grounding_and_unified_embeddings.sql`:
```sql
-- Spatial grounding + unified embeddings
-- 2026-04-15

-- 1. Photos: spatial analysis JSONB (camera_pose, depth_zones, motion_viability)
alter table public.photos
  add column if not exists spatial_analysis jsonb;

-- 2. Scenes: embedding for unified retrieval
alter table public.scenes
  add column if not exists embedding vector(1536),
  add column if not exists embedding_model text,
  add column if not exists predicted_end_frame text,
  add column if not exists movement_rationale text;

create index if not exists scenes_embedding_hnsw
  on public.scenes using hnsw (embedding vector_cosine_ops);

-- 3. Unified retrieval RPC: pool Lab iterations + rated production scenes
-- Returns top-N examples ordered by rating-weighted cosine distance.
-- Weighting: 5-star entries treated as ~15% closer than 4-star.
create or replace function public.match_rated_examples(
  query_embedding vector(1536),
  min_rating int default 4,
  match_count int default 5
)
returns table (
  source text,               -- 'lab' | 'prod'
  example_id uuid,
  rating int,
  analysis_json jsonb,
  director_output_json jsonb,
  prompt text,
  camera_movement text,
  clip_url text,
  distance float
)
language sql stable as $$
  with lab as (
    select
      'lab'::text as source,
      i.id as example_id,
      i.rating,
      i.analysis_json,
      i.director_output_json,
      null::text as prompt,
      null::text as camera_movement,
      i.clip_url,
      (i.embedding <=> query_embedding) * case when i.rating = 5 then 0.85 else 1.0 end as distance
    from public.prompt_lab_iterations i
    where i.embedding is not null
      and i.rating is not null
      and i.rating >= min_rating
  ),
  prod as (
    select
      'prod'::text as source,
      s.id as example_id,
      r.rating,
      to_jsonb(p.*) - 'embedding' as analysis_json,
      to_jsonb(s.*) - 'embedding' as director_output_json,
      s.prompt,
      s.camera_movement::text,
      s.clip_url,
      (s.embedding <=> query_embedding) * case when r.rating = 5 then 0.85 else 1.0 end as distance
    from public.scenes s
    join public.scene_ratings r on r.scene_id = s.id
    join public.photos p on p.id = s.photo_id
    where s.embedding is not null
      and r.rating >= min_rating
  )
  select * from lab
  union all
  select * from prod
  order by distance asc
  limit match_count;
$$;

grant execute on function public.match_rated_examples(vector, int, int) to authenticated, service_role;
```

- [ ] **Step 2: Apply migration**

Use Supabase MCP:
```
mcp__plugin_supabase_supabase__apply_migration
  project_id: vrhmaeywqsohlztoouxu
  name: 009_spatial_grounding_and_unified_embeddings
  query: <contents of the SQL file above>
```

Expected: success response, no rows affected on ALTER TABLE.

- [ ] **Step 3: Verify columns landed**

Use Supabase MCP `list_tables` and confirm:
- `photos.spatial_analysis jsonb`
- `scenes.embedding vector(1536)`
- `scenes.embedding_model text`
- `scenes.predicted_end_frame text`
- `scenes.movement_rationale text`

- [ ] **Step 4: Verify RPC callable**

Use Supabase MCP `execute_sql`:
```sql
select count(*) from public.match_rated_examples(
  (select embedding from public.prompt_lab_iterations where embedding is not null limit 1),
  4,
  5
);
```
Expected: a row with some count (0 is fine if there are no 4+ rated Lab iterations yet).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/009_spatial_grounding_and_unified_embeddings.sql
git commit -m "spatial: add migration 009 (spatial JSONB + scene embeddings + unified RPC)"
```

---

## Task 2: Spatial schema types + photo-analysis prompt widening

**Files:**
- Create: `lib/prompts/spatial-schema.ts`
- Modify: `lib/prompts/photo-analysis.ts`

- [ ] **Step 1: Create `lib/prompts/spatial-schema.ts`**

```ts
import type { CameraMovement } from "../types";

export type CameraPosition =
  | "doorway"
  | "corner"
  | "mid_room"
  | "hallway"
  | "exterior_ground"
  | "aerial";

export type CameraOrientation =
  | "into_room"
  | "along_wall"
  | "at_corner"
  | "at_feature"
  | "downward";

export type CameraHeight = "eye_level" | "low" | "elevated" | "drone";
export type FovHint = "wide" | "normal" | "tight";

export interface CameraPose {
  position: CameraPosition;
  orientation: CameraOrientation;
  height: CameraHeight;
  fov_hint: FovHint;
}

export type DistanceBucket = "<3" | "3-8" | "8-15" | "15+";

export interface DepthZone {
  content: string;
  est_distance_ft: DistanceBucket;
}

export interface DepthZones {
  foreground: DepthZone | null;
  midground: DepthZone | null;
  background: DepthZone | null;
}

export interface MotionViability {
  verb: CameraMovement;
  viable: boolean;
  rationale: string;
  predicted_end_frame: string | null;
}

export interface SpatialAnalysis {
  camera_pose: CameraPose;
  depth_zones: DepthZones;
  motion_viability: MotionViability[];
}

export const ALL_VERBS: CameraMovement[] = [
  "push_in",
  "pull_out",
  "orbit",
  "parallax",
  "dolly_left_to_right",
  "dolly_right_to_left",
  "reveal",
  "drone_push_in",
  "drone_pull_back",
  "top_down",
  "low_angle_glide",
  "feature_closeup",
];

// Human-readable block injected into the photo-analysis system prompt
// so Claude emits the exact schema. Keep in sync with SpatialAnalysis above.
export const SPATIAL_SCHEMA_BLOCK = `
SPATIAL GROUNDING (REQUIRED for every photo, in addition to existing fields):

"camera_pose": {
  "position": one of ["doorway","corner","mid_room","hallway","exterior_ground","aerial"],
  "orientation": one of ["into_room","along_wall","at_corner","at_feature","downward"],
  "height": one of ["eye_level","low","elevated","drone"],
  "fov_hint": one of ["wide","normal","tight"]
}

"depth_zones": {
  "foreground": { "content": "<what is nearest the lens>", "est_distance_ft": one of ["<3","3-8"] } OR null,
  "midground":  { "content": "<what is in the middle>",   "est_distance_ft": one of ["3-8","8-15"] } OR null,
  "background": { "content": "<what is furthest>",        "est_distance_ft": one of ["8-15","15+"] } OR null
}

"motion_viability": an array with EXACTLY ONE entry per verb in this vocabulary:
  ["push_in","pull_out","orbit","parallax","dolly_left_to_right","dolly_right_to_left","reveal","drone_push_in","drone_pull_back","top_down","low_angle_glide","feature_closeup"]

Each entry:
{
  "verb": "<one of the 12 verbs above>",
  "viable": true | false,
  "rationale": "<one sentence>",
  "predicted_end_frame": "<one sentence> | null"
}

Viability rules:
- A verb is NOT viable if the camera lacks the physical runway (e.g. push_in when foreground is <3ft of a wall).
- reveal is NOT viable unless the foreground content appears in key_features verbatim.
- drone_* and top_down are NOT viable from ground-level interior poses.
- feature_closeup is NOT viable if no single feature dominates the frame.
- Include a short rationale even for non-viable verbs so the director can learn.
`;
```

- [ ] **Step 2: Extend `PhotoAnalysisResult` interface in `lib/prompts/photo-analysis.ts`**

Find the existing interface (around lines 3–25 per the context report). Replace with:
```ts
import type { SpatialAnalysis } from "./spatial-schema";

export interface PhotoAnalysisResult {
  room_type: RoomType;
  quality_score: number;
  aesthetic_score: number;
  depth_rating: DepthRating;
  key_features: string[];
  composition: string;
  suggested_discard: boolean;
  discard_reason: string | null;
  video_viable: boolean;
  suggested_motion: CameraMovement | null;
  motion_rationale: string | null;
  // NEW — spatial grounding
  camera_pose: SpatialAnalysis["camera_pose"];
  depth_zones: SpatialAnalysis["depth_zones"];
  motion_viability: SpatialAnalysis["motion_viability"];
}
```

- [ ] **Step 3: Inject `SPATIAL_SCHEMA_BLOCK` into `PHOTO_ANALYSIS_SYSTEM`**

Import at top of file:
```ts
import { SPATIAL_SCHEMA_BLOCK } from "./spatial-schema";
```

At the tail of the `PHOTO_ANALYSIS_SYSTEM` string (just before the closing backtick), append:
```ts
`
${SPATIAL_SCHEMA_BLOCK}
`
```
Use template-literal concatenation consistent with what is already in the file.

- [ ] **Step 4: Widen the JSON schema example the prompt shows the model**

In the output example (the fenced JSON block around lines 245–271 in the existing file), extend each photo object to include:
```json
  "camera_pose": { "position": "mid_room", "orientation": "into_room", "height": "eye_level", "fov_hint": "wide" },
  "depth_zones": {
    "foreground": { "content": "kitchen island edge", "est_distance_ft": "3-8" },
    "midground":  { "content": "range and hood",      "est_distance_ft": "8-15" },
    "background": { "content": "back wall windows",   "est_distance_ft": "15+" }
  },
  "motion_viability": [
    { "verb": "push_in", "viable": true,  "rationale": "8–15ft runway to range hero",      "predicted_end_frame": "range and hood centered" },
    { "verb": "reveal",  "viable": false, "rationale": "foreground not in key_features",     "predicted_end_frame": null }
    /* ...one row per verb — 12 total */
  ]
```

- [ ] **Step 5: Commit**

```bash
git add lib/prompts/spatial-schema.ts lib/prompts/photo-analysis.ts
git commit -m "spatial: extend photo-analysis schema with camera_pose, depth_zones, motion_viability"
```

---

## Task 3: Persist spatial_analysis through pipeline

**Files:**
- Modify: `lib/db.ts`
- Modify: `lib/pipeline.ts`

- [ ] **Step 1: Extend `updatePhotoAnalysis` signature in `lib/db.ts`**

Locate `updatePhotoAnalysis(id, analysis)` (around lines 320–338). Add to the analysis object:
```ts
camera_pose?: SpatialAnalysis["camera_pose"];
depth_zones?: SpatialAnalysis["depth_zones"];
motion_viability?: SpatialAnalysis["motion_viability"];
```
And persist as a single JSONB blob:
```ts
const spatial_analysis = analysis.camera_pose
  ? {
      camera_pose: analysis.camera_pose,
      depth_zones: analysis.depth_zones,
      motion_viability: analysis.motion_viability,
    }
  : null;

await supabase
  .from("photos")
  .update({
    room_type: analysis.room_type,
    quality_score: analysis.quality_score,
    aesthetic_score: analysis.aesthetic_score,
    depth_rating: analysis.depth_rating,
    key_features: analysis.key_features,
    composition: analysis.composition,
    selected: analysis.selected,
    discard_reason: analysis.discard_reason,
    video_viable: analysis.video_viable,
    suggested_motion: analysis.suggested_motion,
    motion_rationale: analysis.motion_rationale,
    spatial_analysis,
  })
  .eq("id", id);
```

Import at top of file:
```ts
import type { SpatialAnalysis } from "./prompts/spatial-schema";
```

- [ ] **Step 2: Pass spatial fields into the updatePhotoAnalysis call site in `lib/pipeline.ts` `runAnalysis`**

In the block that currently calls `updatePhotoAnalysis` (around line 243), include the new fields from the Claude response:
```ts
await updatePhotoAnalysis(photo.id, {
  room_type: result.room_type,
  quality_score: result.quality_score,
  aesthetic_score: result.aesthetic_score,
  depth_rating: result.depth_rating,
  key_features: result.key_features,
  composition: result.composition,
  selected: !result.suggested_discard,
  discard_reason: result.discard_reason,
  video_viable: result.video_viable,
  suggested_motion: result.suggested_motion,
  motion_rationale: result.motion_rationale,
  camera_pose: result.camera_pose,
  depth_zones: result.depth_zones,
  motion_viability: result.motion_viability,
});
```

- [ ] **Step 3: Build + typecheck**

Run: `npm run build`
Expected: zero TypeScript errors. If `Photo` type elsewhere lacks `spatial_analysis`, add it to `lib/types.ts` `Photo` as `spatial_analysis: SpatialAnalysis | null;`.

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts lib/pipeline.ts lib/types.ts
git commit -m "spatial: persist spatial_analysis JSONB on photos via updatePhotoAnalysis"
```

---

## Task 4: Director viability filter — pure function + unit tests

**Why this task is test-first:** the viability filter is a deterministic pure function over the analysis JSON. This is exactly the kind of logic TDD catches regressions on. Claude's output itself is tested with the fixture harness (Task 9).

**Files:**
- Create: `lib/prompts/director-viability.ts`
- Create: `tests/director-viability.test.ts`
- Modify: `lib/prompts/director.ts`

- [ ] **Step 1: Write the failing test `tests/director-viability.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { viableVerbsForPhoto, enforceViability } from "../lib/prompts/director-viability";
import type { MotionViability } from "../lib/prompts/spatial-schema";

const mv = (verb: string, viable: boolean): MotionViability => ({
  verb: verb as MotionViability["verb"],
  viable,
  rationale: "",
  predicted_end_frame: null,
});

describe("viableVerbsForPhoto", () => {
  it("returns only viable verbs", () => {
    const list: MotionViability[] = [mv("push_in", true), mv("reveal", false), mv("orbit", true)];
    expect(viableVerbsForPhoto(list)).toEqual(["push_in", "orbit"]);
  });

  it("returns full vocab when motion_viability is empty (fail-open)", () => {
    expect(viableVerbsForPhoto([])).toHaveLength(12);
  });
});

describe("enforceViability", () => {
  it("passes a valid director pick through unchanged", () => {
    const list: MotionViability[] = [mv("push_in", true), mv("reveal", false)];
    expect(enforceViability("push_in", list)).toEqual({ ok: true, verb: "push_in" });
  });

  it("rewrites an invalid pick to the first viable fallback", () => {
    const list: MotionViability[] = [mv("reveal", false), mv("push_in", true), mv("orbit", true)];
    expect(enforceViability("reveal", list)).toEqual({ ok: false, verb: "push_in", reason: expect.any(String) });
  });

  it("falls open when nothing is viable", () => {
    const list: MotionViability[] = [mv("reveal", false), mv("push_in", false)];
    expect(enforceViability("reveal", list)).toEqual({ ok: false, verb: "reveal", reason: expect.stringContaining("fallback") });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — module `director-viability` not found.

- [ ] **Step 3: Create `lib/prompts/director-viability.ts`**

```ts
import type { CameraMovement } from "../types";
import type { MotionViability } from "./spatial-schema";
import { ALL_VERBS } from "./spatial-schema";

export function viableVerbsForPhoto(list: MotionViability[] | null | undefined): CameraMovement[] {
  if (!list || list.length === 0) return [...ALL_VERBS];
  return list.filter((m) => m.viable).map((m) => m.verb);
}

export type EnforceResult =
  | { ok: true; verb: CameraMovement }
  | { ok: false; verb: CameraMovement; reason: string };

export function enforceViability(
  pick: CameraMovement,
  list: MotionViability[] | null | undefined,
): EnforceResult {
  const viable = viableVerbsForPhoto(list);
  if (!list || list.length === 0) return { ok: true, verb: pick };
  if (viable.includes(pick)) return { ok: true, verb: pick };
  if (viable.length === 0) {
    return { ok: false, verb: pick, reason: "no viable verbs; falling open to director pick" };
  }
  const fallback = viable[0];
  const rationale = list.find((m) => m.verb === pick)?.rationale ?? "marked non-viable";
  return {
    ok: false,
    verb: fallback,
    reason: `director picked ${pick} (${rationale}); rewrote to first viable: ${fallback}`,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: all 4 tests pass.

- [ ] **Step 5: Extend `DirectorSceneOutput` in `lib/prompts/director.ts`**

Replace the existing `DirectorSceneOutput` interface (lines 3–11) with:
```ts
export interface DirectorSceneOutput {
  scene_number: number;
  photo_id: string;
  room_type: RoomType;
  camera_movement: CameraMovement;
  prompt: string;
  duration_seconds: number;
  provider_preference: VideoProvider | null;
  // NEW — required when spatial grounding is available
  movement_rationale: string;
  predicted_end_frame: string | null;
}
```

- [ ] **Step 6: Extend `buildDirectorUserPrompt` input shape**

In the function signature (around lines 281–292), add:
```ts
spatial_analysis?: SpatialAnalysis | null;
```

In the user prompt body, for each photo, render the spatial block when present:
```ts
const spatial = photo.spatial_analysis
  ? `  camera_pose: ${JSON.stringify(photo.spatial_analysis.camera_pose)}
  depth_zones: ${JSON.stringify(photo.spatial_analysis.depth_zones)}
  viable_verbs: ${photo.spatial_analysis.motion_viability.filter((m) => m.viable).map((m) => `${m.verb} (${m.rationale})`).join("; ")}`
  : "";
```
…and concatenate `spatial` into the per-photo block.

- [ ] **Step 7: Tighten `DIRECTOR_SYSTEM` prompt**

Append to the system prompt (after the existing 11-verb vocab explanation):
```
SPATIAL VIABILITY RULES (when viable_verbs is provided):
- You MUST pick camera_movement from the viable_verbs list for that photo.
- You MUST output movement_rationale: one sentence citing why this motion fits the camera_pose and depth_zones.
- You MUST output predicted_end_frame: one sentence describing the final frame the motion should land on, grounded in depth_zones.
- If the viable_verbs list is missing or empty, you may pick freely from the full 12-verb vocab and must still produce movement_rationale.
```

- [ ] **Step 8: Commit**

```bash
git add lib/prompts/director.ts lib/prompts/director-viability.ts tests/director-viability.test.ts
git commit -m "spatial: director viability filter + rationale/end-frame fields"
```

---

## Task 5: Wire viability enforcement into pipeline scripting stage

**Files:**
- Modify: `lib/pipeline.ts`

- [ ] **Step 1: Import**

At the top of `lib/pipeline.ts`:
```ts
import { enforceViability } from "./prompts/director-viability";
```

- [ ] **Step 2: In `runScripting`, build photo payload with spatial_analysis**

At the director call site (around lines 427–441), replace the per-photo mapping with:
```ts
const directorPhotos = selectedPhotos.map((p) => ({
  id: p.id,
  file_name: p.file_name,
  room_type: p.room_type!,
  aesthetic_score: p.aesthetic_score,
  depth_rating: p.depth_rating!,
  key_features: p.key_features ?? [],
  composition: p.composition ?? undefined,
  suggested_motion: p.suggested_motion ?? undefined,
  motion_rationale: p.motion_rationale ?? undefined,
  spatial_analysis: p.spatial_analysis ?? null,
}));
```

- [ ] **Step 3: Enforce viability on each returned scene before insertScenes**

After parsing Claude's director output, before `insertScenes`:
```ts
const enforcedScenes = directorOutput.scenes.map((s) => {
  const photo = selectedPhotos.find((p) => p.id === s.photo_id);
  const list = photo?.spatial_analysis?.motion_viability ?? [];
  const result = enforceViability(s.camera_movement, list);
  if (!result.ok) {
    void log(propertyId, "scripting", "warn", `viability rewrite: ${result.reason}`, {
      scene_number: s.scene_number,
      photo_id: s.photo_id,
      original: s.camera_movement,
      rewritten: result.verb,
    });
  }
  return {
    ...s,
    camera_movement: result.verb,
  };
});
```

Replace the subsequent `insertScenes(...)` call so it receives `enforcedScenes` and threads `movement_rationale` + `predicted_end_frame`:
```ts
await insertScenes(
  enforcedScenes.map((s) => ({
    property_id: propertyId,
    photo_id: s.photo_id,
    scene_number: s.scene_number,
    camera_movement: s.camera_movement,
    prompt: s.prompt,
    duration_seconds: s.duration_seconds,
    provider: s.provider_preference ?? null,
    movement_rationale: s.movement_rationale,
    predicted_end_frame: s.predicted_end_frame,
  })),
);
```

- [ ] **Step 4: Extend `insertScenes` signature in `lib/db.ts`**

Find `insertScenes` (lines 353–367). Extend the input type with:
```ts
movement_rationale?: string | null;
predicted_end_frame?: string | null;
```
And include them in the insert payload.

- [ ] **Step 5: Build + typecheck**

Run: `npm run build`
Expected: zero TS errors.

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline.ts lib/db.ts
git commit -m "spatial: enforce viability at scripting stage + persist rationale/end_frame"
```

---

## Task 6: Embed scenes on insert + widen buildAnalysisText

**Files:**
- Modify: `lib/embeddings.ts`
- Modify: `lib/db.ts`
- Modify: `lib/pipeline.ts`

- [ ] **Step 1: Extend `buildAnalysisText` in `lib/embeddings.ts`**

Locate `buildAnalysisText` (short file, ~lines 20–40). Replace with:
```ts
export function buildAnalysisText(input: {
  roomType: string;
  keyFeatures: string[];
  composition?: string;
  suggestedMotion?: string;
  cameraMovement?: string;
  cameraPose?: { position: string; orientation: string; height: string; fov_hint: string } | null;
  depthZones?: {
    foreground?: { content: string; est_distance_ft: string } | null;
    midground?: { content: string; est_distance_ft: string } | null;
    background?: { content: string; est_distance_ft: string } | null;
  } | null;
}): string {
  const lines = [
    `room: ${input.roomType}`,
    `features: ${input.keyFeatures.join(", ")}`,
  ];
  if (input.composition) lines.push(`composition: ${input.composition}`);
  if (input.suggestedMotion) lines.push(`suggested: ${input.suggestedMotion}`);
  if (input.cameraMovement) lines.push(`movement: ${input.cameraMovement}`);
  if (input.cameraPose) {
    lines.push(
      `pose: ${input.cameraPose.position}/${input.cameraPose.orientation}/${input.cameraPose.height}/${input.cameraPose.fov_hint}`,
    );
  }
  if (input.depthZones) {
    const z = input.depthZones;
    if (z.foreground) lines.push(`fg: ${z.foreground.content} @ ${z.foreground.est_distance_ft}ft`);
    if (z.midground) lines.push(`mg: ${z.midground.content} @ ${z.midground.est_distance_ft}ft`);
    if (z.background) lines.push(`bg: ${z.background.content} @ ${z.background.est_distance_ft}ft`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 2: Add `embedScene` helper in `lib/db.ts`**

After `insertScenes` (around line 367), add:
```ts
import { buildAnalysisText, embedTextSafe, toPgVector } from "./embeddings";

export async function embedScene(sceneId: string): Promise<void> {
  const supabase = getSupabase();
  const { data: scene } = await supabase
    .from("scenes")
    .select("id, camera_movement, prompt, photo:photos(room_type, key_features, composition, suggested_motion, spatial_analysis)")
    .eq("id", sceneId)
    .single();
  if (!scene || !scene.photo) return;
  const photo = scene.photo as any;
  const text = buildAnalysisText({
    roomType: photo.room_type ?? "",
    keyFeatures: photo.key_features ?? [],
    composition: photo.composition ?? undefined,
    suggestedMotion: photo.suggested_motion ?? undefined,
    cameraMovement: scene.camera_movement,
    cameraPose: photo.spatial_analysis?.camera_pose ?? null,
    depthZones: photo.spatial_analysis?.depth_zones ?? null,
  });
  const embedded = await embedTextSafe(text);
  if (!embedded) return;
  await supabase
    .from("scenes")
    .update({ embedding: toPgVector(embedded.vector), embedding_model: embedded.model })
    .eq("id", sceneId);
}
```

- [ ] **Step 3: Call `embedScene` after `insertScenes` in `runScripting`**

In `lib/pipeline.ts`, after the `await insertScenes(...)` call, add:
```ts
const insertedScenes = await getScenesForProperty(propertyId);
await Promise.all(insertedScenes.map((s) => embedScene(s.id).catch((err) => {
  void log(propertyId, "scripting", "warn", `embed scene failed: ${s.id}`, { error: String(err) });
})));
```
Import `embedScene` at the top.

- [ ] **Step 4: Build + typecheck**

Run: `npm run build`
Expected: zero TS errors.

- [ ] **Step 5: Commit**

```bash
git add lib/embeddings.ts lib/db.ts lib/pipeline.ts
git commit -m "spatial: embed scenes on insert for unified retrieval pool"
```

---

## Task 7: Backfill script for existing rated scenes

**Files:**
- Create: `scripts/backfill-scene-embeddings.ts`

- [ ] **Step 1: Create the script**

```ts
#!/usr/bin/env tsx
import "dotenv/config";
import { getSupabase } from "../lib/db";
import { embedScene } from "../lib/db";

async function main() {
  const force = process.argv.includes("--force");
  const supabase = getSupabase();

  const query = supabase
    .from("scenes")
    .select("id, embedding")
    .eq("status", "complete");
  const { data: scenes, error } = await query;
  if (error) throw error;

  const targets = (scenes ?? []).filter((s: any) => force || !s.embedding);
  console.log(`Backfilling ${targets.length} scene embeddings (force=${force})`);

  let done = 0;
  for (const scene of targets) {
    try {
      await embedScene((scene as any).id);
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${targets.length}`);
    } catch (err) {
      console.error(`  fail ${(scene as any).id}: ${err}`);
    }
  }
  console.log(`Done. Embedded ${done}/${targets.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add `tsx` devDep if missing**

Check `package.json`; if `tsx` is not already present:
```bash
npm i -D tsx
```

- [ ] **Step 3: Dry run (no force) locally**

Run:
```bash
npx tsx scripts/backfill-scene-embeddings.ts
```
Expected: prints "Backfilling N scene embeddings (force=false)" where N = number of rated + completed scenes with no embedding. Finishes cleanly.

- [ ] **Step 4: Verify embeddings landed**

Use Supabase MCP:
```sql
select count(*) from public.scenes where embedding is not null;
```
Expected: N rows (matches the backfill count).

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-scene-embeddings.ts package.json package-lock.json
git commit -m "spatial: backfill script for existing scene embeddings"
```

---

## Task 8: Lab retrieval switchover

**Files:**
- Modify: `lib/prompt-lab.ts`

- [ ] **Step 1: Replace the retrieval RPC call**

Locate the `match_lab_iterations` call site (around lines 174–178 per the context report). Replace with:
```ts
const { data, error } = await supabase.rpc("match_rated_examples", {
  query_embedding: toPgVector(embedding),
  min_rating: opts.minRating ?? 4,
  match_count: opts.limit ?? 5,
});
```

- [ ] **Step 2: Normalize the returned shape**

The new RPC returns rows shaped `{ source, example_id, rating, analysis_json, director_output_json, prompt, camera_movement, clip_url, distance }`. Update the downstream mapper in `retrieveSimilarIterations` to map the unified shape back into the existing `RetrievedExample` structure the Lab consumes. Where the old code read `iteration.director_output_json.scene.camera_movement`, now also fall back to `row.camera_movement` for prod rows. Where it read `iteration.clip_url`, use `row.clip_url` directly.

If the existing `RetrievedExample` type does not already have a `source: "lab" | "prod"` field, add it, and let the Lab UI's "Based on N similar wins" chip render `(prod)` or `(lab)` suffix where appropriate. (UI label tweak is optional; if deferring, pass through but don't render.)

- [ ] **Step 3: Confirm chips still render**

Manual check: open `/dashboard/development/prompt-lab`, upload a photo, wait for auto-analyze, confirm retrieval chip renders. If 0 wins, that's fine (depends on data); the failure mode we're watching for is a runtime error from RPC shape mismatch.

- [ ] **Step 4: Build + typecheck**

Run: `npm run build`
Expected: zero TS errors.

- [ ] **Step 5: Commit**

```bash
git add lib/prompt-lab.ts lib/types.ts
git commit -m "spatial: switch Lab retrieval to unified match_rated_examples RPC"
```

---

## Task 9: Fixture evaluation harness + baseline report

**Purpose:** measure viability compliance % (success criterion: ≥ 90%) on a held-out set. Runs the real analysis + director pipeline against 20 photos that are NOT in the training/rated pool.

**Files:**
- Create: `fixtures/spatial-grounding/photos.json`
- Create: `scripts/eval-spatial-grounding.ts`

- [ ] **Step 1: Curate the fixture set**

Create `fixtures/spatial-grounding/photos.json`:
```json
[
  {
    "id": "fixture-001",
    "photo_url": "<supabase storage URL to a kitchen w/ island, wide lens, mid-room>",
    "expected_room": "kitchen",
    "expected_viable_verbs": ["push_in", "feature_closeup", "orbit"],
    "expected_non_viable_verbs": ["drone_push_in", "top_down"]
  }
  // 19 more entries — user curates these from property photos they know are representative
]
```

Note: user must supply the 20 URLs + annotations. The plan executor halts at this step if the file has fewer than 20 entries and surfaces a todo for the user.

- [ ] **Step 2: Create `scripts/eval-spatial-grounding.ts`**

```ts
#!/usr/bin/env tsx
import "dotenv/config";
import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { PHOTO_ANALYSIS_SYSTEM } from "../lib/prompts/photo-analysis";
import type { PhotoAnalysisResult } from "../lib/prompts/photo-analysis";

type Fixture = {
  id: string;
  photo_url: string;
  expected_room: string;
  expected_viable_verbs: string[];
  expected_non_viable_verbs: string[];
};

async function main() {
  const raw = await fs.readFile("fixtures/spatial-grounding/photos.json", "utf8");
  const fixtures: Fixture[] = JSON.parse(raw);
  if (fixtures.length < 20) {
    console.error(`Need ≥20 fixtures, got ${fixtures.length}. Halting.`);
    process.exit(1);
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  let compliant = 0;
  let total = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const f of fixtures) {
    total++;
    try {
      const res = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: PHOTO_ANALYSIS_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: f.photo_url } },
              { type: "text", text: "Analyze this single photo and return the JSON array." },
            ],
          },
        ],
      });
      const text = res.content.find((c) => c.type === "text")?.text ?? "";
      const jsonStart = text.indexOf("[");
      const jsonEnd = text.lastIndexOf("]");
      const parsed: PhotoAnalysisResult[] = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      const a = parsed[0];

      const viableList = a.motion_viability.filter((m) => m.viable).map((m) => m.verb);
      const missingViable = f.expected_viable_verbs.filter((v) => !viableList.includes(v as any));
      const falseViable = f.expected_non_viable_verbs.filter((v) => viableList.includes(v as any));

      if (missingViable.length === 0 && falseViable.length === 0) {
        compliant++;
      } else {
        failures.push({
          id: f.id,
          reason: `missing: [${missingViable.join(",")}]  false-positive: [${falseViable.join(",")}]`,
        });
      }
    } catch (err) {
      failures.push({ id: f.id, reason: `error: ${err}` });
    }
  }

  const pct = ((compliant / total) * 100).toFixed(1);
  console.log(`\n=== Spatial Grounding Eval ===`);
  console.log(`Compliance: ${compliant}/${total} (${pct}%)`);
  if (failures.length) {
    console.log(`\nFailures:`);
    for (const f of failures) console.log(`  ${f.id}: ${f.reason}`);
  }
  if (Number(pct) < 90) {
    console.error(`\nBELOW 90% target. Iterate on PHOTO_ANALYSIS_SYSTEM spatial rules.`);
    process.exit(2);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Run the eval**

```bash
npx tsx scripts/eval-spatial-grounding.ts
```
Expected output: `Compliance: X/20 (Y%)`. Target: ≥ 90%.

- [ ] **Step 4: If below 90%, iterate on the prompt**

Inspect failures, tighten `SPATIAL_SCHEMA_BLOCK` in `lib/prompts/spatial-schema.ts` (stricter rules, clearer non-viability examples), re-run. Do NOT proceed to declaring the task done until the eval clears 90%. If Claude consistently misclassifies one verb (e.g. always marks `reveal` viable), add a targeted counter-example to the schema block.

- [ ] **Step 5: Commit**

```bash
git add fixtures/spatial-grounding/photos.json scripts/eval-spatial-grounding.ts
git commit -m "spatial: fixture eval harness for viability compliance"
```

---

## Final Verification

- [ ] `npm test` passes (smoke + viability filter tests)
- [ ] `npm run build` passes with zero TS errors
- [ ] Migration 009 applied; `photos.spatial_analysis`, `scenes.embedding`, `scenes.movement_rationale`, `scenes.predicted_end_frame` all exist
- [ ] Backfill script populated embeddings for existing rated scenes
- [ ] Fixture eval reports ≥ 90% viability compliance
- [ ] Manual: upload one new property through the app (or re-run one existing property via `POST /api/pipeline/:id`), confirm:
  - Each photo's `spatial_analysis` is populated in Postgres
  - Each scene has a non-null `embedding`, `movement_rationale`, `predicted_end_frame`
  - No "viability rewrite" warnings in `property_logs` (or if present, they're sensible)
- [ ] Manual: upload one photo in the Lab, confirm retrieval chip still renders (may show 0 hits; what matters is no error)

---

## What this plan does NOT do (deferred)

- Promote Lab overrides to production director (`lab_prompt_overrides` stays Lab-only)
- Variant rendering (3-prompt parallel grid with pick-winner)
- Failure-taxonomy tags on ratings beyond 1–5 stars
- Any UI changes beyond the optional `(lab)` / `(prod)` chip suffix in Task 8
- Shotstack, music, voiceover, brand, duration, orientation, form-field persistence

Each of these is a separate design conversation. Do not scope-creep here.
