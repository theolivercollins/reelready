import { subHours, subMinutes, subDays, format } from "date-fns";

export type PropertyStatus = "queued" | "analyzing" | "scripting" | "generating" | "qc" | "assembling" | "complete" | "failed" | "needs_review";
export type SceneStatus = "pending" | "generating" | "qc_pass" | "qc_soft_reject" | "qc_hard_reject" | "retry_1" | "retry_2" | "failed" | "needs_review";
export type LogLevel = "info" | "warn" | "error" | "debug";
export type PipelineStage = "intake" | "analysis" | "scripting" | "generation" | "qc" | "assembly" | "delivery";
export type RoomType = "kitchen" | "living_room" | "master_bedroom" | "bedroom" | "bathroom" | "exterior_front" | "exterior_back" | "pool" | "aerial" | "dining" | "hallway" | "garage" | "other";
export type CameraMovement = "orbital_slow" | "dolly_left_to_right" | "dolly_right_to_left" | "slow_pan" | "parallax" | "push_in" | "pull_out";

export interface Property {
  id: string;
  created_at: string;
  updated_at: string;
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  listing_agent: string;
  brokerage: string;
  status: PropertyStatus;
  photo_count: number;
  selected_photo_count: number;
  total_cost_cents: number;
  processing_time_ms: number;
  horizontal_video_url: string | null;
  vertical_video_url: string | null;
  thumbnail_url: string | null;
}

export interface Photo {
  id: string;
  property_id: string;
  file_url: string;
  file_name: string;
  room_type: RoomType;
  quality_score: number;
  aesthetic_score: number;
  depth_rating: "high" | "medium" | "low";
  selected: boolean;
  discard_reason: string | null;
}

export interface Scene {
  id: string;
  property_id: string;
  photo_id: string;
  scene_number: number;
  camera_movement: CameraMovement;
  prompt: string;
  duration_seconds: number;
  status: SceneStatus;
  provider: "runway" | "kling" | "luma";
  generation_cost_cents: number;
  generation_time_ms: number;
  clip_url: string | null;
  attempt_count: number;
  qc_verdict: string | null;
  qc_issues: any;
  qc_confidence: number;
}

export interface PipelineLog {
  id: string;
  property_id: string;
  scene_id: string | null;
  created_at: string;
  stage: PipelineStage;
  level: LogLevel;
  message: string;
  metadata: any;
}

export interface DailyStat {
  id: string;
  date: string;
  properties_completed: number;
  properties_failed: number;
  total_clips_generated: number;
  total_retries: number;
  total_cost_cents: number;
  avg_processing_time_ms: number;
  avg_cost_per_video_cents: number;
}

const uid = () => crypto.randomUUID();

const addresses = [
  "742 Evergreen Terrace, Springfield, IL 62704",
  "1600 Pennsylvania Ave, Washington, DC 20500",
  "221B Baker Street, London, SW1A 1AA",
  "350 Fifth Avenue, New York, NY 10118",
  "1 Infinite Loop, Cupertino, CA 95014",
  "2300 Traverwood Dr, Ann Arbor, MI 48105",
  "4059 Mt Lee Dr, Hollywood, CA 90068",
  "8 Wildwood Lane, Greenwich, CT 06831",
  "512 Maple Ridge Rd, Boulder, CO 80302",
  "1455 Market St, San Francisco, CA 94103",
  "7722 Sunset Blvd, Los Angeles, CA 90046",
  "1200 NW 17th Ave, Miami, FL 33136",
  "900 Congress Ave, Austin, TX 78701",
  "2100 Woodward Ave, Detroit, MI 48201",
  "3000 K Street NW, Washington, DC 20007",
  "155 Harbor Dr, Chicago, IL 60601",
  "8800 Gross Point Rd, Skokie, IL 60077",
  "4400 Jenifer St NW, Washington, DC 20015",
  "600 Brickell Key Dr, Miami, FL 33131",
  "275 Sacramento St, San Francisco, CA 94111",
];

const agents = [
  "Sarah Mitchell", "James Rodriguez", "Emily Chen", "Michael Thompson",
  "Lisa Patel", "David Kim", "Jennifer Adams", "Robert Wilson",
  "Amanda Foster", "Chris Martinez"
];

const brokerages = [
  "Compass", "Sotheby's International", "Keller Williams", "Coldwell Banker",
  "RE/MAX", "Douglas Elliman", "The Agency", "Engel & Völkers"
];

const roomTypes: RoomType[] = ["kitchen", "living_room", "master_bedroom", "bedroom", "bathroom", "exterior_front", "exterior_back", "pool", "aerial", "dining", "hallway", "garage"];

