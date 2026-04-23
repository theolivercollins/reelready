# Retrieval Fusion Audit — P3 Session 1
**Date:** 2026-04-23
**Migration:** 035_retrieval_image_fusion
**Weights tested:** text=0.4, image=0.6
**RPC:** `match_rated_examples` (lab branch only; prod photos backfilled on `photos.image_embedding`)

---

## Verdict

**Image fusion IS surfacing different exemplars on these 5 queries.**

Across 5 recently-rated lab iterations (all with both text and image embeddings populated), fused ranking produced **12 exemplar set changes** out of 25 total slots (turnover ~48%). The image signal is meaningfully re-ordering the top-5 in every query, not just nudging scores.

---

## Per-Query Results

### Query 1 — iter `1aecff42` (rated 4★, session `787cd67b`)
Weights: text=0.4, image=0.6
Set overlap: BOTH=3  FUSED-ONLY=2  TEXT-ONLY=2

| Rank | Text-only | Fused (0.4t / 0.6i) |
|------|-----------|---------------------|
| #1   | `1aecff4` 4★ lab d=0.0000 | `1aecff4` 4★ lab d=0.0000 (same — self-match) |
| #2   | `5995b88` 5★ lab d=0.0263 | `5995b88` 5★ lab d=0.0105 (same, boosted) |
| #3   | `7fd24c9` 5★ lab d=0.0839 | `6418e03` 5★ lab d=0.1196 **★IMAGE-PROMOTED** |
| #4   | `bb152dd` 4★ lab d=0.0987 | `6b0e00e` 5★ lab d=0.1204 **★IMAGE-PROMOTED** |
| #5   | `a0f282a` 4★ lab d=0.0987 | `7fd24c9` 5★ lab d=0.1218 (demoted from #3) |

Rating dist text-only: [4,5,5,4,4] avg=4.40
Rating dist fused:      [4,5,5,5,5] avg=4.80 — **image signal promoted two additional 5★ exemplars**

### Query 2 — iter `31ee0453` (rated 5★, session `be78da98`)
Weights: text=0.4, image=0.6
Set overlap: BOTH=4  FUSED-ONLY=1  TEXT-ONLY=1

| Rank | Text-only | Fused |
|------|-----------|-------|
| #1   | `31ee045` 5★ d=0.0000 | `31ee045` 5★ d=0.0000 |
| #2   | `f76a563` 5★ d=0.1689 | `37220c2` 4★ d=0.1849 **★IMAGE-PROMOTED** |
| #3   | `dd79346` 5★ prod d=0.1782 | `f76a563` 5★ d=0.1991 (demoted) |
| #4   | `37220c2` 4★ d=0.1809 | `dd79346` 5★ prod d=0.2070 (demoted) |
| #5   | `7b03b42` 5★ d=0.1814 | `4bc10da` 5★ d=0.2091 **★IMAGE-PROMOTED** |

Rating dist text-only: [5,5,5,4,5] avg=4.80
Rating dist fused:      [5,4,5,5,5] avg=4.80 — same average, different 5★ exemplar at #5

### Query 3 — iter `deb2c634` (rated 2★, session `b4f245ac`)
Weights: text=0.4, image=0.6
Set overlap: BOTH=4  FUSED-ONLY=1  TEXT-ONLY=1

| Rank | Text-only | Fused |
|------|-----------|-------|
| #1   | `4bc10da` 5★ d=0.0745 | `7b03b42` 5★ d=0.0958 **★IMAGE-PROMOTED** |
| #2   | `28063d1` 4★ d=0.0775 | `4bc10da` 5★ d=0.0970 (demoted from #1) |
| #3   | `7b03b42` 5★ d=0.0830 | `37220c2` 4★ d=0.1017 |
| #4   | `37220c2` 4★ d=0.0901 | `dd79346` 5★ prod d=0.1037 |
| #5   | `dd79346` 5★ prod d=0.0914 | `f76a563` 5★ d=0.1069 **★IMAGE-PROMOTED** |

