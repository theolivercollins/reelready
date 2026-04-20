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

const SYSTEM = `You are helping a user shape a not-yet-rendered video scene for a real-estate listing walkthrough. You will see the scene's room type, camera movement, and director prompt. Your job is to:

1. Answer questions about what the scene WILL look like based on the director prompt
2. Accept directives the user wants applied to the FIRST render (slower motion, different framing, specific subject emphasis)
3. When the user gives a directive, call save_future_instruction with a concise imperative that a prompt writer can act on. Be decisive — don't ask for confirmation.

Keep replies concise (1-3 sentences). The user hasn't seen any output yet, so focus on intent-shaping not critique.`;

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

  const prior = (scene.chat_messages as ChatMessage[] | null) ?? [];
  const now = new Date().toISOString();
  const userMsg: ChatMessage = { role: "user", content: userMessage, ts: now };

  const context = [
    `Scene ${scene.scene_number}: ${scene.room_type} / ${scene.camera_movement}`,
    `Director prompt: ${scene.director_prompt}`,
    scene.refinement_notes ? `Existing instructions for first render: ${scene.refinement_notes}` : null,
    `Status: no iterations rendered yet — user is shaping intent BEFORE the first clip.`,
  ].filter(Boolean).join("\n");

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
      max_tokens: 1024,
      system: SYSTEM,
      tools: [{
        name: "save_future_instruction",
        description: "Save a concise imperative instruction that should shape the first render of this scene.",
        input_schema: {
          type: "object",
          properties: {
            instruction: { type: "string", description: "A short imperative like 'Emphasize the countertop marble veining' or 'Use a tighter 35mm framing'" },
          },
          required: ["instruction"],
        },
      }],
      messages: [
        { role: "user", content: `Context for this scene:\n${context}` },
        ...prior.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ],
    });

    stream.on("text", (delta) => {
      assistantText += delta;
      sse(res, { type: "text", delta });
    });

    const final = await stream.finalMessage();
    for (const block of final.content) {
      if (block.type === "tool_use" && block.name === "save_future_instruction") {
        const input = block.input as { instruction?: string };
        if (input.instruction) {
          savedInstructions.push(input.instruction.trim());
          sse(res, { type: "saved_instruction", instruction: input.instruction.trim() });
        }
      }
    }

    if (savedInstructions.length > 0) {
      const existing = scene.refinement_notes?.trim() ?? "";
      const joined = [existing, ...savedInstructions.map((s) => `- ${s}`)].filter(Boolean).join("\n");
      await supabase.from("prompt_lab_listing_scenes")
        .update({ refinement_notes: joined || null })
        .eq("id", sceneId);
    }

    if (!assistantText && savedInstructions.length > 0) {
      assistantText = `Saved for first render: ${savedInstructions.join("; ")}`;
      sse(res, { type: "text", delta: assistantText });
    } else if (!assistantText) {
      assistantText = "(no response)";
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
