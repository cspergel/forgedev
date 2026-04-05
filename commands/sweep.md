---
description: Sweep your entire codebase for cross-cutting issues. 12 parallel agents audit auth/security, type consistency, error handling, database, API contracts, imports, code quality, test quality, config/env, frontend UX, documentation, and cross-node integration. Agents that converge (return CLEAN) are dropped from subsequent passes. Findings are fixed with node-scoped enforcement, then cross-model verified.
user-invocable: true
argument-hint: "[--cross-check (also run cross-model verification)]"
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# Codebase Sweep

**THIS ENTIRE COMMAND IS AUTONOMOUS. Once started, execute ALL phases (1→7) without stopping, pausing, or asking the user for input. The only time you stop is if the sweep halts due to pass limit or unrecoverable error. Present the final report at Phase 7 — not before. Do not present intermediate results and wait. Do not ask "shall I continue?" or "would you like me to proceed?" — just proceed.**

Run up to 12 parallel sweep agents across the entire codebase, then fix findings with node-scoped enforcement. Agents that return CLEAN are progressively dropped from subsequent passes — only agents with findings re-run.

## Prerequisites

- `.forgeplan/manifest.yaml` exists
- `.forgeplan/state.json` exists
- No active build (`active_node` must be null or all nodes in terminal states)
- All nodes should be in `built`, `reviewed`, or `revised` status (warn if not)

## Process

### Phase 1: Initialize sweep state

1. Read `.forgeplan/state.json` and verify no active operation
2. **Check if `sweep_state` already exists with `operation: "deep-building"`.** If so, this sweep was invoked from within a deep-build — **skip Phase 1 initialization entirely** (preserve the existing deep-build state) and jump to Phase 2. Also skip Phase 7 finalization on exit (deep-build handles its own finalization). Set `sweep_state.current_phase` to `"claude-sweep"` and `sweep_state.current_model` to `"claude"` to indicate we're in the sweep portion.
3. Create `.forgeplan/sweeps/` directory if it doesn't exist
4. Set `sweep_state` in state.json (only when NOT called from deep-build):
   ```json
   {
     "sweep_state": {
       "operation": "sweeping",
       "started_at": "[ISO timestamp]",
       "current_phase": "claude-sweep",
       "pass_number": 1,
       "current_model": "claude",
       "fixing_node": null,
       "consecutive_clean_passes": 0,
       "max_passes": 10,
       "findings": { "pending": [], "resolved": [] },
       "modified_files_by_pass": {},
       "agent_convergence": {},
       "integration_results": { "last_run": null, "passed": false, "failures": [] }
     }
   }
   ```
5. Set `active_node` to `null`

### Phase 2: Dispatch sweep agents (progressive reduction)

**All 12 agents on the first pass. On subsequent passes, only re-run agents that had findings.**

Agent definition files (read these, use as system prompts):
- `agents/sweep-auth-security.md`
- `agents/sweep-type-consistency.md`
- `agents/sweep-error-handling.md`
- `agents/sweep-database.md`
- `agents/sweep-api-contracts.md`
- `agents/sweep-imports.md`
- `agents/sweep-code-quality.md`
- `agents/sweep-test-quality.md`
- `agents/sweep-config-environment.md`
- `agents/sweep-frontend-ux.md` (skip if no frontend nodes in manifest)
- `agents/sweep-documentation.md`
- `agents/sweep-cross-node-integration.md`

**Progressive agent reduction:**
1. On **pass 1**: dispatch ALL agents (or all applicable — skip `frontend-ux` if no frontend nodes).
2. After merging results, update `sweep_state.agent_convergence` for each agent:
   ```json
   "agent_convergence": {
     "auth-security": { "status": "clean", "last_findings_pass": null, "consecutive_clean": 1 },
     "type-consistency": { "status": "active", "last_findings_pass": 1, "consecutive_clean": 0 },
     ...
   }
   ```
   - `status`: `"clean"` (returned CLEAN), `"active"` (had findings), `"converged"` (2 consecutive clean passes — retired)
   - `last_findings_pass`: which pass this agent last found something
   - `consecutive_clean`: how many consecutive passes returned CLEAN
3. On **pass 2+**: only dispatch agents where `status !== "converged"`. An agent that returned CLEAN on pass N gets re-run ONCE on pass N+1 to confirm. If clean again → `status: "converged"`, agent is retired for the rest of the sweep.
4. **Exception:** `cross-node-integration` always re-runs if ANY other agent had findings (since fixes in one domain can break integration). It only converges when it returns CLEAN AND no other active agents had findings in the same pass.
5. **Exception:** `code-quality` re-runs if ANY agent had findings (cross-cutting by nature). Same convergence rule as cross-node-integration.

**How to dispatch:** Use the Agent tool to dispatch all active agents **in parallel** (single message, N Agent tool calls).

