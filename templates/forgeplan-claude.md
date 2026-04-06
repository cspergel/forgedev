# ForgePlan Project — Claude Code Instructions

This project uses **ForgePlan Core**, an architecture-governed build harness. ForgePlan works **architecture down, not code up** — the architecture is defined first, then enforced as code is generated. The `.forgeplan/` directory contains the project manifest, node specs, and build state.

## Critical Rules

1. **Always check for an active operation** before writing code. Read `.forgeplan/state.json` to see if a node is currently being built, reviewed, revised, or swept.
2. **Never write files outside the active node's `file_scope`** directory. The manifest defines which directories belong to which node. Permitted exceptions depend on the active operation:
   - **Building:** `.forgeplan/conversations/nodes/[node].md`, `.forgeplan/state.json`, `src/shared/types/index.ts` (creation only), `.env.example`, `package.json`
   - **Reviewing:** `.forgeplan/reviews/[node].md` and `.forgeplan/state.json` only
   - **Revising:** `.forgeplan/specs/[node].yaml`, `.forgeplan/manifest.yaml`, `.forgeplan/state.json`, and `src/shared/types/index.ts`
   - **Sweeping:** `.forgeplan/sweeps/`, `.forgeplan/specs/`, `.forgeplan/manifest.yaml`, `.forgeplan/state.json`, and node files within the active node's scope
3. **Never redefine shared models locally.** Shared models are defined canonically in `.forgeplan/manifest.yaml`. Import them — do not create local copies.
4. **Follow the node spec exactly.** Each node's spec at `.forgeplan/specs/[node].yaml` defines what to build, what NOT to build (non_goals), and how to verify it (acceptance_criteria).
5. **Use anchor comments in source code files** (`.ts`, `.js`, `.tsx`, `.jsx`):
   - `// @forgeplan-node: [node-id]` at the top of every source file
   - `// @forgeplan-spec: [AC1]` on functions implementing acceptance criteria
   - Do not add anchor comments to non-source files (JSON, YAML, config)

## Available Commands

| Command | What it does |
|---------|-------------|
| `/forgeplan:discover` | Architecture discovery — guided conversation or template |
| `/forgeplan:spec [node\|--all]` | Generate detailed specs |
| `/forgeplan:build [node]` | Build a node with enforcement |
| `/forgeplan:review [node]` | 7-dimension spec-diff review |
| `/forgeplan:sweep [--cross-check]` | Tier-aware parallel sweep (3-12 agents) with progressive convergence |
| `/forgeplan:deep-build` | Full autonomous pipeline: spec → build → review → sweep → certify |
| `/forgeplan:configure` | Set up cross-model review (Codex/GPT/Gemini) |
| `/forgeplan:next` | Dependency-aware next recommendation |
| `/forgeplan:revise [node]` | Change impact analysis + propagation |
| `/forgeplan:integrate` | Cross-node interface verification |
| `/forgeplan:recover` | Fix crashed/stuck operations |
| `/forgeplan:status` | Full project status |
| `/forgeplan:measure` | Code quality metrics (broken refs, stubs, duplicates) |
| `/forgeplan:affected [model]` | Which nodes use a shared model — impact analysis |
| `/forgeplan:validate` | Check manifest/specs for cycles, orphans, consistency |
| `/forgeplan:regen-types` | Rebuild shared TypeScript types from manifest |
| `/forgeplan:guide` | Where am I? Best next step with explanations |
| `/forgeplan:help` | All available commands |

## Key Files

- `.forgeplan/manifest.yaml` — Central architecture file: nodes, shared models, tech stack, connections
- `.forgeplan/state.json` — Current session state, active node, build progress, sweep state
- `.forgeplan/specs/[node].yaml` — Detailed spec for each node (the enforcement contract)
- `.forgeplan/config.yaml` — Cross-model review configuration (optional)
- `.forgeplan/conversations/discovery.md` — Architecture discovery rationale
- `.forgeplan/reviews/[node].md` — Review reports
- `.forgeplan/sweeps/` — Sweep and cross-model verification reports
