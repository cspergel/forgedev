# Sprint 10B Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add phased builds (phase field on nodes, build_phase on project, phase enforcement gate, fail-closed stubs, cross-phase review) and repo ingestion (/forgeplan:ingest with Translator repo mode, validate-ingest.js, double review gate, wiki on ingest, guide onboarding).

**Depends on:** Sprint 10A (pipeline + review panel must be in place)

**Architecture:** 2-field phase schema (phase + build_phase), everything else derived. Phase enforcement is Layer 1 deterministic (pre-tool-use.js). Repo ingestion is fully autonomous with one confirmation gate (+--confirm-auto for deep-build).

**Design doc:** `docs/plans/2026-04-07-sprint10b-design.md` — READ THIS FIRST.

---

## Batch 1: Phase Schema + Enforcement

### Task 1: Add phase fields to manifest schema

**Files:**
- Modify: `templates/schemas/manifest-schema.yaml`

**Step 1: Add build_phase to project level and phase to node level**

In the project section of manifest-schema.yaml, add:
```yaml
#   build_phase: 1               # (Sprint 10B) Currently active build phase. Commands operate on this phase.
```

In the node example section, add:
```yaml
#   phase: 1                     # (Sprint 10B) Which build phase this node belongs to. Optional, defaults to 1.
```

**Step 2: Commit**

```bash
git add templates/schemas/manifest-schema.yaml
git commit -m "feat(sprint10b): add phase + build_phase to manifest schema"
```

---

### Task 2: Add build_phase_started_at to state schema

**Files:**
- Modify: `templates/schemas/state-schema.json`

**Step 1: Add field after the existing wiki fields**

```json
"build_phase_started_at": {
  "type": ["string", "null"],
  "format": "date-time",
  "default": null,
  "description": "When the current build_phase was entered. Used for staleness warning (>7 days without advancement). Set when build_phase changes."
}
```

Do NOT add to the `required` array — optional for backward compatibility.

**Step 2: Verify valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('templates/schemas/state-schema.json','utf-8')); console.log('valid')"
```

**Step 3: Commit**

```bash
git add templates/schemas/state-schema.json
git commit -m "feat(sprint10b): add build_phase_started_at to state schema"
```

---

### Task 2b: Add spec_type and generated_from to spec schema

**Files:**
- Create or modify: spec schema template (if `templates/schemas/spec-schema.yaml` exists, modify; otherwise create a minimal template)

**Step 1: Add spec_type and generated_from fields**

Add to the spec file format documentation/template:
```yaml
# Optional Sprint 10B fields for ingested specs:
# spec_type: "prescriptive"      # "prescriptive" (default, user-written) or "descriptive" (auto-generated from code)
# generated_from: null            # "repo-ingestion" | "document-import" | null
```

If no spec schema template file exists, add these as comments in the existing spec example in CLAUDE.md or in a new `templates/schemas/spec-fields.yaml` reference file.

**Step 2: Commit**

```bash
git add templates/schemas/
git commit -m "feat(sprint10b): add spec_type and generated_from to spec schema"
```

---

### Task 3: Add phase validation to validate-manifest.js

**Files:**
- Modify: `scripts/validate-manifest.js`

**Step 1: Add phase field validation inside the per-node loop**

After the existing Sprint 9 checks (split_from validation), add:

```javascript
    // Sprint 10B: phase field validation (optional, defaults to 1)
    if (node.phase !== undefined && node.phase !== null) {
      if (typeof node.phase !== "number" || !Number.isInteger(node.phase) || node.phase < 1) {
        errors.push(`Node "${nodeId}": phase must be a positive integer if present.`);
      }
    }
```

**Step 2: Add build_phase validation after the per-node loop**

```javascript
  // Sprint 10B: build_phase validation
  const buildPhase = manifest.project && manifest.project.build_phase;
  if (buildPhase !== undefined && buildPhase !== null) {
    if (typeof buildPhase !== "number" || !Number.isInteger(buildPhase) || buildPhase < 1) {
      errors.push(`project.build_phase must be a positive integer if present.`);
    }
    // Verify build_phase doesn't exceed max node phase
    const maxPhase = Math.max(...nodeIds.map(id => (manifest.nodes[id].phase || 1)));
    if (buildPhase > maxPhase) {
      errors.push(`project.build_phase (${buildPhase}) exceeds the highest node phase (${maxPhase}).`);
    }
    // Verify all nodes in phases <= build_phase have spec files
    for (const nid of nodeIds) {
      const nodePhase = manifest.nodes[nid].phase || 1;
      if (nodePhase <= buildPhase) {
        const specPath = path.join(path.dirname(manifestPath), "specs", nid + ".yaml");
        if (!fs.existsSync(specPath)) {
          warnings.push(`Node "${nid}" is in phase ${nodePhase} (<= build_phase ${buildPhase}) but has no spec file at ${specPath}.`);
        }
      }
    }
  }
