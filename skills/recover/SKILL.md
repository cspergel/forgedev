---
description: Recover from interrupted ForgePlan builds, reviews, sweeps, or splits.
disable-model-invocation: true
---

# Crash Recovery

Detect and recover from interrupted builds, reviews, revisions, review-fix cycles, sweeps, and deep-builds.

**State mutation rule:** Do **not** hand-edit `.forgeplan/state.json` in recovery flows. Use
`node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" ...` for node/runtime transitions.
When recovery must continue build/review/revise work, do **not** invoke `Skill(forgeplan:build)`,
`Skill(forgeplan:review)`, or `Skill(forgeplan:revise)` — those are command skills with
`disable-model-invocation: true`. Instead, read the corresponding skill file and execute its
workflow inline:
- `${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/revise/SKILL.md`

## Process

**Step 0: Check for interrupted split (Sprint 9)**

Before any other recovery, check for `.forgeplan/.split-in-progress.json`. If it exists, a previous `/forgeplan:split` was interrupted — the manifest and state may be inconsistent. This takes priority over all other recovery.

1. Read `.forgeplan/.split-in-progress.json`
2. Display: parent node, child nodes, started timestamp, completed steps, remaining steps
3. Offer two options:

**Resume:**
- Write the breadcrumb's `planned_changes.manifest_yaml` to a temp file (`.forgeplan/.manifest-split-check.yaml`)
- Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.js" .forgeplan/.manifest-split-check.yaml` to re-validate
- Delete temp file after validation
- If valid: replay only steps NOT in `completed_steps` (idempotency: check if artifact already exists before writing)
- If invalid: offer rollback instead

**Rollback:**
- Restore from `before_images`: write back original `manifest.yaml`, `state.json`, and parent spec
- Delete any child specs that were created during the interrupted split
- Remove `.forgeplan/.split-in-progress.json`
- Report: "Split rolled back. Project state restored to before the split attempt."

After resolving the split (resume or rollback), continue to the normal recovery checks below.


**Step 0b: Check for wiki compilation failures**

Read `.forgeplan/state.json`. If `wiki_compile_attempts >= 3`:

1. Reset `wiki_compile_attempts` to `0` in state.json
2. Log: "Wiki compilation counter reset. Wiki will recompile on next sweep."
3. Optionally re-run wiki compilation: `node "${CLAUDE_PLUGIN_ROOT}/scripts/compile-wiki.js" --verbose`
   - The `--verbose` flag bypasses the failure lockout and provides diagnostic output
   - If compilation succeeds, the wiki is restored. If it fails again, the counter starts fresh.


1. **Clean up peripheral artifacts first:**
   - Check for stale worktrees: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" list`. If any exist, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" cleanup` and report: "Cleaned up [N] stale worktrees from a crashed parallel fix."
   - Check for orphan PIDs: if `.forgeplan/.verify-pids` exists, **delete the file** (do NOT attempt to kill PIDs — they may have been reused by unrelated processes after a hard crash). If a stale server is holding a port, verify-runnable or runtime-verify will detect EADDRINUSE and report it with actionable guidance. Report: "Cleaned up stale .verify-pids file."
   - Check for stale compact context: if `.forgeplan/.compact-context.md` exists, delete it. (Stale context from a previous session could cause confusion after compaction.)
2. Read `.forgeplan/state.json`
3. Run the deterministic recommendation helper:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/recommend-recovery.js"
   ```
   - Use its recommendation and reason when presenting recovery options.
   - If recovery is being executed autonomously by the system rather than interactively, follow this recommendation by default unless the state clearly contradicts it.
4. Identify inconsistent states:
   - Status "building" with no active session
   - Status "reviewing" with no active session
   - Status "review-fixing" with no active session (fixer agent was mid-fix during multi-agent review)
   - Status "revising" with no active session
   - Status "sweeping" with no active sweep operation (sweep_state is null but node is sweeping)
   - `sweep_state` is non-null (interrupted sweep or deep-build)
   - Active node set but session appears stale

5. **If both `active_node` (stuck in "building"/"sweeping") AND `sweep_state` are present:** This indicates a crash during deep-build's build-all phase or during a sweep fix. Present ONLY the sweep/deep-build recovery options below — do NOT also show the per-node building recovery prompt, as that would create conflicting options. Note: "Node '[id]' was being [built/fixed] as part of the [deep-build/sweep]. Recovering the operation will handle this node."

6. For each stuck node (when no sweep_state), present **context-appropriate** options based on the crashed operation:

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
  3. ACCEPT  — If partial review exists, mark as review-complete using existing report

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

