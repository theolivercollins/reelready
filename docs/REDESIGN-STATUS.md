# Listing Elevate Redesign — Status & Handoff

Snapshot of the UI redesign work as of the last pause. Pair with `REDESIGN-BRIEF.md` (decisions) and `REDESIGN-AUDIT.md` (findings).

---

## Where work is happening

**Isolated git worktree:** `~/real-estate-pipeline-ui`
**Branch:** `ui-redesign` (pushed to `origin`)
**Main clone:** `~/real-estate-pipeline` is on `main` — untouched, safe for other Claude sessions and parallel work.

Why a worktree: a parallel Claude session previously did a `git reset --hard` on this clone that wiped my uncommitted design-system work into a stash. Moving UI work to a worktree at a separate path eliminates that risk — other sessions can edit `~/real-estate-pipeline` freely without touching the UI redesign.

`~/real-estate-pipeline-ui/node_modules` is a symlink to `~/real-estate-pipeline/node_modules` to save disk. `.gitignore` now excludes both `node_modules` (symlink/file) and `node_modules/` (dir) so it never gets committed again.

---

## Preview URLs

Every push to `ui-redesign` produces a Vercel preview.

| Commit | What | URL |
| --- | --- | --- |
| `3f15516` | Design system foundation | https://reelready-766pdwzdc-recasi.vercel.app |
| `0cf0bf8` | + Landing page rewrite | https://reelready-phyiiw929-recasi.vercel.app |
| `c219297` | + Nav polish, liquid glass, auth-modal wiring, gitignore fix | (latest preview — run `vercel ls reelready` to grab URL) |

Click through the dark/light toggle in the top-right of the nav to see both modes.

---

## Completed

### 1. Audit (`docs/REDESIGN-AUDIT.md`)
Page-by-page inspection report of the pre-redesign UI: typography, color, spacing, flow, brand mismatch, copy rewrites. Identifies 17 cross-cutting issues and the top 5 biggest wins.

### 2. Design system foundation
- **Color tokens** (`src/index.css`)
  - Light: white bg, near-black ink, electric blue (220 90% 56%) accent
  - Dark: deep navy-black (222 40% 4%), white ink, brighter blue (217 100% 62%) accent
  - Dark/light full parity, removed warm orange, emerald, gold hardcodes
- **Typography:** Inter only (loaded once), 600 for headers. `font-display` and `font-mono` classes remap to Inter. Tabular numerics via font-feature-settings. `display-xl/lg/md` clamp() scale utilities. `.label` uppercase pattern.
- **Radius:** `--radius: 0rem`. Every primitive updated to `rounded-none`.
- **Motion:** Cinematic cubic-bezier(0.16, 1, 0.3, 1) @ 500ms default. Exposed via `ease-cinematic` + `duration-cinematic` in Tailwind config.
- **Primitives refactored** (sharp corners, new colors, stronger focus states):
  Button, Input, Card, Badge, Dialog, Tabs, Select, Textarea, Alert
- **Theme provider** (`src/lib/theme.tsx`)
  - Reads stored preference + `prefers-color-scheme` on init
  - Defaults to dark
  - Sets `color-scheme` on `<html>` for native form element styling
- **Brand components:**
  - `src/components/brand/Wordmark.tsx` — Custom stair SVG mark inside a square frame + `Listing.Elevate` wordmark with accent period. Sizes sm/md/lg, variants full/mark.
  - `src/components/brand/ThemeToggle.tsx` — 36px square sun/moon button with cinematic hover.

### 3. Landing page (`src/pages/Index.tsx`)
Full rewrite. Sections:
1. **Fixed liquid-glass nav** — Wordmark, section anchors, inline theme toggle, Sign In (opens modal), Get Started (opens modal or routes to /upload if logged in). Glass uses `bg-white/5`, `backdrop-blur-2xl`, `backdrop-saturate-180%`, border `white/10`.
2. **Hero** — scroll-pinned cinematic video, clamp() display type (3rem → 7rem), parallax scale + fade, bottom meta strip ("72h delivery", "$75", "Scroll to explore")
3. **Process** — editorial 2-column header + 3 full-bleed photo cards with slow hover zoom, numbered indices, over-gradient white copy
4. **Showcase** — 6 videos in a 4-col asymmetric grid with a 2×2 feature clip
5. **Pricing** — 3 stat cells with giant tabular numbers + strikethrough comparison against "$500+ / 1–2 weeks / One format"
6. **Full-bleed CTA** — aerial photo with 2s ease-in scale on reveal
7. **FAQ** — 2-column split (sticky heading / answer stack), plus/minus toggles
8. **Footer** — 4-column editorial link grid with large wordmark

Auth modal rewritten with cinematic tab underline (layoutId animation), sharp corners, glass copy card for magic-link success.

