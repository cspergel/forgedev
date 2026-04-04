# ForgePlan Project — Claude Code Instructions

This project uses **ForgePlan Core**, an architecture-governed build harness. The `.forgeplan/` directory contains the project manifest, node specs, and build state.

## Critical Rules

1. **Always check for an active node** before writing code. Read `.forgeplan/state.json` to see if a node is currently being built.
2. **Never write files outside the active node's `file_scope`** directory. The manifest defines which directories belong to which node.
3. **Never redefine shared models locally.** Shared models (User, Document, etc.) are defined canonically in `.forgeplan/manifest.yaml`. Import them — do not create local copies.
4. **Follow the node spec exactly.** Each node's spec at `.forgeplan/specs/[node].yaml` defines what to build, what NOT to build (non_goals), and how to verify it (acceptance_criteria).
5. **Use anchor comments** in generated code:
   - `// @forgeplan-node: [node-id]` at the top of every file
   - `// @forgeplan-spec: [AC1]` on functions implementing acceptance criteria

## Workflow

Use ForgePlan commands in order:
1. `/forgeplan:discover` — Define the architecture
2. `/forgeplan:spec [node]` — Detail each node's spec
3. `/forgeplan:build [node]` — Build nodes in dependency order
4. `/forgeplan:review [node]` — Review each built node
5. `/forgeplan:next` — Get the next recommended node
6. `/forgeplan:integrate` — Verify cross-node interfaces
7. `/forgeplan:revise [node]` — Make changes with impact analysis
8. `/forgeplan:status` — See overall project progress
9. `/forgeplan:recover` — Fix crashed/stuck builds

## Key Files

- `.forgeplan/manifest.yaml` — Central command file, defines all nodes and shared models
- `.forgeplan/state.json` — Current session state, active node, build progress
- `.forgeplan/specs/[node].yaml` — Detailed spec for each node
- `.forgeplan/conversations/discovery.md` — Architecture discovery rationale
- `.forgeplan/reviews/[node].md` — Review reports
