import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getCostRollup } from "../../../lib/knowledge-map/cost.js";

// GET /api/admin/knowledge-map/cost?days=30
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const days = Math.max(1, Math.min(365, Number(req.query.days ?? 30)));
  try {
    const rollup = await getCostRollup({ sinceDaysBack: days });
    return res.status(200).json({ days, ...rollup });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
