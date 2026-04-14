// One-shot backfill — compute embeddings for existing Lab iterations that
// don't have one yet. Run: npx tsx scripts/backfill-lab-embeddings.ts
// Needs OPENAI_API_KEY in .env.

import * as fs from "fs";
import * as path from "path";

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

import { getSupabase } from "../lib/client.js";
import { embedText, buildAnalysisText, toPgVector } from "../lib/embeddings.js";

async function main() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("prompt_lab_iterations")
    .select("id, analysis_json, director_output_json, embedding")
    .is("embedding", null);
  if (error) throw error;
  const rows = data ?? [];
  console.log(`${rows.length} iteration(s) missing embeddings.`);

  let ok = 0;
  for (const r of rows) {
    const a = r.analysis_json as Record<string, unknown> | null;
    const d = r.director_output_json as Record<string, unknown> | null;
    if (!a) {
      console.log(`skip ${r.id}: no analysis_json`);
      continue;
    }
    const text = buildAnalysisText({
      roomType: String(a.room_type ?? "other"),
      keyFeatures: Array.isArray(a.key_features) ? (a.key_features as string[]) : [],
      composition: typeof a.composition === "string" ? a.composition : null,
      suggestedMotion: typeof a.suggested_motion === "string" ? a.suggested_motion : null,
      cameraMovement: d && typeof d.camera_movement === "string" ? d.camera_movement : null,
    });
    try {
      const { vector, model } = await embedText(text);
      const { error: updErr } = await supabase
        .from("prompt_lab_iterations")
        .update({ embedding: toPgVector(vector), embedding_model: model })
        .eq("id", r.id);
      if (updErr) throw updErr;
      ok++;
      process.stdout.write(".");
    } catch (err) {
      console.error(`\nfailed ${r.id}:`, err);
    }
  }
  console.log(`\nBackfilled ${ok}/${rows.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
