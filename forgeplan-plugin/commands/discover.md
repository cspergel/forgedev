---
description: Start architecture discovery — guided conversation that produces a validated manifest with nodes, shared models, and dependency graph. This is the entry point for every new ForgePlan project.
user-invocable: true
argument-hint: "[project description or 'template:client-portal']"
allowed-tools: Read Write Edit Bash Glob Grep
agent: architect
context: fork
---

# Architecture Discovery

You are starting a ForgePlan architecture discovery session.

## Setup

First, create the `.forgeplan/` directory structure if it doesn't exist:

```
.forgeplan/
├── specs/
├── conversations/
│   └── nodes/
└── reviews/
```

## Template Mode

If the user's argument starts with `template:`, load the corresponding blueprint:
- `template:client-portal` → Load from `${CLAUDE_PLUGIN_ROOT}/templates/blueprints/client-portal.yaml`

When loading a template:
1. Copy the blueprint to `.forgeplan/manifest.yaml`
2. Set `created_at` to the current ISO 8601 timestamp
3. Generate skeleton specs for each node into `.forgeplan/specs/`
4. Run validation: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.js" .forgeplan/manifest.yaml`
5. Present the architecture summary to the user
6. Ask if they want to customize anything before proceeding

## Guided Discovery Mode

If no template is specified, begin the guided architecture discovery conversation.

User's project description: $ARGUMENTS

Follow the Architect agent's conversation framework:
1. **Understand** the project (2-3 questions)
2. **Decompose** into nodes (3-5 questions, enforce granularity)
3. **Identify** shared models (entities used by 2+ nodes)
4. **Map** connections and dependencies
5. **Validate** and present summary
6. **Confirm** with user before finalizing

After each node addition or major change, show an updated text-based architecture summary.

After writing the manifest, always run validation:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.js" .forgeplan/manifest.yaml
```

## Completion

When discovery is complete:
1. Save the conversation log to `.forgeplan/conversations/discovery.md`
2. Initialize `.forgeplan/state.json` with:
```json
{
  "session_id": "${CLAUDE_SESSION_ID}",
  "last_updated": "[current ISO timestamp]",
  "active_node": null,
  "nodes": {},
  "stop_hook_active": false,
  "discovery_complete": true
}
```
3. Populate the `nodes` object in state.json with each node ID set to `{"status": "pending"}`
4. Present the final summary and suggest running `/forgeplan:spec --all` next to generate detailed specs, or `/forgeplan:spec [node]` for a specific node.
