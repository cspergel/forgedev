---
description: Something went wrong? This detects crashed or stuck builds/reviews and offers options to resume, reset, or skip. Run this if a build was interrupted or a node is stuck.
user-invocable: true
argument-hint: "[node-id (optional)]"
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# Crash Recovery

Detect and recover from interrupted builds, reviews, revisions, review-fix cycles, sweeps, and deep-builds.

## Process

1. **Clean up peripheral artifacts first:**
   - Check for stale worktrees: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" list`. If any exist, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" cleanup` and report: "Cleaned up [N] stale worktrees from a crashed parallel fix."
   - Check for orphan PIDs: if `.forgeplan/.verify-pids` exists, **delete the file** (do NOT attempt to kill PIDs — they may have been reused by unrelated processes after a hard crash). If a stale server is holding a port, verify-runnable or runtime-verify will detect EADDRINUSE and report it with actionable guidance. Report: "Cleaned up stale .verify-pids file."
   - Check for stale compact context: if `.forgeplan/.compact-context.md` exists, delete it. (Stale context from a previous session could cause confusion after compaction.)
2. Read `.forgeplan/state.json`
3. Identify inconsistent states:
   - Status "building" with no active session
   - Status "reviewing" with no active session
   - Status "review-fixing" with no active session (fixer agent was mid-fix during multi-agent review)
   - Status "revising" with no active session
   - Status "sweeping" with no active sweep operation (sweep_state is null but node is sweeping)
   - `sweep_state` is non-null (interrupted sweep or deep-build)
   - Active node set but session appears stale

4. **If both `active_node` (stuck in "building"/"sweeping") AND `sweep_state` are present:** This indicates a crash during deep-build's build-all phase or during a sweep fix. Present ONLY the sweep/deep-build recovery options below — do NOT also show the per-node building recovery prompt, as that would create conflicting options. Note: "Node '[id]' was being [built/fixed] as part of the [deep-build/sweep]. Recovering the operation will handle this node."

5. For each stuck node (when no sweep_state), present **context-appropriate** options based on the crashed operation:

### If crashed during `building`:

```
=== Recovery: [node-id] ===
Status: building (started [timestamp])
Files created: [count] files in [file_scope]

Options:
  1. RESUME  — Continue building from where it left off (restarts Builder agent)
  2. RESET   — Clear generated files and restart the build
  3. REVIEW  — Mark as built and run review to assess what was completed (WARNING: bypasses Stop hook acceptance criteria verification)
  4. SKIP    — Restore node to its status before the build started (e.g., "reviewed" if this was a re-build). Uses `nodes.[node-id].previous_status`. Only available if previous_status is set.

Choose [1/2/3/4]:
```

### If crashed during `reviewing`:

```
=== Recovery: [node-id] ===
Status: reviewing (started [timestamp])
Partial review: [check if .forgeplan/reviews/[node-id].md exists]

Options:
  1. RESUME  — Restart the review from scratch (restarts Reviewer agent)
  2. SKIP    — Restore node to `nodes.[node-id].previous_status` (set at review start), clear active_node — review later. Only available if `previous_status` is set.
  3. ACCEPT  — If partial review exists, mark as reviewed using existing report

Choose [1/2/3]:
```

### If crashed during `review-fixing`:

A fixer agent was writing code to address review findings (part of a multi-agent review cycle). The node was mid-fix when the session ended. The fixer's partial changes remain on disk.

```
=== Recovery: [node-id] ===
Status: review-fixing (started [timestamp])
This was a multi-agent review cycle — a fixer agent was addressing review findings.
The fixer's partial changes are on disk and may be incomplete.

Options:
  1. RESUME REVIEW — Set status back to "reviewing" and restart the review from scratch.
     The fixer's partial changes remain on disk and will be included in the re-review.
     If multi-agent review is enabled, a new fixer will address any issues found.
  2. REVERT & RESUME — Use `git checkout` to revert implementation files in the node's
     file_scope to their pre-fix state, then restart the review from scratch.
     Only available if git is available and changes are uncommitted.
  3. SKIP — Restore node to `nodes.[node-id].previous_status`, clear active_node.
     WARNING: The fixer's partial changes remain on disk and may leave code in an
     inconsistent state. Consider using `git checkout` to revert if the partial fixes
     caused issues. Only available if `previous_status` is set.

