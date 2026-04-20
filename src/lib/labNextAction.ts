import type { LabListingScene, LabListingIteration } from "./labListingsApi";
import { resolveSceneStatus, type SceneStatus } from "./labSceneStatus";

export type NextAction =
  | { kind: "all_done"; cta: string }
  | { kind: "rate"; sceneId: string; cta: string }
  | { kind: "retry_failed"; sceneId: string; cta: string }
  | { kind: "render_batch"; sceneIds: string[]; cta: string }
  | { kind: "iterate"; sceneId: string; cta: string }
  | { kind: "waiting"; cta: string };

export interface NextActionInput {
  scenes: LabListingScene[];
  iterations: LabListingIteration[];
}

interface ScoredScene {
  scene: LabListingScene;
  status: SceneStatus;
}

export function resolveNextAction({ scenes, iterations }: NextActionInput): NextAction {
  const scored: ScoredScene[] = scenes
    .filter((s) => !s.archived)
    .map((s) => ({
      scene: s,
      status: resolveSceneStatus({
        scene: s,
        iterations: iterations.filter((i) => i.scene_id === s.id),
      }),
    }));

  if (scored.length === 0) {
    return { kind: "all_done", cta: "No scenes planned" };
  }

  const byKind = (k: SceneStatus["kind"]) => scored.filter((x) => x.status.kind === k);

  const needsRating = byKind("needs_rating");
  if (needsRating.length > 0) {
    const s = needsRating[0].scene;
    return {
      kind: "rate",
      sceneId: s.id,
      cta: `Rate scene ${s.scene_number} — ${s.room_type} (${needsRating.length} unrated)`,
    };
  }

  const failed = byKind("failed");
  if (failed.length > 0) {
    const s = failed[0].scene;
    return {
      kind: "retry_failed",
      sceneId: s.id,
      cta: `Retry scene ${s.scene_number} — ${s.room_type} (render failed)`,
    };
  }

  const needsRender = byKind("needs_first_render");
  if (needsRender.length > 0) {
    return {
      kind: "render_batch",
      sceneIds: needsRender.map((x) => x.scene.id),
      cta: `Render ${needsRender.length} scene${needsRender.length === 1 ? "" : "s"} that need a first pass`,
    };
  }

  const iterating = byKind("iterating");
  if (iterating.length > 0) {
    const s = iterating[0].scene;
    return {
      kind: "iterate",
      sceneId: s.id,
      cta: `Iterate scene ${s.scene_number} — refinement notes pending`,
    };
  }

  const rendering = byKind("rendering");
  if (rendering.length > 0) {
    return {
      kind: "waiting",
      cta: `Waiting for ${rendering.length} render${rendering.length === 1 ? "" : "s"} to finish`,
    };
  }

  return { kind: "all_done", cta: "All scenes rated ≥ 4★" };
}
