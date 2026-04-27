import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../lib/auth.js";
import { getSupabase } from "../../lib/db.js";
import { fetchByMls, searchByAddress } from "../../lib/sierra-scrape.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { client_id, address, mls } = req.body ?? {};
  if (!client_id || (!address && !mls)) {
    return res
      .status(400)
      .json({ error: "client_id required, plus one of: address or mls" });
  }

  const supabase = getSupabase();
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("sierra_public_base_url, sierra_region_id")
    .eq("id", client_id)
    .eq("created_by", auth.user.id)
    .single();
  if (clientErr || !client) {
    return res.status(404).json({ error: "Client not found" });
  }

  try {
    const opts = {
      sierraBaseUrl: client.sierra_public_base_url as string,
      regionId: client.sierra_region_id as string,
    };
    const listing = mls
      ? await fetchByMls(mls, opts)
      : await searchByAddress(address, opts);
    return res.json(listing);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Scrape failed";
    return res.status(422).json({ error: message });
  }
}
