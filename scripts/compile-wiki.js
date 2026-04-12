#!/usr/bin/env node
// scripts/compile-wiki.js
// Wiki compiler orchestrator — reads manifest/specs/source, generates wiki pages.
// Sprint 9: Semantic Memory (Living Knowledge Tree)
//
// Runs at: sweep Phase 1 step 7, sweep Phase 7 step 4, deep-build Phase 2 final step.
// Does NOT run at SessionStart (would block startup) or between sweep passes.
// Invoked via: node "${CLAUDE_PLUGIN_ROOT}/scripts/compile-wiki.js" [--verbose]
"use strict";
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
// require("minimatch") returns an object in this repo, not a callable — use .minimatch property
const { minimatch } = require("minimatch");

// Recursive directory walk + minimatch filtering (replaces `glob` package — not installed)
// NOTE: ignore patterns are POSITIVE matches (e.g., "**/node_modules/**"), NOT negated with "!"
const IGNORE_PATTERNS = ["**/node_modules/**","**/dist/**","**/build/**","**/.next/**","**/__snapshots__/**","**/*.generated.*"];

function globSync(pattern, cwd) {
  const results = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(path.join(cwd, dir), { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      const rel = dir ? dir + "/" + entry.name : entry.name;
      if (entry.isDirectory()) {
        if (!IGNORE_PATTERNS.some(ig => minimatch(rel + "/", ig))) walk(rel);
      } else if (minimatch(rel, pattern)) {
        if (!IGNORE_PATTERNS.some(ig => minimatch(rel, ig))) results.push(rel);
      }
    }
  };
  walk("");
  return results;
}

const { atomicWriteJson, NODE_ID_REGEX } = require("./lib/atomic-write");
const wb = require("./lib/wiki-builder");

const BINARY_EXTS = new Set([".png",".jpg",".gif",".ico",".woff",".eot",".ttf",".pdf",".zip"]);
const VERBOSE = process.argv.includes("--verbose");

