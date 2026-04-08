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
const countFilesIn = (dir, exclude) => {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if ((exclude || ["node_modules", "dist", "build", ".next", ".git"]).includes(entry.name)) continue;
      if (entry.isDirectory()) count += countFilesIn(path.join(dir, entry.name), exclude);
      else count++;
    }
  } catch (_) {}
  return count;
};

const totalFiles = countFilesIn(cwd);

for (const node of (mapping.proposed_nodes || [])) {
  const scopeDir = node.file_scope.replace(/\*\*.*$/, "").replace(/\/+$/, "");
  const absDir = path.resolve(cwd, scopeDir);
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
for (const model of (mapping.shared_models || [])) {
  let found = false;
  let importCount = 0;
  const escaped = model.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
const nodes = mapping.proposed_nodes || [];
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
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
