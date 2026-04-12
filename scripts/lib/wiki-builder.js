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
  return String(text || "")
    .replace(/\|/g, "-")
    .replace(/\n/g, " ")
    .replace(/<[^>]*>/g, "")
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
      let choice = rawDesc;
      let why = "";
      const whyMatch = rawDesc.match(/^(.+?)\s*(?:Why:\s*|because\s+)(.+)$/i);
      if (whyMatch) {
        choice = whyMatch[1].replace(/\.\s*$/, "");
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
  return TEST_FILE_PATTERNS.some((p) => p.test(filePath));
}

/**
 * Infer patterns from source files using three regex heuristics.
 * @param {Array<{path: string, content: string}>} allFiles - Source files with content
 * @returns {Array<{name: string, type: string, files: string[], description: string}>}
 */
function inferPatterns(allFiles) {
  const sourceFiles = allFiles.filter((f) => !isTestFile(f.path));
  const patterns = [];

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

  const importClusters = {};
  const filePaths = Object.keys(fileImports);
  for (let i = 0; i < filePaths.length; i++) {
    for (let j = i + 1; j < filePaths.length; j++) {
      const shared = fileImports[filePaths[i]].filter((imp) => fileImports[filePaths[j]].includes(imp));
      if (shared.length >= 3) {
        const key = shared.join(",");
        if (!importClusters[key]) importClusters[key] = { imports: shared, files: new Set() };
        importClusters[key].files.add(filePaths[i]);
        importClusters[key].files.add(filePaths[j]);
      }
    }
  }
  for (const cluster of Object.values(importClusters)) {
    if (cluster.files.size >= 3) {
      const slug = cluster.imports.slice(0, 3).map((i) => path.basename(i, path.extname(i))).join("-");
      patterns.push({
        name: `import-cluster-${slug}`,
        type: "import-cluster",
        files: [...cluster.files],
        description: `Files sharing imports: ${cluster.imports.join(", ")}`,
      });
    }
  }

  const middlewareFiles = sourceFiles.filter((f) => {
    MIDDLEWARE_REGEX.lastIndex = 0;
    return MIDDLEWARE_REGEX.test(f.content);
  }).map((f) => f.path);
  if (middlewareFiles.length >= 3) {
    patterns.push({
      name: "middleware-pattern",
      type: "middleware",
      files: middlewareFiles,
      description: "Files with Express/Connect middleware signatures (req, res, next)",
    });
  }

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
 * @param {object} spec
 * @param {Array} decisions
 * @param {Array} pastFindings
 * @param {Array} crossRefs
 * @param {object} operationalSummary
 * @returns {string}
 */
function buildNodePage(nodeId, spec, decisions, pastFindings, crossRefs, operationalSummary = {}) {
  const lines = [`# Node: ${nodeId}`, ""];

  lines.push("## Operational Summary");
  const summaryLines = [];
  if (operationalSummary.status) summaryLines.push(`- **Status:** ${sanitizeForMarkdown(operationalSummary.status)}`);
  if (operationalSummary.nodeType) summaryLines.push(`- **Node type:** ${sanitizeForMarkdown(operationalSummary.nodeType)}`);
  if (typeof operationalSummary.fileCount === "number") summaryLines.push(`- **Tracked files:** ${operationalSummary.fileCount}`);
  if (typeof operationalSummary.testFileCount === "number") summaryLines.push(`- **Test files:** ${operationalSummary.testFileCount}`);
  if (typeof operationalSummary.dependencyCount === "number" || typeof operationalSummary.connectionCount === "number") {
    summaryLines.push(`- **Dependencies:** ${operationalSummary.dependencyCount || 0} | **Connections:** ${operationalSummary.connectionCount || 0}`);
  }
  if (Array.isArray(operationalSummary.entrypoints) && operationalSummary.entrypoints.length > 0) {
    summaryLines.push(`- **Key entrypoints:** ${operationalSummary.entrypoints.map(sanitizeForMarkdown).join(", ")}`);
  }
  if (Array.isArray(operationalSummary.hotspotFiles) && operationalSummary.hotspotFiles.length > 0) {
    summaryLines.push(`- **Hot files:** ${operationalSummary.hotspotFiles.map(sanitizeForMarkdown).join(", ")}`);
  }
  if (Array.isArray(operationalSummary.recentFindings) && operationalSummary.recentFindings.length > 0) {
    summaryLines.push(`- **Recent issues:** ${operationalSummary.recentFindings.map(sanitizeForMarkdown).join(" | ")}`);
  }
  if (summaryLines.length === 0) {
    lines.push("_No operational summary available yet._");
  } else {
    lines.push(...summaryLines);
  }
  lines.push("");

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

  lines.push("## Past Findings");
  if (pastFindings.length > 10) {
    lines.push(`_Showing latest 10 of ${pastFindings.length} findings._`);
  }
  lines.push("| Pass | Agent | Finding | Resolution |");
  lines.push("|------|-------|---------|------------|");
  for (const f of pastFindings.slice(0, 10)) {
    lines.push(`| ${sanitizeForMarkdown(String(f.pass || "-"))} | ${sanitizeForMarkdown(f.agent || "-")} | ${sanitizeForMarkdown(f.finding || "-")} | ${sanitizeForMarkdown(f.resolution || "-")} |`);
  }
  lines.push("");

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
    lines.push(`**Why:** ${d.why ? sanitizeForMarkdown(d.why) : "-"}`);
    lines.push(`**Files:** ${(d.files || []).map((f) => `[${f}]`).join(", ")}`);
    lines.push(`**Status:** ${d.status || "Active"}`);
    lines.push("");
  }
  return lines.join("\n");
}

