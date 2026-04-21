> **ARCHIVED — COMPLETED PLAN.** Moved 2026-04-21. Work shipped; preserved as execution record.
>
> Last updated: (original content preserved unchanged below)
>
> See also:
> - [../README.md](../README.md)
> - [../../state/PROJECT-STATE.md](../../state/PROJECT-STATE.md)
> - [../../HANDOFF.md](../../HANDOFF.md)

# Unified Embeddings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop siloing production scene ratings from the Lab's similarity retrieval. Every rating — Lab iteration OR production `scene_ratings` — becomes retrieval fuel for every subsequent analysis, in both environments.

**Architecture:** Add `embedding vector(1536)` + HNSW index to the production `scenes` table. Embed each scene on insertion via the existing `text-embedding-3-small` wrapper in `lib/embeddings.ts`. Backfill historical rated scenes. Replace `match_lab_iterations` RPC with a new `match_rated_examples` RPC that unions Lab iterations and rated production scenes with the same rating-weighted distance. Lab director switches to the new RPC.

**Tech Stack:** TypeScript ESM, Vercel Serverless Functions, Supabase Postgres (pgvector HNSW), OpenAI `text-embedding-3-small`.

**Reference spec:** `docs/superpowers/specs/2026-04-15-spatial-grounding-design.md` (Part 2 — Unified embeddings)

**Related paused work:** `docs/superpowers/plans/2026-04-15-spatial-grounding.md` (spatial grounding half, shelved for later)

---

## Working Rules

- Commit after every task with messages prefixed `embed:` (e.g. `embed: add migration 009 (scene embeddings + unified RPC)`)
- Local commits only. Do NOT `git push`, do NOT `vercel deploy`. User gives explicit go on ship.
- DB changes via Supabase MCP `apply_migration` against project `vrhmaeywqsohlztoouxu`. File in `supabase/migrations/` is record of truth.
- If actual schema differs from what this plan assumes (column names, table shape), halt and surface the delta before editing — do not guess.
- Out of scope and NOT to be touched: Shotstack, Lab UI, director prompt, photo-analysis prompt, production pipeline outside the one new embed call, renames.

---

## File Structure

**New**
- `supabase/migrations/009_scene_embeddings_and_unified_rpc.sql` — scenes.embedding + HNSW index + unified RPC
- `scripts/backfill-scene-embeddings.ts` — one-shot idempotent backfill for rated scenes

**Modified**
- `lib/db.ts` — add `embedScene(sceneId)` helper
- `lib/pipeline.ts` — call `embedScene` on each scene after `insertScenes`
- `lib/prompt-lab.ts` — swap retrieval RPC from `match_lab_iterations` to `match_rated_examples`, normalize row shape

---

## Task 1: Migration 009 — scenes.embedding + unified RPC

**Files:**
- Create: `supabase/migrations/009_scene_embeddings_and_unified_rpc.sql`

**Prereq:** confirm via Supabase MCP `list_tables` that `scenes` exists and lacks an `embedding` column. If present, halt.

- [ ] **Step 1: Write the migration**

`supabase/migrations/009_scene_embeddings_and_unified_rpc.sql`:
```sql
-- Unified embeddings: scene embedding column + pooled retrieval RPC
-- 2026-04-15

-- 1. Add embedding to scenes for unified retrieval
alter table public.scenes
  add column if not exists embedding vector(1536),
  add column if not exists embedding_model text;

create index if not exists scenes_embedding_hnsw
  on public.scenes using hnsw (embedding vector_cosine_ops);

-- 2. Unified retrieval RPC: pool Lab iterations + rated production scenes.
-- Returns top-N examples ordered by rating-weighted cosine distance.
-- Weighting: 5-star entries treated as ~15% closer than 4-star.
create or replace function public.match_rated_examples(
  query_embedding vector(1536),
  min_rating int default 4,
  match_count int default 5
)
returns table (
  source text,                    -- 'lab' | 'prod'
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
  name: 009_scene_embeddings_and_unified_rpc
  query: <contents of the SQL file above>
```

Expected: success, no rows affected on ALTER TABLE.

- [ ] **Step 3: Verify schema + RPC**

Via MCP `list_tables` confirm:
- `scenes.embedding vector(1536)`
- `scenes.embedding_model text`

