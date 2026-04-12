---
description: Sweep the codebase for cross-cutting issues with ForgePlan agents.
argument-hint: "[--cross-check|--baseline]"
disable-model-invocation: true
---

# Codebase Sweep

**THIS COMMAND IS AUTONOMOUS WITH ONE EXCEPTION. Execute all phases (1→7) without stopping, pausing, or asking "shall I continue?". Fix ALL findings automatically. Do not present intermediate results and wait. The ONE exception: Category C blocked decisions (architectural choices) require user input — present them all at once, get answers, then continue automatically. Aside from that, run straight through to the final report.**

**Baseline mode (`--baseline`):** When `--baseline` is passed (used by `/forgeplan:ingest`), run ONLY Phases 1-3 (dispatch agents, collect findings, deduplicate). SKIP Phases 4-7 (fix cycle, convergence, cross-model). Store findings in `.forgeplan/sweeps/baseline-report.md` as an informational report. Do NOT auto-fix anything — this is a read-only assessment of an existing codebase during onboarding.

Run tier-selected sweep agents (3-5) in parallel across the entire codebase: 5 consolidated agents (Adversary/Contractualist/Pathfinder/Structuralist/Skeptic), all opus. Progressive reduction: agents that return CLEAN twice converge and are retired. Cross-cutting agents re-run whenever any other agent has findings. See Phase 2 for the full dispatch precedence rules.

## Phase-Aware Sweep (Sprint 10B)

- Only sweep nodes where `phase <= build_phase`
- Do NOT flag missing implementations for future-phase nodes
- DO flag broken interface contracts against future-phase nodes (they have interface-only specs)
- After all current-phase nodes are reviewed and sweep-clean, surface: "All phase [N] nodes are sweep-clean. Consider advancing to phase [N+1] via /forgeplan:deep-build."

## Prerequisites

- `.forgeplan/manifest.yaml` exists
- `.forgeplan/state.json` exists
- No active build (`active_node` must be null or all nodes in terminal states)
- All nodes should be in `built`, `reviewed`, or `revised` status (warn if not)

## Process

### Phase 1: Initialize sweep state

1. Read `.forgeplan/state.json` and verify no active operation
2. **Check if `sweep_state` already exists with `operation: "deep-building"`.** If so, this sweep was invoked from within a deep-build — **skip Phase 1 initialization entirely** (preserve the existing deep-build state) and jump to Phase 2. Also skip Phase 7 finalization on exit (deep-build handles its own finalization). Set `sweep_state.current_phase` to `"claude-sweep"` and `sweep_state.current_model` to `"claude"` to indicate we're in the sweep portion.
3. **Check if `sweep_state` already exists with `blocked_decisions.length > 0`.** If so, this is a resume from a previous sweep that paused for architectural decisions. Present the pending decisions to the user:

   ```
   === Pending Architectural Decisions ===

   The previous sweep found [N] issues that need your input:

   [For each blocked_decision, show:]
   [N]. [finding_id]: [description]
       Why: [reason — what architectural decision is needed]
       Recommended: [recommended_action]
       Affected nodes: [node list]

   Reply with your decisions (e.g., "1: yes, 2: admin-only, 3: skip") or "all recommended" to accept all recommendations.
   ```

   After the user responds:
   - For each approved decision:
     1. Read the affected node's spec from `.forgeplan/specs/[node-id].yaml`
     2. Update the spec with the new acceptance criterion or modified constraint based on the decision
     3. Write the updated spec back
     4. Set the node's status to "revised" in state.json so it gets rebuilt
   - For skipped decisions: remove from `blocked_decisions`, add to `needs_manual_attention` with `"reason": "user-skipped"`
   - **Snapshot affected categories** from `blocked_decisions` BEFORE clearing (needed for targeted re-sweep): `const affectedCategories = blocked_decisions.map(d => d.category)`
   - Clear `blocked_decisions` array
   - **Rebuild affected nodes BEFORE re-sweeping:** For each node set to "revised", run `/forgeplan:build [node-id]` with a fresh agent. The re-sweep must audit current code, not stale pre-decision code.
   - After all rebuilds complete, set `sweep_state.current_phase` to "claude-sweep" and proceed to Phase 2 (re-sweep only agents whose categories are in the snapshotted `affectedCategories` list)

4. Ensure `.forgeplan/sweeps/` exists.
   - During an active sweep or deep-build recovery, do **not** use mutating Bash like `mkdir -p` for this.
   - If the directory is missing, create it via the `Write` tool by writing a placeholder file such as `.forgeplan/sweeps/.gitkeep`, or by writing the first report file directly.
   - Prefer `Write`/`Edit` for sweep artifact creation so file registration and active-operation guards stay consistent.
5. Set `sweep_state` in state.json (only when NOT called from deep-build):
   ```json
   {
     "sweep_state": {
       "operation": "sweeping",
       "started_at": "[ISO timestamp]",
       "current_phase": "claude-sweep",
       "pass_number": 1,
       "current_model": "claude",
       "fixing_node": null,
       "consecutive_clean_passes": 0,
       "max_passes": 10,
       "findings": { "pending": [], "resolved": [] },
       "modified_files_by_pass": {},
       "agent_convergence": {},
       "needs_manual_attention": [],
       "integration_results": { "last_run": null, "passed": false, "failures": [] }
     }
   }
   ```
