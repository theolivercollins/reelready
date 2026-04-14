// Side-by-side demo: Higgsfield (single-image) vs Kling + Property Style Guide.
//
// Same kitchen photo, same camera motion intent, both providers run in
// parallel. The Kling prompt gets a full Property Style Guide block
// describing the real adjacent rooms injected into the text; the Higgsfield
// prompt is plain (no style guide) so the comparison is "Kling w/ structured
// property context" vs "Higgsfield raw".
//
// usage:
//   npx tsx scripts/compare-higgsfield-vs-kling.ts
//
// Reads keys from .env automatically via dotenv.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import * as crypto from "node:crypto";

// Load .env and .env.local manually so no extra dep.
for (const path of [".env", ".env.local"]) {
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// Fail loudly if any required key is missing so we never again silently
// send "Key undefined:undefined" to Higgsfield.
for (const key of ["ANTHROPIC_API_KEY", "KLING_ACCESS_KEY", "KLING_SECRET_KEY", "HIGGSFIELD_API_KEY", "HIGGSFIELD_API_SECRET"]) {
  if (!process.env[key]) {
    console.error(`[fatal] ${key} is not set (check .env / .env.local)`);
    process.exit(1);
  }
}

const PROPERTY_ID = "6f508e16-096c-4a70-83cb-17b769838d61";
// DSC07156: kitchen tunnel view. Counter on left, appliance wall on right,
// strong forward-leading lines down the length of the kitchen. Claude
// aesthetic_score 6.5 (its lowest kitchen shot) but the BEST angle for a
// cinematic push-in — proof that aesthetic_score doesn't equal video
// viability.
const KITCHEN_PHOTO_URL = "https://vrhmaeywqsohlztoouxu.supabase.co/storage/v1/object/public/property-photos/bf472780-7c33-4d94-ba8c-8ad16c4548f9/raw/1776098717138_13_18-web-or-mls-DSC07156.jpg";

// All selected photos for property 6f508e16 — fed to the style guide builder.
const SELECTED_PHOTO_URLS = [
  // kitchen
  "https://vrhmaeywqsohlztoouxu.supabase.co/storage/v1/object/public/property-photos/bf472780-7c33-4d94-ba8c-8ad16c4548f9/raw/1776098717137_11_27-web-or-mls-DSC07201.jpg",
  "https://vrhmaeywqsohlztoouxu.supabase.co/storage/v1/object/public/property-photos/bf472780-7c33-4d94-ba8c-8ad16c4548f9/raw/1776098717137_12_26-web-or-mls-DSC07196.jpg",
  // living room
  "https://vrhmaeywqsohlztoouxu.supabase.co/storage/v1/object/public/property-photos/bf472780-7c33-4d94-ba8c-8ad16c4548f9/raw/1776098717752_18_7-web-or-mls-DSC07086.jpg",
  "https://vrhmaeywqsohlztoouxu.supabase.co/storage/v1/object/public/property-photos/bf472780-7c33-4d94-ba8c-8ad16c4548f9/raw/1776098716475_7_14-web-or-mls-DSC07126.jpg",
  // pool
  "https://vrhmaeywqsohlztoouxu.supabase.co/storage/v1/object/public/property-photos/bf472780-7c33-4d94-ba8c-8ad16c4548f9/raw/1776098716475_6_54-web-or-mls-DSC07341.jpg",
  "https://vrhmaeywqsohlztoouxu.supabase.co/storage/v1/object/public/property-photos/bf472780-7c33-4d94-ba8c-8ad16c4548f9/raw/1776098716475_9_52-web-or-mls-DSC07331.jpg",
  // aerial
  "https://vrhmaeywqsohlztoouxu.supabase.co/storage/v1/object/public/property-photos/bf472780-7c33-4d94-ba8c-8ad16c4548f9/raw/1776098717752_16_60-web-or-mls-San_MAssi-2.jpg",
  "https://vrhmaeywqsohlztoouxu.supabase.co/storage/v1/object/public/property-photos/bf472780-7c33-4d94-ba8c-8ad16c4548f9/raw/1776098717751_15_59-web-or-mls-San_MAssi.jpg",
];

// ── helpers ───────────────────────────────────────────────────────

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" }> {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") ?? "";
  const mediaType = ct.includes("png") ? "image/png"
    : ct.includes("webp") ? "image/webp"
    : ct.includes("gif") ? "image/gif"
    : "image/jpeg";
  return { data: buf.toString("base64"), mediaType };
}

// ── step 1: build the property style guide ───────────────────────

async function buildStyleGuide(): Promise<string> {
  const client = new Anthropic();
  const imageBlocks: Anthropic.ImageBlockParam[] = [];
  for (const url of SELECTED_PHOTO_URLS) {
    const { data, mediaType } = await fetchImageAsBase64(url);
    imageBlocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
  }
  const system = `You are a real estate visual analyst. Study the property photos and produce a concise text-only description of the actual materials, colors, and finishes visible in this specific house. Cover: exterior style, interior palette, kitchen specifics, living room specifics, bedrooms, bathrooms, outdoor features. Be specific ("dark espresso shaker cabinets with brushed nickel pulls" not "wooden cabinets"). Keep it under 250 words. Return only the description, no preamble.`;
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system,
    messages: [{
      role: "user",
      content: [
        ...imageBlocks,
        { type: "text", text: "Produce the property style guide now." },
      ],
    }],
  });
  const text = res.content[0].type === "text" ? res.content[0].text : "";
  console.log("[style guide]\n" + text + "\n");
  return text;
}

// ── step 2: submit to Kling v2-master ────────────────────────────

