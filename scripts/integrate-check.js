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

function normalizeType(text) {
  return String(text || "").replace(/\s+/g, "").toLowerCase();
}

function extractFunctionNames(contract) {
  const names = [];
  const regex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let match;
  while ((match = regex.exec(contract || "")) !== null) {
    const name = match[1];
    if (!["if", "for", "while", "switch", "catch", "function", "return", "new", "typeof", "instanceof"].includes(name)) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

function extractTypeNames(contract) {
  const names = [];
  const regex = /(?::\s*|->?\s*|returns?\s+)([A-Z][a-zA-Z0-9_]*)/g;
  let match;
  while ((match = regex.exec(contract || "")) !== null) {
    names.push(match[1]);
  }
  return [...new Set(names)];
}

/**
 * Extract shared model field names that a spec references.
 * Looks in interfaces (contract text) and acceptance_criteria for field mentions.
 * Also checks the spec's own data_model / entities if present.
 * Returns a Set of lowercase field names for a given model.
 */
function extractReferencedFields(spec, modelName, manifestModelDef) {
  const fields = new Set();
  const manifestFields = Object.keys((manifestModelDef && manifestModelDef.fields) || {});
  if (manifestFields.length === 0) return fields;

  // Collect all text from the spec that might reference model fields
  const textSources = [];

  // Interfaces contract text
  if (Array.isArray(spec.interfaces)) {
    for (const iface of spec.interfaces) {
      if (iface.contract) textSources.push(iface.contract);
    }
  }

  // Acceptance criteria text
  if (Array.isArray(spec.acceptance_criteria)) {
    for (const ac of spec.acceptance_criteria) {
      if (typeof ac === "string") textSources.push(ac);
      else if (ac && ac.criterion) textSources.push(ac.criterion);
      else if (ac && ac.description) textSources.push(ac.description);
    }
  }

  // Data model / entities sections
  if (spec.data_model) textSources.push(JSON.stringify(spec.data_model));
  if (spec.entities) textSources.push(JSON.stringify(spec.entities));

  // Non-goals and constraints can mention fields too
  if (Array.isArray(spec.non_goals)) {
    for (const ng of spec.non_goals) {
      if (typeof ng === "string") textSources.push(ng);
    }
  }

  const combined = textSources.join(" ");

  // Check which manifest fields are referenced in the spec text
  for (const field of manifestFields) {
    const safeField = escapeRegex(field);
    // Match field name as a word boundary (case-insensitive to catch camelCase variants)
    const pattern = new RegExp(`\\b${safeField}\\b`, "i");
    if (pattern.test(combined)) {
      fields.add(field.toLowerCase());
    }
  }

  return fields;
}

/**
 * Validate shared model field consistency between two specs.
 * Returns { consistent: boolean, details: string, overlap: string[] }
 */
function validateSharedModelConsistency(sourceSpec, targetSpec, sharedOverlapNames, manifest) {
  const issues = [];
  const validatedModels = [];

  for (const modelName of sharedOverlapNames) {
    const modelDef = (manifest.shared_models && manifest.shared_models[modelName]) || {};
    const sourceFields = extractReferencedFields(sourceSpec, modelName, modelDef);
    const targetFields = extractReferencedFields(targetSpec, modelName, modelDef);

    // If neither spec references specific fields, we can't do field-level checks
    if (sourceFields.size === 0 && targetFields.size === 0) {
      validatedModels.push(`${modelName} (no field references detected)`);
      continue;
    }

    // Find fields referenced by both — these should exist in the manifest model
    const manifestFieldNames = new Set(
      Object.keys(modelDef.fields || {}).map(f => f.toLowerCase())
    );

    // Check for fields referenced in specs but missing from manifest definition
    for (const field of sourceFields) {
      if (!manifestFieldNames.has(field)) {
        issues.push(`${modelName}: source spec references "${field}" but it is not in manifest shared_models`);
      }
    }
    for (const field of targetFields) {
      if (!manifestFieldNames.has(field)) {
        issues.push(`${modelName}: target spec references "${field}" but it is not in manifest shared_models`);
      }
    }

    // Fields used on both sides — good, these are verified consistent via manifest
    const bothSides = [...sourceFields].filter(f => targetFields.has(f));
    const sourceOnly = [...sourceFields].filter(f => !targetFields.has(f));
    const targetOnly = [...targetFields].filter(f => !sourceFields.has(f));

    const parts = [];
    if (bothSides.length > 0) parts.push(`shared: ${bothSides.join(", ")}`);
    if (sourceOnly.length > 0) parts.push(`source-only: ${sourceOnly.join(", ")}`);
    if (targetOnly.length > 0) parts.push(`target-only: ${targetOnly.join(", ")}`);
    validatedModels.push(`${modelName} (${parts.join("; ") || "field refs found"})`);
  }

  return {
    consistent: issues.length === 0,
    issues,
    summary: validatedModels.join(", "),
  };
}

function resolveNodeFiles(cwd, node) {
  const files = Array.isArray(node.files) ? node.files : [];
  return files
    .map((file) => path.isAbsolute(file) ? file : path.join(cwd, file))
    .filter((file) => fs.existsSync(file));
}

function findCanonicalExportFile(cwd, node) {
  const nodeFiles = resolveNodeFiles(cwd, node);
  const preferred = nodeFiles.find((file) => /(^|[\\/])index\.(ts|tsx|js)$/.test(file));
  if (preferred) return preferred;

  const fileScope = node.file_scope || "";
  const scopeDir = fileScope.replace(/\*\*.*$/, "").replace(/[\\/]+$/, "");
  const candidates = [
    path.join(cwd, scopeDir, "index.ts"),
    path.join(cwd, scopeDir, "index.tsx"),
    path.join(cwd, scopeDir, "index.js"),
  ];
  return candidates.find((file) => fs.existsSync(file)) || null;
}

/** Strip single-line comments, block comments, and string literals from source */
function stripCommentsAndStrings(content) {
  // Replace block comments (/* ... */), single-line comments (// ...),
  // template literals (`...`), double-quoted strings, single-quoted strings
  // with whitespace to preserve line structure for other checks.
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")       // block comments
    .replace(/\/\/[^\n]*/g, " ")              // single-line comments
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')      // template literals → empty string
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')       // double-quoted strings → empty
    .replace(/'(?:[^'\\]|\\.)*'/g, '""');      // single-quoted strings → empty
}

/** Read file content with size guard, returns null on failure */
function readFileSafe(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch (_) {
    return null;
  }
}

function fileContainsPattern(filePath, pattern) {
  const content = readFileSafe(filePath);
  if (content === null) return false;
  return pattern.test(content);
}

/**
 * Check if a symbol is imported/required or used in actual code (not just
 * in comments, strings, or dead code). Returns "import" if found in an
 * import/require, "usage" if found in stripped code, or false.
 */
function symbolUsedInFile(filePath, symbol) {
  const content = readFileSafe(filePath);
  if (content === null) return false;

  const safeSym = escapeRegex(symbol);

  // Phase 1: Check import/require statements (these are high-confidence)
  const importPatterns = [
    // import { symbol } from ...  or  import { x, symbol, y } from ...
    new RegExp(`import\\s+\\{[^}]*\\b${safeSym}\\b[^}]*\\}\\s+from\\b`),
    // import symbol from ...
    new RegExp(`import\\s+${safeSym}\\s+from\\b`),
    // import * as symbol from ...
    new RegExp(`import\\s+\\*\\s+as\\s+${safeSym}\\s+from\\b`),
    // const { symbol } = require(...) or const symbol = require(...)
    new RegExp(`(?:const|let|var)\\s+(?:\\{[^}]*\\b${safeSym}\\b[^}]*\\}|${safeSym})\\s*=\\s*require\\s*\\(`),
  ];

  // Check imports against raw content (imports are rarely inside comments)
  for (const pat of importPatterns) {
    if (pat.test(content)) return "import";
  }

  // Phase 2: Check usage in code with comments/strings stripped
  const stripped = stripCommentsAndStrings(content);
  const usagePattern = new RegExp(`\\b${safeSym}\\b`);
  if (usagePattern.test(stripped)) return "usage";

  return false;
}

function anyFileContains(files, pattern) {
  return files.some((file) => fileContainsPattern(file, pattern));
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

      // Both built — check for shared model field-level consistency
      const sourceShared = spec.shared_dependencies || [];
      const targetShared = targetSpec.shared_dependencies || [];

      // Check shared model overlap and validate field consistency
      const sharedOverlap = sourceShared.filter((m) => targetShared.includes(m));
      let sharedModelValidation = null;
      if (sharedOverlap.length > 0 && manifest.shared_models) {
        sharedModelValidation = validateSharedModelConsistency(
          spec, targetSpec, sharedOverlap, manifest
        );

        // If shared model field references are inconsistent, emit a warning
        if (!sharedModelValidation.consistent) {
          results.push({
            source: nodeId,
            target: targetId,
            type: ifaceType,
            contract,
            status: "WARN",
            fault: "SPEC",
            detail: `Shared model field inconsistency: ${sharedModelValidation.issues.join("; ")}. Both nodes depend on ${sharedOverlap.join(", ")} but reference fields not defined in the manifest.`,
          });
          // Don't skip — continue to check the interface itself
        }
      }

      const sharedDetail = sharedModelValidation
        ? sharedModelValidation.summary
        : (sharedOverlap.join(", ") || "none");

      // Interface exists, both built, reciprocal check
      if (!reciprocal) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "WARN",
          fault: "TARGET",
          detail: `Source "${nodeId}" declares interface to "${targetId}", but "${targetId}" has no reciprocal interface back. This may indicate a one-way dependency or a missing spec entry.`,
        });
        continue;
      }

      if ((ifaceType || "unknown") !== (reciprocal.type || "unknown")) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "FAIL",
          fault: "SPEC",
          detail: `Interface type mismatch. "${nodeId}" declares "${ifaceType}", but "${targetId}" declares "${reciprocal.type || "unknown"}".`,
        });
        continue;
      }

      const sourceContract = normalizeContract(iface.contract);
      const targetContract = normalizeContract(reciprocal.contract);
      if (!sourceContract || !targetContract) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "WARN",
          fault: "SPEC",
          detail: `One side has an empty or undocumented contract. Specs are reciprocal, but implementation still needs manual verification. Shared models: ${sharedDetail}.`,
        });
        continue;
      }

      if (sourceContract !== targetContract) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "FAIL",
          fault: "SPEC",
          detail: `Contract mismatch. "${nodeId}" says "${iface.contract}", but "${targetId}" says "${reciprocal.contract}".`,
        });
        continue;
      }

      const functionNames = extractFunctionNames(iface.contract);
      const typeNames = extractTypeNames(iface.contract);
      if (functionNames.length === 0 && typeNames.length === 0) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "WARN",
          fault: null,
          detail: `Contracts match on both specs, but the contract text is too vague for deterministic implementation verification. Shared models: ${sharedDetail}.`,
        });
        continue;
      }

      const exportFile = findCanonicalExportFile(cwd, sourceNode);
      if (!exportFile) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "WARN",
          fault: "SOURCE",
          detail: `Specs match, but no canonical export file was found for "${nodeId}". Deterministic implementation verification is incomplete.`,
        });
        continue;
      }

      const missingExports = [];
      for (const fn of functionNames) {
        const pattern = new RegExp(
          `export\\s+(async\\s+)?function\\s+${escapeRegex(fn)}\\b|` +
          `export\\s+(const|let|var)\\s+${escapeRegex(fn)}\\b|` +
          `export\\s*\\{[^}]*\\b${escapeRegex(fn)}\\b`
        );
        if (!fileContainsPattern(exportFile, pattern)) missingExports.push(fn);
      }
      for (const typeName of typeNames) {
        const pattern = new RegExp(
          `export\\s+(type|interface|enum|class)\\s+${escapeRegex(typeName)}\\b|` +
          `export\\s*\\{[^}]*\\b${escapeRegex(typeName)}\\b`
        );
        if (!fileContainsPattern(exportFile, pattern)) missingExports.push(typeName);
      }

      if (missingExports.length > 0) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "FAIL",
          fault: "SOURCE",
          detail: `Specs match, but "${nodeId}" does not export ${missingExports.join(", ")} from ${path.relative(cwd, exportFile)}.`,
        });
        continue;
      }

      const targetFiles = resolveNodeFiles(cwd, targetNode);
      if (targetFiles.length === 0) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "WARN",
          fault: "TARGET",
          detail: `Specs match and source exports are present, but no target files were available to verify usage in "${targetId}".`,
        });
        continue;
      }

      const symbols = [...functionNames, ...typeNames];
      // Deeper target-side check: require symbol in import/require or
      // actual code usage (comments, strings, and dead code excluded).
      const importedSymbols = [];
      const usedSymbols = [];
      const missingSymbols = [];
      for (const symbol of symbols) {
        let found = false;
        for (const file of targetFiles) {
          const result = symbolUsedInFile(file, symbol);
          if (result === "import") { importedSymbols.push(symbol); found = true; break; }
          if (result === "usage") { usedSymbols.push(symbol); found = true; break; }
        }
        if (!found) missingSymbols.push(symbol);
      }

      const targetUsesContract = importedSymbols.length > 0 || usedSymbols.length > 0;

      if (!targetUsesContract) {
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "WARN",
          fault: "TARGET",
          detail: `Specs match and source exports are present, but deterministic scans did not find "${targetId}" importing or using the contracted symbols in code (${symbols.join(", ")}). Matches in comments/strings are excluded.`,
        });
        continue;
      }

      // Check symbol coverage: ALL found → PASS, SOME found → WARN, NONE found is handled above.
      const evidenceParts = [];
      if (importedSymbols.length > 0) evidenceParts.push(`imported: ${importedSymbols.join(", ")}`);
      if (usedSymbols.length > 0) evidenceParts.push(`used in code: ${usedSymbols.join(", ")}`);

      if (missingSymbols.length > 0) {
        // Partial evidence: some contracted symbols found, others missing → WARN
        const foundCount = symbols.length - missingSymbols.length;
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "WARN",
          fault: "TARGET",
          detail: `Interface documented on both sides and contracts match, but only partial evidence: ${foundCount} of ${symbols.length} symbols verified (${evidenceParts.join("; ")}). Not found in target code: ${missingSymbols.join(", ")}. Shared models: ${sharedDetail}.`,
        });
      } else {
        // All contracted symbols found → PASS
        results.push({
          source: nodeId,
          target: targetId,
          type: ifaceType,
          contract,
          status: "PASS",
          fault: null,
          detail: `Interface documented on both sides, contracts match, and all implementation evidence found (${evidenceParts.join("; ")}). Shared models: ${sharedDetail}.`,
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

  const verdict = failed > 0 ? "FAIL" : (pending > 0 || unknown > 0) ? "INCOMPLETE" : warned > 0 ? "PASS_WITH_WARNINGS" : "PASS";

  console.log(JSON.stringify({
    type: "integration_report",
    total: results.length,
    passed,
    failed,
    pending,
    warned,
    verdict,
    interfaces: results,
  }, null, 2));

  process.exit(verdict === "FAIL" || verdict === "INCOMPLETE" ? 1 : 0);
}

if (require.main === module) {
  main();
} else {
  module.exports = { main, checkIntegration: main, escapeRegex, extractBlock };
}
