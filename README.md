# ForgePlan

**Architecture-governed AI development. Build software that stays coherent.**

ForgePlan is a Claude Code plugin that turns your architecture into an enforceable contract. Define your system as a node graph with specs, then build node by node — with every file write checked against your architecture, every build verified against acceptance criteria, and every change propagated to affected nodes.

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

4. REVIEW      →  7-dimension spec-diff review. Per-criterion PASS/FAIL with
                  code evidence. Optional cross-model verification via BYOK.

5. INTEGRATE   →  Cross-node interface verification. Identifies which side
                  is at fault when contracts don't match.

6. REVISE      →  Change a spec and the system identifies every affected node,
                  regenerates shared types, and guides remediation.
```

## Quick Start

```bash
# Start Claude Code with ForgePlan
claude --plugin-dir ./forgeplan-plugin

# Create a project from a template
/forgeplan:discover template:client-portal

# Generate specs for all nodes
/forgeplan:spec --all

# Build everything
/forgeplan:build --all

# Verify cross-node integration
/forgeplan:integrate
```

## What Gets Enforced

ForgePlan doesn't just suggest — it blocks bad writes deterministically:

- **File scope** — Builder can only write to its node's directory. Writes to other nodes are rejected.
- **Shared models** — Types defined in the manifest (User, Document, etc.) must be imported from the canonical source. Local redefinitions are blocked.
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
| `/forgeplan:revise [node\|--model name]` | Change impact analysis + propagation |
| `/forgeplan:next` | What to build next (dependency-aware) |
| `/forgeplan:status` | Project overview with dependency graph |
| `/forgeplan:integrate` | Cross-node interface verification |
| `/forgeplan:recover` | Fix crashed/stuck operations |

## Blueprint Templates

Start from a template instead of a blank canvas:

- **Client Portal** — 7 nodes, document upload with role-based access (client vs accountant)
- **SaaS Starter** — 8 nodes, multi-tenant with Stripe billing
- **Internal Dashboard** — 6 nodes, operations monitoring and data management

## Cross-Model Review (BYOK)

Configure a second LLM to independently review your code. Different models catch different blind spots.

```yaml
# .forgeplan/config.yaml
review:
  mode: "mcp"              # mcp | cli | api
  mcp_server: "codex"      # uses your existing Codex subscription

enforcement:
  mode: "strict"            # both reviews must pass
```

Supports: OpenAI, Google Gemini, Anthropic, and any CLI-based model.

## The `.forgeplan/` Directory

The `.forgeplan/` directory IS the product. It's portable — any tool that reads manifest + specs participates in the ecosystem.

```
.forgeplan/
├── manifest.yaml          # Architecture: nodes, shared models, connections
├── config.yaml            # BYOK keys, model preferences (optional)
├── state.json             # Build progress, active operations
├── specs/                 # Per-node specifications (the enforcement contracts)
├── conversations/         # Design rationale and build logs
├── reviews/               # Structured review reports
└── sweeps/                # Codebase sweep reports (coming in v0.6)
```

## What ForgePlan Proves

After dogfooding on real projects, ForgePlan-built codebases have:

- **Fewer broken references** — shared models are canonical, file scopes prevent cross-contamination
- **Fewer duplicate types** — the PreToolUse hook blocks local type redefinitions
- **Fewer abandoned stubs** — the Stop hook won't let builds complete with unmet acceptance criteria
- **Better change propagation** — revising a shared model identifies every affected node automatically

## Project Structure

```
ForgeDev/
├── forgeplan-plugin/              # The Claude Code plugin
│   ├── .claude-plugin/plugin.json
│   ├── commands/                  # 9 slash commands
│   ├── agents/                    # Architect, Builder, Reviewer
│   ├── hooks/hooks.json           # SessionStart, PreToolUse, PostToolUse, Stop
│   ├── scripts/                   # 14 enforcement and utility scripts
│   ├── skills/                    # Specification skill
│   └── templates/                 # Schemas, blueprints, project templates
├── Planning Documents/            # Product vision and execution plan
└── README.md                      # This file
```

## Development

```bash
# Run the plugin locally
claude --plugin-dir ./forgeplan-plugin

# Validate a manifest
node forgeplan-plugin/scripts/validate-manifest.js .forgeplan/manifest.yaml

# Validate a spec
node forgeplan-plugin/scripts/validate-spec.js .forgeplan/specs/auth.yaml .forgeplan/manifest.yaml

# Measure code quality
node forgeplan-plugin/scripts/measure-quality.js

# Find nodes affected by a shared model change
node forgeplan-plugin/scripts/find-affected-nodes.js User

# Regenerate shared types from manifest
node forgeplan-plugin/scripts/regenerate-shared-types.js
```

## Roadmap

- **v0.5** (current) — Full build→review→revise→integrate lifecycle with enforcement
- **v0.6** — Autonomous Iterative Sweep: 6 parallel sweep agents + cross-model alternating verification loop. `/forgeplan:sweep` and `/forgeplan:deep-build` commands.

## License

MIT

## Author

Craig Spergel
