"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_SOURCES = ["DESIGN.md", "docs/DESIGN.md", ".forgeplan/wiki/design.md"];
const DESIGN_PROFILES_DIR = path.join(__dirname, "..", "..", "design-profiles");
const DEFAULT_PROFILE_DIR = DESIGN_PROFILES_DIR;
const AWESOME_LIBRARY_DIR = path.join(DESIGN_PROFILES_DIR, "library", "awesome-design-md");
const AWESOME_CATALOG_PATH = path.join(AWESOME_LIBRARY_DIR, "catalog.json");
const AWESOME_PROFILES_DIR = path.join(AWESOME_LIBRARY_DIR, "profiles");

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

function getDesignMixins(config) {
  const configured = config && config.design && Array.isArray(config.design.mixins)
    ? config.design.mixins.filter((entry) => typeof entry === "string" && entry.trim())
    : [];
  return configured.length > 0 ? configured : [];
}

function getDesignBlendNotes(config) {
  const value = config && config.design && typeof config.design.blend_notes === "string"
    ? config.design.blend_notes.trim()
    : "";
  return value;
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
    if (kv) data[kv[1]] = kv[2];
  }
  return data;
}

function loadBuiltinCatalog() {
  if (!fs.existsSync(DEFAULT_PROFILE_DIR)) return [];

  return fs.readdirSync(DEFAULT_PROFILE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const absolutePath = path.join(DEFAULT_PROFILE_DIR, entry.name);
      const content = fs.readFileSync(absolutePath, "utf-8");
      const frontmatter = parseFrontmatter(content);
      const id = path.basename(entry.name, ".md");
      const headingMatch = content.match(/^#\s+(.+?)\s*$/m);
      return {
        id,
        aliases: [id],
        name: frontmatter.name || headingMatch && headingMatch[1] || id,
        summary: frontmatter.description || "",
        source: "forgeplan/internal",
        category: "ForgePlan Built-In",
        absolutePath,
        relativePath: `design-profile:${entry.name.replace(/\\/g, "/")}`,
        theme: "mixed",
        density: "balanced",
        traits: [],
        accents: [],
        upstream_url: null,
      };
    });
}

function loadAwesomeCatalog() {
  if (!fs.existsSync(AWESOME_CATALOG_PATH)) return [];
  let raw = [];
  try {
    raw = JSON.parse(fs.readFileSync(AWESOME_CATALOG_PATH, "utf-8"));
  } catch {
    return [];
  }

  return raw.map((entry) => ({
    ...entry,
    aliases: [entry.id, entry.slug],
    absolutePath: path.join(AWESOME_PROFILES_DIR, `${entry.slug}.md`),
    relativePath: `design-profile:${entry.id}`,
  })).filter((entry) => fs.existsSync(entry.absolutePath));
}

function loadProfileCatalog() {
  const entries = [...loadBuiltinCatalog(), ...loadAwesomeCatalog()];
  const byId = new Map();
  const byAlias = new Map();

  for (const entry of entries) {
    byId.set(entry.id, entry);
    for (const alias of entry.aliases || []) {
      if (!byAlias.has(alias)) byAlias.set(alias, entry);
    }
  }

  return { entries, byId, byAlias };
}

function resolveProfileEntry(profileName, catalog) {
  const key = String(profileName || "").trim();
  if (!key) return null;
  return catalog.byId.get(key) || catalog.byAlias.get(key) || null;
}

function resolveDesignFiles(projectRoot, config) {
  const seen = new Set();
  const files = getDesignSources(config)
    .map((relativePath) => ({
      kind: "document",
      relativePath,
      absolutePath: path.join(projectRoot, relativePath),
    }))
    .filter((entry) => fs.existsSync(entry.absolutePath));

  for (const file of files) {
    seen.add(path.resolve(file.absolutePath));
  }

  const catalog = loadProfileCatalog();
  const profileNames = [...getDesignProfiles(config), ...getDesignMixins(config)];
  for (const profileName of profileNames) {
    const profile = resolveProfileEntry(profileName, catalog);
    if (!profile) continue;
    const resolved = path.resolve(profile.absolutePath);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    files.push({
      kind: "profile",
      id: profile.id,
      relativePath: profile.relativePath,
      absolutePath: profile.absolutePath,
      source: profile.source,
      summary: profile.summary,
      category: profile.category,
    });
  }

  return files;
}

function formatTraits(entry) {
  const parts = [];
  if (entry.theme) parts.push(`theme: ${entry.theme}`);
  if (entry.density) parts.push(`density: ${entry.density}`);
  if (Array.isArray(entry.accents) && entry.accents.length > 0) {
    parts.push(`accents: ${entry.accents.join(", ")}`);
  }
  if (Array.isArray(entry.traits) && entry.traits.length > 0) {
    parts.push(`traits: ${entry.traits.join(", ")}`);
  }
  return parts.join(" | ");
}

