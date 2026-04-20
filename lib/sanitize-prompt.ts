// Strip render-time boilerplate that Haiku sometimes includes in its
// rewrites. The stability prefix is applied by render.ts only for
// kling-v3-* models; it must NEVER live in scene.director_prompt.

const STABILITY_PREFIX_PATTERNS = [
  /LOCKED-OFF CAMERA[^.]*\.\s*/gi,
  /(?:Smooth|Steady)?\s*motorized dolly motion only\.\s*/gi,
  /(?:Zero|No)\s+camera shake,?\s+(?:zero|no)\s+handheld jitter,?\s+tripod-stable framing\.\s*/gi,
  /gimbal-stabilized Steadicam rig\.\s*/gi,
];

/** Strip render-time stability prefixes from a director prompt. */
export function stripStabilityPrefix(prompt: string): string {
  let out = prompt;
  for (const pattern of STABILITY_PREFIX_PATTERNS) {
    out = out.replace(pattern, "");
  }
  return out.trim();
}

/** Full sanitation: strip prefix + collapse repeated whitespace. */
export function sanitizeDirectorPrompt(prompt: string): string {
  return stripStabilityPrefix(prompt).replace(/\s+/g, " ").trim();
}
