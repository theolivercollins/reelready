# ReelReady

AI-powered real estate video automation pipeline.

Agents upload property photos, and the system generates cinematic walkthrough videos using AI analysis, scripted shot planning, and multi-provider video generation. The pipeline handles everything from photo intake and scoring through to final clip assembly, with human-in-the-loop review for edge cases.

## Live URL

https://reelready-eight.vercel.app

## GitHub

https://github.com/theolivercollins/reelready

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + React 18 + Tailwind CSS + shadcn/ui |
| Routing | React Router v6 |
| State | TanStack React Query |
| Backend | Vercel Serverless Functions (Node.js, TypeScript) |
| Database | Supabase (Postgres) |
| File Storage | Supabase Storage (property-photos, property-videos buckets) |
| Photo Analysis + QC | Claude Sonnet (Anthropic API) |
| Video Generation | Runway Gen-4 Turbo, Kling 2.0, Luma Ray2 |
| Deployment | Vercel (auto-deploy on push to main) |

## Project Structure

```
reelready/
├── api/                          # Vercel Serverless Functions
│   ├── properties/
│   │   ├── index.ts              # GET (list) + POST (create)
│   │   └── [id].ts              # GET property detail
│   │   └── [id]/
│   │       ├── status.ts         # GET public status tracking
│   │       └── rerun.ts          # POST re-trigger pipeline
│   ├── pipeline/
│   │   └── [propertyId].ts       # POST run full pipeline (300s)
│   ├── scenes/
│   │   └── [id]/
│   │       ├── index.ts          # GET scene detail + logs
│   │       ├── approve.ts        # POST HITL approve
│   │       ├── retry.ts          # POST HITL retry with new prompt
│   │       └── skip.ts           # POST HITL skip scene
│   ├── stats/
│   │   ├── overview.ts           # GET dashboard metrics
│   │   └── daily.ts              # GET daily stats
│   └── logs.ts                   # GET pipeline logs
├── lib/                          # Shared backend logic
│   ├── pipeline.ts               # 6-stage pipeline orchestrator
│   ├── db.ts                     # Supabase queries (server-side, service role)
│   ├── client.ts                 # Supabase client factory
│   ├── types.ts                  # TypeScript types for all DB tables
│   ├── prompts/
│   │   ├── photo-analysis.ts     # Photo analysis system prompt
│   │   ├── director.ts           # Shot planning system prompt
│   │   └── qc-evaluator.ts       # QC evaluation system prompt
│   ├── providers/
│   │   ├── provider.interface.ts # IVideoProvider interface + polling
│   │   ├── router.ts             # Provider selection + routing logic
│   │   ├── runway.ts             # Runway Gen-4 Turbo implementation
│   │   ├── kling.ts              # Kling 2.0 implementation
│   │   └── luma.ts               # Luma Ray2 implementation
│   └── utils/
│       ├── cost-tracker.ts       # Per-operation cost estimation
│       ├── ffmpeg.ts             # FFmpeg assembly (normalize, stitch, overlay)
│       └── image-processing.ts   # Sharp image normalization + frame extraction
├── src/                          # React frontend
│   ├── App.tsx                   # Router setup
│   ├── main.tsx                  # Entry point
│   ├── pages/
│   │   ├── Index.tsx             # Landing page
│   │   ├── Upload.tsx            # Photo upload form
│   │   ├── Presets.tsx           # Video presets browser
│   │   ├── Status.tsx            # Public property status tracker
│   │   ├── Dashboard.tsx         # Dashboard layout (sidebar)
│   │   ├── dashboard/
│   │   │   ├── Overview.tsx      # Stats overview
│   │   │   ├── Pipeline.tsx      # Pipeline Kanban view
│   │   │   ├── Properties.tsx    # Property list
│   │   │   ├── PropertyDetail.tsx# Property detail + scenes
│   │   │   ├── Logs.tsx          # Pipeline log viewer
│   │   │   └── Settings.tsx      # Settings page
│   │   └── NotFound.tsx
│   ├── lib/
│   │   ├── api.ts                # API client (fetch wrappers + Supabase upload)
│   │   ├── types.ts              # Frontend type definitions
│   │   ├── presets.ts            # Video preset data
│   │   ├── theme.tsx             # Theme provider
│   │   └── utils.ts              # Utility functions (cn)
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components
│   │   └── NavLink.tsx           # Navigation link component
│   └── hooks/
│       ├── use-mobile.tsx        # Mobile detection hook
│       └── use-toast.ts          # Toast hook
├── docs/                         # Project documentation
│   ├── ARCHITECTURE.md
│   ├── KNOWLEDGE-BASE.md
│   ├── TODO.md
│   ├── API-REFERENCE.md
│   └── PIPELINE-PROMPTS.md
├── vercel.json                   # Vercel routing config
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.api.json
├── tsconfig.app.json
└── tsconfig.node.json
```

## Running Locally

### Prerequisites

- Node.js >= 20
- A Supabase project with the required schema (see docs/ARCHITECTURE.md)
- API keys for at least one video generation provider

### Setup

```bash
# Install dependencies
npm install

# Create .env file with required variables (see Environment Variables below)
cp .env.example .env

# Start the Vite dev server (frontend only)
npm run dev
```

The dev server runs at `http://localhost:8080`.

**Note:** The Vercel Serverless Functions (the `/api` routes) do not run locally with `npm run dev`. To test the full pipeline locally, use `vercel dev` which emulates the serverless environment.

```bash
# Install Vercel CLI
npm i -g vercel

# Link to the project
vercel link

# Pull environment variables
vercel env pull

# Run local dev with serverless functions
vercel dev
```

## Deploying

Push to `main` and Vercel auto-deploys. No manual steps needed.

```bash
git push origin main
```

Preview deployments are created automatically on pull requests.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side, full access) |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL (exposed to frontend) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key (exposed to frontend, RLS-restricted) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude Sonnet (photo analysis + scripting + QC) |
| `RUNWAY_API_KEY` | For Runway | Runway Gen-4 API key |
| `KLING_ACCESS_KEY` | For Kling | Kling API access key |
| `KLING_SECRET_KEY` | For Kling | Kling API secret key (used for JWT signing) |
| `LUMA_API_KEY` | For Luma | Luma Dream Machine API key |
| `MAX_RETRIES_PER_CLIP` | No | Max generation retries per clip before HITL (default: 2) |
| `QC_AUTO_APPROVE_ALL` | No | Set to `"true"` to auto-pass all QC (default: false, but currently auto-passes anyway) |

At least one video generation provider must be configured (Runway, Kling, or Luma).
