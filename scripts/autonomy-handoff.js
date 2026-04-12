#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function safeReadJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function safeReadYaml(filePath, fallback = null) {
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function firstNodeWithStatus(nodeIds, nodes, statuses) {
  for (const id of nodeIds) {
    const status = nodes[id] && nodes[id].status ? nodes[id].status : "pending";
    if (statuses.includes(status)) return id;
  }
  return null;
}

function main() {
  const cwd = process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");
  const manifest = safeReadYaml(path.join(forgePlanDir, "manifest.yaml"), {}) || {};
  const state = safeReadJson(path.join(forgePlanDir, "state.json"), {}) || {};

  const nodeIds = Object.keys((manifest && manifest.nodes) || {});
  const nodes = state.nodes || {};

  if (state.active_node || (state.sweep_state && state.sweep_state.operation)) {
    console.log(JSON.stringify({
      type: "autonomy_handoff",
      status: "active_operation",
      autonomous_available: false,
      message: "An active ForgePlan operation is already in progress.",
    }, null, 2));
    return;
  }

  const builtNode = firstNodeWithStatus(nodeIds, nodes, ["built"]);
  const revisedNode = firstNodeWithStatus(nodeIds, nodes, ["revised"]);
  const speccedNode = firstNodeWithStatus(nodeIds, nodes, ["specced"]);
  const pendingNode = firstNodeWithStatus(nodeIds, nodes, ["pending"]);

  let manualNext = "/forgeplan:next";
  let manualReason = "See the next recommended manual action.";

  if (builtNode) {
    manualNext = `/forgeplan:review ${builtNode}`;
    manualReason = `A built node is awaiting review: ${builtNode}.`;
  } else if (revisedNode) {
    manualNext = `/forgeplan:build ${revisedNode}`;
    manualReason = `A revised node needs rebuilding: ${revisedNode}.`;
  } else if (speccedNode) {
    manualNext = `/forgeplan:build ${speccedNode}`;
    manualReason = `A specced node is ready to build: ${speccedNode}.`;
  } else if (pendingNode) {
    manualNext = `/forgeplan:spec ${pendingNode}`;
    manualReason = `A pending node still needs a complete spec: ${pendingNode}.`;
  } else if (nodeIds.length > 0) {
    manualNext = "/forgeplan:sweep --cross-check or /forgeplan:integrate";
    manualReason = "All nodes are review-complete; the remaining work is project-level verification.";
  }

  const autonomousAvailable = nodeIds.length > 0;
  let autonomousReason = "No governed project state was found.";
  if (autonomousAvailable) {
    autonomousReason = builtNode
      ? `Deep-build can resume from a mid-pipeline state and continue after ${builtNode} review.`
      : revisedNode
        ? `Deep-build can resume from a revised-node state and rebuild ${revisedNode} automatically.`
        : speccedNode || pendingNode
          ? "Deep-build can continue the remaining node build/review pipeline autonomously."
          : "Deep-build can continue with verification, sweep, and certification from the current review-complete state.";
  }

  console.log(JSON.stringify({
    type: "autonomy_handoff",
    status: "available",
    autonomous_available: autonomousAvailable,
    autonomous_command: autonomousAvailable ? "/forgeplan:deep-build" : null,
    autonomous_reason: autonomousReason,
    manual_next: manualNext,
    manual_reason: manualReason,
  }, null, 2));
}

main();
