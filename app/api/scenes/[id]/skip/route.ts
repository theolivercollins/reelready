import { NextRequest, NextResponse } from "next/server";
import { updateScene, log, getSupabase } from "@/lib/db";

// POST /api/scenes/:id/skip — HITL: skip this scene
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: scene } = await getSupabase()
      .from("scenes")
      .select("property_id, scene_number")
      .eq("id", id)
      .single();

    if (!scene) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    await updateScene(id, { status: "qc_pass", clip_url: null });
    await log(scene.property_id, "qc", "info",
      `Scene ${scene.scene_number} skipped`, undefined, id);

    return NextResponse.json({ message: "Scene skipped" });
  } catch {
    return NextResponse.json({ error: "Failed to skip" }, { status: 500 });
  }
}
