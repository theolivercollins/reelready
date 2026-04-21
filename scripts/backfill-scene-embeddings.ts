// One-shot backfill — compute embeddings for all production scenes that
// don't have one yet. Run: npx tsx scripts/backfill-scene-embeddings.ts
// Pass --force to re-embed scenes that already have an embedding.
// Needs OPENAI_API_KEY + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
//
// M.2: scope widened from "rated scenes only" to ALL prod scenes without an
// embedding. Unrated scenes may receive ratings later and need to be
// retrieval-eligible via match_rated_examples when that happens.

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

  // M.2: fetch ALL prod scenes (not just rated ones) to ensure retrieval
  // eligibility once ratings are added.
  const { data: allScenes, error } = await supabase
    .from("scenes")
    .select("id, embedding");
  if (error) throw error;

  const totalScenes = (allScenes ?? []).length;
  let targetIds: string[];
  if (force) {
    targetIds = (allScenes ?? []).map((s: { id: string }) => s.id);
  } else {
    targetIds = (allScenes ?? [])
      .filter((s: { id: string; embedding: unknown }) => !s.embedding)
      .map((s: { id: string }) => s.id);
  }

  console.log(
    `Total scenes: ${totalScenes}. Backfilling ${targetIds.length} (force=${force}).`,
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
