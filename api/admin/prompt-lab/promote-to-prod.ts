import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../lib/auth.js";
import { getSupabase } from "../../../lib/client.js";

// GET  /api/admin/prompt-lab/promote-to-prod
//   → list active overrides with readiness + cohort stats.
//
// POST /api/admin/prompt-lab/promote-to-prod
//   body: { override_id, note?, force? }
//   → Writes a new `prompt_revisions` row with the override's body,
//     marks the override as promoted (audit columns), and returns the
//     new revision id. The next production pipeline run will see the
//     changed body via `recordPromptRevisionIfChanged` and start using
//     it automatically (the DIRECTOR_SYSTEM constant in code is the
//     initial value; prompt_revisions is the source of truth for the
//     Learning dashboard changelog).
//
// Readiness: an override is "ready for promotion" when the cohort of
// Lab iterations generated under that override (matched by
// director_prompt_hash = override.body_hash AND created_at >=
// override.created_at) meets: ≥10 rendered clips, avg rating ≥ 4.0,
// and winners (≥4★) at least 2× losers (≤2★). `force: true` bypasses
// the readiness gate.
//
// Production promotion is a one-way commitment: the override stays
// active on the Lab side and now also informs production. If the
// override is later deactivated or replaced, production keeps running
// whatever prompt_revisions row was last recorded until the next
// promotion — there is no automatic rollback.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("lab_prompt_override_readiness")
      .select("*")
      .order("override_created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ overrides: data ?? [] });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { override_id, note, force } = (req.body ?? {}) as {
    override_id?: string;
    note?: string;
    force?: boolean;
  };
  if (!override_id) return res.status(400).json({ error: "override_id required" });

  // Load the override + its readiness stats.
  const { data: override, error: oErr } = await supabase
    .from("lab_prompt_overrides")
    .select()
    .eq("id", override_id)
    .single();
  if (oErr || !override) return res.status(404).json({ error: "override not found" });
  if (!override.is_active) return res.status(400).json({ error: "override is not active" });
  if (override.promoted_to_prod_at) {
    return res.status(409).json({
      error: "override already promoted",
      promoted_at: override.promoted_to_prod_at,
      revision_id: override.promoted_prompt_revision_id,
    });
  }

  const { data: readiness } = await supabase
    .from("lab_prompt_override_readiness")
    .select()
    .eq("override_id", override_id)
    .maybeSingle();

  const stats = readiness
    ? {
        rated_count: readiness.rated_count,
        avg_rating: readiness.avg_rating,
        winners: readiness.winners,
        losers: readiness.losers,
        rendered_count: readiness.rendered_count,
        ready_for_promotion: readiness.ready_for_promotion,
      }
    : null;

  if (!force && (!stats || !stats.ready_for_promotion)) {
    return res.status(400).json({
      error: "override not ready for promotion",
      detail:
        "Need ≥10 rendered clips, avg rating ≥ 4.0, and winners ≥ 2× losers. " +
        "Pass { force: true } to override this gate.",
      stats,
    });
  }

  // Next version number for this prompt_name.
  const { data: latest } = await supabase
    .from("prompt_revisions")
    .select("version")
    .eq("prompt_name", override.prompt_name)
    .order("version", { ascending: false })
    .limit(1);
  const nextVersion = (latest?.[0]?.version ?? 0) + 1;

  const revisionNote = note?.trim() || `Promoted from Lab override ${override.id.slice(0, 8)}`;

  const { data: revision, error: rErr } = await supabase
    .from("prompt_revisions")
    .insert({
      prompt_name: override.prompt_name,
      version: nextVersion,
      body: override.body,
      note: revisionNote,
      body_hash: override.body_hash,
      source: "lab_promotion",
      source_override_id: override.id,
    })
    .select("id, version")
    .single();
  if (rErr) return res.status(500).json({ error: `prompt_revisions insert failed: ${rErr.message}` });

  const { error: updateErr } = await supabase
    .from("lab_prompt_overrides")
    .update({
      promoted_to_prod_at: new Date().toISOString(),
      promoted_to_prod_by: auth.user.id,
      promoted_prompt_revision_id: revision.id,
      promotion_note: revisionNote,
      cohort_stats: stats,
    })
    .eq("id", override.id);
  if (updateErr) {
    return res.status(500).json({
      error: `lab_prompt_overrides audit update failed: ${updateErr.message}`,
      revision_id: revision.id,
    });
  }

  return res.status(200).json({
    ok: true,
    prompt_name: override.prompt_name,
    version: revision.version,
    revision_id: revision.id,
    cohort_stats: stats,
    forced: Boolean(force && (!stats || !stats.ready_for_promotion)),
  });
}
