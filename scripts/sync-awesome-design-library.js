#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const NPX_BIN = "npx";
const REPO_ROOT = path.join(__dirname, "..");
const LIBRARY_ROOT = path.join(REPO_ROOT, "design-profiles", "library", "awesome-design-md");
const PROFILES_ROOT = path.join(LIBRARY_ROOT, "profiles");
const CATALOG_PATH = path.join(LIBRARY_ROOT, "catalog.json");
const DOC_PATH = path.join(REPO_ROOT, "docs", "reference", "design-profile-library.md");
const TERMS_URL = "https://getdesign.md/terms";
const ABOUT_URL = "https://getdesign.md/about";

function usage() {
  console.error(
    "Usage:\n" +
    "  node scripts/sync-awesome-design-library.js [--slug <slug>] [--slugs <a,b,c>] [--source <awesome-design-md-path>] [--clean]\n" +
    "\n" +
    "Examples:\n" +
    "  node scripts/sync-awesome-design-library.js\n" +
    "  node scripts/sync-awesome-design-library.js --slug vercel\n" +
    "  node scripts/sync-awesome-design-library.js --slugs vercel,linear.app,notion --clean\n"
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = {
    slugs: [],
    source: null,
    clean: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--slug") {
      args.slugs.push(String(argv[++i] || "").trim());
      continue;
    }
    if (arg === "--slugs") {
      args.slugs.push(
        ...String(argv[++i] || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      );
      continue;
    }
    if (arg === "--source") {
      args.source = path.resolve(String(argv[++i] || ""));
      continue;
    }
    if (arg === "--clean") {
      args.clean = true;
      continue;
    }
    usage();
  }

  args.slugs = Array.from(new Set(args.slugs.filter(Boolean)));
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}

function runGetdesign(args, cwd) {
  if (process.platform === "win32") {
    const quoted = ["getdesign@latest", ...args]
      .map((part) => {
        const value = String(part);
        return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
      })
      .join(" ");
    return execSync(`${NPX_BIN} ${quoted}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  }

  return execFileSync(NPX_BIN, ["getdesign@latest", ...args], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function parseListOutput(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([a-z0-9._-]+)\s+-\s+(.+)$/i);
      if (!match) return null;
      return {
        slug: match[1],
        summary: match[2].trim(),
      };
    })
    .filter(Boolean);
}

function parseCollectionMetadata(sourceRoot) {
  if (!sourceRoot) return new Map();

  const readmePath = path.join(sourceRoot, "README.md");
  if (!fs.existsSync(readmePath)) return new Map();

  const metadata = new Map();
  let currentCategory = "Uncategorized";
  const content = fs.readFileSync(readmePath, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const categoryMatch = rawLine.match(/^###\s+(.+?)\s*$/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim();
      continue;
    }

    const entryMatch = rawLine.match(/^- \[\*\*(.+?)\*\*\]\((https:\/\/getdesign\.md\/([^/]+)\/design-md)\) - (.+)$/);
    if (!entryMatch) continue;

    const [, name, url, slug, summary] = entryMatch;
    metadata.set(slug, {
      slug,
      name: name.trim(),
      summary: summary.trim(),
      category: currentCategory,
      upstream_url: url,
    });
  }

  return metadata;
}

function inferTheme(summary) {
  const text = summary.toLowerCase();
  if (/(dark|black|void|cinematic|monochrome|neon)/.test(text)) return "dark";
  if (/(white|paper|light|bright|clean white)/.test(text)) return "light";
  return "balanced";
}

function inferDensity(summary) {
  const text = summary.toLowerCase();
  if (/(dashboard|data-rich|data-dense|dense|trading|technical|structured)/.test(text)) return "dense";
  if (/(minimal|white space|editorial|clean|subtraction|spacious)/.test(text)) return "airy";
  return "balanced";
}

function inferAccents(summary) {
  const colors = [
    "black",
    "white",
    "blue",
    "emerald",
    "green",
    "purple",
    "pink",
    "yellow",
    "orange",
    "red",
    "mint",
    "cyan",
    "terracotta",
    "gold",
    "coral",
    "monochrome",
  ];
  return colors.filter((color) => new RegExp(`\\b${color}\\b`, "i").test(summary)).slice(0, 4);
}

function inferTraits(summary, category) {
  const text = `${summary} ${category}`.toLowerCase();
  const traits = new Set();
  if (/(minimal|precision|clean|structured|exact)/.test(text)) traits.add("precision");
  if (/(editorial|serif|story|reading|broadsheet)/.test(text)) traits.add("editorial");
  if (/(dashboard|trading|analytics|technical|ops)/.test(text)) traits.add("operational");
  if (/(premium|luxury|cinematic|monumental)/.test(text)) traits.add("premium");
  if (/(friendly|warm|playful|illustration)/.test(text)) traits.add("friendly");
  if (/(developer|terminal|code|infrastructure|engineering)/.test(text)) traits.add("developer-tool");
  if (traits.size === 0) traits.add("general");
  return Array.from(traits);
}

function parseImportedDesign(markdown) {
  const headingMatch = markdown.match(/^#\s+(.+?)\s*$/m);
  const heading = headingMatch ? headingMatch[1].trim() : "";
  const name = heading.replace(/^Design System Inspired by\s+/i, "").trim() || "Unknown";
  return { name };
}

function importProfile(slug, baseMetadata) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forgeplan-design-import-"));
  const outPath = path.join(tempDir, "DESIGN.md");

  try {
    runGetdesign(["add", slug, "--out", outPath], tempDir);
    const markdown = fs.readFileSync(outPath, "utf-8");
    const parsed = parseImportedDesign(markdown);
    const profilePath = path.join(PROFILES_ROOT, `${slug}.md`);
    writeText(profilePath, markdown);

    return {
      id: `awesome/${slug}`,
      slug,
      name: parsed.name,
      summary: baseMetadata.summary,
      category: baseMetadata.category || "Imported Inspiration",
      source: "getdesign.md",
      terms_url: TERMS_URL,
      about_url: ABOUT_URL,
      upstream_url: baseMetadata.upstream_url || `https://getdesign.md/${slug}/design-md`,
      imported_at: new Date().toISOString(),
      theme: inferTheme(baseMetadata.summary),
      density: inferDensity(baseMetadata.summary),
      accents: inferAccents(baseMetadata.summary),
      traits: inferTraits(baseMetadata.summary, baseMetadata.category || ""),
      relativePath: `design-profiles/library/awesome-design-md/profiles/${slug}.md`,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function renderLibraryDoc(entries) {
  const byCategory = new Map();
  for (const entry of entries) {
    const category = entry.category || "Imported Inspiration";
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(entry);
  }

  const lines = [
    "# Design Profile Library",
    "",
    "ForgePlan can import DESIGN.md inspiration profiles from getdesign.md and compose them with local project design docs.",
    "",
    "Quick inspection:",
    "",
    "```bash",
    "node scripts/list-design-profiles.js",
    "node scripts/list-design-profiles.js --search vercel",
    "node scripts/list-design-profiles.js --category \"AI & LLM Platforms\"",
    "```",
    "",
    "Usage in `.forgeplan/config.yaml`:",
    "",
    "```yaml",
    "design:",
    "  profiles:",
    "    - operations-command-center",
    "    - awesome/vercel",
    "  mixins:",
    "    - awesome/linear.app",
    "    - awesome/notion",
    "  blend_notes: >",
    "    Keep Vercel's precision, borrow Linear's density, and use Notion only for editorial softness.",
    "```",
    "",
    "Rules:",
    "",
    "- The first `design.profiles` entry is the primary north star.",
    "- `design.mixins` are secondary influences, not co-equal replacements.",
    "- Local `DESIGN.md` files override imported profiles on direct conflict.",
    "- Keep one coherent palette, typography system, and interaction tone.",
    "",
    `Imported profiles: ${entries.length}`,
    `Source terms: ${TERMS_URL}`,
    "",
  ];

  for (const [category, categoryEntries] of byCategory.entries()) {
    lines.push(`## ${category}`);
    lines.push("");
    for (const entry of categoryEntries.sort((a, b) => a.slug.localeCompare(b.slug))) {
      lines.push(`- \`${entry.id}\` - ${entry.summary}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const collectionMetadata = parseCollectionMetadata(args.source);
  const listed = parseListOutput(runGetdesign(["list"], REPO_ROOT));

  const selected = args.slugs.length > 0
    ? listed.filter((entry) => args.slugs.includes(entry.slug))
    : listed;

  if (selected.length === 0) {
    throw new Error("No matching getdesign slugs found.");
  }

  if (args.clean) {
    fs.rmSync(PROFILES_ROOT, { recursive: true, force: true });
  }

  ensureDir(PROFILES_ROOT);

  let existingCatalog = [];
  if (!args.clean && fs.existsSync(CATALOG_PATH)) {
    try {
      existingCatalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
    } catch {
      existingCatalog = [];
    }
  }

  const imported = [];
  for (const entry of selected) {
    const metadata = collectionMetadata.get(entry.slug) || {
      slug: entry.slug,
      name: entry.slug,
      summary: entry.summary,
      category: "Imported Inspiration",
      upstream_url: `https://getdesign.md/${entry.slug}/design-md`,
    };
    imported.push(importProfile(entry.slug, metadata));
  }

  const mergedBySlug = new Map(existingCatalog.map((entry) => [entry.slug, entry]));
  for (const entry of imported) {
    mergedBySlug.set(entry.slug, entry);
  }
  const catalog = Array.from(mergedBySlug.values()).sort((a, b) => a.slug.localeCompare(b.slug));
  writeText(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");
  writeText(
    path.join(LIBRARY_ROOT, "README.md"),
    [
      "# Awesome Design Library",
      "",
      "Imported DESIGN.md profiles from getdesign.md for ForgePlan design composition.",
      "",
      `Terms: ${TERMS_URL}`,
      `About: ${ABOUT_URL}`,
      "",
      "Profiles in this directory are inspiration references. They are not official design systems from the referenced companies.",
      "",
    ].join("\n")
  );
  writeText(DOC_PATH, renderLibraryDoc(catalog) + "\n");

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        imported: catalog.length,
        catalog: path.relative(REPO_ROOT, CATALOG_PATH).replace(/\\/g, "/"),
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
