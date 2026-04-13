// Property Style Guide — produced in one Claude Sonnet 4.6 vision pass that
// sees ALL selected photos together, so later per-scene prompts can reference
// specific materials / colors / finishes visible elsewhere in the house
// instead of letting the video model hallucinate adjacent rooms.

import type { UniqueTag } from "../types.js";

// Keep this list in sync with the UniqueTag union in lib/types.ts. It is
// rendered inline in the style-guide system prompt so Claude can only pick
// from the closed vocabulary (docs/COVERAGE-MODEL.md §4.3).
const UNIQUE_TAG_ENUM: UniqueTag[] = [
  "pool",
  "spa",
  "outdoor_kitchen",
  "fire_pit",
  "fire_feature",
  "waterfront",
  "water_view",
  "city_view",
  "golf_view",
  "mountain_view",
  "wine_cellar",
  "wine_fridge",
  "home_theater",
  "gym",
  "sauna",
  "chandelier",
  "statement_fixture",
  "custom_staircase",
  "fireplace_wall",
  "floor_to_ceiling_window",
  "vaulted_ceiling",
  "coffered_ceiling",
  "beamed_ceiling",
  "gallery_wall",
  "built_in_shelving",
  "double_island",
  "waterfall_counter",
  "hero_kitchen_hood",
  "soaking_tub",
  "walk_in_shower",
  "double_vanity_marble",
  "walk_in_closet",
  "finished_basement",
  "three_car_garage",
  "car_lift",
  "boat_dock",
  "tennis_court",
  "pickleball_court",
  "putting_green",
  "detached_guest_house",
  "rooftop_deck",
  "balcony",
];

export interface NotableFeature {
  description: string;
  tags: UniqueTag[];
  photo_ids: string[];
}

export interface PropertyStyleGuide {
  overall_mood: string;
  exterior: {
    architecture_style: string;
    facade_materials: string[];
    roof: string;
    trim_and_accents: string;
    landscaping: string;
    sky_condition: string;
  };
  interior_palette: {
    wall_colors: string[];
    floor_materials: string[];
    trim_style: string;
    ceiling_details: string;
    natural_light_quality: string;
  };
  kitchen: {
    cabinet_color_and_style: string;
    counter_material: string;
    backsplash: string;
    hardware_finish: string;
    appliances: string;
    pendant_or_lighting: string;
    island_presence: boolean;
  } | null;
  living_room: {
    furniture_style: string;
    accent_colors: string[];
    focal_feature: string;
    ceiling: string;
  } | null;
  dining: {
    table_style: string;
    lighting: string;
  } | null;
  master_bedroom: {
    bed_style: string;
    nightstand_material: string;
    window_treatments: string;
  } | null;
  bathrooms: {
    vanity_style: string;
    counter_material: string;
    fixture_finish: string;
    shower_or_tub: string;
  } | null;
  outdoor_features: {
    has_pool: boolean;
    pool_description: string | null;
    has_lanai: boolean;
    lanai_description: string | null;
    view_type: string;
  };
  notable_features: NotableFeature[];
  // Property-wide aggregate of every canonical unique tag detected across all
  // photos. Populated by the style-guide pass so the coverage enforcer can
  // reason about the property without re-walking every photo row.
  // See docs/COVERAGE-MODEL.md §4.3.
  unique_tags: UniqueTag[];
}

