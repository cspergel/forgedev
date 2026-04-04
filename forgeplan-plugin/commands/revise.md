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
- Set `nodes.[node-id].previous_status` to the node's current status — used by recovery to restore state
- Set `active_node` to `{"node": "[node-id]", "status": "revising", "started_at": "[ISO timestamp]"}`
- Set `nodes.[node-id].status` to `"revising"`
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
   - Update the manifest if shared models changed (increment `project.revision_count` on every manifest write)
   - **If shared model changed: regenerate `src/shared/types/index.ts`** from the updated manifest using the canonical type mapping rules (see Builder agent). This is the ONE file that must be updated immediately on shared model changes — it is the source of truth for all node imports.
   - Run validation
   - List all affected nodes with specific interface/model references that need updating
   - For each affected node, suggest the two-step remediation:
     1. `/forgeplan:spec [affected-node]` — update the affected node's spec to reflect the changed interface contracts or shared model fields. The spec must be current before rebuilding, otherwise the Builder follows stale instructions.
     2. `/forgeplan:build [affected-node]` — rebuild against the updated spec
5. Update state.json:
   - Set `nodes.[node-id].status` to `"revised"`
   - Clear `nodes.[node-id].previous_status` to `null`
   - Clear `active_node` to `null`
   - Set `last_updated` to current ISO timestamp
6. Log the revision in `nodes.[node-id].revision_history` in state.json

## The Killer Proof

This command is what proves ForgePlan is materially better than ad hoc AI coding. When a shared model field changes, the system identifies every affected node and guides remediation rather than leaving the user to find breakage manually.
