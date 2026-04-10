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

export function getPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePreset(preset: Omit<Preset, "id" | "createdAt">): Preset {
  const presets = getPresets();
  const newPreset: Preset = {
    ...preset,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  presets.push(newPreset);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  return newPreset;
}

export function deletePreset(id: string): void {
  const presets = getPresets().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}
