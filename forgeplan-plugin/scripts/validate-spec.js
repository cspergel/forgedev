#!/usr/bin/env node

/**
 * validate-spec.js — ForgePlan Core Node Spec Validator
 *
 * Validates a node spec YAML file against the required schema.
 * Checks all 11 required fields and quality rules.
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
const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));

function main() {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error("Usage: node validate-spec.js <path-to-spec.yaml>");
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

  const { errors, warnings } = validateSpec(spec);

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

function validateSpec(spec) {
  const errors = [];
  const warnings = [];

  // Required top-level fields
  const required = ["node", "name", "description", "file_scope", "depends_on"];
  for (const field of required) {
    if (spec[field] === undefined || spec[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Array fields that must exist (can be empty)
  const arrayFields = [
    "inputs", "outputs", "shared_dependencies", "interfaces",
    "acceptance_criteria", "constraints", "non_goals", "failure_modes",
  ];
  for (const field of arrayFields) {
    if (spec[field] === undefined || spec[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // data_models must exist (can be empty object)
  if (spec.data_models === undefined) {
    errors.push("Missing required field: data_models");
  }

  // Quality rules
  if (Array.isArray(spec.acceptance_criteria)) {
    for (let i = 0; i < spec.acceptance_criteria.length; i++) {
      const ac = spec.acceptance_criteria[i];
      if (!ac.id) errors.push(`acceptance_criteria[${i}]: missing id`);
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

  return { errors, warnings };
}

if (require.main === module) {
  main();
} else {
  module.exports = { validateSpec };
}