For each agent, provide as context in the Agent tool prompt:
- The agent's own system prompt (from its `.md` file)
- The full manifest (read `.forgeplan/manifest.yaml`)
- The full state (read `.forgeplan/state.json` — node statuses)
- ALL implementation files (read every file listed in every node's `files` array in the manifest)
- The shared types file (`src/shared/types/index.ts`)
- ALL node specs (read each `.forgeplan/specs/[node-id].yaml`)

Each agent returns findings in the structured FINDING format or CLEAN.

### Phase 3: Merge and deduplicate findings

1. Collect all findings from the dispatched agents
2. **Validate node IDs:** Discard any finding whose `node` field is not in `Object.keys(manifest.nodes)`. Log a warning for each discarded finding ("Finding F[N] references unknown node '[id]' — discarding"). This prevents crashes in Phase 4 when PreToolUse tries to look up a nonexistent node's file_scope. Apply the same validation in Phase 6 for cross-model findings.
3. **Re-number** all remaining findings sequentially as F1, F2, F3... (discard the agents' self-assigned IDs, which will collide across agents)
4. Deduplicate: if two agents report the same file + same issue, keep the one with higher severity
5. Group findings by node
6. Write the sweep report to `.forgeplan/sweeps/sweep-[ISO-timestamp].md`:
   ```markdown
   # Sweep Report — Pass [N]

   Model: claude
   Timestamp: [ISO]
   Total findings: [N]
   By category: auth-security: [N], type-consistency: [N], ...

   ## Findings by Node

   ### [node-id]
   - F1 [category] [severity]: [description] — [file]:[line]
   ...
   ```
7. Add all findings to `sweep_state.findings.pending`. **Set `pass_found: sweep_state.pass_number`** on each finding before inserting — `extractFindings` and the sweep agents don't include this field, but the state schema requires it.
8. If there are findings: update `sweep_state.current_phase` to `"claude-fix"` and proceed to Phase 4.
9. **If zero findings** (all agents returned CLEAN): skip Phase 4, set `sweep_state.current_phase` to `"integrate"`, and proceed directly to Phase 5.

### Phase 4: Fix findings (node-scoped)

**THIS PHASE IS FULLY AUTONOMOUS. Fix ALL findings — do NOT ask the user which findings to fix, do NOT ask for confirmation, do NOT prioritize by severity. Fix everything in dependency order. The sweep is designed to loop: fix → re-sweep → fix → converge. If a fix introduces a new issue, the next sweep pass will catch it. Asking the user breaks the autonomous loop.**

For each node that has findings, in dependency order (use topological sort from manifest `depends_on`):

1. **Save node's current status:** Set `nodes.[node-id].previous_status` to current `nodes.[node-id].status` (e.g., "built", "reviewed", "revised")
2. **Set node to sweeping:** Set `nodes.[node-id].status` to `"sweeping"`
3. **Set active_node:** Set `active_node` to `{"node": "[node-id]", "status": "sweeping", "started_at": "[ISO]"}`
4. Set `sweep_state.fixing_node` to the node ID
5. Read the node's spec and the relevant findings
6. Fix each finding — writes are enforced by PreToolUse (node's file_scope) + Layer 1 deterministic. Layer 2 is bypassed for sweeping (see hooks.json update in Task 14).
   - **If the fix agent returns BLOCKED:** Mark the finding as `unresolvable` (add `"blocked": true` to the finding object). Do NOT retry — move on to the next finding. Unresolvable findings stay in `pending` and appear in the final report with a note that they need manual attention. This prevents infinite retry loops since the Stop hook is bypassed during sweeping.
7. After fixing all findings for this node:
   - **Restore node status:** Set `nodes.[node-id].status` back to `nodes.[node-id].previous_status`
   - Clear `nodes.[node-id].previous_status` to null
   - Clear `active_node` to null
   - Set `sweep_state.fixing_node` to null
   - Move findings from `pending` to `resolved` (set `resolved_by: "claude"`, `resolved_pass: [N]`)
8. Repeat for next node

This mirrors the save/restore pattern used for building and reviewing — recovery and integrate-check both depend on `nodes.[id].status` being correct.

**IMPORTANT:** Use a FRESH agent for each node fix (Agent tool). Do not fix in the same context that found the issue. This is the "Fresh Agent on Fix" principle.

### Phase 5: Re-integrate

1. **Set `sweep_state.current_phase` to `"integrate"`** before running the check (so crash recovery knows we're integrating, not still fixing).
2. Run integration check:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/integrate-check.js"
```
3. Map the result:
- `passed = (verdict === "PASS" || verdict === "PASS_WITH_WARNINGS")`
- `failures = interfaces.filter(i => i.status === "FAIL")`
- **If `verdict === "INCOMPLETE"`:** Log a warning ("Integration check incomplete — some nodes may not have registered files. Treating as pass for sweep purposes."). Set `passed = true`. Do NOT loop — INCOMPLETE means pending/unknown interfaces that the sweep cannot fix (they need builds, not fixes). This prevents an infinite loop.
4. Update `sweep_state.integration_results`.
5. If integration fails AND `failures.length > 0`, add failures as new findings in `sweep_state.findings.pending` and loop back to Phase 4 (set `current_phase` back to `"claude-fix"`). If integration fails but `failures.length === 0` (edge case — non-PASS verdict with no FAIL interfaces), treat as pass with a warning to prevent an empty-fix infinite loop.
6. If integration passes and no `--cross-check` flag: set `current_phase` to `"finalizing"` and proceed to Phase 7.
7. If integration passes and `--cross-check` flag: proceed to Phase 6.

### Phase 6: Cross-model verification (if --cross-check flag or auto in deep-build)

If the `--cross-check` flag is set:
1. Update `sweep_state.current_phase` to `"cross-check"`
2. Run `cross-model-bridge.js` with the sweep context:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cross-model-bridge.js" ".forgeplan/sweeps/sweep-[latest].md"
```
3. Check the result `status` field:

   **If `status: "skipped"`:**
   - Cross-model review is not configured (no BYOK config). This means `--cross-check` was requested but `review.mode` is `"native"` in config.yaml.
   - Log a warning: "Cross-model verification skipped — no alternate model configured in .forgeplan/config.yaml. Set review.mode to mcp, cli, or api to enable."
   - Treat as clean (the user explicitly asked for cross-check but has no config — don't block the sweep). Set `sweep_state.consecutive_clean_passes` to 2 and proceed to Phase 7 (finalizing). The deep-build report should note that cross-model verification was not performed.

   **If `status: "error"`:**
   - Log the error to the sweep report
   - Reset `sweep_state.consecutive_clean_passes` to 0 (error is NOT a clean pass)
   - Do NOT increment `pass_number` — a transient API failure is not a new sweep pass
   - Track consecutive error count (in-memory, not persisted — resets on successful call)
   - If this is the second consecutive error, set `sweep_state.halted_from_phase` to `"cross-check"`, set `current_phase` to `"halted"`, and present to user:
     ```
     Cross-model verification failed twice. Check your config.yaml review settings.
     Error: [error message from bridge]
     Run /forgeplan:recover to resume or abort.
     ```
   - Otherwise: stay at `current_phase: "cross-check"` and immediately retry the bridge call

   **If `status: "findings"`:**
   - Re-number finding IDs to avoid collision with Claude findings. Use prefix `X` for cross-model: X1, X2, X3... (Claude findings use F1, F2, F3...)
   - Add to `sweep_state.findings.pending` (set `pass_found` on each)
   - Set `sweep_state.consecutive_clean_passes` to 0
   - Increment `sweep_state.pass_number`
   - Update `sweep_state.current_phase` to `"cross-fix"`
   - Fix findings (Phase 4 loop)
   - Re-integrate (Phase 5)
   - Loop back to Phase 6 (re-cross-check)

   **If `status: "clean"`:**
   - Increment `sweep_state.consecutive_clean_passes`
   - Increment `sweep_state.pass_number`
   - If `consecutive_clean_passes >= 2`: sweep complete, proceed to Phase 7
   - If `consecutive_clean_passes == 1`: loop back to Phase 6 step 2 (run another full cross-check). The second pass verifies stability — the alternate model re-reads the full codebase from disk, so any non-determinism in its analysis produces a genuine second opinion.

### Phase 7: Finalize

1. Update `sweep_state.current_phase` to `"finalizing"`
2. Write final summary to the sweep report
3. Clear `sweep_state` to null
4. Present results to user:
   ```
   === Sweep Complete ===
   Passes: [N]
   Findings: [total found] found, [total resolved] resolved
   By category: [breakdown]
   Integration: [PASS/FAIL]
   Cross-model: [N consecutive clean passes / not run]

   Agent Convergence:
     [agent-name]: converged pass [N] | active (N findings) | skipped
     ...

   Reports: .forgeplan/sweeps/sweep-[timestamp].md
   ```

## State Persistence

Write `sweep_state` to state.json after EVERY phase transition, finding resolution, and integration result. This ensures crash recovery has an accurate snapshot.

## Pass Limit

If `pass_number` reaches `max_passes` (default 10) without 2 consecutive clean cross-model passes:

1. Set `sweep_state.halted_from_phase` to the current value of `sweep_state.current_phase` (so recovery knows where to resume from).
2. Set `sweep_state.current_phase` to `"halted"`.
3. Write `sweep_state` to state.json (do NOT clear it — user must explicitly abort or resume).
4. Present:
```
=== Sweep Halted (Pass Limit) ===
Reached [max_passes] passes without convergence.
Unresolved findings: [N]
[list unresolved findings]

Run /forgeplan:recover to resume or abort.
```