6. Set `active_node` to `null`
7. **Compile wiki** (Sprint 9, MEDIUM/LARGE only, skip for SMALL):
   Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/compile-wiki.js"` to build/refresh the knowledge base before dispatching agents. This generates wiki node pages, rules.md, and decisions.md from current specs, source, and sweep reports.

### Phase 1.5: Build Dependency Graph + Understanding Pass (Sprint 11)

**Dependency graph (runs once per sweep, persists across passes):**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/blast-radius.js" index
```
This builds `.forgeplan/dependency-graph.json` — maps every import/export relationship in the codebase. Used by Phase 4 fix agents to understand blast radius before making changes. Skip for SMALL tier (few files, low interconnection).

**Deterministic sweep context assembly:**
Before exploratory reads, run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/prepare-sweep-context.js"
```
This returns the exact current phase, tier, latest sweep report path, wiki artifact paths, agent prompt paths, and status counts. Use it to read the exact relevant files. Do **not** fall back to heuristic searching or ad hoc directory listing unless the helper output is missing something essential.

**Understanding extraction (pass 1 only):**
Before dispatching agents on pass 1, generate a lightweight codebase summary to help agents focus:
- Read the manifest (node descriptions, shared models, tech stack)
- Read the latest sweep report if one exists (`.forgeplan/sweeps/` — most recent file)
- Read `.forgeplan/wiki/decisions.md` if it exists (accumulated project knowledge)
- Compile into a 500-token "codebase understanding" block:
  ```
  PROJECT: [name] ([tier], [N] nodes, [tech_stack summary])
  SHARED MODELS: [names + key fields]
  KNOWN ISSUES: [top 3-5 findings from previous sweep, if any]
  PAST DECISIONS: [key decisions from wiki, if any]
  HOTSPOTS: [files with most findings historically]
  ```
- Include this block in EVERY agent's dispatch prompt on pass 1 (cheap, high-value context)
- On pass 2+, update the understanding with the current pass's findings

**Past findings context (all passes):**
If previous sweep reports exist in `.forgeplan/sweeps/`, extract a summary of past findings (categories, hotspot files, recurring patterns) and include as "HISTORICAL CONTEXT" in each agent's prompt. This is the wiki-feeding pattern — agents learn from the project's specific failure history. Cap at 1000 tokens.

### Phase 2: Dispatch sweep agents (progressive reduction)

**Tier-aware agent selection:** Read `complexity_tier` from `.forgeplan/manifest.yaml`. **Also check** `.forgeplan/config.yaml` for `complexity.tier_override` — if set and non-empty, use the override instead of the manifest tier:

- **SMALL tier:** Dispatch 3 agents:
  - Always: `sweep-adversary` (adversarial — security, errors, database, config), `sweep-contractualist` (contract — types, APIs, imports, cross-node), `sweep-skeptic` (compliance — spec tracing, fresh eyes)

- **MEDIUM tier:** Dispatch 4 agents:
  - All SMALL agents plus: `sweep-pathfinder` (experience — user flows, frontend UX, test quality)

- **LARGE tier (or no tier set):** Dispatch all 5 agents:
  - All MEDIUM agents plus: `sweep-structuralist` (architect — code quality, docs, architecture, simplicity)

**On the first pass, dispatch agents per the tier rules above. On subsequent passes, follow the precedence rules in "Progressive agent reduction" below.**

Agent definition files (read these, use as system prompts):
- `agents/sweep-adversary.md` (adversarial: security, errors, config, database)
- `agents/sweep-contractualist.md` (contract: types, APIs, imports, cross-node)
- `agents/sweep-pathfinder.md` (experience: user flows, frontend UX, test quality)
- `agents/sweep-structuralist.md` (architect: code quality, docs, architecture, simplicity)
- `agents/sweep-skeptic.md` (compliance: spec tracing, fresh eyes, gap finding)

> **Note:** The design-pass agent (frontend quality) runs during deep-build Phase 2b, NOT during sweep. Sweep agents focus on code correctness, not aesthetics.

**Progressive agent reduction:**
1. On **pass 1**: dispatch the **tier-selected agents** from above (SMALL=3, MEDIUM=4, LARGE=5).
   - **Sprint 9 (MEDIUM/LARGE):** Pass 1 agents receive ALL source files (existing behavior) PLUS wiki node pages (decisions + past findings) if wiki exists. Do NOT send `wiki/rules.md` to sweep agents (trust boundary). Exception: `sweep-adversary` receives `wiki/rules.md` specifically to AUDIT it for dangerous rules.
   - **Sprint 9 Pass 2+ optimization (MEDIUM/LARGE):** Agents receive wiki node pages (NOT rules.md) + source files modified since last pass (from `sweep_state.modified_files_by_pass`) + source files referenced by any PENDING finding for the agent's categories. Agents still have Read/Grep tools for on-demand source inspection. Exception: `sweep-adversary` ALWAYS receives full source + rules.md on every pass.
   - **Sprint 9 Convergence rule:** Do NOT retire an agent if its categories still have pending findings in `sweep_state.findings.pending`. Only count a clean pass when agent returns CLEAN AND zero pending findings in its categories.
   - **Skeptic pass 2+ context:** On pass 2 and beyond, `sweep-skeptic` additionally receives the previous pass's finding lists from all other agents. This enables its cross-agent gap-finding capability. On pass 1, Skeptic runs without this context (spec compliance + fresh eyes only).
