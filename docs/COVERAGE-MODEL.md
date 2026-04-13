# Coverage Model — Inside, Outside, Unique Features

Last updated: **2026-04-13**
Status: Spec (partially implemented). Rules in §3 and §4 are the
enforcement targets; the "Today" column in §5 shows how much of each
rule is live right now.

This doc makes the three coverage axes from
`docs/WALKTHROUGH-SPEC.md` §2.3 operational. It defines detection,
enforcement, and fallback for every axis so the pipeline can
guarantee them end-to-end.

---

## 1. The three axes

| Axis | Definition | Minimum per video |
|---|---|---|
| **Inside** | Any clip whose primary subject is an interior room. | 1 |
| **Outside** | Any clip whose primary subject is the building exterior, grounds, pool, lanai, or drone aerial. | 1 |
| **Unique features** | Any clip whose primary subject is a distinctive, property-specific element (pool, view, chandelier, wine cellar, vaulted ceiling, home theater, fireplace wall, custom staircase, etc.). | 1 |

A single clip can count toward two axes — e.g. a pool shot is both
"outside" AND "unique features". It cannot count toward all three.
The `Inside`-only axis always requires a true interior clip.

Coverage failures are **hard failures**. A run that can't cover all
three is routed to `needs_review` (admin-triggered upload fix), not
silently shipped.

---

## 2. Mapping axes to the room_type enum

Source of enum: `lib/types.ts:12-26`.

| room_type | Inside | Outside | Unique-features candidate |
|---|:---:|:---:|:---:|
| kitchen | ✓ | | if `has_hero_island`, `chandelier`, `wine_fridge` |
| living_room | ✓ | | if `fireplace_wall`, `vaulted_ceiling`, `floor_to_ceiling_window`, `view` |
| master_bedroom | ✓ | | if `ensuite`, `balcony`, `view`, `vaulted_ceiling` |
| bedroom | ✓ | | only if tagged unique |
| bathroom | ✓ | | if `soaking_tub`, `walk_in_shower`, `double_vanity_marble` |
| dining | ✓ | | if `chandelier`, `built_in_wine` |
| hallway | ✓ | | rarely — only if `gallery_wall` or `architectural_arch` |
| foyer | ✓ | | if `custom_staircase`, `statement_fixture` |
| garage | ✓ | | only if `finished_garage` or `car_lift` |
| exterior_front | | ✓ | always eligible; hero if `curb_appeal` |
| exterior_back | | ✓ | always eligible; hero if `outdoor_kitchen`, `fire_pit` |
| pool | | ✓ | **always** treated as unique feature if present |
| aerial | | ✓ | if `waterfront`, `golf_view`, `large_lot` |
| other | context-dependent | context-dependent | if flagged |

"Unique-features candidate" columns use detected tags from two sources:

- `photo.key_features: string[]` — free-form strings from
  `lib/prompts/photo-analysis.ts:40`. Examples: `granite island`,
  `vaulted ceiling`, `pool view`, `Mediterranean facade`.
- `properties.style_guide.notable_features: string[]` — property-wide
  list from `lib/prompts/style-guide.ts` (shipped).

Neither list is currently a closed vocabulary. §4.3 proposes a
canonical tag set so the allocator can reason over it deterministically.

---

## 3. Detection rules

### 3.1 Inside detection
Any photo with `room_type ∈ {kitchen, living_room, master_bedroom,
bedroom, bathroom, dining, hallway, foyer, garage, other(interior)}`
and `suggested_discard = false`.

Already implemented at `lib/pipeline.ts:214-257` (`selectPhotos`).

### 3.2 Outside detection
Any photo with `room_type ∈ {exterior_front, exterior_back, pool,
aerial, lanai}` and `suggested_discard = false`.

**Gap**: `lanai` is in the quota table (`lib/prompts/director.ts:46`)
but not in the `RoomType` enum (`lib/types.ts:12-26`). Currently
labeled as `other` at analysis time, which causes it to miss the
outside bucket. See §4.1.

### 3.3 Unique-features detection

A photo qualifies as a unique-features candidate if **any** of:

- Its `room_type` is `pool` or `aerial` (auto-promoted).
- Any string in its `key_features` matches the canonical unique-tag
  set (§4.3).
- The property style guide's `notable_features` references a feature
  visible in this photo (matched by Claude during the style-guide pass
  — requires a new `photo_id[]` field on each notable_features entry,
  see §4.3).

---

## 4. Enforcement rules

Run as a post-director validator, **Stage 3.7**, after
`runPreflightQA` and `runSceneAllocation` (if/when the allocator from
`docs/SCENE-ALLOCATION-PLAN.md` ships) and before `runGenerationWithQC`.

