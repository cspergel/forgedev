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
Run /forgeplan:integrate to verify cross-node interfaces.
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
This occurs when `.forgeplan/state.json` is corrupted or unreadable. Present the error message and suggest fixing or deleting state.json.
