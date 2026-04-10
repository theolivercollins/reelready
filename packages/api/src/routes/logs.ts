import { Router } from "express";
import { getSupabase } from "@reelready/db";

export const logsRouter = Router();

// GET /api/logs — Query pipeline logs (paginated, filterable)
logsRouter.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const stage = req.query.stage as string;
    const level = req.query.level as string;
    const propertyId = req.query.property_id as string;
    const offset = (page - 1) * limit;

    let query = getSupabase()
      .from("pipeline_logs")
      .select("*, properties(address)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (stage) query = query.eq("stage", stage);
    if (level) query = query.eq("level", level);
    if (propertyId) query = query.eq("property_id", propertyId);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      logs: data,
      total: count,
      page,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    console.error("Error fetching logs:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});
