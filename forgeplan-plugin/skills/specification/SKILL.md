---
name: specification
description: Knowledge skill for generating high-quality node specifications. Loaded automatically when running /forgeplan:spec. Provides the node spec template, field definitions, and quality rules for writing enforceable specs.
user-invocable: false
---

# ForgePlan Specification Skill

This skill provides context for generating high-quality node specifications.

## Node Spec Template

Every node spec MUST include these 11 fields (see `${CLAUDE_PLUGIN_ROOT}/templates/schemas/node-spec-schema.yaml`):

1. **inputs** — External entry points with name, type, required flag, and validation rule
2. **outputs** — Guaranteed responses with name and type (use `$shared.ModelName` for shared models)
3. **shared_dependencies** — List of shared models this node uses (must match manifest exactly)
4. **data_models** — Node-specific data types (NOT shared across nodes)
5. **interfaces** — Directional contracts with target_node, type (read/write|outbound|inbound), and contract description
6. **acceptance_criteria** — Testable assertions with `id` (AC1, AC2...), `description`, and `test` field
7. **constraints** — Strict behavioral rules the implementation must follow
8. **non_goals** — Explicit scope boundaries — what this node does NOT do
9. **failure_modes** — Specific bugs the Reviewer will test for
10. **file_scope** — Glob pattern defining this node's file territory
11. **depends_on** — Nodes that must be built before this one

## Quality Rules

- Every acceptance criterion MUST have a testable `test` field — not just a description
- Every node MUST have at least 1 non_goal to prevent scope creep
- Every node MUST have at least 1 failure_mode to guide the Reviewer
- shared_dependencies MUST cross-reference with the manifest's shared_models section
- file_scope MUST not overlap with any other node's file_scope
- interfaces MUST specify directional type (read/write, outbound, inbound) — this determines fault-side in integration checks

## Shared Model Rules

- Any entity referenced by 2+ nodes MUST be a shared model in the manifest
- Shared models are NEVER defined locally in node specs
- Use `$shared.ModelName` syntax in type references to indicate shared models
- The Builder agent imports shared model definitions — it does not redefine them
