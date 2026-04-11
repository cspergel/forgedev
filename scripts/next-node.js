#!/usr/bin/env node

/**
 * next-node.js — ForgePlan Core Next Node Recommender
 *
 * Deterministic dependency-aware node recommendation.
 * Reads manifest and state, outputs the next node to work on.
 *
 * Usage: node next-node.js [path-to-project-dir]
 * Defaults to cwd.
 *
 * Output: JSON with recommendation details
 */

const fs = require("fs");
const path = require("path");

function main() {
  const projectDir = process.argv[2] || process.cwd();
  const forgePlanDir = path.join(projectDir, ".forgeplan");
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  const statePath = path.join(forgePlanDir, "state.json");

  if (!fs.existsSync(manifestPath)) {
    const result = {
      type: "error",
      message: "ERROR: No manifest found at .forgeplan/manifest.yaml. Run /forgeplan:discover first.",
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const yaml = require("js-yaml");
  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    const result = {
      type: "error",
      message: `ERROR: .forgeplan/manifest.yaml could not be parsed: ${err.message}. Fix the manifest before proceeding.`,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  let state = { nodes: {} };
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    } catch (err) {
      const result = {
        type: "error",
        message: `ERROR: .forgeplan/state.json could not be parsed: ${err.message}. Fix or delete state.json before proceeding.`,
      };
      console.log(JSON.stringify(result, null, 2));
      process.exit(2);
    }
  }

  if (!manifest.nodes || typeof manifest.nodes !== "object" || Object.keys(manifest.nodes).length === 0) {
    const result = {
      type: "error",
      message: "ERROR: Manifest has no nodes defined. Run /forgeplan:discover first.",
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const nodeIds = Object.keys(manifest.nodes);
  const nodeStates = state.nodes || {};

  // --- Sync active_node into nodeStates to prevent drift ---
  // If active_node says a node is "building" but nodeStates doesn't reflect it,
  // inject the active status so recommendations don't conflict with in-progress work
  if (state.active_node && state.active_node.node) {
    const activeId = state.active_node.node;
    if (!nodeStates[activeId]) {
      nodeStates[activeId] = {};
    }
    nodeStates[activeId].status = state.active_node.status;
  }

  // --- Priority 1: Stuck/crashed nodes ---
  const stuckStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];
  const stuck = [];
  for (const id of nodeIds) {
    const ns = nodeStates[id];
    if (ns && stuckStatuses.includes(ns.status)) {
      // Check if it's the active node (might be legitimately in progress)
      if (!state.active_node || state.active_node.node !== id) {
        stuck.push(id);
      }
    }
  }

  if (stuck.length > 0) {
    const result = {
      type: "stuck",
      nodes: stuck,
      message: `WARNING: ${stuck.length} node(s) stuck: ${stuck.join(", ")}. Run /forgeplan:recover first.`,
    };
    console.log(JSON.stringify(result, null, 2));
    // Exit 0 for all structured JSON responses — callers parse the `type` field,
    // and non-zero exits can short-circuit shell orchestration before JSON is consumed.
    process.exit(0);
  }

  // --- Priority 1b: Sweep/deep-build in progress ---
  // Only block node recommendations during actual sweep phases.
  // During deep-build's "build-all" phase, the existing build/review
  // pipeline needs next-node recommendations to function.
  if (state.sweep_state && state.sweep_state.operation) {
    const ss = state.sweep_state;
    const buildPhases = ["build-all"];
    if (!buildPhases.includes(ss.current_phase)) {
      // Compute completed count inline (the main `completed` var is defined later in the file)
      // "revised" means "spec changed, needs rebuild" — NOT complete
      const completedStatuses_ = ["built", "reviewed", "reviewed-with-findings"];
      const completedCount = nodeIds.filter((id) => {
        const ns = nodeStates[id];
        return ns && completedStatuses_.includes(ns.status);
      }).length;
      const result = {
        type: "sweep_active",
        operation: ss.operation,
        phase: ss.current_phase,
        pass: ss.pass_number,
        model: ss.current_model,
        pending_findings: (ss.findings && ss.findings.pending) ? ss.findings.pending.length : 0,
        resolved_findings: (ss.findings && ss.findings.resolved) ? ss.findings.resolved.length : 0,
        message: `${ss.operation === "deep-building" ? "Deep build" : "Sweep"} in progress — pass ${ss.pass_number}, phase: ${ss.current_phase}, model: ${ss.current_model}.`,
        progress: { completed: completedCount, total: nodeIds.length },
      };
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }
    // build-all: fall through to normal recommendation logic
  }

  // --- Priority 2: Nodes needing rebuild after revision ---
  // Check revision_history for affected nodes that haven't been rebuilt since the revision
  const needsRebuild = [];
  for (const id of nodeIds) {
    const ns = nodeStates[id];
    if (!ns || !ns.revision_history || !Array.isArray(ns.revision_history)) continue;
    for (const rev of ns.revision_history) {
      if (!Array.isArray(rev.affected_nodes)) continue;
      const revTimestamp = rev.timestamp || "";
      for (const affected of rev.affected_nodes) {
        if (!nodeIds.includes(affected) || needsRebuild.includes(affected) || stuck.includes(affected)) continue;
        const affectedState = nodeStates[affected];
        if (!affectedState) continue;
        // Flag nodes whose code exists but is stale due to this revision.
        // "built"/"reviewed" = had code, now stale from cascade.
        // "revised" = already marked for rebuild (from its own revision), but
        // also affected by this cascade — still needs rebuild.
        if (["built", "reviewed", "reviewed-with-findings", "revised"].includes(affectedState.status)) {
          // If we have timestamps, only flag if the revision is newer than the last build
          const lastBuildTime = affectedState.last_build_completed || "";
          if (revTimestamp && lastBuildTime && revTimestamp <= lastBuildTime) {
            continue; // Already rebuilt after this revision
          }
          needsRebuild.push(affected);
        }
      }
    }
  }

  if (needsRebuild.length > 0) {
    const result = {
      type: "rebuild_needed",
      nodes: needsRebuild,
      message: `${needsRebuild.length} node(s) need rebuilding after revision: ${needsRebuild.join(", ")}. Run /forgeplan:build for each.`,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  // --- State summary for context-aware suggestions ---
  // Two levels of "done":
  // - depSatisfiedStatuses: a dependency is satisfied once built (downstream can start building)
  // - fullyCompleteStatuses: a node is truly done once review is complete
  // NOTE: "revised" means "spec changed, code is stale, needs rebuild" — it is NOT complete.
  // The correct progression is: revised → building → built → reviewing → reviewed|reviewed-with-findings.
  const depSatisfiedStatuses = ["built", "reviewed", "reviewed-with-findings"];
  const fullyCompleteStatuses = ["reviewed", "reviewed-with-findings"];
  const allStatuses = {};
  for (const id of nodeIds) {
    const status = nodeStates[id]?.status || "pending";
    allStatuses[status] = (allStatuses[status] || 0) + 1;
  }

  // --- Priority 3: Dependency-order next eligible node ---

  // Topological sort
  const inDegree = {};
  const adjacency = {};
  for (const id of nodeIds) {
    inDegree[id] = 0;
    adjacency[id] = [];
  }
  for (const id of nodeIds) {
    const deps = manifest.nodes[id].depends_on || [];
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

  // Find eligible nodes, but keep buildable and reviewable work separate:
  // - build candidates: pending / specced / revised
  // - review candidates: built
  // During deep-build build-all, actual build work must be exhausted before
  // we start consuming built-but-unreviewed review work. Mixing them into one
  // pool lets already-built nodes outrank still-buildable nodes, which is what
  // caused the observed recommendation drift.
  const buildPhase = (manifest.project && manifest.project.build_phase) || 1;
  const topoIndex = new Map(sorted.map((id, index) => [id, index]));
  const buildCandidates = [];
  const reviewCandidates = [];
  for (const id of sorted) {
    const ns = nodeStates[id];
    const status = ns ? ns.status : "pending";

    if (fullyCompleteStatuses.includes(status)) continue;
    if (status === "building" || status === "reviewing" || status === "review-fixing" || status === "revising" || status === "sweeping") continue;

    // Sprint 10B: Skip future-phase nodes
    const nodePhase = (manifest.nodes[id] && manifest.nodes[id].phase) || 1;
    if (nodePhase > buildPhase) continue;

    // Check all dependencies are completed
    const deps = manifest.nodes[id].depends_on || [];
    const depsComplete = deps.every((dep) => {
      const depState = nodeStates[dep];
      return depState && depSatisfiedStatuses.includes(depState.status);
    });

    if (depsComplete) {
      // Count how many downstream nodes this unblocks
      const unblocks = (adjacency[id] || []).filter((downstream) => {
        const ds = nodeStates[downstream];
        return !ds || !fullyCompleteStatuses.includes(ds.status);
      }).length;

      const candidate = { id, status, unblocks };
      if (status === "built") {
        reviewCandidates.push(candidate);
      } else {
        buildCandidates.push(candidate);
      }
    }
  }

  const eligible = buildCandidates.length > 0 ? buildCandidates : reviewCandidates;

  // Count progress
  const completed = nodeIds.filter((id) => {
    const ns = nodeStates[id];
    return ns && fullyCompleteStatuses.includes(ns.status);
  }).length;

  if (eligible.length === 0) {
    if (completed === nodeIds.length) {
      // Check which nodes are reviewed vs just built
      const reviewed = nodeIds.filter((id) => {
        const ns = nodeStates[id];
        return ns && (ns.status === "reviewed" || ns.status === "reviewed-with-findings");
      }).length;

      const suggestions = [];
      if (reviewed < nodeIds.length) {
        suggestions.push({ command: "/forgeplan:review --all", description: "Review all built nodes for spec compliance" });
      }
      suggestions.push({ command: "/forgeplan:sweep", description: "Run cross-cutting sweep (3-5 consolidated agents, tier-aware) to catch issues across nodes" });
      suggestions.push({ command: "/forgeplan:deep-build", description: "Full autonomous pipeline: build → verify → review → sweep → certify" });
      suggestions.push({ command: "/forgeplan:integrate", description: "Verify all cross-node interfaces work together" });
      suggestions.push({ command: "/forgeplan:measure", description: "Check code quality (broken references, duplicate types, stubs)" });
      suggestions.push({ command: "/forgeplan:revise --model [ModelName]", description: "Need to add a field or change a shared data model? This finds every affected node and walks you through updating them" });
      suggestions.push({ command: "/forgeplan:revise [node-id]", description: "Need to change how a specific node works? This analyzes the impact and guides you through the update" });
      suggestions.push({ command: "/forgeplan:status", description: "See the full project at a glance" });
      suggestions.push({ command: "/forgeplan:help", description: "See all available commands" });

      const result = {
        type: "complete",
        message: `All ${nodeIds.length} nodes are complete!`,
        progress: { completed, total: nodeIds.length, reviewed },
        next_steps: suggestions,
      };
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Sprint 10B: Check if current-phase is complete but future phases remain
      const currentPhaseTotal = nodeIds.filter(id => ((manifest.nodes[id] && manifest.nodes[id].phase) || 1) <= buildPhase).length;
      const currentPhaseComplete = nodeIds.filter(id => {
        const ns = nodeStates[id];
        const nodePhase = (manifest.nodes[id] && manifest.nodes[id].phase) || 1;
        return nodePhase <= buildPhase && ns && fullyCompleteStatuses.includes(ns.status);
      }).length;
      const maxPhase = Math.max(1, ...nodeIds.map(id => (manifest.nodes[id] && manifest.nodes[id].phase) || 1));

      if (currentPhaseComplete === currentPhaseTotal && maxPhase > buildPhase) {
        const result = {
          type: "phase_complete",
          message: `All phase ${buildPhase} nodes are complete! Run /forgeplan:deep-build to advance to phase ${buildPhase + 1}.`,
          progress: { completed: currentPhaseComplete, total: currentPhaseTotal, phase: buildPhase, max_phase: maxPhase },
          next_steps: [
            { command: "/forgeplan:deep-build", description: `Advance to phase ${buildPhase + 1} (runs cross-phase integration, promotes specs, builds next phase)` },
            { command: "/forgeplan:status", description: "See full project status with phase progress" },
          ],
        };
        console.log(JSON.stringify(result, null, 2));
      } else {
        const result = {
          type: "blocked",
          message: "No nodes are ready to build — all remaining nodes depend on unfinished nodes. Run /forgeplan:status to see which nodes are blocking, or /forgeplan:recover to fix stuck nodes.",
          progress: { completed, total: nodeIds.length },
        };
        console.log(JSON.stringify(result, null, 2));
      }
    }
    process.exit(0);
  }

  // Sort build candidates by impact first, but review candidates strictly by
  // dependency order. Once we're reviewing built nodes, deterministic topo
  // order is more important than "unblocks" scoring.
  if (buildCandidates.length > 0) {
    eligible.sort((a, b) => {
      const unblockDelta = b.unblocks - a.unblocks;
      if (unblockDelta !== 0) return unblockDelta;
      return (topoIndex.get(a.id) || 0) - (topoIndex.get(b.id) || 0);
    });
  } else {
    eligible.sort((a, b) => (topoIndex.get(a.id) || 0) - (topoIndex.get(b.id) || 0));
  }
  const recommended = eligible[0];
  const node = manifest.nodes[recommended.id];
  const deps = node.depends_on || [];

  let nextAction = `/forgeplan:spec ${recommended.id}`;
  if (recommended.status === "specced") {
    try {
      const specPath = path.join(projectDir, ".forgeplan", "specs", `${recommended.id}.yaml`);
      if (fs.existsSync(specPath)) {
        const specContent = fs.readFileSync(specPath, "utf-8");
        if (specContent.includes('spec_type: "interface-only"') || specContent.includes("spec_type: interface-only")) {
          nextAction = `/forgeplan:spec ${recommended.id} (promote interface-only spec to full)`;
        } else {
          nextAction = `/forgeplan:build ${recommended.id}`;
        }
      } else {
        nextAction = `/forgeplan:build ${recommended.id}`;
      }
    } catch (_) {
      nextAction = `/forgeplan:build ${recommended.id}`;
    }
  } else if (recommended.status === "revised") {
    // "revised" = spec changed, code is stale → rebuild
    nextAction = `/forgeplan:build ${recommended.id}`;
  } else if (recommended.status === "built") {
    nextAction = `/forgeplan:review ${recommended.id}`;
  }

  const result = {
    type: "recommendation",
    node: recommended.id,
    name: node.name,
    status: recommended.status,
    reason:
      recommended.unblocks > 0
        ? `Unblocks ${recommended.unblocks} downstream node(s)`
        : "Next in dependency order",
    dependencies_satisfied: deps,
    next_action: nextAction,
    progress: { completed, total: nodeIds.length },
    other_eligible: eligible.slice(1).map((e) => e.id),
  };

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main();
}
