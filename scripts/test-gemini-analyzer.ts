// DA.1 smoke test — call analyzePhotoWithGemini on one real listing photo and
// print the full ExtendedPhotoAnalysis. Exits 0 iff the call returns a parsed
// object with the expected motion_headroom shape. Usage:
//
//   npx tsx scripts/test-gemini-analyzer.ts
//   npx tsx scripts/test-gemini-analyzer.ts <image_url>
//
// Requires GEMINI_API_KEY in .env. Intentionally minimal: one call, one photo,
// one pass/fail.

import * as fs from "fs";
import * as path from "path";

// Manual .env loader — matches the pattern used by scripts/cost-reconcile.ts
// so this smoke test runs without adding a dotenv dependency.
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

import { analyzePhotoWithGemini } from "../lib/providers/gemini-analyzer.js";

// Default anchor = an aerial shot from listing Almadyde Court. Aerial shots
// should produce motion_headroom.top_down = false (already overhead) and
// typically drone_push_in = true (forward clearance from altitude). Good
// pass/fail signature.
const DEFAULT_URL =
  "https://vrhmaeywqsohlztoouxu.supabase.co/storage/v1/object/public/property-photos/lab-listings/1d13a7ce-cb88-4e08-84ea-178b13e0c82e-Almadyde%20Court%2019199-906.jpg";

async function main() {
  const url = process.argv[2] ?? DEFAULT_URL;
  console.log("[test] analyzing:", url);
  const t0 = Date.now();
  const res = await analyzePhotoWithGemini(url);
  const ms = Date.now() - t0;

  console.log(`\n[test] model=${res.model}  latency=${ms}ms`);
  console.log(`[test] usage: input=${res.usage.inputTokens} output=${res.usage.outputTokens} cost=${res.usage.costCents.toFixed(4)}¢`);

  const a = res.analysis;
  console.log("\n--- ExtendedPhotoAnalysis ---");
  console.log(JSON.stringify(a, null, 2));

  console.log("\n--- Sanity summary ---");
  console.log(`room_type=${a.room_type}  video_viable=${a.video_viable}  suggested_motion=${a.suggested_motion}`);
  console.log(`camera_height=${a.camera_height}  tilt=${a.camera_tilt}  coverage=${a.frame_coverage}`);
  console.log(`motion_headroom: ${JSON.stringify(a.motion_headroom)}`);

  // Shape assertions — exit non-zero on violations so CI / operator can spot a
  // drift from the contract.
  const hr = a.motion_headroom;
  const required = ["push_in", "pull_out", "orbit", "parallax", "drone_push_in", "top_down"] as const;
  for (const k of required) {
    if (typeof hr[k] !== "boolean") {
      console.error(`[test] FAIL: motion_headroom.${k} is not boolean (got ${typeof hr[k]})`);
      process.exit(1);
    }
  }

  // suggested_motion must be in-headroom if it maps to a headroom key.
  if (a.suggested_motion) {
    const motionToKey: Record<string, keyof typeof hr | null> = {
      push_in: "push_in",
      low_angle_glide: "push_in",
      drone_push_in: "drone_push_in",
      orbit: "orbit",
      parallax: "parallax",
      dolly_left_to_right: "parallax",
      dolly_right_to_left: "parallax",
      reveal: "parallax",
      top_down: "top_down",
      feature_closeup: null,
      rack_focus: null,
    };
    const key = motionToKey[a.suggested_motion] ?? null;
    if (key && hr[key] === false) {
      console.warn(
        `[test] WARN: suggested_motion=${a.suggested_motion} but motion_headroom.${key}=false — Gemini recommended its own banned motion`,
      );
    }
  }

  console.log("\n[test] PASS: shape valid.");
}

main().catch((err) => {
  console.error("[test] FAIL:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
