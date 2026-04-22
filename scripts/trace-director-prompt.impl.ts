import { writeFile } from "node:fs/promises";
import { getSupabase } from "../lib/client.js";
import {
  retrieveMatchingRecipes,
  retrieveSimilarIterations,
  retrieveSimilarLosers,
  renderRecipeBlock,
  renderExemplarBlock,
  renderLoserBlock,
  type RetrievedRecipe,
  type RetrievedExemplar,
} from "../lib/prompt-lab.js";
import { DIRECTOR_SYSTEM, buildDirectorUserPrompt } from "../lib/prompts/director.js";
import { fromPgVector } from "../lib/embeddings.js";

interface TraceReport {
  kind: "listing" | "property";
  id: string;
  generatedAt: string;
  photosTotal: number;
  photosWithEmbedding: number;
  recipesCount: number;
  exemplarsCount: number;
  losersCount: number;
  pools: { labSessions: number; prodRatings: number; listingIterations: number };
  directorSystemLength: number;
  directorUserPromptLength: number;
  notes: string[];
  directorUserPrompt: string;
}

export async function traceListing(listingId: string): Promise<void> {
  const supabase = getSupabase();

  const { data: listing, error: listingErr } = await supabase
    .from("prompt_lab_listings")
    .select("*")
    .eq("id", listingId)
    .single();
  if (listingErr || !listing) throw new Error(`Listing ${listingId} not found: ${listingErr?.message}`);

  const { data: photos } = await supabase
    .from("prompt_lab_listing_photos")
    .select("*")
    .eq("listing_id", listingId)
    .order("photo_index", { ascending: true });
  const photosArr = photos ?? [];

  const { data: scenes } = await supabase
    .from("prompt_lab_listing_scenes")
    .select("*")
    .eq("listing_id", listingId)
    .order("scene_number", { ascending: true });

  // Pool counts across the three rating sources
  const [{ count: labSessions }, { count: prodRatings }, { count: listingIterations }] = await Promise.all([
    supabase.from("prompt_lab_iterations").select("*", { count: "exact", head: true }),
    supabase.from("scene_ratings").select("*", { count: "exact", head: true }),
    supabase.from("prompt_lab_listing_scene_iterations").select("*", { count: "exact", head: true }),
  ]);

  // Map photos to buildDirectorUserPrompt's expected shape (canonical pattern from prompt-lab-listings.ts)
  type DirectorUserPhoto = Parameters<typeof buildDirectorUserPrompt>[0][number];
  const photoData: DirectorUserPhoto[] = photosArr.map((p) => {
    const a = (p.analysis_json ?? {}) as {
      room_type?: string;
      aesthetic_score?: number;
      depth_rating?: string;
      key_features?: string[];
      composition?: string | null;
      suggested_motion?: string | null;
      motion_rationale?: string | null;
    };
    return {
      id: p.id,
      file_name: `photo_${p.photo_index}`,
      room_type: a.room_type ?? "other",
      aesthetic_score: typeof a.aesthetic_score === "number" ? a.aesthetic_score : 5,
      depth_rating: a.depth_rating ?? "medium",
      key_features: Array.isArray(a.key_features) ? a.key_features : [],
      composition: a.composition ?? null,
      suggested_motion: a.suggested_motion ?? null,
      motion_rationale: a.motion_rationale ?? null,
    };
  });

  // Run retrieval per photo + dedupe across photos (canonical pattern)
  const recipeDedupe = new Map<string, RetrievedRecipe>();
  const exemplarDedupe = new Map<string, RetrievedExemplar>();
  const loserDedupe = new Map<string, RetrievedExemplar>();

  let photosWithEmbedding = 0;
  for (let i = 0; i < photosArr.length; i++) {
    const p = photosArr[i];
    const pdata = photoData[i];
    const vec = fromPgVector(p.embedding as string | null);
    if (!vec) continue;
    photosWithEmbedding += 1;
    try {
      const [recipes, winners, losers] = await Promise.all([
        retrieveMatchingRecipes(vec, pdata.room_type, { limit: 1 }),
        retrieveSimilarIterations(vec, { minRating: 4, limit: 3 }),
        retrieveSimilarLosers(vec, { maxRating: 2, limit: 2 }),
      ]);
      for (const r of recipes) if (!recipeDedupe.has(r.archetype)) recipeDedupe.set(r.archetype, r);
      for (const w of winners) if (!exemplarDedupe.has(w.id)) exemplarDedupe.set(w.id, w);
      for (const l of losers) if (!loserDedupe.has(l.id)) loserDedupe.set(l.id, l);
    } catch (err) {
      console.warn(`[traceListing] retrieval for photo ${p.id}:`, err);
    }
  }

  const recipes = [...recipeDedupe.values()].slice(0, 5);
  const exemplars = [...exemplarDedupe.values()].slice(0, 5);
  const losers = [...loserDedupe.values()].slice(0, 3);

  const directorUserPrompt =
    buildDirectorUserPrompt(photoData) +
    renderRecipeBlock(recipes) +
    renderExemplarBlock(exemplars) +
    renderLoserBlock(losers);

  const notes: string[] = [];
  if (photosArr.length === 0) notes.push("⚠️  Listing has no photos.");
  if (photosWithEmbedding === 0 && photosArr.length > 0) notes.push("⚠️  No photos have embeddings — retrieval can't run. Check `embedding` column on `prompt_lab_listing_photos`.");
  else if (photosWithEmbedding < photosArr.length) notes.push(`⚠️  Only ${photosWithEmbedding}/${photosArr.length} photos have embeddings.`);
  if (recipes.length === 0 && photosWithEmbedding > 0) notes.push("⚠️  No recipe matches — either no recipes exist or cosine distance exceeds threshold.");
  if (exemplars.length === 0 && photosWithEmbedding > 0) notes.push("⚠️  No past-winner exemplars found — `match_rated_examples` returned empty. This likely means the learning loop hasn't produced enough 4★+ signal for this photo type.");
  if (losers.length === 0 && photosWithEmbedding > 0) notes.push("ℹ️  No loser exemplars found.");
  if (!scenes || scenes.length === 0) notes.push("ℹ️  Listing has no scenes yet (director hasn't run).");

  const report: TraceReport = {
    kind: "listing",
    id: listingId,
    generatedAt: new Date().toISOString(),
    photosTotal: photosArr.length,
    photosWithEmbedding,
    recipesCount: recipes.length,
    exemplarsCount: exemplars.length,
    losersCount: losers.length,
    pools: { labSessions: labSessions ?? 0, prodRatings: prodRatings ?? 0, listingIterations: listingIterations ?? 0 },
    directorSystemLength: DIRECTOR_SYSTEM.length,
    directorUserPromptLength: directorUserPrompt.length,
    notes,
    directorUserPrompt,
  };

  await writeReport(report);
}