```

**Step 3: Verify**

```bash
node --check scripts/validate-manifest.js && echo "syntax OK"
node scripts/validate-manifest.js 2>&1 | head -5
```

**Step 4: Commit**

```bash
git add scripts/validate-manifest.js
git commit -m "feat(sprint10b): add phase + build_phase validation to validate-manifest"
```

---

### Task 4: Add phase enforcement gate to pre-tool-use.js

**Files:**
- Modify: `scripts/pre-tool-use.js`

**Step 1: Add phase gate after the active_node check**

After the existing Sprint 9 wiki whitelist code and before the file_scope enforcement, add:

```javascript
  // Sprint 10B: Phase enforcement — cannot build nodes outside current build phase
  // Also covers sweeping — sweep fix agents writing into future-phase nodes must be blocked
  if (activeStatus === "building" || activeStatus === "review-fixing" || activeStatus === "sweeping") {
    const buildPhase = (manifest.project && manifest.project.build_phase) || 1;
    const nodePhase = (manifest.nodes[activeNodeId] && manifest.nodes[activeNodeId].phase) || 1;
    if (nodePhase > buildPhase) {
      return {
        block: true,
        message: `BLOCKED: Node "${activeNodeId}" is phase ${nodePhase} but current build_phase is ${buildPhase}. Complete current phase first, then advance via /forgeplan:deep-build or /forgeplan:guide.`
      };
    }
  }
```

Place this AFTER `activeStatus` is defined (line 152+) and BEFORE the file_scope check. This is a Layer 1 deterministic gate — no LLM needed.

**Step 2: Verify**

```bash
node --check scripts/pre-tool-use.js && echo "syntax OK"
```

**Step 3: Commit**

```bash
git add scripts/pre-tool-use.js
git commit -m "feat(sprint10b): add phase enforcement gate to pre-tool-use.js"
```

---

### Task 5: Add phase staleness to session-start.js

**Files:**
- Modify: `scripts/session-start.js`

**Step 1: Add phase display to ambient status**

In the `buildAmbientStatus()` function, after the wiki status section, add:

```javascript
  // Sprint 10B: Phase awareness
  const buildPhase = manifest && manifest.project && manifest.project.build_phase;
  if (buildPhase && buildPhase > 0) {
    const maxPhase = Math.max(...Object.values(manifest.nodes || {}).map(n => n.phase || 1));
    if (maxPhase > 1) {
      const builtNodes = Object.entries(manifest.nodes || {})
        .filter(([_, n]) => (n.phase || 1) <= buildPhase)
        .map(([id]) => id);
      const pendingNodes = Object.entries(manifest.nodes || {})
        .filter(([_, n]) => (n.phase || 1) > buildPhase)
        .map(([id]) => id);
      lines.push(`  Phase: ${buildPhase} of ${maxPhase} (${builtNodes.join(", ")} built | ${pendingNodes.join(", ")} pending)`);

      // Staleness warning: >7 days without advancement
      if (state.build_phase_started_at) {
        const started = new Date(state.build_phase_started_at);
        const daysSince = (Date.now() - started.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 7) {
          lines.push(`  WARNING: Phase ${buildPhase} has been active for ${Math.floor(daysSince)} days. Future-phase stubs are fail-closed.`);
        }
      }
    }
  }
```

**Step 2: Verify**

```bash
node --check scripts/session-start.js && echo "syntax OK"
```

**Step 3: Commit**

```bash
git add scripts/session-start.js
git commit -m "feat(sprint10b): add phase display + staleness warning to session-start"
```

---

## Batch 2: Phase-Aware Commands

### Task 6: Update Architect with phase-aware decomposition

**Files:**
- Modify: `agents/architect.md`

**Step 1: Add phase assignment to discovery**

In the Architect's Phase 2 (Node Decomposition), add:

```markdown
## Phase Assignment (Sprint 10B)

