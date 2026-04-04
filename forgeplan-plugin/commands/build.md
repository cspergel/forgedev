---
description: Begin building a node. Sets the active node, injects spec + interfaces + shared models into context, and starts the Builder agent with PreToolUse and PostToolUse enforcement hooks.
user-invocable: true
argument-hint: "[node-id]"
allowed-tools: Read Write Edit Bash Glob Grep
agent: builder
context: fork
---

# Build Node

Build the specified node following its spec with layered enforcement:
- **PreToolUse hook** — deterministic file scope blocking + shared model guard, then LLM spec compliance check
- **PostToolUse hook** — auto-registers files and logs changes
- **Builder agent directive** — constraint enforcement via prompt
- **Stop hook** — acceptance criteria evaluation (Sprint 3)

**Target node:** $ARGUMENTS

## Prerequisites

- `.forgeplan/manifest.yaml` must exist
- `.forgeplan/specs/[node-id].yaml` must exist and be complete
- The target node's status in `.forgeplan/state.json` must be `"specced"` or later (not `"pending"`)
- All nodes in the target's `depends_on` list must have status "built", "reviewed", or "revised"
- No other node can be currently in "building" status

## Setup

1. Read the manifest and the target node's spec
2. Read specs for all nodes this node interfaces with (for contract context)
3. Read shared model definitions from the manifest
4. **Snapshot existing files** in the node's `file_scope` directory before building starts. This enables PostToolUse to distinguish genuinely new files from pre-existing ones. Use the Glob tool to list all files matching the node's `file_scope` pattern, or if using Bash, this cross-platform Node command:
   ```bash
   node -e "const fs=require('fs'),p=require('path');function walk(d){let r=[];try{for(const e of fs.readdirSync(d,{withFileTypes:true}))e.isDirectory()?r=r.concat(walk(p.join(d,e.name))):r.push(p.join(d,e.name).split(p.sep).join('/'))}catch{}return r};console.log(JSON.stringify(walk('[file_scope_base_dir]')))"
   ```
   Where `[file_scope_base_dir]` is the directory part of the file_scope (e.g., `src/database` from `src/database/**`). The result is a JSON array of relative file paths.
5. **Read** `.forgeplan/state.json`, then **update** (do not overwrite) these fields:
   - Set `active_node` to `{"node": "[node-id]", "status": "building", "started_at": "[ISO timestamp]"}`
   - Set `nodes.[node-id].status` to `"building"`
   - Set `nodes.[node-id].pre_build_files` to the list of files from the snapshot above
   - Set `nodes.[node-id].files_created` to `[]`
   - Set `nodes.[node-id].files_modified` to `[]`
   - Set `last_updated` to current ISO timestamp
   - Preserve all other existing fields (`session_id`, `nodes`, `stop_hook_active`, `discovery_complete`)

## Builder Agent Context

The Builder agent receives:
- Full node spec
- Adjacent interface contracts (specs of connected nodes)
- Shared model definitions from the manifest
- The constraint directive (see Builder agent prompt)

## Completion

When the build is complete:
1. Update node status to "built" in state.json
2. Clear active_node in state.json
3. Suggest running `/forgeplan:review [node-id]` next

## Re-Build After Review

If `/forgeplan:review` issues REQUEST CHANGES, the user can re-run `/forgeplan:build [node-id]` to address the failures. This works because the prerequisite "specced or later" includes "reviewed" — so the build command accepts nodes in any post-spec status. The cycle is: specced → building → built → reviewed → building → built → reviewed (until APPROVE).
