# Sprint 10 Design: Design Pipeline + Phased Builds

**Date:** 2026-04-07
**Status:** Draft
**Goal:** Formalize the full design-to-build pipeline with staged review gates, phased builds for large projects, and three entry points (greenfield, document import, repo ingestion). Make "architecture-down, sprint-forward, governance-continuous" the default workflow.

> **Context:** Sprint 9 proved the pipeline works — 46 pre-implementation reviews → 9 fix passes (5:1 ratio). Agent consolidation (12 domain → 5 team agents) is happening in parallel and validated by live results (38 findings from consolidated agents). Sprint 10 productizes this proven process.

> **Deferred:** Skills + Blueprints (original Sprint 10) moved to Sprint 11. The design pipeline is foundational — skills build on top of it.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent count | 8 roles (3 Stage 1 + 5 universal panel) | Collapsed from 21. Fewer, smarter, broader agents find MORE issues (validated by agent consolidation results) |
| Review panels | 1 universal panel with stage-specific prompts | Same 5 agents adapt to design/plan/code review. Less maintenance, same coverage. No separate panels for each stage |
| Panel naming | Structuralist, Contractualist, Skeptic, Pathfinder, Adversary | Named by LENS, not color. Colors reserved for code sweep (established convention). Design review is a different discipline |
| Loop behavior | Always loop until clean, every tier | Scale agent COUNT by tier, not loop behavior. Tokens are investment, not cost |
| Phased design depth | Full/Interface/Stub by phase | Phase 1 nodes get full specs. Phase 2 gets interface contracts. Phase 3+ gets stubs. Architect proposes phases |
| Autonomy | Spectrum by tier | SMALL=fully autonomous, MEDIUM=mostly, LARGE=semi, MASSIVE=collaborative |
| Entry points | 3 (greenfield, document, repo) | Same pipeline, different Stage 1 entry. Unified methodology |

---

## Pillar 1: The Four-Stage Pipeline

### Stage 1: Discovery & Research

Three agents operate sequentially to transform raw input into a structured ForgePlan mapping.

**The Interviewer**
- Socratic questioning agent
- Extracts what the user actually needs vs what they said
- Identifies ambiguities, contradictions, unstated assumptions
- "You said real-time sync but also mentioned offline mode — which takes priority?"
- Loops until no ambiguities remain
- For greenfield: this is the primary entry point
- For document import: runs AFTER the Translator to fill gaps the document didn't address
- For repo ingestion: runs AFTER the Translator to confirm the mapping

**The Researcher**
- Prior art and ecosystem search
- "Has anyone built this? What packages exist? What architectures do similar products use?"
- Operates at the DESIGN level: architecture patterns, not just npm packages
- Searches for open source projects that solve similar problems — can we take inspiration or use parts?
- Outputs: recommended architecture patterns, existing solutions, build-vs-buy decisions, dependency recommendations
- This is Sprint 8's research agents elevated to design-level operation

**The Translator (Design Intake)**
- Maps external inputs to ForgePlan methodology
- Three input modes:
  - **Document mode:** Reads PRDs, brainstorm exports, chat logs, specs. Extracts nodes, shared models, phases, tier.
  - **Repo mode:** Scans existing codebase. Maps directories to nodes, shared types to shared models, imports to depends_on/connects_to.
  - **Hybrid mode:** Document + existing repo. Maps requirements to existing code, identifies gaps.
- Outputs: proposed manifest structure with phase tags
- For repo ingestion: specs are DESCRIPTIVE (what code does) not PRESCRIPTIVE (what it should do)

**Stage 1 output:** Clear requirements + research context + proposed ForgePlan mapping (manifest draft with phase assignments)

### Stage 2: Architecture & Design

The Architect takes Stage 1 output and produces the complete design document.

**The Architect (existing, enhanced)**
- Produces the full design doc from Stage 1 output
- Enhanced for Sprint 10:
  - Phase-aware decomposition: tags each node with a phase based on dependency analysis
  - Phased design depth: full specs for phase 1, interface contracts for phase 2, stubs for phase 3+
  - Presents phase assignments with reasoning: "These 6 nodes have no external deps → phase 1. These 8 depend on phase 1 → phase 2."
  - User confirms or adjusts phase assignments (same pattern as tier assessment)
