> **ARCHIVED — PAUSED PLAN.** Moved 2026-04-21. Design is viable; work deferred. See [../README.md](../README.md) for the resume signal.
>
> Last updated: (original content preserved unchanged below)
>
> See also:
> - [../README.md](../README.md)
> - [../../plans/back-on-track-plan.md](../../plans/back-on-track-plan.md)
> - [../../HANDOFF.md](../../HANDOFF.md)

# Spatial Grounding + Unified Learning Data — Design

Date: 2026-04-15
Status: Draft, awaiting user review
Project: Listing Elevate (`/Users/oliverhelgemo/real-estate-pipeline`)

---

## Problem

Individual clip quality is the blocking issue. Agents cannot yet upload a property and receive a client-ready output. The director makes all five classes of miss (wrong motion, right motion wrong execution, provider artifacts, boring, wrong foreground target), and refinement in the Prompt Lab closes the gap but costs human time that does not scale.

**Root cause as articulated by the user:** the system has no spatial grounding. Photo analysis today describes *what* is in the photo (room, features, aesthetic, depth bucket) but not *where the camera is standing, which direction it is pointing, what is 3ft away versus 20ft away, and which motions are physically possible from that pose*. The director picks verbs blindly from the 11-verb vocab with no check against the scene's geometry. That is why manual refinement works: the human brings the spatial common sense the director lacks.

**Secondary problem:** production `scene_ratings` (the user reports ~30 ratings given via the Learning tab) do not carry embeddings and do not feed the Lab's similarity retrieval. The Lab learning loop is running on Lab-only fuel, which is a tiny fraction of the feedback the user has actually produced.

## Non-Goals

Explicitly out of scope for this work stream:

- Shotstack assembly, stitching, templates
- Music, voiceover, ElevenLabs, voice clone
- Brokerage logo / brand color rendering
- Order-form field persistence
- Duration / orientation enforcement
- Lab → prod promotion flow
- Parallel variant rendering (deferred)
- New UI surfaces for the Lab or Development dashboard
- Renames, repo moves, or anything touching the file-revert hazard area

Assembly remains stubbed / Shotstack-behind-env-gate until clips clear the user's quality bar.

## Approach

Two coordinated changes that ship together.

### Part 1 — Spatial-grounding photo analysis

Extend `lib/prompts/photo-analysis.ts` so each per-photo analysis returns, in addition to today's fields (`room`, `quality`, `aesthetic`, `depth`, `key_features`, `composition`, `video_viable`, `suggested_motion`):

- **`camera_pose`** — inferred photographer position and framing
  - `position`: one of `doorway`, `corner`, `mid_room`, `hallway`, `exterior_ground`, `aerial`
  - `orientation`: one of `into_room`, `along_wall`, `at_corner`, `at_feature`, `downward`
  - `height`: one of `eye_level`, `low`, `elevated`, `drone`
  - `fov_hint`: one of `wide`, `normal`, `tight`
- **`depth_zones`** — what sits at each distance band
  - `foreground`: `{ content: string, est_distance_ft: "<3" | "3-8" }`
  - `midground`: `{ content: string, est_distance_ft: "3-8" | "8-15" }`
  - `background`: `{ content: string, est_distance_ft: "8-15" | "15+" }`
  - Any zone may be `null` when absent (e.g., drone top-downs often have no foreground)
- **`motion_viability[]`** — one row per verb in the 11-verb vocab
  - `{ verb, viable: boolean, rationale: string, predicted_end_frame: string | null }`
  - `rationale` is short (1 sentence). For viable motions it describes the runway and the target. For non-viable motions it explains why ("no foreground element to reveal past", "<3ft of forward runway, would crash into island", "reveal target not in key_features")

**Director prompt changes (`lib/prompts/director.ts`):**

- Director MUST pick only from verbs where `motion_viability[v].viable === true`
- Director MUST include the matching `rationale` and `predicted_end_frame` in the emitted scene record (new fields on the scene object)
- The reveal-foreground-in-key-features rule stays (already hardened 2026-04-14); it now operates on top of the viability filter

Applies to both the production pipeline director and the Lab director. Same prompt change, both call sites.

### Part 2 — Unified embeddings

