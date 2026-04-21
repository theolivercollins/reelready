> **ARCHIVED — PAUSED PLAN.** Moved 2026-04-21. Design is viable; work deferred. See [../README.md](../README.md) for the resume signal.
>
> Last updated: (original content preserved unchanged below)
>
> See also:
> - [../README.md](../README.md)
> - [../../plans/back-on-track-plan.md](../../plans/back-on-track-plan.md)
> - [../../HANDOFF.md](../../HANDOFF.md)

# New Shell — Marketing Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/v2` marketing landing on branch `feature/new-shell` — midnight/liquid-glass visual language, market-comparison proof section replacing vanity metrics, mock-data layer that swaps to Supabase later.

**Architecture:** New shell lives under `src/v2/` — pages, components, data, hooks, styles — fully isolated from existing code. Old public routes untouched. One small conditional in `TopNav` hides the global nav on `/v2/*` so the new shell can mount its own. Data abstraction: each data-dependent component reads from a typed module under `src/v2/data/` that currently returns mock values; later the function body becomes a Supabase call with no consumer change.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind, shadcn/ui (existing), react-router-dom (existing), framer-motion (existing, used for scroll animations), Vitest + happy-dom (existing).

**Spec:** [docs/superpowers/specs/2026-04-20-new-shell-landing-design.md](../specs/2026-04-20-new-shell-landing-design.md)

---

## File Structure

```
src/v2/
  styles/
    tokens.css                       # ported from Downloads/styles.css
    v2.css                           # imports tokens + any v2-scoped globals
  pages/
    Landing.tsx                      # /v2
  components/
    landing/
      Nav.tsx
      Hero.tsx
      Process.tsx
      MarketComparison.tsx
      SelectedWork.tsx
      Pricing.tsx
      FounderOffer.tsx
      FAQ.tsx
      FinalCTA.tsx
      Footer.tsx
    primitives/
      GlassPanel.tsx
      MidnightWash.tsx
      AnimatedBar.tsx
      AnimatedNumber.tsx
      SampleBadge.tsx
      V2ThemeToggle.tsx
  data/
    sampleReels.ts
    marketStats.ts
    pricing.ts
    faqs.ts
  hooks/
    useInViewOnce.ts
    usePrefersReducedMotion.ts

src/App.tsx                          # modify: add /v2 route
src/components/TopNav.tsx            # modify: hide on /v2/*
```

---

## Task 0: Create isolated branch and worktree

**Files:** none yet

- [ ] **Step 1: Verify clean tree**

Run: `cd /Users/oliverhelgemo/real-estate-pipeline && git status`
Expected: `nothing to commit, working tree clean` on `main`.

- [ ] **Step 2: Create branch**

Run: `git checkout -b feature/new-shell`
Expected: `Switched to a new branch 'feature/new-shell'`

- [ ] **Step 3: Commit empty scaffold marker**

```bash
mkdir -p src/v2
echo "# v2 shell — see docs/superpowers/plans/2026-04-20-new-shell-landing.md" > src/v2/README.md
git add src/v2/README.md
git commit -m "chore: scaffold src/v2 for new-shell branch"
```

---

## Task 1: Port design tokens

**Files:**
- Create: `src/v2/styles/tokens.css`
- Create: `src/v2/styles/v2.css`

- [ ] **Step 1: Copy tokens file**

```bash
cp /Users/oliverhelgemo/Downloads/styles.css src/v2/styles/tokens.css
```

- [ ] **Step 2: Create v2.css importer**

Create `src/v2/styles/v2.css`:

```css
/* v2 shell global stylesheet.
   Only imported by /v2 pages — must not leak to legacy pages. */
@import url("https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap");
@import "./tokens.css";
```

- [ ] **Step 3: Commit**

```bash
git add src/v2/styles/
git commit -m "feat(v2): port design tokens from Downloads/styles.css"
```

---

## Task 2: Mount /v2 route + hide global TopNav

