// scripts/lib/wiki-builder.js
// Wiki page generation library — pure functions that take data and return markdown strings.
// Used by compile-wiki.js (orchestrator) and referenced by post-tool-use.js (DECISION_REGEX).
// Sprint 9: Semantic Memory (Living Knowledge Tree)
"use strict";
const fs = require("fs");
const path = require("path");

// --- Constants ---
const DECISION_REGEX = /@forgeplan-decision:\s*(D-\S+-\d+-\S+)\s*--\s*([^\n]+)/g;
// SYNC: PostToolUse (post-tool-use.js) uses the same regex inline.
// If you change this, update post-tool-use.js too.

const TEST_FILE_PATTERNS = [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /__tests__\//];
const IMPORT_REGEX = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g;
const MIDDLEWARE_REGEX = /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?)\s*\(req,\s*res(?:,\s*next)?\)/g;
const CATCH_NEXT_REGEX = /catch\s*\([^)]*\)\s*\{[^}]*next\s*\(/gs;
const CATCH_JSON_REGEX = /catch\s*\([^)]*\)\s*\{[^}]*res\s*\.\s*(?:json|status)/gs;
const CATCH_RETHROW_REGEX = /catch\s*\([^)]*\)\s*\{[^}]*throw\s/gs;

/**
 * Sanitize text for safe embedding in wiki markdown.
 * Strips characters that could break table structure or inject markdown formatting.
 */
function sanitizeForMarkdown(text) {
  return text
    .replace(/\|/g, "-")     // pipes break markdown tables
    .replace(/\n/g, " ")     // newlines break table rows
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .trim();
}

// --- Decision Marker Extraction ---

/**
 * Extract @forgeplan-decision markers from file contents.
 * @param {string} fileContents - Full file text
 * @param {string} filePath - Path to file (for citations)
 * @returns {Array<{id: string, choice: string, why: string, file: string, line: number}>}
 */
function extractDecisionMarkers(fileContents, filePath) {
  const decisions = [];
  const lines = fileContents.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = /@forgeplan-decision:\s*(D-\S+-\d+-\S+)\s*--\s*([^\n]+)/.exec(lines[i]);
    if (match) {
      const rawDesc = match[2].trim();
      // Split on "Why:" or "because" to separate choice from rationale
      // e.g., "Database sessions. Why: need server-side revocation"
      // e.g., "Use bcrypt because it has adaptive cost factor"
      let choice = rawDesc;
      let why = "";
      const whyMatch = rawDesc.match(/^(.+?)\s*(?:Why:\s*|because\s+)(.+)$/i);
      if (whyMatch) {
        choice = whyMatch[1].replace(/\.\s*$/, ""); // trim trailing period
        why = whyMatch[2];
      }
      decisions.push({
        id: match[1],
        choice,
        why,
        file: filePath,
        line: i + 1,
      });
    }
  }
  return decisions;
}

// --- Pattern Inference (V1: regex-only, no AST) ---

function isTestFile(filePath) {
  return TEST_FILE_PATTERNS.some(p => p.test(filePath));
}

/**
 * Infer patterns from source files using three regex heuristics.
 * @param {Array<{path: string, content: string}>} allFiles - Source files with content
 * @returns {Array<{name: string, type: string, files: string[], description: string}>}
 */
