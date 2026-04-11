#!/usr/bin/env node

/**
 * stop-hook.js — ForgePlan Core Stop Hook
 *
 * Fires when Claude finishes responding during an active build.
 * Prevents builds from completing with unmet acceptance criteria.
 *
 * Flow:
 *   1. Check if there's an active build (status === "building")
 *   2. Clear stop_hook_active (reset from previous bounce cycle)
 *   3. Check bounce counter (< 3 = bounce, >= 3 = escalate to user)
 *   4. If bouncing: increment counter, exit 2 with AC evaluation instructions
 *   5. Claude evaluates ACs per the exit-2 message, then uses state-transition.js complete-build if all pass
 *   6. Claude tries to stop again → hook re-fires, counter incremented
 *
 * The exit-2 message instructs Claude to:
 *   - Read the node's spec and evaluate each AC by ID
 *   - If ALL ACs pass: use the deterministic complete-build transition helper
 *   - If any AC fails: continue working to address it
 *
 * Input: JSON on stdin with session context
 * Output:
 *   Exit 0 — allow stop (no active build, or escalated to user)
 *   Exit 2 — block stop (message instructs Claude to evaluate criteria)
 */

const fs = require("fs");
const path = require("path");

const { atomicWriteJson, NODE_ID_REGEX } = require("./lib/atomic-write");

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
    // On parse error, allow stop (fail-open — don't trap the user)
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
  // Stop hook only fires for full builds, not reviews, revises, review-fixing, or sweep fixes.
  // review-fixing (fixer agents during multi-agent review cycles) is verified by the
  // subsequent re-review, not by AC evaluation — so allow stop without checking.
  // Sweep fixes ("sweeping") are verified by cross-model re-check, not AC evaluation.
  if (!state.active_node || state.active_node.status !== "building") {
    return { block: false };
  }

  const activeNodeId = state.active_node.node;

  // --- Validate node ID format before using in path constructions ---
  if (!NODE_ID_REGEX.test(activeNodeId)) {
    process.stderr.write(
      `ForgePlan Stop: active node ID "${activeNodeId}" has invalid format — skipping AC evaluation.\n`
    );
    return { block: false };
  }

  // --- Clear stop_hook_active from previous bounce cycle ---
  // This flag is only meaningful within a single bounce cycle. Clearing it
  // here allows multi-bounce to work (up to 3 bounces before escalation).
  // session-start.js also clears this on new sessions as a safety net.
  if (state.stop_hook_active) {
    state.stop_hook_active = false;
    state.last_updated = new Date().toISOString();
    try {
      atomicWriteJson(statePath, state);
    } catch { /* best effort */ }
  }

  // --- Bounce counter check ---
  if (!state.nodes) state.nodes = {};
  if (!state.nodes[activeNodeId]) {
    state.nodes[activeNodeId] = { status: "building" };
  }

  const bounceCount = state.nodes[activeNodeId].bounce_count || 0;

  if (bounceCount >= 3) {
    // Escalate to user — too many bounces, stop hook is not helping
    // Do NOT auto-complete — leave status as "building" so the user can decide
    // Clear stop_hook_active to prevent re-entry issues
    try {
      state.stop_hook_active = false;
      state.last_updated = new Date().toISOString();
      atomicWriteJson(statePath, state);
    } catch { /* best effort */ }

    process.stderr.write(
      `ForgePlan Stop: Node "${activeNodeId}" has bounced ${bounceCount} times without resolving all criteria. ` +
      `Escalating to user. The build is still in progress — you can:\n` +
      `  - Continue working on unmet criteria manually\n` +
      `  - Run /forgeplan:recover ${activeNodeId} and choose RESUME to restart the Builder agent\n` +
      `  - Run /forgeplan:recover ${activeNodeId} and choose REVIEW to mark as built and assess partial completion\n`
    );
    return { block: false };
  }

  // --- Layer 1 passed: active build, under bounce limit, not in loop ---
  // Set stop_hook_active to prevent re-entry, increment bounce counter
  try {
    state.stop_hook_active = true;
    state.nodes[activeNodeId].bounce_count = bounceCount + 1;
    state.last_updated = new Date().toISOString();
    atomicWriteJson(statePath, state);
  } catch (err) {
    // Can't update state — allow stop rather than trap
    process.stderr.write(
      `ForgePlan Stop: Could not update state.json: ${err.message}\n`
    );
    return { block: false };
  }

  // Block the stop — instruct Claude to evaluate acceptance criteria
  return {
    block: true,
    message:
      `ForgePlan Stop: Build for "${activeNodeId}" is not yet verified (bounce ${bounceCount + 1}/3).\n` +
      `\n` +
      `YOU MUST evaluate acceptance criteria before stopping:\n` +
      `1. Read the node spec at .forgeplan/specs/${activeNodeId}.yaml\n` +
      `2. For EACH acceptance criterion (AC1, AC2, etc.), verify it is met by the code you wrote. Check the 'test' field for each AC.\n` +
      `3. If ALL criteria pass:\n` +
      `   - Run: node "${'${CLAUDE_PLUGIN_ROOT}'}/scripts/state-transition.js" complete-build "${activeNodeId}"\n` +
      `   - Then you may stop.\n` +
      `4. If any criterion FAILS: continue working to address it. Do NOT stop until all criteria pass or you've exhausted your attempts.\n`,
  };
}

// Export for testing
if (require.main !== module) {
  module.exports = { evaluate };
}