function buildRulesPage(specConstraints, inferredPatterns) {
  const lines = ["# Rules & Patterns", ""];

  lines.push("## Rules (from spec constraints)");
  if (specConstraints.length === 0) {
    lines.push("_No spec constraints found._");
  } else {
    for (const r of specConstraints) {
      lines.push(`- **${r.slug}**: ${r.constraint} - Source: ${r.source}`);
    }
  }
  lines.push("");

  lines.push("## Inferred Patterns");
  if (inferredPatterns.length === 0) {
    lines.push("_No patterns detected yet (need 3+ files sharing a structure)._");
  } else {
    for (const p of inferredPatterns) {
      lines.push(`- **${p.name}** (${p.type}): ${p.description} - Files: ${p.files.join(", ")}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

function buildIndexPage(manifest, forgePlanDir, options = {}) {
  const project = manifest.project || {};
  const nodeIds = Object.keys(manifest.nodes || {});
  const lines = [
    `# ${project.name || "Project"} - Knowledge Base`,
    "",
    `**Tier:** ${project.complexity_tier || "unknown"}`,
    `**Tech Stack:** ${JSON.stringify(project.tech_stack || {})}`,
    `**Nodes:** ${nodeIds.join(", ")}`,
    "",
  ];

  if (options.wikiLastCompiled) {
    lines.push(`**Last Compiled:** ${options.wikiLastCompiled}`);
  }
  if (typeof options.wikiIsStale === "boolean") {
    lines.push(`**Freshness:** ${options.wikiIsStale ? "stale" : "fresh"}`);
  }
  if (options.wikiLastCompiled || typeof options.wikiIsStale === "boolean") {
    lines.push("");
  }

  if (Array.isArray(options.topHotspots) && options.topHotspots.length > 0) {
    lines.push("## Hotspots");
    for (const hotspot of options.topHotspots) {
      lines.push(`- ${sanitizeForMarkdown(hotspot.file)} (${hotspot.count} findings)`);
    }
    lines.push("");
  }

  if (Array.isArray(options.nodeSummaries) && options.nodeSummaries.length > 0) {
    lines.push("## Node Health");
    for (const summary of options.nodeSummaries.slice(0, 8)) {
      lines.push(
        `- **${sanitizeForMarkdown(summary.nodeId)}**: ${sanitizeForMarkdown(summary.status || "unknown")}` +
        ` | findings: ${summary.findingCount || 0}` +
        ` | hot files: ${(summary.hotspotFiles || []).slice(0, 2).map(sanitizeForMarkdown).join(", ") || "none"}`
      );
    }
    lines.push("");
  }

  const discoveryIndexPath = forgePlanDir ? path.join(forgePlanDir, "wiki", "discovery-index.md") : null;
  if (discoveryIndexPath && fs.existsSync(discoveryIndexPath)) {
    lines.push("## Discovery Context");
    lines.push(fs.readFileSync(discoveryIndexPath, "utf-8").trim());
    lines.push("");
  }

  lines.push("## Pages");
  lines.push("- [decisions.md](decisions.md) - Architectural decisions");
  lines.push("- [rules.md](rules.md) - Conventions and patterns");
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
  DECISION_REGEX,
  sanitizeForMarkdown,
  isTestFile,
};
