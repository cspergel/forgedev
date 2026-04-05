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
    // On malformed input, block to be safe
    process.stderr.write(
      `BLOCKED: ForgePlan enforcement received unexpected input and could not verify this operation. Try the operation again, or run /forgeplan:recover if this persists.\n`
    );
    process.exit(2);
  }
});

function evaluate(input) {
  const cwd = input.cwd || process.cwd();
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};

  // Enforce on Write, Edit, and Bash (file-mutating commands)
  if (toolName === "Bash") {
    return evaluateBash(toolInput, cwd);
  }

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

  // If the target path is outside the project directory, allow it.
  // ForgePlan only governs files within the project. Other plugins
  // (superpowers, episodic-memory, etc.) write to ~/.claude/ paths
  // which should never be blocked by ForgePlan enforcement.
  if (relPath.startsWith("..")) {
    return { block: false };
  }

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
    // state.json exists but can't be parsed — enforcement is compromised.
    // ESCAPE HATCH: allow writes TO state.json itself (to fix the corruption)
    // and allow rm/delete of state.json. Block everything else.
    const isFixingState =
      (toolName === "Write" || toolName === "Edit") &&
      relPath === ".forgeplan/state.json";
    const isDeletingState =
      toolName === "Bash" &&
      toolInput.command &&
      /\brm\b.*\.forgeplan[/\\]state\.json/.test(toolInput.command);
    if (isFixingState || isDeletingState) {
      return { block: false }; // Allow the fix
    }
    return {
      block: true,
      message:
        `BLOCKED: .forgeplan/state.json exists but could not be parsed: ${err.message}. ` +
        `Enforcement cannot verify this operation. Fix or delete state.json to proceed.`,
    };
  }

  // --- Check 1: Is there an active node? ---
  if (!state.active_node) {
    // Check for sweep analysis mode BEFORE allowing all writes.
    // sweep_state can be active with no active_node (analysis phase, between node fixes).
    if (state.sweep_state && state.sweep_state.operation) {
      // Sweep analysis mode: .forgeplan/ management files writable, source files blocked
      if (
        relPath.startsWith(".forgeplan/sweeps/") ||
        relPath.startsWith(".forgeplan/specs/") ||
        relPath === ".forgeplan/manifest.yaml" ||
        relPath === ".forgeplan/deep-build-report.md" ||
        relPath === ".forgeplan/state.json"
      ) {
        return { block: false };
      }
      return {
        block: true,
        message:
          `BLOCKED: A codebase sweep is analyzing your project. Source files can't be modified until the sweep assigns fixes to specific nodes. Wait for the sweep to continue, or run /forgeplan:recover to abort.`,
      };
    }
    // No active operation and no sweep — allow all writes
    return { block: false };
  }

  const activeStatus = state.active_node.status;

  // Reviewing: restrict to review reports and state only
  if (activeStatus === "reviewing") {
    if (
      relPath.startsWith(".forgeplan/reviews/") ||
      relPath === ".forgeplan/state.json"
    ) {
      return { block: false };
    }
    return {
      block: true,
      message:
        `BLOCKED: During review, only .forgeplan/reviews/ and .forgeplan/state.json can be written. ` +
        `File "${relPath}" is outside the reviewer's write boundary.`,
    };
  }

  // Review-fixing: same enforcement as building (fixer agent writing code during multi-agent review cycle)
  // Falls through to the building enforcement below
  if (activeStatus === "review-fixing") {
    // Treat review-fixing identically to building for write enforcement
    // (same file_scope check, shared model guard, .forgeplan/ boundary)
  }

  // Building (and review-fixing, sweeping): only specific .forgeplan/ paths allowed per builder contract
  if ((activeStatus === "building" || activeStatus === "review-fixing" || activeStatus === "sweeping") && relPath.startsWith(".forgeplan/")) {
    const activeNodeId_ = state.active_node.node;
    if (
      relPath === `.forgeplan/conversations/nodes/${activeNodeId_}.md` ||
      relPath === ".forgeplan/state.json" ||
      // Sweep-only paths: only allow during sweeping, not during normal builds
      (activeStatus === "sweeping" && (relPath.startsWith(".forgeplan/sweeps/") || relPath.startsWith(".forgeplan/specs/") || relPath === ".forgeplan/manifest.yaml" || relPath === ".forgeplan/deep-build-report.md"))
    ) {
      return { block: false };
    }
    return {
      block: true,
      message:
        `BLOCKED: During build, only .forgeplan/conversations/nodes/${activeNodeId_}.md and .forgeplan/state.json ` +
        `can be written. File "${relPath}" is outside the builder's .forgeplan/ write boundary.`,
    };
  }

  // Revising: allow active node's spec, manifest, state, shared types
  if (activeStatus === "revising") {
    const activeNodeId_ = state.active_node.node;
    if (
      relPath === `.forgeplan/specs/${activeNodeId_}.yaml` ||
      relPath === ".forgeplan/manifest.yaml" ||
      relPath === ".forgeplan/state.json" ||
      relPath === "src/shared/types/index.ts"
    ) {
      return { block: false };
    }
    return {
      block: true,
      message:
        `BLOCKED: During revision, only specs, manifest, and shared types can be modified. ` +
        `File "${relPath}" is implementation code. Run /forgeplan:build after revision to update implementation.`,
    };
  }

  // For non-building/non-review-fixing states we don't recognize, allow
  if (activeStatus !== "building" && activeStatus !== "review-fixing" && activeStatus !== "sweeping") {
    return { block: false };
  }

  const activeNodeId = state.active_node.node;

  // --- Building: .forgeplan/ was already handled above (lines 133-147) ---
  // --- Building: shared types exempt (creation only, or always for sweeping) ---
  if (relPath === "src/shared/types/index.ts") {
    // Sweep fixes may always write shared types (Option A from execution plan)
    if (activeStatus === "sweeping") {
      return { block: false };
    }
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

  // --- Project-root exempt files (builders can write to these regardless of file_scope) ---
  const exemptRootFiles = [".env.example", "package.json", "package-lock.json", "tsconfig.json"];
  if (exemptRootFiles.includes(relPath)) {
    return { block: false };
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
        `Only write files within the active node's territory, or to exempt paths (.forgeplan/, src/shared/types/index.ts, .env.example, package.json).`,
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
          `BLOCKED: File "${relPath}" belongs to module "${nodeId}". During a build, you can only modify files in your current module's scope. To change this file, finish the current build first, then run /forgeplan:build ${nodeId}.`,
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
 * Evaluate Bash commands during active ForgePlan operations.
 *
 * Strategy: during active builds/reviews/revisions, BLOCK all Bash commands
 * EXCEPT a whitelist of known-safe read-only operations. This is the only
 * robust approach — regex-matching file-write patterns is a losing game
 * because there are infinite ways to write files via interpreters, .NET, etc.
 */
function evaluateBash(toolInput, cwd) {
  const command = toolInput.command || "";

  // Check for any active ForgePlan operation
  const forgePlanDir = path.join(cwd, ".forgeplan");
  const statePath = path.join(forgePlanDir, "state.json");

  if (!fs.existsSync(forgePlanDir) || !fs.existsSync(statePath)) {
    return { block: false };
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch (err) {
    // ESCAPE HATCH: allow rm of state.json to break the deadlock (strict: no chained commands)
    if (/^\s*rm\s+(-[rf]+\s+)?["']?\.forgeplan[/\\]state\.json["']?\s*$/.test(command)) {
      return { block: false };
    }
    return {
      block: true,
      message:
        `BLOCKED: .forgeplan/state.json could not be parsed: ${err.message}. ` +
        `Shell commands blocked while enforcement state is corrupted. ` +
        `To fix: run \`rm .forgeplan/state.json\` or use Write tool to overwrite it.`,
    };
  }

  const inProgressStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];

  // Check if we should enforce: either active_node in progress OR sweep_state active
  const hasActiveNode = state.active_node && inProgressStatuses.includes(state.active_node.status);
  const hasSweepState = !state.active_node && state.sweep_state && state.sweep_state.operation;

  if (!hasActiveNode && !hasSweepState) {
    return { block: false };
  }

  const activeStatus = state.active_node ? state.active_node.status : "sweeping";

  // Whitelist: known-safe read-only commands that cannot mutate files
  const safePatterns = [
    /^\s*ls\b/,                         // list files
    /^\s*dir\b/,                        // list files (Windows)
    /^\s*cat\s/,                        // read file (without redirection)
    /^\s*head\s/,                       // read file head
    /^\s*tail\s/,                       // read file tail
    /^\s*less\s/,                       // pager
    /^\s*more\s/,                       // pager
    /^\s*grep\s/,                       // search
    /^\s*rg\s/,                         // ripgrep
    /^\s*find\s/,                       // find files
    /^\s*wc\s/,                         // word count
    /^\s*diff\s/,                       // diff
    /^\s*git\s+(status|log|diff|show|branch|remote|tag|stash\s+list)\b/,
    /^\s*git\s+(add|commit)\b/,           // per-pass commits during sweep/deep-build
    /^\s*node\s+[^\s]*validate-manifest\.js/,  // our own validation script
    /^\s*node\s+[^\s]*validate-spec\.js/,     // our own spec validator
    /^\s*node\s+[^\s]*next-node\.js/,         // our own next-node script
    /^\s*node\s+[^\s]*session-start\.js/,     // our own session-start script
    /^\s*node\s+[^\s]*topo-sort\.js/,         // our own topo-sort script
    /^\s*node\s+[^\s]*status-report\.js/,     // our own status report script
    /^\s*node\s+[^\s]*integrate-check\.js/,   // our own integration checker
    /^\s*node\s+[^\s]*cross-model-review\.js/, // our own cross-model review script
    /^\s*node\s+[^\s]*measure-quality\.js/,   // our own quality measurement script
    /^\s*node\s+[^\s]*find-affected-nodes\.js/, // our own affected-node finder
    /^\s*node\s+[^\s]*regenerate-shared-types\.js/, // our own type generator
    /^\s*node\s+[^\s]*cross-model-bridge\.js/,   // Sprint 6: cross-model sweep bridge
    /^\s*codex\b/,                        // cross-model review via Codex CLI
    /^\s*gemini\b/,                       // cross-model review via Gemini CLI
    /^\s*claude\s+mcp\s+(call|list)\b/,   // cross-model review via MCP
    /^\s*npm\s+(test|run\s+test|run\s+lint|run\s+validate|install)\b/, // test/lint/install — NOTE: npm install can execute pre/postinstall scripts; tradeoff accepted since blocking installs breaks build workflows
    /^\s*npx\s+tsc\b/,                 // type checking
    /^\s*pwd\b/,                        // print working directory
    /^\s*echo\s/,                       // echo without redirection (checked below)
    /^\s*Get-Content\b/i,              // PowerShell read
    /^\s*Get-ChildItem\b/i,            // PowerShell list
    /^\s*Get-Item\b/i,                 // PowerShell get item
    /^\s*Test-Path\b/i,                // PowerShell test path
    /^\s*Select-String\b/i,            // PowerShell grep
  ];

  // Block command substitution patterns that can hide mutations inside safe commands
  if (/\$\(|`[^`]*`|<\(|>\(/.test(command)) {
    return {
      block: true,
      message:
        `BLOCKED: Command substitution ($(), backticks, process substitution) is not allowed during active ${activeStatus} operations. ` +
        `Use the Write or Edit tool for file operations.`,
    };
  }

  // Split command on chaining operators AND newlines (newlines are command separators in shell)
  const segments = command.split(/\s*(?:\r?\n|\r|;|&&|\|\||(?<!\|)\|(?!\|))\s*/).filter(Boolean);

  const allSegmentsSafe = segments.every((seg) => {
    const trimmed = seg.trim();
    if (!trimmed) return true;
    const matchesSafe = safePatterns.some((p) => p.test(trimmed));
    // Strip safe redirections (2>&1, 2>/dev/null, >/dev/null) before checking for file redirections
    const stripped = trimmed.replace(/\d+>&\d+/g, "").replace(/\d+>\s*\/dev\/null/g, "").replace(/>\s*\/dev\/null/g, "");
    const hasUnsafeRedirection = />\s*[^\s]/.test(stripped) || /\|\s*Out-File/i.test(stripped);
    return matchesSafe && !hasUnsafeRedirection;
  });

  if (allSegmentsSafe) {
    return { block: false };
  }

  return {
    block: true,
    message:
      `BLOCKED: Bash commands are restricted during active ${activeStatus} operations. ` +
      `Use the Write or Edit tool for file operations — this ensures file scope enforcement, ` +
      `shared model guards, and file registration work correctly. ` +
      `Read-only commands (ls, cat, grep, git status, npm test, etc.) are allowed.`,
  };
}

/**
 * Find which node owns a given file path by checking file_scope globs.
 */
function findOwningNode(nodes, filePath, excludeNodeId) {
  for (const [nodeId, nodeData] of Object.entries(nodes)) {
    if (nodeId === excludeNodeId) continue;
    if (nodeData.file_scope) {
      // Normalize backslashes to forward slashes for Windows compatibility
      const normalizedScope = nodeData.file_scope.replace(/\\/g, "/");
      if (minimatch(filePath, normalizedScope)) {
        return nodeId;
      }
    }
  }
  return null;
}

// Export for testing
if (require.main !== module) {
  module.exports = { evaluate, findOwningNode };
}
