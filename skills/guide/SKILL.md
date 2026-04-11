---
description: Show the best next ForgePlan step for the current project.
disable-model-invocation: true
---

# ForgePlan Guide

Evaluate the full project state and give the user clear, actionable guidance.

## Public Command Boundary

Only recommend real public ForgePlan slash commands from this set:
`affected`, `build`, `configure`, `deep-build`, `discover`, `greenfield`,
`guide`, `help`, `ingest`, `integrate`, `measure`, `next`, `recover`,
`regen-types`, `research`, `review`, `revise`, `skill`, `spec`, `split`,
`status`, `sweep`, `validate`.

Internal agents and roles such as `translator`, `architect`, `interviewer`,
`researcher`, `builder`, or `reviewer` are NOT slash commands. Never tell the
user to run `forgeplan:translator` or any other internal agent name.

If the user already has planning docs, PRDs, architecture docs, or markdown
notes but no manifest yet, the correct public entry point is:
- `/forgeplan:discover --from <doc-path>` for architecture import
- `/forgeplan:greenfield --from <doc-path>` for the full autonomous pipeline

## Process

1. Check if `.forgeplan/manifest.yaml` exists
2. If no manifest: check for planning docs before giving startup guidance
   - Look for likely architecture/planning inputs such as `Planning Docs/**/*.md`,
     `docs/**/*.md`, `PRD*.md`, `*Architecture*.md`, `*Build_Plan*.md`,
     `*Synthesis*.md`, and `files.zip`
   - If rich planning docs exist, prefer `/forgeplan:discover --from <doc-path>`
     or `/forgeplan:greenfield --from <doc-path>` over generic `/forgeplan:discover`
   - Do not tell the user to summarize dense documents manually if the docs are
     already present and readable
3. If manifest exists, read it and read `.forgeplan/state.json`
4. Count nodes in each status
5. Check for stuck/crashed nodes, active sweeps, active builds
6. Present the most relevant guidance block below
7. Always end with the "always include" footer

## State Assessment

Read the state and match the FIRST condition that applies (priority order):

For phased projects (`max_phase > 1`), generic `spec --all` / `build --all` guidance applies to the CURRENT build phase only. Future-phase nodes stay interface-only or deferred until `/forgeplan:deep-build` advances the phase.

### Sweep waiting on user decisions
Check: `sweep_state.blocked_decisions` exists and has length > 0
```
⚠️ Sweep is waiting on [N] architectural decision(s).

This operation will NOT continue on its own until those decisions are resolved.

  → /forgeplan:sweep         Resume and answer the pending decisions
  → /forgeplan:status        See current state
  → /forgeplan:recover       Abort the operation if needed
```

### Active sweep or deep-build in progress
Check: `sweep_state` is not null and `current_phase` is not `"halted"`
```
🔄 [operation] in progress — pass [N], phase: [current_phase]

  [If fixing_node]: Currently fixing node "[node]"
  [If cross-check]: Running cross-model verification

This is an autonomous operation — it will continue on its own.
If something goes wrong:
  → /forgeplan:recover        Resume or abort the operation
  → /forgeplan:status         See current state
```

### Sweep or deep-build halted (hit pass limit or error)
Check: `sweep_state.current_phase === "halted"`
```
⚠️ [operation] halted at pass [N] (phase: [halted_from_phase])

  [If unresolved findings]: [N] unresolved findings remain
  [Show error if present]

  → /forgeplan:recover        Resume from where it stopped, or abort
  → /forgeplan:status         See what happened
```

### Stuck or crashed nodes detected
Check: `active_node` is not null, or any node has status "building"/"reviewing"/"revising" without an active operation
```
⚠️ [N] node(s) may be stuck:
[list stuck nodes with statuses and started_at timestamps]

  → /forgeplan:recover        Fix stuck nodes (recommended)
  → /forgeplan:status         See full project state
```

