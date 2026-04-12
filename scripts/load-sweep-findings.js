#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function usage() {
  console.error(
    "Usage:\n" +
    "  node scripts/load-sweep-findings.js <json-file>\n" +
    "  node scripts/load-sweep-findings.js --stdin\n"
  );
  process.exit(2);
}

function readInput(mode) {
  if (mode === "--stdin") {
    return new Promise((resolve, reject) => {
      let raw = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        raw += chunk;
      });
      process.stdin.on("end", () => resolve(raw));
      process.stdin.on("error", reject);
    });
  }

  const filePath = path.resolve(process.cwd(), mode);
  return Promise.resolve(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.tmp-${path.basename(filePath)}-${process.pid}`);
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmpPath, filePath);
}

function normalizePendingFinding(finding, currentPass) {
  if (!finding || typeof finding !== "object") {
    return null;
  }
  const normalized = { ...finding };
  normalized.pass_found = Number.isFinite(Number(normalized.pass_found))
    ? Number(normalized.pass_found)
    : currentPass;
  return normalized;
}

function normalizeManualFinding(finding, currentPass) {
  if (!finding || typeof finding !== "object") {
    return null;
  }
  const normalized = { ...finding };
  normalized.pass_found = Number.isFinite(Number(normalized.pass_found))
    ? Number(normalized.pass_found)
    : currentPass;
  if (!normalized.reason) {
    normalized.reason = "project-level finding - no single node to fix";
  }
  return normalized;
}

async function main() {
  const mode = process.argv[2];
  if (!mode) {
    usage();
  }

  const cwd = process.cwd();
  const statePath = path.join(cwd, ".forgeplan", "state.json");
  if (!fs.existsSync(statePath)) {
    throw new Error("No .forgeplan/state.json found.");
  }

  const raw = await readInput(mode);
  const payload = JSON.parse(raw);
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));

  if (!state.sweep_state || typeof state.sweep_state !== "object") {
    throw new Error("Cannot load sweep findings because sweep_state is not active.");
  }

  const currentPass = Number(state.sweep_state.pass_number || 1);
  const pendingInput = Array.isArray(payload.pending) ? payload.pending : [];
  const projectInput = Array.isArray(payload.project_level) ? payload.project_level : [];

  const pending = pendingInput
    .map((finding) => normalizePendingFinding(finding, currentPass))
    .filter(Boolean)
    .filter((finding) => finding.node && finding.node !== "project");

  const projectLevel = [
    ...projectInput.map((finding) => normalizeManualFinding(finding, currentPass)).filter(Boolean),
    ...pendingInput
      .filter((finding) => finding && finding.node === "project")
      .map((finding) => normalizeManualFinding(finding, currentPass))
      .filter(Boolean),
  ];

  if (!state.sweep_state.findings || typeof state.sweep_state.findings !== "object") {
    state.sweep_state.findings = { pending: [], resolved: [] };
  }
  if (!Array.isArray(state.sweep_state.findings.resolved)) {
    state.sweep_state.findings.resolved = [];
  }
  if (!Array.isArray(state.sweep_state.needs_manual_attention)) {
    state.sweep_state.needs_manual_attention = [];
  }

  state.sweep_state.findings.pending = pending;
  state.sweep_state.needs_manual_attention = [
    ...state.sweep_state.needs_manual_attention,
    ...projectLevel,
  ];

  if (Array.isArray(payload.failed_agents)) {
    state.sweep_state.failed_agents = payload.failed_agents;
  }
  if (payload.agent_convergence && typeof payload.agent_convergence === "object") {
    state.sweep_state.agent_convergence = payload.agent_convergence;
  }

  state.sweep_state.current_phase = pending.length > 0 ? "claude-fix" : "integrate";
  state.last_updated = new Date().toISOString();

  writeJsonAtomic(statePath, state);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        op: "load-sweep-findings",
        state_path: ".forgeplan/state.json",
        pending_count: pending.length,
        project_level_count: projectLevel.length,
        next_phase: state.sweep_state.current_phase,
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((err) => {
  console.error(`load-sweep-findings failed: ${err.message}`);
  process.exit(1);
});
