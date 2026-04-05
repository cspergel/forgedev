---
description: Full autonomous build pipeline. Builds all nodes, reviews them, runs integration, sweeps for cross-cutting issues, fixes with cross-model verification, and produces a certification report. You describe what you want, then walk away.
user-invocable: true
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# Deep Build — Full Autonomous Pipeline

Run the complete ForgePlan pipeline autonomously: build all → review all → integrate → sweep → fix → cross-check → repeat until certified.

## Prerequisites

- `.forgeplan/manifest.yaml` exists with nodes defined
- All nodes must be at status `pending` or later (deep-build handles speccing pending nodes in Phase 2)
- No active build (`active_node` must be null)
- No active sweep (`sweep_state` must be null)

## Process

### Phase 1: Initialize deep-build state

1. Read `.forgeplan/state.json` and verify prerequisites
2. Set `sweep_state`:
   ```json
   {
     "sweep_state": {
       "operation": "deep-building",
       "started_at": "[ISO timestamp]",
       "current_phase": "build-all",
       "pass_number": 1,
       "current_model": "claude",
       "fixing_node": null,
       "consecutive_clean_passes": 0,
       "max_passes": 10,
       "findings": { "pending": [], "resolved": [] },
       "modified_files_by_pass": {},
       "integration_results": { "last_run": null, "passed": false, "failures": [] }
     }
   }
   ```

   Note: `current_phase` starts as `"build-all"`, NOT `"claude-sweep"`. This is critical — next-node.js allows normal recommendations during the `"build-all"` phase but blocks them during sweep phases.

### Phase 2: Build all nodes

This is a sequential loop using existing commands:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/next-node.js"` to get the recommended node
2. Handle result by type:
   - `"recommendation"`:
     - If status is `"pending"`: run `/forgeplan:spec [node-id]` first, then `/forgeplan:build [node-id]`
     - If status is `"specced"`: run `/forgeplan:build [node-id]`
     - After each build, run `/forgeplan:review [node-id]`
   - `"complete"`: all nodes done, proceed to Phase 3
   - `"stuck"`: auto-recover stuck nodes (set status back to "specced" for building nodes, "built" for reviewing nodes, clear `active_node`), then re-run next-node.js. Do NOT invoke interactive `/forgeplan:recover` — deep-build must stay autonomous.
   - `"blocked"` or `"error"`: halt deep-build with error message, preserve `sweep_state` for recovery:
     ```
     Deep build halted: [message from next-node.js]
     Run /forgeplan:recover to resume or abort.
     ```
   - `"rebuild_needed"`: for each listed node, run `/forgeplan:build [node-id]` then `/forgeplan:review [node-id]` (same build+review pattern as the recommendation branch — no unreviewed nodes in the autonomous pipeline), then re-run next-node.js
3. Repeat until `"complete"`.

All existing enforcement (PreToolUse, PostToolUse, Builder agent, Stop hook) applies exactly as in manual builds. The deep-build orchestrator just drives the loop.

**Important:** For each build and review, use fresh Agent subagents. Do not accumulate context across node builds.

**Phase transition:** After all nodes are built and reviewed, update `sweep_state.current_phase` from `"build-all"` to `"integrate"`. This is the point where next-node.js stops returning recommendations and starts returning `type: "sweep_active"`.

### Phase 3: Initial integration check

Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/integrate-check.js"
```

Map result to `sweep_state.integration_results`:
```
passed = (verdict === "PASS" || verdict === "PASS_WITH_WARNINGS")
failures = interfaces.filter(i => i.status === "FAIL")
```

If `verdict === "INCOMPLETE"`: log warning, treat as pass (same as sweep Phase 5).

If integration fails and `failures.length > 0`, add each failure as a finding in `sweep_state.findings.pending` and proceed to fix cycle.

### Phase 4: Claude sweep

Run `/forgeplan:sweep` (dispatch all sweep agents in parallel, merge findings, fix with node-scoped enforcement, progressive convergence).

After Claude sweep fixes, re-integrate (Phase 3 logic).

### Phase 5: Cross-model verification loop

This phase follows the **exact same logic as sweep Phase 6** (Task 9). All status handling, phase transitions, and error paths apply identically. The deep-build orchestrator executes this inline rather than delegating to `/forgeplan:sweep`.

1. Set `sweep_state.current_phase` to `"cross-check"`
2. Run cross-model bridge:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/cross-model-bridge.js" ".forgeplan/sweeps/sweep-[latest].md"
   ```
3. Check the result `status` field — handle ALL statuses exactly as sweep Phase 6:

   **If `status: "skipped"`:** Log warning ("no alternate model configured"), set `consecutive_clean_passes` to 2, proceed to Phase 6 (finalize). Note in report that cross-model was not performed.

   **If `status: "error"`:** Reset `consecutive_clean_passes` to 0. Do NOT increment `pass_number`. Track consecutive error count. On second consecutive error: set `halted_from_phase` to `"cross-check"`, set `current_phase` to `"halted"`, present error to user. Otherwise: retry immediately.

   **If `status: "findings"`:**
   - Re-number IDs with `X` prefix. Set `pass_found` on each.
   - Add to `sweep_state.findings.pending`
   - Set `consecutive_clean_passes` to 0
   - Increment `sweep_state.pass_number`
   - Set `sweep_state.current_phase` to `"cross-fix"`
   - Fix findings (node-scoped, same as sweep Phase 4 — save/restore node status, fresh agent per node)
   - Set `sweep_state.current_phase` to `"integrate"`
   - Re-integrate (same as sweep Phase 5)
   - Loop back to step 1

   **If `status: "clean"`:**
   - Increment `consecutive_clean_passes`
   - Increment `pass_number`
   - If `consecutive_clean_passes >= 2`: proceed to Phase 6
   - If `consecutive_clean_passes == 1`: loop back to step 1

4. If `pass_number >= max_passes`: set `halted_from_phase` to `current_phase`, set `current_phase` to `"halted"`, report unresolved findings

### Phase 6: Final integration and report

1. Run final integration check
2. Generate deep-build report at `.forgeplan/deep-build-report.md`:

```markdown
# Deep Build Report

## Summary
- Project: [project name]
- Nodes: [N] built, reviewed, and verified
- Total passes: [N]
- Wall-clock time: [duration]
- Final integration: [PASS/FAIL]
- Cross-model consecutive clean passes: [N]

## Findings Timeline
| Pass | Model | Found | Resolved | Category |
|------|-------|-------|----------|----------|
| 1    | claude | 5    | 5        | types(2), imports(2), errors(1) |
| 2    | codex  | 2    | 2        | security(1), api(1) |
| 3    | codex  | 0    | 0        | — (clean) |
| 4    | codex  | 0    | 0        | — (clean, certified) |

## All Findings
[For each finding: ID, source model, node, category, description, resolution]

## Integration Results
[Final integration check output]
```

3. Clear `sweep_state` to null
4. Present results:

```
=== Deep Build Complete ===
All [N] nodes built, reviewed, and cross-model certified.
[total] findings found and resolved across [passes] passes.
Cross-model certified clean on [N] consecutive passes.
Report: .forgeplan/deep-build-report.md
```

## Per-Pass Git Commits (Recommended)

After each completed fix cycle, create a git commit:
```bash
git add -A
git commit -m "forgeplan: sweep pass [N] — [resolved] findings resolved"
git tag forgeplan-sweep-pass-[N]
```

This makes "abort to pre-sweep state" trivially safe via git reset.

## Error Handling

- If any phase fails fatally, write current state and halt
- All state is persisted after every transition for crash recovery
- Use /forgeplan:recover to resume interrupted deep-builds
