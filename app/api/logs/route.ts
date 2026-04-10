import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/db";

// GET /api/logs — Query pipeline logs
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const stage = searchParams.get("stage");
    const level = searchParams.get("level");
    const propertyId = searchParams.get("property_id");
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

    return NextResponse.json({
      logs: data,
      total: count,
      page,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
