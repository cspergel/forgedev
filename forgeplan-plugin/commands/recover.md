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
  2. SKIP    — Restore node to `nodes.[node-id].previous_status` (set at review start), clear active_node — review later
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

Resume behavior depends on the crashed operation. **Read** state.json, then **update** (do not overwrite):
- **Building:** Set `active_node` to `{"node": "[node-id]", "status": "building", "started_at": "[current ISO timestamp]"}`, set `last_updated`, start the **Builder agent** with existing files as context
- **Reviewing:** Set `active_node` to `{"node": "[node-id]", "status": "reviewing", "started_at": "[current ISO timestamp]"}`, set `last_updated`, start the **Reviewer agent** from scratch
- **Revising:** Set `active_node` to `{"node": "[node-id]", "status": "revising", "started_at": "[current ISO timestamp]"}`, set `last_updated`, re-read spec and manifest, continue revision

## Reset (building only)

- Identify files using `state.json` → `nodes.[node]`:
  - **`files_created`** — files created by Write tool during this build. These are SAFE TO DELETE (they didn't exist before the build).
  - **`files_modified`** — pre-existing files modified (via Edit) or overwritten (via Write) during this build. These are NOT safe to delete — they existed before the build. Warn the user that these files were changed and may need manual revert (use `git checkout` if available).
- If `files_created` is empty (PostToolUse wasn't running), use the **fallback**:
  - Source files (`.ts`, `.js`, `.tsx`, `.jsx`) containing `// @forgeplan-node: [node-id]`
  - If git available: `git ls-files --others` within `file_scope` for new untracked files only
  - If no git: list ALL files in `file_scope` and warn that manual confirmation is required
- **Shared types check:** If this was the first node built (i.e., it created `src/shared/types/index.ts`), ask the user whether to also remove the shared types file. If other nodes have already been built that depend on it, warn against removal.
- Present the file list to the user for confirmation before deleting
- Reset node status to "specced" in state.json
- Clear active_node in state.json

## Review (building only)

- Mark the node as "built" in state.json
- Clear active_node
- Run the Reviewer to assess partial completion
- The review report will show which acceptance criteria are met and which are not
