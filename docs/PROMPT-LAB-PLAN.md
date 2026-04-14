# Prompt Lab — Scoping Doc

**Goal:** an in-dashboard workbench for iteratively refining `PHOTO_ANALYSIS_SYSTEM` and `DIRECTOR_SYSTEM` prompts against real uploaded images, with chat + rating feedback loops and optional real clip renders. Replaces speculative prompt tuning with a data-driven calibration loop.

**Why:** only 7 total rated scenes exist in production (0 kitchen, 0 living_room). Can't tune interior prompts from data that doesn't exist. The Lab generates that data on demand, without running a full property pipeline or costing $1–2 per experiment.

**Decisions made (2026-04-14):**
- Pivot from M2A/C/D/E/M3. Keep M2B (reveal-foreground fix — already shipped in `lib/prompts/director.ts`).
- Render toggle is per-session (default dry-run, "Render for real" button spends credits on demand).
- Feedback is both: 5-star rating + chat-style comment. Claude sees both when refining.

---

## Data model

Two new tables. SQL in `supabase/migrations/002_prompt_lab.sql` (new file).

### `prompt_lab_sessions`

One row per uploaded test image.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | |
| `created_by` | uuid | FK `auth.users.id`, admin-only |
| `image_url` | text NOT NULL | Supabase Storage signed URL (`prompt-lab` bucket) |
| `image_path` | text NOT NULL | Storage object path for cleanup |
| `label` | text | Free-text "kitchen with island" — user-set |
| `archetype` | text | e.g. `kitchen_island_centered`, `living_room_vaulted_ceiling` — optional tag for future recipe promotion |
| `created_at` | timestamptz default now() | |

### `prompt_lab_iterations`

One row per refinement step within a session.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → `prompt_lab_sessions.id` ON DELETE CASCADE | |
| `iteration_number` | int | 1, 2, 3… |
| `analysis_json` | jsonb | full PhotoAnalysis output (room_type, depth_rating, key_features, composition, suggested_motion, etc.) |
| `analysis_prompt_hash` | text | hash of `PHOTO_ANALYSIS_SYSTEM` used for this iteration |
| `director_output_json` | jsonb | director's per-photo scene plan (camera_movement, prompt, etc.) |
| `director_prompt_hash` | text | hash of `DIRECTOR_SYSTEM` used |
| `clip_url` | text NULL | populated only if render-for-real was clicked |
| `provider` | text NULL | `kling` / `runway` / null |
| `cost_cents` | int default 0 | |
| `rating` | int NULL | 1–5 |
| `tags` | text[] NULL | reuse rating-widget tags |
| `user_comment` | text NULL | chat-style free text |
| `refinement_instruction` | text NULL | what the user asked Claude to change from the previous iteration |
| `created_at` | timestamptz default now() | |

RLS: admin-only select/insert/update/delete — gate on `user_profiles.role = 'admin'` in API layer, same pattern as `api/scenes/[id]/rate.ts`.

---

## Storage

New Supabase Storage bucket `prompt-lab` — private. API signs upload + read URLs. Max 15 MB per image, jpg/png/webp. Cleanup: when a session is deleted, cascade delete the storage object (handle in a DB trigger or API delete endpoint).

---

## API endpoints (all under `/api/admin/prompt-lab/`, admin-gated)

