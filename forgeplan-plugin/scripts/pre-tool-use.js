#!/usr/bin/env node

/**
 * pre-tool-use.js — ForgePlan Core PreToolUse Hook
 *
 * Runs before every Write/Edit tool call during a build.
 * Layer 1 enforcement — Deterministic (instant, no tokens):
 *   - Active node check
 *   - File scope glob matching
 *   - Cross-node territory blocking
 *   - Shared model redefinition guard
 *
 * Layer 2 (LLM-mediated spec compliance, non_goals checking) runs as a
 * separate "prompt" type hook in hooks.json, after this script passes.
 *
 * Input: JSON on stdin with tool_name and tool_input
 * Output:
 *   Exit 0 — allow the operation (Layer 2 prompt hook runs next)
 *   Exit 2 — block the operation (stderr message shown to Claude)
 */

const fs = require("fs");
const path = require("path");
// Resolve minimatch relative to this script's location (plugin dir), not cwd
const { minimatch } = require(path.join(__dirname, "..", "node_modules", "minimatch"));

// Read stdin
let inputData = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  inputData += chunk;
});

process.stdin.on("end", () => {
  try {
    const input = JSON.parse(inputData);
    const result = evaluate(input);
    if (result.block) {
      process.stderr.write(result.message + "\n");
      process.exit(2);
    }
    process.exit(0);
  } catch (err) {
    // On malformed input (can't parse JSON from Claude), block to be safe
    process.stderr.write(
      `BLOCKED: ForgePlan PreToolUse could not parse hook input: ${err.message}. ` +
      `This is a safety block — enforcement cannot verify this operation.\n`
    );
    process.exit(2);
  }
});

