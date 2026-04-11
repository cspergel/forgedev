#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function usage() {
  console.error(
    "Usage:\n" +
    "  node scripts/state-transition.js start-build <node-id> <previous-status> <model> <reason> [pre-build-files-json]\n" +
    "  node scripts/state-transition.js complete-build <node-id>\n" +
    "  node scripts/state-transition.js start-review <node-id> <previous-status>\n" +
    "  node scripts/state-transition.js start-review-fixing <node-id>\n" +
    "  node scripts/state-transition.js start-revising <node-id> <previous-status>\n" +
    "  node scripts/state-transition.js set-spec-status <node-id> <status> <spec-type>\n" +
    "  node scripts/state-transition.js complete-review <node-id> <review-path> [crossmodel-review-path]\n" +
    "  node scripts/state-transition.js restore-previous-status <node-id>\n" +
    "  node scripts/state-transition.js set-node-status <node-id> <status> [previous-status|-]\n" +
    "  node scripts/state-transition.js clear-active-node\n" +
    "  node scripts/state-transition.js set-sweep-phase <phase>\n" +
    "  node scripts/state-transition.js set-sweep-state <json>\n" +
    "  node scripts/state-transition.js clear-sweep-state"
  );
  process.exit(2);
}

function nowIso() {
  return new Date().toISOString();
}

function loadState(statePath) {
  if (!fs.existsSync(statePath)) {
    throw new Error(`State file not found: ${statePath}`);
  }
  return JSON.parse(fs.readFileSync(statePath, "utf-8"));
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.tmp-${path.basename(filePath)}-${process.pid}`);
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function ensureNode(state, nodeId) {
  if (!state.nodes || typeof state.nodes !== "object") {
    state.nodes = {};
  }
  if (!state.nodes[nodeId] || typeof state.nodes[nodeId] !== "object") {
    state.nodes[nodeId] = { status: "pending" };
  }
  return state.nodes[nodeId];
}

function parseJsonArg(value, label) {
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`Invalid ${label} JSON: ${err.message}`);
  }
}

function main() {
  const cwd = process.cwd();
  const statePath = path.join(cwd, ".forgeplan", "state.json");
  const op = process.argv[2];

  if (!op) {
    usage();
  }

  const state = loadState(statePath);
  const ts = nowIso();

  switch (op) {
    case "start-build": {
      const nodeId = process.argv[3];
      const previousStatus = process.argv[4];
      const model = process.argv[5];
      const reason = process.argv[6];
      const preBuildFilesJson = process.argv[7] || "[]";
      if (!nodeId || !previousStatus || !model || !reason) {
        usage();
      }
      const node = ensureNode(state, nodeId);
      const preBuildFiles = parseJsonArg(preBuildFilesJson, "pre-build-files");
      node.previous_status = previousStatus;
      node.status = "building";
      node.selected_builder_model = model;
      node.selected_builder_model_reason = reason;
      node.pre_build_files = Array.isArray(preBuildFiles) ? preBuildFiles : [];
      node.bounce_count = 0;
      node.files_created = [];
      node.files_modified = [];
      state.active_node = { node: nodeId, status: "building", started_at: ts };
      state.last_updated = ts;
      break;
    }
    case "start-review": {
      const nodeId = process.argv[3];
      const previousStatus = process.argv[4];
      if (!nodeId || !previousStatus) {
        usage();
      }
      const node = ensureNode(state, nodeId);
      node.previous_status = previousStatus;
      node.status = "reviewing";
      state.active_node = { node: nodeId, status: "reviewing", started_at: ts };
      state.last_updated = ts;
      break;
    }
    case "complete-build": {
      const nodeId = process.argv[3];
      if (!nodeId) {
        usage();
      }
      const node = ensureNode(state, nodeId);
      node.status = "built";
      node.last_build_completed = ts;
      node.bounce_count = 0;
      node.previous_status = null;
      state.active_node = null;
      state.stop_hook_active = false;
      state.last_updated = ts;
      break;
    }
    case "start-review-fixing": {
      const nodeId = process.argv[3];
      if (!nodeId) {
        usage();
      }
      const node = ensureNode(state, nodeId);
      node.status = "review-fixing";
      state.active_node = { node: nodeId, status: "review-fixing", started_at: ts };
      state.last_updated = ts;
      break;
    }
    case "start-revising": {
      const nodeId = process.argv[3];
      const previousStatus = process.argv[4];
      if (!nodeId || !previousStatus) {
        usage();
      }
      const node = ensureNode(state, nodeId);
      node.previous_status = previousStatus;
      node.status = "revising";
      state.active_node = { node: nodeId, status: "revising", started_at: ts };
      state.last_updated = ts;
      break;
    }
    case "set-spec-status": {
      const nodeId = process.argv[3];
      const status = process.argv[4];
      const specType = process.argv[5];
      if (!nodeId || !status || !specType) {
        usage();
      }
      const node = ensureNode(state, nodeId);
      node.status = status;
      node.spec_type = specType;
      state.last_updated = ts;
      break;
    }
    case "complete-review": {
      const nodeId = process.argv[3];
      const reviewPath = process.argv[4];
      const crossModelPath = process.argv[5];
      if (!nodeId || !reviewPath) {
        usage();
      }
      const node = ensureNode(state, nodeId);
      node.status = "reviewed";
      node.last_review = reviewPath;
      if (crossModelPath && crossModelPath !== "-") {
        node.last_crossmodel_review = crossModelPath;
      }
      node.previous_status = null;
      state.active_node = null;
      state.last_updated = ts;
      break;
    }
    case "restore-previous-status": {
      const nodeId = process.argv[3];
      if (!nodeId) {
        usage();
      }
      const node = ensureNode(state, nodeId);
      node.status = node.previous_status || node.status;
      node.previous_status = null;
      state.active_node = null;
      state.last_updated = ts;
      break;
    }
    case "set-node-status": {
      const nodeId = process.argv[3];
      const status = process.argv[4];
      const previousStatus = process.argv[5];
      if (!nodeId || !status) {
        usage();
      }
      const node = ensureNode(state, nodeId);
      node.status = status;
      if (previousStatus !== undefined) {
        node.previous_status = previousStatus === "-" ? null : previousStatus;
      } else {
        node.previous_status = null;
      }
      state.active_node = null;
      state.stop_hook_active = false;
      state.last_updated = ts;
      break;
    }
    case "clear-active-node": {
      state.active_node = null;
      state.stop_hook_active = false;
      state.last_updated = ts;
      break;
    }
    case "set-sweep-phase": {
      const phase = process.argv[3];
      if (!phase) {
        usage();
      }
      if (!state.sweep_state || typeof state.sweep_state !== "object") {
        throw new Error("Cannot set sweep phase because sweep_state is not active");
      }
      state.sweep_state.current_phase = phase;
      state.last_updated = ts;
      break;
    }
    case "set-sweep-state": {
      const json = process.argv[3];
      if (!json) {
        usage();
      }
      state.sweep_state = parseJsonArg(json, "sweep-state");
      state.last_updated = ts;
      break;
    }
    case "clear-sweep-state": {
      state.sweep_state = null;
      state.last_updated = ts;
      break;
    }
    default:
      usage();
  }

  writeJsonAtomic(statePath, state);
  process.stdout.write(JSON.stringify({ ok: true, op, state_path: ".forgeplan/state.json" }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(err.message || String(err));
  process.exit(1);
}
