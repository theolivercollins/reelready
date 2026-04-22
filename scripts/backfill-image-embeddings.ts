#!/usr/bin/env -S npx tsx

/**
 * backfill-image-embeddings.ts — walk photos + prompt_lab_sessions without
 * image_embedding, call embedImage, persist.
 *
 * Usage:
 *   npx tsx scripts/backfill-image-embeddings.ts                       # dry-run
 *   npx tsx scripts/backfill-image-embeddings.ts --limit 50            # dry-run, 50 rows
 *   npx tsx scripts/backfill-image-embeddings.ts --target photos --write
 *   npx tsx scripts/backfill-image-embeddings.ts --target both --write
 *
 * Refuses --write unless ENABLE_IMAGE_EMBEDDINGS=true.
 * Pre-cooked 2026-04-22 on branch session/p3-s1-implementation-draft.
 * Not run. P3 Session 1 runs it after migration 034 applies.
 */

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

import { getSupabase } from "../lib/client.js";
import { embedImage, isEnabled, IMAGE_EMBEDDING_MODEL } from "../lib/embeddings-image.js";

type Target = "photos" | "sessions" | "both";

function parseArgs(): { target: Target; limit: number; write: boolean } {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? Number(args[limitIdx + 1]) : 10;
  const targetIdx = args.indexOf("--target");
  const target = (targetIdx >= 0 && args[targetIdx + 1] ? args[targetIdx + 1] : "both") as Target;
  if (!["photos", "sessions", "both"].includes(target)) {
    throw new Error(`--target must be photos|sessions|both; got ${target}`);
  }
  return { target, limit, write };
}

async function backfillPhotos(write: boolean, limit: number) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("photos")
    .select("id, image_url")
    .is("image_embedding", null)
    .limit(limit);
  if (error) throw error;
  if (!data || data.length === 0) {
    console.log("photos: nothing to backfill (all rows have image_embedding)");
    return;
  }
  console.log(`photos: ${data.length} candidate rows`);
  if (!write) {
    for (const p of data) console.log(`  would embed photo_id=${p.id} url=${p.image_url}`);
    return;
  }
  for (const p of data) {
    try {
      const emb = await embedImage({
        imageUrl: p.image_url,
        photoId: p.id,
        surface: "backfill",
      });
      const { error: upErr } = await supabase
        .from("photos")
        .update({
          image_embedding: emb.vector,
          image_embedding_model: emb.model,
          image_embedding_at: new Date().toISOString(),
        })
        .eq("id", p.id);
      if (upErr) throw upErr;
      console.log(`  embedded photo_id=${p.id}`);
    } catch (err) {
      console.error(`  FAILED photo_id=${p.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function backfillSessions(write: boolean, limit: number) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("prompt_lab_sessions")
    .select("id, image_url")
    .is("image_embedding", null)
    .not("image_url", "is", null)
    .limit(limit);
  if (error) throw error;
  if (!data || data.length === 0) {
    console.log("sessions: nothing to backfill");
    return;
  }
  console.log(`sessions: ${data.length} candidate rows`);
  if (!write) {
    for (const s of data) console.log(`  would embed session_id=${s.id} url=${s.image_url}`);
    return;
  }
  for (const s of data) {
    try {
      const emb = await embedImage({
        imageUrl: s.image_url,
        sessionId: s.id,
        surface: "backfill",
      });
      const { error: upErr } = await supabase
        .from("prompt_lab_sessions")
        .update({
          image_embedding: emb.vector,
          image_embedding_model: emb.model,
          image_embedding_at: new Date().toISOString(),
        })
        .eq("id", s.id);
      if (upErr) throw upErr;
      console.log(`  embedded session_id=${s.id}`);
    } catch (err) {
      console.error(`  FAILED session_id=${s.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function main() {
  const { target, limit, write } = parseArgs();
  console.log(`Backfill image embeddings — target=${target} limit=${limit} mode=${write ? "WRITE" : "DRY-RUN"}`);
  console.log(`Model: ${IMAGE_EMBEDDING_MODEL}`);

  if (write && !isEnabled()) {
    console.error(
      `REFUSED: --write requires ENABLE_IMAGE_EMBEDDINGS=true. Set it in .env or export and retry.`,
    );
    process.exit(2);
  }

  if (target === "photos" || target === "both") {
    await backfillPhotos(write, limit);
  }
  if (target === "sessions" || target === "both") {
    await backfillSessions(write, limit);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