Before `Choose [1/2/3]:`, print:
```
Recommended: [option number]. [label] — [reason from recommend-recovery.js]
```
Use the helper's recommendation directly:
- `RESTART PASS` when the crash was mid-fix / node-scoped remediation (`fixing_node` set, `active_node.status === "sweeping"`, or phase is `claude-fix` / `cross-fix`)
- `RESUME` when the crash was between phases or during non-fix phases like `verify-runnable`, `integrate`, `claude-sweep`, `cross-check`, `runtime-verify`, `design-pass`, or `finalizing`
- `RESUME` for `build-all` crashes unless there is explicit evidence the entire pass must be replayed

**Resume behavior:**
- Read `sweep_state` from state.json
- Re-read any sweep/crosscheck reports already on disk in `.forgeplan/sweeps/`
- Continue from `current_phase`:
  - If `build-all`: resume the build-all loop — run `next-node.js`, continue building/reviewing remaining nodes. If `active_node` is stuck, recover it first (run per-node building recovery inline), then continue the loop.
  - If `design-pass`: re-run the design pass (deep-build.md Phase 2b). Read `agents/design-pass.md` and `skill-library/core/frontend-design.md`, dispatch the design-pass agent on frontend nodes. If no frontend nodes exist, skip to `verify-runnable`.
  - If `verify-runnable`: re-run `node "${CLAUDE_PLUGIN_ROOT}/scripts/verify-runnable.js"` (Phase A gate was interrupted)
  - If `claude-sweep`:
    1. Rebuild the dependency graph if needed:
       ```bash
       node "${CLAUDE_PLUGIN_ROOT}/scripts/blast-radius.js" index
       ```
    2. Prepare the sweep bootstrap context deterministically:
       ```bash
       node "${CLAUDE_PLUGIN_ROOT}/scripts/prepare-sweep-context.js"
       ```
    3. Use the helper output to read the exact agent prompt files, wiki artifacts, and latest sweep report path needed for dispatch.
    4. Do **not** fall back to heuristic prompt searches, ad hoc directory listing, or broad exploratory file reads unless the helper output is missing something essential.
    5. Then re-run the sweep agents.
  - If `claude-fix`: re-fix all pending findings (restart the fix loop for this pass)
  - If `runtime-verify`: re-run `node "${CLAUDE_PLUGIN_ROOT}/scripts/runtime-verify.js" --tier [TIER]` (Phase B gate was interrupted)
  - If `cross-check`: re-run cross-model verification
  - If `cross-fix`: re-fix all cross-model findings (restart fix loop)
  - If `integrate`:
    - If `sweep_state.phase_advancement` is null: re-run integration
    - If `sweep_state.phase_advancement.checkpoint === "pre_increment"`: re-run cross-phase integration before any manifest changes
    - If `checkpoint === "post_increment"` or `"promoting_specs"`: do NOT increment `build_phase` again. Resume promoted-spec generation using `phase_advancement.promoted_nodes` and the backups in `phase_advancement.backup_dir`
    - If `checkpoint === "promotion_complete"`: spec promotion already succeeded. Skip promotion, proceed directly to Phase 2 build loop for promoted nodes (same as deep-build.md step 8). Delete backups after Phase 2 initializes.
  - If `finalizing`: just finalize
  - If `halted`: read `sweep_state.halted_from_phase` to determine where to resume. Set `current_phase` back to `halted_from_phase`, clear `halted_from_phase` to null, then resume from that phase (using the same routing above). If `halted_from_phase` is null (shouldn't happen but defensive), default to `"claude-sweep"`.
- Findings already in `resolved` stay resolved

**Restart pass behavior:**
- Keep `sweep_state.findings.resolved` from prior passes
- Reset the current pass deterministically with:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" restart-sweep-pass "[phase]"
  ```
  This must handle:
  - `sweep_state.current_phase = [phase]`
  - `sweep_state.fixing_node = null`
  - clearing current-pass pending findings so the pass can rediscover them cleanly
  - clearing current-pass modified-file tracking / failed-agent convergence state
  - `active_node = null`
- Set `sweep_state.current_phase` based on the operation and interrupted phase:
  - If `operation === "deep-building"` and interrupted phase was `"build-all"`: restart from `"build-all"`
  - If interrupted phase was `"verify-runnable"`: restart from `"verify-runnable"` (don't skip the Phase A gate)
  - If interrupted phase was `"runtime-verify"`: restart from `"runtime-verify"` (don't skip the Phase B gate)
  - If interrupted phase was `"integrate"`: restart from `"integrate"` (don't skip the integration / phase-advancement gate). If `sweep_state.phase_advancement.checkpoint` is `"post_increment"` or `"promoting_specs"`, restart from spec promotion without incrementing `build_phase` a second time. If `checkpoint` is `"promotion_complete"`, skip straight to the Phase 2 build loop.
  - Otherwise: restart from `"claude-sweep"`
- If `active_node` was set (mid-fix), first restore the node to its pre-sweep status with:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" restore-previous-status "[node-id]"
  ```
  then run `restart-sweep-pass`.
- Do **not** hand-edit `.forgeplan/state.json` to null out `fixing_node` or change `current_phase`.

**Abort behavior (steps MUST execute in this order):**

1. **Read `sweep_state.phase_advancement`** from state.json (must read BEFORE nullifying sweep_state).
2. **If `phase_advancement` exists, do the rollback:**
   - Restore `project.build_phase` in manifest from `phase_advancement.from_build_phase`
   - Restore backed-up promoted specs and manifest from `phase_advancement.backup_dir`
   - Delete `.forgeplan/phase-advance-backup/`
   - Restore `build_phase_started_at` in state.json from the backup, or clear it to `null` if no backup value exists (prevents stale timestamp from the aborted phase)
3. **If `active_node` was set (mid-fix):** run
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" clear-active-node
   ```
4. **Scan ALL `state.nodes` entries for orphaned "sweeping" status.** For each node with `status: "sweeping"`:
   - If `previous_status` is set: run
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" restore-previous-status "[node-id]"
     ```
   - If `previous_status` is not set: run
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-node-status "[node-id]" "built"
     ```
     (safest default — the node was built before the sweep started)
   - This handles edge cases where the crash happened between setting node status and setting active_node
5. **Set `sweep_state` to `null`** with:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" clear-sweep-state
   ```
   Do this only AFTER all reads of `sweep_state` fields are complete.
6. If `phase_advancement` restored `build_phase_started_at`, preserve that restored value when clearing sweep state. If needed, apply that restoration first, then run `clear-sweep-state`.
7. Sweep reports remain in `.forgeplan/sweeps/` for reference.

**After any recovery action, suggest next steps:**
```
Recovery complete. Next:
  After RESUME:  The operation will continue automatically.
  After RESTART PASS:
                 If recovery continues inline, continue the interrupted sweep/deep-build automatically.
                 If you stop at the clean reset boundary, run `→ /forgeplan:recover` and choose `RESUME`.
  After RESET:   → /forgeplan:build [node-id]   Restart the build
  After SKIP:    → /forgeplan:next               See what to do next
  After REVIEW:  → /forgeplan:review [node-id]   Check what was built
  After ABORT:   → /forgeplan:status             See project state
                 → /forgeplan:sweep              Re-run the sweep
                 → /forgeplan:guide              Get guidance
```

## Resume

Resume behavior depends on the crashed operation. Do **not** mutate `.forgeplan/state.json`
directly here — restore the node to a valid entry state, then continue the corresponding
workflow inline from the relevant skill file:
- **Building:** restore the node to a buildable state, then read
  `${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md` and execute the single-node build workflow inline
  - If `nodes.[node-id].previous_status` is set, run:
    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" restore-previous-status "[node-id]"
    ```
  - Otherwise run:
    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-node-status "[node-id]" "specced"
    ```
- **Reviewing:** run
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-node-status "[node-id]" "built"
  ```
  then read `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` and execute the single-node review workflow inline
- **Review-fixing:** run
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-node-status "[node-id]" "built"
  ```
  then read `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` and execute the single-node review workflow inline (same as Reviewing resume — the fixer's partial work remains on disk and will be re-reviewed)
- **Revising:** if `previous_status` is set, run
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" restore-previous-status "[node-id]"
  ```
  otherwise run
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-node-status "[node-id]" "reviewed"
  ```
  then read `${CLAUDE_PLUGIN_ROOT}/skills/revise/SKILL.md` and execute the single-node revise workflow inline

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
- Reset the node with:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-node-status "[node-id]" "specced"
  ```

## Review (building only)

- Mark the node built with:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" complete-build "[node-id]"
  ```
- Read `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` and execute the single-node review workflow inline to assess partial completion
- The review report will show which acceptance criteria are met and which are not
- **WARNING:** This bypasses the Stop hook's acceptance criteria verification. The node is marked "built" without verifying all criteria pass. The subsequent review will identify gaps.

## Skip (building — re-builds only)

Only available when `nodes.[node-id].previous_status` is set (i.e., the node had a status like "reviewed" or "revised" before this build started).

- Set `nodes.[node-id].status` to `nodes.[node-id].previous_status`
- Clear `nodes.[node-id].previous_status` to `null`
- Do this with:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" restore-previous-status "[node-id]"
  ```
- Implementation files created during this build remain on disk (not deleted). The node returns to its pre-build state as if the build was never started.
