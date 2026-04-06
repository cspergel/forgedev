# ForgePlan

**Architecture down, not code up.**

*The AI build harness that makes architecture an enforceable contract — not a document that rots.*

---

## The Philosophy

Every AI coding tool today works **code up** — you describe what you want, the AI generates code, and you hope it stays coherent as the project grows. It doesn't. At 3,000 lines, types start duplicating. At 5,000 lines, changes in one file silently break another. At 10,000 lines, nobody knows what the AI actually built or whether it matches what you asked for.

ForgePlan works **architecture down.** You define the system first — what it does, how it's structured, what each piece is responsible for, and what's explicitly out of scope. Then the harness enforces those decisions as AI generates the code. The architecture isn't a suggestion. It's a constraint.

**The result:** AI-generated code that stays coherent, verified against the spec, with every change automatically propagated to affected components. Not because the AI is smarter — because the constraints are smarter.

## Who This Is For

Developers using Claude Code who have been burned by AI drift. You've experienced the pain of a project falling apart at scale — duplicate types, abandoned stubs, broken interfaces, features nobody asked for. You don't need the concept of architectural coherence explained. You need a tool that prevents it from breaking.

ForgePlan scales to your project:
- **Simple projects** get a quick architecture confirmation, a fast build, and a basic quality sweep. Done in one session.
- **Medium projects** get full specs, sequential builds with reviews, and thorough multi-agent sweeps.
- **Complex projects** get the full pipeline — fine-grained nodes, 12 parallel sweep agents, cross-model verification by a different AI, and convergence certification.

The governance intensity matches the complexity. ForgePlan never disappears — it just compresses for simpler work.

## How It Works

```
1. DISCOVER   →  Describe your project (or import a planning document).
                  ForgePlan decomposes it into nodes with clear boundaries,
                  shared models, and a dependency graph. The Architect assesses
                  complexity and recommends a governance tier.

2. SPEC        →  Each node gets a detailed specification: acceptance criteria,
                  constraints, non-goals, failure modes, interface contracts.
                  The spec is the contract. Everything downstream enforces it.

3. BUILD       →  Build node by node. Every file write is enforced:
                  - File scope blocking (can't write outside your node)
                  - Shared model guard (import, don't redefine)
                  - Acceptance criteria verification before completion

4. VERIFY      →  Compilation, tests, and dev server verified automatically.
                  Code must actually run, not just look correct to an AI.

5. REVIEW      →  7-dimension spec-diff review. Per-criterion PASS/FAIL with
                  code evidence. Not vibes — specific findings tied to spec.

6. SWEEP       →  3-16 parallel agents (tier-aware) audit the codebase:
                  security, types, errors, database, APIs, imports, code quality,
                  tests, config, frontend UX, docs, cross-node integration.
                  Progressive convergence drops clean agents. Optional cross-model
                  verification by a different AI for independent review.
```

Or skip everything — one command from idea to certified app:

```bash
/forgeplan:greenfield "A URL shortener where users paste a link and get a short URL"
# Confirm the architecture once. Walk away. Come back to a certified, runnable codebase.
```

## What Gets Built

ForgePlan has been dogfooded on a real 7-node, 61+ file full-stack application (client portal with role-based access, file upload, and multiple frontend views). Results:

- **0 broken references** — shared models are canonical, file scopes prevent cross-contamination
- **0 duplicate types** — the enforcement hook physically blocks local type redefinitions
- **0 abandoned stubs** — the Stop hook won't let builds complete with unmet acceptance criteria
- **Clean change propagation** — added a field to User → 6 nodes automatically cascaded → 0 breakage
- **60 sweep findings caught** — including RLS policy gaps, stale test mocks, missing validation, code duplication
- **53 auto-fixed** — the remaining 7 required architectural decisions (presented to the user, not guessed)
- **Cross-model certified** — Codex (GPT-5.4) independently verified the codebase. 2 consecutive clean passes.

## What Gets Enforced

ForgePlan doesn't suggest — it blocks. Deterministically, before the code is written.

