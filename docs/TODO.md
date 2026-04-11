# TODO

## Critical (Blocking Real Usage)

- [ ] **Pipeline fails with "0 photos"** -- Supabase Storage upload policy was fixed (public upload enabled), but need to verify the full flow works end-to-end: frontend uploads photos to Storage -> POST /api/properties registers them -> POST /api/pipeline runs and finds them via `getPhotosForProperty`.

- [ ] **Full end-to-end pipeline test** -- Need to test the complete pipeline with real photos: upload -> analysis (Claude vision) -> scripting (Claude) -> generation (at least one provider) -> complete. The pipeline code is written but has not been validated against live APIs in production.

- [ ] **Google Drive link intake** -- The backend accepts a `driveLink` field and stores it on the property, but there is no code to actually download photos from a Google Drive shared folder. This needs a Google Drive API service account, and logic to list + download files from the shared link. Currently, Drive-based submissions will fail because no photos get created in the photos table.

## High Priority

- [ ] **Full automated QC** -- Currently all clips auto-pass (`qc_verdict: "auto_pass"`). The QC evaluator prompt exists (`lib/prompts/qc-evaluator.ts`) and the evaluation logic is designed, but frame extraction requires FFmpeg which is not available in Vercel Functions. Options:
  - Use Vercel Sandbox (Firecracker microVM) for frame extraction
  - Use an external frame extraction API
  - Use a cloud function on a platform that supports FFmpeg (Railway, Fly.io, AWS Lambda with FFmpeg layer)

- [ ] **Video assembly (FFmpeg stitching)** -- Currently the pipeline stores individual clips and marks complete. The FFmpeg assembly code exists (`lib/utils/ffmpeg.ts`) with crossfade transitions, audio, and text overlays, but cannot run on Vercel. Options:
  - Shotstack API (cloud video editing)
  - Creatomate API (template-based video assembly)
  - Vercel Sandbox with FFmpeg installed
  - Self-hosted worker (Railway/Fly.io)

- [ ] **Client-side photo compression** -- Large photos (5-15MB each from modern phones/cameras) should be compressed before upload to Supabase Storage. Add client-side image resizing (max 2048px, JPEG quality 85) using canvas or a library like browser-image-compression. This will speed up uploads and reduce storage costs.

- [ ] **Upload size handling** -- Related to compression above. Currently there is no size limit enforcement or progress feedback beyond the batch counter. Very large photo sets (50+ photos at full resolution) can time out or fail silently.

## Medium Priority

- [ ] **Hourly throughput stats endpoint** -- The Overview dashboard chart shows "Coming soon". Needs a `/api/stats/hourly` endpoint or similar to feed the throughput chart with time-series data.

- [ ] **Supabase Realtime subscriptions** -- The dashboard currently polls API endpoints to check status. It should subscribe to Supabase Realtime channels for live updates on:
  - `properties` table changes (status updates)
  - `scenes` table changes (clip completion)
  - `pipeline_logs` inserts (live log stream)

- [ ] **Email/webhook notifications** -- Notify agents when their video is complete. The property has a `submitted_by` field that could hold an email address. Implement email sending via Resend, SendGrid, or similar.

- [ ] **Daily stats aggregation** -- The `daily_stats` table exists but nothing populates it. Need a cron job (Vercel Cron) that runs daily to aggregate completed properties, clips generated, retries, costs, and average processing times.

- [ ] **Settings page backend** -- The dashboard Settings page (`src/pages/dashboard/Settings.tsx`) currently uses local React state only. Wire it to actual backend settings storage so changes persist. Could use a `settings` table in Supabase or environment variables managed via Vercel.

## Low Priority / Phase 2

- [ ] **Additional video providers** -- Add support for more providers as they become API-accessible:
  - Pika
  - Higgsfield (when API is available)
  - Seadance

- [ ] **Beat detection for music sync** -- Analyze the selected music track for beat positions and align clip transitions to beats for a more professional feel.

- [ ] **Smart vertical cropping** -- The current vertical (9:16) version is a simple center crop of the horizontal. Use the photo analysis (subject position, key features) to offset the crop toward the main subject of each clip.

- [ ] **Brokerage branding templates** -- Allow brokerages to upload their logo, select brand colors, and choose a standard intro/outro template that gets applied to all their videos.

- [ ] **Billing and usage tracking per brokerage** -- Track API costs per brokerage for billing purposes. Currently costs are tracked per property but not aggregated per brokerage.

- [ ] **Auth system** -- No authentication currently exists. The dashboard and API are publicly accessible. Need auth for:
  - Agent accounts (can upload, view their own properties)
  - Operator accounts (full dashboard access)
  - API keys for programmatic access

## Lovable Cleanup (Done)

- [x] Removed `lovable-tagger` from `vite.config.ts`
- [x] Removed `lovable-tagger` from `package.json`
- [x] Removed all mock data (`src/lib/mock-data.ts` deleted)
- [x] All dashboard pages wired to real API

**Still remaining:**
- [ ] `index.html` still has Lovable meta tags (`og:image` pointing to `lovable.dev`, `twitter:site` set to `@Lovable`). Update with ReelReady branding.
- [ ] `index.html` title says "Key Frame" -- should say "ReelReady".
