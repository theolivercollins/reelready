> **ARCHIVED — SUPERSEDED.** Moved 2026-04-21. See [../README.md](../README.md) for why and for the canonical replacement.
>
> Last updated: (original content preserved unchanged below)
>
> See also:
> - [../README.md](../README.md)
> - [../../HANDOFF.md](../../HANDOFF.md)
> - [../../state/PROJECT-STATE.md](../../state/PROJECT-STATE.md)

# API Reference

**Base URL:** `https://reelready-eight.vercel.app`

All endpoints return JSON. Error responses have the shape `{ "error": "message" }`.

---

## Properties

### GET /api/properties

List properties with pagination and filtering.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| page | integer | 1 | Page number |
| limit | integer | 25 | Results per page |
| status | string | -- | Filter by status (queued, analyzing, scripting, generating, qc, assembling, complete, failed, needs_review) |
| search | string | -- | Search by address (case-insensitive partial match) |

**Response:**

```json
{
  "properties": [
    {
      "id": "uuid",
      "created_at": "2026-04-10T12:00:00Z",
      "updated_at": "2026-04-10T12:05:00Z",
      "address": "123 Palm Avenue, Miami FL 33139",
      "price": 1250000,
      "bedrooms": 4,
      "bathrooms": 3,
      "listing_agent": "Jane Smith",
      "brokerage": "Compass",
      "status": "complete",
      "photo_count": 35,
      "selected_photo_count": 11,
      "total_cost_cents": 380,
      "processing_time_ms": 142000,
      "horizontal_video_url": null,
      "vertical_video_url": null,
      "thumbnail_url": "https://vrhmaeywqsohlztoouxu.supabase.co/storage/v1/object/public/property-videos/...",
      "submitted_by": null
    }
  ],
  "total": 42,
  "page": 1,
  "totalPages": 2
}
```

**Example:**

```bash
curl "https://reelready-eight.vercel.app/api/properties?page=1&limit=10&status=complete"
```

---

### POST /api/properties

Create a new property and register uploaded photos.

Photos must be uploaded to Supabase Storage *before* calling this endpoint. The frontend uploads photos directly to the `property-photos` bucket using the Supabase JS client, then passes the storage paths here.

**Request Body:**

```json
{
  "address": "123 Palm Avenue, Miami FL 33139",
  "price": 1250000,
  "bedrooms": 4,
  "bathrooms": 3,
  "listing_agent": "Jane Smith",
  "brokerage": "Compass",
  "tempId": "uuid-generated-by-client",
  "photoPaths": [
    "uuid/raw/1234567890_0_photo1.jpg",
    "uuid/raw/1234567890_1_photo2.jpg"
  ]
}
```

Or for Google Drive intake (not yet fully implemented):

```json
{
  "address": "123 Palm Avenue, Miami FL 33139",
  "price": 1250000,
  "bedrooms": 4,
  "bathrooms": 3,
  "listing_agent": "Jane Smith",
  "brokerage": "Compass",
  "driveLink": "https://drive.google.com/drive/folders/abc123"
}
```

**Required fields:** address, price, bedrooms, bathrooms, listing_agent

**Response (201):**

```json
{
  "id": "uuid",
  "status": "queued",
  "photoCount": 35,
  "message": "Video generation started"
}
```

When using `driveLink`, `photoCount` is `-1` (indicating pending from Drive).

**Example:**

```bash
curl -X POST "https://reelready-eight.vercel.app/api/properties" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "123 Palm Avenue, Miami FL 33139",
    "price": 1250000,
    "bedrooms": 4,
    "bathrooms": 3,
    "listing_agent": "Jane Smith",
    "brokerage": "Compass",
    "tempId": "550e8400-e29b-41d4-a716-446655440000",
    "photoPaths": ["550e8400-e29b-41d4-a716-446655440000/raw/photo1.jpg"]
  }'
```

---

### GET /api/properties/:id

Get property detail with all associated photos and scenes.

**Response:**