export async function traceProperty(propertyId: string): Promise<void> {
  const supabase = getSupabase();

  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .single();
  if (propErr || !property) throw new Error(`Property ${propertyId} not found: ${propErr?.message}`);

  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("property_id", propertyId)
    .eq("selected", true)
    .order("aesthetic_score", { ascending: false });
  const photosArr = photos ?? [];

  const { data: scenes } = await supabase
    .from("scenes")
    .select("*")
    .eq("property_id", propertyId)
    .order("scene_number", { ascending: true });
  const scenesArr = scenes ?? [];

  const [{ count: labSessions }, { count: prodRatings }, { count: listingIterations }] = await Promise.all([
    supabase.from("prompt_lab_iterations").select("*", { count: "exact", head: true }),
    supabase.from("scene_ratings").select("*", { count: "exact", head: true }),
    supabase.from("prompt_lab_listing_scene_iterations").select("*", { count: "exact", head: true }),
  ]);

  // Prod photos are flat columns — no analysis_json unwrapping
  type DirectorUserPhoto = Parameters<typeof buildDirectorUserPrompt>[0][number];
  const photoData: DirectorUserPhoto[] = photosArr.map((p: Record<string, unknown>) => ({
    id: String(p.id),
    file_name: (p.file_name as string | null) ?? "unknown.jpg",
    room_type: (p.room_type as string | null) ?? "other",
    aesthetic_score: typeof p.aesthetic_score === "number" ? p.aesthetic_score : 5,
    depth_rating: (p.depth_rating as string | null) ?? "medium",
    key_features: Array.isArray(p.key_features) ? (p.key_features as string[]) : [],
    composition: (p.composition as string | null) ?? null,
    suggested_motion: (p.suggested_motion as string | null) ?? null,
    motion_rationale: (p.motion_rationale as string | null) ?? null,
  }));

  // Prod retrieval runs per-scene (each scene has its own embedding)
  const recipeDedupe = new Map<string, RetrievedRecipe>();
  const exemplarDedupe = new Map<string, RetrievedExemplar>();
  const loserDedupe = new Map<string, RetrievedExemplar>();

  let scenesWithEmbedding = 0;
  for (const s of scenesArr) {
    const sceneEmb = (s as { embedding?: string | null }).embedding;
    if (!sceneEmb) continue;
    const vec = fromPgVector(sceneEmb);
    if (!vec) continue;
    scenesWithEmbedding += 1;
    const roomType = (s as { room_type?: string | null }).room_type ?? "other";
    try {
      const [recipes, winners, losers] = await Promise.all([
        retrieveMatchingRecipes(vec, roomType, { limit: 1 }),
        retrieveSimilarIterations(vec, { minRating: 4, limit: 3 }),
        retrieveSimilarLosers(vec, { maxRating: 2, limit: 2 }),
      ]);
      for (const r of recipes) if (!recipeDedupe.has(r.archetype)) recipeDedupe.set(r.archetype, r);
      for (const w of winners) if (!exemplarDedupe.has(w.id)) exemplarDedupe.set(w.id, w);
      for (const l of losers) if (!loserDedupe.has(l.id)) loserDedupe.set(l.id, l);
    } catch (err) {
      console.warn(`[traceProperty] retrieval for scene ${(s as { id: string }).id}:`, err);
    }
  }

  const recipes = [...recipeDedupe.values()].slice(0, 5);
  const exemplars = [...exemplarDedupe.values()].slice(0, 5);
  const losers = [...loserDedupe.values()].slice(0, 3);

  const directorUserPrompt =
    buildDirectorUserPrompt(photoData) +
    renderRecipeBlock(recipes) +
    renderExemplarBlock(exemplars) +
    renderLoserBlock(losers);

  const notes: string[] = [];
  if (photosArr.length === 0) notes.push("⚠️  Property has no selected photos.");
  if (scenesArr.length === 0) notes.push("ℹ️  Property has no scenes yet.");
  else if (scenesWithEmbedding === 0) notes.push("⚠️  No scenes have embeddings — `embedScene` may not have run. Check `scenes.embedding`.");
  else if (scenesWithEmbedding < scenesArr.length) {
    notes.push(`⚠️  Only ${scenesWithEmbedding}/${scenesArr.length} scenes have embeddings.`);
  }
  if (exemplars.length === 0 && scenesWithEmbedding > 0) {
    notes.push("⚠️  No past-winner exemplars matched any scene embedding. Learning loop not contributing to this property.");
  }
  if (recipes.length === 0 && scenesWithEmbedding > 0) {
    notes.push("ℹ️  No recipe matches for these scenes.");
  }

  await writeReport({
    kind: "property",
    id: propertyId,
    generatedAt: new Date().toISOString(),
    photosTotal: photosArr.length,
    photosWithEmbedding: scenesWithEmbedding, // repurposed: scenes-with-embedding count
    recipesCount: recipes.length,
    exemplarsCount: exemplars.length,
    losersCount: losers.length,
    pools: { labSessions: labSessions ?? 0, prodRatings: prodRatings ?? 0, listingIterations: listingIterations ?? 0 },
    directorSystemLength: DIRECTOR_SYSTEM.length,
    directorUserPromptLength: directorUserPrompt.length,
    notes,
    directorUserPrompt,
  });
}

