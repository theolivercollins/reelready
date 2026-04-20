// OpenAI text-embedding-3-small. 1536 dim. $0.02/M tokens.

const MODEL = "text-embedding-3-small";

export async function embedText(text: string): Promise<{ vector: number[]; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: MODEL, input: text }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI embeddings ${response.status}: ${body || response.statusText}`);
  }
  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  const vector = data.data?.[0]?.embedding;
  if (!vector) throw new Error("OpenAI embeddings returned no vector");
  return { vector, model: MODEL };
}

// Canonical text representation used for both iterations and recipes.
// Keep this stable so re-embedding produces comparable vectors.
export function buildAnalysisText(input: {
  roomType: string;
  keyFeatures: string[];
  composition?: string | null;
  suggestedMotion?: string | null;
  cameraMovement?: string | null;
}): string {
  const parts = [
    `room: ${input.roomType}`,
    `features: ${input.keyFeatures.join(" · ")}`,
    input.composition ? `composition: ${input.composition}` : null,
    input.suggestedMotion ? `suggested_motion: ${input.suggestedMotion}` : null,
    input.cameraMovement ? `camera_movement: ${input.cameraMovement}` : null,
  ].filter(Boolean);
  return parts.join("\n");
}

// pgvector literal format — pgvector expects "[0.1,0.2,...]" as text.
export function toPgVector(vector: number[]): string {
  return "[" + vector.join(",") + "]";
}

// Inverse of toPgVector. Supabase returns embeddings as pgvector-formatted
// strings when you SELECT them; parse back to number[] for retrieval RPCs.
export function fromPgVector(literal: string | null | undefined): number[] | null {
  if (!literal) return null;
  const trimmed = literal.trim().replace(/^\[|\]$/g, "");
  if (!trimmed) return null;
  const out: number[] = [];
  for (const part of trimmed.split(",")) {
    const n = Number(part);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

// Try to embed, never throw. Returns null if OPENAI_API_KEY is missing or
// the call fails. Lab should degrade gracefully — no key == no retrieval.
export async function embedTextSafe(
  text: string
): Promise<{ vector: number[]; model: string } | null> {
  try {
    return await embedText(text);
  } catch {
    return null;
  }
}
