---
description: Full autonomous build pipeline. Builds all nodes, verifies they run, reviews them, sweeps for issues, and certifies (tier-aware — SMALL skips cross-model). You describe what you want, then walk away.
user-invocable: true
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# Deep Build — Full Autonomous Pipeline

Run the complete ForgePlan pipeline autonomously: build all → verify-runnable → review → integrate → sweep → (runtime verify, Sprint 8) → cross-model (tier-aware) → certified.

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
       "agent_convergence": {},
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
     - If status is `"pending"`: run `/forgeplan:spec [node-id]` first to generate a complete spec with filled-in acceptance criteria and test fields. Verify the spec file exists and has non-empty `test` fields for each AC before proceeding. Then `/forgeplan:build [node-id]`.
     - If status is `"specced"`: verify the spec has non-empty acceptance criteria test fields (skeleton specs from discover have empty fields). If test fields are empty, re-run `/forgeplan:spec [node-id]` to complete them. Then `/forgeplan:build [node-id]`.
     - If status is `"built"`: node was built but not yet reviewed. Run `/forgeplan:review [node-id]` only.
     - After each build, run `/forgeplan:review [node-id]`
     - **Bounce exhaustion recovery:** If a node's Stop hook has bounced 3 times (escalated to user), the autonomous deep-build must NOT halt the pipeline. Instead:
       1. Mark the node as `"built"` in state.json with a warning flag: set `nodes.[id].bounce_exhausted: true` and `nodes.[id].unverified_acs` to the list of acceptance criteria that were not verified as passing.
       2. Add each unmet AC as a sweep finding in `sweep_state.findings.pending` with all required fields: `id: "B[N]"` (sequential), `source_model: "stop-hook"`, `node: "[node-id]"`, `category: "code-quality"`, `severity: "HIGH"`, `confidence: 95`, `description: "Unverified AC from bounce exhaustion: [AC text]"`, `pass_found: 0`. Note: `confidence` MUST be included (95 = high confidence these are real issues) or the sweep's <75 filter will silently drop them.
       3. Continue the pipeline to the next node — do not break autonomy.
       4. In the Phase 6 deep-build report, include a section: "**Nodes with unverified ACs (bounce exhaustion):** Node [id] completed with unverified ACs: [list]. The sweep will re-evaluate these."
   - `"complete"`: all nodes done, proceed to Phase 3
   - `"stuck"`: auto-recover stuck nodes based on their current status, then re-run next-node.js. Do NOT invoke interactive `/forgeplan:recover` — deep-build must stay autonomous.
     - `"building"` → reset to `"specced"` (rebuild from scratch)
     - `"reviewing"` → reset to `"built"` (re-review)
     - `"review-fixing"` → reset to `"built"` (re-review after fix attempt)
     - `"revising"` → reset to `"reviewed"` (re-revise)
     - `"sweeping"` → restore `previous_status` if set, otherwise reset to `"reviewed"`
     - Always clear `active_node` after reset.
   - `"blocked"` or `"error"`: halt deep-build with error message, preserve `sweep_state` for recovery:
     ```
     Deep build halted: [message from next-node.js]
     Run /forgeplan:recover to resume or abort.
     ```
   - `"rebuild_needed"`: for each listed node, run `/forgeplan:build [node-id]` then `/forgeplan:review [node-id]` (same build+review pattern as the recommendation branch — no unreviewed nodes in the autonomous pipeline), then re-run next-node.js
3. Repeat until `"complete"`.

All existing enforcement (PreToolUse, PostToolUse, Builder agent, Stop hook) applies exactly as in manual builds. The deep-build orchestrator just drives the loop.

**Important:** For each build and review, use fresh Agent subagents. Do not accumulate context across node builds.

**Phase transition:** After all nodes are built and reviewed, update `sweep_state.current_phase` from `"build-all"` to `"verify-runnable"`.

### Phase 2.5: Run verify-runnable gate

**Re-anchor:** Re-read `.forgeplan/manifest.yaml` and `.forgeplan/state.json` from disk before proceeding. Long build sessions may have lost context through compaction — re-reading ensures you have the current state of all nodes, file_scopes, and shared models.

