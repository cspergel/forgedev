#!/usr/bin/env node

/**
 * verify-cross-phase.js — ForgePlan Cross-Phase Implementation Verification
 *
 * Deterministic check that current-phase node implementations actually export
 * what interface-only specs declare. Reads actual source files and compares
 * against spec interface contracts.
 *
 * This closes the gap where integrate-check.js only does spec-to-spec comparison.
 * Two specs can agree while the implementation diverges — this script catches that.
 *
 * Usage:
 *   node verify-cross-phase.js
 *
 * Output: JSON to stdout with { status, checks, summary }
 * Exit codes: 0 = all pass, 1 = mismatches found, 2 = error
 */

const fs = require("fs");
const path = require("path");

const cwd = process.cwd();
const forgePlanDir = path.join(cwd, ".forgeplan");

function loadYaml(filePath) {
  try {
    const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));
    return yaml.load(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function main() {
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  const manifest = loadYaml(manifestPath);
  if (!manifest || !manifest.nodes) {
    console.log(JSON.stringify({ status: "error", message: "Cannot read manifest" }));
    process.exit(2);
  }

  const buildPhase = (manifest.project && manifest.project.build_phase) || 1;
  const nodeIds = Object.keys(manifest.nodes);
  const checks = [];
  let failures = 0;

  // Find cross-phase interface pairs: current-phase nodes that connect to future-phase nodes
  for (const nodeId of nodeIds) {
    const node = manifest.nodes[nodeId];
    const nodePhase = node.phase || 1;
    if (nodePhase > buildPhase) continue; // Only check current-phase nodes

    // Load this node's spec to find interfaces to future-phase nodes
    const specPath = path.join(forgePlanDir, "specs", `${nodeId}.yaml`);
    const spec = loadYaml(specPath);
    if (!spec || !Array.isArray(spec.interfaces)) continue;

    for (const iface of spec.interfaces) {
      const targetId = iface.target_node;
      const targetNode = manifest.nodes[targetId];
      if (!targetNode) continue;
      const targetPhase = targetNode.phase || 1;
      if (targetPhase <= buildPhase) continue; // Same-phase — handled by integrate-check.js

      // This is a cross-phase interface: current-phase nodeId -> future-phase targetId
      // Load the target's interface-only spec
      const targetSpecPath = path.join(forgePlanDir, "specs", `${targetId}.yaml`);
      const targetSpec = loadYaml(targetSpecPath);

      if (!targetSpec) {
        checks.push({
          source: nodeId, target: targetId,
          status: "FAIL", detail: `No spec found for future-phase node "${targetId}"`,
        });
        failures++;
        continue;
      }

      // Now verify the current-phase node's IMPLEMENTATION matches what it declares
      // Find the canonical export file (index.ts or main entry)
      const nodeFiles = node.files || [];
      const fileScope = node.file_scope || "";
      const scopeDir = fileScope.replace(/\*+$/, "");
      const indexCandidates = [
        path.join(cwd, scopeDir, "index.ts"),
        path.join(cwd, scopeDir, "index.js"),
        path.join(cwd, scopeDir, "index.tsx"),
      ];

      let exportFile = null;
      let exportContent = null;
      for (const candidate of indexCandidates) {
        if (fs.existsSync(candidate)) {
          try {
            const stat = fs.statSync(candidate);
            if (stat.size > 1024 * 1024) continue; // skip huge files
            exportFile = candidate;
            exportContent = fs.readFileSync(candidate, "utf-8");
            break;
          } catch {}
        }
      }

      if (!exportFile) {
        checks.push({
          source: nodeId, target: targetId,
          status: "FAIL",
          detail: `Current-phase node "${nodeId}" has no index.ts/js in ${scopeDir} — cannot verify cross-phase exports`,
        });
        failures++;
        continue;
      }

      // Check each interface contract declared in the target's spec
      // The target spec's interfaces should include a reciprocal entry pointing back to nodeId
      const targetInterfaces = targetSpec.interfaces || [];
      const reciprocal = targetInterfaces.find(ti => ti.target_node === nodeId);

      if (!reciprocal) {
        // No reciprocal — already caught by integrate-check.js, but note it
        checks.push({
          source: nodeId, target: targetId,
          status: "WARN",
          detail: `Future-phase "${targetId}" has no reciprocal interface entry for "${nodeId}" — skipping implementation check`,
        });
        continue;
      }

      // Extract expected exports from the interface contract
      // Contracts are typically prose like "validateToken(token: string): AuthResult"
      // We regex for function/type names and check they appear as exports
      const contract = iface.contract || "";
      const functionNames = extractFunctionNames(contract);
      const typeNames = extractTypeNames(contract);

      for (const fn of functionNames) {
        const exportPattern = new RegExp(
          `export\\s+(async\\s+)?function\\s+${escapeRegex(fn)}\\b|` +
          `export\\s+(const|let|var)\\s+${escapeRegex(fn)}\\b|` +
          `export\\s*\\{[^}]*\\b${escapeRegex(fn)}\\b`
        );
        if (!exportPattern.test(exportContent)) {
          checks.push({
            source: nodeId, target: targetId,
            status: "FAIL",
            detail: `Contract declares "${fn}" but "${nodeId}" does not export it from ${path.relative(cwd, exportFile)}`,
          });
          failures++;
        } else {
          checks.push({
            source: nodeId, target: targetId,
            status: "PASS",
            detail: `"${fn}" exported from ${path.relative(cwd, exportFile)}`,
          });
        }
      }

      for (const typeName of typeNames) {
        const typeExportPattern = new RegExp(
          `export\\s+(type|interface|enum|class)\\s+${escapeRegex(typeName)}\\b|` +
          `export\\s*\\{[^}]*\\b${escapeRegex(typeName)}\\b`
        );
        if (!typeExportPattern.test(exportContent)) {
          checks.push({
            source: nodeId, target: targetId,
            status: "FAIL",
            detail: `Contract references type "${typeName}" but "${nodeId}" does not export it from ${path.relative(cwd, exportFile)}`,
          });
          failures++;
        } else {
          checks.push({
            source: nodeId, target: targetId,
            status: "PASS",
            detail: `Type "${typeName}" exported from ${path.relative(cwd, exportFile)}`,
          });
        }
      }

      // If no function/type names extracted from contract, do a basic export presence check
      if (functionNames.length === 0 && typeNames.length === 0) {
        const hasAnyExport = /\bexport\b/.test(exportContent);
        checks.push({
          source: nodeId, target: targetId,
          status: hasAnyExport ? "PASS" : "WARN",
          detail: hasAnyExport
            ? `${path.relative(cwd, exportFile)} has exports (contract too vague for specific checks)`
            : `${path.relative(cwd, exportFile)} has NO exports — cross-phase consumers will fail`,
        });
        if (!hasAnyExport) failures++;
      }
    }
  }

  const passed = checks.filter(c => c.status === "PASS").length;
  const failed = checks.filter(c => c.status === "FAIL").length;
  const warned = checks.filter(c => c.status === "WARN").length;

  console.log(JSON.stringify({
    status: failures > 0 ? "fail" : "pass",
    total: checks.length,
    passed,
    failed,
    warned,
    checks,
  }, null, 2));

  process.exit(failures > 0 ? 1 : 0);
}

/** Extract function names from a contract string like "validateToken(token: string): AuthResult" */
function extractFunctionNames(contract) {
  const names = [];
  // Match: functionName( or functionName:
  const regex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let match;
  while ((match = regex.exec(contract)) !== null) {
    const name = match[1];
    // Filter out common type keywords
    if (!["if", "for", "while", "switch", "catch", "function", "return", "new", "typeof", "instanceof"].includes(name)) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

/** Extract type/interface names from contract like ": AuthResult" or "returns User" */
function extractTypeNames(contract) {
  const names = [];
  // Match: ": TypeName" or "-> TypeName" or "returns TypeName"
  const regex = /(?::\s*|->?\s*|returns?\s+)([A-Z][a-zA-Z0-9_]*)/g;
  let match;
  while ((match = regex.exec(contract)) !== null) {
    names.push(match[1]);
  }
  return [...new Set(names)];
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (require.main === module) {
  main();
} else {
  module.exports = { main };
}
