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
  // Review-complete statuses are terminal for pipeline progression.
  // "revised" = spec changed, code stale, needs rebuild.
  const completedStatuses = ["reviewed", "reviewed-with-findings"];
  const builtStatuses = ["built"];
  const inProgressStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];
  const nodes = [];
  let completed = 0;
  let completedWithFindings = 0;
  let builtAwaitingReview = 0;
  let revisedNeedsRebuild = 0;
  let specced = 0;
  let inProgress = 0;

  for (const id of nodeIds) {
    const mNode = manifest.nodes[id];
    const sNode = nodeStates[id] || {};
    const status = sNode.status || "pending";
    const filesCount = (mNode.files || []).length;
    if (builtStatuses.includes(status)) builtAwaitingReview++;
    if (status === "reviewed-with-findings") completedWithFindings++;

    let icon = "[ ]"; // not started
    if (completedStatuses.includes(status)) { icon = "[*]"; completed++; }
    else if (status === "revised") { icon = "[~]"; revisedNeedsRebuild++; }
    else if (builtStatuses.includes(status)) { icon = "[>]"; }
    else if (inProgressStatuses.includes(status)) { icon = "[.]"; inProgress++; }
    else if (status === "specced") { icon = "[-]"; specced++; }

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

  const suggestedNextSteps = determineSuggestedNextSteps({
    manifest,
    state,
    nodeIds,
    nodeStates,
    summary: {
      total: nodeIds.length,
      completed,
      completedWithFindings,
      builtAwaitingReview,
      revisedNeedsRebuild,
      specced,
      inProgress,
      pending: nodeIds.length - completed - builtAwaitingReview - revisedNeedsRebuild - specced - inProgress,
    },
  });

  const autonomyHandoff = determineAutonomyHandoff({
    nodeIds,
    state,
    summary: {
      total: nodeIds.length,
      completed,
      completedWithFindings,
      builtAwaitingReview,
      revisedNeedsRebuild,
      specced,
      inProgress,
      pending: nodeIds.length - completed - builtAwaitingReview - revisedNeedsRebuild - specced - inProgress,
    },
  });

  console.log(JSON.stringify({
    type: "status_report",
    project: manifest.project || {},
    summary: {
      total: nodeIds.length,
      completed,
      completedWithFindings,
      builtAwaitingReview,
      revisedNeedsRebuild,
      specced,
      inProgress,
      pending: nodeIds.length - completed - builtAwaitingReview - revisedNeedsRebuild - specced - inProgress,
    },
    nodes,
    dependencyGraph: graphLines,
    sharedModels,
    activeNode: state.active_node || null,
    sweepState: state.sweep_state ? {
      operation: state.sweep_state.operation || null,
      currentPhase: state.sweep_state.current_phase || null,
      passNumber: state.sweep_state.pass_number || null,
      blockedDecisions: Array.isArray(state.sweep_state.blocked_decisions) ? state.sweep_state.blocked_decisions : [],
      needsManualAttention: Array.isArray(state.sweep_state.needs_manual_attention) ? state.sweep_state.needs_manual_attention : [],
    } : null,
    discoveryComplete: state.discovery_complete || false,
    phase: phaseInfo,
    nextSteps: suggestedNextSteps,
    autonomyHandoff,
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

function determineSuggestedNextSteps({ manifest, state, nodeIds, nodeStates, summary }) {
  const steps = [];
  const addStep = (command, description) => {
    if (!steps.some((step) => step.command === command)) {
      steps.push({ command, description });
    }
  };

  const builtNode = firstNodeWithStatus(nodeIds, nodeStates, ["built"]);
  const revisedNode = firstNodeWithStatus(nodeIds, nodeStates, ["revised"]);
  const speccedNode = firstNodeWithStatus(nodeIds, nodeStates, ["specced"]);
  const pendingNode = firstNodeWithStatus(nodeIds, nodeStates, ["pending"]);
  const buildPhase = (manifest.project && manifest.project.build_phase) || 1;
  const maxPhase = Math.max(1, ...nodeIds.map((id) => (manifest.nodes[id].phase || 1)));

  if (revisedNode) {
    addStep(`/forgeplan:build ${revisedNode}`, `Rebuild ${revisedNode} after a spec revision.`);
  } else if (builtNode) {
    addStep(`/forgeplan:review ${builtNode}`, `Review the built node ${builtNode}.`);
  } else if (speccedNode) {
    addStep(`/forgeplan:build ${speccedNode}`, `Build the specced node ${speccedNode}.`);
  } else if (pendingNode) {
    addStep(`/forgeplan:spec ${pendingNode}`, `Finish the spec for ${pendingNode}.`);
  } else if (summary.completed === summary.total) {
    if (maxPhase > buildPhase) {
      addStep("/forgeplan:deep-build", `Advance to phase ${buildPhase + 1} and continue autonomously.`);
    } else {
      addStep("/forgeplan:sweep --cross-check", "Run final cross-cutting quality sweeps across all nodes.");
      addStep("/forgeplan:integrate", "Review integration guidance and verify cross-node interfaces.");
    }
  } else {
    addStep("/forgeplan:next", "See the next recommended governed action.");
  }

  addStep("/forgeplan:measure", "Check quality metrics such as broken refs, duplicates, and stubs.");
  addStep("/forgeplan:status", "Re-read full project state after the next operation.");

  return steps;
}

function determineAutonomyHandoff({ nodeIds, state, summary }) {
  if (!nodeIds.length) {
    return {
      available: false,
      command: null,
      description: "No governed nodes detected.",
    };
  }

  if (state.active_node || (state.sweep_state && state.sweep_state.operation)) {
    return {
      available: false,
      command: null,
      description: "An autonomous operation is already active.",
    };
  }

  const hasRemainingAutonomousWork =
    summary.pending > 0 ||
    summary.specced > 0 ||
    summary.builtAwaitingReview > 0 ||
    summary.revisedNeedsRebuild > 0 ||
    summary.completedWithFindings > 0 ||
    summary.completed === summary.total;

  if (!hasRemainingAutonomousWork) {
    return {
      available: false,
      command: null,
      description: "No autonomous handoff is available from the current state.",
    };
  }

  let description = "Resume autonomous verification, sweep, and certification.";
  if (summary.builtAwaitingReview > 0) {
    description = "Resume autonomous build-review-verify flow from the current built-node state.";
  } else if (summary.revisedNeedsRebuild > 0 || summary.specced > 0 || summary.pending > 0) {
    description = "Resume autonomous node build/review flow from the current state.";
  }

  return {
    available: true,
    command: "/forgeplan:deep-build",
    description,
  };
}

function firstNodeWithStatus(nodeIds, nodeStates, statuses) {
  for (const id of nodeIds) {
    const status = nodeStates[id] && nodeStates[id].status ? nodeStates[id].status : "pending";
    if (statuses.includes(status)) return id;
  }
  return null;
}

if (require.main === module) {
  main();
}
