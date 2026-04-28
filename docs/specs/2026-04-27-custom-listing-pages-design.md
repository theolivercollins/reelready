# Custom Listing Pages — Design

**Date:** 2026-04-27 (designed) → 2026-04-28 (shipped to preview)
**Status:** Shipped to preview deploy on `feat/custom-listing-pages`. Apify Playwright publish flow likely needs selector tuning on first real run.
**Branch:** `feat/custom-listing-pages`
**Related:** `docs/sessions/2026-04-28-custom-listing-pages.md`

---

## Goal

Operator (Oliver, future LE staff) clicks a button inside Listing Elevate to spin up a per-listing video-walkthrough landing page on a client's Sierra Interactive site. Used for QR-code traffic from connected-TV ads. Lead is captured by Sierra's native form. Operator effort per listing target: <1 minute.

Multi-tenant by design — multiple Helgemo-style clients, each with their own Sierra site, agent card, and brand color.

## Why this architecture (the constraints we hit)

Sierra Interactive is a closed CMS. Three hard "no" findings from research at `docs/state/` history (2026-04-26 research notes embedded in this spec):

- **No Content Page CRUD API.** The public Sierra REST API at `api.sierrainteractivedev.com` exposes Leads, Saved Listings, Lead Tasks, Webhooks — but no endpoint to create / update / delete Content Pages.
- **No single-listing-by-MLS# Page Component.** Sierra's component picker only includes "Listings from Saved Search" (filter-driven). Workaround possible (saved-search-of-one) but ugly.
- **No custom hidden fields on the lead form.** Sierra's lead-tagging mechanism is Tracking Links (Source + Campaign params on the URL).

Implication: programmatic Sierra publishing is only achievable via **browser automation** (Playwright driving the admin UI), which is what other third-party publishers reportedly do.

## Architecture

```
Operator browser (LE)
    │
    │  POST /api/listings/scrape  (preview)
    │  POST /api/listings  (creates draft + scrapes data)
    │  POST /api/listings/[id]/publish  (renders HTML, runs Apify, stores result)
    ▼
Vercel functions (real-estate-pipeline)
    │
    ├── lib/sierra-scrape.ts ──── fetch Sierra public detail page → JSON-LD parse → ScrapedListing
    │       (bridge until Sierra REST API key arrives; same JSON shape as future API will return)
    │
    ├── lib/walkthrough-template.ts ──── server-side render of the landing-page HTML
    │       (full data baked into <style> + <div> markup; no <script> dependency on Sierra side)
    │
    └── lib/sierra-publish.ts ──── start Apify run + poll + return URL
            │
            ▼
Apify Playwright actor (apify~playwright-scraper, customData = creds + html)
    │
    ▼  pageFunction logs in, navigates to Content Page form, pastes HTML, saves
Sierra admin UI ──→ live Content Page at <sierraPublicBaseUrl>/walkthrough/<slug>
```

## Data model

Migration `043_custom_listing_pages.sql` (applied to `reelready` Supabase 2026-04-27).

**`clients`** — per-Sierra-Interactive-site config:
- `name`, `sierra_public_base_url`, `sierra_region_id`
- `sierra_admin_url`, `sierra_admin_username`, `sierra_admin_password_encrypted` (AES-256-GCM via `lib/clients-crypto.ts`)
- `agent_name`, `agent_team`, `agent_phone`, `agent_email`, `agent_photo_url`, `agent_schedule_url`
- `brand_color_primary`
- `created_by` (auth.users) + RLS scoped to creator + admin

**`landing_pages`** — per-listing artifact:
- `client_id`, `mls`, `address`, `slug`, `video_url`
- `scraped_data jsonb` (snapshot of address/price/beds/baths/photo/description at create-time)
- `status` ∈ {draft, publishing, published, failed} + `publish_error`
- `sierra_page_url`, `qr_url`, `published_at`
- `UNIQUE(client_id, slug)` so re-publishing the same address is idempotent

