// Round 2 regression-diff — render the Kittiwake Dr 1406-940 aerial photo
// through the post-DA.1 pipeline (Gemini analyzer + DA.2 director hard bans +
// DA.3 validator) on Atlas kling-v2-6-pro 5s, and compare against the Legacy
// 5★ iteration. Usage:
//
//   npx tsx scripts/regression-diff-render.ts            # default: aerial
//   npx tsx scripts/regression-diff-render.ts <photo_url> <legacy_prompt>
//
// Logs everything to docs/audits/test-render-log-2026-04-21.md and prints
// the full comparison payload so the audit doc can be assembled.

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

import Anthropic from "@anthropic-ai/sdk";
import {
  analyzePhotoWithGemini,
  type ExtendedPhotoAnalysis,
} from "../lib/providers/gemini-analyzer.js";
import {
  DIRECTOR_SYSTEM,
  buildDirectorUserPrompt,
} from "../lib/prompts/director.js";
import { mapCameraMovementToHeadroomKey } from "../lib/prompt-lab-listings.js";
import { AtlasProvider, ATLAS_MODELS } from "../lib/providers/atlas.js";
import { pollUntilComplete } from "../lib/providers/provider.interface.js";

// Anchor (from legacy session 8601b93c / iteration 3, 5★ kling drone_push_in)
const DEFAULT_PHOTO_URL =
  "https://vrhmaeywqsohlztoouxu.supabase.co/storage/v1/object/public/property-photos/prompt-lab/29a51ea1-0339-47e3-9666-dd8985c00b0d/1776442630469-38o36y.jpg";
const DEFAULT_LEGACY_PROMPT =
  "smooth cinematic drone flying forward at rooftop height toward the screened lanai and concrete seawall";
const DEFAULT_ANCHOR_ID = "kittiwake-1406-940-aerial";

const SKU = "kling-v2-6-pro";
const DURATION = 5;

