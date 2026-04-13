import type {
  IVideoProvider,
  GenerateClipParams,
  GenerationJob,
  GenerationResult,
} from "./provider.interface.js";

/**
 * HiggsfieldProvider — Higgsfield "DoP" (Director of Photography / Cinema
 * Studio) video generation API at https://platform.higgsfield.ai.
 *
 * Supports two modes:
 *   - Single-image (default): POST /higgsfield-ai/dop/standard with image_url
 *   - First-last-frame keyframe: POST /higgsfield-ai/dop/standard/first-last-frame
 *     when GenerateClipParams.endImage is provided
 *
 * Auth uses the documented header form `Key {api_key}:{api_key_secret}` — a pair
 * of credentials, not a single bearer token.
 */
export class HiggsfieldProvider implements IVideoProvider {
  name = "higgsfield" as const;
  private apiKey: string;
  private apiSecret: string;
  private baseUrl = "https://platform.higgsfield.ai";
  private modelPath = "/higgsfield-ai/dop/standard";
  private firstLastFramePath = "/higgsfield-ai/dop/standard/first-last-frame";

  constructor() {
    const key = process.env.HIGGSFIELD_API_KEY;
    const secret = process.env.HIGGSFIELD_API_SECRET;
    if (!key) throw new Error("HIGGSFIELD_API_KEY is required");
    if (!secret) throw new Error("HIGGSFIELD_API_SECRET is required");
    this.apiKey = key;
    this.apiSecret = secret;
  }

  private authHeader(): string {
    return `Key ${this.apiKey}:${this.apiSecret}`;
  }

  private toDataUrl(buffer: Buffer): string {
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  }

  async generateClip(params: GenerateClipParams): Promise<GenerationJob> {
    // Higgsfield public docs only show a single `image_url` field. We send a
    // data URL here — if Higgsfield rejects data URLs in practice, swap this
    // for an upload to Supabase Storage and pass the resulting public URL.
    const startImage = this.toDataUrl(params.sourceImage);
    const duration = params.durationSeconds <= 5 ? 5 : 10;

    // Choose endpoint + body based on whether caller supplied an end frame.
    const useKeyframeMode = params.endImage !== undefined;
    const endpoint = useKeyframeMode
      ? `${this.baseUrl}${this.firstLastFramePath}`
      : `${this.baseUrl}${this.modelPath}`;
    const body: Record<string, unknown> = useKeyframeMode
      ? {
          image_url: startImage,
          end_image: this.toDataUrl(params.endImage as Buffer),
          prompt: params.prompt,
          duration,
        }
      : {
          image_url: startImage,
          prompt: params.prompt,
          duration,
        };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Higgsfield API error: ${response.status} ${err}`);
    }

    const data = (await response.json()) as {
      request_id?: string;
      id?: string;
    };

    const jobId = data.request_id ?? data.id;
    if (!jobId) {
      throw new Error(
        `Higgsfield response missing request_id: ${JSON.stringify(data)}`
      );
    }

    // Rough estimate — Higgsfield does not publish SLAs. Revisit after
    // observing real-world latency from the test harness.
    return { jobId, estimatedSeconds: 120 };
  }

  async checkStatus(jobId: string): Promise<GenerationResult> {
    const response = await fetch(
      `${this.baseUrl}/requests/${jobId}/status`,
      {
        headers: {
          Authorization: this.authHeader(),
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Higgsfield status check failed: ${response.status}`);
    }

    // Field names below are best-guess based on public docs that describe the
    // lifecycle `queued → in_progress → completed | failed | nsfw`. The test
    // harness (probe 2) will confirm the exact schema; tweak here if needed.
    const data = (await response.json()) as {
      status?: string;
      state?: string;
      result?: {
        video_url?: string;
        url?: string;
      };
      video_url?: string;
      output?: { video_url?: string; url?: string };
      error?: string;
      failure_reason?: string;
      credits?: number;
      credits_used?: number;
      cost?: number;
    };

    const rawStatus = (data.status ?? data.state ?? "").toLowerCase();

    if (rawStatus === "completed" || rawStatus === "complete") {
      const videoUrl =
        data.result?.video_url ??
        data.result?.url ??
        data.video_url ??
        data.output?.video_url ??
        data.output?.url;

      const credits = data.credits_used ?? data.credits ?? data.cost;
      const centsPerCredit = parseFloat(
        process.env.HIGGSFIELD_CENTS_PER_CREDIT ?? "1"
      );

      return {
        status: "complete",
        videoUrl,
        providerUnits: credits,
        providerUnitType: credits !== undefined ? "credits" : undefined,
        costCents:
          credits !== undefined
            ? Math.round(credits * centsPerCredit)
            : undefined,
      };
    }

    if (rawStatus === "failed" || rawStatus === "nsfw") {
      return {
        status: "failed",
        error:
          data.error ??
          data.failure_reason ??
          (rawStatus === "nsfw" ? "Content flagged as NSFW" : "Unknown error"),
      };
    }

    // queued, in_progress, or anything unexpected → keep polling
    return { status: "processing" };
  }

  async downloadClip(videoUrl: string): Promise<Buffer> {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}
