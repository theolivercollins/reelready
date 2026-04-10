import type { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import {
  getScenesForProperty,
  getProperty,
  updatePropertyStatus,
  log,
} from "@reelready/db";
import { getSupabase } from "@reelready/db";
import type { AssemblyJobData } from "../queue/setup.js";
import { assembleVideo } from "../utils/ffmpeg.js";

const TEMP_DIR = process.env.TEMP_DIR || "/tmp/reelready";
const MUSIC_DIR = process.env.MUSIC_DIR || "./music";

export async function processAssembly(
  job: Job<AssemblyJobData>
): Promise<void> {
  const { propertyId } = job.data;
  const supabase = getSupabase();
  const startTime = Date.now();

  await updatePropertyStatus(propertyId, "assembling");
  await log(propertyId, "assembly", "info", "Starting video assembly");

  const property = await getProperty(propertyId);
  const scenes = await getScenesForProperty(propertyId);
  const passedScenes = scenes.filter((s) => s.status === "qc_pass");

  if (passedScenes.length === 0) {
    await updatePropertyStatus(propertyId, "failed");
    await log(propertyId, "assembly", "error", "No scenes passed QC");
    return;
  }

  const workDir = path.join(TEMP_DIR, propertyId, "assembly");
  await fs.mkdir(workDir, { recursive: true });

  // Download all clips to temp directory
  const clips: Array<{ path: string; duration: number }> = [];

  for (const scene of passedScenes) {
    if (!scene.clip_url) continue;

    const clipPath = path.join(workDir, `scene_${scene.scene_number}.mp4`);
    const response = await fetch(scene.clip_url);
    if (!response.ok) {
      await log(
        propertyId,
        "assembly",
        "warn",
        `Failed to download clip for scene ${scene.scene_number}`,
        undefined,
        scene.id
      );
      continue;
    }

    await fs.writeFile(clipPath, Buffer.from(await response.arrayBuffer()));
    clips.push({ path: clipPath, duration: scene.duration_seconds });
  }

  if (clips.length === 0) {
    await updatePropertyStatus(propertyId, "failed");
    await log(propertyId, "assembly", "error", "No clips could be downloaded");
    return;
  }

  // Find a music track (pick first available or use mood-based selection)
  let musicPath: string | null = null;
  try {
    const musicFiles = await fs.readdir(MUSIC_DIR);
    const mp3s = musicFiles.filter((f) => f.endsWith(".mp3") || f.endsWith(".wav"));
    if (mp3s.length > 0) {
      // Simple selection: pick a random track. In production, this would
      // be based on the mood tag from the director output.
      const pick = mp3s[Math.floor(Math.random() * mp3s.length)];
      musicPath = path.join(MUSIC_DIR, pick);
    }
  } catch {
    await log(propertyId, "assembly", "debug", "No music directory found, assembling without audio");
  }

  const transitionDuration = parseFloat(
    process.env.TRANSITION_DURATION ?? "0.4"
  );

  // Format price for overlay
  const priceFormatted = `$${property.price.toLocaleString("en-US")}`;
  const details = `${property.bedrooms} BD | ${property.bathrooms} BA`;

  await log(
    propertyId,
    "assembly",
    "info",
    `Assembling ${clips.length} clips with ${transitionDuration}s transitions`
  );

  // Run FFmpeg assembly
  const { horizontalPath, verticalPath } = await assembleVideo({
    clips,
    outputDir: workDir,
    musicPath,
    transitionDuration,
    overlay: {
      address: property.address,
      price: priceFormatted,
      details,
      agent: property.listing_agent,
      brokerage: property.brokerage,
    },
  });

  // Upload final videos to storage
  const horizontalBuffer = await fs.readFile(horizontalPath);
  const verticalBuffer = await fs.readFile(verticalPath);

  const { error: hErr } = await supabase.storage
    .from("property-videos")
    .upload(`${propertyId}/final/horizontal.mp4`, horizontalBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  const { error: vErr } = await supabase.storage
    .from("property-videos")
    .upload(`${propertyId}/final/vertical.mp4`, verticalBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (hErr || vErr) {
    await updatePropertyStatus(propertyId, "failed");
    await log(propertyId, "assembly", "error", `Upload failed: ${hErr?.message ?? vErr?.message}`);
    return;
  }

  const { data: hUrl } = supabase.storage
    .from("property-videos")
    .getPublicUrl(`${propertyId}/final/horizontal.mp4`);

  const { data: vUrl } = supabase.storage
    .from("property-videos")
    .getPublicUrl(`${propertyId}/final/vertical.mp4`);

  // Use first scene's source photo as thumbnail
  const thumbnail = passedScenes[0]?.clip_url ?? null;

  const processingTimeMs = Date.now() - startTime;
  // Total processing time includes all stages — approximate from property creation
  const totalProcessingMs =
    new Date().getTime() - new Date(property.created_at).getTime();

  await updatePropertyStatus(propertyId, "complete", {
    horizontal_video_url: hUrl.publicUrl,
    vertical_video_url: vUrl.publicUrl,
    thumbnail_url: thumbnail,
    processing_time_ms: totalProcessingMs,
  });

  await log(
    propertyId,
    "assembly",
    "info",
    `Assembly complete! ${clips.length} clips → horizontal + vertical. Total: ${(totalProcessingMs / 1000).toFixed(1)}s`,
    {
      clipCount: clips.length,
      assemblyTimeMs: processingTimeMs,
      totalProcessingMs,
      totalCostCents: property.total_cost_cents,
    }
  );

  await log(propertyId, "delivery", "info", "Videos ready for delivery", {
    horizontalUrl: hUrl.publicUrl,
    verticalUrl: vUrl.publicUrl,
  });

  // Clean up temp files
  await fs.rm(path.join(TEMP_DIR, propertyId), { recursive: true, force: true }).catch(() => {});
}