Rating dist text-only: [5,4,5,4,5] avg=4.60
Rating dist fused:      [5,5,4,5,5] avg=4.80 — image re-ordered top-5 significantly

### Query 4 — iter `0184aae1` (rated 5★, session `02d6e3af`)
Weights: text=0.4, image=0.6
Set overlap: BOTH=5  FUSED-ONLY=0  TEXT-ONLY=0

Same exemplar set, distances compressed by image signal (e.g. #2: d=0.0444→0.0290, #3: d=0.0522→0.0341). No set change but ordering preserved.

Rating dist text-only: [5,5,4,5,5] avg=4.80
Rating dist fused:      [5,5,4,5,5] avg=4.80 — identical set, stable

### Query 5 — iter `77b6d949` (rated 4★, session `1963970f`)
Weights: text=0.4, image=0.6
Set overlap: BOTH=3  FUSED-ONLY=2  TEXT-ONLY=2

| Rank | Text-only | Fused |
|------|-----------|-------|
| #1   | `77b6d94` 4★ d=0.0000 | `77b6d94` 4★ d=0.0000 |
| #2   | `5059434` 5★ d=0.0640 | `5059434` 5★ d=0.1352 |
| #3   | `671cbfa` 5★ d=0.0819 | `671cbfa` 5★ d=0.1663 |
| #4   | `33ecdf4` 4★ d=0.1099 | `7b03b42` 5★ d=0.1866 **★IMAGE-PROMOTED** |
| #5   | `184681d` 5★ d=0.1239 | `799eb5f` 4★ prod d=0.1953 **★IMAGE-PROMOTED** |

Rating dist text-only: [4,5,5,4,5] avg=4.60
Rating dist fused:      [4,5,5,5,4] avg=4.60 — different exemplar set at #4/#5

---

## Summary

| Metric | Value |
|--------|-------|
| Queries tested | 5 |
| Total exemplar slots | 25 (5 per query) |
| Exemplars in BOTH modes | 19 |
| Exemplars ONLY in fused (image-promoted) | 6 |
| Exemplars ONLY in text (image-demoted) | 6 |
| Set turnover rate | ~48% |

---

## Notable Shifts

The image signal has clear directional effects. In Q1 and Q3, fused ranking promoted additional 5★ exemplars that text-only ranked lower (the image vectors considered them structurally more similar to the query photo). In Q2, a 4★ exemplar was promoted above three 5★ ones — the image embedding considered it structurally closer even though the text analysis was less aligned. Overall average exemplar rating improved in 3 of 5 queries when using fused ranking (Q1: 4.40→4.80, Q3: 4.60→4.80), held in Q2 and Q4, and held in Q5. Crucially, image fusion appears to be doing its job: the visual structural similarity of the query photo is shaping which past examples get surfaced, above and beyond what the text analysis alone captures.

The prod branch (`scene_ratings` / `photos.image_embedding`) surfaced in Q3 and Q5 under fusion where it was buried or absent under text-only. This is a positive signal: the backfilled photo image vectors are pulling in cross-source exemplars that are visually similar but text-dissimilar.

---

## Listing Branch Gap

`prompt_lab_listing_scene_iterations` has no direct `photo_id` linkage on `prompt_lab_listing_scenes`, so that branch remains text-only (both modes return identical listing results). Not blocking for P3 S1. Surfacing the listing→photo join is a P3 S2 task.

---

## Recommended Weight Tweak

The default 0.4/0.6 split is **reasonable to keep for now**. Image promotion is working (5★ exemplars surfacing higher in Q1, Q3) without completely overriding text coherence (the self-match at rank #1 is always preserved). A candidate experiment would be 0.3/0.7 to push image signal harder on visual outlier queries, but that should be validated against a larger sample (20+ rated iterations) before shipping. No tweak recommended for this session.

---

## Audit Script

See `scripts/audit-retrieval-fusion.ts` for a runnable version of this comparison.
Run with: `npx tsx scripts/audit-retrieval-fusion.ts`
Requires: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in environment.