## Frontend (LE)

Top nav restructure: existing **Listings** entry is now a dropdown grouping all listing-related actions:
- All Listings — `/dashboard/properties` (existing properties view, unchanged)
- ─ Custom Listings ─
- New Custom Page — `/dashboard/listings/new`
- Clients — `/dashboard/clients`
- Add Client — `/dashboard/clients/new`

Pages built (Sonnet subagent on commits `b226d2a`, `81d7658`, `5ba3a7b`, `7c18070`):
- `Clients.tsx` — table list of clients
- `ClientNew.tsx` — onboarding form (Sierra creds + agent card + brand)
- `CustomListingNew.tsx` — main feature: client picker → address → fetch → preview → publish

API modules: `clientsApi.ts`, `customListingsApi.ts` mirror the existing `labListingsApi.ts` `authedFetch<T>()` pattern.

## Login changes

Added `signInWithPassword` + `signUpWithPassword` to `AuthContext` (commit `e0012f5`). Login page defaults to email + password with a "Use magic link instead" toggle. Magic-link path preserved. Existing accounts (no password set) sign in via magic link until they reset to a password through Supabase.

## URL normalization (commit `19e6f11`)

`normalizeVideoUrl()` in `CustomListingNew.tsx` rewrites:
- `youtube.com/watch?v=<id>` and `youtu.be/<id>` and `youtube.com/shorts/<id>` → `youtube.com/embed/<id>`
- `vimeo.com/<id>` → `player.vimeo.com/video/<id>`
- Bunny.net iframe URLs, Supabase signed URLs, mp4s, already-embed URLs → pass through

YouTube watch URLs cannot be iframed directly — they refuse the connection. Normalizing in the operator UI (and in what gets sent to the backend) means the Sierra-rendered HTML uses iframe-safe URLs.

## Env vars

| Name | Where | Purpose |
|---|---|---|
| `CLIENTS_ENCRYPTION_KEY` | Vercel preview/prod, `.env.local` | AES-256-GCM key for Sierra-admin-password storage. 32 bytes, hex-encoded. Generate via `openssl rand -hex 32`. |
| `APIFY_API_TOKEN` | Vercel preview/prod, `.env.local` | Apify Pro account token used by `lib/sierra-publish.ts` to run the Playwright actor. |
| `APIFY_SIERRA_ACTOR_ID` | optional, defaults to `apify~playwright-scraper` | Override if we cut a custom actor later. |

Local: stored in `credentials.env` + `.env.local` (both gitignored).

## Per-listing operator flow

1. Open LE → Top nav → Listings → New Custom Page.
2. Pick client.
3. Paste address (e.g. `193 Santa Fe St, Port Charlotte, FL 33953`). Optional MLS# override.
4. Paste video URL (any of: Bunny iframe, YouTube watch URL, Vimeo, Supabase signed URL, mp4).
5. Click **Fetch Listing Details** → `/api/listings/scrape` runs `searchByAddress()` → JSON-LD parse → preview populates.
6. Review preview, click **Publish to Sierra**.
7. Backend renders HTML, decrypts client's Sierra password, kicks Apify run with the rendered HTML as `customData.html`.
8. Apify Playwright actor logs into Sierra admin, navigates to Content Page form, pastes HTML, saves.
9. Backend polls Apify (max 90 sec), records `sierra_page_url`, generates QR via `api.qrserver.com`, returns to operator.
10. Modal shows the live Sierra URL + QR PNG with Copy URL / Download QR buttons.

## Known limitations / risks

