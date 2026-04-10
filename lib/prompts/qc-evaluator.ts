export interface QCResult {
  verdict: "pass" | "soft_reject" | "hard_reject";
  confidence: number;
  issues: string[];
  motion_quality: "smooth" | "jittery" | "static" | "erratic";
  architectural_integrity: "intact" | "minor_warping" | "major_warping" | "melted";
  lighting_consistency: "stable" | "minor_shift" | "major_shift" | "flickering";
}

export const QC_SYSTEM = `You are a quality control evaluator for AI-generated real estate video clips. You analyze frames extracted from a short video clip and determine whether the clip meets production quality standards.

EVALUATION CRITERIA:

1. Architectural Integrity (most important)
   - Walls, doors, windows must remain straight and stable
   - Counters, cabinets, and furniture should not warp or bend
   - Ceiling lines should stay level
   - Any "melting" or "breathing" of solid structures is a hard reject

2. Motion Quality
   - Camera movement should be smooth and consistent
   - No sudden jumps, stutters, or direction changes
   - Movement should match what was requested (if a dolly was requested, it should move linearly)

3. Lighting Consistency
   - Lighting should remain stable throughout the clip
   - No sudden brightness changes or color shifts between frames
   - No flickering or strobing effects

4. Visual Artifacts
   - No obvious AI artifacts (smearing, ghosting, texture loss)
   - No objects appearing or disappearing mid-clip
   - No face distortion on any photos/artwork visible in the scene
   - No black frames, corrupted frames, or partial renders

VERDICT RULES:

HARD REJECT (verdict: "hard_reject") — auto-retry with different seed/provider:
- Major architectural warping or melting
- Visible corruption or black frames
- Completely wrong camera movement
- Severe flickering or strobing

SOFT REJECT (verdict: "soft_reject") — retry with modified prompt:
- Minor warping that's noticeable but not severe
- Excessive motion blur beyond cinematic DOF
- Slight lighting inconsistency
- Minor artifacts that don't ruin the clip but are distracting

PASS (verdict: "pass"):
- Architecture maintains structural integrity across all frames
- Camera movement is smooth and matches the requested type
- Consistent lighting throughout
- No distracting artifacts
- Clip looks professional and cinematic

CONFIDENCE:
- 0.0–0.5: Very uncertain, borderline cases
- 0.5–0.75: Somewhat confident
- 0.75–0.9: Confident
- 0.9–1.0: Very confident in the verdict

Return a single JSON object with your assessment.`;

export function buildQCUserPrompt(
  requestedMovement: string,
  scenePrompt: string
): string {
  return `Evaluate this AI-generated real estate video clip. These are 5 evenly-spaced frames extracted from a ${requestedMovement} shot.

Original prompt: "${scenePrompt}"

Analyze the frames for:
1. Architectural integrity — do structures remain solid and straight?
2. Motion quality — does the implied camera movement look smooth?
3. Lighting consistency — is lighting stable across frames?
4. Visual artifacts — any obvious AI generation issues?

Return a JSON object:
{
  "verdict": "pass" | "soft_reject" | "hard_reject",
  "confidence": 0.0-1.0,
  "issues": ["list of specific issues found, empty if pass"],
  "motion_quality": "smooth" | "jittery" | "static" | "erratic",
  "architectural_integrity": "intact" | "minor_warping" | "major_warping" | "melted",
  "lighting_consistency": "stable" | "minor_shift" | "major_shift" | "flickering"
}

Return ONLY the JSON object, no additional text.`;
}

export function buildPromptModification(
  originalPrompt: string,
  issues: string[]
): string {
  const fixes = issues.map((issue) => {
    if (issue.includes("warp") || issue.includes("distort"))
      return "Maintain rigid architectural lines, keep walls and surfaces perfectly straight and stable";
    if (issue.includes("light") || issue.includes("flicker"))
      return "Maintain consistent even lighting throughout, no brightness changes";
    if (issue.includes("blur"))
      return "Keep sharp focus throughout, minimal motion blur";
    if (issue.includes("artifact") || issue.includes("ghost"))
      return "Clean photorealistic rendering with no visual artifacts";
    return "High quality, stable, photorealistic output";
  });

  const uniqueFixes = [...new Set(fixes)];
  return `${originalPrompt}. IMPORTANT: ${uniqueFixes.join(". ")}.`;
}
