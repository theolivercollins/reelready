#!/usr/bin/env -S npx tsx

/**
 * trace-director-prompt.ts
 *
 * Reconstructs the exact director user message for a listing or production
 * property by re-running the retrieval chain live. Writes a human-readable
 * transcript + audit checklist.
 *
 * Usage:
 *   npx tsx scripts/trace-director-prompt.ts --listing <listing_id>
 *   npx tsx scripts/trace-director-prompt.ts --property <property_id>
 *
 * Output: /tmp/director-trace-<id>.md
 */

import * as fs from "fs";
import * as path from "path";

// Minimal .env loader — same pattern as scripts/backfill-*.ts.
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

import { getSupabase } from "../lib/client.js";

type Mode =
  | { kind: "listing"; id: string }
  | { kind: "property"; id: string }
  | { kind: "v1-session"; id: string };

function parseArgs(): Mode {
  const args = process.argv.slice(2);
  const listingIdx = args.indexOf("--listing");
  const propertyIdx = args.indexOf("--property");
  const v1SessionIdx = args.indexOf("--v1-session");
  if (listingIdx >= 0 && args[listingIdx + 1]) {
    return { kind: "listing", id: args[listingIdx + 1] };
  }
  if (propertyIdx >= 0 && args[propertyIdx + 1]) {
    return { kind: "property", id: args[propertyIdx + 1] };
  }
  if (v1SessionIdx >= 0 && args[v1SessionIdx + 1]) {
    return { kind: "v1-session", id: args[v1SessionIdx + 1] };
  }
  console.error(
    "Usage: npx tsx scripts/trace-director-prompt.ts (--listing <id> | --property <id> | --v1-session <id>)",
  );
  process.exit(2);
}

async function main() {
  const mode = parseArgs();
  console.log(`Tracing ${mode.kind} ${mode.id}...`);
  // Dispatch to listing, property, or v1-session tracer
  if (mode.kind === "listing") {
    const { traceListing } = await import("./trace-director-prompt.impl.js");
    await traceListing(mode.id);
  } else if (mode.kind === "property") {
    const { traceProperty } = await import("./trace-director-prompt.impl.js");
    await traceProperty(mode.id);
  } else {
    const { traceV1Session } = await import("./trace-director-prompt.impl.js");
    await traceV1Session(mode.id);
  }
}

main().catch((err) => {
  console.error("Trace failed:", err);
  process.exit(1);
});
