import { supabase } from "@/lib/supabase";

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = init?.body ? { "Content-Type": "application/json" } : {};
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return body as T;
}

export interface ScrapedListing {
  mls: string;
  address: string;
  price: string;
  price_raw: number;
  beds: string;
  baths: string;
  sqft: string;
  year_built: string;
  property_type: string;
  photo_url: string;
  description: string;
  detail_url: string;
  source_url: string;
  scraped_at: string;
}

export interface CustomListing {
  id: string;
  client_id: string;
  address: string;
  video_url: string;
  mls: string | null;
  scraped_data: ScrapedListing | null;
  published: boolean;
  url: string | null;
  qr_url: string | null;
  sierra_page_url: string | null;
  created_at: string;
}

export interface CreateListingInput {
  client_id: string;
  address: string;
  video_url: string;
  mls?: string;
  scraped_data: ScrapedListing;
  publish?: boolean;
}

/** Hardcoded mock for MLS C7523121 — 193 Santa Fe St Port Charlotte, FL 33953 */
export const MOCK_SCRAPED_LISTING: ScrapedListing = {
  mls: "C7523121",
  address: "193 Santa Fe St Port Charlotte, FL 33953",
  price: "$352,990",
  price_raw: 352990,
  beds: "4",
  baths: "3",
  sqft: "1827",
  year_built: "2024",
  property_type: "Single Family",
  photo_url: "https://photos.zillowstatic.com/fp/placeholder-house.jpg",
  description:
    "Brand new construction home in Port Charlotte, FL. This 4 bedroom, 3 bathroom home offers 1,827 sq ft of modern living space. Open floor plan, gourmet kitchen, and a spacious master suite. Located in a quiet neighborhood close to beaches, shopping, and dining.",
  detail_url: "/property-search/detail/240/C7523121/",
  source_url: "https://thehelgemoteam.com/property-search/detail/240/C7523121/",
  scraped_at: new Date().toISOString(),
};

export async function scrapeListing(input: {
  client_id: string;
  address: string;
  mls?: string;
}): Promise<ScrapedListing> {
  return authedFetch<ScrapedListing>("/api/listings/scrape", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createListing(input: CreateListingInput): Promise<{
  id: string;
  url: string;
  qr_url: string;
  sierra_page_url: string;
}> {
  const draft = await authedFetch<{ id: string }>("/api/listings", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!input.publish) {
    return {
      id: draft.id,
      url: "",
      qr_url: "",
      sierra_page_url: "",
    };
  }
  // Chain to the publish endpoint when publish=true.
  const result = await authedFetch<{
    ok: boolean;
    listing: { id: string; sierra_page_url: string | null; qr_url: string | null };
    sierra_page_url: string;
    qr_url: string;
  }>(`/api/listings/${encodeURIComponent(draft.id)}/publish`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return {
    id: draft.id,
    url: result.sierra_page_url,
    qr_url: result.qr_url,
    sierra_page_url: result.sierra_page_url,
  };
}

export async function listListings(): Promise<CustomListing[]> {
  return authedFetch<CustomListing[]>("/api/listings");
}
