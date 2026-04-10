import type { VideoProvider } from "../db";

export interface GenerateClipParams {
  sourceImage: Buffer;
  prompt: string;
  durationSeconds: number;
  aspectRatio: "16:9" | "9:16";
}

export interface GenerationJob {
  jobId: string;
  estimatedSeconds: number;
}

export interface GenerationResult {
  status: "processing" | "complete" | "failed";
  videoUrl?: string;
  costCents?: number;
  error?: string;
}

export interface IVideoProvider {
  name: VideoProvider;
  generateClip(params: GenerateClipParams): Promise<GenerationJob>;
  checkStatus(jobId: string): Promise<GenerationResult>;
  downloadClip(videoUrl: string): Promise<Buffer>;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollUntilComplete(
  provider: IVideoProvider,
  jobId: string,
  timeoutMs: number = 180_000,
  intervalMs: number = 3_000
): Promise<GenerationResult> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await provider.checkStatus(jobId);
    if (result.status === "complete" || result.status === "failed") {
      return result;
    }
    await sleep(intervalMs);
  }
  return { status: "failed", error: "Generation timed out" };
}
