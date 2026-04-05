# Sprint 6: Autonomous Iterative Sweep — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the autonomous multi-agent codebase sweep system — Claude's 6 parallel sweep agents find cross-cutting issues, fix them with node-scoped enforcement, then an alternate model (Codex/Gemini/GPT) cross-checks and re-sweeps until two consecutive clean passes.

**Architecture:** Two new operation modes (sweep, deep-build) layered on top of existing node-scoped enforcement. `sweep_state` in state.json tracks the autonomous loop. Sweep fixes reuse the existing PreToolUse/PostToolUse node-scoped enforcement by setting `active_node.status = "sweeping"`. Cross-model bridge extends the existing cross-model-review.js with sweep orchestration.

**Tech Stack:** Node.js scripts, Claude Code plugin commands (.md), agent definitions (.md), js-yaml, minimatch, fetch API for cross-model HTTP calls.

**Reference:** `Planning Documents/ForgePlan_Core_Execution_Plan.md` lines 511-689 (Sprint 6 full spec).

---

## Phase 1: Core Sweep Infrastructure (Tasks 1-11)

### Task 1: Update state-schema.json with sweep_state and "sweeping" status

**Files:**
- Modify: `forgeplan-plugin/templates/schemas/state-schema.json`

**Step 1: Add "sweeping" to active_node.status enum**

In `forgeplan-plugin/templates/schemas/state-schema.json`, find line 26:
```json
"enum": ["building", "reviewing", "review-fixing", "revising"],
```
Replace with:
```json
"enum": ["building", "reviewing", "review-fixing", "revising", "sweeping"],
```
Update the description on line 27 to mention sweeping:
```json
"description": "What operation is in progress. review-fixing is a transient status used during multi-agent review cycles when a fixer agent is writing code to address review findings. sweeping is used during sweep/deep-build fix cycles."
```

**Step 2: Add "sweeping" to per-node status enum**

Find line 49:
```json
"enum": ["pending", "specced", "building", "built", "reviewing", "review-fixing", "reviewed", "revising", "revised"],
```
Replace with:
```json
"enum": ["pending", "specced", "building", "built", "reviewing", "review-fixing", "reviewed", "revising", "revised", "sweeping"],
```

**Step 3: Add sweep_state as a new top-level property**

After the `discovery_complete` property (line 122), **add a trailing comma** after the closing `}` of `discovery_complete` (line 122 becomes `}` → `},`), then add the full `sweep_state` object:

```json
"sweep_state": {
  "type": ["object", "null"],
  "default": null,
  "description": "Tracks autonomous sweep/deep-build operations. Null when no sweep is active.",
  "properties": {
    "operation": {
      "type": "string",
      "enum": ["sweeping", "deep-building"],
      "description": "Which autonomous operation is running"
    },
    "started_at": {
      "type": "string",
      "format": "date-time"
    },
    "current_phase": {
      "type": "string",
      "enum": ["build-all", "claude-sweep", "claude-fix", "cross-check", "cross-fix", "integrate", "finalizing", "halted"],
      "description": "Current phase of the sweep/deep-build cycle. build-all is deep-build only (existing pipeline, next-node.js should still return recommendations). claude-sweep onward is the autonomous sweep loop. halted means max_passes reached without convergence."
    },
    "pass_number": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    },
    "current_model": {
      "type": "string",
      "description": "Which model is currently active (claude, codex, gemini, gpt)"
    },
    "fixing_node": {
      "type": ["string", "null"],
      "description": "Node ID currently being fixed, or null if in analysis/cross-check phase"
    },
    "halted_from_phase": {
      "type": ["string", "null"],
      "default": null,
      "description": "When current_phase is 'halted', this records the phase before halting so recovery knows where to resume from"
    },
    "consecutive_clean_passes": {
      "type": "integer",
      "minimum": 0,
      "default": 0
    },
    "max_passes": {
      "type": "integer",
      "default": 10
    },
    "findings": {
      "type": "object",
      "properties": {
        "pending": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string", "description": "Finding ID. Claude findings: F1, F2... Cross-model findings: X1, X2..." },
              "source_model": { "type": "string" },
              "node": { "type": "string" },
              "category": { "type": "string", "enum": ["auth-security", "type-consistency", "error-handling", "database", "api-contracts", "imports"] },
              "severity": { "type": "string", "enum": ["HIGH", "MEDIUM", "LOW"] },
              "description": { "type": "string" },
              "file": { "type": "string", "description": "File path where the issue was found" },
              "line": { "type": "string", "description": "Approximate line number" },
              "fix": { "type": "string", "description": "Recommended remediation" },
              "pass_found": { "type": "integer" }
            },
            "required": ["id", "source_model", "node", "category", "description", "pass_found"]
          }
        },
        "resolved": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "source_model": { "type": "string" },
              "node": { "type": "string" },
              "category": { "type": "string" },
              "resolved_by": { "type": "string" },
              "resolved_pass": { "type": "integer" }
            }
          }
        }
      }
    },
    "modified_files_by_pass": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "integration_results": {
      "type": "object",
      "properties": {
        "last_run": { "type": ["string", "null"] },
        "passed": { "type": "boolean" },
        "failures": { "type": "array" }
      }
    }
  },
  "required": ["operation", "started_at", "current_phase", "pass_number", "current_model", "consecutive_clean_passes", "max_passes", "findings"]
}
```

**Step 4: Verify the schema is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('forgeplan-plugin/templates/schemas/state-schema.json','utf-8')); console.log('Valid JSON')"`
Expected: `Valid JSON`

**Step 5: Commit**

```bash
git add forgeplan-plugin/templates/schemas/state-schema.json
git commit -m "feat(sprint6): add sweep_state schema and sweeping status to state-schema.json"
```

---

### Task 2: Update validate-manifest.js and status-report.js — add "sweeping" to status lists

**Files:**
- Modify: `forgeplan-plugin/scripts/validate-manifest.js:71`
- Modify: `forgeplan-plugin/scripts/status-report.js:60`

**Step 1: Add "sweeping" to valid statuses in validate-manifest.js**

Find line 71:
```js
const validStatuses = ["pending", "specced", "building", "built", "reviewing", "review-fixing", "reviewed", "revising", "revised"];
```
Replace with:
```js
const validStatuses = ["pending", "specced", "building", "built", "reviewing", "review-fixing", "reviewed", "revising", "revised", "sweeping"];
```

**Step 2: Add "sweeping" to inProgressStatuses in status-report.js**

Find line 60:
```js
const inProgressStatuses = ["building", "reviewing", "review-fixing", "revising"];
```
Replace with:
```js
const inProgressStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];
```

This ensures `/forgeplan:status` shows the correct in-progress icon for nodes being sweep-fixed.

**Step 3: Run validation script to verify it still works**

Run: `node forgeplan-plugin/scripts/validate-manifest.js`
Expected: Either "No manifest found" (if no .forgeplan/) or a clean validation run.

**Step 4: Commit**

```bash
git add forgeplan-plugin/scripts/validate-manifest.js forgeplan-plugin/scripts/status-report.js
git commit -m "feat(sprint6): add sweeping to valid node statuses in validate-manifest and status-report"
```

---

### Task 3: Update next-node.js — sweep awareness

**Files:**
- Modify: `forgeplan-plugin/scripts/next-node.js:84,189`

**Step 1: Add "sweeping" to stuck status detection**

Find line 84:
```js
const stuckStatuses = ["building", "reviewing", "review-fixing", "revising"];
```
Replace with:
```js
const stuckStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];
```

**Step 2: Add sweep_state active check before recommendations**

After the stuck nodes check (after line 104, before the "Priority 2" section), add:

```js
// --- Priority 1b: Sweep/deep-build in progress ---
// Only block node recommendations during actual sweep phases.
// During deep-build's "build-all" phase, the existing build/review
// pipeline needs next-node recommendations to function.
if (state.sweep_state && state.sweep_state.operation) {
  const ss = state.sweep_state;
  const buildPhases = ["build-all"];
  if (!buildPhases.includes(ss.current_phase)) {
    // Compute completed count inline (the main `completed` var is defined later in the file)
    const completedStatuses_ = ["built", "reviewed", "revised"];
    const completedCount = nodeIds.filter((id) => {
      const ns = nodeStates[id];
      return ns && completedStatuses_.includes(ns.status);
    }).length;
    const result = {
      type: "sweep_active",
      operation: ss.operation,
      phase: ss.current_phase,
      pass: ss.pass_number,
      model: ss.current_model,
      pending_findings: (ss.findings && ss.findings.pending) ? ss.findings.pending.length : 0,
      resolved_findings: (ss.findings && ss.findings.resolved) ? ss.findings.resolved.length : 0,
      message: `${ss.operation === "deep-building" ? "Deep build" : "Sweep"} in progress — pass ${ss.pass_number}, phase: ${ss.current_phase}, model: ${ss.current_model}.`,
      progress: { completed: completedCount, total: nodeIds.length },
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  // build-all: fall through to normal recommendation logic
}
```

**Step 3: Add "sweeping" to in-progress skip in eligible node check**