async function main() {
  const photoUrl = process.argv[2] ?? DEFAULT_PHOTO_URL;
  const legacyPrompt = process.argv[3] ?? DEFAULT_LEGACY_PROMPT;
  const anchorId = process.argv[4] ?? DEFAULT_ANCHOR_ID;
  const fileName = decodeURIComponent(photoUrl.split("/").pop() ?? "photo.jpg");

  console.log(`[regression-diff] anchor=${anchorId}`);
  console.log(`[regression-diff] photo_url=${photoUrl}`);
  console.log(`[regression-diff] legacy_prompt="${legacyPrompt}"`);
  console.log(`[regression-diff] target: SKU=${SKU} duration=${DURATION}s\n`);

  // 1. Gemini analyzer.
  console.log("[1/5] Running Gemini analyzer...");
  const geminiRes = await analyzePhotoWithGemini(photoUrl);
  const analysis: ExtendedPhotoAnalysis = geminiRes.analysis;
  console.log(
    `[1/5] Gemini (${geminiRes.model}, ${geminiRes.usage.inputTokens}+${geminiRes.usage.outputTokens} tokens, ${geminiRes.usage.costCents.toFixed(4)}¢)`,
  );
  console.log(
    `      room=${analysis.room_type}  camera_height=${analysis.camera_height}  tilt=${analysis.camera_tilt}  coverage=${analysis.frame_coverage}`,
  );
  console.log(
    `      motion_headroom: ${JSON.stringify(analysis.motion_headroom)}`,
  );
  console.log(
    `      suggested_motion=${analysis.suggested_motion}  rationale="${analysis.motion_rationale}"`,
  );

  // 2. Call Sonnet 4.6 director with DA.2 system + camera-state block.
  console.log("\n[2/5] Calling Sonnet 4.6 director...");
  const photoArgs = [
    {
      id: "anchor",
      file_name: fileName,
      room_type: analysis.room_type,
      aesthetic_score: analysis.aesthetic_score,
      depth_rating: analysis.depth_rating,
      key_features: analysis.key_features,
      composition: analysis.composition,
      suggested_motion: analysis.suggested_motion,
      motion_rationale: analysis.motion_rationale,
      camera_height: analysis.camera_height,
      camera_tilt: analysis.camera_tilt,
      frame_coverage: analysis.frame_coverage,
      motion_headroom: analysis.motion_headroom as Record<string, boolean>,
      motion_headroom_rationale: analysis.motion_headroom_rationale,
    },
  ];
  const fullUserPrompt = buildDirectorUserPrompt(photoArgs);
  // Patch the one-photo case — system prompt expects 10-16 scenes, but with
  // one photo we want one scene. Append a scoping override at the end.
  const scopedUserPrompt =
    fullUserPrompt +
    `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSINGLE-PHOTO OVERRIDE (regression-diff harness)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nIgnore the "10-16 scenes" and "total duration 30-60 seconds" rules. You have ONE photo. Plan exactly ONE scene for that photo. duration_seconds must be 5. Apply all other rules (motion_headroom hard bans, concise prompt style, specific key_features, etc.) normally.`;

  const anthropic = new Anthropic();
  const DIRECTOR_MODEL = "claude-sonnet-4-6";
  const directorResp = await anthropic.messages.create({
    model: DIRECTOR_MODEL,
    max_tokens: 2048,
    system: DIRECTOR_SYSTEM,
    messages: [{ role: "user", content: scopedUserPrompt }],
  });
  const directorText =
    directorResp.content[0].type === "text" ? directorResp.content[0].text : "";
  const jsonMatch = directorText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Director returned no JSON: ${directorText.slice(0, 300)}`);
  const directorPlan = JSON.parse(jsonMatch[0]) as {
    mood: string;
    music_tag: string;
    scenes: Array<{
      scene_number: number;
      photo_id: string;
      room_type: string;
      camera_movement: string;
      prompt: string;
      duration_seconds: number;
    }>;
  };
  const scene = directorPlan.scenes[0];
  if (!scene) throw new Error("Director returned no scenes");
  console.log(
    `[2/5] Director picked camera_movement=${scene.camera_movement} duration=${scene.duration_seconds}s`,
  );
  console.log(`      prompt: "${scene.prompt}"`);

  // 3. DA.3 validator.
  console.log("\n[3/5] DA.3 validator...");
  const key = mapCameraMovementToHeadroomKey(scene.camera_movement);
  let finalMovement = scene.camera_movement;
  let validatorOverride: string | null = null;
  if (key && analysis.motion_headroom[key as keyof typeof analysis.motion_headroom] === false) {
    const suggested = analysis.suggested_motion ?? null;
    const suggestedKey = suggested ? mapCameraMovementToHeadroomKey(suggested) : null;
    const suggestedInHeadroom =
      suggested &&
      (!suggestedKey ||
        analysis.motion_headroom[suggestedKey as keyof typeof analysis.motion_headroom] !== false);
    finalMovement = suggestedInHeadroom && suggested ? suggested : "feature_closeup";
    validatorOverride = `${scene.camera_movement} → ${finalMovement} (motion_headroom.${key}=false)`;
    console.log(`[3/5] OVERRIDE: ${validatorOverride}`);
  } else {
    console.log(`[3/5] PASS: ${scene.camera_movement} (motion_headroom.${key ?? "n/a"} ok)`);
  }

  // 4. Submit render to Atlas (kling-v2-6-pro, 5s).
  console.log("\n[4/5] Submitting to Atlas...");
  const atlasModel = ATLAS_MODELS[SKU];
  const expectedCost = atlasModel.priceCentsPerSecond * DURATION;
  console.log(`      SKU=${SKU} duration=${DURATION}s expected_cost=$${(expectedCost / 100).toFixed(2)}`);
  const provider = new AtlasProvider();
  const t0 = Date.now();
  const job = await provider.generateClip({
    sourceImage: Buffer.alloc(0),
    sourceImageUrl: photoUrl,
    prompt: scene.prompt,
    durationSeconds: DURATION,
    aspectRatio: "16:9",
    modelOverride: SKU,
  });
  console.log(`      job_id=${job.jobId}`);

  console.log(`\n[5/5] Polling Atlas (~90s expected)...`);
  const result = await pollUntilComplete(provider, job.jobId, 300_000, 5_000);
  const renderMs = Date.now() - t0;
  if (result.status !== "complete" || !result.videoUrl) {
    throw new Error(`Render failed: ${result.error ?? "no video url"}`);
  }
  console.log(`[5/5] Complete in ${(renderMs / 1000).toFixed(0)}s`);
  console.log(`      clip_url: ${result.videoUrl}`);
  console.log(`      cost: $${((result.costCents ?? expectedCost) / 100).toFixed(2)}`);

  // Emit machine-readable summary for the audit doc builder.
  const summary = {
    anchor_id: anchorId,
    photo_url: photoUrl,
    file_name: fileName,
    legacy_prompt: legacyPrompt,
    gemini: {
      model: geminiRes.model,
      cost_cents: geminiRes.usage.costCents,
      tokens: geminiRes.usage.inputTokens + geminiRes.usage.outputTokens,
      analysis,
    },
    director: {
      model: DIRECTOR_MODEL,
      raw_output: scene,
      final_movement_after_validator: finalMovement,
      validator_override: validatorOverride,
      final_prompt: scene.prompt,
    },
    atlas: {
      sku: SKU,
      duration: DURATION,
      job_id: job.jobId,
      clip_url: result.videoUrl,
      cost_cents: result.costCents ?? expectedCost,
      render_ms: renderMs,
    },
  };

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = `/tmp/regression-diff-${anchorId}-${ts}.json`;
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\n[done] wrote ${outPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("[regression-diff] FAIL:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
