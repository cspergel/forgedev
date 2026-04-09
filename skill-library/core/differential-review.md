---
name: differential-review
description: Git-history-aware review, cross-function data flow tracking, change-impact analysis for skeptical code audits
when_to_use: During skeptic sweeps to trace what actually changed, what it touches, and what assumptions it breaks
priority: 85
source: Trail of Bits
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [sweep-skeptic]
tech_filter: []
---

# Differential Review

## Git-History-Aware Review

Review what CHANGED, not the whole file. Context is the diff plus its blast radius.

### Step 1: Identify the Diff
```bash
# What changed in this node since last review
git diff HEAD~1 -- <node-files>

# What changed across all commits in this build cycle
git log --oneline --since="<build-start>" -- <node-files>
```

### Step 2: Classify Each Change
For every hunk in the diff, classify:

| Type | Risk | Review Depth |
|------|------|-------------|
| New function | HIGH | Full logic review + caller analysis |
| Modified function signature | HIGH | All callers must be checked |
| Changed conditional logic | HIGH | Branch coverage, edge cases |
| Added dependency/import | MEDIUM | Why? Is it used? License? |
| Changed error handling | MEDIUM | Fail mode analysis |
| Renamed variable/function | LOW | Grep all references |
| Formatting/whitespace only | NONE | Skip |
| Comment change | NONE | Skip unless it contradicts code |

### Step 3: Trace the Blast Radius
For every modified function or type:
1. Find all direct callers (grep function name)
2. Find all importers of the modified file
3. Check if any shared model or interface was changed
4. If shared model changed: check EVERY consuming node

## Cross-Function Data Flow Tracking

### Forward Tracing (Source to Sink)
Start at user input entry points. Trace every value through the call chain:

```
user input → validation → transform → service → repository → database
                                    ↘ logger (PII leak?)
                                    ↘ error response (info leak?)
```

**At each step, verify:**
- [ ] Type narrows (validated input is narrower than raw input)
- [ ] No unvalidated data reaches a sink (DB query, file write, response)
- [ ] Transformations are reversible or documented as lossy
- [ ] Errors at any step are caught and handled (not swallowed)

### Backward Tracing (Sink to Source)
Start at dangerous operations and trace backward:

| Sink | Question |
|------|----------|
| SQL query | Is every parameter validated and parameterized? |
| File write | Is the path validated against traversal? |
| Response body | Does it contain only intended fields? |
| External API call | Is the URL/payload constructed from validated input? |
| `eval()` / `new Function()` | This should not exist. CRITICAL. |

### Data Flow Red Flags
- [ ] Value crosses a trust boundary without revalidation
- [ ] Type assertion (`as T`) used instead of runtime validation at boundary
- [ ] Value passes through `any` type at any point in the chain
- [ ] Error caught and re-thrown without the original context
- [ ] Logging of raw user input (potential PII/injection in logs)

## Change-Impact Checklist

When reviewing a diff, answer these questions:

### Contract Impact
- [ ] Did any exported function signature change? (breaking for callers)
- [ ] Did any shared type/model change? (breaking for all consumers)
- [ ] Did any API response shape change? (breaking for clients)
- [ ] Did any environment variable name change? (breaking for deployment)
- [ ] Did any database column name/type change? (migration needed?)

### Behavioral Impact
- [ ] Did default values change? (callers relying on old defaults?)
- [ ] Did error types or codes change? (catch blocks matching old errors?)
- [ ] Did validation rules change? (previously-valid input now rejected?)
- [ ] Did sorting or ordering change? (consumers relying on order?)
- [ ] Did null/undefined handling change? (callers passing null?)

### Performance Impact
- [ ] Did a synchronous call become async? (callers need await?)
- [ ] Did a query change from filtered to unfiltered? (full table scan?)
- [ ] Was caching removed or bypassed? (latency regression?)
- [ ] Did a loop body gain a network call? (N+1?)

## Review Output Format

Structure findings as diffs — show what was expected vs what exists:

```markdown
## [SEVERITY] Title — file:line

**Changed:** What the diff shows
**Expected:** What the spec/contract requires
**Impact:** Who breaks and how
**Fix:** Concrete change needed
```

## Fresh-Eyes Protocol

The Skeptic's advantage is NOT knowing the implementation history. Use it:

1. Read the spec FIRST, form expectations
2. Read the code SECOND, note surprises
3. Every surprise is a potential finding — investigate before dismissing
4. Do NOT read commit messages before reviewing (they bias you toward the author's intent)
5. The question is not "does this look reasonable?" but "does this match the spec?"

## Severity Guide

| Finding | Severity |
|---------|----------|
| Changed shared type with unchecked consumers | CRITICAL |
| Data flow reaches sink without validation | CRITICAL |
| Modified function signature, caller not updated | HIGH |
| Changed error type, catch block uses old type | HIGH |
| Type assertion replacing runtime validation | HIGH |
| Removed validation on existing input | MEDIUM |
| Changed default value without caller audit | MEDIUM |
| Added dependency without clear justification | LOW |