const cameraMovements: CameraMovement[] = ["orbital_slow", "dolly_left_to_right", "dolly_right_to_left", "slow_pan", "parallax", "push_in", "pull_out"];

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateCompletedProperty(index: number): Property {
  const createdAt = subHours(new Date(), randomBetween(2, 168));
  const processingMs = randomBetween(120000, 240000);
  return {
    id: uid(),
    created_at: createdAt.toISOString(),
    updated_at: new Date(createdAt.getTime() + processingMs).toISOString(),
    address: addresses[index % addresses.length],
    price: randomBetween(350000, 2500000),
    bedrooms: randomBetween(2, 6),
    bathrooms: randomBetween(1, 4) + (Math.random() > 0.5 ? 0.5 : 0),
    listing_agent: agents[index % agents.length],
    brokerage: brokerages[index % brokerages.length],
    status: "complete",
    photo_count: randomBetween(15, 45),
    selected_photo_count: randomBetween(10, 20),
    total_cost_cents: randomBetween(180, 520),
    processing_time_ms: processingMs,
    horizontal_video_url: "https://example.com/video-h.mp4",
    vertical_video_url: "https://example.com/video-v.mp4",
    thumbnail_url: `https://images.unsplash.com/photo-${1560184897 + index}-67f40db7829b?w=400`,
  };
}

function generateInProgressProperty(index: number, status: PropertyStatus): Property {
  const createdAt = subMinutes(new Date(), randomBetween(1, 10));
  return {
    id: uid(),
    created_at: createdAt.toISOString(),
    updated_at: new Date().toISOString(),
    address: addresses[(15 + index) % addresses.length],
    price: randomBetween(400000, 1800000),
    bedrooms: randomBetween(3, 5),
    bathrooms: randomBetween(2, 4),
    listing_agent: agents[(5 + index) % agents.length],
    brokerage: brokerages[(3 + index) % brokerages.length],
    status,
    photo_count: randomBetween(20, 40),
    selected_photo_count: status === "queued" ? 0 : randomBetween(10, 18),
    total_cost_cents: status === "generating" ? randomBetween(50, 200) : 0,
    processing_time_ms: 0,
    horizontal_video_url: null,
    vertical_video_url: null,
    thumbnail_url: null,
  };
}

// Generate completed properties
export const completedProperties: Property[] = Array.from({ length: 15 }, (_, i) => generateCompletedProperty(i));

// Generate in-progress properties
export const inProgressProperties: Property[] = [
  generateInProgressProperty(0, "analyzing"),
  generateInProgressProperty(1, "scripting"),
  generateInProgressProperty(2, "generating"),
  generateInProgressProperty(3, "qc"),
];

// Generate needs_review property
export const needsReviewProperty: Property = {
  ...generateInProgressProperty(4, "needs_review"),
  address: "600 Brickell Key Dr, Miami, FL 33131",
};

export const allProperties: Property[] = [...completedProperties, ...inProgressProperties, needsReviewProperty];

// Generate photos for a property
export function generatePhotos(propertyId: string, count: number): Photo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    property_id: propertyId,
    file_url: `https://images.unsplash.com/photo-${1560184897 + i}?w=300`,
    file_name: `IMG_${1000 + i}.jpg`,
    room_type: roomTypes[i % roomTypes.length],
    quality_score: +(Math.random() * 0.4 + 0.6).toFixed(2),
    aesthetic_score: +(Math.random() * 0.5 + 0.5).toFixed(2),
    depth_rating: (["high", "medium", "low"] as const)[randomBetween(0, 2)],
    selected: i < count * 0.6,
    discard_reason: i >= count * 0.6 ? ["Low quality", "Duplicate angle", "Poor lighting", null][randomBetween(0, 3)] : null,
  }));
}

// Generate scenes for a property
export function generateScenes(propertyId: string, count: number): Scene[] {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    property_id: propertyId,
    photo_id: uid(),
    scene_number: i + 1,
    camera_movement: cameraMovements[i % cameraMovements.length],
    prompt: `Smooth ${cameraMovements[i % cameraMovements.length].replace(/_/g, " ")} through the ${roomTypes[i % roomTypes.length].replace(/_/g, " ")}, highlighting natural light and architectural details`,
    duration_seconds: 3.5,
    status: i < count - 2 ? "qc_pass" : i < count - 1 ? "generating" : "pending",
    provider: (["runway", "kling", "luma"] as const)[i % 3],
    generation_cost_cents: randomBetween(8, 25),
    generation_time_ms: randomBetween(15000, 45000),
    clip_url: i < count - 2 ? "https://example.com/clip.mp4" : null,
    attempt_count: randomBetween(1, 3),
    qc_verdict: i < count - 2 ? "pass" : null,
    qc_issues: null,
    qc_confidence: +(Math.random() * 0.3 + 0.7).toFixed(2),
  }));
}

