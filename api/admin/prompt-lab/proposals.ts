import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";

// GET   /api/admin/prompt-lab/proposals              — list, newest first
// PATCH /api/admin/prompt-lab/proposals?id=...&action=(apply|reject)

function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("lab_prompt_proposals")
      .select()
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ proposals: data ?? [] });
  }

  if (req.method === "PATCH") {
    const id = req.query.id as string | undefined;
    const action = req.query.action as string | undefined;
    if (!id || !action) return res.status(400).json({ error: "id and action required" });
    if (!["apply", "reject"].includes(action)) return res.status(400).json({ error: "invalid action" });

    const { data: proposal, error: pErr } = await supabase
      .from("lab_prompt_proposals")
      .select()
      .eq("id", id)
      .single();
    if (pErr || !proposal) return res.status(404).json({ error: "proposal not found" });
    if (proposal.status !== "pending") return res.status(400).json({ error: "proposal already reviewed" });

    if (action === "reject") {
      const { data, error } = await supabase
        .from("lab_prompt_proposals")
        .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: auth.user.id })
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    // apply: deactivate any current active override for this prompt, insert new
    await supabase
      .from("lab_prompt_overrides")
      .update({ is_active: false })
      .eq("prompt_name", proposal.prompt_name)
      .eq("is_active", true);

    const { error: oErr } = await supabase
      .from("lab_prompt_overrides")
      .insert({
        prompt_name: proposal.prompt_name,
        body: proposal.proposed_body,
        body_hash: hash32(proposal.proposed_body),
        created_by: auth.user.id,
        note: `Applied from proposal ${proposal.id}`,
        is_active: true,
      });
    if (oErr) return res.status(500).json({ error: oErr.message });

    const { data, error } = await supabase
      .from("lab_prompt_proposals")
      .update({ status: "applied", reviewed_at: new Date().toISOString(), reviewed_by: auth.user.id })
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
