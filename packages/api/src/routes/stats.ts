import { Router } from "express";
import { getSupabase } from "@reelready/db";

export const statsRouter = Router();

// GET /api/stats/overview — Current dashboard overview metrics
statsRouter.get("/overview", async (req, res) => {
  try {
    const supabase = getSupabase();
    const today = new Date().toISOString().split("T")[0];

    // Properties completed today
    const { count: completedToday } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true })
      .eq("status", "complete")
      .gte("updated_at", `${today}T00:00:00`);

    // Properties submitted today
    const { count: submittedToday } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true })
      .gte("created_at", `${today}T00:00:00`);

    // Currently in pipeline
    const { count: inPipeline } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true })
      .in("status", [
        "queued",
        "analyzing",
        "scripting",
        "generating",
        "qc",
        "assembling",
      ]);

    // Needs review
    const { count: needsReview } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true })
      .eq("status", "needs_review");

    // Average processing time (completed today)
    const { data: completedData } = await supabase
      .from("properties")
      .select("processing_time_ms, total_cost_cents")
      .eq("status", "complete")
      .gte("updated_at", `${today}T00:00:00`);

    const avgProcessingMs = completedData?.length
      ? completedData.reduce((sum, p) => sum + (p.processing_time_ms ?? 0), 0) /
        completedData.length
      : 0;

    const totalCostToday = completedData?.reduce(
      (sum, p) => sum + (p.total_cost_cents ?? 0),
      0
    ) ?? 0;

    const avgCostPerVideo = completedData?.length
      ? totalCostToday / completedData.length
      : 0;

    // Success rate (completed without needing review, last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const { count: totalCompleted } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true })
      .eq("status", "complete")
      .gte("created_at", `${weekAgo}T00:00:00`);

    const { count: totalFailed } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true })
      .in("status", ["failed", "needs_review"])
      .gte("created_at", `${weekAgo}T00:00:00`);

    const total = (totalCompleted ?? 0) + (totalFailed ?? 0);
    const successRate = total > 0 ? ((totalCompleted ?? 0) / total) * 100 : 100;

    res.json({
      completedToday: completedToday ?? 0,
      submittedToday: submittedToday ?? 0,
      inPipeline: inPipeline ?? 0,
      needsReview: needsReview ?? 0,
      avgProcessingMs: Math.round(avgProcessingMs),
      totalCostTodayCents: totalCostToday,
      avgCostPerVideoCents: Math.round(avgCostPerVideo),
      successRate: Math.round(successRate * 10) / 10,
    });
  } catch (err) {
    console.error("Error fetching overview:", err);
    res.status(500).json({ error: "Failed to fetch overview stats" });
  }
});

// GET /api/stats/daily — Daily aggregated stats (last 30 days)
statsRouter.get("/daily", async (req, res) => {
  try {
    const days = parseInt(req.query.days as string, 10) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const { data, error } = await getSupabase()
      .from("daily_stats")
      .select()
      .gte("date", startDate)
      .order("date", { ascending: true });

    if (error) throw error;
    res.json({ stats: data });
  } catch (err) {
    console.error("Error fetching daily stats:", err);
    res.status(500).json({ error: "Failed to fetch daily stats" });
  }
});
