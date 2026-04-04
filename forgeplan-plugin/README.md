# ForgePlan Core

**Architecture-governed AI build harness for Claude Code.**

Define your architecture first, then build node by node with spec enforcement, cross-model review, and change propagation.

## What It Does

ForgePlan Core turns your architecture into an enforceable contract. Instead of letting AI code freely, every file write is checked against your node specs — file scope boundaries, shared model integrity, acceptance criteria, and non-goals are all enforced automatically.

## Quick Start

```bash
# Install the plugin
claude --plugin-dir ./forgeplan-plugin

# Start a new project
/forgeplan:discover

# Or use a template
/forgeplan:discover template:client-portal
```

## Commands

| Command | Description |
|---------|-------------|
| `/forgeplan:discover` | Guided architecture discovery → manifest + skeleton specs |
| `/forgeplan:spec [node\|--all]` | Generate detailed node specifications |
| `/forgeplan:build [node]` | Build a node with full enforcement |
| `/forgeplan:review [node]` | 7-dimension spec-diff review |
| `/forgeplan:revise [node]` | Change impact analysis + propagation |
| `/forgeplan:next` | Dependency-aware next recommendation |
| `/forgeplan:status` | Project status with dependency visualization |
| `/forgeplan:integrate` | Cross-node interface verification |
| `/forgeplan:recover` | Crash recovery for interrupted operations |

## How It Works

### 1. Discovery
Describe your project. The Architect agent decomposes it into nodes with clear boundaries, identifies shared models, and produces a validated manifest.

### 2. Specification
Each node gets a detailed spec with acceptance criteria, constraints, non-goals, failure modes, and interface contracts. The spec is the enforcement contract.

### 3. Build
The Builder agent generates code following the spec. Four layers of enforcement:
- **PreToolUse Layer 1** — deterministic file scope blocking, shared model guard
- **PreToolUse Layer 2** — LLM spec compliance, non-goals checking
- **PostToolUse** — file registration, conversation logging
- **Stop hook** — acceptance criteria verification before completion

### 4. Review
The Reviewer agent audits against seven dimensions with per-criterion PASS/FAIL and code evidence. No generic feedback — every finding references a spec element.

### 5. Integration
Cross-node interface verification identifies which side is at fault and recommends remediation.

## Enforcement

ForgePlan enforces boundaries deterministically:
- Files outside the active node's scope are **blocked**
- Shared model redefinitions are **blocked** (import from canonical source)
- Bash file writes during builds are **blocked** (use Write/Edit tools)
- Builds can't complete without acceptance criteria verified by the Stop hook
- Reviews can only write to `.forgeplan/reviews/` and `state.json`
- Revisions can only modify specs, manifest, and shared types

## Configuration

Copy `.forgeplan/config.yaml` from the template to enable cross-model review:

```yaml
review:
  mode: "mcp"           # mcp | cli | api | native
  mcp_server: "codex"   # for MCP mode

enforcement:
  mode: "advisory"       # strict | advisory
```

## Blueprint Templates

- **Client Portal** — 7 nodes, document upload with role-based access
- **SaaS Starter** — 8 nodes, multi-tenant with Stripe billing
- **Internal Dashboard** — 6 nodes, operations monitoring

## The `.forgeplan/` Directory

```
.forgeplan/
├── manifest.yaml          # Central command file
├── config.yaml            # BYOK and preferences (optional)
├── state.json             # Session state
├��─ specs/                 # Node specifications
├── conversations/         # Design rationale
│   └── nodes/             # Per-node build logs
├── reviews/               # Review reports
└── sweeps/                # Codebase sweep reports (Sprint 6)
```

## Requirements

- Claude Code CLI
- Node.js 18+

## License

MIT