// ---------------------------------------------------------------------------
// V1 Session tracer
// ---------------------------------------------------------------------------

interface RetrievalMetadataExemplar {
  id: string;
  prompt: string;
  rating: number;
  distance: number;
  room_type: string;
  camera_movement: string;
  model_used?: string | null;
  tags?: string[] | null;
  comment?: string | null;
  refinement?: string | null;
}

interface RetrievalMetadataRecipe {
  id: string;
  archetype: string;
  prompt_template: string;
  distance: number;
}

interface RetrievalMetadata {
  exemplars?: RetrievalMetadataExemplar[];
  losers?: RetrievalMetadataExemplar[];
  recipe?: RetrievalMetadataRecipe | null;
}

export async function traceV1Session(sessionId: string): Promise<void> {
  const supabase = getSupabase();

  // 1. Fetch the session row
  const { data: session, error: sessionErr } = await supabase
    .from("prompt_lab_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (sessionErr || !session) {
    throw new Error(`Session ${sessionId} not found: ${sessionErr?.message}`);
  }

  // 2. Fetch all iterations ordered newest-first
  const { data: iterations, error: iterErr } = await supabase
    .from("prompt_lab_iterations")
    .select("*")
    .eq("session_id", sessionId)
    .order("iteration_number", { ascending: false });
  if (iterErr) throw new Error(`Could not fetch iterations: ${iterErr.message}`);
  const itersArr = iterations ?? [];

  // 3. Use the latest iteration as the anchor for analysis + retrieval
  const latestIter = itersArr[0] ?? null;

  const notes: string[] = [];

  if (!latestIter) {
    notes.push("WARNING: Session has no iterations.");
  }

  // 4. Extract analysis from latest iteration
  const analysis = (latestIter?.analysis_json ?? {}) as {
    room_type?: string;
    aesthetic_score?: number;
    depth_rating?: string;
    key_features?: string[];
    composition?: string | null;
    suggested_motion?: string | null;
    motion_rationale?: string | null;
  };

  // 5. Build the base director user prompt from analysis
  type DirectorUserPhoto = Parameters<typeof buildDirectorUserPrompt>[0][number];
  const photoData: DirectorUserPhoto[] = [
    {
      id: latestIter?.id ?? sessionId,
      file_name: "lab-image",
      room_type: analysis.room_type ?? "other",
      aesthetic_score: typeof analysis.aesthetic_score === "number" ? analysis.aesthetic_score : 5,
      depth_rating: analysis.depth_rating ?? "medium",
      key_features: Array.isArray(analysis.key_features) ? analysis.key_features : [],
      composition: analysis.composition ?? null,
      suggested_motion: analysis.suggested_motion ?? null,
      motion_rationale: analysis.motion_rationale ?? null,
    },
  ];

  // 6. Determine retrieval: prefer stored retrieval_metadata, fall back to live RPCs
  let exemplars: RetrievedExemplar[] = [];
  let losers: RetrievedExemplar[] = [];
  let recipes: RetrievedRecipe[] = [];

  const storedMeta = latestIter?.retrieval_metadata as RetrievalMetadata | null | undefined;

  if (storedMeta && (storedMeta.exemplars?.length || storedMeta.losers?.length || storedMeta.recipe)) {
    // Use stored metadata — already computed at render time
    notes.push("INFO: Retrieval from stored `retrieval_metadata` on latest iteration (no live RPC calls).");

    exemplars = (storedMeta.exemplars ?? []).map((e) => ({
      id: e.id,
      source: "lab" as const,
      room_type: e.room_type,
      camera_movement: e.camera_movement,
      model_used: e.model_used ?? null,
      prompt: e.prompt,
      rating: e.rating,
      tags: e.tags ?? null,
      comment: e.comment ?? null,
      refinement: e.refinement ?? null,
      provider: null,
      distance: e.distance,
    }));

    losers = (storedMeta.losers ?? []).map((e) => ({
      id: e.id,
      source: "lab" as const,
      room_type: e.room_type,
      camera_movement: e.camera_movement,
      model_used: e.model_used ?? null,
      prompt: e.prompt,
      rating: e.rating,
      tags: e.tags ?? null,
      comment: e.comment ?? null,
      refinement: e.refinement ?? null,
      provider: null,
      distance: e.distance,
    }));

    if (storedMeta.recipe) {
      recipes = [
        {
          id: storedMeta.recipe.id,
          archetype: storedMeta.recipe.archetype,
          room_type: analysis.room_type ?? "other",
          camera_movement: "push_in",
          provider: null,
          model_used: null,
          prompt_template: storedMeta.recipe.prompt_template,
          composition_signature: null,
          times_applied: 0,
          distance: storedMeta.recipe.distance,
        },
      ];
    }
  } else {
    // Fall back to live retrieval via embedding on latest iteration
    const vec = fromPgVector(latestIter?.embedding as string | null);
    if (vec) {
      notes.push("INFO: Retrieval via live RPCs (no stored retrieval_metadata).");
      try {
        const [r, w, l] = await Promise.all([
          retrieveMatchingRecipes(vec, analysis.room_type ?? null, { limit: 3 }),
          retrieveSimilarIterations(vec, { minRating: 4, limit: 5 }),
          retrieveSimilarLosers(vec, { maxRating: 2, limit: 3 }),
        ]);
        recipes = r;
        exemplars = w;
        losers = l;
      } catch (err) {
        notes.push(`WARNING: Live retrieval failed: ${err}`);
      }
    } else {
      notes.push("WARNING: Latest iteration has no embedding — retrieval skipped.");
    }
  }

  // 7. Assemble the full director user prompt (same composition as Lab's directSinglePhoto)
  const basePrompt = buildDirectorUserPrompt(photoData);
  const winnersBlock = renderExemplarBlock(exemplars);
  const losersBlock = renderLoserBlock(losers);
  const recipeBlock = renderRecipeBlock(recipes);
  const directorUserPrompt = basePrompt + winnersBlock + losersBlock + recipeBlock;

  // 8. Get director output from latest iteration
  const directorOutput = latestIter?.director_output_json as {
    camera_movement?: string;
    prompt?: string;
    duration_seconds?: number;
    provider_preference?: string | null;
  } | null;

  // 9. Pool counts
  const [{ count: labSessions }, { count: prodRatings }, { count: listingIterations }] = await Promise.all([
    supabase.from("prompt_lab_iterations").select("*", { count: "exact", head: true }),
    supabase.from("scene_ratings").select("*", { count: "exact", head: true }),
    supabase.from("prompt_lab_listing_scene_iterations").select("*", { count: "exact", head: true }),
  ]);

  if (exemplars.length === 0) notes.push("WARNING: No winner exemplars found.");
  if (losers.length === 0) notes.push("INFO: No loser exemplars found.");
  if (recipes.length === 0) notes.push("INFO: No recipe matches found.");

  // 10. Build the V1-specific markdown transcript
  const md = [
    `# V1 Director-Prompt Trace — session ${sessionId}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Session Metadata",
    "",
    `- **Session ID**: ${sessionId}`,
    `- **Label**: ${(session as { label?: string | null }).label ?? "(none)"}`,
    `- **Archetype**: ${(session as { archetype?: string | null }).archetype ?? "(none)"}`,
    `- **Created at**: ${(session as { created_at: string }).created_at}`,
    `- **Image URL**: ${(session as { image_url: string }).image_url}`,
    `- **Total iterations**: ${itersArr.length}`,
    "",
    "## Retrieval Summary",
    "",
    `- WINNERS retrieved: **${exemplars.length}**`,
    `- LOSERS retrieved: **${losers.length}**`,
    `- RECIPE MATCHES: **${recipes.length}**`,
    `- Pool sizes: lab_iters=${labSessions ?? 0}, prod_scene_ratings=${prodRatings ?? 0}, listing_iters=${listingIterations ?? 0}`,
    `- DIRECTOR_SYSTEM length: ${DIRECTOR_SYSTEM.length} chars`,
    `- Director user message total length: **${directorUserPrompt.length} chars**`,
    "",
    "## Notes",
    "",
    ...notes.map((n) => `- ${n}`),
    "",
    "## Analysis (from latest iteration)",
    "",
    "```json",
    JSON.stringify(analysis, null, 2),
    "```",
    "",
    "## WINNERS Block",
    "",
    winnersBlock.trim() || "(empty — no winner exemplars found)",
    "",
    "## LOSERS Block",
    "",
    losersBlock.trim() || "(empty — no loser exemplars found)",
    "",
    "## RECIPE MATCH Block",
    "",
    recipeBlock.trim() || "(empty — no recipe matches found)",
    "",
    "## Full Director User Message",
    "",
    "```",
    directorUserPrompt,
    "```",
    "",
    "## Director Output (iteration 1 stored result)",
    "",
    directorOutput
      ? [
          `- camera_movement: **${directorOutput.camera_movement ?? "?"}**`,
          `- prompt: "${directorOutput.prompt ?? ""}"`,
          `- duration_seconds: ${directorOutput.duration_seconds ?? "?"}`,
          `- provider_preference: ${directorOutput.provider_preference ?? "(none)"}`,
        ].join("\n")
      : "(no director output stored on latest iteration)",
    "",
    "## Iteration History",
    "",
    ...itersArr.map((iter) => {
      const d = (iter.director_output_json ?? {}) as { camera_movement?: string; prompt?: string };
      return [
        `### Iteration ${iter.iteration_number}`,
        `- Created: ${iter.created_at}`,
        `- Rating: ${iter.rating ?? "(unrated)"}`,
        `- Camera movement: ${d.camera_movement ?? "?"}`,
        `- Prompt: "${d.prompt ?? ""}"`,
        `- Cost: ${iter.cost_cents}¢`,
        `- Clip: ${iter.clip_url ?? "(no clip)"}`,
        "",
      ].join("\n");
    }),
  ].join("\n");

  const outPath = `/tmp/director-trace-v1-${sessionId}.md`;
  await writeFile(outPath, md, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log("");
  console.log("V1 Session trace summary:");
  console.log(`  Session: ${sessionId} — ${(session as { label?: string | null }).label ?? "(no label)"}`);
  console.log(`  Iterations: ${itersArr.length}`);
  console.log(`  WINNERS: ${exemplars.length}`);
  console.log(`  LOSERS: ${losers.length}`);
  console.log(`  RECIPES: ${recipes.length}`);
  console.log(`  Director user message: ${directorUserPrompt.length} chars`);
  for (const n of notes) console.log(`  ${n}`);
}

async function writeReport(r: TraceReport): Promise<void> {
  const md = [
    `# Director-Prompt Trace — ${r.kind} ${r.id}`,
    "",
    `Generated: ${r.generatedAt}`,
    "",
    "## Audit checklist",
    "",
    `- Photos total: **${r.photosTotal}**`,
    `- Photos with embedding: **${r.photosWithEmbedding}** ${r.photosWithEmbedding === r.photosTotal && r.photosTotal > 0 ? "✓" : "✗"}`,
    `- Recipe matches: **${r.recipesCount}**`,
    `- Past-winner exemplars: **${r.exemplarsCount}**`,
    `- Past-loser exemplars: **${r.losersCount}**`,
    `- Pool sizes: legacy Lab iters=${r.pools.labSessions}, prod scene_ratings=${r.pools.prodRatings}, listing iters=${r.pools.listingIterations}`,
    `- DIRECTOR_SYSTEM length: ${r.directorSystemLength} chars`,
    `- Director user prompt length: ${r.directorUserPromptLength} chars`,
    "",
    "## Notes",
    "",
    ...r.notes.map((n) => `- ${n}`),
    "",
    "## Full director user message",
    "",
    "```",
    r.directorUserPrompt,
    "```",
    "",
  ].join("\n");
  const path = `/tmp/director-trace-${r.id}.md`;
  await writeFile(path, md, "utf8");
  console.log(`Wrote ${path}`);
  console.log("");
  console.log("Checklist summary:");
  console.log(`  Photos with embedding: ${r.photosWithEmbedding}/${r.photosTotal}`);
  console.log(`  Recipe matches: ${r.recipesCount}`);
  console.log(`  Exemplar matches: ${r.exemplarsCount}`);
  console.log(`  Loser matches: ${r.losersCount}`);
  for (const n of r.notes) console.log(`  ${n}`);
}
