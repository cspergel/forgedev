---
description: Sweep your entire codebase for cross-cutting issues. Tier-aware agent selection (SMALL 3, MEDIUM 4, LARGE 5) using 5 consolidated team agents (Red adversarial, Orange contract, Blue experience, Rainbow architect, White compliance). All opus. Progressive convergence drops clean agents. Findings fixed with node-scoped enforcement, then cross-model verified.
user-invocable: true
argument-hint: "[--cross-check (cross-model verification)]"
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# Codebase Sweep

**THIS COMMAND IS AUTONOMOUS WITH ONE EXCEPTION. Execute all phases (1→7) without stopping, pausing, or asking "shall I continue?". Fix ALL findings automatically. Do not present intermediate results and wait. The ONE exception: Category C blocked decisions (architectural choices) require user input — present them all at once, get answers, then continue automatically. Aside from that, run straight through to the final report.**

Run tier-selected sweep agents (3-5) in parallel across the entire codebase: 5 consolidated team agents (Red/Orange/Blue/Rainbow/White), all opus. Progressive reduction: agents that return CLEAN twice converge and are retired. Cross-cutting agents re-run whenever any other agent has findings. See Phase 2 for the full dispatch precedence rules.

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

4. Create `.forgeplan/sweeps/` directory if it doesn't exist
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
       "integration_results": { "last_run": null, "passed": false, "failures": [] }
     }
   }
   ```
6. Set `active_node` to `null`
7. **Compile wiki** (Sprint 9, MEDIUM/LARGE only, skip for SMALL):
   Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/compile-wiki.js"` to build/refresh the knowledge base before dispatching agents. This generates wiki node pages, rules.md, and decisions.md from current specs, source, and sweep reports.

### Phase 2: Dispatch sweep agents (progressive reduction)

**Tier-aware agent selection:** Read `complexity_tier` from `.forgeplan/manifest.yaml`. **Also check** `.forgeplan/config.yaml` for `complexity.tier_override` — if set and non-empty, use the override instead of the manifest tier:

- **SMALL tier:** Dispatch 3 agents:
  - Always: `sweep-red` (adversarial — security, errors, database, config), `sweep-orange` (contract — types, APIs, imports, cross-node), `sweep-white` (compliance — spec tracing, fresh eyes)

- **MEDIUM tier:** Dispatch 4 agents:
  - All SMALL agents plus: `sweep-blue` (experience — user flows, frontend UX, test quality)

- **LARGE tier (or no tier set):** Dispatch all 5 agents:
  - All MEDIUM agents plus: `sweep-rainbow` (architect — code quality, docs, architecture, simplicity)

**On the first pass, dispatch agents per the tier rules above. On subsequent passes, follow the precedence rules in "Progressive agent reduction" below.**

Agent definition files (read these, use as system prompts):
- `agents/sweep-red.md` (Red — adversarial: security, errors, config, database)
- `agents/sweep-orange.md` (Orange — contract: types, APIs, imports, cross-node)
- `agents/sweep-blue.md` (Blue — experience: user flows, frontend UX, test quality)
- `agents/sweep-rainbow.md` (Rainbow — architect: code quality, docs, architecture, simplicity)
- `agents/sweep-white.md` (White — compliance: spec tracing, fresh eyes, gap finding)

**Progressive agent reduction:**
1. On **pass 1**: dispatch the **tier-selected agents** from above (SMALL=3, MEDIUM=4, LARGE=5).
   - **Sprint 9 (MEDIUM/LARGE):** Pass 1 agents receive ALL source files (existing behavior) PLUS wiki node pages (decisions + past findings) if wiki exists. Do NOT send `wiki/rules.md` to sweep agents (trust boundary). Exception: `sweep-red` (Red Team) receives `wiki/rules.md` specifically to AUDIT it for dangerous rules.
   - **Sprint 9 Pass 2+ optimization (MEDIUM/LARGE):** Agents receive wiki node pages (NOT rules.md) + source files modified since last pass (from `sweep_state.modified_files_by_pass`) + source files referenced by any PENDING finding for the agent's categories. Agents still have Read/Grep tools for on-demand source inspection. Exception: `sweep-red` ALWAYS receives full source + rules.md on every pass.
   - **Sprint 9 Convergence rule:** Do NOT retire an agent if its categories still have pending findings in `sweep_state.findings.pending`. Only count a clean pass when agent returns CLEAN AND zero pending findings in its categories.
   - **White agent pass 2+ context:** On pass 2 and beyond, `sweep-white` additionally receives the previous pass's finding lists from all other agents. This enables its cross-agent gap-finding capability. On pass 1, White runs without this context (spec compliance + fresh eyes only).
2. After merging results, update `sweep_state.agent_convergence` for each agent. **Keys are agent names** (matching the `.md` filename without extension), NOT category names:
   ```json
   "agent_convergence": {
     "sweep-red": { "status": "active", "last_findings_pass": 1, "consecutive_clean": 0 },
     "sweep-orange": { "status": "clean", "last_findings_pass": null, "consecutive_clean": 1 },
     "sweep-white": { "status": "active", "last_findings_pass": 1, "consecutive_clean": 0 },
     ...
   }
   ```
   Note: agents may emit findings with overlapping categories (e.g., both sweep-red and sweep-orange may flag issues at API boundaries). Deduplication in Phase 3 step 4 handles genuine duplicates.
   - `status`: `"clean"` (returned CLEAN), `"active"` (had findings), `"failed"` (returned unstructured response), `"converged"` (2 consecutive clean passes — retired), `"force-converged"` (oscillation guard)
   - `last_findings_pass`: which pass this agent last found something
   - `consecutive_clean`: how many consecutive passes returned CLEAN
