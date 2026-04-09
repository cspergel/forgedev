# ForgePlan Core — Development Context

## Methodology

**Architecture-down, sprint-forward, governance-continuous.**

ForgePlan Core is a Claude Code plugin that serves as an architecture-governed AI build harness. The `.forgeplan/` directory is the product. Claude Code is the first interface. The plugin is how developers interact with it.

## Canonical Reference Documents

**ALWAYS reference these before making architectural decisions:**
- `Planning Documents/ForgePlan_Core_Execution_Plan.md` — Sprint-by-sprint deliverables, schemas, enforcement model, agent specs.
- `Planning Documents/ForgePlan_Concept_v4.1.md` — Long-term product vision (Sections 1-16, 18-23). Section 17 superseded by Execution Plan.

**The Execution Plan is the authority for Sprints 1-6.** For Sprint 7+, **this CLAUDE.md is the living authority** — it reflects dogfood feedback, code reviews, and product decisions made during development. The Concept Doc is the authority for product vision.

## Project Structure

```
ForgeDev/                              # Repo root IS the plugin root
├── .claude-plugin/
│   ├── plugin.json                    # Plugin manifest
│   └── marketplace.json               # Marketplace definition
├── CLAUDE.md                          # This file — dev context
├── Planning Documents/                # Vision + execution plans
├── commands/                          # Slash commands (.md files)
├── agents/                            # architect, builder, reviewer, sweep-*, review-*
├── hooks/
│   └── hooks.json                     # SessionStart, PreCompact, PostCompact, PreToolUse, PostToolUse, Stop
├── scripts/                           # validate-manifest, cross-model-review, etc.
├── templates/                         # Blueprint templates, schema templates
│   ├── blueprints/                    # Client portal, SaaS starter, etc.
│   └── schemas/                       # Schema templates
├── skills/                            # Plugin skills
└── docs/
    ├── plans/                         # Implementation plans
    └── reference/                     # Edge cases, implementation notes
```

## Complexity Tiers

The Architect assesses complexity during discovery based on multi-dimensional judgment across technical complexity (auth, data, integrations, infrastructure), domain complexity (business rules, user flows, data sensitivity), and scale complexity (users, data volume). **The tier is the Architect's judgment call, not a formula.** A 3-entity project with HIPAA compliance and payments is LARGE. A 20-entity CRUD admin panel is MEDIUM. Not all dimensions apply to every project type — score only what's relevant.

After assessment, the Architect presents reasoning AND pipeline consequences. User can always override via `tier_override` in config.yaml.

```
SMALL (simple CRUD, basic/no auth, no third-party integrations):
  → Quick walkthrough: one confirmation
  → 1-2 coarse nodes (broad file_scope like src/**)
  → Full-quality specs but quick conversation — Architect drafts, user confirms
  → Single-pass build — builder generates all code in one session
  → 3 sweep agents: Adversary + Contractualist + Skeptic
  → 3 review agents: Adversary + Skeptic + Structuralist
  → No cross-model unless requested
  → Greenfield: skips Stage 1 Interviewer (description IS the design)
  → Output: working, runnable app in one session

MEDIUM (auth flows, 1-2 integrations, business rules, role-based access):
  → Section-level walkthrough (scope, non-goals, models, nodes)
  → 3-5 nodes with sensible boundaries
  → Full spec conversation per node — detailed ACs, tests, failure modes
  → Sequential build with review after each
  → 4 sweep agents: + Pathfinder
  → 4 review agents: + Contractualist
  → Cross-model optional
  → Output: well-structured app with enforcement

LARGE (multi-tenant, payments, state machines, compliance, multi-team):
  → Per-feature walkthrough during discovery
  → Fine-grained nodes with strict boundaries
  → Full spec conversation with pre-build spec challenge
  → 5 sweep agents (all opus), progressive convergence
  → 5 review agents (all opus)
  → Cross-model verification required
  → Deep-build with convergence certification
  → Output: certified, sweep-verified codebase
```

**Key principle:** Spec quality is the same at every tier. What scales is node granularity, verification intensity, and walkthrough depth. The architecture-down approach never disappears — it just gets compressed for simpler projects.

