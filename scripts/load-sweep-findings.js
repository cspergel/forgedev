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

function parseCountLabel(headerLine) {
  const match = String(headerLine || "").match(/\((\d+)\s+findings?\)/i);
  return match ? Number(match[1]) : null;
}

function normalizeSeverity(value) {
  const severity = String(value || "").trim().toUpperCase();
  return ["HIGH", "MEDIUM", "LOW"].includes(severity) ? severity : "MEDIUM";
}

function parseFindingLine(line, nodeId) {
  const trimmed = String(line || "").trim();
  const match = trimmed.match(/^-?\s*(F\d+|NM\d+)\s+\[([^\]]+)\]\s+(HIGH|MEDIUM|LOW)\s+\((\d+)\):\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const [, id, category, severity, confidenceRaw, remainderRaw] = match;
  const confidence = Number(confidenceRaw);
  const remainder = remainderRaw.trim();

  let description = remainder;
  let file = null;
  let lineNumber = null;

  const fileMatch = remainder.match(/^(.*)\s+[—-]\s+`([^`]+):(\d+)`\s*$/);
  if (fileMatch) {
    description = fileMatch[1].trim();
    file = fileMatch[2].trim();
    lineNumber = Number(fileMatch[3]);
  }

  return {
    id,
    node: nodeId,
    category: category.trim(),
    severity: normalizeSeverity(severity),
    confidence: Number.isFinite(confidence) ? confidence : 80,
    description,
    file,
    line: Number.isFinite(lineNumber) ? lineNumber : null,
  };
}

function parseSweepReportMarkdown(raw) {
  const lines = String(raw || "").split(/\r?\n/);
  const pending = [];
  const projectLevel = [];
  let currentNode = null;
  let inProjectLevel = false;

  for (const line of lines) {
    const sectionMatch = line.match(/^###\s+([^(]+?)(?:\s+\(\d+\s+findings?\))?\s*$/i);
    if (sectionMatch) {
      currentNode = sectionMatch[1].trim();
      inProjectLevel = false;
      continue;
    }

    if (/^##\s+Project-Level Findings/i.test(line)) {
      currentNode = "project";
      inProjectLevel = true;
      continue;
    }

    if (/^\s*-\s+(F\d+|NM\d+)/i.test(line)) {
      const parsed = parseFindingLine(line, currentNode || "project");
      if (!parsed) {
        continue;
      }
      if (inProjectLevel || parsed.node === "project" || /^NM\d+$/i.test(parsed.id)) {
        projectLevel.push({
          ...parsed,
          node: "project",
          reason: "project-level finding - no single node to fix",
        });
      } else {
        pending.push(parsed);
      }
    }
  }

  const headerProjectMatch = String(raw || "").match(/Project-level \(manual\):\s*(\d+)/i);
  const expectedProjectCount = headerProjectMatch ? Number(headerProjectMatch[1]) : null;

  if (pending.length === 0 && projectLevel.length === 0) {
    throw new Error("Could not parse any findings from sweep markdown report.");
  }

  return {
    pending,
    project_level: projectLevel,
    metadata: {
      expected_project_level_count: Number.isFinite(expectedProjectCount) ? expectedProjectCount : null,
    },
  };
}

function parsePayload(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    throw new Error("Input was empty.");
  }
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  if (trimmed.startsWith("# Sweep Report")) {
    return parseSweepReportMarkdown(trimmed);
  }
  throw new Error("Input must be either JSON or a sweep markdown report.");
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
  const payload = parsePayload(raw);
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
