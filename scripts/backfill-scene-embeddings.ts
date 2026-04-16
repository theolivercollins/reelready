// One-shot backfill — compute embeddings for existing rated production scenes
// that don't have one yet. Run: npx tsx scripts/backfill-scene-embeddings.ts
// Pass --force to re-embed scenes that already have an embedding.
// Needs OPENAI_API_KEY + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
//
// Scope: only scenes with >=1 row in scene_ratings. Unrated scenes are not
// retrieval-eligible via match_rated_examples (min_rating >= 4), so embedding
// them is wasted OpenAI spend.

import * as fs from "fs";
import * as path from "path";

// Minimal .env loader — no dotenv dep needed.
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

import { getSupabase, embedScene } from "../lib/db.js";

async function main() {
  const force = process.argv.includes("--force");
  const supabase = getSupabase();

  const { data: rated, error } = await supabase
    .from("scene_ratings")
    .select("scene_id");
  if (error) throw error;
  const sceneIds = Array.from(
    new Set((rated ?? []).map((r: { scene_id: string }) => r.scene_id)),
  );

  let targetIds: string[];
  if (force) {
    targetIds = sceneIds;
  } else if (sceneIds.length === 0) {
    targetIds = [];
  } else {
    const { data: existing, error: e2 } = await supabase
      .from("scenes")
      .select("id, embedding")
      .in("id", sceneIds);
    if (e2) throw e2;
    targetIds = (existing ?? [])
      .filter((s: { id: string; embedding: unknown }) => !s.embedding)
      .map((s: { id: string }) => s.id);
  }

  console.log(
    `Rated scenes: ${sceneIds.length}. Backfilling ${targetIds.length} (force=${force}).`,
  );

  let done = 0;
  for (const id of targetIds) {
    try {
      await embedScene(id);
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${targetIds.length}`);
    } catch (err) {
      console.error(`  fail ${id}: ${err}`);
    }
  }
  console.log(`Done. Embedded ${done}/${targetIds.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
