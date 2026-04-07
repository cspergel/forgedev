# Sprint 10A Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Formalize the 3-stage design-to-build pipeline with the universal review panel (Adversary, Contractualist, Pathfinder, Structuralist, Skeptic). Rename agents from colors to production names. Add Stage 1 agents (Interviewer, Translator, enhanced Researcher).

**Architecture:** 3 stages (Discovery → Design+Plan → Build). Universal review panel adapts via dispatch context (design/plan/code lens). SMALL skips Stage 1 for greenfield (exception: --from activates Translator). Planner is a mode of the Architect. Review panel orchestration is inline in dispatching commands.

**Tech Stack:** Claude Code plugin markdown commands/agents, Node.js scripts. No new dependencies.

**Design doc:** `docs/plans/2026-04-07-sprint10a-design.md` — READ THIS FIRST.

---

## Batch 1: Agent Rename + Archive (foundational — sweep must work before anything else)

### Task 1: Rename 5 consolidated sweep agents

**Files:**
- Rename: `agents/sweep-red.md` → `agents/sweep-adversary.md`
- Rename: `agents/sweep-orange.md` → `agents/sweep-contractualist.md`
- Rename: `agents/sweep-blue.md` → `agents/sweep-pathfinder.md`
- Rename: `agents/sweep-rainbow.md` → `agents/sweep-structuralist.md`
- Rename: `agents/sweep-white.md` → `agents/sweep-skeptic.md`

**Step 1: Rename each file**

Use `git mv` for each rename to preserve history:
```bash
git mv agents/sweep-red.md agents/sweep-adversary.md
git mv agents/sweep-orange.md agents/sweep-contractualist.md
git mv agents/sweep-blue.md agents/sweep-pathfinder.md
git mv agents/sweep-rainbow.md agents/sweep-structuralist.md
git mv agents/sweep-white.md agents/sweep-skeptic.md
```

**Step 2: Update agent name references inside each renamed file**

In each file, update the frontmatter `name:` field and any self-references:
- `sweep-adversary.md`: name from `sweep-red` → `sweep-adversary`
- `sweep-contractualist.md`: name from `sweep-orange` → `sweep-contractualist`
- `sweep-pathfinder.md`: name from `sweep-blue` → `sweep-pathfinder`
- `sweep-structuralist.md`: name from `sweep-rainbow` → `sweep-structuralist`
- `sweep-skeptic.md`: name from `sweep-white` → `sweep-skeptic`

**Step 3: Commit**

```bash
git add agents/sweep-adversary.md agents/sweep-contractualist.md agents/sweep-pathfinder.md agents/sweep-structuralist.md agents/sweep-skeptic.md
git commit -m "refactor(sprint10a): rename sweep agents from colors to production names"
```

---

### Task 2: Update sweep.md with new agent names

**Files:**
- Modify: `commands/sweep.md`

**Step 1: Find and replace all color agent references**

Replace throughout sweep.md:
- `sweep-red` → `sweep-adversary`
- `sweep-orange` → `sweep-contractualist`
- `sweep-blue` → `sweep-pathfinder`
- `sweep-rainbow` → `sweep-structuralist`
- `sweep-white` → `sweep-skeptic`

Also update `agent_convergence` key examples in any code/JSON blocks.

Also update the description in frontmatter if it references colors.

**Step 2: Verify all old names are gone**

```bash
node -e "var f=require('fs').readFileSync('commands/sweep.md','utf-8'); var old=['sweep-red','sweep-orange','sweep-blue','sweep-rainbow','sweep-white']; for(var o of old){if(f.includes(o))console.log('STILL PRESENT:',o)} console.log('done')"
```
Expected: only "done" (no old names found)

**Step 3: Commit**

```bash
git add commands/sweep.md
git commit -m "refactor(sprint10a): update sweep.md with production agent names"
```

---

### Task 3: Archive old agents + update .gitignore

**Files:**
- Move: 16 old agent files to `agents/archived/`
- Modify: `.gitignore`

**Step 1: Create archived directory and move old agents**