```json
{
  "id": "uuid",
  "created_at": "2026-04-10T12:00:00Z",
  "address": "123 Palm Avenue, Miami FL 33139",
  "price": 1250000,
  "bedrooms": 4,
  "bathrooms": 3,
  "listing_agent": "Jane Smith",
  "brokerage": "Compass",
  "status": "complete",
  "photo_count": 35,
  "selected_photo_count": 11,
  "total_cost_cents": 380,
  "processing_time_ms": 142000,
  "horizontal_video_url": null,
  "vertical_video_url": null,
  "thumbnail_url": "...",
  "submitted_by": null,
  "photos": [
    {
      "id": "uuid",
      "property_id": "uuid",
      "file_url": "https://...",
      "file_name": "kitchen_1.jpg",
      "room_type": "kitchen",
      "quality_score": 7.5,
      "aesthetic_score": 8.0,
      "depth_rating": "high",
      "selected": true,
      "discard_reason": null,
      "key_features": ["granite island", "pendant lighting"]
    }
  ],
  "scenes": [
    {
      "id": "uuid",
      "property_id": "uuid",
      "photo_id": "uuid",
      "scene_number": 1,
      "camera_movement": "orbital_slow",
      "prompt": "Cinematic slow orbital shot...",
      "duration_seconds": 4,
      "status": "qc_pass",
      "provider": "runway",
      "generation_cost_cents": 80,
      "generation_time_ms": 95000,
      "clip_url": "https://...",
      "attempt_count": 1,
      "qc_verdict": "auto_pass",
      "qc_issues": null,
      "qc_confidence": 1.0
    }
  ]
}
```

**Example:**

```bash
curl "https://reelready-eight.vercel.app/api/properties/550e8400-e29b-41d4-a716-446655440000"
```

---

### GET /api/properties/:id/status

Public status endpoint for the tracking page. Returns a simplified view of the property's pipeline progress.

**Response:**

```json
{
  "id": "uuid",
  "address": "123 Palm Avenue, Miami FL 33139",
  "status": "generating",
  "currentStage": 3,
  "totalStages": 7,
  "clipsCompleted": 5,
  "clipsTotal": 11,
  "horizontalVideoUrl": null,
  "verticalVideoUrl": null,
  "createdAt": "2026-04-10T12:00:00Z",
  "processingTimeMs": null
}
```

The `currentStage` is a 0-based index into the stage list: `[queued, analyzing, scripting, generating, qc, assembling, complete]`.

**Example:**

```bash
curl "https://reelready-eight.vercel.app/api/properties/550e8400-e29b-41d4-a716-446655440000/status"
```

---

### POST /api/properties/:id/rerun

Re-trigger the pipeline for a property from the beginning. Resets status to `queued` and starts the pipeline.

**Response:**

```json
{
  "message": "Pipeline restarted",
  "status": "queued"
}
```

**Example:**

```bash
curl -X POST "https://reelready-eight.vercel.app/api/properties/550e8400-e29b-41d4-a716-446655440000/rerun"
```

---

## Pipeline

### POST /api/pipeline/:propertyId

Trigger full pipeline execution. This is a long-running function (up to 300 seconds). It runs all 6 pipeline stages synchronously.

Called by the frontend as fire-and-forget after creating a property. Returns when the pipeline completes or fails.

**Response (success):**

```json
{
  "status": "complete",
  "propertyId": "uuid"
}
```

**Response (failure):**

```json
{
  "status": "failed",
  "propertyId": "uuid",
  "error": "Pipeline failed: Only 0 photos. Need at least 5."
}
```

**Example:**

```bash
curl -X POST "https://reelready-eight.vercel.app/api/pipeline/550e8400-e29b-41d4-a716-446655440000"
```

---

## Scenes

### GET /api/scenes/:id

Get scene detail including the associated photo data and all pipeline logs for this scene.

**Response:**

```json
{
  "id": "uuid",
  "property_id": "uuid",
  "photo_id": "uuid",
  "scene_number": 3,
  "camera_movement": "dolly_left_to_right",
  "prompt": "Cinematic dolly shot...",
  "duration_seconds": 3.5,
  "status": "qc_pass",
  "provider": "kling",
  "generation_cost_cents": 35,
  "generation_time_ms": 110000,
  "clip_url": "https://...",
  "attempt_count": 1,
  "qc_verdict": "auto_pass",
  "qc_issues": null,
  "qc_confidence": 1.0,
  "photos": {
    "id": "uuid",
    "file_url": "https://...",
    "file_name": "kitchen_1.jpg",
    "room_type": "kitchen"
  },
  "logs": [
    {
      "id": "uuid",
      "property_id": "uuid",
      "scene_id": "uuid",
      "created_at": "2026-04-10T12:02:30Z",
      "stage": "generation",
      "level": "info",
      "message": "Scene 3: submitted to kling",
      "metadata": null
    }
  ]
}
```

**Example:**

