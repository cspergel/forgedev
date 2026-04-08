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

// C3 fix: Graceful JSON parse with structured error output
let mapping;
try {
  let raw = fs.readFileSync(inputPath, "utf-8");
  // Strip markdown fences if present
  raw = raw.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "");
  mapping = JSON.parse(raw);
} catch (e) {
  console.log(JSON.stringify({
    status: "ERROR",
    message: `Invalid JSON input: ${e.message}`,
    total_checks: 0,
    passed: 0,
    failed: 0,
    checks: [],
  }, null, 2));
  process.exit(2);
}

const cwd = process.cwd();
const checks = [];

// C1 fix: Normalize paths for case-insensitive comparison on Windows
// Also ensure trailing separator to prevent C:\repo matching C:\repo-other
const normPath = (s) => process.platform === "win32" ? s.toLowerCase() : s;
const normCwd = normPath(path.resolve(cwd) + path.sep);

// Helper: resolve scope dir from file_scope glob
const resolveScopeDir = (fileScope) => {
  const scopeDir = fileScope.replace(/\*\*.*$/, "").replace(/\/+$/, "");
  return { scopeDir, absDir: path.resolve(cwd, scopeDir) };
};

// Check 0 (C2 fix): Validate all scopes are within project root FIRST
for (const node of (mapping.proposed_nodes || [])) {
  const { scopeDir, absDir } = resolveScopeDir(node.file_scope);
  if (!normPath(absDir + path.sep).startsWith(normCwd) && normPath(absDir) !== normPath(path.resolve(cwd))) {
    checks.push({
      name: "scope_within_project",
      node: node.id,
      status: "FAIL",
      details: `${scopeDir} resolves to ${absDir} (outside project root)`,
    });
  } else {
    checks.push({
      name: "scope_within_project",
      node: node.id,
      status: "PASS",
      details: "within project",
    });
  }
}

// Early exit if any scope escapes project root
const escapeFailures = checks.filter(c => c.name === "scope_within_project" && c.status === "FAIL");
if (escapeFailures.length > 0) {
  console.log(JSON.stringify({
    status: "FAIL",
    message: "Scope escapes project root — aborting remaining checks",
    total_checks: checks.length,
    passed: checks.filter(c => c.status === "PASS").length,
    failed: escapeFailures.length,
    checks,
  }, null, 2));
  process.exit(1);
}

// Check 1: Every proposed node directory exists
for (const node of (mapping.proposed_nodes || [])) {
  const { scopeDir, absDir } = resolveScopeDir(node.file_scope);
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
  const { scopeDir, absDir } = resolveScopeDir(node.file_scope);
  if (fs.existsSync(absDir)) {
    try {
      const realPath = fs.realpathSync(absDir);
      const escapes = !normPath(realPath + path.sep).startsWith(normCwd) && normPath(realPath) !== normPath(path.resolve(cwd));
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

// Check 3: No existing .forgeplan/ content beyond our mapping file (unless --force)
// Ingest Step 0 creates .forgeplan/ for the mapping file, so the directory itself is expected.
// Check for ANY content beyond .ingest-mapping.json — manifest.yaml, state.json, specs/, etc.
const forceFlag = process.argv.includes("--force");
const forgePlanDir = path.join(cwd, ".forgeplan");
let hasExistingContent = false;
if (fs.existsSync(forgePlanDir)) {
  try {
    const entries = fs.readdirSync(forgePlanDir);
    hasExistingContent = entries.some(e => e !== ".ingest-mapping.json");
  } catch (_) {}
}
if (hasExistingContent && !forceFlag) {
  checks.push({
    name: "no_existing_forgeplan",
    node: "project",
    status: "FAIL",
    details: ".forgeplan/ contains existing project files. Use --force to re-ingest.",
  });
} else {
  checks.push({ name: "no_existing_forgeplan", node: "project", status: "PASS", details: forceFlag ? "forced" : "clean" });
}

// Check 4: No scope covers >60% of total source files
// I4 fix: exclude .forgeplan/ from counts
const EXCLUDE_DIRS = ["node_modules", "dist", "build", ".next", ".git", ".forgeplan"];
const countFilesIn = (dir) => {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (EXCLUDE_DIRS.includes(entry.name)) continue;
      if (entry.isDirectory()) count += countFilesIn(path.join(dir, entry.name));
      else count++;
    }
  } catch (_) {}
  return count;
};

const totalFiles = countFilesIn(cwd);

for (const node of (mapping.proposed_nodes || [])) {
  const { absDir } = resolveScopeDir(node.file_scope);
  const nodeFiles = fs.existsSync(absDir) ? countFilesIn(absDir) : 0;
  const pct = totalFiles > 0 ? Math.round(nodeFiles / totalFiles * 100) : 0;
  checks.push({
    name: "scope_breadth",
    node: node.id,
    status: pct > 60 ? "FAIL" : "PASS",
    details: `${nodeFiles}/${totalFiles} files (${pct}%)`,
  });
}

// Check 5: Claimed shared types exist and are imported by 3+ files
// C4 fix: use import-specific pattern, exclude definition file from count
for (const model of (mapping.shared_models || [])) {
  let definitionFile = null;
  let importCount = 0;
  const escaped = model.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const typePattern = new RegExp(`\\b(type|interface|class)\\s+${escaped}\\b`);
  const importPattern = new RegExp(`(?:import|require).*\\b${escaped}\\b`);
  const walk = (dir) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (EXCLUDE_DIRS.includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.match(/\.[jt]sx?$/)) continue;
        try {
          const content = fs.readFileSync(full, "utf-8");
          if (typePattern.test(content)) definitionFile = full;
          if (importPattern.test(content) && full !== definitionFile) importCount++;
        } catch (_) {}
      }
    } catch (_) {}
  };
  walk(cwd);
  checks.push({
    name: "shared_type_exists",
    node: model.name,
    status: definitionFile ? "PASS" : "FAIL",
    details: definitionFile ? `Type/interface ${model.name} found` : `Type/interface ${model.name} not found in codebase`,
  });
  checks.push({
    name: "shared_type_usage",
    node: model.name,
    status: importCount >= 3 ? "PASS" : "FAIL",
    details: `${model.name} imported in ${importCount} files (need 3+)`,
  });
}

// Check 6: No scope overlaps between proposed nodes
const nodes = mapping.proposed_nodes || [];
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    // Normalize: strip **, ensure trailing /
    const a = nodes[i].file_scope.replace(/\*\*$/, "").replace(/\/?$/, "/");
    const b = nodes[j].file_scope.replace(/\*\*$/, "").replace(/\/?$/, "/");
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