Via MCP `execute_sql`:
```sql
select count(*) from public.match_rated_examples(
  (select embedding from public.prompt_lab_iterations where embedding is not null limit 1),
  4,
  5
);
```
Expected: returns a row (count may be 0 if no 4+ rated examples yet — that's fine; failure mode we're watching for is an error).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/009_scene_embeddings_and_unified_rpc.sql
git commit -m "embed: add migration 009 (scene embeddings + unified RPC)"
```

---

## Task 2: Embed scenes on insert

**Files:**
- Modify: `lib/db.ts`
- Modify: `lib/pipeline.ts`

**Context:** `lib/embeddings.ts` already exports `embedTextSafe`, `buildAnalysisText`, `toPgVector`. The existing `buildAnalysisText` handles `{ roomType, keyFeatures, composition?, suggestedMotion?, cameraMovement? }`. DO NOT widen it — we're not adding spatial fields in this plan.

- [ ] **Step 1: Add `embedScene` helper in `lib/db.ts`**

Add imports at the top of `lib/db.ts` (beside other `lib/embeddings` usage, if any):
```ts
import { buildAnalysisText, embedTextSafe, toPgVector } from "./embeddings";
```

Add after the existing `insertScenes` export:
```ts
export async function embedScene(sceneId: string): Promise<void> {
  const supabase = getSupabase();
  const { data: scene, error } = await supabase
    .from("scenes")
    .select(
      "id, camera_movement, prompt, photo:photos(room_type, key_features, composition, suggested_motion)",
    )
    .eq("id", sceneId)
    .single();
  if (error || !scene || !scene.photo) return;
  const photo = scene.photo as {
    room_type: string | null;
    key_features: string[] | null;
    composition: string | null;
    suggested_motion: string | null;
  };
  const text = buildAnalysisText({
    roomType: photo.room_type ?? "",
    keyFeatures: photo.key_features ?? [],
    composition: photo.composition ?? undefined,
    suggestedMotion: photo.suggested_motion ?? undefined,
    cameraMovement: scene.camera_movement as string,
  });
  const embedded = await embedTextSafe(text);
  if (!embedded) return;
  await supabase
    .from("scenes")
    .update({ embedding: toPgVector(embedded.vector), embedding_model: embedded.model })
    .eq("id", sceneId);
}
```

- [ ] **Step 2: Wire `embedScene` into `runScripting` in `lib/pipeline.ts`**

Import at the top:
```ts
import { embedScene } from "./db";
```
(If `lib/db.ts` exports via barrel or `getScenesForProperty` is imported from there already, extend the existing import line instead of creating a new one.)

After the existing `await insertScenes(...)` call in `runScripting`, add:
```ts
const insertedScenes = await getScenesForProperty(propertyId);
await Promise.all(
  insertedScenes.map((s) =>
    embedScene(s.id).catch((err) => {
      void log(propertyId, "scripting", "warn", `embed scene failed: ${s.id}`, {
        error: String(err),
      });
    }),
  ),
);
```

- [ ] **Step 3: Build + typecheck**

Run: `npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts lib/pipeline.ts
git commit -m "embed: embed scenes on insert for unified retrieval pool"
```

---

## Task 3: Backfill existing rated scenes

**Files:**
- Create: `scripts/backfill-scene-embeddings.ts`

- [ ] **Step 1: Create the script**

```ts
#!/usr/bin/env tsx
import "dotenv/config";
import { getSupabase, embedScene } from "../lib/db";

