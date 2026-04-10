import { NextRequest, NextResponse } from "next/server";
import { getProperty, getScenesForProperty } from "@/lib/db";

// GET /api/properties/:id/status — Public status for agents
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const property = await getProperty(id);
    const scenes = await getScenesForProperty(id);

    const stages = ["queued", "analyzing", "scripting", "generating", "qc", "assembling", "complete"];
    const currentStageIndex = stages.indexOf(property.status);
    const completedClips = scenes.filter((s) => s.status === "qc_pass").length;

    return NextResponse.json({
      id: property.id,
      address: property.address,
      status: property.status,
      currentStage: currentStageIndex,
      totalStages: stages.length,
      clipsCompleted: completedClips,
      clipsTotal: scenes.length,
      horizontalVideoUrl: property.horizontal_video_url,
      verticalVideoUrl: property.vertical_video_url,
      createdAt: property.created_at,
      processingTimeMs: property.processing_time_ms,
    });
  } catch {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
}
