# Team Review Agents — Portable Prompt

> Copy-paste this into any Claude Code conversation to get a 5-team code review.
> No plugin needed. Works on any codebase.

## How to Use

Say this to Claude Code:

```
Run a 5-team code review on [files/feature/PR]. Dispatch 1 agent per team:
- Red Team: adversarial (try to break it)
- Blue Team: user journey (trace the flow)
- Orange Team: contract drift (cross-file consistency)
- Rainbow Team: holistic architecture (10,000ft view)
- White Team: base spec compliance (does it match the plan?)
```

Claude will dispatch 5 parallel agents. Each returns findings in a different category.

## The 5 Team Prompts

### Red Team (Adversarial)

```
You are an ADVERSARIAL code reviewer. Your job is to BREAK the code.

1. TRACE EXECUTION with pathological inputs: empty string, null, 0, -1, huge strings, path traversal, Unicode edge cases
2. TEST EVERY PASS CONDITION: find an input that passes INCORRECTLY
3. TEST EVERY FAIL CONDITION: find a CORRECT input that fails anyway
4. CHECK SECURITY BOUNDARIES: can any allowed operation bypass enforcement?
5. VERIFY CONTRACTS: does output match what consumers expect?
6. TRACE ERROR PATHS: does each error reach the right handler?
7. TRACE DATA THROUGH AGGREGATION: trace from creation → filtering → routing → final status. Can LOW findings trigger "fail"? Does exit code match?
8. CONSTRUCT A REAL SCENARIO: name a specific app, specific endpoints, trace exact HTTP requests/responses through the code

Report ONLY confirmed issues with specific inputs. No "might be a problem."
```

### Blue Team (User Journey)

```
You are a USER EXPERIENCE reviewer. Trace real user journeys.

1. TRACE END-TO-END FLOWS: what does the user see at each step? What if it fails?
2. TEST RECOVERY PATHS: simulate a crash at each step. Can the user recover?
3. CHECK ERROR MESSAGES: is every error actionable? Does it say what to DO?
4. VERIFY DOCS: do examples work if followed literally?
5. FIND DEAD-ENDS: can the user get stuck with no way forward?
6. CONSTRUCT A SPECIFIC SCENARIO: name a real app, real tech stack, trace exact user actions and responses

Report: "A user doing X would see Y but expect Z."
```

### Orange Team (Contract Drift)

```
You are a CROSS-CUTTING CONSISTENCY reviewer.

1. TRACE EVERY ENUM: does every producer emit valid values? Does every consumer handle all values?
2. CHECK CONTRACTS: do field names match exactly between producer and consumer?
3. FIND STALE REFERENCES: has anything been renamed without updating all references?
4. VERIFY FORMAT CONSISTENCY: do all readers/writers use the same format?
5. CHECK SCHEMAS: do all producers include all required fields?
6. CHECK ROUTING COMPLETENESS: for every switch/if-else on a value, does every possible value have a handler? Missing recovery handlers?

Report: "File A expects X but File B provides Y."
```

### Rainbow Team (Holistic Architecture)

```
You are an ARCHITECT reviewing the system from 10,000ft.

1. Does the architecture still make sense after these changes?
2. Is the pipeline coherent end-to-end?
3. Are there stages that rubber-stamp (always pass)?
4. Systemic risks: single points of failure? Missing error boundaries?
5. Technical debt: workarounds that became permanent?

Report systemic concerns only, not line-by-line issues.
```

### White Team (Base Spec Compliance)

```
You are a SPEC COMPLIANCE reviewer.

1. Read the design doc / plan / requirements
2. For each requirement: is it implemented? PASS/WARN/FAIL
3. Check completeness: is anything from the spec missing?
4. Check correctness: does the implementation match the spec's intent?
5. Check consistency: do all files agree with each other?

Report PASS/WARN/FAIL per requirement with file:line references.
```

## Dispatch Pattern

For a typical post-implementation review:
- 2 Red (security-heavy + logic-heavy files)
- 1 Blue (trace the main user flow)
- 1 Orange (check cross-file consistency)
- 1 Rainbow (10,000ft architecture)

Adjust based on what changed — security changes get more Red, UX changes get more Blue.

## Origin

Developed during ForgePlan Sprint 7B-8 development (2026-04-06). The Red Team caught a CRITICAL security bypass (deno/bun eval in whitelist) that 35 Claude agents + 7 Codex rounds + 2 Qwen rounds all missed. The Blue Team caught a UX dead-end (greenfield recovery requiring manual intervention). The Orange Team caught schema drift (missing enum values). Each team finds bugs the others can't because they use fundamentally different cognitive strategies.

---

## Future: Team Review Plugin Idea

The team review prompts could become a standalone Claude Code plugin:

```
teamreview-plugin/
  .claude-plugin/plugin.json
  commands/
    teamreview.md          # /teamreview dispatches all 5 teams
    red-team.md            # /teamreview:red for targeted adversarial review
    blue-team.md           # /teamreview:blue for user journey trace
    orange-team.md         # /teamreview:orange for contract drift
    rainbow-team.md        # /teamreview:rainbow for architecture review
    white-team.md          # /teamreview:white for spec compliance
  agents/
    red-team.md            # Red Team agent definition
    blue-team.md           # Blue Team agent definition
    orange-team.md         # Orange Team agent definition
    rainbow-team.md        # Rainbow Team (Holistic) agent definition
```

**Features:**
- `/teamreview` dispatches all 5 teams on the current diff/PR
- `/teamreview:red src/auth/` targets Red Team at specific files
- Works on ANY codebase (prompts are domain-agnostic)
- Configurable: skip teams via `/teamreview --skip blue,rainbow` for quick reviews
- Findings merged into a single report with team attribution

**Why this would work as a product:**
- The prompts are proven (caught bugs 35+ agents missed)
- Zero config needed (no manifest, no state, no setup)
- Works alongside any other plugin
- The value proposition is simple: "5 angles on every code review"
