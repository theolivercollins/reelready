import type { VercelRequest, VercelResponse } from "@vercel/node";

export const maxDuration = 120;

import { getSupabase } from "../../lib/client.js";
import { finalizeLabRender } from "../../lib/prompt-lab.js";

// Runs every minute per vercel.json crons.
// Picks up Lab iterations with provider_task_id set + clip_url null,
// polls the provider, and finalizes (download + upload + store URL).

interface PendingRow {
  id: string;
  session_id: string;
  provider: string | null;
  provider_task_id: string;
  cost_cents: number | null;
  render_submitted_at: string | null;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("prompt_lab_iterations")
    .select("id, session_id, provider, provider_task_id, cost_cents, render_submitted_at")
    .not("provider_task_id", "is", null)
    .is("clip_url", null)
    .is("render_error", null)
    .limit(20);
  if (error) return res.status(500).json({ error: error.message });

  const rows = (data ?? []) as PendingRow[];
  const results: Array<{ id: string; status: string; err?: string }> = [];

  for (const row of rows) {
    if (!row.provider || (row.provider !== "kling" && row.provider !== "runway")) {
      results.push({ id: row.id, status: "skip: unknown provider" });
      continue;
    }
    // Bail on long-abandoned renders (>30 min without completion)
    if (row.render_submitted_at) {
      const age = Date.now() - new Date(row.render_submitted_at).getTime();
      if (age > 30 * 60 * 1000) {
        await supabase
          .from("prompt_lab_iterations")
          .update({ render_error: "render timed out after 30 minutes" })
          .eq("id", row.id);
        results.push({ id: row.id, status: "timed out" });
        continue;
      }
    }

    try {
      const outcome = await finalizeLabRender({
        iterationId: row.id,
        sessionId: row.session_id,
        provider: row.provider,
        providerTaskId: row.provider_task_id,
      });
      if (!outcome.done) {
        results.push({ id: row.id, status: "still processing" });
        continue;
      }
      if (outcome.error) {
        await supabase
          .from("prompt_lab_iterations")
          .update({ render_error: outcome.error })
          .eq("id", row.id);
        results.push({ id: row.id, status: "failed", err: outcome.error });
        continue;
      }
      await supabase
        .from("prompt_lab_iterations")
        .update({
          clip_url: outcome.clipUrl,
          cost_cents: Math.round((row.cost_cents ?? 0) + (outcome.costCents ?? 0)),
        })
        .eq("id", row.id);
      results.push({ id: row.id, status: "complete" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: row.id, status: "error", err: msg });
    }
  }

  return res.status(200).json({ processed: rows.length, results });
}
