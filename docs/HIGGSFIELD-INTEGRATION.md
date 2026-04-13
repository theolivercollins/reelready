# Higgsfield Integration (Scaffolding)

## What this is

Scaffolding to evaluate Higgsfield (`platform.higgsfield.ai`) as a fourth video-generation provider alongside Runway, Kling, and Luma. Higgsfield's Cinema Studio / DoP engine advertises multi-image reference context, which we want in order to fix the "hallucinated kitchens visible through doorways" problem the single-image providers exhibit.

## What this is NOT

This is a test harness plus an unwired provider stub. `HiggsfieldProvider` is **not** registered in `lib/providers/router.ts` and `pipeline.ts` is untouched. Nothing will call Higgsfield in production until we explicitly wire it up after the test script confirms the API works.

## Running the test script

You need credentials (API key + secret, supplied as a pair) and two publicly-fetchable image URLs. A third image is optional but recommended for probing multi-reference fields.

```bash
HIGGSFIELD_API_KEY=... \
HIGGSFIELD_API_SECRET=... \
HIGGSFIELD_TEST_IMAGE_1=https://.../living-room.jpg \
HIGGSFIELD_TEST_IMAGE_2=https://.../kitchen.jpg \
HIGGSFIELD_TEST_IMAGE_3=https://.../exterior.jpg \
npx tsx scripts/test-higgsfield.ts
```

The script prints a JSON report to stdout and exits 0 only if the baseline single-image submit succeeded.

## Reading the report

- **Probe 1 (`1-baseline-standard`)**: must be `pass`. If it fails, everything else is moot — check auth header format and HTTP status.
- **Probe 2 (`2-baseline-poll`)**: confirms the `GET /requests/{id}/status` response schema. Copy the field paths into `lib/providers/higgsfield.ts` → `checkStatus()` if they differ from our current guesses.
- **Probes 3-6**: determine multi-image support. Any probe with verdict `pass` (200 response) is the winning field name. Record it under `summary.multiImageAccepted`. If all four fail with 400/422, Higgsfield's public API does not expose multi-reference and we should deprioritize this integration.
- **Probe 7 (`cinema-studio`)**: sanity-check for an alternate model path.
- **Probe 8 (`preview`)**: confirms the cheaper tier is usable for dev testing.
- **Probe 9**: opportunistic catalog discovery.

## Decision rule

Commit `HiggsfieldProvider` to the router **only** if probe 1 passes AND at least one of probes 3-6 passes. Otherwise leave the stub in place and close this experiment.

## Wiring into the router later

In `lib/providers/router.ts`:

1. `import { HiggsfieldProvider } from "./higgsfield.js";`
2. Add a case to the `switch (name)` block in `getProviderInstance()`.
3. Add a check to `getEnabledProviders()`: `if (process.env.HIGGSFIELD_API_KEY && process.env.HIGGSFIELD_API_SECRET) enabled.push("higgsfield");`
4. Optionally reassign room types in `ROOM_TYPE_ROUTING` (likely interior rooms with visible adjacent rooms — `kitchen`, `living_room`, `hallway`, `foyer`).
5. Add `"higgsfield"` to `FALLBACK_ORDER` in whatever priority makes sense.

If the winning multi-image field is not `image_url`, update `generateClip()` in `lib/providers/higgsfield.ts` to use that field and take additional reference buffers.

## Vercel Production env vars

When promoting to production, add via `vercel env add`:

- `HIGGSFIELD_API_KEY`
- `HIGGSFIELD_API_SECRET`
- `HIGGSFIELD_CENTS_PER_CREDIT` (optional — defaults to `1`; set once Higgsfield publishes pricing)
