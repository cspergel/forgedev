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

1. Spawn a **fresh Builder agent** with:
   - The original node spec
   - The current code on disk
   - The specific review findings to address
   - Instruction: fix ONLY the cited issues, do not refactor or add features
   - **Model selection** (if `fixer_model` is `"auto"`, classify each finding's complexity):
     - **Simple** (missing import, typo, formatting fix) → use `haiku`
     - **Directed** (implement missing AC, add validation, wire interface) → use `sonnet`
     - **Complex** (architectural change, multi-file logic rewrite, security fix) → use `opus`
   - If `fixer_model` is a specific model name, use that for all fixes
2. After fixes, spawn a **fresh Reviewer agent** (using `multi_agent_review.reviewer_model`, default opus) to re-review
3. If still REQUEST CHANGES and cycle count < `max_cycles` (default 3), repeat from step 1
4. If APPROVE or max cycles reached, proceed to Step 2

Each cycle uses a FRESH agent — no shared context with the builder that wrote the original code or the previous fix agent. This eliminates same-context blindness.

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
- If either review has failures → do NOT advance. Present the combined failures and recommend running `/forgeplan:build [node-id]` to address them, then re-running `/forgeplan:review`

**If cross-model review errors** (network failure, misconfigured provider, timeout): In strict mode, warn the user that the cross-model gate could not be evaluated and offer two choices:
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
