import "dotenv/config";
import express from "express";
import cors from "cors";
import { propertiesRouter } from "./routes/properties.js";
import { scenesRouter } from "./routes/scenes.js";
import { logsRouter } from "./routes/logs.js";
import { statsRouter } from "./routes/stats.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/properties", propertiesRouter);
app.use("/api/scenes", scenesRouter);
app.use("/api/logs", logsRouter);
app.use("/api/stats", statsRouter);

app.listen(PORT, () => {
  console.log("─────────────────────────────────");
  console.log("  ReelReady API Server");
  console.log("─────────────────────────────────");
  console.log(`  Port: ${PORT}`);
  console.log(`  Supabase: ${process.env.SUPABASE_URL}`);
  console.log("─────────────────────────────────");
});
