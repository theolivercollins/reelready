import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../../../../../lib/auth.js";
import { getSupabase } from "../../../../../../../lib/client.js";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: string;
  pinned?: boolean;
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
  const body = (req.body ?? {}) as {
    instruction?: string;
    refinement_notes?: string | null;
    iteration_id?: string;
    message_index?: number;
  };
  const supabase = getSupabase();

  if ("refinement_notes" in body) {
    const next = body.refinement_notes ?? null;
    const { data, error } = await supabase.from("prompt_lab_listing_scenes")
      .update({ refinement_notes: next })
      .eq("id", sceneId)
      .select("id, refinement_notes")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ scene: data });
  }

  const instruction = (body.instruction ?? "").trim();
  if (!instruction) return res.status(400).json({ error: "instruction required" });

  const { data: scene, error: readErr } = await supabase
    .from("prompt_lab_listing_scenes")
    .select("refinement_notes")
    .eq("id", sceneId)
    .single();
  if (readErr || !scene) return res.status(404).json({ error: "scene not found" });

  const existing = scene.refinement_notes?.trim() ?? "";
  const next = existing ? `${existing}\n- ${instruction}` : `- ${instruction}`;

  const { data, error } = await supabase.from("prompt_lab_listing_scenes")
    .update({ refinement_notes: next })
    .eq("id", sceneId)
    .select("id, refinement_notes")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  if (body.iteration_id && typeof body.message_index === "number") {
    const { data: iter } = await supabase
      .from("prompt_lab_listing_scene_iterations")
      .select("chat_messages")
      .eq("id", body.iteration_id)
      .single();
    if (iter) {
      const messages = (iter.chat_messages as ChatMessage[] | null) ?? [];
      if (messages[body.message_index]) {
        messages[body.message_index] = { ...messages[body.message_index], pinned: true };
        await supabase.from("prompt_lab_listing_scene_iterations")
          .update({ chat_messages: messages })
          .eq("id", body.iteration_id);
      }
    }
  }

  return res.status(200).json({ scene: data });
}
