import type {
  IVideoProvider,
  GenerateClipParams,
  GenerationJob,
  GenerationResult,
} from "./provider.interface.js";

// Atlas Cloud model descriptors. Add new entries here to make them
// selectable via ATLAS_VIDEO_MODEL without touching call sites.
export interface AtlasModelDescriptor {
  slug: string;                                   // `model` value Atlas expects
  endFrameField: "end_image" | "last_image" | null;
  allowedDurations: readonly number[] | "continuous";  // either a fixed set or a 2..15 range
  durationRange?: { min: number; max: number };   // only when allowedDurations === "continuous"
  priceCentsPerClip: number;                      // for cost tracking
}

export const ATLAS_MODELS: Record<string, AtlasModelDescriptor> = {
  "kling-v3-pro": {
    slug: "kwaivgi/kling-v3.0-pro/image-to-video",
    endFrameField: "end_image",
    allowedDurations: [5, 10],
    priceCentsPerClip: 10, // $0.095 rounded up to integer cents
  },
  "wan-2.7": {
    slug: "alibaba/wan-2.7/image-to-video",
    endFrameField: "last_image",
    allowedDurations: "continuous",
    durationRange: { min: 2, max: 15 },
    priceCentsPerClip: 10, // $0.10 per clip
  },
};

const ENDPOINT = "https://api.atlascloud.ai/api/v1/model/generateVideo";
const PREDICTION_BASE = "https://api.atlascloud.ai/api/v1/model/prediction";

export interface AtlasSubmitBody {
  model: string;
  image: string;
  prompt: string;
  duration: number;
  aspect_ratio?: string;
  cfg_scale?: number;
  end_image?: string;
  last_image?: string;
}

// Pure builder — easy to test. Callers pass the descriptor that matches
// the env's ATLAS_VIDEO_MODEL so we only have one switch statement in
// the whole integration.
export function buildAtlasRequestBody(
  params: GenerateClipParams,
  model: AtlasModelDescriptor,
): AtlasSubmitBody {
  if (!params.sourceImageUrl) {
    throw new Error("Atlas requires sourceImageUrl (Atlas fetches the image remotely; base64 is not supported here).");
  }
  const duration = clampDuration(params.durationSeconds, model);
  const body: AtlasSubmitBody = {
    model: model.slug,
    image: params.sourceImageUrl,
    prompt: params.prompt,
    duration,
    aspect_ratio: params.aspectRatio,
  };
  if (params.endImageUrl && model.endFrameField) {
    body[model.endFrameField] = params.endImageUrl;
  }
  return body;
}

function clampDuration(requested: number, model: AtlasModelDescriptor): number {
  if (model.allowedDurations === "continuous") {
    const { min, max } = model.durationRange!;
    return Math.max(min, Math.min(max, Math.round(requested)));
  }
  // Fixed allowed set — snap to the closest allowed value.
  const allowed = model.allowedDurations as readonly number[];
  let best = allowed[0];
  let bestDist = Math.abs(requested - best);
  for (const d of allowed) {
    const dist = Math.abs(requested - d);
    if (dist < bestDist) { best = d; bestDist = dist; }
  }
  return best;
}

export interface AtlasSubmitResponse {
  code: number;
  message?: string;
  msg?: string;
  data?: {
    id?: string;
    model?: string;
    urls?: { get?: string };
    status?: string;
  } | null;
}

export function parseAtlasSubmitResponse(resp: AtlasSubmitResponse): string {
  if (resp.code !== 200) {
    const msg = resp.message || resp.msg || "unknown error";
    throw new Error(`Atlas submit failed: code=${resp.code} msg=${msg}`);
  }
  const id = resp.data?.id;
  if (!id) throw new Error("Atlas submit response missing data.id");
  return id;
}

export class AtlasProvider implements IVideoProvider {
  name = "atlas" as const;
  private apiKey: string;
  private model: AtlasModelDescriptor;

  constructor() {
    const key = process.env.ATLASCLOUD_API_KEY;
    if (!key) throw new Error("ATLASCLOUD_API_KEY is required for AtlasProvider");
    this.apiKey = key;
    const modelName = process.env.ATLAS_VIDEO_MODEL ?? "kling-v3-pro";
    const descriptor = ATLAS_MODELS[modelName];
    if (!descriptor) {
      throw new Error(`ATLAS_VIDEO_MODEL=${modelName} is not registered. Valid: ${Object.keys(ATLAS_MODELS).join(", ")}`);
    }
    this.model = descriptor;
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async generateClip(params: GenerateClipParams): Promise<GenerationJob> {
    const body = buildAtlasRequestBody(params, this.model);
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    const parsed = (await res.json()) as AtlasSubmitResponse;
    if (!res.ok) {
      throw new Error(`Atlas API error: HTTP ${res.status} ${res.statusText} — ${JSON.stringify(parsed).slice(0, 200)}`);
    }
    const jobId = parseAtlasSubmitResponse(parsed);
    return { jobId, estimatedSeconds: 90 };
  }

  async checkStatus(jobId: string): Promise<GenerationResult> {
    const res = await fetch(`${PREDICTION_BASE}/${jobId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Atlas status check failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
    }
    const parsed = (await res.json()) as {
      code: number;
      data?: {
        status?: string;
        outputs?: Array<{ url?: string }> | { url?: string } | null;
      } | null;
    };
    const status = parsed.data?.status ?? "unknown";
    if (status === "processing" || status === "pending" || status === "queued") {
      return { status: "processing" };
    }
    if (status === "failed" || status === "error") {
      return { status: "failed", error: `Atlas job ${jobId} reported status=${status}` };
    }
    // Success variants Atlas might use
    if (status === "succeeded" || status === "completed" || status === "success") {
      const outputs = parsed.data?.outputs;
      const url = Array.isArray(outputs) ? outputs[0]?.url : (outputs as { url?: string } | null | undefined)?.url;
      if (!url) return { status: "failed", error: `Atlas job ${jobId} finished without an output URL` };
      return {
        status: "complete",
        videoUrl: url,
        costCents: this.model.priceCentsPerClip,
      };
    }
    return { status: "processing" };
  }

  async downloadClip(videoUrl: string): Promise<Buffer> {
    const res = await fetch(videoUrl);
    if (!res.ok) {
      throw new Error(`Atlas downloadClip failed: HTTP ${res.status} ${res.statusText}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