**Tier upgrade/downgrade:** If the project changes mid-build (user adds OAuth, payments), `/forgeplan:revise` prompts: "This changes complexity. Current tier: SMALL. Reassess?"

## Sprint Status

### Sprints 1-3: Foundation, Build Harness, Recovery (COMPLETE)
Manifest validation, shared models, spec-diff review, hook enforcement (fail-closed, whitelist Bash, per-operation write boundaries, pre-build file snapshots), crash recovery, Stop hook bounce gate, conversation logging.

### Sprint 4: Integration and BYOK (COMPLETE)
Cross-model review (MCP/CLI/API, 3 providers), BYOK config (strict/advisory), integrate-check with fault-side ID, status-report with dependency graph, SaaS starter + internal dashboard blueprints.

### Sprint 5: Dogfood and Ship (COMPLETE)
Client portal dogfood (7 nodes, 61+ files): 0 broken refs, 0 duplicate types, 16/16 integration passes, phone→User change propagated through 6 nodes with 0 breakage. All 49 ACs verified.

### Sprint 6: Autonomous Iterative Sweep (COMPLETE)
`/forgeplan:sweep` (7-phase orchestration), `/forgeplan:deep-build` (6-phase autonomous pipeline), cross-model-bridge.js (MCP/CLI/API modes), progressive agent convergence (clean twice → retired, stuck 3 passes → force-converge), `/forgeplan:configure` setup wizard, smart blocked-finding resolution (Category A: spec update auto, B: shared extraction auto, C: architecture decisions persist+prompt), atomic state writes, plugin restructured for marketplace. Dogfooded on client-portal: 60 findings, 53 auto-fixed, cross-model certified.

### Sprint 7A: Complexity Calibration (COMPLETE)
Complexity tier system (SMALL/MEDIUM/LARGE) driving the entire pipeline. `complexity_tier` field in manifest schema, tier-conditional architect, tier-aware commands and agents, `verify-runnable.js` (stack-adaptive verification gate with PID safety + error classification), expanded node types (cli, library, extension, worker, pipeline), `config-schema` tier_override. See [edge cases](docs/reference/edge-cases.md) for implementation notes from 50-case adversarial review.

**Verification pipeline — verify-runnable.js:**
- Reads `tech_stack` from manifest (not hardcoded). Runs: install deps → type check → tests → dev server check.
- **Process safety:** ONLY kills PIDs it started (tracked in `.forgeplan/.verify-pids`). Never kills by process name. Checks cwd before killing port processes. SIGTERM→wait 5s→SIGKILL. On Windows: `taskkill /PID` (graceful), wait 5s, then `/F /PID`.
- **Error classification:** Code errors → findings for fix agents. Environment errors (port in use, missing tool) → auto-fix then retry. Transient errors (npm timeout) → retry with backoff.
- **Timeouts:** 30s install, 10s type check, 60s tests, 15s server start.

### Sprint 7B: Ambient Mode + Confidence Scoring (COMPLETE)
Ambient SessionStart (healthy-state display, contextual per-node suggestions, sweep progress), confidence scoring (0-100 per finding, <75 filtered in Phase 3), document import (`--from` in discover with 8-step extraction), PreCompact/PostCompact hooks (context preservation across compaction), worktree-based parallel sweep fixes (`scripts/worktree-manager.js`).

### Sprint 8: Research Agents + Greenfield Pipeline (COMPLETE)
2 research agents (Researcher, Docs-Agent — later consolidated) via `/forgeplan:research`, `/forgeplan:greenfield` (discover→research→spec→deep-build with one confirmation), `--autonomous` flags on discover and spec, `runtime-verify.js` Phase B endpoint verification (Levels 1-5 tier-aware), builder+architect research awareness, manifest `tech_stack.infrastructure` field.

**Greenfield pipeline steps:**
1. `/forgeplan:discover` autonomous — assess tier, propose architecture, halt only on critical ambiguity
2. `/forgeplan:research` — tech stack + key patterns
3. `/forgeplan:spec --all` autonomous — generate specs from manifest + research
4. `/forgeplan:deep-build` — build → verify-runnable → review → sweep → cross-model → final verify

