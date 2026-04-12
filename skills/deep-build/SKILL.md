---
description: Run the full autonomous ForgePlan pipeline from build through certification.
disable-model-invocation: true
---

# Deep Build — Full Autonomous Pipeline

Run the complete ForgePlan pipeline autonomously: build all → design pass (frontend) → verify-runnable → review → integrate → sweep → (runtime verify, Sprint 8) → cross-model (tier-aware) → certified.

**State mutation rule:** Do **not** hand-edit `.forgeplan/state.json` in deep-build. Use
`node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" ...` for operation state changes.
For node-level work, do **not** invoke `Skill(forgeplan:build)` or `Skill(forgeplan:review)`.
Those are command skills with `disable-model-invocation: true`. Read the skill files and execute
their workflows inline instead:
- `${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md`

## Prerequisites

- `.forgeplan/manifest.yaml` exists with nodes defined
- All nodes must be at status `pending` or later (deep-build handles speccing pending nodes in Phase 2)
- No active build (`active_node` must be null)
- No active sweep (`sweep_state` must be null)

## Process

### Phase 1: Initialize deep-build state

1. Read `.forgeplan/state.json` and verify prerequisites
2. Set `sweep_state` with the deterministic helper:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-sweep-state "{\"operation\":\"deep-building\",\"started_at\":\"[ISO timestamp]\",\"current_phase\":\"build-all\",\"pass_number\":1,\"current_model\":\"claude\",\"fixing_node\":null,\"consecutive_clean_passes\":0,\"max_passes\":10,\"needs_manual_attention\":[],\"failed_agents\":[],\"blocked_decisions\":[],\"findings\":{\"pending\":[],\"resolved\":[]},\"modified_files_by_pass\":{},\"agent_convergence\":{},\"integration_results\":{\"last_run\":null,\"passed\":false,\"failures\":[]}}"
   ```

   Note: `current_phase` starts as `"build-all"`, NOT `"claude-sweep"`. This is critical — next-node.js allows normal recommendations during the `"build-all"` phase but blocks them during sweep phases.

### Phase 2: Build all nodes

This is a sequential loop using existing commands:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/next-node.js"` to get the recommended node
2. Handle result by type:
   - `"recommendation"`:
     - Before any build starts, snapshot existing files for the node using the **Glob tool** with the node's `file_scope`, exactly as `/forgeplan:build` requires. Persist that list to `nodes.[node-id].pre_build_files` in state. Do **not** use Bash/Node ad hoc file enumeration here; active deep-build enforcement blocks non-whitelisted shell commands during build-all.
     - Do **not** invoke `Skill(forgeplan:builder)` or treat `forgeplan:builder` as a public skill. `builder` is an internal agent only.
     - Do **not** invoke `forgeplan:reviewer` or dispatch internal reviewer agents directly.
     - Do **not** pre-mutate `active_node` or node `status` before running the inline build or review workflows. Those workflows own the node-level state transitions.
     - If status is `"pending"`: execute the single-node **autonomous spec workflow inline** (read `${CLAUDE_PLUGIN_ROOT}/skills/spec/SKILL.md` and follow its Autonomous Mode for the specific node). Do **not** use `Skill(forgeplan:spec)` — `spec` has `disable-model-invocation: true`. Generate a complete spec with filled-in acceptance criteria and test fields, verify the spec file exists and has non-empty `test` fields for each AC, then read `${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md` and execute the single-node build workflow inline.
     - If status is `"specced"`: verify the spec has non-empty acceptance criteria test fields (skeleton specs from discover have empty fields). If test fields are empty, re-run the single-node autonomous spec workflow inline to complete them. Then read `${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md` and execute the single-node build workflow inline.
     - If status is `"built"`: node was built but not yet reviewed. Read `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` and execute review inline.
     - After each build, read `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` and execute review inline. Do not start the reviewer by hand.
     - **Parallel review optimization:** when `next-node.js` surfaces built-but-unreviewed work and there are multiple eligible `"built"` nodes waiting, do not review them strictly one-by-one on MEDIUM/LARGE by default. Instead:
       1. Gather all currently eligible `"built"` nodes in dependency order
       2. Partition them into dependency-safe batches (topological layers; no node in a batch depends on another node in that batch)
       3. For each batch, dispatch fresh Reviewer agents in parallel
       4. Keep the batch read-only: do **not** pre-mutate `active_node` or mark multiple nodes as `"reviewing"` before dispatch
       5. After the batch returns, serialize `complete-review` state transitions in topological order, using:
          - `"reviewed"` for APPROVE
          - `"reviewed-with-findings"` when advisory review completed but findings remain deferred
       6. Only fall back to strictly sequential review when:
          - tier is `SMALL`
          - `multi_agent_review.enabled` is true
          - `enforcement.mode` is `strict`
          - or a batch node requires immediate interactive recovery
     - Treat `state-transition.js complete-build` as the terminal node-state transition for that build. Do **not** add a follow-up `set-node-status "[node-id]" "built"` after it succeeds.
     - Do **not** attempt root-scope integration edits during the node build loop (for example `main.py`, `app.py`, route registries, or top-level navigation registries). If a node needs that wiring, record it as an integration follow-up and continue. Cross-node/root wiring belongs to the owning root node or the integration phase, not the node builder.
     - **Bounce exhaustion recovery:** If a node's Stop hook has bounced 3 times (escalated to user), the autonomous deep-build must NOT halt the pipeline. Instead:
       1. Mark the node as `"built"` in state.json with a warning flag: set `nodes.[id].bounce_exhausted: true` and `nodes.[id].unverified_acs` to the list of acceptance criteria that were not verified as passing.
       2. Add each unmet AC as a sweep finding in `sweep_state.findings.pending` with all required fields: `id: "B[N]"` (sequential), `source_model: "stop-hook"`, `node: "[node-id]"`, `category: "code-quality"`, `severity: "HIGH"`, `confidence: 95`, `description: "Unverified AC from bounce exhaustion: [AC text]"`, `pass_found: 0`. Note: `confidence` MUST be included (95 = high confidence these are real issues) or the sweep's <75 filter will silently drop them.
       3. Continue the pipeline to the next node — do not break autonomy.
       4. In the Phase 8 deep-build report, include a section: "**Nodes with unverified ACs (bounce exhaustion):** Node [id] completed with unverified ACs: [list]. The sweep will re-evaluate these."
   - `"complete"`: all nodes done, proceed to Phase 2b (design pass) then Phase 3 (verify-runnable)
   - `"phase_complete"`: all current-phase nodes done but future phases remain. Proceed to Phase 2b (design pass) then Phase 3 (verify-runnable). Phase Advancement after Phase 8 handles incrementing `build_phase` and looping back.
   - `"stuck"`: auto-recover stuck nodes based on their current status, then re-run next-node.js. Do NOT invoke interactive `/forgeplan:recover` — deep-build must stay autonomous.
     - `"building"` → run:
       ```bash
       node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-node-status "[node-id]" "specced"
       ```
       then read `${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md` and rebuild from scratch inline
     - `"reviewing"` → run:
       ```bash
       node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-node-status "[node-id]" "built"
       ```
       then read `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` and re-review inline
     - `"review-fixing"` → run:
       ```bash
       node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-node-status "[node-id]" "built"
       ```
       then read `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` and re-review after the fix attempt
     - `"revising"` → if `previous_status` is set, run:
       ```bash
       node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" restore-previous-status "[node-id]"
       ```
       otherwise run:
       ```bash
       node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-node-status "[node-id]" "reviewed"
       ```
       then re-revise
     - `"sweeping"` → if `previous_status` is set, run:
       ```bash
       node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" restore-previous-status "[node-id]"
       ```
       otherwise run:
       ```bash
       node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-node-status "[node-id]" "reviewed"
       ```
   - `"blocked"` or `"error"`: halt deep-build with error message, preserve `sweep_state` for recovery:
     ```
     Deep build halted: [message from next-node.js]
     Run /forgeplan:recover to resume or abort.
     ```
   - `"rebuild_needed"`: for each listed node, read `${CLAUDE_PLUGIN_ROOT}/skills/build/SKILL.md` and execute the single-node build workflow inline, then read `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` and execute the single-node review workflow inline (same build+review pattern as the recommendation branch — no unreviewed nodes in the autonomous pipeline), then re-run next-node.js
   - `"sweep_active"`: a sweep is still active from an interrupted run. Run:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" clear-sweep-state
     node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" clear-active-node
     ```
     then re-run next-node.js. This resets the stale sweep so the build loop can proceed.
3. Repeat until `"complete"` or `"phase_complete"`.

All existing enforcement (PreToolUse, PostToolUse, Builder agent, Stop hook) applies exactly as in manual builds. The deep-build orchestrator just drives the loop.

**Important:** For each build and review, use fresh Agent subagents. Do not accumulate context across node builds.

**Phase transition:** After all nodes are built and reviewed:
1. **(Sprint 9, MEDIUM/LARGE only)** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/compile-wiki.js"` to compile the knowledge base from specs + source. NOTE: This is the ONLY compile-wiki invocation on the deep-build path — sweep skips Phase 1 when invoked from deep-build (sweep.md line 26), so sweep's Phase 1 step 7 compile does NOT run here.
2. Update `sweep_state.current_phase` from `"build-all"` to `"design-pass"` with:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-sweep-phase "design-pass"
   ```

### Phase 2b: Design pass (frontend quality)

**Skip this phase if:** no frontend nodes exist in the manifest (all nodes have `type` other than `frontend`), OR `complexity_tier` is `SMALL` and config does not explicitly enable design pass. If skipping, run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-sweep-phase "verify-runnable"
```
and proceed directly to Phase 3.