### No manifest
```
Welcome to ForgePlan!

You haven't started a project yet.

[If planning docs or architecture docs are present in the workspace:]
You already have planning material, so the best entry point is document import:

  → /forgeplan:discover --from "path/to/doc.md"
    Import planning docs into a ForgePlan architecture and manifest.

  → /forgeplan:greenfield --from "path/to/doc.md"
    Run the full autonomous pipeline starting from those docs.

  If multiple relevant docs exist, recommend the strongest primary doc first
  (for example a master build plan), then mention that additional docs can be
  supplied with repeated `--from` flags.

[Otherwise:]
Here's how to begin:

  → /forgeplan:discover [describe your project]
    Tell me what you want to build and I'll create the architecture.

  → /forgeplan:ingest
    Already have code? Bootstrap ForgePlan on an existing codebase (generates descriptive specs — refine them after).

  → /forgeplan:discover template:client-portal
    Start from a template (also: saas-starter, internal-dashboard)

  → /forgeplan:help
    See all available commands
```

## Pipeline Stage Guidance (Sprint 10A)

If any node spec is `spec_type: "descriptive"`, SKIP the design/plan artifact checks below and go straight to post-ingest guidance. Re-ingested projects may still have old artifact files on disk, and descriptive specs are the authoritative onboarding signal.

Otherwise, check for design pipeline artifacts BEFORE generic state checks — these are more specific:

### Design exists but not reviewed
Check: `.forgeplan/manifest.yaml` exists AND `.forgeplan/reviews/design-review-pass-1.md` does NOT exist AND all nodes are `pending`
```
Your design is ready for review. The universal review panel (Adversary,
Skeptic, Structuralist, Contractualist, Pathfinder) will check architecture,
interfaces, feasibility, user journeys, and security.

  → /forgeplan:greenfield       Resumes at design review and continues the pipeline
  → Run design review manually  Dispatch review agents against the manifest
```

### Design reviewed but no implementation plan (MEDIUM/LARGE)
Check: `.forgeplan/reviews/design-review-pass-*.md` exists AND `.forgeplan/plans/implementation-plan.md` does NOT exist AND `complexity_tier` is not `SMALL`
```
Design is reviewed and clean. Next: the Architect generates an implementation
plan (Planner mode) that breaks the design into buildable tasks.

  → /forgeplan:greenfield       Resumes at plan generation
```

### SMALL Combined Design+Plan Ready
Check: `complexity_tier` is `SMALL` AND `.forgeplan/reviews/design-review-pass-1.md` exists AND `.forgeplan/plans/implementation-plan.md` exists AND `.forgeplan/reviews/plan-review-pass-1.md` does NOT exist
```
For SMALL projects, the implementation plan is reviewed together with the design.
There is no separate plan-review stage.

  → /forgeplan:spec --all       Generate complete specs
  → /forgeplan:greenfield       Continue from research/spec/build
  → /forgeplan:deep-build       If specs are already complete
```

### Plan exists but not reviewed (MEDIUM/LARGE)
Check: `.forgeplan/plans/implementation-plan.md` exists AND `.forgeplan/reviews/plan-review-pass-1.md` does NOT exist AND `complexity_tier` is not `SMALL`
```
Implementation plan is ready for review by the same panel (plan lens).
The review checks task ordering, dependency satisfaction, and feasibility.

  → /forgeplan:greenfield       Resumes at plan review
```

### Plan reviewed and clean
Check: `.forgeplan/reviews/plan-review-pass-*.md` exists AND plan review has zero CRITICALs
```
Design and plan are both reviewed and clean. Ready to build!

  → /forgeplan:build [node]     Build nodes manually
  → /forgeplan:deep-build       Full autonomous pipeline
  → /forgeplan:greenfield       Continues to build phase
```

### All nodes pending (just discovered, no pipeline artifacts)
Check: all nodes `pending` AND no design-review-pass files exist
```
Architecture defined — time to write specs.

Your project has [N] nodes and [N] shared models.

WHAT HAPPENS NEXT: Specs define exactly what each node must do — acceptance
criteria, interfaces, constraints, and failure modes. The spec is the most
important artifact in ForgePlan. Everything downstream (builds, reviews,
sweeps) is measured against the spec. A good spec = a good build.

  → /forgeplan:spec --all     Generate specs for all nodes (recommended)
  → /forgeplan:spec [node]    Generate a spec for a specific node
  → /forgeplan:next           See the recommended order
  → /forgeplan:status         See the full project overview
```

### Some nodes specced, some pending
```
Specs in progress — [specced]/[total] nodes have specs.

The remaining nodes still need specs before they can be built.

  → /forgeplan:next           See what to spec next
  → /forgeplan:spec [node]    Generate a spec for a specific node
  → /forgeplan:spec --all     Generate remaining specs
```

