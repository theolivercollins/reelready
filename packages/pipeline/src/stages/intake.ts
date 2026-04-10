import type { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import {
  insertPhotos,
  updatePropertyStatus,
  log,
} from "@reelready/db";
import { getSupabase } from "@reelready/db";
import type { IntakeJobData } from "../queue/setup.js";
import { analysisQueue } from "../queue/setup.js";
import { normalizeImage } from "../utils/image-processing.js";

const TEMP_DIR = process.env.TEMP_DIR || "/tmp/reelready";

export async function processIntake(job: Job<IntakeJobData>): Promise<void> {
  const { propertyId, photoFileUrls } = job.data;

  await updatePropertyStatus(propertyId, "analyzing");
  await log(propertyId, "intake", "info", `Processing ${photoFileUrls.length} photos`);

  const supabase = getSupabase();
  const photosToInsert: Array<{
    property_id: string;
    file_url: string;
    file_name: string;
  }> = [];

  const workDir = path.join(TEMP_DIR, propertyId);
  await fs.mkdir(workDir, { recursive: true });

  for (const fileUrl of photoFileUrls) {
    try {
      // Download from Supabase Storage (photos uploaded by the API route)
      const fileName = path.basename(fileUrl);
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("property-photos")
        .download(`${propertyId}/raw/${fileName}`);

      if (downloadError || !fileData) {
        await log(propertyId, "intake", "warn", `Failed to download ${fileName}: ${downloadError?.message}`);
        continue;
      }

      // Normalize the image
      const rawBuffer = Buffer.from(await fileData.arrayBuffer());
      const normalized = await normalizeImage(
        // Write to temp, normalize, re-upload
        await writeTempFile(workDir, fileName, rawBuffer)
      );

      // Upload normalized version
      const normalizedName = fileName.replace(/\.(heic|HEIC|png|PNG|webp|WEBP)$/i, ".jpg");
      const storagePath = `${propertyId}/normalized/${normalizedName}`;

      const { error: uploadError } = await supabase.storage
        .from("property-photos")
        .upload(storagePath, normalized, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        await log(propertyId, "intake", "warn", `Failed to upload normalized ${normalizedName}: ${uploadError.message}`);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("property-photos")
        .getPublicUrl(storagePath);

      photosToInsert.push({
        property_id: propertyId,
        file_url: urlData.publicUrl,
        file_name: normalizedName,
      });
    } catch (err) {
      await log(propertyId, "intake", "error", `Error processing photo: ${err}`);
    }
  }

  if (photosToInsert.length < 5) {
    await updatePropertyStatus(propertyId, "failed");
    await log(
      propertyId,
      "intake",
      "error",
      `Only ${photosToInsert.length} photos processed successfully. Minimum 5 required.`
    );
    return;
  }

  await insertPhotos(photosToInsert);

  // Update photo count
  await getSupabase()
    .from("properties")
    .update({ photo_count: photosToInsert.length })
    .eq("id", propertyId);

  await log(
    propertyId,
    "intake",
    "info",
    `Intake complete: ${photosToInsert.length} photos normalized and stored`
  );

  // Enqueue analysis
  await analysisQueue.add("analyze", { propertyId });

  // Clean up temp files
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

async function writeTempFile(
  dir: string,
  name: string,
  data: Buffer
): Promise<string> {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, data);
  return filePath;
}