```bash
curl "https://reelready-eight.vercel.app/api/scenes/550e8400-e29b-41d4-a716-446655440000"
```

---

### POST /api/scenes/:id/approve

HITL action: manually approve a scene that failed QC or is in `needs_review` status. Sets the scene status to `qc_pass`.

**Response:**

```json
{
  "message": "Scene approved"
}
```

**Example:**

```bash
curl -X POST "https://reelready-eight.vercel.app/api/scenes/550e8400-e29b-41d4-a716-446655440000/approve"
```

---

### POST /api/scenes/:id/retry

HITL action: retry a scene with a new generation prompt. Resets the scene status to `pending` and updates the prompt.

Note: This endpoint currently only updates the prompt and status in the database. It does not yet trigger actual regeneration (TODO).

**Request Body:**

```json
{
  "prompt": "Cinematic slow dolly shot through modern kitchen with granite island, warm natural lighting, maintain rigid architectural lines, smooth steady camera movement, photorealistic"
}
```

**Response:**

```json
{
  "message": "Scene queued for retry"
}
```

**Example:**

```bash
curl -X POST "https://reelready-eight.vercel.app/api/scenes/550e8400-e29b-41d4-a716-446655440000/retry" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Cinematic slow dolly shot..."}'
```

---

### POST /api/scenes/:id/skip

HITL action: skip a scene, removing it from the final video. Sets status to `qc_pass` with `clip_url` set to null.

**Response:**

```json
{
  "message": "Scene skipped"
}
```

**Example:**

```bash
curl -X POST "https://reelready-eight.vercel.app/api/scenes/550e8400-e29b-41d4-a716-446655440000/skip"
```

---

## Logs

### GET /api/logs

Query pipeline logs with pagination and filtering.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| page | integer | 1 | Page number |
| limit | integer | 50 | Results per page |
| stage | string | -- | Filter by stage (intake, analysis, scripting, generation, qc, assembly, delivery) |
| level | string | -- | Filter by level (info, warn, error, debug) |
| property_id | string | -- | Filter by property UUID |

**Response:**

```json
{
  "logs": [
    {
      "id": "uuid",
      "property_id": "uuid",
      "scene_id": null,
      "created_at": "2026-04-10T12:00:01Z",
      "stage": "intake",
      "level": "info",
      "message": "Pipeline started",
      "metadata": null,
      "properties": {
        "address": "123 Palm Avenue, Miami FL 33139"
      }
    }
  ],
  "total": 156,
  "page": 1,
  "totalPages": 4
}
```

Logs are joined with the `properties` table to include the address for display.

**Example:**

```bash
curl "https://reelready-eight.vercel.app/api/logs?stage=generation&level=error&limit=20"
```

---

## Stats

### GET /api/stats/overview

Dashboard overview metrics for today and the past 7 days.

**Response:**

```json
{
  "completedToday": 12,
  "submittedToday": 15,
  "inPipeline": 3,
  "needsReview": 1,
  "avgProcessingMs": 142000,
  "totalCostTodayCents": 4560,
  "avgCostPerVideoCents": 380,
  "successRate": 92.3
}
```

| Field | Description |
|---|---|
| completedToday | Properties with status `complete` updated today |
| submittedToday | Properties created today |
| inPipeline | Properties currently in any active status |
| needsReview | Properties in `needs_review` status |
| avgProcessingMs | Average processing time for today's completions |
| totalCostTodayCents | Sum of total_cost_cents for today's completions |
| avgCostPerVideoCents | Average cost per video today |
| successRate | Percentage of non-failed properties over the past 7 days |

**Example:**

```bash
curl "https://reelready-eight.vercel.app/api/stats/overview"
```

---

### GET /api/stats/daily

Historical daily aggregated stats from the `daily_stats` table.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| days | integer | 30 | Number of days of history to return |

**Response:**

```json
{
  "stats": [
    {
      "id": "uuid",
      "date": "2026-04-09",
      "properties_completed": 18,
      "properties_failed": 2,
      "total_clips_generated": 198,
      "total_retries": 12,
      "total_cost_cents": 6840,
      "avg_processing_time_ms": 138000,
      "avg_cost_per_video_cents": 380
    }
  ]
}
```

Note: The `daily_stats` table must be populated by a cron job (not yet implemented). This endpoint will return an empty array until the aggregation job is set up.

**Example:**

```bash
curl "https://reelready-eight.vercel.app/api/stats/daily?days=7"
```
