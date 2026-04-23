import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../client.js";
import {
  JUDGE_MODEL,
  JUDGE_VERSION,
  cellKeyToString,
  type CellKey,
  type JudgeResult,
} from "./types.js";
import {
  buildRubricSystemPrompt,
  buildRubricUserMessage,
  parseRubricResponse,
} from "./rubric.js";
import { fetchNeighbors } from "./neighbors.js";
import { computeComposite, computeConfidence } from "./confidence.js";

// Public API: score a single iteration end-to-end.
//   1. Loads the iteration row (prompt, analysis, embedding, source image URL)
//   2. Looks up winner + loser neighbors via existing RPCs
//   3. Calls Claude with rubric system + user message + source image as URL
//   4. Parses + composes + persists to lab_judge_scores (upsert on iteration_id)
//
// Idempotent: re-scoring overwrites. Returns the result row.
export async function scoreIteration(iterationId: string): Promise<JudgeResult> {
  const supabase = getSupabase();

  // 1. Load iteration. Source image URL lives on prompt_lab_sessions
  // (see migration 002), so fetch in two steps rather than fighting the
  // Supabase join-type ergonomics.
  const { data: iter, error: iterErr } = await supabase
    .from("prompt_lab_iterations")
    .select(
      "id, analysis_json, director_output_json, embedding, session_id"
    )
    .eq("id", iterationId)
    .single();
  if (iterErr || !iter) throw new Error(`Iteration ${iterationId} not found: ${iterErr?.message ?? "no row"}`);

  const { data: session, error: sessErr } = await supabase
    .from("prompt_lab_sessions")
    .select("image_url")
    .eq("id", iter.session_id)
    .single();
  if (sessErr || !session) throw new Error(`Session ${iter.session_id} not found: ${sessErr?.message ?? "no row"}`);

  const analysis = iter.analysis_json as { room_type?: string; key_features?: string[]; composition?: string | null } | null;
  const director = iter.director_output_json as { camera_movement?: string; prompt?: string } | null;
  if (!analysis || !director?.prompt || !director.camera_movement) {
    throw new Error(`Iteration ${iterationId} missing analysis or director output`);
  }
  const cell: CellKey = {
    room_type: analysis.room_type ?? "other",
    camera_movement: director.camera_movement,
  };

  // 2. Neighbors.
  const embedding = parseEmbedding(iter.embedding);
  const neighbors = embedding
    ? await fetchNeighbors(embedding, { winnerCount: 3, loserCount: 3, sessionId: iter.session_id })
    : { winners: [], losers: [], total: 0 };

  // 3. Claude call.
  const analysisSummary = summarizeAnalysis(analysis);
  const system = buildRubricSystemPrompt();
  const userText = buildRubricUserMessage({
    prompt: director.prompt,
    analysisSummary,
    cellKey: cellKeyToString(cell),
    winnerNeighbors: neighbors.winners,
    loserNeighbors: neighbors.losers,
  });

  const client = new Anthropic();
  const sourceUrl: string | null = typeof session.image_url === "string" ? session.image_url : null;
  // Use `as const` narrowing instead of the SDK namespace type — matches
  // the style in lib/prompt-lab.ts analyzeSingleImage and is SDK-version
  // independent.
  const userContent = sourceUrl
    ? [
        { type: "image" as const, source: { type: "url" as const, url: sourceUrl } },
        { type: "text" as const, text: userText },
      ]
    : [{ type: "text" as const, text: userText }];

  const response = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userContent }],
  });
  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  const rubric = parseRubricResponse(raw);

  const composite = computeComposite(rubric);
  const confidence = computeConfidence(rubric, neighbors.total);

  // Cost: derive from Anthropic usage (tokens). Sonnet 4.6 pricing is
  // $3/MTok in, $15/MTok out (confirmed 2026-04-19). Compute in cents.
  const usage = response.usage;
  const costCents = usage
    ? Math.round(((usage.input_tokens * 3) / 1_000_000) * 100 + ((usage.output_tokens * 15) / 1_000_000) * 100)
    : 0;

  // 4. Persist (upsert on iteration_id).
  const { error: upsertErr } = await supabase
    .from("lab_judge_scores")
    .upsert(
      {
        iteration_id: iterationId,
        rubric,
        composite_1to5: composite,
        confidence,
        clip_similarity: null,
        judge_version: JUDGE_VERSION,
        model_id: JUDGE_MODEL,
        neighbors_used: neighbors.total,
        cost_cents: costCents,
      },
      { onConflict: "iteration_id" },
    );
  if (upsertErr) throw new Error(`Persist judge score failed: ${upsertErr.message}`);

  return {
    iteration_id: iterationId,
    rubric,
    composite_1to5: composite,
    confidence,
    neighbors_used: neighbors.total,
    cost_cents: costCents,
    model_id: JUDGE_MODEL,
    judge_version: JUDGE_VERSION,
  };
}

function summarizeAnalysis(a: { key_features?: string[]; composition?: string | null; room_type?: string }): string {
  const features = a.key_features?.join(" · ") ?? "";
  const parts = [
    a.room_type ? `room: ${a.room_type}` : null,
    features ? `features: ${features}` : null,
    a.composition ? `composition: ${a.composition}` : null,
  ].filter(Boolean) as string[];
  return parts.join(" | ");
}

function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string" && raw.startsWith("[")) {
    try {
      return JSON.parse(raw) as number[];
    } catch {
      return null;
    }
  }
  return null;
}