```bash
mkdir -p agents/archived
git mv agents/sweep-auth-security.md agents/archived/
git mv agents/sweep-type-consistency.md agents/archived/
git mv agents/sweep-error-handling.md agents/archived/
git mv agents/sweep-database.md agents/archived/
git mv agents/sweep-api-contracts.md agents/archived/
git mv agents/sweep-imports.md agents/archived/
git mv agents/sweep-code-quality.md agents/archived/
git mv agents/sweep-test-quality.md agents/archived/
git mv agents/sweep-config-environment.md agents/archived/
git mv agents/sweep-frontend-ux.md agents/archived/
git mv agents/sweep-documentation.md agents/archived/
git mv agents/sweep-cross-node-integration.md agents/archived/
git mv agents/sweep-adversarial.md agents/archived/
git mv agents/sweep-user-flows.md agents/archived/
git mv agents/sweep-contract-drift.md agents/archived/
git mv agents/sweep-holistic.md agents/archived/
```

**Step 2: Add agents/archived/ to .gitignore**

Add to `.gitignore`:
```
agents/archived/
```

**Step 3: Verify no command references the archived agents**

```bash
node -e "var fs=require('fs');var old=['sweep-auth-security','sweep-type-consistency','sweep-error-handling','sweep-database','sweep-api-contracts','sweep-imports','sweep-code-quality','sweep-test-quality','sweep-config-environment','sweep-frontend-ux','sweep-documentation','sweep-cross-node-integration','sweep-adversarial','sweep-user-flows','sweep-contract-drift','sweep-holistic'];var files=['commands/sweep.md','commands/deep-build.md','commands/guide.md','CLAUDE.md'];for(var file of files){var c=fs.readFileSync(file,'utf-8');for(var o of old){if(c.includes(o))console.log('FOUND',o,'in',file)}}console.log('check done')"
```
Expected: "check done" only. If any old names found in active files, update those files.

**Step 4: Commit**

```bash
git add agents/archived/ .gitignore
git commit -m "refactor(sprint10a): archive 16 old agents, add agents/archived/ to .gitignore"
```

---

## Batch 2: Stage 1 Agents (Interviewer, Translator, enhanced Researcher)

### Task 4: Create Interviewer agent

**Files:**
- Create: `agents/interviewer.md`

**Step 1: Write the agent file**

Follow the universal template from the design doc (10A lines 128-175) and agent-prompt-research.md:

```markdown
---
name: interviewer
description: Socratic questioning agent that extracts real requirements through structured dialogue. Identifies ambiguities, contradictions, and unstated assumptions before design begins.
model: opus
---

# The Interviewer

You are **The Interviewer**, a Socratic guide who reveals what the user actually needs through careful questioning.

## Identity
- **Role**: Requirements extraction and clarification specialist
- **Personality**: Curious, methodical, patient, assumption-challenging
- **Philosophy**: "The first description of a project is never the real requirement."
- **North Star**: Reference the project's manifest, design docs, and goals as ground truth. Drift from the north star is a finding.

## Core Mission
1. Extract the TRUE goal (not just the stated one)
2. Identify contradictions and ambiguities
3. Uncover unstated assumptions
4. Establish success criteria
5. Determine complexity tier inputs (auth, data, integrations, scale)

## Critical Rules
1. **One question at a time** — never overwhelm with multiple questions
2. **Prefer multiple choice** when possible — easier to answer than open-ended
3. **Never assume** — always ask when unclear
4. **Document assumptions** — if you must proceed without an answer, write it down
5. **Tier gate:** SMALL greenfield skips the Interviewer entirely. SMALL --from: only run if Translator flags ambiguities.
6. **Loop until zero ambiguities** — but respect max question limits (MEDIUM: 5-8 questions, LARGE: 10-15 questions)

## Thinking Framework
1. What is the user ACTUALLY trying to achieve? (vs what they said)
2. Who are the users of this system and what do they need?
3. What are the non-obvious constraints? (budget, timeline, compliance, team size)
4. What has the user NOT mentioned that they will need? (auth, error handling, deployment)
5. Is the stated complexity realistic for the described goals?

## Process

### For Greenfield (no --from)
1. Read the user's project description
2. Identify the top 3-5 ambiguities or unstated assumptions
3. Ask ONE question at a time, starting with the highest-impact ambiguity
4. After each answer, update your understanding and identify the next question
5. When no ambiguities remain, summarize: "Here's what I understand: [summary]. Correct?"
6. Output: clear requirements document for the Researcher and Architect

### For Document Import (--from, dispatched after Translator)
1. Read the Translator's output (JSON mapping with `ambiguities` array)
2. If `ambiguities` is empty: skip (no questions needed)
3. If `ambiguities` is non-empty: ask about each ambiguity, one at a time
4. Output: resolved ambiguities added to the Translator's mapping

## Output Format
Structured requirements summary:
- Project goal (one sentence)
- User roles and their needs
- Core features (numbered, prioritized)
- Technical constraints
- Non-goals (what this is NOT)
- Resolved ambiguities
- Remaining assumptions (documented)
```

