---
description: Begin building a node. Sets the active node, injects spec + interfaces + shared models into context, and starts the Builder agent with enforcement hooks active.
user-invocable: true
argument-hint: "[node-id]"
allowed-tools: Read Write Edit Bash Glob Grep
agent: builder
context: fork
---

# Build Node

Build the specified node following its spec with full enforcement.

**Target node:** $ARGUMENTS

## Prerequisites

- `.forgeplan/manifest.yaml` must exist
- `.forgeplan/specs/[node-id].yaml` must exist and be complete
- All nodes in the target's `depends_on` list must have status "built" or "reviewed"
- No other node can be currently in "building" status

## Setup

1. Read the manifest and the target node's spec
2. Read specs for all nodes this node interfaces with (for contract context)
3. Read shared model definitions from the manifest
4. Set the active node in `.forgeplan/state.json`:
   ```json
   {
     "active_node": {
       "node": "[node-id]",
       "status": "building",
       "started_at": "[ISO timestamp]"
     }
   }
   ```
5. Update the node's status to "building" in state.json

## Builder Agent Context

The Builder agent receives:
- Full node spec
- Adjacent interface contracts (specs of connected nodes)
- Shared model definitions from the manifest
- The constraint directive (see Builder agent prompt)

## Completion

When the build is complete:
1. Update node status to "built" in state.json
2. Clear active_node in state.json
3. Suggest running `/forgeplan:review [node-id]` next