After decomposing nodes, assign each node a `phase` based on dependency analysis:

1. Nodes with NO dependencies on other nodes → Phase 1 (build first)
2. Nodes that depend ONLY on Phase 1 nodes → Phase 2
3. Nodes that depend on Phase 2 nodes → Phase 3
4. Continue until all nodes are assigned

Present phase assignments to the user:
"I propose 3 build phases:
  Phase 1: database, auth (no external dependencies)
  Phase 2: api, file-storage (depend on Phase 1)
  Phase 3: frontend-dashboard, frontend-login (depend on Phase 2)
This means you can build Phase 1 first, verify it works, then Phase 2, etc.
Adjust? [Y to accept / modify]"

For SMALL projects (1-2 nodes): all nodes are Phase 1. No phase prompt needed.
```

**Step 2: Commit**

```bash
git add agents/architect.md
git commit -m "feat(sprint10b): add phase assignment to Architect decomposition"
```

---

### Task 7: Update Builder with fail-closed stub rule

**Files:**
- Modify: `agents/builder.md`

**Step 1: Add fail-closed stub critical rule**

In the builder's Critical Rules section, add:

```markdown
## Fail-Closed Stubs for Security Dependencies (Sprint 10B)

When importing from a future-phase node that provides authentication, authorization, or security services: implement a **FAIL-CLOSED** stub.

**WRONG (fail-open — allows everything):**
```typescript
export function validateToken(token: string) { return { valid: true, user: mockUser }; }
```

**RIGHT (fail-closed — denies everything):**
```typescript
export function validateToken(token: string): never {
  throw new Error("Auth not implemented — Phase 2 required. This stub intentionally denies all access.");
}
```

A fail-closed stub DENIES access by default. The only safe stub for security is one that fails. When Phase 2 is built, the real implementation replaces the stub.
```

**Step 2: Commit**

```bash
git add agents/builder.md
git commit -m "feat(sprint10b): add fail-closed stub rule to Builder"
```

---

### Task 8: Update spec.md with phase-aware depth

**Files:**
- Modify: `commands/spec.md`

**Step 1: Add phase-aware spec depth**

```markdown
## Phase-Aware Spec Depth (Sprint 10B)

Read `build_phase` from manifest. For each node:
- **phase == build_phase:** Generate full spec (ACs, constraints, tests, interfaces, non-goals)
- **phase == build_phase + 1:** Generate interface-only spec (interfaces section only — what it provides, what it consumes. No ACs, no test fields, no constraints yet.)
- **phase > build_phase + 1:** Skip — no spec generated. Node exists in manifest as a stub entry only.

When `--all` is passed, apply this logic to all nodes. When a specific node is named, generate full spec regardless of phase (user override).
```

**Step 2: Commit**

```bash
git add commands/spec.md
git commit -m "feat(sprint10b): add phase-aware spec depth to spec command"
```

---

### Task 9: Update build.md, sweep.md, deep-build.md with phase awareness

**Files:**
- Modify: `commands/build.md`
- Modify: `commands/sweep.md`
- Modify: `commands/deep-build.md`

**Step 1: Add phase gate to build.md prerequisites**

```markdown
## Phase Gate (Sprint 10B)
Before building, verify `node.phase <= project.build_phase`. If the node is in a future phase, stop:
"Node [id] is phase [N] but current build_phase is [M]. Complete current phase first."
This is also enforced by pre-tool-use.js Layer 1, but checking here gives a better error message.
```

**Step 2: Add phase awareness to sweep.md**

```markdown
## Phase-Aware Sweep (Sprint 10B)
- Only sweep nodes where `phase <= build_phase`
- Do NOT flag missing implementations for future-phase nodes
- DO flag broken interface contracts against future-phase nodes (they have interface-only specs)
- After all current-phase nodes are certified, surface: "All phase [N] nodes certified. Consider advancing to phase [N+1] via /forgeplan:deep-build."
```

**Step 3: Add phase advancement to deep-build.md**

After the existing Phase 8 (final report), add:

```markdown
## Phase Advancement (Sprint 10B)

After Phase 8 certification completes:

1. Check if all `build_phase` nodes are certified (reviewed + sweep clean)
2. If yes AND max_phase > build_phase, prompt:
   "All phase [N] nodes are certified. Advance to phase [N+1]?
   This will: run cross-phase integration, increment build_phase, promote next-phase specs.
   [Y to advance / N to stay on current phase]"
   For autonomous deep-build (--autonomous): auto-advance without prompt unless cross-phase review finds CRITICALs.
