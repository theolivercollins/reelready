import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { scoreIteration } from "../../../lib/judge/index.js";

// POST /api/admin/judge/score
//   body: { iteration_id: string }
// Scores a single Prompt Lab iteration via the rubric judge and
// returns the result row. Idempotent — calling twice overwrites
// the previous score for that iteration.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  const { iteration_id } = (req.body ?? {}) as { iteration_id?: string };
  if (!iteration_id || typeof iteration_id !== "string") {
    return res.status(400).json({ error: "iteration_id (string) required" });
  }

  try {
    const result = await scoreIteration(iteration_id);
    return res.status(200).json({ score: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
}
