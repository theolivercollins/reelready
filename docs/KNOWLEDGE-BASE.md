# Knowledge Base

Deep knowledge about the ReelReady project -- context that would be lost without documentation.

## What This Project Is

ReelReady is a real estate video automation service targeting brokerages at scale. Agents upload listing photos (typically 30-50 per property), and the system automatically produces a 30-second cinematic walkthrough video in both 16:9 (horizontal) and 9:16 (vertical/Reels) formats.

The service is designed to replace the manual video editing workflow where brokerages hire videographers or editors to produce listing videos. ReelReady makes this instant, consistent, and cheap enough to do for every listing, not just luxury ones.

## Scale Targets

- **Launch target:** 20 properties/day
- **Growth target:** 100+ properties/day
- Each property has 30-50 raw photos
- 10-12 photos get selected for the final video
- Output: ~30-second video (28-35s)
- Two aspect ratios: 16:9 (YouTube/MLS) and 9:16 (Instagram Reels/TikTok)

## Three Pillars

The project optimizes for three things simultaneously:

1. **Efficiency (speed):** End-to-end processing should take 2-5 minutes per property. The bottleneck is video generation (60-120s for parallel clip generation). LLM stages take 10-20 seconds combined.

2. **Output quality:** Videos must look professional enough that agents are comfortable sharing them on MLS and social media. This means no visible AI artifacts, smooth camera movement, and correct architectural rendering.

3. **Cost:** Target $3-5 per video in API costs at scale. The bulk of cost is video generation ($2-4.50 for 10-12 clips). LLM costs are minimal (~$0.10-0.15 per property for analysis + scripting + QC).

## HITL (Human-in-the-Loop) Budget

Target: less than 5% of clips need human review.

At 20 properties/day with ~11 clips each, that is 220 clips/day. 5% = ~11 clips needing human attention, roughly 15-20 minutes of operator time per day.

When a clip fails QC and exhausts its retry budget (default 2 retries), it gets flagged as `needs_review`. The dashboard shows these clips with the source photo, the last generated clip, the QC rejection reasons, and the prompt. The operator can approve, retry with a modified prompt, or skip the clip.

## Photo Selection Algorithm

The selection algorithm in `lib/pipeline.ts` (`selectPhotos` function) works as follows:

1. **Discard** any photos the LLM flagged as `suggested_discard` (blurry, dark, fisheye distortion, clutter, duplicates).
2. **Required rooms first:** Ensure at least one photo from each required room type:
   - exterior_front, kitchen, living_room, master_bedroom, bathroom
3. **Optional but preferred:** exterior_back, aerial (added if available).
4. **Fill remaining slots** (up to 12 total) by highest aesthetic_score, with a cap of 2 photos per room type.
5. Within each room type group, photos are sorted by aesthetic_score descending -- the best-looking photo is always picked first.

The depth_rating is used downstream by the director prompt to choose camera movements. High-depth photos get more complex movements (parallax, dolly); low-depth photos get simple movements (slow_pan) to avoid AI warping artifacts.

## Camera Movement Mapping

The director prompt (`lib/prompts/director.ts`) encodes these camera movement rules per room type:

| Room Type | Primary Movement | Notes |
|---|---|---|
| exterior_front / exterior_back | orbital_slow | Slow rotation around subject |
| aerial | orbital_slow or slow_pan | Wide establishing |
| kitchen | dolly_left_to_right | Follows counter/island line |
| living_room | dolly_right_to_left or slow_pan | Emphasize depth and openness |
| master_bedroom | dolly_right_to_left | Bed as anchor point |
| bedroom | slow_pan | Simple, clean |
| bathroom | slow_pan | Compact spaces need gentle movement |
| dining | dolly_left_to_right | Table as anchor |
| pool | parallax | Foreground foliage, background water |
| hallway / foyer | push_in | Create depth, draw viewer forward |
| garage | slow_pan | Simple |

**Depth-based overrides:**
- `depth_rating: "high"` -> prefer parallax if room type allows
- `depth_rating: "low"` -> ONLY use slow_pan (less 3D = more warping with complex movements)

## QC System

**Current state:** The QC system auto-passes all clips. The `runQCForScene` function in `lib/pipeline.ts` immediately marks every clip as `qc_pass` with confidence 1.0 and verdict `auto_pass`.

**Designed behavior (not yet implemented):**
1. Extract 5 evenly-spaced frames from the generated clip using FFmpeg
2. Send frames to Claude Sonnet vision with the QC evaluator prompt
3. Evaluate: architectural integrity (most important), motion quality, lighting consistency, visual artifacts
4. Verdict: pass (ship it), soft_reject (retry with modified prompt), hard_reject (retry with different provider)