3. Run /forgeplan:integrate (MANDATORY — cross-phase review)
4. If integrate passes: increment `build_phase` in manifest, set `build_phase_started_at` in state
5. Run /forgeplan:spec for promoted nodes (interface-only → full specs)
6. Start new build cycle for promoted nodes (loop back to Phase 2)
```

**Step 4: Verify all modified files**

```bash
node --check scripts/pre-tool-use.js && echo "pre-tool-use OK"
node --check scripts/validate-manifest.js && echo "validate-manifest OK"
node --check scripts/session-start.js && echo "session-start OK"
```

**Step 5: Commit**

```bash
git add commands/build.md commands/sweep.md commands/deep-build.md
git commit -m "feat(sprint10b): add phase awareness to build, sweep, deep-build commands"
```

---

## Batch 3: Repo Ingestion

> **PREREQUISITE CHECK:** Before starting Batch 3, verify Sprint 10A is complete:
> - `agents/translator.md` exists (needed for ingest Step 1)
> - `agents/review-structuralist.md`, `agents/review-contractualist.md`, `agents/review-skeptic.md` exist (needed for ingest Steps 3+6)
> - If any are missing, Batch 3 CANNOT proceed. Complete Sprint 10A first.

### Task 10: Create validate-ingest.js

**Files:**
- Create: `scripts/validate-ingest.js`

**Step 1: Write the ground-truth validation script**

```javascript
#!/usr/bin/env node
// scripts/validate-ingest.js
// Validates Translator's repo mapping against actual filesystem.
// Input: JSON file path (Translator output)
// Output: JSON report to stdout with PASS/FAIL per check
"use strict";
const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2];
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error("Usage: node validate-ingest.js <mapping.json>");
  process.exit(2);
}

const mapping = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
const cwd = process.cwd();
const checks = [];

// Check 1: Every proposed node directory exists
for (const node of (mapping.proposed_nodes || [])) {
  const scopeDir = node.file_scope.replace(/\*\*.*$/, "").replace(/\/+$/, "");
  const absDir = path.resolve(cwd, scopeDir);
  const exists = fs.existsSync(absDir);
  checks.push({
    name: "directory_exists",
    node: node.id,
    status: exists ? "PASS" : "FAIL",
    details: exists ? `${scopeDir} exists` : `${scopeDir} does not exist`,
  });
}

// Check 2: No symlinks escape project root
for (const node of (mapping.proposed_nodes || [])) {
  const scopeDir = node.file_scope.replace(/\*\*.*$/, "").replace(/\/+$/, "");
  const absDir = path.resolve(cwd, scopeDir);
  if (fs.existsSync(absDir)) {
    try {
      const realPath = fs.realpathSync(absDir);
      const escapes = !realPath.startsWith(cwd);
      checks.push({
        name: "no_symlink_escape",
        node: node.id,
        status: escapes ? "FAIL" : "PASS",
        details: escapes ? `${scopeDir} resolves to ${realPath} (outside project)` : "within project",
      });
    } catch (e) {
      checks.push({ name: "no_symlink_escape", node: node.id, status: "FAIL", details: e.message });
    }
  }
}

// Check 3: No existing .forgeplan/ directory (unless --force)
const forceFlag = process.argv.includes("--force");
const hasForgePlan = fs.existsSync(path.join(cwd, ".forgeplan"));
if (hasForgePlan && !forceFlag) {
  checks.push({
    name: "no_existing_forgeplan",
    node: "project",
    status: "FAIL",
    details: ".forgeplan/ already exists. Use --force to re-ingest.",
  });
} else {
  checks.push({ name: "no_existing_forgeplan", node: "project", status: "PASS", details: forceFlag ? "forced" : "clean" });
}

// Check 4: No scope covers >60% of total source files
// Count total files (excluding node_modules, dist, build)
let totalFiles = 0;
const countFiles = (dir) => {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (["node_modules", "dist", "build", ".next", ".git"].includes(entry.name)) continue;
      if (entry.isDirectory()) countFiles(path.join(dir, entry.name));
      else totalFiles++;
    }
  } catch (_) {}
};
countFiles(cwd);

