import { NextRequest, NextResponse } from "next/server";
import { getProperty, updatePropertyStatus } from "@/lib/db";
import { runPipeline } from "@/lib/pipeline";

export const maxDuration = 300;

// POST /api/properties/:id/rerun — Re-trigger pipeline
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await getProperty(id); // verify exists
    await updatePropertyStatus(id, "queued");

    runPipeline(id).catch((err) => console.error("Rerun error:", err));

    return NextResponse.json({ message: "Pipeline restarted", status: "queued" });
  } catch {
    return NextResponse.json({ error: "Failed to rerun" }, { status: 500 });
  }
}
