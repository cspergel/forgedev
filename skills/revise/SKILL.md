---
description: Revise a node spec or shared model and trace affected nodes.
argument-hint: "[node-id|--model <name>]"
disable-model-invocation: true
---

# Revise Node

Reopen a completed node for modification and analyze change impact.

**Target:** $ARGUMENTS

## Batch Mode: `--model [model-name]`

If the argument starts with `--model`, this is a shared model cascade:
1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/regenerate-shared-types.js"` to update `src/shared/types/index.ts` with the new model fields
2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/find-affected-nodes.js" [model-name]` to identify all affected nodes
3. Present the full list of affected nodes and remediation plan to the user for confirmation
4. For each affected node (in dependency order), run `/forgeplan:spec [node]` then `/forgeplan:build [node]` then `/forgeplan:review [node]` — wait for user confirmation between nodes. The review step is required: rebuilt code must be verified against the updated spec before integration.
5. If any node fails during the cascade (build fails, review returns REQUEST CHANGES), stop and report which nodes were successfully updated and which remain
6. After all nodes are revised and reviewed, run `/forgeplan:integrate` to verify coherence

## Single Node Mode

## Prerequisites

- Node must have status "built", "reviewed", or "reviewed-with-findings"
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
1b. **Tier reassessment check:** If the change adds significant complexity (OAuth, payments, new integrations, multi-tenant, compliance requirements), read the current `complexity_tier` from `.forgeplan/manifest.yaml` and assess whether it still fits. If the change suggests a higher tier, prompt the user:
   ```
   This change adds [description]. Current tier: [TIER].
   This may warrant upgrading to [HIGHER_TIER], which means:
     [pipeline consequence differences]
   Reassess tier? (y/n)
   ```
   If the user agrees, update `project.complexity_tier` in the manifest. The pipeline adapts at the next command invocation.
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

## After Revision

Present next steps based on what changed:

For single-node revision:
```
Revision complete. Next:
  → /forgeplan:build [node-id]    Rebuild this node with the updated spec
  → /forgeplan:affected [model]   See if other nodes are impacted (if shared model changed)
  → /forgeplan:next               See the recommended build order
```

For shared model revision (--model):
```
Shared model updated. [N] nodes affected. Next:
  → /forgeplan:build [node-id]    Rebuild each affected node (in dependency order)
  → /forgeplan:review [node-id]   Review each rebuilt node against its updated spec
  → /forgeplan:integrate          Verify all interfaces after all nodes are reviewed
  → /forgeplan:next               See the recommended order
```

## The Killer Proof

This command is what proves ForgePlan is materially better than ad hoc AI coding. When a shared model field changes, the system identifies every affected node and guides remediation rather than leaving the user to find breakage manually.
