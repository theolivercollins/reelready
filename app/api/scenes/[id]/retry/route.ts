import { NextRequest, NextResponse } from "next/server";
import { updateScene, log, getSupabase } from "@/lib/db";

export const maxDuration = 300;

// POST /api/scenes/:id/retry — HITL: retry with modified prompt
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const { data: scene } = await getSupabase()
      .from("scenes")
      .select("property_id, scene_number")
      .eq("id", id)
      .single();

    if (!scene) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    await updateScene(id, { prompt, status: "pending" });
    await log(scene.property_id, "generation", "info",
      `Scene ${scene.scene_number} retried with new prompt`, { newPrompt: prompt }, id);

    // TODO: trigger single-scene regeneration

    return NextResponse.json({ message: "Scene queued for retry" });
  } catch {
    return NextResponse.json({ error: "Failed to retry" }, { status: 500 });
  }
}
