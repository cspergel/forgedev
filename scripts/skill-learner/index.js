// Skill Learner — Orchestrator
// Portable microservice: depends only on fs, path, detector
const fs = require("fs");
const path = require("path");
const { detectPatterns } = require("./detector");

const DRAFTS_DIR = ".forgeplan/skill-drafts";

/**
 * Scan project files and detect recurring patterns.
 * @param {string} projectRoot - Project root directory
 * @param {Object} options
 * @param {number} options.minOccurrences - Min occurrences to flag (default: 3)
 * @returns {{ patterns: Pattern[], stats: object }}
 */
function scan(projectRoot, options = {}) {
  const files = collectSourceFiles(projectRoot);
  return detectPatterns(files, options);
}

/**
 * Generate a draft SKILL.md from a detected pattern.
 * @param {Object} pattern - Pattern from detectPatterns
 * @param {Object} options
 * @param {string} options.projectName - For context
 * @returns {string} SKILL.md content
 */
function generateDraft(pattern, options = {}) {
  const name = pattern.id
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 64);

  const content = `---
name: ${name}
description: "${pattern.description}"
when_to_use: "When building ${pattern.type} with similar patterns (detected ${pattern.count} times in codebase)"
priority: 30
source: skill-learner/auto-detected
validated_at: "${new Date().toISOString().split("T")[0]}"
overrides: []
tier_filter: []
agent_filter: [builder]
tech_filter: []
---

# ${pattern.description}

## Pattern

This pattern was automatically detected by the Skill Learner. It appeared in ${pattern.count} files:

${pattern.occurrences.map(f => `- \`${f}\``).join("\n")}

## Example

\`\`\`
${pattern.exampleCode}
\`\`\`

## When to Use

Apply this pattern when building similar ${pattern.type} components. This is a DRAFT — review and approve before it becomes an active skill.

## Status

**DRAFT** — detected by Skill Learner, awaiting human review via \`/forgeplan:skill review\`.
`;

  return content;
}

/**
 * Save a draft skill to the drafts directory.
 * @param {string} projectRoot
 * @param {Object} pattern
 * @returns {string} Path to saved draft
 */
function saveDraft(projectRoot, pattern) {
  const draftsDir = path.join(projectRoot, DRAFTS_DIR);
  if (!fs.existsSync(draftsDir)) {
    fs.mkdirSync(draftsDir, { recursive: true });
  }

  const content = generateDraft(pattern);
  const fileName = pattern.hash + ".md";
  const filePath = path.join(draftsDir, fileName);

  // Don't overwrite existing drafts (already suggested)
  if (fs.existsSync(filePath)) {
    return null; // Already drafted
  }

  // Don't re-draft patterns that were already approved and promoted
  const skillsDir = path.join(projectRoot, ".forgeplan", "skills");
  if (fs.existsSync(skillsDir)) {
    const approvedName = (pattern.name || pattern.hash).replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() + ".md";
    if (fs.existsSync(path.join(skillsDir, approvedName))) {
      return null; // Already approved
    }
  }

  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

/**
 * Collect source files for analysis (skip node_modules, dist, .forgeplan, etc.)
 */
function collectSourceFiles(projectRoot) {
  const files = [];
  const MAX_FILES = 500; // cap to prevent unbounded scan in large projects
  const exclude = new Set(["node_modules", "dist", "build", ".forgeplan", ".git", ".next", ".nuxt", "coverage"]);
  const extensions = new Set([".js", ".ts", ".jsx", ".tsx", ".vue", ".svelte"]);
  const normPath = (s) => process.platform === "win32" ? s.toLowerCase() : s;
  const visited = new Set();

  function walk(dir) {
    if (files.length >= MAX_FILES) return;
    // Symlink cycle detection
    let resolvedDir;
    try { resolvedDir = normPath(fs.realpathSync(dir)); } catch { return; }
    if (visited.has(resolvedDir)) return;
    visited.add(resolvedDir);

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;
      if (exclude.has(entry.name)) continue;
      if (entry.name.startsWith(".tmp-")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (extensions.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  walk(projectRoot);
  return files;
}

module.exports = { scan, generateDraft, saveDraft, collectSourceFiles };
