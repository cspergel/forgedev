#!/usr/bin/env node

/**
 * blast-radius.js — ForgePlan Dependency Graph + Impact Analysis
 *
 * Builds a lightweight dependency graph of the codebase and answers:
 * "If I change X, what else breaks?"
 *
 * Inspired by duo-debate's trace/graph system, adapted for ForgePlan's
 * node-based architecture. Uses import/require/export analysis to map
 * cross-file dependencies within and across nodes.
 *
 * Usage:
 *   node blast-radius.js index                     Build/refresh the dependency graph
 *   node blast-radius.js trace <file-or-symbol>     Show what depends on a file/symbol
 *   node blast-radius.js fix-context <file> [file2]  Generate fix context for the given files
 *
 * Output: JSON to stdout
 * Graph persists to: .forgeplan/dependency-graph.json
 */

"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const cwd = process.cwd();
const forgePlanDir = path.join(cwd, ".forgeplan");
const GRAPH_FILE = path.join(forgePlanDir, "dependency-graph.json");
const EXCLUDE_DIRS = ["node_modules", "dist", "build", ".next", ".git", ".forgeplan",
  "templates", "blueprints", "fixtures", "__fixtures__", "__mocks__"];

// ── Index: Build the dependency graph ──────────────────────────────

function buildGraph() {
  const graph = {
    files: {},      // filePath → { hash, imports: [path], exports: [name], node: nodeId }
    symbols: {},    // symbolName → [{ file, type }]
    edges: [],      // [{ from, to, symbols: [name], type }]
    builtAt: new Date().toISOString(),
  };

  // Load manifest for node→file mapping
  let manifest = null;
  try {
    const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));
    manifest = yaml.load(fs.readFileSync(path.join(forgePlanDir, "manifest.yaml"), "utf-8"));
  } catch {}

  // Map file paths to node IDs
  const fileToNode = {};
  if (manifest && manifest.nodes) {
    for (const [nodeId, node] of Object.entries(manifest.nodes)) {
      for (const f of (node.files || [])) {
        const normalized = f.replace(/\\/g, "/");
        fileToNode[normalized] = nodeId;
      }
    }
  }

  // Scan all source files
  const sourceFiles = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (EXCLUDE_DIRS.includes(entry.name)) continue;
      if (entry.name.startsWith(".tmp-")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (/\.[jt]sx?$/.test(entry.name)) {
        const stat = fs.statSync(full);
        if (stat.size > 512 * 1024) continue; // skip files >512KB
        sourceFiles.push(full);
      }
    }
  }
  walk(cwd);

  // Parse each file for imports and exports
  for (const filePath of sourceFiles) {
    const relPath = path.relative(cwd, filePath).replace(/\\/g, "/");
    let content;
    try { content = fs.readFileSync(filePath, "utf-8"); } catch { continue; }

    const hash = crypto.createHash("md5").update(content).digest("hex").slice(0, 8);
    const imports = extractImports(content, filePath);
    const exports = extractExports(content);
    const nodeId = fileToNode[relPath] || null;

    graph.files[relPath] = { hash, imports, exports, node: nodeId };

    // Track exported symbols
    for (const exp of exports) {
      if (!graph.symbols[exp]) graph.symbols[exp] = [];
      graph.symbols[exp].push({ file: relPath, type: "export" });
    }
  }

  // Build edges from imports
  for (const [filePath, fileInfo] of Object.entries(graph.files)) {
    for (const imp of fileInfo.imports) {
      const resolvedTarget = resolveImport(imp.source, filePath);
      if (resolvedTarget && graph.files[resolvedTarget]) {
        graph.edges.push({
          from: filePath,
          to: resolvedTarget,
          symbols: imp.names || [],
          type: imp.type, // "named", "default", "namespace", "side-effect"
        });
      }
    }
  }

  graph._stats = {
    filesIndexed: Object.keys(graph.files).length,
    symbolsTracked: Object.keys(graph.symbols).length,
    edgesFound: graph.edges.length,
  };

  // Write graph
  if (!fs.existsSync(forgePlanDir)) fs.mkdirSync(forgePlanDir, { recursive: true });
  fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2));

  return graph;
}

// ── Import extraction ──────────────────────────────────────────────

