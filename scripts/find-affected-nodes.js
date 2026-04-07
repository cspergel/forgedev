#!/usr/bin/env node

/**
 * find-affected-nodes.js — ForgePlan Core Affected Node Finder
 *
 * Given a shared model name, scans all node specs and returns
 * which nodes list it in shared_dependencies.
 *
 * Usage: node find-affected-nodes.js <model-name> [forgeplan-dir]
 * Defaults to .forgeplan/ in cwd.
 *
 * Output: JSON with affected node list
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function main() {
  const modelName = process.argv[2];
  const forgePlanDir =
    process.argv[3] || path.join(process.cwd(), ".forgeplan");

  if (!modelName) {
    console.error("Usage: node find-affected-nodes.js <model-name> [.forgeplan-dir]");
    process.exit(2);
  }

  const result = findAffectedNodes(modelName, forgePlanDir);
  console.log(JSON.stringify(result, null, 2));
}

function findAffectedNodes(modelName, forgePlanDir) {
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  const specsDir = path.join(forgePlanDir, "specs");

  if (!fs.existsSync(manifestPath)) {
    return { error: "No manifest found.", affected: [] };
  }

  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    return { error: `Could not parse manifest: ${err.message}`, affected: [] };
  }

  if (!manifest.nodes) {
    return { error: "Manifest has no nodes.", affected: [] };
  }

  // Verify the model exists in shared_models
  const sharedModels = manifest.shared_models || {};
  const modelExists = Object.keys(sharedModels).includes(modelName);

  const affected = [];
  const nodeIds = Object.keys(manifest.nodes);

  for (const nodeId of nodeIds) {
    const specPath = path.join(specsDir, `${nodeId}.yaml`);
    if (!fs.existsSync(specPath)) continue;

    try {
      const spec = yaml.load(fs.readFileSync(specPath, "utf-8"));
      const deps = spec.shared_dependencies || [];

      if (deps.includes(modelName)) {
        affected.push({
          node: nodeId,
          name: manifest.nodes[nodeId].name || nodeId,
          status: manifest.nodes[nodeId].status || "unknown",
          spec_path: `specs/${nodeId}.yaml`,
        });
      }
    } catch {
      // Skip unparseable specs
    }
  }

  return {
    model: modelName,
    model_exists_in_manifest: modelExists,
    model_fields: modelExists ? Object.keys((sharedModels[modelName] || {}).fields || {}) : [],
    affected_count: affected.length,
    affected,
    remediation: affected.map((n) => ({
      node: n.node,
      steps: [
        `/forgeplan:spec ${n.node} — update spec for changed model fields`,
        `/forgeplan:build ${n.node} — rebuild against updated spec`,
      ],
    })),
  };
}

if (require.main === module) {
  main();
} else {
  module.exports = { findAffectedNodes };
}
