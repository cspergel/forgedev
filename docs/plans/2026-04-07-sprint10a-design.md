# Sprint 10A Design: Design Pipeline + Universal Review Panel

**Date:** 2026-04-07
**Status:** Draft v2 (revised after 5-team review of Sprint 10 v1)
**Goal:** Formalize the 3-stage design-to-build pipeline with the universal review panel. Make "architecture-down, sprint-forward, governance-continuous" the default workflow. Every stage loops until clean.

> **Split from Sprint 10 v1:** The original Sprint 10 was too large (11 CRITICALs in first review). Split into 10A (pipeline + panel) and 10B (phased builds + repo ingestion). 10A is foundational — 10B layers on top.

> **Agent naming decided:** Colors retired. Production names: Adversary, Contractualist, Pathfinder, Structuralist, Skeptic.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent count | 8 roles (3 Stage 1 + 5 universal panel) | Fewer, smarter, broader agents find MORE (validated by consolidation: 38 findings from 5 agents) |
| Review panels | 1 universal panel with stage-specific prompts | Same 5 agents adapt per stage. Less maintenance, same coverage |
| Agent naming | Adversary, Contractualist, Pathfinder, Structuralist, Skeptic | Named by LENS. Professional, self-documenting, production-grade |
| Loop behavior | Always loop until clean, every tier | Scale agent COUNT by tier. Tokens are investment, not cost |
| SMALL shortcut | Collapse Stages 2+3 into single sanity check | SMALL should complete in one session. 4 full stages is too much ceremony |
| Stage 3 home | Planner is a mode of the Architect, not a separate agent | Architect designs, Architect plans. Same agent, different output. Reduces agent count |
| Dispatch mechanism | Dispatching command includes "You are reviewing a [DESIGN/PLAN/CODE] document" in the Agent tool prompt | Each review agent file has all 3 lenses. The dispatching command (discover, greenfield, build) tells the agent which lens to use via the prompt context, not a flag. Standard Claude Code Agent tool pattern — no special mechanism needed. |
| Max review passes | 5 per stage (circuit breaker) | Prevents infinite loops. Unresolved CRITICALs HALT pipeline (require user acknowledgment). Unresolved IMPORTANTs become warnings and proceed. |
| North star | Prompt-level guidance, not enforcement | Honest about what it is. Multi-agent loop provides practical guarantees |

---

## The Three-Stage Pipeline

The pipeline has 3 stages (not 4). The existing sweep/deep-build is NOT a separate stage — it is part of Stage 3 (Build). The sweep runs after each batch as part of the build process, not as an independent stage.

### Stage 1: Discovery & Research

Three agents, sequential:

**The Interviewer** (`agents/interviewer.md`, model: opus)
- Socratic questioning — extracts real needs vs stated wants
- Identifies ambiguities, contradictions, unstated assumptions
- Loops until no ambiguities remain
- **SMALL tier:** Single-pass extraction, skip if description is unambiguous
- **MEDIUM+:** Full Socratic loop

**The Researcher** (enhanced `agents/researcher.md`, model: sonnet)
- Design-level research: architecture patterns, not just npm packages
- Prior art search, build-vs-buy analysis, open source options
- Operates BEFORE design decisions are made

**The Translator** (`agents/translator.md`, model: opus)
- Design Intake: maps external docs to ForgePlan methodology
- Document mode: reads PRDs, brainstorm exports, chat logs
- Outputs: structured mapping JSON with proposed nodes, shared models, tier, and dependencies
- **Relationship to existing `--from`:** The Translator REPLACES the architect's document-extraction mode. The `--from` flag in discover.md routes to the Translator instead of the architect's inline extraction. Migration: move the extraction logic from architect.md to translator.md. Keep architect extraction as a degraded fallback (if Translator fails, architect falls back to inline extraction with a warning).
- **Handoff to Architect:** The Translator outputs a structured mapping. The discover command passes this mapping to the Architect as input context. The Architect then generates the actual manifest.yaml, skeleton specs, and scaffolding from the mapping — exactly as it does today from conversational input. The Translator does NOT generate the manifest — it proposes the structure, the Architect builds it.

**Orchestration flow for `--from`:**
```
1. discover.md receives --from argument
2. discover.md dispatches Translator agent with the document
3. Translator outputs: proposed mapping (nodes, shared models, tier, deps)
4. discover.md dispatches Interviewer to fill gaps in the mapping (if any ambiguities)
5. discover.md dispatches Researcher for ecosystem context
6. discover.md passes mapping + research to Architect
7. Architect generates manifest + skeleton specs (existing behavior, new input format)
8. Review panel runs on the design
```