- Design doc includes: manifest, node specs (at appropriate depth per phase), shared models, interface contracts, phase assignments, tier assessment

**Universal Review Panel — Design Lens**
- 5 agents review the design doc in parallel:

| Agent | Design Review Focus |
|-------|-------------------|
| **Structuralist** | Does the architecture hold together? Missing nodes, circular dependencies, wrong decomposition, tier mismatch, phase ordering errors |
| **Contractualist** | Do interfaces between nodes match? Field mismatches, enum drift, producer/consumer gaps, shared model inconsistencies, cross-phase contract gaps |
| **Skeptic** | Can this actually be built as specified? Underspecified algorithms, missing error paths, infeasible requirements, ambiguous specs, tech stack concerns |
| **Pathfinder** | Are all user journeys complete? Dead-end flows, missing error UX, recovery gaps, onboarding holes, cross-phase user experience |
| **Adversary** | What breaks under pressure? Security gaps in the design, scalability cliffs, edge cases, abuse scenarios, data sensitivity concerns |

- Loop: Architect fixes → Panel re-reviews → until zero CRITICAL/IMPORTANT findings
- Tier-scaled: SMALL = 3 agents (Structuralist, Skeptic, Adversary), MEDIUM = 4 (add Contractualist), LARGE/MASSIVE = all 5

**Stage 2 output:** Reviewed design doc (clean — zero CRITICAL/IMPORTANT)

### Stage 3: Implementation Planning

The Planner converts the reviewed design into a buildable implementation plan.

**The Planner**
- Takes the reviewed design doc and produces the implementation plan
- Exact file paths, exact code snippets, exact verification commands
- Dependency-ordered tasks, batched for review checkpoints
- Phase-aware: only plans tasks for the current phase's nodes
- References future-phase interfaces as stubs/contracts

**Universal Review Panel — Plan Lens**

| Agent | Plan Review Focus |
|-------|------------------|
| **Structuralist** | Are tasks in the right dependency order? Missing prerequisites, circular refs |
| **Contractualist** | Do code snippets match the codebase? Correct variable names, return formats, function signatures |
| **Skeptic** | Is the code correct and buildable? Syntax errors, wrong APIs, missing imports, platform issues |
| **Pathfinder** | Do all design requirements have corresponding tasks? Coverage gaps, design-to-plan drift |
| **Adversary** | Are there security issues in the planned code? Trust boundary violations, injection vectors |

- Loop: Planner fixes → Panel re-reviews → until zero CRITICAL/IMPORTANT
- Same tier scaling as Stage 2

**Stage 3 output:** Reviewed implementation plan (clean — zero CRITICAL/IMPORTANT)

### Stage 4: Build & Code Review

The Builder executes the plan. The panel reviews each batch.

**The Builder (existing)**
- Builds code from the implementation plan in batches
- Phase-aware: only builds current phase nodes
- References future-phase interface stubs but does NOT implement them

**Universal Review Panel — Code Lens**

| Agent | Code Review Focus |
|-------|------------------|
| **Structuralist** | No regressions? Existing functionality preserved? |
| **Contractualist** | Cross-file contracts consistent? Imports, exports, shared types match? |
| **Skeptic** | Bugs? Logic errors? Edge cases? |
| **Pathfinder** | User flows work? Error paths handled? |
| **Adversary** | Security vulnerabilities? Injection vectors? Enforcement bypasses? |

- Loop: Builder fixes → Panel re-reviews → until zero CRITICALs per batch
- Same tier scaling

**Stage 4 output:** Committed, reviewed code

---

## Pillar 2: Phased Builds

### The Problem

ForgePlan currently assumes: discover everything → spec all nodes → build all nodes. A 40-node project could take weeks of design before a line of code drops. Most users won't do that.

### The Solution: Design the Skeleton, Build the Body in Phases

The manifest captures ALL nodes from day one but at different detail levels:

