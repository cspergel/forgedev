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
const { minimatch } = require(path.join(__dirname, "..", "node_modules", "minimatch"));
const { NODE_ID_REGEX } = require("./lib/atomic-write");

// ---------- Validation Logic ----------

function validateManifest(manifest) {
  const errors = [];
  const warnings = [];

  // --- 0. Required top-level sections ---
  if (!manifest.project || typeof manifest.project !== "object") {
    errors.push("Manifest missing required 'project' section.");
  } else {
    if (!manifest.project.name) errors.push("project.name is required.");
    // Validate complexity_tier if present
    if (manifest.project.complexity_tier) {
      const validTiers = ["SMALL", "MEDIUM", "LARGE"];
      if (!validTiers.includes(manifest.project.complexity_tier)) {
        errors.push(`project.complexity_tier "${manifest.project.complexity_tier}" is invalid — must be one of: ${validTiers.join(", ")}.`);
      }
    }
  }

  if (manifest.shared_models !== undefined && typeof manifest.shared_models !== "object") {
    errors.push("shared_models must be an object/map if present.");
  }

  if (manifest.validation !== undefined && typeof manifest.validation !== "object") {
    errors.push("validation must be an object if present.");
  }

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

  // --- 1b. Required Per-Node Fields ---
  const requiredNodeFields = ["name", "type", "status", "file_scope", "spec"];
  const validNodeTypes = ["service", "frontend", "database", "storage", "integration", "cli", "library", "extension", "worker", "pipeline"];
  const validStatuses = ["pending", "specced", "building", "built", "reviewing", "review-fixing", "reviewed", "revising", "revised", "sweeping"];

  for (const nodeId of nodeIds) {
    const node = manifest.nodes[nodeId];
    for (const field of requiredNodeFields) {
      if (!node[field]) {
        errors.push(`Node "${nodeId}": missing required field "${field}".`);
      }
    }
    if (node.type && !validNodeTypes.includes(node.type)) {
      errors.push(`Node "${nodeId}": invalid type "${node.type}" — must be one of: ${validNodeTypes.join(", ")}.`);
    }
    if (node.status && !validStatuses.includes(node.status)) {
      errors.push(`Node "${nodeId}": invalid status "${node.status}" — must be one of: pending, specced, building, built, reviewing, reviewed, revising, revised, sweeping.`);
    }
    if (!Array.isArray(node.files)) {
      // files can start empty but must be an array
      if (node.files !== undefined && !Array.isArray(node.files)) {
        errors.push(`Node "${nodeId}": "files" must be an array.`);
      }
    }

    // Sprint 9: Node ID format validation (defense-in-depth for wiki file paths)
    if (!NODE_ID_REGEX.test(nodeId)) {
      errors.push(`Node "${nodeId}": node ID must be alphanumeric with hyphens/underscores, starting with a letter or digit.`);
    }

    // Sprint 10B: phase field validation (optional, defaults to 1)
    if (node.phase !== undefined && node.phase !== null) {
      if (typeof node.phase !== "number" || !Number.isInteger(node.phase) || node.phase < 1) {
        errors.push(`Node "${nodeId}": phase must be a positive integer if present.`);
      }
    }

    // Sprint 9: split_from validation (check explicitly — empty string "" is falsy and would skip silently)
    if (node.split_from !== undefined && node.split_from !== null) {
      if (node.split_from === "") {
        errors.push(`Node "${nodeId}": split_from cannot be an empty string. Remove it or set to a valid parent node ID.`);
      } else if (typeof node.split_from !== "string") {
        errors.push(`Node "${nodeId}": split_from must be a string if present.`);
      } else if (!NODE_ID_REGEX.test(node.split_from)) {
        errors.push(`Node "${nodeId}": split_from "${node.split_from}" has invalid format (must be alphanumeric with hyphens/underscores).`);
      } else if (node.split_from === nodeId) {
        errors.push(`Node "${nodeId}": split_from cannot reference itself.`);
      }
    }
  }

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

  // Sprint 10B: build_phase validation
  const buildPhase = manifest.project && manifest.project.build_phase;
  if (buildPhase !== undefined && buildPhase !== null) {
    if (typeof buildPhase !== "number" || !Number.isInteger(buildPhase) || buildPhase < 1) {
      errors.push(`project.build_phase must be a positive integer if present.`);
    } else {
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
  }

  // --- 2. Orphan Node Detection ---
  // SMALL-tier projects may legitimately have 1-2 nodes with no connections.
  // Skip orphan check for SMALL tier or single-node projects.
  const tier = manifest.project && manifest.project.complexity_tier;
  const skipOrphanCheck = tier === "SMALL" || nodeIds.length <= 2;

  if (!skipOrphanCheck) {
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
    }
  }

  // --- 2b. Dependency and Connection Validation ---
  for (const nodeId of nodeIds) {
    const node = manifest.nodes[nodeId];
    const dependsOn = node.depends_on || [];
    const connectsTo = node.connects_to || [];

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
      errors.push(`Node "${nodeId}" has no file_scope defined. Every node must have a file_scope for build enforcement to work.`);
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
 *
 * Strategy: extract concrete path segments from both globs, then generate
 * cross-product test paths that combine segments from each. Tests these
 * against both globs via minimatch. This catches intersections that
 * single-glob expansion misses (e.g., wildcard directory patterns).
 */
function scopesOverlap(scopeA, scopeB) {
  const norm = (s) => s.replace(/\\/g, "/");
  const a = norm(scopeA);
  const b = norm(scopeB);

  // Generate test paths from each glob individually
  const pathsA = generateTestPaths(a);
  const pathsB = generateTestPaths(b);

  // Also generate cross-product paths using segments from both globs
  const crossPaths = generateCrossPaths(a, b);

  const allPaths = [...pathsA, ...pathsB, ...crossPaths];

  for (const tp of allPaths) {
    if (minimatch(tp, a) && minimatch(tp, b)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate cross-product test paths by extracting concrete segments from
 * both globs and combining them. This catches intersections where each
 * glob contributes different literal segments to the matching path.
 */
function generateCrossPaths(globA, globB) {
  const paths = [];

  // Extract literal segments (non-wildcard parts) from each glob
  const segsA = globA.split("/").filter((s) => !s.includes("*"));
  const segsB = globB.split("/").filter((s) => !s.includes("*"));

  // For each literal segment in A, try substituting it into B's wildcards and vice versa
  const expandWith = (glob, literals) => {
    const results = [];
    for (const lit of literals) {
      // Replace * with each literal
      let expanded = glob.replace(/\*\*/g, lit).replace(/\*/g, lit);
      results.push(expanded);
      results.push(expanded + "/file.ts");
      // Also try the literal as a path segment within **
      expanded = glob.replace(/\*\*/g, lit + "/sub").replace(/\*/g, lit);
      results.push(expanded);
    }
    return results;
  };

  paths.push(...expandWith(globA, segsB));
  paths.push(...expandWith(globB, segsA));

  return paths;
}

/**
 * Generate representative file paths that a glob would match.
 * Expands wildcards into multiple concrete variants.
 */
function generateTestPaths(glob) {
  const norm = glob.replace(/\\/g, "/");
  const paths = [];

  // Replace ** with a representative deep path
  const withDepth = norm.replace(/\*\*/g, "sub/deep");
  // Replace remaining * with a representative segment
  const concrete = withDepth.replace(/\*/g, "example");

  paths.push(concrete);
  paths.push(concrete + "/file.ts");

  // Also generate a path using the literal base
  const base = norm.replace(/\*\*.*$/, "").replace(/\*.*$/, "").replace(/\/$/, "");
  if (base) {
    paths.push(base + "/file.ts");
    paths.push(base + "/sub/file.ts");
  }

  return paths;
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
