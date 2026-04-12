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

function parseRecommendation(reviewText) {
  const line = String(reviewText || "")
    .split(/\r?\n/)
    .find((entry) => /### Recommendation:/i.test(entry));

  if (!line) {
    return { recommendation: "unknown", failures: null };
  }

  const recommendation = /REQUEST CHANGES/i.test(line) ? "changes_requested"
    : /APPROVE/i.test(line) ? "approve"
    : "unknown";

  const failuresMatch = line.match(/\((\d+)\s+failures?/i);
  return {
    recommendation,
    failures: failuresMatch ? Number(failuresMatch[1]) : null,
  };
}

function allNodesReviewComplete(manifest, state) {
  const nodeIds = Object.keys((manifest && manifest.nodes) || {});
  return nodeIds.length > 0 && nodeIds.every((id) => {
    const status = state && state.nodes && state.nodes[id] ? state.nodes[id].status : "pending";
    return status === "reviewed" || status === "reviewed-with-findings";
  });
}

function main() {
  const nodeId = process.argv[2];
  if (!nodeId) {
    console.error("Usage: node review-next-action.js <node-id>");
    process.exit(2);
  }

  const cwd = process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");
  const manifest = safeReadYaml(path.join(forgePlanDir, "manifest.yaml"), {}) || {};
  const state = safeReadJson(path.join(forgePlanDir, "state.json"), {}) || {};
  const nodeState = state.nodes && state.nodes[nodeId] ? state.nodes[nodeId] : {};

  const reviewPath = nodeState.last_review ? path.join(cwd, nodeState.last_review) : null;
  const reviewText = reviewPath && fs.existsSync(reviewPath)
    ? fs.readFileSync(reviewPath, "utf8")
    : "";
  const reviewSummary = parseRecommendation(reviewText);
  const terminalStatus = nodeState.status || "pending";
  const everyNodeReviewed = allNodesReviewComplete(manifest, state);

  let headline = "Review complete";
  let primary = { command: "/forgeplan:next", description: "See the next recommended action" };
  const secondary = [];

  if (terminalStatus === "reviewed-with-findings") {
    headline = "Advisory findings recorded";
    primary = {
      command: `/forgeplan:build ${nodeId}`,
      description: "Rebuild this node to address the deferred review findings",
    };
    secondary.push({
      command: "/forgeplan:sweep",
      description: "Defer the findings to the later autonomous fix pass",
    });
    secondary.push({
      command: "/forgeplan:next",
      description: "See the next orchestrator recommendation",
    });
  } else {
    primary = {
      command: "/forgeplan:next",
      description: "See the next recommended action",
    };
    if (everyNodeReviewed) {
      secondary.push({
        command: "/forgeplan:integrate",
        description: "Verify cross-node interfaces now that all nodes are review-complete",
      });
    }
  }

  console.log(JSON.stringify({
    type: "review_next_action",
    node: nodeId,
    status: terminalStatus,
    headline,
    review_recommendation: reviewSummary.recommendation,
    failure_count: reviewSummary.failures,
    primary,
    secondary,
    all_nodes_review_complete: everyNodeReviewed,
  }, null, 2));
}

main();
