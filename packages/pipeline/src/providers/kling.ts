import * as crypto from "crypto";
import type {
  IVideoProvider,
  GenerateClipParams,
  GenerationJob,
  GenerationResult,
} from "./provider.interface.js";

export class KlingProvider implements IVideoProvider {
  name = "kling" as const;
  private accessKey: string;
  private secretKey: string;
  private baseUrl = "https://api.klingai.com/v1";

  constructor() {
    const ak = process.env.KLING_ACCESS_KEY;
    const sk = process.env.KLING_SECRET_KEY;
    if (!ak || !sk) throw new Error("KLING_ACCESS_KEY and KLING_SECRET_KEY are required");
    this.accessKey = ak;
    this.secretKey = sk;
  }

  private generateJWT(): string {
    // Kling API requires a JWT signed with HMAC-SHA256 using the secret key
    const header = {
      alg: "HS256",
      typ: "JWT",
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.accessKey,
      exp: now + 1800, // 30 min expiry
      nbf: now - 5,
    };

    const b64Header = Buffer.from(JSON.stringify(header))
      .toString("base64url");
    const b64Payload = Buffer.from(JSON.stringify(payload))
      .toString("base64url");

    const signature = crypto
      .createHmac("sha256", this.secretKey)
      .update(`${b64Header}.${b64Payload}`)
      .digest("base64url");

    return `${b64Header}.${b64Payload}.${signature}`;
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.generateJWT()}`,
      "Content-Type": "application/json",
    };
  }

  async generateClip(params: GenerateClipParams): Promise<GenerationJob> {
    const imageBase64 = params.sourceImage.toString("base64");

    const response = await fetch(
      `${this.baseUrl}/videos/image2video`,
      {
        method: "POST",
        headers: this.getAuthHeaders(),
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
        headers: this.getAuthHeaders(),
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
