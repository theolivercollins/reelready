import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../lib/auth.js";
import { getSupabase } from "../../lib/db.js";
import { fetchByMls, searchByAddress, slugifyAddress } from "../../lib/sierra-scrape.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("landing_pages")
      .select(
        "id, client_id, mls, address, slug, video_url, status, sierra_page_url, qr_url, published_at, created_at, updated_at"
      )
      .eq("created_by", auth.user.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "POST") {
    const { client_id, address, video_url, mls } = req.body ?? {};
    if (!client_id || !address || !video_url) {
      return res
        .status(400)
        .json({ error: "client_id, address, and video_url are required" });
    }

    // Confirm client belongs to user.
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, sierra_public_base_url, sierra_region_id")
      .eq("id", client_id)
      .eq("created_by", auth.user.id)
      .single();
    if (clientErr || !client) {
      return res.status(404).json({ error: "Client not found" });
    }

    // Scrape (or re-scrape) at create time so the data is captured even if
    // the upstream Sierra page changes later.
    const opts = {
      sierraBaseUrl: client.sierra_public_base_url as string,
      regionId: client.sierra_region_id as string,
    };
    let listing;
    try {
      listing = mls
        ? await fetchByMls(mls, opts)
        : await searchByAddress(address, opts);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Scrape failed";
      return res.status(422).json({ error: message });
    }

    const slug = slugifyAddress(listing.address);

    const { data, error } = await supabase
      .from("landing_pages")
      .insert({
        client_id: client.id,
        mls: listing.mls,
        address: listing.address,
        slug,
        video_url,
        scraped_data: listing,
        status: "draft",
        created_by: auth.user.id,
      })
      .select(
        "id, client_id, mls, address, slug, video_url, status, sierra_page_url, qr_url, published_at, created_at, updated_at"
      )
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json(data);
  }

  res.status(405).json({ error: "Method not allowed" });
}
