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

/** Default skill sources (must match skill-registry.js). */
const DEFAULT_SOURCES = [".forgeplan/skills", "skills"];

/**
 * Recursively find all .md files in a directory (lightweight copy from skill-registry.js).
 * Needed for skill-file content proxy hashing.
 */
function findMdFiles(dir, visited) {
  if (!visited) visited = new Set();
  const results = [];
  if (!fs.existsSync(dir)) return results;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return results; }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      // For symlinks, resolve first to check if target is a directory
      if (entry.isSymbolicLink() && !entry.isDirectory()) {
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isDirectory()) continue; // symlink to a file, not a directory — skip
        } catch (_) { continue; } // broken symlink — skip
      }
      if (entry.name === "drafts" || entry.name === "specification") continue;
      // Symlink/junction cycle detection: resolve real path, skip if already visited
      try {
        const realPath = fs.realpathSync(fullPath);
        const normReal = process.platform === "win32" ? realPath.toLowerCase() : realPath;
        if (visited.has(normReal)) continue;
        visited.add(normReal);
      } catch (_) { continue; } // unresolvable symlink — skip
      results.push(...findMdFiles(fullPath, visited));
    } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Compute a deterministic hash of ALL inputs that affect skill selection.
 * Must match the logic in skill-registry.js computeManifestHash().
 *
 * @param {object} manifest - parsed manifest.yaml
 * @param {object} [config] - parsed config.yaml (optional, improves hash coverage)
 * @param {string} [projectRoot] - project root path (optional, enables skill-file hashing)
 */
function computeManifestHash(manifest, config, projectRoot) {
  const hashInput = {
    tech_stack: (manifest.project && manifest.project.tech_stack) || {},
    nodes: manifest.nodes ? Object.keys(manifest.nodes).sort() : [],
    complexity_tier: (manifest.project && manifest.project.complexity_tier) || "MEDIUM",
    skills_config: (config && config.skills) || {},
  };

  // Include a content hash for skill files: sha256 of each file path + content.
  // This ensures ANY edit (even same-size) invalidates the registry.
  if (projectRoot) {
    const sources = (config && config.skills && config.skills.sources) || DEFAULT_SOURCES;
    const fileHasher = crypto.createHash("sha256");
    let fileCount = 0;
    for (const sourceDir of sources) {
      const absDir = path.isAbsolute(sourceDir)
        ? sourceDir
        : path.join(projectRoot, sourceDir);
      try {
        const mdFiles = findMdFiles(absDir);
        // Sort for deterministic ordering across platforms
        mdFiles.sort();
        fileCount += mdFiles.length;
        for (const f of mdFiles) {
          try {
            const relFile = path.relative(projectRoot, f).replace(/\\/g, "/");
            const content = fs.readFileSync(f, "utf-8");
            fileHasher.update(relFile + "\0" + content);
          } catch (_) { /* skip unreadable files */ }
        }
      } catch (_) { /* source dir may not exist */ }
    }
    hashInput.skill_files = { count: fileCount, content_hash: fileHasher.digest("hex") };
  }

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(hashInput))
    .digest("hex")
    .slice(0, 12);
}

/**
 * Check if the skill registry is stale or missing.
 * Returns { exists: boolean, stale: boolean, activeCount: number, skillGapCount: number } .
 * - exists=false means no registry file
 * - stale=true means manifest_hash doesn't match
 * - activeCount is total skill assignments (0 if missing/unreadable)
 * - skillGapCount is number of agents with 0 skills assigned (0 if missing/unreadable)
 *
 * @param {object} manifest - parsed manifest.yaml
 * @param {string} forgePlanDir - path to .forgeplan/ directory
 * @param {object} [config] - parsed config.yaml (optional, improves staleness detection)
 * @param {string} [projectRoot] - project root path (optional, enables skill-file hashing)
 */
function isRegistryStale(manifest, forgePlanDir, config, projectRoot) {
  const yaml = require(path.join(__dirname, "..", "..", "node_modules", "js-yaml"));
  const registryPath = path.join(forgePlanDir, "skills-registry.yaml");

  if (!fs.existsSync(registryPath)) {
    return { exists: false, stale: true, activeCount: 0, skillGapCount: 0 };
  }

  let registry;
  try {
    registry = yaml.load(fs.readFileSync(registryPath, "utf-8"));
  } catch {
    return { exists: true, stale: true, activeCount: 0, skillGapCount: 0 };
  }

  if (!registry || typeof registry !== "object") {
    return { exists: true, stale: true, activeCount: 0, skillGapCount: 0 };
  }

  const currentHash = computeManifestHash(manifest, config, projectRoot);
  const stale = !registry.manifest_hash || registry.manifest_hash !== currentHash;

  // Count active assignments
  let activeCount = 0;
  if (registry.assignments && typeof registry.assignments === "object") {
    for (const agents of Object.values(registry.assignments)) {
      if (Array.isArray(agents)) activeCount += agents.length;
    }
  }

  // Count skill gaps (agents with 0 skills)
  let skillGapCount = 0;
  if (Array.isArray(registry.skill_gaps)) {
    skillGapCount = registry.skill_gaps.length;
  }

  return { exists: true, stale, activeCount, skillGapCount };
}

module.exports = { computeManifestHash, isRegistryStale };
