---
description: Generate or refine a detailed node specification. Use --all to generate specs for all nodes in dependency order. The spec is the enforcement contract for the build phase.
user-invocable: true
argument-hint: "[node-id | --all]"
allowed-tools: Read Write Edit Bash Glob Grep
---

# Generate Node Specification

Generate a detailed node spec for the specified node(s).

**Target:** $ARGUMENTS

## Prerequisites

- `.forgeplan/manifest.yaml` must exist (run `/forgeplan:discover` first)
- The target node must exist in the manifest

## Behavior

### Single Node Mode (`/forgeplan:spec auth`)

1. Read the manifest to get the node's metadata, connections, and shared model dependencies
2. Read the existing skeleton spec at `.forgeplan/specs/[node-id].yaml` if it exists
3. Engage the user in a brief conversation to fill in details:
   - What are the specific inputs and their validation rules?
   - What are the exact outputs and response types?
   - What are the acceptance criteria (specific, testable assertions)?
   - What constraints apply (technology choices, behavioral rules)?
   - What is explicitly NOT in scope (non-goals)?
   - What are the likely failure modes to test against?
4. Write the complete spec to `.forgeplan/specs/[node-id].yaml` using the node spec schema
5. Update the node's status to "specced" in `.forgeplan/state.json`

### All Nodes Mode (`/forgeplan:spec --all`)

1. Read the manifest and determine dependency order (topological sort)
2. Generate specs for each node in order, using completed specs to inform dependent nodes
3. For each node, present the draft spec and ask the user to review before finalizing
4. Update state.json after each spec is written

## Spec Quality Rules

- Every acceptance criterion MUST have an `id` (AC1, AC2, etc.) and a `test` field describing how to verify it
- Every interface MUST have a `type` (read/write, outbound, inbound) and a `contract` description
- Every node MUST have at least one `non_goal` to prevent scope creep
- Every node MUST have at least one `failure_mode` to guide the reviewer
- `shared_dependencies` MUST list every shared model this node uses — cross-reference with the manifest
- `file_scope` MUST match the manifest and not overlap with any other node

## Output

Write the spec to `.forgeplan/specs/[node-id].yaml` and confirm with the user.