**Step 2: Commit**

```bash
git add agents/interviewer.md
git commit -m "feat(sprint10a): create Interviewer agent — Socratic requirements extraction"
```

---

### Task 5: Create Translator agent

**Files:**
- Create: `agents/translator.md`

**Step 1: Write the agent file**

This agent handles document intake AND (Sprint 10B) repo scanning. The output schema is defined in the design doc (10A lines 70-109).

```markdown
---
name: translator
description: Design Intake agent that maps external documents (PRDs, brainstorms, chat exports) to ForgePlan methodology. Outputs structured JSON mapping with proposed nodes, shared models, tier, and dependencies.
model: opus
---

# The Translator

You are **The Translator**, a methodology bridge that maps any input format to ForgePlan's architecture-down model.

## Identity
- **Role**: Design intake and methodology mapping specialist
- **Personality**: Precise, systematic, gap-aware, format-agnostic
- **Philosophy**: "Every project has an architecture — some just haven't written it down yet."
- **North Star**: The ForgePlan manifest is the target format. Map everything to nodes, shared models, phases, and tier.

## Core Mission
1. Map input (document/brainstorm/chat export) to ForgePlan nodes and shared models
2. Identify gaps the source didn't address
3. Propose tier assessment based on complexity dimensions
4. Flag ambiguities for the Interviewer (output in `ambiguities` array)

## Critical Rules
1. **Extract, don't interpret** — when the source is unclear, flag it as an ambiguity rather than guessing
2. **Every entity referenced by 2+ proposed nodes MUST be a shared model** — same rule as the Architect
3. **Always propose tier assessment** — use the same complexity dimensions as the Architect (auth, data, integrations, infrastructure, domain, scale)
4. **Replaces architect's --from mode** — you are the primary handler for document imports. Architect inline extraction is the degraded fallback only.
5. **If Translator dispatch fails** (timeout, error, empty output): the calling command falls back to Architect inline extraction with warning "Translator unavailable, using inline extraction."

## Thinking Framework
1. What are the distinct functional areas? (→ nodes)
2. What data entities are shared across areas? (→ shared models)
3. What is the complexity of each dimension? (→ tier)
4. What dependencies exist between areas? (→ depends_on, connects_to)
5. What is NOT addressed in the source? (→ ambiguities)

## Output Schema

You MUST output valid JSON matching this schema:

```json
{
  "project_name": "string — extracted from source or inferred",
  "tier_assessment": "SMALL | MEDIUM | LARGE",
  "tier_reasoning": "string — why this tier",
  "proposed_nodes": [
    {
      "id": "string — kebab-case, e.g., 'auth-service'",
      "name": "string — human-readable",
      "type": "service | frontend | database | storage | integration | cli | library | extension | worker | pipeline",
      "file_scope": "string — proposed glob, e.g., 'src/auth/**'",
      "phase": 1,
      "depends_on": ["string — other node IDs"],
      "connects_to": ["string — other node IDs"]
    }
  ],
  "shared_models": [
    {
      "name": "string — e.g., 'User'",
      "fields": ["string — field names"],
      "used_by": ["string — node IDs"]
    }
  ],
  "tech_stack": {
    "runtime": "string",
    "framework": "string",
    "database": "string",
    "test_framework": "string"
  },
  "ambiguities": [
    "string — each ambiguity as a question for the Interviewer"
  ],
  "source": "document"
}
```

## Document Mode Process
1. Read the entire input document
2. Extract: project name, user roles, core features, data entities, tech preferences, integrations, constraints
3. Map features to proposed nodes (group by functional area)
4. Identify shared entities (referenced by 2+ nodes)
5. Assess tier from complexity dimensions
6. Flag unclear items as ambiguities
7. Output the JSON schema above

## What You Do NOT Do
- Do NOT generate manifest.yaml — the Architect does that from your mapping
- Do NOT generate specs — the Architect does that
- Do NOT make architectural decisions — you propose structure, the Architect decides
- Do NOT resolve ambiguities yourself — flag them for the Interviewer
```

