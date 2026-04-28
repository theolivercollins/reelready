import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../lib/auth.js";
import { getSupabase } from "../../lib/db.js";
import { encryptSecret } from "../../lib/clients-crypto.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase();

  const SELECT_FIELDS =
    "id, name, sierra_public_base_url, sierra_region_id, sierra_admin_url, sierra_site_name, sierra_admin_username, agent_name, agent_team, agent_phone, agent_email, agent_photo_url, agent_schedule_url, brand_color_primary, created_at, updated_at";

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("clients")
      .select(SELECT_FIELDS)
      .eq("created_by", auth.user.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "POST") {
    const b = req.body ?? {};
    const required = [
      "name",
      "sierra_public_base_url",
      "sierra_region_id",
      "sierra_admin_url",
      "sierra_site_name",
      "sierra_admin_username",
      "sierra_admin_password",
      "agent_name",
      "agent_phone",
      "agent_email",
    ];
    for (const k of required) {
      if (!b[k] || typeof b[k] !== "string") {
        return res.status(400).json({ error: `Missing or invalid field: ${k}` });
      }
    }

    const sierra_admin_password_encrypted = encryptSecret(b.sierra_admin_password);

    const { data, error } = await supabase
      .from("clients")
      .insert({
        name: b.name,
        sierra_public_base_url: b.sierra_public_base_url,
        sierra_region_id: b.sierra_region_id,
        sierra_admin_url: b.sierra_admin_url,
        sierra_site_name: b.sierra_site_name,
        sierra_admin_username: b.sierra_admin_username,
        sierra_admin_password_encrypted,
        agent_name: b.agent_name,
        agent_team: b.agent_team || null,
        agent_phone: b.agent_phone,
        agent_email: b.agent_email,
        agent_photo_url: b.agent_photo_url || null,
        agent_schedule_url: b.agent_schedule_url || null,
        brand_color_primary: b.brand_color_primary || "#171717",
        created_by: auth.user.id,
      })
      .select(SELECT_FIELDS)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.status(405).json({ error: "Method not allowed" });
}
