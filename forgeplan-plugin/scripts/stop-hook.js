#!/usr/bin/env node

/**
 * stop-hook.js — ForgePlan Core Stop Hook
 *
 * Fires when Claude finishes responding during an active build.
 * Prevents builds from completing with unmet acceptance criteria.
 *
 * Two-layer enforcement:
 *   Layer 1 — Deterministic: bounce counter check, stop_hook_active flag
 *   Layer 2 — Defined as prompt hook in hooks.json (LLM evaluates criteria)
 *
 * This script handles Layer 1 only. If Layer 1 passes (no active build,
 * or bounce limit reached), it allows the stop. If Layer 1 detects an
 * active build with room to bounce, it sets up for Layer 2's prompt check.
 *
 * Input: JSON on stdin with session context
 * Output:
 *   Exit 0 — allow stop (no active build, or escalated to user)
 *   Exit 2 — block stop (Layer 2 prompt will evaluate criteria)
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
    const result = evaluate(input);
    if (result.block) {
      process.stderr.write(result.message + "\n");
      process.exit(2);
    }
    process.exit(0);
  } catch (err) {
    // On parse error, allow stop (fail-open for stop is safer than trapping the user)
    process.stderr.write(
      `ForgePlan Stop hook warning: ${err.message}\n`
    );
    process.exit(0);
  }
});

function evaluate(input) {
  const cwd = input.cwd || process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");
  const statePath = path.join(forgePlanDir, "state.json");

  // No .forgeplan directory — nothing to enforce
  if (!fs.existsSync(forgePlanDir) || !fs.existsSync(statePath)) {
    return { block: false };
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch {
    // Corrupted state — allow stop (don't trap the user)
    return { block: false };
  }

  // --- Layer 1 Check 1: Is there an active build? ---
  // Stop hook only fires for builds, not reviews or revises
  if (!state.active_node || state.active_node.status !== "building") {
    return { block: false };
  }

  const activeNodeId = state.active_node.node;

  // --- Layer 1 Check 2: Is stop_hook_active? (prevent infinite loops) ---
  if (state.stop_hook_active) {
    // Already in a stop hook evaluation cycle — allow stop to prevent loops
    return { block: false };
  }

  // --- Layer 1 Check 3: Bounce counter ---
  if (!state.nodes) state.nodes = {};
  if (!state.nodes[activeNodeId]) {
    state.nodes[activeNodeId] = { status: "building" };
  }

  const bounceCount = state.nodes[activeNodeId].bounce_count || 0;

  if (bounceCount >= 3) {
    // Escalate to user — too many bounces, stop hook is not helping
    // Auto-mark as built so review command can accept it
    try {
      state.nodes[activeNodeId].status = "built";
      state.nodes[activeNodeId].last_build_completed = new Date().toISOString();
      state.active_node = null;
      state.stop_hook_active = false;
      state.last_updated = new Date().toISOString();
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
    } catch { /* best effort */ }

    process.stderr.write(
      `ForgePlan Stop: Node "${activeNodeId}" has bounced ${bounceCount} times without resolving all criteria. ` +
      `Build force-completed. Run /forgeplan:review ${activeNodeId} to see what's still unmet.\n`
    );
    return { block: false };
  }

  // --- Layer 1 passed: active build, under bounce limit, not in loop ---
  // Set stop_hook_active to prevent re-entry, increment bounce counter
  try {
    state.stop_hook_active = true;
    state.nodes[activeNodeId].bounce_count = bounceCount + 1;
    state.last_updated = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    // Can't update state — allow stop rather than trap
    process.stderr.write(
      `ForgePlan Stop: Could not update state.json: ${err.message}\n`
    );
    return { block: false };
  }

  // Block the stop — Layer 2 prompt hook will evaluate acceptance criteria
  // The prompt hook reads the spec and checks each criterion
  return {
    block: true,
    message:
      `ForgePlan Stop: Build for "${activeNodeId}" is not yet verified. ` +
      `Evaluating acceptance criteria (bounce ${bounceCount + 1}/3)...`,
  };
}

// Export for testing
if (require.main !== module) {
  module.exports = { evaluate };
}
