# Listing Elevate — Status & Handoff

End-of-day snapshot (2026-04-14). Pair with `REDESIGN-BRIEF.md` (decisions) and `REDESIGN-AUDIT.md` (original findings).

---

## Status

All in-scope work shipped to `main`. Production deploys come from `main` automatically via Vercel. Every feature branch has been merged cleanly (with a few gnarly merge conflicts resolved along the way — notes in "gotchas" below).

---

## Where work happens

**Main clone:** `~/real-estate-pipeline` — shared working copy; other Claude sessions and manual edits land here.

**Worktrees (isolated, safe from cross-session collisions):**
- `~/real-estate-pipeline-ui` → branch `ui-redesign` (fully merged into main, safe to archive)
- `~/real-estate-pipeline-finances` → branch `finances-tab` (fully merged into main, safe to archive)

Both worktrees symlink `node_modules` to the main clone. `.gitignore` excludes `node_modules` (both as directory and symlink) and `.DS_Store`.

---

## Shipped on `main`

### Design system
- Color tokens: black / white / deep navy / electric blue, light + dark parity
- Inter-only typography, semibold headers, tabular numerics
- Radius 0 everywhere (every shadcn primitive refactored)
- Cinematic ease token `ease-cinematic` (cubic-bezier 0.16/1/0.3/1) + `duration-cinematic`
- Theme provider reads stored pref + `prefers-color-scheme`, defaults dark
- `Wordmark` component — single stair SVG + "Listing Elevate" text (no accent period), consistent `size="md"` in TopNav everywhere
- `ThemeToggle` component — 36px square sun/moon button

### Pages redesigned (all on main)

| Page | File | Notes |
| --- | --- | --- |
| Landing | `src/pages/Index.tsx` | Liquid-glass hero nav, scroll-pinned cinematic video, **typewriter verb cycle** (Take → Retain → Sell), editorial process/showcase/pricing/CTA/FAQ/footer, magic-link auth modal |
| Upload | `src/pages/Upload.tsx` | 4-step wizard (Style → Add-ons → Property → Photos), sticky total bar |
| Status | `src/pages/Status.tsx` | Vertical timeline stepper with animated progress rail |
| Login + AuthCallback | `src/pages/Login.tsx`, `AuthCallback.tsx` | 2-column editorial split, animated ellipsis loader |
| Account shell + Properties/Billing/Profile | `src/pages/Account.tsx`, `src/pages/account/*` | Underline sub-nav, editorial tables, brand customization |
| Dashboard shell | `src/pages/Dashboard.tsx` | Stripped to a thin container — sub-nav moved into TopNav |
| Overview | `src/pages/dashboard/Overview.tsx` | 4 KPI tiles + 3-col info row (spend chart / SLA ring / distribution) + throughput bar chart + top agents leaderboard + active pipeline + recent deliveries |
| Pipeline | `src/pages/dashboard/Pipeline.tsx` | 6-column stage grid + Manual review list |
| Listings | `src/pages/dashboard/Properties.tsx` | Editorial table with **64×48 thumbnail column**, search + status filter, pagination |
| Logs | `src/pages/dashboard/Logs.tsx` | 5-column terminal-style viewer with severity colors + CSV export |
| PropertyDetail | `src/pages/dashboard/PropertyDetail.tsx` | 2-col header with **primary listing photo sidebar**, Live pulse indicator, 4-cell KPI strip, deliverables grid, cost breakdown table, Tabs (Photos / Shot plan / Timeline / System prompts) |
| **Finances** | `src/pages/dashboard/Finances.tsx` | See below |
| Presets + 404 | `src/pages/Presets.tsx`, `NotFound.tsx` | Editorial list + clamp() 404 |

### Navigation (`src/components/TopNav.tsx`)
- Returns `null` on `/` (landing renders its own hero-aware nav)
- On every other page: liquid-glass header with `<Wordmark size="md" />`
- On `/dashboard/*`: adds "Studio" label next to the wordmark + inline sub-nav (Overview · Pipeline · Listings · Logs · Finances · Learning · Settings) with cinematic underline active state
- Theme toggle + account dropdown on the right

### Auth persistence
- **Implicit flow** (not PKCE) — survives cross-origin magic-link redirects
- `AUTH_CALLBACK_URL` helper hardcodes production to `https://listingelevate.com/auth/callback`
- `persistSession: true` with default `localStorage` (the custom hybrid cookie adapter was reverted — it was over-engineered)

### Finances tab (`/dashboard/finances`)

**Database tables** (applied via Supabase migration `finances_tables`):
- `token_purchases` — provider / amount / units / unit_type / note
- `expenses` — category / amount / description
- `revenue_entries` — source / amount / property_id / note

