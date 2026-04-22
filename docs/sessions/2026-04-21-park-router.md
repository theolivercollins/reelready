# Park note — `session/router-2026-04-21`

Parked: 2026-04-22
Decision: keep the branch alive; do NOT merge.

## Why parked

The branch holds Window D Round 2's manual router-grid rating scaffolding — a script + config that would hand-curate ratings per (room × movement × SKU) bucket to seed a static router table. Superseded by P5 (Thompson-sampling SKU router) per `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md`. P5 bootstraps router decisions from organic V1 ratings, avoiding the fresh rating grid entirely (serves North Star #4 directly without the manual labor).

## v3-strip commit disposition

The plan originally specified selectively cherry-picking `0b6f874` ("Window D Round 2: strip kling-v3-pro from every single-image bucket") onto main. Attempted on 2026-04-22; **the commit only modifies `scripts/router-grid-config.json`, which was never on main** (branch-only artifact). Cherry-pick aborted; no code landed.

**The semantic intent is captured instead in the V1 router implementation** (`lib/providers/router.ts::V1_ATLAS_SKUS`): the default-SKU allow-list for non-paired V1 Lab renders explicitly excludes `kling-v3-pro`. That enforces the same policy at the runtime routing layer rather than in a parked script's config.

No data is lost. The two successfully-rendered v3-pro iterations (kitchen + living_room) mentioned in the original commit message remain in the DB, available for future rating if V3 routing is ever revisited.

## When to revive

Only if Thompson sampling (P5) fails to converge and we need to fall back to a hand-curated grid. Unlikely — P5 has a cold-start rule that forces exploration before exploitation.

## Head of branch

```
0b6f874 Window D Round 2: strip kling-v3-pro from every single-image bucket
```

Branch contains 5 commits: grid seed script, partial grid run, rating-prep doc, smoke-test, v3-strip.

## Contacts

Oliver.
