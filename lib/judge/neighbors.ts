import { getSupabase } from "../client.js";
import type { NeighborSummary } from "./rubric.js";

// P3 Session 1 — image-embedding fusion weights (mirrors prompt-lab.ts constants).
// Overridable via IMAGE_EMBEDDING_TEXT_WEIGHT / IMAGE_EMBEDDING_IMAGE_WEIGHT env vars.
const TEXT_WEIGHT = Number(process.env.IMAGE_EMBEDDING_TEXT_WEIGHT ?? 0.4);
const IMAGE_WEIGHT = Number(process.env.IMAGE_EMBEDDING_IMAGE_WEIGHT ?? 0.6);

// Fetch the Gemini image embedding for a prompt_lab_sessions row.
// Returns null on any error — retrieval degrades gracefully to text-only.
async function fetchSessionImageEmbedding(sessionId: string): Promise<number[] | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("prompt_lab_sessions")
      .select("image_embedding")
      .eq("id", sessionId)
      .single();
    if (error || !data?.image_embedding) return null;
    const raw = data.image_embedding as unknown;
    if (Array.isArray(raw)) return raw as number[];
    if (typeof raw === "string" && (raw as string).startsWith("[")) {
      return JSON.parse(raw as string) as number[];
    }
    return null;
  } catch (err) {
    console.error("[judge/neighbors] fetchSessionImageEmbedding failed, text-only fallback:", err);
    return null;
  }
}

// Minimum-viable wrappers over the existing pgvector RPCs. Both RPCs are
// already defined in migrations 007 + 014. We call them with the
// iteration's own embedding to find winners / losers in the same cell.
// P3 Session 1: pass optional query_image_embedding for fused ranking when
// sessionId is available.

export async function fetchNeighbors(
  iterationEmbedding: number[],
  opts: { winnerCount?: number; loserCount?: number; sessionId?: string } = {},
): Promise<{ winners: NeighborSummary[]; losers: NeighborSummary[]; total: number }> {
  const supabase = getSupabase();
  const winnerCount = opts.winnerCount ?? 3;
  const loserCount = opts.loserCount ?? 3;

  const imageEmbedding = opts.sessionId ? await fetchSessionImageEmbedding(opts.sessionId) : null;
  const imageParams = imageEmbedding ? {
    query_image_embedding: toPgVectorLiteral(imageEmbedding),
    text_weight: TEXT_WEIGHT,
    image_weight: IMAGE_WEIGHT,
  } : {};

  const winnerReq = supabase.rpc("match_rated_examples", {
    query_embedding: toPgVectorLiteral(iterationEmbedding),
    min_rating: 4,
    match_count: winnerCount,
    ...imageParams,
  });
  const loserReq = supabase.rpc("match_loser_examples", {
    query_embedding: toPgVectorLiteral(iterationEmbedding),
    max_rating: 2,
    match_count: loserCount,
    ...imageParams,
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
