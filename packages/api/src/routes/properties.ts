import { Router } from "express";
import multer from "multer";
import {
  createProperty,
  getProperty,
  updatePropertyStatus,
  getPhotosForProperty,
  getSelectedPhotos,
  getScenesForProperty,
} from "@reelready/db";
import { getSupabase } from "@reelready/db";
import { intakeQueue } from "@reelready/pipeline";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

export const propertiesRouter = Router();

// POST /api/properties — Create property + upload photos
propertiesRouter.post("/", upload.array("photos", 60), async (req, res) => {
  try {
    const { address, price, bedrooms, bathrooms, listing_agent, brokerage } =
      req.body;

    // Validate required fields
    if (!address || !price || !bedrooms || !bathrooms || !listing_agent) {
      res.status(400).json({ error: "Missing required fields: address, price, bedrooms, bathrooms, listing_agent" });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length < 10) {
      res.status(400).json({ error: "Minimum 10 photos required" });
      return;
    }

    // Create property record
    const property = await createProperty({
      address,
      price: parseInt(price, 10),
      bedrooms: parseInt(bedrooms, 10),
      bathrooms: parseFloat(bathrooms),
      listing_agent,
      brokerage: brokerage || null,
    });

    // Upload photos to Supabase Storage
    const supabase = getSupabase();
    const uploadedPaths: string[] = [];

    for (const file of files) {
      const fileName = `${Date.now()}_${file.originalname}`;
      const storagePath = `${property.id}/raw/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("property-photos")
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
        });

      if (!uploadError) {
        uploadedPaths.push(fileName);
      }
    }

    if (uploadedPaths.length < 10) {
      await updatePropertyStatus(property.id, "failed");
      res.status(500).json({ error: `Only ${uploadedPaths.length} photos uploaded successfully. Need at least 10.` });
      return;
    }

    // Kick off the pipeline
    await intakeQueue.add("intake", {
      propertyId: property.id,
      photoFileUrls: uploadedPaths,
    });

    res.status(201).json({
      id: property.id,
      status: "queued",
      photoCount: uploadedPaths.length,
      trackingUrl: `/status/${property.id}`,
      message: "Video generation started",
    });
  } catch (err) {
    console.error("Error creating property:", err);
    res.status(500).json({ error: "Failed to create property" });
  }
});

// GET /api/properties — List all properties (paginated)
propertiesRouter.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 25;
    const status = req.query.status as string;
    const search = req.query.search as string;
    const offset = (page - 1) * limit;

    let query = getSupabase()
      .from("properties")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }
    if (search) {
      query = query.ilike("address", `%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({
      properties: data,
      total: count,
      page,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    console.error("Error listing properties:", err);
    res.status(500).json({ error: "Failed to list properties" });
  }
});

// GET /api/properties/:id — Full property detail
propertiesRouter.get("/:id", async (req, res) => {
  try {
    const property = await getProperty(req.params.id);
    const photos = await getPhotosForProperty(req.params.id);
    const scenes = await getScenesForProperty(req.params.id);

    res.json({ ...property, photos, scenes });
  } catch (err) {
    console.error("Error getting property:", err);
    res.status(404).json({ error: "Property not found" });
  }
});

// GET /api/properties/:id/status — Public status endpoint (for agents)
propertiesRouter.get("/:id/status", async (req, res) => {
  try {
    const property = await getProperty(req.params.id);
    const scenes = await getScenesForProperty(req.params.id);

    const stages = ["queued", "analyzing", "scripting", "generating", "qc", "assembling", "complete"];
    const currentStageIndex = stages.indexOf(property.status);

    const totalClips = scenes.length;
    const completedClips = scenes.filter((s) => s.status === "qc_pass").length;

    res.json({
      id: property.id,
      address: property.address,
      status: property.status,
      currentStage: currentStageIndex,
      totalStages: stages.length,
      clipsCompleted: completedClips,
      clipsTotal: totalClips,
      horizontalVideoUrl: property.horizontal_video_url,
      verticalVideoUrl: property.vertical_video_url,
      createdAt: property.created_at,
      processingTimeMs: property.processing_time_ms,
    });
  } catch (err) {
    res.status(404).json({ error: "Property not found" });
  }
});

// POST /api/properties/:id/rerun — Re-trigger pipeline
propertiesRouter.post("/:id/rerun", async (req, res) => {
  try {
    const property = await getProperty(req.params.id);
    const photos = await getPhotosForProperty(req.params.id);

    await updatePropertyStatus(property.id, "queued");

    await intakeQueue.add("intake", {
      propertyId: property.id,
      photoFileUrls: photos.map((p) => p.file_name ?? ""),
    });

    res.json({ message: "Pipeline restarted", status: "queued" });
  } catch (err) {
    res.status(500).json({ error: "Failed to rerun pipeline" });
  }
});