**Stage 1 output:** Clear requirements + research context + proposed manifest mapping

### Stage 2: Architecture & Design

**The Architect** (enhanced existing agent)
- Produces the full design doc from Stage 1 output
- Also produces the implementation plan (Planner mode — same agent, different output)
- For SMALL: design + plan in a single pass, combined artifact

**Universal Review Panel — Design Lens** (then Plan Lens)

| Agent | Design Focus | Plan Focus |
|-------|-------------|------------|
| **Structuralist** | Architecture holds together? Boundaries right? Over-engineered? | Tasks in right order? Dependencies satisfied? |
| **Contractualist** | Interfaces match? Shared models consistent? | Code snippets match codebase? Signatures correct? |
| **Skeptic** | Feasible to build? Edge cases? Missing specs? | Code correct? Platform issues? Missing imports? |
| **Pathfinder** | User journeys complete? Dead ends? Recovery? | All requirements have tasks? Coverage gaps? |
| **Adversary** | Security by design? Scalability? Abuse scenarios? | Security in planned code? Trust boundaries? |

**Finding aggregation:** All agents' findings are merged, deduplicated by location, sorted by severity. Cross-cutting findings (tagged CROSS:[AgentName]) are routed to the named agent for verification on the next pass. The Architect receives the consolidated list, not raw per-agent output.

**Loop:** Architect fixes → Panel re-reviews → until zero CRITICAL/IMPORTANT (max 5 passes). If CRITICALs remain after 5 passes, pipeline HALTS and requires user acknowledgment. IMPORTANTs become warnings and proceed.

**SMALL shortcut:** Design + plan reviewed in ONE pass by 3 agents (Structuralist, Skeptic, Adversary). No separate plan review stage.

**MEDIUM:** 4 agents (add Contractualist), design and plan reviewed separately

**LARGE:** All 5 agents, design and plan reviewed separately

**Stage 2 output:** Reviewed design doc + reviewed implementation plan (both clean)

### Stage 3: Build & Code Review

(Stage 3, not 4 — because SMALL collapses Stages 2+3 into one, and the old Stage 3 "planning" is now part of Stage 2)

**The Builder** (existing)
- Builds code from the implementation plan in batches

**Universal Review Panel — Code Lens**

| Agent | Code Focus |
|-------|-----------|
| **Structuralist** | No regressions? Existing functionality preserved? |
| **Contractualist** | Cross-file contracts? Imports/exports match? |
| **Skeptic** | Bugs? Logic errors? Edge cases? Performance? Test quality? |
| **Pathfinder** | User flows work? Error paths handled? |
| **Adversary** | Security vulnerabilities? Injection? Enforcement bypasses? |

Note: The Skeptic's code lens includes performance and test quality checks (addressing the blind spot from 12→5 agent consolidation).

**Loop:** Builder fixes → Panel re-reviews → until zero CRITICALs per batch (max 5 passes)

**Stage 3 output:** Committed, reviewed code

After code review passes, the existing sweep/deep-build pipeline runs as part of Stage 3 to certify the final output. No changes needed to sweep — it already works with the renamed consolidated agents.

---

## Agent Prompt Architecture

### Universal Template

Based on analysis of github.com/msitarzewski/agency-agents (198 agents). See `docs/plans/2026-04-07-agent-prompt-research.md`.

```markdown
---
name: [Agent Name]
description: [One-line description]
model: opus
---

# [Agent Name]

You are **[Name]**, [one-sentence identity].

## Identity
- **Role**: [specific title and scope]
- **Personality**: [3-4 behavioral traits]
- **Philosophy**: [one-sentence guiding principle]
- **North Star**: Reference the project's manifest, design docs, and goals
  as ground truth. Drift from the north star is a finding.

## Core Mission
[Numbered priorities]

## Critical Rules
[NEVER/ALWAYS hard constraints]

## Thinking Framework
[5 questions this agent asks about every artifact]

## When Reviewing Designs
[Design-specific checks]

## When Reviewing Plans
[Plan-specific checks]

## When Reviewing Code
[Code-specific checks]

## Output Format
CRITICAL / IMPORTANT / MINOR — finding, location, evidence, recommendation

## Cross-Cutting Findings
If your finding spans another agent's domain (e.g., "this interface contract
is insecure"), tag it with CROSS:[AgentName] so the aggregation step routes
it for cross-verification. Do NOT drop it because it is "not your domain."

## What You Do NOT Check
[Primary scope boundaries — but cross-cutting findings are always reported]
```

