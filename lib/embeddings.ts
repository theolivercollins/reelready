// Voyage AI embeddings. voyage-3 returns 1024-dim vectors.
// Anthropic's recommended embedding partner — keeps the stack Anthropic-aligned.

const MODEL = "voyage-3";

export async function embedText(text: string): Promise<{ vector: number[]; model: string }> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY not set");

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: MODEL, input: text, input_type: "document" }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Voyage embeddings ${response.status}: ${body || response.statusText}`);
  }
  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  const vector = data.data?.[0]?.embedding;
  if (!vector) throw new Error("Voyage embeddings returned no vector");
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

// Try to embed, never throw. Returns null if VOYAGE_API_KEY is missing or
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

// For query-side embedding — Voyage distinguishes query vs document input.
export async function embedQuerySafe(
  text: string
): Promise<{ vector: number[]; model: string } | null> {
  try {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) return null;
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, input: text, input_type: "query" }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    const vector = data.data?.[0]?.embedding;
    if (!vector) return null;
    return { vector, model: MODEL };
  } catch {
    return null;
  }
}