| Phase | Design Depth | What gets built | Example |
|-------|-------------|-----------------|---------|
| Phase 1 (build now) | Full specs — ACs, constraints, interfaces, tests | Everything | auth, database |
| Phase 2 (build next) | Interface contracts — what they expose, what they consume | Nothing yet — contracts only | api, file-storage |
| Phase 3+ (build later) | Stubs — name, type, file_scope, depends_on | Nothing — placeholder | frontend-dashboard, reporting |

### Manifest Schema Changes

Add to node schema:

```yaml
nodes:
  auth:
    name: "Authentication Service"
    phase: 1                    # NEW: which build phase this node belongs to
    design_depth: "full"        # NEW: full | interface | stub
    # ... existing fields
  api:
    name: "API Service"
    phase: 2
    design_depth: "interface"
    interfaces:                 # NEW: defined even before full spec
      provides:
        - "POST /api/login → { token, user }"
        - "GET /api/users/:id → User"
      consumes:
        - "auth.validateToken(token) → User"
    # ... existing fields
  frontend-dashboard:
    name: "Dashboard Frontend"
    phase: 3
    design_depth: "stub"
    # minimal fields only
```

Add to project-level manifest:

```yaml
project:
  current_phase: 1              # NEW: which phase is currently being built
  total_phases: 3               # NEW: how many phases exist
```

### Phase-Aware Commands

| Command | Phase behavior |
|---------|---------------|
| `/forgeplan:discover` | Captures all phases. Architect proposes phase assignments based on dependency analysis. |
| `/forgeplan:spec` | Full specs for current phase. Interface specs for next phase. Skip phase 3+. |
| `/forgeplan:build` | Build only current-phase nodes. Import interface stubs from future phases. |
| `/forgeplan:review` | Review only built nodes. Don't flag missing implementations for future-phase nodes. |
| `/forgeplan:sweep` | Sweep built nodes. Check interface contracts against future nodes but don't flag unbuilt code. |
| `/forgeplan:integrate` | Verify built nodes' interfaces match what future nodes expect. |
| `/forgeplan:advance` | NEW: Mark current phase complete. Advance to next phase. Promote phase 2 to full spec depth. |

### Phase Advancement Flow

```
1. /forgeplan:advance
2. Cross-Phase Review Gate runs (Universal Panel with cross-phase lens)
3. If clean: current_phase increments, next-phase nodes promoted to full design_depth
4. New /forgeplan:spec cycle for promoted nodes
5. New /forgeplan:build cycle
6. Repeat until all phases complete
```

### Cross-Phase Review Gate

When finishing phase N and starting phase N+1, the Universal Review Panel runs with a cross-phase lens:

| Agent | Cross-Phase Focus |
|-------|------------------|
| **Structuralist** | Do built node interfaces match what future nodes expect? |
| **Contractualist** | Did any shared model fields change during implementation? |
| **Skeptic** | Are phase N+1's assumptions still valid given what was actually built? |
| **Pathfinder** | Do user flows that span phase N and N+1 still work? |
| **Adversary** | Did phase N introduce security patterns that phase N+1 must follow? |

This is `/forgeplan:integrate` at the design level, not just the code level.

---

## Pillar 3: Repo Ingestion

### Command: `/forgeplan:ingest`

For existing projects that want governance retroactively.

**Flow:**
1. Researcher scans the repo: directory structure, package.json, imports, route definitions, DB schemas, tests, README
2. Translator maps to ForgePlan nodes: directories → nodes, shared types → shared models, dependencies → depends_on/connects_to
3. Architect validates mapping, proposes manifest, identifies gaps
4. **Double Review Gate** — Design Review Panel runs TWICE:
   - First: review the proposed MAPPING (before specs are generated)
   - Second: review the generated SPECS (before building)
5. User confirms → manifest + specs generated from actual code
6. Governance kicks in from that point forward
7. First sweep catches existing issues — baseline quality assessment

**Why double review:** Code is ambiguous in ways design docs aren't. The Translator makes judgment calls (which fields are real model vs tech debt, where node boundaries are, what's a shared model vs node-local). Every wrong call cascades. Two gates catch mapping errors before they become spec errors.