3. On **pass 2+**, determine which agents to dispatch using these rules **in precedence order**:
   a. **Converged agents are retired:** Skip any agent with `status: "converged"` or `"force-converged"`.
   b. **Cross-cutting agents re-run if ANY agent had findings:** `sweep-orange` (contracts span all boundaries), `sweep-rainbow` (architecture affected by any code change), and `sweep-white` (gap-finding depends on full picture) re-run whenever any other agent reported findings in the previous pass, even if they themselves were clean. They only converge when they return CLEAN AND no other active agent had findings in the same pass.
   c. **Confirmation pass for clean agents:** An agent that returned CLEAN on pass N gets re-run on pass N+1 to confirm. If clean again → `status: "converged"`, retired.
   d. **Active agents always re-run:** Any agent with `status: "active"` (had findings last pass) is dispatched.
   e. **Failed agents always re-run:** Any agent with `status: "failed"` (returned unstructured response) is re-dispatched. Failed agents are never counted as clean for convergence. After 3 consecutive failures, force-converge with `"force-converged"` and log: "Agent [name] force-converged after 3 consecutive failures."
   f. **Anti-oscillation guard:** If an agent's finding count stays the same or increases for 3 consecutive passes, force-converge it with `status: "force-converged"` and move remaining findings to `needs_manual_attention`.

**Token budget:** Before dispatching, estimate total content size (sum of all file sizes in bytes). If over 200KB, use a tiered approach:
1. For very large codebases (200KB+), agents can use Read/Grep tools on-demand instead of receiving all files upfront. Provide file paths and manifest so agents know what to inspect.
2. Always include shared types (`src/shared/types/index.ts`) and manifest for context with every agent.
3. If a single node's files exceed 100KB, instruct the agent to use Read/Grep tools on-demand instead of receiving file content upfront. Provide only file paths and the manifest so the agent knows what to inspect.

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
2. **Validate node IDs:** Discard any finding whose `node` field is not in `Object.keys(manifest.nodes)` AND is not the special value `"project"`. The `"project"` pseudo-node is used by agents (especially rainbow, white) for cross-cutting findings that don't belong to a single node — these go to `sweep_state.needs_manual_attention` instead of the automated fix cycle (they can't be node-scoped). For cross-node findings using `Node: [id] -> [id]` format (from sweep-orange), extract the first node ID (before `->`) as the primary node for fix scoping. Log a warning for each discarded finding ("Finding F[N] references unknown node '[id]' — discarding"). Apply the same validation in Phase 6 for cross-model findings.
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
9. If there are node-scoped findings in `pending`: update `sweep_state.current_phase` to `"claude-fix"` and proceed to Phase 4.
10. **If `pending` is empty but agents returned findings (all went to `needs_manual_attention`):** All findings are project-level — no automated fixes possible. Skip Phase 4, set `sweep_state.current_phase` to `"integrate"`, and proceed to Phase 5. Log: "All findings are project-level (manual attention). Skipping automated fix cycle."
11. **If zero findings AND zero failed agents** (all agents returned CLEAN successfully): skip Phase 4, set `sweep_state.current_phase` to `"integrate"`, and proceed directly to Phase 5.
12. **If zero findings BUT some agents failed:** Do NOT treat as clean. Failed agents are re-dispatched on the next pass (their `agent_convergence` status stays `"active"` or `"failed"`). Increment pass_number and loop back to Phase 2. A pass with only failed responses is not a clean pass for convergence purposes.

### Phase 4: Fix findings (node-scoped)

**THIS PHASE IS FULLY AUTONOMOUS. Fix ALL findings — do NOT ask the user which findings to fix, do NOT ask for confirmation, do NOT prioritize by severity. Fix everything in dependency order. The sweep is designed to loop: fix → re-sweep → fix → converge. If a fix introduces a new issue, the next sweep pass will catch it. Asking the user breaks the autonomous loop.**

**Parallel fix mode (MEDIUM/LARGE tiers with 3+ nodes needing fixes):**
When multiple nodes need fixes and their file_scopes don't overlap, fix agents can run in parallel using git worktrees for isolation:

1. **Set up state BEFORE dispatching:** For each node needing fixes, in the main working tree:
   - Set `nodes.[node-id].previous_status` to current status
   - Set `nodes.[node-id].status` to `"sweeping"`
   - Write state.json (all state updates are serialized in the main tree BEFORE parallel dispatch)
2. For each node, create an isolated worktree:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" create [node-id]
   ```
3. Set `sweep_state.fixing_node` to null (multiple nodes fixing simultaneously — use per-agent context, not global state).
4. Dispatch fix agents in parallel (Agent tool, single message, N calls) — each agent works in its worktree path instead of the main working directory. **Agents must NOT write to `.forgeplan/state.json`** — they only modify source code within the node's file_scope. State updates happen after merge.
5. After all parallel agents complete, merge each worktree back sequentially:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" merge [node-id]
   ```
6. **After each successful merge**, update state.json: restore `nodes.[node-id].previous_status`, set `sweep_state.fixing_node` to null, move findings from pending to resolved.
7. If a merge conflict occurs (exit code 1), handle the conflicted node:
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
8. After all merges, clean up: `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" cleanup`

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
7. Fix each validated finding — writes are enforced by PreToolUse (node's file_scope) + Layer 1 deterministic. Layer 2 is bypassed for sweeping (see hooks.json update in Task 14).
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

**IMPORTANT:** Use a FRESH agent for each node fix (Agent tool). Do not fix in the same context that found the issue. This is the "Fresh Agent on Fix" principle.

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
   - Route findings by node type (same as Phase 3 step 8): real node IDs → `pending`, `"project"` → `needs_manual_attention`. Set `pass_found` on each.
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
