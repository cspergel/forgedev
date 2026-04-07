# Agent Prompt Research: agency-agents Patterns for ForgePlan

**Source:** https://github.com/msitarzewski/agency-agents (198 agent files)
**Purpose:** Extract prompt engineering patterns to improve ForgePlan's design review agents
**Date:** 2026-04-07

---

## Key Patterns Worth Adopting

### 1. Identity Block (every agent has this)

```markdown
## Your Identity & Memory
- **Role**: [specific title]
- **Personality**: [3-4 traits that guide behavior]
- **Memory**: [what patterns/failures this agent remembers]
- **Experience**: [what gives this agent authority]
```

**Why this matters:** Our current agents jump straight to "what to do." The identity block creates a PERSONA that shapes HOW the agent thinks, not just what it checks. A "skeptical, evidence-obsessed" agent behaves differently from a "constructive, educational" one — even when reviewing the same artifact.

**ForgePlan adoption:** Every agent (Interviewer, Translator, Structuralist, Contractualist, Skeptic, Pathfinder, Adversary) should have an identity block.

### 2. Core Mission as Numbered Priorities

```markdown
## Your Core Mission
1. **First priority** — most important thing
2. **Second priority** — next most important
3. **Third priority** — next
```

**Why:** Forces the agent to prioritize. When two findings conflict, the numbering resolves it. Our current agents list checks without priority ordering.

### 3. Critical Rules as Hard Constraints

```markdown
## Critical Rules
1. **Never [bad thing]** — [why]
2. **Always [requirement]** — [consequence of violation]
```

**Why:** The Security Engineer has 8 hard rules like "Never recommend disabling security controls" and "All user input is hostile." These are ABSOLUTE — no exceptions. Our agents have soft guidance ("consider", "should") where they need hard constraints.

### 4. Priority Markers on Findings

The Code Reviewer uses: 🔴 blocker, 🟡 suggestion, 💭 nit

**Why:** Forces structured output that the pipeline can parse. Our agents return unstructured findings that require manual categorization.

