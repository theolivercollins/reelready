import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../../lib/auth.js";
import { getSupabase } from "../../../../lib/client.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const id = String(req.query.id ?? "");
  if (!id) return res.status(400).json({ error: "id required" });
  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data: listing } = await supabase.from("prompt_lab_listings").select("*").eq("id", id).maybeSingle();
    if (!listing) return res.status(404).json({ error: "listing not found" });
    const { data: photos } = await supabase.from("prompt_lab_listing_photos").select("*").eq("listing_id", id).order("photo_index");
    const { data: scenes } = await supabase.from("prompt_lab_listing_scenes").select("*").eq("listing_id", id).order("scene_number");
    const sceneIds = (scenes ?? []).map((s) => s.id);
    const { data: iters } = sceneIds.length > 0
      ? await supabase.from("prompt_lab_listing_scene_iterations").select("*").in("scene_id", sceneIds).order("iteration_number")
      : { data: [] };
    return res.status(200).json({ listing, photos: photos ?? [], scenes: scenes ?? [], iterations: iters ?? [] });
  }

  if (req.method === "PATCH") {
    const body = (req.body ?? {}) as { name?: string; notes?: string | null; archived?: boolean };
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (body.notes === null || typeof body.notes === "string") patch.notes = body.notes;
    if (typeof body.archived === "boolean") patch.archived = body.archived;
    const { data, error } = await supabase.from("prompt_lab_listings").update(patch).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ listing: data });
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
