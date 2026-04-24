// Retry classifier for Gemini judge calls.
//
// Some failures we've observed in prod (rating-ledger audit, 2026-04-24):
//   - HTTP 400 "Cannot fetch content from the provided URL" — Gemini's
//     server-side fetcher sometimes fails on a perfectly valid public
//     Supabase Storage URL. Retrying after a short backoff usually works.
//   - HTTP 429 quota / rate-limit bursts.
//   - HTTP 5xx from Gemini or network errors.
//
// Those are TRANSIENT and worth retrying. Other failures (validation,
// schema, auth) are PERMANENT — retrying just burns quota.
//
// The classifier is a string match on the error message since that's what
// the @google/genai SDK surfaces most reliably.

export type RetryClass = "transient" | "permanent";

export function classifyJudgeError(err: unknown): RetryClass {
  const msg = err instanceof Error ? err.message : String(err);

  // Transient: Gemini server-side fetch failures (wording has varied:
  // "Cannot fetch content from the provided URL" / "Cannot fetch content").
  if (/Cannot fetch content/i.test(msg)) return "transient";
  // Transient: quota / rate-limit.
  if (/\b429\b|RESOURCE_EXHAUSTED|Resource has been exhausted/i.test(msg)) return "transient";
  // Transient: server-side errors.
  if (/\b5\d\d\b|INTERNAL|UNAVAILABLE|DEADLINE_EXCEEDED/i.test(msg)) return "transient";
  // Transient: network-layer failures.
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|network/i.test(msg)) return "transient";

  // Everything else (validation errors, missing key, schema mismatch, 400 non-fetch)
  // is permanent — surface the error and don't waste quota.
  return "permanent";
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn` with up to `backoffsMs.length + 1` attempts. After each failure
 * whose classifier returns "transient", wait the next backoff and retry.
 * Throws the last error on exhaustion or any permanent error.
 */
export async function withJudgeRetry<T>(
  fn: () => Promise<T>,
  backoffsMs: number[] = [2_000, 6_000, 18_000],
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= backoffsMs.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (classifyJudgeError(err) !== "transient") throw err;
      if (attempt >= backoffsMs.length) break;
      await sleep(backoffsMs[attempt]);
    }
  }
  throw lastErr;
}
