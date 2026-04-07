# Sprint 9 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Living Knowledge Tree (semantic memory), node splitting, state hardening, and guide enhancement as specified in `docs/plans/2026-04-06-sprint9-design.md` (1114 lines, survived 19 independent reviewers across 3 review rounds + Codex + Qwen).

**Architecture:** Four pillars built in dependency order. Pillar 1 (Semantic Memory) is the center of gravity — compile-wiki.js (~450 lines across 2 files) generates wiki pages from specs, source, and sweep reports. Pillar 2 (Node Splitting) adds `/forgeplan:split` command with architect-assisted analysis and recovery breadcrumbs. Pillar 3 (State Hardening) extracts shared atomicWriteJson utility. Pillar 4 (Guide Enhancement) reads wiki for smarter recommendations. All wiki features are tier-gated: SMALL skips wiki entirely.

**Tech Stack:** Node.js scripts, Claude Code plugin markdown commands/agents, js-yaml, native fs module. No new dependencies.

**Design doc:** `docs/plans/2026-04-06-sprint9-design.md` — READ THIS FIRST. It is the authoritative specification for every task below.

---

## Batch 1: Foundation (State Schema + Shared Utility + Pre-Tool-Use Whitelist)

These are the infrastructure changes that everything else depends on. No wiki logic yet — just making room for it.

### Task 1: Create shared atomicWriteJson utility

**Files:**
- Create: `scripts/lib/atomic-write.js`

**Step 1: Create the lib directory and write the module**

```javascript
// scripts/lib/atomic-write.js
const fs = require("fs");

function atomicWriteJson(filePath, data) {
  const tmp = filePath + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    try {
      fs.renameSync(tmp, filePath);
    } catch (renameErr) {
      // Windows: target may be locked by antivirus/file indexer; retry once after 200ms
      if (renameErr.code === "EPERM" || renameErr.code === "EBUSY") {
        const start = Date.now();
        while (Date.now() - start < 200) { /* busy wait */ }
        fs.renameSync(tmp, filePath);
      } else {
        throw renameErr;
      }
    }
  } catch (err) {
    // Clean up .tmp file on failure
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore cleanup errors */ }
    throw err;
  }
}

module.exports = { atomicWriteJson };
```

**Step 2: Verify the module loads**

Run: `node -e "const m = require('./scripts/lib/atomic-write.js'); console.log(typeof m.atomicWriteJson)"`
Expected: `function`

**Step 3: Commit**

```bash
git add scripts/lib/atomic-write.js
git commit -m "feat(sprint9): extract shared atomicWriteJson utility"
```

---

### Task 2: Update existing scripts to use shared atomicWriteJson

**Files:**
- Modify: `scripts/post-tool-use.js` (line ~22-26, inline atomicWriteJson)
- Modify: `scripts/stop-hook.js` (line ~31-35, inline atomicWriteJson)
- Modify: `scripts/session-start.js` (inline atomicWriteJson usage)

**Step 1: Update post-tool-use.js**

Find the inline `atomicWriteJson` function definition (around lines 22-26) and replace with:
```javascript
const { atomicWriteJson } = require("./lib/atomic-write");
```
Remove the inline function definition entirely.

**Step 2: Update stop-hook.js**

Find the inline `atomicWriteJson` function definition (around lines 31-35) and replace with:
```javascript
const { atomicWriteJson } = require("./lib/atomic-write");
```
Remove the inline function definition.

**Step 3: Update session-start.js**

Find the inline `atomicWriteJson` function definition (lines 24-28 — it's the same pattern as post-tool-use.js) and replace with:
```javascript
const { atomicWriteJson } = require("./lib/atomic-write");
```
Remove the inline function definition.

**Step 4: Verify all scripts still parse and the old inline function is removed**

Run syntax checks (these scripts read from stdin or call main() at top level, so `require()` would hang or execute — use `--check` instead):
```bash
node --check scripts/post-tool-use.js && echo "post-tool-use: OK"
node --check scripts/stop-hook.js && echo "stop-hook: OK"
node --check scripts/session-start.js && echo "session-start: OK"
```
Expected: All print "OK" (no syntax errors).

Verify inline function was removed (using Node.js for Windows compatibility — `grep` may not be available):
```bash
node -e "const f=require('fs').readFileSync('scripts/post-tool-use.js','utf-8'); console.log('inline removed:', !f.includes('function atomicWriteJson')); console.log('import added:', f.includes('atomic-write'))"
node -e "const f=require('fs').readFileSync('scripts/stop-hook.js','utf-8'); console.log('inline removed:', !f.includes('function atomicWriteJson')); console.log('import added:', f.includes('atomic-write'))"
node -e "const f=require('fs').readFileSync('scripts/session-start.js','utf-8'); console.log('inline removed:', !f.includes('function atomicWriteJson')); console.log('import added:', f.includes('atomic-write'))"
```
Expected: All show `inline removed: true` and `import added: true`.

**Step 5: Commit**

```bash
git add scripts/post-tool-use.js scripts/stop-hook.js scripts/session-start.js
git commit -m "refactor(sprint9): use shared atomicWriteJson in all hook scripts"
```

---

### Task 3: Add wiki state fields to state-schema.json

**Files:**
- Modify: `templates/schemas/state-schema.json`

**Step 1: Add wiki_last_compiled, wiki_compiling, and wiki_compile_attempts fields**

Add these two fields at the top level of the schema's `properties` object, alongside `session_id`, `last_updated`, etc. Do NOT add them to the `required` array — they are optional for backward compatibility.

```json
"wiki_last_compiled": {
  "type": ["string", "null"],
  "format": "date-time",
  "default": null,
  "description": "Timestamp of last compile-wiki.js run. Used for staleness detection."
},
"wiki_compiling": {
  "type": "boolean",
  "default": false,
  "description": "True while compile-wiki.js is running. If true at SessionStart, previous compile was interrupted."
},
"wiki_compile_attempts": {
  "type": "integer",
  "default": 0,
  "description": "Consecutive failed compile-wiki.js runs. Resets on success. Skips compilation after 3."
}
```

**Step 2: Verify the schema is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('templates/schemas/state-schema.json', 'utf-8')); console.log('valid')"`
Expected: `valid`

**Step 3: Commit**

```bash
git add templates/schemas/state-schema.json
git commit -m "feat(sprint9): add wiki_last_compiled and wiki_compiling to state schema"
```

---

### Task 4: Add split_from to manifest schema

**Files:**
- Modify: `templates/schemas/manifest-schema.yaml`

**Step 1: Add split_from as optional node field**

In the node field definitions section, add `split_from` as an optional string field with a comment explaining its purpose:

```yaml
#   split_from: ""               # (Sprint 9) Parent node ID if created by /forgeplan:split
```

**Step 2: Commit**

```bash
git add templates/schemas/manifest-schema.yaml
git commit -m "feat(sprint9): add split_from as optional node field in manifest schema"
```

---

### Task 5: Update pre-tool-use.js with wiki whitelist + path traversal guard

**Files:**
- Modify: `scripts/pre-tool-use.js`

This is a security-critical change. Follow the design doc lines 730-769 exactly.

**Step 1: Add path traversal guard and wiki write whitelist**

**IMPORTANT PLACEMENT:** This code MUST go AFTER the existing `if (relPath.startsWith(".."))` check at line 83 (which allows writes outside the project) and BEFORE the `.forgeplan/` guard block at line 178 (which restricts .forgeplan/ writes by status). Inserting BEFORE line 83 would block other plugins' writes. The exact insertion point is around line 175-177, between the `review-fixing` fallthrough block's closing brace (line 175) and the `building/sweeping` `.forgeplan/` guard's opening `if` (line 177). Search for `if ((activeStatus === "building"` to find the anchor.

```javascript
// Wiki writes — scoped by operation type (Sprint 9)
// SECURITY: path traversal already prevented by path.relative() at line 75-77.
// Defense-in-depth: reject any relPath containing ".." segments within the project.
// NOTE: This runs AFTER the startsWith("..") check at line 83 which allows outside-project writes.
if (relPath.includes('..')) {
  return { block: true, message: `Path traversal detected: ${relPath}` };
}
if (relPath.startsWith('.forgeplan/wiki/')) {
  if (activeStatus === 'sweeping') {
    return { block: false }; // Sweep is cross-cutting, needs full wiki access
  }
  if (activeStatus === 'building' || activeStatus === 'review-fixing') {
    // No optional chaining — at this point, active_node is guaranteed non-null
    // (the !state.active_node branch returned early at line 149)
    const activeNodeId = state.active_node.node;
    if (activeNodeId && relPath === `.forgeplan/wiki/nodes/${activeNodeId}.md`) {
      return { block: false }; // Only the active node's wiki page
    }
    return { block: true, message: `Wiki write restricted: can only write to wiki/nodes/${activeNodeId}.md during ${activeStatus}` };
  }
  // For any other status (reviewing, revising), wiki writes fall through to
  // the general .forgeplan/ guard below which will block them. This is correct —
  // wiki writes only happen during building, review-fixing, and sweeping.
}
```

**Step 2: Add wiki/ to sweep analysis mode allowlist**

At lines 131-146, the sweep analysis mode has an `if` condition listing allowed `.forgeplan/` paths. Add wiki/ as a new `||` line inside this condition, after the existing `.forgeplan/sweeps/` line (line 134):

