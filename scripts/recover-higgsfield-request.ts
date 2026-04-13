// Recover the full server-side metadata (prompt, images, model,
// duration, credits used, status, output URL) for any past Higgsfield
// request by its ID — or by any clip URL that embeds the request ID.
//
// Why this exists: when the probe clip
//   https://cloud-cdn.higgsfield.ai/.../aa4c398c-8e22-45ef-8be5-1d6fd6cb6193.mp4
// was generated, the images and prompt were passed via shell env vars
// to scripts/test-higgsfield.ts and then forgotten. Nothing in the repo
// records what the run was based on. This script recovers that data
// from Higgsfield itself so any past clip is provenance-recoverable.
//
// Usage:
//   HIGGSFIELD_API_KEY=... HIGGSFIELD_API_SECRET=... \
//     npx tsx scripts/recover-higgsfield-request.ts <request-id-or-clip-url>
//
// Examples:
//   npx tsx scripts/recover-higgsfield-request.ts aa4c398c-8e22-45ef-8be5-1d6fd6cb6193
//   npx tsx scripts/recover-higgsfield-request.ts \
//     https://cloud-cdn.higgsfield.ai/32b4fa89-6049-4d57-84e1-cbe46b7f70ef/aa4c398c-8e22-45ef-8be5-1d6fd6cb6193.mp4
//
// If creds live in docs/CREDENTIALS.md, export them first:
//   source docs/CREDENTIALS.md  # if it's a shell-sourceable env file
//   # OR
//   export HIGGSFIELD_API_KEY=...
//   export HIGGSFIELD_API_SECRET=...
//
// Output: a JSON dump of the full /requests/{id}/status response, plus
// a human-readable summary at the end.

const BASE_URL = "https://platform.higgsfield.ai";
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function die(msg: string, code = 1): never {
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exit(code);
}

function extractRequestId(input: string): string {
  // If the argument is a clean UUID, use it as-is.
  const cleanMatch = input.trim().match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  if (cleanMatch) return cleanMatch[0].toLowerCase();

  // Otherwise extract any UUIDs from the string and pick the LAST one —
  // a clip URL looks like /{workspace_uuid}/{request_uuid}.mp4, and the
  // request ID is the second UUID in the path.
  const matches = input.match(UUID_RE);
  if (!matches || matches.length === 0) {
    die(`Could not find a UUID in argument: ${input}`);
  }
  return matches[matches.length - 1].toLowerCase();
}

function authHeader(): string {
  const key = process.env.HIGGSFIELD_API_KEY;
  const secret = process.env.HIGGSFIELD_API_SECRET;
  if (!key || !secret) {
    die("HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET must both be set.");
  }
  return `Key ${key}:${secret}`;
}

function flatten(obj: unknown, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (obj === null || obj === undefined) {
    out.push([prefix || "(root)", String(obj)]);
    return out;
  }
  if (typeof obj !== "object") {
    const s = String(obj);
    out.push([prefix || "(root)", s.length > 200 ? s.slice(0, 200) + "…" : s]);
    return out;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      out.push([prefix || "(root)", "[]"]);
      return out;
    }
    for (let i = 0; i < obj.length; i++) {
      out.push(...flatten(obj[i], `${prefix}[${i}]`));
    }
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    out.push(...flatten(v, path));
  }
  return out;
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    die("Usage: recover-higgsfield-request.ts <request-id-or-clip-url>");
  }

  const requestId = extractRequestId(arg);
  process.stderr.write(`Extracted request ID: ${requestId}\n`);

  const url = `${BASE_URL}/requests/${requestId}/status`;
  process.stderr.write(`GET ${url}\n\n`);

  const response = await fetch(url, {
    headers: { Authorization: authHeader() },
  });

  const text = await response.text();

  if (!response.ok) {
    process.stderr.write(`HTTP ${response.status}\n`);
    process.stdout.write(text + "\n");
    process.exit(2);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    process.stderr.write("Response was not JSON — dumping raw.\n");
    process.stdout.write(text + "\n");
    process.exit(0);
  }

  // Raw JSON dump — complete server-side record.
  process.stdout.write("=== FULL RESPONSE (JSON) ===\n");
  process.stdout.write(JSON.stringify(parsed, null, 2) + "\n\n");

  // Flat key summary — easy to eyeball.
  process.stdout.write("=== FLAT FIELD SUMMARY ===\n");
  const rows = flatten(parsed);
  const maxKey = Math.min(60, Math.max(...rows.map((r) => r[0].length)));
  for (const [k, v] of rows) {
    const key = k.length > maxKey ? k.slice(0, maxKey - 1) + "…" : k.padEnd(maxKey);
    process.stdout.write(`${key}  ${v}\n`);
  }
  process.stdout.write("\n");

  // Heuristic pull of the fields most relevant to provenance.
  const obj = parsed as Record<string, unknown>;
  const params =
    (obj.input as Record<string, unknown> | undefined) ??
    (obj.params as Record<string, unknown> | undefined) ??
    (obj.request as Record<string, unknown> | undefined) ??
    (obj.payload as Record<string, unknown> | undefined) ??
    obj;

  const pick = (k: string): unknown => params[k] ?? obj[k];

  process.stdout.write("=== PROVENANCE (best-guess fields) ===\n");
  process.stdout.write(`request_id   : ${requestId}\n`);
  process.stdout.write(`status       : ${String(pick("status") ?? pick("state") ?? "(unknown)")}\n`);
  process.stdout.write(`model        : ${String(pick("model") ?? pick("engine") ?? pick("endpoint") ?? "(unknown)")}\n`);
  process.stdout.write(`prompt       : ${String(pick("prompt") ?? "(unknown)")}\n`);
  process.stdout.write(`duration     : ${String(pick("duration") ?? pick("duration_seconds") ?? "(unknown)")}\n`);
  process.stdout.write(`image_url    : ${String(pick("image_url") ?? pick("start_image") ?? pick("image") ?? "(unknown)")}\n`);
  process.stdout.write(`end_image    : ${String(pick("end_image") ?? pick("tail_image_url") ?? pick("frame1") ?? "(unknown)")}\n`);
  process.stdout.write(`credits_used : ${String(pick("credits_used") ?? pick("credits") ?? pick("cost") ?? "(unknown)")}\n`);
  process.stdout.write(`output_url   : ${String(
    (obj.result as Record<string, unknown> | undefined)?.video_url ??
      (obj.result as Record<string, unknown> | undefined)?.url ??
      obj.video_url ??
      (obj.output as Record<string, unknown> | undefined)?.video_url ??
      (obj.output as Record<string, unknown> | undefined)?.url ??
      "(unknown)"
  )}\n`);
}

main().catch((err) => {
  die(err instanceof Error ? (err.stack ?? err.message) : String(err));
});
