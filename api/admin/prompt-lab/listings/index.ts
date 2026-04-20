import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../../../../lib/auth.js";
import { getSupabase } from "../../../../lib/client.js";
import { createListingWithPhotos, analyzeListingPhotos, directListingScenes } from "../../../../lib/prompt-lab-listings.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;

  if (req.method === "GET") {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("prompt_lab_listings")
      .select("*")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ listings: data ?? [] });
  }

  if (req.method === "POST") {
    const body = (req.body ?? {}) as {
      name?: string;
      model_name?: string;
      notes?: string | null;
      photos?: Array<{ image_url?: string; image_path?: string }>;
    };
    if (!body.photos || body.photos.length === 0) {
      return res.status(400).json({ error: "At least one photo is required" });
    }
    const validated = body.photos
      .filter((p): p is { image_url: string; image_path: string } =>
        typeof p.image_url === "string" && typeof p.image_path === "string"
      )
      .map((p) => ({ imageUrl: p.image_url, imagePath: p.image_path }));
    if (validated.length === 0) {
      return res.status(400).json({ error: "No valid photos (each needs image_url + image_path)" });
    }
    try {
      const listingId = await createListingWithPhotos({
        createdBy: auth.user.id,
        name: body.name || `Listing ${new Date().toISOString().slice(0, 16)}`,
        modelName: body.model_name ?? "kling-v3-pro",
        notes: body.notes ?? null,
        photos: validated,
      });
      analyzeListingPhotos(listingId)
        .then(() => directListingScenes(listingId))
        .catch((err) => {
          console.error("[listing lifecycle]", err);
          return getSupabase()
            .from("prompt_lab_listings")
            .update({ status: "failed" })
            .eq("id", listingId);
        });
      return res.status(201).json({ listing_id: listingId });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
