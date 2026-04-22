# V1 Prompt Lab — UX Friction Audit
Date: 2026-04-22
Auditor: Sonnet subagent (Task 14, P1 V1 Foundation)
Source: `src/pages/dashboard/PromptLab.tsx` (~1482 lines) + `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md`
Status: READ-ONLY — no code changed. Feeds deferred UX plan `docs/specs/2026-04-22-v1-lab-ux-plan.md` (P1 Deliverable 9).

---

## 1. Upload Flow Friction

**F1.1 — Single-file auto-navigate is asymmetric with batch.**
`PromptLab.tsx:128-130`: when exactly one file is uploaded, the user is immediately navigated into the session detail. When multiple files are uploaded, the user stays on the list. There is no way to know before uploading whether the auto-navigate will fire. If Oliver uploads two files when he meant one, he has to navigate back manually. The auto-navigate is also silent — no "you've been redirected" feedback on the detail page.

**F1.2 — `analyzeSession` is fire-and-forget but the UI gives no in-progress signal on the list card.**
`PromptLab.tsx:120-122`: `await Promise.allSettled(...)` is called but the UI reload (`reload()`) happens immediately after at line 125, before analysis completes. The session cards that land on the list have no "Analyzing…" state — they look identical to sessions awaiting manual analysis. The 15s auto-refresh (`PromptLab.tsx:93-97`) will eventually update them, but Oliver has no idea analysis is in-flight or done without waiting up to 15s or manually refreshing.

**F1.3 — Batch label is easily forgotten.**
`PromptLab.tsx:216-228`: the batch label input is positioned above the upload button with no visual emphasis. When uploading quickly, it is easy to skip it, leaving sessions in "Unbatched." Renaming after the fact requires entering Organize mode and dragging or using the `BatchTitle` click-to-edit inline rename — neither is discoverable. The placeholder text ("e.g. Smith property · Kitchen study #2") is helpful but the field has no required indicator and no warning when uploading without a batch label.

**F1.4 — No image validation feedback before upload begins.**
`PromptLab.tsx:239-248`: the `accept` attribute limits to `image/jpeg,image/png,image/webp` on the `<input>`, and drag-drop accepts any `Files` type. There is no pre-upload size check, resolution check, or aspect-ratio hint. Submitting a HEIC file dropped from iPhone will silently fail (browser may accept it past the accept filter). The error only surfaces as a backend error string at `PromptLab.tsx:254-258`.

**F1.5 — No cost estimate shown before committing to analysis.**
Auto-analyze fires immediately on upload. The user sees no "this will call Gemini, est. $0.XX" before the checkbox commits. With `autoAnalyze=true` (default), every multi-upload batch incurs hidden analysis cost. The cost chip only appears per-iteration inside the session detail (`PromptLab.tsx:916-919`), never aggregated at the upload moment.

---

## 2. Session-List Friction

**F2.1 — "Unbatched" sorts first, but is the noisiest group.**
`PromptLab.tsx:363-369`: `Unbatched` is forced to index 0 in `ordered`, regardless of recency or size. In daily use, Oliver's working batches (named, recent) are pushed below the noise of uncategorized sessions. The correct default is likely most-recently-active first, with `Unbatched` last.

**F2.2 — Session card shows filename label, not room type or status.**
`PromptLab.tsx:732`: the card footer shows `session.label || session.archetype || "Untitled"`. The `label` defaults to the filename stripped of extension (`PromptLab.tsx:115`). Filenames like `IMG_4523` or `DSC00012` are not meaningful. `archetype` from analysis would be more useful but only appears if `label` is falsy. A combined format (`room_type · label`) or auto-enrichment of `label` on analysis completion would reduce scan time.

**F2.3 — No cost shown per session card.**
`PromptLab.tsx:651-745`: `SessionCard` renders iteration count and best rating but no cost. A session might have run 6 iterations + 2 renders costing $0.60 with no cost signal visible from the list. Aggregated cost on the batch header (`BatchGroups`) is also absent. The `session.total_cost_cents` field (if it exists on the API shape) is unused in the card. If it does not exist, the API needs to sum it.

**F2.4 — "Delete" is only available inside session detail, not from the list.**
`PromptLab.tsx:795-799`: `handleDelete` lives in `SessionDetail`. There is no delete from the card or from Organize mode (only archive). To delete a session permanently, Oliver must navigate into it, scroll to the header, find the small inline "Delete" text link, and confirm. For bulk cleanup of bad uploads, this is 4+ clicks per session.

**F2.5 — Organize mode's "Archive" button uses `Trash2` icon (misleading).**
`PromptLab.tsx:437-440`: the Archive button in Organize mode has `<Trash2 className="mr-2 h-3 w-3" />` — the same icon used for Delete in the session detail header. Archive is reversible; Delete is permanent. Using the trash icon for Archive creates anxiety and confusion about what the action does.

