---
description: Audit a built node against its spec using the seven-dimension review format. Native Claude review, plus optional cross-model verification via BYOK. Produces structured pass/fail reports with code evidence citations.
user-invocable: true
argument-hint: "[node-id]"
allowed-tools: Read Write Glob Grep Bash
agent: reviewer
context: fork
---

# Review Node

Audit the specified node's implementation against its spec.

**Target node:** $ARGUMENTS

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

## Step 1: Native Review (always runs)

Perform a spec-diff review across seven dimensions. Every finding must reference a specific spec element and cite specific code evidence.

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
- Set `nodes.[node-id].status` to `"review-fixing"` in state.json
- This enables the same write enforcement as `"building"` (file_scope, shared model guard, PostToolUse file registration)
- After the fixer returns, set both `active_node.status` and `nodes.[node-id].status` back to `"reviewing"` before dispatching the re-reviewer

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

**Cycle report format:** Each re-reviewer writes to a cycle-specific file: `.forgeplan/reviews/[node-id]-cycle-[N].md`. The orchestrator consolidates results by appending a cycle summary to the main review file `.forgeplan/reviews/[node-id].md` with a header like `## Cycle [N] Review`. This prevents the re-reviewer from overwriting the original review. The `fixer_model` classification (auto-high/auto) applies to the **single fixer agent per cycle** — classify based on the most complex finding in the batch (if any finding is complex, use opus for the entire fix).

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
- If the native review recommends APPROVE **and** the cross-model review returns `status: "approved"` → advance to `"reviewed"` (proceed to Completion — Advancing)
- If either review has failures → do NOT advance. Proceed to Completion — Non-Advancing. Present the combined failures and recommend re-running `/forgeplan:review` (which will trigger another multi-agent fix cycle if enabled) or running `/forgeplan:build [node-id]` for a full rebuild.

**If cross-model review errors** (network failure, misconfigured provider, timeout): In strict mode, warn the user that the cross-model gate could not be evaluated and offer two choices:
1. Retry the cross-model review
2. Override and advance to `"reviewed"` anyway (with a note in the review report that cross-model verification was skipped)

## Completion — Advancing

When the review passes (advisory mode, or strict mode with both reviews approving):

Update state.json:
- Set `nodes.[node-id].status` to `"reviewed"`
- Set `nodes.[node-id].last_review` to `".forgeplan/reviews/[node-id].md"`
- If cross-model review ran, also set `nodes.[node-id].last_crossmodel_review` to `".forgeplan/reviews/[node-id]-crossmodel.md"`
- Clear `nodes.[node-id].previous_status` to `null`
- Clear `active_node` to `null`
- Set `last_updated` to current ISO timestamp

## Completion — Non-Advancing (strict mode failure only)

When strict enforcement blocks advancement:

Update state.json:
- Restore `nodes.[node-id].status` to `nodes.[node-id].previous_status` (the status before the review started, e.g., `"built"`)
- Set `nodes.[node-id].last_review` to `".forgeplan/reviews/[node-id].md"` (the review report remains on disk for reference)
- If cross-model review ran, also set `nodes.[node-id].last_crossmodel_review` to `".forgeplan/reviews/[node-id]-crossmodel.md"`
- Clear `nodes.[node-id].previous_status` to `null`
- Clear `active_node` to `null`
- Set `last_updated` to current ISO timestamp

This unblocks the user — the node is back to `"built"` (or whatever it was), so they can run `/forgeplan:review` again or `/forgeplan:build` to address the findings.
