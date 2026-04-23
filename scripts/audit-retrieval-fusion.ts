/**
 * audit-retrieval-fusion.ts — P3 Session 1 before/after audit.
 *
 * Picks 5 recently-rated lab iterations whose sessions have image_embedding
 * populated, runs match_rated_examples twice (text-only vs fused 0.4/0.6),
 * and prints top-5 from each side-by-side.
 *
 * Usage:
 *   npx tsx scripts/audit-retrieval-fusion.ts
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)
 * in the environment or .env.local.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TEXT_WEIGHT = Number(process.env.IMAGE_EMBEDDING_TEXT_WEIGHT ?? 0.4);
const IMAGE_WEIGHT = Number(process.env.IMAGE_EMBEDDING_IMAGE_WEIGHT ?? 0.6);

interface ExemplarRow {
  source: string;
  example_id: string;
  rating: number;
  distance: number;
  prompt: string | null;
}

async function main() {
  // 1. Find 5 recent rated iterations with both embeddings populated.
  const { data: queries, error: qErr } = await supabase.rpc("", {}) as unknown as { data: null; error: null };
  void queries; void qErr; // unused — we fetch directly below

  const { data: iterRows, error: iterErr } = await supabase
    .from("prompt_lab_iterations")
    .select("id, session_id, rating, embedding")
    .not("rating", "is", null)
    .not("embedding", "is", null)
    .order("created_at", { ascending: false });

  if (iterErr || !iterRows?.length) {
    console.error("Failed to fetch iterations:", iterErr?.message);
    process.exit(1);
  }

  // Get session image embeddings in one shot.
  const sessionIds = [...new Set(iterRows.map((r) => r.session_id as string))];
  const { data: sessRows, error: sErr } = await supabase
    .from("prompt_lab_sessions")
    .select("id, image_embedding")
    .in("id", sessionIds);
  if (sErr) { console.error("Session fetch error:", sErr.message); process.exit(1); }

  const sessMap = new Map((sessRows ?? []).map((s) => [s.id as string, s.image_embedding]));

  // Pick first 5 iterations where session has image_embedding.
  const selected = iterRows
    .filter((r) => sessMap.get(r.session_id as string) != null)
    .slice(0, 5);

  if (selected.length === 0) {
    console.error("No suitable iterations found (need rating + embedding + session image_embedding).");
    process.exit(1);
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("RETRIEVAL FUSION AUDIT — match_rated_examples text-only vs fused (0.4/0.6)");
  console.log(`${"=".repeat(80)}\n`);

  let totalUnionSize = 0;
  let totalBothCount = 0;
  let totalFusedOnlyCount = 0;
  let totalTextOnlyCount = 0;

  for (let i = 0; i < selected.length; i++) {
    const iter = selected[i];
    const sessionId = iter.session_id as string;
    const imgEmb = sessMap.get(sessionId);

    // Text-only call.
    const { data: textRows, error: textErr } = await supabase.rpc("match_rated_examples", {
      query_embedding: iter.embedding,
      min_rating: 4,
      match_count: 5,
    });
    if (textErr) { console.warn(`[Q${i + 1}] text-only RPC error:`, textErr.message); continue; }

    // Fused call.
    const { data: fusedRows, error: fusedErr } = await supabase.rpc("match_rated_examples", {
      query_embedding: iter.embedding,
      min_rating: 4,
      match_count: 5,
      query_image_embedding: imgEmb,
      text_weight: TEXT_WEIGHT,
      image_weight: IMAGE_WEIGHT,
    });
    if (fusedErr) { console.warn(`[Q${i + 1}] fused RPC error:`, fusedErr.message); continue; }

    const textList = (textRows ?? []) as ExemplarRow[];
    const fusedList = (fusedRows ?? []) as ExemplarRow[];

    const textIds = new Set(textList.map((r) => r.example_id));
    const fusedIds = new Set(fusedList.map((r) => r.example_id));

    const both = [...textIds].filter((id) => fusedIds.has(id));
    const fusedOnly = [...fusedIds].filter((id) => !textIds.has(id));
    const textOnly = [...textIds].filter((id) => !fusedIds.has(id));

    totalUnionSize += new Set([...textIds, ...fusedIds]).size;
    totalBothCount += both.length;
    totalFusedOnlyCount += fusedOnly.length;
    totalTextOnlyCount += textOnly.length;

    console.log(`--- Query ${i + 1} / iteration ${iter.id.slice(0, 8)}... (rated ${iter.rating as number}★, session ${sessionId.slice(0, 8)}...) ---`);
    console.log(`  Weights: text=${TEXT_WEIGHT}  image=${IMAGE_WEIGHT}`);
    console.log(`  Set overlap: BOTH=${both.length}  FUSED-ONLY=${fusedOnly.length}  TEXT-ONLY=${textOnly.length}\n`);

    // Side-by-side top-5
    const maxLen = Math.max(textList.length, fusedList.length);
    console.log(`  Rank  ${"TEXT-ONLY".padEnd(42)}  FUSED (0.4t/0.6i)`);
    console.log(`  ----  ${"─".repeat(42)}  ${"─".repeat(42)}`);
    for (let j = 0; j < maxLen; j++) {
      const t = textList[j];
      const f = fusedList[j];
      const tStr = t
        ? `[${t.rating}★ ${t.source}] d=${t.distance.toFixed(4)}${fusedOnly.length > 0 && !fusedIds.has(t.example_id) ? " ◄demoted" : ""}`
        : "";
      const fStr = f
        ? `[${f.rating}★ ${f.source}] d=${f.distance.toFixed(4)}${fusedOnly.includes(f.example_id) ? " ★NEW" : ""}`
        : "";
      console.log(`  #${j + 1}    ${tStr.padEnd(42)}  ${fStr}`);
    }
    console.log();

    // Rating distribution
    const textRatings = textList.map((r) => r.rating);
    const fusedRatings = fusedList.map((r) => r.rating);
    const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : "n/a";
    console.log(`  Rating dist text-only:  ${JSON.stringify(textRatings)}  avg=${avg(textRatings)}`);
    console.log(`  Rating dist fused:      ${JSON.stringify(fusedRatings)}  avg=${avg(fusedRatings)}`);
    console.log();
  }

  // Summary
  console.log(`${"=".repeat(80)}`);
  console.log("SUMMARY ACROSS 5 QUERIES");
  console.log(`${"=".repeat(80)}`);
  console.log(`  Total exemplars appearing in BOTH modes:        ${totalBothCount}`);
  console.log(`  Total exemplars ONLY in fused (image-promoted): ${totalFusedOnlyCount}`);
  console.log(`  Total exemplars ONLY in text  (image-demoted):  ${totalTextOnlyCount}`);
  const fusionChangePct = totalUnionSize > 0
    ? Math.round((totalFusedOnlyCount / (totalFusedOnlyCount + totalBothCount + totalTextOnlyCount)) * 100)
    : 0;
  console.log(`  Turnover rate (fused-only / total-unique):       ${fusionChangePct}%`);
  console.log();
  if (totalFusedOnlyCount > 0) {
    console.log("VERDICT: Image fusion IS surfacing different exemplars on these 5 queries.");
  } else {
    console.log("VERDICT: Image fusion is NOT surfacing different exemplars (sets are identical).");
  }
  console.log(`${"=".repeat(80)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
