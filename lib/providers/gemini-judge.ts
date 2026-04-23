/**
 * P2 — Gemini auto-judge provider wrapper.
 *
 * Kill-switch: JUDGE_ENABLED env (default "false"). When disabled,
 * judgeLabIteration throws JudgeDisabledError before any API call.
 *
 * Binding: calls @google/genai generateContent with:
 *   - clip as fileData (video/mp4) — Gemini's video understanding handles sampling
 *   - source photo as inlineData (if supplied)
 *   - JUDGE_SYSTEM_PROMPT + few-shot calibration examples in user message
 *   - responseMimeType="application/json" + temperature=0.1 for structured output
 */

import { GoogleGenAI } from "@google/genai";
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

// gemini-2.5-flash is the stable video-understanding model. gemini-3-flash-preview
// has stricter tier quotas that 429'd on first judge call 2026-04-22; switched to
// 2.5-flash which worked cleanly (~21s latency, ~2¢/call). Override via JUDGE_MODEL.
const JUDGE_MODEL_DEFAULT = "gemini-2.5-flash";

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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY required for judge");

    // Build few-shot preamble from calibration examples (same bucket only).
    const fewShot = (input.calibrationExamples ?? [])
      .slice(0, 3)
      .map(
        (ex, i) =>
          `Example ${i + 1}:\nJudge rating: ${JSON.stringify(ex.judge_rating_json)}${
            ex.oliver_correction_json
              ? `\nOliver's correction: ${JSON.stringify(ex.oliver_correction_json)}`
              : ""
          }`,
      )
      .join("\n\n");

    // Source photo as inline base64 (per Oliver Q1: pass bytes, not analysis text).
    const photoInline = input.photoBytes
      ? [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: input.photoBytes.toString("base64"),
            },
          },
        ]
      : [];

    const userText = [
      fewShot ? `CALIBRATION EXAMPLES:\n${fewShot}\n\n---\n` : "",
      `Director intended camera_movement: ${input.cameraMovement}`,
      `Room: ${input.roomType}`,
      `Director prompt: ${input.directorPrompt}`,
      `\nJudge the clip against the rubric. Return only the JSON schema.`,
    ].join("\n");

    const genai = new GoogleGenAI({ apiKey });

    const resp = await genai.models.generateContent({
      model: judge_model,
      contents: [
        {
          role: "user",
          parts: [
            { text: userText },
            ...photoInline,
            { fileData: { fileUri: input.clipUrl, mimeType: "video/mp4" } },
          ],
        },
      ],
      config: {
        systemInstruction: JUDGE_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    // Extract text — mirror gemini-analyzer.ts's res.text pattern.
    const rawText =
      resp.text ??
      (resp as unknown as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
        ?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "";

    if (!rawText) {
      throw new Error(
        `Judge returned no text (finishReason=${
          (resp as unknown as { candidates?: Array<{ finishReason?: string }> })
            ?.candidates?.[0]?.finishReason ?? "unknown"
        })`,
      );
    }

    let parsed: unknown;
    try {
      // Strip optional markdown fences Gemini occasionally emits.
      const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(`Judge returned non-JSON: ${rawText.slice(0, 200)}`);
    }

    const validation = validateJudgeOutput(parsed);
    if (!validation.ok) {
      throw new Error(`Judge output validation failed: ${validation.error}`);
    }

    const latency_ms = Date.now() - startedAt;
    const cost_cents = 2; // ~$0.02 estimate; revisit after first invoice

    try {
      await recordCostEvent({
        propertyId: "00000000-0000-0000-0000-000000000000",
        sceneId: null,
        stage: "analysis",
        provider: "google",
        unitsConsumed: 1,
        unitType: "tokens",
        costCents: cost_cents,
        metadata: {
          subtype: "judge",
          surface: "lab",
          iteration_id: input.iterationId,
          judge_model,
          judge_version: RUBRIC_VERSION,
          latency_ms,
        },
      });
    } catch { /* non-fatal */ }

    return {
      ...validation.result,
      judge_model,
      judge_version: RUBRIC_VERSION,
      latency_ms,
      cost_cents,
    };
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
