# Listing Elevate — UI Redesign Brief

## Brand

- **Name:** Listing Elevate
- **Positioning:** Innovative, modern, luxury, smart
- **Product:** AI-powered cinematic video pipeline for real-estate listings
- **Palette:** Black, white, dark blue, blue (exact shades TBD in design tokens)
- **Typography:** Single family, semibold for headers. Font choice delegated to designer.
- **Primary device:** Desktop-first (mobile responsive, not mobile-first)
- **Landing page:** Home page doubles as marketing + entry point to app
- **Previous names in codebase to purge:** ReelReady, KEY FRAME, reelready

## Goals

Current UI is inconsistent, unintuitive, and doesn't reflect a premium brand. Redesign must:

1. Feel modern, luxurious, and intelligent — not generic SaaS
2. Be fully consistent across every page (typography, spacing, components, motion)
3. Be intuitive — new users should understand each screen in seconds
4. Support dark and light modes with first-class parity
5. Rethink the flow, not just the skin — UX and IA are also on the table

## Scope — all pages

Every user-facing screen is in scope. No page is off-limits.

- Landing / Index (`src/pages/Index.tsx`)
- Login (`src/pages/Login.tsx`)
- Auth callback (`src/pages/AuthCallback.tsx`)
- Upload / new order (`src/pages/Upload.tsx`) — the critical path
- Status / tracking (`src/pages/Status.tsx`)
- Dashboard (`src/pages/Dashboard.tsx` + `src/pages/dashboard/*`)
- Account (`src/pages/Account.tsx` + `src/pages/account/*`)
- Presets (`src/pages/Presets.tsx`)
- 404 (`src/pages/NotFound.tsx`)

## Design system

- **Typography:** single font family everywhere. Semibold variant for headers. No serif/sans split.
- **Color:** dark + light, full parity
- **Motion:** cohesive, consistent — still TBD on tone (subtle vs cinematic)
- **Components:** shadcn/ui + Radix already in place; redesign component-by-component rather than replacing the library

## Constraints

- Nothing in the current design is sacred — copy, colors, flows, packaging all negotiable
- Existing backend + pipeline stay untouched — this is a frontend-only redesign
- Drive-link upload feature is parked on `drive-ingest` branch — ignore for this redesign; assume file-upload path only

## Process

Uses the `redesign-skill` from https://github.com/Leonxlnx/taste-skill — audit first, then fix design problems systematically.

## Branching

- New branch: `ui-redesign` off current `main`
- Drive ingest work stays on `drive-ingest` (untouched)
- Ship order: TBD — likely merge `ui-redesign` into `main` first, then rebase `drive-ingest` on top

## Decisions

- **Logo:** Design a custom wordmark for "Listing Elevate". No existing mark.
- **Reference vibe:** Rivian × Apple, translated into a real estate marketing / AI product.
  - From Rivian: deep blues, big editorial photography, automotive-luxe confidence, generous negative space
  - From Apple: cinematic product-page choreography, precise typography, restrained color, quiet premium feel
- **Motion:** Smooth cinematic — longer, eased transitions with scroll-driven reveals, not snappy micro-interactions. Framer Motion already installed.
- **Voice:** Bold, powerful, trustworthy. Rewrite all microcopy to match.
- **Pricing structure:** Flexible — restructure if it serves the design, otherwise keep current tiers.
- **Roles:**
  - **Dashboard** = Admin view. Shows orders across all agents, revenue, costs, pipeline health, operational metrics.
  - **Account** = Agent view. Agent sees their own orders, order history, saved presets, profile.
  - Upload flow is the same for both; role-based routing after login determines which home they land on.
