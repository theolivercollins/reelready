import type { JudgeRubricScore } from "./types.js";

export interface NeighborSummary {
  prompt: string;
  rating: number;
  tags: string[] | null;
  comment: string | null;
}

export interface RubricUserInput {
  prompt: string;
  analysisSummary: string;
  cellKey: string;
  winnerNeighbors: NeighborSummary[];
  loserNeighbors: NeighborSummary[];
}

export function buildRubricSystemPrompt(): string {
  return [
    "You are a professional cinematography judge for real-estate video clips.",
    "You will be shown: a source listing photo, the analysis the photo-analyzer produced, a candidate prompt the director generated, and examples of previously-rated iterations for this cell (room_type × camera_movement).",
    "Your job is to predict how this iteration will land when rendered and rated by the human editor.",
    "",
    "Score four axes on an integer scale of 1 (terrible) to 5 (excellent):",
    "  - prompt_adherence: will the clip actually show what the prompt asks for, given the source image?",
    "  - motion_quality: is the camera movement specified smoothly and cinematically, or is it implausible / jittery / unmotivated?",
    "  - spatial_coherence: does the prompt respect the geometry visible in the source image, or does it risk ghost walls / warped perspective / impossible traversal?",
    "  - aesthetic_intent: does the prompt evoke the kind of composition, lighting, and mood seen in the 5★ neighbors for this cell?",
    "",
    "Also propose zero or more structured failure tags of the form 'fail:<slug>' for any axis you scored ≤ 2. Common slugs:",
    "  fail:ghost-walls, fail:warped-geometry, fail:wrong-motion, fail:prompt-ignored, fail:artifacts,",
    "  fail:color-drift, fail:frozen, fail:over-motion, fail:lost-subject, fail:wrong-season.",
    "Create new slugs with the fail: prefix if needed.",
    "",
    "Respond with a single JSON object and nothing else outside the JSON. Shape:",
    "{",
    '  "prompt_adherence": 1..5,',
    '  "motion_quality": 1..5,',
    '  "spatial_coherence": 1..5,',
    '  "aesthetic_intent": 1..5,',
    '  "rationale": "≤ 400 characters explaining the scores",',
    '  "fail_tag_suggestions": ["fail:..."]',
    "}",
  ].join("\n");
}

export function buildRubricUserMessage(input: RubricUserInput): string {
  const winners = input.winnerNeighbors.length === 0
    ? "(no 5★ neighbors in this cell yet)"
    : input.winnerNeighbors
        .map((n, i) => `  [W${i + 1}] ★${n.rating} — ${n.prompt.slice(0, 220)}${n.tags?.length ? ` | tags: ${n.tags.join(",")}` : ""}${n.comment ? ` | note: ${n.comment.slice(0, 140)}` : ""}`)
        .join("\n");
  const losers = input.loserNeighbors.length === 0
    ? "(no low-rated neighbors recorded)"
    : input.loserNeighbors
        .map((n, i) => `  [L${i + 1}] ★${n.rating} — ${n.prompt.slice(0, 220)}${n.tags?.length ? ` | tags: ${n.tags.join(",")}` : ""}${n.comment ? ` | note: ${n.comment.slice(0, 140)}` : ""}`)
        .join("\n");
  return [
    `CELL: ${input.cellKey}`,
    "",
    "ANALYSIS SUMMARY:",
    input.analysisSummary,
    "",
    "CANDIDATE PROMPT:",
    input.prompt,
    "",
    "WINNER NEIGHBORS (what has worked here before):",
    winners,
    "",
    "LOSER NEIGHBORS (what has failed here before — avoid these patterns):",
    losers,
    "",
    "Score now.",
  ].join("\n");
}

function clamp(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 1;
  if (x < 1) return 1;
  if (x > 5) return 5;
  return Math.round(x);
}

export function parseRubricResponse(raw: string): JudgeRubricScore {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const jsonMatch = body.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Judge response contained no JSON");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Judge response JSON parse failed: ${(err as Error).message}`);
  }
  const required = ["prompt_adherence", "motion_quality", "spatial_coherence", "aesthetic_intent"];
  for (const key of required) {
    if (!(key in parsed)) throw new Error(`Judge response missing field: ${key}`);
  }
  return {
    prompt_adherence: clamp(parsed.prompt_adherence),
    motion_quality: clamp(parsed.motion_quality),
    spatial_coherence: clamp(parsed.spatial_coherence),
    aesthetic_intent: clamp(parsed.aesthetic_intent),
    rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 2000) : "",
    fail_tag_suggestions: Array.isArray(parsed.fail_tag_suggestions)
      ? (parsed.fail_tag_suggestions as unknown[]).filter((t): t is string => typeof t === "string" && t.startsWith("fail:"))
      : [],
  };
}
