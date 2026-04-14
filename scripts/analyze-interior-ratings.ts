// Interior ratings analysis — one-off report to ground prompt tuning.
// Run: npx tsx scripts/analyze-interior-ratings.ts [--days 60] [--rooms kitchen,living_room]
//
// Emits a markdown report to stdout. Pipe to a file if you want to save:
//   npx tsx scripts/analyze-interior-ratings.ts > docs/INTERIOR-LOSERS-$(date +%F).md

import * as fs from "fs";
import * as path from "path";

// Minimal .env loader — no dotenv dep needed.
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

import { getSupabase } from "../lib/client.js";

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DAYS = parseInt(argValue("--days", "60"), 10);
const ROOMS = argValue("--rooms", "kitchen,living_room").split(",").map(s => s.trim());

interface RatingRow {
  rating: number;
  comment: string | null;
  tags: string[] | null;
  scene_id: string;
  property_id: string;
  created_at: string;
}

interface SceneRow {
  id: string;
  camera_movement: string;
  prompt: string;
  provider: string | null;
  photo_id: string;
  clip_url: string | null;
  scene_number: number;
}

interface PhotoRow {
  id: string;
  room_type: string;
  depth_rating: string | null;
  key_features: string[] | null;
  composition: string | null;
  suggested_motion: string | null;
}

async function main() {
  const supabase = getSupabase();
  const sinceIso = new Date(Date.now() - DAYS * 86400000).toISOString();

  // 1. Fetch all ratings within the window (both winners and losers — we'll slice both).
  const { data: ratingRows, error: rErr } = await supabase
    .from("scene_ratings")
    .select("rating, comment, tags, scene_id, property_id, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });
  if (rErr) throw rErr;
  const ratings = (ratingRows ?? []) as RatingRow[];

  if (ratings.length === 0) {
    console.log(`# Interior Ratings Report\n\nNo ratings found in the last ${DAYS} days.\n`);
    return;
  }

  // 2. Fetch joined scene + photo rows.
  const sceneIds = Array.from(new Set(ratings.map(r => r.scene_id)));
  const { data: sceneRows } = await supabase
    .from("scenes")
    .select("id, camera_movement, prompt, provider, photo_id, clip_url, scene_number")
    .in("id", sceneIds);
  const scenes = (sceneRows ?? []) as SceneRow[];
  const sceneMap = new Map(scenes.map(s => [s.id, s]));

  const photoIds = Array.from(new Set(scenes.map(s => s.photo_id).filter(Boolean)));
  const { data: photoRows } = photoIds.length
    ? await supabase
        .from("photos")
        .select("id, room_type, depth_rating, key_features, composition, suggested_motion")
        .in("id", photoIds)
    : { data: [] as PhotoRow[] };
  const photos = (photoRows ?? []) as PhotoRow[];
  const photoMap = new Map(photos.map(p => [p.id, p]));

  // 3. Join and filter to interior room targets.
  interface Row {
    rating: number;
    comment: string | null;
    tags: string[] | null;
    created_at: string;
    property_id: string;
    scene: SceneRow;
    photo: PhotoRow;
  }
  const joined: Row[] = ratings.flatMap(r => {
    const scene = sceneMap.get(r.scene_id);
    if (!scene) return [];
    const photo = photoMap.get(scene.photo_id);
    if (!photo) return [];
    if (!ROOMS.includes(photo.room_type)) return [];
    return [{
      rating: r.rating,
      comment: r.comment,
      tags: r.tags,
      created_at: r.created_at,
      property_id: r.property_id,
      scene,
      photo,
    }];
  });

  const losers = joined.filter(r => r.rating <= 2);
  const winners = joined.filter(r => r.rating >= 4);

  // 4. Render markdown report.
  const out: string[] = [];
  out.push(`# Interior Ratings Report\n`);
  out.push(`Generated: ${new Date().toISOString()}`);
  out.push(`Window: last ${DAYS} days`);
  out.push(`Rooms: ${ROOMS.join(", ")}`);
  out.push(`\nTotals: ${joined.length} rated scenes — ${winners.length} winners (≥4), ${losers.length} losers (≤2)\n`);

  // Loser breakdown by (room × movement × provider).
  const bucketKey = (r: Row) =>
    `${r.photo.room_type} / ${r.scene.camera_movement} / ${r.scene.provider ?? "unknown"}`;

  function renderBucket(rows: Row[], heading: string) {
    out.push(`\n## ${heading}\n`);
    if (rows.length === 0) {
      out.push(`_None._\n`);
      return;
    }
    const buckets = new Map<string, Row[]>();
    for (const r of rows) {
      const k = bucketKey(r);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(r);
    }
    const sorted = Array.from(buckets.entries()).sort((a, b) => b[1].length - a[1].length);
    for (const [k, rs] of sorted) {
      out.push(`\n### ${k}  —  ${rs.length} rating${rs.length === 1 ? "" : "s"}\n`);
      for (const r of rs) {
        out.push(`- **rating ${r.rating}** · scene #${r.scene.scene_number} · property \`${r.property_id.slice(0, 8)}\``);
        out.push(`  - prompt: \`${r.scene.prompt}\``);
        if (r.scene.clip_url) out.push(`  - clip: ${r.scene.clip_url}`);
        if (r.photo.depth_rating) out.push(`  - depth_rating: ${r.photo.depth_rating}`);
        if (r.photo.suggested_motion) out.push(`  - suggested_motion: ${r.photo.suggested_motion}`);
        if (r.photo.key_features?.length) out.push(`  - key_features: ${r.photo.key_features.map(f => `"${f}"`).join(", ")}`);
        if (r.photo.composition) out.push(`  - composition: ${r.photo.composition}`);
        if (r.tags?.length) out.push(`  - tags: ${r.tags.join(", ")}`);
        if (r.comment) out.push(`  - comment: ${r.comment}`);
      }
    }
  }

  renderBucket(losers, "LOSERS (rating ≤ 2)");
  renderBucket(winners, "WINNERS (rating ≥ 4)");

  // Aggregate summary by movement.
  out.push(`\n## Summary: avg rating by (room × movement × provider)\n`);
  const summary = new Map<string, { sum: number; count: number }>();
  for (const r of joined) {
    const k = bucketKey(r);
    const cur = summary.get(k) ?? { sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count += 1;
    summary.set(k, cur);
  }
  const summaryRows = Array.from(summary.entries())
    .map(([k, v]) => ({ k, avg: v.sum / v.count, n: v.count }))
    .sort((a, b) => a.avg - b.avg);
  out.push(`| Bucket | N | Avg |`);
  out.push(`|---|---|---|`);
  for (const s of summaryRows) {
    out.push(`| ${s.k} | ${s.n} | ${s.avg.toFixed(2)} |`);
  }

  console.log(out.join("\n"));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
