#!/usr/bin/env node

/**
 * validate-spec.js — ForgePlan Core Node Spec Validator
 *
 * Validates a node spec YAML file against the required schema.
 * Checks all 14 required fields and quality rules.
 *
 * Usage: node validate-spec.js <path-to-spec.yaml>
 *
 * Exit codes:
 *   0 — valid
 *   1 — validation errors found
 *   2 — file not found or parse error
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function main() {
  const specPath = process.argv[2];
  const manifestPath = process.argv[3] ||
    path.join(path.dirname(specPath || "."), "..", "manifest.yaml");

  if (!specPath) {
    console.error("Usage: node validate-spec.js <spec.yaml> [manifest.yaml]");
    process.exit(2);
  }

  if (!fs.existsSync(specPath)) {
    console.error(`Error: Spec not found at ${specPath}`);
    process.exit(2);
  }

  let spec;
  try {
    spec = yaml.load(fs.readFileSync(specPath, "utf-8"));
  } catch (err) {
    console.error(`Error parsing spec YAML: ${err.message}`);
    process.exit(2);
  }

  // Load manifest for cross-validation
  let manifest = null;
  const manifestExplicit = process.argv[3]; // Was manifest path explicitly provided?
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
    } catch (err) {
      if (manifestExplicit) {
        // Manifest was explicitly provided — parse failure is an error
        console.error(`Error: Could not parse manifest: ${err.message}`);
        process.exit(2);
      } else {
        console.error(`Warning: Could not parse manifest — skipping cross-validation.`);
      }
    }
  } else if (manifestExplicit) {
    console.error(`Error: Manifest not found at ${manifestPath}`);
    process.exit(2);
  }

  const { errors, warnings } = validateSpec(spec, manifest);

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }

  if (errors.length > 0) {
    console.log("Errors:");
    for (const e of errors) console.log(`  ✗ ${e}`);
    console.log(`\nSpec validation FAILED: ${errors.length} error(s).`);
    process.exit(1);
  }

  console.log(`Spec validation PASSED: ${spec.node || "unknown"}`);
  process.exit(0);
}

function validateSpec(spec, manifest) {
  const errors = [];
  const warnings = [];

  // Required string fields
  const stringFields = ["node", "name", "description", "file_scope"];
  for (const field of stringFields) {
    if (typeof spec[field] !== "string" || !spec[field].trim()) {
      errors.push(`${field}: must be a non-empty string (got ${typeof spec[field]})`);
    }
  }

  // Required array fields with type enforcement
  const arrayFields = [
    "inputs", "outputs", "shared_dependencies", "interfaces",
    "acceptance_criteria", "constraints", "non_goals", "failure_modes", "depends_on",
  ];
  for (const field of arrayFields) {
    if (spec[field] === undefined || spec[field] === null) {
      errors.push(`Missing required field: ${field}`);
    } else if (!Array.isArray(spec[field])) {
      errors.push(`${field}: must be an array (got ${typeof spec[field]})`);
    }
  }

  // Validate inputs entry shapes
  if (Array.isArray(spec.inputs)) {
    for (let i = 0; i < spec.inputs.length; i++) {
      const inp = spec.inputs[i];
      if (typeof inp !== "object" || inp === null || Array.isArray(inp)) {
        errors.push(`inputs[${i}]: must be an object with name and type fields`);
      } else {
        if (!inp.name) errors.push(`inputs[${i}]: missing name`);
        if (!inp.type) errors.push(`inputs[${i}]: missing type`);
        if (inp.required === undefined) errors.push(`inputs[${i}] (${inp.name || "?"}): missing "required" field`);
        if (!inp.validation) errors.push(`inputs[${i}] (${inp.name || "?"}): missing "validation" rule`);
      }
    }
  }

  // Validate outputs entry shapes
  if (Array.isArray(spec.outputs)) {
    for (let i = 0; i < spec.outputs.length; i++) {
      const out = spec.outputs[i];
      if (typeof out !== "object" || out === null || Array.isArray(out)) {
        errors.push(`outputs[${i}]: must be an object with name and type fields`);
      } else {
        if (!out.name) errors.push(`outputs[${i}]: missing name`);
        if (!out.type) errors.push(`outputs[${i}]: missing type`);
      }
    }
  }

  // data_models must be an object (can be empty)
  if (spec.data_models === undefined || spec.data_models === null) {
    errors.push("Missing required field: data_models");
  } else if (typeof spec.data_models !== "object" || Array.isArray(spec.data_models)) {
    errors.push(`data_models: must be an object/map (got ${Array.isArray(spec.data_models) ? "array" : typeof spec.data_models})`);
  }

  // Quality rules
  if (Array.isArray(spec.acceptance_criteria)) {
    for (let i = 0; i < spec.acceptance_criteria.length; i++) {
      const ac = spec.acceptance_criteria[i];
      if (!ac.id) {
        errors.push(`acceptance_criteria[${i}]: missing id`);
      } else if (!/^AC\d+$/.test(ac.id)) {
        errors.push(`acceptance_criteria[${i}]: id "${ac.id}" must match format AC[number] (e.g., AC1, AC2)`);
      }
      if (!ac.test) errors.push(`acceptance_criteria[${i}] (${ac.id || "?"}): missing test field`);
      if (!ac.description) warnings.push(`acceptance_criteria[${i}] (${ac.id || "?"}): missing description`);
    }
    if (spec.acceptance_criteria.length === 0) {
      errors.push("acceptance_criteria must have at least 1 entry — build, review, and Stop hook all depend on concrete criteria");
    }
  }

  if (Array.isArray(spec.interfaces)) {
    for (let i = 0; i < spec.interfaces.length; i++) {
      const iface = spec.interfaces[i];
      if (!iface.target_node) errors.push(`interfaces[${i}]: missing target_node`);
      if (!iface.type) {
        errors.push(`interfaces[${i}]: missing type (read/write|outbound|inbound)`);
      } else {
        const validTypes = ["read/write", "outbound", "inbound"];
        if (!validTypes.includes(iface.type)) {
          errors.push(`interfaces[${i}]: invalid type "${iface.type}" — must be one of: ${validTypes.join(", ")}`);
        }
      }
      if (!iface.contract) errors.push(`interfaces[${i}]: missing contract`);
    }
  }

  if (Array.isArray(spec.non_goals) && spec.non_goals.length === 0) {
    errors.push("non_goals must have at least 1 entry to prevent scope creep");
  }

  if (Array.isArray(spec.failure_modes) && spec.failure_modes.length === 0) {
    errors.push("failure_modes must have at least 1 entry to guide the reviewer");
  }

  if (!spec.file_scope) {
    errors.push("file_scope is required for build enforcement");
  }

  // --- Manifest cross-validation (if manifest available) ---
  if (manifest && manifest.nodes && spec.node) {
    const nodeId = spec.node;
    const manifestNode = manifest.nodes[nodeId];

    if (!manifestNode) {
      errors.push(`Node "${nodeId}" not found in manifest`);
    } else {
      // file_scope must match
      if (manifestNode.file_scope && spec.file_scope && manifestNode.file_scope !== spec.file_scope) {
        errors.push(`file_scope mismatch: spec says "${spec.file_scope}", manifest says "${manifestNode.file_scope}"`);
      }

      // depends_on must match
      const specDeps = (Array.isArray(spec.depends_on) ? spec.depends_on : []).sort().join(",");
      const manifestDeps = (manifestNode.depends_on || []).sort().join(",");
      if (specDeps !== manifestDeps) {
        errors.push(`depends_on mismatch: spec says [${specDeps}], manifest says [${manifestDeps}]`);
      }
    }

    // shared_dependencies must reference valid shared models
    if (manifest.shared_models && Array.isArray(spec.shared_dependencies)) {
      const validModels = Object.keys(manifest.shared_models);
      for (const dep of spec.shared_dependencies) {
        if (!validModels.includes(dep)) {
          errors.push(`shared_dependencies: "${dep}" is not defined in manifest shared_models (available: ${validModels.join(", ")})`);
        }
      }
    }
  }

  return { errors, warnings };
}

if (require.main === module) {
  main();
} else {
  module.exports = { validateSpec };
}