async function main() {
  const force = process.argv.includes("--force");
  const supabase = getSupabase();

  // Scope: scenes that have at least one rating, regardless of completeness.
  // Unrated scenes aren't retrieval-eligible (RPC filters min_rating >= 4),
  // so embedding them is wasted OpenAI spend.
  const { data: rated, error } = await supabase
    .from("scene_ratings")
    .select("scene_id");
  if (error) throw error;
  const sceneIds = Array.from(new Set((rated ?? []).map((r: any) => r.scene_id as string)));

  let targetIds: string[];
  if (force) {
    targetIds = sceneIds;
  } else {
    const { data: existing, error: e2 } = await supabase
      .from("scenes")
      .select("id, embedding")
      .in("id", sceneIds.length > 0 ? sceneIds : ["00000000-0000-0000-0000-000000000000"]);
    if (e2) throw e2;
    targetIds = (existing ?? []).filter((s: any) => !s.embedding).map((s: any) => s.id as string);
  }

  console.log(
    `Rated scenes: ${sceneIds.length}. Backfilling ${targetIds.length} (force=${force}).`,
  );

  let done = 0;
  for (const id of targetIds) {
    try {
      await embedScene(id);
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${targetIds.length}`);
    } catch (err) {
      console.error(`  fail ${id}: ${err}`);
    }
  }
  console.log(`Done. Embedded ${done}/${targetIds.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add `tsx` devDep if missing**

Check `package.json`. If `tsx` is not present:
```bash
npm i -D tsx
```

- [ ] **Step 3: Run the backfill**

Run:
```bash
npx tsx scripts/backfill-scene-embeddings.ts
```
Expected: prints "Rated scenes: N. Backfilling M (force=false)." where N is the unique-rated-scene count and M is the subset without existing embeddings. Completes cleanly.

- [ ] **Step 4: Verify embeddings landed**

Via Supabase MCP `execute_sql`:
```sql
select count(*) as embedded
from public.scenes s
where embedding is not null
  and exists (select 1 from public.scene_ratings r where r.scene_id = s.id);
```
Expected: equals the number backfilled (or greater if some were already embedded).

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-scene-embeddings.ts package.json package-lock.json
git commit -m "embed: backfill script for existing rated scenes"
```

---

## Task 4: Lab retrieval switchover

**Files:**
- Modify: `lib/prompt-lab.ts`
- Modify (if needed): `lib/types.ts`

**Context:** The existing call is at roughly `lib/prompt-lab.ts:174-178`:
```ts
const { data, error } = await supabase.rpc("match_lab_iterations", {
  query_embedding: toPgVector(embedding),
  min_rating: opts.minRating ?? 4,
  match_count: opts.limit ?? 5,
});
```
Downstream the returned rows are mapped into a `RetrievedExample` consumed by the director's user prompt.

- [ ] **Step 1: Swap the RPC call**

Replace with:
```ts
const { data, error } = await supabase.rpc("match_rated_examples", {
  query_embedding: toPgVector(embedding),
  min_rating: opts.minRating ?? 4,
  match_count: opts.limit ?? 5,
});
```

- [ ] **Step 2: Normalize the returned row shape**

The new RPC returns columns: `source, example_id, rating, analysis_json, director_output_json, prompt, camera_movement, clip_url, distance`.

Update the mapping function (inside `retrieveSimilarIterations` or wherever rows are shaped into `RetrievedExample`). Key transformations:

- `row.id` → `row.example_id`
- `row.iteration_number` (Lab-only field) → no longer exists; drop from output or synthesize as `null`
- `row.camera_movement` / `row.prompt` — prefer top-level columns from the RPC (populated for prod rows). For Lab rows those are `null`; fall back to `row.director_output_json?.scene?.camera_movement` and `row.director_output_json?.scene?.prompt` as they existed before.
- Add `source: "lab" | "prod"` to the returned `RetrievedExample` (extend the type in `lib/types.ts` if that's where it lives; otherwise define next to `RetrievedExample`).

UI does not need to change in this task. The chip text may continue to read "Based on N similar wins" — rendering `(prod)` / `(lab)` suffix is a follow-up polish, not required here.

- [ ] **Step 3: Build + typecheck**

Run: `npm run build`
Expected: zero TypeScript errors.

- [ ] **Step 4: Smoke check (manual)**

Start the dev server (`npm run dev`), open `/dashboard/development/prompt-lab`, upload a single photo, wait for auto-analyze, confirm either:
- A retrieval chip renders with a count ≥ 1 (implies prod+lab pool is being queried), OR
- No chip renders AND browser devtools shows no 500 from `/api/admin/prompt-lab/analyze`

Failure mode we're watching for: RPC shape mismatch causing a runtime error in the mapper. If that happens, fix the mapper and re-run.

- [ ] **Step 5: Commit**

```bash
git add lib/prompt-lab.ts lib/types.ts
git commit -m "embed: switch Lab retrieval to unified match_rated_examples RPC"
```

---

## Final Verification

- [ ] `npm run build` passes with zero TS errors
- [ ] Migration 009 applied; `scenes.embedding`, `scenes.embedding_model` exist; `match_rated_examples` RPC callable
- [ ] Backfill populated embeddings for all previously-rated scenes
- [ ] Lab upload + auto-analyze does not 500 on the analyze endpoint
- [ ] Manual DB check: a known-rated prod scene appears in `match_rated_examples` output when queried with a similar Lab iteration's embedding

---

## What this plan does NOT do

- Spatial grounding (camera pose / depth zones / motion viability) — paused, see `2026-04-15-spatial-grounding.md`
- Any director prompt or photo-analysis prompt changes
- UI changes beyond the optional lab/prod chip suffix (not required)
- Lab → prod promotion of overrides
- Anything Shotstack / assembly / music / voiceover / branding
