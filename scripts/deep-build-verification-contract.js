#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { loadConfig, resolveReviewConfig } = require("./lib/review-config");

function safeReadJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function safeReadYaml(filePath, fallback = null) {
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function summarizeNodeStates(nodes) {
  const summary = {
    total: 0,
    reviewed: 0,
    reviewed_with_findings: 0,
    built: 0,
    other: 0,
  };

  for (const node of Object.values(nodes || {})) {
    summary.total += 1;
    const status = node && node.status ? node.status : "pending";
    if (status === "reviewed") summary.reviewed += 1;
    else if (status === "reviewed-with-findings") summary.reviewed_with_findings += 1;
    else if (status === "built") summary.built += 1;
    else summary.other += 1;
  }

  return summary;
}

function integrationVerdictPasses(verdict) {
  return verdict === "PASS" || verdict === "PASS_WITH_WARNINGS";
}

function describeReadiness(level) {
  switch (level) {
    case "full-certification":
      return "All required deterministic gates passed, node review state is complete, runtime verification is satisfied, and certification requirements are met.";
    case "degraded-certification":
      return "Deterministic gates passed and the project is runnable, but certification is explicitly degraded because LARGE-tier cross-model verification was intentionally skipped.";
    case "manual-testing-ready":
      return "The project passed runnable and integration gates strongly enough for targeted manual testing, but the run does not justify a certified completion claim.";
    default:
      return "The available artifacts do not justify a readiness or certification claim.";
  }
}

function main() {
  const cwd = process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");
  const manifest = safeReadYaml(path.join(forgePlanDir, "manifest.yaml"), {}) || {};
  const state = safeReadJson(path.join(forgePlanDir, "state.json"), {}) || {};
  const config = loadConfig(path.join(forgePlanDir, "config.yaml"));
  const reviewConfig = resolveReviewConfig(config);

  const verifyRunnable = safeReadJson(path.join(forgePlanDir, "verify-runnable.json"), null);
  const integrateCheck = safeReadJson(path.join(forgePlanDir, "integrate-check.json"), null);
  const runtimeVerify = safeReadJson(path.join(forgePlanDir, "runtime-verify.json"), null);
  const crossModelCheck = safeReadJson(path.join(forgePlanDir, "cross-model-check.json"), null);

  const tier =
    (config.complexity && config.complexity.tier_override) ||
    (manifest.project && manifest.project.complexity_tier) ||
    "MEDIUM";

  const nodeSummary = summarizeNodeStates(state.nodes || {});
  const allNodesReviewComplete = nodeSummary.built === 0 && nodeSummary.other === 0;

  const verifyRunnablePassed = Boolean(
    verifyRunnable && (verifyRunnable.status === "pass" || verifyRunnable.status === "warnings")
  );
  const integrationPassed = Boolean(
    integrateCheck && integrationVerdictPasses(integrateCheck.verdict || integrateCheck.status || null)
  );

  const runtimeRequired = tier !== "SMALL";
  const runtimeSatisfied = runtimeRequired
    ? Boolean(runtimeVerify && runtimeVerify.status === "pass")
    : true;

  const crossModelConfigured = reviewConfig.mode && reviewConfig.mode !== "native";
  const allowLargeTierSkip = reviewConfig.allow_large_tier_skip === true;
  const crossModelRequired = tier === "LARGE" && !allowLargeTierSkip;
  const crossModelClean = Boolean(crossModelCheck && crossModelCheck.status === "clean");
  const crossModelSkipped = Boolean(crossModelCheck && crossModelCheck.status === "skipped");
  const crossModelSatisfied = tier === "SMALL"
    ? true
    : tier === "MEDIUM"
      ? (crossModelClean || crossModelSkipped || !crossModelConfigured)
      : allowLargeTierSkip
        ? true
        : crossModelClean;

  const blockers = [];
  if (!verifyRunnablePassed) blockers.push("verify-runnable did not pass");
  if (!integrationPassed) blockers.push("final integrate-check did not pass");
  if (!allNodesReviewComplete) blockers.push(`terminal node state incomplete (${nodeSummary.built} built, ${nodeSummary.other} other)`);
  if (runtimeRequired && !runtimeSatisfied) blockers.push("runtime verification not satisfied");
  if (crossModelRequired && !crossModelSatisfied) blockers.push("required cross-model verification not satisfied");

  let level = "not-ready";
  if (verifyRunnablePassed && integrationPassed) {
    level = "manual-testing-ready";
  }
  if (verifyRunnablePassed && integrationPassed && allNodesReviewComplete && runtimeSatisfied && crossModelSatisfied) {
    level = allowLargeTierSkip && tier === "LARGE"
      ? "degraded-certification"
      : "full-certification";
  }

  const result = {
    type: "deep_build_verification_contract",
    tier,
    node_summary: nodeSummary,
    verification: {
      verify_runnable: verifyRunnable ? {
        status: verifyRunnable.status || null,
        summary: verifyRunnable.summary || null,
      } : null,
      integration: integrateCheck ? {
        verdict: integrateCheck.verdict || integrateCheck.status || null,
        total: integrateCheck.total || 0,
        passed: integrateCheck.passed || 0,
        failed: integrateCheck.failed || 0,
        warned: integrateCheck.warned || 0,
      } : null,
      runtime: runtimeVerify ? {
        status: runtimeVerify.status || null,
        tier: runtimeVerify.tier || tier,
        level_reached: runtimeVerify.level_reached || 0,
        endpoints_tested: runtimeVerify.endpoints_tested || 0,
        endpoints_passed: runtimeVerify.endpoints_passed || 0,
      } : null,
      cross_model: crossModelCheck ? {
        status: crossModelCheck.status || null,
        mode: crossModelCheck.mode || null,
        provider: crossModelCheck.provider || null,
        findings_count: crossModelCheck.findings_count || 0,
        report_path: crossModelCheck.report_path || null,
      } : null,
    },
    requirements: {
      runtime_required: runtimeRequired,
      cross_model_required: crossModelRequired,
      cross_model_configured: Boolean(crossModelConfigured),
      allow_large_tier_skip: allowLargeTierSkip,
    },
    readiness: {
      level,
      summary: describeReadiness(level),
      may_claim_manual_testing_ready: level !== "not-ready",
      may_claim_project_ready: level === "full-certification" || level === "degraded-certification",
      may_claim_full_certification: level === "full-certification",
      must_label_degraded_certification: level === "degraded-certification",
      must_warn_not_fully_certified: level === "manual-testing-ready",
      blockers,
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
