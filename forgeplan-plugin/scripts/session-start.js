#!/usr/bin/env node

/**
 * SessionStart Hook — ForgePlan Core
 *
 * Runs when a Claude Code session starts or resumes.
 * Checks for .forgeplan/ directory and flags any nodes stuck in "building" status.
 */

const fs = require("fs");
const path = require("path");

function main() {
  const cwd = process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");

  // Check if .forgeplan/ exists in the current project
  if (!fs.existsSync(forgePlanDir)) {
    // No ForgePlan project — nothing to do
    process.exit(0);
  }

  const statePath = path.join(forgePlanDir, "state.json");
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");

  const warnings = [];

  // Check for stuck builds in state.json
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

      if (state.active_node && state.active_node.status === "building") {
        warnings.push(
          `WARNING: Node "${state.active_node.node}" was left in "building" status. ` +
            `It may have crashed. Run /forgeplan:recover to resume, reset, or review.`
        );
      }

      // Check for any nodes stuck in building status
      if (state.nodes) {
        for (const [nodeId, nodeState] of Object.entries(state.nodes)) {
          if (
            nodeState.status === "building" &&
            (!state.active_node || state.active_node.node !== nodeId)
          ) {
            warnings.push(
              `WARNING: Node "${nodeId}" is stuck in "building" status. Run /forgeplan:recover.`
            );
          }
        }
      }
    } catch (err) {
      warnings.push(
        `WARNING: Could not parse .forgeplan/state.json: ${err.message}`
      );
    }
  }

  // Check manifest exists
  if (!fs.existsSync(manifestPath)) {
    warnings.push(
      `ForgePlan project detected but no manifest.yaml found. Run /forgeplan:discover to create one.`
    );
  }

  // Output warnings to stderr (shown to Claude as feedback)
  if (warnings.length > 0) {
    process.stderr.write(
      "\n--- ForgePlan Session Check ---\n" +
        warnings.join("\n") +
        "\n-------------------------------\n"
    );
  }

  process.exit(0);
}

main();