- Add `embedding vector(1536)` column to the production scenes table (same dimension and model as Lab: `text-embedding-3-small`)
- On scene insert, embed the analysis JSON (same text-normalization scheme as Lab iterations use today)
- Backfill: one-time script embeds all existing rated production scenes
- Replace or extend `match_lab_iterations` with a unified RPC (`match_rated_examples` or similar) that queries both Lab iterations and rated production scenes, applies the same rating-weighted distance formula (5★ ≈ 15% closer than 4★), and returns the top-K mixed result set
- Lab director's retrieval call switches to the unified RPC. Production director, when it begins to consult retrieval, uses the same RPC

Result: every rating the user has ever given — Lab or production — becomes retrieval fuel for every subsequent photo analysis, in both environments.

## Data Model

New migration (next sequence number after 008):

- `scenes` (or equivalent production rated-scene table): add `embedding vector(1536)`, HNSW index, `embedding_model text`
- `photo_analyses` (or wherever analysis JSON is persisted): schema of analysis JSON widens to include `camera_pose`, `depth_zones`, `motion_viability`. If analysis JSON is stored as a single JSONB column, no DDL change — just prompt-side changes. Verify during plan phase.
- RPC: `match_rated_examples(query_embedding, match_count, min_rating)` — unions Lab iterations and prod scenes, applies rating weighting, returns top-K

Backfill script path: `scripts/backfill-prod-embeddings.ts` (one-shot, idempotent).

## Success Criteria

- **Viability compliance.** On a held-out set of 20 photos, director picks a motion where `motion_viability[v].viable === true` in ≥ 90% of scenes. Zero hallucinated reveals.
- **Retrieval reach.** New Lab uploads' "Based on N similar wins" chips include at least some production-scene citations once backfill completes.
- **Refinement rate (qualitative).** % of Lab iterations reaching 5★ on iteration #1 rises versus current baseline. Baseline captured before launch.
- **No regression** on the existing reveal-foreground rule or the 11-verb vocab.

## Risks and Mitigations

- **Risk:** spatial analysis adds latency + cost per photo. **Mitigation:** fold into existing photo-analysis call if single-shot accuracy holds; fall back to a second call only if the combined schema degrades quality. Budget: one extra Claude Sonnet 4.6 vision call per photo in the worst case (~$0.01).
- **Risk:** viability filter over-constrains the director and nothing is viable. **Mitigation:** director must always have ≥ 2 viable verbs; prompt instructs it to relax to "least-bad viable" if filtered list is empty, and logs the event for review.
- **Risk:** backfill accidentally re-ratings or touches scene state. **Mitigation:** backfill script writes `embedding` only; idempotent (skips rows with non-null embedding unless `--force`).
- **Risk:** unified RPC changes break existing Lab retrieval chips. **Mitigation:** keep `match_lab_iterations` as a thin wrapper during transition; cut over after verifying parity on a fixture set.

## Out-of-Scope Follow-ups (noted, not planned here)

- Parallel variant rendering (3-prompt grid, pick winner) — revisit after spatial grounding lands
- Production consuming Lab overrides / recipes — Lab stays isolated until the promote-to-prod flow is designed separately
- Failure-taxonomy tags on ratings (richer than 1–5 stars) — would multiply rule-mining signal; separate design

## File Touch List

- `lib/prompts/photo-analysis.ts` — widen output schema, add camera_pose / depth_zones / motion_viability sections
- `lib/prompts/director.ts` — viability filter, require rationale + predicted_end_frame in emitted scenes
- `lib/prompt-lab.ts` — swap retrieval RPC to unified version; no structural change
- `lib/embeddings.ts` — no change (already does `text-embedding-3-small`)
- `lib/db.ts` — new helper to embed on scene insert + unified retrieval wrapper
- `lib/pipeline.ts` — embed call on scene creation in production path
- `supabase/migrations/009_spatial_grounding_and_unified_embeddings.sql` — new migration
- `scripts/backfill-prod-embeddings.ts` — one-shot backfill
- Fixture set: 20 held-out photos + expected viability assertions for success-criteria test

## Open Questions for Implementation Plan

- Exact column/table for production scene embeddings — `scenes.embedding` or `scene_ratings.embedding`. Decide after reading `lib/db.ts` and current scene schema.
- Whether analysis JSON is a JSONB column today or split columns. Determines whether the schema widening is prompt-only or needs DDL.
- Whether to fold spatial grounding into the existing analysis prompt (cheaper, one call) or split (cleaner, two calls). Pilot both during plan execution, pick by quality.
