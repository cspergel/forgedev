---
description: Audit a built node against its spec using the seven-dimension review format. Produces a structured pass/fail report with code evidence citations.
user-invocable: true
argument-hint: "[node-id]"
allowed-tools: Read Write Glob Grep Bash
agent: reviewer
context: fork
---

# Review Node

Audit the specified node's implementation against its spec.

**Target node:** $ARGUMENTS

## Prerequisites

- Node must have status "built" or "reviewed" (for re-review)
- `.forgeplan/specs/[node-id].yaml` must exist
- Code files must exist in the node's `file_scope` directory

## Setup

**Read** `.forgeplan/state.json`, then **update** (do not overwrite) these fields:
- Set `active_node` to `{"node": "[node-id]", "status": "reviewing", "started_at": "[ISO timestamp]"}`
- Set `nodes.[node-id].status` to `"reviewing"`
- Set `last_updated` to current ISO timestamp
- Preserve all other existing fields

## Review Process

Perform a spec-diff review across seven dimensions. Every finding must reference a specific spec element and cite specific code evidence.

### Seven Audit Dimensions

1. **Spec compliance** — For EACH acceptance criterion by ID: PASS/FAIL with code file and function citation
2. **Interface integrity** — For EACH interface: PASS/FAIL on contract implementation and directional type
3. **Constraint enforcement** — For EACH constraint: ENFORCED/VIOLATED with evidence
4. **Pattern consistency** — Code follows conventions from completed nodes
5. **Anchor comment coverage** — All files have `@forgeplan-node`, major functions have `@forgeplan-spec`
6. **Non-goal enforcement** — For EACH non_goal: was it implemented? Flag for removal if so
7. **Failure mode coverage** — For EACH failure_mode: defensive code present? Cite it or flag absence

## Output

Write the review report to `.forgeplan/reviews/[node-id].md` using the structured format:

```
## Review: [node-id]
### Acceptance Criteria
- AC1: PASS/FAIL — [evidence]
...
### Constraints
- "[constraint]": ENFORCED/VIOLATED — [evidence]
...
### Interfaces
- [target] ([type]): PASS/FAIL — [evidence]
...
### Non-Goals
- [finding or "No violations found"]
### Failure Modes
- "[mode]": PASS/FAIL — [evidence]
...
### Recommendation: APPROVE | REQUEST CHANGES ([count] failures: [list])
```

Update node status to "reviewed" in state.json and clear `active_node` to `null`.
