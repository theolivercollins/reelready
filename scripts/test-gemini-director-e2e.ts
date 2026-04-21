// DA.1 end-to-end smoke — analyzer → director user-prompt assembly on a
// small photo set. Does NOT hit Claude and does NOT write to the DB. Runs
// Gemini on 2-3 real photos pulled from a listing, then calls
// buildDirectorUserPrompt on the results so we can eyeball whether the new
// camera_state + motion_headroom block lands in the prompt the director would
// see. Writes the assembled prompt + per-photo ExtendedPhotoAnalysis to
// /tmp/director-prompt-e2e-<timestamp>.md for archiving.
//
// Usage:
//   npx tsx scripts/test-gemini-director-e2e.ts
//   npx tsx scripts/test-gemini-director-e2e.ts <listing_id>

import * as fs from "fs";
import * as path from "path";

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

import { createClient } from "@supabase/supabase-js";
import {
  analyzePhotoWithGemini,
  type ExtendedPhotoAnalysis,
} from "../lib/providers/gemini-analyzer.js";
import { buildDirectorUserPrompt } from "../lib/prompts/director.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !SB_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}

const PHOTO_LIMIT = 3; // keep the smoke test cheap

async function main() {
  const supabase = createClient(SB_URL!, SB_KEY!);

  // Pick a listing with photos. Default = the most recent listing that has
  // photos. Callers can pass a specific listing_id as arg 1.
  let listingId = process.argv[2];
  if (!listingId) {
    const { data: listings, error } = await supabase
      .from("prompt_lab_listings")
      .select("id, name")
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    if (!listings || listings.length === 0) {
      console.error("no listings found");
      process.exit(1);
    }
    listingId = listings[0].id;
    console.log(`[e2e] defaulting to listing ${listingId} (${listings[0].name})`);
  }

  const { data: photos, error: pErr } = await supabase
    .from("prompt_lab_listing_photos")
    .select("id, image_url, photo_index")
    .eq("listing_id", listingId!)
    .order("photo_index", { ascending: true })
    .limit(PHOTO_LIMIT);
  if (pErr) throw pErr;
  if (!photos || photos.length === 0) {
    console.error(`no photos for listing ${listingId}`);
    process.exit(1);
  }

  console.log(`[e2e] analyzing ${photos.length} photo(s) with Gemini...`);
  const enriched: Array<{
    id: string;
    file_name: string;
    analysis: ExtendedPhotoAnalysis;
    costCents: number;
    model: string;
  }> = [];
  for (const p of photos) {
    const res = await analyzePhotoWithGemini(p.image_url);
    const fileName = p.image_url.split("/").pop() ?? `photo-${p.photo_index}.jpg`;
    enriched.push({
      id: p.id,
      file_name: decodeURIComponent(fileName),
      analysis: res.analysis,
      costCents: res.usage.costCents,
      model: res.model,
    });
    const hr = res.analysis.motion_headroom;
    const hrStr = Object.entries(hr).map(([k, v]) => `${k}=${v ? "T" : "F"}`).join(" ");
    console.log(
      `  [${p.photo_index}] ${res.analysis.room_type} — ${res.analysis.camera_height}/${res.analysis.camera_tilt}/${res.analysis.frame_coverage}  hr: ${hrStr}  suggested=${res.analysis.suggested_motion}`,
    );
  }

  const totalCost = enriched.reduce((s, e) => s + e.costCents, 0);
  console.log(`[e2e] Gemini total cost: ${totalCost.toFixed(4)}¢`);

  const photoArgs = enriched.map((e) => ({
    id: e.id,
    file_name: e.file_name,
    room_type: e.analysis.room_type,
    aesthetic_score: e.analysis.aesthetic_score,
    depth_rating: e.analysis.depth_rating,
    key_features: e.analysis.key_features,
    composition: e.analysis.composition,
    suggested_motion: e.analysis.suggested_motion,
    motion_rationale: e.analysis.motion_rationale,
    camera_height: e.analysis.camera_height,
    camera_tilt: e.analysis.camera_tilt,
    frame_coverage: e.analysis.frame_coverage,
    motion_headroom: e.analysis.motion_headroom as Record<string, boolean>,
    motion_headroom_rationale: e.analysis.motion_headroom_rationale,
  }));

  const prompt = buildDirectorUserPrompt(photoArgs);

  // Assertions — the prompt should surface the new fields for at least one
  // photo. If any of these miss, the wiring is broken and this smoke test
  // should fail loudly.
  const checks: Array<[string, boolean]> = [
    ["contains 'motion_headroom:'", prompt.includes("motion_headroom:")],
    ["contains 'camera_height:'", prompt.includes("camera_height:")],
    ["contains 'camera_tilt:'", prompt.includes("camera_tilt:")],
    ["contains 'frame_coverage:'", prompt.includes("frame_coverage:")],
    ["contains 'motion_headroom_rationale:'", prompt.includes("motion_headroom_rationale:")],
  ];
  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) failed++;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = `/tmp/director-prompt-e2e-${ts}.md`;
  const body = [
    `# DA.1 E2E — director user prompt (${new Date().toISOString()})`,
    ``,
    `Listing: ${listingId}  photos: ${photos.length}  Gemini cost: ${totalCost.toFixed(4)}¢`,
    ``,
    `## Per-photo ExtendedPhotoAnalysis`,
    ``,
    ...enriched.map(
      (e) =>
        `### ${e.file_name} (${e.id})\n\n\`\`\`json\n${JSON.stringify(e.analysis, null, 2)}\n\`\`\``,
    ),
    ``,
    `## Assembled director user prompt`,
    ``,
    "```",
    prompt,
    "```",
  ].join("\n");
  fs.writeFileSync(outPath, body);
  console.log(`\n[e2e] wrote ${outPath}`);

  if (failed > 0) {
    console.error(`[e2e] FAIL: ${failed} missing field(s) in assembled prompt`);
    process.exit(1);
  }
  console.log("[e2e] PASS: all new camera-state fields present in director prompt.");
}

main().catch((err) => {
  console.error("[e2e] FAIL:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