**F2.6 — Collapsed batch shows only "N sessions · X/Y completed" — no pending-render or needs-attention counts.**
`PromptLab.tsx:529`: when a batch is collapsed, the summary line only shows total and completed counts. If two sessions inside are pending render or need rating, Oliver cannot see this without expanding. The attention-state signals (sky/teal banners) that work in the expanded grid are invisible in the collapsed state.

**F2.7 — No global search or cross-batch filter.**
There is no way to find a session by room type, prompt content, or rating from the list view. With 50+ sessions across 5 batches, locating "that kitchen session I rated 3 stars last week" requires opening batches one by one. This is a daily-driver friction point as the corpus grows.

**F2.8 — `prompt()` and `alert()` used for batch rename + error handling.**
`PromptLab.tsx:329, 395, 323, 342, 354, 377, 388`: native browser dialogs interrupt focus, do not match the app's design language, and on macOS are sometimes suppressed. These are development-grade affordances in a daily-driver tool.

---

## 3. Iteration-Card Friction

**F3.1 — Rating + Save are decoupled from the "Refine" action in a confusing way.**
`PromptLab.tsx:1389-1476`: Rate this iteration (stars + tags + notes) has a separate "Save rating" button (`PromptLab.tsx:1441-1450`). The "Refine → new iteration" textarea + button is a sibling section. A user can click "Refine" without saving the rating first — the `onRefine` payload at `PromptLab.tsx:1466` does pass `rating, tags, comment` along, so the rating is saved implicitly by refine. But the UI does not communicate this — the "Save rating" button is still visible and active, giving the impression that the rating has not been saved. Oliver may double-save.

**F3.2 — No per-iteration cost display.**
`PromptLab.tsx:1162-1479`: `IterationCard` receives `iteration: LabIteration` which includes `cost_cents` (referenced at `PromptLab.tsx:894`), but no cost figure is shown on the card. The only cost visible in the detail view is the total session cost in the header (`PromptLab.tsx:916-919`). Oliver cannot see which specific iteration was expensive (e.g., an auto-analysis call vs a render).

**F3.3 — "Render for real" checkbox is a two-click commitment with no cost confirmation.**
`PromptLab.tsx:1358-1387`: the user must check "Render for real (~$0.05–$0.15)" to enable the Render button, then click the button. The cost estimate is a static string, not derived from the selected provider or SKU. "~$0.05–$0.15" spans 3× — not useful as a pre-commit signal. The actual per-SKU cost from Atlas pricing should be surfaced (relates to P1 Deliverable 4: SKU cost chip).

**F3.4 — "Try with" re-render buttons appear on ALL iterations with a clip, not just latest.**
`PromptLab.tsx:1327-1349`: the `director && (iteration.clip_url || iteration.render_error)` condition renders "Try with: Kling / Runway" on every iteration that qualifies, regardless of whether it is the latest. On a session with 6 iterations all having clips, there are 6 re-render affordances visible simultaneously. The scroll height is punishing. Only the latest should have the re-render affordance; older iterations should show it in a collapsed/on-demand way.

**F3.5 — Older iterations have full opacity feedback forms.**
`PromptLab.tsx:1198-1204`: non-latest iterations render at `opacity-80` (the card itself), but their feedback forms (rating stars, tags, textarea, Save rating, Refine, Re-render) are fully interactive at full opacity. The subtle 80% opacity on the card does not convey "this is historical." Users can mistakenly rate an old iteration thinking they are rating the latest.

**F3.6 — Tags are a flat list without positive/negative grouping.**
`PromptLab.tsx:36-49`: `RATING_TAGS` mixes positive ("clean motion", "cinematic", "perfect", "stayed in room") and negative ("hallucinated architecture", "wrong motion direction", "camera exited room", etc.) in a single alphabetically-unlabeled array. During rapid rating, Oliver must scan the full list each time to find negative descriptors. Visual grouping (section headers, color-coded chips) would cut scan time.

**F3.7 — No "compare this iteration side-by-side with previous" affordance.**
When refining through 4-5 iterations, the only way to compare is to scroll vertically. The video players are all inline, all max-w-md, all playing independently. There is no A/B compare mode where two clips play side-by-side or in a togglable A/B modal. P6 plans pairwise UX, but even a simple "compare with previous" link on the latest card would help today.

**F3.8 — `PromoteRecipeControl` only appears on iterations rated ≥4★.**
`PromptLab.tsx:1352-1354`: the check is `typeof iteration.rating === "number" && iteration.rating >= 4`. If Oliver forgets to save a rating before trying to promote, the control does not appear. The user must save rating first, then scroll back to find the promote control that just appeared. The flow is not self-evident.

