---
description: Reopen a completed node for revision. Analyzes change impact — whether changes are internal-only or affect interfaces — and flags dependent nodes that may need updating.
user-invocable: true
argument-hint: "[node-id]"
allowed-tools: Read Write Edit Bash Glob Grep
---

# Revise Node

Reopen a completed node for modification and analyze change impact.

**Target node:** $ARGUMENTS

## Prerequisites

- Node must have status "built" or "reviewed"
- `.forgeplan/specs/[node-id].yaml` must exist

## Setup

**Read** `.forgeplan/state.json`, then **update** (do not overwrite) these fields:
- Set `active_node` to `{"node": "[node-id]", "status": "revising", "started_at": "[ISO timestamp]"}`
- Set `last_updated` to current ISO timestamp
- Preserve all other existing fields

## Process

1. Read the current spec and identify what the user wants to change
2. Classify the change:
   - **Internal change** — affects only this node's implementation (e.g., refactoring, bug fix). No impact on other nodes.
   - **Interface change** — affects this node's inputs, outputs, or contracts with other nodes. Dependent nodes must be flagged.
   - **Shared model change** — affects a shared model definition. ALL nodes listing that model in `shared_dependencies` must be flagged.
3. Present the impact analysis:
   ```
   === Change Impact Analysis ===
   Node: [node-id]
   Change type: [internal | interface | shared model]
   Affected nodes: [list or "none"]
   Action required: [description]
   ```
4. If interface or shared model change:
   - Update the spec
   - Update the manifest if shared models changed
   - **If shared model changed: regenerate `src/shared/types/index.ts`** from the updated manifest using the canonical type mapping rules (see Builder agent). This is the ONE file that must be updated immediately on shared model changes — it is the source of truth for all node imports.
   - Run validation
   - List all affected nodes with specific interface/model references that need updating
   - Suggest running `/forgeplan:build [affected-node]` for each affected node
5. Update node status to "revised" in state.json and clear `active_node` to `null`
6. Log the revision in the node's `revision_history` in state.json

## The Killer Proof

This command is what proves ForgePlan is materially better than ad hoc AI coding. When a shared model field changes, the system identifies every affected node and guides remediation rather than leaving the user to find breakage manually.
