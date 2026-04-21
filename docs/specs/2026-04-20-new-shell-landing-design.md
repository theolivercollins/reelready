# New Shell — Marketing Landing (Phase 1)

Last updated: 2026-04-20

See also:
- [../archive/paused-plans/2026-04-20-new-shell-landing.md](../archive/paused-plans/2026-04-20-new-shell-landing.md) — implementation plan (PAUSED during back-on-track work)
- [../HANDOFF.md](../HANDOFF.md) — current priorities

**Date:** 2026-04-20
**Status:** Design approved, implementation paused while back-on-track phases execute. Resume after Phase B.
**Scope:** Marketing landing only. Agent upload portal is Phase 2 (separate spec, not covered here).

## Context

Listing Elevate is pre-launch with no real clients, no production stats, and no trusted-by logos. The existing marketing landing (`src/pages/Index.tsx`) was designed around social proof the company does not yet have. We are building a new UI shell — separate routes, same repo — that replaces social proof with sourced market-comparison data and ships honest about being new.

The design language is defined in `/Users/oliverhelgemo/Downloads/styles.css` (tokens, liquid-glass panels, midnight wash, Instrument Serif + Geist + JetBrains Mono) and the accompanying `Listing Elevate.html` design canvas.

## Goals

- Ship a production landing that converts without fake social proof
- Replace vanity metrics with independently cited market comparisons
- Leave existing public routes untouched; new shell coexists until we flip the root
- Keep the data layer swappable: visual shell reads from mock data now, Supabase later, with a one-file change per data source

## Non-goals (Phase 1)

- Agent upload portal redesign (Phase 2)
- Public status tracker redesign (Phase 3)
- Ops dashboard redesign (later)
- Route renames or deletion of existing pages
- Migration off Vite to Next.js

## Architecture

### Branch & routes
- Branch: `feature/new-shell` off `main`
- New route: `/v2` (landing). Subsequent phases add `/v2/start`, `/v2/status/:propertyId`.
- Old routes (`/`, `/upload`, `/status`) remain untouched and fully functional.
- Merge-to-production strategy: once approved, a single commit flips the root route to point at the new shell. The old shell stays mounted under `/legacy` until removed.

### Stack
- Vite + React 18 + TypeScript + Tailwind + shadcn/ui (existing)
- No new framework dependencies. No SSR introduced.
- Fonts via Google Fonts (Instrument Serif, Geist, JetBrains Mono) already referenced by the design file.

### File layout
```
src/v2/
  styles/
    tokens.css              # ported from Downloads/styles.css
    tailwind-preset.ts      # extends theme with le-* tokens
  pages/
    Landing.tsx             # /v2
  components/
    landing/
      Nav.tsx
      Hero.tsx
      Process.tsx
      MarketComparison.tsx  # the new section
      SelectedWork.tsx
      Pricing.tsx
      FounderOffer.tsx
      FAQ.tsx
      FinalCTA.tsx
      Footer.tsx
    primitives/
      GlassPanel.tsx
      MidnightWash.tsx
      AnimatedBar.tsx       # for market comparison
      AnimatedNumber.tsx    # count-up on scroll
      SampleBadge.tsx
      ThemeToggle.tsx
  data/
    sampleReels.ts          # mock sample-reel metadata, swap later
    marketStats.ts          # comparison data + citation URLs
    pricing.ts              # pricing tiers (initially mock, reads real later)
    faqs.ts                 # static
  hooks/
    useInViewOnce.ts        # IntersectionObserver wrapper
    usePrefersReducedMotion.ts
```

### Data abstraction
All data-dependent components import from `src/v2/data/*`. Each module exports a typed async function returning the data. Initial impl returns mock data inline. Later swap: the function body becomes a Supabase query; consumer code does not change.

Example:
```ts
// src/v2/data/sampleReels.ts
export interface SampleReel {
  id: string;
  title: string;       // "Coastal Modern · Sample"
  durationSec: number;
  posterUrl: string;
  videoUrl: string;
}
export async function getSampleReels(): Promise<SampleReel[]> { /* mock for now */ }
```

## Landing page sections (top → bottom)

1. **Sticky glass nav** — logo · Process / Showcase / Pricing / FAQ · theme toggle + Sign in + "Get started"
2. **Hero** — midnight wash, full-bleed video loop behind, cycling-word serif headline (uses `le-cascade` keyframe), sub copy mentions "in 24 hours", primary CTA "Start a video" + secondary "Sign in to your account"
3. **Process** — "Three steps. One day." / Upload → Direct → Deliver (three cards)
4. **Market comparison** (new; replaces "By the Numbers") — see §Market comparison below
5. **Selected work** — midnight showcase, 3 sample reels from Prompt Lab, SAMPLE badge on each, descriptive titles ("Coastal Modern · Sample"), no fake addresses/prices
6. **Pricing** — existing treatment; concrete $380 starting visible
7. **Founder offer strip** — single-line band: *"Founding agents — 50% off your first three videos. Limited to the first 50 signups."*
8. **FAQ** — accordion, ~6 questions (turnaround, revisions, photo requirements, pricing, orientation, voiceover)
9. **Final CTA band** — midnight, serif display "Elevate your next listing." + "Start a video"
10. **Footer** — logo · Process · Showcase · Pricing · FAQ · Terms · Privacy · © 2026 Listing Elevate, Inc.

