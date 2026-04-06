# ForgePlan

**Architecture-governed AI development. Build software that stays coherent.**

*For developers using Claude Code who want AI-generated code to stay coherent as projects grow.*

ForgePlan works **architecture down, not code up.** You define the system first — nodes, specs, shared models, constraints — then the harness enforces it as AI builds the code. Every file write is checked against your architecture, every build is verified against acceptance criteria, and every change propagates to affected nodes.

## The Problem

AI coding tools are fast but fragile. The code they generate drifts from the plan, types get duplicated across files, stubs are left unfinished, and changes in one part silently break another. The bigger the project, the worse the drift.

ForgePlan fixes this by making the architecture the governing constraint, not just a document that rots.

## How It Works

```
1. DISCOVER   →  Describe your project. ForgePlan decomposes it into nodes
                  with clear boundaries, shared models, and a dependency graph.

2. SPEC        →  Each node gets a detailed specification: acceptance criteria,
                  constraints, non-goals, failure modes, interface contracts.

3. BUILD       →  Build node by node. Every file write is enforced:
                  - File scope blocking (can't write outside your node)
                  - Shared model guard (import, don't redefine)
                  - Acceptance criteria verification before completion

4. VERIFY      →  Compilation, tests, and dev server verified automatically.
                  Code must actually run, not just look correct.

5. REVIEW      →  7-dimension spec-diff review. Per-criterion PASS/FAIL with
                  code evidence.

6. SWEEP       →  3-12 parallel agents (tier-aware) audit the codebase.
                  Progressive convergence. Optional cross-model verification
                  by a different AI (Codex/GPT/Gemini) for independent review.
```

## Installation

ForgePlan is a Claude Code plugin. To install:

