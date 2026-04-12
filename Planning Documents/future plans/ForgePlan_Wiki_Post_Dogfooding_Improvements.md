# ForgePlan Wiki Post-Dogfooding Improvements

This note tracks wiki improvements that should wait until the current dogfooding cycle finishes.

## Safe Changes Already Landed

- richer node pages with operational summaries
- index page freshness + hotspot summaries
- sweep context metadata for wiki freshness

## Next Improvements After Dogfooding

### Medium Effort, Still Low-Risk

- add stronger per-node contract summaries
  - key interfaces
  - shared models touched
  - upstream/downstream node surfaces
- add recent regression summaries
  - recurring findings by category
  - recently fixed hotspots
  - "watch areas" per node
- add machine-friendly compact summary artifacts
  - short JSON summaries alongside markdown pages
  - exact fields for sweep/research/bootstrap
- improve entrypoint detection
  - backend routes
  - job runners
  - frontend route/layout/component anchors

### Medium/High Effort, Defer Until Control Plane Is Stable

- more frequent wiki refresh timing
  - after integration gates
  - after successful sweep fix cycles
  - possibly after build/review milestones
- AST-aware extraction instead of regex-only heuristics
  - better contracts
  - stronger import graph summaries
  - more reliable entrypoints and runtime surfaces
- explicit stale-data policy
  - freshness thresholds
  - warnings when sweep consumes stale wiki
  - auto-refresh rules that do not thrash
- runtime/test signal ingestion
  - known failing tests
  - unstable endpoints
  - recurring environment issues

### Not For Active Dogfooding

- changing sweep/deep-build state semantics around wiki
- making wiki compilation continuous during active fix loops
- broad sweep packet redesign driven by wiki structure
- adding persistent new state fields without clear recovery handling

## Desired End State

The wiki should become a concise execution-aware knowledge layer:

- node pages answer "what matters here now?"
- the index answers "where is risk concentrated?"
- sweep/bootstrap helpers answer "what should agents read first?"
- all of that stays deterministic enough to reduce token burn rather than increase it
