// Property Style Guide — produced in one Claude Sonnet 4.6 vision pass that
// sees ALL selected photos together, so later per-scene prompts can reference
// specific materials / colors / finishes visible elsewhere in the house
// instead of letting the video model hallucinate adjacent rooms.

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
  notable_features: string[];
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
  "notable_features": ["string"]
}`;

export function buildStyleGuideUserPrompt(photoCount: number): string {
  return `Here are ${photoCount} photos of a single property. Study them as a set and produce the PropertyStyleGuide JSON. Pay special attention to rooms that are partially visible through doorways in other shots — those are the rooms most likely to be hallucinated by the downstream video model, so precision matters. Return ONLY the JSON object.`;
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