**ForgePlan adoption:** Every review agent should use: CRITICAL / IMPORTANT / MINOR (we already do this in practice, but it's not in the agent prompts).

### 5. Deliverable Templates

Every agent defines its output format explicitly:

```markdown
## Your Technical Deliverables
1. [Artifact name] — [what it contains]
2. [Artifact name] — [what it contains]
```

**Why:** Removes ambiguity about what the agent produces. Our agents sometimes produce inconsistent output formats.

### 6. "Vibe" Line in Frontmatter

```yaml
vibe: Defaults to "NEEDS WORK" — requires overwhelming proof for production readiness.
```

**Why:** One-sentence personality distillation. Forces the prompt author to crystallize the agent's core behavior in 10 words.

### 7. Adversarial Thinking Framework

The Security Engineer has an explicit framework:
1. What can be abused?
2. What happens when this fails?
3. Who benefits from breaking this?
4. What's the blast radius?

**Why:** Turns vague "think about security" into a repeatable 4-question methodology. Each question produces specific findings.

**ForgePlan adoption:** Each review agent should have a similar thinking framework specific to its lens.

### 8. Orchestrator Pipeline State Management

The Agents Orchestrator tracks:
- Current task, phase, completion status
- Context passed between agents
- Retry limits with escalation
- Decision records

**Why:** Relevant for our pipeline orchestration across 4 stages.

---

## Patterns We Should NOT Adopt

1. **Emoji-heavy formatting** — Their agents use 🧠🎯🔧📋 headers. We use clean markdown. Our style is better for readability in CLI output.

2. **Bash-heavy agent instructions** — Their orchestrator uses literal bash commands. Our agents operate through Claude's tool system (Read, Write, Agent, Bash). Different paradigm.

3. **UI-specific testing** — Their Reality Checker uses Playwright screenshots. We test at the architecture/spec level, not the pixel level (that's Sprint 11+ standalone app territory).

---

## Recommended Agent Prompt Structure for ForgePlan

Based on the research, here's the template every ForgePlan agent should follow:

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
- **North Star**: Always reference the project's manifest, design docs, and goals as ground truth. Drift from the north star is a finding, not a feature.

## Core Mission

[Numbered list of priorities in order of importance]

## Critical Rules

[Hard constraints — things this agent must NEVER or ALWAYS do]

## Thinking Framework

[3-5 questions this agent asks about every artifact it reviews]

## [Stage-Specific Section]

### When Reviewing Designs
[What to check, what to output]

### When Reviewing Plans
[What to check, what to output]

### When Reviewing Code
[What to check, what to output]

### When Reviewing Cross-Phase Boundaries
[What to check at phase transitions]

## Output Format

[Exact format for findings — CRITICAL / IMPORTANT / MINOR with required fields]

## What You Do NOT Check

[Explicit scope boundaries — what belongs to other agents]
```

---

## Mapping to ForgePlan Agents

### The Adversary (Red in current color scheme)

**Inspired by:** Security Engineer + Reality Checker
**Identity:** Adversarial thinker who assumes everything will be attacked, abused, or fail
**Philosophy:** "Every feature is an attack surface. Every claim needs proof."
**Thinking Framework:**
1. What can be abused or exploited?
2. What happens when this fails unexpectedly?
3. Who benefits from breaking this?
4. What's the blast radius of a failure?
5. What proof exists that this actually works?

### The Structuralist (Rainbow in current color scheme)

**Inspired by:** Software Architect
**Identity:** Systems thinker who evaluates architecture coherence and evolution fitness
**Philosophy:** "No architecture astronautics — every abstraction must justify its complexity."
**Thinking Framework:**
1. Does this architecture hold together under growth?
2. Are the boundaries in the right places?
3. What's the simplest design that achieves the goals?
4. What becomes harder to change after this decision?
5. Does this match the project's tier and phase?

### The Contractualist (Orange in current color scheme)

**Inspired by:** Code Reviewer (contract focus)
**Identity:** Interface auditor who checks that every producer and consumer agree
**Philosophy:** "If two components disagree about a contract, one of them has a bug."
**Thinking Framework:**
1. Does every producer emit what every consumer expects?
2. Are field names, types, and formats consistent across files?
3. What happens when a contract changes — who else breaks?
4. Are there contracts that are defined but never consumed?
5. Are there implied contracts that should be explicit?

### The Skeptic (White in current color scheme)

**Inspired by:** Reality Checker
**Identity:** Evidence-obsessed validator who defaults to "not ready" until proven otherwise
**Philosophy:** "Default to NEEDS WORK. Require overwhelming evidence for approval."
**Thinking Framework:**
1. Can this actually be built as specified?
2. What's missing that the author didn't realize?
3. Is this testable? How would you prove it works?
4. What assumptions are being made without evidence?
5. What edge cases aren't handled?

### The Pathfinder (Blue in current color scheme)

**Inspired by:** UX Architect + Code Reviewer (user flow focus)
**Identity:** User journey tracer who walks every path and finds dead ends
**Philosophy:** "Every error is a user journey. If the user gets stuck, we failed."
**Thinking Framework:**
1. Can a user complete every intended action?
2. What happens when things go wrong — is there a recovery path?
3. Are error messages actionable or confusing?
4. Is the first-run experience smooth?
5. Do cross-component flows work end-to-end?

---

## What This Means for Sprint 10

1. **Rewrite all 5 review agent prompts** using the template above
2. **Each agent gets 4 sections:** design lens, plan lens, code lens, cross-phase lens
3. **Identity blocks give agents personality** that shapes behavior, not just checklists
4. **Thinking frameworks make review systematic** — every agent asks 5 specific questions
5. **North star anchoring baked into every agent** — "always reference manifest/design/goals"
6. **Output format standardized** — CRITICAL / IMPORTANT / MINOR with required fields
7. **Scope boundaries explicit** — "What You Do NOT Check" prevents overlap
