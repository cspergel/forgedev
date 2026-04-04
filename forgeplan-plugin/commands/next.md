---
description: Recommend the next node to build based on the dependency graph. Surfaces any stuck or crashed nodes that need attention first.
user-invocable: true
allowed-tools: Read Bash
---

# Next Node Recommendation

Analyze the project state and recommend which node to work on next.

## Process

1. Read `.forgeplan/manifest.yaml` for the dependency graph
2. Read `.forgeplan/state.json` for current node statuses
3. Determine the dependency-aware build order (topological sort)
4. Find the next node whose:
   - Status is "pending" or "specced"
   - All `depends_on` nodes have status "built" or "reviewed"

## Priority Rules

1. **Crashed/stuck nodes first** — if any node is in "building" status without an active session, flag it
2. **Reviewed nodes that need rebuilding** — if a revision flagged dependent nodes, prioritize those
3. **Dependency order** — among eligible nodes, recommend the one that unblocks the most downstream nodes

## Output

```
=== Next Node ===
Recommended: [node-id] — [node name]
Reason: [why this node is next]
Dependencies satisfied: [list of completed deps]
Run: /forgeplan:spec [node-id]  (if not yet specced)
     /forgeplan:build [node-id] (if specced)

Progress: [completed]/[total] nodes complete
```

If all nodes are complete, suggest running `/forgeplan:integrate` for full system verification.
