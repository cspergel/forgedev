---
name: greenfield
description: Run the full greenfield pipeline from idea to certified app.
argument-hint: "[description|--from <file>]"
disable-model-invocation: true
---

# Greenfield Build

One command to go from idea to certified app. You describe what you want, confirm the architecture once, and ForgePlan handles the rest: discover → design review → research → spec → plan review → build → verify → review → sweep → certify.

**THIS COMMAND IS AUTONOMOUS AFTER ONE CONFIRMATION. Do not stop between steps to ask the user questions. Run straight through from discover to certified.**

## Process

### Step 0: Check for existing state (resume support)

Read the project directory to determine where to start:

1. If `.forgeplan/deep-build-report.md` exists AND `sweep_state` is null in state.json AND all nodes have status `"built"`, `"reviewed"`, or `"revised"` AND no node has `bounce_exhausted: true` → **project is already complete**. Present the final output and exit. If any node has `bounce_exhausted: true` with `unverified_acs`, log: "Project completed with unverified acceptance criteria on [node]. Run `/forgeplan:review [node]` to verify." Still present final output but include the warning.
2. If `sweep_state` is non-null in state.json → **deep-build was interrupted**. Auto-recover: execute the RESUME recovery logic from `/forgeplan:recover` directly — do NOT present the interactive menu, just perform the RESUME action for the current phase. Recovery will continue the pipeline to completion. After recovery finishes, re-enter Step 0 to check if the project is now complete. Log: "Interrupted deep-build detected — auto-recovering from [phase]."
3. If `.forgeplan/manifest.yaml` does NOT exist → start from Step 1 (discover)
4. If manifest exists but `.forgeplan/specs/` has no complete specs (specs have empty `test` fields in acceptance_criteria) → start from Step 2 (research) if `.forgeplan/research/` does not exist or contains no `.md` files, or Step 3 (spec) if research reports exist
5. If manifest exists and specs are complete but some nodes are `pending` or `specced` → start from Step 4 (deep-build)
6. If nodes are partially built → start from Step 4 (deep-build handles resume via next-node.js)

Log which step is being resumed: "Resuming greenfield from Step [N] — [reason]."

### Step 1: Discover (autonomous)

**Note:** Architect skill loading is handled by `discover.md` internally — it compiles architect skills and injects them into the Architect's prompt. No pre-loading needed here.

Run the discover command in autonomous mode. Pass through the user's arguments (project description or --from flag):

```
/forgeplan:discover --autonomous $ARGUMENTS
```

This will:
- Assess complexity tier and decompose into nodes
- Select tech stack with sensible defaults
- Default to mock mode for external services
- Present ONE confirmation summary to the user
- Generate manifest + skeleton specs after confirmation

If discover fails or the user rejects the architecture, halt greenfield. The user can modify and re-run.

#### Skill Registry Generation (Sprint 11)

