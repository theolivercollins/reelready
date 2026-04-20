export interface DirectorIntent {
  room_type: string;
  motion: string;
  subject: string;
  end_subject: string | null;
  style: string[];
  mood: string;
  shot_style: string | null;
  foreground_element: string | null;
}

export const DEFAULT_STYLE: readonly string[] = ["smooth", "cinematic"];
export const DEFAULT_MOOD = "modern_luxury";

export function parseDirectorIntent(raw: unknown): DirectorIntent {
  if (!raw || typeof raw !== "object") {
    throw new Error("DirectorIntent: input must be a non-null object");
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.room_type !== "string" || !r.room_type) {
    throw new Error("DirectorIntent: room_type is required");
  }
  if (typeof r.motion !== "string" || !r.motion) {
    throw new Error("DirectorIntent: motion is required");
  }
  if (typeof r.subject !== "string" || !r.subject) {
    throw new Error("DirectorIntent: subject is required");
  }

  const rawStyle = r.style;
  let style: string[];
  if (Array.isArray(rawStyle)) {
    style = rawStyle.filter((s): s is string => typeof s === "string");
    if (style.length === 0) style = [...DEFAULT_STYLE];
  } else if (typeof rawStyle === "string" && rawStyle.length > 0) {
    style = [rawStyle];
  } else {
    style = [...DEFAULT_STYLE];
  }

  return {
    room_type: r.room_type,
    motion: r.motion,
    subject: r.subject,
    end_subject: typeof r.end_subject === "string" && r.end_subject ? r.end_subject : null,
    style,
    mood: typeof r.mood === "string" && r.mood ? r.mood : DEFAULT_MOOD,
    shot_style: typeof r.shot_style === "string" && r.shot_style ? r.shot_style : null,
    foreground_element: typeof r.foreground_element === "string" && r.foreground_element
      ? r.foreground_element
      : null,
  };
}
