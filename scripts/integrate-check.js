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
const yaml = require("js-yaml");

function normalizeContract(text) {
  return String(text || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Escape a string for use in RegExp */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract a brace-delimited block from content starting at startIndex */
function extractBlock(content, startIndex) {
  let depth = 0;
  let started = false;
  const maxLen = 100000; // interface blocks >100KB are not realistic — parse failure
  for (let i = startIndex; i < content.length; i++) {
    if (i - startIndex > maxLen) return content.slice(startIndex, i);
    if (content[i] === "{") { depth++; started = true; }
    else if (content[i] === "}") { depth--; }
    if (started && depth === 0) {
      return content.slice(startIndex, i + 1);
    }
  }
  return content.slice(startIndex, startIndex + maxLen); // bounded fallback
}

function main() {
  const cwd = process.cwd();
  const manifestPath =
    process.argv[2] || path.join(cwd, ".forgeplan", "manifest.yaml");

  if (!fs.existsSync(manifestPath)) {
    console.error(JSON.stringify({
      type: "error",
      message: "No manifest found. Run /forgeplan:discover first.",
    }));
    process.exit(2);
  }

  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    console.error(JSON.stringify({
      type: "error",
      message: `Could not parse manifest: ${err.message}`,
    }));
    process.exit(2);
  }

  if (!manifest.nodes) {
    console.error(JSON.stringify({
      type: "error",
      message: "Manifest has no nodes.",
    }));
    process.exit(2);
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

  const buildPhase = (manifest.project && manifest.project.build_phase) || 1;
  const maxPhase = Math.max(1, ...nodeIds.map(id => (manifest.nodes[id].phase || 1)));

  // Check each same-phase/built interface.
  // Future-phase interface-only specs are validated separately below.
  for (const nodeId of nodeIds) {
    const sourceNode = manifest.nodes[nodeId];
    const sourcePhase = (sourceNode && sourceNode.phase) || 1;
    const sourceBuilt = sourceNode && sourceNode.files && sourceNode.files.length > 0;
    if (sourcePhase > buildPhase && !sourceBuilt) continue;

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
      const targetNode = manifest.nodes[targetId];
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

  // --- Sprint 10B: Cross-Phase Interface Check ---
  // During phase advancement, future-phase interface-only specs must agree with
  // the current-phase contracts they depend on. Any mismatch is a hard failure.
  if (maxPhase > buildPhase) {
    const addCrossPhaseFailure = (source, target, type, contract, detail) => {
      results.push({
        source,
        target,
        type: type || "unknown",
        contract: contract || "(no contract)",
        status: "FAIL",
        fault: "CROSS_PHASE",
        detail,
      });
    };

    const seenPairs = new Set();
    const compareCrossPhasePair = (sourceId, targetId, iface, reciprocal, directionLabel) => {
      const pairKey = `${sourceId}->${targetId}`;
      if (seenPairs.has(pairKey)) return;
      seenPairs.add(pairKey);

      if (!reciprocal) {
        addCrossPhaseFailure(
          sourceId,
          targetId,
          iface && iface.type,
          iface && iface.contract,
          `Cross-phase FAIL: ${directionLabel} requires "${sourceId}" and "${targetId}" to agree on the interface, but no reciprocal entry was found.`
        );
        return;
      }

      if ((iface.type || "unknown") !== (reciprocal.type || "unknown")) {
        addCrossPhaseFailure(
          sourceId,
          targetId,
          iface.type,
          iface.contract,
          `Cross-phase FAIL: Interface type mismatch. "${sourceId}" declares "${iface.type}", but "${targetId}" declares "${reciprocal.type}".`
        );
        return;
      }

      const sourceContract = normalizeContract(iface.contract);
      const targetContract = normalizeContract(reciprocal.contract);

      // Empty contracts on cross-phase boundaries MUST be documented before phase advancement
      if (!sourceContract || !targetContract) {
        addCrossPhaseFailure(
          sourceId,
          targetId,
          iface.type,
          iface.contract,
          `Cross-phase FAIL: "${sourceId}" <-> "${targetId}" interface has missing/empty contract. Both sides must document the contract before phase advancement.`
        );
        return;
      }

      if (sourceContract !== targetContract) {
        addCrossPhaseFailure(
          sourceId,
          targetId,
          iface.type,
          iface.contract,
          `Cross-phase FAIL: Contract mismatch. "${sourceId}" says: "${iface.contract}". "${targetId}" says: "${reciprocal.contract}".`
        );
        return;
      }

      results.push({
        source: sourceId,
        target: targetId,
        type: iface.type || "unknown",
        contract: iface.contract || "(no contract)",
        status: "PASS",
        fault: null,
        detail: `Cross-phase: "${sourceId}" <-> "${targetId}" interface verified.`,
      });
    };

    for (const nodeId of nodeIds) {
      const nodePhase = (manifest.nodes[nodeId] && manifest.nodes[nodeId].phase) || 1;
      if (nodePhase > buildPhase) continue; // Only check current-phase nodes' outgoing interfaces
      const spec = specs[nodeId];
      if (!spec || !Array.isArray(spec.interfaces)) continue;
      for (const iface of spec.interfaces) {
        const targetId = iface.target_node;
        const targetPhase = (manifest.nodes[targetId] && manifest.nodes[targetId].phase) || 1;
        if (targetPhase <= buildPhase) continue; // Same-phase: handled above
        const targetSpec = specs[targetId];
        if (!targetSpec) {
          addCrossPhaseFailure(
            nodeId,
            targetId,
            iface.type,
            iface.contract,
            `Cross-phase FAIL: "${nodeId}" (phase ${nodePhase}) connects to "${targetId}" (phase ${targetPhase}) but "${targetId}" has no spec yet. Interface-only spec REQUIRED before phase advancement.`
          );
        } else {
          const targetInterfaces = targetSpec.interfaces || [];
          const reciprocal = targetInterfaces.find(ti => ti.target_node === nodeId);
          compareCrossPhasePair(nodeId, targetId, iface, reciprocal, `"${nodeId}" declares an interface to future-phase "${targetId}"`);
        }
      }
    }

    for (const promotedId of nodeIds) {
      const promotedPhase = (manifest.nodes[promotedId] && manifest.nodes[promotedId].phase) || 1;
      if (promotedPhase !== buildPhase + 1) continue;
      const promotedSpec = specs[promotedId];
      if (!promotedSpec || !Array.isArray(promotedSpec.interfaces)) {
        addCrossPhaseFailure(
          promotedId,
          "current-phase",
          "unknown",
          "(no contract)",
          `Cross-phase FAIL: Promoted node "${promotedId}" has no interface-only spec.`
        );
        continue;
      }

      for (const iface of promotedSpec.interfaces) {
        const targetId = iface.target_node;
        const targetPhase = (manifest.nodes[targetId] && manifest.nodes[targetId].phase) || 1;
        if (targetPhase > buildPhase) continue;
        const targetSpec = specs[targetId];
        if (!targetSpec) {
          addCrossPhaseFailure(
            promotedId,
            targetId,
            iface.type,
            iface.contract,
            `Cross-phase FAIL: Promoted node "${promotedId}" declares an interface to "${targetId}", but "${targetId}" has no spec to validate against.`
          );
          continue;
        }
        const targetInterfaces = targetSpec.interfaces || [];
        const reciprocal = targetInterfaces.find(ti => ti.target_node === promotedId);
        compareCrossPhasePair(promotedId, targetId, iface, reciprocal, `promoted node "${promotedId}" declares an interface to current-phase "${targetId}"`);
      }
    }
  }

  // --- Shared Model Field Consistency Check ---
  // Verify src/shared/types/index.ts matches manifest shared_models
  if (manifest.shared_models) {
    const sharedTypesPath = path.join(cwd, "src", "shared", "types", "index.ts");
    if (fs.existsSync(sharedTypesPath)) {
      try {
        const sharedTypesContent = fs.readFileSync(sharedTypesPath, "utf-8");

        for (const [modelName, modelDef] of Object.entries(manifest.shared_models)) {
          const fields = modelDef.fields || {};
          const safeModelName = escapeRegex(modelName);

          // Check the interface exists in the file
          const ifaceRegex = new RegExp(`interface\\s+${safeModelName}\\s*\\{`, "m");
          if (!ifaceRegex.test(sharedTypesContent)) {
            results.push({
              source: "shared_types",
              target: modelName,
              type: "shared_model",
              contract: `${modelName} interface must be defined in src/shared/types/index.ts`,
              status: "FAIL",
              fault: "SHARED_TYPES",
              detail: `Shared model "${modelName}" is in manifest but not defined in src/shared/types/index.ts. Run: node scripts/regenerate-shared-types.js`,
            });
            continue;
          }

          // Extract the interface block once using brace-depth counting
          const ifaceStart = sharedTypesContent.search(ifaceRegex);
          if (ifaceStart === -1) continue;
          const ifaceBlock = extractBlock(sharedTypesContent, ifaceStart);

          // Check each field exists in the interface block
          for (const fieldName of Object.keys(fields)) {
            const safeFieldName = escapeRegex(fieldName);
            const fieldRegex = new RegExp(`\\b${safeFieldName}\\b\\s*[?:]`, "m");

            if (!fieldRegex.test(ifaceBlock)) {
              results.push({
                source: "shared_types",
                target: modelName,
                type: "shared_model_field",
                contract: `${modelName}.${fieldName} must be in src/shared/types/index.ts`,
                status: "FAIL",
                fault: "SHARED_TYPES",
                detail: `Field "${fieldName}" is in manifest ${modelName} but missing from src/shared/types/index.ts. Regenerate with: node scripts/regenerate-shared-types.js`,
              });
            }
          }
        }
      } catch (err) {
        results.push({
          source: "shared_types",
          target: "all",
          type: "shared_model",
          contract: "src/shared/types/index.ts must be parseable",
          status: "FAIL",
          fault: "SHARED_TYPES",
          detail: `Could not read src/shared/types/index.ts: ${err.message}`,
        });
      }
    } else {
      // Shared types file doesn't exist but shared models are defined
      results.push({
        source: "shared_types",
        target: "all",
        type: "shared_model",
        contract: "src/shared/types/index.ts must exist when shared_models are defined",
        status: "FAIL",
        fault: "SHARED_TYPES",
        detail: "Manifest defines shared_models but src/shared/types/index.ts does not exist. Run: node scripts/regenerate-shared-types.js",
      });
    }
  }

  // Summary
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const pending = results.filter((r) => r.status === "PENDING").length;
  const warned = results.filter((r) => r.status === "WARN").length;
  const unknown = results.filter((r) => r.status === "UNKNOWN").length;

  console.log(JSON.stringify({
    type: "integration_report",
    total: results.length,
    passed,
    failed,
    pending,
    warned,
    verdict: failed > 0 ? "FAIL" : (pending > 0 || unknown > 0) ? "INCOMPLETE" : warned > 0 ? "PASS_WITH_WARNINGS" : "PASS",
    interfaces: results,
  }, null, 2));
}

if (require.main === module) {
  main();
} else {
  module.exports = { main, checkIntegration: main, escapeRegex, extractBlock };
}
