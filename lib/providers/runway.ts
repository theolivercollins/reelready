import type {
  IVideoProvider,
  GenerateClipParams,
  GenerationJob,
  GenerationResult,
} from "./provider.interface.js";

export class RunwayProvider implements IVideoProvider {
  name = "runway" as const;
  private apiKey: string;
  private baseUrl = "https://api.dev.runwayml.com/v1";

  constructor() {
    const key = process.env.RUNWAY_API_KEY;
    if (!key) throw new Error("RUNWAY_API_KEY is required");
    this.apiKey = key;
  }

  async generateClip(params: GenerateClipParams): Promise<GenerationJob> {
    const imageBase64 = params.sourceImage.toString("base64");
    const dataUrl = `data:image/jpeg;base64,${imageBase64}`;

    const response = await fetch(`${this.baseUrl}/image_to_video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "X-Runway-Version": "2024-11-06",
      },
      body: JSON.stringify({
        model: "gen4_turbo",
        promptImage: dataUrl,
        promptText: params.prompt,
        duration: params.durationSeconds <= 7 ? 5 : 10,
        ratio: params.aspectRatio === "16:9" ? "1280:720" : "720:1280",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Runway API error: ${response.status} ${err}`);
    }

    const data = (await response.json()) as { id: string };
    return { jobId: data.id, estimatedSeconds: 90 };
  }

  async checkStatus(jobId: string): Promise<GenerationResult> {
    const response = await fetch(`${this.baseUrl}/tasks/${jobId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Runway-Version": "2024-11-06",
      },
    });

    if (!response.ok) {
      throw new Error(`Runway status check failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      status: string;
      output?: string[];
      failure?: string;
    };

    if (data.status === "SUCCEEDED" && data.output?.[0]) {
      return { status: "complete", videoUrl: data.output[0] };
    }
    if (data.status === "FAILED") {
      return { status: "failed", error: data.failure ?? "Unknown error" };
    }
    return { status: "processing" };
  }

  async downloadClip(videoUrl: string): Promise<Buffer> {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}
