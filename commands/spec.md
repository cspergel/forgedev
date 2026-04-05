---
description: Generate or refine a detailed node specification. Use --all to generate specs for all nodes in dependency order. The spec is the enforcement contract for the build phase.
user-invocable: true
argument-hint: "[node-id | --all]"
allowed-tools: Read Write Edit Bash Glob Grep
---

# Generate Node Specification

Generate a detailed node spec for the specified node(s).

**Before starting:** Read the specification skill at `${CLAUDE_PLUGIN_ROOT}/skills/specification/SKILL.md` for field definitions, quality rules, and the canonical type mapping table.

**Target:** $ARGUMENTS

## Prerequisites

- `.forgeplan/manifest.yaml` must exist (run `/forgeplan:discover` first)
- `.forgeplan/state.json` must exist
- The target node must exist in the manifest (or use `--all`)

## Single Node Mode (`/forgeplan:spec [node-id]`)

1. Read the manifest to get the node's metadata, connections, shared model dependencies, and tech stack
2. Read the existing skeleton spec at `.forgeplan/specs/[node-id].yaml` if it exists
3. Read specs of nodes this node connects to (for interface context)
4. Engage the user in a brief conversation to fill in details. Ask about each section that needs more specificity:
   - **Inputs/outputs:** What data enters and exits this node? What types? What validation?
   - **Acceptance criteria:** What specific, testable things must be true when this node is complete? Frame each as: "AC[n]: [description] — test: [how to verify]"
   - **Constraints:** What technology choices or behavioral rules must the implementation follow?
   - **Non-goals:** What is explicitly NOT in scope? (At least 1 required — this prevents feature creep)
   - **Failure modes:** What are the likely bugs that could ship? (At least 1 required — this guides the reviewer)
   - **Interfaces:** For each connection, what is the contract? What direction (read/write, outbound, inbound)?
5. Write the complete spec to `.forgeplan/specs/[node-id].yaml` using ALL 14 fields from the node spec schema
6. Run spec validation: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.js" .forgeplan/specs/[node-id].yaml .forgeplan/manifest.yaml`
7. Run manifest validation: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.js" .forgeplan/manifest.yaml`
8. **Read** `.forgeplan/state.json`, then **update** (do not overwrite): set `nodes.[node-id].status` to `"specced"` and `last_updated` to current ISO timestamp. Preserve all other existing fields.
9. Present a summary of the spec and confirm with the user

## All Nodes Mode (`/forgeplan:spec --all`)

1. Read the manifest and determine dependency order. Always use the deterministic script — do not attempt manual sorting:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/topo-sort.js"
   ```
2. Process each node in dependency order:
   - For the first 1-2 nodes (typically database and auth), engage in full conversation
   - For subsequent nodes, generate a draft spec based on the manifest metadata and already-completed specs, then present it for user review/edit
   - Use completed specs to inform interface contracts on dependent nodes
3. After each spec is written:
   - Run validation
   - Update state.json
   - Present summary and get user confirmation before moving to the next node
4. After all specs are complete, present a full project summary showing all nodes and their acceptance criteria counts

## Spec Quality Gates

Before finalizing any spec, verify:

- [ ] Every acceptance criterion has `id` (AC1, AC2...) AND `test` field
- [ ] Every interface has `type` (read/write | outbound | inbound) AND `contract`
- [ ] At least 1 `non_goal` present
- [ ] At least 1 `failure_mode` present
- [ ] `shared_dependencies` lists every shared model from the manifest that this node uses
- [ ] `file_scope` matches the manifest entry and doesn't overlap with other nodes
- [ ] `depends_on` matches the manifest entry

If any gate fails, fix it before writing the spec file.

## Output

Write the spec to `.forgeplan/specs/[node-id].yaml` and confirm with the user.