// Failed QC scenes for needs_review property
export const failedQcScenes: Scene[] = [
  {
    id: uid(),
    property_id: needsReviewProperty.id,
    photo_id: uid(),
    scene_number: 3,
    camera_movement: "orbital_slow",
    prompt: "Smooth orbital movement around the kitchen island, showcasing granite countertops",
    duration_seconds: 3.5,
    status: "qc_hard_reject",
    provider: "runway",
    generation_cost_cents: 18,
    generation_time_ms: 32000,
    clip_url: "https://example.com/failed-clip-1.mp4",
    attempt_count: 2,
    qc_verdict: "reject",
    qc_issues: { issues: ["Flickering artifacts in top-right corner", "Unnatural warping on cabinet edges"] },
    qc_confidence: 0.34,
  },
  {
    id: uid(),
    property_id: needsReviewProperty.id,
    photo_id: uid(),
    scene_number: 7,
    camera_movement: "push_in",
    prompt: "Gentle push in toward the master bedroom window with morning light",
    duration_seconds: 3.5,
    status: "qc_soft_reject",
    provider: "kling",
    generation_cost_cents: 22,
    generation_time_ms: 28000,
    clip_url: "https://example.com/failed-clip-2.mp4",
    attempt_count: 3,
    qc_verdict: "soft_reject",
    qc_issues: { issues: ["Minor jitter in camera path", "Slight color shift at 2.1s mark"] },
    qc_confidence: 0.52,
  },
];

// Generate pipeline logs
const stages: PipelineStage[] = ["intake", "analysis", "scripting", "generation", "qc", "assembly", "delivery"];
const logMessages: Record<PipelineStage, string[]> = {
  intake: ["Property submitted via upload portal", "Photos received and validated", "Duplicate check passed", "Property queued for processing"],
  analysis: ["Starting photo analysis pipeline", "Running quality assessment on 24 photos", "Room classification complete", "Depth estimation complete", "Selected 14 photos for video generation", "Analysis complete in 12.4s"],
  scripting: ["Generating shot plan", "Scene sequence optimized for flow", "Camera movements assigned", "Script generated with 12 scenes"],
  generation: ["Starting clip generation", "Scene 1/12: Submitting to Runway", "Scene 1/12: Generation complete (18.2s)", "Scene 2/12: Submitting to Kling", "Scene 5/12: QC soft reject, retrying", "8/12 clips generated"],
  qc: ["Running automated QC pipeline", "Checking temporal consistency", "Evaluating motion smoothness", "QC complete: 11/12 passed, 1 needs review"],
  assembly: ["Starting final assembly", "Adding transitions (0.3s crossfade)", "Overlaying music track: Ambient Dreams", "Rendering 16:9 output", "Rendering 9:16 output", "Assembly complete"],
  delivery: ["Video uploaded to CDN", "Thumbnail generated", "Agent notification sent", "Property marked complete"],
};

export function generateLogs(properties: Property[]): PipelineLog[] {
  const logs: PipelineLog[] = [];
  properties.forEach((prop) => {
    const stageSubset = prop.status === "complete" ? stages : stages.slice(0, randomBetween(1, 4));
    stageSubset.forEach((stage, si) => {
      const msgs = logMessages[stage];
      msgs.forEach((msg, mi) => {
        logs.push({
          id: uid(),
          property_id: prop.id,
          scene_id: null,
          created_at: subMinutes(new Date(prop.created_at), -(si * 30 + mi * 5)).toISOString(),
          stage,
          level: Math.random() > 0.9 ? "warn" : Math.random() > 0.95 ? "error" : "info",
          message: msg,
          metadata: null,
        });
      });
    });
  });
  return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export const allLogs = generateLogs(allProperties);

// Generate daily stats
export const dailyStats: DailyStat[] = Array.from({ length: 7 }, (_, i) => {
  const date = subDays(new Date(), 6 - i);
  const completed = randomBetween(8, 25) + i * 2;
  return {
    id: uid(),
    date: format(date, "yyyy-MM-dd"),
    properties_completed: completed,
    properties_failed: randomBetween(0, 3),
    total_clips_generated: completed * randomBetween(10, 14),
    total_retries: randomBetween(5, 20),
    total_cost_cents: completed * randomBetween(280, 420),
    avg_processing_time_ms: randomBetween(140000, 200000),
    avg_cost_per_video_cents: randomBetween(280, 420),
  };
});

// Hourly throughput data for last 24h
export const hourlyThroughput = Array.from({ length: 24 }, (_, i) => ({
  hour: format(subHours(new Date(), 23 - i), "HH:mm"),
  completed: randomBetween(0, 5),
}));

export const statusStages: { key: PropertyStatus; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "analyzing", label: "Analyzing" },
  { key: "scripting", label: "Scripting" },
  { key: "generating", label: "Generating" },
  { key: "qc", label: "QC" },
  { key: "assembling", label: "Assembling" },
];

export function getStatusColor(status: PropertyStatus | SceneStatus): string {
  switch (status) {
    case "complete":
    case "qc_pass":
      return "bg-primary text-primary-foreground";
    case "queued":
    case "pending":
      return "bg-muted text-muted-foreground";
    case "analyzing":
    case "scripting":
    case "generating":
      return "bg-info text-info-foreground";
    case "qc":
      return "bg-info text-info-foreground";
    case "assembling":
      return "bg-info text-info-foreground";
    case "failed":
    case "qc_hard_reject":
      return "bg-destructive text-destructive-foreground";
    case "needs_review":
    case "qc_soft_reject":
      return "bg-warning text-warning-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
