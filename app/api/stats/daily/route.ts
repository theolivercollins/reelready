import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/db";

// GET /api/stats/daily — Daily stats for charts
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") ?? "30", 10);
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

    const { data, error } = await getSupabase()
      .from("daily_stats")
      .select()
      .gte("date", startDate)
      .order("date", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ stats: data });
  } catch {
    return NextResponse.json({ error: "Failed to fetch daily stats" }, { status: 500 });
  }
}
