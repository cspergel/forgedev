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
ForgeDev/                              # Repo root IS the plugin root
├── .claude-plugin/
│   ├── plugin.json                    # Plugin manifest
│   └── marketplace.json               # Marketplace definition
├── CLAUDE.md                          # This file — dev context
├── Planning Documents/                # Vision + execution plans
├── commands/                          # Slash commands (.md files)
├── agents/                            # architect, builder, reviewer, sweep-*
├── hooks/
│   └── hooks.json                     # PreToolUse, PostToolUse, Stop, SessionStart
├── scripts/                           # validate-manifest, cross-model-review, etc.
├── templates/                         # Blueprint templates, schema templates
│   ├── blueprints/                    # Client portal, SaaS starter, etc.
│   └── schemas/                       # Schema templates
├── skills/                            # Plugin skills
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

### Sprint 5: Dogfood and Ship (COMPLETE)
**Goal:** Prove the four things. Run the change propagation test. **DONE.**

Dogfood results on client portal (7 nodes, 61+ files):
- Quality metrics: 0 broken references, 0 duplicate types, 0 abandoned stubs
- Integration: 16 pass, 2 expected warnings, 0 failures
- Change propagation: Added phone to User → 6 nodes cascaded → 0 breakage
- All 49 acceptance criteria verified across 7 nodes
- 15 commands all working end-to-end

### Sprint 6: Autonomous Iterative Sweep (COMPLETE)
**Goal:** Cross-model alternating sweep with `/forgeplan:sweep` and `/forgeplan:deep-build`. **DONE.**

Original deliverables: sweep_state schema, "sweeping" status across all hooks/scripts, sweep agent definitions, /forgeplan:sweep (7-phase orchestration), /forgeplan:deep-build (6-phase autonomous pipeline), cross-model-bridge.js (MCP/CLI/API modes), sweep crash recovery, sweep-mode enforcement, Layer 2 sweeping bypass.

Sprint 6 hardening (same sprint, post-initial):
- 12 sweep agents (was 6): added code-quality, test-quality, config-environment, frontend-ux, documentation, cross-node-integration (opus)
- Progressive agent convergence: agents that return CLEAN twice are retired, cross-cutting agents re-run if any agent has findings
- Anti-oscillation guard: force-converge agents stuck for 3 passes
- /forgeplan:configure: automated cross-model setup wizard (Codex/Gemini MCP/CLI/API)
- Graceful fallback on cross-model failure (continues with Claude-only)
- Smart blocked-finding resolution: Category A (spec update, auto), B (shared extraction, auto), C (architecture decisions, persist and prompt)
- Blocked decisions persistence across sessions (state.json → session-start detection → resume)
- Plugin restructured for marketplace distribution (repo root = plugin root)
- SSH keys + Codex MCP end-to-end working
- Escape hatch for corrupted state.json deadlock
- Atomic state writes (write tmp, rename)
- False certification fix (bridge error no longer masks as "clean")
- 15+ adversarial analysis fixes (cycle detection, token budget, path normalization, etc.)
- Outside-project-path writes allowed (other plugins not blocked)
- Dogfooded on client-portal: 60 findings, 53 auto-fixed, cross-model certified

### Sprint 7: Ambient Mode — Proactive Guidance
**Goal:** ForgePlan becomes an ambient assistant — detects project state, proactively suggests next steps, scores findings by confidence, and manages state resiliently.

**Pillar 1: Ambient SessionStart**
- Enhance session-start.js to detect full project state (not just stuck builds)
- Show: node statuses, next recommended action, pending decisions, sweep progress
- Suggest commands contextually ("auth is built but not reviewed → /forgeplan:review auth")
- Non-blocking: fast checks sync, expensive analysis async

**Pillar 2: Confidence Scoring**
- Score each sweep finding 0-100 confidence based on code evidence strength
- Filter findings below 75 before presenting to fix cycle
- Reduces convergence from ~14 rounds to 3-4 by eliminating noise early
- Apply to cross-model findings too (external model hallucinations get filtered)

