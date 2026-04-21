> **ARCHIVED — SUPERSEDED.** Moved 2026-04-21. See [../README.md](../README.md) for why and for the canonical replacement.
>
> Last updated: (original content preserved unchanged below)
>
> See also:
> - [../README.md](../README.md)
> - [../../HANDOFF.md](../../HANDOFF.md)
> - [../../state/PROJECT-STATE.md](../../state/PROJECT-STATE.md)

# Prompt Lab — Plan & State

**Status:** M-Lab-1 through M-Lab-4 **shipped** 2026-04-14 PM. All four milestones live in production at `https://www.listingelevate.com/dashboard/development/prompt-lab`.

**Goal:** admin-only iterative prompt-refinement workbench that generates rating data on demand and compounds it into better prompts automatically, without touching the production pipeline.

---

## What shipped

### Core workbench
- Upload image (single or multi-file drag-drop) → analysis + director prompt in one shot
- Batches: `batch_label` on sessions groups them visually; drag-drop session cards between batches; click batch title to rename all
- Filter chips per batch: All / Need to start / In progress / Completed
- Card states: Rendering (amber spinner), Ready for approval (sky banner), Completed (emerald badge + border)
- Auto-refresh every 15s when any session is rendering or waiting approval
- Provider picker per render: Auto / Kling / Runway
- Fire-and-forget render + cron finalizer (`/api/cron/poll-lab-renders`) — safe to navigate away mid-render
- Supabase Storage persistence for rendered clips (provider CDN URLs expire; ours don't)
- Rating widget + tags + chat feedback; "Save rating" saves without forcing a refine
- "Promote to recipe" button on 5★ iterations
- Latest iteration highlighted on detail view (2px foreground border + active pill)

### Learning loop
- **Similarity retrieval (M-L-1 + M-L-2):** OpenAI `text-embedding-3-small` (1536 dim) + pgvector HNSW. On each analyze, top-5 past 4+★ iterations whose embedding is closest to the new photo get injected as "PAST WINNERS" exemplars in the director prompt. Same on refine.
- **Rating-weighted retrieval:** 5★ rank 15% closer than 4★ at equal cosine distance.
- **Recipe library (M-L-3):** `prompt_lab_recipes` table. Auto-populated on rating=5 with cosine-distance dedup (0.2 threshold, same room_type). Manual promote button too. Analyze queries for matching recipe within 0.35 distance; if hit, director gets a "VALIDATED RECIPE MATCH" block instructing template reuse.
- **Rule mining + proposals (M-L-4):** `/proposals` page. "Run rule mining" aggregates rated iterations by bucket, Claude (`DIRECTOR_PATCH_SYSTEM`) produces a unified diff + per-change citations, admin applies/rejects. Applied diffs become `lab_prompt_overrides` rows; Lab director resolves the override at call time. Production director does NOT consult overrides.

### Data model
- `prompt_lab_sessions` — id, image, label, archetype, batch_label, created_by
- `prompt_lab_iterations` — id, session, iteration_number, analysis_json, director_output_json, embedding vector(1536), embedding_model, retrieval_metadata, rating, tags, user_comment, refinement_instruction, clip_url, provider, provider_task_id, render_submitted_at, render_error, cost_cents
- `prompt_lab_recipes` — id, archetype, room_type, camera_movement, prompt_template, composition_signature, source_iteration_id, embedding, times_applied, status
- `lab_prompt_overrides` — prompt_name, body, body_hash, is_active (unique partial index)
- `lab_prompt_proposals` — prompt_name, base_body_hash, proposed_diff, proposed_body, evidence JSONB, rationale, status

### RPC helpers
- `match_lab_iterations(query_embedding, min_rating, match_count)` — rating-weighted cosine nearest neighbor
- `match_lab_recipes(query_embedding, room_type_filter, distance_threshold, match_count)`
- `recipe_exists_near(query_embedding, room_type_filter, distance_threshold)` — for auto-promote dedup

---

## Env vars

- `OPENAI_API_KEY` — embeddings (live on Vercel prod + preview)
- `ANTHROPIC_API_KEY`, `KLING_ACCESS_KEY`/`SECRET_KEY`, `RUNWAY_API_KEY` — already set for production pipeline; Lab reuses

---

## Scope decisions locked

- **Lab only this pass.** Production's `fetchRatedExamples` and director prompt stay untouched.
- **No tournament A/B mode.** Explicitly out of scope.
- **No auto-apply of Lab overrides to prod.** Manual promotion path deferred to next pass.
- **OpenAI over Voyage** — Oliver picked OpenAI after we tried Voyage. Swap is 30 seconds if we ever revisit.

---

## Next steps (ordered)

1. **Generate real data.** Upload 30+ interior photos across a few batches (Smith property, Kitchen study, Living room study). Rate aggressively. Let recipes + retrieval accumulate.
2. **Validate recipe match** — prove that a second similar photo actually gets the recipe applied and the director output matches.
3. **Rule-mining dry run** — once ≥15 rated iterations, run mining, review proposed diff. Tune `DIRECTOR_PATCH_SYSTEM` if hallucinations.
4. **Lab → prod promotion flow** — once an override stabilizes, explicit button to copy its body into production's `DIRECTOR_SYSTEM` (via `prompt_revisions`).
5. **Cost dashboard** — sum Lab `cost_cents` per batch; visible on the list header.
6. **Visual-embedding option** — evaluate embedding the IMAGE instead of the analysis text. Likely higher retrieval quality but more expensive. Defer until text embeddings prove insufficient.

---

## Risks

- **File-revert hazard** still present in theory. All shipped Lab code survived the session — likely dormant, but commit between milestones remains prudent.
- **OpenAI as single point of failure** for Lab retrieval. `embedTextSafe` degrades to no-retrieval; Lab still works.
- **Cold start** — retrieval has nothing until ~5 rated iterations. Empty state messaging in the UI.
- **Recipe sprawl** — dedup at 0.2 is a heuristic. If the library gets noisy, tighten threshold or add a "Review pending" gate on auto-promote.
- **Rule mining can overreach.** Safety rail is the manual review + diff UI. Apply nothing automatically.
