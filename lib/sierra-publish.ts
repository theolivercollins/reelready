// Publish a custom listing landing page to a client's Sierra Interactive site
// by running an Apify Playwright actor that drives the Sierra admin UI:
//   1. Log in with the client's stored Sierra admin credentials.
//   2. Navigate to Content Pages → New.
//   3. Set URL slug + title.
//   4. Add a Content Area component, paste our pre-rendered HTML.
//   5. Add a Contact Form component.
//   6. Save.
//   7. Return the published page URL.
//
// Apify generic JS-Playwright actor: jancurn/playwright-scraper or apify/playwright-scraper.
// We POST a "run" with our pageFunction script + input data, then poll for completion.
// Apify Pro account expected; APIFY_API_TOKEN must be set.

const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_ACTOR_ID = process.env.APIFY_SIERRA_ACTOR_ID || "apify~playwright-scraper";

export interface SierraPublishInput {
  sierraAdminUrl: string;        // e.g. https://client2.sierrainteractivedev.com (no trailing slash)
  sierraSiteName: string;        // e.g. "thehelgemoteam" — the Sierra "Site Name" login field
  sierraAdminUsername: string;
  sierraAdminPassword: string;
  sierraPublicBaseUrl: string;   // e.g. https://www.thehelgemoteam.com
  pageSlug: string;              // e.g. "walkthrough/193-santa-fe-st"
  pageTitle: string;             // e.g. "193 Santa Fe St — Walkthrough"
  pageHtml: string;              // pre-rendered HTML for the Content Area
}

export interface SierraPublishResult {
  ok: boolean;
  sierra_page_url?: string;
  apify_run_id?: string;
  error?: string;
}

export async function publishToSierra(
  input: SierraPublishInput
): Promise<SierraPublishResult> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return { ok: false, error: "APIFY_API_TOKEN not set" };
  }

  // Strip trailing slash so we don't end up with `//login.aspx`.
  const adminUrl = input.sierraAdminUrl.replace(/\/+$/, "");
  const publicBase = input.sierraPublicBaseUrl.replace(/\/+$/, "");

  const startResp = await fetch(
    `${APIFY_BASE}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: `${adminUrl}/login.aspx` }],
        pageFunction: buildPageFunction(),
        // The actor passes input fields as `context.request.userData`
        // and our pageFunction reads from `context.customData`.
        customData: {
          adminUrl,
          siteName: input.sierraSiteName,
          username: input.sierraAdminUsername,
          password: input.sierraAdminPassword,
          publicBaseUrl: publicBase,
          slug: input.pageSlug,
          title: input.pageTitle,
          html: input.pageHtml,
        },
        proxyConfiguration: { useApifyProxy: true },
        maxRequestsPerCrawl: 5,
      }),
    }
  );
  if (!startResp.ok) {
    const errText = await startResp.text();
    return { ok: false, error: `Apify start failed: ${startResp.status} ${errText}` };
  }
  const startJson = (await startResp.json()) as { data: { id: string; defaultDatasetId: string } };
  const runId = startJson.data.id;
  const datasetId = startJson.data.defaultDatasetId;

  // Poll up to 90 seconds (Vercel Pro fn timeout = 300s).
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3_000));
    const statusResp = await fetch(
      `${APIFY_BASE}/actor-runs/${runId}?token=${token}`
    );
    if (!statusResp.ok) continue;
    const statusJson = (await statusResp.json()) as {
      data: { status: string };
    };
    const status = statusJson.data.status;
    if (status === "SUCCEEDED") {
      const dsResp = await fetch(
        `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&clean=true`
      );
      const items = (await dsResp.json()) as Array<{
        sierra_page_url?: string;
        error?: string;
      }>;
      const item = items[0];
      if (item?.sierra_page_url) {
        return { ok: true, sierra_page_url: item.sierra_page_url, apify_run_id: runId };
      }
      return {
        ok: false,
        error: item?.error || "Actor finished but no sierra_page_url returned",
        apify_run_id: runId,
      };
    }
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      return { ok: false, error: `Apify actor ${status}`, apify_run_id: runId };
    }
  }
  return { ok: false, error: "Apify actor timed out client-side", apify_run_id: runId };
}

// The script that runs inside the Apify Playwright actor.
// Returned as a string so it can be sent over the wire.
function buildPageFunction(): string {
  return `
    async function pageFunction(context) {
      const { page, customData, log } = context;
      const { adminUrl, siteName, username, password, slug, title, html, publicBaseUrl } = customData;

      log.info('Logging into Sierra admin (' + adminUrl + ')');
      // Sierra's admin login is at /login.aspx and requires three fields:
      // txtSiteName, txtUserName, txtPassword. Submit is btnLoginSubmit.
      await page.goto(adminUrl + '/login.aspx', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#txtSiteName', { timeout: 30000 });
      await page.fill('#txtSiteName', siteName);
      await page.fill('#txtUserName', username);
      await page.fill('#txtPassword', password);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.click('#btnLoginSubmit'),
      ]);
      log.info('Login submitted, current URL: ' + page.url());

      log.info('Navigating to new Content Page form');
      await page.goto(adminUrl + '/content-page-form.aspx?secid=-1&clid=-1&sb=2&so=0&pn=1&asid=-1', {
        waitUntil: 'domcontentloaded',
      });

      // Set URL slug + title. ASP.NET names usually have a "txtTitle" / "txtUrl" pattern;
      // fall back to broader selectors if those exact IDs aren't present.
      await page.fill('input[id*="Title"], input[name*="Title"]', title);
      await page.fill('input[id*="Url"], input[name*="Url"]', slug);

      // Click "Add New Page Component" → choose "Content Area".
      await page.click('text=Add New Page Component', { timeout: 15000 });
      await page.click('text=Content Area', { timeout: 15000 });

      // Wait for the CKEditor instance to render.
      await page.waitForSelector('iframe[id*="cke"], iframe[title*="Rich Text"]', { timeout: 30000 });
      // Toggle to source view, paste HTML, toggle back.
      const sourceBtn = page.locator('a.cke_button__source, button[title*="Source"]').first();
      await sourceBtn.click();
      const sourceTextarea = page.locator('textarea.cke_source').first();
      await sourceTextarea.fill(html);
      await sourceBtn.click();

      // Save the Content Page.
      await page.click('text=Save');
      await page.waitForLoadState('networkidle', { timeout: 30000 });

      // The published URL is the public-base + slug.
      const sierra_page_url = publicBaseUrl + '/' + slug.replace(/^\\//, '');
      log.info('Sierra page URL: ' + sierra_page_url);

      return { sierra_page_url };
    }
  `.trim();
}