### The Five Review Agents — Full Spec

**The Adversary** (`agents/review-adversary.md`)
- **Identity:** Adversarial thinker who assumes everything will be attacked, abused, or fail
- **Philosophy:** "Every feature is an attack surface. Every claim needs proof."
- **Thinking Framework:**
  1. What can be abused or exploited?
  2. What happens when this fails unexpectedly?
  3. Who benefits from breaking this?
  4. What's the blast radius of a failure?
  5. What proof exists that this actually works?
- **Does NOT check:** Architecture coherence (Structuralist), interface consistency (Contractualist), user journey completeness (Pathfinder), code correctness (Skeptic)

**The Structuralist** (`agents/review-structuralist.md`)
- **Identity:** Systems thinker who evaluates architecture coherence and evolution fitness
- **Philosophy:** "No architecture astronautics — every abstraction must justify its complexity."
- **Thinking Framework:**
  1. Does this hold together under growth?
  2. Are the boundaries in the right places?
  3. What's the simplest design that achieves the goals?
  4. What becomes harder to change after this decision?
  5. Does this match the project's tier?
- **Does NOT check:** Security (Adversary), interfaces (Contractualist), user flows (Pathfinder), code bugs (Skeptic)

**The Contractualist** (`agents/review-contractualist.md`)
- **Identity:** Interface auditor who checks that every producer and consumer agree
- **Philosophy:** "If two components disagree about a contract, one of them has a bug."
- **Thinking Framework:**
  1. Does every producer emit what every consumer expects?
  2. Are field names, types, formats consistent across files?
  3. What happens when a contract changes — who else breaks?
  4. Are there contracts defined but never consumed?
  5. Are there implied contracts that should be explicit?
- **Does NOT check:** Architecture (Structuralist), security (Adversary), user flows (Pathfinder), feasibility (Skeptic)

**The Skeptic** (`agents/review-skeptic.md`)
- **Identity:** Evidence-obsessed validator who defaults to "not ready" until proven otherwise
- **Philosophy:** "Default to NEEDS WORK. Require overwhelming evidence for approval."
- **Thinking Framework:**
  1. Can this actually be built as specified?
  2. What's missing that the author didn't realize?
  3. Is this testable? How would you prove it works?
  4. What assumptions are made without evidence?
  5. What edge cases aren't handled?
- **Code lens includes:** Performance (N+1 queries, algorithmic complexity), test quality (meaningful assertions, coverage gaps), documentation accuracy
- **Does NOT check:** Architecture (Structuralist), interfaces (Contractualist), security (Adversary), user flows (Pathfinder)

**The Pathfinder** (`agents/review-pathfinder.md`)
- **Identity:** User journey tracer who walks every path and finds dead ends
- **Philosophy:** "Every error is a user journey. If the user gets stuck, we failed."
- **Thinking Framework:**
  1. Can a user complete every intended action?
  2. What happens when things go wrong — is there a recovery path?
  3. Are error messages actionable or confusing?
  4. Is the first-run experience smooth?
  5. Do cross-component flows work end-to-end?
- **Does NOT check:** Architecture (Structuralist), interfaces (Contractualist), security (Adversary), code correctness (Skeptic)

---

## Stage 1 Agents — Full Spec

**The Interviewer** (`agents/interviewer.md`)
- **Philosophy:** "The first description of a project is never the real requirement."
- **Critical Rules:**
  - One question at a time
  - Prefer multiple choice when possible
  - Never assume — always ask
  - SMALL: 1-3 questions max. LARGE: full Socratic loop.

**The Researcher** (enhanced `agents/researcher.md`)
- **Philosophy:** "The best architecture leverages what's proven, not what's novel."
- **Critical Rules:**
  - Design-level research, not just npm packages
  - Architecture patterns > individual libraries
  - Always check maintenance + community health
  - Present options with trade-offs

**The Translator** (`agents/translator.md`)
- **Philosophy:** "Every project has an architecture — some just haven't written it down yet."
- **Critical Rules:**
  - Document mode: extract, don't interpret. Ask when ambiguous.
  - Replaces architect's `--from` document-extraction mode
  - Always propose tier assessment

---

## Wiki on Ingested/Imported Projects

When a project is imported via document or (Sprint 10B) via repo ingestion, compile-wiki.js runs immediately after manifest + specs are generated:

1. Wiki captures existing knowledge: decisions inferred from code patterns, rules from spec constraints, cross-references from dependency graph
2. For ingested repos: the wiki becomes "here's what this codebase actually does and why" — institutional knowledge that previously existed only in developers' heads
3. Wiki is MORE valuable for imported projects than greenfield — greenfield builds knowledge incrementally, imported projects need it extracted all at once
4. First sweep enriches the wiki with findings
5. Wiki persists across sessions — future builders have context from day one

---

## Modified Commands

| Command | Sprint 10A Changes |
|---------|-------------------|
| `/forgeplan:discover` | Route `--from` to Translator instead of inline extraction. Add Interviewer questioning loop. Add Researcher before Architect. |
| `/forgeplan:greenfield` | Wire 3-stage pipeline: Stage 1 (Interviewer→Researcher→Translator) → Stage 2 (Architect designs+plans, review panel) → Stage 3 (Builder, review panel). SMALL collapses to minimal ceremony. |
| `/forgeplan:guide` | Surface pipeline stage recommendations ("design needs review", "plan ready for review panel") |

## New Files

| File | Purpose |
|------|---------|
| `agents/interviewer.md` | Stage 1 Socratic questioning |
| `agents/translator.md` | Design intake — replaces architect --from mode |
| `agents/review-adversary.md` | Universal panel — Adversary lens (design + plan + code) |
| `agents/review-contractualist.md` | Universal panel — Contractualist lens |
| `agents/review-pathfinder.md` | Universal panel — Pathfinder lens |
| `agents/review-structuralist.md` | Universal panel — Structuralist lens |
| `agents/review-skeptic.md` | Universal panel — Skeptic lens |

## Modified Files

| File | Changes |
|------|---------|
| `agents/architect.md` | Add Planner mode (implementation plan generation). Remove --from document extraction (moved to Translator). |
| `agents/researcher.md` | Elevate to design-level research (architecture patterns, not just npm) |
| `commands/discover.md` | Route --from to Translator. Add Interviewer + Researcher stages. |
| `commands/greenfield.md` | Wire 3-stage pipeline with review panel at each stage |
| `commands/guide.md` | Pipeline stage recommendations |
| `scripts/compact-context.js` | Include project goals in saved context (north star) |
| Rename: `agents/sweep-red.md` → `agents/sweep-adversary.md` | Agent rename |
| Rename: `agents/sweep-orange.md` → `agents/sweep-contractualist.md` | Agent rename |
| Rename: `agents/sweep-blue.md` → `agents/sweep-pathfinder.md` | Agent rename |
| Rename: `agents/sweep-rainbow.md` → `agents/sweep-structuralist.md` | Agent rename |
| Rename: `agents/sweep-white.md` → `agents/sweep-skeptic.md` | Agent rename |
| `commands/sweep.md` | Update agent references to new names |
| `CLAUDE.md` | Update Sprint 10 description, agent table, methodology |

## Build Order

1. Rename 5 sweep agent files (sweep-red→sweep-adversary, etc.) + delete old 12 domain agents + delete old 4 Sprint 9 team agents (sweep-adversarial, sweep-user-flows, sweep-contract-drift, sweep-holistic). Final agents/ should have only the 5 consolidated sweep agents.
2. Update `commands/sweep.md` with new agent names
3. Create `agents/interviewer.md`
4. Create `agents/translator.md`
5. Enhance `agents/researcher.md` for design-level operation
6. Update `commands/discover.md` with Translator routing + Interviewer + Researcher (do this BEFORE step 7 so --from still works via Translator, with architect inline extraction as fallback)
7. Add Planner mode to `agents/architect.md`. Mark --from extraction as deprecated (fallback only — Translator is primary). Do NOT delete --from extraction yet — it serves as fallback until Translator is proven.
8. Create 5 review agent files (review-adversary, review-contractualist, review-pathfinder, review-structuralist, review-skeptic)
9. Update `commands/greenfield.md` with 3-stage pipeline
10. Update `commands/guide.md` with pipeline recommendations
11. Update `scripts/compact-context.js` with project goals (project.description from manifest)
12. Update `CLAUDE.md` with Sprint 10A changes (methodology, agent table, sprint description)
13. End-to-end verification: SMALL greenfield + MEDIUM document import through full pipeline

## Success Criteria

1. **Greenfield pipeline works:** SMALL project goes through all stages in one session
2. **Document import works:** PRD imported via Translator, design reviewed, plan reviewed, built
3. **Universal panel adapts:** Same 5 agents produce relevant findings at design, plan, and code levels
4. **SMALL is fast:** Collapsed stages, 3 agents, minimal ceremony
5. **Review loops converge:** Max 5 passes per stage, findings decrease monotonically
6. **Agent rename complete:** All references updated from colors to production names