function inferPatterns(allFiles) {
  const sourceFiles = allFiles.filter(f => !isTestFile(f.path));
  const patterns = [];

  // 1. Import clustering: files sharing 3+ identical imports
  const fileImports = {};
  for (const f of sourceFiles) {
    const imports = new Set();
    let m;
    const re = new RegExp(IMPORT_REGEX.source, IMPORT_REGEX.flags);
    while ((m = re.exec(f.content)) !== null) {
      imports.add(m[1] || m[2]);
    }
    if (imports.size > 0) fileImports[f.path] = [...imports].sort();
  }
  // Group files by shared import sets (3+ shared imports)
  const importClusters = {};
  const filePaths = Object.keys(fileImports);
  for (let i = 0; i < filePaths.length; i++) {
    for (let j = i + 1; j < filePaths.length; j++) {
      const shared = fileImports[filePaths[i]].filter(imp => fileImports[filePaths[j]].includes(imp));
      if (shared.length >= 3) {
        const key = shared.join(",");
        if (!importClusters[key]) importClusters[key] = { imports: shared, files: new Set() };
        importClusters[key].files.add(filePaths[i]);
        importClusters[key].files.add(filePaths[j]);
      }
    }
  }
  for (const [key, cluster] of Object.entries(importClusters)) {
    if (cluster.files.size >= 3) {
      const slug = cluster.imports.slice(0, 3).map(i => path.basename(i, path.extname(i))).join("-");
      patterns.push({
        name: `import-cluster-${slug}`,
        type: "import-cluster",
        files: [...cluster.files],
        description: `Files sharing imports: ${cluster.imports.join(", ")}`,
      });
    }
  }

  // 2. Middleware signatures: files with (req, res, next) patterns
  const middlewareFiles = sourceFiles.filter(f => {
    MIDDLEWARE_REGEX.lastIndex = 0; // Reset before each test (global regex is stateful)
    return MIDDLEWARE_REGEX.test(f.content);
  }).map(f => f.path);
  if (middlewareFiles.length >= 3) {
    patterns.push({
      name: "middleware-pattern",
      type: "middleware",
      files: middlewareFiles,
      description: "Files with Express/Connect middleware signatures (req, res, next)",
    });
  }

  // 3. Error handling shapes: classify catch blocks
  const errorShapes = { "next-error": [], "json-response": [], "rethrow": [] };
  for (const f of sourceFiles) {
    if (CATCH_NEXT_REGEX.test(f.content)) errorShapes["next-error"].push(f.path);
    CATCH_NEXT_REGEX.lastIndex = 0;
    if (CATCH_JSON_REGEX.test(f.content)) errorShapes["json-response"].push(f.path);
    CATCH_JSON_REGEX.lastIndex = 0;
    if (CATCH_RETHROW_REGEX.test(f.content)) errorShapes["rethrow"].push(f.path);
    CATCH_RETHROW_REGEX.lastIndex = 0;
  }
  for (const [shape, files] of Object.entries(errorShapes)) {
    if (files.length >= 3) {
      patterns.push({
        name: `error-${shape}`,
        type: "error-handling",
        files,
        description: `Error handling: catch blocks using ${shape} pattern`,
      });
    }
  }

  return patterns;
}

// --- Page Generation ---

/**
 * Build a node wiki page (novel info only — no manifest/spec/state duplication).
 * @param {string} nodeId
 * @param {object} spec - Parsed spec YAML for this node
 * @param {Array} decisions - Decision markers found in this node's files
 * @param {Array} pastFindings - Findings from sweeps/reviews for this node
 * @param {Array} crossRefs - Cross-references to other nodes
 * @returns {string} Markdown page content
 */
