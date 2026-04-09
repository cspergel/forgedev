---
name: split
description: "Decompose a built node into finer-grained nodes while preserving code, state, and enforcement integrity"
---


# /forgeplan:split [node-id]

## Prerequisites

Before splitting, verify ALL of these:
1. Read `.forgeplan/state.json` -- target node must be in status: `built`, `reviewed`, or `revised`
2. No `active_node` set (no build/review in progress)
3. No `sweep_state.operation` active (no sweep running)
4. Node must have code files (can't split a `specced` node -- nothing to analyze)
5. No existing `.forgeplan/.split-in-progress.json` -- if one exists, a previous split was interrupted. Run `/forgeplan:recover` first to resume or rollback before starting a new split.

If any prerequisite fails, explain which one and stop.

## Process

### Step 1: Invoke Architect in Split Mode

Use the Agent tool to dispatch the architect agent. Read `agents/architect.md` and pass it as the system prompt with `--split [node-id]` in the prompt. The architect:
1. Reads the node's spec from `.forgeplan/specs/[node-id].yaml`
2. Globs the node's `file_scope` to get file list
3. Analyzes code structure: directory groupings, import clusters, domain boundaries
4. Proposes a split using the Split Proposal Template (see architect.md "Node Split Mode" section)

Wait for user confirmation. If rejected, ask what to modify.

### Step 2: Pre-validate

Write the hypothetical new manifest to a temp file (`.forgeplan/.manifest-split-check.yaml`), then run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.js" .forgeplan/.manifest-split-check.yaml
```
Delete `.forgeplan/.manifest-split-check.yaml` whether validation passes or fails. If validation fails, show errors and stop.

### Step 3: Write Recovery Breadcrumb

Before making any file changes, write `.forgeplan/.split-in-progress.json`:
```json
{
  "parent_node_id": "[node-id]",
  "child_nodes": ["[child-1]", "[child-2]"],
  "started_at": "[ISO timestamp]",
  "before_images": {
    "manifest_yaml": "[full manifest YAML before split]",
    "state_json": "[full state JSON before split]",
    "parent_spec_path": ".forgeplan/specs/[node-id].yaml",
    "parent_spec_content": "[full spec YAML]"
  },
  "planned_changes": {
    "specs": [{"path": ".forgeplan/specs/[child].yaml", "content": "..."}],
    "manifest_yaml": "[new manifest YAML]",
    "state_updates": {"[child]": {"status": "built"}}
  },
  "completed_steps": []
}
```

### Step 4: Execute (marking each step in completed_steps)

a. Write new spec files for each child node (from parent spec, ACs distributed via @forgeplan-spec markers) --> mark "specs" in completed_steps
b. Write new manifest (atomic: write to .tmp, rename). Child nodes include `split_from: [parent-id]` field --> mark "manifest"
c. Update state.json: create entries for children (status: "built"), remove parent --> mark "state"
   Note: `split_from` is a MANIFEST-only field. Do NOT write split_from to state.json -- that would create two sources of truth.
d. Update wiki: create child node pages, archive parent page (MEDIUM/LARGE only) --> mark "wiki"

### Step 5: Clean Up

Delete `.forgeplan/.split-in-progress.json`.

### Step 6: Output

```
Split complete: [parent] --> [child-1], [child-2]

Next steps:
  1. /forgeplan:review [child-1]     Review the [child-1] node
  2. /forgeplan:review [child-2]     Review the [child-2] node
  3. /forgeplan:integrate             Verify cross-node interfaces

Note: The parent node "[parent]" no longer exists. Use child node IDs for all commands.
```
