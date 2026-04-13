// Submit a single clip to Higgsfield (single-image OR first-last-frame),
// poll until terminal, and print the final clip URL on stdout.
//
// This is the one-shot "regenerate a test clip with a better prompt"
// tool. Use it from your local shell where HIGGSFIELD_API_KEY and
// HIGGSFIELD_API_SECRET are exported.
//
// Usage (first-last-frame — the anchor-both-ends mode):
//   HIGGSFIELD_API_KEY=... HIGGSFIELD_API_SECRET=... \
//     npx tsx scripts/generate-higgsfield-clip.ts \
//       --start "https://.../pool-start.jpg" \
//       --end   "https://.../pool-end.jpg" \
//       --prompt "A slow cinematic parallax across the pool deck…" \
//       --duration 5
//
// Usage (single image — baseline, no end frame):
//   npx tsx scripts/generate-higgsfield-clip.ts \
//     --start "https://.../pool.jpg" \
//     --prompt "…"
//
// Defaults:
//   --duration 5          (we cap at 5s to sidestep the 10s decay tail;
//                          see docs/WALKTHROUGH-ROADMAP.md R11)
//   --prompt   <built-in ENHANCED_DEFAULT_PROMPT below>  (if omitted)
//
// Output: a single line on stdout — the clip URL. All other chatter
// goes to stderr so you can do:
//   CLIP_URL=$(npx tsx scripts/generate-higgsfield-clip.ts --start ... --end ...)

const BASE_URL = "https://platform.higgsfield.ai";
const STANDARD_PATH = "/higgsfield-ai/dop/standard";
const FIRST_LAST_FRAME_PATH = "/higgsfield-ai/dop/standard/first-last-frame";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

// Enhanced default prompt tuned for the waterfront pool / lanai shot
// from the 2026-04-13 probe (the San Massimo back-of-house image).
// Directly addresses every failure mode in docs/PROJECT-STATE.md
// §"Video output quality":
//   1. Forbids camera exit through lanai screen.
//   2. Anchors adjacent elements (no invented boats, docks, palms).
//   3. Plain-language motion sentence (no jargon names).
//   4. Explicitly forbids the last-2-3-seconds collapse (R11):
//      "every architectural element remains pixel-stable from
//      the first frame to the last frame."
const ENHANCED_DEFAULT_PROMPT = [
  "A slow, deliberate cinematic camera movement across a screened",
  "lanai pool deck on a Florida waterfront property. The lens drifts",
  "laterally just above the pool coping, revealing the turquoise pool",
  "water in the foreground and the canal, docks, and distant homes",
  "beyond. A palm tree frames the left side of the shot and the",
  "darker vertical lines of the screen enclosure frame the right",
  "side. Elements near the camera — pool edge, coping, deck — shift",
  "faster than elements in the distance — boats, far-bank palms,",
  "distant houses — producing natural parallax depth.",
  "",
  "ABSOLUTE CONSTRAINTS. The camera NEVER crosses the lanai screen",
  "or leaves the pool deck. The camera NEVER turns around. The camera",
  "never exits the frame boundary established in the first frame.",
  "Every architectural element — pool shape, pool coping, lanai",
  "screen, palm tree, dock pilings, boats visible at start, far-bank",
  "houses, sky — remains pixel-stable and identical in appearance",
  "from the first frame to the last frame. No warping of the pool",
  "edge. No bending of the screen frame. No new boats appearing.",
  "No new structures appearing on the far bank. No change in time of",
  "day. No change in sky. No melting surfaces. No people. No text,",
  "watermark, logo, or caption.",
  "",
  "The final second of the clip must hold the same coherence as the",
  "first second — no late-stage drift, no late-stage hallucination,",
  "no late-stage warping. If the model cannot maintain stability for",
  "the full duration, it should hold the camera static rather than",
  "introduce any change.",
].join(" ");

interface Args {
  start: string | null;
  end: string | null;
  prompt: string;
  duration: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    start: null,
    end: null,
    prompt: ENHANCED_DEFAULT_PROMPT,
    duration: 5,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--start":
      case "--start-image":
        args.start = v;
        i++;
        break;
      case "--end":
      case "--end-image":
        args.end = v;
        i++;
        break;
      case "--prompt":
        args.prompt = v;
        i++;
        break;
      case "--duration":
        args.duration = parseInt(v, 10);
        i++;
        break;
      case "-h":
      case "--help":
        process.stderr.write(
          "usage: generate-higgsfield-clip.ts --start URL [--end URL] --prompt TEXT [--duration N]\n"
        );
        process.exit(0);
      default:
        process.stderr.write(`Unknown argument: ${k}\n`);
        process.exit(1);
    }
  }
  return args;
}

