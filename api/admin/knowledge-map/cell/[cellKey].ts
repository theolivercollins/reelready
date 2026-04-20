import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../../lib/auth.js";
import { getCellDrillDown } from "../../../../lib/knowledge-map/cells.js";

// GET /api/admin/knowledge-map/cell/[cellKey]
// Returns everything the drill-down page needs for one cell.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const cellKey = String(req.query.cellKey ?? "");
  if (!cellKey || !cellKey.includes("-")) {
    return res.status(400).json({ error: "cellKey must be 'room_type-camera_movement'" });
  }

  try {
    const data = await getCellDrillDown(cellKey);
    if (!data) return res.status(404).json({ error: "cell not found" });
    return res.status(200).json({ cell: data });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
