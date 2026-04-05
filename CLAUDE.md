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

### Sprint 7: Complexity Calibration + Ambient Mode
**Goal:** Scale the process to the project. Make ForgePlan usable for small projects (not just enterprise). Add ambient guidance and confidence scoring.

**Pillar 1: Complexity Calibration (P0 — from dogfood feedback)**
- **The problem:** Full governance on a 3-page app took 10 hours. A single Claude prompt would take 30 minutes. ForgePlan must know when to get out of the way.
- First implementation task: add `complexity_tier` field to manifest schema. Everything reads from it.
- **Complexity is not just size — it's multi-dimensional.** The Architect assesses during discovery based on judgment across these dimensions:

  **Technical complexity:**
  - Auth: none → basic login → OAuth/SSO → multi-tenant with RBAC
  - Data: flat CRUD → relational with joins → real-time sync → event sourcing
  - Integrations: none → 1-2 APIs → payment/billing → multi-provider orchestration
  - Infrastructure: static site → single server → microservices → distributed

  **Domain complexity:**
  - Business rules: simple CRUD → validation logic → state machines → regulatory compliance
  - User flows: linear → branching → concurrent → collaborative real-time
  - Data sensitivity: public → user data → PII/financial → healthcare/legal

  **Scale complexity:**
  - Users: personal tool → small team → multi-tenant → enterprise/public
  - Data volume: trivial → needs indexing → needs caching → needs sharding

  **Team complexity:**
  - Solo dev → small team → multiple teams → cross-org

- **The tier is the Architect's judgment call, not a formula.** A 3-entity project with HIPAA compliance and payment processing is LARGE. A 20-entity CRUD admin panel is MEDIUM. Entity count is a signal, not the answer.
- After assessment, the Architect presents its reasoning: "I'd rate this MEDIUM because: simple auth but complex data relationships and one payment integration. The payment flow needs its own node with strict enforcement. Agree?"
- User can always override.

- **What each tier means for the pipeline:**
  ```
  SMALL (simple CRUD, basic/no auth, no third-party integrations):
    Governance: lite — still architecture-down, just compressed.
    → Quick walkthrough: "Here's what I understood. Correct?" (one confirmation)
    → 1-2 coarse nodes (one broad-scope node with file_scope: "src/**")
    → Full-quality specs (ACs, non-goals, tests) but quick conversation —
      Architect drafts, user confirms, no multi-turn refinement
    → Single-pass build — builder generates all code in one session,
      including scaffolding
    → One sweep agent (code-quality) — catches the obvious stuff
    → No cross-model unless requested
    → Output: working, runnable app in one session

  MEDIUM (auth flows, 1-2 integrations, business rules, role-based access):
    Governance: full specs, moderate process.
    → Section-level walkthrough (scope, non-goals, models, nodes)
    → 3-5 nodes with sensible boundaries
    → Full spec conversation per node — detailed ACs, tests, failure modes
    → Sequential build with review after each
    → 6-8 sweep agents (skip documentation, frontend-ux if no frontend)
    → Cross-model optional
    → Output: well-structured app with enforcement

  LARGE (multi-tenant, payments, state machines, compliance, multi-team):
    Governance: full pipeline — this is what ForgePlan was designed for.
    → Per-feature walkthrough during discovery
    → Fine-grained nodes with strict boundaries
    → Full spec conversation with pre-build spec challenge
    → 12 sweep agents, progressive convergence
    → Cross-model verification (Codex/GPT/Gemini)
    → Deep-build with convergence certification
    → Output: certified, sweep-verified codebase
  ```

  **Key principle:** Spec quality is the same at every tier. What scales is node granularity, verification intensity, and walkthrough depth. The architecture-down approach never disappears — it just gets compressed for simpler projects.
- **Architect agent update (CRITICAL):** Replace absolute decomposition rules ("NEVER collapse auth/API/database") with tier-conditional rules. SMALL tier explicitly allows and encourages coarse nodes. LARGE tier keeps current rules. Test against all three tiers.
- **Deep-build adapts to tier:** SMALL = single-pass build, lightweight audit, no cross-model. MEDIUM = current pipeline with fewer agents. LARGE = full pipeline.

