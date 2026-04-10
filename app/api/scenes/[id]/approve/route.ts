import { NextRequest, NextResponse } from "next/server";
import { updateSceneStatus, log, getSupabase } from "@/lib/db";

// POST /api/scenes/:id/approve — HITL: approve despite QC failure
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await updateSceneStatus(id, "qc_pass");

    const { data: scene } = await getSupabase()
      .from("scenes")
      .select("property_id, scene_number")
      .eq("id", id)
      .single();

    if (scene) {
      await log(scene.property_id, "qc", "info",
        `Scene ${scene.scene_number} manually approved`, undefined, id);
    }

    return NextResponse.json({ message: "Scene approved" });
  } catch {
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }
}
