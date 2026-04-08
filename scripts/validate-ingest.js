#!/usr/bin/env node
// scripts/validate-ingest.js
// Validates Translator's repo mapping against actual filesystem.
// Input: JSON file path (Translator output)
// Output: JSON report to stdout with PASS/FAIL per check
"use strict";
const fs = require("fs");
const path = require("path");
const { minimatch } = require(path.join(__dirname, "..", "node_modules", "minimatch"));

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
const projectRoot = path.resolve(cwd);
const normProjectRoot = normPath(projectRoot);
const normCwd = normPath(projectRoot + path.sep);
const EXCLUDE_DIRS = ["node_modules", "dist", "build", ".next", ".git", ".forgeplan"];

const isWithinProject = (candidate) => {
  const resolved = path.resolve(candidate);
  const normalized = normPath(resolved);
  return normalized === normProjectRoot || normalized.startsWith(normCwd);
};

// Helper: resolve scope dir from file_scope glob
// Glob-aware: extract the non-glob base directory (everything before the first
// path segment containing *, ?, {, or [). For example:
//   "packages/*/src/**/*.ts" → "packages"
//   "src/auth/**"            → "src/auth"
//   "src/**/*.ts"            → "src"
//   "**/*.ts"                → "."
const resolveScopeDir = (fileScope) => {
  const normalized = fileScope.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const baseSegments = [];
  for (const seg of segments) {
    if (/[*?{\[]/.test(seg)) break;
    baseSegments.push(seg);
  }
  const scopeDir = baseSegments.length > 0 ? baseSegments.join("/") : ".";
  return { scopeDir, absDir: path.resolve(cwd, scopeDir) };
};

function generateCrossPaths(globA, globB) {
  const paths = [];
  const segsA = globA.split("/").filter((s) => !s.includes("*"));
  const segsB = globB.split("/").filter((s) => !s.includes("*"));
  const expandWith = (glob, literals) => {
    const results = [];
    for (const lit of literals) {
      let expanded = glob.replace(/\*\*/g, lit).replace(/\*/g, lit);
      results.push(expanded, expanded + "/file.ts");
      expanded = glob.replace(/\*\*/g, lit + "/sub").replace(/\*/g, lit);
      results.push(expanded);
    }
    return results;
  };
  paths.push(...expandWith(globA, segsB));
  paths.push(...expandWith(globB, segsA));
  return paths;
}

function generateTestPaths(glob) {
  const norm = glob.replace(/\\/g, "/");
  const paths = [];
  const withDepth = norm.replace(/\*\*/g, "sub/deep");
  const concrete = withDepth.replace(/\*/g, "example");
  paths.push(concrete, concrete + "/file.ts");
  const base = norm.replace(/\*\*.*$/, "").replace(/\*.*$/, "").replace(/\/$/, "");
  if (base) {
    paths.push(base + "/file.ts", base + "/sub/file.ts");
  }
  return paths;
}

function scopesOverlap(scopeA, scopeB) {
  const a = scopeA.replace(/\\/g, "/");
  const b = scopeB.replace(/\\/g, "/");
  const allPaths = [...generateTestPaths(a), ...generateTestPaths(b), ...generateCrossPaths(a, b)];
  return allPaths.some((testPath) => minimatch(testPath, a) && minimatch(testPath, b));
}

// Check 0 (C2 fix): Validate all scopes are within project root FIRST
for (const node of (mapping.proposed_nodes || [])) {
  const { scopeDir, absDir } = resolveScopeDir(node.file_scope);
  if (!isWithinProject(absDir)) {
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
      const escapes = !isWithinProject(realPath);
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

// Check 2b: nested symlinks/junctions inside a scope must also stay within the project root
function findNestedSymlinkEscape(rootDir) {
  const visited = new Set();
  const walk = (dir) => {
    // Resolve real path to detect cycles and junctions
    let resolvedDir;
    try {
      resolvedDir = normPath(fs.realpathSync(dir));
    } catch (_) {
      return { linkPath: dir, realPath: "unresolvable path — cannot verify" };
    }
    if (visited.has(resolvedDir)) return null; // cycle detection
    visited.add(resolvedDir);

    // Fail-closed: if we can't read a directory, assume it may contain escaping links
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === "EACCES" || err.code === "EPERM") {
        return { linkPath: dir, realPath: `permission denied — cannot verify (${err.code})` };
      }
      return null;
    }
    for (const entry of entries) {
      if (EXCLUDE_DIRS.includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      let stat;
      try {
        stat = fs.lstatSync(fullPath);
      } catch (_) {
        continue;
      }
      if (stat.isSymbolicLink()) {
        try {
          const realPath = fs.realpathSync(fullPath);
          if (!isWithinProject(realPath)) {
            return { linkPath: fullPath, realPath };
          }
        } catch (err) {
          return { linkPath: fullPath, realPath: `unresolvable symlink (${err.message})` };
        }
        continue;
      }
      // Check directories (including NTFS junctions which report as directories, not symlinks)
      if (stat.isDirectory()) {
        try {
          const realPath = fs.realpathSync(fullPath);
          if (!isWithinProject(realPath)) {
            return { linkPath: fullPath, realPath: `${realPath} (junction/mount outside project)` };
          }
        } catch (_) {
          // Can't resolve — continue walking but it's suspicious
        }
        const nested = walk(fullPath);
        if (nested) return nested;
      }
    }
    return null;
  };
  return walk(rootDir);
}

for (const node of (mapping.proposed_nodes || [])) {
  const { scopeDir, absDir } = resolveScopeDir(node.file_scope);
  if (!fs.existsSync(absDir)) continue;
  const escapedLink = findNestedSymlinkEscape(absDir);
  checks.push({
    name: "no_nested_symlink_escape",
    node: node.id,
    status: escapedLink ? "FAIL" : "PASS",
    details: escapedLink
      ? `${escapedLink.linkPath} resolves to ${escapedLink.realPath} (outside project)`
      : "within project",
  });
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
// Finding 3 fix: count files matching the ACTUAL glob, not all files in the base directory
const countFilesIn = (dir, visited = new Set()) => {
  let count = 0;
  try {
    const resolved = normPath(fs.realpathSync(dir));
    if (visited.has(resolved)) return 0; // cycle detection (circular symlinks/junctions)
    visited.add(resolved);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (EXCLUDE_DIRS.includes(entry.name)) continue;
      if (entry.isDirectory()) count += countFilesIn(path.join(dir, entry.name), visited);
      else count++;
    }
  } catch (_) {}
  return count;
};

// Count files that actually match a glob pattern within a directory
const countFilesMatchingGlob = (dir, globPattern, visited = new Set()) => {
  let count = 0;
  try {
    const resolved = normPath(fs.realpathSync(dir));
    if (visited.has(resolved)) return 0;
    visited.add(resolved);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (EXCLUDE_DIRS.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += countFilesMatchingGlob(full, globPattern, visited);
      } else {
        // Test the file's relative path against the glob
        const relPath = path.relative(cwd, full).replace(/\\/g, "/");
        if (minimatch(relPath, globPattern)) count++;
      }
    }
  } catch (_) {}
  return count;
};

const totalFiles = countFilesIn(cwd);

for (const node of (mapping.proposed_nodes || [])) {
  const { absDir } = resolveScopeDir(node.file_scope);
  const globPattern = node.file_scope.replace(/\\/g, "/");
  // Count files matching the actual glob, not all files in the base directory
  const nodeFiles = fs.existsSync(absDir) ? countFilesMatchingGlob(absDir, globPattern) : 0;
  const pct = totalFiles > 0 ? Math.round(nodeFiles / totalFiles * 100) : 0;
  checks.push({
    name: "scope_breadth",
    node: node.id,
    status: pct > 60 ? "WARN" : "PASS",
    details: pct > 60
      ? `Node ${node.id} covers ${pct}% of project files (${nodeFiles}/${totalFiles}). Consider splitting into smaller nodes for better enforcement, or ignore if this is intentionally a broad-scope node.`
      : `${nodeFiles}/${totalFiles} files (${pct}%) matching ${node.file_scope}`,
  });
}

// Check 5: Claimed shared types exist and are imported/referenced by 2+ files
// C4 fix: use import-specific pattern, exclude definition file from count
// Supports JS/TS, Prisma, Drizzle, JSON Schema, YAML, Python dataclass/Pydantic
for (const model of (mapping.shared_models || [])) {
  let definitionFile = null;
  let definitionSource = null; // tracks which pattern matched (js, prisma, json-schema, etc.)
  let importCount = 0;
  const escaped = model.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // JS/TS patterns
  const typePattern = new RegExp(`\\b(type|interface|class)\\s+${escaped}\\b`);
  const importPattern = new RegExp(`(?:import|require).*\\b${escaped}\\b`);

  // Prisma pattern: model ModelName { ... }
  const prismaPattern = new RegExp(`^\\s*model\\s+${escaped}\\s*\\{`, "m");
  // Drizzle pattern: export const modelName = pgTable/mysqlTable/sqliteTable(...)
  const drizzlePattern = new RegExp(`\\b${escaped}\\b.*(?:pgTable|mysqlTable|sqliteTable|createTable)\\s*\\(`);
  // Python dataclass/Pydantic pattern: class ModelName(BaseModel): or @dataclass class ModelName:
  const pythonPattern = new RegExp(`(?:class\\s+${escaped}\\s*\\(|@dataclass[\\s\\S]*?class\\s+${escaped}\\b)`);

  const walkVisited = new Set();
  const walk = (dir) => {
    try {
      const resolved = normPath(fs.realpathSync(dir));
      if (walkVisited.has(resolved)) return; // cycle detection
      walkVisited.add(resolved);
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (EXCLUDE_DIRS.includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }

        // JS/TS files
        if (entry.name.match(/\.[jt]sx?$/)) {
          try {
            const stat = fs.statSync(full);
            if (stat.size > 1024 * 1024) continue; // skip files >1MB
            const content = fs.readFileSync(full, "utf-8");
            if (typePattern.test(content)) { definitionFile = full; definitionSource = "js/ts"; }
            if (drizzlePattern.test(content)) { definitionFile = full; definitionSource = "drizzle"; }
            if (importPattern.test(content) && full !== definitionFile) importCount++;
          } catch (_) {}
          continue;
        }

        // Prisma schema files
        if (entry.name === "schema.prisma" || entry.name.endsWith(".prisma")) {
          try {
            const stat = fs.statSync(full);
            if (stat.size > 1024 * 1024) continue;
            const content = fs.readFileSync(full, "utf-8");
            if (prismaPattern.test(content)) { definitionFile = full; definitionSource = "prisma"; }
          } catch (_) {}
          continue;
        }

        // JSON Schema files
        if (entry.name.endsWith(".schema.json") || entry.name.endsWith(".schema.yaml") || entry.name.endsWith(".schema.yml")) {
          try {
            const stat = fs.statSync(full);
            if (stat.size > 1024 * 1024) continue;
            const content = fs.readFileSync(full, "utf-8");
            // Check title or $id field for the model name
            const jsonSchemaPattern = new RegExp(`(?:"title"|"\\$id"|title:|\\$id:)\\s*:?\\s*"?${escaped}"?`, "i");
            if (jsonSchemaPattern.test(content)) { definitionFile = full; definitionSource = "json-schema"; }
          } catch (_) {}
          continue;
        }

        // YAML/JSON config-defined models
        if ((entry.name.endsWith(".yaml") || entry.name.endsWith(".yml") || entry.name.endsWith(".json")) && !entry.name.startsWith(".")) {
          try {
            const stat = fs.statSync(full);
            if (stat.size > 1024 * 1024) continue;
            const content = fs.readFileSync(full, "utf-8");
            // Look for model name as a top-level key or in a models/entities section
            const yamlModelPattern = new RegExp(`(?:^|\\n)\\s*(?:${escaped}|models:\\s*\\n[\\s\\S]*?${escaped})\\s*:`, "m");
            if (yamlModelPattern.test(content)) { definitionFile = full; definitionSource = "yaml/json-config"; }
          } catch (_) {}
          continue;
        }

        // Python files
        if (entry.name.endsWith(".py")) {
          try {
            const stat = fs.statSync(full);
            if (stat.size > 1024 * 1024) continue;
            const content = fs.readFileSync(full, "utf-8");
            if (pythonPattern.test(content)) { definitionFile = full; definitionSource = "python"; }
            // Python import pattern
            const pyImportPattern = new RegExp(`(?:from\\s+\\S+\\s+import.*\\b${escaped}\\b|import.*\\b${escaped}\\b)`);
            if (pyImportPattern.test(content) && full !== definitionFile) importCount++;
          } catch (_) {}
          continue;
        }
      }
    } catch (_) {}
  };
  walk(cwd);

  // If no definition found via any pattern, WARN instead of FAIL.
  // The user can still define shared models manually during spec refinement.
  if (definitionFile) {
    checks.push({
      name: "shared_type_exists",
      node: model.name,
      status: "PASS",
      details: `${model.name} found in ${definitionSource} (${definitionFile})`,
    });
  } else {
    checks.push({
      name: "shared_type_exists",
      node: model.name,
      status: "WARN",
      details: `${model.name} not found as JS/TS type, Prisma model, Drizzle table, JSON Schema, YAML config, or Python class. Define it manually in the manifest shared_models section.`,
    });
  }

  // Usage check: WARN instead of FAIL when import-based reuse check doesn't apply.
  // Import counting is only reliable for JS/TS codebases. For other languages
  // (Prisma, JSON Schema, Python, YAML, etc.), the import pattern won't match
  // and a FAIL would be a false positive.
  // Detect JS/TS repo: check mapping.tech_stack or fall back to definition source.
  const techStack = mapping.tech_stack || {};
  const stackLanguage = (techStack.language || techStack.runtime || "").toLowerCase();
  const isJsTsRepo = stackLanguage
    ? /\b(javascript|typescript|node|deno|bun|js|ts)\b/.test(stackLanguage)
    : ["js/ts", "drizzle"].includes(definitionSource);

  if (definitionSource && !["js/ts", "drizzle"].includes(definitionSource)) {
    // Definition found in a non-JS/TS pattern — import counting won't work
    checks.push({
      name: "shared_type_usage",
      node: model.name,
      status: importCount >= 2 ? "PASS" : "WARN",
      details: `${model.name} defined in ${definitionSource} — JS/TS import count (${importCount}) may not reflect actual usage. Verify manually.`,
    });
  } else if (!isJsTsRepo) {
    // Not a JS/TS repo — shared model reuse check is unreliable
    const lang = stackLanguage || "unknown";
    checks.push({
      name: "shared_type_usage",
      node: model.name,
      status: importCount >= 2 ? "PASS" : "WARN",
      details: `Shared model reuse check is limited to JS/TS imports. Manual verification recommended for ${lang}.${definitionFile ? "" : " No definition found — define manually."}`,
    });
  } else {
    // JS/TS repo — import-based reuse check is reliable, FAIL is appropriate
    checks.push({
      name: "shared_type_usage",
      node: model.name,
      status: importCount >= 2 ? "PASS" : (definitionFile ? "FAIL" : "WARN"),
      details: `${model.name} imported in ${importCount} files (need 2+)${!definitionFile ? " — no definition found, define manually" : ""}`,
    });
  }
}

// Check 6: No scope overlaps between proposed nodes
const nodes = mapping.proposed_nodes || [];
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    if (scopesOverlap(nodes[i].file_scope, nodes[j].file_scope)) {
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
const warned = checks.filter(c => c.status === "WARN");
const result = {
  status: failed.length === 0 ? (warned.length === 0 ? "PASS" : "PASS_WITH_WARNINGS") : "FAIL",
  total_checks: checks.length,
  passed: checks.filter(c => c.status === "PASS").length,
  warnings: warned.length,
  failed: failed.length,
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
