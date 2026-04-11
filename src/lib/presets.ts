import { supabase } from "./supabase";

export interface Preset {
  id: string;
  name: string;
  createdAt: string;
  selectedPackage: string | null;
  selectedDuration: string | null;
  selectedOrientation: string | null;
  addVoiceover: boolean;
  addVoiceClone: boolean;
  addCustomRequest: boolean;
  customRequestText: string;
}

const STORAGE_KEY = "keyframe_presets";

// Get presets from server if authenticated, otherwise localStorage
export async function getPresets(): Promise<Preset[]> {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    const { data } = await supabase
      .from("user_profiles")
      .select("presets")
      .eq("user_id", session.user.id)
      .single();
    return (data?.presets as Preset[]) || [];
  }

  // Fallback to localStorage for unauthenticated users
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function savePreset(preset: Omit<Preset, "id" | "createdAt">): Promise<Preset> {
  const newPreset: Preset = {
    ...preset,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    const presets = await getPresets();
    presets.push(newPreset);
    await supabase
      .from("user_profiles")
      .update({ presets, updated_at: new Date().toISOString() })
      .eq("user_id", session.user.id);
  } else {
    const presets = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    presets.push(newPreset);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  }

  return newPreset;
}

export async function deletePreset(id: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    const presets = (await getPresets()).filter(p => p.id !== id);
    await supabase
      .from("user_profiles")
      .update({ presets, updated_at: new Date().toISOString() })
      .eq("user_id", session.user.id);
  } else {
    const presets = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
      .filter((p: Preset) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  }
}

// Migrate localStorage presets to server on first authenticated login
export async function migrateLocalPresets(): Promise<void> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  const localPresets: Preset[] = JSON.parse(raw);
  if (localPresets.length === 0) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const serverPresets = await getPresets();
  const existingIds = new Set(serverPresets.map(p => p.id));
  const newPresets = localPresets.filter(p => !existingIds.has(p.id));

  if (newPresets.length > 0) {
    const merged = [...serverPresets, ...newPresets];
    await supabase
      .from("user_profiles")
      .update({ presets: merged, updated_at: new Date().toISOString() })
      .eq("user_id", session.user.id);
  }

  // Clear localStorage after migration
  localStorage.removeItem(STORAGE_KEY);
}