function extractImports(content, filePath) {
  const imports = [];

  // import { a, b } from "./module"
  const namedRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = namedRe.exec(content)) !== null) {
    const names = m[1].split(",").map(n => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    imports.push({ source: m[2], names, type: "named" });
  }

  // import defaultName from "./module"
  const defaultRe = /import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s*['"]([^'"]+)['"]/g;
  while ((m = defaultRe.exec(content)) !== null) {
    if (m[1] !== "type") { // skip `import type`
      imports.push({ source: m[2], names: [m[1]], type: "default" });
    }
  }

  // import * as ns from "./module"
  const nsRe = /import\s*\*\s*as\s+([a-zA-Z_$]+)\s+from\s*['"]([^'"]+)['"]/g;
  while ((m = nsRe.exec(content)) !== null) {
    imports.push({ source: m[2], names: [m[1]], type: "namespace" });
  }

  // const { a, b } = require("./module")
  const reqDestructRe = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = reqDestructRe.exec(content)) !== null) {
    const names = m[1].split(",").map(n => n.trim().split(/\s*:/)[0].trim()).filter(Boolean);
    imports.push({ source: m[2], names, type: "require" });
  }

  // const x = require("./module") (no destructuring)
  const reqRe = /(?:const|let|var)\s+([a-zA-Z_$]+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = reqRe.exec(content)) !== null) {
    imports.push({ source: m[2], names: [m[1]], type: "require" });
  }

  // Bare require (side-effect)
  const bareReqRe = /^require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
  while ((m = bareReqRe.exec(content)) !== null) {
    imports.push({ source: m[1], names: [], type: "require" });
  }

  return imports;
}

// ── Export extraction ──────────────────────────────────────────────

function extractExports(content) {
  const exports = [];

  // export function name / export const name / export class name
  const declRe = /export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  let m;
  while ((m = declRe.exec(content)) !== null) {
    exports.push(m[1]);
  }

  // export { a, b, c }
  const namedRe = /export\s*\{([^}]+)\}/g;
  while ((m = namedRe.exec(content)) !== null) {
    const names = m[1].split(",").map(n => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    exports.push(...names);
  }

  // export default
  if (/export\s+default\b/.test(content)) {
    exports.push("default");
  }

  // CommonJS: module.exports = { a, b, c }
  const cjsRe = /module\.exports\s*=\s*\{([^}]+)\}/g;
  while ((m = cjsRe.exec(content)) !== null) {
    const names = m[1].split(",").map(n => n.trim().split(/\s*:/)[0].trim()).filter(Boolean);
    exports.push(...names);
  }

  // CommonJS: exports.name = ...
  const cjsSingleRe = /exports\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
  while ((m = cjsSingleRe.exec(content)) !== null) {
    exports.push(m[1]);
  }

  return [...new Set(exports)];
}

// ── Import resolution ──────────────────────────────────────────────

function resolveImport(source, fromFile) {
  // Skip node_modules / bare specifiers
  if (!source.startsWith(".") && !source.startsWith("/") && !source.startsWith("@/")) {
    return null;
  }

  // Handle @/ alias (common in many projects)
  let resolved;
  if (source.startsWith("@/")) {
    resolved = path.join(cwd, "src", source.slice(2));
  } else {
    const fromDir = path.dirname(path.join(cwd, fromFile));
    resolved = path.resolve(fromDir, source);
  }

  // Try extensions
  const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"];
  const relBase = path.relative(cwd, resolved).replace(/\\/g, "/");

  // Exact match first
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return relBase;
  }

  for (const ext of extensions) {
    const candidate = relBase + ext;
    if (fs.existsSync(path.join(cwd, candidate))) {
      return candidate;
    }
  }

  return null;
}

// ── Trace: What depends on a file/symbol ───────────────────────────