1. Make sure you have [Claude Code](https://claude.ai/claude-code) installed
2. Add the ForgePlan marketplace:
   ```bash
   # In Claude Code settings, add the marketplace
   # (this will be automated once published to the official marketplace)
   ```
3. Enable the plugin:
   ```bash
   # Start Claude Code in any project directory
   claude

   # The plugin loads automatically. Verify with:
   /forgeplan:help
   ```

No additional dependencies needed — the plugin includes everything.

## Quick Start

ForgePlan is installed as a Claude Code plugin via marketplace:

```bash
# Start Claude Code in your project directory
claude

# Create a project from a template
/forgeplan:discover template:client-portal

# Or describe your own project
/forgeplan:discover I want to build a URL shortener with...

# Full autonomous pipeline (specs, builds, reviews, sweeps, certifies)
/forgeplan:deep-build
```

## Key Concepts

New to ForgePlan? Here's what the terms mean:

| Term | What it means |
|------|--------------|
| **Node** | A piece of your app — like the database, the login page, or the API. ForgePlan breaks your project into nodes so each piece gets built and tested independently. |
| **Spec** | A detailed blueprint for a node: what it must do (acceptance criteria), what it must NOT do (non-goals), how to verify it works (tests), and how it connects to other nodes (interfaces). |
| **Shared Model** | A data type used by multiple nodes (like "User" or "Document"). Defined once in the manifest, imported everywhere — never duplicated. |
| **Manifest** | The master architecture file (`.forgeplan/manifest.yaml`). Lists every node, their dependencies, shared models, tech stack, and connections. |
| **Acceptance Criteria** | Specific, testable requirements for a node. "AC1: Users can log in with email/password — test: login form submits and returns a session token." |
| **File Scope** | The directory a node is allowed to write to (e.g., `src/auth/**`). The enforcement hook blocks writes outside this scope. |
| **Sweep** | An automated codebase audit by 12 specialized agents running in parallel, each checking a different dimension (security, types, errors, etc.). |
| **Cross-Model Review** | A second AI model (Codex, GPT, Gemini) independently reviews code that Claude built. Different models catch different blind spots. |
| **Deep-Build** | The fully autonomous pipeline: specs every node, builds them, reviews them, sweeps for issues, fixes everything, and certifies with cross-model verification. |
| **Enforcement** | ForgePlan's hook system that physically blocks bad writes — not suggestions, actual prevention. If you try to write outside your node's scope, the operation is rejected. |
| **Non-Goal** | Something explicitly NOT in scope for a node. Non-goals become enforcement constraints — the builder is blocked from implementing them. |
| **Convergence** | The process of alternating between AI models until both agree the code is clean. 2 consecutive clean passes = certified. |

## What Gets Enforced

ForgePlan doesn't just suggest — it blocks bad writes deterministically:

- **File scope** — Builder can only write to its node's directory. Writes to other nodes are rejected.
- **Shared models** — Types defined in the manifest must be imported from the canonical source. Local redefinitions are blocked.
- **Shell commands** — During builds, only read-only commands are allowed via Bash. File-writing shell commands are blocked to prevent enforcement bypass.
- **Acceptance criteria** — The Stop hook evaluates every criterion before allowing a build to complete. Unmet criteria bounce the builder back to keep working.
- **Review boundaries** — Reviewers can only write review reports. They cannot touch implementation code.
- **Revision boundaries** — Revisions can only modify specs, manifest, and shared types. Implementation changes happen during rebuild.

## Commands

| Command | Description |
|---------|-------------|
| `/forgeplan:discover` | Architecture discovery — guided conversation or template |
| `/forgeplan:spec [node\|--all]` | Generate detailed node specifications |
| `/forgeplan:build [node\|--all]` | Build with full enforcement |
| `/forgeplan:review [node]` | 7-dimension spec-diff review with evidence |
| `/forgeplan:sweep [--cross-check]` | Tier-aware parallel sweep (3-12 agents) + progressive convergence |
| `/forgeplan:deep-build` | Full autonomous pipeline: spec → build → verify → review → sweep → certify |
| `/forgeplan:configure` | Set up cross-model review (Codex/GPT/Gemini) |
| `/forgeplan:revise [node\|--model name]` | Change impact analysis + propagation |
| `/forgeplan:next` | What to build next (dependency-aware) |
| `/forgeplan:status` | Project overview with dependency graph |
| `/forgeplan:integrate` | Cross-node interface verification |
| `/forgeplan:recover` | Fix crashed/stuck operations |
| `/forgeplan:measure` | Code quality metrics (broken refs, stubs, duplicates) |
| `/forgeplan:affected [model]` | Which nodes use a shared model — impact analysis |
| `/forgeplan:validate` | Check manifest/specs for cycles, orphans, consistency |
| `/forgeplan:regen-types` | Rebuild shared TypeScript types from manifest |
| `/forgeplan:guide` | Where am I? Recommends best next step |
| `/forgeplan:help` | All commands |

## Blueprint Templates

Start from a template instead of a blank canvas:

- **Client Portal** — 7 nodes, document upload with role-based access (client vs accountant)
- **SaaS Starter** — 8 nodes, multi-tenant with Stripe billing
- **Internal Dashboard** — 6 nodes, operations monitoring and data management

## Cross-Model Review (BYOK)

Configure a second LLM to independently review your code. Different models catch different blind spots.

```bash
# Interactive setup wizard
/forgeplan:configure
```

Supports: OpenAI (Codex/GPT), Google Gemini, Anthropic — via MCP, CLI, or direct API.

## The `.forgeplan/` Directory

The `.forgeplan/` directory IS the product. It's portable — any tool that reads manifest + specs participates in the ecosystem.

```
.forgeplan/
├── manifest.yaml          # Architecture: nodes, shared models, connections, tech stack
├── config.yaml            # BYOK keys, model preferences (optional)
├── state.json             # Build progress, active operations
├── specs/                 # Per-node specifications (the enforcement contracts)
├── conversations/         # Design rationale and build logs
├── reviews/               # Structured review reports
└── sweeps/                # Codebase sweep reports
```

## What ForgePlan Proves

After dogfooding on real projects, ForgePlan-built codebases have:

- **Fewer broken references** — shared models are canonical, file scopes prevent cross-contamination
- **Fewer duplicate types** — the PreToolUse hook blocks local type redefinitions
- **Fewer abandoned stubs** — the Stop hook won't let builds complete with unmet acceptance criteria
- **Better change propagation** — revising a shared model identifies every affected node automatically

## Project Structure

```
ForgeDev/                              # Repo root IS the plugin root
├── .claude-plugin/                    # Plugin + marketplace manifests
├── commands/                          # 18 slash commands
├── agents/                            # 3 core + 12 sweep agents
├── hooks/hooks.json                   # SessionStart, PreToolUse, PostToolUse, Stop
├── scripts/                           # 15 enforcement and utility scripts
├── skills/                            # Specification skill
├── templates/                         # Schemas, blueprints, project templates
├── Planning Documents/                # Product vision and execution plan
└── README.md                          # This file
```

## Development

```bash
# Validate a manifest
node scripts/validate-manifest.js .forgeplan/manifest.yaml

# Validate a spec
node scripts/validate-spec.js .forgeplan/specs/auth.yaml .forgeplan/manifest.yaml

# Measure code quality
node scripts/measure-quality.js
```