1. `sweep_state.current_phase` should already be `"design-pass"` from the Phase 2 transition. Do not hand-edit `state.json` here.
2. Load the `frontend-design` skill directly — the design-pass agent is not in the registry (it's a specialized single-use agent, not a standard sweep/build agent). Do **not** search heuristically for this file. Read the exact path `${CLAUDE_PLUGIN_ROOT}/skill-library/core/frontend-design.md` for inclusion in the agent prompt. If a direct read of that exact path fails, skip the design pass with a warning.
3. Build the design-direction brief with:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/compose-design-context.js"
   ```
   Include that composed brief in the design-pass prompt. If it reports no explicit design context, note that explicitly and continue.
4. Identify all frontend nodes (nodes with `type: "frontend"` or nodes whose `file_scope` contains frontend files such as `.tsx`, `.jsx`, `.vue`, `.svelte`)
5. Dispatch the design-pass agent using the Agent tool:
   - Read `agents/design-pass.md` for the system prompt
   - Include the `frontend-design` skill content from `skill-library/core/frontend-design.md`
   - Include the composed design brief from `compose-design-context.js`
   - Include all frontend node files (read from each frontend node's `file_scope`)
   - Include the manifest for context
   - **Tier-aware depth:** Pass the complexity tier so the agent knows which levels to check:
     - SMALL (if explicitly enabled): Level 1 only (anti-slop rules)
     - MEDIUM: Levels 1-2 (anti-slop rules + visual consistency)
     - LARGE: Levels 1-3 (anti-slop rules + visual consistency + component quality)
6. Parse the agent's response for FINDING blocks (D-prefix) or CLEAN
7. If CLEAN: log "Design pass clean." Proceed to user steering (step 9).
8. If findings: dispatch a fresh fix agent per finding (same pattern as sweep Phase 4 — fresh agent, node-scoped, save/restore node status). After fixes, re-run the design pass agent once to verify. If still has findings after 2 passes, move remaining to `sweep_state.needs_manual_attention` with reason "design quality — user review recommended."
9. **User steering (one round):** Present a summary of the frontend build:
   ```
   Frontend design pass complete. Here's what was built:
     - [N] pages: [list page names from frontend nodes]
     - Palette: [detected primary colors from the code]
     - Layout: [detected layout pattern]

     Would you like to adjust anything? (e.g., 'darker', 'more minimal',
     'use green accent instead', 'add sidebar')
     Or press enter to continue to verification.
   ```
   - If user provides feedback: dispatch a fix agent with the feedback as instructions, targeting all frontend node files. Re-run design pass after.
   - If user presses enter / says "continue" / no response: proceed.
   - **In autonomous mode (greenfield/deep-build without user interaction):** Skip user steering. The design pass findings + fixes are sufficient.
10. Update the phase with:
    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-sweep-phase "verify-runnable"
    ```
    then proceed to Phase 3.

### Phase 3: Run verify-runnable gate (was Phase 2.5)

**Re-anchor:** Re-read `.forgeplan/manifest.yaml` and `.forgeplan/state.json` from disk before proceeding. Long build sessions may have lost context through compaction — re-reading ensures you have the current state of all nodes, file_scopes, and shared models.

Before proceeding to integration, verify the project can actually run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/verify-runnable.js"
```

If it returns **`status: "pass"`**: run
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-sweep-phase "integrate"
```
and proceed to Phase 4 (integration check).

If it returns **`status: "warnings"`**: treat this as pass-with-warnings. Record the warnings in the deep-build report and proceed to Phase 4.

If it returns **`status: "environment_error"`**: attempt environment-focused remediation (missing `.env`, port conflicts, missing local setup), retry once, then either proceed with a warning or halt if the project still cannot be verified.

If it returns **`status: "fail"`**: do **not** try to edit files directly from sweep-analysis mode. Route the failures into node-scoped fixes first:

1. Parse the failing `steps` from the `verify-runnable.js` JSON.
   - The step field is `name`, not `step`.
   - If the raw JSON is truncated or hard to inspect, use:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/summarize-verify-runnable.js" --stdin
     ```
     and pipe the JSON into it, or save the JSON to a temp file and pass the file path.
2. Map each failure to an owning node using file paths, workspace labels, and manifest scopes:
   - `frontend/**`, `typecheck:node*`, `test:node*`, `server:node*` -> `frontend-app-shell`
   - `placementops/modules/<name>/**` -> `<name>-module`
   - `placementops/core/**`, `alembic/**`, `main.py`, `requirements.txt`, `pyproject.toml`, `Pipfile`, `poetry.lock`, `Dockerfile`, `docker-compose.yml`, `alembic.ini`, or generic `install:python` dependency failures -> `core-infrastructure`
   - If a failure cannot be mapped to a real node, add it to `sweep_state.needs_manual_attention` and continue with the mapped failures only.
3. Group failures by owning node.
4. If multiple owners are affected, you may analyze and prepare the fix plans in parallel, but you must execute the write phase **serially** because ForgePlan only supports one `active_node` at a time during remediation. Do **not** apply fixes for multiple node groups in parallel.
5. For each affected node group, one at a time:
   - Read `.forgeplan/state.json` to capture the node's current status (typically `reviewed` or `reviewed-with-findings`)
   - Run:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" start-sweep-fix "[node-id]" "[previous-status]"
     ```
   - Dispatch a **fresh fix agent** scoped to that node only. Give it:
     - just the failures for that node
     - the node spec
     - the affected source files
     - the corresponding test/config files it may need to update
   - The fix agent may modify source and tests within the node's scope plus permitted root infra files; it must not perform cross-node edits.
   - After the fix agent finishes, run:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" restore-previous-status "[node-id]"
     ```
6. After all node-scoped fix groups finish, re-run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/verify-runnable.js"
   ```
7. Repeat the verify-runnable remediation loop up to 3 times. If failures remain after 3 remediation cycles, halt deep-build with an error and preserve `sweep_state` for recovery.

The verify-runnable gate **must pass** before proceeding to Phase 4. This catches fundamental project health issues (missing packages, syntax errors, broken configs) before investing time in integration checks and sweeps.

### Phase 4: Initial integration check (was Phase 3)

**Re-anchor:** Re-read `.forgeplan/manifest.yaml` and `.forgeplan/state.json` from disk.

Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/integrate-check.js"
```

Map result to `sweep_state.integration_results`:
```
passed = (verdict === "PASS" || verdict === "PASS_WITH_WARNINGS")
failures = interfaces.filter(i => i.status === "FAIL")
```

If `verdict === "INCOMPLETE"`: log warning, treat as pass with warning (same as sweep Phase 5). Note: integrate-check.js exits non-zero for INCOMPLETE, so check the verdict in JSON output rather than relying on exit code alone.

If integration fails and `failures.length > 0`, add each failure as a finding in `sweep_state.findings.pending` and proceed to fix cycle.

### Phase 5: Claude sweep (was Phase 4)

**Re-anchor:** Re-read `.forgeplan/manifest.yaml` and `.forgeplan/state.json` from disk. Also re-read all node specs from `.forgeplan/specs/` — the review phase may have triggered revisions.

Run `/forgeplan:sweep` (dispatch all sweep agents in parallel, merge findings, fix with node-scoped enforcement, progressive convergence).

After Claude sweep fixes, re-integrate (Phase 4 logic).

### Phase 6: Runtime verification (Phase B) (was Phase 4.5)

**Re-anchor:** Re-read `.forgeplan/manifest.yaml` for complexity_tier and node specs.

Update the phase before proceeding:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-sweep-phase "runtime-verify"
```

**Tier gate:** Read `complexity_tier` (with config.yaml `tier_override` check):
- **SMALL:** Skip Phase B entirely. Log: "Skipping runtime verification — SMALL tier (Phase A sufficient)." Proceed to Phase 7.
- **MEDIUM/LARGE:** Run runtime verification.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/runtime-verify.js" --tier [TIER]
```

Check the result:

**If `status: "pass"` or `status: "skip"`:** Log level reached and endpoints tested. If the result contains any LOW/advisory findings (e.g., "public endpoint — verify intentional", "no endpoint contracts"), include them in the deep-build report under "**Runtime Advisories**" so the user sees them in the final output. These are informational, not blocking. Proceed to Phase 7.

**If `status: "fail"`:** Runtime verification found issues.
1. For each finding from runtime-verify.js output:
   - Add required fields: `id: "R[N]"` (sequential), `source_model: "runtime-verify"`, `pass_found: sweep_state.pass_number`
   - **If severity is LOW:** add to `sweep_state.needs_manual_attention` as advisory (not actionable by fix agents). These appear in the report under "Runtime Advisories."
   - **If the finding has a non-empty `file` field AND severity is HIGH or MEDIUM:** add to `sweep_state.findings.pending` for the normal fix cycle (fix agent can target the file)
   - **If the finding has an empty `file` field AND severity is HIGH or MEDIUM:** add to `sweep_state.needs_manual_attention` instead (runtime findings without file anchors can't be auto-fixed). Include the endpoint details so the deep-build report surfaces them.
2. For findings in `pending` (with file anchors): dispatch fix agents, re-run `runtime-verify.js`, repeat up to 3 times
3. For findings in `needs_manual_attention`: log them in the deep-build report under "**Runtime Issues Requiring Manual Review**" with the endpoint details. Do NOT attempt automated fixes.
4. Proceed to Phase 7 after fix attempts complete (or immediately if all findings went to manual attention).

**If `status: "environment_error"`:** Log the error. Do NOT add as code findings. Attempt auto-fix:
- Missing .env → copy from .env.example, set MOCK_MODE=true
- Port conflict → report to user with port identification guidance
- After auto-fix attempt, retry once. If still failing, skip Phase B with warning and proceed to Phase 7.

This phase sits between sweep (Phase 5) and cross-model (Phase 7) because runtime issues should be fixed before spending cross-model tokens.

### Phase 7: Cross-model verification loop (was Phase 5)

**Re-anchor:** Re-read `.forgeplan/manifest.yaml` and `.forgeplan/state.json` from disk. The sweep may have modified specs (Category A fixes) and code across multiple nodes.

**Tier-aware execution:** Before running cross-model verification, read `complexity_tier` from `.forgeplan/manifest.yaml`. **Also check** `.forgeplan/config.yaml` for `complexity.tier_override` — if set and non-empty, use the override instead:

- **SMALL** (1-3 nodes): Skip cross-model verification entirely. Log "Skipping cross-model: SMALL project." Set `consecutive_clean_passes` to 2 and proceed directly to Phase 8.
- **MEDIUM** (4-6 nodes): Cross-model is optional. If an alternate model is configured (cross-model-bridge returns a result), run it. If not configured, skip with a log note and proceed to Phase 8.
- **LARGE** (7+ nodes): Cross-model is required. If no alternate model is configured, halt deep-build with an error: "LARGE projects require cross-model verification. Configure an alternate model in .forgeplan/config.yaml."

If cross-model is skipped (SMALL tier or unconfigured MEDIUM tier), note it in the final report.

This phase follows the **exact same logic as sweep Phase 6** (Task 9). All status handling, phase transitions, and error paths apply identically. The deep-build orchestrator executes this inline rather than delegating to `/forgeplan:sweep`.

1. Set the phase with:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-sweep-phase "cross-check"
   ```
2. Run cross-model bridge:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/cross-model-bridge.js" ".forgeplan/sweeps/sweep-[latest].md"
   ```
3. Check the result `status` field — handle ALL statuses exactly as sweep Phase 6:

   **If `status: "skipped"`:** Log warning ("no alternate model configured"), set `consecutive_clean_passes` to 2, proceed to Phase 8 (finalize). Note in report that cross-model was not performed.

   **If `status: "error"`:** Reset `consecutive_clean_passes` to 0. Do NOT increment `pass_number`. Track consecutive error count. On second consecutive error: set `halted_from_phase` to `"cross-check"`, set `current_phase` to `"halted"`, present error to user. Otherwise: retry immediately.

   **If `status: "findings"`:**
   - Re-number IDs with `X` prefix. Set `pass_found` on each.
   - Route by node type (same as sweep Phase 3): real node IDs → `pending`, `"project"` → `needs_manual_attention`
   - Set `consecutive_clean_passes` to 0
   - Increment `sweep_state.pass_number`
   - Set the phase with:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-sweep-phase "cross-fix"
     ```
   - Fix findings (node-scoped, same as sweep Phase 4 — save/restore node status, fresh agent per node)
   - Set the phase with:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/state-transition.js" set-sweep-phase "integrate"
     ```
   - Re-integrate (same as sweep Phase 5)
   - Loop back to step 1

   **If `status: "clean"`:**
   - Increment `consecutive_clean_passes`
   - Increment `pass_number`
   - If `consecutive_clean_passes >= 2`: proceed to Phase 8
   - If `consecutive_clean_passes == 1`: loop back to step 1

4. If `pass_number >= max_passes`: set `halted_from_phase` to `current_phase`, set `current_phase` to `"halted"`, report unresolved findings

### Phase 8: Final integration and report (was Phase 6)

**Re-anchor:** Final re-read of `.forgeplan/manifest.yaml` and `.forgeplan/state.json` from disk before generating the report.

1. Run final integration check
2. **(Sprint 9, MEDIUM/LARGE only)** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/compile-wiki.js"` to update the wiki with sweep findings. This is needed because sweep's Phase 7 compile-wiki is skipped when called from deep-build (sweep.md line 26). Without this step, the wiki would only reflect pre-sweep state.
3. Generate deep-build report at `.forgeplan/deep-build-report.md`:

The report must capture **pipeline decisions**, not just outcomes. Whenever a phase is skipped, downgraded, or uses a default, record the reason. This includes at minimum:
- research behavior (baseline-only vs stack-specific topics, or no artifacts found)
- implementation plan behavior (combined SMALL design+plan artifact vs separate plan review)
- skill loading behavior (enabled, disabled by SMALL tier, or disabled by config)
- wiki behavior (compiled vs skipped, and why)
- builder model decisions per node (from `state.json` `selected_builder_model` fields when available)
- runtime verification / cross-model / design-pass skips and their reasons

```markdown
# Deep Build Report

## Summary
- Project: [project name]
- Tier: [complexity tier]
- Nodes: [N] built, reviewed, and verified
- Total passes: [N]
- Wall-clock time: [duration]
- Final integration: [PASS/FAIL]
- Cross-model consecutive clean passes: [N]

## Pipeline Decisions
- Research: [baseline prior-art only / stack-specific topics also run / no research artifacts found] — [reason]
- Plan artifact: [combined SMALL design+plan / separate implementation plan / missing] — [reason]
- Skills: [enabled / disabled] — [reason]
- Wiki: [compiled / skipped] — [reason]
- Design pass: [ran / skipped] — [reason]
- Runtime verification: [ran / skipped] — [reason]
- Cross-model: [ran / skipped] — [reason]

## Build Models
| Node | Model | Source |
|------|-------|--------|
| data-store | sonnet | tier-default |
| cli | opus | models.builder_override.cli |

## Findings Timeline
| Pass | Model | Found | Resolved | Category |
|------|-------|-------|----------|----------|
| 1    | claude | 5    | 5        | types(2), imports(2), errors(1) |
| 2    | codex  | 2    | 2        | security(1), api(1) |
| 3    | codex  | 0    | 0        | — (clean) |
| 4    | codex  | 0    | 0        | — (clean, certified) |

## All Findings
[For each finding: ID, source model, node, category, description, resolution]

## Runtime Advisories
[LOW-severity findings from Phase B: public endpoint notices, missing contract warnings]

## Issues Requiring Manual Review
[Items from sweep_state.needs_manual_attention: project-level findings, user-skipped decisions, unresolvable items]

## Capability Usage
- Research artifacts: [list files from `.forgeplan/research/`, or "none found"]
- Plan artifact: [.forgeplan/plans/implementation-plan.md exists?]
- Skills registry: [.forgeplan/skills-registry.yaml exists?]
- Design docs: [list `DESIGN.md`, `docs/DESIGN.md`, `.forgeplan/wiki/design.md`, configured `design-profile:*` entries, or "none found"]
- Wiki files: [list key files, or "skipped for SMALL"]

## Integration Results
[Final integration check output]
```

3. **If Phase Advancement will run** (build_phase < max_phase): keep `sweep_state.current_phase` at `"integrate"` and `sweep_state.operation` at `"deep-building"` until promotion completes (do NOT clear sweep_state yet — crash recovery needs the breadcrumb, and `integrate` is already a valid resumable phase). Before changing `build_phase`, write `sweep_state.phase_advancement = { from_build_phase: [N], to_build_phase: [N+1], checkpoint: "pre_increment", promoted_nodes: [list], backup_dir: ".forgeplan/phase-advance-backup/" }` and persist backups of the manifest and promoted-node specs in that backup directory. **If NOT advancing** (build_phase >= max_phase or single-phase): clear `sweep_state` to null.
4. Present results only if NO phase advancement will run. If advancement WILL run, present a transition notice instead:

```
=== Phase [N] Certified ===
All phase [N] nodes are built, reviewed, and sweep-clean.
Starting phase advancement to phase [N+1]...
```

If no advancement is pending, present:

```
=== Deep Build Complete ===
All [N] nodes built, reviewed, and cross-model certified.
[total] findings found and resolved across [passes] passes.
Cross-model certified clean on [N] consecutive passes.
Report: .forgeplan/deep-build-report.md

Your project is ready:
  → /forgeplan:status          Full project overview
  → /forgeplan:measure         Verify quality metrics
  → /forgeplan:revise [node]   Make changes
  → /forgeplan:guide           Get guidance anytime
```

## Per-Pass Git Commits (Recommended)

After each completed fix cycle, create a git commit:
```bash
git add -A
git commit -m "forgeplan: sweep pass [N] — [resolved] findings resolved"
git tag forgeplan-sweep-pass-[N]
```

This makes "abort to pre-sweep state" trivially safe via git reset.

## Phase Advancement (Sprint 10B)

After Phase 8 certification completes:

0. If `build_phase >= max_phase` (all phases complete): skip Phase Advancement entirely — the Phase 8 report is the final output. Maximum phase advancement cycles: max_phase (safety bound).
1. Check if all `build_phase` nodes are reviewed and sweep-clean
2. If yes AND max_phase > build_phase, prompt:
   ```
   All phase [N] nodes are certified. Advance to phase [N+1]?
   This will: run cross-phase integration, increment build_phase, promote next-phase specs.
   [Y to advance / N to stay on current phase]
   ```
   For autonomous deep-build (--autonomous): auto-advance without prompt unless cross-phase review finds CRITICALs.
3. Run /forgeplan:integrate with cross-phase lens (MANDATORY — this is distinct from the Phase 4 same-phase integration check). This runs BOTH `integrate-check.js` (spec-to-spec) AND `verify-cross-phase.js` (implementation-to-spec). **Check exit codes AND parse JSON output:** exit code 1 = hard FAIL (halt immediately). Exit code 0 with `warned > 0` in either script's JSON = WARNs present — the LLM deep-check in integrate.md step 4 must run before proceeding. Only advance when both scripts exit 0 AND the LLM deep-check resolves all WARNs.
4. If integrate fully passes (no unresolved FAILs or WARNs): increment `build_phase` in manifest, set `build_phase_started_at` in state, and update `sweep_state.phase_advancement.checkpoint` to `"post_increment"`.
5. Before promoting specs, update `sweep_state.phase_advancement.checkpoint` to `"promoting_specs"`.
6. Promote specs for promoted nodes by executing the single-node autonomous spec workflow **inline** — detect interface-only specs (specs with `spec_type: "interface-only"` or `generated_from: "phase-promotion"`) and re-run spec generation to promote to full prescriptive specs. Do **not** invoke `Skill(forgeplan:spec)` here. The promoted spec must set `spec_type: "prescriptive"` and include all 14 fields. **If any promoted node's spec generation fails:** halt with error, preserve `sweep_state` (still has `current_phase: "integrate"` plus `phase_advancement` checkpoint state), and present: "Phase advancement failed during spec promotion for [node-id]. Run /forgeplan:recover to resume."
7. Update `sweep_state.phase_advancement.checkpoint` to `"promotion_complete"`. Do NOT delete backups or clear sweep_state yet.
8. Start new build cycle for promoted nodes (loop back to Phase 2). Phase 2's initialization overwrites `sweep_state` with fresh `operation: "deep-building"`, `current_phase: "build-all"`. **After Phase 2 successfully initializes sweep_state**, delete `.forgeplan/phase-advance-backup/`. A crash between step 7 and Phase 2 init is safe: `checkpoint: "promotion_complete"` tells recovery that spec promotion succeeded and the next action is to start the build loop (not re-run promotion).

## Error Handling

- If any phase fails fatally, write current state and halt
- Clean up any worktrees on halt: `node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-manager.js" cleanup`
- All state is persisted after every transition for crash recovery
- Use /forgeplan:recover to resume interrupted deep-builds


