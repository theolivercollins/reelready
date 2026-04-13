// Global application settings read/write helpers.
//
// Settings are stored in the `app_settings` table (see
// supabase/migrations/002_app_settings.sql). This module is the only
// place that reads/writes that table so the set of known keys and their
// types stay in one place.
//
// Adding a new setting:
//   1. Add it to `AppSettingSchema` below.
//   2. Add a default in `DEFAULT_SETTINGS`.
//   3. If you want the migration to seed it, add it to 002_app_settings.sql.
//   4. Read it via `getAppSetting("your_key")`.

import { getSupabase } from "./db.js";
import type { VideoProvider } from "./types.js";

// ─── Schema ─────────────────────────────────────────────────────
// `PrimaryVideoProvider` is either one of the concrete providers OR
// "auto", which means "use the router's per-room-type defaults".
export type PrimaryVideoProvider = "auto" | VideoProvider;

export interface AppSettingSchema {
  primary_video_provider: PrimaryVideoProvider;
}

export const DEFAULT_SETTINGS: AppSettingSchema = {
  primary_video_provider: "auto",
};

const VALID_PRIMARY_PROVIDERS: PrimaryVideoProvider[] = [
  "auto",
  "runway",
  "kling",
  "luma",
  "higgsfield",
];

export function isPrimaryVideoProvider(
  value: unknown
): value is PrimaryVideoProvider {
  return (
    typeof value === "string" &&
    (VALID_PRIMARY_PROVIDERS as string[]).includes(value)
  );
}

// ─── Cache ──────────────────────────────────────────────────────
// In-memory cache to avoid hitting Supabase on every selectProvider
// call. TTL is short so dashboard edits propagate within seconds.
const CACHE_TTL_MS = 5_000;
let cache: { value: AppSettingSchema; expiresAt: number } | null = null;

function invalidateCache(): void {
  cache = null;
}

// ─── Public API ─────────────────────────────────────────────────

export async function getAllAppSettings(): Promise<AppSettingSchema> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }

  const { data, error } = await getSupabase()
    .from("app_settings")
    .select("key, value");

  // If the table doesn't exist yet (pre-migration) or the query fails,
  // fall back to defaults rather than throwing and bricking the
  // pipeline. The error is logged so it shows up in Vercel logs.
  if (error) {
    console.error("[app-settings] read failed, using defaults:", error);
    return { ...DEFAULT_SETTINGS };
  }

  const merged: AppSettingSchema = { ...DEFAULT_SETTINGS };
  for (const row of data ?? []) {
    if (row.key === "primary_video_provider" && isPrimaryVideoProvider(row.value)) {
      merged.primary_video_provider = row.value;
    }
  }

  cache = { value: merged, expiresAt: now + CACHE_TTL_MS };
  return merged;
}

export async function getAppSetting<K extends keyof AppSettingSchema>(
  key: K
): Promise<AppSettingSchema[K]> {
  const all = await getAllAppSettings();
  return all[key];
}

export async function setAppSetting<K extends keyof AppSettingSchema>(
  key: K,
  value: AppSettingSchema[K],
  updatedBy?: string | null
): Promise<void> {
  const { error } = await getSupabase()
    .from("app_settings")
    .upsert(
      {
        key,
        value,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy ?? null,
      },
      { onConflict: "key" }
    );
  if (error) throw error;
  invalidateCache();
}

// Synchronous read for the pipeline — uses the cache if fresh, returns
// defaults if the cache is cold. Callers that need guaranteed freshness
// should use `getAppSetting` (async). This exists so `selectProvider`
// can stay synchronous.
export function getAppSettingSync<K extends keyof AppSettingSchema>(
  key: K
): AppSettingSchema[K] {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value[key];
  }
  return DEFAULT_SETTINGS[key];
}

// Prime the cache from the pipeline entrypoint so `getAppSettingSync`
// returns real values for the duration of a pipeline run.
export async function primeAppSettings(): Promise<void> {
  await getAllAppSettings();
}
