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

import { getSupabase } from "../lib/client.js";

type Mode = { kind: "listing"; id: string } | { kind: "property"; id: string };

function parseArgs(): Mode {
  const args = process.argv.slice(2);
  const listingIdx = args.indexOf("--listing");
  const propertyIdx = args.indexOf("--property");
  if (listingIdx >= 0 && args[listingIdx + 1]) {
    return { kind: "listing", id: args[listingIdx + 1] };
  }
  if (propertyIdx >= 0 && args[propertyIdx + 1]) {
    return { kind: "property", id: args[propertyIdx + 1] };
  }
  console.error("Usage: npx tsx scripts/trace-director-prompt.ts (--listing <id> | --property <id>)");
  process.exit(2);
}

async function main() {
  const mode = parseArgs();
  console.log(`Tracing ${mode.kind} ${mode.id}...`);
  // Dispatch to listing or property tracer (implemented in later tasks)
  if (mode.kind === "listing") {
    const { traceListing } = await import("./trace-director-prompt.impl.js");
    await traceListing(mode.id);
  } else {
    const { traceProperty } = await import("./trace-director-prompt.impl.js");
    await traceProperty(mode.id);
  }
}

main().catch((err) => {
  console.error("Trace failed:", err);
  process.exit(1);
});
