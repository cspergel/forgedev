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
    integration: readIntegrationSummary(forgePlanDir),
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
