// Render the HTML for a custom listing landing page.
// Output: a single HTML string suitable for pasting into a Sierra Content Page Content Area.
// Uses no <script> dependency — pure server-side rendering of all data into the markup
// (since each landing page is its own Sierra Content Page with hardcoded data, not a parameterized template).

import type { ScrapedListing } from "./sierra-scrape.js";

interface RenderInput {
  listing: ScrapedListing;
  videoUrl: string;
  agent: {
    name: string;
    team?: string | null;
    phone: string;
    email: string;
    photoUrl?: string | null;
    scheduleUrl?: string | null;
  };
  brandColor: string;
  sierraBaseUrl: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function phoneDigits(phone: string): string {
  return phone.replace(/[^0-9+]/g, "");
}

export function renderWalkthroughHtml(input: RenderInput): string {
  const { listing, videoUrl, agent, brandColor, sierraBaseUrl } = input;
  const detailFullUrl = `${sierraBaseUrl.replace(/\/$/, "")}${listing.detail_url}`;
  const agentPhotoSafe = agent.photoUrl
    ? escapeAttr(agent.photoUrl)
    : "/userfiles/4797/image/Bonnie__Brian_Headshots2.jpg";

  return `<!-- Custom Listing Walkthrough — ${escapeHtml(listing.mls)} -->
<style>
  .wt-c { font-family: "Raleway", sans-serif; color: #fff; background: ${escapeAttr(brandColor)}; margin: 0; padding: 0; }
  .wt-video { position: relative; width: 100%; aspect-ratio: 16/9; background: #000; }
  .wt-video iframe, .wt-video video { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
  .wt-stats { background: ${escapeAttr(brandColor)}; padding: 2rem 1.5rem; text-align: center; }
  .wt-stats h1 { font-size: calc(18px + 0.6vw); font-weight: 700; text-transform: uppercase; margin: 0 0 0.5rem; letter-spacing: 0.02em; color: #fff; }
  .wt-stats .wt-price { font-size: calc(22px + 0.8vw); margin: 0 0 0.5rem; color: #fff; }
  .wt-stats .wt-meta { font-size: 1rem; color: rgba(255,255,255,0.7); margin: 0; }
  .wt-photo { width: 100%; background: #000; }
  .wt-photo img { display: block; width: 100%; height: auto; }
  .wt-desc { background: #f5f5f5; color: #171717; padding: 3rem 1.5rem; font-size: 1rem; line-height: 1.6; }
  .wt-desc-inner { max-width: 720px; margin: 0 auto; }
  .wt-cta { background: ${escapeAttr(brandColor)}; padding: 3rem 1.5rem; text-align: center; }
  .wt-btn { display: inline-block; padding: 14px 32px; background: #fff; color: ${escapeAttr(brandColor)}; font-family: "Raleway", sans-serif; font-weight: 700; font-size: 15px; text-transform: uppercase; text-decoration: none; border: 1px solid #fff; transition: all 0.2s ease; letter-spacing: 0.02em; }
  .wt-btn:hover { background: transparent; color: #fff; }
  .wt-agent { background: #f5f5f5; color: #171717; padding: 3rem 1.5rem; text-align: center; }
  .wt-agent-photo { width: 140px; height: 140px; border-radius: 50%; object-fit: cover; margin: 0 auto 1.5rem; display: block; }
  .wt-agent-name { font-size: 1.25rem; font-weight: 700; text-transform: uppercase; margin: 0 0 0.25rem; letter-spacing: 0.02em; }
  .wt-agent-team { font-size: 0.9rem; color: #555; margin: 0 0 1.5rem; }
  .wt-agent-line { font-size: 1rem; margin: 0.25rem 0; }
  .wt-agent-line a { color: #171717; text-decoration: none; font-weight: 600; }
  .wt-agent-cta { display: inline-block; margin-top: 1.5rem; padding: 14px 32px; background: ${escapeAttr(brandColor)}; color: #fff; font-weight: 700; font-size: 15px; text-transform: uppercase; text-decoration: none; border: 1px solid ${escapeAttr(brandColor)}; transition: all 0.2s ease; letter-spacing: 0.02em; }
  .wt-agent-cta:hover { background: transparent; color: ${escapeAttr(brandColor)}; }
  .wt-sticky { position: fixed; bottom: 0; left: 0; right: 0; background: ${escapeAttr(brandColor)}; border-top: 1px solid rgba(255,255,255,0.2); padding: 12px 16px; text-align: center; z-index: 999; display: none; }
  .wt-sticky a { color: #fff; text-decoration: none; font-weight: 700; text-transform: uppercase; font-size: 14px; letter-spacing: 0.02em; }
  @media (max-width: 768px) { .wt-sticky { display: block; } .wt-c { padding-bottom: 60px; } }
</style>

<div class="wt-c">
  <section class="wt-video">
    <iframe src="${escapeAttr(videoUrl)}" loading="lazy" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
  </section>

  <section class="wt-stats">
    <h1>${escapeHtml(listing.address)}</h1>
    <p class="wt-price">${escapeHtml(listing.price)}</p>
    <p class="wt-meta">${escapeHtml([listing.beds && `${listing.beds} BD`, listing.baths && `${listing.baths} BA`, listing.sqft && `${listing.sqft} SqFt`].filter(Boolean).join(" · "))}</p>
  </section>

  ${listing.photo_url ? `<section class="wt-photo"><img src="${escapeAttr(listing.photo_url)}" alt="${escapeAttr(listing.address)}" /></section>` : ""}

  ${listing.description ? `<section class="wt-desc"><div class="wt-desc-inner">${escapeHtml(listing.description)}</div></section>` : ""}

  <section class="wt-cta">
    <a href="${escapeAttr(detailFullUrl)}" class="wt-btn">View Full Listing &amp; All Photos &rarr;</a>
  </section>

  <section class="wt-agent">
    <img class="wt-agent-photo" src="${agentPhotoSafe}" alt="${escapeAttr(agent.name)}" />
    <h3 class="wt-agent-name">${escapeHtml(agent.name)}</h3>
    ${agent.team ? `<p class="wt-agent-team">${escapeHtml(agent.team)}</p>` : ""}
    <p class="wt-agent-line"><a href="tel:${escapeAttr(phoneDigits(agent.phone))}">${escapeHtml(agent.phone)}</a></p>
    <p class="wt-agent-line"><a href="mailto:${escapeAttr(agent.email)}">${escapeHtml(agent.email)}</a></p>
    ${agent.scheduleUrl ? `<a href="${escapeAttr(agent.scheduleUrl)}" class="wt-agent-cta">Schedule a Call</a>` : ""}
  </section>
</div>

<div class="wt-sticky"><a href="#contact-form">Request Info &rarr;</a></div>
`;
}
