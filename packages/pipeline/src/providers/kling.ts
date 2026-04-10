import type {
  IVideoProvider,
  GenerateClipParams,
  GenerationJob,
  GenerationResult,
} from "./provider.interface.js";

export class KlingProvider implements IVideoProvider {
  name = "kling" as const;
  private apiKey: string;
  private baseUrl = "https://api.klingai.com/v1";

  constructor() {
    const key = process.env.KLING_API_KEY;
    if (!key) throw new Error("KLING_API_KEY is required");
    this.apiKey = key;
  }

  async generateClip(params: GenerateClipParams): Promise<GenerationJob> {
    const imageBase64 = params.sourceImage.toString("base64");

    const response = await fetch(
      `${this.baseUrl}/videos/image2video`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_name: "kling-v2",
          image: imageBase64,
          prompt: params.prompt,
          duration: String(Math.round(params.durationSeconds)),
          aspect_ratio: params.aspectRatio,
          mode: "pro",
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Kling API error: ${response.status} ${err}`);
    }

    const data = (await response.json()) as {
      data: { task_id: string };
    };
    return { jobId: data.data.task_id, estimatedSeconds: 120 };
  }

  async checkStatus(jobId: string): Promise<GenerationResult> {
    const response = await fetch(
      `${this.baseUrl}/videos/image2video/${jobId}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Kling status check failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      data: {
        task_status: string;
        task_result?: { videos?: Array<{ url: string }> };
        task_status_msg?: string;
      };
    };

    const task = data.data;
    if (task.task_status === "succeed" && task.task_result?.videos?.[0]) {
      return { status: "complete", videoUrl: task.task_result.videos[0].url };
    }
    if (task.task_status === "failed") {
      return {
        status: "failed",
        error: task.task_status_msg ?? "Unknown error",
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
