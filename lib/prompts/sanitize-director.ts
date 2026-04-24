// Hard enforcement of the "no beyond/through" rule the director system
// prompt tells Claude to follow. Soft guidance failed in prod — 22% of recent
// Lab prompts still leaked "beyond" and Kling interprets it literally (camera
// overshoots the frame, scene breaks). See docs/HANDOFF.md 2026-04-24 entry.
//
// Scope:
//   - "beyond"  — ALWAYS banned (names off-frame subjects; drags camera out).
//   - "through" — ALWAYS banned in the single-image Lab (no paired end-frames
//                 means there is never a legitimate traversal scene).
//   - "past"    — NOT enforced here. It's idiomatic in both reveal patterns
//                 ("reveal past the foreground element") and parallax motion
//                 ("parallax glide past the planting bed"), and stripping it
//                 would break those valid camera-language prompts.
//
// Strategy for rewriting a prompt that contains a banned word:
//   If an "and"/"," separator precedes the banned word in the same clause
//   (no intervening ".") — strip from that separator to the end. This kills
//   the most destructive LLM habit: "X and Y beyond" (naming an off-frame
//   subject Y that drags the camera outside the scene).
//   Otherwise — just delete the banned word in place. This handles cases like
//   "... toward the covered lanai beyond" where the whole clause is the only
//   direction and stripping would leave the prompt unusable.

export interface SanitizerResult {
  cleaned: string;
  edits: string[];
}

const CLAUSE_SEPARATORS = ["and", "with", ","]; // stripped-trailing-clause triggers

function stripTrailingClauseEndingWith(prompt: string, word: string): string | null {
  // Find the banned word's last position.
  const lower = prompt.toLowerCase();
  const wordRe = new RegExp(`\\b${word}\\b`, "i");
  const wordMatch = prompt.match(wordRe);
  if (!wordMatch || wordMatch.index === undefined) return null;

  // Walk backwards from the banned word looking for a clause break.
  // Only consider separators inside the SAME clause (no "." between).
  const before = prompt.slice(0, wordMatch.index);
  const lastPeriod = before.lastIndexOf(".");
  const searchStart = lastPeriod === -1 ? 0 : lastPeriod + 1;
  const region = before.slice(searchStart);

  let bestCut = -1;
  for (const sep of CLAUSE_SEPARATORS) {
    const pattern = sep === "," ? /,\s+/g : new RegExp(`\\s+${sep}\\s+`, "gi");
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(region)) !== null) {
      const absolute = searchStart + m.index;
      if (absolute > bestCut) bestCut = absolute;
    }
  }
  if (bestCut === -1) return null;
  return prompt.slice(0, bestCut).trimEnd().replace(/[,;:]+$/, "");
}

function sanitizeOne(
  prompt: string,
  word: "beyond" | "through",
): { cleaned: string; edit: string | null } {
  const wordRe = new RegExp(`\\b${word}\\b`, "i");
  if (!wordRe.test(prompt)) return { cleaned: prompt, edit: null };

  const stripped = stripTrailingClauseEndingWith(prompt, word);
  if (stripped !== null) {
    return { cleaned: stripped, edit: `stripped trailing clause containing "${word}"` };
  }

  // Fallback: delete just the banned word, collapse double spaces.
  const cleaned = prompt.replace(wordRe, "").replace(/\s{2,}/g, " ").trim();
  return { cleaned, edit: `removed "${word}"` };
}

/**
 * Sanitize a single director prompt against banned spatial prepositions.
 * Returns the cleaned prompt and a list of edits (empty if nothing changed).
 * `cameraMovement` is consulted to allow "past" in reveal prompts per the
 * director system prompt's documented reveal pattern.
 */
export function sanitizeDirectorPrompt(prompt: string, _cameraMovement?: string | null): SanitizerResult {
  let cleaned = prompt;
  const edits: string[] = [];

  {
    const r = sanitizeOne(cleaned, "beyond");
    cleaned = r.cleaned;
    if (r.edit) edits.push(r.edit);
  }
  {
    const r = sanitizeOne(cleaned, "through");
    cleaned = r.cleaned;
    if (r.edit) edits.push(r.edit);
  }

  return { cleaned, edits };
}
