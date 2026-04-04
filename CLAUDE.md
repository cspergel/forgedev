# ForgePlan Core — Development Context

## What This Project Is

ForgePlan Core is a Claude Code plugin that serves as an architecture-governed AI build harness. The `.forgeplan/` directory is the product. Claude Code is the first interface. The plugin is how developers interact with it.

## Canonical Reference Documents

**ALWAYS reference these before making architectural decisions:**
- `Planning Documents/ForgePlan_Core_Execution_Plan.md` — The build plan. Sprint-by-sprint deliverables, schemas, enforcement model, agent specs.
- `Planning Documents/ForgePlan_Concept_v4.1.md` — The vision document. Long-term product direction (Sections 1-16, 18-23). Section 17 is superseded by the Execution Plan.

**The Execution Plan is the authority for implementation details.** The Concept Doc is the authority for product vision.

## Project Structure

```
ForgeDev/
├── CLAUDE.md                          # This file — dev context
├── Planning Documents/                # Vision + execution plans
├── forgeplan-plugin/                  # The Claude Code plugin (the product)
│   ├── .claude-plugin/
│   │   └── plugin.json               # Plugin manifest
│   ├── commands/                      # 9 slash commands (.md files)
│   ├── agents/                        # 3 agents: architect, builder, reviewer
│   ├── hooks/
│   │   └── hooks.json                # PreToolUse, PostToolUse, Stop, SessionStart
│   ├── scripts/                       # validate-manifest, cross-model-review, etc.
│   ├── templates/                     # Blueprint templates, schema templates
│   │   ├── blueprints/               # Client portal, SaaS starter, etc.
│   │   └── schemas/                  # Schema templates
│   │       ├── manifest-schema.yaml  # Manifest YAML template
│   │       ├── node-spec-schema.yaml # Node spec YAML template
│   │       └── state-schema.json     # state.json template
│   └── README.md
└── docs/
    └── plans/                         # Implementation plans
```

## Sprint Status

### Sprint 1: Foundation (COMPLETE)
**Goal:** User can run `/forgeplan:discover` and produce a validated manifest with shared models. **DONE.**

### Sprint 2: Build Harness (COMPLETE)
**Goal:** A user can spec and build a single node with hook enforcement. **DONE.**

Hardened through 14 cross-model review rounds (Claude + Codex). Key hardening:
- Fail-closed enforcement (corrupted state/manifest blocks operations)
- Whitelist-based Bash gate (blocks all non-read commands during active operations)
- Per-operation write boundaries (build, review, revise each have distinct allowed paths)
- Pre-build file snapshot for safe reset classification
- Spec validator with manifest cross-checking and strict field shapes
- Revision→rebuild pipeline wired into /forgeplan:next

### Sprint 3: Review and Recovery (COMPLETE)
**Goal:** The build-review loop works end to end. Crashes are recoverable. **DONE.**

Most deliverables were implemented during Sprint 1/2 hardening (review, revise, recover, session-start, conversation logging). Sprint 3 added the Stop hook — the last enforcement gate. All 7 deliverables verified against plan.

### Sprint 4: Integration and BYOK (COMPLETE)
**Goal:** Multi-node projects complete the full lifecycle. Cross-model review works. **DONE.**

Deliverables: cross-model-review.js (MCP/CLI/API modes, 3 providers, env var resolution, fetch-based), BYOK config with strict/advisory modes, integrate-check.js with fault-side ID, status-report.js with dependency graph, SaaS starter + internal dashboard blueprints, README.

### Sprint 5: Dogfood and Ship (NEXT)
### Sprint 6: Autonomous Iterative Sweep

## Eleven Commands

| Command | Sprint | Description |
|---------|--------|-------------|
| `/forgeplan:discover` | 1 | Guided conversation → manifest + skeleton specs |
| `/forgeplan:spec` | 2 | Generate detailed node spec |
| `/forgeplan:build` | 2 | Build a node with enforcement |
| `/forgeplan:review` | 3 | Audit node against spec |
| `/forgeplan:revise` | 3 | Reopen and change a node |
| `/forgeplan:next` | 2 | Dependency-aware next recommendation |
| `/forgeplan:status` | 4 | Full project status visualization |
| `/forgeplan:integrate` | 4 | Cross-node interface verification |
| `/forgeplan:recover` | 3 | Crash recovery |
| `/forgeplan:sweep` | 6 | Parallel codebase sweep + cross-model verification |
| `/forgeplan:deep-build` | 6 | Full autonomous build→review→sweep→cross-check pipeline |

## Three Agents

| Agent | Role | Key Behaviors |
|-------|------|--------------|
| Architect | Discovery, manifest creation | Anti-collapse enforcement, shared model identification, text summaries |
| Builder | Node code generation | Pre-build spec challenge, anchor comments, constraint directive |
| Reviewer | Spec-diff audit | 7 audit dimensions, per-criterion PASS/FAIL, code evidence |

## Four Hook Types

| Hook | Type | Purpose |
|------|------|---------|
| PreToolUse | command | Layer 1: deterministic file scope + shared model guard. Layer 2: LLM spec compliance |
| PostToolUse | command | Auto-register files, log changes |
| Stop | prompt/agent | Evaluate acceptance criteria, bounce counter |
| SessionStart | command | Detect crashed/stuck builds |

## Key Design Decisions

- **Node spec is the most important artifact.** Everything downstream depends on spec quality.
- **Layered enforcement:** Fast deterministic checks first, LLM only when needed. 80%+ of enforcement is instant glob matching.
- **Shared models are canonical.** Any entity referenced by 2+ nodes must be a shared model in the manifest, never defined locally.
- **Spec-diff review, not vibes.** Every review finding must reference a specific spec element and cite specific code evidence.
- **The `.forgeplan/` directory is the product.** The plugin is one interface to it. The standalone app is another.
- **Anchor comments** (`// @forgeplan-node: [id]`, `// @forgeplan-spec: [criterion-id]`) tie code to architecture.

## The Canonical Demo: Client Portal

Every example uses this project:
- **7 nodes:** database, auth, api, file-storage, frontend-login, frontend-dashboard, frontend-accountant-view
- **2 shared models:** User (client vs accountant roles), Document (upload lifecycle)
- Auth: email/password + Google OAuth, role-based access
- File handling: upload, storage, retrieval with encryption
- Multiple frontend views per role

## Platform Notes

- Development on Windows 11, use Unix shell syntax in bash
- Plugin must be cross-platform (scripts should use Node.js, not bash-only)
- validate-manifest should be .js not .sh for Windows compatibility