function authHeader(): string {
  const key = process.env.HIGGSFIELD_API_KEY;
  const secret = process.env.HIGGSFIELD_API_SECRET;
  if (!key || !secret) {
    process.stderr.write(
      "ERROR: HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET must both be set.\n"
    );
    process.exit(1);
  }
  return `Key ${key}:${secret}`;
}

async function submit(args: Args): Promise<string> {
  if (!args.start) {
    process.stderr.write("ERROR: --start is required.\n");
    process.exit(1);
  }

  const useKeyframe = !!args.end;
  const path = useKeyframe ? FIRST_LAST_FRAME_PATH : STANDARD_PATH;
  const body: Record<string, unknown> = {
    image_url: args.start,
    prompt: args.prompt,
    duration: args.duration,
  };
  if (useKeyframe) body.end_image = args.end;

  process.stderr.write(`Endpoint : ${BASE_URL}${path}\n`);
  process.stderr.write(`Mode     : ${useKeyframe ? "first-last-frame" : "single-image"}\n`);
  process.stderr.write(`Duration : ${args.duration}s\n`);
  process.stderr.write(`Start    : ${args.start}\n`);
  if (useKeyframe) process.stderr.write(`End      : ${args.end}\n`);
  process.stderr.write(`Prompt   : ${args.prompt.slice(0, 120)}${args.prompt.length > 120 ? "…" : ""}\n\n`);
  process.stderr.write("Submitting…\n");

  const resp = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    process.stderr.write(`Submit failed: HTTP ${resp.status}\n${text}\n`);
    process.exit(2);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    process.stderr.write(`Response was not JSON:\n${text}\n`);
    process.exit(2);
  }

  const jobId =
    (parsed.request_id as string | undefined) ??
    (parsed.id as string | undefined) ??
    ((parsed.data as Record<string, unknown> | undefined)?.request_id as string | undefined) ??
    ((parsed.data as Record<string, unknown> | undefined)?.id as string | undefined);

  if (!jobId) {
    process.stderr.write(
      `Submit succeeded but no request_id in response:\n${JSON.stringify(parsed, null, 2)}\n`
    );
    process.exit(2);
  }

  process.stderr.write(`request_id = ${jobId}\n\n`);
  return jobId;
}

async function poll(jobId: string): Promise<string> {
  const start = Date.now();
  let ticks = 0;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    ticks++;
    try {
      const resp = await fetch(`${BASE_URL}/requests/${jobId}/status`, {
        headers: { Authorization: authHeader() },
      });
      const text = await resp.text();
      if (!resp.ok) {
        process.stderr.write(`Status HTTP ${resp.status}: ${text}\n`);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const status = (
        (parsed.status as string | undefined) ??
        (parsed.state as string | undefined) ??
        ""
      ).toLowerCase();

      process.stderr.write(`[${ticks.toString().padStart(3)}] status=${status || "(unknown)"}\n`);

      if (status === "completed" || status === "complete") {
        const videoUrl =
          ((parsed.result as Record<string, unknown> | undefined)?.video_url as string | undefined) ??
          ((parsed.result as Record<string, unknown> | undefined)?.url as string | undefined) ??
          (parsed.video_url as string | undefined) ??
          ((parsed.output as Record<string, unknown> | undefined)?.video_url as string | undefined) ??
          ((parsed.output as Record<string, unknown> | undefined)?.url as string | undefined);
        if (!videoUrl) {
          process.stderr.write(
            `Completed but no video URL in response:\n${JSON.stringify(parsed, null, 2)}\n`
          );
          process.exit(3);
        }
        return videoUrl;
      }
      if (status === "failed" || status === "nsfw") {
        const err =
          (parsed.error as string | undefined) ??
          (parsed.failure_reason as string | undefined) ??
          status;
        process.stderr.write(`Request ${status}: ${err}\n`);
        process.exit(4);
      }
    } catch (err) {
      process.stderr.write(
        `Poll error: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
  process.stderr.write(`Timed out after ${POLL_TIMEOUT_MS / 1000}s\n`);
  process.exit(5);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const jobId = await submit(args);
  const url = await poll(jobId);
  process.stderr.write(`\nDONE.\n`);
  // The clip URL is the only thing on stdout.
  process.stdout.write(url + "\n");
}

main().catch((err) => {
  process.stderr.write(
    `FATAL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`
  );
  process.exit(99);
});