**Exit criteria (tier-aware):**
- SMALL: Phase A passes + 3-agent sweep clean. No Phase B. No cross-model.
- MEDIUM: Phase A + Phase B (endpoints + responses) + 4-agent sweep + integration check. Cross-model optional.
- LARGE: Phase A + Phase B (endpoints + auth + stress) + 5-agent sweep converged + integration + cross-model (2 consecutive clean).

**Runtime verification (Phase B — `scripts/runtime-verify.js`):**
Starts app, reads manifest interfaces, verifies endpoints (status + response shape), tests auth boundaries. Environment-resilient: detects missing env vars, port conflicts, mock mode. Tier-aware depth: SMALL skips, MEDIUM tests endpoints, LARGE adds stress + auth boundaries.

### Milestone: External Users
Ship after Sprint 8, before Sprint 9. Get real feedback on the full pipeline. Their feedback reshapes Sprint 9+ more than internal planning.

### Sprint 9: Semantic Memory + Polish (COMPLETE)
5 consolidated sweep agents (from 12 domain agents — fewer, smarter, broader; proven when Adversary caught a CRITICAL security bypass that 35 Claude + 7 Codex + 2 Qwen rounds all missed), semantic memory wiki (`.forgeplan/wiki/`), `/forgeplan:split` for node decomposition, guide skill enhancement. Design doc: `docs/plans/2026-04-07-agent-consolidation-design.md`.

### Sprint 10A: Design Pipeline + Universal Review Panel (COMPLETE)
**Goal:** Formalize the 3-stage design-to-build pipeline. Make "architecture-down, sprint-forward, governance-continuous" the default workflow.

**3-Stage Pipeline:**
1. **Discovery** — Interviewer (Socratic requirements extraction), Translator (document→ForgePlan mapping), Researcher (architecture patterns + packages)
2. **Design + Plan** — Architect produces design, Planner mode produces implementation plan, universal review panel reviews both
3. **Build + Code Review** — Builder executes plan, universal review panel reviews code, sweep runs

**Deliverables:**
- Stage 1 agents: Interviewer (one question at a time, ambiguity detection), Translator (external docs → structured JSON mapping with nodes, shared models, tech stack, tier, ambiguities), enhanced Researcher (design-level research before package search)
- Planner mode for Architect (reviewed design → implementation plan at `.forgeplan/plans/implementation-plan.md`)
- Universal review panel: 5 agents (Adversary, Contractualist, Pathfinder, Structuralist, Skeptic) with 3 lens variants each (Design/Plan/Code)
- Agent rename: colors → production names (sweep-red→sweep-adversary, etc.)
- Greenfield wiring with review panel at stage gates (design review at Step 1.5, plan review at Step 3.5)
- Tier-aware review dispatch: SMALL = 3 agents (Adversary + Skeptic + Structuralist), MEDIUM = +Contractualist, LARGE = +Pathfinder
- Circuit breaker: max passes per stage, CRITICALs HALT pipeline, IMPORTANTs become warnings

**Batches:**
- Batch 1 (COMPLETE): Agent rename from colors to production names
- Batch 2 (COMPLETE): Interviewer, Translator, enhanced Researcher agents
- Batch 3 (COMPLETE): 5 review panel agents (review-adversary, review-contractualist, review-pathfinder, review-structuralist, review-skeptic)
- Batch 4 (COMPLETE): Greenfield wiring, guide update, compact-context update, CLAUDE.md refresh

**Key decisions:** Ingest is autonomous (same pipeline, code as input). SMALL greenfield skips Stage 1 Interviewer. Guide command onboards new users. Architect gets heavier weight in design disagreements. license-checker + inspiration consolidated into Researcher.

**Design docs:** `docs/plans/2026-04-07-sprint10a-design.md`, `docs/plans/2026-04-07-sprint10a-implementation.md`

### Sprint 10B: Phased Builds + Repo Ingestion (COMPLETE)
**Goal:** Large projects build in phases. Existing repos get governance retroactively.