**Step 2: Commit**

```bash
git add agents/translator.md
git commit -m "feat(sprint10a): create Translator agent — design intake with JSON output schema"
```

---

### Task 6: Enhance Researcher for design-level operation

**Files:**
- Modify: `agents/researcher.md`

**Step 1: Add design-level research section**

Read the current `agents/researcher.md`. Add a section at the top clarifying the enhanced scope:

```markdown
## Design-Level Research (Sprint 10A)

When dispatched during Stage 1 (before design decisions are made), focus on ARCHITECTURE-level research, not just package search:

1. **Architecture patterns:** How do similar products structure their codebase? Monolith vs microservices vs modular monolith? What patterns work for this domain?
2. **Prior art:** Are there open-source projects solving the same problem? What can we learn from their architecture? Can we use parts of them?
3. **Build vs buy:** For each major component (auth, payments, file storage, etc.), is there a proven service/library or should we build custom?
4. **Tech stack validation:** Does the proposed stack (from Translator output) match industry best practices for this type of project?

The ecosystem search (npm packages, GitHub repos, license checking) still runs as before — design-level research is ADDITIONAL context, not a replacement.
```

**Step 2: Commit**

```bash
git add agents/researcher.md
git commit -m "feat(sprint10a): enhance Researcher for design-level architecture research"
```

---

### Task 7: Update discover.md with Translator routing

**Files:**
- Modify: `commands/discover.md`

**Step 1: Add Translator routing for --from**

Find the section in discover.md that handles `--from` (around line 60-78). Add routing logic:

```markdown
### Document Import via Translator (Sprint 10A)

When `--from` is provided:
1. Dispatch the Translator agent (read `agents/translator.md`) with the document content
2. Translator outputs structured JSON mapping (see Translator Output Schema in design doc)
3. If Translator dispatch fails (timeout, error, empty output): fall back to Architect inline extraction with warning "Translator unavailable, using inline extraction"
4. If `ambiguities` array is non-empty AND tier is not SMALL: dispatch Interviewer to resolve them
5. Dispatch Researcher for ecosystem context (skip for SMALL tier)
6. Pass the Translator mapping + research context + resolved ambiguities to the Architect
7. Architect generates manifest + skeleton specs from the mapping (existing behavior, new input format)
```

**Step 2: Commit**

```bash
git add commands/discover.md
git commit -m "feat(sprint10a): route --from to Translator with Interviewer + Researcher stages"
```

---

### Task 8: Add Planner mode to Architect

**Files:**
- Modify: `agents/architect.md`

**Step 1: Add Planner mode section**

After the existing content in architect.md, add:

