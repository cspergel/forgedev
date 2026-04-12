"use strict";

const STUCK_STATUSES = new Set(["building", "reviewing", "review-fixing", "revising", "sweeping"]);

function getSweepRecoveryRecommendation(state) {
  const ss = state && state.sweep_state;
  if (!ss || !ss.operation) return null;

  const activeNode = state.active_node && STUCK_STATUSES.has(state.active_node.status)
    ? state.active_node
    : null;
  const phase = ss.current_phase || "unknown";
  const operation = ss.operation === "deep-building" ? "deep-build" : "sweep";
  const fixingNode = ss.fixing_node || (activeNode ? activeNode.node : null);
  const isMidFix =
    Boolean(fixingNode) ||
    (activeNode && activeNode.status === "sweeping") ||
    phase === "claude-fix" ||
    phase === "cross-fix";

  if (isMidFix) {
    return {
      scope: "sweep",
      operation,
      optionNumber: 2,
      optionLabel: "RESTART PASS",
      confidence: "high",
      reason:
        `Crash happened during node-scoped ${operation} remediation` +
        (fixingNode ? ` for "${fixingNode}"` : "") +
        `. Partial fixes may be on disk, so replaying the pass from scratch is safer than resuming mid-fix.`,
      autonomousAction: "restart-pass",
    };
  }

  if (phase === "build-all") {
    return {
      scope: "sweep",
      operation,
      optionNumber: 1,
      optionLabel: "RESUME",
      confidence: activeNode ? "medium" : "high",
      reason: activeNode
        ? `Crash happened during ${operation} build-all while "${activeNode.node}" was active. The build loop can recover the stuck node inline and continue.`
        : `Crash happened between build-all steps. Resuming keeps prior progress and restarts only the interrupted loop.`,
      autonomousAction: "resume",
    };
  }

  return {
    scope: "sweep",
    operation,
    optionNumber: 1,
    optionLabel: "RESUME",
    confidence: "high",
    reason:
      `Crash happened during phase "${phase}" without an active node-scoped fix. Resuming preserves completed work and continues from the existing phase boundary.`,
    autonomousAction: "resume",
  };
}

function getNodeRecoveryRecommendation(state) {
  const activeNode = state && state.active_node;
  if (!activeNode || !STUCK_STATUSES.has(activeNode.status)) {
    return null;
  }

  const nodeId = activeNode.node || "unknown";
  switch (activeNode.status) {
    case "building":
      return {
        scope: "node",
        optionNumber: 1,
        optionLabel: "RESUME",
        confidence: "medium",
        reason: `Node "${nodeId}" was interrupted mid-build. Resume is the least destructive default; use RESET only if generated files are clearly corrupted.`,
        autonomousAction: "resume",
      };
    case "reviewing":
      return {
        scope: "node",
        optionNumber: 1,
        optionLabel: "RESUME",
        confidence: "high",
        reason: `Node "${nodeId}" was interrupted mid-review. Restarting the review is usually correct and keeps the implementation unchanged.`,
        autonomousAction: "resume",
      };
    case "review-fixing":
      return {
        scope: "node",
        optionNumber: 1,
        optionLabel: "RESUME REVIEW",
        confidence: "high",
        reason: `Node "${nodeId}" crashed during a review-fix cycle. Re-running review is safer than trusting partial fixer edits.`,
        autonomousAction: "resume-review",
      };
    case "revising":
      return {
        scope: "node",
        optionNumber: 1,
        optionLabel: "RESUME",
        confidence: "medium",
        reason: `Node "${nodeId}" was interrupted mid-revision. Resume first; use ROLLBACK only if spec or shared-type changes are known-bad.`,
        autonomousAction: "resume",
      };
    default:
      return null;
  }
}

function getRecoveryRecommendation(state) {
  return getSweepRecoveryRecommendation(state) || getNodeRecoveryRecommendation(state);
}

module.exports = {
  getRecoveryRecommendation,
};