After discover completes successfully, generate the full project skill registry (now that a manifest with tech_stack exists):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" generate
```
This pre-computes skill assignments for all agents based on the manifest's tech_stack and node types. The registry is read instantly during builds and sweeps — no per-dispatch computation needed.

### Step 1.5: Design Review (Sprint 10A)

After discover produces the manifest and skeleton specs, dispatch the universal review panel to review the design.

**Read the manifest to determine the tier, then dispatch review agents accordingly:**

| Tier | Agents | Max Passes |
|------|--------|------------|
| SMALL | review-adversary, review-skeptic, review-structuralist | 3 |
| MEDIUM | + review-contractualist | 5 |
| LARGE | + review-pathfinder | 5 |

**Review scope expansion:** When dispatching review agents, include not just the changed artifacts but also their downstream consumers. If a contract or schema changed, the review agents should read every file that consumes it. For code reviews: grep for imports/requires of changed modules. For design reviews: include all commands and scripts that operate on the reviewed concepts.

**Dispatch steps per pass:**
1. Dispatch N agents in parallel (via Agent tool). Each agent receives the prompt context: "You are reviewing a DESIGN document. Read the manifest at `.forgeplan/manifest.yaml` and skeleton specs in `.forgeplan/specs/`. Apply your design lens. Also check downstream consumers — any existing commands or scripts that would need to understand new concepts in this design."
2. Collect all agent outputs
3. Merge findings, deduplicate by location (same file+section = same finding), sort by severity (CRITICAL first)
4. Route CROSS:[AgentName] tags for next pass
5. If zero CRITICAL/IMPORTANT findings: proceed to Step 2
6. If findings remain: Architect fixes the manifest/specs → re-dispatch agents (loop back to step 1)

**Agent response validation:** For each agent response, check for CRITICAL/IMPORTANT/MINOR findings or explicit "clean/no findings." If neither: mark agent as failed, re-dispatch on next pass. A pass with only failed responses is NOT a clean pass.

**Circuit breaker:**
- CRITICALs after max passes → HALT the greenfield pipeline. Surface: "Design review found [N] unresolved CRITICALs after [passes] passes. Please review and resolve, then re-run `/forgeplan:greenfield` to resume from Step 1.5." Exit the command.
- IMPORTANTs after max passes → become warnings, proceed. Log warnings to the design review file.

**SMALL shortcut:** For SMALL greenfield (no --from), the Architect produces design + plan in a single pass during discover (written to `.forgeplan/plans/implementation-plan.md`). Step 1.5 reviews the combined design+plan with prompt context: "You are reviewing a DESIGN+PLAN document for a SMALL project."
- If zero CRITICAL/IMPORTANT: skip Step 3.5 entirely (plan already reviewed), proceed to Step 2 then Step 4
- If findings: Architect fixes → re-dispatch (max 3 passes). After convergence (zero CRITICAL/IMPORTANT), skip Step 3.5, proceed to Step 2 then Step 4.

**Severity vocabulary:** Review agents output CRITICAL/IMPORTANT/MINOR. These are stored as-is in review pass files (NOT in sweep_state). The sweep pipeline uses HIGH/MEDIUM/LOW mapping separately.

**Store review results:** Save each pass to `.forgeplan/reviews/design-review-pass-N.md`.

### Step 2: Research

Read `.forgeplan/manifest.yaml` to identify research topics from the tech stack and integrations:

- For each `tech_stack` entry naming a specific technology:
  - `auth: supabase-auth` → topic: "supabase auth patterns"
  - `database: postgresql` + `orm: drizzle` → topic: "drizzle postgresql setup"
  - `auth: custom` → skip (too generic)
  - `frontend: react` → skip (too generic, research won't add spec-level value)
  - `deployment: docker` → skip (build-time concern)
  - Any value of `"none"`, `""`, or `null` → skip (no technology to research)
- For each `integration` type node in the manifest → research that integration's API

For each identified topic, run `/forgeplan:research [topic]`.

**If no specific technologies or integrations are found:** skip Step 2 entirely. Log: "No specific integrations to research — skipping research step."

**If research fails for a topic:** log a warning and continue. Research is informative, not blocking.

### Step 3: Spec all nodes (autonomous, phase-aware)

Generate specs for all nodes:

```
/forgeplan:spec --all --autonomous
```

This reads research findings from `.forgeplan/research/` and applies the Sprint 10B phased-spec contract automatically:
- Current-phase nodes get full specs with acceptance criteria, tests, constraints, and failure modes
- Next-phase nodes get interface-only specs
- Later-phase nodes stay deferred until promotion

All of that happens without user interaction.

If spec generation fails for a node, halt with error and preserve state. The user can fix and re-run `/forgeplan:greenfield` to resume.

### Step 3.5: Plan Generation + Plan Review (Sprint 10A)

**Skip for SMALL** if Step 1.5 already reviewed the combined design+plan with zero findings.

**For MEDIUM/LARGE:**

**3.5a: Generate Implementation Plan**
Dispatch the Architect in Planner mode:
- Prompt context: "You are in Planner mode. Read the reviewed design (manifest + specs). Produce an implementation plan at `.forgeplan/plans/implementation-plan.md`."
- The Architect reads the manifest, specs, and research findings, then outputs the plan.

**3.5b: Review the Plan**
Dispatch the review panel with plan lens:

| Tier | Agents | Max Passes |
|------|--------|------------|
| MEDIUM | review-adversary, review-skeptic, review-structuralist, review-contractualist | 5 |
| LARGE | + review-pathfinder | 5 |

**Dispatch steps per pass:**
1. Dispatch N agents in parallel. Each receives: "You are reviewing an IMPLEMENTATION PLAN. Read `.forgeplan/plans/implementation-plan.md` and cross-reference with the manifest and specs. Apply your plan lens."
2. Collect outputs, merge, deduplicate, sort by severity
3. If zero CRITICAL/IMPORTANT: proceed to Step 4
4. If findings remain: Architect updates the plan → re-dispatch (loop)

**Agent response validation:** Same as Step 1.5 — validate each agent response for findings or clean signal.

**Circuit breaker:** Same as Step 1.5 — CRITICALs after max passes HALT the pipeline (user must fix and re-run), IMPORTANTs become warnings.

**Store review results:** Save each pass to `.forgeplan/reviews/plan-review-pass-N.md`.

### Step 4: Deep-build (full pipeline)

Run the full autonomous build pipeline:

```
/forgeplan:deep-build
```

Deep-build handles everything from here:
- Build all nodes (per tier: SMALL = single-pass, MEDIUM = sequential, LARGE = full pipeline)
- Verify-runnable gate (Phase A: install, typecheck, tests, server starts)
- Review all nodes (spec-diff audit)
- Integration check
- Sweep (tier-aware agent count with progressive convergence)
- Runtime verification (Phase B: hit endpoints, check responses — MEDIUM/LARGE only)
- Cross-model verification (tier-aware: SMALL skip, MEDIUM optional, LARGE required)

### Final Output

After deep-build completes, present:

```
=== Greenfield Build Complete ===
Project: [name] ([tier])
Nodes: [N] built, reviewed, and certified
Research: [N] topics researched
Findings: [N] found and resolved across [passes] passes
Runtime verification: [pass/fail/skipped]
Cross-model: [N consecutive clean passes / not configured / skipped (SMALL)]

Your project is ready:
  cd [project-dir]
  [dev command from tech_stack.runtime: "npm run dev" / "deno task dev" / "bun run dev"]

Reports:
  .forgeplan/deep-build-report.md    Full pipeline report
  .forgeplan/research/               Research findings
  .forgeplan/sweeps/                 Sweep reports
```
