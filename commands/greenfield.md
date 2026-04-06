---
description: Full pipeline from idea to certified app. Chains discover → research → spec → deep-build. One confirmation, then walk away.
user-invocable: true
argument-hint: "[project description or --from document.md]"
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# Greenfield Build

One command to go from idea to certified app. You describe what you want, confirm the architecture once, and ForgePlan handles the rest: discover → research → spec → build → verify → review → sweep → certify.

**THIS COMMAND IS AUTONOMOUS AFTER ONE CONFIRMATION. Do not stop between steps to ask the user questions. Run straight through from discover to certified.**

## Process

### Step 0: Check for existing state (resume support)

Read the project directory to determine where to start:

1. If `.forgeplan/deep-build-report.md` exists AND `sweep_state` is null in state.json AND all nodes in state.json have status `"built"` or `"reviewed"` → **project is already complete**. Present the final output and exit. Do not re-run the pipeline.
2. If `sweep_state` is non-null in state.json → **deep-build was interrupted**. Run `/forgeplan:recover` first to resume or abort the interrupted operation, then re-run greenfield. Log: "Interrupted deep-build detected. Run `/forgeplan:recover` to resume, then re-run `/forgeplan:greenfield`."
3. If `.forgeplan/manifest.yaml` does NOT exist → start from Step 1 (discover)
4. If manifest exists but `.forgeplan/specs/` has no complete specs (specs have empty `test` fields in acceptance_criteria) → start from Step 2 (research) if `.forgeplan/research/` does not exist or contains no `.md` files, or Step 3 (spec) if research reports exist
5. If manifest exists and specs are complete but some nodes are `pending` or `specced` → start from Step 4 (deep-build)
6. If nodes are partially built → start from Step 4 (deep-build handles resume via next-node.js)

Log which step is being resumed: "Resuming greenfield from Step [N] — [reason]."

### Step 1: Discover (autonomous)

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

### Step 3: Spec all nodes (autonomous)

Generate full specs for all nodes:

```
/forgeplan:spec --all --autonomous
```

This reads research findings from `.forgeplan/research/` and generates complete specs with acceptance criteria, test fields, interfaces, constraints, and failure modes — all without user interaction.

If spec generation fails for a node, halt with error and preserve state. The user can fix and re-run `/forgeplan:greenfield` to resume.

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
  npm run dev

Reports:
  .forgeplan/deep-build-report.md    Full pipeline report
  .forgeplan/research/               Research findings
  .forgeplan/sweeps/                 Sweep reports
```