Find line 189:
```js
if (status === "building" || status === "reviewing" || status === "review-fixing" || status === "revising") continue;
```
Replace with:
```js
if (status === "building" || status === "reviewing" || status === "review-fixing" || status === "revising" || status === "sweeping") continue;
```

**Step 4: Test next-node.js still runs cleanly**

Run: `node forgeplan-plugin/scripts/next-node.js`
Expected: Error about no manifest (normal for dev dir) or valid output.

**Step 5: Commit**

```bash
git add forgeplan-plugin/scripts/next-node.js
git commit -m "feat(sprint6): add sweep awareness to next-node.js"
```

---

### Task 4: Update session-start.js — sweep crash detection

**Files:**
- Modify: `forgeplan-plugin/scripts/session-start.js`

**Step 1: Add "sweeping" to stuck status detection**

Find line 46:
```js
const stuckStatuses = ["building", "reviewing", "review-fixing", "revising"];
```
Replace with:
```js
const stuckStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];
```

**Step 2: Add sweep_state crash detection after the active_node check**

After the `state.nodes` loop (after line 69), add:

```js
// Check for interrupted sweep/deep-build
if (state.sweep_state && state.sweep_state.operation) {
  const ss = state.sweep_state;
  const op = ss.operation === "deep-building" ? "deep-build" : "sweep";

  // If both active_node AND sweep_state exist, this is a single crash event
  // (e.g., deep-build was mid-build, or sweep was mid-fix). Show ONE combined warning.
  if (state.active_node && stuckStatuses.includes(state.active_node.status)) {
    // Remove any per-node warning already pushed for this node (avoid duplication)
    const nodeId = state.active_node.node;
    const idx = warnings.findIndex(w => w.includes(`"${nodeId}"`));
    if (idx !== -1) warnings.splice(idx, 1);

    warnings.push(
      `WARNING: An interrupted ${op} was detected during node "${nodeId}" ` +
      `${state.active_node.status === "sweeping" ? "fix" : "build"} ` +
      `(phase: ${ss.current_phase}, pass: ${ss.pass_number}). ` +
      `Run /forgeplan:recover to resume or abort the ${op}.`
    );
  } else {
    warnings.push(
      `WARNING: An interrupted ${op} was detected (phase: ${ss.current_phase}, pass: ${ss.pass_number}). ` +
      `Run /forgeplan:recover to resume, restart the current pass, or abort.`
    );
  }
}
```

**Step 3: Commit**

```bash
git add forgeplan-plugin/scripts/session-start.js
git commit -m "feat(sprint6): add sweep/deep-build crash detection to session-start"
```

---

### Task 5: Update stop-hook.js — allow "sweeping" through

**Files:**
- Modify: `forgeplan-plugin/scripts/stop-hook.js:72`

**Design decision:** Stop hook does NOT fire during "sweeping" fixes. Sweep fixes are verified by cross-model re-check, not AC evaluation. The sweep orchestrator handles verification.

**Step 1: Update the status check to allow sweeping through**

Find line 72:
```js
if (!state.active_node || state.active_node.status !== "building") {
  return { block: false };
}
```
Replace with:
```js
// Stop hook only fires for full builds, not reviews, revises, review-fixing, or sweep fixes.
// Sweep fixes ("sweeping") are verified by cross-model re-check, not AC evaluation.
if (!state.active_node || state.active_node.status !== "building") {
  return { block: false };
}
```

Note: The existing code already handles this correctly since it only fires for `"building"`. The comment is the documentation of the explicit decision as required by the execution plan.

**Step 2: Commit**

```bash
git add forgeplan-plugin/scripts/stop-hook.js
git commit -m "feat(sprint6): document sweeping allow-through in stop-hook (verified by cross-model, not ACs)"
```

---

### Task 6: Update pre-tool-use.js — sweep enforcement modes

**Files:**
- Modify: `forgeplan-plugin/scripts/pre-tool-use.js`

This is the most complex modification. Two new enforcement modes:
1. **Sweep analysis mode** (`sweep_state` active, `active_node` is null): read-only except `.forgeplan/sweeps/`, `.forgeplan/deep-build-report.md`, `.forgeplan/state.json`
2. **Node-scoped fix mode** (`active_node.status === "sweeping"`): same as building but with shared types writable (Option A: all sweep fixes may write shared types)

**Step 1: Add sweep analysis mode check — REPLACES the existing early return**

The current code at lines 107-111 is (include the comment on line 107):
```js
// --- Check 1: Is there an active node? ---
if (!state.active_node) {
  // No active operation — allow all writes (user is working outside ForgePlan commands)
  return { block: false };
}
```

**REPLACE lines 107-111** (including the comment) with the sweep-aware version. The sweep_state check MUST go BEFORE the early return, otherwise it's unreachable:

```js
if (!state.active_node) {
  // Check for sweep analysis mode BEFORE allowing all writes.
  // sweep_state can be active with no active_node (analysis phase, between node fixes).
  if (state.sweep_state && state.sweep_state.operation) {
    // Sweep analysis mode: only .forgeplan/sweeps/, deep-build-report.md, and state.json writable
    if (
      relPath.startsWith(".forgeplan/sweeps/") ||
      relPath === ".forgeplan/deep-build-report.md" ||
      relPath === ".forgeplan/state.json"
    ) {
      return { block: false };
    }
    return {
      block: true,
      message:
        `BLOCKED: Sweep analysis mode is active (${state.sweep_state.operation}, phase: ${state.sweep_state.current_phase}). ` +
        `Only .forgeplan/sweeps/, .forgeplan/deep-build-report.md, and .forgeplan/state.json can be written during analysis. ` +
        `Assign the finding to a node for fixing before modifying source files.`,
    };
  }
  // No active operation and no sweep — allow all writes
  return { block: false };
}
```

**Step 2: Add sweeping status to the building/.forgeplan/ boundary check**

Find line 139:
```js
if ((activeStatus === "building" || activeStatus === "review-fixing") && relPath.startsWith(".forgeplan/")) {
```
Replace with:
```js
if ((activeStatus === "building" || activeStatus === "review-fixing" || activeStatus === "sweeping") && relPath.startsWith(".forgeplan/")) {
```

Replace lines 140-146 (the `activeNodeId_` assignment and the `if` block) to also allow sweeps directory **only during sweeping** (not during normal builds):
```js
const activeNodeId_ = state.active_node.node;
if (
  relPath === `.forgeplan/conversations/nodes/${activeNodeId_}.md` ||
  relPath === ".forgeplan/state.json" ||
  // Sweep-only paths: only allow during sweeping, not during normal builds
  (activeStatus === "sweeping" && (relPath.startsWith(".forgeplan/sweeps/") || relPath === ".forgeplan/deep-build-report.md"))
) {
  return { block: false };
}
```

This preserves the existing tight build boundary for normal builds while allowing sweep-specific paths only during sweep fixes.

**Step 3: Update shared types handling for sweeping**

Find line 183 (the shared types check for building):
```js
if (relPath === "src/shared/types/index.ts") {
  const sharedTypesAbs = path.join(cwd, relPath);
  if (!fs.existsSync(sharedTypesAbs)) {
    return { block: false };
  }
  return {
    block: true,
    message:
      `BLOCKED: src/shared/types/index.ts already exists and cannot be modified during /forgeplan:build. ` +
```

Replace the entire shared types block (lines 183-195) with:
```js
if (relPath === "src/shared/types/index.ts") {
  // Sweep fixes may always write shared types (Option A from execution plan)
  if (activeStatus === "sweeping") {
    return { block: false };
  }
  const sharedTypesAbs = path.join(cwd, relPath);
  if (!fs.existsSync(sharedTypesAbs)) {
    return { block: false };
  }
  return {
    block: true,
    message:
      `BLOCKED: src/shared/types/index.ts already exists and cannot be modified during /forgeplan:build. ` +
      `Only /forgeplan:revise can regenerate it after manifest changes. ` +
      `Import from the existing module instead.`,
  };
}
```

**Step 4: Add "sweeping" to the catch-all building check**

Find line 175:
```js
if (activeStatus !== "building" && activeStatus !== "review-fixing") {
  return { block: false };
}
```
Replace with:
```js
if (activeStatus !== "building" && activeStatus !== "review-fixing" && activeStatus !== "sweeping") {
  return { block: false };
}
```

**Step 5: Add `cross-model-bridge.js` to Bash safe patterns**

Add after line 401 (`regenerate-shared-types.js`):
```js
/^\s*node\s+[^\s]*cross-model-bridge\.js/,   // Sprint 6: cross-model sweep bridge
```

**Step 6: Restructure Bash evaluator for sweep_state awareness**

The current code at lines 365-374 returns early if no `active_node`, then defines `inProgressStatuses`. We need to: (a) add "sweeping" to statuses, (b) check `sweep_state` BEFORE the early return. **REPLACE lines 365-374** (the entire block from `if (!state.active_node)` through `if (!inProgressStatuses.includes(activeStatus))`) with:

