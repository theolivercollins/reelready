import type { LabListingScene, LabListingIteration } from "./labListingsApi";

export type SceneStatusKind =
  | "archived"
  | "needs_first_render"
  | "rendering"
  | "failed"
  | "needs_rating"
  | "iterating"
  | "done";

export interface SceneStatus {
  kind: SceneStatusKind;
  latestIteration: LabListingIteration | null;
  bestRating: number | null;
}

export interface SceneStatusInput {
  scene: LabListingScene;
  iterations: LabListingIteration[];
}

export function resolveSceneStatus({ scene, iterations }: SceneStatusInput): SceneStatus {
  if (scene.archived) {
    return { kind: "archived", latestIteration: null, bestRating: null };
  }

  const visible = iterations.filter((i) => !i.archived);
  const byNum = [...visible].sort((a, b) => b.iteration_number - a.iteration_number);
  const latest = byNum[0] ?? null;
  const bestRating = visible.reduce<number | null>((best, i) => {
    if (i.rating === null) return best;
    return best === null || i.rating > best ? i.rating : best;
  }, null);

  if (visible.length === 0) {
    return { kind: "needs_first_render", latestIteration: null, bestRating: null };
  }

  if (bestRating !== null && bestRating >= 4) {
    return { kind: "done", latestIteration: latest, bestRating };
  }

  if (latest) {
    if (latest.render_error) {
      return { kind: "failed", latestIteration: latest, bestRating };
    }
    if (latest.provider_task_id && !latest.clip_url) {
      return { kind: "rendering", latestIteration: latest, bestRating };
    }
    if (latest.clip_url && latest.rating === null) {
      return { kind: "needs_rating", latestIteration: latest, bestRating };
    }
    if (
      latest.rating !== null &&
      latest.rating <= 3 &&
      scene.refinement_notes &&
      scene.refinement_notes.trim().length > 0
    ) {
      return { kind: "iterating", latestIteration: latest, bestRating };
    }
  }

  return { kind: "needs_rating", latestIteration: latest, bestRating };
}
