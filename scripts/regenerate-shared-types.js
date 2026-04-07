#!/usr/bin/env node

/**
 * regenerate-shared-types.js — ForgePlan Core Shared Types Generator
 *
 * Reads shared_models from the manifest and generates src/shared/types/index.ts
 * using the canonical type mapping rules. Fully deterministic — no LLM needed.
 *
 * Usage: node regenerate-shared-types.js [manifest-path] [output-path]
 * Defaults: .forgeplan/manifest.yaml → src/shared/types/index.ts
 *
 * Type mapping rules (from builder.md):
 *   string              → string
 *   string (UUID)       → string
 *   string (ISO 8601)   → string
 *   string (enum: a, b) → "a" | "b"
 *   string (optional)   → string | undefined (field marked with ?)
 *   string (UUID → X.id)→ string (with JSDoc reference)
 *   number              → number
 *   number (bytes)      → number
 *   boolean             → boolean
 *   Other type (desc)   → base type before parenthetical
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function main() {
  const cwd = process.cwd();
  const manifestPath =
    process.argv[2] || path.join(cwd, ".forgeplan", "manifest.yaml");
  const outputPath =
    process.argv[3] || path.join(cwd, "src", "shared", "types", "index.ts");

  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(2);
  }

  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    console.error(`Could not parse manifest: ${err.message}`);
    process.exit(2);
  }

  if (!manifest.shared_models || Object.keys(manifest.shared_models).length === 0) {
    console.error("No shared_models found in manifest.");
    process.exit(1);
  }

  const code = generateTypeScript(manifest.shared_models);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, code, "utf-8");
  console.log(JSON.stringify({
    status: "success",
    models: Object.keys(manifest.shared_models),
    output: outputPath,
    fields_total: Object.values(manifest.shared_models).reduce(
      (sum, m) => sum + Object.keys(m.fields || {}).length, 0
    ),
  }, null, 2));
}

/**
 * Generate TypeScript code from shared model definitions.
 */
function generateTypeScript(sharedModels) {
  const lines = [
    "// @forgeplan-node: shared",
    "// Auto-generated from .forgeplan/manifest.yaml shared_models",
    "// Do not edit manually — regenerate with: node scripts/regenerate-shared-types.js",
    "",
  ];

  for (const [modelName, modelDef] of Object.entries(sharedModels)) {
    const fields = modelDef.fields || {};
    lines.push(`export interface ${modelName} {`);

    for (const [fieldName, fieldType] of Object.entries(fields)) {
      const { tsType, optional, jsdoc } = mapType(fieldType);

      if (jsdoc) {
        lines.push(`  /** ${jsdoc} */`);
      }
      if (optional) {
        lines.push(`  ${fieldName}?: ${tsType};`);
      } else {
        lines.push(`  ${fieldName}: ${tsType};`);
      }
    }

    lines.push("}");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Map a manifest type string to TypeScript type.
 */
function mapType(typeStr) {
  if (!typeStr || typeof typeStr !== "string") {
    return { tsType: "unknown", optional: false, jsdoc: null };
  }

  const str = typeStr.trim();

  // Check for (optional) marker
  const optional = /\(optional\)/i.test(str);

  // Extract base type and parenthetical using first-paren split (handles non-word chars in type)
  const parenIdx = str.indexOf("(");
  const baseType = parenIdx > -1 ? str.slice(0, parenIdx).trim().toLowerCase() : str.toLowerCase();
  const paren = parenIdx > -1 ? str.slice(parenIdx + 1, str.lastIndexOf(")")).trim() : null;

  let tsType = "unknown";
  let jsdoc = null;

  switch (baseType) {
    case "string":
      if (paren) {
        // string (enum: a, b, c)
        if (paren.startsWith("enum:")) {
          const values = paren
            .slice(5)
            .split(",")
            .map((v) => `"${v.trim()}"`)
            .join(" | ");
          tsType = values;
          break;
        }
        // string (UUID → Model.id)
        if (paren.includes("→") || paren.includes("->")) {
          tsType = "string";
          const parts = paren.split(/→|->/).map((s) => s.trim());
          jsdoc = `References ${parts[parts.length - 1]}`;
          break;
        }
        // string (UUID), string (ISO 8601), string (optional)
        tsType = "string";
      } else {
        tsType = "string";
      }
      break;

    case "number":
      tsType = "number";
      break;

    case "boolean":
      tsType = "boolean";
      break;

    default:
      // Unknown base type — use as-is
      tsType = baseType;
      break;
  }

  // Per builder.md: optional fields get "type | undefined"
  if (optional) {
    tsType = `${tsType} | undefined`;
  }

  return { tsType, optional, jsdoc };
}

if (require.main === module) {
  main();
} else {
  module.exports = { generateTypeScript, mapType };
}
