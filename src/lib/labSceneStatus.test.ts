import { describe, it, expect } from "vitest";
import { resolveSceneStatus, type SceneStatusInput } from "./labSceneStatus";
import type { LabListingScene, LabListingIteration } from "./labListingsApi";

function scene(overrides: Partial<LabListingScene> = {}): LabListingScene {
  return {
    id: "s1",
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

function iter(overrides: Partial<LabListingIteration> = {}): LabListingIteration {
  return {
    id: "i1",
    scene_id: "s1",
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

describe("resolveSceneStatus", () => {
  it("returns 'archived' when scene.archived is true", () => {
    const input: SceneStatusInput = { scene: scene({ archived: true }), iterations: [] };
    expect(resolveSceneStatus(input).kind).toBe("archived");
  });

  it("returns 'needs_first_render' when scene has no iterations", () => {
    const input: SceneStatusInput = { scene: scene(), iterations: [] };
    expect(resolveSceneStatus(input).kind).toBe("needs_first_render");
  });

  it("returns 'rendering' when latest iteration has task_id but no clip_url and no error", () => {
    const input: SceneStatusInput = {
      scene: scene(),
      iterations: [iter({ provider_task_id: "tsk_1", clip_url: null, render_error: null })],
    };
    expect(resolveSceneStatus(input).kind).toBe("rendering");
  });

  it("returns 'needs_rating' when latest iteration has clip but rating IS NULL", () => {
    const input: SceneStatusInput = {
      scene: scene(),
      iterations: [iter({ clip_url: "https://x/y.mp4", rating: null, status: "rendered" })],
    };
    expect(resolveSceneStatus(input).kind).toBe("needs_rating");
  });

  it("returns 'iterating' when latest rating is 1-3 and refinement_notes exist", () => {
    const input: SceneStatusInput = {
      scene: scene({ refinement_notes: "make it slower" }),
      iterations: [iter({ clip_url: "https://x/y.mp4", rating: 2, status: "rated" })],
    };
    expect(resolveSceneStatus(input).kind).toBe("iterating");
  });

  it("returns 'done' when any iteration is rated >= 4", () => {
    const input: SceneStatusInput = {
      scene: scene(),
      iterations: [
        iter({ id: "i1", iteration_number: 1, clip_url: "https://x/1.mp4", rating: 2 }),
        iter({ id: "i2", iteration_number: 2, clip_url: "https://x/2.mp4", rating: 5 }),
      ],
    };
    expect(resolveSceneStatus(input).kind).toBe("done");
  });

  it("ignores archived iterations when computing status", () => {
    const input: SceneStatusInput = {
      scene: scene(),
      iterations: [iter({ clip_url: "https://x/y.mp4", rating: 5, archived: true })],
    };
    expect(resolveSceneStatus(input).kind).toBe("needs_first_render");
  });

  it("returns 'failed' when latest iteration has render_error", () => {
    const input: SceneStatusInput = {
      scene: scene(),
      iterations: [iter({ provider_task_id: "tsk_1", render_error: "timeout", status: "failed" })],
    };
    expect(resolveSceneStatus(input).kind).toBe("failed");
  });
});

describe("priority ordering for table rows", () => {
  const PRIORITY = {
    needs_rating: 0,
    failed: 1,
    iterating: 2,
    needs_first_render: 3,
    rendering: 4,
    done: 5,
    archived: 6,
  } as const;

  it("priorities are strictly increasing from needs_rating to archived", () => {
    const kinds: Array<keyof typeof PRIORITY> = [
      "needs_rating", "failed", "iterating", "needs_first_render", "rendering", "done", "archived",
    ];
    for (let i = 0; i < kinds.length - 1; i++) {
      expect(PRIORITY[kinds[i]]).toBeLessThan(PRIORITY[kinds[i + 1]]);
    }
  });
});
