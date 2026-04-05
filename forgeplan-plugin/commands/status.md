---
description: Show full project status with node statuses and text-based dependency graph visualization.
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
Nodes: [completed]/[total] | Shared Models: [count]

[●] database          — Database Layer              [reviewed]
[●] auth              — Authentication Service      [built]
[◐] api               — API Layer                   [building]
[◔] file-storage      — File Storage Service        [specced]
[○] frontend-login    — Login & Registration Page   [pending]
[○] frontend-dashboard — Client Dashboard           [pending]
[○] frontend-accountant-view — Accountant View      [pending]

Legend: [●] complete  [◐] in progress  [◔] specced  [○] not started

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

## Next Steps Suggestions

Based on project state, suggest relevant next actions:

- **All nodes pending:** `/forgeplan:spec --all` then `/forgeplan:build --all`
- **Some nodes built, some pending:** `/forgeplan:next` to see what to build next
- **All nodes built but not reviewed:** `/forgeplan:review --all`
- **All nodes reviewed:** `/forgeplan:integrate` then `/forgeplan:measure`
- **Project complete:** Suggest common changes:
  - `/forgeplan:revise --model [ModelName]` to add/change a shared model field (cascades to all affected nodes)
  - `/forgeplan:revise [node-id]` to change a single node
  - `/forgeplan:measure` to check quality metrics
  - `/forgeplan:help` for all available commands
