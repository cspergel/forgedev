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

**Project fit filter:** Does your app have 2+ components that pass the same data between them? If yes, ForgePlan. If no, just use Claude raw.

ForgePlan scales to your project:
- **Simple projects** get a quick architecture confirmation, a fast build, and a basic quality sweep. Done in one session.
- **Medium projects** get full specs, sequential builds with reviews, and thorough multi-agent sweeps.
- **Complex projects** get the full pipeline — fine-grained nodes, 5 parallel sweep agents (all opus), cross-model verification by a different AI, and convergence certification.

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

6. SWEEP       →  5 consolidated sweep agents (tier-aware, all opus) audit the
                  codebase from different angles: Adversary (security + errors),
                  Contractualist (types + APIs + contracts), Pathfinder (UX +
                  tests + user flows), Structuralist (architecture + simplicity),
                  Skeptic (spec compliance + gap finding). Progressive convergence
                  drops clean agents. Optional cross-model verification.
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
| **Shell commands** | During builds, only safe commands are allowed. Dangerous shell operations are blocked to prevent enforcement bypass. |
| **Acceptance criteria** | The Stop hook evaluates every criterion before allowing a build to complete. Unmet criteria bounce the builder back. |
| **Non-goals** | Features explicitly out of scope are enforced. The builder is blocked from implementing them. |
| **Review boundaries** | Reviewers can only write reports. They cannot touch code. |
| **Phase boundaries** | Nodes tagged for future phases cannot be built until the current phase is complete. |

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
# Full autonomous pipeline — describe and walk away
/forgeplan:greenfield I want to build a task management app with teams and permissions

# Or start from a template
/forgeplan:discover template:client-portal

# Or import a planning document from another AI
/forgeplan:discover --from "my-chatgpt-brainstorm.md"

# Step by step with more control
/forgeplan:discover I want to build a URL shortener
/forgeplan:spec --all
/forgeplan:build database
/forgeplan:review database
/forgeplan:next

# Not sure what to do? Ask the guide
/forgeplan:guide
```

## Key Concepts

| Term | What it means |
|------|--------------|
| **Node** | A piece of your app — like the database, the login page, or the API. ForgePlan breaks your project into nodes so each piece gets built and tested independently. |
| **Spec** | The enforcement contract for a node: what it must do (acceptance criteria), what it must NOT do (non-goals), how to verify it (tests), and how it connects to other nodes (interfaces). |
| **Shared Model** | A data type used by multiple nodes (like "User" or "Document"). Defined once in the manifest, imported everywhere — never duplicated. |
| **Manifest** | The master architecture file. Lists every node, their dependencies, shared models, tech stack, and connections. The manifest is the spine — everything validates against it. |
| **Sweep** | An automated codebase audit by 5 consolidated agents (tier-aware, all opus): Adversary, Contractualist, Pathfinder, Structuralist, Skeptic. Progressive convergence drops clean agents between passes. |
| **Greenfield** | One command from description to certified app. Chains discover → research → spec → deep-build with a single confirmation. |
| **Research** | The Researcher agent searches npm, GitHub, and official docs for best packages, patterns, license safety, and reference implementations before building. |
| **Cross-Model Review** | A second AI (Codex, GPT, Gemini) independently reviews code that Claude built. Different models catch different blind spots. |
| **Deep-Build** | The fully autonomous pipeline: spec → build → verify → review → sweep → certify. Tier-aware — simple projects skip cross-model, complex ones require it. |
| **Wiki** | A compiled knowledge base (`.forgeplan/wiki/`) that grows with each build and sweep. Agents read the wiki for context instead of re-reading all source files — reduces token usage dramatically. |
| **Phase** | A build stage for large projects. Phase 1 builds foundation nodes, Phase 2 builds on top, etc. Interface contracts are defined upfront even for nodes built in later phases. |

## Commands

**Start here:**

| Command | What it does |
|---------|-------------|
| `/forgeplan:greenfield` | Full pipeline: describe → discover → research → spec → build → certify. One confirmation, walk away. |
| `/forgeplan:guide` | Where am I? Evaluates your project state and recommends the best next step. |
| `/forgeplan:help` | All available commands. |

**Build workflow:**

| Command | What it does |
|---------|-------------|
| `/forgeplan:discover` | Architecture discovery — guided conversation, document import, or template |
| `/forgeplan:research [topic]` | Search npm, GitHub, and docs for packages, licenses, patterns, and reference implementations |
| `/forgeplan:spec [node\|--all]` | Generate detailed node specifications |
| `/forgeplan:build [node\|--all]` | Build a node with full enforcement |
| `/forgeplan:review [node\|--all]` | 7-dimension spec-diff review with evidence |
| `/forgeplan:sweep [--cross-check]` | 3-5 agent sweep (tier-aware) + optional cross-model verification |
| `/forgeplan:deep-build` | Full autonomous pipeline: build → verify → review → sweep → certify |

**Project management:**

| Command | What it does |
|---------|-------------|
| `/forgeplan:status` | Project overview with dependency graph and phase progress |
| `/forgeplan:next` | What to build next (dependency-aware) |
| `/forgeplan:revise [node\|--model name]` | Change impact analysis + propagation |
| `/forgeplan:integrate` | Cross-node interface verification |
| `/forgeplan:split [node]` | Decompose a node into finer-grained nodes |
| `/forgeplan:recover` | Fix crashed/stuck operations, reset wiki failures |
| `/forgeplan:configure` | Set up cross-model review (Codex/GPT/Gemini) |
| `/forgeplan:measure` | Code quality metrics |
| `/forgeplan:affected [model]` | Which nodes use a shared model |
| `/forgeplan:validate` | Check for cycles, orphans, consistency |
| `/forgeplan:regen-types` | Rebuild shared TypeScript types |

## The Five Sweep Agents

Each agent brings a different lens to code review. All opus model for maximum depth.

| Agent | Stance | What it catches |
|-------|--------|----------------|
| **Adversary** | "Break it" | Security bypasses, injection vectors, false-pass conditions, error handling gaps, database vulnerabilities, config drift |
| **Contractualist** | "Diff it" | Type mismatches, API contract violations, import chain issues, cross-node data shape drift, stale references |
| **Pathfinder** | "Walk it" | Broken user flows, dead-end error states, accessibility gaps, test quality issues, missing negative tests |
| **Structuralist** | "Zoom out" | Over-engineering, architectural incoherence, dead code, inconsistent patterns, documentation drift, simplicity violations |
| **Skeptic** | "Prove it" | Missing spec implementations, logic bugs, copy-paste errors, cross-agent blind spots, unreachable code |

Tier-aware dispatch: SMALL = 3 agents, MEDIUM = 4, LARGE = 5. Progressive convergence drops clean agents between passes.

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
├── manifest.yaml          # Architecture: nodes, shared models, tech stack, connections, phases
├── config.yaml            # Cross-model review settings, skill configuration (optional)
├── state.json             # Build progress, active operations, sweep state
├── specs/                 # Per-node specifications (the enforcement contracts)
├── wiki/                  # Compiled knowledge base (semantic memory)
│   ├── nodes/             # Per-node knowledge pages
│   ├── rules.md           # Inferred conventions from specs + code
│   └── decisions.md       # Architectural decision log
├── conversations/         # Design rationale and build logs
├── reviews/               # Structured review reports
├── sweeps/                # Sweep and cross-model verification reports
└── research/              # Package, pattern, and documentation research
```