function log(msg) { process.stderr.write(msg + "\n"); }
function debug(msg) { if (VERBOSE) log("  [debug] " + msg); }
function passRank(pass) {
  if (pass === "review") return Number.MAX_SAFE_INTEGER;
  const numeric = Number(pass);
  return Number.isFinite(numeric) ? numeric : 0;
}
function summarizeHotspots(findings) {
  const counts = new Map();
  for (const finding of findings) {
    if (!finding.file) continue;
    counts.set(finding.file, (counts.get(finding.file) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
}
function detectEntrypoints(files) {
  const patterns = [
    /(?:^|\/)(main|app|server|router|routes|service|controller)\.[jt]sx?$/i,
    /(?:^|\/)(page|layout|route)\.[jt]sx?$/i,
    /(?:^|\/)middleware\.[jt]s$/i,
  ];
  return files.filter((filePath) => patterns.some((pattern) => pattern.test(filePath))).slice(0, 5);
}

async function main() {
  const startTime = Date.now();
  const cwd = process.cwd();
  const fpDir = path.join(cwd, ".forgeplan");
  const wikiDir = path.join(fpDir, "wiki");
  const manifestPath = path.join(fpDir, "manifest.yaml");
  const statePath = path.join(fpDir, "state.json");

  // Early exit: no manifest
  if (!fs.existsSync(manifestPath)) {
    log("Wiki compile: no manifest found. Skipping.");
    return;
  }
  const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  const tier = (manifest.project && manifest.project.complexity_tier) || "SMALL";

  // Tier gate: SMALL skips wiki entirely
  if (tier === "SMALL") {
    log("Wiki compile: SMALL tier, skipping.");
    return;
  }

  // Load state — require it to exist (discover bootstraps state.json before wiki init)
  // If state.json doesn't exist, skip wiki compilation — discover hasn't finished yet
  if (!fs.existsSync(statePath)) {
    log("Wiki compile: no state.json found (discovery not complete). Skipping.");
    return;
  }
  let state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

  // Compile attempt tracking
  const attempts = state.wiki_compile_attempts || 0;
  if (attempts >= 3) {
    if (VERBOSE) {
      // --verbose bypasses the failure lockout so manual diagnostic runs can succeed and reset the counter
      log("Wiki compile: bypassing failure lockout (--verbose). Resetting attempt counter.");
      state.wiki_compile_attempts = 0;
      atomicWriteJson(statePath, state);
    } else {
      // Clear stale wiki_compiling flag so SessionStart doesn't show misleading "will retry" message
      if (state.wiki_compiling) {
        state.wiki_compiling = false;
        atomicWriteJson(statePath, state);
      }
      log("Wiki compilation has failed 3 times. Run 'node scripts/compile-wiki.js --verbose' to diagnose, or /forgeplan:recover to reset.");
      return;
    }
  }

  // Step 0: Create wiki directory if missing (handles tier upgrades, manual deletion)
  if (!fs.existsSync(wikiDir)) {
    fs.mkdirSync(path.join(wikiDir, "nodes"), { recursive: true });
    debug("Created wiki/ directory structure");
  }

  const nodeIds = Object.keys(manifest.nodes || {});
  const allDecisions = [];
  const allConstraints = [];
  const allPatterns = [];
  const nodeSummaries = [];
  const projectFindingRefs = [];
  const pages = {}; // filename -> content
  let nodeCount = 0, ruleCount = 0, patternCount = 0, decisionCount = 0;

  // Step 1-2: Process each node
  for (const nodeId of nodeIds) {
    // Defense-in-depth: validate nodeId format before using in file paths
    if (!NODE_ID_REGEX.test(nodeId)) {
      log(`Wiki compile warning: skipping node "${nodeId}" — invalid ID format (must be alphanumeric with hyphens/underscores).`);
      continue;
    }
    const node = manifest.nodes[nodeId];
    let spec = {};
    const specPath = path.join(fpDir, "specs", nodeId + ".yaml");
    try {
      if (fs.existsSync(specPath)) {
        spec = yaml.load(fs.readFileSync(specPath, "utf-8")) || {};
      }
    } catch (err) {
      log(`Wiki compile error: invalid YAML in ${specPath}: ${err.message}. Skipping node.`);
      continue;
    }

    // 2a: Extract constraints from spec
    const constraints = (spec.constraints || []).map((c, i) => ({
      slug: c.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 40),
      constraint: c,
      source: specPath,
    }));
    allConstraints.push(...constraints);

    // 2b: Get file list
    let files = [];
    if (node.files && node.files.length > 0) {
      files = node.files.filter(f => !BINARY_EXTS.has(path.extname(f).toLowerCase()));
    } else if (node.file_scope) {
      try {
        files = globSync(node.file_scope, cwd);
        files = files.filter(f => !BINARY_EXTS.has(path.extname(f).toLowerCase()));
      } catch (_) { debug(`Glob failed for ${nodeId}: ${node.file_scope}`); }
    }
    debug(`${nodeId}: ${files.length} files`);

    // 2c: Extract decision markers from files
    const decisions = [];
    const fileContents = []; // also used for 2d pattern inference (single read pass)
    for (const filePath of files) {
      const absPath = path.resolve(cwd, filePath);
      if (!fs.existsSync(absPath)) {
        debug(`Missing file: ${filePath}`);
        continue;
      }
      // Skip files >500KB (generated bundles, SQL dumps, etc.)
      try {
        const stat = fs.statSync(absPath);
        if (stat.size > 500 * 1024) { debug(`Skipping large file: ${filePath} (${stat.size} bytes)`); continue; }
      } catch (_) { continue; }
      try {
        const content = fs.readFileSync(absPath, "utf-8");
        const markers = wb.extractDecisionMarkers(content, filePath);
        decisions.push(...markers);
        // Store content for pattern inference (single read pass — avoids reading files twice)
        fileContents.push({ path: filePath, content });
      } catch (_) { debug(`Cannot read ${filePath}`); }
    }

    // 2e: Re-derive Past Findings from sweeps/ and reviews/ (true regeneration)
    const pastFindings = [];
    const sweepsDir = path.join(fpDir, "sweeps");
    const reviewsDir = path.join(fpDir, "reviews");
    // Read sweep reports for this node
    // NOTE: Sweep writes MARKDOWN reports (not JSON) per sweep.md:174.
    // Parse findings tables from markdown: | File | Agent | Finding | ... |
    if (fs.existsSync(sweepsDir)) {
      for (const file of fs.readdirSync(sweepsDir)) {
        try {
          const reportText = fs.readFileSync(path.join(sweepsDir, file), "utf-8");
          // Extract pass number from filename or heading (e.g., "pass-1.md" or "# Pass 1")
          const passMatch = file.match(/pass-?(\d+)/i) || reportText.match(/# Pass (\d+)/i);
          const passNum = passMatch ? passMatch[1] : "-";
          // Extract findings from markdown table rows (skip header + separator)
          const tableRows = reportText.match(/\|[^|\n]+\|[^|\n]+\|[^|\n]+\|[^|\n]*\|/g) || [];
          for (const row of tableRows.slice(2)) { // skip header + separator
            const cells = row.split("|").map(c => c.trim()).filter(Boolean);
            if (cells.length >= 3) {
              // Check if finding references this node's files
              const rowText = cells.join(" ");
              const matchedFile = files.find(nf => rowText.includes(nf)) || null;
              if (matchedFile || rowText.toLowerCase().includes(nodeId)) {
                pastFindings.push({
                  pass: passNum,
                  agent: cells[1] || "-",
                  finding: cells[2] || "-",
                  resolution: cells[3] || "-",
                  file: matchedFile,
                });
              }
            }
          }
        } catch (_) {}
      }
    }
    // Read review reports for this node
    const reviewPath = path.join(reviewsDir, nodeId + ".md");
    if (fs.existsSync(reviewPath)) {
      const reviewContent = fs.readFileSync(reviewPath, "utf-8");
      const tableRows = reviewContent.match(/\|[^|]+\|[^|]+\|[^|]+\|/g) || [];
      for (const row of tableRows.slice(2)) { // skip header + separator
        const cells = row.split("|").map(c => c.trim()).filter(Boolean);
        if (cells.length >= 3) {
          const findingText = cells[0] || "-";
          const matchedFile = files.find(nf => findingText.includes(nf)) || null;
          pastFindings.push({ pass: "review", agent: "reviewer", finding: findingText, resolution: cells[1] || "-", file: matchedFile });
        }
      }
    }
    pastFindings.sort((a, b) => passRank(b.pass) - passRank(a.pass));
    const hotspotFiles = summarizeHotspots(pastFindings);
    projectFindingRefs.push(...pastFindings);

    const operationalSummary = {
      status: state.nodes && state.nodes[nodeId] ? state.nodes[nodeId].status : "unknown",
      nodeType: node.type || spec.type || "unknown",
      fileCount: files.length,
      testFileCount: files.filter(wb.isTestFile).length,
      dependencyCount: Array.isArray(node.depends_on) ? node.depends_on.length : 0,
      connectionCount: Array.isArray(node.connects_to) ? node.connects_to.length : 0,
      entrypoints: detectEntrypoints(files),
      hotspotFiles: hotspotFiles.slice(0, 3).map((entry) => entry.file),
      recentFindings: pastFindings.slice(0, 3).map((f) => `${f.pass}/${f.agent}: ${f.finding}`),
    };

    // Build cross-references
    const crossRefs = [];
    for (const depId of (node.depends_on || [])) {
      crossRefs.push(`Depends on: ${depId}`);
    }
    for (const connId of (node.connects_to || [])) {
      crossRefs.push(`Connected to: ${connId}`);
    }

    // Collect decisions for cross-cutting page
    for (const d of decisions) {
      allDecisions.push({
        id: d.id,
        choice: d.choice,
        why: d.why,
        nodes: [nodeId],
        files: [`${d.file}:${d.line}`],
        status: "Active",
      });
    }

    // 2f: Generate node page
    pages[`nodes/${nodeId}.md`] = wb.buildNodePage(nodeId, spec, decisions, pastFindings, crossRefs, operationalSummary);
    nodeCount++;
    decisionCount += decisions.length;
    nodeSummaries.push({
      nodeId,
      status: operationalSummary.status,
      findingCount: pastFindings.length,
      hotspotFiles: operationalSummary.hotspotFiles,
    });

    // Collect file contents for pattern inference
    allPatterns.push(...wb.inferPatterns(fileContents));
  }

  // Second pass: redistribute split_from decisions (must run after ALL nodes processed)
  for (const nodeId of nodeIds) {
    const node = manifest.nodes[nodeId];
    if (node.split_from) {
      // Get child's files — use files array if populated, fall back to file_scope glob
      // (freshly split children may not have populated files arrays yet)
      let nodeFiles = (node.files || []);
      if (nodeFiles.length === 0 && node.file_scope) {
        try { nodeFiles = globSync(node.file_scope, cwd); } catch (_) {}
      }
      for (const d of allDecisions) {
        if (d.nodes && d.nodes.includes(node.split_from) && !d.nodes.includes(nodeId)) {
          if (d.files && d.files.some(df => nodeFiles.some(nf => df.includes(nf)))) {
            d.nodes.push(nodeId);
          }
        }
      }
    }
  }

  // Deduplicate patterns by name
  const uniquePatterns = {};
  for (const p of allPatterns) {
    if (!uniquePatterns[p.name]) uniquePatterns[p.name] = p;
    else uniquePatterns[p.name].files = [...new Set([...uniquePatterns[p.name].files, ...p.files])];
  }
  const finalPatterns = Object.values(uniquePatterns);
  patternCount = finalPatterns.length;
  ruleCount = allConstraints.length;
  const topHotspots = summarizeHotspots(projectFindingRefs).slice(0, 8);

  // Step 3: Generate cross-cutting pages
  pages["decisions.md"] = wb.buildDecisionsPage(allDecisions);
  pages["rules.md"] = wb.buildRulesPage(allConstraints, finalPatterns);
  pages["index.md"] = wb.buildIndexPage(manifest, fpDir, {
    wikiLastCompiled: state.wiki_last_compiled || null,
    wikiIsStale: Boolean(state.wiki_last_compiled && state.last_updated && state.wiki_last_compiled < state.last_updated),
    topHotspots,
    nodeSummaries: nodeSummaries.sort((a, b) => b.findingCount - a.findingCount || a.nodeId.localeCompare(b.nodeId)),
  });

  // Step 4: Reconcile vs manifest
  const nodesDir = path.join(wikiDir, "nodes");
  if (fs.existsSync(nodesDir)) {
    for (const file of fs.readdirSync(nodesDir)) {
      const id = file.replace(/\.md$/, "");
      if (!nodeIds.includes(id)) {
        // Archive removed node
        const archiveDir = path.join(wikiDir, "archived");
        fs.mkdirSync(archiveDir, { recursive: true });
        fs.renameSync(path.join(nodesDir, file), path.join(archiveDir, file));
        debug(`Archived: ${id}`);
      }
    }
  }
  // 4c: Prune archives (>30 days or >50 entries, max 10 per run)
  const archiveDir = path.join(wikiDir, "archived");
  if (fs.existsSync(archiveDir)) {
    const entries = fs.readdirSync(archiveDir).map(f => ({
      name: f, mtime: fs.statSync(path.join(archiveDir, f)).mtimeMs,
    })).sort((a, b) => a.mtime - b.mtime);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let pruned = 0;
    for (const entry of entries) {
      if (pruned >= 10) break;
      if (entries.length - pruned <= 50 && entry.mtime > thirtyDaysAgo) break;
      fs.unlinkSync(path.join(archiveDir, entry.name));
      pruned++;
      debug(`Pruned archive: ${entry.name}`);
    }
  }

  // Step 5: Batch atomic write via staging directory
  const stagingDir = path.join(wikiDir, ".tmp-compile");
  try {
    // 5a: Set compiling flag
    state.wiki_compiling = true;
    atomicWriteJson(statePath, state);

    // 5b: Clean stale staging dir
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(stagingDir, "nodes"), { recursive: true });

    // 5c: Write all pages to staging
    for (const [relPath, content] of Object.entries(pages)) {
      const stagingPath = path.join(stagingDir, relPath);
      fs.mkdirSync(path.dirname(stagingPath), { recursive: true });
      fs.writeFileSync(stagingPath, content, "utf-8");
    }

    // 5d: Rename from staging to final
    for (const [relPath] of Object.entries(pages)) {
      const src = path.join(stagingDir, relPath);
      const dest = path.join(wikiDir, relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(src, dest);
    }

    // 5e: Remove staging directory (retry for NTFS locks)
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch (_) {
      // Windows: antivirus may hold a file; retry once after 200ms
      const start = Date.now();
      while (Date.now() - start < 200) { /* busy wait */ }
      try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (_) {
        debug("Could not remove staging dir \u2014 will be cleaned next compile");
      }
    }

    // Step 6: Update timestamp and clear compiling flag before final write
    state.wiki_compiling = false;
    state.wiki_last_compiled = new Date().toISOString();
    state.wiki_compile_attempts = 0; // Reset on success
    atomicWriteJson(statePath, state);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Wiki compiled: ${nodeCount} nodes, ${ruleCount} rules, ${patternCount} patterns, ${decisionCount} decisions. (${elapsed}s)`);
  } finally {
    // 5f: Clean up staging directory if it still exists (crash mid-write)
    try {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    } catch (_) { /* best effort cleanup */ }
    // NOTE: wiki_compiling state writes are handled by the success path (Step 6 above)
    // and the .catch() error handler below. The finally block does NOT write state
    // to avoid racing with .catch() which also writes state.
  }
}

main().catch(err => {
  // Track failed attempt
  try {
    const statePath = path.join(process.cwd(), ".forgeplan", "state.json");
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      state.wiki_compile_attempts = (state.wiki_compile_attempts || 0) + 1;
      state.wiki_compiling = false;
      atomicWriteJson(statePath, state);
    }
  } catch (_) {}
  log(`Wiki compile error: ${err.message}`);
  process.exit(1);
});