```markdown
## Planner Mode (Sprint 10A)

When invoked in Planner mode (by greenfield.md or deep-build.md after design is reviewed):

Your task is to produce an **implementation plan** from the reviewed design document.

### Implementation Plan Format
- Markdown document at `.forgeplan/plans/implementation-plan.md`
- Tasks listed per node in dependency order
- Each task includes: files to create/modify, key code patterns, verification steps
- Tasks batched into groups of 3-5 for review checkpoints
- References the design doc as the authoritative spec

### Process
1. Read the reviewed design document
2. For each node (in dependency order from manifest):
   a. List the files to create based on file_scope and tech_stack
   b. Identify key implementation patterns from research context
   c. Define acceptance criteria verification steps
3. Group tasks into batches
4. Output the implementation plan

### Tier Adaptation
- **SMALL:** Design + plan in a single pass (one combined artifact)
- **MEDIUM/LARGE:** Separate design doc and implementation plan
```

**Step 2: Mark --from extraction as deprecated fallback**

Find the Document-Extraction Mode section in architect.md. Add a note at the top:

```markdown
> **Sprint 10A:** This section is now a DEGRADED FALLBACK. The primary handler for `--from` document import is the Translator agent (`agents/translator.md`). This inline extraction mode only activates if the Translator dispatch fails. Do not remove this section — it is the safety net.
```

**Step 3: Commit**

```bash
git add agents/architect.md
git commit -m "feat(sprint10a): add Planner mode to Architect, deprecate --from extraction as fallback"
```

---

## Batch 3: Universal Review Panel (5 review agents)

### Task 9: Create 5 review agent files

**Files:**
- Create: `agents/review-adversary.md`
- Create: `agents/review-contractualist.md`
- Create: `agents/review-pathfinder.md`
- Create: `agents/review-structuralist.md`
- Create: `agents/review-skeptic.md`

Each file follows the universal template from the design doc (10A lines 128-175) with the agent-specific thinking framework (10A lines 187-301).

**Step 1: Create all 5 files**

Each review agent has this structure:
```markdown
---
name: review-[name]
description: [one-line from design doc]
model: opus
---

# The [Name]

You are **The [Name]**, [identity from design doc].

## Identity
[From design doc Pillar 5]

## Core Mission
[From design doc]

## Critical Rules
[From design doc]

## Thinking Framework
[5 questions from design doc]

## When Reviewing Designs
[Design lens from design doc table]

## When Reviewing Plans
[Plan lens from design doc table]

## When Reviewing Code
[Code lens from design doc table]

## Cross-Cutting Findings
If your finding spans another agent's domain, tag it with CROSS:[AgentName].
Do NOT drop it because it is "not your domain."

## Output Format
CRITICAL / IMPORTANT / MINOR — finding, location, evidence, recommendation

## What You Do NOT Check
[Scope boundaries from design doc — PRIMARY focus only. Cross-cutting findings always reported.]
```

The specific content for each agent comes from the design doc lines 187-301. Each agent's thinking framework, identity, philosophy, and scope boundaries are fully specified there. Read the design doc and implement each agent exactly as specified.

**Step 2: Verify all 5 files exist and have correct frontmatter**

```bash
for agent in adversary contractualist pathfinder structuralist skeptic; do
  echo "--- review-${agent}.md ---"
  head -5 "agents/review-${agent}.md"
done
```

**Step 3: Commit**

```bash
git add agents/review-adversary.md agents/review-contractualist.md agents/review-pathfinder.md agents/review-structuralist.md agents/review-skeptic.md
git commit -m "feat(sprint10a): create 5 universal review panel agents with 3 lens variants each"
```

---

## Batch 4: Command Wiring + Polish

### Task 10: Update greenfield.md with 3-stage pipeline

**Files:**
- Modify: `commands/greenfield.md`

**Step 1: Add review panel orchestration to greenfield**

The greenfield command needs to wire the 3-stage pipeline. Read the current `commands/greenfield.md` and add review panel dispatch at the appropriate points.

The orchestration logic (from 10A design):