2. After merging results, update `sweep_state.agent_convergence` for each agent. **Keys are agent names** (matching the `.md` filename without extension), NOT category names:
   ```json
   "agent_convergence": {
     "sweep-adversary": { "status": "active", "last_findings_pass": 1, "consecutive_clean": 0, "findings_history": [3] },
     "sweep-contractualist": { "status": "clean", "last_findings_pass": null, "consecutive_clean": 1, "findings_history": [0] },
     "sweep-skeptic": { "status": "active", "last_findings_pass": 1, "consecutive_clean": 0, "findings_history": [2] },
     ...
   }
   ```
   Note: agents may emit findings with overlapping categories (e.g., both sweep-adversary and sweep-contractualist may flag issues at API boundaries). Deduplication in Phase 3 step 4 handles genuine duplicates.
   - `status`: `"clean"` (returned CLEAN), `"active"` (had findings), `"failed"` (returned unstructured response), `"converged"` (2 consecutive clean passes — retired), `"force-converged"` (oscillation guard)
   - `last_findings_pass`: which pass this agent last found something
   - `consecutive_clean`: how many consecutive passes returned CLEAN
   - `findings_history`: array of integers — append the agent's finding count after each pass (e.g., `[5, 3, 3]` means 5 findings on pass 1, 3 on pass 2, 3 on pass 3). Used by rule (f) to detect oscillation: if the last 3 entries are non-decreasing, force-converge.
3. On **pass 2+**, determine which agents to dispatch using these rules **in precedence order**:
   a. **Converged agents are retired:** Skip any agent with `status: "converged"` or `"force-converged"`.
   b. **Cross-cutting agents re-run if ANY agent had findings:** `sweep-contractualist` (contracts span all boundaries), `sweep-structuralist` (architecture affected by any code change), and `sweep-skeptic` (gap-finding depends on full picture) re-run whenever any other agent reported findings in the previous pass, even if they themselves were clean. They only converge when they return CLEAN AND no other active agent had findings in the same pass.
   c. **Confirmation pass for clean agents:** An agent that returned CLEAN on pass N gets re-run on pass N+1 to confirm. If clean again → `status: "converged"`, retired.
   d. **Active agents always re-run:** Any agent with `status: "active"` (had findings last pass) is dispatched.
   e. **Failed agents always re-run:** Any agent with `status: "failed"` (returned unstructured response) is re-dispatched. Failed agents are never counted as clean for convergence. After 3 consecutive failures, force-converge with `"force-converged"` and log: "Agent [name] force-converged after 3 consecutive failures."
   f. **Anti-oscillation guard:** If an agent's finding count stays the same or increases for 3 consecutive passes, force-converge it with `status: "force-converged"` and move remaining findings to `needs_manual_attention`.

**Token budget:** Before dispatching, estimate total content size (sum of all file sizes in bytes). If over 200KB, use a tiered approach:
1. For very large codebases (200KB+), agents can use Read/Grep tools on-demand instead of receiving all files upfront. Provide file paths and manifest so agents know what to inspect.
2. Always include shared types (`src/shared/types/index.ts`) and manifest for context with every agent.
3. If a single node's files exceed 100KB, instruct the agent to use Read/Grep tools on-demand instead of receiving file content upfront. Provide only file paths and the manifest so the agent knows what to inspect.

**Skill loading (Sprint 11):** Before dispatching each sweep agent:
1. Read `.forgeplan/skills-registry.yaml`. If missing, the pre-tool-use hook will auto-generate it.
2. Look up `assignments.[agent-name]` for each agent being dispatched.
3. Include skill metadata (path, name, description, hint) in each agent's dispatch prompt:
   - `read_now` skills: "READ NOW: [path] — [description]. Read before starting your audit."
   - `reference` skills: "REFERENCE: [path] — [description]. Consult if needed."
4. Each agent reads full skill content on-demand during execution via the Read tool.

**For SMALL tier:** Skip skill loading (skills disabled by default for SMALL).

**How to dispatch:** Use the Agent tool to dispatch all active agents **in parallel** (single message, N Agent tool calls).

