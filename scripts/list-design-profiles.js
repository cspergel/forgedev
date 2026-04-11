#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "..", "design-profiles", "library", "awesome-design-md", "catalog.json");

function usage() {
  console.error(
    "Usage:\n" +
    "  node scripts/list-design-profiles.js [--search <term>] [--category <name>] [--ids-only]\n"
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = {
    search: "",
    category: "",
    idsOnly: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--search") {
      args.search = String(argv[++i] || "").trim().toLowerCase();
      continue;
    }
    if (arg === "--category") {
      args.category = String(argv[++i] || "").trim().toLowerCase();
      continue;
    }
    if (arg === "--ids-only") {
      args.idsOnly = true;
      continue;
    }
    usage();
  }

  return args;
}

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error("No imported design profile catalog found. Run node scripts/sync-awesome-design-library.js first.");
  }
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf-8"));
}

function matches(entry, args) {
  if (args.search) {
    const haystack = `${entry.id} ${entry.slug} ${entry.name} ${entry.summary} ${entry.category}`.toLowerCase();
    if (!haystack.includes(args.search)) return false;
  }
  if (args.category && String(entry.category || "").toLowerCase() !== args.category) {
    return false;
  }
  return true;
}

function main() {
  const args = parseArgs(process.argv);
  const entries = loadCatalog().filter((entry) => matches(entry, args));

  if (args.idsOnly) {
    process.stdout.write(entries.map((entry) => entry.id).join("\n") + (entries.length ? "\n" : ""));
    return;
  }

  if (entries.length === 0) {
    process.stdout.write("No matching design profiles.\n");
    return;
  }

  const byCategory = new Map();
  for (const entry of entries) {
    const category = entry.category || "Imported Inspiration";
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(entry);
  }

  const lines = [];
  for (const [category, group] of byCategory.entries()) {
    lines.push(`## ${category}`);
    lines.push("");
    for (const entry of group.sort((a, b) => a.slug.localeCompare(b.slug))) {
      lines.push(`- ${entry.id} - ${entry.summary}`);
    }
    lines.push("");
  }

  process.stdout.write(lines.join("\n").trimEnd() + "\n");
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
