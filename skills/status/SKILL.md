---
description: Show node status, dependencies, phases, and suggested next steps.
disable-model-invocation: true
---

# Project Status

Display the full project status with dependency visualization.

## Process

Run the deterministic status reporter:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/status-report.js"
```

Parse the JSON output and present to the user in this format:

```text
=== ForgePlan Status: [Project Name] ===
Tier: [SMALL|MEDIUM|LARGE] | Reviewed: [completed]/[total] | Built Awaiting Review: [builtAwaitingReview] | Revised (needs rebuild): [revisedNeedsRebuild] | Shared Models: [count] | Phase: [build_phase]/[max_phase]

[*] database           - Database Layer             [reviewed]
[~] auth               - Authentication Service     [revised - needs rebuild]
[>] api                - API Layer                  [built]
[.] file-storage       - File Storage Service       [building]
[-] frontend-login     - Login & Registration Page  [specced]
[ ] frontend-dashboard - Client Dashboard           [pending]

Legend: [*] reviewed  [~] revised (spec changed, needs rebuild)  [>] built awaiting review  [.] in progress  [-] specced  [ ] pending

=== Dependency Graph ===
database --> auth, file-storage
auth --> api, frontend-login
frontend-login (leaf)

=== Shared Models ===
User: [fields] - used by [nodes]
Document: [fields] - used by [nodes]
```

If any nodes are stuck or have issues, flag them prominently at the top.
If there is an active node operation, show it.

Also read `.forgeplan/state.json` directly and check for `sweep_state.blocked_decisions`. If `sweep_state` exists and `blocked_decisions` has items, show prominently before the node list:

```text
=== Pending Decisions: [N] architectural choice(s) needed ===
Run /forgeplan:sweep to review and resolve them.
```

## Next Steps

Use the `nextSteps` array from `status-report.js` as the source of truth for manual next steps. Present them as:

```text
Suggested next steps:
- [command] - [description]
```

Also surface the autonomous handoff from the `autonomyHandoff` object:

```text
Autonomous option:
- [command] - [description]
```

If `autonomyHandoff.available` is false, omit the autonomous section.

Do **not** improvise or infer a different next-step list when `status-report.js` already returned one.
