---
description: Audit a built node against its spec using the seven-dimension review format. Native Claude review, plus optional cross-model verification via BYOK. Use --all to review all built nodes sequentially.
user-invocable: true
argument-hint: "[node-id | --all]"
allowed-tools: Read Write Edit Glob Grep Bash Agent
agent: reviewer
---

# Review Node

Audit the specified node's implementation against its spec.

**Target:** $ARGUMENTS

## Review All Mode (`--all`)

If the argument is `--all`, review all built nodes sequentially in dependency order:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/topo-sort.js"` to get the dependency order
2. Read `.forgeplan/state.json` to find nodes with status `"built"` (not yet reviewed)
3. For each eligible node in dependency order:
   - Run the single-node review flow below
   - Present each review result before moving to the next
   - If any node gets REQUEST CHANGES, note it and continue with the remaining nodes
4. After all reviews, present a summary: which nodes passed, which need changes

## Prerequisites

- Node must have status "built" or "reviewed" (for re-review)
- `.forgeplan/specs/[node-id].yaml` must exist
- Code files must exist in the node's `file_scope` directory

## Setup

1. **Read** `.forgeplan/state.json`, then **update** (do not overwrite) these fields:
   - Set `nodes.[node-id].previous_status` to the node's current status (e.g., `"built"` or `"reviewed"`) — this is used by recovery SKIP to restore the correct state
   - Set `active_node` to `{"node": "[node-id]", "status": "reviewing", "started_at": "[ISO timestamp]"}`
   - Set `nodes.[node-id].status` to `"reviewing"`
   - Set `last_updated` to current ISO timestamp
   - Preserve all other existing fields

2. **Read** `.forgeplan/config.yaml` if it exists. Check `review.mode` and `enforcement.mode`. If config doesn't exist, defaults are `review.mode: "native"` and `enforcement.mode: "advisory"`.

## Tier-Aware Review Depth

Read `complexity_tier` from `.forgeplan/manifest.yaml` to adapt review depth:
- **SMALL:** The Reviewer agent uses abbreviated mode (3 critical dimensions only: spec compliance, constraints, non-goals). Faster, less token usage.
- **MEDIUM:** Full 7-dimension review but compressed output (per-criterion PASS/FAIL without extensive narrative).
- **LARGE (or no tier set):** Full 7-dimension review with detailed evidence and recommendations.

## Step 1: Native Review (always runs)

Perform a spec-diff review. The depth is tier-dependent (see above), but every finding must reference a specific spec element and cite specific code evidence regardless of tier.

### Seven Audit Dimensions

1. **Spec compliance** — For EACH acceptance criterion by ID: PASS/FAIL with code file and function citation
2. **Interface integrity** — For EACH interface: PASS/FAIL on contract implementation and directional type
3. **Constraint enforcement** — For EACH constraint: ENFORCED/VIOLATED with evidence
4. **Pattern consistency** — Code follows conventions from completed nodes
5. **Anchor comment coverage** — All files have `@forgeplan-node`, major functions have `@forgeplan-spec`
6. **Non-goal enforcement** — For EACH non_goal: was it implemented? Flag for removal if so
7. **Failure mode coverage** — For EACH failure_mode: defensive code present? Cite it or flag absence

### Native Review Output

Write the native review report to `.forgeplan/reviews/[node-id].md` using the structured format:

```
## Review: [node-id]
**Date:** [ISO timestamp]
**Reviewer:** [model name, e.g. "Claude Opus 4.6" or "Claude Sonnet 4.6"]
**Review type:** native | cross-model ([provider])
**Cycle:** [1 if first review, 2+ if re-review after fixes]

### Acceptance Criteria
- AC1: PASS/FAIL — [evidence]
...
### Constraints
- "[constraint]": ENFORCED/VIOLATED — [evidence]
...
### Interfaces
- [target] ([type]): PASS/FAIL — [evidence]
...
### Non-Goals
- [finding or "No violations found"]
### Failure Modes
- "[mode]": PASS/FAIL — [evidence]
...
### Recommendation: APPROVE | REQUEST CHANGES ([count] failures: [list])
```

## Step 1.5: Multi-Agent Review Cycles (if configured)

Check `multi_agent_review.enabled` in config.yaml. If true and the native review found issues (REQUEST CHANGES):

**Before dispatching a fixer agent**, transition the status so PreToolUse allows implementation writes:
- Set `active_node.status` to `"review-fixing"` in state.json
- This enables the same write enforcement as `"building"` (file_scope, shared model guard, PostToolUse file registration)
- After the fixer returns, set `active_node.status` back to `"reviewing"` before dispatching the re-reviewer