function trace(graph, target) {
  const isFile = target.includes("/") || target.includes(".");

  if (isFile) {
    // Trace a file: find all files that import from it
    const normalized = target.replace(/\\/g, "/");
    const directDependents = graph.edges
      .filter(e => e.to === normalized)
      .map(e => ({ file: e.from, symbols: e.symbols, node: (graph.files[e.from] || {}).node }));

    // Transitive dependents (2 levels deep)
    const transitive = [];
    for (const dep of directDependents) {
      const secondLevel = graph.edges
        .filter(e => e.to === dep.file)
        .map(e => ({ file: e.from, via: dep.file, node: (graph.files[e.from] || {}).node }));
      transitive.push(...secondLevel);
    }

    return {
      target: normalized,
      targetNode: (graph.files[normalized] || {}).node,
      exports: (graph.files[normalized] || {}).exports || [],
      directDependents,
      transitiveDependents: transitive,
      blastRadius: new Set([...directDependents.map(d => d.file), ...transitive.map(t => t.file)]).size,
    };
  } else {
    // Trace a symbol: find where it's defined and used
    const definitions = graph.symbols[target] || [];
    const usages = graph.edges.filter(e => e.symbols.includes(target));

    return {
      target,
      definitions: definitions.map(d => ({ file: d.file, node: (graph.files[d.file] || {}).node })),
      usedBy: usages.map(u => ({ file: u.from, node: (graph.files[u.from] || {}).node })),
      blastRadius: usages.length,
    };
  }
}

// ── Fix Context: Generate rich context for fix agents ──────────────

function generateFixContext(graph, targetFiles) {
  const context = {
    targetFiles: [],
    consumers: [],       // files that import from target files (read-only context for fix agent)
    crossNodeDeps: [],   // cross-node dependencies (highest regression risk)
    blastRadius: 0,
  };

  const consumerSet = new Set();

  for (const file of targetFiles) {
    const normalized = file.replace(/\\/g, "/");
    const fileInfo = graph.files[normalized];
    if (!fileInfo) continue;

    context.targetFiles.push({
      path: normalized,
      node: fileInfo.node,
      exports: fileInfo.exports,
      importCount: graph.edges.filter(e => e.to === normalized).length,
    });

    // Find consumers (files that import from this file)
    const consumers = graph.edges.filter(e => e.to === normalized);
    for (const c of consumers) {
      if (targetFiles.includes(c.from)) continue; // skip files we're already fixing
      consumerSet.add(c.from);

      const consumerNode = (graph.files[c.from] || {}).node;
      const targetNode = fileInfo.node;

      context.consumers.push({
        file: c.from,
        node: consumerNode,
        importsSymbols: c.symbols,
      });

      // Flag cross-node dependencies (highest regression risk)
      if (consumerNode && targetNode && consumerNode !== targetNode) {
        context.crossNodeDeps.push({
          from: normalized,
          fromNode: targetNode,
          to: c.from,
          toNode: consumerNode,
          symbols: c.symbols,
        });
      }
    }
  }

  context.blastRadius = consumerSet.size;

  return context;
}

// ── CLI ────────────────────────────────────────────────────────────

function main() {
  const cmd = process.argv[2];

  if (cmd === "index") {
    const graph = buildGraph();
    console.log(JSON.stringify({
      status: "ok",
      stats: graph._stats,
    }, null, 2));
    process.exit(0);
  }

  if (cmd === "trace") {
    const target = process.argv[3];
    if (!target) { console.error("Usage: blast-radius.js trace <file-or-symbol>"); process.exit(2); }
    let graph;
    try { graph = JSON.parse(fs.readFileSync(GRAPH_FILE, "utf-8")); }
    catch { console.error("No graph found. Run: node blast-radius.js index"); process.exit(2); }
    console.log(JSON.stringify(trace(graph, target), null, 2));
    process.exit(0);
  }

  if (cmd === "fix-context") {
    const files = process.argv.slice(3);
    if (files.length === 0) { console.error("Usage: blast-radius.js fix-context <file> [file2] ..."); process.exit(2); }
    let graph;
    try { graph = JSON.parse(fs.readFileSync(GRAPH_FILE, "utf-8")); }
    catch { console.error("No graph found. Run: node blast-radius.js index"); process.exit(2); }
    console.log(JSON.stringify(generateFixContext(graph, files), null, 2));
    process.exit(0);
  }

  console.error("Usage: blast-radius.js [index|trace|fix-context] ...");
  process.exit(2);
}

if (require.main === module) {
  main();
} else {
  module.exports = { buildGraph, trace, generateFixContext };
}