Deliverables: `phase` field on nodes, `build_phase` on project, phase enforcement gate (Layer 1 in pre-tool-use.js), fail-closed stubs for security dependencies, phase-aware spec depth (full/interface-only/skip), phase advancement via deep-build with cross-phase integration (4 checkpoints: pre_increment → post_increment → promoting_specs → promotion_complete), phase staleness warnings (>7 days), `/forgeplan:ingest` (Translator repo mode, validate-ingest.js ground-truth validation, double review gate, descriptive specs with `spec_type`/`generated_from`, spec_type cached in state.json, wiki on ingest, guide onboarding), phase-aware build/sweep/deep-build commands, `verify-cross-phase.js` (deterministic implementation-to-spec verification for cross-phase boundaries), `scripts/lib/contract-helpers.js` (shared helpers).

**Post-implementation hardening (11 Codex rounds + 6 internal 5-agent sweeps):** All 16 agents got Phase-Aware sections + Finding Quality Filter (inspired by Codex review_prompt.md). Sweep/review agents got learned-pattern audit sections (validator heuristic bypasses, data store boundary contracts, enforcement gaps, error path state leaks, unbounded resource consumption). Security fixes: CLI arg injection, Google API key exposure, test_command sanitization, worktree git-add scoping. Script fixes: post-tool-use.js TOCTOU race (single read/modify/write), session-start.js spec_type caching, validate-ingest.js symlink/junction hardening with cycle detection.

**Design docs:** `docs/plans/2026-04-07-sprint10b-design.md`, `docs/plans/2026-04-07-sprint10b-implementation.md`

### Sprint 11: Skills for All Agents + Token Efficiency (COMPLETE)
`skill-registry.js` (event-driven skill registry with 4-tier cascade, quality gate, priority-based conflict resolution), `blast-radius.js` (dependency graph + impact analysis for fix agents), 30 curated SKILL.md files (25 core + 5 conditional), progressive disclosure (metadata at dispatch, full on-demand), auto-refresh hooks (session-start staleness detection + pre-tool-use active refresh), skill-aware commands (build/sweep/review/discover/greenfield), architect compiled skills (auto-regenerated from source), `/forgeplan:skill` command (list/refresh/install/validate). Token efficiency: batched fix context (grouped by file with blast radius), Phase 4.5 deterministic pre-verification (catches regressions at script cost), Phase 1.5 understanding pass + wiki feeding.

**Design docs:** `docs/plans/2026-04-07-sprint11-design.md`, `docs/plans/2026-04-09-sprint11-implementation.md`

### Sprint 12: MCP Integrations
Pre-configured MCP connections (Supabase, Stripe, Vercel), live API validation during builds, integration templates.

### Standalone App: Visual Features (Post-Plugin)
Phantom→live progressive previews, Playwright browser testing, demo mode (seed data + mock services), node visualization (dependency graph), lifecycle bar. See Concept Doc Sections 18-23. Demo mode may ship as CLI feature earlier.

## Commands

| Command | Description |
|---------|-------------|
| `/forgeplan:discover` | Guided conversation → manifest + skeleton specs |
| `/forgeplan:spec` | Generate detailed node spec |
| `/forgeplan:build` | Build a node with enforcement |
| `/forgeplan:review` | Audit node against spec |
| `/forgeplan:revise` | Reopen and change a node |
| `/forgeplan:next` | Dependency-aware next recommendation |
| `/forgeplan:status` | Full project status visualization |
| `/forgeplan:integrate` | Cross-node interface verification |
| `/forgeplan:recover` | Crash recovery |
| `/forgeplan:sweep` | Tier-aware parallel sweep (3-5 agents) + progressive convergence |
| `/forgeplan:deep-build` | Full autonomous build→review→sweep→cross-check pipeline |
| `/forgeplan:configure` | Automated cross-model setup wizard |
| `/forgeplan:guide` | Evaluates project state, recommends best next step |
| `/forgeplan:help` | All available commands |
| `/forgeplan:affected` | Which nodes use a shared model — impact analysis |
| `/forgeplan:measure` | Code quality metrics (broken refs, stubs, duplicates) |
| `/forgeplan:regen-types` | Rebuild shared TypeScript types from manifest |
| `/forgeplan:validate` | Check manifest/specs for cycles, orphans, consistency |
| `/forgeplan:research` | Research packages, licenses, patterns, architecture |
| `/forgeplan:greenfield` | Full pipeline: discover → design review → research → spec → plan review → build → code review → sweep → certify |
| `/forgeplan:split` | Decompose a node into finer-grained nodes |
| `/forgeplan:ingest` | Scan existing codebase → manifest + descriptive specs + governance |

