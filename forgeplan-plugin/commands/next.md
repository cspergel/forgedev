---
description: Recommend the next node to build based on the dependency graph. Surfaces any stuck or crashed nodes that need attention first.
user-invocable: true
allowed-tools: Read Bash
---

# Next Node Recommendation

Analyze the project state and recommend which node to work on next.

## Process

Run the deterministic next-node recommender:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/next-node.js"
```

The script outputs JSON with the recommendation. Parse it and present to the user.

## Output Formatting

Based on the JSON `type` field:

### type: "stuck"
```
⚠ WARNING: [count] node(s) need attention
[list of stuck nodes with statuses]
Run /forgeplan:recover to fix these before proceeding.
```

### type: "rebuild_needed"
```
⚠ [count] node(s) need rebuilding after revision: [list]
Run /forgeplan:build [node] for each affected node.
```

### type: "recommendation"
```
=== Next Node ===
Recommended: [node-id] — [node name]
Status: [pending | specced]
Reason: [why this node is next]
Dependencies satisfied: [list]
Run: [next_action]

Progress: [completed]/[total] nodes complete
[Other eligible: [list] — if any]
```

### type: "complete"
```
All [total] nodes are complete!

What's next:
  /forgeplan:review --all          Review all nodes (if not yet reviewed)
  /forgeplan:integrate             Verify cross-node interfaces
  /forgeplan:measure               Check quality metrics
  /forgeplan:revise --model User   Change a shared model (cascades to all affected nodes)
  /forgeplan:revise [node-id]      Change a single node's spec
  /forgeplan:status                Full project overview
  /forgeplan:help                  See all commands
```

### type: "blocked"
```
No eligible nodes found. Check dependencies and node statuses.
Progress: [completed]/[total] nodes complete
```

### type: "error"
```
ERROR: [message]
```
This occurs when `.forgeplan/manifest.yaml` is missing or corrupted, `.forgeplan/state.json` is corrupted, or the manifest has no nodes defined. Present the error message and suggest the appropriate fix.