for (const node of (mapping.proposed_nodes || [])) {
  const scopeDir = node.file_scope.replace(/\*\*.*$/, "").replace(/\/+$/, "");
  const absDir = path.resolve(cwd, scopeDir);
  let nodeFiles = 0;
  if (fs.existsSync(absDir)) countFiles.call ? null : null; // reuse not clean, count manually
  // Simple count for the scope directory
  const countScope = (d) => { let c = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) c += countScope(path.join(d, e.name)); else c++; } } catch(_){} return c; };
  nodeFiles = countScope(absDir);
  const pct = totalFiles > 0 ? Math.round(nodeFiles / totalFiles * 100) : 0;
  checks.push({
    name: "scope_breadth",
    node: node.id,
    status: pct > 60 ? "FAIL" : "PASS",
    details: `${nodeFiles}/${totalFiles} files (${pct}%)`,
  });
}

// Check 5: Claimed shared types exist and are imported by 3+ files
for (const model of (mapping.shared_models || [])) {
  // Check type/interface exists somewhere in the codebase
  let found = false;
  let importCount = 0;
  const escaped = model.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex metacharacters from LLM-generated names
  const typePattern = new RegExp(`\\b(type|interface|class)\\s+${escaped}\\b`);
  const importPattern = new RegExp(`\\b${escaped}\\b`);
  const walk = (dir) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", "dist", "build", ".next", ".git"].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.match(/\.[jt]sx?$/)) continue;
        try {
          const content = fs.readFileSync(full, "utf-8");
          if (typePattern.test(content)) found = true;
          if (importPattern.test(content)) importCount++;
        } catch (_) {}
      }
    } catch (_) {}
  };
  walk(cwd);
  checks.push({
    name: "shared_type_exists",
    node: model.name,
    status: found ? "PASS" : "FAIL",
    details: found ? `Type/interface ${model.name} found` : `Type/interface ${model.name} not found in codebase`,
  });
  checks.push({
    name: "shared_type_usage",
    node: model.name,
    status: importCount >= 3 ? "PASS" : "FAIL",
    details: `${model.name} referenced in ${importCount} files (need 3+)`,
  });
}

// Check 6: No scope overlaps between proposed nodes
const { minimatch } = require(path.join(__dirname, "..", "node_modules", "minimatch"));
const nodes = mapping.proposed_nodes || [];
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    // Simple overlap: check if one scope is a prefix of another
    const a = nodes[i].file_scope.replace(/\*\*$/, "");
    const b = nodes[j].file_scope.replace(/\*\*$/, "");
    if (a.startsWith(b) || b.startsWith(a)) {
      checks.push({
        name: "no_scope_overlap",
        node: `${nodes[i].id} vs ${nodes[j].id}`,
        status: "FAIL",
        details: `${nodes[i].file_scope} overlaps with ${nodes[j].file_scope}`,
      });
    }
  }
}

// Summary
const failed = checks.filter(c => c.status === "FAIL");
const result = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  total_checks: checks.length,
  passed: checks.filter(c => c.status === "PASS").length,
  failed: failed.length,
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
```

**Step 2: Verify**

```bash
node --check scripts/validate-ingest.js && echo "syntax OK"
```

**Step 3: Commit**

```bash
git add scripts/validate-ingest.js
git commit -m "feat(sprint10b): create validate-ingest.js ground-truth validation script"
```

---

### Task 11: Add repo mode to Translator agent

**Files:**
- Modify: `agents/translator.md`

**Step 1: Add repo scanning mode**

Add to the Translator agent after the existing Document Mode Process:

```markdown
## Repo Mode Process (Sprint 10B — dispatched by /forgeplan:ingest)

In repo mode, you scan an EXISTING codebase instead of reading external documents. Same output schema, different input.

1. **Scan directory structure:** Read the project root. Identify top-level directories that represent functional areas (src/auth/, src/api/, src/database/, etc.)
2. **Detect monorepo:** Check for `workspaces` in package.json, `pnpm-workspace.yaml`, or `turbo.json`. If monorepo: propose one node per workspace/package.
3. **Identify shared types:** Find files imported by 3+ other files (scan import/require statements). These are shared model candidates.
4. **Read package.json:** Extract dependencies, scripts, engine requirements → tech_stack
5. **Read existing tests:** Identify test framework, coverage baseline
6. **Apply containment checks:** Reject symlinks escaping project root, reject >60% scope breadth (per-workspace for monorepos), reject existing .forgeplan/ (unless --force)
7. **Output the same JSON schema** as document mode, with `"source": "repo"`

