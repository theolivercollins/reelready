import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../lib/auth.js";
import { getSupabase } from "../../lib/db.js";
import { encryptSecret } from "../../lib/clients-crypto.js";

const SELECT_FIELDS =
  "id, name, sierra_public_base_url, sierra_region_id, sierra_admin_url, sierra_site_name, sierra_admin_username, agent_name, agent_team, agent_phone, agent_email, agent_photo_url, agent_schedule_url, brand_color_primary, created_at, updated_at";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: "id required" });

  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("clients")
      .select(SELECT_FIELDS)
      .eq("id", id)
      .eq("created_by", auth.user.id)
      .single();
    if (error) return res.status(404).json({ error: "Client not found" });
    return res.json(data);
  }

  if (req.method === "PUT") {
    const b = req.body ?? {};

    // Build the update payload — only include fields the client sent.
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const stringFields = [
      "name",
      "sierra_public_base_url",
      "sierra_region_id",
      "sierra_admin_url",
      "sierra_site_name",
      "sierra_admin_username",
      "agent_name",
      "agent_team",
      "agent_phone",
      "agent_email",
      "agent_photo_url",
      "agent_schedule_url",
      "brand_color_primary",
    ];
    for (const k of stringFields) {
      if (typeof b[k] === "string") update[k] = b[k];
    }
    // Password is special — only re-encrypt when a non-empty new password is provided.
    if (typeof b.sierra_admin_password === "string" && b.sierra_admin_password.length > 0) {
      update.sierra_admin_password_encrypted = encryptSecret(b.sierra_admin_password);
    }

    const { data, error } = await supabase
      .from("clients")
      .update(update)
      .eq("id", id)
      .eq("created_by", auth.user.id)
      .select(SELECT_FIELDS)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Client not found" });
    return res.json(data);
  }

  res.status(405).json({ error: "Method not allowed" });
}