**Pillar 3: State Management Hardening**
- Dedicated `update-state.js` script for atomic JSON read-modify-write (replaces fragile Edit/Write on complex JSON)
- Support parallel fix agents with per-agent temp state files merged after completion
- Change `active_node` to support array (multiple concurrent node fixes)
- Session-end hook: persist session summary for cross-session context

**Pillar 4: Hierarchical Documentation**
- Refactor agents to < 300 lines each, point to detail docs
- Shared sweep-base template for repeated logic across 12 agents
- Progressive disclosure: agents load only what they need
- `docs/` directory for detailed patterns (architect, builder, reviewer, sweep orchestration)

**Pillar 5: Two-Stage Review**
- Stage 1: Spec compliance (does code match every AC, constraint, interface?)
- Stage 2: Code quality (bugs, error handling, test sufficiency)
- If Stage 1 fails, skip Stage 2 (save tokens, spec must pass first)

**Pillar 6: Guide Skill Enhancement**
- /forgeplan:guide reads full state + sweep reports + blocked decisions
- Explains what happened, what's next, and why
- Detects common patterns: "3 previous nodes had similar interfaces — here's what worked"

### Sprint 8: Research Agents and Autonomous Greenfield
**Goal:** Fully autonomous greenfield builds with research agents that search for best practices, vet dependencies, and recommend architecture before building.

**Pillar 1: Research Agents**
- `/forgeplan:research [topic]` dispatches agents to search GitHub, npm, documentation
- Check licenses (MIT/Apache/etc.), download counts, maintenance status
- Gather best practices for common patterns (auth, payments, file storage, etc.)
- Output: recommended dependencies, proven patterns, architecture constraints
- Research results feed into the Architect agent as constraints during /forgeplan:discover

**Pillar 2: Expanded Blueprints**
- Research-backed blueprint generation: "e-commerce" → Stripe + Resend + Drizzle + established patterns
- Community blueprints: users can contribute and share blueprints
- Blueprint versioning: track which versions of dependencies/patterns a blueprint uses

**Pillar 3: Autonomous Greenfield Pipeline**
- `/forgeplan:discover "project description"` → research → architect → spec all → deep-build → certified
- Full zero-to-deployed with one command
- Research agents run before architecture to inform node structure and dependencies
- Cross-model verification of the entire stack

**Pillar 4: Semantic Memory**
- Index past sweep reports, design decisions, rejected specs
- Surface cross-session patterns: "you've built similar nodes before, here's what worked"
- Episodic memory integration for project-local knowledge base
- Search: "nodes using OAuth that had security issues" → relevant findings from past sweeps

**Pillar 5: Preset Workflows**
- Pre-configured tool connections for popular products (Supabase, Stripe, Vercel, etc.)
- `/forgeplan:discover template:e-commerce` includes researched dependency stack
- Integration with MCP servers for live API validation during builds

**Pillar 6: Skill-Augmented Building**
- Builder agent detects node type (frontend, API, database, auth) and invokes relevant external skills
- Frontend nodes: invoke `frontend-design` skill for polished UI, layout decisions, design system choices
- User gets prompted for style/vibe preferences (or uses project-level defaults in config.yaml)
- API nodes: invoke API design patterns skill for RESTful conventions, pagination, error response formats
- Database nodes: invoke schema design skill for normalization, indexing strategy, migration patterns
- Skills run during the pre-build spec challenge phase — design decisions become spec constraints
- Extensible: users can register custom skills per node type in config.yaml
  ```yaml
  skills:
    frontend: frontend-design    # invoke this skill for frontend nodes
    api: api-patterns            # invoke for API nodes
    database: schema-design      # invoke for database nodes
  ```

## Commands

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
| `/forgeplan:sweep` | 6 | 12-agent parallel sweep + progressive convergence + cross-model verification |
| `/forgeplan:deep-build` | 6 | Full autonomous build→review→sweep→cross-check pipeline |
| `/forgeplan:configure` | 6 | Automated cross-model setup wizard (Codex/Gemini MCP/CLI/API) |
| `/forgeplan:research` | 8 | Research agents search for existing implementations, check licenses, gather docs |

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
