import { describe, it, expect } from "vitest";
import { resolveNextAction } from "./labNextAction";
import type { LabListingScene, LabListingIteration } from "./labListingsApi";

function scene(id: string, overrides: Partial<LabListingScene> = {}): LabListingScene {
  return {
    id,
    listing_id: "l1",
    scene_number: 1,
    photo_id: "p1",
    end_photo_id: null,
    end_image_url: null,
    room_type: "kitchen",
    camera_movement: "push_in",
    director_prompt: "test",
    director_intent: {},
    refinement_notes: null,
    use_end_frame: false,
    archived: false,
    chat_messages: [],
    created_at: "2026-04-20T00:00:00Z",
    ...overrides,
  };
}

function iter(sceneId: string, overrides: Partial<LabListingIteration> = {}): LabListingIteration {
  return {
    id: "i" + Math.random().toString(36).slice(2, 7),
    scene_id: sceneId,
    iteration_number: 1,
    director_prompt: "test",
    model_used: "kling-v3-pro",
    provider_task_id: null,
    clip_url: null,
    rating: null,
    tags: null,
    user_comment: null,
    cost_cents: 0,
    status: "queued",
    render_error: null,
    chat_messages: [],
    rating_reasons: [],
    archived: false,
    created_at: "2026-04-20T00:00:00Z",
    ...overrides,
  };
}

describe("resolveNextAction", () => {
  it("returns 'all_done' when all non-archived scenes are done", () => {
    const scenes = [scene("s1"), scene("s2")];
    const iterations = [
      iter("s1", { clip_url: "x", rating: 5 }),
      iter("s2", { clip_url: "x", rating: 4 }),
    ];
    const action = resolveNextAction({ scenes, iterations });
    expect(action.kind).toBe("all_done");
  });

  it("prioritizes 'rate' over 'render' when both are pending", () => {
    const scenes = [scene("s1"), scene("s2")];
    const iterations = [iter("s2", { clip_url: "https://x/y.mp4", rating: null, status: "rendered" })];
    const action = resolveNextAction({ scenes, iterations });
    expect(action.kind).toBe("rate");
    expect(action.sceneId).toBe("s2");
  });

  it("returns 'render_batch' listing all scenes that need a first render", () => {
    const scenes = [scene("s1"), scene("s2"), scene("s3")];
    const iterations = [iter("s2", { clip_url: "x", rating: 5 })];
    const action = resolveNextAction({ scenes, iterations });
    expect(action.kind).toBe("render_batch");
    if (action.kind === "render_batch") {
      expect(action.sceneIds.sort()).toEqual(["s1", "s3"]);
    }
  });

  it("returns 'waiting' when all pending work is rendering", () => {
    const scenes = [scene("s1")];
    const iterations = [iter("s1", { provider_task_id: "tsk" })];
    const action = resolveNextAction({ scenes, iterations });
    expect(action.kind).toBe("waiting");
  });

  it("returns 'retry_failed' when a scene has a failed latest iteration", () => {
    const scenes = [scene("s1")];
    const iterations = [iter("s1", { provider_task_id: "tsk", render_error: "timeout", status: "failed" })];
    const action = resolveNextAction({ scenes, iterations });
    expect(action.kind).toBe("retry_failed");
    if (action.kind === "retry_failed") expect(action.sceneId).toBe("s1");
  });

  it("ignores archived scenes", () => {
    const scenes = [scene("s1", { archived: true }), scene("s2")];
    const iterations = [iter("s2", { clip_url: "x", rating: 5 })];
    const action = resolveNextAction({ scenes, iterations });
    expect(action.kind).toBe("all_done");
  });
});
