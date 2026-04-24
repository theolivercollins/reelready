import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../lib/auth.js";
import { getSupabase } from "../../lib/client.js";

// POST /api/admin/system-flags
//   body: { name: string, value: boolean, reason?: string }
// Flips an entry in the system_flags kill-switch table. Used by the System
// Status dashboard's toggles (e.g. "Pause judge cron").

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { name, value, reason } = (req.body ?? {}) as { name?: string; value?: boolean; reason?: string };
  if (!name || typeof value !== "boolean") {
    return res.status(400).json({ error: "name (string) and value (boolean) required" });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("system_flags")
    .upsert({
      name,
      value,
      reason: reason ?? null,
      set_by: auth.user.email ?? auth.user.id,
      set_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ flag: data });
}
