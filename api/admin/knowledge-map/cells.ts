import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { listCells } from "../../../lib/knowledge-map/cells.js";

// GET /api/admin/knowledge-map/cells
// Returns all 168 cells with state + sample summary.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  try {
    const cells = await listCells();
    const byState = cells.reduce<Record<string, number>>((acc, c) => {
      acc[c.state] = (acc[c.state] ?? 0) + 1;
      return acc;
    }, {});
    return res.status(200).json({
      cells,
      summary: {
        total_cells: cells.length,
        by_state: byState,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