Choose [1/2/3]:
```

### If crashed during `revising`:

```
=== Recovery: [node-id] ===
Status: revising (started [timestamp])

Options:
  1. RESUME  — Restart the revision (re-read spec changes and continue)
  2. ROLLBACK — Revert spec, manifest, AND src/shared/types/index.ts changes made during this revision (use git checkout if available). If git is not available or files were not committed before the revision, warn that manual revert is required and list the files that were changed.
  3. ACCEPT  — Keep current spec/manifest/shared-types state and mark revision complete

Choose [1/2/3]:
```

### If interrupted sweep or deep-build detected

Check `sweep_state` in state.json. If `sweep_state.operation` is non-null:

```
=== Recovery: [operation] ===
Operation: [sweeping | deep-building]
Phase: [current_phase] (pass [pass_number])
Model: [current_model]
Pending findings: [count]
Resolved findings: [count]

Options:
  1. RESUME  — Continue from the last completed phase. The current pass is
     re-run from scratch (partial fix state within a pass is not recoverable).
     Findings already resolved stay resolved.
  2. RESTART PASS — Keep state from prior passes but re-run pass [pass_number]
     from the beginning. Use if the crash happened mid-fix and the codebase
     may be in a partially-modified state.
  3. ABORT  — Clear sweep_state. All nodes keep their current status.
     Sweep reports remain on disk. You can re-run /forgeplan:sweep or
     /forgeplan:deep-build later.

Choose [1/2/3]:
```

**Resume behavior:**
- Read `sweep_state` from state.json
- Re-read any sweep/crosscheck reports already on disk in `.forgeplan/sweeps/`
- Continue from `current_phase`:
  - If `build-all`: resume the build-all loop — run `next-node.js`, continue building/reviewing remaining nodes. If `active_node` is stuck, recover it first (run per-node building recovery inline), then continue the loop.
  - If `verify-runnable`: re-run `node "${CLAUDE_PLUGIN_ROOT}/scripts/verify-runnable.js"` (Phase A gate was interrupted)
  - If `claude-sweep`: re-run the sweep agents
  - If `claude-fix`: re-fix all pending findings (restart the fix loop for this pass)
  - If `runtime-verify`: re-run `node "${CLAUDE_PLUGIN_ROOT}/scripts/runtime-verify.js" --tier [TIER]` (Phase B gate was interrupted)
  - If `cross-check`: re-run cross-model verification
  - If `cross-fix`: re-fix all cross-model findings (restart fix loop)
  - If `integrate`: re-run integration
  - If `finalizing`: just finalize
  - If `halted`: read `sweep_state.halted_from_phase` to determine where to resume. Set `current_phase` back to `halted_from_phase`, clear `halted_from_phase` to null, then resume from that phase (using the same routing above). If `halted_from_phase` is null (shouldn't happen but defensive), default to `"claude-sweep"`.
- Findings already in `resolved` stay resolved

**Restart pass behavior:**
- Keep `sweep_state.findings.resolved` from prior passes
- Reset `sweep_state.findings.pending` to only findings from this pass that weren't resolved
- Set `sweep_state.current_phase` based on the operation and interrupted phase:
  - If `operation === "deep-building"` and interrupted phase was `"build-all"`: restart from `"build-all"`
  - If interrupted phase was `"verify-runnable"`: restart from `"verify-runnable"` (don't skip the Phase A gate)
  - If interrupted phase was `"runtime-verify"`: restart from `"runtime-verify"` (don't skip the Phase B gate)
  - Otherwise: restart from `"claude-sweep"`
- If `active_node` was set (mid-fix), clear it and set `nodes.[node].status` back to the pre-sweep status

**Abort behavior:**
- Set `sweep_state` to `null` in state.json
- If `active_node` was set (mid-fix):
  - Clear `active_node` to `null`
- **Scan ALL `state.nodes` entries for orphaned "sweeping" status.** For each node with `status: "sweeping"`:
  - If `previous_status` is set: restore `status` to `previous_status`, clear `previous_status`
  - If `previous_status` is not set: set `status` to `"built"` (safest default — the node was built before the sweep started)
  - This handles edge cases where the crash happened between setting node status and setting active_node
- Sweep reports remain in `.forgeplan/sweeps/` for reference

**After any recovery action, suggest next steps:**
```
Recovery complete. Next:
  After RESUME:  The operation will continue automatically.
  After RESET:   → /forgeplan:build [node-id]   Restart the build
  After SKIP:    → /forgeplan:next               See what to do next
  After REVIEW:  → /forgeplan:review [node-id]   Check what was built
  After ABORT:   → /forgeplan:status             See project state
                 → /forgeplan:sweep              Re-run the sweep
                 → /forgeplan:guide              Get guidance
