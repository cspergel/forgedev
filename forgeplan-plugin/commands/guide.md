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
4. Assess the project state and present guidance

## State Assessment

Count nodes in each status and determine the project phase:

### No manifest
```
👋 Welcome to ForgePlan!

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
📋 Architecture defined — time to write specs.

Your project has [N] nodes and [N] shared models. Next:

  → /forgeplan:spec --all     Generate specs for all nodes (recommended)
  → /forgeplan:spec [node]    Generate a spec for a specific node
  → /forgeplan:status         See the full project overview
```

### All nodes specced (ready to build)
```
🔨 Specs ready — time to build.

All [N] nodes are specced with [N] acceptance criteria. Next:

  → /forgeplan:build --all    Build all nodes in dependency order (recommended)
  → /forgeplan:build [node]   Build a specific node
  → /forgeplan:next           See the recommended build order
```

### Some nodes built, some pending/specced
```
🔨 Building in progress — [built]/[total] nodes done.

  → /forgeplan:next           See what to build next
  → /forgeplan:build [node]   Build a specific node
  → /forgeplan:review [node]  Review a built node
  → /forgeplan:status         See the full picture
```

### All nodes built (not yet reviewed)
```
✅ All [N] nodes built! Time to review.

  → /forgeplan:review --all   Review all nodes (recommended)
  → /forgeplan:review [node]  Review a specific node
  → /forgeplan:integrate      Check cross-node interfaces
  → /forgeplan:measure        Check code quality metrics
```

### All nodes reviewed
```
🎉 Project complete — all [N] nodes built and reviewed!

  → /forgeplan:integrate      Verify all interfaces (recommended)
  → /forgeplan:measure        Check quality metrics
  → /forgeplan:status         See the full project overview

Ready to make changes?
  → /forgeplan:revise --model [ModelName]   Change a shared data model (cascades to all affected nodes)
  → /forgeplan:revise [node]               Change a specific node
```

### Stuck or crashed nodes detected
```
⚠️ [N] node(s) need attention:
[list stuck nodes with statuses]

  → /forgeplan:recover        Fix stuck nodes (recommended)
  → /forgeplan:status         See full project state
```

### Nodes needing rebuild after revision
```
🔄 [N] node(s) need rebuilding after recent changes:
[list affected nodes]

  → /forgeplan:build [node]   Rebuild each affected node
  → /forgeplan:next           See the recommended order
```

## Always include at the bottom:
```
  → /forgeplan:help           See all available commands
```
