---
name: affected
description: "Which nodes use this data model? Shows every node that depends on a shared model (like User or Document) and what steps are needed to update them."
---


# Find Affected Nodes

Find all nodes that depend on a shared model.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/find-affected-nodes.js" $ARGUMENTS
```

Parse the JSON output and present:

```
=== Affected Nodes: [model-name] ===
Model fields: [field list]

[count] node(s) affected:
  1. [node-id] — [node name] ([status])
     → /forgeplan:spec [node-id]
     → /forgeplan:build [node-id]
  ...
```