### All nodes specced (ready to build)
```
Specs ready — time to build.

All [N] nodes have specs with [total ACs] acceptance criteria.

WHAT HAPPENS DURING BUILD: For each node, a Builder agent generates all
the implementation code. Hooks enforce that writes stay within the node's
file scope, shared models aren't redefined locally, and every file is
registered. A Stop hook checks acceptance criteria before marking the
node as "built" — if criteria aren't met, it bounces back for fixes.

  Option A: Build one at a time (more control)
    → /forgeplan:next           See the recommended build order
    → /forgeplan:build [node]   Build a specific node
    You'll see each node's progress and can review between builds.

  Option B: Let ForgePlan handle it all (autonomous)
    → /forgeplan:deep-build     Build → verify → review → sweep → certify (tier-aware)
    Fully autonomous. Builds every node in dependency order, then reviews,
    sweeps for issues, fixes them, and certifies with a second AI model.
    Takes longer but you can walk away.
```

### Some nodes built, some specced
```
Building in progress — [built]/[total] nodes done.

Nodes are built in dependency order — a node's dependencies must be built
first. /forgeplan:next knows the graph and picks the right one.

  → /forgeplan:next           See what to build next (dependency-aware)
  → /forgeplan:build [node]   Build a specific node
  → /forgeplan:review [node]  Review a built node before continuing
  → /forgeplan:status         See the full picture
```

## Post-Ingest Guidance (Sprint 10B)

If `spec_type` is `"descriptive"` on any node (check spec files for `spec_type: "descriptive"`):
```
Some specs are auto-generated (descriptive). Refine those specs before treating the
project as fully governed:
  → /forgeplan:spec [node]    Replace description-only/generated behavior with actual requirements
  → /forgeplan:review [node]  Re-review a node after tightening its spec
  → /forgeplan:status         See which nodes still carry descriptive specs
```

### All nodes built (not yet reviewed)
```
All [N] nodes built! Time to verify.

WHAT HAPPENS DURING REVIEW: A Reviewer agent independently reads every file
in the node and checks it against the spec — acceptance criteria, interfaces,
constraints, non-goals, and failure modes. Every finding must cite specific
code evidence. The reviewer does NOT trust the builder's claims.

  Option A: Review one at a time
    → /forgeplan:review [node]    Review a specific node
    → /forgeplan:next             See the recommended review order

  Option B: Sweep the whole codebase at once
    → /forgeplan:sweep            3-5 consolidated agents (tier-aware) run in
                                   parallel: Adversary, Contractualist, Pathfinder,
                                   Structuralist, Skeptic. All opus. Findings are
                                   fixed automatically with node-scoped enforcement.
    → /forgeplan:sweep --cross-check   Same + a different AI model (Codex/GPT/
                                        Gemini) independently verifies the code.
                                        Alternates until both models agree.

  Option C: Full autonomous pipeline
    → /forgeplan:deep-build       Does everything: review → sweep → fix → cross-
                                   model verify → converge. Walk away and come back.

  Also useful:
    → /forgeplan:integrate        Check that cross-node interfaces connect correctly
    → /forgeplan:measure          Check code quality metrics (broken refs, stubs, etc.)
```

### Some nodes reviewed, some built
```
Reviews in progress — [reviewed]/[total] nodes verified.

Keep reviewing — once all nodes are reviewed, you can run the full sweep.

  → /forgeplan:next             See what to review next
  → /forgeplan:review [node]    Review a specific built node
  → /forgeplan:build [node]     Build remaining unbuilt nodes
  → /forgeplan:status           See the full picture
```

