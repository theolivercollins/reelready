// Resolve the effective production system prompt body at run time.
//
// Previously the pipeline read the literal `DIRECTOR_SYSTEM` compile-
// time constant, which meant a Lab override promoted into
// prompt_revisions was visible in the Learning dashboard changelog
// but did NOT actually influence production output. That broke the
// Lab→prod loop the TODO described as:
//
//   "Promote-to-prod flow — when a Lab override proves itself, there
//   needs to be an explicit 'apply this to production's DIRECTOR_SYSTEM'
//   button. Right now Lab changes stay Lab-only, which is safe but
//   inert for customers."
//
// Resolution rule:
//   1. If there is a `prompt_revisions` row with
//      source = 'lab_promotion' for this prompt_name, use the body
//      from the highest-version row.
//   2. Otherwise fall back to the baseline compile-time body.
//
// Callers should pass the baseline constant as `baselineBody` so a
// deployment that reverts the Lab promotion (sets source_override_id =
// NULL, etc.) degrades cleanly back to the shipped prompt.

import { getSupabase } from "../db.js";

export interface ResolvedPrompt {
  body: string;
  source: "code" | "lab_promotion";
  version: number | null;
  revision_id: string | null;
  source_override_id: string | null;
}

export async function resolveProductionPrompt(
  promptName: string,
  baselineBody: string,
): Promise<ResolvedPrompt> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("prompt_revisions")
      .select("id, version, body, source, source_override_id")
      .eq("prompt_name", promptName)
      .eq("source", "lab_promotion")
      .order("version", { ascending: false })
      .limit(1);
    const row = data?.[0] as
      | { id: string; version: number; body: string; source: string; source_override_id: string | null }
      | undefined;
    if (row?.body) {
      return {
        body: row.body,
        source: "lab_promotion",
        version: row.version,
        revision_id: row.id,
        source_override_id: row.source_override_id,
      };
    }
  } catch {
    // Fall through to code baseline on any DB error.
  }
  return {
    body: baselineBody,
    source: "code",
    version: null,
    revision_id: null,
    source_override_id: null,
  };
}
