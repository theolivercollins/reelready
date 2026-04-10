import { NextRequest, NextResponse } from "next/server";
import {
  createProperty,
  getSupabase,
  updatePropertyStatus,
  insertPhotos,
  log,
} from "@/lib/db";
import { runPipeline } from "@/lib/pipeline";

export const maxDuration = 300;

// POST /api/properties — Upload photos + start pipeline
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const address = formData.get("address") as string;
    const price = formData.get("price") as string;
    const bedrooms = formData.get("bedrooms") as string;
    const bathrooms = formData.get("bathrooms") as string;
    const listing_agent = formData.get("listing_agent") as string;
    const brokerage = formData.get("brokerage") as string | null;

    if (!address || !price || !bedrooms || !bathrooms || !listing_agent) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const photos = formData.getAll("photos") as File[];
    if (photos.length < 10) {
      return NextResponse.json(
        { error: `Minimum 10 photos required, got ${photos.length}` },
        { status: 400 }
      );
    }

    // Create property record
    const property = await createProperty({
      address,
      price: parseInt(price, 10),
      bedrooms: parseInt(bedrooms, 10),
      bathrooms: parseFloat(bathrooms),
      listing_agent,
      brokerage: brokerage || undefined,
    });

    // Upload photos to Supabase Storage
    const supabase = getSupabase();
    const photoRecords: Array<{ property_id: string; file_url: string; file_name: string }> = [];

    for (const photo of photos) {
      const fileName = `${Date.now()}_${photo.name}`;
      const storagePath = `${property.id}/raw/${fileName}`;
      const buffer = Buffer.from(await photo.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("property-photos")
        .upload(storagePath, buffer, { contentType: photo.type });

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from("property-photos")
          .getPublicUrl(storagePath);

        photoRecords.push({
          property_id: property.id,
          file_url: urlData.publicUrl,
          file_name: fileName,
        });
      }
    }

    if (photoRecords.length < 5) {
      await updatePropertyStatus(property.id, "failed");
      return NextResponse.json(
        { error: `Only ${photoRecords.length} photos uploaded. Need at least 5.` },
        { status: 500 }
      );
    }

    await insertPhotos(photoRecords);
    await getSupabase()
      .from("properties")
      .update({ photo_count: photoRecords.length })
      .eq("id", property.id);

    // Start pipeline in background (non-blocking)
    runPipeline(property.id).catch(async (err) => {
      console.error("Pipeline error:", err);
    });

    return NextResponse.json(
      {
        id: property.id,
        status: "queued",
        photoCount: photoRecords.length,
        message: "Video generation started",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Error creating property:", err);
    return NextResponse.json({ error: "Failed to create property" }, { status: 500 });
  }
}

// GET /api/properties ��� List all properties
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = parseInt(searchParams.get("limit") ?? "25", 10);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const offset = (page - 1) * limit;

    let query = getSupabase()
      .from("properties")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (search) query = query.ilike("address", `%${search}%`);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      properties: data,
      total: count,
      page,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to list properties" }, { status: 500 });
  }
}