```text
function enforceCoverage(propertyId) {
  scenes = loadScenes(propertyId)
  axes  = { inside: [], outside: [], unique: [] }

  for s in scenes:
    if isInside(s.room_type):  axes.inside.push(s)
    if isOutside(s.room_type): axes.outside.push(s)
    if isUnique(s):            axes.unique.push(s)

  missing = []
  if axes.inside.length  == 0: missing.push("inside")
  if axes.outside.length == 0: missing.push("outside")
  if axes.unique.length  == 0: missing.push("unique")

  if missing.empty:
    return                       // goal met

  for axis in missing:
    candidate = fallbackCandidate(propertyId, axis)
    if candidate:
      insertGapFillScene(propertyId, candidate, axis)
    else:
      markProperty(propertyId, "needs_review")
      emitWarning(`No photo available for axis "${axis}"`)
      return
}
```

### 4.1 Fallback candidate search

For a missing axis:

1. **Inside** — pull any discarded interior photo with
   `aesthetic_score ≥ 5`. Use `push_in` as the safe movement.
2. **Outside** — pull any discarded exterior/aerial photo with
   `aesthetic_score ≥ 5`. If none exist, try to reuse an existing
   interior photo whose frame clearly includes an exterior view
   (detect via `key_features: ["view", "floor_to_ceiling_window"]`)
   and generate with a slow pull-out — the "big window reveal"
   compromise. If that also fails, route to `needs_review`.
