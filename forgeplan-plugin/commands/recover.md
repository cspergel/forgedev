---
description: Detect and handle crashed or stuck builds. Offers resume, reset, or manual review options for nodes left in an inconsistent state.
user-invocable: true
argument-hint: "[node-id (optional)]"
allowed-tools: Read Write Edit Bash Glob Grep
---

# Crash Recovery

Detect and recover from interrupted builds.

## Process

1. Read `.forgeplan/state.json`
2. Identify nodes in inconsistent states:
   - Status "building" with no active session
   - Status "reviewing" with no active session
   - Active node set but session appears stale

3. For each stuck node, present options:

```
=== Recovery: [node-id] ===
Status: building (started [timestamp])
Files created: [count] files in [file_scope]

Options:
  1. RESUME  — Continue building from where it left off
  2. RESET   — Clear all generated files and restart the build
  3. REVIEW  — Mark as built and run review to assess what was completed

Choose [1/2/3]:
```

## Resume

- Set the active node back to this node in state.json
- Start the Builder agent with existing files as context
- Continue building from where the crash occurred

## Reset

- Identify files to remove using two sources (in priority order):
  1. `state.json` → `nodes.[node].files_created` (if PostToolUse hook has been populating this — available from Sprint 2)
  2. **Fallback:** scan the node's `file_scope` glob from the manifest and collect:
     - Source files (`.ts`, `.js`, `.tsx`, `.jsx`) containing `// @forgeplan-node: [node-id]`
     - If the project is a git repo: use `git ls-files --others --modified` within `file_scope` to identify files added/changed during the build
     - If the project is NOT a git repo: list ALL files within `file_scope` and warn the user that without git history, the reset cannot distinguish pre-existing files from generated ones — the user must manually confirm which files to remove
- Present the file list to the user for confirmation before deleting
- Reset node status to "specced" in state.json
- Clear active_node in state.json

## Review

- Mark the node as "built" in state.json
- Clear active_node
- Run the Reviewer to assess partial completion
- The review report will show which acceptance criteria are met and which are not
