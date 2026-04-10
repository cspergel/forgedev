---
description: Show which nodes depend on a shared model and what updates they need.
argument-hint: "[model-name]"
disable-model-invocation: true
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
