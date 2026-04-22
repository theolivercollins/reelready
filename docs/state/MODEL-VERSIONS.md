# Model Versions — V1 and V2

Canonical terminology for Listing Elevate's generation stack. Settled 2026-04-22.

## V1 (current, daily-driver)

- **Family:** Kling v2 series on AtlasCloud
- **Default SKU:** `kling-v2-6-pro`
- **Available SKUs (non-paired):** `kling-v2-6-pro`, `kling-v2-master`, `kling-v3-std`, `kling-o3-pro`
- **Input:** single image
- **Surface:** Prompt Lab (renamed from "Prompt Lab (legacy)" on 2026-04-22)
- **Production pipeline:** active (all production renders route here)
- **Code pointers:**
  - `lib/providers/atlas.ts` → `ATLAS_MODELS`, `V1_ATLAS_SKUS`, `V1_DEFAULT_SKU`, `V1AtlasSku`
  - `lib/providers/router.ts` → `resolveDecision({ skuOverride })`, re-exports the V1 SKU constants
  - `lib/prompt-lab.ts` → `submitLabRender({ sku })`
  - `src/pages/dashboard/PromptLab.tsx` → per-iteration SKU selector + cost chip

## V2 (paused, preserved)

- **Family:** Kling v3 + v2.1 paired-image
- **Paired SKU:** `kling-v2-1-pair` (start-end-frame)
- **Status:** hidden from nav 2026-04-22; URL reachable (Listings Lab)
- **Input:** start + end photo
- **Surface:** Listings Lab at `/dashboard/development/lab` and `/dashboard/development/lab/listings`
- **Production pipeline:** not connected; V1 serves all prod renders
- **Code pointers:**
  - `lib/providers/router.ts` → `selectProviderForScene()` paired-scene branch
  - Parked branches: `session/ledger-2026-04-21` (bucket-scoreboard for V2 visibility), `session/router-2026-04-21` (manual router grid — superseded by P5 Thompson)

## Why this split

1. V1 is the feedback-loop target. ML roadmap phases P2–P7 operate on V1-surface data.
2. V2 is paused until V1 is stable + Thompson router (P5) has ≥ 2 weeks of signal.
3. No code is deleted; V2 paths stay on disk with comment headers and park notes.

## Explicitly excluded from V1 allow-list

- **`kling-v3-pro`:** shake profile optimized for paired renders; using it on single-image buckets would pollute the rating signal because production will never route there. Policy decision 2026-04-21. See `docs/sessions/2026-04-21-park-router.md`.
- **`kling-v2-1-pair`:** paired-only SKU; routed by `selectProviderForScene` when `scene.endPhotoId` is set.

## Rollback

V1 routing is the default. To revert to pre-2026-04-22 behavior, flip `ATLAS_VIDEO_MODEL` env var and revert the router commit. Migration 031 adds columns (never removed on rollback); data is preserved.

## See also

- `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md` — full program spec (P1–P7)
- `docs/plans/2026-04-22-p1-v1-foundation-plan.md` — P1 implementation plan