## What's Under the Hood

| Component | Count | Purpose |
|-----------|-------|---------|
| Slash commands | 21 | User-facing operations (greenfield, discover, research, spec, build, review, sweep, deep-build, split, + 12 more) |
| Core agents | 3 | Architect (discovery + decomposition), Builder (code gen), Reviewer (spec-diff audit) |
| Research agent | 1 | Consolidated Researcher (packages + licenses + patterns + reference projects + API docs) |
| Sweep agents | 5 | Adversary, Contractualist, Pathfinder, Structuralist, Skeptic (all opus, consolidated from 16) |
| Hook types | 6 | SessionStart, PreCompact, PostCompact, PreToolUse, PostToolUse, Stop |
| Scripts | 20+ | Enforcement, validation, verification (Phase A + B), wiki compilation, cross-model bridging, worktree management, state utilities |

## The Moat

ForgePlan becomes *more* relevant as AI models get better, not less. Better models can leverage the governance infrastructure more effectively — smarter builders produce better first-pass code, smarter reviewers catch subtler issues, smarter architects create better specs. The governance system is a force multiplier, not a substitute for model capability.

The defensible elements:
- **The `.forgeplan/` format** — a portable architecture standard any tool can read
- **The enforcement hooks** — deterministic constraints external to any model
- **The semantic memory** — compiled knowledge that makes every build smarter than the last
- **Cross-model verification** — different models catch different blind spots, structurally

What's NOT a moat: the specific agents, commands, or YAML schemas. Those are implementation details. The architecture-as-constraint principle is the product.

## Roadmap

| Sprint | Focus | Status |
|--------|-------|--------|
| 1-6 | Foundation → Build → Review → Sweep → Deep-Build | Done |
| 7A | Complexity calibration (SMALL/MEDIUM/LARGE tiers) | Done |
| 7B | Ambient mode, confidence scoring, document import | Done |
| 8 | Research agents, greenfield pipeline, runtime verification | Done |
| 9 | Semantic memory (wiki), node splitting, state hardening | Done |
| 10 | Design pipeline, production agents, repo ingestion, phased builds | In Progress |
| 11 | Skills for all agents, blueprints, anti-slop design quality | Designed |
| 12 | MCP integrations, live API validation during builds | Designed |
| 13 | Dogfood: build SMALL + MEDIUM apps end-to-end | Planned |
| 14 | Bug fixes + refinement from dogfood | Planned |
| 15 | Standalone app: visual canvas, node graph, live preview | Planned |

## Development

```bash
# Validate a manifest
node scripts/validate-manifest.js .forgeplan/manifest.yaml

# Validate a spec
node scripts/validate-spec.js .forgeplan/specs/auth.yaml .forgeplan/manifest.yaml

# Compile the wiki
node scripts/compile-wiki.js

# Measure code quality
node scripts/measure-quality.js
```

## Project Structure

```
ForgeDev/                              # Repo root IS the plugin root
├── .claude-plugin/                    # Plugin + marketplace manifests
├── commands/                          # 21 slash commands
├── agents/                            # 3 core + 1 research + 5 sweep agents
│   └── archived/                      # 18 legacy agents (pre-consolidation)
├── hooks/hooks.json                   # 6 hooks: SessionStart, Pre/PostCompact, PreToolUse, PostToolUse, Stop
├── scripts/                           # 20+ enforcement, verification, and utility scripts
│   └── lib/                           # Shared utilities (atomic-write, wiki-builder, constants)
├── skills/                            # Agent skills (SKILL.md format)
├── templates/                         # Schemas, blueprints, project templates
├── docs/plans/                        # Sprint designs, implementation plans, roadmap
├── Planning Documents/                # Product vision and execution plan
└── README.md                          # This file
```

---

*Architecture down, not code up. Define it right, enforce it always.*
