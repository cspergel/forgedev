#!/usr/bin/env node

/**
 * topo-sort.js — ForgePlan Core Topological Sort
 *
 * Reads .forgeplan/manifest.yaml and outputs node IDs in dependency order.
 * Uses plugin's own js-yaml dependency, not the project's.
 *
 * Usage: node topo-sort.js [path-to-manifest]
 * Defaults to .forgeplan/manifest.yaml in cwd.
 *
 * Output: space-separated node IDs in build order
 */

const fs = require("fs");
const path = require("path");
const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));

function topoSort(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return { error: "No manifest found at " + manifestPath };
  }

  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    return { error: "Could not parse manifest: " + err.message };
  }

  if (!manifest.nodes || typeof manifest.nodes !== "object") {
    return { error: "Manifest has no nodes." };
  }

  const nodes = Object.keys(manifest.nodes);
  const deg = {};
  const adj = {};
  nodes.forEach((n) => { deg[n] = 0; adj[n] = []; });
  nodes.forEach((n) => {
    (manifest.nodes[n].depends_on || []).forEach((d) => {
      if (nodes.includes(d)) { adj[d].push(n); deg[n]++; }
    });
  });

  const q = nodes.filter((n) => deg[n] === 0);
  const order = [];
  while (q.length) {
    const c = q.shift();
    order.push(c);
    adj[c].forEach((n) => { if (--deg[n] === 0) q.push(n); });
  }

  if (order.length !== nodes.length) {
    return { error: "Cycle detected — cannot determine build order." };
  }

  return { order };
}

function main() {
  const manifestPath =
    process.argv[2] || path.join(process.cwd(), ".forgeplan", "manifest.yaml");

  const result = topoSort(manifestPath);
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(result.order.join(" "));
}

if (require.main === module) {
  main();
} else {
  module.exports = { topoSort };
}
