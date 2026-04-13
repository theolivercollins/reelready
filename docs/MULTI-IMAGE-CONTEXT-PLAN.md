# Multi-Image Context Plan: Stopping Cross-Scene Hallucination

## Problem

Each clip in a Listing Elevate video is generated in isolation from exactly one photo by a stateless image-to-video model. When a photo contains an opening into another room (doorway, kitchen pass-through, slider), the model invents what lies beyond — a fake kitchen, imagined fixtures, a dining room that never existed. The clip reads as obviously AI because the hallucinated adjacent room clashes with the real rooms shown in other clips.

Example: 5400 San Massimo Drive, scene 3 (living room push-in) shows a kitchen-like area through an opening behind the couch. The invented kitchen does not match the real kitchen in scenes 4–6.

## Hard Constraint (Verified)

Current image-to-video endpoints take **one** image per generation (optionally a second as an end frame). There is no "project reference" slot. Any cross-scene context must be injected through the **text prompt**.

### Provider research (fetched 2026-04-13)

- **Runway `gen4_turbo`** — `/v1/image_to_video` takes a single `promptImage` as the starting frame. Third-party aggregators ([AI/ML API schema](https://docs.aimlapi.com/api-references/video-models/runway/gen4_turbo)) expose `image_url` (first frame) plus `tail_image_url` (last frame). That is a two-frame maximum — a first/last bracket, not a reference set. Source: [Runway API Reference](https://docs.dev.runwayml.com/api/). Our current integration in `lib/providers/runway.ts` only sends `promptImage`; `tail_image_url` is unused.
- **Luma Ray2** — Supports explicit keyframe bracketing via `keyframes.frame0` and `keyframes.frame1` (both typed `image`). Configurations: start-only, end-only, start+end. Source: [Luma Dream Machine video-generation docs](https://docs.lumalabs.ai/docs/video-generation). Our integration in `lib/providers/luma.ts` already passes `frame0` but never `frame1`.
- **Kling `v2-master`** — Single reference image plus optional `end_image` for continuity. No multi-reference slot; a separate `v1.6-standard/multi-image-to-video` exists but is a different (lower-tier) model. Source: [AI/ML API Kling v2-master schema](https://docs.aimlapi.com/api-references/video-models/kling-ai/v2-master-image-to-video), [Kling official docs](https://app.klingai.com/global/dev/document-api/apiReference/model/imageToVideo) (official docs returned 446 and could not be fetched live — third-party schema corroborates).
- **2026 outlook** — None of the three providers announce a multi-reference set for i2v on their public docs pages as of this fetch. Flag: if Runway or Kling ship a true "project reference" API, strategies 1 and 3 should be revisited.

**Net**: two levers exist — richer text prompts, and (for Luma and Runway only) a second bracketing frame.

---

## Strategy 1 — Property Style Guide (text context injection)

**What**: Add a new pipeline stage before the director. A single Claude Sonnet 4.6 vision call sees all selected photos at once and emits a structured `property_style_guide` JSON. The director then enriches each per-scene prompt with the slices of that guide relevant to what is visible in-frame, especially through any opening.

**Schema** (target ~500 tokens when fully populated):

```
{
  "exterior":   { "architecture", "materials", "primary_color", "trim_color", "roof", "landscaping" },
  "interior_palette": { "wall_color", "floor_material", "trim_style", "ceiling" },
  "kitchen":    { "cabinet_color", "cabinet_style", "counter_material", "hardware_finish", "appliances", "pendant_style", "backsplash" },
  "living":     { "furniture_style", "accent_colors", "focal_wall" },
  "bedrooms":   { "bed_style", "nightstand_material", "window_treatment" },
  "bathrooms":  { "vanity_style", "counter_material", "fixture_finish" },
  "outdoor":    { "pool_type", "patio_material", "view_type" },
  "notable":    [ "unique architectural features, e.g. coffered ceiling" ]
}
```

**How the director consumes it**: `lib/prompts/director.ts` already has a stability clause at lines ~25–112 telling the model to treat doorways as walls. Extend the per-scene prompt builder so that, when a photo has `visible_doorways: true` (see Strategy 2), the director appends a short *constraint block* derived from the style guide:

> "Any kitchen visible through an opening must have dark shaker cabinets, white quartz counters, matte black pendants. Do not invent cabinetry of any other style."

Budget: ~40–80 words added per affected prompt. Stay under 120 words added so it does not dilute the motion directive.

**Engineering work**: new stage (1 Claude call per property), new `property_style_guide` column on `properties`, director prompt refactor to inject slices, QA-evaluator update to check adherence. ~1–1.5 days.

**Impact**: High. Directly addresses the root cause — the model has no reason to invent an adjacent kitchen that happens to match reality, so we tell it what reality is.

**Cost**: One extra Sonnet 4.6 vision call per run. For a typical 12-photo property at roughly 1,500 input tokens per image plus 800 output tokens, expect ~**$0.08–0.15 per run**. Negligible vs the video generation budget.

---

## Strategy 2 — Doorway-Aware Shot Selection

**What**: Penalize photos that prominently frame a doorway or opening to another room. Prefer tighter framings of the same room that show only walls.

**Current state**: `lib/prompts/photo-analysis.ts` (70 lines) does not currently return a doorway field. `lib/prompts/prompt-qa.ts` already mentions doorways as a risk, so the concept is understood downstream but not captured upstream.

**Change**: Extend the photo-analysis schema with:

```
visible_openings: boolean
opening_types: ["doorway"|"archway"|"slider"|"pass_through"|"window_to_room"]
opening_prominence: 0..1   // share of frame occupied by the opening
doorway_risk_score: 0..1   // derived; used as allocator penalty
```

The scene allocator subtracts `doorway_risk_score * W` from each candidate. For motion types `push_in` and `pull_out` (the worst offenders), W is doubled.

**Engineering work**: photo-analysis prompt update, allocator scoring tweak, one migration. ~3–4 hours.

**Impact**: Medium-high. Does not fix unavoidable cases (a great hero shot may have a doorway) but eliminates a large chunk of them cheaply.

---

## Strategy 3 — Keyframe Bracketing Where Supported

**What**: When a room has two usable photos at slightly different angles, pass one as the start frame and the second as the end frame. The model is forced to interpolate between two known anchors instead of inventing.

**Provider support**:
- **Luma Ray2** — Yes (`frame0`+`frame1`). Already partially wired in `lib/providers/luma.ts`.
- **Runway gen4_turbo** — Yes (`tail_image_url`). Not wired in `lib/providers/runway.ts`.
- **Kling v2-master** — Yes (`end_image`). Not wired.

**Scene types that benefit**:
- Slow pan, orbital_slow, dolly across — work well because the camera path is bounded.
- Static/locked shots — not useful.
- `push_in` / `pull_out` — risky; interpolation can produce morphing artifacts. **Do not bracket these.**

**Engineering work**: provider adapters accept optional `endImage`, router picks bracketing when the allocator flags a "bracket pair" for a room. ~1 day across three adapters plus the allocator.

**Impact**: Medium. Fewer eligible scenes than Strategies 1–2, but for eligible ones the quality lift is large and deterministic.

---

## Strategy 4 — Stronger Prompt Anchors (Low Effort)

**What**: Tighten the stability clause in `lib/prompts/director.ts` (already present at lines 25–112) with explicit "opaque plane" wording.

**Proposed addition**:

> "Any doorway, archway, window, slider, or pass-through visible in the frame must be treated as an opaque plane. Do not render any room, furniture, cabinetry, appliance, fixture, or landscape beyond that plane. Preserve the plane's frame, trim, and glass but leave its interior dark, featureless, or matching the foreground lighting fall-off. Inventing any object past an opening is a failure of the shot."

Also add to every negative prompt (Kling already does some of this in `lib/providers/kling.ts:70`): `invented kitchen, invented dining room, hallucinated cabinetry, fake appliances, fabricated adjacent room`.

**Engineering work**: ~30 minutes. One prompt edit, one negative-prompt constant update.

**Impact**: Low-to-medium on its own — the director already contains similar language and the models still hallucinate. Becomes multiplicative when combined with Strategy 1 (the style guide gives the model a *correct* answer; Strategy 4 gives it permission to render nothing).

---

## Answers to the Required Questions

**Biggest quality win per unit of engineering work**: **Strategy 1 (Property Style Guide)**. It is the only strategy that actually tells the model what the adjacent room looks like. Everything else either removes bad shots (S2), constrains motion (S3), or strengthens "don't do it" language the model has already been ignoring (S4).

**If we could only ship one in 24 hours**: **Strategy 1**. One new Claude vision call, one JSON column, a director prompt diff. It targets the exact failure mode described in the San Massimo example — the invented kitchen — by giving the model the real kitchen's description inline. Strategies 2 and 4 are fast follow-ups that compound the gain.

**Extra Claude cost per run for the Style Guide pass**: Approximately **$0.08–0.15** per property, assuming ~12 photos at Sonnet 4.6 input rates (~$3/MTok) plus ~800 output tokens (~$15/MTok). Rounding up for safety margin: budget **$0.20/run**. This is ~1–2% of the video-generation cost.

**Post-generation verification without re-running clips**: Yes. Add a QC-evaluator pass (we already have `lib/prompts/qc-evaluator.ts`) that takes the finished clip thumbnails plus the style guide and asks Claude: "In any frame of this clip, is there cabinetry, an appliance, a room, or a fixture visible through an opening that contradicts the style guide?" Flag contradictions as `hallucinated_adjacent_room: true`. This lets us measure the rate before and after shipping each strategy without regenerating anything. A stretch option is frame-sampling (extract 1 fps) and running the QC prompt on the strip.

## Recommended Rollout Order

1. **Day 1**: Strategy 1 (Style Guide) + Strategy 4 (prompt anchors). Ship together.
2. **Day 2**: Strategy 2 (doorway-aware allocator).
3. **Day 3–4**: Strategy 3 (keyframe bracketing) — Luma first (half done), then Runway, then Kling.
4. **Ongoing**: QC-evaluator hallucination metric tracked per run as the regression signal.
