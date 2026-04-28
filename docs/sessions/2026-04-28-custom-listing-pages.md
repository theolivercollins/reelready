# Session 2026-04-27 → 2026-04-28 — Custom Listing Pages

**Branch:** `feat/custom-listing-pages`
**Spec:** [`../specs/2026-04-27-custom-listing-pages-design.md`](../specs/2026-04-27-custom-listing-pages-design.md)
**Preview deploy:** https://listingelevate-git-feat-custom-listing-pages-recasi.vercel.app
**Migration:** 043 (applied to live `reelready` Supabase via Supabase MCP)

## What shipped (compressed 3-hr sprint)

End-to-end LE-integrated flow for spinning up per-listing video-walkthrough landing pages on a client's Sierra Interactive site. From the operator's perspective:

> Top nav → Listings → New Custom Page → pick client → paste address + video URL → Fetch → Publish to Sierra → modal with live URL + QR.

Multi-tenant from day one (clients table with encrypted Sierra admin creds, agent card, brand color per client).

### Backend (commit `2ace928`)

- Migration 043 — `clients` + `landing_pages` tables with RLS scoped to creator + admin.
- `lib/clients-crypto.ts` — AES-256-GCM (12-byte nonce, 16-byte tag) for Sierra-admin-password storage.
- `lib/sierra-scrape.ts` — public Sierra detail-page scraper. JSON-LD + structured-markup regex parse pulls address, price, beds/baths/sqft, photo, description in ~30 lines. Same JSON shape the future Sierra REST API integration will return.
- `lib/walkthrough-template.ts` — server-side render of the landing-page HTML. Pure CSS + inline `<iframe>`. No `<script>` dependency on the Sierra side.
- `lib/sierra-publish.ts` — Apify actor invocation. Posts a `runs` request to `apify~playwright-scraper` with a `pageFunction` script in `customData` that drives Sierra's admin UI: log in, new content page, paste HTML in CKEditor source view, save. Polls up to 90 sec.
- 4 API endpoints: `POST/GET /api/clients`, `POST /api/listings/scrape`, `POST/GET /api/listings`, `POST /api/listings/[id]/publish` (`maxDuration: 300`).

### Frontend (commits `b226d2a`, `81d7658`, `5ba3a7b`, `7c18070` — Sonnet subagent)

- `Clients.tsx` — table list of onboarded clients.
- `ClientNew.tsx` — onboarding form: site URLs, region ID, encrypted admin creds, agent card, brand color picker.
- `CustomListingNew.tsx` — main feature, two-section layout. Section A: client picker, address input, video URL, MLS# override. Section B (revealed after scrape): scraped data grid, mini landing-page preview iframe, Publish + Save Draft buttons. Falls back to a hardcoded mock listing on backend errors so the UI is testable end-to-end without the API.

### Auth (commit `e0012f5`)

Added `signInWithPassword` + `signUpWithPassword` to `AuthContext`. Login page defaults to email + password with a "Use magic link instead" toggle. Existing accounts (no password set) sign in via magic link.

### Top nav (commit `3253fea`)

Existing **Listings** entry converted from a flat NavLink to a dropdown. Items:
- All Listings (`/dashboard/properties`, unchanged)
- ─ Custom Listings ─ separator + label
- New Custom Page (`/dashboard/listings/new`)
- Clients (`/dashboard/clients`)
- Add Client (`/dashboard/clients/new`)

The original standalone "Custom Listings" dropdown is removed.

### URL normalization (commit `19e6f11`)

YouTube `watch` URLs and Vimeo page URLs cannot be iframed directly — they refuse the connection. `normalizeVideoUrl()` rewrites them to `/embed/` form before the preview iframe renders and before the URL is sent to the backend, so the Sierra-rendered HTML uses an iframe-safe URL too. Bunny / Supabase / direct mp4 URLs pass through unchanged. Publish/Save Draft buttons disabled until video URL is non-empty (with inline hint).

### Env / credentials

- `CLIENTS_ENCRYPTION_KEY` and `APIFY_API_TOKEN` set in Vercel preview env via Vercel CLI.
- Local copies in `~/real-estate-pipeline/credentials.env` + `.env.local` (both gitignored).
- `credentials.env` added to `.gitignore` in commit `af4adca`.

## Process notes

- One Sonnet 4.6 subagent built the entire frontend in parallel with backend (~30 min); main session built backend + integrated. Subagent's only departures from spec were correct (sonner toast vs imagined `useToast`, TopNav vs imagined sidebar, no Suspense vs imagined lazy imports).
- Migration applied via Supabase MCP before code push — no broken-prod window.
- Apify Pro chosen over Browserless for the Playwright runtime (operator already paid).

## What's next (not done)

1. **First real publish test.** Apify Playwright selectors in `lib/sierra-publish.ts` `buildPageFunction()` are guesses. Run one publish, read the Apify dashboard log, patch selectors. Expected 1-3 iterations.
2. **Edit / republish UI.** A draft `landing_pages` row exists but no UI to edit or re-publish.
3. **Agent self-service dashboard.** v1.1 work — operator-only CRUD today.
4. **Tracking Links integration.** Leads currently land in Sierra CRM untagged. Add `?cc=<MLS>` Sierra Tracking Link before going live with real CTV ads.
5. **Sierra REST API key request.** Bridge scraper covers v1; swap to real API when key arrives (same JSON shape, no client-side change).

## Commits on this branch (chronological)

```
b226d2a feat: add clientsApi + customListingsApi modules                (frontend agent)
81d7658 feat: add /dashboard/clients list page                          (frontend agent)
5ba3a7b feat: add /dashboard/clients/new onboarding form                (frontend agent)
7c18070 feat: add /dashboard/listings/new custom landing page builder  (frontend agent)
2ace928 Add backend for custom listing landing pages                    (backend)
e0012f5 Add password auth alongside magic link on Login                 (auth)
af4adca chore: gitignore credentials.env                                (chore)
3253fea Move Custom Listings under the Listings nav as sub-options      (nav)
19e6f11 Auto-convert YouTube/Vimeo URLs to embed form + gate Publish    (UX)
```
