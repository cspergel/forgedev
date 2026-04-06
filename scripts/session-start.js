#!/usr/bin/env node

/**
 * SessionStart Hook — ForgePlan Core
 *
 * Runs when a Claude Code session starts or resumes.
 *
 * Problem detection (priority):
 *   - Stuck builds (active_node in building/reviewing/etc.)
 *   - Interrupted sweeps/deep-builds
 *   - Blocked decisions from sweep
 *   - Missing manifest
 *   - Corrupted state.json
 *
 * Ambient healthy-state display (Sprint 7B Pillar 1):
 *   - One-line project summary with node counts and suggested next command
 *   - Complexity tier from manifest
 *   - Active sweep progress (non-stuck)
 */

const fs = require("fs");
const path = require("path");

function main() {
  const cwd = process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");

  // Check if .forgeplan/ exists in the current project
  if (!fs.existsSync(forgePlanDir)) {
    // No ForgePlan project — show first-run welcome
    process.stderr.write(
      "\n" +
      "--- ForgePlan Core ---\n" +
      "Architecture-governed AI build harness.\n" +
      "\n" +
      "No project detected in this directory. Quick start:\n" +
      "  /forgeplan:discover    Describe what you want to build\n" +
      "  /forgeplan:guide       Walkthrough of how ForgePlan works\n" +
      "  /forgeplan:help        See all commands\n" +
      "---------------------------\n"
    );
    process.exit(0);
  }

  const statePath = path.join(forgePlanDir, "state.json");
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");

  const warnings = [];
  let state = null;
  let stateCorrupted = false;

  // ─── Problem Detection ───────────────────────────────────────────

  // Check for stuck builds in state.json
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

      // Clear stale stop_hook_active flag and bounce_count from crashed sessions
      if (state.stop_hook_active) {
        state.stop_hook_active = false;
        // Reset per-node bounce_count for the active node (stop-hook reads this, not top-level)
        if (state.active_node && state.active_node.node && state.nodes && state.nodes[state.active_node.node]) {
          state.nodes[state.active_node.node].bounce_count = 0;
        }
        delete state.bounce_count; // Remove spurious top-level field if it exists
        state.last_updated = new Date().toISOString();
        try {
          fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
        } catch { /* best effort */ }
        warnings.push(
          `Cleaned up stale build state from a previous session. No action needed.`
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

      // Check for pending blocked decisions from a previous sweep
      if (state.sweep_state && state.sweep_state.blocked_decisions && state.sweep_state.blocked_decisions.length > 0) {
        const count = state.sweep_state.blocked_decisions.length;
        warnings.push(
          `PENDING: ${count} architectural decision(s) from the last sweep need your input before the pipeline can continue.`
        );
        warnings.push(`Run /forgeplan:sweep to review and resolve them, or see them with /forgeplan:status.`);
      }
    } catch (err) {
      stateCorrupted = true;
      warnings.push(
        `WARNING: .forgeplan/state.json is corrupted: ${err.message}. To fix: delete it with 'rm .forgeplan/state.json' then run /forgeplan:recover, or run /forgeplan:discover to reinitialize.`
      );
    }
  }

  // Check manifest exists
  let manifestMissing = false;
  if (!fs.existsSync(manifestPath)) {
    manifestMissing = true;
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

  // ─── Ambient Healthy-State Display ───────────────────────────────
  // Only show when there are no blocking problems
  if (!stateCorrupted && !manifestMissing) {
    try {
      const ambient = buildAmbientStatus(forgePlanDir, manifestPath, statePath, state);
      if (ambient) {
        process.stderr.write(ambient);
      }
    } catch {
      // Ambient display must never block — swallow all errors
    }
  }

  process.exit(0);
}

/**
 * Build the ambient healthy-state display string.
 * Returns null if there's nothing useful to show.
 */
function buildAmbientStatus(forgePlanDir, manifestPath, statePath, state) {
  // Load manifest via js-yaml
  let yaml;
  try {
    yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));
  } catch {
    // js-yaml not installed — skip ambient display
    return null;
  }

  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }

  if (!manifest || !manifest.nodes || typeof manifest.nodes !== "object") {
    return null;
  }

  const nodeIds = Object.keys(manifest.nodes);
  if (nodeIds.length === 0) {
    return null;
  }

  // Gather node statuses from state
  const nodeStates = (state && state.nodes) ? state.nodes : {};

  const counts = {
    total: nodeIds.length,
    pending: 0,
    specced: 0,
    built: 0,       // includes "built" and "revised"
    reviewed: 0,    // includes "reviewed"
    inProgress: 0,  // building, reviewing, review-fixing, revising, sweeping
  };

  const inProgressStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];
  const builtStatuses = ["built", "revised"];

  for (const id of nodeIds) {
    const ns = nodeStates[id];
    const status = (ns && ns.status) ? ns.status : "pending";

    if (status === "pending") {
      counts.pending++;
    } else if (status === "specced") {
      counts.specced++;
    } else if (builtStatuses.includes(status)) {
      counts.built++;
    } else if (status === "reviewed") {
      counts.reviewed++;
    } else if (inProgressStatuses.includes(status)) {
      counts.inProgress++;
    }
  }

  // Project name
  const projectName = (manifest.project && manifest.project.name)
    ? manifest.project.name
    : "Untitled";

  // Complexity tier
  const tier = (manifest.project && manifest.project.complexity_tier)
    ? manifest.project.complexity_tier
    : null;

  // Determine suggested next command based on project state
  const suggestion = determineSuggestion(counts, state);

  // Build the output lines
  const lines = [];
  lines.push("");
  lines.push("--- ForgePlan ---");

  // One-line summary
  const reviewedCount = counts.reviewed;
  const builtOrReviewed = counts.built + counts.reviewed;
  let summaryLine = `${projectName} -- ${counts.total} nodes (${builtOrReviewed} built, ${reviewedCount} reviewed)`;
  if (tier) {
    summaryLine += ` | Tier: ${tier}`;
  }
  lines.push(summaryLine);

  // Active sweep progress (non-stuck — stuck sweeps are already shown as warnings above)
  const sweepProgress = getSweepProgress(state);
  if (sweepProgress) {
    lines.push(sweepProgress);
  }

  // Next command suggestion
  if (suggestion) {
    lines.push(`Next: ${suggestion}`);
  }

  lines.push("-----------------");

  return lines.join("\n") + "\n";
}

