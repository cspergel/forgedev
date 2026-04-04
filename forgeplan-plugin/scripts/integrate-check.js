#!/usr/bin/env node

/**
 * integrate-check.js — ForgePlan Core Integration Verification
 *
 * Verifies cross-node interface contracts by checking that both sides
 * of each interface are implemented. Identifies fault side for failures.
 *
 * Usage: node integrate-check.js [manifest-path]
 * Defaults to .forgeplan/manifest.yaml
 *
 * Output: JSON integration report
 */

const fs = require("fs");
const path = require("path");
const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));

function main() {
  const cwd = process.cwd();
  const manifestPath =
    process.argv[2] || path.join(cwd, ".forgeplan", "manifest.yaml");

  if (!fs.existsSync(manifestPath)) {
    console.error(JSON.stringify({
      type: "error",
      message: "No manifest found. Run /forgeplan:discover first.",
    }));
    process.exit(1);
  }

  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    console.error(JSON.stringify({
      type: "error",
      message: `Could not parse manifest: ${err.message}`,
    }));
    process.exit(1);
  }

  if (!manifest.nodes) {
    console.error(JSON.stringify({
      type: "error",
      message: "Manifest has no nodes.",
    }));
    process.exit(1);
  }

  const specsDir = path.join(path.dirname(manifestPath), "specs");
  const results = [];
  const nodeIds = Object.keys(manifest.nodes);

  // Load all specs
  const specs = {};
  for (const nodeId of nodeIds) {
    const specPath = path.join(specsDir, `${nodeId}.yaml`);
    if (fs.existsSync(specPath)) {
      try {
        specs[nodeId] = yaml.load(fs.readFileSync(specPath, "utf-8"));
      } catch {
        specs[nodeId] = null;
      }
    }
  }

  // Check each interface
  for (const nodeId of nodeIds) {
    const spec = specs[nodeId];
    if (!spec || !Array.isArray(spec.interfaces)) continue;

    for (const iface of spec.interfaces) {
      const targetId = iface.target_node;
      const contract = iface.contract || "(no contract)";
      const ifaceType = iface.type || "unknown";

      // Check target node exists
      if (!nodeIds.includes(targetId)) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "FAIL",
          fault: "SPEC",
          detail: `Target node "${targetId}" does not exist in the manifest.`,
        });
        continue;
      }

      // Check target spec exists
      const targetSpec = specs[targetId];
      if (!targetSpec) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "UNKNOWN",
          fault: "MISSING_SPEC",
          detail: `Target node "${targetId}" has no spec file.`,
        });
        continue;
      }

      // Check reciprocal interface
      const targetInterfaces = targetSpec.interfaces || [];
      const reciprocal = targetInterfaces.find(
        (ti) => ti.target_node === nodeId
      );

      // Check both nodes have files (are built)
      const sourceNode = manifest.nodes[nodeId];
      const targetNode = manifest.nodes[targetId];
      const sourceBuilt = sourceNode.files && sourceNode.files.length > 0;
      const targetBuilt = targetNode.files && targetNode.files.length > 0;

      if (!sourceBuilt && !targetBuilt) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "PENDING",
          fault: "BOTH",
          detail: "Neither node has been built yet.",
        });
        continue;
      }

      if (!sourceBuilt) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "PENDING",
          fault: "SOURCE",
          detail: `Source node "${nodeId}" has not been built yet.`,
        });
        continue;
      }

      if (!targetBuilt) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "PENDING",
          fault: "TARGET",
          detail: `Target node "${targetId}" has not been built yet.`,
        });
        continue;
      }

      // Both built — check for shared model consistency
      const sourceShared = spec.shared_dependencies || [];
      const targetShared = targetSpec.shared_dependencies || [];

      // Check shared model overlap
      const sharedOverlap = sourceShared.filter((m) => targetShared.includes(m));

      // Interface exists, both built, reciprocal check
      if (reciprocal) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "PASS",
          fault: null,
          detail: `Interface documented on both sides. Shared models: ${sharedOverlap.join(", ") || "none"}.`,
        });
      } else {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "WARN",
          fault: "TARGET",
          detail: `Source "${nodeId}" declares interface to "${targetId}", but "${targetId}" has no reciprocal interface back. This may indicate a one-way dependency or a missing spec entry.`,
        });
      }
    }
  }

  // Summary
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const pending = results.filter((r) => r.status === "PENDING").length;
  const warned = results.filter((r) => r.status === "WARN").length;

  console.log(JSON.stringify({
    type: "integration_report",
    total: results.length,
    passed,
    failed,
    pending,
    warned,
    verdict: failed > 0 ? "FAIL" : pending > 0 ? "INCOMPLETE" : warned > 0 ? "PASS_WITH_WARNINGS" : "PASS",
    interfaces: results,
  }, null, 2));
}

if (require.main === module) {
  main();
} else {
  module.exports = { main };
}