function composeDesignContext(projectRoot, manifest, config) {
  if (!isDesignEnabled(manifest, config)) {
    return { enabled: false, markdown: "", files: [], profiles: [], mixins: [], missing: [] };
  }

  const catalog = loadProfileCatalog();
  const files = resolveDesignFiles(projectRoot, config);
  const profiles = getDesignProfiles(config)
    .map((name) => ({ requested: name, entry: resolveProfileEntry(name, catalog) }))
    .filter((item) => item.entry);
  const mixins = getDesignMixins(config)
    .map((name) => ({ requested: name, entry: resolveProfileEntry(name, catalog) }))
    .filter((item) => item.entry);
  const missing = [
    ...getDesignProfiles(config).filter((name) => !resolveProfileEntry(name, catalog)).map((name) => ({ type: "profile", name })),
    ...getDesignMixins(config).filter((name) => !resolveProfileEntry(name, catalog)).map((name) => ({ type: "mixin", name })),
  ];
  const localDocs = files.filter((entry) => entry.kind === "document");
  const blendNotes = getDesignBlendNotes(config);

  if (localDocs.length === 0 && profiles.length === 0 && mixins.length === 0 && !blendNotes) {
    return { enabled: true, markdown: "", files, profiles, mixins, missing };
  }

  const lines = [
    "# ForgePlan Composed Design Context",
    "",
    "Use this as a synthesis brief. Project-local DESIGN.md-style documents override bundled profiles on direct conflict.",
    "",
  ];

  if (localDocs.length > 0) {
    lines.push("## Project Design Docs");
    lines.push("");
    for (const doc of localDocs) {
      lines.push(`- ${doc.relativePath}`);
    }
    lines.push("");
  }

  if (profiles.length > 0) {
    lines.push("## Primary Inspiration Profiles");
    lines.push("");
    for (const item of profiles) {
      const entry = item.entry;
      lines.push(`- \`${entry.id}\` — ${entry.summary}`);
      lines.push(`  ${formatTraits(entry)}`);
      if (entry.upstream_url) lines.push(`  source: ${entry.upstream_url}`);
    }
    lines.push("");
  }

  if (mixins.length > 0) {
    lines.push("## Secondary Mixins");
    lines.push("");
    lines.push("Borrow selectively. These are secondary influences, not a license to mash together incompatible systems.");
    lines.push("");
    for (const item of mixins) {
      const entry = item.entry;
      lines.push(`- \`${entry.id}\` — ${entry.summary}`);
      lines.push(`  ${formatTraits(entry)}`);
      if (entry.upstream_url) lines.push(`  source: ${entry.upstream_url}`);
    }
    lines.push("");
  }

  if (blendNotes) {
    lines.push("## Blend Notes");
    lines.push("");
    lines.push(blendNotes);
    lines.push("");
  }

  lines.push("## Composition Rules");
  lines.push("");
  lines.push("- Keep one coherent typography hierarchy and one dominant accent system.");
  lines.push("- The first primary profile sets the baseline atmosphere unless project-local design docs say otherwise.");
  lines.push("- Mixins should influence specific qualities only: density, restraint, warmth, or interaction tone.");
  lines.push("- Do not produce a collage of unrelated brand cues. Resolve conflicts toward clarity and product fit.");
  lines.push("");

  if (missing.length > 0) {
    lines.push("## Missing Profile References");
    lines.push("");
    for (const item of missing) {
      lines.push(`- ${item.type}: ${item.name}`);
    }
    lines.push("");
  }

  return {
    enabled: true,
    markdown: lines.join("\n"),
    files,
    profiles,
    mixins,
    missing,
    blendNotes,
  };
}

function getDesignContextStatus(projectRoot, manifest, config) {
  if (!isDesignEnabled(manifest, config)) {
    return { enabled: false, files: [], profiles: [], mixins: [] };
  }

  const files = resolveDesignFiles(projectRoot, config);
  return {
    enabled: true,
    files,
    profiles: getDesignProfiles(config),
    mixins: getDesignMixins(config),
    blendNotes: getDesignBlendNotes(config),
    expectedSources: getDesignSources(config),
    expectedProfiles: getDesignProfiles(config),
    expectedMixins: getDesignMixins(config),
  };
}

module.exports = {
  AWESOME_CATALOG_PATH,
  AWESOME_LIBRARY_DIR,
  DEFAULT_PROFILE_DIR,
  DEFAULT_SOURCES,
  composeDesignContext,
  getDesignBlendNotes,
  getDesignContextStatus,
  getDesignMixins,
  getDesignProfiles,
  getDesignSources,
  hasFrontendSurface,
  isDesignEnabled,
  loadProfileCatalog,
  resolveDesignFiles,
  resolveProfileEntry,
};