```js
const inProgressStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];

// Check if we should enforce: either active_node in progress OR sweep_state active
const hasActiveNode = state.active_node && inProgressStatuses.includes(state.active_node.status);
const hasSweepState = !state.active_node && state.sweep_state && state.sweep_state.operation;

if (!hasActiveNode && !hasSweepState) {
  return { block: false };
}

const activeStatus = state.active_node ? state.active_node.status : "sweeping";
```

**IMPORTANT:** This single replacement handles BOTH the `inProgressStatuses` update AND the sweep_state restructure. The old `inProgressStatuses` definition (line 370) is included in the replaced range and re-defined with "sweeping" added. Do NOT apply Step 5's inline change to line 370 separately — this replacement subsumes it.

Then update the error messages below (lines 438-444) to use `activeStatus` instead of `state.active_node.status`.

**Step 7: Commit**

```bash
git add forgeplan-plugin/scripts/pre-tool-use.js
git commit -m "feat(sprint6): add sweep analysis mode and sweeping fix mode to pre-tool-use enforcement"
```

---

### Task 7: Update post-tool-use.js — sweep mode activation

**Files:**
- Modify: `forgeplan-plugin/scripts/post-tool-use.js:64,92`

**Step 1: Update shared types tracking for sweeping**

Find line 64:
```js
if (stateData.active_node && (stateData.active_node.status === "building" || stateData.active_node.status === "review-fixing")) {
```
Replace with:
```js
if (stateData.active_node && (stateData.active_node.status === "building" || stateData.active_node.status === "review-fixing" || stateData.active_node.status === "sweeping")) {
```

**Step 2: Activate during "sweeping" status**

Find line 92:
```js
if (!state.active_node || (state.active_node.status !== "building" && state.active_node.status !== "review-fixing")) return;
```
Replace with:
```js
if (!state.active_node || (state.active_node.status !== "building" && state.active_node.status !== "review-fixing" && state.active_node.status !== "sweeping")) return;
```

**Step 3: Add pass-level modified-file tracking for sweep mode**

After the file classification try/catch block (after line 195, NOT inside the `if (targetList ...)` block on line 187). This ensures sweep tracking runs for every file write during sweeping, not just newly-classified ones. Add:

```js
// --- Sweep mode: track modified files per pass ---
if (state.active_node.status === "sweeping") {
  try {
    // Re-read state for sweep_state
    const freshState = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    if (freshState.sweep_state) {
      const passKey = String(freshState.sweep_state.pass_number || 1);
      if (!freshState.sweep_state.modified_files_by_pass) {
        freshState.sweep_state.modified_files_by_pass = {};
      }
      if (!freshState.sweep_state.modified_files_by_pass[passKey]) {
        freshState.sweep_state.modified_files_by_pass[passKey] = [];
      }
      if (!freshState.sweep_state.modified_files_by_pass[passKey].includes(relPath)) {
        freshState.sweep_state.modified_files_by_pass[passKey].push(relPath);
        freshState.last_updated = new Date().toISOString();
        fs.writeFileSync(statePath, JSON.stringify(freshState, null, 2), "utf-8");
      }
    }
  } catch (err) {
    process.stderr.write(
      `ForgePlan PostToolUse: Could not track sweep modified file: ${err.message}\n`
    );
  }
}
```

**Step 4: Commit**

```bash
git add forgeplan-plugin/scripts/post-tool-use.js
git commit -m "feat(sprint6): activate post-tool-use during sweeping with pass-level file tracking"
```

---

### Task 8: Create six sweep agent definitions

**Files:**
- Create: `forgeplan-plugin/agents/sweep-auth-security.md`
- Create: `forgeplan-plugin/agents/sweep-type-consistency.md`
- Create: `forgeplan-plugin/agents/sweep-error-handling.md`
- Create: `forgeplan-plugin/agents/sweep-database.md`
- Create: `forgeplan-plugin/agents/sweep-api-contracts.md`
- Create: `forgeplan-plugin/agents/sweep-imports.md`

Each agent follows the same structure. Only `name`, `description`, and `model` in frontmatter (maxTurns and tools are rejected by runtime).

**IMPORTANT — All sweep agents MUST include this constraint in their Rules section:**
```
- SEVERITY INTEGRITY: Never downgrade a finding's severity to make the report look cleaner.
  If it's HIGH, report it as HIGH. If you're unsure, round UP not down. The purpose of
  this sweep is to find problems, not to produce a reassuring report.
```
This prevents the "rubber-stamp" failure mode where agents minimize findings to appear helpful.

**Step 1: Create sweep-auth-security.md**

