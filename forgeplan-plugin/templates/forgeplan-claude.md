# ForgePlan Project — Claude Code Instructions

This project uses **ForgePlan Core**, an architecture-governed build harness. The `.forgeplan/` directory contains the project manifest, node specs, and build state.

## Critical Rules

1. **Always check for an active operation** before writing code. Read `.forgeplan/state.json` to see if a node is currently being built, reviewed, or revised.
2. **Never write files outside the active node's `file_scope`** directory. The manifest defines which directories belong to which node. Permitted exceptions depend on the active operation:
   - **Building:** `.forgeplan/conversations/nodes/[node].md`, `.forgeplan/state.json`, and `src/shared/types/index.ts` (creation only)
   - **Reviewing:** `.forgeplan/reviews/[node].md` and `.forgeplan/state.json` only
   - **Revising:** `.forgeplan/specs/[node].yaml`, `.forgeplan/manifest.yaml`, `.forgeplan/state.json`, and `src/shared/types/index.ts`
3. **Never redefine shared models locally.** Shared models (User, Document, etc.) are defined canonically in `.forgeplan/manifest.yaml`. Import them — do not create local copies.
4. **Follow the node spec exactly.** Each node's spec at `.forgeplan/specs/[node].yaml` defines what to build, what NOT to build (non_goals), and how to verify it (acceptance_criteria).
5. **Use anchor comments in source code files** (`.ts`, `.js`, `.tsx`, `.jsx`):
   - `// @forgeplan-node: [node-id]` at the top of every source file
   - `// @forgeplan-spec: [AC1]` on functions implementing acceptance criteria
   - Do not add anchor comments to non-source files (JSON, YAML, config)

## Available Commands

Use ForgePlan commands in this order:

1. `/forgeplan:discover` — Define the architecture (guided conversation → manifest + skeleton specs)
2. `/forgeplan:spec [node]` — Detail each node's spec (`--all` for all nodes in dependency order)
3. `/forgeplan:build [node]` — Build a node following its spec
4. `/forgeplan:next` — Get the next recommended node based on dependency graph
5. `/forgeplan:review [node]` — Audit a built node against its spec (7-dimension review)
6. `/forgeplan:revise [node]` — Reopen a node with change impact analysis
7. `/forgeplan:recover` — Fix crashed/stuck builds
8. `/forgeplan:integrate` — Verify all cross-node interfaces
9. `/forgeplan:status` — Full project status with dependency visualization

**Note:** `/forgeplan:sweep` and `/forgeplan:deep-build` require Sprint 6 (plugin v0.6+).

## Key Files

- `.forgeplan/manifest.yaml` — Central command file, defines all nodes and shared models
- `.forgeplan/state.json` — Current session state, active node, build progress
- `.forgeplan/specs/[node].yaml` — Detailed spec for each node
- `.forgeplan/conversations/discovery.md` — Architecture discovery rationale
- `.forgeplan/reviews/[node].md` — Review reports
