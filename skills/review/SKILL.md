---
description: Review one built node or all built nodes against their specs.
argument-hint: "[node-id|--all]"
disable-model-invocation: true
---

# Review Node

Audit the specified node's implementation against its spec.

**Target:** $ARGUMENTS

## Review All Mode (`--all`)

If the argument is `--all`, review all built nodes in dependency order. Use tier-aware batching:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/topo-sort.js"` to get the dependency order
2. Read `.forgeplan/state.json` to find nodes with status `"built"` (not yet review-complete)
3. Read `.forgeplan/manifest.yaml` and partition the eligible built nodes into dependency-safe batches:
   - Nodes in the same batch must not depend on one another
   - A simple rule is sufficient: use topological layers from the manifest dependency graph
4. Dispatch review work by tier:
   - `SMALL`: review sequentially
   - `MEDIUM`/`LARGE`: review one dependency-safe batch at a time, with nodes inside the batch reviewed in parallel using fresh Reviewer agents
5. For parallel batches:
   - Do **not** call `start-review` for every node before dispatching the batch. The runtime only has one `active_node`, so pre-marking multiple nodes as `"reviewing"` is invalid.
   - Keep the batch read-only: reviewer agents may write only `.forgeplan/reviews/[node-id].md`
   - After the whole batch returns, process the nodes in topological order and serialize the final state transitions with `complete-review`
6. If any node gets REQUEST CHANGES, note it and continue with the remaining eligible nodes
7. After all reviews, present a summary: which nodes passed cleanly and which completed with findings

## Prerequisites

- Node must have status "built", "reviewed", or "reviewed-with-findings" (for re-review)
- `.forgeplan/specs/[node-id].yaml` must exist
- Code files must exist in the node's `file_scope` directory

## Setup

1. For single-node review, update state using the deterministic helper instead of manual file editing:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" start-review "[node-id]" "[previous-status]"
   ```
   This atomically sets:
   - `nodes.[node-id].previous_status`
   - `active_node`
   - `nodes.[node-id].status`
   - `last_updated`
   Do not manually edit `.forgeplan/state.json` for this transition.

   For `--all` parallel review batches, skip this pre-transition and keep reviews read-only until batch completion. Final state transitions are serialized after reports are written.

2. **Read** `.forgeplan/config.yaml` if it exists. Check `review.mode` and `enforcement.mode`. If config doesn't exist, defaults are `review.mode: "native"` and `enforcement.mode: "advisory"`.

## Tier-Aware Review Depth

Read `complexity_tier` from `.forgeplan/manifest.yaml` to adapt review depth:
- **SMALL:** The Reviewer agent uses abbreviated mode (3 critical dimensions only: spec compliance, constraints, non-goals). Faster, less token usage.
- **MEDIUM:** Full 7-dimension review but compressed output (per-criterion PASS/FAIL without extensive narrative).
- **LARGE (or no tier set):** Full 7-dimension review with detailed evidence and recommendations.

## Skill Loading (Sprint 11)

Before dispatching the Reviewer agent, load skills from the registry:
1. Read `.forgeplan/skills-registry.yaml`. If missing, the pre-tool-use hook auto-generates it.
2. Look up `assignments.reviewer` for skill paths, descriptions, and hints.
3. Include skill hints in the Reviewer agent's dispatch prompt:
   - `read_now` skills: "READ NOW: [path] — [description]. Read before starting review."
   - `reference` skills: "REFERENCE: [path] — [description]. Consult if relevant."

**For SMALL tier:** Skip skill loading.

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
- Run:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" start-review-fixing "[node-id]"
  ```
- This enables the same write enforcement as `"building"` (file_scope, shared model guard, PostToolUse file registration)
- After the fixer returns, re-run the review setup helper to put the node back into `"reviewing"` before dispatching the re-reviewer

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
- Outputs a JSON result with `status` (`"approved"`, `"changes_requested"`, or `"skipped_fallback"`) and `findings_count`

Parse the JSON output and present the cross-model findings to the user alongside the native review.

## Conflict Resolution Policy

ForgePlan must not resolve reviewer vs. certifier disagreements by "who sounds smarter."
Use this precedence order:

1. Deterministic/runtime truth
   - passing/failing tests
   - verify-runnable
   - integrate-check
   - file-scope/state-transition enforcement
2. Explicit spec/contract truth
   - acceptance criteria
   - constraints
   - interfaces
   - non-goals
   - failure-mode requirements
