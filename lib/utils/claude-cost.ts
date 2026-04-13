// Real Claude Sonnet 4.6 pricing (2026), cents per 1M tokens.
// Source: Anthropic pricing page — update if Anthropic changes pricing.
const CLAUDE_SONNET_46_INPUT_CENTS_PER_MTOK = 300;       // $3 / MTok
const CLAUDE_SONNET_46_OUTPUT_CENTS_PER_MTOK = 1500;     // $15 / MTok
const CLAUDE_SONNET_46_CACHE_READ_CENTS_PER_MTOK = 30;   // $0.30 / MTok
const CLAUDE_SONNET_46_CACHE_WRITE_CENTS_PER_MTOK = 375; // $3.75 / MTok (5m)

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface ClaudeCostResult {
  costCents: number;
  totalTokens: number;
  breakdown: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export function computeClaudeCost(usage: ClaudeUsage): ClaudeCostResult {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;

  const inputCost = (input * CLAUDE_SONNET_46_INPUT_CENTS_PER_MTOK) / 1_000_000;
  const outputCost = (output * CLAUDE_SONNET_46_OUTPUT_CENTS_PER_MTOK) / 1_000_000;
  const cacheReadCost = (cacheRead * CLAUDE_SONNET_46_CACHE_READ_CENTS_PER_MTOK) / 1_000_000;
  const cacheWriteCost = (cacheWrite * CLAUDE_SONNET_46_CACHE_WRITE_CENTS_PER_MTOK) / 1_000_000;

  return {
    costCents: inputCost + outputCost + cacheReadCost + cacheWriteCost,
    totalTokens: input + output + cacheRead + cacheWrite,
    breakdown: {
      input,
      output,
      cacheRead,
      cacheWrite,
    },
  };
}