```

## Resume

Resume behavior depends on the crashed operation. **Read** state.json, then **update** (do not overwrite):
- **Building:** Set `active_node` to `{"node": "[node-id]", "status": "building", "started_at": "[current ISO timestamp]"}`, reset `nodes.[node-id].bounce_count` to `0`, set `last_updated`, start the **Builder agent** with existing files as context
- **Reviewing:** Set `active_node` to `{"node": "[node-id]", "status": "reviewing", "started_at": "[current ISO timestamp]"}`, set `last_updated`, start the **Reviewer agent** from scratch
- **Review-fixing:** Set `active_node` to `{"node": "[node-id]", "status": "reviewing", "started_at": "[current ISO timestamp]"}`, set `nodes.[node-id].status` to `"reviewing"`, set `last_updated`, start the **Reviewer agent** from scratch (same as Reviewing resume — the fixer's partial work remains on disk and will be re-reviewed)
- **Revising:** Set `active_node` to `{"node": "[node-id]", "status": "revising", "started_at": "[current ISO timestamp]"}`, set `last_updated`, re-read spec and manifest, continue revision

## Reset (building only)

- Identify files using `state.json` → `nodes.[node]`:
  - **`files_created`** — files created by Write tool during this build. These are SAFE TO DELETE (they didn't exist before the build).
  - **`files_modified`** — pre-existing files modified (via Edit) or overwritten (via Write) during this build. These are NOT safe to delete — they existed before the build. Warn the user that these files were changed and may need manual revert (use `git checkout` if available).
- If `files_created` is empty (PostToolUse wasn't running), use the **fallback**:
  - Source files (`.ts`, `.js`, `.tsx`, `.jsx`) containing `// @forgeplan-node: [node-id]`
  - If git available: `git ls-files --others` within `file_scope` for new untracked files only
  - If no git: list ALL files in `file_scope` and warn that manual confirmation is required
- **Shared types check:** Read `shared_types_created_by` from state.json. If it matches the crashed node's ID, `src/shared/types/index.ts` was created during this build. Ask whether to remove it. If the user confirms removal, also clear `shared_types_created_by` to `null` in state.json. If other nodes have already been built that depend on it, warn against removal.
- Present the file list to the user for confirmation before deleting
- Reset node status to "specced" in state.json
- Clear active_node in state.json

## Review (building only)

- Mark the node as "built" in state.json
- Clear active_node
- Run the Reviewer to assess partial completion
- The review report will show which acceptance criteria are met and which are not
- **WARNING:** This bypasses the Stop hook's acceptance criteria verification. The node is marked "built" without verifying all criteria pass. The subsequent review will identify gaps.

## Skip (building — re-builds only)

Only available when `nodes.[node-id].previous_status` is set (i.e., the node had a status like "reviewed" or "revised" before this build started).

- Set `nodes.[node-id].status` to `nodes.[node-id].previous_status`
- Clear `nodes.[node-id].previous_status` to `null`
- Clear `active_node` to `null`
- Set `last_updated` to current ISO timestamp
- Implementation files created during this build remain on disk (not deleted). The node returns to its pre-build state as if the build was never started.
