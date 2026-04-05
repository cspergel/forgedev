---
description: Show all ForgePlan commands with descriptions and usage.
user-invocable: true
---

# ForgePlan Commands

Here are all available ForgePlan commands:

## Core Workflow

| Command | Description |
|---------|-------------|
| `/forgeplan:discover [description\|template:name]` | Architecture discovery — guided conversation or load a template (client-portal, saas-starter, internal-dashboard) |
| `/forgeplan:spec [node-id\|--all]` | Generate detailed node specifications with acceptance criteria, constraints, and interface contracts |
| `/forgeplan:build [node-id\|--all]` | Build a node (or all) with full enforcement — file scope blocking, shared model guard, acceptance criteria verification |
| `/forgeplan:review [node-id]` | 7-dimension spec-diff review with per-criterion PASS/FAIL and code evidence. Optional cross-model verification via BYOK |
| `/forgeplan:next` | What to build next — dependency-aware recommendation, surfaces stuck nodes and revision-affected rebuilds |
| `/forgeplan:revise [node-id\|--model name]` | Change impact analysis. Single node or batch cascade for shared model changes |
| `/forgeplan:integrate` | Cross-node interface verification — checks all contracts, identifies fault side, verifies shared model consistency |
| `/forgeplan:status` | Full project overview — node statuses, dependency graph, shared model usage, tech stack |
| `/forgeplan:recover` | Fix crashed/stuck operations — resume, reset, rollback, or skip with context-appropriate options |

## Utilities

| Command | Description |
|---------|-------------|
| `/forgeplan:measure` | Quality metrics — count broken references, duplicate types, and abandoned stubs |
| `/forgeplan:affected [model-name]` | Find all nodes that depend on a shared model |
| `/forgeplan:regen-types` | Regenerate `src/shared/types/index.ts` from manifest (deterministic, no LLM) |
| `/forgeplan:validate [manifest\|spec node\|all]` | Run validation on manifest and/or specs |
| `/forgeplan:help` | This help screen |

## Typical Workflow

```
/forgeplan:discover template:client-portal   # Start with a template
/forgeplan:spec --all                         # Generate all specs
/forgeplan:build --all                        # Build everything
/forgeplan:review [node]                      # Review each node
/forgeplan:integrate                          # Verify interfaces
/forgeplan:measure                            # Check quality metrics
```

## Configuration

Create `.forgeplan/config.yaml` for cross-model review and model preferences. See the plugin README for details.
