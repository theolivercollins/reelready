import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "../../../../../../../lib/auth.js";
import { getSupabase } from "../../../../../../../lib/client.js";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: string;
  pinned?: boolean;
}

const SYSTEM = `You are a creative partner helping the user iterate on a single real-estate video scene. You see the complete scene state: the director prompt that scenes render from, any accumulated refinement notes, and every iteration with its model, prompt variation, rating, rating reasons, and user comments.

The user can ask about the scene globally ("what should I change?") or about a specific iteration ("why did #3 shake more than #1?", "apply what worked in #2 to the next render"). Reference iterations by their number (#1, #2...).

You have TWO tools — use them proactively:

1. save_future_instruction(instruction) — append a concise directive to the scene's refinement notes. Applied alongside the director prompt on the NEXT render.

2. update_director_prompt(new_prompt) — rewrite the scene's director prompt entirely. Use when the user wants a structural change, or when refinement notes have grown messy and should be folded cleanly into a single new prompt. Preserve the "LOCKED-OFF CAMERA..." stability preamble if present. Write the new prompt as a single paragraph of concrete visual language.

Be decisive. Don't ask for confirmation on small tweaks. You can call multiple tools in one turn. After tool calls, add a brief 1-2 sentence confirmation.

Keep replies tight. The user can watch the videos themselves — focus on translating their intent into concrete changes, and on connecting patterns across iterations (e.g., "iterations #1 and #4 both rated 4+ used slow push-in verbs; #2 and #3 with orbit were rated ≤2").`;

function sse(res: VercelResponse, payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const sceneId = String(req.query.sceneId ?? "");
  if (!sceneId) return res.status(400).json({ error: "sceneId required" });
  const body = (req.body ?? {}) as { message?: string };
  const userMessage = (body.message ?? "").trim();
  if (!userMessage) return res.status(400).json({ error: "message required" });

  const supabase = getSupabase();
  const { data: scene, error: sceneErr } = await supabase
    .from("prompt_lab_listing_scenes")
    .select("id, scene_number, room_type, camera_movement, director_prompt, refinement_notes, chat_messages")
    .eq("id", sceneId)
    .single();
  if (sceneErr || !scene) return res.status(404).json({ error: "scene not found" });

  const { data: iterations } = await supabase
    .from("prompt_lab_listing_scene_iterations")
    .select("id, iteration_number, model_used, director_prompt, status, rating, rating_reasons, user_comment, archived")
    .eq("scene_id", sceneId)
    .order("iteration_number");

  const prior = (scene.chat_messages as ChatMessage[] | null) ?? [];
  const now = new Date().toISOString();
  const userMsg: ChatMessage = { role: "user", content: userMessage, ts: now };

  const itersText = (iterations ?? []).length === 0
    ? "No iterations rendered yet — user is shaping intent for the first render."
    : (iterations ?? []).map((i) => {
        const parts = [
          `#${i.iteration_number} · ${i.model_used} · ${i.status}${i.archived ? " · archived" : ""}${i.rating !== null ? ` · ${i.rating}★` : " · unrated"}`,
          `  prompt: ${i.director_prompt}`,
        ];
        if (i.rating_reasons && i.rating_reasons.length > 0) parts.push(`  reasons: ${i.rating_reasons.join(", ")}`);
        if (i.user_comment) parts.push(`  comment: ${i.user_comment}`);
        return parts.join("\n");
      }).join("\n\n");

  const context = [
    `Scene ${scene.scene_number}: ${scene.room_type} / ${scene.camera_movement}`,
    `Director prompt (applied to every NEW iteration unless rewritten):`,
    scene.director_prompt,
    "",
    scene.refinement_notes ? `Refinement notes (concatenated onto prompt at render time):\n${scene.refinement_notes}` : "No refinement notes yet.",
    "",
    `Iterations (${(iterations ?? []).length}):`,
    itersText,
  ].join("\n");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const client = new Anthropic();
  let assistantText = "";
  const savedInstructions: string[] = [];

  try {
    const stream = client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM,
      tools: [
        {
          name: "save_future_instruction",
          description: "Append a concise directive to the scene's refinement notes. Applied alongside the director prompt on the next render.",
          input_schema: {
            type: "object",
            properties: {
              instruction: { type: "string", description: "A short imperative like 'Use slower camera motion' or 'Emphasize the marble veining'" },
            },
            required: ["instruction"],
          },
        },
        {
          name: "update_director_prompt",
          description: "Rewrite the scene's director prompt entirely. Preserve the 'LOCKED-OFF CAMERA...' stability preamble if present.",
          input_schema: {
            type: "object",
            properties: {
              new_prompt: { type: "string", description: "The complete new director prompt as a single paragraph." },
            },
            required: ["new_prompt"],
          },
        },
      ],
      messages: [
        { role: "user", content: `Current scene state:\n${context}` },
        ...prior.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ],
    });

    stream.on("text", (delta) => {
      assistantText += delta;
      sse(res, { type: "text", delta });
    });

    const final = await stream.finalMessage();
    let promptUpdated: string | null = null;
    for (const block of final.content) {
      if (block.type === "tool_use" && block.name === "save_future_instruction") {
        const input = block.input as { instruction?: string };
        if (input.instruction) {
          savedInstructions.push(input.instruction.trim());
          sse(res, { type: "saved_instruction", instruction: input.instruction.trim() });
        }
      }
      if (block.type === "tool_use" && block.name === "update_director_prompt") {
        const input = block.input as { new_prompt?: string };
        if (input.new_prompt) promptUpdated = input.new_prompt.trim();
      }
    }

    if (savedInstructions.length > 0) {
      const existing = scene.refinement_notes?.trim() ?? "";
      const joined = [existing, ...savedInstructions.map((s) => `- ${s}`)].filter(Boolean).join("\n");
      await supabase.from("prompt_lab_listing_scenes")
        .update({ refinement_notes: joined || null })
        .eq("id", sceneId);
    }

    if (promptUpdated) {
      await supabase.from("prompt_lab_listing_scenes")
        .update({ director_prompt: promptUpdated })
        .eq("id", sceneId);
      sse(res, { type: "prompt_updated", new_prompt: promptUpdated });
    }

    if (!assistantText) {
      const parts: string[] = [];
      if (promptUpdated) parts.push("Director prompt rewritten");
      if (savedInstructions.length > 0) parts.push(`saved: ${savedInstructions.join("; ")}`);
      assistantText = parts.length > 0 ? parts.join(". ") : "(no response)";
      sse(res, { type: "text", delta: assistantText });
    }

    const assistantMsg: ChatMessage = { role: "assistant", content: assistantText, ts: new Date().toISOString() };
    const updated = [...prior, userMsg, assistantMsg];

    await supabase.from("prompt_lab_listing_scenes")
      .update({ chat_messages: updated })
      .eq("id", sceneId);

    sse(res, { type: "done", chat_messages: updated, saved_instructions: savedInstructions });
    res.end();
  } catch (err) {
    sse(res, { type: "error", message: err instanceof Error ? err.message : String(err) });
    res.end();
  }
}
