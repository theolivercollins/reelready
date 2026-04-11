import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../lib/auth.js";
import { getSupabase } from "../../lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("user_profiles")
      .select()
      .eq("user_id", auth.user.id)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "PUT") {
    const { first_name, last_name, phone, email, brokerage, colors, logo_url } = req.body;
    const { data, error } = await supabase
      .from("user_profiles")
      .update({
        first_name,
        last_name,
        phone,
        email,
        brokerage,
        colors,
        logo_url,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", auth.user.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).json({ error: "Method not allowed" });
}