```markdown
---
name: sweep-auth-security
description: Codebase sweep agent — audits authentication, authorization, session management, input validation, and security vulnerabilities across all nodes
model: opus
---

# Auth & Security Sweep Agent

You are a security-focused code auditor. Your job is to sweep the ENTIRE codebase for cross-cutting security issues that node-scoped review cannot catch.

## What You Audit

1. **Authentication flows** — Are login, registration, password reset implemented correctly? Are sessions invalidated on logout?
2. **Authorization** — Is role-based access enforced at every route/endpoint, not just the frontend? Can a client access accountant-only routes?
3. **Input validation** — Are all user inputs validated/sanitized before use? SQL injection, XSS, path traversal?
4. **Session management** — Are tokens stored securely? Are they rotated? Expiry enforced?
5. **Secrets handling** — Are API keys, database credentials, or tokens hardcoded anywhere?
6. **CORS/CSP** — Are headers configured correctly?
7. **Error information leakage** — Do error responses expose stack traces, internal paths, or database details?

## How to Report

For each finding, output a structured block:

```
FINDING: F[N]
Node: [node-id]
Category: auth-security
Severity: HIGH | MEDIUM | LOW
Description: [what's wrong]
File: [exact file path]
Line: [approximate line number]
Fix: [specific remediation]
```

## Rules

- Read ALL implementation files across ALL nodes. Do not limit to one node.
- Check shared types for security-relevant fields (password hashing, token types).
- Cross-reference: if auth node exports a middleware, verify EVERY route in api node uses it.
- Do NOT trust the builder's claims. Read the actual code.
- **SEVERITY INTEGRITY:** Never downgrade a finding's severity to make the report look cleaner. If it's HIGH, report it as HIGH. If unsure, round UP. The purpose of this sweep is to find problems, not to produce a reassuring report.
- If you find no issues, report: `CLEAN: No auth/security findings.`
```

**Step 2: Create sweep-type-consistency.md**

```markdown
---
name: sweep-type-consistency
description: Codebase sweep agent — audits type consistency across nodes, shared model usage, import paths, and type drift between interfaces
model: sonnet
---

# Type Consistency Sweep Agent

You audit type usage across the entire codebase. Your focus is type drift — where two nodes use the same type differently, or where a shared model is used inconsistently.

## What You Audit

1. **Shared model consistency** — Does every node use exactly the fields defined in src/shared/types/index.ts? No extra fields, no missing fields?
2. **Import paths** — Are all shared type imports from the canonical path? No local redefinitions?
3. **Interface type contracts** — When node A passes data to node B, do the types match on both sides?
4. **Enum/union consistency** — If a type has a status field with specific values, are the same values used everywhere?
5. **Null handling** — If a field is optional in the type, is it checked for null/undefined before use?
6. **Return type consistency** — Do API endpoints return data matching the declared types?

## How to Report

```
FINDING: F[N]
Node: [node-id]
Category: type-consistency
Severity: HIGH | MEDIUM | LOW
Description: [what's wrong]
File: [exact file path]
Line: [approximate line number]
Fix: [specific remediation]
```

## Rules

- Read src/shared/types/index.ts FIRST to establish the canonical type definitions.
- Then read EVERY implementation file in EVERY node to verify consistent usage.
- Pay special attention to interfaces between nodes (where data crosses boundaries).
- **SEVERITY INTEGRITY:** Never downgrade a finding's severity to make the report look cleaner. If it's HIGH, report it as HIGH. If unsure, round UP.
- If you find no issues, report: `CLEAN: No type consistency findings.`
```

**Step 3: Create sweep-error-handling.md**

```markdown
---
name: sweep-error-handling
description: Codebase sweep agent — audits error handling patterns, missing try/catch blocks, unhandled promise rejections, and inconsistent error responses
model: sonnet
---

# Error Handling Sweep Agent

You audit error handling across the entire codebase. Your focus is missing or inconsistent error handling that causes silent failures, crashes, or poor user experience.

## What You Audit

1. **Missing try/catch** — Are async operations wrapped? Database calls? File operations? API calls?
2. **Unhandled promise rejections** — Are promises always awaited or caught?
3. **Inconsistent error response format** — Do all API endpoints return errors in the same shape?
4. **Error swallowing** — Are errors caught and silently ignored (empty catch blocks)?
5. **User-facing error messages** — Do errors expose internal details?
6. **Fallback behavior** — When something fails, does the system degrade gracefully?
7. **Missing validation at boundaries** — Are inputs from external sources (API requests, file uploads, database results) validated?

## How to Report

```
FINDING: F[N]
Node: [node-id]
Category: error-handling
Severity: HIGH | MEDIUM | LOW
Description: [what's wrong]
File: [exact file path]
Line: [approximate line number]
Fix: [specific remediation]
```

## Rules

- Trace every async call to verify it has error handling.
- Check that error responses use a consistent format across all API endpoints.
- **SEVERITY INTEGRITY:** Never downgrade a finding's severity to make the report look cleaner. If it's HIGH, report it as HIGH. If unsure, round UP.
- If you find no issues, report: `CLEAN: No error handling findings.`
```

**Step 4: Create sweep-database.md**

```markdown
---
name: sweep-database
description: Codebase sweep agent — audits database queries, migrations, connection management, transaction boundaries, and data integrity
model: sonnet
---

# Database Sweep Agent

You audit all database-related code across the codebase. Your focus is data integrity, query correctness, and connection management.

## What You Audit

1. **Query correctness** — Do queries match the data model? Wrong column names? Missing JOINs?
2. **SQL injection** — Are all queries parameterized? No string concatenation with user input?
3. **Transaction boundaries** — Are multi-step operations wrapped in transactions?
4. **Connection management** — Are connections properly released/pooled? Connection leaks?
5. **Migration consistency** — Do migrations match the types defined in shared models?
6. **Index usage** — Are frequently-queried columns indexed?
7. **Cascade behavior** — When a parent record is deleted, are children handled correctly?
8. **N+1 queries** — Are there loops that make individual queries instead of batch operations?

## How to Report

```
FINDING: F[N]
Node: [node-id]
Category: database
Severity: HIGH | MEDIUM | LOW
Description: [what's wrong]
File: [exact file path]
Line: [approximate line number]
Fix: [specific remediation]
```

## Rules

- Read the database node's schema/migrations FIRST to understand the data model.
- Then check every file that imports or uses the database.
- Cross-reference: verify that shared model types match the actual database schema.
- **SEVERITY INTEGRITY:** Never downgrade a finding's severity to make the report look cleaner. If it's HIGH, report it as HIGH. If unsure, round UP.
- If you find no issues, report: `CLEAN: No database findings.`
```

**Step 5: Create sweep-api-contracts.md**

```markdown
---
name: sweep-api-contracts
description: Codebase sweep agent — audits API endpoint definitions, route handlers, request/response contracts, and client-server consistency
model: sonnet
---

# API Contracts Sweep Agent

You audit all API contracts across the codebase. Your focus is ensuring what the server exposes matches what clients consume.

## What You Audit

1. **Route completeness** — Does every interface declared in node specs have a corresponding route?
2. **Request validation** — Are request bodies/params validated before processing?
3. **Response shape** — Does the actual response match what consuming nodes expect?
4. **HTTP method correctness** — Are methods semantically correct (GET for reads, POST for creates, etc.)?
5. **Status codes** — Are appropriate status codes used (201 for create, 404 for not found, etc.)?
6. **Authentication middleware** — Are protected routes actually protected?
7. **CORS configuration** — Can the frontend actually reach the API endpoints?
8. **Client-server type alignment** — Do frontend API calls match the backend's expected request/response types?

## How to Report

```
FINDING: F[N]
Node: [node-id]
Category: api-contracts
Severity: HIGH | MEDIUM | LOW
Description: [what's wrong]
File: [exact file path]
Line: [approximate line number]
Fix: [specific remediation]
```

## Rules

- Read ALL route definitions first, then check ALL consumers (frontend components, other services).
- Cross-reference: if the spec says node A provides endpoint X, verify both the route AND at least one consumer.
- **SEVERITY INTEGRITY:** Never downgrade a finding's severity to make the report look cleaner. If it's HIGH, report it as HIGH. If unsure, round UP.
- If you find no issues, report: `CLEAN: No API contract findings.`
```

**Step 6: Create sweep-imports.md**

```markdown
---
name: sweep-imports
description: Codebase sweep agent — audits import/export chains, circular dependencies, missing modules, dead imports, and path consistency
model: sonnet
---

# Imports Sweep Agent

You audit the import/export dependency graph across the entire codebase. Your focus is broken imports, circular dependencies, and dead code.

## What You Audit

1. **Broken imports** — Does every import resolve to an actual file/module? No missing modules?
2. **Circular dependencies** — Are there import cycles between nodes or within a node?
3. **Dead imports** — Are there imported symbols that are never used?
4. **Dead exports** — Are there exported symbols that nothing imports?
5. **Path consistency** — Are import paths consistent (relative vs absolute, @/ aliases)?
6. **Cross-node imports** — Does any node import directly from another node's internals (bypassing the interface)?
7. **Barrel export completeness** — Do index.ts barrel files re-export everything that should be public?
8. **Package.json dependencies** — Are all used packages in dependencies? Any phantom dependencies?

## How to Report

```
FINDING: F[N]
Node: [node-id]
Category: imports
Severity: HIGH | MEDIUM | LOW
Description: [what's wrong]
File: [exact file path]
Line: [approximate line number]
Fix: [specific remediation]
```

## Rules

- Trace every import statement to its source file.
- Check that no node imports from another node's internal files (only from the interface).
- **SEVERITY INTEGRITY:** Never downgrade a finding's severity to make the report look cleaner. If it's HIGH, report it as HIGH. If unsure, round UP.
- If you find no issues, report: `CLEAN: No import findings.`
```

**Step 7: Commit all agents**

```bash
git add forgeplan-plugin/agents/sweep-*.md
git commit -m "feat(sprint6): add 6 sweep agent definitions (auth-security, types, errors, database, api, imports)"
```

---

### Task 9: Create /forgeplan:sweep command

**Files:**
- Create: `forgeplan-plugin/commands/sweep.md`

**Step 1: Write the sweep command**

```markdown
---
description: Sweep your entire codebase for cross-cutting issues. 6 parallel agents audit auth/security, type consistency, error handling, database, API contracts, and imports. Findings are fixed with node-scoped enforcement, then cross-model verified.
user-invocable: true
argument-hint: "[--cross-check (also run cross-model verification)]"
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# Codebase Sweep

Run 6 parallel sweep agents across the entire codebase, then fix findings with node-scoped enforcement.

## Prerequisites

- `.forgeplan/manifest.yaml` exists
- `.forgeplan/state.json` exists
- No active build (`active_node` must be null or all nodes in terminal states)
- All nodes should be in `built`, `reviewed`, or `revised` status (warn if not)

## Process

### Phase 1: Initialize sweep state

1. Read `.forgeplan/state.json` and verify no active operation
2. **Check if `sweep_state` already exists with `operation: "deep-building"`.** If so, this sweep was invoked from within a deep-build — **skip Phase 1 initialization entirely** (preserve the existing deep-build state) and jump to Phase 2. Also skip Phase 7 finalization on exit (deep-build handles its own finalization). Set `sweep_state.current_phase` to `"claude-sweep"` and `sweep_state.current_model` to `"claude"` to indicate we're in the sweep portion.
3. Create `.forgeplan/sweeps/` directory if it doesn't exist
4. Set `sweep_state` in state.json (only when NOT called from deep-build):
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
       "integration_results": { "last_run": null, "passed": false, "failures": [] }
     }
   }
   ```
5. Set `active_node` to `null`

### Phase 2: Dispatch 6 parallel sweep agents

Use the Agent tool to dispatch ALL 6 sweep agents **in parallel** (single message, 6 Agent tool calls).

**How to dispatch:** Read each agent's definition file from `${CLAUDE_PLUGIN_ROOT}/agents/sweep-*.md` and use its content as the system prompt for the Agent tool call. This ensures the prompts are maintained in separate files (easy to iterate) while still dispatching via the Agent tool for parallelism.

For each agent, provide as context in the Agent tool prompt:
- The agent's own system prompt (from its `.md` file)
- The full manifest (read `.forgeplan/manifest.yaml`)
- The full state (read `.forgeplan/state.json` — node statuses)
- ALL implementation files (read every file listed in every node's `files` array in the manifest)
- The shared types file (`src/shared/types/index.ts`)
- ALL node specs (read each `.forgeplan/specs/[node-id].yaml`)

Agent definition files (read these, use as system prompts):
- `agents/sweep-auth-security.md`
- `agents/sweep-type-consistency.md`
- `agents/sweep-error-handling.md`
- `agents/sweep-database.md`
- `agents/sweep-api-contracts.md`
- `agents/sweep-imports.md`

Each agent returns findings in the structured FINDING format or CLEAN.

### Phase 3: Merge and deduplicate findings

1. Collect all findings from the 6 agents
2. **Validate node IDs:** Discard any finding whose `node` field is not in `Object.keys(manifest.nodes)`. Log a warning for each discarded finding ("Finding F[N] references unknown node '[id]' — discarding"). This prevents crashes in Phase 4 when PreToolUse tries to look up a nonexistent node's file_scope. Apply the same validation in Phase 6 for cross-model findings.
3. **Re-number** all remaining findings sequentially as F1, F2, F3... (discard the agents' self-assigned IDs, which will collide across agents)
4. Deduplicate: if two agents report the same file + same issue, keep the one with higher severity
5. Group findings by node
5. Write the sweep report to `.forgeplan/sweeps/sweep-[ISO-timestamp].md`:
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
6. Add all findings to `sweep_state.findings.pending`. **Set `pass_found: sweep_state.pass_number`** on each finding before inserting — `extractFindings` and the sweep agents don't include this field, but the state schema requires it.
7. If there are findings: update `sweep_state.current_phase` to `"claude-fix"` and proceed to Phase 4.
8. **If zero findings** (all agents returned CLEAN): skip Phase 4, set `sweep_state.current_phase` to `"integrate"`, and proceed directly to Phase 5.

### Phase 4: Fix findings (node-scoped)

For each node that has findings, in dependency order:

1. **Save node's current status:** Set `nodes.[node-id].previous_status` to current `nodes.[node-id].status` (e.g., "built", "reviewed", "revised")
2. **Set node to sweeping:** Set `nodes.[node-id].status` to `"sweeping"`
3. **Set active_node:** Set `active_node` to `{"node": "[node-id]", "status": "sweeping", "started_at": "[ISO]"}`
4. Set `sweep_state.fixing_node` to the node ID
5. Read the node's spec and the relevant findings
6. Fix each finding — writes are enforced by PreToolUse (node's file_scope) + Layer 1 deterministic. Layer 2 is bypassed for sweeping (see Task 14).
   - **If the fix agent returns BLOCKED:** Mark the finding as `unresolvable` (add `"blocked": true` to the finding object). Do NOT retry — move on to the next finding. Unresolvable findings stay in `pending` and appear in the final report with a note that they need manual attention. This prevents infinite retry loops since the Stop hook is bypassed during sweeping.
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
5. If integration fails AND `failures.length > 0`, add failures as new findings in `sweep_state.findings.pending` and loop back to Phase 4 (set `current_phase` back to `"claude-fix"`). If integration fails but `failures.length === 0` (edge case — non-PASS verdict with no FAIL interfaces), treat as pass with a warning to prevent an empty-fix infinite loop.
6. If integration passes and no `--cross-check` flag: set `current_phase` to `"finalizing"` and proceed to Phase 7.
7. If integration passes and `--cross-check` flag: proceed to Phase 6.

### Phase 6: Cross-model verification (if --cross-check flag or auto in deep-build)

If the `--cross-check` flag is set:
1. Update `sweep_state.current_phase` to `"cross-check"`
2. Run `cross-model-bridge.js` with the sweep context
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
   - Re-number finding IDs to avoid collision with Claude findings. Use prefix `X` for cross-model: X1, X2, X3... (Claude findings use F1, F2, F3...)
   - Add to `sweep_state.findings.pending` (set `pass_found` on each)
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
3. Clear `sweep_state` to null
4. Present results to user:
   ```
   === Sweep Complete ===
   Passes: [N]
   Findings: [total found] found, [total resolved] resolved
   By category: [breakdown]
   Integration: [PASS/FAIL]
   Cross-model: [N consecutive clean passes / not run]

   Reports: .forgeplan/sweeps/sweep-[timestamp].md
   ```

## State Persistence

Write `sweep_state` to state.json after EVERY phase transition, finding resolution, and integration result. This ensures crash recovery has an accurate snapshot.

## Pass Limit

If `pass_number` reaches `max_passes` (default 10) without 2 consecutive clean cross-model passes:

1. Set `sweep_state.halted_from_phase` to the current value of `sweep_state.current_phase` (so recovery knows where to resume from).
2. Set `sweep_state.current_phase` to `"halted"` — this is a distinct terminal phase that tells recover to offer "resume from the phase stored in `halted_from_phase`" or "abort".
3. Write `sweep_state` to state.json (do NOT clear it — user must explicitly abort or resume)
4. Present:
```
=== Sweep Halted (Pass Limit) ===
Reached [max_passes] passes without convergence.
Unresolved findings: [N]
[list unresolved findings]

Run /forgeplan:recover to resume or abort.
```
```

**Step 2: Commit**

```bash
git add forgeplan-plugin/commands/sweep.md
git commit -m "feat(sprint6): add /forgeplan:sweep command — parallel sweep agents with node-scoped fix cycle"
```

---

### Task 10: Update /forgeplan:recover for sweep/deep-build

**Files:**
- Modify: `forgeplan-plugin/commands/recover.md`

**Step 1: Add sweep/deep-build recovery section**

After the existing "If crashed during `revising`" section (after line 92), add:

```markdown
### If interrupted sweep or deep-build detected

**ROUTING:** This section is triggered by a **top-level `sweep_state` check**, NOT by the per-node stuck status loop. Add to the recover command's Process section (step 2) a new detection path:
```
   - `sweep_state` is non-null (interrupted sweep or deep-build)
```

**When both `active_node` (stuck in "building"/"sweeping") AND `sweep_state` are present:** This indicates a crash during deep-build's build-all phase or during a sweep fix. Present ONLY the sweep/deep-build recovery options below — do NOT also show the per-node building recovery prompt, as that would create conflicting options. Note: "Node '[id]' was being [built/fixed] as part of the [deep-build/sweep]. Recovering the operation will handle this node."

Check `sweep_state` in state.json. If `sweep_state.operation` is non-null:

```
=== Recovery: [operation] ===
Operation: [sweeping | deep-building]
Phase: [current_phase] (pass [pass_number])
Model: [current_model]
Pending findings: [count]
Resolved findings: [count]

Options:
  1. RESUME  — Continue from the last completed phase. The current pass is
     re-run from scratch (partial fix state within a pass is not recoverable).
     Findings already resolved stay resolved.
  2. RESTART PASS — Keep state from prior passes but re-run pass [pass_number]
     from the beginning. Use if the crash happened mid-fix and the codebase
     may be in a partially-modified state.
  3. ABORT  — Clear sweep_state. All nodes keep their current status.
     Sweep reports remain on disk. You can re-run /forgeplan:sweep or
     /forgeplan:deep-build later.

Choose [1/2/3]:
```

**Resume behavior:**
- Read `sweep_state` from state.json
- Re-read any sweep/crosscheck reports already on disk in `.forgeplan/sweeps/`
- Continue from `current_phase`:
  - If `build-all`: resume the build-all loop — run `next-node.js`, continue building/reviewing remaining nodes. If `active_node` is stuck, recover it first (run per-node building recovery inline), then continue the loop.
  - If `claude-sweep`: re-run the sweep agents
  - If `claude-fix`: re-fix all pending findings (restart the fix loop for this pass)
  - If `cross-check`: re-run cross-model verification
  - If `cross-fix`: re-fix all cross-model findings (restart fix loop)
  - If `integrate`: re-run integration
  - If `finalizing`: just finalize
  - If `halted`: read `sweep_state.halted_from_phase` to determine where to resume. Set `current_phase` back to `halted_from_phase`, clear `halted_from_phase` to null, then resume from that phase (using the same routing above). If `halted_from_phase` is null (shouldn't happen but defensive), default to `"claude-sweep"`.
- Findings already in `resolved` stay resolved

**Restart pass behavior:**
- Keep `sweep_state.findings.resolved` from prior passes
- Reset `sweep_state.findings.pending` to only findings from this pass that weren't resolved
- Set `sweep_state.current_phase` to `"claude-sweep"` (restart the whole pass)
- If `active_node` was set (mid-fix), clear it and set `nodes.[node].status` back to the pre-sweep status

**Abort behavior:**
- Set `sweep_state` to `null` in state.json
- If `active_node` was set (mid-fix):
  - Clear `active_node` to `null`
- **Scan ALL `state.nodes` entries for orphaned "sweeping" status.** For each node with `status: "sweeping"`:
  - If `previous_status` is set: restore `status` to `previous_status`, clear `previous_status`
  - If `previous_status` is not set: set `status` to `"built"` (safest default — the node was built before the sweep started)
  - This handles edge cases where the crash happened between setting node status and setting active_node
- Sweep reports remain in `.forgeplan/sweeps/` for reference
```

**Step 2: Also add "sweeping" to the stuck node detection**

In the Process section (line 15-16), add to the stuck statuses list:
```
   - Status "sweeping" with no active sweep operation (sweep_state is null but node is sweeping)
```

**Step 3: Commit**

```bash
git add forgeplan-plugin/commands/recover.md
git commit -m "feat(sprint6): add sweep/deep-build recovery (resume/restart-pass/abort) to recover command"
```

---

### Task 11: Update /forgeplan:integrate — sweep-mode prerequisite

**Files:**
- Modify: `forgeplan-plugin/commands/integrate.md`

**Step 1: Add prerequisite check**

After the "## Process" heading and before step 1, add:

```markdown
0. **Prerequisite:** Read `.forgeplan/state.json`. If any node has `status: "sweeping"`, STOP:
   ```
   Cannot run integration check — node "[node-id]" is currently being fixed by the sweep.
   Wait for the sweep fix to complete, or run /forgeplan:recover to abort the sweep.
   ```
```

**Step 2: Commit**

```bash
git add forgeplan-plugin/commands/integrate.md
git commit -m "feat(sprint6): add sweeping-node prerequisite check to integrate command"
```

---

## Phase 2: Cross-Model Bridge and Deep-Build (Tasks 12-14)

### Task 12: Create cross-model-bridge.js

**Files:**
- Create: `forgeplan-plugin/scripts/cross-model-bridge.js`

This extends cross-model-review.js with sweep orchestration. It imports shared utilities from cross-model-review.js and adds: multi-node file collection, sweep-style prompts, batch API calls, and finding extraction.

**Step 1: Write cross-model-bridge.js**

```js
#!/usr/bin/env node

/**
 * cross-model-bridge.js — ForgePlan Core Cross-Model Sweep Bridge
 *
 * Extends cross-model-review.js (Sprint 4) with sweep orchestration.
 * Sends full codebase + sweep findings to an alternate model for:
 *   1. Fix verification (scoped to modified files)
 *   2. Independent full codebase sweep
 *
 * Three modes: MCP (recommended), CLI, API (same as cross-model-review.js)
 *
 * Usage:
 *   node cross-model-bridge.js <sweep-report-path> [config-path]
 *
 * Output: JSON with findings array to stdout
 * Also writes to .forgeplan/sweeps/crosscheck-[timestamp].md
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));

// Import shared utilities from cross-model-review.js
const { collectNodeFiles } = require(
  path.join(__dirname, "cross-model-review.js")
);

async function main() {
  const sweepReportPath = process.argv[2];
  const configPath =
    process.argv[3] || path.join(process.cwd(), ".forgeplan", "config.yaml");

  if (!sweepReportPath) {
    console.error(
      "Usage: node cross-model-bridge.js <sweep-report-path> [config.yaml]"
    );
    process.exit(2);
  }

  const cwd = process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");

  // Load config
  let config = { review: { mode: "native" } };
  if (fs.existsSync(configPath)) {
    try {
      config = yaml.load(fs.readFileSync(configPath, "utf-8")) || config;
    } catch (err) {
      console.error(
        `Warning: Could not parse config: ${err.message}. Using defaults.`
      );
    }
  }

  const reviewConfig = config.review || {};
  const mode = reviewConfig.mode || "native";

  if (mode === "native") {
    console.log(
      JSON.stringify({
        status: "skipped",
        message:
          "Cross-model review not configured. Set review.mode in config.yaml.",
      })
    );
    process.exit(0);
  }

  // Load state for sweep context
  const statePath = path.join(forgePlanDir, "state.json");
  let state = {};
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    } catch {}
  }

  // Load manifest
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    console.error(`Cannot read manifest: ${err.message}`);
    process.exit(2);
  }

  // Load sweep report
  let sweepReport = "";
  if (fs.existsSync(sweepReportPath)) {
    sweepReport = fs.readFileSync(sweepReportPath, "utf-8");
  }

  // Collect ALL files across ALL nodes
  const allFiles = collectAllNodeFiles(cwd, forgePlanDir, manifest);

  // Load shared types
  const sharedTypesPath = path.join(cwd, "src", "shared", "types", "index.ts");
  let sharedTypes = "";
  if (fs.existsSync(sharedTypesPath)) {
    sharedTypes = fs.readFileSync(sharedTypesPath, "utf-8");
  }

  // Get modified files from current pass (for focused verification)
  const modifiedFiles =
    state.sweep_state?.modified_files_by_pass?.[
      String(state.sweep_state?.pass_number || 1)
    ] || [];

  // Assemble the cross-check prompt
  const prompt = assembleCrossCheckPrompt(
    manifest,
    allFiles,
    sharedTypes,
    sweepReport,
    modifiedFiles
  );

  let result;
  switch (mode) {
    case "mcp":
      result = crossCheckViaMcp(reviewConfig, prompt, cwd);
      break;
    case "cli":
      result = crossCheckViaCli(reviewConfig, prompt, cwd);
      break;
    case "api":
      result = await crossCheckViaApi(reviewConfig, prompt);
      break;
    default:
      console.error(`Unknown review mode: ${mode}`);
      process.exit(2);
  }

  // Write crosscheck report
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(
    forgePlanDir,
    "sweeps",
    `crosscheck-${timestamp}.md`
  );
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, result.report, "utf-8");

  // Extract structured findings from the report
  const findings = extractFindings(result.report, reviewConfig.provider || "alternate");

  // Determine status — execution errors with zero parsed findings are NOT clean
  let finalStatus;
  if (result.status === "error") {
    finalStatus = "error";
  } else if (findings.length === 0) {
    finalStatus = "clean";
  } else {
    finalStatus = "findings";
  }

  // Output structured result
  console.log(
    JSON.stringify(
      {
        status: finalStatus,
        mode,
        provider: reviewConfig.provider || "unknown",
        report_path: reportPath,
        findings_count: findings.length,
        findings,
      },
      null,
      2
    )
  );
}

/**
 * Collect all implementation files across all nodes.
 */
function collectAllNodeFiles(cwd, forgePlanDir, manifest) {
  const allFiles = {};
  if (!manifest.nodes) return allFiles;

  for (const [nodeId, nodeData] of Object.entries(manifest.nodes)) {
    const nodeFiles = collectNodeFiles(cwd, forgePlanDir, nodeId);
    for (const [filePath, content] of Object.entries(nodeFiles)) {
      allFiles[filePath] = content;
    }
  }
  return allFiles;
}

/**
 * Assemble the cross-model sweep verification prompt.
 */
function assembleCrossCheckPrompt(
  manifest,
  allFiles,
  sharedTypes,
  sweepReport,
  modifiedFiles
) {
  let prompt = `# Cross-Model Codebase Verification\n\n`;
  prompt += `You are an independent code auditor reviewing a codebase that was just swept and fixed by a different AI model (Claude). `;
  prompt += `Your job is TWO-FOLD:\n`;
  prompt += `1. **Verify the fixes** — Check that Claude's fixes are correct and don't introduce new issues\n`;
  prompt += `2. **Independent sweep** — Find issues Claude MISSED. You are a fresh pair of eyes.\n\n`;
  prompt += `Do NOT trust Claude's work. Verify independently.\n\n`;

  // Manifest context
  prompt += `## Project Manifest\n\`\`\`yaml\n${yaml.dump(manifest, { lineWidth: -1 })}\`\`\`\n\n`;

  // Shared types
  if (sharedTypes) {
    prompt += `## Shared Types (src/shared/types/index.ts)\n\`\`\`typescript\n${sharedTypes}\n\`\`\`\n\n`;
  }

  // Modified files (focused verification)
  if (modifiedFiles.length > 0) {
    prompt += `## Files Modified by Claude's Fixes (VERIFY THESE FIRST)\n`;
    for (const filePath of modifiedFiles) {
      if (allFiles[filePath]) {
        prompt += `### ${filePath}\n\`\`\`\n${allFiles[filePath]}\n\`\`\`\n\n`;
      }
    }
  }

  // All other files
  prompt += `## Full Codebase\n\n`;
  for (const [filePath, content] of Object.entries(allFiles)) {
    if (!modifiedFiles.includes(filePath)) {
      prompt += `### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
    }
  }

  // Claude's sweep report
  if (sweepReport) {
    prompt += `## Claude's Sweep Report (for reference — do NOT assume these are all the issues)\n\`\`\`\n${sweepReport}\n\`\`\`\n\n`;
  }

  // Instructions
  prompt += `## Your Task\n\n`;
  prompt += `1. For each file Claude modified: verify the fix is correct, complete, and doesn't introduce regressions.\n`;
  prompt += `2. Sweep the ENTIRE codebase for issues Claude missed. Check:\n`;
  prompt += `   - Auth/security, type consistency, error handling, database, API contracts, imports\n`;
  prompt += `3. Report findings in this EXACT format (one field per line, NO multiline values, keep Description and Fix on a single line each):\n\n`;
  prompt += `\`\`\`\nFINDING: F[N]\nNode: [node-id]\nCategory: [auth-security|type-consistency|error-handling|database|api-contracts|imports]\nSeverity: HIGH | MEDIUM | LOW\nDescription: [what's wrong — single line]\nFile: [exact file path]\nLine: [approximate line number]\nFix: [specific remediation — single line]\n\`\`\`\n\n`;
  prompt += `IMPORTANT: Each field MUST be exactly one line. The parser uses line-by-line extraction.\n\n`;
  prompt += `If everything is clean, report: CLEAN: No findings. All fixes verified.\n`;

  return prompt;
}

/**
 * Extract structured findings from a cross-check report.
 */
function extractFindings(report, sourceModel) {
  const findings = [];
  const findingRegex =
    /FINDING:\s*F(\d+)\s*\n\s*Node:\s*(.+)\s*\n\s*Category:\s*(.+)\s*\n\s*Severity:\s*(.+)\s*\n\s*Description:\s*(.+)\s*\n\s*File:\s*(.+)\s*\n\s*Line:\s*(.+)\s*\n\s*Fix:\s*(.+)/gi;

  let match;
  while ((match = findingRegex.exec(report)) !== null) {
    findings.push({
      id: `F${match[1]}`,
      source_model: sourceModel,
      node: match[2].trim(),
      category: match[3].trim().toLowerCase(),
      severity: match[4].trim(),
      description: match[5].trim(),
      file: match[6].trim(),
      line: match[7].trim(),
      fix: match[8].trim(),
    });
  }

  return findings;
}

// --- Mode implementations (mirror cross-model-review.js patterns) ---

function crossCheckViaMcp(config, prompt, cwd) {
  const mcpServer = config.mcp_server || "codex";
  const timeout = config.timeout || 300000; // 5 min for full codebase
  const tmpPrompt = path.join(cwd, ".forgeplan", ".tmp-crosscheck-prompt.md");

  try {
    fs.writeFileSync(tmpPrompt, prompt, "utf-8");
    const result = execSync(
      `claude mcp call ${mcpServer} review --input "${tmpPrompt}"`,
      { encoding: "utf-8", timeout, cwd, stdio: ["pipe", "pipe", "pipe"] }
    );
    return { status: "completed", report: result.trim() };
  } catch (err) {
    return {
      status: "error",
      report: `## Cross-Check Error (MCP)\n\nMCP call to "${mcpServer}" failed: ${err.message}`,
    };
  } finally {
    try { fs.unlinkSync(tmpPrompt); } catch {}
  }
}

function crossCheckViaCli(config, prompt, cwd) {
  const command = config.cli_command || "codex";
  const args = config.cli_args || [];
  const timeout = config.timeout || 300000;
  const tmpPrompt = path.join(cwd, ".forgeplan", ".tmp-crosscheck-prompt.md");

  try {
    fs.writeFileSync(tmpPrompt, prompt, "utf-8");
    // Quote tmpPrompt to handle paths with spaces (e.g., "Coding Projects")
    const fullArgs = [...args, `"${tmpPrompt}"`];
    const result = execSync(`${command} ${fullArgs.join(" ")}`, {
      encoding: "utf-8",
      timeout,
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { status: "completed", report: result.trim() };
  } catch (err) {
    return {
      status: "error",
      report: `## Cross-Check Error (CLI)\n\n"${command}" failed: ${err.message}`,
    };
  } finally {
    try { fs.unlinkSync(tmpPrompt); } catch {}
  }
}

async function crossCheckViaApi(config, prompt) {
  const provider = config.provider || "openai";
  let apiKey = config.api_key;
  if (apiKey && apiKey.startsWith("$")) {
    apiKey = process.env[apiKey.slice(1)] || "";
  }
  const model = config.model;

  if (!apiKey) {
    return {
      status: "error",
      report: `## Cross-Check Error (API)\n\nNo api_key configured for "${provider}".`,
    };
  }

  let url, headers, body;

  switch (provider) {
    case "openai":
      url = "https://api.openai.com/v1/chat/completions";
      headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      body = JSON.stringify({
        model: model || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8192,
      });
      break;
    case "google":
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent?key=${apiKey}`;
      headers = { "Content-Type": "application/json" };
      body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      });
      break;
    case "anthropic":
      url = "https://api.anthropic.com/v1/messages";
      headers = {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      };
      body = JSON.stringify({
        model: model || "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });
      break;
    default:
      return {
        status: "error",
        report: `## Cross-Check Error\n\nUnknown provider "${provider}".`,
      };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(300000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        status: "error",
        report: `## Cross-Check Error (API)\n\nHTTP ${response.status}: ${errorText.substring(0, 500)}`,
      };
    }

    const data = await response.json();
    let text = "";
    if (provider === "openai") {
      text = data.choices?.[0]?.message?.content || "";
    } else if (provider === "google") {
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else if (provider === "anthropic") {
      text = data.content?.[0]?.text || "";
    }

    return { status: "completed", report: text.trim() };
  } catch (err) {
    return {
      status: "error",
      report: `## Cross-Check Error (API)\n\n${err.message}`,
    };
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Cross-model bridge failed: ${err.message}`);
    process.exit(2);
  });
} else {
  module.exports = {
    collectAllNodeFiles,
    assembleCrossCheckPrompt,
    extractFindings,
  };
}
```

**Step 2: Commit**

```bash
git add forgeplan-plugin/scripts/cross-model-bridge.js
git commit -m "feat(sprint6): add cross-model-bridge.js — sweep orchestration with MCP/CLI/API modes"
```

---

### Task 13: Create /forgeplan:deep-build command

**Files:**
- Create: `forgeplan-plugin/commands/deep-build.md`

**Step 1: Write the deep-build command**

```markdown
---
description: Full autonomous build pipeline. Builds all nodes, reviews them, runs integration, sweeps for cross-cutting issues, fixes with cross-model verification, and produces a certification report. You describe what you want, then walk away.
user-invocable: true
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# Deep Build — Full Autonomous Pipeline

Run the complete ForgePlan pipeline autonomously: build all → review all → integrate → sweep → fix → cross-check → repeat until certified.

## Prerequisites

- `.forgeplan/manifest.yaml` exists with nodes defined
- All nodes must be at status `pending` or later (deep-build handles speccing pending nodes in Phase 2)
- No active build (`active_node` must be null)
- No active sweep (`sweep_state` must be null)

## Process

### Phase 1: Initialize deep-build state

1. Read `.forgeplan/state.json` and verify prerequisites
2. Set `sweep_state`:
   ```json
   {
     "sweep_state": {
       "operation": "deep-building",
       "started_at": "[ISO timestamp]",
       "current_phase": "build-all",
       "pass_number": 1,
       "current_model": "claude",
       "fixing_node": null,
       "consecutive_clean_passes": 0,
       "max_passes": 10,
       "findings": { "pending": [], "resolved": [] },
       "modified_files_by_pass": {},
       "integration_results": { "last_run": null, "passed": false, "failures": [] }
     }
   }
   ```

   Note: `current_phase` starts as `"build-all"`, NOT `"claude-sweep"`. This is critical — next-node.js allows normal recommendations during the `"build-all"` phase but blocks them during sweep phases.

### Phase 2: Build all nodes

This is a sequential loop using existing commands:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/next-node.js"` to get the recommended node
2. Handle result by type:
   - `"recommendation"`:
     - If status is `"pending"`: run `/forgeplan:spec [node-id]` first, then `/forgeplan:build [node-id]`
     - If status is `"specced"`: run `/forgeplan:build [node-id]`
     - After each build, run `/forgeplan:review [node-id]`
   - `"complete"`: all nodes done, proceed to Phase 3
   - `"stuck"`: run `/forgeplan:recover` for the stuck node(s), then re-run next-node.js
   - `"blocked"` or `"error"`: halt deep-build with error message, preserve `sweep_state` for recovery:
     ```
     Deep build halted: [message from next-node.js]
     Run /forgeplan:recover to resume or abort.
     ```
   - `"rebuild_needed"`: for each listed node, run `/forgeplan:build [node-id]` then `/forgeplan:review [node-id]` (same build+review pattern as the recommendation branch — no unreviewed nodes in the autonomous pipeline), then re-run next-node.js
3. Repeat until `"complete"`.

All existing enforcement (PreToolUse, PostToolUse, Builder agent, Stop hook) applies exactly as in manual builds. The deep-build orchestrator just drives the loop.

**Important:** For each build and review, use fresh Agent subagents. Do not accumulate context across node builds.

**Phase transition:** After all nodes are built and reviewed, update `sweep_state.current_phase` from `"build-all"` to `"integrate"`. This is the point where next-node.js stops returning recommendations and starts returning `type: "sweep_active"`.

### Phase 3: Initial integration check

Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/integrate-check.js"
```

Map result to `sweep_state.integration_results`:
```
passed = (verdict === "PASS" || verdict === "PASS_WITH_WARNINGS")
failures = interfaces.filter(i => i.status === "FAIL")
```

If integration fails, add each failure as a finding in `sweep_state.findings.pending` and proceed to fix cycle.

### Phase 4: Claude sweep

Run `/forgeplan:sweep` (dispatch 6 parallel sweep agents, merge findings, fix with node-scoped enforcement).

After Claude sweep fixes, re-integrate (Phase 3 logic).

### Phase 5: Cross-model verification loop

This phase follows the **exact same logic as sweep Phase 6** (Task 9). All status handling, phase transitions, and error paths apply identically. The deep-build orchestrator executes this inline rather than delegating to `/forgeplan:sweep`.

1. Set `sweep_state.current_phase` to `"cross-check"`
2. Run cross-model bridge:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/cross-model-bridge.js" ".forgeplan/sweeps/sweep-[latest].md"
   ```
3. Check the result `status` field — handle ALL statuses exactly as sweep Phase 6:

   **If `status: "skipped"`:** Log warning ("no alternate model configured"), set `consecutive_clean_passes` to 2, proceed to Phase 6 (finalize). Note in report that cross-model was not performed.

   **If `status: "error"`:** Reset `consecutive_clean_passes` to 0. Do NOT increment `pass_number`. Track consecutive error count. On second consecutive error: set `halted_from_phase` to `"cross-check"`, set `current_phase` to `"halted"`, present error to user. Otherwise: retry immediately.

   **If `status: "findings"`:**
   - Re-number IDs with `X` prefix. Set `pass_found` on each.
   - Add to `sweep_state.findings.pending`
   - Set `consecutive_clean_passes` to 0
   - Increment `sweep_state.pass_number`
   - Set `sweep_state.current_phase` to `"cross-fix"`
   - Fix findings (node-scoped, same as sweep Phase 4 — save/restore node status, fresh agent per node)
   - Set `sweep_state.current_phase` to `"integrate"`
   - Re-integrate (same as sweep Phase 5)
   - Loop back to step 1

   **If `status: "clean"`:**
   - Increment `consecutive_clean_passes`
   - Increment `pass_number`
   - If `consecutive_clean_passes >= 2`: proceed to Phase 6
   - If `consecutive_clean_passes == 1`: loop back to step 1

4. If `pass_number >= max_passes`: set `halted_from_phase` to `current_phase`, set `current_phase` to `"halted"`, report unresolved findings

### Phase 6: Final integration and report

1. Run final integration check
2. Generate deep-build report at `.forgeplan/deep-build-report.md`:

```markdown
# Deep Build Report

## Summary
- Project: [project name]
- Nodes: [N] built, reviewed, and verified
- Total passes: [N]
- Wall-clock time: [duration]
- Final integration: [PASS/FAIL]
- Cross-model consecutive clean passes: [N]

## Findings Timeline
| Pass | Model | Found | Resolved | Category |
|------|-------|-------|----------|----------|
| 1    | claude | 5    | 5        | types(2), imports(2), errors(1) |
| 2    | codex  | 2    | 2        | security(1), api(1) |
| 3    | codex  | 0    | 0        | — (clean) |
| 4    | codex  | 0    | 0        | — (clean, certified) |

## All Findings
[For each finding: ID, source model, node, category, description, resolution]

## Integration Results
[Final integration check output]
```

3. Clear `sweep_state` to null
4. Present results:

```
=== Deep Build Complete ===
All [N] nodes built, reviewed, and cross-model certified.
[total] findings found and resolved across [passes] passes.
Cross-model certified clean on [N] consecutive passes.
Report: .forgeplan/deep-build-report.md
```

## Per-Pass Git Commits (Recommended)

After each completed fix cycle, create a git commit:
```bash
git add -A
git commit -m "forgeplan: sweep pass [N] — [resolved] findings resolved"
git tag forgeplan-sweep-pass-[N]
```

This makes "abort to pre-sweep state" trivially safe via git reset.

## Error Handling

- If any phase fails fatally, write current state and halt
- All state is persisted after every transition for crash recovery
- Use /forgeplan:recover to resume interrupted deep-builds
```

**Step 2: Commit**

```bash
git add forgeplan-plugin/commands/deep-build.md
git commit -m "feat(sprint6): add /forgeplan:deep-build command — full autonomous pipeline"
```

---

### Task 14: Update hooks.json and help/CLAUDE.md

**Files:**
- Modify: `forgeplan-plugin/hooks/hooks.json` — Layer 2 prompt must bypass during sweeping
- Modify: `forgeplan-plugin/commands/help.md`
- Modify: `forgeplan-plugin/commands/build.md` — add "sweeping" to blocked statuses
- Modify: `CLAUDE.md`

**Step 1: Update hooks.json — Layer 2 prompt must bypass during sweeping**

The Layer 2 prompt hook (PreToolUse for Write|Edit) currently says: "If .forgeplan/state.json has no active node, respond with 'ALLOW'." This is build-spec oriented — it checks acceptance criteria, constraints, non-goals, and scope creep against the node spec. During sweep fixes, this would incorrectly block legitimate cross-cutting remediation (e.g., adding error handling not in the original spec) as "feature not in spec."

**Fix:** **REPLACE** the entire Layer 2 prompt string in `forgeplan-plugin/hooks/hooks.json` (line 33). Do NOT just prepend — the flow is restructured. The old prompt checks "no active node" at the END; the new prompt checks it at the BEGINNING along with the sweeping bypass. Find the `"prompt":` value on line 33 and replace the full string with:

```
ENFORCEMENT CHECK — Read .forgeplan/state.json to find the active node ID and status. If there is no active node, respond with 'ALLOW'. If the active node status is 'sweeping', respond with 'ALLOW' — sweep fixes are cross-cutting remediation verified by cross-model re-check, not spec compliance. Otherwise, read its spec at .forgeplan/specs/[that-node-id].yaml. Verify ALL of the following:\n\n1. CONSTRAINT COMPLIANCE: Does this code comply with every constraint listed in the spec? If any constraint is violated, respond with 'BLOCK: Constraint violated — [quote the constraint]'.\n2. NON-GOALS: Does this code implement anything listed in the spec's non_goals section? If so, respond with 'BLOCK: Non-goal implemented — [quote the non-goal]'.\n3. SCOPE CREEP: Does this code add functionality not described in any acceptance criterion? If so, respond with 'BLOCK: Feature not in spec — [describe what was added]'.\n4. SHARED MODEL FIELDS: If this code uses a shared model type, do the fields match the manifest's shared_models definition? If fields are wrong or extra fields are added, respond with 'BLOCK: Shared model field mismatch — [details]'.\n\nIf ALL checks pass, respond with 'ALLOW'.
```

This is the complete replacement prompt — it preserves all 4 enforcement checks from the original while adding the sweeping bypass at the front and consolidating the no-active-node check.

**Step 2: Add "sweeping" to build.md blocked statuses**

In `forgeplan-plugin/commands/build.md`, find the prerequisite that lists blocked statuses (around line 39, the status check). Add `"sweeping"` to the list of statuses that prevent a build from starting. This prevents a user from manually running `/forgeplan:build` on a node that is currently being sweep-fixed.

**Step 3: Update help.md to include new commands**

Add to the commands table in `forgeplan-plugin/commands/help.md`:

```markdown
| `/forgeplan:sweep` | Sweep your codebase for cross-cutting issues — 6 parallel agents audit security, types, errors, database, API contracts, and imports. Fix findings with node-scoped enforcement. Optionally cross-model verify with `--cross-check`. |
| `/forgeplan:deep-build` | Full autonomous pipeline: build all → review → integrate → sweep → cross-model verify → repeat until certified. Describe what you want, walk away. |
```

**Step 4: Update CLAUDE.md sprint status**

Mark Sprint 6 status appropriately after implementation.

**Step 5: Commit**

```bash
git add forgeplan-plugin/hooks/hooks.json forgeplan-plugin/commands/help.md forgeplan-plugin/commands/build.md CLAUDE.md
git commit -m "feat(sprint6): update help command and CLAUDE.md for sweep/deep-build"
```

---

## Testing Plan

After all tasks are complete:

1. **Unit: validate-manifest.js** — Run with a manifest containing `status: "sweeping"` node. Should pass.
2. **Unit: next-node.js** — Run with `sweep_state` populated. Should return `type: "sweep_active"`.
3. **Unit: session-start.js** — Run with interrupted `sweep_state`. Should output warning.
4. **Integration: /forgeplan:sweep** — Run on the client portal dogfood build. Verify:
   - 6 agents dispatch in parallel
   - Findings are merged and deduplicated
   - Fix cycle respects node scope
   - Re-integration runs after fixes
5. **Integration: /forgeplan:recover** — Kill terminal mid-sweep. Verify recover detects it and offers resume/restart/abort.
6. **Cross-model blind spot: planted bugs** — Before running the full E2E, plant known cross-model-blind-spot bugs in the client portal codebase — issues Claude tends to miss but alternate models catch (e.g., subtle auth bypass via header manipulation, off-by-one in pagination, inconsistent date format handling across nodes). Run `/forgeplan:sweep --cross-check`. Verify:
   - Claude's sweep agents catch SOME but not all planted bugs
   - Cross-model verification catches at least one bug Claude missed
   - The alternating fix loop resolves all planted bugs
   - This is the proof that multi-model sweeping adds value over single-model
7. **E2E: /forgeplan:deep-build** — Run on client portal. Verify:
   - All nodes build and review
   - Integration check runs
   - Sweep finds issues
   - Cross-model verification runs (if configured)
   - Two consecutive clean passes → certified
   - Report generated

---

## Dependency Graph

```
Task 1 (state schema) ──┬── Task 2 (validate-manifest)
                        ├── Task 3 (next-node)
                        ├── Task 4 (session-start)
                        ├── Task 5 (stop-hook)
                        ├── Task 6 (pre-tool-use) ──── Task 9 (sweep cmd)
                        ├── Task 7 (post-tool-use) ──── Task 9 (sweep cmd)
                        └── Task 8 (agents) ──── Task 9 (sweep cmd)

Task 9 (sweep cmd) ──── Task 10 (recover update)
                   ──── Task 11 (integrate update)
                   ──── Task 12 (cross-model-bridge)

Task 12 (bridge) + Task 9 (sweep) ──── Task 13 (deep-build cmd)

Task 13 (deep-build) ──── Task 14 (help/CLAUDE.md)
```

Tasks 1-8 can be done in parallel (all independent schema/script changes).
Tasks 9-11 depend on 1-8.
Task 12 depends on 9.
Task 13 depends on 9 + 12.
Task 14 depends on everything.