function evaluate(input) {
  const cwd = input.cwd || process.cwd();
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};

  // Only enforce on Write and Edit tools
  if (toolName !== "Write" && toolName !== "Edit") {
    return { block: false };
  }

  const filePath = toolInput.file_path;
  if (!filePath) {
    return { block: false };
  }

  // Normalize the file path to be relative to cwd
  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(cwd, filePath);
  const relPath = path
    .relative(cwd, absPath)
    .replace(/\\/g, "/");

  // --- Load state and manifest ---
  const forgePlanDir = path.join(cwd, ".forgeplan");
  const statePath = path.join(forgePlanDir, "state.json");
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");

  // If no .forgeplan directory, skip enforcement
  if (!fs.existsSync(forgePlanDir)) {
    return { block: false };
  }

  // If no state.json, skip enforcement
  if (!fs.existsSync(statePath)) {
    return { block: false };
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch (err) {
    // state.json exists but can't be parsed — enforcement is compromised
    return {
      block: true,
      message:
        `BLOCKED: .forgeplan/state.json exists but could not be parsed: ${err.message}. ` +
        `Enforcement cannot verify this operation. Fix or delete state.json to proceed.`,
    };
  }

  // --- Check 1: Is there an active node? ---
  if (!state.active_node || state.active_node.status !== "building") {
    // Not in a build — allow writes to .forgeplan/ but warn about others
    if (relPath.startsWith(".forgeplan/")) {
      return { block: false };
    }
    // Allow writes outside build context (non-build operations like review, revise)
    if (state.active_node && ["reviewing", "revising"].includes(state.active_node.status)) {
      return { block: false };
    }
    return { block: false };
  }

  const activeNodeId = state.active_node.node;

  // --- Allow exempt paths ---
  // .forgeplan/ bookkeeping is always allowed
  if (relPath.startsWith(".forgeplan/")) {
    return { block: false };
  }

  // Shared types module — only src/shared/types/index.ts is exempt (the ONE canonical file)
  // Any other file under src/shared/types/ is NOT exempt and must fall within a node's file_scope
  if (relPath === "src/shared/types/index.ts") {
    if (state.active_node.status === "revising") {
      // /forgeplan:revise can always regenerate shared types after manifest changes
      return { block: false };
    }
    // During build: only allow CREATION (file doesn't exist yet), not modification
    const sharedTypesAbs = path.join(cwd, relPath);
    if (!fs.existsSync(sharedTypesAbs)) {
      return { block: false };
    }
    return {
      block: true,
      message:
        `BLOCKED: src/shared/types/index.ts already exists and cannot be modified during /forgeplan:build. ` +
        `Only /forgeplan:revise can regenerate it after manifest changes. ` +
        `Import from the existing module instead.`,
    };
  }

  // --- Load manifest ---
  if (!fs.existsSync(manifestPath)) {
    return {
      block: true,
      message:
        `BLOCKED: .forgeplan/manifest.yaml not found but a build is active for "${activeNodeId}". ` +
        `The manifest is required for file scope enforcement. Run /forgeplan:discover to create it.`,
    };
  }

  let manifest;
  try {
    const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    return {
      block: true,
      message:
        `BLOCKED: .forgeplan/manifest.yaml could not be parsed: ${err.message}. ` +
        `Enforcement cannot verify file scope boundaries. Fix the manifest to proceed.`,
    };
  }

  if (!manifest.nodes || !manifest.nodes[activeNodeId]) {
    return {
      block: true,
      message:
        `BLOCKED: Manifest has no nodes section or no entry for active node "${activeNodeId}". ` +
        `Enforcement cannot verify file scope boundaries. Fix the manifest to proceed.`,
    };
  }

  const activeNode = manifest.nodes[activeNodeId];
  const activeScope = activeNode.file_scope;

  // --- Check 2: Does the file match the active node's file_scope? ---
  if (!activeScope) {
    return {
      block: true,
      message:
        `BLOCKED: Node "${activeNodeId}" has no file_scope defined in the manifest. ` +
        `Every node must have a file_scope for enforcement to work. Fix the manifest.`,
    };
  }

  if (!minimatch(relPath, activeScope)) {
    // Check if it matches ANY other node's scope
    const otherNode = findOwningNode(manifest.nodes, relPath, activeNodeId);
    if (otherNode) {
      return {
        block: true,
        message:
          `BLOCKED: File "${relPath}" belongs to node "${otherNode}" (scope: ${manifest.nodes[otherNode].file_scope}), ` +
          `but the active build is for "${activeNodeId}" (scope: ${activeScope}). ` +
          `Do not write files outside the active node's file_scope.`,
      };
    }
    return {
      block: true,
      message:
        `BLOCKED: File "${relPath}" is outside the active node's file_scope "${activeScope}". ` +
        `Only write files within the active node's territory, or to exempt paths (.forgeplan/, src/shared/types/index.ts).`,
    };
  }

  // --- Check 3: Is the file in another node's files list? ---
  for (const [nodeId, nodeData] of Object.entries(manifest.nodes)) {
    if (nodeId === activeNodeId) continue;
    const nodeFiles = nodeData.files || [];
    if (nodeFiles.includes(relPath)) {
      return {
        block: true,
        message:
          `BLOCKED: File "${relPath}" is already registered to node "${nodeId}". ` +
          `Do not modify files owned by other nodes.`,
      };
    }
  }

  // --- Check 4: Shared model redefinition guard ---
  if (manifest.shared_models && toolInput.content) {
    const content = toolInput.content;
    const sharedModelNames = Object.keys(manifest.shared_models);

    for (const modelName of sharedModelNames) {
      // Look for type/interface/class definitions (not imports)
      const redefPatterns = [
        new RegExp(`\\btype\\s+${modelName}\\b\\s*=`, "m"),
        new RegExp(`\\binterface\\s+${modelName}\\b\\s*\\{`, "m"),
        new RegExp(`\\bclass\\s+${modelName}\\b`, "m"),
      ];

      for (const pattern of redefPatterns) {
        if (pattern.test(content)) {
          // Check if this node lists the model in shared_dependencies
          // Either way, block redefinition — shared models come from src/shared/types/
          return {
            block: true,
            message:
              `BLOCKED: "${modelName}" is a shared model defined in the manifest. ` +
              `Import it from the shared types module (src/shared/types/) — do not redefine locally. ` +
              `Use: import { ${modelName} } from 'src/shared/types';`,
          };
        }
      }
    }
  }

  // For Edit tool, check the new_string for redefinitions too
  if (manifest.shared_models && toolInput.new_string) {
    const content = toolInput.new_string;
    const sharedModelNames = Object.keys(manifest.shared_models);

    for (const modelName of sharedModelNames) {
      const redefPatterns = [
        new RegExp(`\\btype\\s+${modelName}\\b\\s*=`, "m"),
        new RegExp(`\\binterface\\s+${modelName}\\b\\s*\\{`, "m"),
        new RegExp(`\\bclass\\s+${modelName}\\b`, "m"),
      ];

      for (const pattern of redefPatterns) {
        if (pattern.test(content)) {
          return {
            block: true,
            message:
              `BLOCKED: "${modelName}" is a shared model defined in the manifest. ` +
              `Import it from the shared types module (src/shared/types/) — do not redefine locally.`,
          };
        }
      }
    }
  }

  // --- Layer 1 passed — allow (Layer 2 LLM check runs separately via prompt hook) ---
  return { block: false };
}

/**
 * Find which node owns a given file path by checking file_scope globs.
 */
function findOwningNode(nodes, filePath, excludeNodeId) {
  for (const [nodeId, nodeData] of Object.entries(nodes)) {
    if (nodeId === excludeNodeId) continue;
    if (nodeData.file_scope && minimatch(filePath, nodeData.file_scope)) {
      return nodeId;
    }
  }
  return null;
}

// Export for testing
if (require.main !== module) {
  module.exports = { evaluate, findOwningNode };
}
