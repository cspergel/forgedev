---
description: Where am I and what should I do? Evaluates your project state and walks you through the best next steps with clear options. Your personal ForgePlan guide.
user-invocable: true
allowed-tools: Read Bash
---

# ForgePlan Guide

Evaluate the full project state and give the user clear, actionable guidance.

## Process

1. Check if `.forgeplan/manifest.yaml` exists
2. If no manifest: guide the user to start with `/forgeplan:discover`
3. If manifest exists, read it and read `.forgeplan/state.json`
4. Count nodes in each status
5. Check for stuck/crashed nodes, active sweeps, active builds
6. Present the most relevant guidance block below
7. Always end with the "always include" footer

## State Assessment

Read the state and match the FIRST condition that applies (priority order):

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

You haven't started a project yet. Here's how to begin:

  → /forgeplan:discover [describe your project]
    Tell me what you want to build and I'll create the architecture.

  → /forgeplan:discover template:client-portal
    Start from a template (also: saas-starter, internal-dashboard)

  → /forgeplan:help
    See all available commands
```

### All nodes pending (just discovered)
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
    → /forgeplan:deep-build     Build all → review → sweep → cross-model certify
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
    → /forgeplan:sweep            12 specialized agents run in parallel, each
                                   auditing a different dimension (security,
                                   types, errors, DB, APIs, imports, code quality,
                                   tests, config, frontend UX, docs, and
                                   cross-node integration). Findings are fixed
                                   automatically with node-scoped enforcement.
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
    12 specialized agents run in parallel. Each audits a different dimension:
      - auth-security      — authentication, authorization, input validation
      - type-consistency   — shared model usage, type drift across nodes
      - error-handling     — try/catch, unhandled promises, error responses
      - database           — queries, migrations, connections, transactions
      - api-contracts      — endpoints, routes, request/response shapes
      - imports            — import chains, circular deps, dead imports
      - code-quality       — readability, performance, dead code, duplication
      - test-quality       — assertion quality, coverage gaps, flaky tests
      - config-environment — env vars, config drift, secrets
      - frontend-ux        — accessibility, loading/error/empty states
      - documentation      — README/JSDoc accuracy, stale comments
      - cross-node-integration — data flow across boundaries, field mismatches

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
