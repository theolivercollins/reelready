// Scrape a Sierra Interactive public site for listing data.
// Two flows:
//   - searchByAddress: hit the public search, return the top result's MLS#.
//   - fetchByMls: hit /property-search/detail/<region>/<MLS>/, return parsed listing.
// Output shape mirrors what the future Sierra REST API integration will return.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export interface ScrapedListing {
  mls: string;
  address: string;
  price: string;          // formatted: "$352,990"
  price_raw: number;
  beds: string;
  baths: string;
  sqft: string;
  year_built: string;
  property_type: string;
  photo_url: string;
  description: string;
  detail_url: string;     // path on the Sierra site, e.g. /property-search/detail/240/C7523121/
  source_url: string;     // full URL we scraped
  scraped_at: string;
}

export async function fetchByMls(
  mls: string,
  opts: { sierraBaseUrl: string; regionId: string }
): Promise<ScrapedListing> {
  const url = `${opts.sierraBaseUrl.replace(/\/$/, "")}/property-search/detail/${opts.regionId}/${mls}/`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();
  return parseListingHtml(html, { mls, regionId: opts.regionId, sourceUrl: url });
}

export async function searchByAddress(
  address: string,
  opts: { sierraBaseUrl: string; regionId: string }
): Promise<ScrapedListing> {
  const base = opts.sierraBaseUrl.replace(/\/$/, "");
  // Sierra public search supports ?keyword=
  const searchUrl = `${base}/results-gallery/?keyword=${encodeURIComponent(address)}`;
  const res = await fetch(searchUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching search ${searchUrl}`);
  const html = await res.text();

  // First listing card link looks like: /property-search/detail/<region>/<MLS>/<slug>/
  const mlsMatch = html.match(
    new RegExp(
      `/property-search/detail/${opts.regionId}/([A-Z0-9]+)/`,
      "i"
    )
  );
  if (!mlsMatch) {
    throw new Error(
      `No matching listing found for address "${address}" on ${base}`
    );
  }
  const mls = mlsMatch[1];
  return fetchByMls(mls, opts);
}

function parseListingHtml(
  html: string,
  ctx: { mls: string; regionId: string; sourceUrl: string }
): ScrapedListing {
  const ldMatch = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
  );
  if (!ldMatch) {
    throw new Error("No JSON-LD block in Sierra listing page — page structure changed?");
  }
  const ld = JSON.parse(ldMatch[1]);

  const stats: Record<string, string> = {};
  const statRegex =
    /<span class="text-sm font-semibold">([^<]+)<\/span>\s*<span class="text-xs text-gray-700">([^<]+)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = statRegex.exec(html)) !== null) {
    stats[m[2].trim()] = m[1].trim();
  }

  const descMatch = html.match(/<div id="description"[^>]*>([\s\S]*?)<\/div>/);
  const description = descMatch
    ? descMatch[1].replace(/\s+/g, " ").trim()
    : ld.description || "";

  const priceRaw = Number(ld.offers?.price || 0);

  return {
    mls: ctx.mls,
    address: ld.name || "",
    price: priceRaw ? "$" + priceRaw.toLocaleString("en-US") : "",
    price_raw: priceRaw,
    beds: stats["Beds"] || "",
    baths: stats["Baths"] || "",
    sqft: stats["Sq. Ft."] || "",
    year_built: stats["Year Built"] || "",
    property_type: stats["Property Type"] || "",
    photo_url: ld.image || "",
    description,
    detail_url: `/property-search/detail/${ctx.regionId}/${ctx.mls}/`,
    source_url: ctx.sourceUrl,
    scraped_at: new Date().toISOString(),
  };
}

export function slugifyAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
