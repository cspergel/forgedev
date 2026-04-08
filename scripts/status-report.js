#!/usr/bin/env node

/**
 * status-report.js — ForgePlan Core Status Report
 *
 * Reads manifest and state to generate a project status summary
 * with text-based dependency visualization.
 *
 * Usage: node status-report.js [manifest-path]
 * Output: JSON status report
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function main() {
  const cwd = process.cwd();
  const manifestPath =
    process.argv[2] || path.join(cwd, ".forgeplan", "manifest.yaml");
  const statePath = path.join(path.dirname(manifestPath), "state.json");

  if (!fs.existsSync(manifestPath)) {
    console.error(JSON.stringify({
      type: "error",
      message: "No manifest found. Run /forgeplan:discover first.",
    }));
    process.exit(2);
  }

  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    console.error(JSON.stringify({
      type: "error",
      message: `Could not parse manifest: ${err.message}`,
    }));
    process.exit(2);
  }

  let state = { nodes: {} };
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    } catch (err) {
      console.error(JSON.stringify({
        type: "error",
        message: `Could not parse state.json: ${err.message}`,
      }));
      process.exit(2);
    }
  }

  const nodeIds = Object.keys(manifest.nodes || {});
  const nodeStates = state.nodes || {};

  // Build node status list
  const completedStatuses = ["built", "reviewed", "revised"];
  const inProgressStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];
  const nodes = [];
  let completed = 0;
  let inProgress = 0;

  for (const id of nodeIds) {
    const mNode = manifest.nodes[id];
    const sNode = nodeStates[id] || {};
    const status = sNode.status || "pending";
    const filesCount = (mNode.files || []).length;

    let icon = "○"; // not started
    if (completedStatuses.includes(status)) { icon = "●"; completed++; }
    else if (inProgressStatuses.includes(status)) { icon = "◐"; inProgress++; }
    else if (status === "specced") { icon = "◔"; }

    nodes.push({
      id,
      name: mNode.name || id,
      type: mNode.type || "unknown",
      status,
      icon,
      filesCount,
      dependsOn: mNode.depends_on || [],
      connectsTo: mNode.connects_to || [],
    });
  }

  // Build dependency graph text
  const graphLines = buildDependencyGraph(manifest.nodes, nodeIds);

  // Shared models summary
  const sharedModels = [];
  if (manifest.shared_models) {
    for (const [name, def] of Object.entries(manifest.shared_models)) {
      const usedBy = nodeIds.filter((id) => {
        const spec = loadSpec(path.dirname(manifestPath), id);
        return spec && Array.isArray(spec.shared_dependencies) &&
          spec.shared_dependencies.includes(name);
      });
      sharedModels.push({ name, fields: Object.keys(def.fields || {}), usedBy });
    }
  }

  // Sprint 10B: Phase information
  const buildPhase = (manifest.project && manifest.project.build_phase) || 1;
  const maxPhase = Math.max(1, ...nodeIds.map(id => (manifest.nodes[id].phase || 1)));
  const phaseInfo = maxPhase > 1 ? {
    build_phase: buildPhase,
    max_phase: maxPhase,
    current_phase_nodes: nodeIds.filter(id => (manifest.nodes[id].phase || 1) <= buildPhase),
    future_phase_nodes: nodeIds.filter(id => (manifest.nodes[id].phase || 1) > buildPhase),
    build_phase_started_at: state.build_phase_started_at || null,
  } : null;

  console.log(JSON.stringify({
    type: "status_report",
    project: manifest.project || {},
    summary: {
      total: nodeIds.length,
      completed,
      inProgress,
      pending: nodeIds.length - completed - inProgress,
    },
    nodes,
    dependencyGraph: graphLines,
    sharedModels,
    activeNode: state.active_node || null,
    discoveryComplete: state.discovery_complete || false,
    phase: phaseInfo,
  }, null, 2));
}

function loadSpec(forgePlanDir, nodeId) {
  const specPath = path.join(forgePlanDir, "specs", `${nodeId}.yaml`);
  if (!fs.existsSync(specPath)) return null;
  try {
    return yaml.load(fs.readFileSync(specPath, "utf-8"));
  } catch {
    return null;
  }
}

function buildDependencyGraph(nodes, nodeIds) {
  const lines = [];

  // Topological sort for display order
  const inDegree = {};
  const adjacency = {};
  nodeIds.forEach((n) => { inDegree[n] = 0; adjacency[n] = []; });
  nodeIds.forEach((n) => {
    (nodes[n].depends_on || []).forEach((d) => {
      if (nodeIds.includes(d)) { adjacency[d].push(n); inDegree[n]++; }
    });
  });

  const queue = nodeIds.filter((n) => inDegree[n] === 0);
  const sorted = [];
  while (queue.length) {
    const c = queue.shift();
    sorted.push(c);
    adjacency[c].forEach((n) => { if (--inDegree[n] === 0) queue.push(n); });
  }

  // Build arrows
  for (const id of sorted) {
    const deps = adjacency[id];
    if (deps.length > 0) {
      lines.push(`${id} ──→ ${deps.join(", ")}`);
    } else {
      lines.push(`${id} (leaf)`);
    }
  }

  return lines;
}

if (require.main === module) {
  main();
}
