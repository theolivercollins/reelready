import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/db";

// GET /api/scenes/:id — Scene detail with logs
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const { data: scene, error } = await supabase
      .from("scenes")
      .select("*, photos(*)")
      .eq("id", id)
      .single();

    if (error) throw error;

    const { data: logs } = await supabase
      .from("pipeline_logs")
      .select()
      .eq("scene_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({ ...scene, logs: logs ?? [] });
  } catch {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }
}