/**
 * Determine the contextual next-command suggestion based on aggregate node states.
 */
function determineSuggestion(counts, state) {
  const { total, pending, specced, built, reviewed, inProgress } = counts;

  // If there's an active sweep that completed, suggest status/measure
  if (state && state.sweep_state) {
    const ss = state.sweep_state;
    // Sweep completed successfully (not halted, not interrupted)
    if (ss.current_phase === "finalizing" || (!ss.operation && ss.pass_number)) {
      return "/forgeplan:status or /forgeplan:measure";
    }
  }

  // All reviewed — suggest sweep or integrate
  if (reviewed === total) {
    return "/forgeplan:sweep --cross-check or /forgeplan:integrate";
  }

  // All built (including revised) or mix of built+reviewed — suggest review or sweep
  if ((built + reviewed) === total && total > 0) {
    return "/forgeplan:review or /forgeplan:sweep";
  }

  // Some built, some not — suggest next
  if ((built + reviewed) > 0 && (built + reviewed) < total) {
    return "/forgeplan:next";
  }

  // All specced — suggest build or deep-build
  if (specced === total && total > 0) {
    return "/forgeplan:build or /forgeplan:deep-build";
  }

  // Mix of specced and pending — suggest spec
  if (specced > 0 && pending > 0 && (specced + pending) === total) {
    return "/forgeplan:spec";
  }

  // All pending — suggest spec --all
  if (pending === total && total > 0) {
    return "/forgeplan:spec --all";
  }

  // Some in-progress work — suggest next
  if (inProgress > 0) {
    return "/forgeplan:next";
  }

  // Fallback
  return "/forgeplan:next";
}

/**
 * Get sweep progress line for active (non-stuck) sweeps.
 * Returns null if no active sweep or if sweep is stuck/interrupted
 * (those are already handled by the warning logic).
 */
function getSweepProgress(state) {
  if (!state || !state.sweep_state || !state.sweep_state.operation) {
    return null;
  }

  const ss = state.sweep_state;

  // Skip if the sweep is in a stuck/interrupted state — warnings already cover it.
  // We detect "stuck" here by checking if there's also an active_node in a bad status,
  // which means the warning section already printed a recovery message.
  const stuckStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];
  if (state.active_node && stuckStatuses.includes(state.active_node.status)) {
    return null;
  }

  const op = ss.operation === "deep-building" ? "Deep-build" : "Sweep";
  const phase = ss.current_phase || "unknown";
  const pass = ss.pass_number || 1;

  // Count resolved findings
  let resolvedCount = 0;
  if (ss.findings && ss.findings.resolved && Array.isArray(ss.findings.resolved)) {
    resolvedCount = ss.findings.resolved.length;
  }

  // Count pending findings
  let pendingCount = 0;
  if (ss.findings && ss.findings.pending && Array.isArray(ss.findings.pending)) {
    pendingCount = ss.findings.pending.length;
  }

  let line = `${op} in progress: pass ${pass}, phase: ${phase}`;
  if (resolvedCount > 0 || pendingCount > 0) {
    line += `, ${resolvedCount} findings resolved`;
    if (pendingCount > 0) {
      line += `, ${pendingCount} pending`;
    }
  }

  return line;
}

main();
