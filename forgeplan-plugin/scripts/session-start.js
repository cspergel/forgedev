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

      // Clear stale stop_hook_active flag from crashed sessions
      if (state.stop_hook_active) {
        state.stop_hook_active = false;
        state.last_updated = new Date().toISOString();
        try {
          fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
        } catch { /* best effort */ }
        warnings.push(
          `WARNING: Cleared stale stop_hook_active flag from previous session.`
        );
      }

      // Check if active_node was left in any in-progress status
      const stuckStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];
      if (
        state.active_node &&
        stuckStatuses.includes(state.active_node.status)
      ) {
        warnings.push(
          `WARNING: Node "${state.active_node.node}" was left in "${state.active_node.status}" status. ` +
            `It may have crashed. Run /forgeplan:recover to resume, reset, or review.`
        );
      }

      // Check for any nodes stuck in in-progress statuses
      if (state.nodes) {
        for (const [nodeId, nodeState] of Object.entries(state.nodes)) {
          if (
            stuckStatuses.includes(nodeState.status) &&
            (!state.active_node || state.active_node.node !== nodeId)
          ) {
            warnings.push(
              `WARNING: Node "${nodeId}" is stuck in "${nodeState.status}" status. Run /forgeplan:recover.`
            );
          }
        }
      }

      // Check for interrupted sweep/deep-build
      if (state.sweep_state && state.sweep_state.operation) {
        const ss = state.sweep_state;
        const op = ss.operation === "deep-building" ? "deep-build" : "sweep";

        // If both active_node AND sweep_state exist, this is a single crash event
        // (e.g., deep-build was mid-build, or sweep was mid-fix). Show ONE combined warning.
        if (state.active_node && stuckStatuses.includes(state.active_node.status)) {
          // Remove any per-node warning already pushed for this node (avoid duplication)
          const nodeId = state.active_node.node;
          const idx = warnings.findIndex(w => w.includes(`"${nodeId}"`));
          if (idx !== -1) warnings.splice(idx, 1);

          warnings.push(
            `WARNING: An interrupted ${op} was detected during node "${nodeId}" ` +
            `${state.active_node.status === "sweeping" ? "fix" : "build"} ` +
            `(phase: ${ss.current_phase}, pass: ${ss.pass_number}). ` +
            `Run /forgeplan:recover to resume or abort the ${op}.`
          );
        } else {
          warnings.push(
            `WARNING: An interrupted ${op} was detected (phase: ${ss.current_phase}, pass: ${ss.pass_number}). ` +
            `Run /forgeplan:recover to resume, restart the current pass, or abort.`
          );
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
