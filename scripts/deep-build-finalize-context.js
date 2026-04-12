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

function latestFile(dirPath, pattern) {
  if (!fs.existsSync(dirPath)) return null;
  const entries = fs.readdirSync(dirPath)
    .filter((name) => pattern.test(name))
    .map((name) => {
      const fullPath = path.join(dirPath, name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries.length > 0 ? entries[0].fullPath : null;
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

function classifyIntegrationWarning(item) {
  const detail = String(item && item.detail ? item.detail : "").toLowerCase();
  if (detail.includes("one-way dependency")) {
    return {
      key: "informational-one-way-dependency",
      actionable: false,
      reason: "reciprocal interface missing, but explicitly described as possible one-way dependency",
    };
  }
  if (detail.includes("shared model field inconsistency")) {
    return {
      key: "actionable-shared-model-inconsistency",
      actionable: true,
      reason: "shared model field references disagree across specs or manifest definitions",
    };
  }
  if (detail.includes("too vague for deterministic implementation verification")) {
    return {
      key: "actionable-vague-contract",
      actionable: true,
      reason: "contract text is too vague to verify safely",
    };
  }
  if (detail.includes("no canonical export file")) {
    return {
      key: "actionable-missing-export-anchor",
      actionable: true,
      reason: "cannot verify exports for the documented interface",
    };
  }
  if (detail.includes("no target files were available")) {
    return {
      key: "actionable-missing-target-files",
      actionable: true,
      reason: "target side has no files available for interface verification",
    };
  }
  if (detail.includes("did not find") && detail.includes("importing or using")) {
    return {
      key: "actionable-missing-usage-evidence",
      actionable: true,
      reason: "deterministic scans could not find target-side usage of contracted symbols",
    };
  }
  return {
    key: "actionable-generic-warning",
    actionable: true,
    reason: "warning requires sweep attention",
  };
}

function summarizeIntegrationWarnings(data) {
  const interfaces = Array.isArray(data && data.interfaces) ? data.interfaces : [];
  const warnings = interfaces.filter((item) => item && item.status === "WARN");
  const buckets = new Map();

  for (const item of warnings) {
    const cls = classifyIntegrationWarning(item);
    if (!buckets.has(cls.key)) {
      buckets.set(cls.key, {
        key: cls.key,
        actionable: cls.actionable,
        reason: cls.reason,
        count: 0,
      });
    }
    buckets.get(cls.key).count += 1;
  }

  const bucketList = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  const actionableCount = bucketList.filter((bucket) => bucket.actionable).reduce((sum, bucket) => sum + bucket.count, 0);
  const informationalCount = bucketList.filter((bucket) => !bucket.actionable).reduce((sum, bucket) => sum + bucket.count, 0);

  return {
    actionable_count: actionableCount,
    informational_count: informationalCount,
    all_informational: actionableCount === 0,
    buckets: bucketList,
  };
}

function readIntegrationSummary(forgePlanDir) {
  const integratePath = path.join(forgePlanDir, "integrate-check.json");
  const data = safeReadJson(integratePath, null);
  if (!data) return null;
  return {
    verdict: data.verdict || data.status || null,
    total: data.total || 0,
    passed: data.passed || 0,
    failed: data.failed || 0,
    pending: data.pending || 0,
    warned: data.warned || 0,
    warnings: summarizeIntegrationWarnings(data),
  };
}

function parseSweepReportSummary(reportPath) {
  if (!reportPath || !fs.existsSync(reportPath)) {
    return null;
  }

  const raw = fs.readFileSync(reportPath, "utf8");
  const totalMatch = raw.match(/Total findings:\s*(\d+)\s+node-scoped\s+\+\s+(\d+)\s+project-level/i);
  const severityMatch = raw.match(/High:\s*(\d+)\s*\|\s*Medium:\s*(\d+)\s*\|\s*Low:\s*(\d+)/i);
  const filteredMatch = raw.match(/Filtered low-confidence:\s*(\d+)/i);
  const projectLevelMatch = raw.match(/Project-level \(manual\):\s*(\d+)/i);

  return {
    node_scoped_total: totalMatch ? Number(totalMatch[1]) : null,
    project_level_total: totalMatch ? Number(totalMatch[2]) : null,
    high: severityMatch ? Number(severityMatch[1]) : null,
    medium: severityMatch ? Number(severityMatch[2]) : null,
    low: severityMatch ? Number(severityMatch[3]) : null,
    filtered_low_confidence: filteredMatch ? Number(filteredMatch[1]) : null,
    project_level_manual: projectLevelMatch ? Number(projectLevelMatch[1]) : null,
  };
}

function summarizeSweepState(sweepState) {
  if (!sweepState || typeof sweepState !== "object") {
    return null;
  }

  const findings = sweepState.findings && typeof sweepState.findings === "object" ? sweepState.findings : {};
  const pending = Array.isArray(findings.pending) ? findings.pending : [];
  const resolved = Array.isArray(findings.resolved) ? findings.resolved : [];
  const manualAttention = Array.isArray(sweepState.needs_manual_attention) ? sweepState.needs_manual_attention : [];

  const resolvedBy = {};
  let fixedCount = 0;
  let nonFixedResolvedCount = 0;

  for (const item of resolved) {
    const key = item && item.resolved_by ? String(item.resolved_by) : "unknown";
    resolvedBy[key] = (resolvedBy[key] || 0) + 1;
    if (key === "claude") {
      fixedCount += 1;
    } else {
      nonFixedResolvedCount += 1;
    }
  }

  const manualReasons = {};
  for (const item of manualAttention) {
    const key = item && item.reason ? String(item.reason) : "unspecified";
    manualReasons[key] = (manualReasons[key] || 0) + 1;
  }

  return {
    current_phase: sweepState.current_phase || null,
    pass_number: Number(sweepState.pass_number || 0),
    pending_count: pending.length,
    resolved_count: resolved.length,
    fixed_count: fixedCount,
    non_fixed_resolved_count: nonFixedResolvedCount,
    manual_attention_count: manualAttention.length,
    resolved_by: resolvedBy,
    manual_attention_reasons: manualReasons,
  };
}

function buildSweepReportingGuidance(integrationSummary, sweepStateSummary) {
  const actionableWarnings =
    integrationSummary && integrationSummary.warnings
      ? Number(integrationSummary.warnings.actionable_count || 0)
      : 0;
  const pendingCount = sweepStateSummary ? Number(sweepStateSummary.pending_count || 0) : 0;
  const manualAttentionCount = sweepStateSummary ? Number(sweepStateSummary.manual_attention_count || 0) : 0;
  const nonFixedResolvedCount = sweepStateSummary ? Number(sweepStateSummary.non_fixed_resolved_count || 0) : 0;

  return {
    may_describe_integration_warnings_as_all_informational: actionableWarnings === 0,
    must_mirror_runtime_artifact_first: true,
    may_claim_all_node_scoped_findings_fixed:
      pendingCount === 0 && manualAttentionCount === 0 && nonFixedResolvedCount === 0,
    must_avoid_sweep_clean_language:
      pendingCount > 0 || manualAttentionCount > 0 || nonFixedResolvedCount > 0,
  };
}

function listDir(relDirPath) {
  if (!fs.existsSync(relDirPath)) return [];
  return fs.readdirSync(relDirPath).sort();
}

function main() {
  const cwd = process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  const statePath = path.join(forgePlanDir, "state.json");
  const configPath = path.join(forgePlanDir, "config.yaml");

  const manifest = safeReadYaml(manifestPath, {}) || {};
  const state = safeReadJson(statePath, {}) || {};
  const config = loadConfig(configPath);
  const reviewConfig = resolveReviewConfig(config);

  const nodeSummaries = Object.entries(state.nodes || {}).map(([id, nodeState]) => ({
    node_id: id,
    status: nodeState.status || "pending",
    selected_builder_model: nodeState.selected_builder_model || null,
    selected_builder_model_reason: nodeState.selected_builder_model_reason || null,
  }));

  const tier =
    (config.complexity && config.complexity.tier_override) ||
    (manifest.project && manifest.project.complexity_tier) ||
    "MEDIUM";

  const crossModelConfigured = reviewConfig.mode && reviewConfig.mode !== "native";
  const explicitLargeSkip = reviewConfig.allow_large_tier_skip === true;
  const crossModelRequirement =
    tier === "LARGE" ? "required" : tier === "MEDIUM" ? "optional" : "skipped";
  const certificationLevel =
    tier === "LARGE" && !crossModelConfigured
      ? explicitLargeSkip
        ? "degraded-skip-allowed"
        : "missing-required-cross-model"
      : "normal";

  const latestSweepReport = latestFile(path.join(forgePlanDir, "sweeps"), /^sweep-.*\.md$/);
  const latestCrosscheckReport = latestFile(path.join(forgePlanDir, "sweeps"), /^crosscheck-.*\.md$/);
  const wikiDir = path.join(forgePlanDir, "wiki");
  const integrationSummary = readIntegrationSummary(forgePlanDir);
  const runtimeVerify = safeReadJson(path.join(forgePlanDir, "runtime-verify.json"), null);
  const sweepStateSummary = summarizeSweepState(state.sweep_state || null);

  const result = {
    type: "deep_build_finalize_context",
    project_name: manifest.project && manifest.project.name ? manifest.project.name : null,
    tier,
    build_phase_started_at: state.build_phase_started_at || null,
    last_updated: state.last_updated || null,
    active_node: state.active_node || null,
    sweep_state: state.sweep_state || null,
    node_summary: summarizeNodeStates(state.nodes || {}),
    nodes: nodeSummaries,
    review_mode: reviewConfig.mode || "native",
    review_provider: reviewConfig.provider || null,
    cross_model: {
      requirement: crossModelRequirement,
      configured: Boolean(crossModelConfigured),
      allow_large_tier_skip: explicitLargeSkip,
      certification_level: certificationLevel,
      latest_report: latestCrosscheckReport,
    },
    latest_sweep_report: latestSweepReport,
    integration: integrationSummary,
    runtime: runtimeVerify ? {
      status: runtimeVerify.status || null,
      error_type: runtimeVerify.errorType || null,
      message: runtimeVerify.message || runtimeVerify.error || runtimeVerify.summary || null,
      level_reached: runtimeVerify.level_reached || 0,
      endpoints_tested: runtimeVerify.endpoints_tested || 0,
      endpoints_passed: runtimeVerify.endpoints_passed || 0,
      artifact_path: path.join(".forgeplan", "runtime-verify.json"),
      reporting_rule: "Mirror runtime-verify.json status and error_type first. Any harness/workspace explanation must be labeled as interpretation, not deterministic fact.",
    } : null,
    sweep: {
      latest_report: latestSweepReport,
      report_summary: parseSweepReportSummary(latestSweepReport),
      state_summary: sweepStateSummary,
      reporting_guidance: buildSweepReportingGuidance(integrationSummary, sweepStateSummary),
    },
    research_artifacts: listDir(path.join(forgePlanDir, "research")),
    has_plan_dir: fs.existsSync(path.join(forgePlanDir, "plans")),
    has_skills_registry: fs.existsSync(path.join(forgePlanDir, "skills-registry.yaml")),
    design_docs: [
      "DESIGN.md",
      path.join("docs", "DESIGN.md"),
      path.join(".forgeplan", "wiki", "design.md"),
    ].filter((rel) => fs.existsSync(path.join(cwd, rel))),
    wiki: {
      last_compiled: state.wiki_last_compiled || null,
      pages: fs.existsSync(wikiDir) ? listDir(wikiDir) : [],
      node_pages: fs.existsSync(path.join(wikiDir, "nodes")) ? listDir(path.join(wikiDir, "nodes")) : [],
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