### Key Difference from Document Mode
- Document mode: extracts from human-written text (subjective)
- Repo mode: extracts from code structure (objective, verifiable)
- Repo mode specs will be `spec_type: "descriptive"` (what code does, not requirements)
```

**Step 2: Commit**

```bash
git add agents/translator.md
git commit -m "feat(sprint10b): add repo scanning mode to Translator agent"
```

---

### Task 12: Create /forgeplan:ingest command

**Files:**
- Create: `commands/ingest.md`

**Step 1: Write the ingest command**

```markdown
---
description: Scan an existing codebase and bring it under ForgePlan governance. Generates manifest, descriptive specs, wiki, and runs baseline sweep. Fully autonomous with one confirmation gate.
user-invocable: true
argument-hint: "[--force (re-ingest existing project)] [--confirm-auto (skip confirmation, for autonomous pipelines)]"
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# /forgeplan:ingest

Bring an existing codebase under ForgePlan governance.

## Prerequisites
- Must be run from the project root directory
- No existing `.forgeplan/` directory (unless --force flag)

## Process

### Step 1: Translator Scans Repo
Dispatch the Translator agent in repo mode (read `agents/translator.md`).
Include in prompt: "You are in REPO MODE. Scan the codebase at [cwd]."
Translator outputs structured JSON mapping.

### Step 2: Ground-Truth Validation
Write Translator output to `.forgeplan/.ingest-mapping.json`
Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-ingest.js" .forgeplan/.ingest-mapping.json`
If FAIL: re-dispatch Translator with validation errors as context. Max 3 retries.
If still failing after 3 retries: halt with "Repo structure too unusual for automatic ingestion. Run /forgeplan:discover manually."

### Step 3: Review Panel — Mapping Review
Dispatch 3 review agents (review-structuralist, review-contractualist, review-skeptic) with design lens.
Include: "You are reviewing a REPO MAPPING for an existing codebase."
Loop until clean (max 5 passes). Architect fixes mapping issues between passes.

### Step 4: Confirmation Gate
Display proposed node map:
```
ForgePlan proposes this decomposition:
  [node-id] ([file_scope], [N] files) — depends on: [deps]
  ...
  Shared models: [list]
  Tier: [tier]
Accept? [Y to accept / N to re-run Translator / E to edit manually]
```
If --confirm-auto: skip this gate.

### Step 5: Generate Manifest + Descriptive Specs
Architect generates manifest.yaml and spec files from confirmed mapping.
Specs are labeled `spec_type: "descriptive"` and `generated_from: "repo-ingestion"`.
All node statuses set to "built" (code already exists).

### Step 6: Review Panel — Spec Review
Dispatch same 3 review agents with design lens.
"You are reviewing DESCRIPTIVE SPECS generated from an existing codebase."
Loop until clean (max 5 passes).

### Step 7: Write Manifest + Specs
Write `.forgeplan/manifest.yaml`, `.forgeplan/state.json`, `.forgeplan/specs/*.yaml`
Initialize state with all nodes in "built" status.

### Step 8: Compile Wiki
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/compile-wiki.js"`
Wiki captures institutional knowledge from the codebase.

### Step 9: Baseline Sweep
Run `/forgeplan:sweep` for baseline quality assessment.
Wiki enriched with findings.

### Step 10: Guide Onboarding
Output via /forgeplan:guide:
"Your project has been ingested. [N] nodes mapped, [N] shared models, [N] findings from baseline sweep.
Next steps: review specs (edit to add requirements), or start building new features."

### Step 11: Governance Active
All future changes go through the ForgePlan pipeline.
```

**Step 2: Add validate-ingest.js to pre-tool-use.js Bash whitelist**

```javascript
/^\s*node\s+[^\s]*validate-ingest\.js/,    // Sprint 10B: repo ingestion validation
```

**Step 3: Commit**

```bash
git add commands/ingest.md scripts/pre-tool-use.js
git commit -m "feat(sprint10b): create /forgeplan:ingest command for repo ingestion"
```

---

## Batch 4: Integration + Polish

### Task 13: Update guide.md with phase + ingest recommendations

**Files:**
- Modify: `commands/guide.md`

**Step 1: Add phase-aware and ingest-aware recommendations**

```markdown
## Phase Guidance (Sprint 10B)

