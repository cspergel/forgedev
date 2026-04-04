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
