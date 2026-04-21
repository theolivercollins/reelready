> **ARCHIVED — SUPERSEDED.** Moved 2026-04-21. See [../README.md](../README.md) for why and for the canonical replacement.
>
> Last updated: (original content preserved unchanged below)
>
> See also:
> - [../README.md](../README.md)
> - [../../HANDOFF.md](../../HANDOFF.md)
> - [../../state/PROJECT-STATE.md](../../state/PROJECT-STATE.md)

# Listing Elevate — UI/UX Audit

Comprehensive inspection of every page in the React + Vite + Tailwind + shadcn/ui app before the full redesign to Rivian × Apple luxury aesthetic. Companion to `REDESIGN-BRIEF.md`.

---

## Page-by-page findings

### 1. `src/pages/Index.tsx` — Landing
**Purpose:** Marketing + entry; hero, how-it-works, showcase, pricing/compare, FAQ, footer, embedded auth modal.

**Typography:** Playfair Display serif for headings + Inter body creates a dated "classic editorial" feel, not modern luxury. H1 at 7xl jumps directly to p at 14px — 4–7x ratio with no mid steps. Line 46/57/90 descriptions use `text-sm` with inconsistent color (`white/70` vs `muted-foreground`).

**Color:** Hero overlay `bg-gradient-to-b from-black/60 via-black/30 to-black/70` (L152) is ad-hoc, not a token. `.text-gradient-gold` hardcoded `hsl(38 70% 50%)` (index.css:99) contradicts the brief. "SAVE $25" badge `bg-accent/20 text-accent` (L280) is nearly invisible in light mode. Struck-through comparison prices at `text-muted-foreground/25` (L412–420) fail WCAG AA.

**Spacing:** Multiple competing max-widths on one page (`max-w-3xl`, `max-w-5xl`, `max-w-6xl`). Feature grid `gap-0` causes doubled borders on mobile (L232). Showcase masonry `col-span-2 row-span-2` breaks on mobile (L313).

**Flow:** Auth modal inline with CTA is confusing — if logged in, jumps to /upload; if not, modal opens. Should always route. "Download & Share" step 3 is a dead end (no actual button). FAQ answers passive and wordy. Footer has non-functional span elements styled as links (L662–663).

**Brand mismatch:** Warm orange accent, serif headings, "Premiere" language — reads as boutique cinema, not Rivian × Apple. No cinematic title-card motion, no big editorial photography.

**Copy to rewrite:**
- L173 "Every Listing Deserves a Premiere" → "Transform properties into cinematic stories"
- L227 "From photos to premiere-ready video in 72 hours. No filming crew, no scheduling, no hassle." → "Stunning video, no production crew. 72 hours, automated."
- L511 "We sent a magic link to {email}…" → "Check your inbox."

---

### 2. `src/pages/Login.tsx`
**Purpose:** Magic-link email auth.

**Typography:** H1 `font-display text-2xl font-semibold` (L40) OK. Copy is passive: "Enter your email and we'll send you a magic link" → should be "Enter your email to sign in."

**Color:** Success state `border-emerald-500/20 bg-emerald-500/5` (L47) — hardcoded emerald outside the system.

