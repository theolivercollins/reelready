# P3 — Image embeddings + hybrid retrieval — implementation status

Branch: `session/p3-s1-implementation-draft`
Status: **pre-cooked scaffold, awaiting P3 Session 1 (2026-04-25) for Gemini binding + first backfill**

## What's landed (this branch)

| File | Purpose | Wired? |
|---|---|---|
| `supabase/migrations/034_image_embeddings.sql` | `image_embedding vector(768)` + model/timestamp columns on `photos` and `prompt_lab_sessions`. HNSW cosine indexes. Additive. | Not applied |
| `lib/embeddings-image.ts` | `embedImage(input)` skeleton, `isEnabled()`, `EmbeddingsDisabledError`, constants (model=`gemini-embedding-2`, dim=768) | SKELETON — Gemini binding is TODO(p3-s1) |
| `lib/embeddings-image.test.ts` | 6 vitest tests: constants, kill-switch behavior, unwired-path error shape | Yes |
| `scripts/backfill-image-embeddings.ts` | Dry-run default; refuses `--write` unless `ENABLE_IMAGE_EMBEDDINGS=true`. Targets photos / sessions / both | Yes, dry-run runnable today |

## What's NOT wired

- **Gemini API call itself is stubbed.** `embedImage` throws a TODO error inside the try/catch. P3 Session 1 replaces with the real `@google/genai` call following `lib/providers/gemini-analyzer.ts` pattern.
- **Retrieval fusion is untouched.** The existing cosine-only retrieval via `match_rated_examples` etc is unchanged. P3 Session 2 (2026-04-26) adds hybrid dense+sparse + reranker.
- **No UI.** `RetrievalPanel` with percentage-match lands at P3 Session 2.

## Decisions locked (Oliver 2026-04-22, per `session/p3-embedding-preflight`)

1. **Q1 — dim = 768.** Not 1536 (no OpenAI-text parity needed; fusion happens at score layer). Not 512 (CLIP-specific concern moot).
2. **Q2 — Gemini billing:** defer to first-call verification at P3 S1.
3. **Q3 — cost_event shape:** match existing pattern. `stage='analysis'`, `provider='google'`, `metadata.subtype='image_embedding'`, `metadata.surface='lab'|'prod'|'backfill'`. No new stage enum, no new scope column. Mirrors P1 Task 10 Lab cost_events.
4. **Q4 — single-file provider:** no interface abstraction. Refactor when a second provider is needed. YAGNI.
5. **Q5 — Vertex pricing uncertainty:** moot (we're on Gemini). Historical note in the audit doc.

## How to enable (P3 Session 1 actions)

1. Apply migration 034 to Supabase.
2. Replace the `TODO(p3-s1)` block in `lib/embeddings-image.ts` with the real Gemini call.
3. Verify on ONE photo first: `ENABLE_IMAGE_EMBEDDINGS=true npx tsx scripts/backfill-image-embeddings.ts --target photos --limit 1 --write`
4. If billing works, run full backfill: `... --target both --limit 500 --write`
5. Cost should be ~$3.00 total ($0.00012 × ~150 photos + ~100 sessions + headroom).
6. Add P3 Session 2 to this doc when it starts: hybrid retrieval + reranker + fusion weights + RetrievalPanel UI.

## Cost projections (verify at first call)

- 150 photos × $0.00012 = $0.018
- 100 sessions × $0.00012 = $0.012
- Total backfill: ~$0.03. (Gemini pricing may have changed — verify.)
- Ongoing per new photo: $0.00012. Negligible.

## Known carry-overs

- **Frame-from-video handling for P3 Session 2 retrieval:** when scoring retrieval candidates, we may want per-frame or per-clip embedding (not just per-photo). Not addressed in this scaffold. Decision deferred to P3 S2.
- **Fusion weights** (text=0.4, image=0.6 initial per parent spec §P3 Session 2): not implemented here. Belongs to the new hybrid RPC in P3 S2.

## See also

- `docs/audits/p3-image-embedding-provider-decision.md` (branch `session/p3-embedding-preflight`) — provider-decision audit with Q1–Q5 resolved
- `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md` §P3 — phase brief
- Memory: `project_p3_embedding_preflight.md`
