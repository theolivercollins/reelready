import { Router } from "express";
import {
  updateSceneStatus,
  updateScene,
  log,
} from "@reelready/db";
import { getSupabase } from "@reelready/db";
import { generationQueue } from "@reelready/pipeline";

export const scenesRouter = Router();

// GET /api/scenes/:id — Scene detail with QC history
scenesRouter.get("/:id", async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from("scenes")
      .select("*, photos(*)")
      .eq("id", req.params.id)
      .single();

    if (error) throw error;

    // Get QC log history for this scene
    const { data: logs } = await getSupabase()
      .from("pipeline_logs")
      .select()
      .eq("scene_id", req.params.id)
      .order("created_at", { ascending: true });

    res.json({ ...data, logs: logs ?? [] });
  } catch (err) {
    res.status(404).json({ error: "Scene not found" });
  }
});

// POST /api/scenes/:id/approve — HITL: approve despite QC failure
scenesRouter.post("/:id/approve", async (req, res) => {
  try {
    await updateSceneStatus(req.params.id, "qc_pass");

    const { data: scene } = await getSupabase()
      .from("scenes")
      .select("property_id, scene_number")
      .eq("id", req.params.id)
      .single();

    if (scene) {
      await log(
        scene.property_id,
        "qc",
        "info",
        `Scene ${scene.scene_number} manually approved by operator`,
        undefined,
        req.params.id
      );
    }

    res.json({ message: "Scene approved" });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve scene" });
  }
});

// POST /api/scenes/:id/retry — HITL: retry with modified prompt
scenesRouter.post("/:id/retry", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const { data: scene } = await getSupabase()
      .from("scenes")
      .select("property_id, scene_number")
      .eq("id", req.params.id)
      .single();

    if (!scene) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }

    await updateScene(req.params.id, { prompt, status: "pending" });

    await generationQueue.add(
      `generate-${scene.scene_number}-manual-retry`,
      { propertyId: scene.property_id, sceneId: req.params.id }
    );

    await log(
      scene.property_id,
      "generation",
      "info",
      `Scene ${scene.scene_number} manually retried with modified prompt`,
      { newPrompt: prompt },
      req.params.id
    );

    res.json({ message: "Scene queued for retry" });
  } catch (err) {
    res.status(500).json({ error: "Failed to retry scene" });
  }
});

// POST /api/scenes/:id/skip — HITL: skip this scene
scenesRouter.post("/:id/skip", async (req, res) => {
  try {
    const { data: scene } = await getSupabase()
      .from("scenes")
      .select("property_id, scene_number")
      .eq("id", req.params.id)
      .single();

    if (!scene) {
      res.status(404).json({ error: "Scene not found" });
      return;
    }

    // Mark as passed so it doesn't block assembly, but remove clip_url so it's excluded
    await updateScene(req.params.id, { status: "qc_pass", clip_url: null });

    await log(
      scene.property_id,
      "qc",
      "info",
      `Scene ${scene.scene_number} skipped by operator`,
      undefined,
      req.params.id
    );

    res.json({ message: "Scene skipped" });
  } catch (err) {
    res.status(500).json({ error: "Failed to skip scene" });
  }
});
