// usage: HIGGSFIELD_API_KEY=... HIGGSFIELD_API_SECRET=... HIGGSFIELD_TEST_IMAGE_1=... HIGGSFIELD_TEST_IMAGE_2=... npx tsx scripts/test-higgsfield.ts
//
// Standalone probe harness for Higgsfield (platform.higgsfield.ai).
// Runs a sequence of API probes to determine:
//   1. Whether our auth credentials + baseline single-image shape works at all.
//   2. The exact shape of the status-check response (for checkStatus parsing).
//   3. Whether any of several undocumented multi-image reference field names
//      are accepted by the Higgsfield DoP endpoint.
//   4. Whether the cheaper preview tier is available.
//   5. Whether a model catalog / index endpoint exists.
//
// Each probe is wrapped in try/catch so one failure does not abort the rest.
// A JSON report is printed to stdout as the final line. Exit code is 0 iff
// probe 1 (baseline single-image submit) succeeded.

const BASE_URL = "https://platform.higgsfield.ai";
const STANDARD_PATH = "/higgsfield-ai/dop/standard";
const PREVIEW_PATH = "/higgsfield-ai/dop/preview";
const CINEMA_STUDIO_PATH = "/higgsfield-ai/cinema-studio/standard"; // fabricated guess
const DEFAULT_PROMPT = "slow orbital cinematic shot";
const DEFAULT_DURATION = 5;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

type Verdict = "pass" | "fail" | "unknown";

interface ProbeResult {
  name: string;
  url: string;
  method: string;
  requestBodyShape: Record<string, unknown> | null;
  httpStatus: number | null;
  responseBodyTrimmed: string | null;
  verdict: Verdict;
  note: string;
  error?: string;
}

interface Report {
  startedAt: string;
  finishedAt: string;
  env: {
    hasApiKey: boolean;
    hasApiSecret: boolean;
    image1: string | null;
    image2: string | null;
    image3: string | null;
  };
  baselineJobId: string | null;
  baselineFinalStatus: string | null;
  baselineStatusSchema: Record<string, string> | null;
  probes: ProbeResult[];
  summary: {
    baselineWorks: boolean;
    multiImageAccepted: string[];
    multiImageRejected: string[];
    notes: string[];
  };
}

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.length > 0 ? v : null;
}

function authHeader(): string {
  const key = env("HIGGSFIELD_API_KEY") ?? "";
  const secret = env("HIGGSFIELD_API_SECRET") ?? "";
  return `Key ${key}:${secret}`;
}

function redactBody(body: Record<string, unknown>): Record<string, unknown> {
  // Replace any data: URL values with placeholders for the report. We never
  // base64 here (all images are passed as URLs via env), but this is future-proof.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string" && v.startsWith("data:")) {
      out[k] = "<data-url-redacted>";
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        typeof item === "string" && item.startsWith("data:")
          ? "<data-url-redacted>"
          : item
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

function trim(body: string, max = 2000): string {
  if (body.length <= max) return body;
  return body.slice(0, max) + `...[+${body.length - max} more chars]`;
}

function describeSchema(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj === null || typeof obj !== "object") {
    out[prefix || "(root)"] = obj === null ? "null" : typeof obj;
    return out;
  }
  if (Array.isArray(obj)) {
    out[prefix || "(root)"] = `array[${obj.length}]`;
    if (obj.length > 0) {
      Object.assign(out, describeSchema(obj[0], `${prefix}[0]`));
    }
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v === null) {
      out[path] = "null";
    } else if (Array.isArray(v)) {
      out[path] = `array[${v.length}]`;
      if (v.length > 0 && typeof v[0] === "object") {
        Object.assign(out, describeSchema(v[0], `${path}[0]`));
      }
    } else if (typeof v === "object") {
      Object.assign(out, describeSchema(v, path));
    } else {
      out[path] = typeof v;
    }
  }
  return out;
}

async function runSubmitProbe(
  name: string,
  path: string,
  body: Record<string, unknown>
): Promise<ProbeResult> {
  const url = `${BASE_URL}${path}`;
  const probe: ProbeResult = {
    name,
    url,
    method: "POST",
    requestBodyShape: redactBody(body),
    httpStatus: null,
    responseBodyTrimmed: null,
    verdict: "unknown",
    note: "",
  };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    probe.httpStatus = resp.status;
    const text = await resp.text();
    probe.responseBodyTrimmed = trim(text);

    if (resp.ok) {
      probe.verdict = "pass";
      probe.note = "HTTP 2xx — API accepted the request shape.";
    } else if (resp.status === 400 || resp.status === 422) {
      probe.verdict = "fail";
      probe.note = `HTTP ${resp.status} — request shape rejected by validator.`;
    } else if (resp.status === 401 || resp.status === 403) {
      probe.verdict = "fail";
      probe.note = `HTTP ${resp.status} — auth error. Check API key + secret.`;
    } else if (resp.status === 404) {
      probe.verdict = "fail";
      probe.note = `HTTP 404 — endpoint not found at this path.`;
    } else {
      probe.verdict = "unknown";
      probe.note = `HTTP ${resp.status} — unexpected status.`;
    }
  } catch (err) {
    probe.verdict = "fail";
    probe.error = err instanceof Error ? err.message : String(err);
    probe.note = "Network / fetch exception.";
  }
  return probe;
}