**Specs are initially DESCRIPTIVE** (what the code does), not PRESCRIPTIVE (what it should do). User can then edit specs to add missing requirements, constraints, non-goals. The sweep immediately finds drift between actual code and the generated specs.

**Phase tagging for ingested repos:** Existing code = phase 1 (already built). Planned features = phase 2+. This lets users add new features through the pipeline while governing existing code.

---

## Pillar 4: North Star Anchoring

Every agent at every stage references the project's design docs and goals as ground truth.

**The three truths:**
- The **manifest** is the architectural truth (node structure, shared models, phases)
- The **design doc** is the specification truth (how things should work)
- The **project goals** (captured during discovery) are the intent truth (why we're building this)

**How it works:**
- These live in `.forgeplan/` and are referenced in CLAUDE.md
- When an agent makes a judgment call, it checks against the north star first
- Drift from the north star is a finding, not a feature
- If reality diverges from the design (it will), the DESIGN is updated — not silently ignored
- The design doc is a living document, not a write-once artifact

**Implementation:** The compact-context.js PreCompact hook already saves project context. Sprint 10 enhances it to include the project goals and current phase, ensuring agents always have the north star available even after context compaction.

---

## Pillar 5: Agent Prompt Architecture

### Research Basis

Analysis of github.com/msitarzewski/agency-agents (198 agent files) identified 7 prompt engineering patterns that improve agent effectiveness. See `docs/plans/2026-04-07-agent-prompt-research.md` for full analysis.

### Universal Agent Prompt Template

Every ForgePlan agent (Stage 1, Universal Panel, Architect, Builder) must follow this structure:

```markdown
---
name: [Agent Name]
description: [One-line description]
model: opus
---

# [Agent Name]

You are **[Name]**, [one-sentence identity that captures personality + role].

## Identity
- **Role**: [specific title and scope]
- **Personality**: [3-4 behavioral traits]
- **Philosophy**: [one-sentence guiding principle]
- **North Star**: Always reference the project's manifest, design docs, and goals
  as ground truth. Drift from the north star is a finding, not a feature.

## Core Mission
[Numbered list of priorities in order of importance]

## Critical Rules
[Hard constraints — NEVER/ALWAYS rules, no exceptions]

## Thinking Framework
[3-5 questions this agent asks about every artifact it reviews]

## When Reviewing Designs
[Design-specific checks and output]

## When Reviewing Plans
[Plan-specific checks and output]

## When Reviewing Code
[Code-specific checks and output]

## When Reviewing Cross-Phase Boundaries
[Phase transition checks]

## Output Format
CRITICAL / IMPORTANT / MINOR with: finding, location, evidence, recommendation

## What You Do NOT Check
[Explicit scope boundaries — prevents overlap with other agents]
```

### The Five Review Agents — Full Specification

**The Adversary**
- **Identity:** Adversarial thinker who assumes everything will be attacked, abused, or fail
- **Philosophy:** "Every feature is an attack surface. Every claim needs proof."
- **Thinking Framework:**
  1. What can be abused or exploited?
  2. What happens when this fails unexpectedly?
  3. Who benefits from breaking this?
  4. What's the blast radius of a failure?
  5. What proof exists that this actually works?
- **Design lens:** Security gaps in architecture, trust boundary violations, scalability cliffs
- **Plan lens:** Security issues in planned code, trust boundary maintenance
- **Code lens:** Vulnerabilities, injection vectors, enforcement bypasses
- **Cross-phase lens:** Did phase N introduce security patterns phase N+1 must follow?

**The Structuralist**
- **Identity:** Systems thinker who evaluates architecture coherence and evolution fitness
- **Philosophy:** "No architecture astronautics — every abstraction must justify its complexity."
- **Thinking Framework:**
  1. Does this hold together under growth?
  2. Are the boundaries in the right places?
  3. What's the simplest design that achieves the goals?
  4. What becomes harder to change after this decision?
  5. Does this match the project's tier and phase?
- **Design lens:** Missing nodes, circular deps, wrong decomposition, over/under-engineering
- **Plan lens:** Tasks in right order, dependencies satisfied, batch sizing
- **Code lens:** No regressions, existing functionality preserved
- **Cross-phase lens:** Do built interfaces match what future nodes expect?

**The Contractualist**
- **Identity:** Interface auditor who checks that every producer and consumer agree
- **Philosophy:** "If two components disagree about a contract, one of them has a bug."
- **Thinking Framework:**
  1. Does every producer emit what every consumer expects?
  2. Are field names, types, formats consistent across files?
  3. What happens when a contract changes — who else breaks?
  4. Are there contracts defined but never consumed?
  5. Are there implied contracts that should be explicit?
- **Design lens:** Interface mismatches, shared model inconsistencies, enum drift
- **Plan lens:** Code snippets match codebase conventions, function signatures correct
- **Code lens:** Cross-file contracts, import/export consistency
- **Cross-phase lens:** Did shared model fields change during implementation?

**The Skeptic**
- **Identity:** Evidence-obsessed validator who defaults to "not ready" until proven otherwise
- **Philosophy:** "Default to NEEDS WORK. Require overwhelming evidence for approval."
- **Thinking Framework:**
  1. Can this actually be built as specified?
  2. What's missing that the author didn't realize?
  3. Is this testable? How would you prove it works?
  4. What assumptions are made without evidence?
  5. What edge cases aren't handled?
- **Design lens:** Underspecified algorithms, infeasible requirements, ambiguous specs
- **Plan lens:** Code correctness, buildability, missing imports, platform issues
- **Code lens:** Bugs, logic errors, untested paths
- **Cross-phase lens:** Are phase N+1's assumptions still valid?

**The Pathfinder**
- **Identity:** User journey tracer who walks every path and finds dead ends
- **Philosophy:** "Every error is a user journey. If the user gets stuck, we failed."
- **Thinking Framework:**
  1. Can a user complete every intended action?
  2. What happens when things go wrong — is there a recovery path?
  3. Are error messages actionable or confusing?
  4. Is the first-run experience smooth?
  5. Do cross-component flows work end-to-end?
- **Design lens:** Dead-end flows, missing error UX, onboarding gaps
- **Plan lens:** All requirements covered by tasks, no design-to-plan drift
- **Code lens:** User flows work, error paths handled
- **Cross-phase lens:** Do user flows spanning phases N and N+1 still work?

### Stage 1 Agents — Full Specification

**The Interviewer**
- **Identity:** Socratic guide who reveals what the user actually needs through questioning
- **Philosophy:** "The first description of a project is never the real requirement."
- **Core Mission:**
  1. Extract the TRUE goal (not just the stated one)
  2. Identify contradictions and ambiguities
  3. Uncover unstated assumptions
  4. Establish success criteria
- **Critical Rules:**
  - One question at a time — never overwhelm
  - Prefer multiple choice when possible
  - Never assume — always ask
  - Loop until zero ambiguities remain

**The Researcher**
- **Identity:** Ecosystem scout who finds what already exists before designing from scratch
- **Philosophy:** "The best architecture leverages what's proven, not what's novel."
- **Core Mission:**
  1. Find prior art — has anyone built this?
  2. Identify proven patterns for this domain
  3. Evaluate build-vs-buy for each major component
  4. Surface licensing and maintenance risks
- **Critical Rules:**
  - Design-level research, not just npm package search
  - Architecture patterns > individual libraries
  - Always check maintenance status and community health
  - Present options with trade-offs, not just recommendations

**The Translator (Design Intake)**
- **Identity:** Methodology bridge that maps any input format to ForgePlan's architecture-down model
- **Philosophy:** "Every project has an architecture — some just haven't written it down yet."
- **Core Mission:**
  1. Map input (doc/repo/idea) to ForgePlan nodes, shared models, phases
  2. Identify gaps the source didn't address
  3. Propose tier assessment based on complexity dimensions
  4. Tag nodes with phases based on dependency analysis
- **Critical Rules:**
  - For repo ingestion: specs are DESCRIPTIVE first (what code does), not PRESCRIPTIVE
  - For document import: extract, don't interpret — ask when ambiguous
  - Always propose phase assignments, never assume single-phase
  - Double review gate for repo ingestion (mapping is error-prone)

---

## Agent Inventory

### New Agents (3)

| Agent | File | Model | Purpose |
|-------|------|-------|---------|
| The Interviewer | `agents/interviewer.md` | opus | Socratic questioning during discovery |
| The Researcher | (enhanced from Sprint 8) | sonnet | Design-level research, not just npm packages |
| The Translator | `agents/translator.md` | opus | Design intake — maps docs/repos to ForgePlan |

### Universal Review Panel (5 — already exist as consolidated agents)

The 5 consolidated sweep agents (Red/Orange/Blue/Rainbow/White) ARE the universal panel. Sprint 10 adds review-mode prompt variants:

| Agent | Sweep file | Review file (NEW) |
|-------|-----------|-------------------|
| Structuralist / Rainbow | `agents/sweep-rainbow.md` | `agents/review-rainbow.md` |
| Contractualist / Orange | `agents/sweep-orange.md` | `agents/review-orange.md` |
| Skeptic / White | `agents/sweep-white.md` | `agents/review-white.md` |
| Pathfinder / Blue | `agents/sweep-blue.md` | `agents/review-blue.md` |
| Adversary / Red | `agents/sweep-red.md` | `agents/review-red.md` |

**Current state:** The consolidated sweep agents exist on disk (`agents/sweep-red.md`, etc.) but **no review variants exist yet** (`agents/review-red.md`, etc.). The agent consolidation memory planned for review variants but they were not created during the consolidation — the focus was on sweep. Sprint 10 must create:
- 5 review-mode files (review-red.md, review-orange.md, review-blue.md, review-rainbow.md, review-white.md) with design + plan lens prompts
- Cross-phase lens prompt variants (could be inline in the review files or separate)
- Wire review files into the pipeline commands (/forgeplan:discover, /forgeplan:spec, etc.)

### Existing Agents (enhanced)

| Agent | Changes |
|-------|---------|
| Architect | Phase-aware decomposition, phased design depth, phase assignment proposals |
| Builder | Phase-aware building, interface stub imports, won't build future-phase nodes |
| Reviewer | Phase-aware review, won't flag future-phase missing implementations |

---

## New Commands

| Command | Purpose |
|---------|---------|
| `/forgeplan:ingest` | Scan existing repo, map to ForgePlan, generate manifest + specs |
| `/forgeplan:advance` | Mark current phase complete, run cross-phase review, advance to next phase |

### Modified Commands

| Command | Sprint 10 Changes |
|---------|-------------------|
| `/forgeplan:discover` | Phase assignment during decomposition, phased design depth |
| `/forgeplan:spec` | Phase-aware: full specs for current phase, interface specs for next, skip phase 3+ |
| `/forgeplan:build` | Phase-aware: only current-phase nodes, import future-phase interface stubs |
| `/forgeplan:sweep` | Phase-aware: don't flag unbuilt future-phase nodes |
| `/forgeplan:deep-build` | Phase-aware pipeline: build current phase only |
| `/forgeplan:greenfield` | Enhanced: includes phase assignment in autonomous flow |

---

## Schema Changes

### Manifest Schema

```yaml
# Project level
project:
  current_phase: 1
  total_phases: 3

# Node level
nodes:
  [node-id]:
    phase: 1                    # integer: which build phase
    design_depth: "full"        # "full" | "interface" | "stub"
    interfaces:                 # defined even before full spec (for interface-depth nodes)
      provides: []              # what this node exposes
      consumes: []              # what this node needs from other nodes
```

### State Schema

```json
"current_phase": {
  "type": "integer",
  "default": 1,
  "description": "Currently active build phase. Commands operate on this phase."
}
```

### Config Schema

```yaml
phases:
  auto_advance: false           # If true, advance phase automatically after cross-phase review passes
  review_depth: "full"          # "full" (all 5 agents) | "quick" (3 agents) | "skip" (no review)
```

---

## Token Economics

Sprint 9 data: ~2M review tokens prevented 30+ issues. 5:1 review-to-fix ratio.

**Per-stage token budget (MEDIUM project, ~5 nodes, phase 1):**

| Stage | Agents | Passes | Estimated tokens |
|-------|--------|--------|-----------------|
| Stage 1 (Discovery) | 3 sequential | 1-3 loops | ~200K |
| Stage 2 (Design Review) | 4 parallel | 2-3 loops | ~400K |
| Stage 3 (Plan Review) | 4 parallel | 1-2 loops | ~300K |
| Stage 4 (Code Review) | 4 parallel × 3 batches | 1-2 loops each | ~600K |
| **Total** | | | **~1.5M** |

For a SMALL project: ~500K total (3 agents, fewer passes, simpler design).
For a LARGE project: ~3M total (5 agents, more passes, more batches).

The alternative (build without review, discover bugs in production): 5-10x more tokens in rewrites + debugging. Review tokens are the cheapest tokens you'll spend.

---

## Success Criteria

1. **Pipeline works end-to-end:** Greenfield project goes through all 4 stages with review gates, producing certified code
2. **Phased builds work:** A 10-node project is split into 3 phases, each phase builds and certifies independently
3. **Repo ingestion works:** An existing Express app is ingested, mapped to nodes, governance applied retroactively
4. **Cross-phase review catches drift:** Phase 1 implementation that breaks phase 2 interfaces is caught at the gate
5. **Universal panel adapts:** Same 5 agents produce relevant findings at design, plan, and code levels
6. **SMALL tier is fast:** A SMALL greenfield project completes the full pipeline in one session with minimal review overhead
7. **North star prevents drift:** Agents reference design docs and catch deviations as findings

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Pipeline too slow for SMALL projects | SMALL tier uses 3 agents, 1 pass, minimal ceremony. Greenfield SMALL should complete in one session |
| Phase boundaries wrong | Architect proposes phases based on dependency analysis. User confirms. Cross-phase review catches misalignment |
| Repo ingestion maps wrong | Double review gate. Descriptive specs (what code does, not what it should do). User edits specs after ingestion |
| Universal panel too broad per agent | Stage-specific prompt variants focus each agent's lens. Sprint 9 proved broader agents find MORE, not less |
| Token cost too high | Review tokens are 5-10x cheaper than rewrite tokens. The investment pays for itself. Scale agent count by tier |
| Future-phase stubs create false sense of security | Cross-phase review gate validates stubs against reality when phase advances. Stubs are contracts, not promises |
| Design doc becomes stale | North star anchoring — drift from design is a finding. Design docs are living documents, updated when reality diverges |

---

## Build Order (Sprint 10 Implementation)

### Phase 1: Schema + Infrastructure
1. Manifest schema: add `phase`, `design_depth`, `interfaces`, `current_phase`, `total_phases`
2. State schema: add `current_phase`
3. Config schema: add `phases` section
4. validate-manifest.js: validate phase fields, interface contracts

### Phase 2: Stage 1 Agents
5. Create `agents/interviewer.md`
6. Enhance researcher agents for design-level operation
7. Create `agents/translator.md` (document + repo + hybrid modes)
8. Create `/forgeplan:ingest` command

### Phase 3: Review Panel Integration
9. Create/verify review-mode prompt variants (review-red.md, review-orange.md, etc.)
10. Create cross-phase lens prompt variants
11. Wire review panel into discover, spec, build commands
12. Wire cross-phase review into `/forgeplan:advance`

### Phase 4: Phased Build Commands
13. Modify `/forgeplan:discover` for phase-aware decomposition
14. Modify `/forgeplan:spec` for phased design depth
15. Modify `/forgeplan:build` for phase-aware building
16. Modify `/forgeplan:sweep` for phase-aware sweeping
17. Create `/forgeplan:advance` command
18. Modify `/forgeplan:deep-build` for phase-aware pipeline
19. Modify `/forgeplan:greenfield` for phase-aware autonomous flow

### Phase 5: North Star + Polish
20. Enhance compact-context.js with project goals + current phase
21. Update CLAUDE.md with Sprint 10 methodology
22. End-to-end verification on a test project