**Files:**
- Create: `src/v2/pages/Landing.tsx`
- Modify: `src/App.tsx` (add route)
- Modify: `src/components/TopNav.tsx` (hide on /v2/*)
- Test: `src/v2/pages/Landing.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/v2/pages/Landing.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Landing from "./Landing";

describe("Landing page", () => {
  it("renders the root landing shell", () => {
    render(
      <MemoryRouter initialEntries={["/v2"]}>
        <Landing />
      </MemoryRouter>
    );
    expect(screen.getByTestId("v2-landing-root")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/pages/Landing.test.tsx`
Expected: FAIL, `Cannot find module './Landing'`.

- [ ] **Step 3: Implement minimal Landing**

Create `src/v2/pages/Landing.tsx`:

```tsx
import "@/v2/styles/v2.css";

export default function Landing() {
  return (
    <div
      data-testid="v2-landing-root"
      data-theme="dark"
      className="le-root le-midnight-wash"
      style={{ minHeight: "100vh" }}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/pages/Landing.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add /v2 route in App.tsx**

In `src/App.tsx`, add import near the other page imports (after `import Index from "./pages/Index";`):

```tsx
import V2Landing from "./v2/pages/Landing";
```

Add route inside `<Routes>` block, directly after `<Route path="/" element={<Index />} />`:

```tsx
<Route path="/v2" element={<V2Landing />} />
```

- [ ] **Step 6: Hide global TopNav on /v2/***

In `src/components/TopNav.tsx`, at the top of the `TopNav` component (right after the hooks are called), add:

```tsx
const location = useLocation();
if (location.pathname.startsWith("/v2")) return null;
```

(If `useLocation` is already imported at the top, skip that. Based on the current file it is imported.)

- [ ] **Step 7: Manual browser check**

Run: `npm run dev`
Visit: `http://localhost:5173/v2`
Expected: dark midnight-wash full-viewport, no legacy TopNav at top.
Visit: `http://localhost:5173/`
Expected: legacy Index page renders normally with its TopNav.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/TopNav.tsx src/v2/pages/Landing.tsx src/v2/pages/Landing.test.tsx
git commit -m "feat(v2): mount /v2 landing route and hide global TopNav on v2 paths"
```

---

## Task 3: Data module — sample reels

**Files:**
- Create: `src/v2/data/sampleReels.ts`
- Test: `src/v2/data/sampleReels.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/v2/data/sampleReels.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getSampleReels } from "./sampleReels";

describe("getSampleReels", () => {
  it("returns exactly 3 reels", async () => {
    const reels = await getSampleReels();
    expect(reels).toHaveLength(3);
  });

  it("each reel has required fields", async () => {
    const reels = await getSampleReels();
    for (const reel of reels) {
      expect(reel.id).toMatch(/.+/);
      expect(reel.title).toMatch(/Sample$/);
      expect(reel.durationSec).toBeGreaterThan(0);
      expect(reel.posterUrl).toMatch(/^https?:\/\//);
      expect(reel.videoUrl).toMatch(/^https?:\/\//);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/data/sampleReels.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/v2/data/sampleReels.ts`:

```ts
export interface SampleReel {
  id: string;
  title: string;
  durationSec: number;
  posterUrl: string;
  videoUrl: string;
}

const MOCK_REELS: SampleReel[] = [
  {
    id: "coastal-modern",
    title: "Coastal Modern · Sample",
    durationSec: 38,
    posterUrl: "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1600&q=80",
    videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  },
  {
    id: "urban-loft",
    title: "Urban Loft · Sample",
    durationSec: 42,
    posterUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80",
    videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  },
  {
    id: "estate",
    title: "Estate · Sample",
    durationSec: 51,
    posterUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1600&q=80",
    videoUrl: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  },
];

export async function getSampleReels(): Promise<SampleReel[]> {
  return MOCK_REELS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/data/sampleReels.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/data/sampleReels.ts src/v2/data/sampleReels.test.ts
git commit -m "feat(v2): sample reels data module (mock for v1)"
```

---

## Task 4: Data module — market stats

**Files:**
- Create: `src/v2/data/marketStats.ts`
- Test: `src/v2/data/marketStats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/v2/data/marketStats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getMarketStats } from "./marketStats";

describe("getMarketStats", () => {
  it("returns between 3 and 5 rows (spec cuts any row that cannot be cited)", async () => {
    const rows = await getMarketStats();
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.length).toBeLessThanOrEqual(5);
  });

  it("every row has market + elevate values and a citation URL", async () => {
    const rows = await getMarketStats();
    for (const row of rows) {
      expect(row.id).toMatch(/.+/);
      expect(row.dimension).toMatch(/.+/);
      expect(row.market.label).toMatch(/.+/);
      expect(row.elevate.label).toMatch(/.+/);
      expect(row.source.label).toMatch(/.+/);
      expect(row.source.url).toMatch(/^https?:\/\//);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/data/marketStats.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/v2/data/marketStats.ts`:

```ts
export interface MarketStatValue {
  label: string;
  numericMax?: number;
}

export interface MarketStatRow {
  id: string;
  dimension: string;
  market: MarketStatValue;
  elevate: MarketStatValue;
  source: { label: string; url: string };
}

const MOCK_ROWS: MarketStatRow[] = [
  {
    id: "cost",
    dimension: "Cost per listing video",
    market: { label: "$1,200–$2,500", numericMax: 2500 },
    elevate: { label: "$380", numericMax: 380 },
    source: {
      label: "NAR + videographer market rates (2024)",
      url: "https://www.nar.realtor/research-and-statistics",
    },
  },
  {
    id: "turnaround",
    dimension: "Turnaround",
    market: { label: "5–10 business days", numericMax: 10 },
    elevate: { label: "Under 24 hours", numericMax: 1 },
    source: {
      label: "Industry videographer survey (2024)",
      url: "https://www.wyzowl.com/video-marketing-statistics/",
    },
  },
  {
    id: "effort",
    dimension: "Agent effort per video",
    market: { label: "~4 hours", numericMax: 240 },
    elevate: { label: "2 minutes", numericMax: 2 },
    source: {
      label: "Listing workflow audit — Recasi",
      url: "https://www.listingelevate.com",
    },
  },
  {
    id: "engagement",
    dimension: "Listing engagement with video vs. without",
    market: { label: "403% more inquiries", numericMax: 403 },
    elevate: { label: "Every listing gets one", numericMax: 100 },
    source: {
      label: "NAR 2024 Real Estate Video report",
      url: "https://www.nar.realtor/research-and-statistics",
    },
  },
  {
    id: "preference",
    dimension: "Sellers preferring agents who market with video",
    market: { label: "73% prefer video agents", numericMax: 73 },
    elevate: { label: "Default, not an upsell", numericMax: 100 },
    source: {
      label: "NAR Home Buyers & Sellers Report",
      url: "https://www.nar.realtor/research-and-statistics",
    },
  },
];

export async function getMarketStats(): Promise<MarketStatRow[]> {
  return MOCK_ROWS;
}
```

(Numbers above are seed values; the implementer should replace with real cited values from NAR / Wyzowl / BombBomb during research pass — see spec "Open items".)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/data/marketStats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/data/marketStats.ts src/v2/data/marketStats.test.ts
git commit -m "feat(v2): market stats data module (seed values, cite during research pass)"
```

---

## Task 5: Data modules — pricing + faqs

**Files:**
- Create: `src/v2/data/pricing.ts`
- Create: `src/v2/data/faqs.ts`
- Test: `src/v2/data/pricing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/v2/data/pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getPricingTiers } from "./pricing";
import { getFaqs } from "./faqs";

describe("getPricingTiers", () => {
  it("lead tier starts at 380", async () => {
    const tiers = await getPricingTiers();
    const lead = tiers.find(t => t.isLead);
    expect(lead?.priceUsd).toBe(380);
  });
});

describe("getFaqs", () => {
  it("returns at least 6 Q/A pairs", () => {
    const faqs = getFaqs();
    expect(faqs.length).toBeGreaterThanOrEqual(6);
    for (const f of faqs) {
      expect(f.question.length).toBeGreaterThan(0);
      expect(f.answer.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/data/pricing.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement pricing.ts**

Create `src/v2/data/pricing.ts`:

```ts
export interface PricingTier {
  id: string;
  name: string;
  priceUsd: number;
  tagline: string;
  features: string[];
  isLead: boolean;
}

const MOCK_TIERS: PricingTier[] = [
  {
    id: "starter",
    name: "Single Listing",
    priceUsd: 380,
    tagline: "One listing, one video.",
    features: ["Up to 60 photos", "16:9 and 9:16 delivered", "Under 24 hours", "Unlimited minor edits"],
    isLead: true,
  },
  {
    id: "pro",
    name: "Five-Pack",
    priceUsd: 1600,
    tagline: "$320 per listing.",
    features: ["Everything in Single", "Voiceover included", "Priority queue"],
    isLead: false,
  },
  {
    id: "brokerage",
    name: "Brokerage",
    priceUsd: 0,
    tagline: "Talk to us.",
    features: ["Volume pricing", "Brand kit on every video", "Dedicated account manager"],
    isLead: false,
  },
];

export async function getPricingTiers(): Promise<PricingTier[]> {
  return MOCK_TIERS;
}
```

- [ ] **Step 4: Implement faqs.ts**

Create `src/v2/data/faqs.ts`:

```ts
export interface Faq {
  id: string;
  question: string;
  answer: string;
}

const FAQS: Faq[] = [
  {
    id: "turnaround",
    question: "How fast will I get my video?",
    answer: "Under 24 hours from the moment you finish uploading. Every time.",
  },
  {
    id: "revisions",
    question: "What if I don't like the first cut?",
    answer: "Unlimited minor edits — reorder, trim, swap music, tweak copy. If the whole direction feels off, we re-run the pipeline free of charge.",
  },
  {
    id: "photos",
    question: "What photos do I need?",
    answer: "20 to 60 photos, any orientation. Phone-camera quality is fine. We handle exposure, crop, and order.",
  },
  {
    id: "pricing",
    question: "How much does it cost?",
    answer: "$380 for a single listing, $320 per listing on the five-pack. Brokerage volume pricing available.",
  },
  {
    id: "orientation",
    question: "Portrait or landscape?",
    answer: "Both. You get a 16:9 cut for MLS and a 9:16 cut for Instagram and TikTok on every order.",
  },
  {
    id: "voiceover",
    question: "Can I add voiceover?",
    answer: "Yes — generated voiceover is $15, or your own voice cloned (via a 30-second sample) is $25. Included free on the five-pack.",
  },
];

export function getFaqs(): Faq[] {
  return FAQS;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/v2/data/pricing.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/v2/data/pricing.ts src/v2/data/faqs.ts src/v2/data/pricing.test.ts
git commit -m "feat(v2): pricing tiers and FAQ data modules"
```

---

## Task 6: Hook — useInViewOnce

**Files:**
- Create: `src/v2/hooks/useInViewOnce.ts`
- Test: `src/v2/hooks/useInViewOnce.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/v2/hooks/useInViewOnce.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInViewOnce } from "./useInViewOnce";

describe("useInViewOnce", () => {
  let observerCallback: IntersectionObserverCallback = () => {};

  beforeEach(() => {
    class MockIO implements Partial<IntersectionObserver> {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      constructor(cb: IntersectionObserverCallback) {
        observerCallback = cb;
      }
    }
    (globalThis as any).IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
  });

  it("starts false, flips to true after intersection, and stays true", () => {
    const { result } = renderHook(() => useInViewOnce<HTMLDivElement>());
    const el = document.createElement("div");
    act(() => {
      result.current.ref(el);
    });
    expect(result.current.inView).toBe(false);

    act(() => {
      observerCallback(
        [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });
    expect(result.current.inView).toBe(true);

    // Subsequent leave should not flip back
    act(() => {
      observerCallback(
        [{ isIntersecting: false, target: el } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });
    expect(result.current.inView).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/hooks/useInViewOnce.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/v2/hooks/useInViewOnce.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

export function useInViewOnce<T extends Element>(options: IntersectionObserverInit = { threshold: 0.2 }) {
  const [inView, setInView] = useState(false);
  const nodeRef = useRef<T | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const attach = useCallback((node: T | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    nodeRef.current = node;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
          observerRef.current = null;
          return;
        }
      }
    }, options);
    observer.observe(node);
    observerRef.current = observer;
  }, [options]);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref: attach, inView };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/hooks/useInViewOnce.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/hooks/useInViewOnce.ts src/v2/hooks/useInViewOnce.test.tsx
git commit -m "feat(v2): useInViewOnce hook for one-shot scroll animations"
```

---

## Task 7: Hook — usePrefersReducedMotion

**Files:**
- Create: `src/v2/hooks/usePrefersReducedMotion.ts`
- Test: `src/v2/hooks/usePrefersReducedMotion.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/v2/hooks/usePrefersReducedMotion.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

describe("usePrefersReducedMotion", () => {
  it("returns true when media query matches", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: true,
      media: q,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it("returns false when media query does not match", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/hooks/usePrefersReducedMotion.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/v2/hooks/usePrefersReducedMotion.ts`:

```ts
import { useEffect, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = (e: MediaQueryListEvent) => setPrefers(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  return prefers;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/hooks/usePrefersReducedMotion.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/hooks/usePrefersReducedMotion.ts src/v2/hooks/usePrefersReducedMotion.test.tsx
git commit -m "feat(v2): usePrefersReducedMotion hook"
```

---

## Task 8: Primitives — static visual components

**Files:**
- Create: `src/v2/components/primitives/GlassPanel.tsx`
- Create: `src/v2/components/primitives/MidnightWash.tsx`
- Create: `src/v2/components/primitives/SampleBadge.tsx`

- [ ] **Step 1: Implement GlassPanel**

Create `src/v2/components/primitives/GlassPanel.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from "react";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "light" | "dark";
  children: ReactNode;
}

export function GlassPanel({ variant = "light", className = "", children, ...rest }: GlassPanelProps) {
  const base = variant === "dark" ? "le-glass-dark" : "le-glass";
  return (
    <div className={`${base} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Implement MidnightWash**

Create `src/v2/components/primitives/MidnightWash.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from "react";

interface MidnightWashProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function MidnightWash({ className = "", children, ...rest }: MidnightWashProps) {
  return (
    <div className={`le-midnight-wash ${className}`.trim()} data-theme="dark" {...rest}>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Implement SampleBadge**

Create `src/v2/components/primitives/SampleBadge.tsx`:

```tsx
export function SampleBadge() {
  return (
    <span
      className="le-badge le-mono"
      style={{
        background: "rgba(255,255,255,0.12)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.25)",
        letterSpacing: "0.18em",
      }}
    >
      <span className="le-badge-dot" style={{ background: "#fff" }} />
      SAMPLE
    </span>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/v2/components/primitives/GlassPanel.tsx src/v2/components/primitives/MidnightWash.tsx src/v2/components/primitives/SampleBadge.tsx
git commit -m "feat(v2): GlassPanel, MidnightWash, SampleBadge primitives"
```

---

## Task 9: Primitive — AnimatedNumber

**Files:**
- Create: `src/v2/components/primitives/AnimatedNumber.tsx`
- Test: `src/v2/components/primitives/AnimatedNumber.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/v2/components/primitives/AnimatedNumber.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnimatedNumber } from "./AnimatedNumber";

describe("AnimatedNumber", () => {
  it("renders the final label when animate=false (reduced motion)", () => {
    render(<AnimatedNumber value={380} label="$380" animate={false} />);
    expect(screen.getByText("$380")).toBeTruthy();
  });

  it("renders the final label when animate=true and start has completed", () => {
    render(<AnimatedNumber value={380} label="$380" animate={true} />);
    // Final DOM still contains the final label text; the tween lives inline.
    expect(screen.getByText("$380")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/components/primitives/AnimatedNumber.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/v2/components/primitives/AnimatedNumber.tsx`:

```tsx
import { motion } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  label: string;
  animate: boolean;
  delayMs?: number;
}

export function AnimatedNumber({ value, label, animate, delayMs = 0 }: AnimatedNumberProps) {
  if (!animate) {
    return <span>{label}</span>;
  }
  return (
    <motion.span
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: delayMs / 1000, ease: [0.16, 1, 0.3, 1] }}
    >
      {label}
    </motion.span>
  );
}
```

Note: a value-tween implementation is reserved for a later polish pass — for v1 we animate the reveal of the final label. The `value` prop is kept on the interface so a future tween version can read it without a breaking API change.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/components/primitives/AnimatedNumber.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/components/primitives/AnimatedNumber.tsx src/v2/components/primitives/AnimatedNumber.test.tsx
git commit -m "feat(v2): AnimatedNumber primitive"
```

---

## Task 10: Primitive — AnimatedBar

**Files:**
- Create: `src/v2/components/primitives/AnimatedBar.tsx`
- Test: `src/v2/components/primitives/AnimatedBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/v2/components/primitives/AnimatedBar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AnimatedBar } from "./AnimatedBar";

describe("AnimatedBar", () => {
  it("renders a bar with the given aria value", () => {
    const { container } = render(
      <AnimatedBar fillPercent={42} animate={false} variant="market" label="Market" />
    );
    const bar = container.querySelector('[role="meter"]');
    expect(bar).toBeTruthy();
    expect(bar?.getAttribute("aria-valuenow")).toBe("42");
  });

  it("reduced-motion variant snaps to the final width without a transition", () => {
    const { container } = render(
      <AnimatedBar fillPercent={80} animate={false} variant="elevate" label="Elevate" />
    );
    const fill = container.querySelector('[data-testid="bar-fill"]') as HTMLElement;
    expect(fill.style.width).toBe("80%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/components/primitives/AnimatedBar.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `src/v2/components/primitives/AnimatedBar.tsx`:

```tsx
import { motion } from "framer-motion";

interface AnimatedBarProps {
  fillPercent: number;
  animate: boolean;
  variant: "market" | "elevate";
  label: string;
  delayMs?: number;
}

export function AnimatedBar({ fillPercent, animate, variant, label, delayMs = 0 }: AnimatedBarProps) {
  const bg = variant === "elevate" ? "var(--le-accent)" : "var(--le-border-strong)";
  const clamped = Math.max(0, Math.min(100, fillPercent));

  return (
    <div
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{
        position: "relative",
        height: 6,
        width: "100%",
        background: "var(--le-bg-sunken)",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      {animate ? (
        <motion.div
          data-testid="bar-fill"
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.9, delay: delayMs / 1000, ease: [0.16, 1, 0.3, 1] }}
          style={{ height: "100%", background: bg, borderRadius: "inherit" }}
        />
      ) : (
        <div
          data-testid="bar-fill"
          style={{ height: "100%", width: `${clamped}%`, background: bg, borderRadius: "inherit" }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/components/primitives/AnimatedBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/components/primitives/AnimatedBar.tsx src/v2/components/primitives/AnimatedBar.test.tsx
git commit -m "feat(v2): AnimatedBar primitive with reduced-motion support"
```

---

## Task 11: Primitive — V2ThemeToggle

**Files:**
- Create: `src/v2/components/primitives/V2ThemeToggle.tsx`

This wraps the existing `next-themes` provider (already mounted at the app root via `@/lib/theme`) and renders a minimal glass button that flips `data-theme` on `.le-root` nodes.

- [ ] **Step 1: Implement**

Create `src/v2/components/primitives/V2ThemeToggle.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function V2ThemeToggle() {
  const initial = typeof window !== "undefined"
    ? (localStorage.getItem("le-theme") as "light" | "dark" | null) ?? "dark"
    : "dark";
  const [theme, setTheme] = useState<"light" | "dark">(initial);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".le-root, [data-v2-root]").forEach(el => {
      el.setAttribute("data-theme", theme);
    });
    document.documentElement.setAttribute("data-v2-theme", theme);
    localStorage.setItem("le-theme", theme);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme(t => (t === "dark" ? "light" : "dark"))}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="le-btn le-btn-glass"
      style={{ padding: "6px 10px", borderRadius: 999 }}
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/v2/components/primitives/V2ThemeToggle.tsx
git commit -m "feat(v2): V2ThemeToggle flips data-theme on v2 roots only"
```

---

## Task 12: Section — Nav

**Files:**
- Create: `src/v2/components/landing/Nav.tsx`

- [ ] **Step 1: Implement**

Create `src/v2/components/landing/Nav.tsx`:

```tsx
import { Link } from "react-router-dom";
import { V2ThemeToggle } from "@/v2/components/primitives/V2ThemeToggle";

export function Nav() {
  return (
    <nav
      className="le-glass-dark"
      style={{
        position: "sticky",
        top: 16,
        margin: "16px auto 0",
        maxWidth: 1200,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        borderRadius: 999,
        zIndex: 20,
      }}
    >
      <Link to="/v2" className="le-display" style={{ fontSize: 20, color: "var(--le-text)" }}>
        Listing <em style={{ fontStyle: "italic" }}>Elevate</em>
      </Link>
      <div style={{ display: "flex", gap: 20, fontFamily: "var(--le-font-sans)", fontSize: 13, letterSpacing: "0.02em" }}>
        <a href="#process" style={{ color: "var(--le-text-muted)" }}>Process</a>
        <a href="#showcase" style={{ color: "var(--le-text-muted)" }}>Showcase</a>
        <a href="#pricing" style={{ color: "var(--le-text-muted)" }}>Pricing</a>
        <a href="#faq" style={{ color: "var(--le-text-muted)" }}>FAQ</a>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <V2ThemeToggle />
        <Link to="/login" className="le-btn le-btn-ghost" style={{ padding: "7px 14px", fontSize: 13 }}>
          Sign in
        </Link>
        <Link to="/upload" className="le-btn le-btn-primary" style={{ padding: "7px 14px", fontSize: 13 }}>
          Get started →
        </Link>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/v2/components/landing/Nav.tsx
git commit -m "feat(v2): sticky glass Nav section"
```

---

## Task 13: Section — Hero

**Files:**
- Create: `src/v2/components/landing/Hero.tsx`

- [ ] **Step 1: Implement**

Create `src/v2/components/landing/Hero.tsx`:

```tsx
import { Link } from "react-router-dom";

export function Hero() {
  return (
    <section
      style={{
        position: "relative",
        minHeight: "72vh",
        padding: "120px 48px 80px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        maxWidth: 1440,
        margin: "0 auto",
        color: "#fff",
      }}
    >
      <div className="le-eyebrow" style={{ marginBottom: 16 }}>
        LISTING ELEVATE · CINEMATIC · ON DEMAND
      </div>
      <h1
        className="le-display"
        style={{
          fontSize: "clamp(56px, 9vw, 128px)",
          lineHeight: 0.95,
          marginBottom: 24,
          maxWidth: 1100,
        }}
      >
        Retain more listings.
      </h1>
      <p
        style={{
          fontFamily: "var(--le-font-sans)",
          fontSize: 17,
          maxWidth: 520,
          color: "rgba(255,255,255,0.75)",
          marginBottom: 40,
          lineHeight: 1.55,
        }}
      >
        Upload photos. Receive a directed, edited, cinematic listing video in 24 hours. No crew, no scheduling, no post-production.
      </p>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <Link to="/upload" className="le-btn le-btn-primary" style={{ padding: "12px 22px", fontSize: 14 }}>
          Start a video →
        </Link>
        <Link to="/login" style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, textDecoration: "underline", textUnderlineOffset: 6 }}>
          Sign in to your account →
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/v2/components/landing/Hero.tsx
git commit -m "feat(v2): Hero section with 24h copy"
```

---

## Task 14: Section — Process

**Files:**
- Create: `src/v2/components/landing/Process.tsx`

- [ ] **Step 1: Implement**

Create `src/v2/components/landing/Process.tsx`:

```tsx
interface Step {
  n: string;
  title: string;
  body: string;
  imageUrl: string;
}

const STEPS: Step[] = [
  {
    n: "01 / 03",
    title: "Upload",
    body: "Drop 20–60 photos. We handle exposure, orientation, and metadata. Takes a minute.",
    imageUrl: "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=900&q=80",
  },
  {
    n: "02 / 03",
    title: "Direct",
    body: "Our model scripts the shot plan — camera work, room order, voice, and mood.",
    imageUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80",
  },
  {
    n: "03 / 03",
    title: "Deliver",
    body: "A human editor reviews. You receive 16:9 and 9:16 cuts, ready to broadcast.",
    imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=900&q=80",
  },
];

export function Process() {
  return (
    <section
      id="process"
      style={{
        background: "var(--le-bg)",
        color: "var(--le-text)",
        padding: "140px 48px",
        maxWidth: 1440,
        margin: "0 auto",
      }}
      data-theme="light"
    >
      <div className="le-eyebrow" style={{ marginBottom: 24 }}>— THE PROCESS</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 80, gap: 48 }}>
        <h2 className="le-display" style={{ fontSize: "clamp(48px, 6vw, 96px)", lineHeight: 1, margin: 0 }}>
          Three steps.
          <br />
          One day.
        </h2>
        <p style={{ maxWidth: 320, fontSize: 14, color: "var(--le-text-muted)", lineHeight: 1.6, fontFamily: "var(--le-font-sans)" }}>
          Every frame directed by our model. Every cut approved by a human editor. No templates, no stock, no crew.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48 }}>
        {STEPS.map(step => (
          <div key={step.n}>
            <div className="le-eyebrow" style={{ marginBottom: 16 }}>{step.n}</div>
            <div
              className="le-img-placeholder"
              style={{
                aspectRatio: "4 / 3",
                backgroundImage: `url(${step.imageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                marginBottom: 24,
              }}
              aria-hidden
            />
            <h3 className="le-display" style={{ fontSize: 32, margin: "0 0 12px" }}>{step.title}</h3>
            <p style={{ fontSize: 14, color: "var(--le-text-muted)", lineHeight: 1.6, fontFamily: "var(--le-font-sans)", margin: 0 }}>
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/v2/components/landing/Process.tsx
git commit -m "feat(v2): Process section — Three steps. One day."
```

---

## Task 15: Section — MarketComparison (flagship)

**Files:**
- Create: `src/v2/components/landing/MarketComparison.tsx`
- Test: `src/v2/components/landing/MarketComparison.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/v2/components/landing/MarketComparison.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MarketComparison } from "./MarketComparison";

beforeEach(() => {
  class MockIO {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(_cb: IntersectionObserverCallback) {}
  }
  (globalThis as any).IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: true, // reduced-motion on, easier to assert
    media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
});

describe("MarketComparison", () => {
  it("renders all market-stat rows loaded from the data module", async () => {
    render(<MarketComparison />);
    await waitFor(() => {
      expect(screen.getByText("Cost per listing video")).toBeTruthy();
      expect(screen.getByText("Turnaround")).toBeTruthy();
    });
  });

  it("renders an accessible link for each citation", async () => {
    render(<MarketComparison />);
    await waitFor(() => {
      const links = screen.getAllByRole("link");
      expect(links.length).toBeGreaterThanOrEqual(3);
      for (const a of links) {
        expect(a.getAttribute("href")).toMatch(/^https?:\/\//);
      }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/v2/components/landing/MarketComparison.test.tsx`
Expected: FAIL, component not found.

- [ ] **Step 3: Implement**

Create `src/v2/components/landing/MarketComparison.tsx`:

```tsx
import { useEffect, useState } from "react";
import { getMarketStats, type MarketStatRow } from "@/v2/data/marketStats";
import { AnimatedBar } from "@/v2/components/primitives/AnimatedBar";
import { AnimatedNumber } from "@/v2/components/primitives/AnimatedNumber";
import { useInViewOnce } from "@/v2/hooks/useInViewOnce";
import { usePrefersReducedMotion } from "@/v2/hooks/usePrefersReducedMotion";

export function MarketComparison() {
  const [rows, setRows] = useState<MarketStatRow[]>([]);

  useEffect(() => {
    getMarketStats().then(setRows);
  }, []);

  return (
    <section
      id="compare"
      style={{
        background: "var(--le-bg)",
        color: "var(--le-text)",
        padding: "140px 48px",
        maxWidth: 1440,
        margin: "0 auto",
      }}
      data-theme="light"
    >
      <div className="le-eyebrow" style={{ marginBottom: 24 }}>— HOW WE COMPARE</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 80, gap: 48 }}>
        <h2 className="le-display" style={{ fontSize: "clamp(48px, 6vw, 96px)", lineHeight: 1, margin: 0, maxWidth: 800 }}>
          The market average,
          <br />
          and then us.
        </h2>
        <p style={{ maxWidth: 360, fontSize: 14, color: "var(--le-text-muted)", lineHeight: 1.6, fontFamily: "var(--le-font-sans)" }}>
          Every number independently sourced. We'll replace these with your numbers the day you run a listing with us.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        {rows.map((row, i) => (
          <MarketComparisonRow key={row.id} row={row} index={i} />
        ))}
      </div>
    </section>
  );
}

function MarketComparisonRow({ row, index }: { row: MarketStatRow; index: number }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const reducedMotion = usePrefersReducedMotion();
  const animate = inView && !reducedMotion;

  const max = Math.max(row.market.numericMax ?? 0, row.elevate.numericMax ?? 0, 1);
  const marketPct = ((row.market.numericMax ?? 0) / max) * 100;
  const elevatePct = ((row.elevate.numericMax ?? 0) / max) * 100;

  return (
    <div
      ref={ref}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1fr) 2fr auto",
        gap: 32,
        alignItems: "center",
        paddingBottom: 32,
        borderBottom: "1px solid var(--le-border)",
      }}
    >
      <div>
        <div className="le-eyebrow" style={{ marginBottom: 8 }}>0{index + 1}</div>
        <h3 className="le-display" style={{ fontSize: 22, margin: 0 }}>{row.dimension}</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="le-mono" style={{ fontSize: 11, color: "var(--le-text-muted)", width: 80, textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Market
          </span>
          <AnimatedBar fillPercent={marketPct} animate={animate} variant="market" label={`Market ${row.dimension}`} />
          <span style={{ fontSize: 14, color: "var(--le-text-muted)", width: 180, textAlign: "right" }}>
            <AnimatedNumber value={row.market.numericMax ?? 0} label={row.market.label} animate={animate} />
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="le-mono" style={{ fontSize: 11, color: "var(--le-text)", width: 80, textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Elevate
          </span>
          <AnimatedBar fillPercent={elevatePct} animate={animate} variant="elevate" label={`Elevate ${row.dimension}`} delayMs={150} />
          <span style={{ fontSize: 14, color: "var(--le-text)", width: 180, textAlign: "right", fontWeight: 500 }}>
            <AnimatedNumber value={row.elevate.numericMax ?? 0} label={row.elevate.label} animate={animate} delayMs={150} />
          </span>
        </div>
      </div>
      <a
        href={row.source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="le-mono"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--le-text-faint)",
          maxWidth: 180,
          textAlign: "right",
          textDecoration: "none",
          lineHeight: 1.4,
        }}
      >
        Source: {row.source.label} ↗
      </a>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/v2/components/landing/MarketComparison.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/components/landing/MarketComparison.tsx src/v2/components/landing/MarketComparison.test.tsx
git commit -m "feat(v2): MarketComparison section — flagship proof point"
```

---

## Task 16: Section — SelectedWork

**Files:**
- Create: `src/v2/components/landing/SelectedWork.tsx`

- [ ] **Step 1: Implement**

Create `src/v2/components/landing/SelectedWork.tsx`:

```tsx
import { useEffect, useState } from "react";
import { getSampleReels, type SampleReel } from "@/v2/data/sampleReels";
import { SampleBadge } from "@/v2/components/primitives/SampleBadge";

export function SelectedWork() {
  const [reels, setReels] = useState<SampleReel[]>([]);

  useEffect(() => {
    getSampleReels().then(setReels);
  }, []);

  if (reels.length === 0) return null;
  const [hero, ...rest] = reels;

  return (
    <section
      id="showcase"
      className="le-midnight-wash"
      data-theme="dark"
      style={{ padding: "140px 48px", color: "#fff" }}
    >
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <div className="le-eyebrow" style={{ marginBottom: 24, color: "rgba(255,255,255,0.55)" }}>— SHOWCASE</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 56 }}>
          <h2 className="le-display" style={{ fontSize: "clamp(48px, 6vw, 96px)", lineHeight: 1, margin: 0 }}>
            Selected work.
          </h2>
          <a href="#showcase" style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", textDecoration: "underline", textUnderlineOffset: 6 }}>
            View the reel →
          </a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
          <ReelCard reel={hero} large />
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {rest.map(r => <ReelCard key={r.id} reel={r} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReelCard({ reel, large = false }: { reel: SampleReel; large?: boolean }) {
  const mins = Math.floor(reel.durationSec / 60);
  const secs = (reel.durationSec % 60).toString().padStart(2, "0");
  return (
    <div style={{ position: "relative", aspectRatio: large ? "4 / 3" : "16 / 10", borderRadius: 14, overflow: "hidden" }}>
      <img src={reel.posterUrl} alt={reel.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", top: 16, left: 16 }}>
        <span className="le-mono" style={{ fontSize: 10, padding: "4px 8px", borderRadius: 999, background: "rgba(0,0,0,0.5)", color: "#fff", backdropFilter: "blur(8px)" }}>
          ▶ {mins}:{secs}
        </span>
      </div>
      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <SampleBadge />
      </div>
      <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, color: "#fff" }}>
        <div style={{ fontSize: large ? 22 : 17, fontWeight: 500, marginBottom: 4 }}>{reel.title}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/v2/components/landing/SelectedWork.tsx
git commit -m "feat(v2): SelectedWork section with SAMPLE badges"
```

---

## Task 17: Section — Pricing

**Files:**
- Create: `src/v2/components/landing/Pricing.tsx`

- [ ] **Step 1: Implement**

Create `src/v2/components/landing/Pricing.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPricingTiers, type PricingTier } from "@/v2/data/pricing";

export function Pricing() {
  const [tiers, setTiers] = useState<PricingTier[]>([]);

  useEffect(() => {
    getPricingTiers().then(setTiers);
  }, []);

  return (
    <section
      id="pricing"
      data-theme="light"
      style={{ background: "var(--le-bg)", color: "var(--le-text)", padding: "140px 48px" }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div className="le-eyebrow" style={{ marginBottom: 24 }}>— PRICING</div>
        <h2 className="le-display" style={{ fontSize: "clamp(48px, 6vw, 96px)", lineHeight: 1, margin: "0 0 64px" }}>
          Priced per listing.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiers.length}, 1fr)`, gap: 24 }}>
          {tiers.map(t => (
            <div
              key={t.id}
              className="le-card"
              style={{
                padding: 32,
                borderColor: t.isLead ? "var(--le-text)" : undefined,
                borderWidth: t.isLead ? 1.5 : 1,
              }}
            >
              <div className="le-eyebrow" style={{ marginBottom: 12 }}>{t.name}</div>
              <div className="le-display" style={{ fontSize: 56, lineHeight: 1, marginBottom: 8 }}>
                {t.priceUsd > 0 ? `$${t.priceUsd.toLocaleString()}` : "Talk"}
              </div>
              <div style={{ fontSize: 14, color: "var(--le-text-muted)", marginBottom: 24 }}>{t.tagline}</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 8 }}>
                {t.features.map(f => (
                  <li key={f} style={{ fontSize: 14, color: "var(--le-text-muted)", fontFamily: "var(--le-font-sans)" }}>
                    — {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/upload"
                className={`le-btn ${t.isLead ? "le-btn-primary" : "le-btn-ghost"}`}
                style={{ width: "100%", padding: "10px 16px", fontSize: 13 }}
              >
                {t.priceUsd > 0 ? "Get started →" : "Contact sales →"}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/v2/components/landing/Pricing.tsx
git commit -m "feat(v2): Pricing section with concrete tier numbers"
```

---

## Task 18: Section — FounderOffer

**Files:**
- Create: `src/v2/components/landing/FounderOffer.tsx`

- [ ] **Step 1: Implement**

Create `src/v2/components/landing/FounderOffer.tsx`:

```tsx
import { Link } from "react-router-dom";

export function FounderOffer() {
  return (
    <section
      data-theme="light"
      style={{
        background: "var(--le-bg-sunken)",
        color: "var(--le-text)",
        padding: "24px 48px",
        borderTop: "1px solid var(--le-border)",
        borderBottom: "1px solid var(--le-border)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="le-mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--le-text-muted)" }}>
            Founding agents
          </span>
          <span style={{ fontFamily: "var(--le-font-sans)", fontSize: 15 }}>
            50% off your first three videos. First 50 signups.
          </span>
        </div>
        <Link to="/upload" className="le-btn le-btn-primary" style={{ padding: "8px 16px", fontSize: 13 }}>
          Claim spot →
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/v2/components/landing/FounderOffer.tsx
git commit -m "feat(v2): FounderOffer strip"
```

---

## Task 19: Section — FAQ

**Files:**
- Create: `src/v2/components/landing/FAQ.tsx`

- [ ] **Step 1: Implement**

Create `src/v2/components/landing/FAQ.tsx`:

```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getFaqs } from "@/v2/data/faqs";

export function FAQ() {
  const faqs = getFaqs();
  return (
    <section
      id="faq"
      data-theme="light"
      style={{ background: "var(--le-bg)", color: "var(--le-text)", padding: "140px 48px" }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div className="le-eyebrow" style={{ marginBottom: 24 }}>— FAQ</div>
        <h2 className="le-display" style={{ fontSize: "clamp(48px, 6vw, 96px)", lineHeight: 1, margin: "0 0 64px" }}>
          Questions, briefly.
        </h2>
        <Accordion type="single" collapsible>
          {faqs.map(f => (
            <AccordionItem key={f.id} value={f.id}>
              <AccordionTrigger className="le-display" style={{ fontSize: 22, textAlign: "left" }}>
                {f.question}
              </AccordionTrigger>
              <AccordionContent style={{ fontSize: 15, color: "var(--le-text-muted)", lineHeight: 1.6, fontFamily: "var(--le-font-sans)" }}>
                {f.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/v2/components/landing/FAQ.tsx
git commit -m "feat(v2): FAQ section using shadcn Accordion"
```

---

## Task 20: Section — FinalCTA + Footer

**Files:**
- Create: `src/v2/components/landing/FinalCTA.tsx`
- Create: `src/v2/components/landing/Footer.tsx`

- [ ] **Step 1: Implement FinalCTA**

Create `src/v2/components/landing/FinalCTA.tsx`:

```tsx
import { Link } from "react-router-dom";

export function FinalCTA() {
  return (
    <section
      className="le-midnight-wash"
      data-theme="dark"
      style={{
        padding: "140px 48px",
        color: "#fff",
        textAlign: "center",
      }}
    >
      <h2 className="le-display" style={{ fontSize: "clamp(56px, 7vw, 112px)", lineHeight: 1, margin: "0 0 40px" }}>
        Elevate your next listing.
      </h2>
      <Link to="/upload" className="le-btn le-btn-primary" style={{ padding: "14px 28px", fontSize: 15 }}>
        Start a video →
      </Link>
    </section>
  );
}
```

- [ ] **Step 2: Implement Footer**

Create `src/v2/components/landing/Footer.tsx`:

```tsx
export function Footer() {
  return (
    <footer
      data-theme="light"
      style={{
        background: "var(--le-bg)",
        color: "var(--le-text-muted)",
        padding: "40px 48px",
        borderTop: "1px solid var(--le-border)",
        fontSize: 13,
        fontFamily: "var(--le-font-sans)",
      }}
    >
      <div style={{ maxWidth: 1440, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <div className="le-display" style={{ fontSize: 18, color: "var(--le-text)" }}>
          Listing <em>Elevate</em>
        </div>
        <nav style={{ display: "flex", gap: 24 }}>
          <a href="#process">Process</a>
          <a href="#showcase">Showcase</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
        </nav>
        <div>© 2026 Listing Elevate, Inc.</div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/v2/components/landing/FinalCTA.tsx src/v2/components/landing/Footer.tsx
git commit -m "feat(v2): FinalCTA and Footer sections"
```

---

## Task 21: Assemble Landing page

**Files:**
- Modify: `src/v2/pages/Landing.tsx`

- [ ] **Step 1: Wire all sections into Landing**

Replace `src/v2/pages/Landing.tsx` with:

```tsx
import "@/v2/styles/v2.css";
import { Nav } from "@/v2/components/landing/Nav";
import { Hero } from "@/v2/components/landing/Hero";
import { Process } from "@/v2/components/landing/Process";
import { MarketComparison } from "@/v2/components/landing/MarketComparison";
import { SelectedWork } from "@/v2/components/landing/SelectedWork";
import { Pricing } from "@/v2/components/landing/Pricing";
import { FounderOffer } from "@/v2/components/landing/FounderOffer";
import { FAQ } from "@/v2/components/landing/FAQ";
import { FinalCTA } from "@/v2/components/landing/FinalCTA";
import { Footer } from "@/v2/components/landing/Footer";

export default function Landing() {
  return (
    <div
      data-testid="v2-landing-root"
      data-v2-root
      className="le-root"
      data-theme={typeof window !== "undefined" ? (localStorage.getItem("le-theme") ?? "dark") : "dark"}
      style={{ minHeight: "100vh", background: "var(--le-bg)" }}
    >
      <div className="le-midnight-wash" data-theme="dark" style={{ position: "relative" }}>
        <Nav />
        <Hero />
      </div>
      <Process />
      <MarketComparison />
      <SelectedWork />
      <Pricing />
      <FounderOffer />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Re-run landing test to verify nothing regressed**

Run: `npx vitest run src/v2/`
Expected: all `src/v2/**` tests PASS.

- [ ] **Step 3: Manual browser QA**

Run: `npm run dev`
Visit: `http://localhost:5173/v2`

Verify:
- All 10 sections render in order
- Theme toggle in nav flips light/dark without a full reload
- Market-comparison bars animate on scroll
- Scrolling past a row once and back does not re-trigger animation
- Reduced-motion system setting → bars snap to final width with no transition
- Every citation link opens in a new tab
- `/` still loads the legacy landing correctly
- `/dashboard` and `/upload` still load with the legacy TopNav

- [ ] **Step 4: Commit**

```bash
git add src/v2/pages/Landing.tsx
git commit -m "feat(v2): assemble Landing page with all sections"
```

---

## Task 22: Replace market-stats seed values with cited research

**Files:**
- Modify: `src/v2/data/marketStats.ts`

- [ ] **Step 1: Research**

Pull real numbers from:
- NAR Home Buyers & Sellers Report (most recent) — seller preference for video, buyer engagement lift
- Wyzowl State of Video Marketing — cost + engagement stats
- Industry videographer rate surveys — market cost range
- Any real videographer pricing pages screenshot for "5–10 business days" turnaround

For each row, pick ONE primary source. If no clean source exists for a row, **remove the row entirely rather than fabricate**.

- [ ] **Step 2: Update marketStats.ts**

Replace seed values in `src/v2/data/marketStats.ts` with real values + citation URLs. Keep the interface unchanged.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/v2/data/marketStats.test.ts`
Expected: PASS (still between 3 and 5 rows, every row has a citation URL).

- [ ] **Step 4: Manual QA**

Run: `npm run dev`, visit `/v2`, scroll to Market Comparison, click each source link.
Expected: each opens a real, live page that substantiates the claim.

- [ ] **Step 5: Commit**

```bash
git add src/v2/data/marketStats.ts
git commit -m "feat(v2): replace market-stats seed values with cited research"
```

---

## Task 23: Accessibility + build verification

**Files:**
- Verify only (no new code unless gaps found)

- [ ] **Step 1: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: 0 errors in `src/v2/**`.

Run: `npm run build`
Expected: build succeeds, `/v2` in the emitted HTML.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 3: Lighthouse smoke**

Run: `npm run build && npm run preview` in one terminal.
Open Chrome DevTools → Lighthouse → Desktop → Performance + Accessibility on `http://localhost:4173/v2`.
Expected: Performance ≥ 90, Accessibility ≥ 95.

If Accessibility < 95, fix the top offenders (missing alts, low contrast, focus rings) inline. Commit each fix as its own commit.

- [ ] **Step 4: Reduced-motion smoke**

On macOS: System Settings → Accessibility → Display → "Reduce motion" ON.
Reload `/v2`.
Expected: Market-comparison bars appear at final width with no tween.

- [ ] **Step 5: Legacy regression check**

Visit `/`, `/upload`, `/status/:id` (any real id), `/dashboard`.
Expected: each legacy route renders identically to `main`.

- [ ] **Step 6: Commit any a11y fixes**

If any a11y fixes were made:

```bash
git add <files>
git commit -m "fix(v2): accessibility corrections for /v2 landing"
```

---

## Self-review checklist (completed before handoff)

- **Spec coverage:** every spec section maps to at least one task
  - Branch + routes → Task 0, Task 2
  - File layout → Tasks 1, 3-20
  - Data abstraction → Tasks 3-5
  - 10 landing sections → Tasks 12-20
  - Market comparison detail → Task 15
  - Selected work framing → Task 16
  - FAQ content → Task 5 + 19
  - Theming → Tasks 11, 21
  - Accessibility → Tasks 6, 7, 10, 15, 23
  - Testing → Tasks 2, 3, 4, 5, 6, 7, 9, 10, 15, 23
  - Open items (real research citations) → Task 22
- **Placeholder scan:** no "TBD" in step bodies; seed market-stat values marked as replace-in-Task-22
- **Type consistency:** `MarketStatRow`, `MarketStatValue`, `SampleReel`, `PricingTier`, `Faq` used consistently throughout
- **Scope:** Phase 1 only (landing); agent upload, status, ops dashboard explicitly deferred to later specs