3. Native and cross-model review findings
4. Advisory refactor preferences

Apply the policy as follows:
- If the cross-model reviewer suggests a refactor that breaks an explicit accepted structural constraint or manifest/spec contract, the contract wins. Treat the suggestion as rejected advisory input, not as a blocking failure.
- If the cross-model reviewer identifies a genuine contract/runtime/spec violation, that may block or downgrade the node per `enforcement.mode`.
- If the cross-model reviewer is effectively arguing that the spec/constraint itself should change, classify that as a spec conflict and surface it for revision/manual attention rather than treating the current implementation as wrong.
- Advisory refactors alone must not force `REQUEST CHANGES`.

## Step 3: Enforcement Gate

The `enforcement.mode` from config.yaml determines whether cross-model review blocks the status transition:

### `enforcement.mode: "advisory"` (default)
The review operation completes even if findings remain, but the terminal node status must reflect whether the review actually passed:
- If all active review lenses pass (native APPROVE, and cross-model APPROVE or skipped) → advance to `"reviewed"`
- If any findings remain deferred (native REQUEST CHANGES, cross-model changes requested, or advisory fallback with unresolved issues) → advance to `"reviewed-with-findings"`

Cross-model findings are informational in advisory mode — they do not block the pipeline — but they must not be hidden behind a plain `"reviewed"` status.

### `enforcement.mode: "strict"`
The node can only advance to `"reviewed"` if **both** the native review and the cross-model review pass:
- If the native review recommends APPROVE **and** the cross-model review returns `status: "approved"` → advance to `"reviewed"`
- If either review has failures → do NOT advance. **Restore node status before suggesting next steps:**
  1. Run:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" restore-previous-status "[node-id]"
     ```
  Then present the combined failures and suggest:
    - `/forgeplan:build [node-id]` to address the failures and rebuild
    - `/forgeplan:review [node-id]` to re-review after fixes

**If cross-model review errors** (network failure, misconfigured provider, timeout): In strict mode, **restore node status first** with:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" restore-previous-status "[node-id]"
```
then warn the user that the cross-model gate could not be evaluated and offer two choices:
1. Retry the cross-model review
2. Override and advance to `"reviewed"` anyway (with a note in the review report that cross-model verification was skipped)

**Implementation note:** `cross-model-review.js` currently reports provider/setup failures as `status: "skipped_fallback"` rather than `"error"`. In strict mode, treat `skipped_fallback` exactly like an unevaluated cross-model gate: restore status first, then offer retry or override.

## Completion

Update state with the deterministic helper. Choose the terminal status explicitly:

- Use `"reviewed"` only when all required review lenses approve.
- Use `"reviewed-with-findings"` in advisory mode when the review is complete but findings remain deferred to later sweep/rebuild work.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" complete-review "[node-id]" ".forgeplan/reviews/[node-id].md" "[.forgeplan/reviews/[node-id]-crossmodel.md|-]" "[reviewed|reviewed-with-findings]"
```
This atomically sets the final review-complete status, persists review report paths, clears `previous_status`, clears `active_node`, and updates `last_updated`.

**After updating state, suggest next steps based on the review outcome:**

Before presenting next steps, compute them deterministically with:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/review-next-action.js" "[node-id]"
```
Use that helper output as the source of truth for the closeout wording and primary next step.

Also compute the autonomy handoff explicitly with:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/autonomy-handoff.js"
```
If it reports `autonomous_available: true`, explicitly tell the user they can steer back into autonomy with `/forgeplan:deep-build` from the current state.

- **If APPROVE:** Suggest:
  - `/forgeplan:next` to see the next recommended action
  - `/forgeplan:integrate` if all nodes are now review-complete (to verify cross-node interfaces)
- **If REQUEST CHANGES:** Suggest:
  - `/forgeplan:build [node-id]` to rebuild this node and address the findings
  - `/forgeplan:sweep` if findings are being intentionally deferred to the later autonomous fix pass

Advisory-mode presentation rule:
- If the terminal status is `"reviewed-with-findings"`, do **not** present the final banner as if the node is blocked in-place. Use wording like `Advisory findings recorded` or `Review complete with deferred findings`.
- In that advisory case, the primary next step should be the helper's rebuild recommendation, with sweep as the defer option.
- In both clean and advisory cases, surface the autonomy handoff if available so the user can choose manual steering or immediate return to autonomous execution.
