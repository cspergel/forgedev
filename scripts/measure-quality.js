#!/usr/bin/env node

/**
 * measure-quality.js — ForgePlan Core Quality Measurement
 *
 * Counts broken references, duplicate types, and abandoned stubs
 * in a project. Used to compare ForgePlan builds vs vanilla builds.
 *
 * Usage: node measure-quality.js [project-dir]
 * Defaults to cwd.
 *
 * Output: JSON metrics report
 * Also writes to .forgeplan/quality-report.json if .forgeplan/ exists
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function main() {
  const projectDir = process.argv[2] || process.cwd();

  const metrics = {
    timestamp: new Date().toISOString(),
    project_dir: projectDir,
    broken_references: measureBrokenReferences(projectDir),
    duplicate_types: measureDuplicateTypes(projectDir),
    abandoned_stubs: measureAbandonedStubs(projectDir),
  };

  metrics.total_issues =
    metrics.broken_references.count +
    metrics.duplicate_types.count +
    metrics.abandoned_stubs.count;

  // Write report if .forgeplan/ exists
  const reportPath = path.join(projectDir, ".forgeplan", "quality-report.json");
  if (fs.existsSync(path.join(projectDir, ".forgeplan"))) {
    fs.writeFileSync(reportPath, JSON.stringify(metrics, null, 2), "utf-8");
  }

  console.log(JSON.stringify(metrics, null, 2));
}

/**
 * Count broken references using TypeScript compiler.
 * Falls back to import-path analysis if tsc is not available.
 */
function measureBrokenReferences(projectDir) {
  const result = { count: 0, details: [] };

  // Try tsc --noEmit first
  try {
    const tsconfigPath = path.join(projectDir, "tsconfig.json");
    if (fs.existsSync(tsconfigPath)) {
      try {
        execSync("npx tsc --noEmit", {
          cwd: projectDir,
          encoding: "utf-8",
          timeout: 60000,
        });
        // No errors = 0 broken references
        return result;
      } catch (err) {
        // tsc found errors — parse them
        const output = err.stdout || err.stderr || "";
        const errorLines = output.split("\n").filter((line) =>
          /error TS(2304|2305|2307|2339|2552|2694|2724)/.test(line)
        );
        // TS2304: Cannot find name
        // TS2305: Module has no exported member
        // TS2307: Cannot find module
        // TS2339: Property does not exist on type
        // TS2552: Cannot find name (did you mean?)
        // TS2694: Namespace has no exported member
        // TS2724: Module has no exported member (did you mean?)
        result.count = errorLines.length;
        result.details = errorLines.slice(0, 20).map((l) => l.trim());
        return result;
      }
    }
  } catch {
    // tsc not available
  }

  // Fallback: scan for import statements pointing to non-existent files
  const srcDir = path.join(projectDir, "src");
  if (!fs.existsSync(srcDir)) return result;

  const files = walkDir(srcDir, [".ts", ".tsx", ".js", ".jsx"]);
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
      for (const imp of imports) {
        const match = imp.match(/from\s+['"]([^'"]+)['"]/);
        if (!match) continue;
        const importPath = match[1];
        // Skip node_modules imports
        if (!importPath.startsWith(".") && !importPath.startsWith("src/")) continue;
        // Resolve relative to the file
        const resolved = importPath.startsWith(".")
          ? path.resolve(path.dirname(file), importPath)
          : path.resolve(projectDir, importPath);
        // Check if the file exists (with common extensions)
        const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"];
        const exists = extensions.some((ext) => fs.existsSync(resolved + ext));
        if (!exists) {
          const relFile = path.relative(projectDir, file).split(path.sep).join("/");
          result.count++;
          result.details.push(`${relFile}: import "${importPath}" not found`);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return result;
}

/**
 * Count duplicate type definitions — shared model names defined in multiple files.
 */
function measureDuplicateTypes(projectDir) {
  const result = { count: 0, details: [] };

  // Get shared model names from manifest
  const manifestPath = path.join(projectDir, ".forgeplan", "manifest.yaml");
  let sharedModelNames = [];

  if (fs.existsSync(manifestPath)) {
    try {
      const yaml = require("js-yaml");
      const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
      if (manifest.shared_models) {
        sharedModelNames = Object.keys(manifest.shared_models);
      }
    } catch {
      // Can't read manifest — scan for all type definitions instead
    }
  }

  const srcDir = path.join(projectDir, "src");
  if (!fs.existsSync(srcDir)) return result;

  const files = walkDir(srcDir, [".ts", ".tsx", ".js", ".jsx"]);

  // For each shared model name (or all type names if no manifest), find definitions
  const typeLocations = {}; // typeName -> [file paths]

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const relFile = path.relative(projectDir, file).split(path.sep).join("/");

      // Scan for type/interface/class definitions
      const patterns = [
        /\b(?:export\s+)?type\s+(\w+)\s*=/gm,
        /\b(?:export\s+)?interface\s+(\w+)\s*\{/gm,
        /\b(?:export\s+)?class\s+(\w+)\b/gm,
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const typeName = match[1];
          // If we have shared model names, only track those
          if (sharedModelNames.length > 0 && !sharedModelNames.includes(typeName)) continue;

          if (!typeLocations[typeName]) typeLocations[typeName] = [];
          if (!typeLocations[typeName].includes(relFile)) {
            typeLocations[typeName].push(relFile);
          }
        }
      }
    } catch {
      // Skip
    }
  }

  // Count types defined in more than one file
  for (const [typeName, locations] of Object.entries(typeLocations)) {
    if (locations.length > 1) {
      result.count++;
      result.details.push(`${typeName}: defined in ${locations.length} files — ${locations.join(", ")}`);
    }
  }

  return result;
}

/**
 * Count abandoned stubs — empty function bodies, TODO/FIXME, throw not implemented.
 */
function measureAbandonedStubs(projectDir) {
  const result = { count: 0, details: [] };

  const srcDir = path.join(projectDir, "src");
  if (!fs.existsSync(srcDir)) return result;

  const files = walkDir(srcDir, [".ts", ".tsx", ".js", ".jsx"]);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const relFile = path.relative(projectDir, file).split(path.sep).join("/");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // TODO/FIXME markers
        if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(line) && !/measure-quality/.test(relFile)) {
          result.count++;
          result.details.push(`${relFile}:${lineNum}: ${line.trim().substring(0, 80)}`);
        }

        // throw new Error("not implemented") or similar
        if (/throw\s+new\s+Error\s*\(\s*['"]not\s+implemented/i.test(line)) {
          result.count++;
          result.details.push(`${relFile}:${lineNum}: throw "not implemented"`);
        }

        // Empty function body: single-line { } or multi-line with only whitespace
        if (/\)\s*\{\s*\}/.test(line)) {
          result.count++;
          result.details.push(`${relFile}:${lineNum}: empty function body`);
        }
        // Multi-line empty body: line has { and next non-blank line has only }
        if (/\)\s*\{\s*$/.test(line)) {
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === "") j++;
          if (j < lines.length && /^\s*\}\s*$/.test(lines[j])) {
            result.count++;
            result.details.push(`${relFile}:${lineNum}: empty function body (multi-line)`);
          }
        }
      }
    } catch {
      // Skip
    }
  }

  return result;
}

/**
 * Recursively walk a directory and return files matching extensions.
 */
function walkDir(dir, extensions) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".forgeplan") continue;
        results.push(...walkDir(fullPath, extensions));
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip inaccessible dirs
  }
  return results;
}

if (require.main === module) {
  main();
} else {
  module.exports = { measureBrokenReferences, measureDuplicateTypes, measureAbandonedStubs };
}
