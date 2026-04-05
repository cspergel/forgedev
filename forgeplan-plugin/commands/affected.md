---
description: Find all nodes affected by a shared model change. Shows which nodes depend on a given model and what remediation steps are needed.
user-invocable: true
argument-hint: "[model-name]"
allowed-tools: Read Bash
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
