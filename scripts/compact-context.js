#!/usr/bin/env node

/**
 * compact-context.js — ForgePlan Compaction Protection
 *
 * PreCompact: Saves critical project state to a compact summary file.
 * PostCompact: Re-injects the summary so Claude regains awareness after compaction.
 *
 * Usage:
 *   node compact-context.js --pre    (called by PreCompact hook)
 *   node compact-context.js --post   (called by PostCompact hook)
 *
 * Why: Long sessions (deep-build, sweep) hit context compaction. Without this,
 * Claude loses awareness of the manifest, active node, enforcement boundaries,
 * and current operation. This causes it to write outside file_scope, ignore
 * spec constraints, or lose track of sweep progress.
 */

const fs = require("fs");
const path = require("path");

const cwd = process.cwd();
const forgePlanDir = path.join(cwd, ".forgeplan");
const contextFile = path.join(forgePlanDir, ".compact-context.md");

function preCompact() {
  if (!fs.existsSync(forgePlanDir)) {
    // No ForgePlan project — nothing to protect
    process.exit(0);
  }

  const sections = [];
  sections.push("# ForgePlan Context (preserved across compaction)");
  sections.push("");

  // --- Manifest summary ---
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  if (fs.existsSync(manifestPath)) {
    try {
      const yamlPath = path.join(__dirname, "..", "node_modules", "js-yaml");
      const yaml = require(yamlPath);
      const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));

      const project = manifest.project || {};
      sections.push(`## Project: ${project.name || "Unknown"}`);
      sections.push(`- Tier: ${project.complexity_tier || "not set"}`);

      if (project.tech_stack) {
        const ts = project.tech_stack;
        sections.push(`- Stack: ${ts.runtime || "node"} / ${ts.language || "typescript"} / ${ts.api_framework || "?"} / ${ts.database || "?"}`);
      }

      // Node list with file scopes (critical for enforcement awareness)
      if (manifest.nodes) {
        const nodeIds = Object.keys(manifest.nodes);
        sections.push(`- Nodes (${nodeIds.length}):`);
        for (const [id, node] of Object.entries(manifest.nodes)) {
          sections.push(`  - **${id}** (${node.type || "?"}) — file_scope: \`${node.file_scope || "?"}\``);
          if (node.depends_on && node.depends_on.length > 0) {
            sections.push(`    depends_on: ${node.depends_on.join(", ")}`);
          }
        }
      }

      // Shared models
      if (manifest.shared_models) {
        const modelNames = Object.keys(manifest.shared_models);
        if (modelNames.length > 0) {
          sections.push(`- Shared models: ${modelNames.join(", ")}`);
          sections.push(`  - PROTECTED: Only modifiable via /forgeplan:revise --model`);
        }
      }

      sections.push("");
    } catch {
      sections.push("## Manifest: Could not read (may be corrupted)");
      sections.push("");
    }
  }

  // --- State summary ---
  const statePath = path.join(forgePlanDir, "state.json");
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

      sections.push("## Current State");

      // Active node
      if (state.active_node && state.active_node.node) {
        const an = state.active_node;
        sections.push(`- **ACTIVE NODE: ${an.node}** (status: ${an.status})`);
        sections.push(`  - ALL writes must be within this node's file_scope`);
        sections.push(`  - PreToolUse hook enforces this — out-of-scope writes will be BLOCKED`);
      } else {
        sections.push("- No active node (idle)");
      }

      // Node statuses
      if (state.nodes) {
        const statuses = {};
        for (const [id, ns] of Object.entries(state.nodes)) {
          const s = ns.status || "pending";
          if (!statuses[s]) statuses[s] = [];
          statuses[s].push(id);
        }
        sections.push("- Node statuses:");
        for (const [status, ids] of Object.entries(statuses)) {
          sections.push(`  - ${status}: ${ids.join(", ")}`);
        }
      }

      // Sweep state
      if (state.sweep_state) {
        const ss = state.sweep_state;
        sections.push("");
        sections.push("## Active Operation");
        sections.push(`- Operation: **${ss.operation || "?"}**`);
        sections.push(`- Phase: ${ss.current_phase || "?"}`);
        sections.push(`- Pass: ${ss.pass_number || 1}`);
        sections.push(`- Model: ${ss.current_model || "claude"}`);

        if (ss.fixing_node) {
          sections.push(`- Currently fixing node: **${ss.fixing_node}**`);
        }

        // Finding counts
        const pendingCount = (ss.findings && ss.findings.pending) ? ss.findings.pending.length : 0;
        const resolvedCount = (ss.findings && ss.findings.resolved) ? ss.findings.resolved.length : 0;
        sections.push(`- Findings: ${pendingCount} pending, ${resolvedCount} resolved`);

        // Convergence
        if (ss.agent_convergence) {
          const agents = Object.entries(ss.agent_convergence);
          const converged = agents.filter(([, a]) => a.status === "converged" || a.status === "force-converged").length;
          sections.push(`- Agent convergence: ${converged}/${agents.length} converged`);
        }

        // Blocked decisions
        if (ss.blocked_decisions && ss.blocked_decisions.length > 0) {
          sections.push(`- **${ss.blocked_decisions.length} blocked decisions** awaiting user input`);
        }

        sections.push(`- Max passes: ${ss.max_passes || 10}`);
        sections.push(`- Consecutive clean: ${ss.consecutive_clean_passes || 0}`);
      }

      sections.push("");
    } catch {
      sections.push("## State: Could not read (may be corrupted)");
      sections.push("- Run /forgeplan:recover to diagnose");
      sections.push("");
    }
  }

  // --- Enforcement reminders ---
  sections.push("## Enforcement Rules (always active)");
  sections.push("- PreToolUse (Layer 1): Deterministic file_scope check — writes outside active node's scope are BLOCKED");
  sections.push("- PreToolUse (Layer 2): LLM spec compliance — writes must comply with spec constraints, non-goals, shared model fields");
  sections.push("- Layer 2 is BYPASSED when node status is 'sweeping' (sweep fixes are cross-cutting)");
  sections.push("- PostToolUse: Auto-registers written files in state.json");
  sections.push("- Stop hook: Evaluates acceptance criteria before allowing build completion");
  sections.push("- Shared types (src/shared/types/) are PROTECTED — only modifiable during revise operations");

  const content = sections.join("\n") + "\n";

  try {
    fs.writeFileSync(contextFile, content, "utf-8");
  } catch {
    // Best effort — don't block compaction
  }

  process.exit(0);
}

function postCompact() {
  if (!fs.existsSync(contextFile)) {
    // No saved context — nothing to re-inject
    process.exit(0);
  }

  try {
    const content = fs.readFileSync(contextFile, "utf-8");
    // Output to stderr so Claude sees it as system feedback
    process.stderr.write(
      "\n--- ForgePlan Context Restored (post-compaction) ---\n" +
      content +
      "--- End Restored Context ---\n"
    );
  } catch {
    process.stderr.write(
      "\n--- ForgePlan: Could not restore context after compaction. " +
      "Read .forgeplan/state.json and .forgeplan/manifest.yaml to re-orient. ---\n"
    );
  }

  process.exit(0);
}

// --- Main ---
const mode = process.argv[2];
if (mode === "--pre") {
  preCompact();
} else if (mode === "--post") {
  postCompact();
} else {
  console.error("Usage: node compact-context.js --pre|--post");
  process.exit(2);
}