For each agent, provide as context in the Agent tool prompt:
- The agent's own system prompt (from its `.md` file)
- The full manifest (read `.forgeplan/manifest.yaml`)
- The full state (read `.forgeplan/state.json` — node statuses)
- ALL implementation files (read every file listed in every node's `files` array in the manifest)
- The shared types file (`src/shared/types/index.ts`)
- ALL node specs (read each `.forgeplan/specs/[node-id].yaml`)

Each agent returns findings in the structured FINDING format or CLEAN.

**Agent response validation:** For each agent's response, check:
- If it contains FINDING blocks → parse findings normally
- If it contains the word "CLEAN" (case-insensitive) and no FINDING blocks → mark as clean
- If it contains NEITHER FINDING blocks NOR "CLEAN" → mark as **failed** (not clean). Log: "Agent [name] returned unstructured response — treating as failed, will re-run on next pass." Add the agent to a `failed_agents` list for re-dispatch on the next pass. Do NOT count a failed agent as clean for convergence tracking.

### Phase 3: Merge and deduplicate findings

1. Collect all findings from the dispatched agents (excluding failed agents)
2. **Validate node IDs:** Discard any finding whose `node` field is not in `Object.keys(manifest.nodes)` AND is not the special value `"project"`. The `"project"` pseudo-node is used by agents (especially sweep-structuralist, sweep-skeptic) for cross-cutting findings that don't belong to a single node — these go to `sweep_state.needs_manual_attention` instead of the automated fix cycle (they can't be node-scoped). For cross-node findings using `Node: [id] -> [id]` format (from sweep-contractualist), extract the first node ID (before `->`) as the primary node for fix scoping. Log a warning for each discarded finding ("Finding F[N] references unknown node '[id]' — discarding"). Apply the same validation in Phase 6 for cross-model findings.
3. **Re-number** all remaining findings sequentially as F1, F2, F3... (discard the agents' self-assigned IDs, which will collide across agents)
4. Deduplicate: if two agents report the same file + same issue, keep the one with higher severity
5. Group findings by node
6. **Filter low-confidence findings:** Discard any finding with `confidence < 75`. Log: "Filtered [N] low-confidence findings (below 75)." This reduces noise and prevents the fix cycle from chasing uncertain issues. Findings with confidence 75+ proceed to Phase 4.
7. Write the sweep report to `.forgeplan/sweeps/sweep-[ISO-timestamp].md`:
   ```markdown
   # Sweep Report — Pass [N]

   Model: claude
   Timestamp: [ISO]
   Total findings: [N]
   By category: auth-security: [N], type-consistency: [N], ...

   ## Findings by Node

   ### [node-id]
   - F1 [category] [severity]: [description] — [file]:[line]
   ...
   ```
8. **Route findings by node type:** For each finding, set `pass_found: sweep_state.pass_number`, then:
   - If `node` is a real manifest node ID → add to `sweep_state.findings.pending` (enters Phase 4 fix cycle)
   - If `node` is `"project"` (cross-cutting/systemic from team agents) → add to `sweep_state.needs_manual_attention` with reason "project-level finding — no single node to fix". Do NOT add to `pending`. These appear in the final report but do not enter the automated fix cycle.
9. Load the findings into `sweep_state` with the deterministic helper:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/load-sweep-findings.js" --stdin
   ```
   Provide JSON payload:
   ```json
   {
     "pending": [/* all node-scoped findings for this pass */],
     "project_level": [/* all project-level/manual findings for this pass */],
     "failed_agents": [/* optional failed agent names */],
     "agent_convergence": {/* optional updated convergence state */}
   }
   ```
   This helper writes `sweep_state.findings.pending`, appends project-level findings to `needs_manual_attention`, and sets the next phase to `"claude-fix"` or `"integrate"` deterministically. Do **not** hand-edit `.forgeplan/state.json` or use ad hoc `python -c` / `node -e` snippets for findings ingestion.
10. If the helper reports `next_phase: "claude-fix"`: proceed to Phase 4.
11. **If the helper reports `next_phase: "integrate"` and agents returned findings (all project-level/manual):** Skip Phase 4 and proceed to Phase 5. Log: "All findings are project-level (manual attention). Skipping automated fix cycle."
12. **If zero findings AND zero failed agents** (all agents returned CLEAN successfully): the helper should still leave `pending` empty and `next_phase: "integrate"`. Proceed directly to Phase 5.
13. **If zero findings BUT some agents failed:** Do NOT treat as clean. Failed agents are re-dispatched on the next pass (their `agent_convergence` status stays `"active"` or `"failed"`). Increment pass_number and loop back to Phase 2. A pass with only failed responses is not a clean pass for convergence purposes.

Do **not** call `start-sweep-fix` while `sweep_state.current_phase` is still `"claude-sweep"`. Fixing is only valid after Phase 3 has written the sweep report, loaded node-scoped findings into `sweep_state.findings.pending`, and transitioned the operation to `"claude-fix"`.

### Phase 4: Fix findings (node-scoped)

**THIS PHASE IS FULLY AUTONOMOUS. Fix ALL findings — do NOT ask the user which findings to fix, do NOT ask for confirmation, do NOT prioritize by severity. Fix everything in dependency order. The sweep is designed to loop: fix → re-sweep → fix → converge. If a fix introduces a new issue, the next sweep pass will catch it. Asking the user breaks the autonomous loop.**

**Parallel fix mode (MEDIUM/LARGE tiers with 3+ nodes needing fixes):**
When multiple nodes need fixes and their file_scopes don't overlap, fix agents can run in parallel using git worktrees for isolation:

1. **Set up state BEFORE dispatching:** For each node needing fixes, in the main working tree:
   - Set `nodes.[node-id].previous_status` to current status
   - Set `nodes.[node-id].status` to `"sweeping"`
   - Write state.json (all state updates are serialized in the main tree BEFORE parallel dispatch)
   - If ANY required state update fails, do **not** continue with parallel fix mode. Fall back to sequential mode or halt with recovery preserved.
   - The state setup is mandatory, not advisory. Do **not** say or assume "the state annotation isn't critical."
2. **Copy dependency graph into worktrees:** If `.forgeplan/dependency-graph.json` exists, copy it to each worktree's `.forgeplan/` directory after creation. Fix agents in worktrees need the blast-radius context, and `blast-radius.js fix-context` reads from `process.cwd()/.forgeplan/`. Without this copy, parallel fix agents lose blast-radius context.
3. For each node, create an isolated worktree:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" create [node-id]
   ```
   - If ANY worktree creation fails, abort parallel fix mode and fall back to sequential mode. Do not dispatch partial parallel batches in the main tree.
4. Set `sweep_state.fixing_node` to null (multiple nodes fixing simultaneously — use per-agent context, not global state).
5. Dispatch fix agents in parallel (Agent tool, single message, N calls) — each agent works in its worktree path instead of the main working directory. **Agents must NOT write to `.forgeplan/state.json`** — they only modify source code within the node's file_scope. State updates happen after merge.
   - Do **not** dispatch parallel fix agents in the main working tree.
   - Do **not** let fix agents reset `active_node`, overwrite `sweep_state`, or hand-edit `.forgeplan/state.json`.
6. After all parallel agents complete, merge each worktree back sequentially:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" merge [node-id]
   ```
7. **After each successful merge**, update state.json: restore `nodes.[node-id].previous_status`, set `sweep_state.fixing_node` to null, move findings from pending to resolved.
8. If a merge conflict occurs (exit code 1), handle the conflicted node:
   a. **Abort the failed merge** in the main working tree: run `git merge --abort`
   b. **Clean up the conflicted worktree**: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" cleanup` for that node
   c. **Enter sequential fix** for this node. The node is already in `"sweeping"` status with `previous_status` saved from step 1 — do NOT re-save those. Execute:
      - Set `active_node` to `{"node": "[node-id]", "status": "sweeping", "started_at": "[ISO]"}`
      - Set `sweep_state.fixing_node` to the node ID
      - Run pre-fix validation: confirm findings exist, validate files exist
      - Fix each validated finding with a fresh agent
   d. **Close out the node** after fixing (same as sequential step 8):
      - Restore `nodes.[node-id].status` from `nodes.[node-id].previous_status`
      - Clear `nodes.[node-id].previous_status` to null
      - Clear `active_node` to null
      - Set `sweep_state.fixing_node` to null
      - Move findings from `pending` to `resolved`
9. After all merges, clean up: `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" cleanup`

**When NOT to parallelize:** If nodes share file_scope (e.g., SMALL tier with `src/**`), or if findings in one node reference files owned by another node, fall back to sequential mode. When in doubt, use sequential.

**Sequential fix mode (default, always safe):**
For each node that has findings, in dependency order (use topological sort from manifest `depends_on`):

1. **Save node's current status:** Set `nodes.[node-id].previous_status` to current `nodes.[node-id].status` (e.g., "built", "reviewed", "revised")
2. **Set node to sweeping:** Set `nodes.[node-id].status` to `"sweeping"`
3. **Set active_node:** Set `active_node` to `{"node": "[node-id]", "status": "sweeping", "started_at": "[ISO]"}`
4. Set `sweep_state.fixing_node` to the node ID
5. Read the node's spec and the relevant findings
6. **Pre-fix validation for each finding:**
   - **Confirm finding exists:** Before applying any fix, verify the referenced code pattern actually exists at the cited file and approximate line. Use Grep or Read to check. If the finding's description doesn't match the current code (e.g., the code was already fixed by a prior fix in this pass), mark the finding as `"resolved_by": "false-positive"` and skip it. Log: "Finding F[N] no longer present in code — marking as false-positive."
   - **Validate file exists:** Before dispatching a fix agent, confirm the referenced file still exists. If it was deleted or renamed by a prior fix, mark the finding as `"resolved_by": "resolved-by-deletion"` and skip it. Log: "Finding F[N] references deleted file [path] — marking as resolved-by-deletion."
7. **Batch findings by file and fix together (Sprint 11 — reduces fix regressions):**

   **Why batching matters:** The #1 cause of multi-cycle sweeps is fix regressions — fixing F3 breaks something that becomes F18 on the next pass. This happens because fix agents see one finding in isolation. Batching related findings into one fix dispatch gives the agent full context to make coherent fixes that don't conflict.

   **Grouping rules:**
   - Group all validated findings for the same file into one batch
   - If findings span 2-3 files in the same node that import each other, combine into one batch
   - Each batch gets ONE fix agent dispatch (not one per finding)
   - Maximum 8 findings per batch — if more, split by severity (HIGH first, then MEDIUM). If a single severity sub-batch still exceeds 8, split further into 8-finding chunks ordered by file then line number.

   **Fix Context Package — what each fix agent receives:**

   Before building the context, run blast radius analysis on the target files (if the dependency graph exists — SMALL tier may not have built it in Phase 1.5):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/blast-radius.js" fix-context [file1] [file2] ...
   ```
   If the graph file (`.forgeplan/dependency-graph.json`) doesn't exist, skip the blast-radius call and omit the BLAST RADIUS and CONSUMER FILES sections from the fix context. The fix agent still gets findings, source files, spec, and tests — blast-radius is additive context, not required.

   This returns (when available): target file exports, consumer files (who imports from these files), cross-node dependencies, and total blast radius count.

   ```
   You are fixing [N] findings in [node-id].

   FINDINGS TO FIX:
   [All findings in this batch with full descriptions]

   FULL SOURCE FILES:
   [Complete content of every file referenced by any finding in the batch]

   NODE SPEC EXCERPT:
   [Relevant acceptance criteria + interfaces from the node's spec]

   BLAST RADIUS (from dependency graph):
   [blast-radius.js output — which files import from the files you're changing]
   [Cross-node dependencies are HIGH RISK — changes here break other nodes]
   [Total blast radius: N files depend on your changes]

   CONSUMER FILES (read-only — do NOT modify):
   [Content of files from other nodes that import from files being fixed]
   [These show HOW your exports are used — don't break these call sites]

   TEST FILE:
   [The node's test file(s) — fix agents MUST update tests if the fix changes behavior]

   RELATED FINDINGS FROM OTHER AGENTS (read-only):
   [Other findings in the same file from different agents — helps avoid conflicting fixes]

   FIX APPROACH — SURGICAL PATCHES:
   - Prefer the smallest possible change that fixes the finding
   - Use Edit tool with exact old_string/new_string (not Write to rewrite entire files)
   - If changing a function signature: check the BLAST RADIUS section above and update ALL callers in this node
   - If changing an export: check CONSUMER FILES — if cross-node consumers would break, flag it instead of silently changing
   - Fix ALL findings in this batch together. Consider interactions between fixes.
   - Run the node's tests after fixing. If tests fail, adjust the fix.
   ```

   **Token cost comparison:**
   - Old: 15 findings × 15K tokens/agent = 225K tokens, 3-5 regressions → 2+ extra passes
   - New: 5 batched dispatches × 25K tokens/agent = 125K tokens, 0-1 regressions → 0-1 extra passes

   **Deterministic pre-verification after fixes:**
   After ALL fix agents complete for a node (before the next sweep pass):
   1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/integrate-check.js"` — catches contract breaks
   2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/verify-cross-phase.js"` — catches cross-phase export breaks (if applicable)
   3. If either script fails: the fix introduced a regression. Log which fix batch caused it and re-dispatch that batch's fix agent with the regression details added to its context.
   4. Only proceed to re-sweep (Phase 2) after deterministic checks pass — this catches regressions at script cost (~0 tokens) instead of full sweep cost (~300K tokens).

   Writes are enforced by PreToolUse (node's file_scope) + Layer 1 deterministic. Layer 2 is bypassed for sweeping.

   - **If the fix agent returns BLOCKED (file scope, cross-node write, etc.):** Classify the blocked finding:

     **Category A — Needs spec update (auto-resolvable):**
     The fix requires adding or changing acceptance criteria, constraints, or interfaces in a node's spec. Examples: adding pagination, adding input validation, changing error handling behavior.
     → **Auto-resolve:** Update the spec YAML (`.forgeplan/specs/[node-id].yaml`) with the new/changed criterion, then retry the fix. The spec update is within `.forgeplan/` write scope so it won't be blocked. Log: "Auto-revised spec for [node-id]: added [criterion description]"

     **Category B — Needs shared code extraction (manifest change):**
     The fix requires extracting duplicated code to a shared location that multiple nodes can import. Examples: shared utility functions, shared validation logic, shared API helpers.
     → **Auto-resolve:**
     1. Check if a `shared` or `utils` directory already exists in the manifest's shared structure
     2. If not, add a `shared_paths` entry or utility pattern to the manifest
     3. Extract the shared code to the shared location
     4. Update all affected nodes' imports
     5. Register the new files in the manifest
     Log: "Extracted shared code: [description] → [path]"

     **Category C — Needs architectural decision (present to user):**
     The fix requires a judgment call that changes product behavior. Examples: authentication policy changes (who can register?), removing a field from a data model, changing role-based access rules.
     → **Do NOT auto-fix.** Persist each Category C finding to `sweep_state.blocked_decisions` in state.json with this structure:
       ```json
       {
         "finding_id": "F7",
         "description": "Accountant self-registration gating",
         "reason": "Requires policy decision: should accountants self-register or be admin-invited only?",
         "recommended_action": "Admin-invite only — add invitation flow to auth node",
         "affected_nodes": ["auth", "frontend-login"],
         "category": "auth-security",
         "severity": "HIGH"
       }
       ```
       Write `sweep_state` to state.json immediately after persisting (so decisions survive a crash or session end).

     Present ALL Category C findings together at the end of Phase 4 (not one by one):
     ```
     === Pending Architectural Decisions ===

     The sweep found [N] issues that need your input:

     [For each blocked_decision, show:]
     [N]. [finding_id]: [description]
         Why: [reason — what architectural decision is needed]
         Recommended: [recommended_action]
         Affected nodes: [node list]

     Reply with your decisions (e.g., "1: yes, 2: admin-only, 3: skip") or "all recommended" to accept all recommendations.
     You can also say "later" to pause — decisions will be saved and you can resume with /forgeplan:sweep next session.
     ```

     **If the user responds immediately:** Process their decisions inline:
     - For each approved decision:
       1. Read the affected node's spec from `.forgeplan/specs/[node-id].yaml`
       2. Update the spec with the new acceptance criterion or modified constraint based on the decision
       3. Write the updated spec back
       4. Set the node's status to "revised" in state.json so it gets rebuilt
     - For skipped decisions: remove from `blocked_decisions`, add to `needs_manual_attention` with `"reason": "user-skipped"`
     - **Snapshot affected categories** BEFORE clearing: `const affectedCategories = blocked_decisions.map(d => d.category)`
     - Clear `blocked_decisions` array
     - **Rebuild revised nodes before re-sweeping:** For each node set to "revised", run `/forgeplan:build [node-id]` with a fresh agent. The re-sweep must audit rebuilt code, not stale pre-decision code.
     - After all rebuilds complete: **re-run Phase 2 (sweep) with ONLY the agents whose categories are in `affectedCategories`** to verify the changes didn't introduce new issues. This is a targeted re-sweep, not a full pass. Continue through Phase 3 → 4 → 5 → 6 → 7 as normal.

     **If the session ends before the user responds (or user says "later"):** The decisions are already persisted in state.json via `sweep_state.blocked_decisions`. Next session, `session-start.js` detects them and warns the user. The user can resume with `/forgeplan:sweep`, which checks for pending `blocked_decisions` in Phase 1 and presents them for resolution before continuing the sweep.
7. After fixing all findings for this node:
   - **Restore node status:** Set `nodes.[node-id].status` back to `nodes.[node-id].previous_status`
   - Clear `nodes.[node-id].previous_status` to null
   - Clear `active_node` to null
   - Set `sweep_state.fixing_node` to null
   - Move findings from `pending` to `resolved` (set `resolved_by: "claude"`, `resolved_pass: [N]`)
8. Repeat for next node

This mirrors the save/restore pattern used for building and reviewing — recovery and integrate-check both depend on `nodes.[id].status` being correct.

**IMPORTANT:** Use a FRESH agent for each fix batch (Agent tool). Do not fix in the same context that found the issue. This is the "Fresh Agent on Fix" principle. With batching, one fresh agent handles all findings for a file/node — but it's still a fresh agent, not the one that found the issues.

### Phase 4.5: Deterministic Pre-Verification (Sprint 11 — catches regressions cheaply)

After ALL fix agents complete for the current pass, run deterministic checks BEFORE dispatching the next sweep pass:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/integrate-check.js"` — verifies contract consistency
2. If the project has phases: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/verify-cross-phase.js"` — verifies cross-phase exports
3. **If either script returns FAIL:** A fix introduced a regression. Identify which fix batch's files overlap with the failure, and re-dispatch that batch's fix agent with the regression details added to context. Do NOT run a full sweep pass — deterministic scripts caught the issue at ~0 token cost.
4. Repeat steps 1-3 until deterministic checks pass (max 3 retries per batch, then force-converge the finding to `needs_manual_attention`).
5. **Only proceed to Phase 2 (re-sweep) after deterministic checks pass.** Phase 4.5 is an optimization that catches regressions before a full re-sweep. If checks pass, loop back to Phase 2 for the next sweep pass. Phase 5 (re-integrate) runs after the sweep converges.

This gate catches 30-50% of fix regressions at script cost instead of sweep cost. A regression caught here costs ~0 tokens. The same regression caught in the next sweep pass costs ~300K tokens.

### Phase 5: Re-integrate

1. **Set `sweep_state.current_phase` to `"integrate"`** before running the check (so crash recovery knows we're integrating, not still fixing).
2. Run integration check:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/integrate-check.js"
```
3. Map the result:
- `passed = (verdict === "PASS" || verdict === "PASS_WITH_WARNINGS")`
- `failures = interfaces.filter(i => i.status === "FAIL")`
- **If `verdict === "INCOMPLETE"`:** Log a warning ("Integration check incomplete — some nodes may not have registered files. Treating as pass for sweep purposes."). Set `passed = true`. Do NOT loop — INCOMPLETE means pending/unknown interfaces that the sweep cannot fix (they need builds, not fixes). This prevents an infinite loop.
4. Update `sweep_state.integration_results`.
5. If integration fails AND `failures.length > 0`, classify each failure before adding:
   - **Skip** failures where the fault is `MISSING_SPEC`, `BOTH` (neither side built), or where either node's status is `pending` or `specced` — these cannot be fixed by the sweep. Log: "Skipping integration failure [description] — node(s) not yet built."
   - **Add** only failures where both participating nodes are in `built`, `reviewed`, `revised`, or `sweeping` status as new findings in `sweep_state.findings.pending` and loop back to Phase 4 (set `current_phase` back to `"claude-fix"`).
   - If all failures were skipped (none actionable), treat as pass with a warning to prevent an empty-fix infinite loop.
   If integration fails but `failures.length === 0` (edge case — non-PASS verdict with no FAIL interfaces), treat as pass with a warning to prevent an empty-fix infinite loop.
6. If integration passes and no `--cross-check` flag:
   - **If findings were fixed in this pass** (i.e., `sweep_state.findings.resolved` grew during this pass — compare resolved count before Phase 4 to after): increment `pass_number`, set `current_phase` to `"claude-sweep"`, and loop back to Phase 2 for re-verification. The fix cycle may have introduced new issues — re-sweeping catches them.
   - **If NO findings were fixed** (pass was clean from Phase 3 step 11, which sent us to Phase 5 directly): set `current_phase` to `"finalizing"` and proceed to Phase 7.
7. If integration passes and `--cross-check` flag: proceed to Phase 6.

### Phase 6: Cross-model verification (if --cross-check flag or auto in deep-build)

If the `--cross-check` flag is set:
1. Update `sweep_state.current_phase` to `"cross-check"`
2. Run `cross-model-bridge.js` with the sweep context:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cross-model-bridge.js" ".forgeplan/sweeps/sweep-[latest].md"
```
3. Check the result `status` field:

   **If `status: "skipped"`:**
   - Cross-model review is not configured (no BYOK config). This means `--cross-check` was requested but `review.mode` is `"native"` in config.yaml.
   - Log a warning: "Cross-model verification skipped — no alternate model configured in .forgeplan/config.yaml. Set review.mode to mcp, cli, or api to enable."
   - Treat as clean (the user explicitly asked for cross-check but has no config — don't block the sweep). Set `sweep_state.consecutive_clean_passes` to 2 and proceed to Phase 7 (finalizing). The deep-build report should note that cross-model verification was not performed.

   **If `status: "error"`:**
   - Log the error to the sweep report
   - Reset `sweep_state.consecutive_clean_passes` to 0 (error is NOT a clean pass)
   - Do NOT increment `pass_number` — a transient API failure is not a new sweep pass
   - Track consecutive error count (in-memory, not persisted — resets on successful call)
   - If this is the second consecutive error, set `sweep_state.halted_from_phase` to `"cross-check"`, set `current_phase` to `"halted"`, and present to user:
     ```
     Cross-model verification failed twice. Check your config.yaml review settings.
     Error: [error message from bridge]
     Run /forgeplan:recover to resume or abort.
     ```
   - Otherwise: stay at `current_phase: "cross-check"` and immediately retry the bridge call

   **If `status: "findings"`:**
   - **Re-score confidence:** The external model's self-assigned confidence scores are unreliable (it has no context about ForgePlan's calibration system). For each cross-model finding, Claude must re-evaluate the confidence score by reading the cited file and line, assessing the evidence strength, and assigning a new confidence value using the same 0-100 calibration guide the sweep agents use. Replace the external model's confidence with Claude's re-scored value. Then apply the same `< 75` filter — discard re-scored findings below 75. Log: "Re-scored [N] cross-model findings. Kept [M] (confidence >= 75), filtered [K]."
   - Re-number finding IDs to avoid collision with Claude findings. Use prefix `X` for cross-model: X1, X2, X3... (Claude findings use F1, F2, F3...)
   - Apply the finding precedence policy before routing:
     - Deterministic/runtime truth and explicit spec/contract truth outrank cross-model preference.
     - `kind: "contract-violation"`, `"runtime-risk"`, or `"test-gap"` may enter the normal fix cycle if confidence remains >= 75.
     - `kind: "advisory-refactor"` must NOT override an explicit accepted structural constraint, manifest contract, or passing deterministic verification. Route these to `needs_manual_attention` as advisory notes only; do not block convergence.
     - `kind: "spec-conflict"` means the alternate model is effectively arguing that the spec or architectural contract should change. Do NOT auto-fix this as if the code were wrong. Route it to `needs_manual_attention` with reason "cross-model spec conflict".
     - If a cross-model finding conflicts with an already-accepted Claude finding or fix because the Claude path is backed by explicit contract/runtime evidence, keep the contract-backed finding and downgrade the cross-model suggestion to advisory/manual attention.
   - After applying the policy, route findings by node type (same as Phase 3 step 8): real node IDs → `pending`, `"project"` → `needs_manual_attention`. Set `pass_found` on each.
   - Set `sweep_state.consecutive_clean_passes` to 0
   - Increment `sweep_state.pass_number`
   - Update `sweep_state.current_phase` to `"cross-fix"`
   - Fix findings (Phase 4 loop)
   - Re-integrate (Phase 5)
   - Loop back to Phase 6 (re-cross-check)

   **If `status: "clean"`:**
   - Increment `sweep_state.consecutive_clean_passes`
   - Increment `sweep_state.pass_number`
   - If `consecutive_clean_passes >= 2`: sweep complete, proceed to Phase 7
   - If `consecutive_clean_passes == 1`: loop back to Phase 6 step 2 (run another full cross-check). The second pass verifies stability — the alternate model re-reads the full codebase from disk, so any non-determinism in its analysis produces a genuine second opinion.

### Phase 7: Finalize

1. Update `sweep_state.current_phase` to `"finalizing"`
2. Write final summary to the sweep report
3. Clean up any remaining worktrees: `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" cleanup`
4. **Compile wiki** (Sprint 9, MEDIUM/LARGE only, skip for SMALL):
   Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/compile-wiki.js"` to update the knowledge base with findings from this sweep. This refreshes wiki pages for the next session.
5. Clear `sweep_state` to null
6. Present results to user:
   ```
   === Sweep Complete ===
   Passes: [N]
   Findings: [total found] found, [total resolved] resolved
   By category: [breakdown]
   Integration: [PASS/FAIL]
   Cross-model: [N consecutive clean passes / not run]

   Agent Convergence:
     [agent-name]: converged pass [N] | active (N findings) | skipped
     ...

   Manual Attention: [N items requiring human review]
   [For each item in needs_manual_attention: brief description]

   Reports: .forgeplan/sweeps/sweep-[timestamp].md

   What's next:
     → /forgeplan:measure    Check quality metrics
     → /forgeplan:status     Full project overview
     → /forgeplan:guide      Get guidance on next steps
   ```

## State Persistence

Write `sweep_state` to state.json after EVERY phase transition, finding resolution, and integration result. This ensures crash recovery has an accurate snapshot.

## Pass Limit

If `pass_number` reaches `max_passes` (default 10) without 2 consecutive clean cross-model passes:

1. Set `sweep_state.halted_from_phase` to the current value of `sweep_state.current_phase` (so recovery knows where to resume from).
2. Set `sweep_state.current_phase` to `"halted"`.
3. Write `sweep_state` to state.json (do NOT clear it — user must explicitly abort or resume).
4. Present:
```
=== Sweep Halted (Pass Limit) ===
Reached [max_passes] passes without convergence.
Unresolved findings: [N]
[list unresolved findings]

Run /forgeplan:recover to resume or abort.
```