```javascript
// Existing line:
relPath.startsWith(".forgeplan/sweeps/") ||
// ADD THIS LINE:
relPath.startsWith(".forgeplan/wiki/") ||     // Wiki updates during sweep (Sprint 9)
// Existing line continues:
relPath.startsWith(".forgeplan/specs/") ||
```

**Step 3: Add compile-wiki.js to Bash safe patterns**

In the Bash safe patterns section (around lines 433-480), add:

```javascript
/^\s*node\s+[^\s]*compile-wiki\.js/,    // wiki knowledge compilation
```

**Step 4: Verify pre-tool-use.js still parses and contains the new guard**

```bash
node --check scripts/pre-tool-use.js && echo "syntax OK"
node -e "const f=require('fs').readFileSync('scripts/pre-tool-use.js','utf-8'); console.log('wiki whitelist:', (f.match(/forgeplan\/wiki/g)||[]).length, 'refs'); console.log('traversal guard:', f.includes('includes('));  console.log('bash pattern:', f.includes('compile-wiki'))"
```
Expected: syntax OK, 3+ wiki refs, traversal guard true, bash pattern true.

**Step 5: Commit**

```bash
git add scripts/pre-tool-use.js
git commit -m "feat(sprint9): add wiki whitelist + path traversal guard to pre-tool-use"
```

---

## Batch 2: Wiki Engine (compile-wiki.js + wiki-builder.js + PostToolUse + SessionStart)

This is the core of Sprint 9. The wiki compiler is ~450 lines across two files.

### Task 6: Create wiki-builder.js library

**Files:**
- Create: `scripts/lib/wiki-builder.js`

This is the page generation library. It exports pure functions that take data and return markdown strings. ~300 lines.

**Step 1: Write the full library**

The authoritative function signatures (resolving design doc vs plan mismatch — plan signatures win, design doc inventory to be updated):