**Flow:** No loading text in button (spinner only, L88–90). No back-link home. No sign-up alternative (the Index modal has one; Login doesn't — inconsistent).

**Brand mismatch:** Sparse in a functional way, not in a premium way. No motion, no atmosphere.

---

### 3. `src/pages/AuthCallback.tsx`
**Purpose:** Redirect after magic link; routes by role.

**Issues:** `setTimeout(…, 500)` (L14) is a hack — should use auth-state listener. No error state if auth fails (user sees infinite spinner). Custom emerald CSS spinner ignores the design system.

---

### 4. `src/pages/Upload.tsx` — 640+ lines, largest page
**Purpose:** Full order form (package, duration, format, add-ons, property, photos, submit).

**Typography:** Label pattern `text-[11px] tracking-[0.15em] uppercase` is consistent (good) but 11px is illegible on mobile. Mixed weights: `font-mono text-sm font-bold` for durations (L274) vs `text-sm font-semibold` for add-ons — inconsistent hierarchy. Emoji as package icons (🏠🔥🎉✨ L96–101) is casual, not luxury.

**Color:** Selected state `border-foreground bg-foreground/[0.03]` (L240) is so subtle it reads as unselected. "SAVE $25" uses accent which is orange and barely visible on light mode. Focus ring `ring-1` (L360) should be `ring-2`.

**Spacing:** Sub-header uses `px-8 md:px-16` but form uses `px-6` — left edges don't line up. Form `max-w-xl` is too narrow for a multi-section order. Duration/Format `grid-cols-2` stays 2-col even on mobile (cramped). Photo grid `grid-cols-6 sm:grid-cols-10` gives 60px thumbnails on mobile.

**Flow:** Single long scroll with no progression indicator — user can't tell how much is left. Package icons are emoji. "Voice Clone" and "AI Voiceover" are mutually exclusive in code (L331) but UI doesn't say so — it just silently toggles off the other. Format is subordinate to Life Cycle Package but laid out as equal. No way to edit after submit-success state (dead end).

**Brand mismatch:** Transactional tone ("Build your order") not curatorial ("Compose your story"). Inline $ symbol (L374) feels cheap. "SAVE $25" badge is salesy.

**Copy:**
- L238 "New listing showcase" → "Present as new listing"
- L416 "Drop photos here or click to browse" → "Upload photos to begin"
- L423 "Or select an entire folder" → "Import folder"

---

### 5. `src/pages/Status.tsx` — Tracking
**Purpose:** Poll pipeline progress; show 6-stage stepper + video download on completion.

**Typography:** Card title is just the address at `text-xl font-bold` (L105). Stage labels `text-xs` (L152) are hard to read on small screens. Error message "Property not found" (L82) is unhelpful.

**Color:** Progress line `h-0.5 bg-primary` (L125) is too thin — should be `h-1` at minimum.

**Spacing:** Stepper `flex justify-between relative` (L121) gives equal spacing regardless of label length; long labels overflow or shrink circles.

**Flow:** Video preview is a placeholder (L172–179) — no real preview or skeleton. No back/cancel link.

**Brand mismatch:** Reads as a technical status board, not a premium delivery experience. No cinematic framing for the final video reveal.

---

### 6. `src/pages/Presets.tsx`
**Purpose:** Saved settings library that auto-fills Upload.

**Issues:** `max-w-3xl mx-auto w-full` has redundant `w-full` (L40). Preset name `truncate` with no tooltip. Delete is icon-only with no confirmation (L114). No sorting or search. Empty state uses generic Lucide icon.

**Copy:** L43 "Apply a preset when creating a new order to auto-fill your settings." → "Reuse your favorite settings."

---

### 7. `src/pages/NotFound.tsx`
**Issues:** `bg-muted` (L12) should be `bg-background`. Copy "Oops! Page not found" is generic. No brand connection or visual polish.

---

### 8. `src/pages/Account.tsx` — Shell for agent pages
**Issues:** Sub-nav uses `rounded-md` (L30) but design system radius is 1px — inconsistent. Icons take space without adding value. Content `max-w-6xl` but nav has no container → misalignment.

---

### 9. `src/pages/account/Profile.tsx` — Video branding
**Purpose:** Edit name, email, phone, logo, brand colors used in generated videos.

**Issues:** Logo has no preview until after successful upload (L74) — should show immediately from picker. Color picker is `h-10 w-10` — too small to be visible. Heading "Video Information" is generic; should be "Personalize Your Videos."

---

### 10. `src/pages/account/Billing.tsx`
**Purpose:** Cost history + payment method (Stripe placeholder).

**Issues:** Table rows have no hover state. No horizontal scroll on mobile for the cost breakdown table. Payment placeholder says "coming soon" but user expects to see an actual method — confusing.

---

### 11. `src/pages/account/Properties.tsx`
**Purpose:** Agent's own property list with status, download links.

**Issues:** Table has no max-width container. No delete action, no filter, no search. Download buttons have no icon. Deliverables column `grid grid-cols-2` cramps buttons on small screens.

---

### 12. `src/pages/Dashboard.tsx` — Admin shell
**Issues:** Sub-nav `px-6` with no max-width → full-bleed. `rounded-md` pill buttons inconsistent with sharp-corner system. Active state uses warm accent which clashes with the admin role.

---

### 13. `src/pages/dashboard/Overview.tsx`
**Purpose:** Admin KPIs + charts + active pipeline + recent completions.

**Typography:** Stat labels `text-xs` are tiny. Stat values `font-mono text-2xl font-bold` — good.

**Spacing:** 6 stat cards in `lg:grid-cols-6` is too cramped. Should be `lg:grid-cols-3`.

**Flow:** Stat cards are read-only; no drill-down. "Pipeline Throughput" is placeholder data. Rows have hover state but no click handler — looks interactive but isn't.

**Brand mismatch:** Warm accent for admin dashboards clashes — admin views should feel cooler/more data-focused.

---

### 14. `src/pages/dashboard/Pipeline.tsx`
**Purpose:** Kanban view of stages + Needs Review scene-level QC cards.

**Issues:** Cards not draggable (pure visual). Scene retry uses hardcoded prompt (L210) — no edit path. Kanban columns `lg:grid-cols-6` too cramped. Scene `text-xs` card text is hard to read.

---

### 15. `src/pages/dashboard/Properties.tsx`
**Issues:** No sortable column headers. No bulk actions. Status dropdown hardcoded `w-[140px]`. Pagination is basic prev/next without page numbers.

---

### 16. `src/pages/dashboard/Logs.tsx`
**Issues:** Auto-scroll via ref in useEffect is flaky. CSV export works (good).

---

### 17. `src/pages/dashboard/PropertyDetail.tsx`
Large component with photos, scenes, costs, logs, prompts. Needs deeper review during redesign pass.

---

## Cross-cutting issues

1. **Navigation inconsistency** — TopNav is hero-styled on home, design-system-styled elsewhere. Dashboard has horizontal pill sub-nav, Account has icon+text sub-nav, Status and Presets have only a logo header. No single pattern.

2. **Typography chaos** — Playfair Display + Inter + JetBrains Mono is three families for a "single-font" brief. Weight hierarchy shifts page-to-page. Size scale is missing midpoints.

3. **Color system breakdown** — Hardcoded emerald, gold, gradients-in-className everywhere. Design tokens exist but aren't used. Dark mode is partial — hero is always dark regardless of theme.

4. **Border radius inconsistency** — Tailwind radius = 1px, but components mix `rounded-none`, `rounded-sm`, `rounded-md`, `rounded-lg`. No single rule.

5. **Spacing inconsistency** — Multiple competing max-widths and pad scales per page. Containers don't align across sections.

6. **Icon inconsistency** — Mix of emoji and Lucide icons with varying colors. Emoji feel unprofessional.

7. **Copy tone inconsistency** — Landing marketing → Upload salesy → Dashboard technical → Account functional. No unified voice.

8. **Form inputs** — Rounded-ness varies. Focus rings inconsistent. Inline error states mostly missing.

9. **Tables** — Flat, no visual hierarchy, no hover, no alternating rows, no sort.

10. **Loading states** — Three different spinner colors/styles across the app.

11. **Error states** — Minimal; most forms don't show inline validation.

12. **Animation timing** — Framer Motion durations are scattered (0.3, 0.5, 0.8) with no standard easing.

13. **Accessibility** — Emoji without labels, low-contrast stats, focus states not visually distinct.

---

## Biggest wins (top 5)

### 1. Reset the color palette
From warm orange/gold + grays to **black / white / dark blue / blue**. This single change is 60% of the "luxury" transformation. Update `tailwind.config.ts` + `index.css` tokens, purge every hardcoded color.

### 2. Single font family, semibold for headers
Remove Playfair. Pick one modern sans (likely **Inter Display** or **Geist** — both free, self-hostable, geometric-luxury). Body 400, headers 600. Kill mono usage except for IDs and prices where mono adds meaning.

### 3. Rebuild Upload as a 4-step flow
Current single long scroll is the highest-friction screen. Step 1: Package + Duration + Format. Step 2: Add-ons. Step 3: Property details. Step 4: Photos + review + submit. Progress bar at top. Saves user context and makes success feel earned.

### 4. Unify navigation
Single sticky header with minimal links and user menu. Sub-sections use sub-tabs that share the header's container/alignment. Kill hero-specific nav styling; handle it with opacity/background transition on scroll instead.

### 5. Sharp corners everywhere
`rounded-none` as default, allow only very subtle `rounded-sm` (2px) for chips/badges. No pill buttons, no rounded cards. Apple + Rivian both lean sharp-edge geometric.

---

## Worth keeping

1. **Hero video + scroll parallax** on landing — the cinematic framing device works; just reskin the overlay/typography.
2. **Framer Motion** is already installed and in use. Keep the library, standardize timings.
3. **Magic-link auth flow** — modern, no password friction.
4. **Kanban mental model** for the admin pipeline view — good IA, just needs styling + interactivity.
5. **Package + Duration + Format + Add-ons structure** — the pricing model is coherent; only the presentation needs rework.
6. **Admin KPI stats** (Today's Props, In Pipeline, Success Rate, Cost/Video) — right metrics, wrong presentation.
7. **Brand customization in Account Profile** — logo + color for generated videos is a thoughtful differentiator.

---

## Redesign philosophy

Move from **"bright, engaging, startup-y"** → **"premium, confident, timeless"**.

- Dark first, light as thoughtful counterpart
- Cool palette (dark blue, near-black, bright blue accent, white)
- Sharp corners, geometric
- Single sans family, weight for hierarchy
- Smooth cinematic motion (longer durations, eased)
- Bold / powerful / trustworthy copy voice
- Editorial photography and product imagery over illustrations
- No emoji, no gradient backgrounds, no rounded pills
