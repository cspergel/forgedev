# ForgePlan Immediate Dogfood Fixes

## Purpose

Capture the highest-signal follow-up fixes from the long PlacementOps dogfood run.
These are not broad architecture changes. They are immediate control-plane and
builder-discipline fixes that should be addressed before the next serious
autonomous run.

## 1. Fix `next-node` Recommendation Drift In `deep-build`

### Symptom

During `deep-build` `build-all`, the runtime reported one node in the `next-node.js`
JSON output while the orchestrator narration immediately advanced to different nodes.
Observed example:

- `next-node.js` output still referenced `outreach-module`
- the orchestrator then continued with `outcomes-module`, then `admin-surfaces`

This may be a pure reporting drift, or it may indicate a real stale-state edge in
the recommendation loop.

### Why It Matters

- It makes recovery/debugging harder because the JSON output is no longer the
  single trustworthy source of "what happens next".
- It creates risk that the orchestrator and deterministic runtime disagree about
  build order.
- It weakens confidence in the `deep-build` control plane even when the build
  continues successfully.

### Likely Surfaces

- [next-node.js](c:\Users\drcra\Documents\Coding Projects\ForgeDev\scripts\next-node.js)
- [deep-build](c:\Users\drcra\Documents\Coding Projects\ForgeDev\skills\deep-build\SKILL.md)
- [state-transition.js](c:\Users\drcra\Documents\Coding Projects\ForgeDev\scripts\state-transition.js)

### Fix Direction

1. Add a deterministic post-condition to `next-node.js`:
   - never recommend a node whose persisted status is already `built` or `reviewed`
   - never recommend the previously completed node unless it explicitly needs rebuild
2. In `deep-build`, treat the `next-node.js` JSON as authoritative:
   - do not narrate or queue a different node than the returned `recommendation.node`
   - if multiple nodes are eligible, the deterministic script should surface that clearly
3. Add regression tests for:
   - sequential `build-all` after `complete-build`
   - parallel-eligible siblings (`outcomes-module` and `admin-surfaces` style cases)
   - interrupted deep-build recovery where one node just finished and the next call happens immediately

### Done When

- The node named in `next-node.js` is always the node the orchestrator actually starts next.
- No completed node is re-suggested unless the result type is explicitly `rebuild_needed`.

## 2. Remove Shell-Style Scaffolding From The Builder Path

### Symptom

The builder still used shell commands like:

- `mkdir -p ...`
- `ls ...`

inside an otherwise governed node build.

### Why It Matters

- Shell scaffolding bypasses the cleaner `Write` / `Edit` / `Glob` path the harness is trying to enforce.
- It increases permission friction and creates platform-specific behavior.
- It weakens file tracking, because directory creation and ad hoc enumeration are harder to reason about than normal tool usage.

### Likely Surfaces

- [builder.md](c:\Users\drcra\Documents\Coding Projects\ForgeDev\agents\builder.md)
- [build](c:\Users\drcra\Documents\Coding Projects\ForgeDev\skills\build\SKILL.md)
- [deep-build](c:\Users\drcra\Documents\Coding Projects\ForgeDev\skills\deep-build\SKILL.md)
- [pre-tool-use.js](c:\Users\drcra\Documents\Coding Projects\ForgeDev\scripts\pre-tool-use.js)

### Fix Direction

1. Tighten the Builder agent contract:
   - do not use Bash for directory creation
   - do not use Bash for file enumeration when `Glob` is sufficient
   - prefer `Write` to create files and let the runtime create parent directories implicitly
2. Tighten build/deep-build instructions:
   - explicitly call out `Write` / `Edit` / `Glob` as the default scaffolding path
   - reserve Bash for deterministic helpers, package installs, test commands, and approved runtime scripts only
3. Tighten enforcement if needed:
   - extend Bash guard coverage for common scaffolding commands (`mkdir`, `cp`, `mv`, etc.) during active builds
   - only do this after confirming it will not break legitimate deterministic helper usage
4. Add a regression check:
   - builder transcripts for normal node builds should not contain `mkdir -p` style scaffolding

### Done When

- Fresh autonomous builds create directories/files via `Write`/`Edit` instead of shell scaffolding.
- Read-only discovery uses `Glob` or explicit read tools rather than incidental shell enumeration.

## Execution Order

1. Fix `next-node` drift first.
2. Tighten builder shell-scaffolding discipline second.

Reason:
- `next-node` correctness affects control-plane trust directly.
- shell-scaffolding cleanup improves hygiene and permissions, but it is less dangerous than a stale recommendation loop.