```markdown
## Review Panel Dispatch (Sprint 10A)

After the Architect produces the design document (Stage 2), dispatch the review panel:

### For SMALL tier:
- Skip Stage 1 (no Interviewer/Researcher/Translator) unless --from is provided
- Architect produces design + plan in single pass
- Dispatch 3 review agents: review-structuralist, review-skeptic, review-adversary
- Include in each agent prompt: "You are reviewing a DESIGN+PLAN document for a SMALL project."
- If zero CRITICAL/IMPORTANT: proceed to build
- If findings: Architect fixes → re-dispatch (max 3 passes)
- If CRITICALs remain after 3 passes: HALT, surface to user

### For MEDIUM tier:
- Stage 1: Interviewer → Researcher → (Translator if --from)
- Stage 2a: Architect produces design → 4 agents review (design lens) → loop until clean (max 5)
- Stage 2b: Architect produces plan → 4 agents review (plan lens) → loop until clean (max 5)
- Stage 3: Build in batches → 4 agents review code per batch → loop until clean (max 5)

### For LARGE tier:
- Same as MEDIUM but all 5 agents at each stage

### Finding Aggregation
After each review pass:
1. Collect all agent outputs
2. Merge findings, deduplicate by location
3. Sort by severity (CRITICAL first)
4. Route CROSS:[AgentName] tags for next pass
5. Present consolidated list to Architect/Builder

### Circuit Breaker
- Max passes: SMALL=3, MEDIUM/LARGE=5
- CRITICALs after max passes → HALT (require user acknowledgment)
- IMPORTANTs after max passes → warnings, proceed
- Review panel HALT prevents downstream stages from starting
```

**Step 2: Commit**

```bash
git add commands/greenfield.md
git commit -m "feat(sprint10a): wire 3-stage pipeline with review panel into greenfield command"
```

---

### Task 11: Update guide.md with pipeline recommendations

**Files:**
- Modify: `commands/guide.md`

**Step 1: Add pipeline-aware recommendations**

Add a section to guide.md that surfaces pipeline stage recommendations:

```markdown
## Pipeline Stage Guidance (Sprint 10A)

If the project has a design document but it hasn't been reviewed:
  → "Your design document is ready for review. The universal review panel
     (Structuralist, Contractualist, Skeptic, Pathfinder, Adversary) will
     check architecture, interfaces, feasibility, user journeys, and security."

If the design is reviewed but no implementation plan exists:
  → "Design is reviewed and clean. Next: the Architect generates an
     implementation plan (Planner mode)."

If the plan exists but hasn't been reviewed:
  → "Implementation plan is ready for review by the same panel (plan lens)."

If the plan is reviewed and clean:
  → "Ready to build! Run /forgeplan:build or /forgeplan:deep-build."
```

**Step 2: Commit**

```bash
git add commands/guide.md
git commit -m "feat(sprint10a): add pipeline stage recommendations to guide"
```

---

### Task 12: Update compact-context.js with project goals

**Files:**
- Modify: `scripts/compact-context.js`

**Step 1: Add project goals to saved context**

In the preCompact sections, after the existing manifest summary (around line 73), add:

```javascript
// Sprint 10A: North Star — project goals
try {
  if (manifest && manifest.project && manifest.project.description) {
    sections.push("## Project Goals (North Star)");
    sections.push(`- **Goal:** ${manifest.project.description}`);
    if (manifest.project.complexity_tier) {
      sections.push(`- **Tier:** ${manifest.project.complexity_tier}`);
    }
    sections.push("");
  }
} catch {
  // Goals are optional context
}
```

**Step 2: Verify**

```bash
node --check scripts/compact-context.js && echo "syntax OK"
```

**Step 3: Commit**

```bash
git add scripts/compact-context.js
git commit -m "feat(sprint10a): add project goals (north star) to compact context"
```

---

### Task 13: Update CLAUDE.md with Sprint 10A

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the Sprint 10 section**

Replace the current Sprint 10 placeholder with:

```markdown
### Sprint 10A: Design Pipeline + Universal Review Panel (IN PROGRESS)
**Goal:** Formalize the 3-stage design-to-build pipeline. Make "architecture-down, sprint-forward, governance-continuous" the default workflow.

Deliverables: 3-stage pipeline (Discovery → Design+Plan → Build), universal review panel (5 agents: Adversary, Contractualist, Pathfinder, Structuralist, Skeptic), Stage 1 agents (Interviewer, Translator, enhanced Researcher), Planner-as-Architect-mode, agent rename from colors to production names, review panel orchestration in greenfield command.
```

