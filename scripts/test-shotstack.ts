// Smoke test for the Shotstack provider.
// Run: npx tsx scripts/test-shotstack.ts
//
// Uses Shotstack's own public sample videos so this test has zero external
// dependencies. Renders both aspect ratios and prints the download URLs.

import * as fs from "fs";
import * as path from "path";
// Minimal .env loader — no dotenv dep needed
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

import {
  ShotstackProvider,
  buildShotstackTimeline,
  pollAssemblyUntilComplete,
} from "../lib/providers/shotstack.js";

const SAMPLE_CLIPS = [
  {
    url: "https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/footage/beach-overhead.mp4",
    durationSeconds: 4,
  },
  {
    url: "https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/footage/table-mountain.mp4",
    durationSeconds: 4,
  },
  {
    url: "https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/footage/skater.hd.mp4",
    durationSeconds: 4,
  },
];

const OVERLAYS = {
  address: "123 Palm Avenue, Miami FL",
  price: "$1,250,000",
  details: "4 BD | 3 BA",
  agent: "Jane Smith",
  brokerage: "Compass",
};

async function main() {
  console.log("=== Shotstack smoke test ===");
  console.log("env:", process.env.SHOTSTACK_ENV ?? "stage");

  // 1. Sanity-check the pure timeline builder without hitting the API
  const payload = buildShotstackTimeline({
    clips: SAMPLE_CLIPS,
    overlays: OVERLAYS,
    aspectRatio: "16:9",
  });
  console.log("\n--- Timeline preview (first clip + first overlay) ---");
  console.log(JSON.stringify({
    tracks: payload.timeline.tracks.map((t) => ({
      clipCount: t.clips.length,
      firstClip: t.clips[0],
    })),
    output: payload.output,
  }, null, 2));

  // 2. Live render — 16:9
  const provider = new ShotstackProvider();

  console.log("\n--- Submitting 16:9 render ---");
  const horizontalJob = await provider.assemble({
    clips: SAMPLE_CLIPS,
    overlays: OVERLAYS,
    aspectRatio: "16:9",
  });
  console.log("jobId:", horizontalJob.jobId, "env:", horizontalJob.environment);

  console.log("Polling... (usually 30–90s)");
  const horizontalResult = await pollAssemblyUntilComplete(provider, horizontalJob);
  console.log("16:9 result:", horizontalResult);
  if (horizontalResult.status !== "complete") {
    console.error("FAILED — aborting 9:16 render");
    process.exit(1);
  }

  // 3. Live render — 9:16
  console.log("\n--- Submitting 9:16 render ---");
  const verticalJob = await provider.assemble({
    clips: SAMPLE_CLIPS,
    overlays: OVERLAYS,
    aspectRatio: "9:16",
  });
  console.log("jobId:", verticalJob.jobId);

  console.log("Polling...");
  const verticalResult = await pollAssemblyUntilComplete(provider, verticalJob);
  console.log("9:16 result:", verticalResult);

  console.log("\n=== DONE ===");
  console.log("16:9 URL:", horizontalResult.videoUrl);
  console.log("9:16 URL:", verticalResult.videoUrl);
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
