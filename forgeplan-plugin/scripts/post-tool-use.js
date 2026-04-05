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

  // Track shared types creation in state (but don't register in manifest)
  if (relPath === "src/shared/types/index.ts") {
    try {
      const stateData = JSON.parse(fs.readFileSync(
        path.join(cwd, ".forgeplan", "state.json"), "utf-8"
      ));
      if (stateData.active_node && (stateData.active_node.status === "building" || stateData.active_node.status === "review-fixing" || stateData.active_node.status === "sweeping")) {
        const nodeId = stateData.active_node.node;
        if (!stateData.shared_types_created_by) {
          stateData.shared_types_created_by = nodeId;
          fs.writeFileSync(
            path.join(cwd, ".forgeplan", "state.json"),
            JSON.stringify(stateData, null, 2), "utf-8"
          );
        }
      }
    } catch { /* best effort */ }
    return; // Don't register in manifest files list
  }

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

  // Only register during active builds (including review-fixing and sweeping)
  if (!state.active_node || (state.active_node.status !== "building" && state.active_node.status !== "review-fixing" && state.active_node.status !== "sweeping")) return;

  const activeNodeId = state.active_node.node;

  // --- 1. Classify file BEFORE registering in manifest ---
  // Must happen first so the manifest check sees pre-build state
  let fileAction = "created"; // default for conversation log
  try {
    // Re-read state in case it changed
    state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

    if (!state.nodes) state.nodes = {};
    if (!state.nodes[activeNodeId]) {
      state.nodes[activeNodeId] = { status: state.active_node.status };
    }
    if (!state.nodes[activeNodeId].files_created) {
      state.nodes[activeNodeId].files_created = [];
    }
    if (!state.nodes[activeNodeId].files_modified) {
      state.nodes[activeNodeId].files_modified = [];
    }

    const alreadyKnown =
      state.nodes[activeNodeId].files_created.includes(relPath) ||
      state.nodes[activeNodeId].files_modified.includes(relPath);

    let targetList;
    if (alreadyKnown) {
      targetList = null;
    } else if (toolName === "Edit") {
      targetList = "files_modified";
      fileAction = "edited";
    } else {
      // Write tool: determine if this is a new file or overwrite of existing
      // Check sources in order (any match = pre-existing):
      //   1. Pre-build snapshot (most reliable — set at build start)
      //   2. Manifest files list (any node)
      //   3. Git tracking (committed/staged)
      //   4. None found = genuinely new
      let preExisting = false;

      // Source 1: pre-build file snapshot (set by /forgeplan:build setup)
      const preBuildFiles = state.nodes[activeNodeId].pre_build_files || [];
      const absRelPath = path.join(cwd, relPath);
      if (preBuildFiles.some((f) => {
        // Normalize for comparison
        const normF = f.replace(/\\/g, "/");
        const normRel = relPath.replace(/\\/g, "/");
        return normF === normRel || normF.endsWith("/" + normRel) || normF === absRelPath;
      })) {
        preExisting = true;
      }

      // Source 2: manifest files list
      if (!preExisting) {
        try {
          const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));
          const mText = fs.readFileSync(manifestPath, "utf-8");
          const mData = yaml.load(mText);
          if (mData.nodes) {
            for (const [nid, ndata] of Object.entries(mData.nodes)) {
              if ((ndata.files || []).includes(relPath)) {
                preExisting = true;
                break;
              }
            }
          }
        } catch {
          // Can't check manifest
        }
      }

      // Source 3: git tracking
      if (!preExisting) {
        try {
          const { execSync } = require("child_process");
          const result = execSync(
            `git ls-files "${relPath}"`,
            { cwd, encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] }
          ).trim();
          if (result.length > 0) preExisting = true;
        } catch {
          // Git not available
        }
      }

      if (preExisting) {
        targetList = "files_modified";
        fileAction = "overwrote";
      } else {
        targetList = "files_created";
        fileAction = "created";
      }
    }

    if (targetList && !state.nodes[activeNodeId][targetList].includes(relPath)) {
      state.nodes[activeNodeId][targetList].push(relPath);
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
    }
  } catch (err) {
    process.stderr.write(
      `ForgePlan PostToolUse: Could not classify file: ${err.message}\n`
    );
  }

  // --- 1b. Sweep mode: track modified files per pass ---
  if (state.active_node && state.active_node.status === "sweeping") {
    try {
      // Re-read state for sweep_state (may have been updated by classification above)
      const freshState = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      if (freshState.sweep_state) {
        const passKey = String(freshState.sweep_state.pass_number || 1);
        if (!freshState.sweep_state.modified_files_by_pass) {
          freshState.sweep_state.modified_files_by_pass = {};
        }
        if (!freshState.sweep_state.modified_files_by_pass[passKey]) {
          freshState.sweep_state.modified_files_by_pass[passKey] = [];
        }
        if (!freshState.sweep_state.modified_files_by_pass[passKey].includes(relPath)) {
          freshState.sweep_state.modified_files_by_pass[passKey].push(relPath);
          freshState.last_updated = new Date().toISOString();
          fs.writeFileSync(statePath, JSON.stringify(freshState, null, 2), "utf-8");
        }
      }
    } catch (err) {
      process.stderr.write(
        `ForgePlan PostToolUse: Could not track sweep modified file: ${err.message}\n`
      );
    }
  }

  // --- 2. Register file in manifest (after classification) ---
  try {
    const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));
    const manifestText = fs.readFileSync(manifestPath, "utf-8");
    const manifest = yaml.load(manifestText);

    if (manifest.nodes && manifest.nodes[activeNodeId]) {
      const node = manifest.nodes[activeNodeId];
      if (!node.files) node.files = [];

      if (!node.files.includes(relPath)) {
        node.files.push(relPath);

        // Note: revision_count is incremented by /forgeplan:revise, not per-file registration

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
    const actionLabel = fileAction.charAt(0).toUpperCase() + fileAction.slice(1);
    const logEntry = `- [${timestamp}] ${actionLabel}: \`${relPath}\`\n`;

    fs.appendFileSync(convPath, logEntry, "utf-8");
  } catch (err) {
    process.stderr.write(
      `ForgePlan PostToolUse: Could not log to conversation: ${err.message}\n`
    );
  }
}