```javascript
// scripts/lib/wiki-builder.js
"use strict";
const fs = require("fs");
const path = require("path");

// --- Constants ---
const DECISION_REGEX = /@forgeplan-decision:\s*(D-\S+-\d+-\S+)\s*--\s*([^\n]+)/g;
// SYNC: PostToolUse (post-tool-use.js) uses the same regex inline.
// If you change this, update post-tool-use.js too.

const TEST_FILE_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//];
const IMPORT_REGEX = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g;
const MIDDLEWARE_REGEX = /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?)\s*\(req,\s*res(?:,\s*next)?\)/g;
const CATCH_NEXT_REGEX = /catch\s*\([^)]*\)\s*\{[^}]*next\s*\(/gs;
const CATCH_JSON_REGEX = /catch\s*\([^)]*\)\s*\{[^}]*res\s*\.\s*(?:json|status)/gs;
const CATCH_RETHROW_REGEX = /catch\s*\([^)]*\)\s*\{[^}]*throw\s/gs;

// --- Decision Marker Extraction ---

/**
 * Extract @forgeplan-decision markers from file contents.
 * @param {string} fileContents - Full file text
 * @param {string} filePath - Path to file (for citations)
 * @returns {Array<{id: string, choice: string, why: string, file: string, line: number}>}
 */
function extractDecisionMarkers(fileContents, filePath) {
  const decisions = [];
  const lines = fileContents.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = /@forgeplan-decision:\s*(D-\S+-\d+-\S+)\s*--\s*([^\n]+)/.exec(lines[i]);
    if (match) {
      const rawDesc = match[2].trim();
      // Split on "Why:" or "because" to separate choice from rationale
      // e.g., "Database sessions. Why: need server-side revocation"
      // e.g., "Use bcrypt because it has adaptive cost factor"
      let choice = rawDesc;
      let why = "";
      const whyMatch = rawDesc.match(/^(.+?)\s*(?:Why:\s*|because\s+)(.+)$/i);
      if (whyMatch) {
        choice = whyMatch[1].replace(/\.\s*$/, ""); // trim trailing period
        why = whyMatch[2];
      }
      decisions.push({
        id: match[1],
        choice,
        why,
        file: filePath,
        line: i + 1,
      });
    }
  }
  return decisions;
}

// --- Pattern Inference (V1: regex-only, no AST) ---

function isTestFile(filePath) {
  return TEST_FILE_PATTERNS.some(p => p.test(filePath));
}

/**
 * Infer patterns from source files using three regex heuristics.
 * @param {Array<{path: string, content: string}>} allFiles - Source files with content
 * @returns {Array<{name: string, type: string, files: string[], description: string}>}
 */
function inferPatterns(allFiles) {
  const sourceFiles = allFiles.filter(f => !isTestFile(f.path));
  const patterns = [];

  // 1. Import clustering: files sharing 3+ identical imports
  const fileImports = {};
  for (const f of sourceFiles) {
    const imports = new Set();
    let m;
    const re = new RegExp(IMPORT_REGEX.source, IMPORT_REGEX.flags);
    while ((m = re.exec(f.content)) !== null) {
      imports.add(m[1] || m[2]);
    }
    if (imports.size > 0) fileImports[f.path] = [...imports].sort();
  }
  // Group files by shared import sets (3+ shared imports)
  const importClusters = {};
  const filePaths = Object.keys(fileImports);
  for (let i = 0; i < filePaths.length; i++) {
    for (let j = i + 1; j < filePaths.length; j++) {
      const shared = fileImports[filePaths[i]].filter(imp => fileImports[filePaths[j]].includes(imp));
      if (shared.length >= 3) {
        const key = shared.join(",");
        if (!importClusters[key]) importClusters[key] = { imports: shared, files: new Set() };
        importClusters[key].files.add(filePaths[i]);
        importClusters[key].files.add(filePaths[j]);
      }
    }
  }
  for (const [key, cluster] of Object.entries(importClusters)) {
    if (cluster.files.size >= 3) {
      const slug = cluster.imports.slice(0, 3).map(i => path.basename(i, path.extname(i))).join("-");
      patterns.push({
        name: `import-cluster-${slug}`,
        type: "import-cluster",
        files: [...cluster.files],
        description: `Files sharing imports: ${cluster.imports.join(", ")}`,
      });
    }
  }

  // 2. Middleware signatures: files with (req, res, next) patterns
  const middlewareFiles = sourceFiles.filter(f => {
    MIDDLEWARE_REGEX.lastIndex = 0; // Reset before each test (global regex is stateful)
    return MIDDLEWARE_REGEX.test(f.content);
  }).map(f => f.path);
  if (middlewareFiles.length >= 3) {
    patterns.push({
      name: "middleware-pattern",
      type: "middleware",
      files: middlewareFiles,
      description: "Files with Express/Connect middleware signatures (req, res, next)",
    });
  }

  // 3. Error handling shapes: classify catch blocks
  const errorShapes = { "next-error": [], "json-response": [], "rethrow": [] };
  for (const f of sourceFiles) {
    if (CATCH_NEXT_REGEX.test(f.content)) errorShapes["next-error"].push(f.path);
    CATCH_NEXT_REGEX.lastIndex = 0;
    if (CATCH_JSON_REGEX.test(f.content)) errorShapes["json-response"].push(f.path);
    CATCH_JSON_REGEX.lastIndex = 0;
    if (CATCH_RETHROW_REGEX.test(f.content)) errorShapes["rethrow"].push(f.path);
    CATCH_RETHROW_REGEX.lastIndex = 0;
  }
  for (const [shape, files] of Object.entries(errorShapes)) {
    if (files.length >= 3) {
      patterns.push({
        name: `error-${shape}`,
        type: "error-handling",
        files,
        description: `Error handling: catch blocks using ${shape} pattern`,
      });
    }
  }

  return patterns;
}

// --- Page Generation ---

/**
 * Build a node wiki page (novel info only — no manifest/spec/state duplication).
 * @param {string} nodeId
 * @param {object} spec - Parsed spec YAML for this node
 * @param {Array} decisions - Decision markers found in this node's files
 * @param {Array} pastFindings - Findings from sweeps/reviews for this node
 * @param {Array} crossRefs - Cross-references to other nodes
 * @returns {string} Markdown page content
 */
function buildNodePage(nodeId, spec, decisions, pastFindings, crossRefs) {
  const lines = [`# Node: ${nodeId}`, ""];

  // Decisions section
  lines.push("## Decisions (from @forgeplan-decision markers)");
  if (decisions.length === 0) {
    lines.push("_No decisions recorded yet._");
  } else {
    for (const d of decisions) {
      const whyStr = d.why ? ` Why: ${d.why}.` : "";
      lines.push(`- **${d.id}**: ${d.choice}.${whyStr} [${d.file}:${d.line}]`);
    }
  }
  lines.push("");

  // Past Findings section (re-derived from sweeps/reviews — true regeneration)
  lines.push("## Past Findings");
  lines.push("| Pass | Agent | Finding | Resolution |");
  lines.push("|------|-------|---------|------------|");
  for (const f of pastFindings) {
    lines.push(`| ${f.pass || "-"} | ${f.agent || "-"} | ${f.finding || "-"} | ${f.resolution || "-"} |`);
  }
  lines.push("");

  // Cross-References section
  lines.push("## Cross-References");
  if (crossRefs.length === 0) {
    lines.push("_No cross-references yet._");
  } else {
    for (const ref of crossRefs) {
      lines.push(`- ${ref}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Build the cross-cutting decisions.md page.
 * @param {Array<{id, description, nodes: string[], files: string[], status: string}>} allDecisions
 * @returns {string} Markdown page content
 */
function buildDecisionsPage(allDecisions) {
  const lines = ["# Architectural Decisions", ""];
  if (allDecisions.length === 0) {
    lines.push("_No decisions recorded yet._");
    return lines.join("\n");
  }
  for (const d of allDecisions) {
    lines.push(`## ${d.id}`);
    lines.push(`**Nodes:** ${(d.nodes || []).join(", ") || "unknown"}`);
    lines.push(`**Choice:** ${d.choice || d.description || ""}`);
    lines.push(`**Why:** ${d.why || "—"}`);
    lines.push(`**Files:** ${(d.files || []).map(f => `[${f}]`).join(", ")}`);
    lines.push(`**Status:** ${d.status || "Active"}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Build the rules.md page from spec constraints + inferred patterns.
 * @param {Array<{slug: string, constraint: string, source: string}>} specConstraints
 * @param {Array<{name, type, files, description}>} inferredPatterns
 * @returns {string} Markdown page content
 */
function buildRulesPage(specConstraints, inferredPatterns) {
  const lines = ["# Rules & Patterns", ""];

  lines.push("## Rules (from spec constraints)");
  if (specConstraints.length === 0) {
    lines.push("_No spec constraints found._");
  } else {
    for (const r of specConstraints) {
      lines.push(`- **${r.slug}**: ${r.constraint} — Source: ${r.source}`);
    }
  }
  lines.push("");

  lines.push("## Inferred Patterns");
  if (inferredPatterns.length === 0) {
    lines.push("_No patterns detected yet (need 3+ files sharing a structure)._");
  } else {
    for (const p of inferredPatterns) {
      lines.push(`- **${p.name}** (${p.type}): ${p.description} — Files: ${p.files.join(", ")}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Build the wiki index.md page.
 * @param {object} manifest - Parsed manifest
 * @param {string} forgePlanDir - Path to .forgeplan directory (to check for discovery-index.md)
 * @returns {string} Markdown page content
 */
function buildIndexPage(manifest, forgePlanDir) {
  const project = manifest.project || {};
  const nodeIds = Object.keys(manifest.nodes || {});
  const lines = [
    `# ${project.name || "Project"} — Knowledge Base`,
    "",
    `**Tier:** ${project.complexity_tier || "unknown"}`,
    `**Tech Stack:** ${JSON.stringify(project.tech_stack || {})}`,
    `**Nodes:** ${nodeIds.join(", ")}`,
    "",
  ];

  // Incorporate discovery-index.md if it exists (from large-document discovery)
  const discoveryIndexPath = forgePlanDir
    ? path.join(forgePlanDir, "wiki", "discovery-index.md")
    : null;
  if (discoveryIndexPath && fs.existsSync(discoveryIndexPath)) {
    lines.push("## Discovery Context");
    lines.push(fs.readFileSync(discoveryIndexPath, "utf-8").trim());
    lines.push("");
  }

  lines.push("## Pages");
  lines.push("- [decisions.md](decisions.md) — Architectural decisions");
  lines.push("- [rules.md](rules.md) — Conventions and patterns");
  lines.push("");
  lines.push("### Node Pages");
  for (const id of nodeIds) {
    lines.push(`- [${id}](nodes/${id}.md)`);
  }
  lines.push("");
  return lines.join("\n");
}

module.exports = {
  extractDecisionMarkers,
  inferPatterns,
  buildNodePage,
  buildDecisionsPage,
  buildRulesPage,
  buildIndexPage,
  // Exported for PostToolUse to use instead of duplicating regex
  DECISION_REGEX,
  isTestFile,
};
```

**Step 2: Verify the module loads and exports are correct**

Run: `node -e "const wb = require('./scripts/lib/wiki-builder.js'); console.log(Object.keys(wb).sort().join(', '))"`
Expected: All of: `DECISION_REGEX, buildDecisionsPage, buildIndexPage, buildNodePage, buildRulesPage, extractDecisionMarkers, inferPatterns, isTestFile`

**Step 3: Test extractDecisionMarkers with sample input**

Run:
```bash
node -e "
const { extractDecisionMarkers } = require('./scripts/lib/wiki-builder.js');
const result = extractDecisionMarkers(
  '// @forgeplan-decision: D-auth-1-sessions -- Use database sessions\nconst x = 1;\n// @forgeplan-decision: D-auth-2-bcrypt -- Use bcrypt for hashing',
  'src/auth/index.ts'
);
console.log(JSON.stringify(result, null, 2));
"
```
Expected: Array with 2 entries, each having id, slug, description, file, line.

**Step 4: Commit**

```bash
git add scripts/lib/wiki-builder.js
git commit -m "feat(sprint9): create wiki-builder.js page generation library"
```

---

### Task 7: Create compile-wiki.js orchestrator

**Files:**
- Create: `scripts/compile-wiki.js`

This is the orchestrator (~150 lines). See design doc lines 269-358 for the full specification.

**Step 1: Write the full orchestrator**

```javascript
// scripts/compile-wiki.js
"use strict";
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
// require("minimatch") returns an object in this repo, not a callable — use .minimatch property
const { minimatch } = require("minimatch");

// Recursive directory walk + minimatch filtering (replaces `glob` package — not installed)
// NOTE: ignore patterns are POSITIVE matches (e.g., "**/node_modules/**"), NOT negated with "!"
const IGNORE_PATTERNS = ["**/node_modules/**","**/dist/**","**/build/**","**/.next/**","**/__snapshots__/**","**/*.generated.*"];

function globSync(pattern, cwd) {
  const results = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(path.join(cwd, dir), { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      const rel = dir ? dir + "/" + entry.name : entry.name;
      if (entry.isDirectory()) {
        if (!IGNORE_PATTERNS.some(ig => minimatch(rel + "/", ig))) walk(rel);
      } else if (minimatch(rel, pattern)) {
        if (!IGNORE_PATTERNS.some(ig => minimatch(rel, ig))) results.push(rel);
      }
    }
  };
  walk("");
  return results;
}
const { atomicWriteJson } = require("./lib/atomic-write");
const wb = require("./lib/wiki-builder");

const BINARY_EXTS = new Set([".png",".jpg",".gif",".ico",".woff",".eot",".ttf",".pdf",".zip"]);
const VERBOSE = process.argv.includes("--verbose");

function log(msg) { process.stderr.write(msg + "\n"); }
function debug(msg) { if (VERBOSE) log("  [debug] " + msg); }

async function main() {
  const startTime = Date.now();
  const cwd = process.cwd();
  const fpDir = path.join(cwd, ".forgeplan");
  const wikiDir = path.join(fpDir, "wiki");
  const manifestPath = path.join(fpDir, "manifest.yaml");
  const statePath = path.join(fpDir, "state.json");

  // Early exit: no manifest
  if (!fs.existsSync(manifestPath)) {
    log("Wiki compile: no manifest found. Skipping.");
    return;
  }
  const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  const tier = (manifest.project && manifest.project.complexity_tier) || "SMALL";

  // Tier gate: SMALL skips wiki entirely
  if (tier === "SMALL") {
    log("Wiki compile: SMALL tier, skipping.");
    return;
  }

  // Load state — require it to exist (discover bootstraps state.json before wiki init)
  // If state.json doesn't exist, skip wiki compilation — discover hasn't finished yet
  if (!fs.existsSync(statePath)) {
    log("Wiki compile: no state.json found (discovery not complete). Skipping.");
    return;
  }
  let state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

  // Compile attempt tracking
  const attempts = state.wiki_compile_attempts || 0;
  if (attempts >= 3) {
    log("Wiki compilation has failed 3 times. Run 'node scripts/compile-wiki.js --verbose' to diagnose.");
    return;
  }

  // Step 0: Create wiki directory if missing (handles tier upgrades, manual deletion)
  if (!fs.existsSync(wikiDir)) {
    fs.mkdirSync(path.join(wikiDir, "nodes"), { recursive: true });
    debug("Created wiki/ directory structure");
  }

  const nodeIds = Object.keys(manifest.nodes || {});
  const allDecisions = [];
  const allConstraints = [];
  const allPatterns = [];
  const pages = {}; // filename -> content
  let nodeCount = 0, ruleCount = 0, patternCount = 0, decisionCount = 0;

  // Step 1-2: Process each node
  for (const nodeId of nodeIds) {
    const node = manifest.nodes[nodeId];
    let spec = {};
    const specPath = path.join(fpDir, "specs", nodeId + ".yaml");
    try {
      if (fs.existsSync(specPath)) {
        spec = yaml.load(fs.readFileSync(specPath, "utf-8")) || {};
      }
    } catch (err) {
      log(`Wiki compile error: invalid YAML in ${specPath}: ${err.message}. Skipping node.`);
      continue;
    }

    // 2a: Extract constraints from spec
    const constraints = (spec.constraints || []).map((c, i) => ({
      slug: c.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 40),
      constraint: c,
      source: specPath,
    }));
    allConstraints.push(...constraints);

    // 2b: Get file list
    let files = [];
    if (node.files && node.files.length > 0) {
      files = node.files.filter(f => !BINARY_EXTS.has(path.extname(f).toLowerCase()));
    } else if (node.file_scope) {
      try {
        files = globSync(node.file_scope, cwd);
        files = files.filter(f => !BINARY_EXTS.has(path.extname(f).toLowerCase()));
      } catch (_) { debug(`Glob failed for ${nodeId}: ${node.file_scope}`); }
    }
    debug(`${nodeId}: ${files.length} files`);

    // 2c: Extract decision markers from files
    const decisions = [];
    for (const filePath of files) {
      const absPath = path.resolve(cwd, filePath);
      if (!fs.existsSync(absPath)) {
        debug(`Missing file: ${filePath}`);
        continue;
      }
      // Skip files >500KB (generated bundles, SQL dumps, etc.)
      try {
        const stat = fs.statSync(absPath);
        if (stat.size > 500 * 1024) { debug(`Skipping large file: ${filePath} (${stat.size} bytes)`); continue; }
      } catch (_) { continue; }
      try {
        const content = fs.readFileSync(absPath, "utf-8");
        const markers = wb.extractDecisionMarkers(content, filePath);
        decisions.push(...markers);
      } catch (_) { debug(`Cannot read ${filePath}`); }
    }

    // 2d: Infer patterns (collect files for inference after all nodes processed)
    const fileContents = [];
    for (const filePath of files) {
      const absPath = path.resolve(cwd, filePath);
      if (!fs.existsSync(absPath)) continue;
      try {
        fileContents.push({ path: filePath, content: fs.readFileSync(absPath, "utf-8") });
      } catch (_) {}
    }

    // 2e: Re-derive Past Findings from sweeps/ and reviews/ (true regeneration)
    const pastFindings = [];
    const sweepsDir = path.join(fpDir, "sweeps");
    const reviewsDir = path.join(fpDir, "reviews");
    // Read sweep reports for this node
    // NOTE: Sweep writes MARKDOWN reports (not JSON) per sweep.md:174.
    // Parse findings tables from markdown: | File | Agent | Finding | ... |
    if (fs.existsSync(sweepsDir)) {
      for (const file of fs.readdirSync(sweepsDir)) {
        try {
          const reportText = fs.readFileSync(path.join(sweepsDir, file), "utf-8");
          // Extract pass number from filename or heading (e.g., "pass-1.md" or "# Pass 1")
          const passMatch = file.match(/pass-?(\d+)/i) || reportText.match(/# Pass (\d+)/i);
          const passNum = passMatch ? passMatch[1] : "-";
          // Extract findings from markdown table rows (skip header + separator)
          const tableRows = reportText.match(/\|[^|\n]+\|[^|\n]+\|[^|\n]+\|[^|\n]*\|/g) || [];
          for (const row of tableRows.slice(2)) { // skip header + separator
            const cells = row.split("|").map(c => c.trim()).filter(Boolean);
            if (cells.length >= 3) {
              // Check if finding references this node's files
              const rowText = cells.join(" ");
              if (files.some(nf => rowText.includes(nf)) || rowText.toLowerCase().includes(nodeId)) {
                pastFindings.push({
                  pass: passNum,
                  agent: cells[1] || "-",
                  finding: cells[2] || "-",
                  resolution: cells[3] || "-",
                });
              }
            }
          }
        } catch (_) {}
      }
    }
    // Read review reports for this node
    const reviewPath = path.join(reviewsDir, nodeId + ".md");
    if (fs.existsSync(reviewPath)) {
      // Simple extraction: look for findings table rows in review markdown
      const reviewContent = fs.readFileSync(reviewPath, "utf-8");
      const tableRows = reviewContent.match(/\|[^|]+\|[^|]+\|[^|]+\|/g) || [];
      for (const row of tableRows.slice(2)) { // skip header + separator
        const cells = row.split("|").map(c => c.trim()).filter(Boolean);
        if (cells.length >= 3) {
          pastFindings.push({ pass: "review", agent: "reviewer", finding: cells[0], resolution: cells[1] || "-" });
        }
      }
    }

    // Build cross-references
    const crossRefs = [];
    for (const depId of (node.depends_on || [])) {
      crossRefs.push(`Depends on: ${depId}`);
    }
    for (const connId of (node.connects_to || [])) {
      crossRefs.push(`Connected to: ${connId}`);
    }

    // Collect decisions for cross-cutting page
    for (const d of decisions) {
      allDecisions.push({
        id: d.id,
        choice: d.choice,
        why: d.why,
        nodes: [nodeId],
        files: [`${d.file}:${d.line}`],
        status: "Active",
      });
    }

    // 2f: Generate node page
    pages[`nodes/${nodeId}.md`] = wb.buildNodePage(nodeId, spec, decisions, pastFindings, crossRefs);
    nodeCount++;
    decisionCount += decisions.length;

    // Collect file contents for pattern inference
    allPatterns.push(...wb.inferPatterns(fileContents));
  }

  // Second pass: redistribute split_from decisions (must run after ALL nodes processed)
  for (const nodeId of nodeIds) {
    const node = manifest.nodes[nodeId];
    if (node.split_from) {
      // Get child's files — use files array if populated, fall back to file_scope glob
      // (freshly split children may not have populated files arrays yet)
      let nodeFiles = (node.files || []);
      if (nodeFiles.length === 0 && node.file_scope) {
        try { nodeFiles = globSync(node.file_scope, cwd); } catch (_) {}
      }
      for (const d of allDecisions) {
        if (d.nodes && d.nodes.includes(node.split_from) && !d.nodes.includes(nodeId)) {
          if (d.files && d.files.some(df => nodeFiles.some(nf => df.includes(nf)))) {
            d.nodes.push(nodeId);
          }
        }
      }
    }
  }

  // Deduplicate patterns by name
  const uniquePatterns = {};
  for (const p of allPatterns) {
    if (!uniquePatterns[p.name]) uniquePatterns[p.name] = p;
    else uniquePatterns[p.name].files = [...new Set([...uniquePatterns[p.name].files, ...p.files])];
  }
  const finalPatterns = Object.values(uniquePatterns);
  patternCount = finalPatterns.length;
  ruleCount = allConstraints.length;

  // Step 3: Generate cross-cutting pages
  pages["decisions.md"] = wb.buildDecisionsPage(allDecisions);
  pages["rules.md"] = wb.buildRulesPage(allConstraints, finalPatterns);
  pages["index.md"] = wb.buildIndexPage(manifest, fpDir);

  // Step 4: Reconcile vs manifest
  const nodesDir = path.join(wikiDir, "nodes");
  if (fs.existsSync(nodesDir)) {
    for (const file of fs.readdirSync(nodesDir)) {
      const id = file.replace(/\.md$/, "");
      if (!nodeIds.includes(id)) {
        // Archive removed node
        const archiveDir = path.join(wikiDir, "archived");
        fs.mkdirSync(archiveDir, { recursive: true });
        fs.renameSync(path.join(nodesDir, file), path.join(archiveDir, file));
        debug(`Archived: ${id}`);
      }
    }
  }
  // 4c: Prune archives (>30 days or >50 entries, max 10 per run)
  const archiveDir = path.join(wikiDir, "archived");
  if (fs.existsSync(archiveDir)) {
    const entries = fs.readdirSync(archiveDir).map(f => ({
      name: f, mtime: fs.statSync(path.join(archiveDir, f)).mtimeMs,
    })).sort((a, b) => a.mtime - b.mtime);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let pruned = 0;
    for (const entry of entries) {
      if (pruned >= 10) break;
      if (entries.length - pruned <= 50 && entry.mtime > thirtyDaysAgo) break;
      fs.unlinkSync(path.join(archiveDir, entry.name));
      pruned++;
      debug(`Pruned archive: ${entry.name}`);
    }
  }

  // Step 5: Batch atomic write via staging directory
  const stagingDir = path.join(wikiDir, ".tmp-compile");
  try {
    // 5a: Set compiling flag
    state.wiki_compiling = true;
    atomicWriteJson(statePath, state);

    // 5b: Clean stale staging dir
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(stagingDir, "nodes"), { recursive: true });

    // 5c: Write all pages to staging
    for (const [relPath, content] of Object.entries(pages)) {
      const stagingPath = path.join(stagingDir, relPath);
      fs.mkdirSync(path.dirname(stagingPath), { recursive: true });
      fs.writeFileSync(stagingPath, content, "utf-8");
    }

    // 5d: Rename from staging to final
    for (const [relPath] of Object.entries(pages)) {
      const src = path.join(stagingDir, relPath);
      const dest = path.join(wikiDir, relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(src, dest);
    }

    // 5e: Remove staging directory (retry for NTFS locks)
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch (_) {
      // Windows: antivirus may hold a file; retry once after 200ms
      const start = Date.now();
      while (Date.now() - start < 200) { /* busy wait */ }
      try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (_) {
        debug("Could not remove staging dir — will be cleaned next compile");
      }
    }

    // Step 6: Update timestamp
    state.wiki_last_compiled = new Date().toISOString();
    state.wiki_compile_attempts = 0; // Reset on success
    atomicWriteJson(statePath, state);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Wiki compiled: ${nodeCount} nodes, ${ruleCount} rules, ${patternCount} patterns, ${decisionCount} decisions. (${elapsed}s)`);
  } finally {
    // 5f: ALWAYS reset compiling flag
    try {
      state.wiki_compiling = false;
      atomicWriteJson(statePath, state);
    } catch (_) { /* cannot write state — will be detected by SessionStart */ }
  }
}

main().catch(err => {
  // Track failed attempt
  try {
    const statePath = path.join(process.cwd(), ".forgeplan", "state.json");
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      state.wiki_compile_attempts = (state.wiki_compile_attempts || 0) + 1;
      state.wiki_compiling = false;
      atomicWriteJson(statePath, state);
    }
  } catch (_) {}
  log(`Wiki compile error: ${err.message}`);
  process.exit(1);
});
```

**Step 2: Verify the script runs**

```bash
node scripts/compile-wiki.js 2>&1
```
Expected: Either "no manifest found", "SMALL tier, skipping", or successful compilation output.

If the ForgeDev project has a `.forgeplan/` directory, it will attempt real compilation. Check that `wiki/` pages were created if tier is MEDIUM/LARGE.

**Step 3: Commit**

```bash
git add scripts/compile-wiki.js
git commit -m "feat(sprint9): create compile-wiki.js orchestrator"
```

---

### Task 8: Add PostToolUse wiki appending

**Files:**
- Modify: `scripts/post-tool-use.js`

Read design doc lines 231-267 for the full specification.

**Step 1: Add wiki appending logic after conversation logging**

Insert a new try-catch block at the end of the `processHook` function, INSIDE the function but after the conversation logging try-catch (after line 284, before the closing brace at line 285). The variables `manifest`, `state`, `toolInput`, `toolName`, `relPath`, and `activeNodeId` are already in scope from earlier in `processHook()`.

```javascript
  // --- Sprint 9: Wiki appending (decision markers) ---
  // NOTE: `manifest` from line 234 is block-scoped inside a try block and not in scope here.
  // Re-read the manifest for tier checking. This is a cheap operation (file is small, OS-cached).
  try {
    const manifestPath = path.join(forgePlanDir, "manifest.yaml");
    if (!fs.existsSync(manifestPath)) return; // No manifest = no wiki
    const wikiManifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
    const tier = wikiManifest && wikiManifest.project && wikiManifest.project.complexity_tier;
    if (tier && tier !== "SMALL" && state.active_node && state.active_node.node) {
      const wikiNodeId = state.active_node.node;
      // Defense-in-depth: validate nodeId format before using in file path
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(wikiNodeId)) return;
      // Get content to scan: Write = full content, Edit = new_string only (partial — acceptable)
      const content = toolName === "Write" ? (toolInput.content || "") : (toolInput.new_string || "");
      const ext = path.extname(relPath || "").toLowerCase();
      const binaryExts = [".png",".jpg",".gif",".woff",".eot",".ico",".pdf",".zip",".ttf"];
      // Skip large files (>50KB) and binary files
      if (content.length <= 50000 && !binaryExts.includes(ext)) {
        // Import DECISION_REGEX from wiki-builder to avoid duplication
        // If wiki-builder is unavailable (not yet built), use inline fallback
        let DECISION_RE;
        try {
          DECISION_RE = require("./lib/wiki-builder").DECISION_REGEX;
        } catch (_) {
          DECISION_RE = /@forgeplan-decision:\s*(D-\S+-\d+-\S+)\s*--\s*([^\n]+)/g;
        }
        const matches = [];
        let m;
        const re = new RegExp(DECISION_RE.source, DECISION_RE.flags);
        while ((m = re.exec(content)) !== null) {
          matches.push({ id: m[1], description: m[2].trim() });
        }
        if (matches.length > 0) {
          const wikiDir = path.join(forgePlanDir, "wiki");
          const nodesDir = path.join(wikiDir, "nodes");
          // Create skeleton if missing (handles first build, tier upgrade, manual deletion)
          if (!fs.existsSync(nodesDir)) {
            fs.mkdirSync(nodesDir, { recursive: true });
            // Create minimal skeleton files
            if (!fs.existsSync(path.join(wikiDir, "index.md"))) {
              fs.writeFileSync(path.join(wikiDir, "index.md"), "# Wiki\n", "utf-8");
            }
            if (!fs.existsSync(path.join(wikiDir, "decisions.md"))) {
              fs.writeFileSync(path.join(wikiDir, "decisions.md"), "# Architectural Decisions\n", "utf-8");
            }
            if (!fs.existsSync(path.join(wikiDir, "rules.md"))) {
              fs.writeFileSync(path.join(wikiDir, "rules.md"), "# Rules & Patterns\n", "utf-8");
            }
          }
          // Append decision markers to node wiki page
          const wikiPagePath = path.join(nodesDir, wikiNodeId + ".md");
          let appendText = "";
          for (const match of matches) {
            appendText += `- **${match.id}**: ${match.description} [${relPath}]\n`;
          }
          fs.appendFileSync(wikiPagePath, appendText, "utf-8");
        }
      }
    }
  } catch (wikiErr) {
    // Wiki appending is best-effort — never block the build
    // Silent catch: wiki will be rebuilt by compile-wiki.js later
  }
```

**Step 2: Verify post-tool-use.js still parses**

```bash
node --check scripts/post-tool-use.js && echo "syntax OK"
node -e "const f=require('fs').readFileSync('scripts/post-tool-use.js','utf-8'); console.log('wiki-builder import:', f.includes('wiki-builder')); console.log('DECISION_RE:', (f.match(/DECISION_RE/g)||[]).length, 'refs')"
```
Expected: syntax OK, wiki-builder import true, DECISION_RE 2+ refs.

**Step 3: Commit**

```bash
git add scripts/post-tool-use.js
git commit -m "feat(sprint9): add wiki appending to PostToolUse hook"
```

---

### Task 9: Enhance SessionStart with wiki staleness + split recovery detection

**Files:**
- Modify: `scripts/session-start.js`

Read design doc lines 630-648 for the full specification.

**Step 1: Add isWikiStale() helper function**

Add this function alongside the other helpers (e.g., near `determineSuggestion` around line 309). Takes `state` and `forgePlanDir` as parameters to avoid re-reading state.json (it's already loaded in `main()`):

```javascript
function isWikiStale(state, forgePlanDir) {
  if (!state.wiki_last_compiled) return "not-initialized"; // Never compiled
  if (!fs.existsSync(path.join(forgePlanDir, "wiki", "index.md"))) return "deleted"; // Wiki dir deleted
  if (state.wiki_compiling) return "interrupted"; // Previous compile crashed
  const lastCompiled = new Date(state.wiki_last_compiled);
  const lastStateUpdate = new Date(state.last_updated);
  if (lastStateUpdate > lastCompiled) return "stale";
  return false; // Wiki is fresh
}
```

**Step 2: Add wiki status to ambient display**

In the `buildAmbientStatus()` function, after the sweep progress block (around line 297) and before the suggestion line (line 299), call `isWikiStale(state, forgePlanDir)` and add status output. Only for MEDIUM/LARGE tier:

```javascript
// Wiki status (Sprint 9 — MEDIUM/LARGE only)
const tier = manifest && manifest.project && manifest.project.complexity_tier;
if (tier && tier !== "SMALL") {
  const wikiStatus = isWikiStale(state, forgePlanDir);
  if (wikiStatus === "not-initialized") {
    lines.push("  Wiki: not yet initialized. Will be created during first sweep.");
  } else if (wikiStatus === "deleted") {
    lines.push("  Wiki: deleted — will rebuild on next sweep.");
  } else if (wikiStatus === "interrupted") {
    lines.push("  Wiki: compilation was interrupted — will retry on next sweep.");
  } else if (wikiStatus === "stale") {
    lines.push(`  Wiki: stale (last compiled: ${state.wiki_last_compiled}). Will refresh on next sweep.`);
  } else {
    lines.push(`  Wiki: up to date (compiled: ${state.wiki_last_compiled}).`);
  }
}
```

**Step 3: Add split recovery detection**

In the problem detection section (around lines 66-142), add after the existing blocked decisions check. Wrap in try-catch for robustness (breadcrumb may be corrupted):

```javascript
// Detect interrupted split (Sprint 9)
const splitBreadcrumb = path.join(forgePlanDir, ".split-in-progress.json");
if (fs.existsSync(splitBreadcrumb)) {
  try {
    const raw = fs.readFileSync(splitBreadcrumb, "utf-8");
    // Size guard: skip if breadcrumb is corrupted/huge (>5MB)
    if (raw.length > 5 * 1024 * 1024) {
      process.stderr.write(
        "\nWARNING: .split-in-progress.json is too large (>5MB). May be corrupted.\n" +
        "   Delete it manually or run /forgeplan:recover to investigate.\n\n"
      );
    } else {
      const breadcrumb = JSON.parse(raw);
      const remaining = ["specs", "manifest", "state", "wiki"].filter(
        s => !(breadcrumb.completed_steps || []).includes(s)
      );
      process.stderr.write(
        `\nWARNING: Split of "${breadcrumb.parent_node_id}" into [${(breadcrumb.child_nodes || []).join(", ")}] was interrupted.\n` +
        `   Started: ${breadcrumb.started_at || "unknown"}\n` +
        `   Completed: ${(breadcrumb.completed_steps || []).join(", ") || "none"}\n` +
        `   Remaining: ${remaining.join(", ")}\n` +
        `   Run /forgeplan:recover to resume or rollback.\n\n`
      );
    }
  } catch (err) {
    process.stderr.write(
      "\nWARNING: .split-in-progress.json exists but cannot be read. May be corrupted.\n" +
      "   Run /forgeplan:recover or delete the file manually.\n\n"
    );
  }
}
```

**Step 4: Verify session-start.js still parses and contains new functions**

```bash
node --check scripts/session-start.js && echo "syntax OK"
node -e "const f=require('fs').readFileSync('scripts/session-start.js','utf-8'); console.log('isWikiStale:', (f.match(/isWikiStale/g)||[]).length, 'refs'); console.log('split recovery:', f.includes('split-in-progress'))"
```
Expected: syntax OK, isWikiStale 2+ refs, split recovery true.
Note: `node --check` (syntax check only) avoids executing `main()` which session-start.js calls at top level.

**Step 5: Commit**

```bash
git add scripts/session-start.js
git commit -m "feat(sprint9): add wiki staleness + split recovery to SessionStart"
```

---

## Batch 3: Agents & Commands (Builder, Discover, Architect, Validate, Sweep Contract-Drift)

These are markdown file updates — adding sections to existing agents and commands.

### Task 10: Update builder.md with wiki reading + decision marker writing

**Files:**
- Modify: `agents/builder.md`

Read design doc lines 360-382 for the full specification.

**Step 1: Add wiki-informed building section**

After the existing "Research Integration" section (or after the pre-build spec challenge section), add a new section:

```markdown
## Wiki-Informed Building (Sprint 9 — MEDIUM/LARGE only)

**Skip this section entirely for SMALL tier projects.**

Before implementation, read existing knowledge:
1. **Always read spec constraints directly** — the spec is your primary source of conventions, regardless of wiki state.
2. Read `.forgeplan/wiki/rules.md` if it exists — supplementary context about inferred patterns and conventions from prior builds. If empty or missing, skip (not an error).
3. Read `.forgeplan/wiki/nodes/[dep-node].md` for each dependency node — understand decisions and past issues that may affect your implementation.

**If wiki doesn't exist or pages are empty** (first build, before any sweep), use spec constraints as the sole source of conventions. Wiki is supplementary context, never the primary source and never a gate.

**During sequential builds** (before any sweep), wiki pages contain only real-time PostToolUse data (decision markers). rules.md will be empty until compile-wiki.js runs at first sweep. This is expected — the spec is your primary source.
```

**Step 2: Add decision marker writing rules**

After the existing anchor comment rules, add:

```markdown
## Decision Markers (Sprint 9)

When making non-obvious technical choices during implementation, write `@forgeplan-decision` markers:

Format: `// @forgeplan-decision: D-[node]-[N]-[slug] -- [one-line description]`

Where:
- `[node]` is the current node ID
- `[N]` is a sequential integer (1, 2, 3...)
- `[slug]` is a kebab-case identifier
- `--` is ASCII double-hyphen (not em-dash)

Example:
```typescript
// @forgeplan-decision: D-auth-1-session-storage -- Database sessions. Why: need server-side revocation for security compliance
```

Write at minimum 1 decision marker per node for the most significant architectural choice. Write more for additional non-obvious decisions. These feed the knowledge tree — compile-wiki.js reads them to build decisions.md.

**Do NOT manually write `@forgeplan-pattern` or `@forgeplan-rule` markers.** Patterns and rules are inferred automatically by compile-wiki.js from spec constraints and code analysis.
```

**Step 3: Verify by reading the updated file**

Read `agents/builder.md` and confirm both sections are present, clear, and tier-gated.

**Step 4: Commit**

```bash
git add agents/builder.md
git commit -m "feat(sprint9): add wiki reading + decision markers to builder agent"
```

---

### Task 11: Update discover.md with wiki initialization

**Files:**
- Modify: `commands/discover.md`

Read design doc lines 158-172 for wiki initialization specification.

**Step 1: Add wiki initialization step**

AFTER state.json bootstrap in discover.md (state.json is initialized at discover.md line 221 — wiki init MUST come after this), add a wiki initialization section:

```markdown
## Wiki Initialization (Sprint 9 — MEDIUM/LARGE only)

**Skip for SMALL tier projects.**

After manifest, skeleton specs, AND state.json are created (this step must come AFTER state.json bootstrap at line 221):

1. Check if `.forgeplan/wiki/discovery-index.md` already exists (from large-document discovery). If so, preserve it — it will be incorporated into wiki/index.md by compile-wiki.js.
2. Create the wiki skeleton directly (do NOT run compile-wiki.js here — it would no-op or create partial state during discovery's own bootstrap):
   - Create `.forgeplan/wiki/` and `.forgeplan/wiki/nodes/` directories
   - Create `index.md` with project name, tier, tech stack from manifest
   - Create empty `decisions.md` ("# Architectural Decisions\n")
   - Create `rules.md` from spec constraints if specs exist, otherwise empty ("# Rules & Patterns\n")
   - Create `nodes/[node-id].md` skeleton per manifest node ("# Node: [id]\n")
3. compile-wiki.js will do a full compilation on the first sweep — the skeleton is just a placeholder until then.
```

**Step 2: Commit**

```bash
git add commands/discover.md
git commit -m "feat(sprint9): add wiki initialization to discover command"
```

---

### Task 12: Add split mode to architect.md

**Files:**
- Modify: `agents/architect.md`

Read design doc lines 420-432 for split mode specification.

**Step 1: Add split mode section**

After the existing decomposition rules section, add:

```markdown
## Node Split Mode (Sprint 9)

When invoked with `--split [node-id]`, operate in **split mode** — this is code analysis, NOT discovery.

### Analysis Steps
1. Read the existing node spec from `.forgeplan/specs/[node-id].yaml`
2. Glob the node's `file_scope` to get file list
3. Analyze code structure:
   - **Directory groupings:** `src/auth/` vs `src/api/` vs `src/database/` → natural boundaries
   - **Import clusters:** files that import each other heavily belong together (scan `import` and `require()` statements)
   - **Domain boundaries:** auth logic vs business logic vs data access
4. Assess: how many ACs, how many responsibilities, how many files?
5. Propose split with reasoning using the Split Proposal Template below

### Split Proposal Template

Present this structured proposal to the user:

Present this structured proposal to the user:

```
## Split Proposal: [node-id] → [child-1], [child-2], ...

### Current State
- Files: [count]
- ACs: [count]
- Responsibilities: [list of concerns found in the code]

### Proposed Split

**[child-1]: [name]**
- File scope: [glob pattern]
- Files: [count]
- ACs: [list] (from @forgeplan-spec markers in code files)
- Depends on: [traced from import statements]
- Connects to: [traced from exports consumed by other nodes]
- split_from: [parent-id]

**[child-2]: [name]**
- [same structure as above]

### Orphan Files (need assignment)
- [file] — used by both [child-1] and [child-2] (import analysis shows...)
  Options: assign to specific child / create shared node / move to lib/

### Consequence
- Node count: [before] → [after] (total project: [total])
- Tier impact: Current tier [TIER]. You now have [N] nodes.
  Would you like to reassess complexity? [NEXT_TIER] governance adds: [consequences].
  (Node count is a signal, not a formula — your project may still be [TIER]
  if the domain complexity hasn't changed.)
- Mandatory: /forgeplan:integrate after split

Confirm? [Y/n/modify]
```

### Rules
- Tier upgrade is ADVISORY, not a hard threshold — present consequences, let user decide
- AC assignment uses @forgeplan-spec markers in code to distribute ACs to children
- Dependency redistribution traces import/require() statements (static only, V1)
- Orphan files (not cleanly assignable): present to user with import analysis
- split_from field added to each child node in manifest
```

**Step 2: Commit**

```bash
git add agents/architect.md
git commit -m "feat(sprint9): add split mode to architect agent"
```

---

### Task 13: Update validate-manifest.js with split_from validation

**Files:**
- Modify: `scripts/validate-manifest.js`

Read design doc lines 583-586 for validation rules.

**Step 1: Add node ID format validation + split_from type check INSIDE the per-node loop**

Inside the existing `for (const nodeId of nodeIds)` loop (lines 80-99), add after the existing field checks (around line 98, before the loop's closing brace):

```javascript
    // Sprint 9: Node ID format validation (defense-in-depth for wiki file paths)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(nodeId)) {
      errors.push(`Node "${nodeId}": node ID must be alphanumeric with hyphens/underscores, starting with a letter or digit.`);
    }

    // Sprint 9: split_from type check
    if (node.split_from) {
      if (typeof node.split_from !== "string") {
        errors.push(`Node "${nodeId}": split_from must be a string if present.`);
      }
    }
```

**Step 2: Add sibling overlap check OUTSIDE the per-node loop**

After the per-node loop closes (after line 99), add a new section. Uses the existing `scopesOverlap()` function (already defined around line 268 in validate-manifest.js) for real glob overlap detection, not just string equality:

```javascript
// Sprint 9: sibling consistency check — split siblings must not have overlapping file_scopes
const splitGroups = {};
for (const nid of nodeIds) {
  const n = manifest.nodes[nid];
  if (n.split_from) {
    if (!splitGroups[n.split_from]) splitGroups[n.split_from] = [];
    splitGroups[n.split_from].push({ id: nid, file_scope: n.file_scope });
  }
}
for (const [parent, siblings] of Object.entries(splitGroups)) {
  for (let i = 0; i < siblings.length; i++) {
    for (let j = i + 1; j < siblings.length; j++) {
      // Use existing scopesOverlap() function for real glob overlap detection
      if (scopesOverlap(siblings[i].file_scope, siblings[j].file_scope)) {
        errors.push(
          `Nodes "${siblings[i].id}" and "${siblings[j].id}" (both split from "${parent}") have overlapping file_scopes: "${siblings[i].file_scope}" and "${siblings[j].file_scope}".`
        );
      }
    }
  }
}
```

**Step 3: Verify validate-manifest.js runs on existing manifest**

Run: `node scripts/validate-manifest.js`
Expected: No new errors (existing manifests don't have split_from)

**Step 4: Commit**

```bash
git add scripts/validate-manifest.js
git commit -m "feat(sprint9): add split_from validation to validate-manifest"
```

---

### Task 14: Update sweep-contract-drift.md with decision marker check

**Files:**
- Modify: `agents/sweep-contract-drift.md`

Read design doc lines 389-390 for the check specification.

**Step 1: Add decision marker density check**

Add to the agent's check list:

```markdown
## Decision Marker Coverage (Sprint 9)

For each node, grep all files in the node's file_scope for `@forgeplan-decision` markers.

If a node has **0 decision markers**, emit a finding:
- **Finding:** "Node [id] has no @forgeplan-decision markers. Consider annotating significant architectural choices for the knowledge graph."
- **Confidence:** 60 (advisory, not blocking)
- **Category:** documentation
- **File:** [any file in the node's file_scope]
```

**Step 2: Commit**

```bash
git add agents/sweep-contract-drift.md
git commit -m "feat(sprint9): add decision marker density check to contract-drift agent"
```

---

## Batch 4: Split Command + Recovery + Integration

### Task 15: Create /forgeplan:split command

**Files:**
- Create: `commands/split.md`

Read design doc lines 407-590 for the full specification.

**Step 1: Write the split command**

```markdown
---
description: Decompose a built node into finer-grained nodes while preserving code, state, and enforcement integrity
user-invocable: true
argument-hint: "[node-id]"
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# /forgeplan:split [node-id]

## Prerequisites

Before splitting, verify ALL of these:
1. Read `.forgeplan/state.json` — target node must be in status: `built`, `reviewed`, or `revised`
2. No `active_node` set (no build/review in progress)
3. No `sweep_state.operation` active (no sweep running)
4. Node must have code files (can't split a `specced` node — nothing to analyze)
5. No existing `.forgeplan/.split-in-progress.json` — if one exists, a previous split was interrupted. Run `/forgeplan:recover` first to resume or rollback before starting a new split.

If any prerequisite fails, explain which one and stop.

## Process

### Step 1: Invoke Architect in Split Mode

Dispatch the architect agent with `--split [node-id]` argument. The architect:
1. Reads the node's spec from `.forgeplan/specs/[node-id].yaml`
2. Globs the node's `file_scope` to get file list
3. Analyzes code structure: directory groupings, import clusters, domain boundaries
4. Proposes a split using this template:

```
## Split Proposal: [node-id] → [child-1], [child-2], ...

### Current State
- Files: [count]
- ACs: [count]
- Responsibilities: [list]

### Proposed Split

**[child-1]: [name]**
- File scope: [glob]
- Files: [count]
- ACs: [list] (from @forgeplan-spec markers in code)
- Depends on: [list]
- Connects to: [list]
- split_from: [parent-id]

**[child-2]: [name]**
- [same structure]

### Orphan Files (need assignment)
- [files used by multiple children — present to user for assignment]

### Consequence
- Node count: [before] → [after]
- Tier impact: [advisory — present consequences, let user decide]
- Mandatory: /forgeplan:integrate after split

Confirm? [Y/n/modify]
```

Wait for user confirmation. If rejected, ask what to modify.

### Step 2: Pre-validate

Write the hypothetical new manifest to a temp file (`.forgeplan/.manifest-split-check.yaml`), then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.js" .forgeplan/.manifest-split-check.yaml`. Delete the temp file after validation. If validation fails, show errors and stop. Note: validate-manifest.js only accepts a file path (line 12), not in-memory YAML.

### Step 3: Write Recovery Breadcrumb

Before making any file changes, write `.forgeplan/.split-in-progress.json`:
```json
{
  "parent_node_id": "[node-id]",
  "child_nodes": ["[child-1]", "[child-2]"],
  "started_at": "[ISO timestamp]",
  "before_images": {
    "manifest_yaml": "[full manifest YAML before split]",
    "state_json": "[full state JSON before split]",
    "parent_spec_path": ".forgeplan/specs/[node-id].yaml",
    "parent_spec_content": "[full spec YAML]"
  },
  "planned_changes": {
    "specs": [{"path": ".forgeplan/specs/[child].yaml", "content": "..."}],
    "manifest_yaml": "[new manifest YAML]",
    "state_updates": {"[child]": {"status": "built"}}
  },
  "completed_steps": []
}
```

### Step 4: Execute (marking each step in completed_steps)

a. Write new spec files for each child node → mark "specs" in completed_steps
b. Write new manifest (atomic: write to .tmp, rename) → mark "manifest"
c. Update state.json: create entries for children (status: "built"), remove parent → mark "state"
   Note: `split_from` is a MANIFEST-only field (written in step b). Do NOT write split_from to state.json — that would create two sources of truth.
d. Update wiki: create child node pages, archive parent page (MEDIUM/LARGE only) → mark "wiki"

### Step 5: Clean Up

Delete `.forgeplan/.split-in-progress.json`.

### Step 6: Output

```
Split complete: [parent] → [child-1], [child-2]

Next steps:
  1. /forgeplan:review [child-1]     Review the [child-1] node
  2. /forgeplan:review [child-2]     Review the [child-2] node
  3. /forgeplan:integrate             Verify cross-node interfaces

Note: The parent node "[parent]" no longer exists. Use child node IDs for all commands.
```
```

**Step 2: Commit**

```bash
git add commands/split.md
git commit -m "feat(sprint9): create /forgeplan:split command"
```

---

### Task 16: Add split recovery to recover.md

**Files:**
- Modify: `commands/recover.md`

Read design doc lines 543-554 for recovery specification.

**Step 1: Wire split recovery into recover.md's entry flow**

The current recover.md routing (line 12) checks state.json for stuck builds and interrupted sweeps. Split recovery needs to be added to this routing logic BEFORE the existing checks, since a split-in-progress takes priority (the project state is inconsistent until the split is resolved).

At the TOP of recover.md's process section (around line 12, before the existing "Check for stuck builds" logic), add:

```markdown
## Step 0: Check for interrupted split (Sprint 9)

Before checking for stuck builds or interrupted sweeps, check for an interrupted node split:

If `.forgeplan/.split-in-progress.json` exists:
  → This takes priority over all other recovery. The manifest/state may be inconsistent.
  → Present the split recovery options below, then stop (do not proceed to build/sweep recovery).
```

Then add the full split recovery section:

```markdown
## Split Recovery (Sprint 9)

If `.forgeplan/.split-in-progress.json` exists, a previous split was interrupted.

### Detection
Read the breadcrumb file and display:
- Parent node ID and child node IDs
- Started timestamp
- Completed steps vs remaining steps

### Resume
1. Write breadcrumb's `planned_changes.manifest_yaml` to a temp file, then re-validate via `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.js" [temp-file-path]`
2. If valid: replay only steps NOT in `completed_steps` (idempotency: check if artifact already exists before writing)
3. If invalid: offer rollback instead

### Rollback
1. Restore from `before_images`: write back original manifest, state, and spec
2. Delete any child specs that were created
3. Remove `.forgeplan/.split-in-progress.json` breadcrumb
```

**Step 2: Commit**

```bash
git add commands/recover.md
git commit -m "feat(sprint9): add split recovery branch to recover command"
```

---

### Task 17: Update sweep.md with wiki compilation phases

**Files:**
- Modify: `commands/sweep.md`

Read design doc lines 931-970 for the sweep integration specification.

**Step 1: Add compile-wiki.js at Phase 1 step 7**

After existing Phase 1 step 6 ("set active_node to null"), add:

```markdown
7. **Compile wiki** (Sprint 9, MEDIUM/LARGE only):
   Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/compile-wiki.js"` to build knowledge base before dispatching agents.
   Skip for SMALL tier.
```

**Step 2: Modify Phase 2 dispatch for ALL passes**

In the agent dispatch section, add wiki-aware dispatch for BOTH pass 1 and pass 2+:

```markdown
**Pass 1 dispatch (Sprint 9, MEDIUM/LARGE only):**
- Agents receive: ALL source files (existing behavior) PLUS wiki node pages (decisions + past findings) if wiki exists.
  Wiki node pages provide context from prior sweeps — decisions made, issues found and fixed.
  Do NOT send wiki/rules.md to sweep agents (trust boundary). Sweep-adversarial is the exception (see below).

**Pass 2+ dispatch optimization (Sprint 9):**
- Agents receive: wiki NODE pages (decisions + past findings, NOT rules.md) + source files modified since last pass (from `sweep_state.modified_files_by_pass[String(pass-1)]`) + source files referenced by any PENDING finding for the agent's category
- Agents still have Read/Grep tools for on-demand source inspection
- Exception: sweep-adversarial (Red Team, Opus) ALWAYS receives full source on every pass AND receives `wiki/rules.md` specifically to AUDIT it for dangerous rules (per trust boundary — adversarial is the only sweep agent that sees rules.md)
- Convergence: do NOT retire an agent if its category still has pending findings in sweep_state. Only count a clean pass when agent returns CLEAN AND zero pending findings in its category.
```

**Step 3: Add compile-wiki.js at Phase 7 step 4**

After existing Phase 7 step 3 ("clean worktrees"), add:

```markdown
4. **Compile wiki** (Sprint 9, MEDIUM/LARGE only):
   Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/compile-wiki.js"` to update wiki for next session.
   Skip for SMALL tier.
5. Clear sweep_state, present results (renumbered from old step 4-5)
```

**Step 4: Commit**

```bash
git add commands/sweep.md
git commit -m "feat(sprint9): add wiki compilation to sweep phases"
```

---

### Task 18: Update guide.md with wiki-informed recommendations

**Files:**
- Modify: `commands/guide.md`

Read design doc lines 678-720 for the guide enhancement specification.

**Step 1: Add wiki-informed recommendation triggers**

In the guide's state assessment logic, add new triggers (MEDIUM/LARGE only):

```markdown
### Wiki-Informed Recommendations (Sprint 9 — MEDIUM/LARGE only)

After checking standard state conditions, if wiki exists:

| Signal | Threshold | Recommendation |
|--------|-----------|----------------|
| Recurring findings in same category | >3 findings, same category, across 2+ passes | "Persistent [category] issues. Consider adding a spec constraint or refactoring the pattern." |
| High file count in node | >20 files in single node's file_scope | "Node [id] has [N] files. Consider /forgeplan:split [id] for finer governance." |
| High finding density | >15 findings per node in single sweep pass | "High finding density on [id] suggests more decomposition needed. Current tier: [tier]." |
| Stale wiki | wiki_last_compiled older than last state change | "Knowledge base is stale. Will refresh on next sweep, or run compile-wiki.js manually." |
```

**Step 2: Add sweep-complete wiki section**

After the "all reviewed" state (around line 237 in guide.md, after the step that mentions sweep), add:

```markdown
### Sweep complete, wiki available (MEDIUM/LARGE only)
Check: sweep completed AND wiki pages exist AND tier !== "SMALL"

Knowledge base has been compiled from your sweep results.

  Review your project's knowledge:
  → Read .forgeplan/wiki/decisions.md      Architectural decisions with context
  → Read .forgeplan/wiki/rules.md          Inferred conventions from specs and code

  Next actions:
  → /forgeplan:revise [node]     Make improvements based on patterns
  → /forgeplan:deep-build        Run another sweep cycle
  → /forgeplan:split [node]      Decompose a node if findings suggest it
```

**Step 3: Commit**

```bash
git add commands/guide.md
git commit -m "feat(sprint9): add wiki-informed recommendations to guide"
```

---

### Task 19: Update deep-build.md with renumbered phases + wiki compilation

**Files:**
- Modify: `commands/deep-build.md`

Read design doc lines 972-986 for the deep-build phase renumbering.

**Step 1: Renumber phases to sequential integers and add wiki compilation**

Update the phase diagram. IMPORTANT: When deep-build invokes sweep, it skips sweep's Phase 1 initialization (sweep.md line 26). This means sweep's compile-wiki.js at Phase 1 step 7 does NOT run during deep-build. Deep-build must own compile-wiki.js invocation directly:

```
Phase 1: Initialize
Phase 2: Build all nodes (per tier)
  Final step: Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/compile-wiki.js"` after all builds complete (MEDIUM/LARGE only)
  NOTE: This is the ONLY compile-wiki invocation on the deep-build path — sweep skips Phase 1 when invoked from deep-build.
Phase 3: Verify-runnable (Phase A) [was Phase 2.5]
Phase 4: Integration check [was Phase 3]
Phase 5: Claude sweep — sweep's Phase 7 finalization will run compile-wiki.js again [was Phase 4]
Phase 6: Runtime verification (Phase B, MEDIUM/LARGE only) [was Phase 4.5]
Phase 7: Cross-model verification (tier-aware) [was Phase 5]
Phase 8: Final report + verify-runnable + certification [was Phase 6]
```

**Step 2: Commit**

```bash
git add commands/deep-build.md
git commit -m "feat(sprint9): renumber deep-build phases + add wiki compilation"
```

---

### Task 20: Update compact-context.js with wiki decisions (excluding rules.md)

**Files:**
- Modify: `scripts/compact-context.js`

Read design doc line 812 for the specification. CRITICAL: exclude rules.md per trust boundary.

**Step 1: Add wiki decisions to saved context**

Add as a new independent section AFTER the state summary section (around line 155) and BEFORE the enforcement reminders section (around line 157). Do NOT insert inside the manifest try block at line 73 — wiki decisions are independent of manifest parsing:

```javascript
// Sprint 9: Wiki decisions (EXCLUDE rules.md — trust boundary enforcement)
const wikiDecisionsPath = path.join(forgePlanDir, "wiki", "decisions.md");
if (fs.existsSync(wikiDecisionsPath)) {
  const decisions = fs.readFileSync(wikiDecisionsPath, "utf-8");
  if (decisions.trim()) {
    sections.push("## Architectural Decisions (from wiki)");
    sections.push(decisions.substring(0, 2000)); // Cap at 2KB
    sections.push("");
  }
}
// NOTE: Do NOT include rules.md here — sweep agents must not receive rules
// through context restoration. Rules.md is only for the builder.
```

**Step 2: Verify compact-context.js still parses and does NOT include rules.md**

```bash
node --check scripts/compact-context.js && echo "syntax OK"
node -e "const f=require('fs').readFileSync('scripts/compact-context.js','utf-8'); console.log('decisions.md included:', f.includes('decisions.md')); console.log('rules.md NOT loaded:', !f.includes('readFileSync') || !f.match(/readFileSync.*rules\.md/))"
```
Expected: syntax OK, decisions.md included true, rules.md NOT loaded true.
Note: The code may contain `rules.md` in a comment (the "do NOT include" warning) — that's fine. What matters is that `readFileSync` is never called on `rules.md`. The check verifies no `readFileSync(...rules.md...)` pattern exists.
Note: `node --check` avoids executing the script (which calls `process.exit(2)` without `--pre`/`--post` args).

**Step 3: Commit**

```bash
git add scripts/compact-context.js
git commit -m "feat(sprint9): add wiki decisions to compact context (exclude rules.md)"
```

---

## Final Verification

### Task 21: End-to-end verification

**Step 1: Run validate-manifest on existing manifest**

```bash
node scripts/validate-manifest.js
```
Expected: No new errors from Sprint 9 changes.

**Step 2: Run session-start.js to verify wiki status display**

```bash
node scripts/session-start.js
```
Expected: Should show wiki status (not initialized, stale, etc.) without errors.

**Step 3: Run compile-wiki.js**

```bash
node scripts/compile-wiki.js
```
Expected: Either creates wiki/ for MEDIUM/LARGE project, or skips for SMALL, or gracefully handles no manifest.

**Step 4: Verify all hook scripts parse without syntax errors**

```bash
node --check scripts/post-tool-use.js && echo "post-tool-use: OK"
node --check scripts/session-start.js && echo "session-start: OK"
node --check scripts/stop-hook.js && echo "stop-hook: OK"
node --check scripts/pre-tool-use.js && echo "pre-tool-use: OK"
node --check scripts/compact-context.js && echo "compact-context: OK"
```
Expected: All print "OK". Uses `--check` (syntax only) because these scripts read from stdin or call `process.exit()` at top level — `require()` would hang or execute them. Each command on a separate line (no bash `for` loop — may not work in all Windows shells).

**Step 5: Read all modified agent/command files and verify they have Sprint 9 sections**

- `agents/builder.md` — has "Wiki-Informed Building" and "Decision Markers" sections
- `agents/architect.md` — has "Node Split Mode" section
- `agents/sweep-contract-drift.md` — has "Decision Marker Coverage" section
- `commands/discover.md` — has "Wiki Initialization" section
- `commands/guide.md` — has "Wiki-Informed Recommendations" section
- `commands/sweep.md` — has Phase 1 step 7, Phase 2 pass 2+ optimization, Phase 7 step 4
- `commands/deep-build.md` — phases renumbered 1-8
- `commands/split.md` — exists with full split flow
- `commands/recover.md` — has split recovery branch

**Step 6: Final commit (stage specific files only)**

```bash
git status  # Review what changed — should only be Sprint 9 files
# Stage only Sprint 9 files (never use git add -A):
git add scripts/lib/ scripts/compile-wiki.js scripts/post-tool-use.js scripts/session-start.js scripts/stop-hook.js scripts/pre-tool-use.js scripts/validate-manifest.js scripts/compact-context.js templates/schemas/ agents/builder.md agents/architect.md agents/sweep-contract-drift.md commands/split.md commands/discover.md commands/guide.md commands/sweep.md commands/deep-build.md commands/recover.md
git commit -m "feat(sprint9): end-to-end verification pass"
```

---

## Summary

| Batch | Tasks | Files | Description |
|-------|-------|-------|-------------|
| 1: Foundation | 1-5 | 6 files | Schema, utility, whitelist |
| 2: Wiki Engine | 6-9 | 4 files | compile-wiki, wiki-builder, PostToolUse, SessionStart |
| 3: Agents & Commands | 10-14 | 5 files | Builder, Discover, Architect, Validate, Contract-drift |
| 4: Split & Integration | 15-20 | 6 files | Split command, Recovery, Sweep, Guide, Deep-build, Compact |
| Verification | 21 | 0 files | End-to-end check |

**Total: 21 tasks, 5 new files, ~18 modified files, ~550 new lines of code.**

**Critical path:** Task 6 (wiki-builder.js) → Task 7 (compile-wiki.js) → Task 17 (sweep integration). Everything else can proceed in parallel after Batch 1.
