import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../lib/auth.js";
import { getSupabase } from "../../lib/client.js";

// GET /api/admin/sku-affinity
// Returns the current DB-backed affinity rules + the last refresh-log entry.
// The client (Prompt Lab SkuAffinityHint + the System Status page) reads this
// and falls back to the static TS table if the DB is empty or errors.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabase();

  const [{ data: rules, error: rErr }, { data: logs, error: lErr }] = await Promise.all([
    supabase
      .from("sku_motion_affinity")
      .select("camera_movement, prefer, avoid, reason, confidence, evidence, last_refreshed_at")
      .order("camera_movement", { ascending: true }),
    supabase
      .from("sku_motion_affinity_refresh_log")
      .select("id, ran_at, window_days, motions_updated, motions_skipped_low_n, template_regressions")
      .order("ran_at", { ascending: false })
      .limit(5),
  ]);

  if (rErr) return res.status(500).json({ error: rErr.message });
  if (lErr) return res.status(500).json({ error: lErr.message });

  return res.status(200).json({
    rules: rules ?? [],
    recent_runs: logs ?? [],
  });
}
