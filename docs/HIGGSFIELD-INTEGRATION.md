# Higgsfield Integration

## Current status (2026-04-13): DEFERRED

Higgsfield's DoP API works and is authenticated. Both standard single-image
mode and the `first-last-frame` keyframe mode were probed against real
listing photos. **Neither is a good fit for real-estate listings right now**,
so Higgsfield is not wired into `lib/providers/router.ts` and `pipeline.ts`
does not call it.

### What we tested

1. **Standard single-image mode** (`/higgsfield-ai/dop/standard`) — same
   interface as Runway/Kling. Clips came back cleanly but offered no
   advantage over Runway gen4_turbo for the same prompt/photo, so there was
   no reason to route traffic here.

2. **First-last-frame keyframe mode** (`/higgsfield-ai/dop/standard/first-last-frame`) —
   intended to solve the "hallucinated kitchen visible through a doorway"
   problem by pinning both endpoints of the camera move to real photos.
   Two probes:
   - **Similar photos** (two angles of the same kitchen): output was
     jittery, with the camera visibly snapping between the two frames
     instead of interpolating a smooth move.
   - **Different rooms** (living room → kitchen): the model teleported
     mid-clip, warping through an invented transition space. Worse than
     the single-image baseline.

   Probe clips are in the Higgsfield CDN; URLs are in the session
   transcript. Both runs consumed real credits.

### Why we're not wiring it

Listing photos are architectural stills of the same property. The
first-last-frame paradigm is built for narrative shots where the two
endpoints are genuinely meant to be different scenes — it does not
gracefully handle "two angles of one room" or "two adjacent rooms in the
same house." The scaffolding to wire Higgsfield in exists
(`lib/providers/higgsfield.ts`, `scripts/test-higgsfield.ts`), but there is
no user-visible quality reason to pay for a third provider.

### Reconsider if

- Higgsfield ships a true multi-reference mode (3+ reference images for
  spatial consistency, not keyframes). This is what we originally wanted.
- Runway or Kling regresses and we need a backup for a specific room type.
- Higgsfield publishes a "photo walkthrough" or "architectural" preset
  tuned for real estate.

### Files left in place

- `lib/providers/higgsfield.ts` — unwired provider stub
- `scripts/test-higgsfield.ts` — probe harness
- `docs/CREDENTIALS.md` — API key/secret and verified request shapes (gitignored)

None of these are loaded at runtime. They can stay until we either wire
Higgsfield up or decide to remove the scaffolding entirely.

### Wiring later (if the decision changes)

In `lib/providers/router.ts`:

1. `import { HiggsfieldProvider } from "./higgsfield.js";`
2. Add a case in `getProviderInstance()`.
3. Add to `getEnabledProviders()`:
   `if (process.env.HIGGSFIELD_API_KEY && process.env.HIGGSFIELD_API_SECRET) enabled.push("higgsfield");`
4. Reassign room types in `ROOM_TYPE_ROUTING` / camera-movement routing.
5. Add `"higgsfield"` to `FALLBACK_ORDER`.

Vercel env vars to add when promoting:
- `HIGGSFIELD_API_KEY`
- `HIGGSFIELD_API_SECRET`
- `HIGGSFIELD_CENTS_PER_CREDIT` (optional — defaults to `1`)