### 4. TopNav rewrite (`src/components/TopNav.tsx`)
- Now renders `null` on `/` so the landing's inline nav takes over (fixes double-stack issue where you saw the OLD plain "Listing Elevate" TopNav)
- On every other page: liquid-glass header (`bg-background/55`, `backdrop-blur-2xl`, `backdrop-saturate-150`)
- Wordmark component, ThemeToggle, sharp-corner account dropdown trigger
- Auth state buttons use new Button variants

---

## What's still pending (in priority order)

1. **Redesign Upload flow** *(Task #4)* — The single most user-facing screen. Plan from brief: break into 4 steps (package+duration+format → add-ons → property details → photos + submit). Kill emoji icons. Replace "SAVE $25" salesy badge. Full copy rewrite.
2. **Redesign Status / tracking page** *(Task #5)* — Cinematic stage stepper, real video preview on completion (not placeholder), back-to-home link.
3. **Redesign Login + AuthCallback** *(Task #6)* — Premium sign-in screen (currently goes to a bare form page). Probably should also open the hero auth modal from the landing instead of routing there — but standalone /login must still work for magic-link email clicks.
4. **Redesign Account (agent view)** *(Task #7)* — `Account.tsx` shell + `account/Properties.tsx`, `account/Billing.tsx`, `account/Profile.tsx`. Agent's own orders, history, branding customization.
5. **Redesign Dashboard (admin view)** *(Task #8)* — `Dashboard.tsx` shell + `dashboard/Overview.tsx`, `dashboard/Pipeline.tsx`, `dashboard/Properties.tsx`, `dashboard/Logs.tsx`, `dashboard/PropertyDetail.tsx`. Admin KPIs, kanban, deep-dive.
6. **Redesign Presets + 404** *(Task #9)*
7. **Final polish + motion + dev-server verification** *(Task #10)* — Walk every page in dark+light, click-test golden paths, motion timing audit.
8. **Push final branch for merge review** *(Task #11)* — When all preview feedback is approved, hand off for merge.

---

## User feedback captured so far

From the most recent preview review:

1. **Nav issues on landing** — ✅ Fixed in `c219297`. The TopNav was double-stacking over Index's inline nav, which is why the plain "Listing Elevate" text + broken Sign In route showed up.
2. **Sign In sent to full login page, not modal** — ✅ Fixed. TopNav no longer renders on `/`; Index nav's Sign In button calls `openAuth("signin")`.
3. **More liquid-glass feel** — ✅ Applied to both TopNav and Index header. Index nav now uses `bg-white/5 backdrop-blur-2xl backdrop-saturate-180%`. Could go further (blur on other surfaces, translucent hero cards) during polish pass.
4. **Overall direction approved** — "design language is nice"

---

## Open questions / decisions deferred

- **Standalone `/login` page** — keep as-is (user can deep-link to it), or force-redirect to `/` + auto-open modal? Current plan: keep, redesign to match brand.
- **Admin vs agent role routing** — confirmed. Dashboard = admin (cost/data). Account = agent (orders/branding).
- **Motion budget** — current direction is long-ease cinematic. Flag if anything feels sluggish on review.
- **Extra pages to add?** — no "Pricing" standalone page, no "About" — marketing lives on `/`. Confirm if anything else needs to be added.

---

## Developer notes / gotchas

### Working in the worktree
```bash
cd ~/real-estate-pipeline-ui
npm run dev       # uses symlinked node_modules
git status        # independent from ~/real-estate-pipeline
```

### Do NOT
- Do not `git add -A` without checking — the `node_modules` symlink was tracked twice before the gitignore fix. Now protected but still worth a look.
- Do not touch the main clone (`~/real-estate-pipeline`) for UI work — keep those two worktrees separated.
- Do not merge `ui-redesign` → `main` until every page is reviewed on a preview URL and approved.

### Typecheck
```bash
cd ~/real-estate-pipeline-ui && npx tsc -p tsconfig.app.json --noEmit
```
Currently clean.

### Previews
```bash
vercel ls reelready | grep Preview | head -3
```

---

## Commit history on `ui-redesign`

```
c219297 Gitignore: match node_modules as file or dir (worktree symlink fix)
e460e7d Nav polish: liquid-glass header, hide TopNav on landing, brand mark + period
0cf0bf8 Remove accidentally-tracked node_modules symlink
928b348 Redesign Landing: editorial hero, process, showcase, pricing, CTA, FAQ
3f15516 Design system foundation: Listing Elevate tokens, sharp corners, Inter-only
ee43ab6 Add UI audit: page-by-page findings, cross-cutting issues, top 5 wins
66bf386 Add UI redesign brief for Listing Elevate rebrand
c796bfe (main) Replace hardcoded cost estimates with real per-call tracking
```
