#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));
const { composeDesignContext } = require("./lib/design-context");

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return yaml.load(fs.readFileSync(filePath, "utf-8")) || {};
}

function main() {
  const projectRoot = process.cwd();
  const forgeplanDir = path.join(projectRoot, ".forgeplan");
  const manifestPath = path.join(forgeplanDir, "manifest.yaml");
  const configPath = path.join(forgeplanDir, "config.yaml");

  const manifest = loadYaml(manifestPath);
  const config = loadYaml(configPath);
  const composed = composeDesignContext(projectRoot, manifest, config);

  if (!composed.enabled) {
    process.stdout.write("Design context disabled.\n");
    return;
  }

  if (!composed.markdown.trim()) {
    process.stdout.write("No explicit design context detected.\n");
    return;
  }

  process.stdout.write(composed.markdown.trimEnd() + "\n");
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