**Step 2: Update the agent tables**

Update the sweep agent table to use new names. Add a review agent table:

```markdown
### 5 Sweep Agents (renamed from colors)
| Agent | Model | Domain |
|-------|-------|--------|
| sweep-adversary | opus | Security, adversarial inputs, abuse scenarios |
| sweep-contractualist | opus | Cross-file contracts, interface drift, enum consistency |
| sweep-pathfinder | opus | User journeys, error paths, recovery flows |
| sweep-structuralist | opus | Architecture coherence, decomposition, simplification |
| sweep-skeptic | opus | Feasibility, correctness, gaps, performance, test quality |

### 5 Review Agents (universal panel — design/plan/code lenses)
| Agent | Model | Domain |
|-------|-------|--------|
| review-adversary | opus | Security by design, abuse scenarios, scalability cliffs |
| review-contractualist | opus | Interface consistency, shared models, contract gaps |
| review-pathfinder | opus | User journey completeness, dead ends, onboarding |
| review-structuralist | opus | Architecture coherence, boundaries, over-engineering |
| review-skeptic | opus | Feasibility, edge cases, missing specs, assumptions |
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "feat(sprint10a): update CLAUDE.md with Sprint 10A — pipeline, agent names, methodology"
```

---

### Task 14: End-to-end verification

**Step 1: Verify all renamed sweep agents exist**

```bash
for agent in adversary contractualist pathfinder structuralist skeptic; do
  test -f "agents/sweep-${agent}.md" && echo "sweep-${agent}: EXISTS" || echo "sweep-${agent}: MISSING"
done
```

**Step 2: Verify all review agents exist**

```bash
for agent in adversary contractualist pathfinder structuralist skeptic; do
  test -f "agents/review-${agent}.md" && echo "review-${agent}: EXISTS" || echo "review-${agent}: MISSING"
done
```

**Step 3: Verify Stage 1 agents exist**

```bash
test -f "agents/interviewer.md" && echo "interviewer: EXISTS" || echo "interviewer: MISSING"
test -f "agents/translator.md" && echo "translator: EXISTS" || echo "translator: MISSING"
```

**Step 4: Verify no old agent names in active files**

```bash
node -e "var fs=require('fs');var old=['sweep-red','sweep-orange','sweep-blue','sweep-rainbow','sweep-white','sweep-adversarial','sweep-user-flows','sweep-contract-drift','sweep-holistic'];var files=require('child_process').execSync('find commands scripts CLAUDE.md -name \"*.md\" -o -name \"*.js\" 2>/dev/null',{encoding:'utf-8'}).trim().split('\n').filter(Boolean);var found=0;for(var file of files){try{var c=fs.readFileSync(file,'utf-8');for(var o of old){if(c.includes(o)){console.log('FOUND',o,'in',file);found++}}}catch(e){}}console.log(found?found+' stale references':'All clean')"
```

**Step 5: Verify all JS scripts still parse**

```bash
node --check scripts/compact-context.js && echo "compact-context: OK"
```

**Step 6: Commit verification results**

```bash
git add -p  # Stage only Sprint 10A files
git commit -m "feat(sprint10a): end-to-end verification complete"
```

---

## Summary

| Batch | Tasks | Files | Description |
|-------|-------|-------|-------------|
| 1: Agent Rename | 1-3 | 5 renamed + 16 archived + .gitignore | Colors → production names |
| 2: Stage 1 Agents | 4-8 | 3 new agents + 2 modified (discover, architect) | Interviewer, Translator, Researcher |
| 3: Review Panel | 9 | 5 new review agent files | Universal panel with 3 lenses each |
| 4: Command Wiring | 10-14 | 4 modified (greenfield, guide, compact-context, CLAUDE.md) | Pipeline orchestration + polish |

**Total: 14 tasks, 7 new files, ~16 modified files, 4 batches.**
**Critical path:** Task 1-2 (rename must work before anything else) → Task 9 (review agents) → Task 10 (greenfield wiring).
