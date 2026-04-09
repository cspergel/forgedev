/**
 * skill-helpers.js — Shared skill registry helpers for hooks.
 *
 * Provides manifest hash computation and registry staleness detection
 * for use by session-start.js and pre-tool-use.js.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Compute a deterministic hash of the manifest inputs that affect skill selection.
 * Must match the logic in skill-registry.js computeManifestHash().
 */
function computeManifestHash(manifest) {
  const hashInput = {
    tech_stack: (manifest.project && manifest.project.tech_stack) || {},
    nodes: manifest.nodes ? Object.keys(manifest.nodes).sort() : [],
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(hashInput))
    .digest("hex")
    .slice(0, 12);
}

/**
 * Check if the skill registry is stale or missing.
 * Returns { exists: boolean, stale: boolean, activeCount: number } .
 * - exists=false means no registry file
 * - stale=true means manifest_hash doesn't match
 * - activeCount is total skill assignments (0 if missing/unreadable)
 */
function isRegistryStale(manifest, forgePlanDir) {
  const yaml = require(path.join(__dirname, "..", "..", "node_modules", "js-yaml"));
  const registryPath = path.join(forgePlanDir, "skills-registry.yaml");

  if (!fs.existsSync(registryPath)) {
    return { exists: false, stale: true, activeCount: 0 };
  }

  let registry;
  try {
    registry = yaml.load(fs.readFileSync(registryPath, "utf-8"));
  } catch {
    return { exists: true, stale: true, activeCount: 0 };
  }

  if (!registry || typeof registry !== "object") {
    return { exists: true, stale: true, activeCount: 0 };
  }

  const currentHash = computeManifestHash(manifest);
  const stale = !registry.manifest_hash || registry.manifest_hash !== currentHash;

  // Count active assignments
  let activeCount = 0;
  if (registry.assignments && typeof registry.assignments === "object") {
    for (const agents of Object.values(registry.assignments)) {
      if (Array.isArray(agents)) activeCount += agents.length;
    }
  }

  return { exists: true, stale, activeCount };
}

module.exports = { computeManifestHash, isRegistryStale };