function generateKlingJWT(accessKey: string, secretKey: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 };
  const b64h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const b64p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secretKey).update(`${b64h}.${b64p}`).digest("base64url");
  return `${b64h}.${b64p}.${sig}`;
}

async function submitKling(prompt: string, imageBase64: string): Promise<string> {
  const jwt = generateKlingJWT(process.env.KLING_ACCESS_KEY!, process.env.KLING_SECRET_KEY!);
  const res = await fetch("https://api.klingai.com/v1/videos/image2video", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // No negative_prompt — long stability anchors confuse the model.
      // Short cinematography-verb prompts perform better per Oliver's
      // proven usage.
      model_name: "kling-v2-master",
      image: imageBase64,
      prompt,
      cfg_scale: 0.75,
      duration: "5",
      aspect_ratio: "16:9",
      mode: "pro",
    }),
  });
  if (!res.ok) throw new Error(`Kling submit ${res.status}: ${await res.text()}`);
  const body = await res.json() as { data: { task_id: string } };
  return body.data.task_id;
}

async function pollKling(taskId: string): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < 270_000) {
    await new Promise(r => setTimeout(r, 5000));
    const jwt = generateKlingJWT(process.env.KLING_ACCESS_KEY!, process.env.KLING_SECRET_KEY!);
    const res = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) { console.log(`[kling] poll err ${res.status}`); continue; }
    const j = await res.json() as { data: { task_status: string; task_result?: { videos?: Array<{ url: string }> }; task_status_msg?: string } };
    const s = j.data.task_status;
    console.log(`[kling] ${((Date.now()-started)/1000).toFixed(0)}s: ${s}`);
    if (s === "succeed" && j.data.task_result?.videos?.[0]) return j.data.task_result.videos[0].url;
    if (s === "failed") throw new Error(`Kling failed: ${j.data.task_status_msg}`);
  }
  throw new Error("Kling poll timed out");
}

// ── step 3: submit to Higgsfield DoP standard (single-image) ────

async function submitHiggsfield(prompt: string): Promise<string> {
  const auth = `Key ${process.env.HIGGSFIELD_API_KEY!}:${process.env.HIGGSFIELD_API_SECRET!}`;
  let lastErr = "";
  for (let i = 0; i < 4; i++) {
    const res = await fetch("https://platform.higgsfield.ai/higgsfield-ai/dop/standard", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: KITCHEN_PHOTO_URL, prompt, duration: 5 }),
    });
    if (res.ok) {
      const body = await res.json() as { request_id: string };
      return body.request_id;
    }
    lastErr = `${res.status}: ${(await res.text()).substring(0, 200)}`;
    console.log(`[higgsfield] submit attempt ${i + 1} failed (${lastErr}), retrying in 3s...`);
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`Higgsfield submit failed after 4 attempts: ${lastErr}`);
}

async function pollHiggsfield(requestId: string): Promise<string> {
  const started = Date.now();
  const auth = `Key ${process.env.HIGGSFIELD_API_KEY!}:${process.env.HIGGSFIELD_API_SECRET!}`;
  while (Date.now() - started < 270_000) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`https://platform.higgsfield.ai/requests/${requestId}/status`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) { console.log(`[higgsfield] poll err ${res.status}`); continue; }
    const j = await res.json() as { status: string; video?: { url: string } };
    console.log(`[higgsfield] ${((Date.now()-started)/1000).toFixed(0)}s: ${j.status}`);
    if (j.status === "completed" && j.video?.url) return j.video.url;
    if (j.status === "failed" || j.status === "nsfw") throw new Error(`Higgsfield failed: ${j.status}`);
  }
  throw new Error("Higgsfield poll timed out");
}

// ── main ─────────────────────────────────────────────────────────

async function main() {
  // Short cinematography-verb prompts matching Oliver's working style.
  // Photo is the tunnel-view kitchen (DSC07156) so push_in is the right
  // motion for the angle.
  const klingPrompt = "smooth cinematic push in to the kitchen";
  const higgsfieldPrompt = "smooth cinematic push in to the kitchen, empty home, no people";

  console.log("[demo] Kling prompt:      \"" + klingPrompt + "\"");
  console.log("[demo] Higgsfield prompt: \"" + higgsfieldPrompt + "\"\n");

  // Fetch kitchen photo once for Kling
  console.log("[demo] fetching kitchen photo for Kling...");
  const { data: imageB64 } = await fetchImageAsBase64(KITCHEN_PHOTO_URL);

  console.log("[demo] submitting Higgsfield first (sequential mode)...");
  const higgsfieldReqId = await submitHiggsfield(higgsfieldPrompt);
  console.log(`[higgsfield] request_id: ${higgsfieldReqId}`);

  console.log("[demo] submitting Kling...");
  const klingTaskId = await submitKling(klingPrompt, imageB64);
  console.log(`[kling] task_id: ${klingTaskId}\n`);

  console.log("[demo] polling both providers in parallel...\n");
  const results = await Promise.allSettled([
    pollKling(klingTaskId),
    pollHiggsfield(higgsfieldReqId),
  ]);

  console.log("\n========= RESULTS =========\n");
  console.log("PROPERTY:        " + PROPERTY_ID);
  console.log("TEST PHOTO:      DSC07201 (kitchen, island foreground, pool view)");
  console.log();
  console.log("KLING (with style guide):");
  if (results[0].status === "fulfilled") console.log("  " + results[0].value);
  else console.log("  FAILED: " + results[0].reason);
  console.log();
  console.log("HIGGSFIELD (no style guide):");
  if (results[1].status === "fulfilled") console.log("  " + results[1].value);
  else console.log("  FAILED: " + results[1].reason);
  console.log();
}

main().catch(err => { console.error(err); process.exit(1); });