**Removed from the existing design:** trusted-by logos row, testimonial block, "4,280+ listings elevated" stats block, any copy claiming 72-hour turnaround.

**Global copy change:** every instance of "72 hours" / "seventy-two hours" becomes "24 hours" / "one day".

## Market comparison section (detailed)

- **Eyebrow:** `— HOW WE COMPARE`
- **Headline:** "The market average, and then us."
- **Sub:** "Every number independently sourced. We'll replace these with your numbers the day you run a listing with us."

Five rows, one unified visual treatment. Each row: horizontal layout with two bars stacked — Market Avg (muted) above, Listing Elevate (accent) below — plus tweened numeric labels. Source citation in JetBrains Mono at the end of each row.

| # | Dimension | Market avg | Listing Elevate |
|---|-----------|------------|-----------------|
| 1 | Cost per listing video | $1,200–$2,500 | $380 starting |
| 2 | Turnaround | 5–10 business days | Under 24 hours |
| 3 | Agent effort per video | ~4 hrs (schedule, site visit, review) | 2 min (upload) |
| 4 | Listing engagement with video vs. without | +X% (cited) | Every listing gets one |
| 5 | Seller preference for video-marketing agents | Z% (cited) | Default, not an upsell |

**Research plan:** During implementation, pull real numbers from NAR Home Buyers & Sellers Report, Wyzowl State of Video Marketing, Zillow/BombBomb reports. Every number gets a citation URL rendered in small-caps mono below the row. If a number cannot be cleanly sourced, cut the row rather than fabricate.

**Animation:**
- Bars fill and numbers tween on first scroll-into-view (IntersectionObserver, fires once, does not loop)
- Duration ~900ms, ease-out
- `prefers-reduced-motion`: bars appear at final state immediately, no tween

**Responsive:** 5 rows stacked desktop; each row collapses to vertical pair (Market Avg then Elevate) on mobile.

**Theming:** light mode = stark white with black ink bars. Dark mode = midnight with white bars. Both driven by existing `--le-accent` tokens.

## Selected work section

- 3 reels pulled from Prompt Lab render history (curated list hardcoded in `sampleReels.ts` for v1)
- Each card: poster image, duration badge (e.g. `0:38`), descriptive title (e.g. "Coastal Modern · Sample"), SAMPLE pill in the top-right corner
- No prices, no fake addresses, no fake agent names
- Hover: subtle zoom on poster; click: opens lightbox playing the mp4

## FAQ content (v1)

1. How fast will I get my video? — "Under 24 hours from upload, every time."
2. What if I don't like the first cut? — revision policy TBD, flag during implementation
3. What photos do I need? — 20–60 photos, phone camera OK
4. How much does it cost? — $380 starting, +add-ons
5. Portrait or landscape? — both delivered by default
6. Can I add voiceover? — yes, $15 add-on (mentions Phase 2 backend work)

## Theming

- Both light and dark modes supported, toggle in top nav
- Default: dark (matches current design canvas default)
- Theme persisted in `localStorage` under `le-theme`
- All tokens source from `src/v2/styles/tokens.css` (ported verbatim from `Downloads/styles.css`)

## Accessibility

- All animations respect `prefers-reduced-motion`
- Color contrast: dark-mode text on midnight wash must hit WCAG AA (4.5:1); verify during implementation
- FAQ is keyboard-navigable; focus-visible ring uses `--le-accent` per existing CSS
- Video backgrounds are decorative; `aria-hidden="true"`, poster image for users who don't autoplay
- Every citation has an accessible `<a>` with descriptive text, not just "source"

## Testing

- Visual smoke: render `/v2` in dev, click through all CTAs, verify theme toggle, verify reduced-motion (toggle OS setting)
- Lighthouse on `/v2` desktop: target Performance ≥ 90, Accessibility ≥ 95
- Mobile viewports: iPhone 13, Pixel 7 widths; check all section collapses
- Existing public routes (`/`, `/upload`, `/status`) verified still working after the new shell lands

## Rollout

1. Merge `feature/new-shell` to `main` with `/v2` live but not linked from anywhere
2. QA internal review
3. Flip the root route: `/` now renders the new landing, old landing moves to `/legacy`
4. Remove `/legacy` after 30 days of the new landing live

## Open items to resolve during implementation

- Real research numbers for comparison rows 4 and 5 (engagement, seller preference)
- Exact list of 3 Prompt Lab reels to use as samples
- Revision policy copy for FAQ #2
- Whether cycling-word hero animation uses existing `le-cascade` or a new variant — pick during implementation
- Founder-offer signup count tracking (mock for v1; real counter Phase 2)

## Not in this spec (future phases)

- Phase 2: Agent upload portal redesign, real upload + Supabase wiring, founder-offer tracking, voiceover backend
- Phase 3: Public status tracker redesign
- Phase 4: Ops dashboard redesign
