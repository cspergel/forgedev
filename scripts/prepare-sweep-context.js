#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function safeReadYaml(filePath) {
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function latestFile(dirPath, pattern) {
  if (!fs.existsSync(dirPath)) return null;
  const candidates = fs.readdirSync(dirPath)
    .filter((name) => pattern.test(name))
    .map((name) => ({
      name,
      fullPath: path.join(dirPath, name),
      mtimeMs: fs.statSync(path.join(dirPath, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates.length > 0 ? candidates[0].fullPath : null;
}

function statusCounts(nodes) {
  const counts = {};
  for (const node of Object.values(nodes || {})) {
    const status = node && node.status ? node.status : "unknown";
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function main() {
  const cwd = process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  const statePath = path.join(forgePlanDir, "state.json");
  const configPath = path.join(forgePlanDir, "config.yaml");

  const manifest = safeReadYaml(manifestPath) || {};
  const state = safeReadJson(statePath) || {};
  const config = safeReadYaml(configPath) || {};

  const tierOverride = config.complexity && config.complexity.tier_override;
  const tier = tierOverride || (manifest.project && manifest.project.complexity_tier) || "MEDIUM";
  const sweepState = state.sweep_state || {};
  const agentPrompts = [
    "agents/sweep-adversary.md",
    "agents/sweep-contractualist.md",
    "agents/sweep-pathfinder.md",
    "agents/sweep-structuralist.md",
    "agents/sweep-skeptic.md",
  ].map((rel) => path.join(cwd, rel)).filter((filePath) => fs.existsSync(filePath));

  const latestSweepReport = latestFile(path.join(forgePlanDir, "sweeps"), /^sweep-.*\.md$/);
  const wikiDir = path.join(forgePlanDir, "wiki");
  const wikiNodeDir = path.join(wikiDir, "nodes");
  const wikiNodePages = fs.existsSync(wikiNodeDir)
    ? fs.readdirSync(wikiNodeDir).map((name) => path.join(wikiNodeDir, name)).sort()
    : [];
  const wikiIndex = fs.existsSync(path.join(wikiDir, "index.md")) ? path.join(wikiDir, "index.md") : null;
  const wikiLastCompiled = state.wiki_last_compiled || null;
  const wikiIsStale = Boolean(wikiLastCompiled && state.last_updated && wikiLastCompiled < state.last_updated);

  const result = {
    operation: sweepState.operation || null,
    current_phase: sweepState.current_phase || null,
    pass_number: sweepState.pass_number || 1,
    tier,
    latest_sweep_report: latestSweepReport,
    wiki_index: wikiIndex,
    wiki_decisions: fs.existsSync(path.join(wikiDir, "decisions.md")) ? path.join(wikiDir, "decisions.md") : null,
    wiki_rules: fs.existsSync(path.join(wikiDir, "rules.md")) ? path.join(wikiDir, "rules.md") : null,
    wiki_node_pages: wikiNodePages,
    wiki_last_compiled: wikiLastCompiled,
    wiki_is_stale: wikiIsStale,
    agent_prompts: agentPrompts,
    shared_types: fs.existsSync(path.join(cwd, "src", "shared", "types", "index.ts"))
      ? path.join(cwd, "src", "shared", "types", "index.ts")
      : null,
    status_counts: statusCounts(state.nodes || {}),
    findings_pending: sweepState.findings && Array.isArray(sweepState.findings.pending) ? sweepState.findings.pending.length : 0,
    findings_resolved: sweepState.findings && Array.isArray(sweepState.findings.resolved) ? sweepState.findings.resolved.length : 0,
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
