import "dotenv/config";
import { startAllWorkers } from "@reelready/pipeline";

console.log("─────────────────────────────────");
console.log("  ReelReady Pipeline Worker");
console.log("─────────────────────────────────");
console.log(`  Environment: ${process.env.NODE_ENV ?? "development"}`);
console.log(`  Redis: ${process.env.REDIS_URL ?? "redis://localhost:6379"}`);
console.log(`  Max retries/clip: ${process.env.MAX_RETRIES_PER_CLIP ?? "2"}`);
console.log(`  QC threshold: ${process.env.QC_CONFIDENCE_THRESHOLD ?? "0.75"}`);
console.log("─────────────────────────────────");

const workers = startAllWorkers();
console.log(`\n✓ ${workers.length} workers started\n`);

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down workers...`);
  await Promise.all(workers.map((w) => w.close()));
  console.log("All workers stopped.");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