**F3.9 — Auto-generated archetype slug is noisy and not editable in a friendly way.**
`PromptLab.tsx:1045-1051`: `autoArchetype` generates a slug like `living_room_dolly_260422_x7k3`. The random suffix (`Math.random().toString(36).slice(2, 6)`) makes deduplication opaque. The field is editable, but the pre-filled value includes a timestamp-derived fragment that Oliver has to clean up every time he promotes. A human-readable suggestion like `living_room_slow_dolly` with a conflict-check would be less noisy.

---

## 4. Cost Visibility Gaps

**G4.1 — Session-list cards show no cost.** `PromptLab.tsx:651-745`: `SessionCard` renders `iteration_count` and `best_rating` but not total cost. Cost is first visible when navigating into a session.

**G4.2 — Batch headers show no cost aggregate.** `PromptLab.tsx:461-464`: batch header computes `avgRating` but no `totalCost`. On a batch with 20 sessions and $4 spend, this is invisible from the list.

**G4.3 — Session detail total cost uses 3 decimal places in dollars.** `PromptLab.tsx:918`: `${(totalCost / 100).toFixed(3)}` shows e.g. `$0.043`. This is correct but feels like an API-debug artifact, not a polished display. The threshold for 3dp vs 2dp is worth a convention decision.

**G4.4 — Per-iteration cost is stored (`cost_cents`) but not rendered.** `PromptLab.tsx:894` reads `it.cost_cents` to compute `totalCost`; the individual card never shows it. Oliver cannot audit which iteration drove cost.

**G4.5 — Cost breakdown by type (analysis vs render vs refine) is absent.** The total session cost lumps all `cost_cents` together. There is no breakdown by `scope` (analysis / director / render / refine). This will matter more as P2 (auto-judge) adds a third cost category.

**G4.6 — No render cost estimate tied to selected SKU.** `PromptLab.tsx:1364`: the static string `(~$0.05–$0.15)` is unrelated to the selected provider or model. Once the P1 SKU selector lands, this needs to show the per-SKU estimated cost from a config table.

---

## 5. Retrieval Visibility Gaps (pre-P3 state)

**G5.1 — `RetrievalChips` are tooltip-only; data is hover-inaccessible on touch and hard to parse.**
`PromptLab.tsx:1124-1158`: the chips "Based on N similar wins", "Avoiding N losers", "Recipe · archetype" use `title` attributes for the full retrieval data. This is hover-only, invisible on touch devices, and not keyboard-accessible. The tooltip format (raw prompt text + distance float) is developer-grade, not Oliver-grade.

**G5.2 — Match distance is shown as a raw float (e.g. `d=0.127`), not a percentage.**
The `title` attribute at `PromptLab.tsx:1136, 1144, 1155` shows `d=0.127`. The P3 spec (`docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md:263-269`) plans to surface these as percentage-match. Until P3 lands, the distance readout is technically correct but not human-interpretable.

**G5.3 — No "cold-spot" indicator for low-match sessions.**
When retrieval returns 0 exemplars (new photo type, no prior art), the chips section simply renders nothing (`PromptLab.tsx:1129`). Oliver has no signal that this iteration is flying blind — the director prompt has no grounding from past wins. A "No similar history" chip in a neutral color would be more honest than silence.

**G5.4 — Retrieved exemplars are not click-through to their source sessions.**
The `title` tooltip shows the exemplar's prompt text but there is no way to navigate to the source iteration that generated it. Seeing a winner used as few-shot context with no way to inspect the source clip reduces trust in the retrieval mechanism.

**G5.5 — No visibility into which channel (winners / losers / recipe) influenced the generated prompt the most.**
The chips show counts but not relative weight. The director prompt is assembled from all three channels, but from the UI it is impossible to tell whether a given generation was dominated by a recipe match or by a dense cluster of past winners.

---

## 6. Quick Wins (<1h effort each)

**QW1 — Flip "Unbatched" sort to last, not first.**
File: `PromptLab.tsx:363-369`. Change the sort comparator to push Unbatched to the end. One-line change. Reduces the number of named batches that get scrolled past to reach active work.

**QW2 — Color-code the RATING_TAGS array into positive / negative groups with a section label.**
File: `PromptLab.tsx:36-49, 1411-1428`. Split the flat array into `POSITIVE_TAGS` / `NEGATIVE_TAGS`, render with a `text-[9px] text-muted-foreground` label before each group. No data changes required — tags are stored as plain strings.

**QW3 — Replace `Trash2` icon on the Archive button in Organize mode with an `Archive` or `EyeOff` icon.**
File: `PromptLab.tsx:437-440`. Import `Archive` from lucide-react (already in the project). Zero logic change; eliminates the delete-vs-archive confusion. Single icon swap.

**QW4 — Add an "Analyzing…" state to SessionCard while analysis is in-flight.**
File: `PromptLab.tsx:699-730`. The `LabSession` shape likely exposes `analysis_json === null && !has_feedback` as a proxy for "pending analysis." Render a subtle "Analyzing…" overlay pill (same pattern as the "Rendering" amber pill at line 703) when that condition is true.