Before proceeding to integration, verify the project can actually run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/verify-runnable.js"
```

If it **passes**: update `sweep_state.current_phase` from `"verify-runnable"` to `"integrate"` and proceed to Phase 3.

If it **fails**: dispatch a fix agent to address the issues (e.g., missing dependencies, broken imports, config errors). After the fix agent completes, re-run `verify-runnable.js`. Repeat until it passes. If it fails 3 consecutive times, halt deep-build with an error and preserve `sweep_state` for recovery.

The verify-runnable gate **must pass** before proceeding to Phase 3. This catches fundamental project health issues (missing packages, syntax errors, broken configs) before investing time in integration checks and sweeps.

### Phase 3: Initial integration check

**Re-anchor:** Re-read `.forgeplan/manifest.yaml` and `.forgeplan/state.json` from disk.

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

**Re-anchor:** Re-read `.forgeplan/manifest.yaml` and `.forgeplan/state.json` from disk. Also re-read all node specs from `.forgeplan/specs/` — the review phase may have triggered revisions.

Run `/forgeplan:sweep` (dispatch all sweep agents in parallel, merge findings, fix with node-scoped enforcement, progressive convergence).

After Claude sweep fixes, re-integrate (Phase 3 logic).

### Phase 4.5: Runtime verification (Phase B)

**Re-anchor:** Re-read `.forgeplan/manifest.yaml` for complexity_tier and node specs.

Update `sweep_state.current_phase` to `"runtime-verify"` before proceeding (for crash recovery).

**Tier gate:** Read `complexity_tier` (with config.yaml `tier_override` check):
- **SMALL:** Skip Phase B entirely. Log: "Skipping runtime verification — SMALL tier (Phase A sufficient)." Proceed to Phase 5.
- **MEDIUM/LARGE:** Run runtime verification.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/runtime-verify.js" --tier [TIER]
```

Check the result:

**If `status: "pass"` or `status: "skip"`:** Log level reached and endpoints tested. If the result contains any LOW/advisory findings (e.g., "public endpoint — verify intentional", "no endpoint contracts"), include them in the deep-build report under "**Runtime Advisories**" so the user sees them in the final output. These are informational, not blocking. Proceed to Phase 5.

**If `status: "fail"`:** Runtime verification found issues.
1. For each finding from runtime-verify.js output:
   - Add required fields: `id: "R[N]"` (sequential), `source_model: "runtime-verify"`, `pass_found: sweep_state.pass_number`
   - **If the finding has a non-empty `file` field:** add to `sweep_state.findings.pending` for the normal fix cycle (fix agent can target the file)
   - **If the finding has an empty `file` field:** add to `sweep_state.needs_manual_attention` instead (runtime findings without file anchors can't be auto-fixed — they need a developer to trace the endpoint to its handler). Include the endpoint, status code, and description so the deep-build report surfaces them.
2. For findings in `pending` (with file anchors): dispatch fix agents, re-run `runtime-verify.js`, repeat up to 3 times
3. For findings in `needs_manual_attention`: log them in the deep-build report under "**Runtime Issues Requiring Manual Review**" with the endpoint details. Do NOT attempt automated fixes.
4. Proceed to Phase 5 after fix attempts complete (or immediately if all findings went to manual attention).

**If `status: "environment_error"`:** Log the error. Do NOT add as code findings. Attempt auto-fix:
- Missing .env → copy from .env.example, set MOCK_MODE=true
- Port conflict → report to user with port identification guidance
- After auto-fix attempt, retry once. If still failing, skip Phase B with warning and proceed to Phase 5.

This phase sits between sweep (Phase 4) and cross-model (Phase 5) because runtime issues should be fixed before spending cross-model tokens.

### Phase 5: Cross-model verification loop

**Re-anchor:** Re-read `.forgeplan/manifest.yaml` and `.forgeplan/state.json` from disk. The sweep may have modified specs (Category A fixes) and code across multiple nodes.

**Tier-aware execution:** Before running cross-model verification, read `complexity_tier` from `.forgeplan/manifest.yaml`. **Also check** `.forgeplan/config.yaml` for `complexity.tier_override` — if set and non-empty, use the override instead:

- **SMALL** (1-3 nodes): Skip cross-model verification entirely. Log "Skipping cross-model: SMALL project." Set `consecutive_clean_passes` to 2 and proceed directly to Phase 6.
- **MEDIUM** (4-6 nodes): Cross-model is optional. If an alternate model is configured (cross-model-bridge returns a result), run it. If not configured, skip with a log note and proceed to Phase 6.
- **LARGE** (7+ nodes): Cross-model is required. If no alternate model is configured, halt deep-build with an error: "LARGE projects require cross-model verification. Configure an alternate model in .forgeplan/config.yaml."

If cross-model is skipped (SMALL tier or unconfigured MEDIUM tier), note it in the final report.

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

**Re-anchor:** Final re-read of `.forgeplan/manifest.yaml` and `.forgeplan/state.json` from disk before generating the report.

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

Your project is ready:
  → /forgeplan:status          Full project overview
  → /forgeplan:measure         Verify quality metrics
  → /forgeplan:revise [node]   Make changes
  → /forgeplan:guide           Get guidance anytime
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
- Clean up any worktrees on halt: `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" cleanup`
- All state is persisted after every transition for crash recovery
- Use /forgeplan:recover to resume interrupted deep-builds