3. **Unique features** — the highest `aesthetic_score` photo whose
   `key_features` contains any canonical unique tag. If none, try the
   highest-aesthetic photo regardless of tags and let the director
   write a feature-focused prompt ("focus on the chandelier centered
   in the frame"). If that still fails, mark `needs_review`.

### 4.2 Gap-fill scene construction

A gap-fill scene uses the minimum-risk defaults:

- `duration_seconds`: 4 (plenty of dwell time, reads as deliberate).
- `camera_movement`: `push_in` for interiors, `orbital_slow` for
  exteriors, `parallax` for unique features with `depth_rating=high`.
- `allocation_reason`: `coverage_gap_fill_<axis>` (new enum value —
  extends the `allocation_reason` field proposed in
  `docs/SCENE-ALLOCATION-PLAN.md §2`).
- Inserted at the **correct arc position**, not the end of the list:
  - Inside gap fill → between the opening exterior and the first
    interior already in the list.
  - Outside gap fill → either as the new opening (if no exterior yet)
    or as the new closing.
  - Unique-features gap fill → just before the closing exterior.

### 4.3 Canonical unique-tag vocabulary

`lib/prompts/photo-analysis.ts` today returns free-form
`key_features` strings. The director has no way to distinguish
"granite island" (a cosmetic detail) from "double island with
waterfall edge" (a hero unique feature). The coverage enforcer
needs deterministic matching.

Proposed closed set (to be added to photo-analysis prompt and
style-guide prompt as an enum-constrained field
`unique_tags: UniqueTag[]`):

```text
UniqueTag =
  | "pool"
  | "spa"
  | "outdoor_kitchen"
  | "fire_pit"
  | "fire_feature"
  | "waterfront"
  | "water_view"
  | "city_view"
  | "golf_view"
  | "mountain_view"
  | "wine_cellar"
  | "wine_fridge"
  | "home_theater"
  | "gym"
  | "sauna"
  | "chandelier"
  | "statement_fixture"
  | "custom_staircase"
  | "fireplace_wall"
  | "floor_to_ceiling_window"
  | "vaulted_ceiling"
  | "coffered_ceiling"
  | "beamed_ceiling"
  | "gallery_wall"
  | "built_in_shelving"
  | "double_island"
  | "waterfall_counter"
  | "hero_kitchen_hood"
  | "soaking_tub"
  | "walk_in_shower"
  | "double_vanity_marble"
  | "walk_in_closet"
  | "finished_basement"
  | "three_car_garage"
  | "car_lift"
  | "boat_dock"
  | "tennis_court"
  | "pickleball_court"
  | "putting_green"
  | "detached_guest_house"
  | "rooftop_deck"
  | "balcony"
```

Free-form `key_features` can continue to exist for director prose;
`unique_tags` is what the coverage enforcer and allocator match on.

### 4.4 Arc position enforcement

After coverage is enforced, run an **arc reorder** pass so the final
shot list reads in this order:

1. Opening: exterior_front OR aerial (4s, orbital_slow).
2. Interior primary flow: foyer → living_room → kitchen → dining.
3. Interior private flow: master_bedroom → bedroom(s) → bathroom(s).
4. Highlight: pool / lanai / unique_feature clips (hero axis).
5. Closing: exterior wide, aerial, or hero unique-feature.

Current code does not enforce arc order — the director *recommends*
it in the system prompt (`lib/prompts/director.ts:193-199`) but the
returned scene array is trusted as-is. The enforcement pass is a
pure in-memory reorder of `scenes[]` before insert.

---

## 5. Today vs. target

| Rule | Live today? | File / evidence |
|---|:---:|---|
| Interior room enum exists | ✓ | `lib/types.ts:12-26` |
| Exterior room enum exists | ✓ | `lib/types.ts:12-26` |
| `key_features` captured per photo | ✓ | `lib/prompts/photo-analysis.ts:40` |
| `notable_features` captured per property | ✓ | `lib/prompts/style-guide.ts` |
| `selectPhotos` hard-selects required interior rooms | ✓ | `lib/pipeline.ts:51-57, 230-236` |
| `selectPhotos` hard-selects at least one exterior | ◐ (picks `exterior_front` if any photo has that room_type, but does NOT validate the final scene list includes it) | `lib/pipeline.ts:230-243` |
| Unique features guaranteed in shot list | ✗ | — |
| Inside axis validated on final scene list | ✗ | — |
| Outside axis validated on final scene list | ✗ | — |
| Arc position enforced post-director | ✗ | director recommends only; `director.ts:193-199` |
| `needs_review` triggered on coverage failure | ✗ | — |
| `lanai` in RoomType enum | ✗ | falls into `other` today |
| `unique_tags` closed vocabulary | ✗ | — |
| Gap-fill scene insertion | ✗ | — |

Eight unshipped rules. Ranked and timed out in
`docs/WALKTHROUGH-ROADMAP.md`.

---

## 6. Test cases

Every coverage rule needs a fixture in the future `tests/fixtures/`
directory (not created yet). For now, record these by hand and walk
them through §4 mentally when editing the enforcement code:

### Case A — condo, no exterior photos at all
8 interior photos, zero exterior, zero pool, zero aerial.
Expected: enforceCoverage can't fill outside axis → property goes
to `needs_review`, warning "No exterior photos provided."

### Case B — land-heavy estate, one interior
16 exterior/aerial photos, 1 living_room photo.
Expected: inside axis satisfied by the living_room. Outside axis
over-filled; allocator trims to budget. Unique axis satisfied by
pool/aerial/waterfront tags.

### Case C — standard suburban
2 exterior_front, 2 living_room, 2 kitchen, 1 master, 1 bath,
no pool, no unique tags detected.
Expected: inside ✓, outside ✓, unique ✗. Gap-fill searches for any
photo with a canonical unique tag. None found → pick highest-aesthetic
interior photo and create a director-written "feature focus" prompt
(e.g. the kitchen island). Warn in Superview but don't fail.

### Case D — hero pool property
2 exterior_front, 2 pool, full interior set.
Expected: outside ✓ (exterior_front + pool), unique ✓ (pool auto-tag),
inside ✓. Closing scene should be the hero pool shot or an aerial of
the pool, not an interior.

### Case E — the San Massimo case (current failure)
Kitchen visible through living-room opening; single-image models
invent a fake kitchen.
Coverage-wise this is fine — inside ✓, outside ✓, unique could be
either — but the *quality* fails due to hallucinated adjacent room.
Covered under `docs/MULTI-IMAGE-CONTEXT-PLAN.md` Strategy 1 (shipped)
and `docs/WALKTHROUGH-ROADMAP.md` quality track.

---

## 7. Open questions

1. Should `lanai` become a first-class `RoomType`, or stay as
   `exterior_back` with a feature tag? (Lean: first-class, because
   the router and quota tables already reference it.)
2. Can a single clip legally double-count inside AND outside? Current
   answer: no — an interior clip that shows an exterior through a
   window is still an interior. A pool clip is still outside even if
   it's on a lanai roof.
3. Where does "unique features" overlap with the style guide's
   `notable_features[]`? Proposal: style-guide pass writes
   `notable_features[].photo_ids[]` so enforcement can locate them
   deterministically. Requires schema extension in
   `lib/prompts/style-guide.ts`.
4. When the gap-fill needs to *reuse* an existing photo with a
   different camera movement, does that count as a new scene for the
   60-second cap? (Proposal: yes. The cap is on runtime, not photo
   uniqueness.)
5. Arc reorder may conflict with the director's intentional sequencing
   for mood (e.g. "slow reveal, kitchen last"). Do we trust the
   director's order when it's self-consistent, and only reorder when
   the §4.4 canonical arc is violated? (Lean: yes — reorder only when
   violated, not unconditionally.)
