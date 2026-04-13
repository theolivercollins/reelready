// GET /api/admin/settings        → return all app_settings as a flat object
// POST /api/admin/settings       → upsert one or more keys
//   body: { primary_video_provider: "auto" | "runway" | "kling" | "luma" | "higgsfield" }
//
// Admin-only in spirit — the frontend route is behind the RequireAdmin
// guard. The Supabase table has RLS policies that additionally restrict
// writes to admins when called with a user JWT, and the service-role
// server path bypasses RLS for the trusted server code below.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getAllAppSettings,
  setAppSetting,
  isPrimaryVideoProvider,
  type AppSettingSchema,
} from "../../lib/app-settings.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method === "GET") {
    try {
      const settings = await getAllAppSettings();
      return res.status(200).json(settings);
    } catch (err) {
      console.error("[api/admin/settings] GET failed:", err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (req.method === "POST") {
    const body = (req.body ?? {}) as Partial<AppSettingSchema>;
    const applied: Partial<AppSettingSchema> = {};
    const rejected: Record<string, string> = {};

    if ("primary_video_provider" in body) {
      const v = body.primary_video_provider;
      if (isPrimaryVideoProvider(v)) {
        try {
          await setAppSetting("primary_video_provider", v);
          applied.primary_video_provider = v;
        } catch (err) {
          rejected.primary_video_provider =
            err instanceof Error ? err.message : "write failed";
        }
      } else {
        rejected.primary_video_provider = `invalid value: ${String(v)}`;
      }
    }

    const statusCode = Object.keys(rejected).length > 0 ? 400 : 200;
    return res.status(statusCode).json({
      applied,
      rejected,
      current: await getAllAppSettings(),
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
