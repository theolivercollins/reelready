import { NextRequest, NextResponse } from "next/server";
import { getProperty, getPhotosForProperty, getScenesForProperty } from "@/lib/db";

// GET /api/properties/:id — Full property detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const property = await getProperty(id);
    const photos = await getPhotosForProperty(id);
    const scenes = await getScenesForProperty(id);

    return NextResponse.json({ ...property, photos, scenes });
  } catch {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
}