**Page features:**
- **5 KPI tiles:** Revenue in, Token spend, Other expenses, Net (red/green tone), Cost / video (`token spend ÷ delivered count`)
- **Claude excluded from every dollar total** — Anthropic cost events are tracked in `cost_events` but never contribute to the finance page totals, pie chart, balance cards, or cashflow. Info note at the top: *"Claude usage runs on a Pro subscription and is excluded from dollar totals. Units are still tracked."*
- **30-day cashflow area chart** — revenue + spend overlaid with separate gradient fills
- **Token spend pie chart** — reads from the existing `cost_events` table so Kling vs Runway vs Luma counters are correct by construction (every real pipeline call writes an event)
- **Per-provider balance cards** — purchased vs spent, progress bar, units remaining, color-coded tone
- **Three log-it forms** — new token purchase, new expense, new revenue
- **Three editorial ledger tables** — each row has pencil (edit) + trash (delete) on hover; editing opens a Dialog with all fields pre-filled

### Cross-cutting polish shipped today
- Wordmark size + period cleanup (removed `Listing.Elevate` → `Listing Elevate`, unified all top-left occurrences to `size="md"`)
- Typewriter hero verb cycle (types → holds → erases → loops Take/Retain/Sell)
- Primary listing image surfaced in `/dashboard/properties` (thumbnail column) and `/dashboard/properties/:id` (sidebar)
- Edit dialogs for all three Finances ledgers
- Cost-per-video KPI
- Anthropic exclusion from finance totals

---

## Open / parked (not blocking)

- **`drive-ingest` branch** — Google Drive folder → Supabase Storage ingest. Needs a rebase onto current `main`. `GOOGLE_API_KEY` already set on Vercel.
- **Hero video bundle weight** — production JS chunk is ~1.3 MB. Vite suggests code-splitting.
- **Real video previews on Status page** — `<video>` tags read from `horizontal_video_url` / `vertical_video_url` on the property. Empty until the backend fully populates those.
- **Supabase Site URL dashboard fix** — user still needs to manually set the project's Site URL to `https://listingelevate.com` and add redirect URLs for `https://listingelevate.com/**`. The implicit-flow code change is a resilience net, not a substitute.

---

## Gotchas for future sessions

### Parallel work and merge conflicts
Multiple Claude sessions routinely edit `~/real-estate-pipeline` simultaneously. Treat it as shared state. When merging a feature branch, expect conflicts in:
- `src/pages/dashboard/PropertyDetail.tsx` — high-touch file; the finances merge lost the primary-image sidebar once and had to be re-applied on top in a follow-up commit. Watch for this pattern.
- `src/App.tsx` — route list is a frequent conflict surface; resolve by keeping all routes.
- `src/components/TopNav.tsx` — dashboard nav array is a frequent conflict surface; resolve by keeping all entries.
- `.gitignore` — both sides tend to add lines; resolve as union.

### Symlinked worktrees
`node_modules` in each worktree is a symlink to the main clone. `.gitignore` matches both the symlink and the directory form. Do **not** `git add -A` without scanning for it — twice it leaked in before the gitignore was hardened.

### Running checks
```bash
cd ~/real-estate-pipeline            # or a worktree
npx tsc -p tsconfig.app.json --noEmit
npm run build
```
`tsc` emits one harmless `vitest/globals` notice — filter it out with `grep -v vitest`.

### Vercel previews
```bash
vercel ls reelready | grep Preview | head
```

### Supabase
- Project ID: `vrhmaeywqsohlztoouxu` (org slug `vwbwrlokauukwmzkzsgk`)
- MCP exposes: `apply_migration`, `execute_sql`, `list_tables`, `get_logs`, `get_advisors`
- **Does not** expose auth config (Site URL / Redirect URLs) — that's a manual dashboard change

---

## Branch status

```
main           — production, everything merged
ui-redesign    — legacy feature branch, fully merged into main, safe to archive
finances-tab   — legacy feature branch, fully merged into main, safe to archive
drive-ingest   — parked, not merged, needs rebase before merge
```

---

## Recent commits on main

```
91b5bad PropertyDetail: restore primary-image sidebar lost during merge
e74910d Add 8 cinematographer shot styles as prompt sub-variants
da82145 Merge finances-tab: edit, Claude exclusion, cost/video, photo previews, wordmark
66135be Finances edits, Claude exclusion, cost/video + listing photo previews + wordmark cleanup
f2fcca7 Delete tilt_up and crane_up — awkward, don't map to real estate shots
e976ffd Live auto-refresh on admin property detail page
a92c7a7 Master exterior shots + reveal semantics + feature_closeup + doorway-trap filter + kitchen 2-3
d618825 Merge finances-tab: new dashboard tab for revenue, expenses, token balances
```

End of session. 🎬
