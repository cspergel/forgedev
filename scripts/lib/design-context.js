"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_SOURCES = ["DESIGN.md", "docs/DESIGN.md", ".forgeplan/wiki/design.md"];
const DEFAULT_PROFILE_DIR = path.join(__dirname, "..", "..", "design-profiles");

function hasFrontendSurface(manifest) {
  const techFrontend =
    manifest &&
    manifest.project &&
    manifest.project.tech_stack &&
    manifest.project.tech_stack.frontend;
  if (techFrontend && techFrontend !== "none") return true;

  const nodes = manifest && manifest.nodes ? Object.values(manifest.nodes) : [];
  return nodes.some((node) => {
    if (!node || typeof node !== "object") return false;
    // type: "frontend" is the reliable detection path. The extension check below
    // is a best-effort fallback for nodes without an explicit type — it only matches
    // when the file_scope glob contains a known extension literal (e.g. "**/*.tsx").
    // Patterns like "src/ui/**" without extensions will not be caught here.
    if (node.type === "frontend") return true;
    const scope = String(node.file_scope || "");
    return [".tsx", ".jsx", ".vue", ".svelte"].some((ext) => scope.includes(ext));
  });
}

function isDesignEnabled(manifest, config) {
  const value = config && config.design ? config.design.enabled : undefined;
  if (value === false) return false;
  if (value === true) return true;
  return hasFrontendSurface(manifest);
}

function getDesignSources(config) {
  const configured = config && config.design && Array.isArray(config.design.sources)
    ? config.design.sources.filter((entry) => typeof entry === "string" && entry.trim())
    : [];
  return configured.length > 0 ? configured : DEFAULT_SOURCES.slice();
}

function getDesignProfiles(config) {
  const configured = config && config.design && Array.isArray(config.design.profiles)
    ? config.design.profiles.filter((entry) => typeof entry === "string" && entry.trim())
    : [];
  return configured.length > 0 ? configured : [];
}

function resolveProfileFile(profileName) {
  const trimmed = String(profileName || "").trim();
  if (!trimmed) return null;

  const fileName = trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
  const profilePath = path.join(DEFAULT_PROFILE_DIR, fileName);
  if (!fs.existsSync(profilePath)) {
    return null;
  }

  return {
    relativePath: `design-profile:${fileName.replace(/\\/g, "/")}`,
    absolutePath: profilePath,
  };
}

function resolveDesignFiles(projectRoot, config) {
  const seen = new Set();
  const files = getDesignSources(config)
    .map((relativePath) => ({
      relativePath,
      absolutePath: path.join(projectRoot, relativePath),
    }))
    .filter((entry) => fs.existsSync(entry.absolutePath));

  for (const file of files) {
    seen.add(path.resolve(file.absolutePath));
  }

  for (const profileName of getDesignProfiles(config)) {
    const profile = resolveProfileFile(profileName);
    if (!profile) continue;
    const resolved = path.resolve(profile.absolutePath);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    files.push(profile);
  }

  return files;
}

function getDesignContextStatus(projectRoot, manifest, config) {
  if (!isDesignEnabled(manifest, config)) {
    return { enabled: false, files: [] };
  }

  const files = resolveDesignFiles(projectRoot, config);
  return {
    enabled: true,
    files,
    expectedSources: getDesignSources(config),
    expectedProfiles: getDesignProfiles(config),
  };
}

module.exports = {
  DEFAULT_SOURCES,
  DEFAULT_PROFILE_DIR,
  getDesignContextStatus,
  getDesignProfiles,
  getDesignSources,
  hasFrontendSurface,
  isDesignEnabled,
  resolveProfileFile,
  resolveDesignFiles,
};
