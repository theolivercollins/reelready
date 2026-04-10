import type { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import {
  updateSceneStatus,
  updateScene,
  allScenesPassedQC,
  log,
  addPropertyCost,
  updatePropertyStatus,
} from "@reelready/db";
import { getSupabase } from "@reelready/db";
import type { QCJobData } from "../queue/setup.js";
import { generationQueue, assemblyQueue } from "../queue/setup.js";
import {
  QC_SYSTEM,
  buildQCUserPrompt,
  buildPromptModification,
  type QCResult,
} from "../prompts/qc-evaluator.js";
import { extractFramesFromClip, imageToBase64 } from "../utils/image-processing.js";
import { estimateQCCost } from "../utils/cost-tracker.js";

const TEMP_DIR = process.env.TEMP_DIR || "/tmp/reelready";

export async function processQC(job: Job<QCJobData>): Promise<void> {
  const { propertyId, sceneId } = job.data;
  const supabase = getSupabase();

  const { data: scene, error } = await supabase
    .from("scenes")
    .select()
    .eq("id", sceneId)
    .single();

  if (error || !scene) {
    await log(propertyId, "qc", "error", `Scene ${sceneId} not found`);
    return;
  }

  if (!scene.clip_url) {
    await log(propertyId, "qc", "error", `Scene ${scene.scene_number} has no clip URL`, undefined, sceneId);
    return;
  }

  await updatePropertyStatus(propertyId, "qc");
  await log(propertyId, "qc", "info", `QC check for scene ${scene.scene_number}`, undefined, sceneId);

  // Download clip to temp
  const workDir = path.join(TEMP_DIR, propertyId, `qc_${sceneId}`);
  await fs.mkdir(workDir, { recursive: true });
  const clipPath = path.join(workDir, "clip.mp4");

  const clipResponse = await fetch(scene.clip_url);
  if (!clipResponse.ok) {
    await log(propertyId, "qc", "error", "Failed to download clip for QC", undefined, sceneId);
    return;
  }
  await fs.writeFile(clipPath, Buffer.from(await clipResponse.arrayBuffer()));

  // Extract frames
  const framesDir = path.join(workDir, "frames");
  const framePaths = await extractFramesFromClip(clipPath, framesDir, 5);

  // Send to vision LLM
  const client = new Anthropic();
  const imageContents: Anthropic.ImageBlockParam[] = [];

  for (const framePath of framePaths) {
    const buffer = await fs.readFile(framePath);
    const base64 = await imageToBase64(buffer);
    imageContents.push({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: base64,
      },
    });
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 1024,
    system: QC_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          ...imageContents,
          {
            type: "text",
            text: buildQCUserPrompt(scene.camera_movement, scene.prompt),
          },
        ],
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    await log(propertyId, "qc", "warn", "Failed to parse QC response, treating as soft reject", undefined, sceneId);
    await handleReject(propertyId, sceneId, scene, "soft_reject", ["Unparseable QC response"]);
    return;
  }

  const qcResult: QCResult = JSON.parse(jsonMatch[0]);
  const cost = estimateQCCost();
  await addPropertyCost(propertyId, cost);

  const autoApproveThreshold = parseFloat(
    process.env.QC_AUTO_APPROVE_THRESHOLD ?? "0.95"
  );
  const confidenceThreshold = parseFloat(
    process.env.QC_CONFIDENCE_THRESHOLD ?? "0.75"
  );

  // Update scene with QC results
  await updateScene(sceneId, {
    qc_verdict: qcResult.verdict,
    qc_issues: qcResult.issues.map((i) => ({ issue: i })),
    qc_confidence: qcResult.confidence,
  });

  await log(
    propertyId,
    "qc",
    qcResult.verdict === "pass" ? "info" : "warn",
    `Scene ${scene.scene_number} QC: ${qcResult.verdict} (confidence: ${qcResult.confidence.toFixed(2)})`,
    {
      verdict: qcResult.verdict,
      confidence: qcResult.confidence,
      issues: qcResult.issues,
      motion: qcResult.motion_quality,
      architecture: qcResult.architectural_integrity,
      lighting: qcResult.lighting_consistency,
    },
    sceneId
  );

  if (
    qcResult.verdict === "pass" ||
    (qcResult.verdict === "soft_reject" && qcResult.confidence < confidenceThreshold)
  ) {
    // Pass — or uncertain soft reject that we auto-approve
    await updateSceneStatus(sceneId, "qc_pass");

    // Check if ALL scenes for this property have passed
    const allPassed = await allScenesPassedQC(propertyId);
    if (allPassed) {
      await log(propertyId, "qc", "info", "All scenes passed QC — starting assembly");
      await assemblyQueue.add("assemble", { propertyId });
    }
  } else {
    await handleReject(propertyId, sceneId, scene, qcResult.verdict, qcResult.issues);
  }

  // Clean up temp files
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

async function handleReject(
  propertyId: string,
  sceneId: string,
  scene: Record<string, unknown>,
  verdict: string,
  issues: string[]
): Promise<void> {
  const maxRetries = parseInt(process.env.MAX_RETRIES_PER_CLIP ?? "2", 10);
  const attemptCount = (scene.attempt_count as number) ?? 0;

  if (attemptCount >= maxRetries) {
    await updateSceneStatus(sceneId, "needs_review");
    await updatePropertyStatus(propertyId, "needs_review");
    await log(
      propertyId,
      "qc",
      "error",
      `Scene ${scene.scene_number} needs human review after ${attemptCount} attempts`,
      { issues },
      sceneId
    );
    return;
  }

  if (verdict === "hard_reject") {
    await updateSceneStatus(sceneId, "qc_hard_reject");
  } else {
    // Soft reject: modify the prompt to address issues
    const modifiedPrompt = buildPromptModification(
      scene.prompt as string,
      issues
    );
    await updateScene(sceneId, { prompt: modifiedPrompt });
    await updateSceneStatus(sceneId, "qc_soft_reject");
  }

  // Re-enqueue generation with backoff
  await generationQueue.add(
    `generate-${scene.scene_number}-retry-${attemptCount + 1}`,
    { propertyId, sceneId },
    { delay: 3000 * (attemptCount + 1) }
  );

  await log(
    propertyId,
    "qc",
    "warn",
    `Scene ${scene.scene_number} ${verdict} — retrying (attempt ${attemptCount + 1})`,
    { issues },
    sceneId
  );
}