async function runGetProbe(name: string, path: string): Promise<ProbeResult> {
  const url = `${BASE_URL}${path}`;
  const probe: ProbeResult = {
    name,
    url,
    method: "GET",
    requestBodyShape: null,
    httpStatus: null,
    responseBodyTrimmed: null,
    verdict: "unknown",
    note: "",
  };
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: authHeader() },
    });
    probe.httpStatus = resp.status;
    const text = await resp.text();
    probe.responseBodyTrimmed = trim(text);
    probe.verdict = resp.ok ? "pass" : "fail";
    probe.note = resp.ok
      ? "HTTP 2xx"
      : `HTTP ${resp.status} — endpoint unreachable or not exposed.`;
  } catch (err) {
    probe.verdict = "fail";
    probe.error = err instanceof Error ? err.message : String(err);
    probe.note = "Network / fetch exception.";
  }
  return probe;
}

function extractRequestId(responseText: string | null): string | null {
  if (!responseText) return null;
  try {
    const parsed = JSON.parse(responseText) as Record<string, unknown>;
    const candidate =
      (parsed.request_id as string | undefined) ??
      (parsed.id as string | undefined) ??
      ((parsed.data as Record<string, unknown> | undefined)?.request_id as
        | string
        | undefined) ??
      ((parsed.data as Record<string, unknown> | undefined)?.id as
        | string
        | undefined);
    return candidate ?? null;
  } catch {
    return null;
  }
}

