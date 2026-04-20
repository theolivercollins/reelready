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

const SYSTEM = `You are reviewing a single rendered video clip from a real-estate listing walkthrough. The user generated it from a static photo using Kling 3.0 Pro or Wan 2.7, guided by a "director prompt" you will be shown. Your job is to help the user understand why this iteration turned out the way it did and to collect specific directives that should influence the NEXT render of this same scene.

When the user expresses a change they want for future renders (slower motion, different camera angle, tighter framing, etc.), call the save_future_instruction tool with a concise imperative that a video prompt writer can act on. Be decisive — if the user says "I want slower motion" just save "Use slower camera motion" without asking for confirmation. You can save multiple instructions in one turn.

Keep replies concise (1-3 sentences). Do not speculate about details you cannot see — you only have the director prompt, scene metadata, rating, and user comment; you do not see the actual pixels.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const iterId = String(req.query.iterId ?? "");
  if (!iterId) return res.status(400).json({ error: "iterId required" });
  const body = (req.body ?? {}) as { message?: string };
  const userMessage = (body.message ?? "").trim();
  if (!userMessage) return res.status(400).json({ error: "message required" });

  const supabase = getSupabase();
  const { data: iter, error: iterErr } = await supabase
    .from("prompt_lab_listing_scene_iterations")
    .select("id, scene_id, director_prompt, model_used, rating, user_comment, clip_url, chat_messages, iteration_number")
    .eq("id", iterId)
    .single();
  if (iterErr || !iter) return res.status(404).json({ error: "iteration not found" });

  const { data: scene } = await supabase
    .from("prompt_lab_listing_scenes")
    .select("id, scene_number, room_type, camera_movement, refinement_notes")
    .eq("id", iter.scene_id)
    .single();
  if (!scene) return res.status(404).json({ error: "scene not found" });

  const prior = (iter.chat_messages as ChatMessage[] | null) ?? [];
  const now = new Date().toISOString();
  const userMsg: ChatMessage = { role: "user", content: userMessage, ts: now };

  const context = [
    `Scene ${scene.scene_number}: ${scene.room_type} / ${scene.camera_movement}`,
    `Model: ${iter.model_used}, iteration #${iter.iteration_number}`,
    `Director prompt: ${iter.director_prompt}`,
    iter.rating !== null ? `User rating: ${iter.rating}/5` : `Not rated yet`,
    iter.user_comment ? `User comment: ${iter.user_comment}` : null,
    scene.refinement_notes ? `Existing future-render instructions: ${scene.refinement_notes}` : null,
  ].filter(Boolean).join("\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM,
    tools: [{
      name: "save_future_instruction",
      description: "Save a concise imperative instruction that should influence the next render of this scene. Use when the user expresses a change they want for future iterations.",
      input_schema: {
        type: "object",
        properties: {
          instruction: { type: "string", description: "A short imperative like 'Use slower camera motion' or 'Keep more empty space in the frame'" },
        },
        required: ["instruction"],
      },
    }],
    messages: [
      { role: "user", content: `Context for this iteration:\n${context}` },
      ...prior.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ],
  });

  const savedInstructions: string[] = [];
  let assistantText = "";
  for (const block of response.content) {
    if (block.type === "text") assistantText += block.text;
    if (block.type === "tool_use" && block.name === "save_future_instruction") {
      const input = block.input as { instruction?: string };
      if (input.instruction) savedInstructions.push(input.instruction.trim());
    }
  }

  if (savedInstructions.length > 0) {
    const existing = scene.refinement_notes?.trim() ?? "";
    const joined = [existing, ...savedInstructions].filter(Boolean).join("\n- ");
    const next = joined ? `- ${joined}` : null;
    await supabase.from("prompt_lab_listing_scenes")
      .update({ refinement_notes: next })
      .eq("id", scene.id);
  }

  if (!assistantText && savedInstructions.length > 0) {
    assistantText = `Saved for future renders: ${savedInstructions.join("; ")}`;
  } else if (!assistantText) {
    assistantText = "(no response)";
  }

  const assistantMsg: ChatMessage = { role: "assistant", content: assistantText, ts: new Date().toISOString() };
  const updated = [...prior, userMsg, assistantMsg];

  await supabase.from("prompt_lab_listing_scene_iterations")
    .update({ chat_messages: updated })
    .eq("id", iterId);

  return res.status(200).json({
    chat_messages: updated,
    saved_instructions: savedInstructions,
  });
}
