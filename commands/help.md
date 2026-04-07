---
description: Show all ForgePlan commands with descriptions and usage.
user-invocable: true
---

# ForgePlan Commands

## Getting Started

| Command | What it does |
|---------|-------------|
| `/forgeplan:discover [description\|template:name]` | **Start here.** Describe your project or pick a template (client-portal, saas-starter, internal-dashboard). Creates your architecture. |
| `/forgeplan:spec [node\|--all]` | Generate detailed specs for each node — acceptance criteria, constraints, interfaces. The spec is the contract your build follows. |

## Building

| Command | What it does |
|---------|-------------|
| `/forgeplan:build [node\|--all]` | Build a node (or all). Code is enforced against the spec — files stay in scope, shared types are protected, criteria are verified. |
| `/forgeplan:next` | What should I work on next? Shows the recommended node and suggests commands based on where you are. |
| `/forgeplan:review [node\|--all]` | Review a node against its spec. 7-dimension audit with per-criterion PASS/FAIL. Optional cross-model verification. |

## Autonomous

| Command | What it does |
|---------|-------------|
| `/forgeplan:sweep [--cross-check]` | Sweep your codebase for cross-cutting issues — 3-5 consolidated team agents (tier-aware, all opus): Red (adversarial), Orange (contract), Blue (experience), Rainbow (architect), White (compliance). Progressive convergence drops clean agents. Add `--cross-check` for cross-model verification. |
| `/forgeplan:deep-build` | Full autonomous pipeline: build all → verify-runnable → review → sweep → certify (tier-aware). Describe what you want, walk away. |
| `/forgeplan:greenfield [description]` | Full pipeline from idea to certified app: describe → discover → research → spec → build → verify → review → sweep → certify. One confirmation, then walk away. |
| `/forgeplan:research [topic]` | Search npm, GitHub, and docs for best practices, packages, and reference implementations. 4 agents in parallel: researcher, license checker, inspiration, docs. |

## Evolving Your Project

| Command | What it does |
|---------|-------------|
| `/forgeplan:revise [node\|--model name]` | Need to change something? Finds every affected node and walks you through updating them. |
| `/forgeplan:integrate` | Do all the pieces fit? Verifies cross-node interfaces and shared model consistency. |
| `/forgeplan:recover` | Something went wrong? Detects stuck builds and offers resume, reset, or skip options. |

## Monitoring

| Command | What it does |
|---------|-------------|
| `/forgeplan:status` | How's my project? Node statuses, dependency graph, shared models, and what to do next. |
| `/forgeplan:measure` | How clean is my code? Counts broken references, duplicate types, and abandoned stubs. |

## Utilities

| Command | What it does |
|---------|-------------|
| `/forgeplan:configure` | Set up cross-model review (Codex/GPT/Gemini), enforcement mode, and model tiering. Interactive setup wizard. |
| `/forgeplan:affected [model]` | Which nodes use this data model? Shows dependencies and update steps. |
| `/forgeplan:regen-types` | Rebuild shared TypeScript types from the manifest. |
| `/forgeplan:validate [manifest\|spec node\|all]` | Is my architecture valid? Checks for cycles, orphans, and consistency. |
| `/forgeplan:guide` | Where am I? Evaluates project state and recommends your best next step with explanations. |
| `/forgeplan:help` | This screen. |

## Typical Workflow

```
/forgeplan:discover template:client-portal    ← Start with a template
/forgeplan:spec --all                         ← Generate all specs
/forgeplan:build --all                        ← Build everything
/forgeplan:review --all                       ← Review all nodes
/forgeplan:integrate                          ← Verify interfaces
/forgeplan:measure                            ← Check quality
/forgeplan:next                               ← What's next?
```