function buildNodePage(nodeId, spec, decisions, pastFindings, crossRefs) {
  const lines = [`# Node: ${nodeId}`, ""];

  // Decisions section
  lines.push("## Decisions (from @forgeplan-decision markers)");
  if (decisions.length === 0) {
    lines.push("_No decisions recorded yet._");
  } else {
    for (const d of decisions) {
      const safeChoice = sanitizeForMarkdown(d.choice || "");
      const safeWhy = d.why ? ` Why: ${sanitizeForMarkdown(d.why)}.` : "";
      lines.push(`- **${d.id}**: ${safeChoice}.${safeWhy} [${d.file}:${d.line}]`);
    }
  }
  lines.push("");

  // Past Findings section (re-derived from sweeps/reviews — true regeneration)
  lines.push("## Past Findings");
  lines.push("| Pass | Agent | Finding | Resolution |");
  lines.push("|------|-------|---------|------------|");
  for (const f of pastFindings) {
    lines.push(`| ${sanitizeForMarkdown(String(f.pass || "-"))} | ${sanitizeForMarkdown(f.agent || "-")} | ${sanitizeForMarkdown(f.finding || "-")} | ${sanitizeForMarkdown(f.resolution || "-")} |`);
  }
  lines.push("");

  // Cross-References section
  lines.push("## Cross-References");
  if (crossRefs.length === 0) {
    lines.push("_No cross-references yet._");
  } else {
    for (const ref of crossRefs) {
      lines.push(`- ${ref}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Build the cross-cutting decisions.md page.
 * @param {Array<{id, choice, why, nodes: string[], files: string[], status: string}>} allDecisions
 * @returns {string} Markdown page content
 */
function buildDecisionsPage(allDecisions) {
  const lines = ["# Architectural Decisions", ""];
  if (allDecisions.length === 0) {
    lines.push("_No decisions recorded yet._");
    return lines.join("\n");
  }
  for (const d of allDecisions) {
    lines.push(`## ${d.id}`);
    lines.push(`**Nodes:** ${(d.nodes || []).join(", ") || "unknown"}`);
    lines.push(`**Choice:** ${sanitizeForMarkdown(d.choice || d.description || "")}`);
    lines.push(`**Why:** ${d.why ? sanitizeForMarkdown(d.why) : "\u2014"}`);
    lines.push(`**Files:** ${(d.files || []).map(f => `[${f}]`).join(", ")}`);
    lines.push(`**Status:** ${d.status || "Active"}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Build the rules.md page from spec constraints + inferred patterns.
 * @param {Array<{slug: string, constraint: string, source: string}>} specConstraints
 * @param {Array<{name, type, files, description}>} inferredPatterns
 * @returns {string} Markdown page content
 */
function buildRulesPage(specConstraints, inferredPatterns) {
  const lines = ["# Rules & Patterns", ""];

  lines.push("## Rules (from spec constraints)");
  if (specConstraints.length === 0) {
    lines.push("_No spec constraints found._");
  } else {
    for (const r of specConstraints) {
      lines.push(`- **${r.slug}**: ${r.constraint} \u2014 Source: ${r.source}`);
    }
  }
  lines.push("");

  lines.push("## Inferred Patterns");
  if (inferredPatterns.length === 0) {
    lines.push("_No patterns detected yet (need 3+ files sharing a structure)._");
  } else {
    for (const p of inferredPatterns) {
      lines.push(`- **${p.name}** (${p.type}): ${p.description} \u2014 Files: ${p.files.join(", ")}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Build the wiki index.md page.
 * @param {object} manifest - Parsed manifest
 * @param {string} forgePlanDir - Path to .forgeplan directory (to check for discovery-index.md)
 * @returns {string} Markdown page content
 */
function buildIndexPage(manifest, forgePlanDir) {
  const project = manifest.project || {};
  const nodeIds = Object.keys(manifest.nodes || {});
  const lines = [
    `# ${project.name || "Project"} \u2014 Knowledge Base`,
    "",
    `**Tier:** ${project.complexity_tier || "unknown"}`,
    `**Tech Stack:** ${JSON.stringify(project.tech_stack || {})}`,
    `**Nodes:** ${nodeIds.join(", ")}`,
    "",
  ];

  // Incorporate discovery-index.md if it exists (from large-document discovery)
  const discoveryIndexPath = forgePlanDir
    ? path.join(forgePlanDir, "wiki", "discovery-index.md")
    : null;
  if (discoveryIndexPath && fs.existsSync(discoveryIndexPath)) {
    lines.push("## Discovery Context");
    lines.push(fs.readFileSync(discoveryIndexPath, "utf-8").trim());
    lines.push("");
  }

  lines.push("## Pages");
  lines.push("- [decisions.md](decisions.md) \u2014 Architectural decisions");
  lines.push("- [rules.md](rules.md) \u2014 Conventions and patterns");
  lines.push("");
  lines.push("### Node Pages");
  for (const id of nodeIds) {
    lines.push(`- [${id}](nodes/${id}.md)`);
  }
  lines.push("");
  return lines.join("\n");
}

module.exports = {
  extractDecisionMarkers,
  inferPatterns,
  buildNodePage,
  buildDecisionsPage,
  buildRulesPage,
  buildIndexPage,
  // Exported for PostToolUse to use instead of duplicating regex
  DECISION_REGEX,
  isTestFile,
};
