# Listing Elevate — Stack Reference

## Infrastructure

| Service | Role | Notes |
|---|---|---|
| Vercel | Hosting, serverless functions, cron jobs, custom domain | `listingelevate.com` + `reelready-eight.vercel.app` |
| Supabase | Postgres, pgvector, Storage, Auth (magic link), RLS, RPCs | Project: `vrhmaeywqsohlztoouxu` |
| GitHub | Source control | Repo: `theolivercollins/reelready` |

## AI / ML

| Service | Model / Method | Usage |
|---|---|---|
| Anthropic | Claude Sonnet 4.6 | Photo analysis, director prompting, refinement, rule mining |
| OpenAI | text-embedding-3-small (1536 dim) | pgvector similarity retrieval (Lab + prod unified pool) |

NPM: `@anthropic-ai/sdk ^0.39.0`. OpenAI called via raw fetch in `lib/embeddings.ts` (no npm package).

## Video Generation Providers

| Provider | Status | Strengths | Notes |
|---|---|---|---|
| Kling 2.0 | Active | v2-master, interiors, dolly/parallax/reveal | 5-concurrent trial cap with guard, auto-fallback to Runway when full |
| Runway Gen-4 Turbo | Active | Exteriors, push_in/pull_out/drone | URL-based image input (bypass 5MB base64 cap) |
| Luma Ray2 | Coded, not wired | | `lib/providers/luma.ts` exists |
| Higgsfield | Scaffolded, deferred permanently | | See `docs/HIGGSFIELD-INTEGRATION.md` |
| Shotstack | Active when `SHOTSTACK_API_KEY` set | Video assembly — JSON timeline API, clip stitching + text overlays | Stage + prod keys in `.env` |

Router logic: movement-first, room-type tiebreaker. See `lib/providers/router.ts`.

## Frontend

| Tech | Version | Role |
|---|---|---|
| Vite | ^5.4 | Build tool (SWC plugin) |
| React | ^18.3 | UI framework |
| TypeScript | ^5.8 | Type system |
| Tailwind CSS | ^3.4 | Utility-first styling |
| shadcn/ui | (Radix primitives) | Component library |
| React Router DOM | ^6.30 | Client-side routing |
| Lucide React | ^1.8 | Icons |
| Recharts | ^3.8 | Dashboard charts |
| Framer Motion | ^12.38 | Animations |
| TanStack React Query | ^5.83 | Server state / data fetching |
| Sonner | ^1.7 | Toast notifications |
| Zod | ^3.25 | Schema validation |
| react-hook-form | ^7.61 | Form handling |

## Backend

| Tech | Version | Role |
|---|---|---|
| Node.js | >=20 (ESM) | Runtime |
| Vercel Serverless Functions | `@vercel/node ^5.0` | API routes + cron |
| Supabase JS | `@supabase/supabase-js ^2.49` | DB client (service_role for server, anon for client) |
| sharp | ^0.33 | Image processing |

## Database

- **PostgreSQL** via Supabase
- **pgvector** extension — HNSW indexes, cosine distance (`<=>` operator)
- **17 migrations** in `supabase/migrations/` (001–017)

### Key RPC functions

| Function | Purpose |
|---|---|
| `match_rated_examples` | Unified retrieval: pools Lab iterations + prod scene_ratings (rating >= threshold), rating-weighted cosine distance |
| `match_loser_examples` | Negative signal: pools low-rated (<=2) Lab + prod examples |
| `match_lab_recipes` | Recipe matching by embedding + room_type |
| `recipe_exists_near` | Dedup check: any active recipe within cosine distance threshold |

Legacy: `match_lab_iterations` (unused since unified embeddings shipped).

## Email (planned)

- **Resend** — not yet implemented. Intended for agent notifications on video completion.

## Environment Variables

### Required — API keys

| Variable | Provider |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `OPENAI_API_KEY` | OpenAI (embeddings) |
| `RUNWAY_API_KEY` | Runway Gen-4 |
| `KLING_ACCESS_KEY` | Kling (JWT auth) |
| `KLING_SECRET_KEY` | Kling (JWT auth) |

### Optional — additional providers

| Variable | Provider |
|---|---|
| `LUMA_API_KEY` | Luma Ray2 (coded, not wired) |
| `SHOTSTACK_API_KEY` | Shotstack production |
| `SHOTSTACK_API_KEY_STAGE` | Shotstack staging (fallback to `SHOTSTACK_API_KEY`) |
| `HIGGSFIELD_API_KEY` | Higgsfield (deferred) |
| `HIGGSFIELD_API_SECRET` | Higgsfield (deferred) |

### Required — Supabase

| Variable | Scope |
|---|---|
| `SUPABASE_URL` | Server-side DB client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB client (admin) |
| `VITE_SUPABASE_URL` | Client-side (Vite env) |
| `VITE_SUPABASE_ANON_KEY` | Client-side (Vite env) |

### Tuning / cost

| Variable | Default | Purpose |
|---|---|---|
| `KLING_CONCURRENCY_LIMIT` | `4` | Max concurrent Kling jobs (Lab + prod) |
| `KLING_CENTS_PER_UNIT` | `0` | Cost estimate per Kling unit |
| `RUNWAY_CENTS_PER_CREDIT` | `1` | Cost estimate per Runway credit |
| `SHOTSTACK_CENTS_PER_RENDER` | `10` | Flat cost estimate per Shotstack render |
| `SHOTSTACK_ENV` | `stage` | `stage` or `production` |
| `GENERATION_CONCURRENCY` | `4` | Max parallel generation submits in pipeline |
| `QC_AUTO_APPROVE_ALL` | `false` | Skip QC approval (dead code path, but env checked) |
| `HIGGSFIELD_CENTS_PER_CREDIT` | `1` | Cost estimate (deferred provider) |

## Key Directories

```
api/                    Vercel serverless functions
  admin/prompt-lab/     Lab endpoints (analyze, refine, render, rate, promote, etc.)
  cron/                 poll-scenes.ts (prod), poll-lab-renders.ts (Lab)
  pipeline/             Production pipeline entrypoint
  scenes/[id]/          Scene actions (resubmit, rate, approve, skip, retry)
lib/                    Shared server-side code
  providers/            Kling, Runway, Luma, Higgsfield, Shotstack, router, errors
  prompts/              System prompts (director, photo-analysis, style-guide, resolve)
  pipeline.ts           Production orchestrator
  prompt-lab.ts         Lab core helpers
  embeddings.ts         OpenAI embedding wrapper
  db.ts                 DB helpers (recordCostEvent, embedScene, etc.)
src/                    Frontend (Vite + React)
  pages/dashboard/      Dashboard pages (PromptLab, Recipes, Proposals, etc.)
  components/           Shared UI components
supabase/migrations/    SQL migrations (001–017)
scripts/                One-shot scripts (backfills, tests)
docs/                   Project documentation
```