1. **Apify Playwright selectors are guesses.** First real publish will likely fail mid-script. Iteration plan: read the Apify run log, patch selectors in `lib/sierra-publish.ts` `buildPageFunction()`, redeploy. Expect 1-3 round trips.
2. **Sierra admin login form input names not yet verified.** The actor tries `input[name="username"]` then falls back to `input[type="email"]` / `input[type="password"]`. Real Sierra admin may use different names.
3. **CKEditor source-mode toggle assumption.** Pasting raw HTML into Sierra's Content Area requires toggling the editor to source view, which the script attempts via `a.cke_button__source` — may not match Sierra's CKEditor build.
4. **Vercel function timeout.** Apify polling allows ~90 sec client-side; the function is configured for `maxDuration: 300` (Pro plan). Slower Sierra admin = slower publish.
5. **No edit / republish UI yet.** A draft `landing_pages` row can be created but cannot be edited or re-published from LE today. Manual SQL fix or Supabase Studio edits work as a stopgap.
6. **Agent self-service dashboard deferred.** Operator-only client CRUD for v1. Agents cannot edit their own client config — v1.1 work.
7. **Tracking Links not implemented.** Leads land in Sierra CRM untagged for now. Add Sierra Tracking Link integration later (the `?cc=<MLS>` URL param is wired in the design but no UI gates it yet).

## File inventory

| File | Purpose | Commit |
|---|---|---|
| `supabase/migrations/043_custom_listing_pages.sql` | DDL for `clients` + `landing_pages` | `2ace928` |
| `lib/clients-crypto.ts` | AES-256-GCM helpers for Sierra password storage | `2ace928` |
| `lib/sierra-scrape.ts` | `searchByAddress`, `fetchByMls`, `slugifyAddress` | `2ace928` |
| `lib/walkthrough-template.ts` | Server-side render of landing-page HTML | `2ace928` |
| `lib/sierra-publish.ts` | Apify actor invocation + polling | `2ace928` |
| `api/clients/index.ts` | POST/GET clients | `2ace928` |
| `api/listings/scrape.ts` | POST scrape preview | `2ace928` |
| `api/listings/index.ts` | POST/GET listings | `2ace928` |
| `api/listings/[id]/publish.ts` | POST publish to Sierra | `2ace928` |
| `src/lib/clientsApi.ts` | Frontend clients API | `b226d2a` |
| `src/lib/customListingsApi.ts` | Frontend listings API | `b226d2a` |
| `src/pages/dashboard/Clients.tsx` | Clients list | `81d7658` |
| `src/pages/dashboard/ClientNew.tsx` | Client onboarding form | `5ba3a7b` |
| `src/pages/dashboard/CustomListingNew.tsx` | Main feature (form + preview + publish) | `7c18070`, `19e6f11` |
| `src/lib/auth.tsx` | Added password sign-in/up | `e0012f5` |
| `src/pages/Login.tsx` | Email + password login UI | `e0012f5` |
| `src/components/TopNav.tsx` | Listings dropdown restructure | `3253fea` |

## Why we didn't use the n8n proxy (S5) the original `~/ht/docs/2026-04-26-walkthrough-landing-design.md` proposed

The original spec at `~/ht/docs/2026-04-26-walkthrough-landing-design.md` proposed an n8n webhook proxy fronting the Sierra REST API + a master `/walkthrough/?mls=X` Content Page. That spec is **superseded** because:

1. Operator (Oliver) explicitly wanted multiple Sierra Content Pages (one per listing, slugged URLs) — the master-page-with-params approach didn't match his mental model.
2. Browser automation became the only path to per-listing slugged URLs given Sierra's lack of Content Page CRUD API.
3. LE-side direct scraping + publish proved simpler than the n8n hop. n8n adds infra and latency without solving the publish problem (n8n can't create Sierra Content Pages either).
4. We have an Apify Pro subscription, eliminating the Browserless infrastructure question.

The `~/ht/` standalone artifacts (`walkthrough.html`, `walkthrough-agent-card.html`, `RUNBOOK-walkthrough.md`, `FLOW.md`) are kept as historical reference for the rejected master-page approach. Mark as `[SUPERSEDED]` in the file headers.