### All nodes reviewed
```
All [N] nodes built and reviewed!

You're at the verification stage. Here's the natural progression:

  Step 1: Check cross-node interfaces
    → /forgeplan:integrate
    Verifies that every interface defined in the specs actually connects —
    exports match imports, types align, contracts are honored.

  Step 2: Sweep for cross-cutting issues
    → /forgeplan:sweep
    3-5 consolidated agents (tier-aware), all opus:
      - Adversary        — security, errors, config, database — tries to BREAK the code
      - Contractualist   — types, API contracts, imports, cross-node boundaries
      - Pathfinder       — user flows, frontend UX, test quality (MEDIUM+)
      - Structuralist    — code quality, docs, architecture, simplicity (LARGE only)
      - Skeptic          — spec tracing, fresh eyes, gap finding

    Agents that find nothing are progressively dropped from later passes.
    Only agents with findings re-run until everything converges.

    → /forgeplan:sweep --cross-check
    Same as above, plus a DIFFERENT AI model (Codex/GPT/Gemini) independently
    reviews the entire codebase. The sweep alternates between Claude and the
    other model until both agree the code is clean (2 consecutive clean passes).

  Step 3 (optional): Full autonomous certification
    → /forgeplan:deep-build
    Runs the entire sweep → fix → cross-model pipeline autonomously.
    Creates git commits at each pass. Walk away and come back to a
    certified codebase.

  Other options:
    → /forgeplan:measure          Check quality metrics
    → /forgeplan:status           See the full project overview
    → /forgeplan:configure        Set up cross-model review (if not done yet)

Ready to make changes?
  → /forgeplan:revise --model [ModelName]   Change a shared data model (cascades
                                             to all nodes that use it)
  → /forgeplan:revise [node]               Change a specific node
```

### Nodes needing rebuild after revision
```
[N] node(s) need rebuilding after recent changes:
[list affected nodes with reason — "shared model changed" or "dependency rebuilt"]

When you revise a shared model or a node, dependent nodes may need rebuilding.
ForgePlan tracks the dependency graph and knows which nodes are affected.

  → /forgeplan:next           See the recommended rebuild order
  → /forgeplan:build [node]   Rebuild each affected node
  → /forgeplan:review [node]  Review a rebuilt node
  → /forgeplan:affected [model]   See which nodes a model change affects
```

## Phase Guidance (Sprint 10B)

Calculate `max_phase` as the highest `phase` value across all nodes in the manifest (default 1 if not set).

If project has multiple phases (max_phase > 1):
  If all current-phase nodes are reviewed and sweep-clean:
    → "All phase [N] nodes are sweep-clean! Run /forgeplan:deep-build to advance to phase [N+1]."
  If some current-phase nodes are not yet built:
    → "Phase [N]: [built] of [total] nodes built. Next: /forgeplan:build [next-node] or /forgeplan:deep-build."

## Wiki-Informed Recommendations (Sprint 9 -- MEDIUM/LARGE only)

After checking standard state conditions, if wiki exists and tier is not SMALL, check these additional triggers:

| Signal | Threshold | Recommendation |
|--------|-----------|----------------|
| Recurring findings in same category | >3 findings, same category, across 2+ passes | "Persistent [category] issues. Consider adding a spec constraint or refactoring the pattern." |
| High file count in node | >20 files in single node's file_scope | "Node [id] has [N] files. Consider `/forgeplan:split [id]` for finer governance." |
| High finding density | >15 findings per node in single sweep pass | "High finding density on [id] suggests more decomposition needed. Current tier: [tier]." |
| Stale wiki | wiki_last_compiled older than last state change | "Knowledge base is stale. Will refresh on next sweep, or run compile-wiki.js manually." |

### Sweep complete, wiki available (MEDIUM/LARGE only)

Check: sweep completed AND wiki pages exist AND tier !== "SMALL"

```
Knowledge base has been compiled from your sweep results.

  Review your project's knowledge:
  -> Read .forgeplan/wiki/decisions.md      Architectural decisions with context
  -> Read .forgeplan/wiki/rules.md          Inferred conventions from specs and code

  Next actions:
  -> /forgeplan:revise [node]     Make improvements based on patterns
  -> /forgeplan:deep-build        Run another sweep cycle
  -> /forgeplan:split [node]      Decompose a node if findings suggest it
```

## Cross-model prompt

If cross-model review is not configured (no `.forgeplan/config.yaml` or `review.mode: native`), and the user is at the "all reviewed" stage or later, add:

```
Tip: Set up cross-model review for independent verification by a different AI:
  → /forgeplan:configure      Quick setup wizard (Codex, Gemini, or API)
```

## Always include at the bottom:
```
  → /forgeplan:guide          Run this guide again anytime
  → /forgeplan:help           See all available commands
```
