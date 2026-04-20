// Real Claude pricing (2026, cents per 1M tokens). Update if Anthropic changes rates.
// Source: https://www.anthropic.com/pricing

interface ModelRates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const RATES: Record<string, ModelRates> = {
  // Claude Opus 4.7 / 4.x: $15 / $75 / $1.50 / $18.75 per MTok
  "claude-opus-4-7": { input: 1500, output: 7500, cacheRead: 150, cacheWrite: 1875 },
  "claude-opus-4-6": { input: 1500, output: 7500, cacheRead: 150, cacheWrite: 1875 },
  "claude-opus-4-5": { input: 1500, output: 7500, cacheRead: 150, cacheWrite: 1875 },

  // Claude Sonnet 4.x: $3 / $15 / $0.30 / $3.75 per MTok
  "claude-sonnet-4-6": { input: 300, output: 1500, cacheRead: 30, cacheWrite: 375 },
  "claude-sonnet-4-5": { input: 300, output: 1500, cacheRead: 30, cacheWrite: 375 },

  // Claude Haiku 4.5: $1 / $5 / $0.10 / $1.25 per MTok
  "claude-haiku-4-5": { input: 100, output: 500, cacheRead: 10, cacheWrite: 125 },
  "claude-haiku-4-5-20251001": { input: 100, output: 500, cacheRead: 10, cacheWrite: 125 },
};

// Normalize model id so versioned ids (e.g. "claude-haiku-4-5-20251001")
// fall back to their base rate if the exact version isn't in RATES.
function resolveRates(modelId: string): ModelRates {
  if (RATES[modelId]) return RATES[modelId];
  // Try prefix-match: strip trailing date suffix
  for (const [key, rates] of Object.entries(RATES)) {
    if (modelId.startsWith(key)) return rates;
  }
  // Unknown model — fall back to Sonnet 4.6 rates and log so we notice.
  console.warn(`[computeClaudeCost] unknown model ${modelId}; using Sonnet 4.6 rates as fallback`);
  return RATES["claude-sonnet-4-6"];
}

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface ClaudeCostResult {
  costCents: number;
  totalTokens: number;
  model: string;
  breakdown: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export function computeClaudeCost(usage: ClaudeUsage, model: string): ClaudeCostResult {
  const rates = resolveRates(model);
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;

  const inputCost = (input * rates.input) / 1_000_000;
  const outputCost = (output * rates.output) / 1_000_000;
  const cacheReadCost = (cacheRead * rates.cacheRead) / 1_000_000;
  const cacheWriteCost = (cacheWrite * rates.cacheWrite) / 1_000_000;

  return {
    costCents: inputCost + outputCost + cacheReadCost + cacheWriteCost,
    totalTokens: input + output + cacheRead + cacheWrite,
    model,
    breakdown: { input, output, cacheRead, cacheWrite },
  };
}