| Enforcement | How it works |
|-------------|-------------|
| **File scope** | Builder can only write to its node's directory. Writes to other nodes are physically rejected. |
| **Shared models** | Types defined in the manifest must be imported from the canonical source. Local redefinitions are blocked. |
| **Shell commands** | During builds, only read-only commands are allowed. File-writing shell commands are blocked to prevent enforcement bypass. |
| **Acceptance criteria** | The Stop hook evaluates every criterion before allowing a build to complete. Unmet criteria bounce the builder back. |
| **Non-goals** | Features explicitly out of scope are enforced. The builder is blocked from implementing them. |
| **Review boundaries** | Reviewers can only write reports. They cannot touch code. |
| **Revision boundaries** | Revisions can only modify specs and shared types. Code changes happen during rebuild. |

The enforcement is layered: fast deterministic checks first (instant, free), LLM spec compliance only when needed. 80%+ of enforcement is instant glob matching.

## Installation

ForgePlan is a Claude Code plugin:

1. Make sure you have [Claude Code](https://claude.ai/claude-code) installed
2. Add the ForgePlan marketplace in Claude Code settings
3. Enable the plugin — it loads automatically

```bash
claude
/forgeplan:help    # Verify it's working
```

No additional dependencies needed — the plugin includes everything.

## Quick Start

```bash
# Start from a template
/forgeplan:discover template:client-portal

# Or describe your own project
/forgeplan:discover I want to build a task management app with teams and permissions

# Full autonomous pipeline — walk away
/forgeplan:deep-build

# Or step by step with more control
/forgeplan:spec --all
/forgeplan:build database
/forgeplan:review database
/forgeplan:next
```

## Key Concepts

| Term | What it means |
|------|--------------|
| **Node** | A piece of your app — like the database, the login page, or the API. ForgePlan breaks your project into nodes so each piece gets built and tested independently. |
| **Spec** | The enforcement contract for a node: what it must do (acceptance criteria), what it must NOT do (non-goals), how to verify it (tests), and how it connects to other nodes (interfaces). |
| **Shared Model** | A data type used by multiple nodes (like "User" or "Document"). Defined once in the manifest, imported everywhere — never duplicated. |
| **Manifest** | The master architecture file. Lists every node, their dependencies, shared models, tech stack, and connections. |
| **Sweep** | An automated codebase audit by 3-16 agents (tier-aware): 12 domain agents + 4 team agents (Red adversarial, Orange contract-drift, Blue user-flows, Rainbow holistic). Progressive convergence drops clean agents between passes. |
| **Greenfield** | One command from description to certified app. Chains discover → research → spec → deep-build with a single confirmation. |
| **Research** | 4 parallel agents search npm, GitHub, and official docs for best packages, patterns, and license safety before building. |
| **Cross-Model Review** | A second AI (Codex, GPT, Gemini) independently reviews code that Claude built. Different models catch different blind spots. |
| **Deep-Build** | The fully autonomous pipeline: spec → build → verify → review → sweep → certify. Tier-aware — simple projects skip cross-model, complex ones require it. |
| **Convergence** | The process of alternating between AI models until both agree the code is clean. 2 consecutive clean passes = certified. |

## Commands

**Core workflow (start here):**

| Command | What it does |
|---------|-------------|
| `/forgeplan:greenfield` | **Start here.** Full pipeline: describe → discover → research → spec → build → certify. One confirmation, walk away. |
| `/forgeplan:discover` | Architecture discovery — guided conversation, document import, or template |
| `/forgeplan:research` | Search npm, GitHub, and docs for best practices (4 agents in parallel) |
| `/forgeplan:deep-build` | Full autonomous pipeline: build → verify → review → sweep → certify (tier-aware) |
| `/forgeplan:guide` | Where am I? Evaluates your project state and recommends the best next step |

**Manual control:**

| Command | What it does |
|---------|-------------|
| `/forgeplan:spec [node\|--all]` | Generate detailed node specifications |
| `/forgeplan:build [node]` | Build a node with full enforcement |
| `/forgeplan:review [node]` | 7-dimension spec-diff review with evidence |
| `/forgeplan:sweep [--cross-check]` | Tier-aware parallel sweep + optional cross-model verification |
| `/forgeplan:revise [node\|--model name]` | Change impact analysis + propagation |
| `/forgeplan:integrate` | Cross-node interface verification |
| `/forgeplan:next` | What to build next (dependency-aware) |

**Monitoring and utilities:**

| Command | What it does |
|---------|-------------|
| `/forgeplan:status` | Project overview with dependency graph |
| `/forgeplan:recover` | Fix crashed/stuck operations |
| `/forgeplan:configure` | Set up cross-model review (Codex/GPT/Gemini) |
| `/forgeplan:measure` | Code quality metrics |
| `/forgeplan:affected [model]` | Which nodes use a shared model |
| `/forgeplan:validate` | Check for cycles, orphans, consistency |
| `/forgeplan:regen-types` | Rebuild shared TypeScript types |
| `/forgeplan:help` | All commands |

## Blueprint Templates

Start from a proven architecture instead of a blank canvas:

- **Client Portal** — 7 nodes, document upload with role-based access (client vs accountant)
- **SaaS Starter** — 8 nodes, multi-tenant with Stripe billing
- **Internal Dashboard** — 6 nodes, operations monitoring and data management

## Cross-Model Review

Configure a second AI to independently verify your code. Different models catch different blind spots.

```bash
/forgeplan:configure    # Interactive setup wizard
```

Supports: OpenAI (Codex/GPT), Google Gemini, Anthropic — via MCP, CLI, or direct API.

## The `.forgeplan/` Directory

The `.forgeplan/` directory IS the product. It's portable — any tool that reads manifest + specs participates in the ecosystem.

```
.forgeplan/
├── manifest.yaml          # Architecture: nodes, shared models, tech stack, connections
├── config.yaml            # Cross-model review settings (optional)
├── state.json             # Build progress, active operations, sweep state
├── specs/                 # Per-node specifications (the enforcement contracts)
├── conversations/         # Design rationale and build logs
├── reviews/               # Structured review reports
├── sweeps/                # Sweep and cross-model verification reports
└── research/              # Package, pattern, and documentation research
```

## What's Under the Hood

| Component | Count | Purpose |
|-----------|-------|---------|
| Slash commands | 20 | User-facing operations (greenfield, research, discover, spec, build, review, sweep, deep-build, + 12 more) |
| Core agents | 3 | Architect (discovery), Builder (code gen), Reviewer (spec-diff audit) |
| Research agents | 4 | Researcher (npm/GitHub), License Checker, Inspiration (similar projects), Docs Agent |
| Domain sweep agents | 12 | Security, types, errors, DB, APIs, imports, code quality, tests, config, frontend UX, docs, cross-node integration |
| Team sweep agents | 4 | Red (adversarial), Orange (contract drift), Blue (user flows), Rainbow (holistic architecture) |
| Hook types | 6 | SessionStart, PreCompact, PostCompact, PreToolUse, PostToolUse, Stop |
| Scripts | 17 | Enforcement, validation, verification (Phase A + B), cross-model bridging, worktree management |

## The Moat

ForgePlan becomes *more* relevant as AI models get better, not less. Better models can leverage the governance infrastructure more effectively — smarter builders produce better first-pass code, smarter reviewers catch subtler issues, smarter architects create better specs. The governance system is a force multiplier, not a substitute for model capability.

The defensible elements:
- **The `.forgeplan/` format** — a portable architecture standard any tool can read
- **The enforcement hooks** — deterministic constraints external to any model
- **Cross-model verification** — different models catch different blind spots, structurally

What's NOT a moat: the specific agents, commands, or YAML schemas. Those are implementation details. The architecture-as-constraint principle is the product.

## Development

```bash
# Validate a manifest
node scripts/validate-manifest.js .forgeplan/manifest.yaml

# Validate a spec
node scripts/validate-spec.js .forgeplan/specs/auth.yaml .forgeplan/manifest.yaml

# Measure code quality
node scripts/measure-quality.js
```

## Project Structure

```
ForgeDev/                              # Repo root IS the plugin root
├── .claude-plugin/                    # Plugin + marketplace manifests
├── commands/                          # 20 slash commands
├── agents/                            # 3 core + 4 research + 16 sweep agents
├── hooks/hooks.json                   # 6 hooks: SessionStart, Pre/PostCompact, PreToolUse, PostToolUse, Stop
├── scripts/                           # 17 enforcement, verification, and utility scripts
├── skills/                            # Specification skill
├── templates/                         # Schemas, blueprints, project templates
├── Planning Documents/                # Product vision and execution plan
└── README.md                          # This file
```

---

*Architecture down, not code up. Define it right, enforce it always.*
