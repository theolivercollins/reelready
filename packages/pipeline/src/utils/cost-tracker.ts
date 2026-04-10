import type { VideoProvider } from "@reelready/db";

// Prices in cents per second of generated video
const GENERATION_COST_PER_SECOND: Record<VideoProvider, number> = {
  runway: 20,  // ~$0.20/sec
  kling: 10,   // ~$0.10/sec
  luma: 12,    // ~$0.12/sec
};

// Approximate LLM costs (cents per 1K tokens)
const LLM_COST = {
  inputPer1K: 0.3,   // claude-sonnet-4-6 input
  outputPer1K: 1.5,  // claude-sonnet-4-6 output
  visionImageCost: 1.0, // approximate per-image cost in cents
};

export function estimateGenerationCost(
  provider: VideoProvider,
  durationSeconds: number
): number {
  return Math.round(GENERATION_COST_PER_SECOND[provider] * durationSeconds);
}

export function estimateAnalysisCost(photoCount: number): number {
  // Vision analysis: ~1 cent per image + token costs
  return Math.round(photoCount * LLM_COST.visionImageCost + 2);
}

export function estimateScriptingCost(): number {
  // Single LLM call: ~2 cents
  return 2;
}

export function estimateQCCost(): number {
  // 5 frames analyzed: ~3 cents
  return 3;
}

export function formatCostCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