| Verb + path | Purpose |
|---|---|
| `POST /api/admin/prompt-lab/upload` | Accept multipart image, stash in `prompt-lab` bucket, create `prompt_lab_sessions` row, return `{session_id, image_url}` |
| `POST /api/admin/prompt-lab/analyze` body `{session_id}` | Run `PHOTO_ANALYSIS_SYSTEM` on the session's image. Insert new `prompt_lab_iterations` row with `analysis_json` populated, return it |
| `POST /api/admin/prompt-lab/direct` body `{iteration_id, override_analysis?}` | Run `DIRECTOR_SYSTEM` on a single-photo input. Accepts optional `override_analysis` so the user can hand-edit fields before directing. Updates the iteration with `director_output_json` |
| `POST /api/admin/prompt-lab/render` body `{iteration_id}` | Actually call Kling or Runway (routed by `lib/providers/router.ts`) with the iteration's director prompt. Polls to completion synchronously-ish (60s budget), stores `clip_url`, `provider`, `cost_cents`. Returns the completed iteration |
| `POST /api/admin/prompt-lab/refine` body `{iteration_id, rating?, tags?, comment, chat_instruction}` | Saves feedback on the current iteration. Then calls Claude with (previous analysis + director output + user feedback) and asks it to propose a REFINED director prompt. Creates a NEW iteration row with the refined prompt (but reusing the previous `analysis_json` — the analysis doesn't re-run unless the user explicitly re-clicks analyze) |
| `GET /api/admin/prompt-lab/sessions` | List all sessions for admin browse |
| `GET /api/admin/prompt-lab/sessions/[id]` | Full session + all iterations |
| `DELETE /api/admin/prompt-lab/sessions/[id]` | Delete session + storage object + iterations |

Reuse:
- `lib/prompts/photo-analysis.ts` `PHOTO_ANALYSIS_SYSTEM` — same prompt, single-photo input instead of batch
- `lib/prompts/director.ts` `DIRECTOR_SYSTEM` + `buildDirectorUserPrompt` — call with a 1-photo list
- `lib/providers/router.ts` `routeScene` — pick Kling vs Runway
- `lib/providers/kling.ts` / `runway.ts` — `generateClip` + `pollUntilComplete`
- `lib/db.ts` `recordCostEvent` — flag cost events with `stage='prompt_lab'`
- `lib/auth.ts` — admin JWT verification (same pattern as `api/scenes/[id]/rate.ts`)

New: a thin prompt for the refinement loop — `lib/prompts/prompt-lab-refine.ts`. Takes previous director output + user feedback, returns revised director JSON. Short, focused, ~40 lines.

---

## UI — `/dashboard/prompt-lab`

Add to the dashboard sub-nav. Admin-only (same `RequireAdmin` wrapper).

Two views:

### List view (`/dashboard/prompt-lab`)
- Grid of session cards. Thumbnail + label + iteration count + best rating so far. "New session" CTA.

### Detail view (`/dashboard/prompt-lab/:sessionId`)
Two-column layout:

**Left (sticky): source image.** Upload target at top, thumb preview below. Label + archetype text fields (inline-editable). "Delete session" at bottom.

**Right: iteration timeline.** Newest iteration at top, expand/collapse older ones.

Each iteration card:
1. **Iteration N** header with timestamp + render cost (if rendered)
2. **Analysis block** (editable fields on the latest iteration only): room_type (select), depth_rating (select), key_features (chip editor), composition (JSON-ish textarea), suggested_motion (select). "Re-analyze" button to re-run Claude with the current prompt version.
3. **Director output**: camera_movement pill, prompt string in a read-only `<code>` block
4. **Render controls** (only on latest iteration): toggle "Render for real" → spends credits + button label changes from `Render (dry-run)` to `Render (~$0.10)`. After render: inline `<video>` player + cost chip.
5. **Feedback** (only on latest iteration, before next iteration exists):
   - 5-star rating widget + tag pills (reuse `RatingWidget` from PropertyDetail)
   - Chat textarea: "What should the next iteration change?"
   - **Refine** button → calls `/refine`, appends new iteration above

6. "Promote to director recipe" — on a highly-rated iteration, a button that copies the prompt + analysis archetype into clipboard, formatted as a recipe block ready to paste into `director.ts` INTERIOR SHOT RECIPES section.

### Components to reuse
- `RatingWidget` from `src/pages/dashboard/PropertyDetail.tsx` — extract to `src/components/RatingWidget.tsx` if it isn't already
- shadcn `Card`, `Button`, `Textarea`, `Input`, `Select`
- Existing video player from Deliverables card

---

## Cost + safety rails

- Real renders cost 5–15¢ each. Cap: default session shows a running total; a session soft-cap at $1.00 pops a confirmation before further renders.
- Analysis is cheap (~$0.01 per Claude vision call) — no cap needed.
- Admin-only gating everywhere. Non-admins get 403.

---

## Milestones

1. **M-Lab-1**: SQL migration + storage bucket + types. Merge.
2. **M-Lab-2**: Upload + analyze endpoints + basic UI list + new-session flow. User can upload an image and see Claude's analysis JSON. No director step yet. Validate via real image.
3. **M-Lab-3**: Direct endpoint + analysis editing + director prompt display. User can see the proposed director prompt without rendering.
4. **M-Lab-4**: Render endpoint (Kling + Runway). Toggle + real clip playback.
5. **M-Lab-5**: Refine endpoint + chat/rating feedback loop. This is the core of the Lab.
6. **M-Lab-6**: Polish — archetype tagging, promote-to-recipe, session list filters, cost dashboard.

Ship order: M-Lab-1 → 2 → 3 → 4 → 5 → 6. Each is independently mergeable. Roughly ~4 hrs per milestone, total ~1.5 days of focused work. Validate after each.

---

## Out of scope (for this pass)

- Auto-promoting recipes to `director.ts` (manual copy for now — reduces risk of bad prompt churn)
- Sharing sessions with other users (single-admin product)
- Diffing iterations visually (mental diff is fine with the card stack)
- Bulk-upload a directory of images (single-upload per session is fine for now)
- A/B testing two prompts on the same image (nice-to-have, later)

---

## Known risk

- **File-revert hazard** — commit between milestones.
- **Prompt-hash churn** — every iteration records which prompt version produced the analysis. When `PHOTO_ANALYSIS_SYSTEM` or `DIRECTOR_SYSTEM` changes mid-session, show a banner on old iterations ("stale prompt version"). Implementation: compare iteration's `analysis_prompt_hash` against current hash.
- **Session bucket bloat** — no auto-cleanup today. Add a cron prune after 30 days later.
