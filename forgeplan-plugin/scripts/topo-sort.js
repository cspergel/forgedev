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

const manifestPath =
  process.argv[2] || path.join(process.cwd(), ".forgeplan", "manifest.yaml");

if (!fs.existsSync(manifestPath)) {
  console.error("No manifest found at " + manifestPath);
  process.exit(1);
}

let manifest;
try {
  manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
} catch (err) {
  console.error("Could not parse manifest: " + err.message);
  process.exit(1);
}

if (!manifest.nodes || typeof manifest.nodes !== "object") {
  console.error("Manifest has no nodes.");
  process.exit(1);
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
  console.error("Cycle detected — cannot determine build order.");
  process.exit(1);
}

console.log(order.join(" "));
