import type {
  IVideoProvider,
  GenerateClipParams,
  GenerationJob,
  GenerationResult,
} from "./provider.interface";

export class LumaProvider implements IVideoProvider {
  name = "luma" as const;
  private apiKey: string;
  private baseUrl = "https://api.lumalabs.ai/dream-machine/v1";

  constructor() {
    const key = process.env.LUMA_API_KEY;
    if (!key) throw new Error("LUMA_API_KEY is required");
    this.apiKey = key;
  }

  async generateClip(params: GenerateClipParams): Promise<GenerationJob> {
    const imageBase64 = params.sourceImage.toString("base64");
    const dataUrl = `data:image/jpeg;base64,${imageBase64}`;

    const response = await fetch(`${this.baseUrl}/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: params.prompt,
        keyframes: {
          frame0: { type: "image", url: dataUrl },
        },
        model: "ray2",
        duration: `${Math.round(params.durationSeconds)}s`,
        aspect_ratio: params.aspectRatio,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Luma API error: ${response.status} ${err}`);
    }

    const data = (await response.json()) as { id: string };
    return { jobId: data.id, estimatedSeconds: 120 };
  }

  async checkStatus(jobId: string): Promise<GenerationResult> {
    const response = await fetch(`${this.baseUrl}/generations/${jobId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Luma status check failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      state: string;
      assets?: { video?: string };
      failure_reason?: string;
    };

    if (data.state === "completed" && data.assets?.video) {
      return { status: "complete", videoUrl: data.assets.video };
    }
    if (data.state === "failed") {
      return {
        status: "failed",
        error: data.failure_reason ?? "Unknown error",
      };
    }
    return { status: "processing" };
  }

  async downloadClip(videoUrl: string): Promise<Buffer> {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}