async function pollUntilTerminal(
  jobId: string
): Promise<{
  finalStatus: string | null;
  schema: Record<string, string> | null;
  lastBody: string | null;
  httpStatus: number | null;
}> {
  const start = Date.now();
  let lastBody: string | null = null;
  let lastHttp: number | null = null;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    try {
      const resp = await fetch(
        `${BASE_URL}/requests/${jobId}/status`,
        { headers: { Authorization: authHeader() } }
      );
      lastHttp = resp.status;
      lastBody = await resp.text();
      if (!resp.ok) {
        return {
          finalStatus: null,
          schema: null,
          lastBody: trim(lastBody),
          httpStatus: lastHttp,
        };
      }
      try {
        const parsed = JSON.parse(lastBody) as Record<string, unknown>;
        const schema = describeSchema(parsed);
        const status = (
          (parsed.status as string | undefined) ??
          (parsed.state as string | undefined) ??
          ""
        ).toLowerCase();
        if (
          status === "completed" ||
          status === "complete" ||
          status === "failed" ||
          status === "nsfw"
        ) {
          return {
            finalStatus: status,
            schema,
            lastBody: trim(lastBody),
            httpStatus: lastHttp,
          };
        }
      } catch {
        // non-JSON — break out
        return {
          finalStatus: null,
          schema: null,
          lastBody: trim(lastBody),
          httpStatus: lastHttp,
        };
      }
    } catch {
      // keep trying until timeout
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return {
    finalStatus: "timeout",
    schema: null,
    lastBody: lastBody ? trim(lastBody) : null,
    httpStatus: lastHttp,
  };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();

  const img1 = env("HIGGSFIELD_TEST_IMAGE_1");
  const img2 = env("HIGGSFIELD_TEST_IMAGE_2");
  const img3 = env("HIGGSFIELD_TEST_IMAGE_3");

  const report: Report = {
    startedAt,
    finishedAt: "",
    env: {
      hasApiKey: !!env("HIGGSFIELD_API_KEY"),
      hasApiSecret: !!env("HIGGSFIELD_API_SECRET"),
      image1: img1,
      image2: img2,
      image3: img3,
    },
    baselineJobId: null,
    baselineFinalStatus: null,
    baselineStatusSchema: null,
    probes: [],
    summary: {
      baselineWorks: false,
      multiImageAccepted: [],
      multiImageRejected: [],
      notes: [],
    },
  };

  if (!report.env.hasApiKey || !report.env.hasApiSecret) {
    report.summary.notes.push(
      "HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET must both be set."
    );
  }
  if (!img1 || !img2) {
    report.summary.notes.push(
      "HIGGSFIELD_TEST_IMAGE_1 and HIGGSFIELD_TEST_IMAGE_2 are required; image 3 optional."
    );
  }

  const safeImg1 = img1 ?? "https://example.invalid/1.jpg";
  const safeImg2 = img2 ?? "https://example.invalid/2.jpg";
  const safeImg3 = img3 ?? safeImg2;

  // --- Probe 1: baseline single-image submit ---
  let probe1: ProbeResult;
  try {
    probe1 = await runSubmitProbe("1-baseline-standard", STANDARD_PATH, {
      image_url: safeImg1,
      prompt: DEFAULT_PROMPT,
      duration: DEFAULT_DURATION,
    });
  } catch (err) {
    probe1 = {
      name: "1-baseline-standard",
      url: `${BASE_URL}${STANDARD_PATH}`,
      method: "POST",
      requestBodyShape: { image_url: safeImg1, prompt: DEFAULT_PROMPT, duration: DEFAULT_DURATION },
      httpStatus: null,
      responseBodyTrimmed: null,
      verdict: "fail",
      note: "Uncaught exception",
      error: err instanceof Error ? err.message : String(err),
    };
  }
  report.probes.push(probe1);

  const baselineWorks = probe1.verdict === "pass";
  report.summary.baselineWorks = baselineWorks;
  const baselineJobId = baselineWorks
    ? extractRequestId(probe1.responseBodyTrimmed)
    : null;
  report.baselineJobId = baselineJobId;

  // --- Probe 2: poll baseline request until terminal ---
  if (baselineWorks && baselineJobId) {
    try {
      const polled = await pollUntilTerminal(baselineJobId);
      report.baselineFinalStatus = polled.finalStatus;
      report.baselineStatusSchema = polled.schema;
      report.probes.push({
        name: "2-baseline-poll",
        url: `${BASE_URL}/requests/${baselineJobId}/status`,
        method: "GET",
        requestBodyShape: null,
        httpStatus: polled.httpStatus,
        responseBodyTrimmed: polled.lastBody,
        verdict: polled.finalStatus === "completed" || polled.finalStatus === "complete" ? "pass" : polled.finalStatus === "timeout" ? "unknown" : "fail",
        note: `Final status: ${polled.finalStatus ?? "unknown"}. Schema captured in report.baselineStatusSchema.`,
      });
    } catch (err) {
      report.probes.push({
        name: "2-baseline-poll",
        url: `${BASE_URL}/requests/${baselineJobId}/status`,
        method: "GET",
        requestBodyShape: null,
        httpStatus: null,
        responseBodyTrimmed: null,
        verdict: "fail",
        note: "Polling threw",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    report.probes.push({
      name: "2-baseline-poll",
      url: `${BASE_URL}/requests/{id}/status`,
      method: "GET",
      requestBodyShape: null,
      httpStatus: null,
      responseBodyTrimmed: null,
      verdict: "unknown",
      note: "Skipped because probe 1 did not produce a request_id.",
    });
  }

  // --- Probe 3: reference_images field ---
  report.probes.push(
    await runSubmitProbe("3-multi-reference_images", STANDARD_PATH, {
      image_url: safeImg1,
      reference_images: [safeImg2, safeImg3],
      prompt: DEFAULT_PROMPT,
      duration: DEFAULT_DURATION,
    })
  );

  // --- Probe 4: image_urls array ---
  report.probes.push(
    await runSubmitProbe("4-multi-image_urls-array", STANDARD_PATH, {
      image_urls: [safeImg1, safeImg2, safeImg3],
      prompt: DEFAULT_PROMPT,
      duration: DEFAULT_DURATION,
    })
  );

  // --- Probe 5: references field ---
  report.probes.push(
    await runSubmitProbe("5-multi-references", STANDARD_PATH, {
      references: [safeImg1, safeImg2, safeImg3],
      prompt: DEFAULT_PROMPT,
      duration: DEFAULT_DURATION,
    })
  );

  // --- Probe 6: start_image + end_image keyframes ---
  report.probes.push(
    await runSubmitProbe("6-keyframes-start-end", STANDARD_PATH, {
      start_image: safeImg1,
      end_image: safeImg2,
      prompt: DEFAULT_PROMPT,
      duration: DEFAULT_DURATION,
    })
  );

  // --- Probe 7: cinema-studio endpoint guess ---
  report.probes.push(
    await runSubmitProbe("7-cinema-studio-endpoint", CINEMA_STUDIO_PATH, {
      image_url: safeImg1,
      prompt: DEFAULT_PROMPT,
      duration: DEFAULT_DURATION,
    })
  );

  // --- Probe 8: preview tier baseline ---
  report.probes.push(
    await runSubmitProbe("8-preview-baseline", PREVIEW_PATH, {
      image_url: safeImg1,
      prompt: DEFAULT_PROMPT,
      duration: DEFAULT_DURATION,
    })
  );

  // --- Probe 9: model catalog discovery ---
  for (const path of ["/", "/models", "/higgsfield-ai"]) {
    report.probes.push(await runGetProbe(`9-catalog-${path}`, path));
  }

  // Summarize multi-image probe verdicts
  for (const p of report.probes) {
    if (!p.name.startsWith("3-") && !p.name.startsWith("4-") && !p.name.startsWith("5-") && !p.name.startsWith("6-")) continue;
    if (p.verdict === "pass") report.summary.multiImageAccepted.push(p.name);
    else if (p.verdict === "fail") report.summary.multiImageRejected.push(p.name);
  }

  report.finishedAt = new Date().toISOString();

  // Print JSON report as the last thing on stdout
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");

  process.exit(baselineWorks ? 0 : 1);
}

main().catch((err) => {
  // This should never fire — main is defensive — but be safe.
  const fallback = {
    fatal: true,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  };
  process.stdout.write(JSON.stringify(fallback, null, 2) + "\n");
  process.exit(1);
});
