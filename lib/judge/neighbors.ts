import { getSupabase } from "../client.js";
import type { NeighborSummary } from "./rubric.js";

// Minimum-viable wrappers over the existing pgvector RPCs. Both RPCs are
// already defined in migrations 007 + 014. We call them with the
// iteration's own embedding to find winners / losers in the same cell.

export async function fetchNeighbors(
  iterationEmbedding: number[],
  opts: { winnerCount?: number; loserCount?: number } = {},
): Promise<{ winners: NeighborSummary[]; losers: NeighborSummary[]; total: number }> {
  const supabase = getSupabase();
  const winnerCount = opts.winnerCount ?? 3;
  const loserCount = opts.loserCount ?? 3;

  const winnerReq = supabase.rpc("match_rated_examples", {
    query_embedding: toPgVectorLiteral(iterationEmbedding),
    min_rating: 4,
    match_count: winnerCount,
  });
  const loserReq = supabase.rpc("match_loser_examples", {
    query_embedding: toPgVectorLiteral(iterationEmbedding),
    max_rating: 2,
    match_count: loserCount,
  });
  const [winnerRes, loserRes] = await Promise.all([winnerReq, loserReq]);

  if (winnerRes.error) throw new Error(`match_rated_examples failed: ${winnerRes.error.message}`);
  if (loserRes.error) throw new Error(`match_loser_examples failed: ${loserRes.error.message}`);

  const winners = (winnerRes.data ?? []).map((r: Record<string, unknown>) => normalize(r));
  const losers = (loserRes.data ?? []).map((r: Record<string, unknown>) => normalize(r));
  return { winners, losers, total: winners.length + losers.length };
}

function normalize(r: Record<string, unknown>): NeighborSummary {
  return {
    prompt: typeof r.prompt === "string" ? r.prompt : "",
    rating: typeof r.rating === "number" ? r.rating : 0,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : null,
    comment: typeof r.comment === "string" ? r.comment : null,
  };
}

function toPgVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
