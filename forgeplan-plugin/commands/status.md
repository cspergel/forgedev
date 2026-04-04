---
description: Show full project status with node statuses and text-based dependency graph visualization.
user-invocable: true
allowed-tools: Read Bash
---

# Project Status

Display the full project status with a text-based dependency visualization.

## Process

1. Read `.forgeplan/manifest.yaml` for project metadata and node definitions
2. Read `.forgeplan/state.json` for current statuses

## Output Format

```
=== ForgePlan Status: [Project Name] ===
Nodes: [completed]/[total] | Shared Models: [count]

[●] database          — Database Layer              [reviewed]
[●] auth              — Authentication Service      [built]
[◐] api               — API Layer                   [building]
[○] file-storage      — File Storage Service        [specced]
[○] frontend-login    — Login & Registration Page   [pending]
[○] frontend-dashboard — Client Dashboard           [pending]
[○] frontend-accountant-view — Accountant View      [pending]

Legend: [●] complete  [◐] in progress  [○] not started  [✗] needs attention

=== Dependency Graph ===
database ──→ auth ──→ api ──→ frontend-dashboard
         │         │       └──→ frontend-accountant-view
         │         └──→ frontend-login
         └──→ file-storage ──→ api

=== Shared Models ===
User: used by auth, api, frontend-dashboard, frontend-accountant-view
Document: used by api, file-storage, frontend-dashboard, frontend-accountant-view
```

If any nodes are stuck or have issues, flag them prominently at the top.
