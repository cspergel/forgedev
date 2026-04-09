---
name: status
description: How's my project doing? Shows every node's status, the dependency graph, shared model usage, and suggests what to do next based on where you are.
user-invocable: true
allowed-tools: Read Bash
---

# Project Status

Display the full project status with dependency visualization.

## Process

Run the deterministic status reporter:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/status-report.js"
```

Parse the JSON output and present to the user in this format:

```
=== ForgePlan Status: [Project Name] ===
Tier: [SMALL|MEDIUM|LARGE] | Reviewed: [completed]/[total] | Built Awaiting Review: [builtAwaitingReview] | Revised (needs rebuild): [revisedNeedsRebuild] | Shared Models: [count] | Phase: [build_phase]/[max_phase]

[*] database          — Database Layer              [reviewed]
[~] auth              — Authentication Service      [revised — needs rebuild]
[>] api               — API Layer                   [built]
[.] file-storage      — File Storage Service        [building]
[-] frontend-login    — Login & Registration Page   [specced]
[ ] frontend-dashboard — Client Dashboard           [pending]
[ ] frontend-accountant-view — Accountant View      [pending]

Legend: [*] reviewed  [~] revised (spec changed, needs rebuild)  [>] built awaiting review  [.] in progress  [-] specced  [ ] not started

=== Dependency Graph ===
database ──→ auth, file-storage
auth ──→ api, frontend-login
file-storage ──→ api
api ──→ frontend-dashboard, frontend-accountant-view
frontend-login (leaf)
frontend-dashboard (leaf)
frontend-accountant-view (leaf)

=== Shared Models ===
User: [fields] — used by [nodes]
Document: [fields] — used by [nodes]
```

If any nodes are stuck or have issues, flag them prominently at the top.
If there's an active node operation, show it.

Also read `.forgeplan/state.json` directly and check for `sweep_state.blocked_decisions`. If `sweep_state` exists and `blocked_decisions` has items, show prominently before the node list:
```
=== Pending Decisions: [N] architectural choice(s) needed ===
Run /forgeplan:sweep to review and resolve them.
```

## Next Steps Suggestions

Based on project state, suggest relevant next actions:

- **All nodes pending:** `/forgeplan:spec --all` then `/forgeplan:build --all` for the current phase
- **Any nodes revised:** `/forgeplan:build [node-id]` — spec changed, code is stale, rebuild first
- **Some nodes built, some pending:** `/forgeplan:next` to see what to build next
- **All nodes built but not reviewed:** `/forgeplan:review --all`
- **All nodes reviewed:** `/forgeplan:sweep --cross-check or /forgeplan:integrate`
- **Current phase complete:** `/forgeplan:deep-build` to advance to the next phase
- **Project complete:** Suggest common changes:
  - `/forgeplan:revise --model [ModelName]` to add/change a shared model field (cascades to all affected nodes)
  - `/forgeplan:revise [node-id]` to change a single node
  - `/forgeplan:measure` to check quality metrics
  - `/forgeplan:help` for all available commands
