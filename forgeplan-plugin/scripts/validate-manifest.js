#!/usr/bin/env node

/**
 * validate-manifest.js — ForgePlan Core
 *
 * Validates a .forgeplan/manifest.yaml for structural integrity.
 * Three checks:
 *   1. Cycle detection via topological sort
 *   2. Orphan node detection (nodes with no connections)
 *   3. File scope overlap detection (no two nodes share directories)
 *
 * Usage:
 *   node validate-manifest.js [path-to-manifest.yaml]
 *   Defaults to .forgeplan/manifest.yaml in cwd
 *
 * Exit codes:
 *   0 — valid
 *   1 — validation errors found
 *   2 — file not found or parse error
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// ---------- Validation Logic ----------

function validateManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (!manifest.nodes || typeof manifest.nodes !== "object") {
    errors.push("Manifest has no 'nodes' section.");
    return { errors, warnings };
  }

  const nodeIds = Object.keys(manifest.nodes);

  if (nodeIds.length === 0) {
    errors.push("Manifest has no nodes defined.");
    return { errors, warnings };
  }

  // --- 1. Cycle Detection (Topological Sort) ---
  const cycleResult = detectCycles(manifest.nodes, nodeIds);
  if (cycleResult.hasCycle) {
    errors.push(
      `Circular dependency detected: ${cycleResult.cycle.join(" → ")}`
    );
  }

  // --- 2. Orphan Node Detection ---
  for (const nodeId of nodeIds) {
    const node = manifest.nodes[nodeId];
    const dependsOn = node.depends_on || [];
    const connectsTo = node.connects_to || [];

    // Check if any other node references this one
    const referencedBy = nodeIds.filter((otherId) => {
      if (otherId === nodeId) return false;
      const other = manifest.nodes[otherId];
      const otherDeps = other.depends_on || [];
      const otherConns = other.connects_to || [];
      return otherDeps.includes(nodeId) || otherConns.includes(nodeId);
    });

    const hasOutgoing = dependsOn.length > 0 || connectsTo.length > 0;
    const hasIncoming = referencedBy.length > 0;

    if (!hasOutgoing && !hasIncoming) {
      errors.push(
        `Orphan node: "${nodeId}" has no connections to any other node.`
      );
    }

    // Check that depends_on references valid nodes
    for (const dep of dependsOn) {
      if (!nodeIds.includes(dep)) {
        errors.push(
          `Node "${nodeId}" depends on "${dep}" which does not exist in the manifest.`
        );
      }
    }

    // Check that connects_to references valid nodes
    for (const conn of connectsTo) {
      if (!nodeIds.includes(conn)) {
        errors.push(
          `Node "${nodeId}" connects to "${conn}" which does not exist in the manifest.`
        );
      }
    }
  }

  // --- 3. File Scope Overlap Detection ---
  const scopes = [];
  for (const nodeId of nodeIds) {
    const node = manifest.nodes[nodeId];
    if (node.file_scope) {
      scopes.push({ nodeId, scope: node.file_scope });
    } else {
      warnings.push(`Node "${nodeId}" has no file_scope defined.`);
    }
  }

  for (let i = 0; i < scopes.length; i++) {
    for (let j = i + 1; j < scopes.length; j++) {
      if (scopesOverlap(scopes[i].scope, scopes[j].scope)) {
        errors.push(
          `File scope overlap: "${scopes[i].nodeId}" (${scopes[i].scope}) and "${scopes[j].nodeId}" (${scopes[j].scope}) may claim the same files.`
        );
      }
    }
  }

  return { errors, warnings };
}

/**
 * Cycle detection using Kahn's algorithm (topological sort).
 */
function detectCycles(nodes, nodeIds) {
  const inDegree = {};
  const adjacency = {};

  for (const id of nodeIds) {
    inDegree[id] = 0;
    adjacency[id] = [];
  }

  for (const id of nodeIds) {
    const deps = nodes[id].depends_on || [];
    for (const dep of deps) {
      if (nodeIds.includes(dep)) {
        adjacency[dep].push(id);
        inDegree[id]++;
      }
    }
  }

  const queue = nodeIds.filter((id) => inDegree[id] === 0);
  const sorted = [];

  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);
    for (const neighbor of adjacency[current]) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== nodeIds.length) {
    // Find the cycle — nodes not in sorted are in the cycle
    const inCycle = nodeIds.filter((id) => !sorted.includes(id));

    // Trace the cycle for a readable error
    const cycle = traceCycle(nodes, inCycle);
    return { hasCycle: true, cycle };
  }

  return { hasCycle: false, sorted };
}

/**
 * Trace a readable cycle path from the nodes involved.
 */
function traceCycle(nodes, cycleNodes) {
  if (cycleNodes.length === 0) return [];

  const visited = new Set();
  const path = [cycleNodes[0]];
  visited.add(cycleNodes[0]);

  let current = cycleNodes[0];
  while (true) {
    const deps = (nodes[current].depends_on || []).filter((d) =>
      cycleNodes.includes(d)
    );
    const next = deps.find((d) => !visited.has(d));
    if (!next) {
      // Complete the cycle
      const loopBack = deps.find((d) => d === cycleNodes[0]);
      if (loopBack) path.push(loopBack);
      break;
    }
    path.push(next);
    visited.add(next);
    current = next;
  }

  return path;
}

/**
 * Check if two file scope globs might overlap.
 * Compares the base directory paths — if one is a prefix of the other, they overlap.
 */
function scopesOverlap(scopeA, scopeB) {
  const baseA = scopeA.replace(/\*\*.*$/, "").replace(/\*.*$/, "");
  const baseB = scopeB.replace(/\*\*.*$/, "").replace(/\*.*$/, "");

  const normA = baseA.replace(/\\/g, "/").replace(/\/$/, "");
  const normB = baseB.replace(/\\/g, "/").replace(/\/$/, "");

  if (normA === normB) return true;
  if (normA.startsWith(normB + "/")) return true;
  if (normB.startsWith(normA + "/")) return true;
  return false;
}

// ---------- Main ----------

function main() {
  const manifestPath =
    process.argv[2] || path.join(process.cwd(), ".forgeplan", "manifest.yaml");

  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: Manifest not found at ${manifestPath}`);
    process.exit(2);
  }

  let manifestText;
  try {
    manifestText = fs.readFileSync(manifestPath, "utf-8");
  } catch (err) {
    console.error(`Error reading manifest: ${err.message}`);
    process.exit(2);
  }

  let manifest;
  try {
    manifest = yaml.load(manifestText);
  } catch (err) {
    console.error(`Error parsing manifest YAML: ${err.message}`);
    process.exit(2);
  }

  const { errors, warnings } = validateManifest(manifest);

  // Output results
  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const w of warnings) {
      console.log(`  ⚠ ${w}`);
    }
  }

  if (errors.length > 0) {
    console.log("Errors:");
    for (const e of errors) {
      console.log(`  ✗ ${e}`);
    }
    console.log(`\nValidation FAILED: ${errors.length} error(s) found.`);
    process.exit(1);
  }

  console.log(
    `Validation PASSED: ${Object.keys(manifest.nodes).length} nodes, no cycles, no orphans, no scope overlaps.`
  );
  process.exit(0);
}

// Export for testing
if (require.main === module) {
  main();
} else {
  module.exports = { validateManifest, detectCycles, scopesOverlap };
}
