---
name: build
description: Build one node or all ready nodes under ForgePlan enforcement.
argument-hint: "[node-id|--all]"
disable-model-invocation: true
---

# Build Node

**Target:** $ARGUMENTS

## Build All Mode (`--all`)

If the argument is `--all`, build all eligible nodes sequentially in dependency order:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/topo-sort.js"` to get the build order
2. Read `.forgeplan/state.json` and manifest to find nodes with status `"specced"` or `"revised"` whose dependencies are all satisfied AND `(node.phase || 1) <= (manifest.project.build_phase || 1)`. Skip nodes already `"built"` or `"reviewed"` — they should move to review/integration, not be rebuilt by default. Skip future-phase nodes with log: "Skipping [node-id] — phase [N] (current build_phase: [M])."
3. For each eligible node in dependency order:
   - Run the single-node build flow below
   - After each build completes and the Stop hook verifies ACs, move to the next node
   - If any node fails (Stop hook bounces 3 times), stop the batch and report progress
4. After all nodes are built, suggest running `/forgeplan:review` on each built node first, then `/forgeplan:integrate` after all are reviewed. Built-but-unreviewed nodes must be reviewed before integration.

## Phase Gate (Sprint 10B) — MANDATORY, runs BEFORE any state writes

Before building, verify `node.phase <= project.build_phase` (read from manifest). If the node is in a future phase, stop IMMEDIATELY — do NOT proceed to the Setup section, do NOT write to state.json:
"Node [id] is phase [N] but current build_phase is [M]. Complete phase [M] nodes first (check /forgeplan:status for progress), then advance via /forgeplan:deep-build."
This is also enforced by pre-tool-use.js Layer 1, but checking here prevents stuck-state scenarios.

## Skill Loading (Sprint 11)

Before dispatching the Builder agent, load skills from the registry:

1. Read `.forgeplan/skills-registry.yaml`. If missing or stale, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" refresh` first.
2. Look up `assignments.builder` — get the list of skill paths, names, descriptions, and hints.
3. For the specific node being built, refine hints: if a skill's `tech_filter` specifically matches the node's type or interfaces (e.g., `supabase-postgres` for a database node), upgrade its hint to `read_now`. Otherwise keep as `reference`.
4. Include in the Agent tool prompt for the Builder:
   - For each `read_now` skill: "READ NOW: [path] — [description]. Directly relevant to this node. Read the full skill before writing code."
   - For each `reference` skill: "REFERENCE: [path] — [description]. Read if you need guidance on this topic during implementation."
5. The Builder agent reads full skill content via the Read tool during execution.

**For SMALL tier:** Skip skill loading entirely (skills disabled by default for SMALL).

## Single Node Mode

Build the specified node following its spec with layered enforcement:
- **PreToolUse hook** — deterministic file scope blocking + shared model guard, then LLM spec compliance check
- **PostToolUse hook** — auto-registers files and logs changes
- **Builder agent directive** — constraint enforcement via prompt
- **Stop hook** — Layer 1: bounce counter + loop prevention. Layer 2: LLM evaluates all acceptance criteria by ID, checks failure modes. Bounces back with unmet criteria until all pass or 3 bounces reached.

**Target node:** $ARGUMENTS

## Prerequisites

- `.forgeplan/manifest.yaml` must exist
- `.forgeplan/specs/[node-id].yaml` must exist and be complete
- The target node's status must be one of: `"specced"`, `"built"`, `"reviewed"`, or `"revised"` (not `"pending"`, `"building"`, `"reviewing"`, `"review-fixing"`, `"revising"`, or `"sweeping"`)
- All nodes in the target's `depends_on` list must have status "built" or "reviewed" (NOT "revised" — revised means stale code that needs rebuild)
- No other node can be currently in "building" or "sweeping" status

## Setup

1. Read the manifest and the target node's spec
2. Read specs for all nodes this node interfaces with (for contract context)
3. Read shared model definitions from the manifest
4. **Snapshot existing files** in the node's `file_scope` before building starts. This enables PostToolUse to distinguish genuinely new files from pre-existing ones. Use the **Glob tool** with the node's `file_scope` pattern to list all matching files. Store the result as `nodes.[node-id].pre_build_files` in state.json. The Glob tool handles all glob patterns correctly regardless of platform.
5. **Read** `.forgeplan/state.json`, then **update** (do not overwrite) these fields:
   - Set `nodes.[node-id].previous_status` to the node's current status (e.g., `"specced"`, `"reviewed"`, `"revised"`) — used by recovery SKIP to restore state if the build crashes
   - Set `active_node` to `{"node": "[node-id]", "status": "building", "started_at": "[ISO timestamp]"}`
   - Set `nodes.[node-id].status` to `"building"`
   - Set `nodes.[node-id].pre_build_files` to the list of files from the snapshot above
   - Set `nodes.[node-id].bounce_count` to `0`
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

**Model selection — tier-aware with user override:**
- **SMALL tier:** defaults to `sonnet` (fast, sufficient for simple builds)
- **MEDIUM tier:** defaults to `sonnet`, consider `opus` for nodes with complex integrations
- **LARGE tier:** defaults to `opus` (strongest reasoning for complex code generation)
- **Always configurable:** override via `models.builder` in `.forgeplan/config.yaml`
- **Per-node override:** `models.builder_override.[node-id]: "opus"` for specific complex nodes
- The Architect always uses `opus` because discovery requires the strongest reasoning regardless of tier.

## Completion — Stop Hook Owns This Transition

**Do NOT manually update `nodes.[node-id].status` to `"built"` or clear `active_node`.** The Stop hook is the sole gate between `"building"` and `"built"`:

1. When the Builder agent finishes, it presents a summary and stops
2. The Stop hook fires automatically — Layer 1 (`stop-hook.js`) checks bounce counter, Layer 2 (prompt) evaluates every acceptance criterion by ID
3. **If all criteria pass:** The Stop hook marks the node as `"built"`, sets `last_build_completed`, resets `bounce_count` to 0, clears `active_node`
4. **If criteria fail:** The Stop hook bounces — lists the failing criteria and continues building (up to 3 bounces, then escalates to user via `/forgeplan:recover`)

After the Stop hook allows completion, suggest running `/forgeplan:review [node-id]` next.

Manually marking as `"built"` would bypass acceptance criteria verification — the entire point of the Stop hook.

## Re-Build After Review (Fresh Agent Pattern)

If `/forgeplan:review` issues REQUEST CHANGES, re-run `/forgeplan:build [node-id]`. Each re-build spawns a **fresh Builder agent** with:
- The original node spec (not the previous agent's interpretation)
- The current code (as-is on disk)
- The specific review findings to address

This fresh-agent pattern prevents the Builder from getting stuck in its own reasoning loop. The cycle is: specced → building → built → reviewed (until APPROVE). After revision: revised → building → built → reviewed (review is required after every rebuild).