**Why it is not implemented:** Vercel Functions do not have FFmpeg binaries. Frame extraction requires either an external service, Vercel Sandbox (Firecracker microVM), or a dedicated worker. This is a Phase 2 task.

## Assembly System

**Current state:** The assembly stage stores individual clips and marks the property as complete. The first clip's URL is used as the thumbnail. No actual stitching occurs.

**Designed behavior (implemented in `lib/utils/ffmpeg.ts` but not called):**
1. Normalize all clips to consistent format (1920x1080, 30fps, H.264)
2. Crossfade transitions between clips (0.4s fade)
3. Add audio track with fade-in/fade-out
4. Add text overlays: address at opening (0.5-2.5s), price + details + agent at closing (last 4s)
5. Create 9:16 vertical version via center crop
6. Upload final videos to Supabase Storage

**Why it is not called:** Same reason as QC -- Vercel Functions lack FFmpeg. The `assembleVideo` function exists and is complete but needs to run on an external service.

## Provider Routing

The routing logic in `lib/providers/router.ts` assigns providers by room type:

- **Runway** (Gen-4 Turbo): Best for exteriors and aerials. Handles wide shots with complex lighting well. Cost: ~$0.20/second.
- **Kling** (v2 Pro): Best for interiors. Handles architectural lines and indoor lighting well. Cost: ~$0.10/second. Uses JWT auth (HMAC-SHA256 signed with secret key).
- **Luma** (Ray2): Best for parallax/depth shots (pools, views). Uses keyframe-based generation. Cost: ~$0.12/second.

Fallback order: runway -> kling -> luma. If the preferred provider's API key is not configured, the system falls through to the next available provider.

## Cost Estimates

Per-property costs at the $3-5 target (from `lib/utils/cost-tracker.ts`):

| Operation | Cost |
|---|---|
| Photo analysis (30-50 photos, Claude vision) | ~$0.32-0.52 (1 cent/image + $0.02 base) |
| Shot scripting (1 Claude call) | ~$0.02 |
| Video generation (10-12 clips, 3-4s each) | ~$2.00-4.50 |
| QC analysis (5 frames per clip, Claude vision) | ~$0.03/clip = ~$0.33 (when implemented) |
| **Total per property** | **~$2.67-5.37** |

Generation cost dominates. The mix of providers (Kling at $0.10/s for most interior shots vs Runway at $0.20/s for a few exteriors) keeps the average down.

## Infrastructure Details

### Supabase

- **Organization:** Recasi
- **Project name:** reelready
- **Region:** us-east-1
- **Project ID:** vrhmaeywqsohlztoouxu
- **Project URL:** https://vrhmaeywqsohlztoouxu.supabase.co

### Vercel

- **Team:** Recasi
- **Project name:** reelready
- **Project ID:** prj_ZJRb76Pu05FHirZsHNH17MuJcL00
- **Production URL:** https://reelready-eight.vercel.app
- **Framework:** Vite
- **Build command:** `vite build`
- **Output directory:** `dist`

### Frontend Routes

| Path | Page | Description |
|---|---|---|
| `/` | Index | Landing page |
| `/upload` | Upload | Photo upload form with progress |
| `/presets` | Presets | Video style presets browser |
| `/status/:id` | Status | Public property status tracker (agents can share this link) |
| `/dashboard` | Dashboard | Operator dashboard (sidebar layout) |
| `/dashboard/pipeline` | Pipeline | Pipeline Kanban view |
| `/dashboard/properties` | Properties | Property list with search/filter |
| `/dashboard/properties/:id` | PropertyDetail | Property detail with photos and scenes |
| `/dashboard/logs` | Logs | Pipeline log viewer |
| `/dashboard/settings` | Settings | Pipeline configuration (currently local state only) |

## Historical Context

The project was initially scaffolded using Lovable (AI code generation tool). The following cleanup has been done:

- Removed `lovable-tagger` from `vite.config.ts` and `package.json`
- Removed all mock data (`src/lib/mock-data.ts` deleted)
- All dashboard pages wired to real Supabase API endpoints
- The original ARCHITECTURE.md (at project root) described a BullMQ/Redis queue architecture. This was replaced with a simpler approach: the entire pipeline runs synchronously within a single 300-second Vercel Function invocation. No Redis or separate worker process is needed.

**Still remaining from Lovable:**
- `index.html` has Lovable meta tags (og:image pointing to lovable.dev, twitter:site @Lovable). These should be updated with ReelReady branding.
- The HTML title says "Key Frame" instead of "ReelReady".
