# Park note — `session/ledger-2026-04-21`

Parked: 2026-04-22
Decision: keep the branch alive; do not merge into main.

## Why parked

The bucket-progress ledger built on this branch feeds a V2 surface (paired-image router visibility — "which bucket × SKU cells still need ratings?"). V2 work is paused per `docs/specs/2026-04-22-v1-primary-tool-and-ml-roadmap-design.md`. The V1 program instead delivers retrieval-match visibility via P3 (hybrid retrieval + percentage-match panel), which subsumes the "visibility into what the system is doing" goal at the iteration level rather than the bucket level.

## When to revive

- Paired-image / V2 work resumes (not scheduled; blocked on V1 stability + Thompson router P5 evidence).
- A bucket-level scoreboard is needed outside of P3's per-iteration retrieval panel (low likelihood — the P3 panel is more information-dense).

## Head of branch

```
a64cd75 feat(ledger): Window C R2.3 docs + memory for bucket scoreboard
```

Branch contains three commits: endpoint + strip UI + docs. All self-contained; reviving means `git merge session/ledger-2026-04-21` (clean merge expected).

## Contacts

Oliver.
