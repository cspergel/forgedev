---
description: Detect and handle crashed or stuck operations. Offers resume, reset, or manual review options for nodes left in an inconsistent state.
user-invocable: true
argument-hint: "[node-id (optional)]"
allowed-tools: Read Write Edit Bash Glob Grep
---

# Crash Recovery

Detect and recover from interrupted builds, reviews, or revisions.

## Process

1. Read `.forgeplan/state.json`
2. Identify nodes in inconsistent states:
   - Status "building" with no active session
   - Status "reviewing" with no active session
   - Status "revising" with no active session
   - Active node set but session appears stale

3. For each stuck node, present **context-appropriate** options based on the crashed operation:

### If crashed during `building`:

```
=== Recovery: [node-id] ===
Status: building (started [timestamp])
Files created: [count] files in [file_scope]

Options:
  1. RESUME  — Continue building from where it left off (restarts Builder agent)
  2. RESET   — Clear generated files and restart the build
  3. REVIEW  — Mark as built and run review to assess what was completed

Choose [1/2/3]:
```

### If crashed during `reviewing`:

```
=== Recovery: [node-id] ===
Status: reviewing (started [timestamp])
Partial review: [check if .forgeplan/reviews/[node-id].md exists]

Options:
  1. RESUME  — Restart the review from scratch (restarts Reviewer agent)
  2. SKIP    — Clear reviewing status, keep node as "built" — review later
  3. ACCEPT  — If partial review exists, mark as reviewed using existing report

Choose [1/2/3]:
```

### If crashed during `revising`:

```
=== Recovery: [node-id] ===
Status: revising (started [timestamp])

Options:
  1. RESUME  — Restart the revision (re-read spec changes and continue)
  2. ROLLBACK — Revert spec/manifest changes made during this revision (if git available)
  3. ACCEPT  — Keep current spec/manifest state and mark revision complete

Choose [1/2/3]:
```

## Resume

Resume behavior depends on the crashed operation:
- **Building:** Set active_node to `{"status": "building"}`, start the **Builder agent** with existing files as context
- **Reviewing:** Set active_node to `{"status": "reviewing"}`, start the **Reviewer agent** from scratch (reviews are cheap to re-run)
- **Revising:** Set active_node to `{"status": "revising"}`, re-read the current spec and manifest state, continue the revision process

## Reset (building only)

- Identify files to remove using two sources (in priority order):
  1. `state.json` → `nodes.[node].files_created` (if PostToolUse hook has been populating this — available from Sprint 2)
  2. **Fallback:** scan the node's `file_scope` glob from the manifest and collect:
     - Source files (`.ts`, `.js`, `.tsx`, `.jsx`) containing `// @forgeplan-node: [node-id]`
     - If the project is a git repo: use `git ls-files --others --modified` within `file_scope` to identify files added/changed during the build
     - If the project is NOT a git repo: list ALL files within `file_scope` and warn the user that without git history, the reset cannot distinguish pre-existing files from generated ones — the user must manually confirm which files to remove
- **Shared types check:** If this was the first node built (i.e., it created `src/shared/types/index.ts`), ask the user whether to also remove the shared types file. If other nodes have already been built that depend on it, warn against removal.
- Present the file list to the user for confirmation before deleting
- Reset node status to "specced" in state.json
- Clear active_node in state.json

## Review (building only)

- Mark the node as "built" in state.json
- Clear active_node
- Run the Reviewer to assess partial completion
- The review report will show which acceptance criteria are met and which are not
