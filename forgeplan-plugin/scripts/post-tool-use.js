#!/usr/bin/env node

/**
 * post-tool-use.js — ForgePlan Core PostToolUse Hook
 *
 * Runs after every successful Write/Edit tool call during a build.
 * Deterministic only (no LLM calls):
 *   1. Auto-register new files into the manifest's files list
 *   2. Log the change to the node's conversation file
 *
 * Input: JSON on stdin with tool_name and tool_input
 * Output: Exit 0 always (post-hooks don't block)
 */

const fs = require("fs");
const path = require("path");

let inputData = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  inputData += chunk;
});

process.stdin.on("end", () => {
  try {
    const input = JSON.parse(inputData);
    processHook(input);
  } catch (err) {
    process.stderr.write(
      `ForgePlan PostToolUse warning: ${err.message}\n`
    );
  }
  process.exit(0);
});

function processHook(input) {
  const cwd = input.cwd || process.cwd();
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};

  // Only process Write and Edit
  if (toolName !== "Write" && toolName !== "Edit") return;

  const filePath = toolInput.file_path;
  if (!filePath) return;

  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(cwd, filePath);
  const relPath = path
    .relative(cwd, absPath)
    .split(path.sep)
    .join("/");

  // Skip .forgeplan/ files — don't register bookkeeping as node files
  if (relPath.startsWith(".forgeplan/")) return;

  // Skip shared types — tracked separately
  if (relPath.startsWith("src/shared/types/")) return;

  const forgePlanDir = path.join(cwd, ".forgeplan");
  const statePath = path.join(forgePlanDir, "state.json");
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");

  if (!fs.existsSync(statePath) || !fs.existsSync(manifestPath)) return;

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch {
    return;
  }

  // Only register during active builds
  if (!state.active_node || state.active_node.status !== "building") return;

  const activeNodeId = state.active_node.node;

  // --- 1. Auto-register file in manifest ---
  try {
    const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));
    const manifestText = fs.readFileSync(manifestPath, "utf-8");
    const manifest = yaml.load(manifestText);

    if (manifest.nodes && manifest.nodes[activeNodeId]) {
      const node = manifest.nodes[activeNodeId];
      if (!node.files) node.files = [];

      if (!node.files.includes(relPath)) {
        node.files.push(relPath);

        // Write updated manifest
        const updatedYaml = yaml.dump(manifest, {
          lineWidth: -1,
          noRefs: true,
          quotingType: '"',
          forceQuotes: false,
        });
        fs.writeFileSync(manifestPath, updatedYaml, "utf-8");
      }
    }
  } catch (err) {
    process.stderr.write(
      `ForgePlan PostToolUse: Could not register file in manifest: ${err.message}\n`
    );
  }

  // --- 2. Auto-register file in state.json files_created ---
  try {
    // Re-read state in case it changed
    state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

    if (!state.nodes) state.nodes = {};
    if (!state.nodes[activeNodeId]) {
      state.nodes[activeNodeId] = { status: "building" };
    }
    if (!state.nodes[activeNodeId].files_created) {
      state.nodes[activeNodeId].files_created = [];
    }

    if (!state.nodes[activeNodeId].files_created.includes(relPath)) {
      state.nodes[activeNodeId].files_created.push(relPath);
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
    }
  } catch (err) {
    process.stderr.write(
      `ForgePlan PostToolUse: Could not update state.json: ${err.message}\n`
    );
  }

  // --- 3. Log to node conversation file ---
  try {
    const convPath = path.join(
      forgePlanDir,
      "conversations",
      "nodes",
      `${activeNodeId}.md`
    );
    const convDir = path.dirname(convPath);
    if (!fs.existsSync(convDir)) {
      fs.mkdirSync(convDir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const action = toolName === "Write" ? "Created" : "Edited";
    const logEntry = `- [${timestamp}] ${action}: \`${relPath}\`\n`;

    fs.appendFileSync(convPath, logEntry, "utf-8");
  } catch (err) {
    process.stderr.write(
      `ForgePlan PostToolUse: Could not log to conversation: ${err.message}\n`
    );
  }
}