**QW5 — Show total session cost on SessionCard in the footer.**
File: `PromptLab.tsx:731-744`. The API response for `listSessions` needs a `total_cost_cents` field summed server-side. If it already exists on `LabSession`, add `<DollarSign className="h-3 w-3" />{cost}` to the card footer alongside iteration count. If not, it requires a view or RPC change before the UI change — still <1h total for both.

**QW6 — Make the "Save rating" button inactive/hidden when refine is the intended action, reducing double-save confusion.**
File: `PromptLab.tsx:1441-1450`. When `chat.trim().length > 0` (i.e., the user has typed a refine instruction), change the "Save rating" button variant to `ghost` and add `(included in refine)` label text. Makes the implicit behavior explicit without removing the standalone save path.

---

## 7. Medium Wins (1–4h each)

**MW1 — Add cost breakdown chip to session detail header and per-iteration cards.**
Files: `PromptLab.tsx:894-895, 916-919`. Extend `IterationCard` to show `cost_cents` below the timestamp. In the session header, break out cost by type (requires `scope` on `cost_events` to be joined into `LabIteration`). Needs a backend `getSession` response change + UI rendering. Estimated 2h.

**MW2 — Replace `prompt()` / `alert()` calls with inline UI.**
File: `PromptLab.tsx:329, 388, 323, 342, 354`. Replace `prompt("Name this batch")` in `groupSelected` and `createBatchFromDrop` with a small inline input-with-confirm pattern (similar to `BatchTitle`'s inline editing at lines 618-649). Replace `alert(...)` error strings with the existing error-display pattern from `SessionDetail`. Estimated 2-3h.

**MW3 — Add "Re-render with different provider" only to the latest iteration; collapse it on historical ones.**
File: `PromptLab.tsx:1327-1349`. Gate the "Try with:" row on `isLatest`, or move it into an `onDemand` expand pattern for non-latest iterations. Reduces vertical scroll noise substantially on sessions with 5+ iterations. Estimated 1h.

**MW4 — Retrieval chips: make exemplar details visible in an expandable panel instead of title tooltip.**
File: `PromptLab.tsx:1124-1158`. Replace the `title` tooltip with a click-to-expand `<details>` / collapsible panel showing the top-3 exemplars in a readable format (rating, motion verb, truncated prompt, distance as percent). No backend changes needed. Estimated 2h. This partially pre-empts P3's RetrievalPanel work, so the P3 session can upgrade it rather than build from scratch.

**MW5 — Global search / filter bar above the batch groups.**
File: `PromptLab.tsx:277-608`. Add a `<Input placeholder="Search sessions…" />` above `BatchGroups` that filters `sessions` client-side by `label`, `archetype`, `batch_label`, or tag presence. No backend required for the first iteration (all sessions are already in `sessions` state). Estimated 2-3h.

---

## 8. Out-of-Scope-for-UX Observations

These friction points are real but belong to other phases or subsystems:

**OS1 — No auto-judge rating on rendered clips.**
Every rated iteration requires manual Oliver input. Until P2 (Gemini Auto-Judge, 2026-04-23) ships, the rating form is the only feedback path. The UX of the judge-rating overlay (judge score + override button, P2 Session 2) is not designed yet — that is a P2 UX deliverable, not a P1 item.

**OS2 — RetrievalChips show raw cosine distance because hybrid retrieval does not exist yet.**
The current `d=0.127` display is correct for the current single-vector cosine retrieval. The percentage-match UX (`RetrievalPanel` with "top 82%") is gated on P3 Session 2's hybrid scoring + normalized scores. UX scaffolding should be designed in P3, not backported now.

**OS3 — No SKU selector in the iteration card.**
The P1 spec (Deliverable 4) adds a SKU selector to `PromptLab.tsx`. This is a P1 code task for the coordinator session, not a UX audit finding. Noted here only so the UX plan does not duplicate it.

**OS4 — "Promote to recipe" never fires for existing iterations because the flow requires a ≥4★ rating AND a director output.**
Several legacy Lab iterations lack `director_output_json` (they predated the director). This is a data-completeness gap (P4 backfill) not a UX gap.

**OS5 — Pairwise A/B comparison UX.**
P6 plans a pairwise-preference modal for active learning. The current vertical-stack iteration layout makes side-by-side comparison impossible without a new interaction pattern. Design belongs to P6.

**OS6 — Thompson router bandit dashboard.**
P5 plans `/dashboard/development/router-bandit`. No current UX needed — that is a P5 deliverable.

**OS7 — "Rate these first" active-learning panel.**
P6 item. Requires judge scores (P2) + bandit bucket stats (P5) to derive the ranking. Noted here for completeness.