**Tier-independent improvements (also P0):**
- **Deduplication before presentation:** Semantic dedup in sweep Phase 3, not just file+line matching. Target: < 20% duplication rate (was 62%).
- **Test co-update during rebuild:** Builder MUST update corresponding test files when modifying source. Don't create problems for the sweep to find.
- **"Make it runnable" gate:** After all nodes built, verify `npm run dev` works. If not, fix before proceeding to review/sweep.

**Pillar 2: Ambient SessionStart (P0)**
- Enhance session-start.js to detect full project state (not just stuck builds)
- For healthy projects: show one-line status summary + suggested next command
- Show: node statuses, next recommended action, pending decisions, sweep progress
- Suggest commands contextually ("auth is built but not reviewed → /forgeplan:review auth")
- Non-blocking: fast checks sync, expensive analysis async

**Pillar 3: Confidence Scoring (P0)**
- Each sweep finding must include `confidence: 0-100` based on code evidence strength
- Filter findings below 75 before entering fix cycle
- Calibration guidance in each agent: what makes a finding 50 vs 90
- Reduces convergence from ~14 rounds to 3-4 by eliminating noise early
- Cross-model findings scored by Claude after receipt (external model doesn't know the system)

**Pillar 4: Conversational Discovery & Document Import (P1 — stretch goal)**
- Three onboarding paths: greenfield conversation (Path A), document import (Path B), template (Path C)
- `--from` argument for importing markdown, text, PDF files
- Chat exports treated as plain text (best effort — formats change too often)
- Walkthrough granularity is tier-dependent (SMALL = one confirmation, LARGE = per-feature)
- For autonomous deep-build: walkthrough replaced by automatic validation (proceed if no ambiguities, halt if unclear)
- Philosophy: **architecture down, not code up.**

**Deferred to later sprints (P2):**
- State Management Hardening (update-state.js, parallel agents, active_node as array) → Sprint 9
- Hierarchical Documentation (agent refactoring to < 300 lines) → anytime, maintenance task
- Two-Stage Review (spec compliance then code quality) → Sprint 9
- Guide Skill Enhancement (pattern detection from past sweeps) → Sprint 9

**Files that need changes (~20 for P0 pillars):**
- `templates/schemas/manifest-schema.yaml` — add `complexity_tier` field
- `templates/schemas/config-schema.yaml` — add `tier_override` option
- `agents/architect.md` — tier-conditional decomposition rules (CRITICAL)
- `commands/discover.md` — complexity assessment, tier-aware node recommendations
- `commands/spec.md` — SMALL-tier auto-generate branch
- `commands/build.md` — SMALL-tier single-pass mode
- `commands/sweep.md` — tier-aware agent selection (3-4 / 6-8 / 12)
- `commands/deep-build.md` — tier-aware pipeline (skip cross-model for SMALL)
- `agents/builder.md` — tier-awareness, test co-updates
- `agents/reviewer.md` — tier-aware abbreviated review for SMALL
- `agents/sweep-*.md` (12 files) — add confidence score output
- `scripts/session-start.js` — full state detection, status summary
- `scripts/validate-manifest.js` — validate complexity_tier field
- `templates/schemas/state-schema.json` — add confidence to finding schema

### Sprint 8: Research Agents + Greenfield Pipeline
**Goal:** Research agents search for best practices before building. Greenfield deep-build from discovery to certified. (Per Execution Plan scope — focused, not inflated.)

**Pillar 1: Research Agents**
- `/forgeplan:research [topic]` dispatches 4 agent types: Researcher (GitHub/npm search), License Checker, Inspiration (find similar projects), Docs Agent (gather API documentation)
- Check licenses (MIT/Apache/etc.), download counts, maintenance status
- Gather best practices for common patterns (auth, payments, file storage, etc.)
- Output: recommended dependencies, proven patterns, architecture constraints
- Results stored in `.forgeplan/research/` and fed into Architect during discovery

**Pillar 2: Autonomous Greenfield Pipeline**
- Any discovery path feeds into: discover → research → spec all → deep-build → certified
- `--with-research` flag on deep-build inserts research between discovery and spec
- Full zero-to-deployed: describe what you want, walk away
- Complexity tier determines how much governance the pipeline applies
- Exit criteria: working app with passing integration check and sweep certification

### Sprint 9: Semantic Memory + Polish
**Goal:** Compiled knowledge base reduces token usage. Polish from Sprint 7 deferred items.

**Pillar 1: Semantic Memory (Karpathy Wiki Pattern)**
- `.forgeplan/wiki/` with per-node knowledge pages updated by each sweep pass
- Three layers: raw sources (specs, code) → wiki (compiled knowledge) → schema (rules)
- Agents read wiki first (cheap), drill into source only to verify
- Cross-cutting pages: patterns.md, decisions.md, log.md
- Cross-session pattern surfacing: "similar nodes had these issues before"

**Pillar 2: State Management Hardening**
- `update-state.js` for atomic read-modify-write
- Parallel fix agents with per-agent temp state
- Session-end hook for cross-session context

**Pillar 3: Two-Stage Review**
- Stage 1: Spec compliance. Stage 2: Code quality. Skip Stage 2 if Stage 1 fails.

### Sprint 10: Skills + Blueprints
**Goal:** Builder invokes external skills. Blueprints backed by research.

- Skill-augmented building: builder detects node type, invokes `frontend-design`, API patterns, schema design skills
- Configurable per-project: `skills:` section in config.yaml
- Research-backed blueprint generation with vetted dependency stacks
- Community blueprints with versioning

### Sprint 11: Preset Workflows + MCP Integrations
**Goal:** Pre-configured connections to popular products.

- MCP server connections for Supabase, Stripe, Vercel, etc.
- Live API validation during builds
- Integration templates for popular stacks

### Standalone App: Visual Features (Post-Plugin)
**Goal:** Phantom previews and node visualization require a visual canvas — deferred to the standalone ForgePlan Workstation per Execution Plan.

- **Phantom Previews:** Component renders for frontend, endpoint maps for API, schema diagrams for database. User watches app take shape during deep-build.
- **Node Visualization:** Interactive dependency graph colored by status. Click nodes for details. Real-time updates during deep-build. Requires Tauri + React Flow + Monaco (per Execution Plan).
- These are desktop/web app features, not CLI plugin features.

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
| `/forgeplan:guide` | 6 | Evaluates project state, recommends best next step with explanations |
| `/forgeplan:help` | 4 | All available commands |
| `/forgeplan:affected` | 4 | Which nodes use a shared model — impact analysis |
| `/forgeplan:measure` | 5 | Code quality metrics (broken refs, stubs, duplicates) |
| `/forgeplan:regen-types` | 4 | Rebuild shared TypeScript types from manifest |
| `/forgeplan:validate` | 4 | Check manifest/specs for cycles, orphans, consistency |
| `/forgeplan:research` | 8 | Research agents search for existing implementations, check licenses, gather docs |

## Core Agents

| Agent | Role | Key Behaviors |
|-------|------|--------------|
| Architect | Discovery, manifest creation | Anti-collapse enforcement, shared model identification, text summaries |
| Builder | Node code generation | Pre-build spec challenge, anchor comments, constraint directive |
| Reviewer | Spec-diff audit | 7 audit dimensions, per-criterion PASS/FAIL, code evidence |

### 12 Sweep Agents (dispatched in parallel by `/forgeplan:sweep`)

| Agent | Model | Domain |
|-------|-------|--------|
| sweep-auth-security | opus | Auth, authz, sessions, input validation |
| sweep-type-consistency | sonnet | Types, shared models, interface drift |
| sweep-error-handling | sonnet | Try/catch, promises, error responses |
| sweep-database | sonnet | Queries, migrations, connections |
| sweep-api-contracts | sonnet | Endpoints, routes, request/response |
| sweep-imports | sonnet | Import chains, circular deps |
| sweep-code-quality | sonnet | Readability, performance, dead code, duplication |
| sweep-test-quality | sonnet | Assertion quality, coverage gaps, flaky tests |
| sweep-config-environment | sonnet | Env vars, config drift, secrets |
| sweep-frontend-ux | sonnet | Accessibility, loading/error/empty states |
| sweep-documentation | sonnet | README/JSDoc/API doc accuracy |
| sweep-cross-node-integration | opus | Data flow across boundaries, field mismatches |

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
