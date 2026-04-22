/**
 * P2 — Gemini auto-judge provider wrapper (SKELETON).
 *
 * Status: pre-cooked 2026-04-22 on branch session/p2-s1-implementation-draft.
 * NOT WIRED. The actual Gemini API binding is deliberately stubbed — P2
 * Session 1 (2026-04-23) fills it in after verifying:
 *   - Gemini 3 Flash accepts inline video frame arrays via @google/genai SDK
 *     (pattern mirror of lib/providers/gemini-analyzer.ts)
 *   - GEMINI_API_KEY billing covers the video-judging endpoint (Oliver's Q2
 *     resolution: defer to first-call verification)
 *   - 6-frame sample latency (Q2: 6 frames to start; widen if <70% agreement)
 *
 * This skeleton exists so P2 Session 1's gemini-judge.test.ts + endpoint
 * wiring can be landed before the binding is confirmed working. Kill-switch:
 * JUDGE_ENABLED env (default "false"). When disabled, judgeLabIteration
 * throws JudgeDisabledError before any API call.
 */

import type { JudgeRubricResult } from "../prompts/judge-rubric.js";
import { RUBRIC_VERSION, JUDGE_SYSTEM_PROMPT, validateJudgeOutput } from "../prompts/judge-rubric.js";
import { recordCostEvent } from "../db.js";

export interface JudgeInput {
  clipUrl: string;
  /** Source photo bytes (per Oliver Q1: pass bytes, not analysis_json text). */
  photoBytes?: Buffer;
  directorPrompt: string;
  cameraMovement: string;
  roomType: string;
  iterationId: string;
  /** Few-shot calibration examples scoped to same (room × movement) bucket. Empty for V0 launch. */
  calibrationExamples?: Array<{ judge_rating_json: JudgeRubricResult; oliver_correction_json?: JudgeRubricResult }>;
}

export interface JudgeOutput extends JudgeRubricResult {
  judge_model: string;
  judge_version: string;
  latency_ms: number;
  cost_cents: number;
}

export class JudgeDisabledError extends Error {
  constructor() {
    super("JUDGE_ENABLED !== 'true'; judge skipped. See docs/state/P2-IMPLEMENTATION-STATUS.md.");
    this.name = "JudgeDisabledError";
  }
}

const JUDGE_MODEL_DEFAULT = "gemini-3-flash";

/**
 * Judge a single iteration's clip. Returns the full rubric output or throws.
 * JUDGE_ENABLED=true required. Always logs a cost_event (with subtype='judge')
 * whether the call succeeds or fails (failure writes metadata.judge_error).
 *
 * IMPLEMENTATION DEFERRED to P2 S1: the actual Gemini call is a TODO. The
 * structure + validation + cost accounting + error pathway are wired.
 */
export async function judgeLabIteration(input: JudgeInput): Promise<JudgeOutput> {
  if (process.env.JUDGE_ENABLED !== "true") {
    throw new JudgeDisabledError();
  }

  const startedAt = Date.now();
  const judge_model = process.env.JUDGE_MODEL ?? JUDGE_MODEL_DEFAULT;

  try {
    // TODO(p2-s1): replace with actual Gemini call following the pattern in
    // lib/providers/gemini-analyzer.ts.
    //   1. Extract 6 frames from clip via ffmpeg or delegate to video-capable
    //      Gemini endpoint (if Gemini 3 Flash accepts video URL directly,
    //      skip frame extraction)
    //   2. Compose prompt: JUDGE_SYSTEM_PROMPT + optional few-shot from
    //      input.calibrationExamples + photoBytes + frames + directorPrompt.
    //   3. Call Gemini with structured-output / JSON-schema forcing.
    //   4. Parse response JSON; pass through validateJudgeOutput.
    //   5. Return JudgeOutput with latency + cost_cents.
    //
    // For the skeleton, throw a clear TODO error so the pathway is obviously
    // not-yet-wired.
    void JUDGE_SYSTEM_PROMPT; // keep import alive during skeleton phase
    void validateJudgeOutput; // same
    throw new Error(
      "gemini-judge.ts binding not yet implemented (P2 S1 pending). " +
        "To wire: follow the TODO(p2-s1) block in lib/providers/gemini-judge.ts.",
    );
  } catch (err) {
    const latency_ms = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    // Cost event on failure so we still track any partial API consumption.
    try {
      await recordCostEvent({
        propertyId: "00000000-0000-0000-0000-000000000000",
        sceneId: null,
        stage: "analysis",
        provider: "google",
        unitsConsumed: 1,
        unitType: "tokens",
        costCents: 0,
        metadata: {
          subtype: "judge",
          surface: "lab",
          iteration_id: input.iterationId,
          judge_model,
          judge_version: RUBRIC_VERSION,
          judge_error: message,
          latency_ms,
        },
      });
    } catch {
      // Do not let cost-event failure mask the original judge error.
    }
    throw err;
  }
}