export const STYLE_GUIDE_SYSTEM = `You are a real estate visual analyst. You receive a set of photos of a single property and produce a structured "style guide" — a JSON document describing the exact materials, colors, finishes, and design choices visible in this specific house.

This style guide is consumed by a downstream AI video generator. When the video model is shown a single photo of, say, the living room and the image includes a doorway to the kitchen, the model doesn't know what the real kitchen looks like and hallucinates a fake one. Your style guide fixes that by giving every per-scene prompt an accurate description of the adjacent rooms so the model can render them faithfully instead of inventing them.

RULES:
- Describe what is ACTUALLY visible in the photos. Do not invent features you cannot see.
- Use specific adjectives (e.g. "dark espresso shaker cabinets" not "wooden cabinets").
- Reference materials precisely (quartz, granite, marble, butcher block; porcelain, ceramic; engineered hardwood, tile, LVP; etc.).
- Reference finishes precisely (matte black, brushed nickel, polished chrome, aged brass, oil-rubbed bronze).
- If a section doesn't apply (e.g. the house has no pool), set that field to null or has_pool=false.
- Keep each string field under 25 words.
- Return ONLY a JSON object matching the PropertyStyleGuide schema. No preamble, no commentary, no markdown code fences.

UNIQUE TAGS (closed vocabulary — pick ONLY from this list):
${UNIQUE_TAG_ENUM.join(", ")}

Two places in the schema take these tags:
- \`notable_features[]\`: each entry is an OBJECT \`{ description, tags, photo_ids }\`. \`description\` is a short prose description of one distinctive feature (e.g. "double waterfall island with hero hood over it"). \`tags\` is zero-or-more values drawn from the closed vocabulary above that match that specific feature. \`photo_ids\` is the list of photo IDs (provided to you in the user message) in which that feature is visible. Each photo ID in \`photo_ids\` MUST come from the supplied list — do not invent IDs.
- \`unique_tags\` (top level): the property-wide aggregate — a de-duplicated array of every tag that appears in any \`notable_features[].tags\`. This is what the coverage enforcer matches on to guarantee a unique-feature clip, so include every canonical tag that is clearly visible somewhere in the property's photos.

If a feature is clearly visible but has no matching canonical tag, keep the description in \`notable_features\` but leave its \`tags\` array empty. Never invent a new tag.

Output schema (types only — fill with real values from the photos):
{
  "overall_mood": "string (e.g. 'modern coastal luxury', 'warm traditional farmhouse')",
  "exterior": {
    "architecture_style": "string",
    "facade_materials": ["string"],
    "roof": "string",
    "trim_and_accents": "string",
    "landscaping": "string",
    "sky_condition": "string (e.g. 'bright blue sky, midday')"
  },
  "interior_palette": {
    "wall_colors": ["string"],
    "floor_materials": ["string"],
    "trim_style": "string",
    "ceiling_details": "string",
    "natural_light_quality": "string"
  },
  "kitchen": { "cabinet_color_and_style": "...", "counter_material": "...", "backsplash": "...", "hardware_finish": "...", "appliances": "...", "pendant_or_lighting": "...", "island_presence": true } or null,
  "living_room": { "furniture_style": "...", "accent_colors": ["..."], "focal_feature": "...", "ceiling": "..." } or null,
  "dining": { "table_style": "...", "lighting": "..." } or null,
  "master_bedroom": { "bed_style": "...", "nightstand_material": "...", "window_treatments": "..." } or null,
  "bathrooms": { "vanity_style": "...", "counter_material": "...", "fixture_finish": "...", "shower_or_tub": "..." } or null,
  "outdoor_features": { "has_pool": false, "pool_description": null, "has_lanai": false, "lanai_description": null, "view_type": "..." },
  "notable_features": [
    { "description": "string", "tags": ["canonical_tag"], "photo_ids": ["uuid"] }
  ],
  "unique_tags": ["canonical_tag"]
}`;

export function buildStyleGuideUserPrompt(
  photos: Array<{ id: string; file_name: string; room_type: string }>
): string {
  const photoList = photos
    .map((p) => `- ID: ${p.id} | File: ${p.file_name} | Room: ${p.room_type}`)
    .join("\n");
  return `Here are ${photos.length} photos of a single property. Study them as a set and produce the PropertyStyleGuide JSON. Pay special attention to rooms that are partially visible through doorways in other shots — those are the rooms most likely to be hallucinated by the downstream video model, so precision matters.

When populating \`notable_features[].photo_ids\`, use ONLY the following photo IDs (each entry in the list is presented in the same order as the attached images, so you can match a feature to the photo it is visible in):

${photoList}

Return ONLY the JSON object.`;
}

// Render a compact text block that can be injected into a director/per-scene
// prompt so the downstream video model knows what adjacent rooms actually
// look like. Keep it concise — this gets baked into every scene prompt.
export function renderStyleGuideForPrompt(guide: PropertyStyleGuide | null): string {
  if (!guide) return "";
  const lines: string[] = [];
  lines.push(`PROPERTY STYLE GUIDE (describes the real house — use these details for anything visible through doorways or openings):`);
  lines.push(`Mood: ${guide.overall_mood}`);
  lines.push(`Interior palette: walls ${guide.interior_palette.wall_colors.join(", ")}; floors ${guide.interior_palette.floor_materials.join(", ")}; trim ${guide.interior_palette.trim_style}`);
  if (guide.kitchen) {
    lines.push(`Kitchen: ${guide.kitchen.cabinet_color_and_style} cabinets, ${guide.kitchen.counter_material} counters, ${guide.kitchen.hardware_finish} hardware, ${guide.kitchen.pendant_or_lighting}`);
  }
  if (guide.living_room) {
    lines.push(`Living room: ${guide.living_room.furniture_style}; focal feature ${guide.living_room.focal_feature}`);
  }
  if (guide.master_bedroom) {
    lines.push(`Master bedroom: ${guide.master_bedroom.bed_style}; ${guide.master_bedroom.window_treatments}`);
  }
  if (guide.bathrooms) {
    lines.push(`Bathrooms: ${guide.bathrooms.vanity_style}; ${guide.bathrooms.counter_material} counters; ${guide.bathrooms.fixture_finish} fixtures`);
  }
  if (guide.outdoor_features.has_pool && guide.outdoor_features.pool_description) {
    lines.push(`Pool: ${guide.outdoor_features.pool_description}`);
  }
  if (guide.outdoor_features.has_lanai && guide.outdoor_features.lanai_description) {
    lines.push(`Lanai: ${guide.outdoor_features.lanai_description}`);
  }
  return lines.join("\n");
}