If project has multiple phases (max_phase > 1):
  If all current-phase nodes are certified:
    → "All phase [N] nodes are certified! Run /forgeplan:deep-build to advance to phase [N+1]."
  If some current-phase nodes are not yet built:
    → "Phase [N]: [built] of [total] nodes built. Next: /forgeplan:build [next-node] or /forgeplan:deep-build."

## Post-Ingest Guidance (Sprint 10B)

If spec_type is "descriptive" on any node:
  → "Some specs are auto-generated (descriptive). Edit them to add your actual requirements:
     /forgeplan:spec [node]    Edit a node's spec to add requirements, constraints, non-goals"
```

**Step 2: Commit**

```bash
git add commands/guide.md
git commit -m "feat(sprint10b): add phase + ingest recommendations to guide"
```

---

### Task 14: Update CLAUDE.md with Sprint 10B

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add Sprint 10B section**

```markdown
### Sprint 10B: Phased Builds + Repo Ingestion
**Goal:** Large projects build in phases. Existing repos get governance retroactively.

Deliverables: phase field on nodes, build_phase on project, phase enforcement gate (Layer 1), fail-closed stubs for security dependencies, phase advancement via deep-build, cross-phase review, /forgeplan:ingest (repo ingestion with Translator repo mode, validate-ingest.js, double review gate, descriptive specs, wiki on ingest, guide onboarding), phase staleness warnings.
```

**Step 2: Add /forgeplan:ingest to command table**

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "feat(sprint10b): update CLAUDE.md with phased builds + repo ingestion"
```

---

### Task 15: End-to-end verification

**Step 1: Verify phase enforcement**

```bash
node --check scripts/pre-tool-use.js && echo "pre-tool-use OK"
node --check scripts/validate-manifest.js && echo "validate-manifest OK"
node --check scripts/validate-ingest.js && echo "validate-ingest OK"
node --check scripts/session-start.js && echo "session-start OK"
```

**Step 2: Verify new command exists**

```bash
test -f commands/ingest.md && echo "ingest.md: EXISTS" || echo "MISSING"
```

**Step 3: Verify phase fields in schemas**

```bash
node -e "var f=require('fs').readFileSync('templates/schemas/manifest-schema.yaml','utf-8'); console.log('build_phase:', f.includes('build_phase')); console.log('phase:', f.includes('phase:'))"
node -e "var s=JSON.parse(require('fs').readFileSync('templates/schemas/state-schema.json','utf-8')); console.log('build_phase_started_at:', !!s.properties.build_phase_started_at)"
```

**Step 4: Verify all modified files have Sprint 10B sections**

```bash
node -e "var fs=require('fs');var checks=[['agents/architect.md','Phase Assignment'],['agents/builder.md','Fail-Closed'],['commands/spec.md','Phase-Aware'],['commands/build.md','Phase Gate'],['commands/sweep.md','Phase-Aware Sweep'],['commands/deep-build.md','Phase Advancement'],['commands/guide.md','Phase Guidance'],['commands/ingest.md','forgeplan:ingest']];var p=0,f=0;for(var c of checks){var t=fs.readFileSync(c[0],'utf-8');if(t.includes(c[1])){p++}else{console.log('MISSING:',c[0],c[1]);f++}}console.log(p+' found, '+f+' missing')"
```

**Step 5: Commit**

```bash
git status  # Verify only Sprint 10B files, then stage specific files
git commit -m "feat(sprint10b): end-to-end verification complete"
```

---

## Summary

| Batch | Tasks | Files | Description |
|-------|-------|-------|-------------|
| 1: Phase Schema | 1-5 | 4 modified (manifest, state, validate-manifest, pre-tool-use, session-start) | Schema + enforcement + staleness |
| 2: Phase Commands | 6-9 | 5 modified (architect, builder, spec, build, sweep, deep-build) | Phase-aware agents + commands |
| 3: Repo Ingestion | 10-12 | 2 new (validate-ingest.js, ingest.md) + 2 modified (translator, pre-tool-use) | Ingest pipeline |
| 4: Polish | 13-15 | 2 modified (guide, CLAUDE.md) + verification | Recommendations + docs |

**Total: 15 tasks, 2 new files, ~15 modified files, 4 batches.**
**Critical path:** Task 4 (phase gate) → Task 9 (deep-build phase advancement) → Task 12 (ingest command).
