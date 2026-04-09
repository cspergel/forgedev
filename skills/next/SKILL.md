---
name: next
description: What should I do next? Evaluates your entire project state and recommends the best next action — whether that's building, reviewing, integrating, fixing something, or making changes. Your guide through the whole workflow.
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

**You MUST display the `next_steps` array from the JSON output as a formatted list.** Do not summarize or skip these — they are the user's guide to what they can do next:

```
=== All [total] nodes complete! ===

What you can do next:
  [for each item in next_steps]:
  → [command]  —  [description]
```

This is critical for discoverability — users need to see the available commands.

### type: "sweep_active"
```
[operation] is in progress — pass [pass_number], phase: [current_phase].

  → /forgeplan:recover   Resume or abort the operation
  → /forgeplan:status    See current state
```

### type: "blocked"
```
No nodes are ready. Possible causes: stuck nodes, circular dependencies, or unfinished builds.

  → /forgeplan:status      See which nodes are blocking
  → /forgeplan:recover     Fix stuck nodes
  → /forgeplan:validate    Check for circular dependencies

Progress: [completed]/[total] nodes complete
```

### type: "error"
```
ERROR: [message]
```
This occurs when `.forgeplan/manifest.yaml` is missing or corrupted, `.forgeplan/state.json` is corrupted, or the manifest has no nodes defined. Present the error message and suggest the appropriate fix.