1. Spawn a **fresh Builder agent** using `context: fork` (isolated subagent with NO shared context from the current session). Provide it ONLY:
   - The original node spec (read fresh from `.forgeplan/specs/[node-id].yaml`)
   - The current code on disk (read fresh from the node's `file_scope`)
   - The specific review findings to address (from the review report)
   - Instruction: fix ONLY the cited issues, do not refactor or add features
   - Do NOT pass conversation history, prior reasoning, or the builder's original context
   - **Model selection** based on `fixer_model` config:
     - `"opus"` — use opus for all fixes
     - `"auto-high"` (default, recommended) — classify each finding:
       - **Simple** (missing import, typo, one-line fix) → `sonnet`
       - **Complex** (architectural, multi-file, logic rewrite, security) → `opus`
     - `"auto"` — three-tier classification:
       - **Trivial** (typo, formatting) → `haiku`
       - **Directed** (missing AC, add validation, wire interface) → `sonnet`
       - **Complex** (architectural, multi-file, security) → `opus`
     - `"sonnet"` or `"haiku"` — use that model for all fixes
2. After fixes, spawn a **fresh Reviewer agent** using `context: fork` (using `multi_agent_review.reviewer_model`, default opus) to re-review from scratch
3. If still REQUEST CHANGES and cycle count < `max_cycles` (default 3), repeat from step 1
4. If APPROVE or max cycles reached, proceed to Step 2

**Context rules:** The review command itself (the orchestrator) retains context across cycles — it needs to track progress, compare findings, and decide when to stop. But every agent it **dispatches** (fixer agents and reviewer agents) must be spawned fresh with `context: fork` — no shared conversation history, no prior reasoning, no builder context. This is what eliminates same-context blindness.

The cycle reports are appended to `.forgeplan/reviews/[node-id].md` with cycle numbers.

## Step 2: Cross-Model Review (if BYOK configured)

After the native review (and optional multi-agent cycles) completes, check the `review.mode` from config.yaml:

- **If `review.mode` is `"native"` or config doesn't exist:** Skip cross-model review. Proceed to Completion.
- **If `review.mode` is `"mcp"`, `"cli"`, or `"api"`:** Run the cross-model review script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cross-model-review.js" [node-id]
```

This sends the node's spec and implementation files to the alternate model for independent review. The script:
- Reads the node spec, manifest, and all implementation files
- Assembles a review prompt with the seven audit dimensions
- Calls the alternate model via MCP server, CLI subprocess, or API (per config)
- Writes the cross-model report to `.forgeplan/reviews/[node-id]-crossmodel.md`
- Outputs a JSON result with `status` ("approved" or "changes_requested") and `findings_count`

Parse the JSON output and present the cross-model findings to the user alongside the native review.

## Step 3: Enforcement Gate

The `enforcement.mode` from config.yaml determines whether cross-model review blocks the status transition:

### `enforcement.mode: "advisory"` (default)
The node advances to `"reviewed"` regardless of the cross-model result. Cross-model findings are informational — presented to the user but not blocking.

### `enforcement.mode: "strict"`
The node can only advance to `"reviewed"` if **both** the native review and the cross-model review pass:
- If the native review recommends APPROVE **and** the cross-model review returns `status: "approved"` → advance to `"reviewed"`
- If either review has failures → do NOT advance. **Restore node status before suggesting next steps:**
  1. Set `nodes.[node-id].status` back to `nodes.[node-id].previous_status` (e.g., `"built"`)
  2. Clear `nodes.[node-id].previous_status` to `null`
  3. Clear `active_node` to `null`
  4. Set `last_updated` to current ISO timestamp
  Then present the combined failures and suggest:
    - `/forgeplan:build [node-id]` to address the failures and rebuild
    - `/forgeplan:review [node-id]` to re-review after fixes

**If cross-model review errors** (network failure, misconfigured provider, timeout): In strict mode, **restore node status first** (same steps as above — set status back to `previous_status`, clear `previous_status`, clear `active_node`), then warn the user that the cross-model gate could not be evaluated and offer two choices:
1. Retry the cross-model review
2. Override and advance to `"reviewed"` anyway (with a note in the review report that cross-model verification was skipped)

## Completion

Update state.json:
- Set `nodes.[node-id].status` to `"reviewed"`
- Set `nodes.[node-id].last_review` to `".forgeplan/reviews/[node-id].md"`
- If cross-model review ran, also set `nodes.[node-id].last_crossmodel_review` to `".forgeplan/reviews/[node-id]-crossmodel.md"`
- Clear `nodes.[node-id].previous_status` to `null`
- Clear `active_node` to `null`
- Set `last_updated` to current ISO timestamp

**After updating state, suggest next steps based on the review outcome:**

- **If APPROVE:** Suggest:
  - `/forgeplan:next` to see the next recommended action
  - `/forgeplan:integrate` if all nodes are now reviewed (to verify cross-node interfaces)
- **If REQUEST CHANGES:** Suggest:
  - `/forgeplan:build [node-id]` to rebuild this node and address the findings
