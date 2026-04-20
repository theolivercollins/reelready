import sharp from "sharp";
import { getSupabase } from "../client.js";

export interface EndFrameInputs {
  startPhotoUrl: string;
  endPhotoUrl?: string | null;
}

// Resolves the URL to hand to Atlas as the end keyframe:
//   1. If the director paired a real end photo, use that.
//   2. Otherwise, synthesize a destination frame by cropping the center
//      75% of the start photo, resizing back to original dimensions,
//      uploading to Supabase Storage under a deterministic path.
//      Atlas Kling/Wan interpolates between the two — the result is a
//      gentle push-in. Not as clean as a real pair, but dramatically
//      better than no end frame.
// Test seam via __setCropFnForTests lets unit tests bypass the real
// sharp + Storage call path.
export async function resolveEndFrameUrl(input: EndFrameInputs): Promise<string> {
  if (!input.startPhotoUrl) {
    throw new Error("resolveEndFrameUrl: startPhotoUrl is required");
  }
  if (input.endPhotoUrl) {
    return input.endPhotoUrl;
  }
  const cropFn = cropOverride ?? generateCenterCropEndFrame;
  return cropFn(input.startPhotoUrl);
}

async function generateCenterCropEndFrame(startPhotoUrl: string): Promise<string> {
  const res = await fetch(startPhotoUrl);
  if (!res.ok) throw new Error(`Fetch start photo failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const image = sharp(buffer);
  const meta = await image.metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 576;
  const cropW = Math.round(w * 0.75);
  const cropH = Math.round(h * 0.75);
  const left = Math.round((w - cropW) / 2);
  const top = Math.round((h - cropH) / 2);
  const cropped = await image
    .extract({ left, top, width: cropW, height: cropH })
    .resize(w, h, { fit: "cover" })
    .jpeg({ quality: 90 })
    .toBuffer();

  const hash = simpleHash(startPhotoUrl);
  const path = `end-frames/${hash}.jpg`;
  const supabase = getSupabase();
  const { error: uploadErr } = await supabase.storage
    .from("property-photos")
    .upload(path, cropped, { contentType: "image/jpeg", upsert: true });
  if (uploadErr) throw new Error(`Upload crop end-frame failed: ${uploadErr.message}`);

  const { data: publicUrlData } = supabase.storage
    .from("property-photos")
    .getPublicUrl(path);
  return publicUrlData.publicUrl;
}

// FNV-1a 32-bit. Good enough for deterministic filenames; not crypto.
function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Test seam.
let cropOverride: ((url: string) => Promise<string>) | null = null;
export function __setCropFnForTests(fn: ((url: string) => Promise<string>) | null): void {
  cropOverride = fn;
}
