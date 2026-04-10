"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_SOURCES = ["DESIGN.md", "docs/DESIGN.md", ".forgeplan/wiki/design.md"];

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

function resolveDesignFiles(projectRoot, config) {
  return getDesignSources(config)
    .map((relativePath) => ({
      relativePath,
      absolutePath: path.join(projectRoot, relativePath),
    }))
    .filter((entry) => fs.existsSync(entry.absolutePath));
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
  };
}

module.exports = {
  DEFAULT_SOURCES,
  getDesignContextStatus,
  getDesignSources,
  hasFrontendSurface,
  isDesignEnabled,
  resolveDesignFiles,
};