## Agents

### Core Agents

| Agent | Role | Key Behaviors |
|-------|------|--------------|
| Architect | Discovery, manifest, planning | Tier assessment, anti-collapse enforcement, shared model ID, Planner mode |
| Builder | Node code generation | Pre-build spec challenge, anchor comments, constraint directive, test co-updates |
| Reviewer | Spec-diff audit | 7 audit dimensions, per-criterion PASS/FAIL, code evidence |
| Interviewer | Requirements extraction (10A) | Socratic questioning, one question at a time, ambiguity detection |
| Translator | Document intake (10A) | External docs → structured ForgePlan mapping with ambiguities |
| Researcher | Design + ecosystem research | Architecture patterns, packages, licenses, prior art, build-vs-buy |

### 5 Sweep Agents (dispatched in parallel by `/forgeplan:sweep`)

| Agent | Domain |
|-------|--------|
| sweep-adversary | Security, errors, config, database — tries to BREAK the code |
| sweep-contractualist | Types, API contracts, imports, cross-node — diffs both sides of every boundary |
| sweep-pathfinder | User flows, frontend UX, test quality — walks every journey end-to-end |
| sweep-structuralist | Code quality, docs, architecture, simplicity — zooms out |
| sweep-skeptic | Spec tracing, fresh eyes, gap finding — does the code do what the spec says? |

All sweep agents are opus. Tier dispatch: SMALL = Adversary + Contractualist + Skeptic, MEDIUM = +Pathfinder, LARGE = +Structuralist.

### 5 Review Panel Agents (Sprint 10A — universal across design/plan/code)

| Agent | Focus |
|-------|-------|
| review-adversary | Security, abuse scenarios, failure modes |
| review-contractualist | Interface consistency, shared models, contracts |
| review-pathfinder | User journeys, error paths, recovery flows |
| review-structuralist | Architecture coherence, boundaries, simplification |
| review-skeptic | Feasibility, edge cases, assumptions, performance, test quality |

Each has 3 lens variants (Design/Plan/Code). Same agents, different prompt context per stage. Tier dispatch: SMALL = Adversary + Skeptic + Structuralist, MEDIUM = +Contractualist, LARGE = +Pathfinder.

## Six Hook Types

| Hook | Type | Purpose |
|------|------|---------|
| PreToolUse | command + prompt | Layer 1: deterministic file scope + shared model guard. Layer 2: LLM spec compliance |
| PostToolUse | command | Auto-register files, log changes |
| Stop | command | Bounce counter gate; exit-2 instructs Claude to evaluate ACs and do state transition |
| SessionStart | command | Detect crashed/stuck builds, ambient status display |
| PreCompact | command | Save critical context (manifest, state, enforcement rules) before compaction |
| PostCompact | command | Re-inject context summary after compaction |

## Key Design Decisions

- **Node spec is the most important artifact.** Everything downstream depends on spec quality.
- **Layered enforcement:** Fast deterministic checks first, LLM only when needed. 80%+ is instant glob matching.
- **Shared models are canonical.** Any entity referenced by 2+ nodes must be a shared model, never defined locally.
- **Spec-diff review, not vibes.** Every finding must reference a specific spec element and cite specific code evidence.
- **The `.forgeplan/` directory is the product.** The plugin is one interface. The standalone app is another.
- **Anchor comments** (`// @forgeplan-node: [id]`, `// @forgeplan-spec: [criterion-id]`) tie code to architecture.
- **Tests along the way, not just at the end.** Builder runs tests during build. Stop hook checks results. Sweep re-runs after fixes. Phase A/B are final gates.

## The Canonical Demo: Client Portal

Every example uses this project:
- **7 nodes:** database, auth, api, file-storage, frontend-login, frontend-dashboard, frontend-accountant-view
- **2 shared models:** User (client vs accountant roles), Document (upload lifecycle)
- Auth: email/password + Google OAuth, role-based access
- File handling: upload, storage, retrieval with encryption
- Multiple frontend views per role

## Platform Notes

- Development on Windows 11, use Unix shell syntax in bash
- Plugin must be cross-platform (scripts use Node.js, not bash-only)
- validate-manifest should be .js not .sh for Windows compatibility
