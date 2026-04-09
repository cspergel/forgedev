#!/usr/bin/env node

/**
 * post-tool-use.js — ForgePlan Core PostToolUse Hook
 *
 * Runs after every successful Write/Edit tool call during a build.
 * Deterministic only (no LLM calls):
 *   1. Auto-register new files into the manifest's files list
 *   2. Log the change to the node's conversation file
 *
 * Input: JSON on stdin with tool_name and tool_input
 * Output: Exit 0 always (post-hooks don't block)
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const { atomicWriteJson, NODE_ID_REGEX } = require("./lib/atomic-write");

let inputData = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  inputData += chunk;
});

process.stdin.on("end", () => {
  try {
    const input = JSON.parse(inputData);
    processHook(input);
  } catch (err) {
    process.stderr.write(
      `ForgePlan: Could not process file tracking after your last edit. This is non-blocking. If files are missing from the manifest, run /forgeplan:status to check.\n`
    );
  }
  process.exit(0);
});

function processHook(input) {
  const cwd = input.cwd || process.cwd();
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};

  // Only process Write and Edit
  if (toolName !== "Write" && toolName !== "Edit") return;

  const filePath = toolInput.file_path;
  if (!filePath) return;

  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(cwd, filePath);
  const relPath = path
    .relative(cwd, absPath)
    .split(path.sep)
    .join("/");

  // Skip .forgeplan/ files — don't register bookkeeping as node files
  if (relPath.startsWith(".forgeplan/")) return;

  // Track shared types creation in state (but don't register in manifest)
  if (relPath === "src/shared/types/index.ts") {
    try {
      const stateData = JSON.parse(fs.readFileSync(
        path.join(cwd, ".forgeplan", "state.json"), "utf-8"
      ));
      if (stateData.active_node && (stateData.active_node.status === "building" || stateData.active_node.status === "review-fixing" || stateData.active_node.status === "sweeping")) {
        const nodeId = stateData.active_node.node;
        if (!stateData.shared_types_created_by) {
          stateData.shared_types_created_by = nodeId;
          atomicWriteJson(path.join(cwd, ".forgeplan", "state.json"), stateData);
        }
      }
    } catch { /* best effort */ }
    return; // Don't register in manifest files list
  }

  const forgePlanDir = path.join(cwd, ".forgeplan");
  const statePath = path.join(forgePlanDir, "state.json");
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");

  if (!fs.existsSync(statePath) || !fs.existsSync(manifestPath)) return;

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch {
    return;
  }

  // Only register during active builds (including review-fixing and sweeping)
  if (!state.active_node || (state.active_node.status !== "building" && state.active_node.status !== "review-fixing" && state.active_node.status !== "sweeping")) return;

  const activeNodeId = state.active_node.node;

  // --- 1. Classify file BEFORE registering in manifest ---
  // Must happen first so the manifest check sees pre-build state
  // NOTE: Uses the single `state` object read at line 86. No re-reads — avoids TOCTOU race.
  let fileAction = "created"; // default for conversation log
  let stateModified = false; // track if we need to write state back
  try {

    if (!state.nodes) state.nodes = {};
    if (!state.nodes[activeNodeId]) {
      state.nodes[activeNodeId] = { status: state.active_node.status };
    }
    if (!state.nodes[activeNodeId].files_created) {
      state.nodes[activeNodeId].files_created = [];
    }
    if (!state.nodes[activeNodeId].files_modified) {
      state.nodes[activeNodeId].files_modified = [];
    }

    const alreadyKnown =
      state.nodes[activeNodeId].files_created.includes(relPath) ||
      state.nodes[activeNodeId].files_modified.includes(relPath);

    let targetList;
    if (alreadyKnown) {
      targetList = null;
    } else if (toolName === "Edit") {
      targetList = "files_modified";
      fileAction = "edited";
    } else {
      // Write tool: determine if this is a new file or overwrite of existing
      // Check sources in order (any match = pre-existing):
      //   1. Pre-build snapshot (most reliable — set at build start)
      //   2. Manifest files list (any node)
      //   3. Git tracking (committed/staged)
      //   4. None found = genuinely new
      let preExisting = false;

      // Source 1: pre-build file snapshot (set by /forgeplan:build setup)
      const preBuildFiles = state.nodes[activeNodeId].pre_build_files || [];
      const absRelPath = path.join(cwd, relPath);
      if (preBuildFiles.some((f) => {
        // Normalize for comparison
        const normF = f.replace(/\\/g, "/");
        const normRel = relPath.replace(/\\/g, "/");
        return normF === normRel || normF.endsWith("/" + normRel) || normF === absRelPath;
      })) {
        preExisting = true;
      }

      // Source 2: manifest files list
      if (!preExisting) {
        try {
          const mText = fs.readFileSync(manifestPath, "utf-8");
          const mData = yaml.load(mText);
          if (mData.nodes) {
            for (const [nid, ndata] of Object.entries(mData.nodes)) {
              if ((ndata.files || []).includes(relPath)) {
                preExisting = true;
                break;
              }
            }
          }
        } catch {
          // Can't check manifest
        }
      }

      // Source 3: git tracking
      if (!preExisting) {
        try {
          const { execFileSync } = require("child_process");
          const result = execFileSync(
            "git", ["ls-files", "--", relPath],
            { cwd, encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"] }
          ).trim();
          if (result.length > 0) preExisting = true;
        } catch {
          // Git not available
        }
      }

      if (preExisting) {
        targetList = "files_modified";
        fileAction = "overwrote";
      } else {
        targetList = "files_created";
        fileAction = "created";
      }
    }

    if (targetList && !state.nodes[activeNodeId][targetList].includes(relPath)) {
      state.nodes[activeNodeId][targetList].push(relPath);
      stateModified = true;
    }
  } catch (err) {
    process.stderr.write(
      `ForgePlan: Could not determine if this file is new or modified. File tracking may be incomplete — run /forgeplan:status to verify.\n`
    );
  }

  // --- 1b. Sweep mode: track modified files per pass ---
  // Uses same `state` object — no re-read needed (single read/modify/write pattern)
  if (state.active_node && state.active_node.status === "sweeping") {
    try {
      if (state.sweep_state) {
        const passKey = String(state.sweep_state.pass_number || 1);
        if (!state.sweep_state.modified_files_by_pass) {
          state.sweep_state.modified_files_by_pass = {};
        }
        if (!state.sweep_state.modified_files_by_pass[passKey]) {
          state.sweep_state.modified_files_by_pass[passKey] = [];
        }
        if (!state.sweep_state.modified_files_by_pass[passKey].includes(relPath)) {
          state.sweep_state.modified_files_by_pass[passKey].push(relPath);
          stateModified = true;
        }
      }
    } catch (err) {
      process.stderr.write(
        `ForgePlan: Could not record this file change for the current sweep pass. The sweep's per-pass diff may be incomplete.\n`
      );
    }
  }

  // --- Skill Learner: increment write counter during builds ---
  // Counter is persisted in the atomic state write below; scan triggers at end of function
  let skillLearnerWriteCount = 0;
  if (state.active_node && state.active_node.status === "building" && state.nodes && state.nodes[activeNodeId]) {
    skillLearnerWriteCount = (state.nodes[activeNodeId]._skill_learner_writes || 0) + 1;
    state.nodes[activeNodeId]._skill_learner_writes = skillLearnerWriteCount;
    stateModified = true;
  }

  // Single write: flush all state changes at once (avoids TOCTOU race from multiple reads)
  if (stateModified) {
    state.last_updated = new Date().toISOString();
    atomicWriteJson(statePath, state);
  }

  // --- 2. Register file in manifest (after classification) ---
  try {
    const manifestText = fs.readFileSync(manifestPath, "utf-8");
    const manifest = yaml.load(manifestText);

    if (manifest.nodes && manifest.nodes[activeNodeId]) {
      const node = manifest.nodes[activeNodeId];
      if (!node.files) node.files = [];

      if (!node.files.includes(relPath)) {
        node.files.push(relPath);

        // Note: revision_count is incremented by /forgeplan:revise, not per-file registration

        const updatedYaml = yaml.dump(manifest, {
          lineWidth: -1,
          noRefs: true,
          quotingType: '"',
          forceQuotes: false,
        });
        const tmpManifest = manifestPath + ".tmp";
        fs.writeFileSync(tmpManifest, updatedYaml, "utf-8");
        fs.renameSync(tmpManifest, manifestPath);
      }
    }
  } catch (err) {
    process.stderr.write(
      `ForgePlan PostToolUse: Could not register file in manifest: ${err.message}\n`
    );
  }

  // --- 3. Log to node conversation file ---
  try {
    const convPath = path.join(
      forgePlanDir,
      "conversations",
      "nodes",
      `${activeNodeId}.md`
    );
    const convDir = path.dirname(convPath);
    if (!fs.existsSync(convDir)) {
      fs.mkdirSync(convDir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const actionLabel = fileAction.charAt(0).toUpperCase() + fileAction.slice(1);
    const logEntry = `- [${timestamp}] ${actionLabel}: \`${relPath}\`\n`;

    fs.appendFileSync(convPath, logEntry, "utf-8");
  } catch (err) {
    process.stderr.write(
      `ForgePlan PostToolUse: Could not log to conversation: ${err.message}\n`
    );
  }

  // --- Sprint 9: Wiki appending (decision markers) ---
  // NOTE: `manifest` from line 95 is block-scoped inside a try block and not in scope here.
  // Re-read the manifest for tier checking. This is a cheap operation (file is small, OS-cached).
  try {
    const manifestPath = path.join(forgePlanDir, "manifest.yaml");
    if (!fs.existsSync(manifestPath)) return; // No manifest = no wiki
    const wikiManifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
    const tier = wikiManifest && wikiManifest.project && wikiManifest.project.complexity_tier;
    if (tier && tier !== "SMALL" && state.active_node && state.active_node.node) {
      const wikiNodeId = state.active_node.node;
      // Defense-in-depth: validate nodeId format before using in file path
      if (!NODE_ID_REGEX.test(wikiNodeId)) return;
      // Get content to scan: Write = full content, Edit = new_string only (partial — acceptable)
      const content = toolName === "Write" ? (toolInput.content || "") : (toolInput.new_string || "");
      const ext = path.extname(relPath || "").toLowerCase();
      const binaryExts = [".png",".jpg",".gif",".woff",".eot",".ico",".pdf",".zip",".ttf"];
      // Skip large files (>50KB) and binary files
      if (content.length <= 50000 && !binaryExts.includes(ext)) {
        // Import DECISION_REGEX and sanitizeForMarkdown from wiki-builder to avoid duplication
        // If wiki-builder is unavailable (not yet built), use inline fallbacks
        let DECISION_RE;
        let sanitize;
        try {
          const wb = require("./lib/wiki-builder");
          DECISION_RE = wb.DECISION_REGEX;
          sanitize = wb.sanitizeForMarkdown;
        } catch (_) {
          DECISION_RE = /@forgeplan-decision:\s*(D-\S+-\d+-\S+)\s*--\s*([^\n]+)/g;
          sanitize = (s) => s.replace(/\|/g, "-").replace(/\n/g, " ").replace(/<[^>]*>/g, "").trim();
        }
        const matches = [];
        let m;
        const re = new RegExp(DECISION_RE.source, DECISION_RE.flags);
        while ((m = re.exec(content)) !== null) {
          matches.push({ id: m[1], description: m[2].trim() });
        }
        if (matches.length > 0) {
          const wikiDir = path.join(forgePlanDir, "wiki");
          const nodesDir = path.join(wikiDir, "nodes");
          // Create skeleton if missing (handles first build, tier upgrade, manual deletion)
          if (!fs.existsSync(nodesDir)) {
            fs.mkdirSync(nodesDir, { recursive: true });
            // Create minimal skeleton files
            if (!fs.existsSync(path.join(wikiDir, "index.md"))) {
              fs.writeFileSync(path.join(wikiDir, "index.md"), "# Wiki\n", "utf-8");
            }
            if (!fs.existsSync(path.join(wikiDir, "decisions.md"))) {
              fs.writeFileSync(path.join(wikiDir, "decisions.md"), "# Architectural Decisions\n", "utf-8");
            }
            if (!fs.existsSync(path.join(wikiDir, "rules.md"))) {
              fs.writeFileSync(path.join(wikiDir, "rules.md"), "# Rules & Patterns\n", "utf-8");
            }
          }
          // Append decision markers to node wiki page
          const wikiPagePath = path.join(nodesDir, wikiNodeId + ".md");
          let appendText = "";
          for (const match of matches) {
            appendText += `- **${match.id}**: ${sanitize(match.description)} [${relPath}]\n`;
          }
          fs.appendFileSync(wikiPagePath, appendText, "utf-8");
        }
      }
    }
  } catch (wikiErr) {
    // Wiki appending is best-effort — never block the build
    // Silent catch: wiki will be rebuilt by compile-wiki.js later
  }

  // --- Skill Learner: periodic pattern scan ---
  // Only run during builds (not reviews/sweeps) and only every 20 file writes.
  // Check config.yaml — skip entirely if skills are disabled.
  if (skillLearnerWriteCount > 0 && skillLearnerWriteCount % 20 === 0) {
    try {
      // Read config.yaml to check if skills are enabled
      const configPath = path.join(forgePlanDir, "config.yaml");
      let skillsEnabled = true; // default: enabled
      if (fs.existsSync(configPath)) {
        const configData = yaml.load(fs.readFileSync(configPath, "utf-8"));
        if (configData && configData.skills && configData.skills.enabled === false) {
          skillsEnabled = false;
        }
      }

      if (skillsEnabled) {
        const skillLearner = require("./skill-learner");
        const result = skillLearner.scan(cwd, { minOccurrences: 3 });
        if (result.patterns.length > 0) {
          let draftsCreated = 0;
          for (const pattern of result.patterns) {
            const saved = skillLearner.saveDraft(cwd, pattern);
            if (saved) draftsCreated++;
          }
          if (draftsCreated > 0) {
            process.stderr.write(
              `[ForgePlan] Skill Learner: ${draftsCreated} new pattern(s) detected. Review with /forgeplan:skill review\n`
            );
          }
        }
      }
    } catch {
      // Skill learner is non-blocking — failures are silent
    }
  }
}
