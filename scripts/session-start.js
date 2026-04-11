#!/usr/bin/env node

/**
 * SessionStart Hook — ForgePlan Core
 *
 * Runs when a Claude Code session starts or resumes.
 *
 * Problem detection (priority):
 *   - Stuck builds (active_node in building/reviewing/etc.)
 *   - Interrupted sweeps/deep-builds
 *   - Blocked decisions from sweep
 *   - Missing manifest
 *   - Corrupted state.json
 *
 * Ambient healthy-state display (Sprint 7B Pillar 1):
 *   - One-line project summary with node counts and suggested next command
 *   - Complexity tier from manifest
 *   - Active sweep progress (non-stuck)
 */

const fs = require("fs");
const path = require("path");

const { atomicWriteJson } = require("./lib/atomic-write");

function main() {
  const cwd = process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");

  // Check if .forgeplan/ exists in the current project
  if (!fs.existsSync(forgePlanDir)) {
    // No ForgePlan project — show first-run welcome
    process.stderr.write(
      "\n" +
      "--- ForgePlan Core ---\n" +
      "Architecture-governed AI build harness.\n" +
      "\n" +
      "No project detected in this directory. Quick start:\n" +
      "  /forgeplan:discover    Describe what you want to build\n" +
      "  /forgeplan:ingest      Already have code? Bring it under governance\n" +
      "  /forgeplan:guide       Walkthrough of how ForgePlan works\n" +
      "  /forgeplan:help        See all commands\n" +
      "---------------------------\n"
    );
    process.exit(0);
  }

  const statePath = path.join(forgePlanDir, "state.json");
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");

  const warnings = [];
  let state = null;
  let stateCorrupted = false;

  // ─── Problem Detection ───────────────────────────────────────────

  // Check for stuck builds in state.json
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

      // Clear stale stop_hook_active flag and bounce_count from crashed sessions
      if (state.stop_hook_active) {
        state.stop_hook_active = false;
        // Reset per-node bounce_count for the active node (stop-hook reads this, not top-level)
        if (state.active_node && state.active_node.node && state.nodes && state.nodes[state.active_node.node]) {
          state.nodes[state.active_node.node].bounce_count = 0;
        }
        delete state.bounce_count; // Remove spurious top-level field if it exists
        state.last_updated = new Date().toISOString();
        try {
          atomicWriteJson(statePath, state);
        } catch { /* best effort */ }
        warnings.push(
          `Cleaned up stale build state from a previous session. No action needed.`
        );
      }

      // Check if active_node was left in any in-progress status
      const stuckStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];
      if (
        state.active_node &&
        stuckStatuses.includes(state.active_node.status)
      ) {
        warnings.push(
          `WARNING: Node "${state.active_node.node}" was left in "${state.active_node.status}" status. ` +
            `It may have crashed. Run /forgeplan:recover to resume, reset, or review.`
        );
      }

      // Check for any nodes stuck in in-progress statuses
      if (state.nodes) {
        for (const [nodeId, nodeState] of Object.entries(state.nodes)) {
          if (
            stuckStatuses.includes(nodeState.status) &&
            (!state.active_node || state.active_node.node !== nodeId)
          ) {
            warnings.push(
              `WARNING: Node "${nodeId}" is stuck in "${nodeState.status}" status. Run /forgeplan:recover.`
            );
          }
        }
      }

      // Check for interrupted sweep/deep-build
      if (state.sweep_state && state.sweep_state.operation) {
        const ss = state.sweep_state;
        const op = ss.operation === "deep-building" ? "deep-build" : "sweep";

        // If both active_node AND sweep_state exist, this is a single crash event
        // (e.g., deep-build was mid-build, or sweep was mid-fix). Show ONE combined warning.
        if (state.active_node && stuckStatuses.includes(state.active_node.status)) {
          // Remove any per-node warning already pushed for this node (avoid duplication)
          const nodeId = state.active_node.node;
          const idx = warnings.findIndex(w => w.includes(`"${nodeId}"`));
          if (idx !== -1) warnings.splice(idx, 1);

          warnings.push(
            `WARNING: An interrupted ${op} was detected during node "${nodeId}" ` +
            `${state.active_node.status === "sweeping" ? "fix" : "build"} ` +
            `(phase: ${ss.current_phase}, pass: ${ss.pass_number}). ` +
            `Run /forgeplan:recover to resume or abort the ${op}.`
          );
        } else {
          warnings.push(
            `WARNING: An interrupted ${op} was detected (phase: ${ss.current_phase}, pass: ${ss.pass_number}). ` +
            `Run /forgeplan:recover to resume, restart the current pass, or abort.`
          );
        }
      }

      // Sprint 9: Detect interrupted split
      const splitBreadcrumb = path.join(forgePlanDir, ".split-in-progress.json");
      if (fs.existsSync(splitBreadcrumb)) {
        try {
          const raw = fs.readFileSync(splitBreadcrumb, "utf-8");
          // Size guard: skip if breadcrumb is corrupted/huge (>5MB)
          if (raw.length > 5 * 1024 * 1024) {
            warnings.push(
              "WARNING: .split-in-progress.json is too large (>5MB). May be corrupted.\n" +
              "   Delete it manually or run /forgeplan:recover to investigate."
            );
          } else {
            const breadcrumb = JSON.parse(raw);
            const remaining = ["specs", "manifest", "state", "wiki"].filter(
              s => !(breadcrumb.completed_steps || []).includes(s)
            );
            warnings.push(
              `WARNING: Split of "${breadcrumb.parent_node_id}" into [${(breadcrumb.child_nodes || []).join(", ")}] was interrupted.\n` +
              `   Started: ${breadcrumb.started_at || "unknown"}\n` +
              `   Completed: ${(breadcrumb.completed_steps || []).join(", ") || "none"}\n` +
              `   Remaining: ${remaining.join(", ")}\n` +
              `   Run /forgeplan:recover to resume or rollback.`
            );
          }
        } catch (err) {
          warnings.push(
            "WARNING: .split-in-progress.json exists but cannot be read. May be corrupted.\n" +
            "   Run /forgeplan:recover or delete the file manually."
          );
        }
      }

      // Check for pending blocked decisions from a previous sweep
      if (state.sweep_state && state.sweep_state.blocked_decisions && state.sweep_state.blocked_decisions.length > 0) {
        const count = state.sweep_state.blocked_decisions.length;
        warnings.push(
          `PENDING: ${count} architectural decision(s) from the last sweep need your input before the pipeline can continue.`
        );
        warnings.push(`Run /forgeplan:sweep to review and resolve them, or see them with /forgeplan:status.`);
      }
    } catch (err) {
      stateCorrupted = true;
      warnings.push(
        `WARNING: .forgeplan/state.json is corrupted: ${err.message}. To fix: delete it with 'rm .forgeplan/state.json' then run /forgeplan:recover, or run /forgeplan:discover to reinitialize.`
      );
    }
  }

  // Check manifest exists
  let manifestMissing = false;
  if (!fs.existsSync(manifestPath)) {
    manifestMissing = true;
    warnings.push(
      `ForgePlan project detected but no manifest.yaml found. Run /forgeplan:discover to create one.`
    );
  }

  // Output warnings to stderr (shown to Claude as feedback)
  if (warnings.length > 0) {
    process.stderr.write(
      "\n--- ForgePlan Session Check ---\n" +
        warnings.join("\n") +
        "\n-------------------------------\n"
    );
  }

  // ─── Ambient Healthy-State Display ───────────────────────────────
  // Only show when there are no blocking problems
  if (!stateCorrupted && !manifestMissing) {
    try {
      const ambient = buildAmbientStatus(forgePlanDir, manifestPath, statePath, state);
      if (ambient) {
        process.stderr.write(ambient);
      }
    } catch {
      // Ambient display must never block — swallow all errors
    }
  }

  process.exit(0);
}

/**
 * Build the ambient healthy-state display string.
 * Returns null if there's nothing useful to show.
 */
function buildAmbientStatus(forgePlanDir, manifestPath, statePath, state) {
  // Load manifest via js-yaml
  let yaml;
  try {
    yaml = require("js-yaml");
  } catch {
    // js-yaml not installed — skip ambient display
    return null;
  }

  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }

  if (!manifest || !manifest.nodes || typeof manifest.nodes !== "object") {
    return null;
  }

  const nodeIds = Object.keys(manifest.nodes);
  if (nodeIds.length === 0) {
    return null;
  }

  // Gather node statuses from state
  const nodeStates = (state && state.nodes) ? state.nodes : {};

  const counts = {
    total: nodeIds.length,
    pending: 0,
    specced: 0,
    built: 0,       // "built" only — awaiting review
    revised: 0,     // "revised" = spec changed, code is stale, needs rebuild
    reviewed: 0,    // "reviewed" — truly complete
    inProgress: 0,  // building, reviewing, review-fixing, revising, sweeping
  };

  const inProgressStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];
  const builtStatuses = ["built"];

  for (const id of nodeIds) {
    const ns = nodeStates[id];
    const status = (ns && ns.status) ? ns.status : "pending";

    if (status === "pending") {
      counts.pending++;
    } else if (status === "specced") {
      counts.specced++;
    } else if (status === "revised") {
      counts.revised++;
    } else if (builtStatuses.includes(status)) {
      counts.built++;
    } else if (status === "reviewed") {
      counts.reviewed++;
    } else if (inProgressStatuses.includes(status)) {
      counts.inProgress++;
    }
  }

  // Project name
  const projectName = (manifest.project && manifest.project.name)
    ? manifest.project.name
    : "Untitled";

  // Complexity tier
  const tier = (manifest.project && manifest.project.complexity_tier)
    ? manifest.project.complexity_tier
    : null;

  // Determine suggested next command based on project state
  const suggestion = determineSuggestion(counts, state, nodeIds, nodeStates, manifest);

  // Build the output lines
  const lines = [];
  lines.push("");
  lines.push("--- ForgePlan ---");

  // One-line summary — show built and reviewed separately for clarity
  let summaryLine = `${projectName} -- ${counts.total} nodes`;
  const parts = [];
  if (counts.reviewed > 0) parts.push(`${counts.reviewed} reviewed`);
  if (counts.built > 0) parts.push(`${counts.built} built`);
  if (counts.specced > 0) parts.push(`${counts.specced} specced`);
  if (counts.pending > 0) parts.push(`${counts.pending} pending`);
  if (parts.length > 0) summaryLine += ` (${parts.join(", ")})`;
  if (counts.revised > 0) {
    summaryLine += `, ${counts.revised} revised (needs rebuild)`;
  }
  if (tier) {
    summaryLine += ` | Tier: ${tier}`;
  }
  lines.push(summaryLine);

  // Per-node status breakdown (compact) — show for 2+ nodes with mixed states
  if (counts.total > 1 && counts.total <= 12) {
    const statusMap = {};
    for (const id of nodeIds) {
      const ns = nodeStates[id];
      const status = (ns && ns.status) ? ns.status : "pending";
      if (!statusMap[status]) statusMap[status] = [];
      statusMap[status].push(id);
    }
    // Only show if there's more than one distinct status (otherwise the summary line is sufficient)
    if (Object.keys(statusMap).length > 1) {
      const parts = [];
      for (const [status, ids] of Object.entries(statusMap)) {
        parts.push(`${status}: ${ids.join(", ")}`);
      }
      lines.push(`  ${parts.join(" | ")}`);
    }
  }

  // Active sweep progress (non-stuck — stuck sweeps are already shown as warnings above)
  const sweepProgress = getSweepProgress(state);
  if (sweepProgress) {
    lines.push(sweepProgress);
  }

  // Sprint 9: Wiki status (MEDIUM/LARGE only)
  const wikiTier = manifest && manifest.project && manifest.project.complexity_tier;
  if (wikiTier && wikiTier !== "SMALL") {
    const wikiStatus = isWikiStale(state, forgePlanDir);
    if (wikiStatus === "failed") {
      lines.push("  Wiki: compilation failed 3 times. Run 'node scripts/compile-wiki.js --verbose' to diagnose, or /forgeplan:recover to reset the counter.");
    } else if (wikiStatus === "not-initialized") {
      lines.push("  Wiki: not yet initialized. Will be created during first sweep.");
    } else if (wikiStatus === "deleted") {
      lines.push("  Wiki: deleted \u2014 will rebuild on next sweep.");
    } else if (wikiStatus === "interrupted") {
      lines.push("  Wiki: compilation was interrupted \u2014 will retry on next sweep.");
    } else if (wikiStatus === "stale") {
      lines.push(`  Wiki: stale (last compiled: ${state.wiki_last_compiled}). Will refresh on next sweep.`);
    } else {
      lines.push(`  Wiki: up to date (compiled: ${state.wiki_last_compiled}).`);
    }
  }

  // Sprint 10B: Phase awareness
  const buildPhase = manifest && manifest.project && manifest.project.build_phase;
  if (buildPhase && buildPhase > 0) {
    const maxPhase = Math.max(...Object.values(manifest.nodes || {}).map(n => n.phase || 1));
    if (maxPhase > 1) {
      const currentPhaseNodes = Object.entries(manifest.nodes || {})
        .filter(([_, n]) => (n.phase || 1) <= buildPhase)
        .map(([id]) => id);
      const futurePhaseNodes = Object.entries(manifest.nodes || {})
        .filter(([_, n]) => (n.phase || 1) > buildPhase)
        .map(([id]) => id);
      lines.push(`  Phase: ${buildPhase} of ${maxPhase} (${currentPhaseNodes.length} active | ${futurePhaseNodes.length} pending)`);

      // Staleness warning: >7 days without advancement
      if (state && state.build_phase_started_at) {
        const started = new Date(state.build_phase_started_at);
        const daysSince = (Date.now() - started.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 7) {
          lines.push(`  WARNING: Phase ${buildPhase} has been active for ${Math.floor(daysSince)} days. Future-phase stubs are fail-closed. Run /forgeplan:status to check progress.`);
        }
      }
    }
  }

  // Sprint 11: Skill registry staleness check — skip if skills are disabled
  let skillsDisabled = false;
  let loadedConfig = null;
  try {
    const configPathSkills = path.join(forgePlanDir, "config.yaml");
    if (fs.existsSync(configPathSkills)) {
      loadedConfig = yaml.load(fs.readFileSync(configPathSkills, "utf-8"));
      if (loadedConfig && loadedConfig.skills && loadedConfig.skills.enabled === false) {
        skillsDisabled = true;
      }
    }
    if (!skillsDisabled) {
      const { getEffectiveTier } = require("./lib/skill-helpers");
      const effectiveTier = getEffectiveTier(manifest, loadedConfig || {});
      if ((!loadedConfig || !loadedConfig.skills || loadedConfig.skills.enabled === undefined) && effectiveTier === "SMALL") {
        skillsDisabled = true;
      }
    }
  } catch { /* config read failure — proceed with default (enabled) */ }

  if (!skillsDisabled) {
    try {
      const { isRegistryStale } = require("./lib/skill-helpers");
      const projectRoot = path.dirname(forgePlanDir);
      const regStatus = isRegistryStale(manifest, forgePlanDir, loadedConfig, projectRoot);
      if (!regStatus.exists && nodeIds.length > 0) {
        lines.push("  Skills: no registry — will auto-generate on next build");
      } else if (regStatus.exists && regStatus.stale) {
        lines.push("  Skills: registry stale (manifest, config, or skill files changed) — will auto-refresh on next build");
      } else if (regStatus.exists && regStatus.activeCount > 0) {
        let skillLine = `  Skills: ${regStatus.activeCount} active`;
        if (regStatus.skillGapCount > 0) {
          skillLine += `, ${regStatus.skillGapCount} agent(s) have no skills — run /forgeplan:research to find relevant patterns`;
        }
        lines.push(skillLine);
      } else if (regStatus.exists && regStatus.skillGapCount > 0) {
        lines.push(`  Skills: ${regStatus.skillGapCount} agent(s) have no skills — run /forgeplan:research to find relevant patterns`);
      }
    } catch {
      // Skill registry check must never crash session start
    }
  }

  try {
    const { getDesignContextStatus } = require("./lib/design-context");
    const projectRoot = path.dirname(forgePlanDir);
    const designStatus = getDesignContextStatus(projectRoot, manifest, loadedConfig || {});
    if (designStatus.enabled && designStatus.files.length > 0) {
      lines.push(`  Design docs: ${designStatus.files.map((entry) => entry.relativePath).join(", ")}`);
    } else if (designStatus.enabled) {
      const expected = [
        ...(designStatus.expectedSources || []),
        ...((designStatus.expectedProfiles || []).map((profile) => `design-profile:${profile}`)),
      ];
      lines.push(`  Design docs: none detected (${expected.join(", ")})`);
    }
  } catch {
    // Design context is advisory only.
  }

  // Next command suggestion
  if (suggestion) {
    lines.push(`Next: ${suggestion}`);
  }

  lines.push("-----------------");

  return lines.join("\n") + "\n";
}

/**
 * Check wiki staleness. Returns a status string or false if fresh.
 * Takes state object as parameter to avoid re-reading state.json.
 * Sprint 9.
 */
function isWikiStale(state, forgePlanDir) {
  if (!state) return "not-initialized"; // State is null (corrupted or missing)
  if (!state.wiki_last_compiled) return "not-initialized"; // Never compiled
  if (!fs.existsSync(path.join(forgePlanDir, "wiki", "index.md"))) return "deleted"; // Wiki dir deleted
  if ((state.wiki_compile_attempts || 0) >= 3) return "failed"; // Exhausted retries (check BEFORE wiki_compiling — compiling is false after lockout)
  if (state.wiki_compiling) {
    return "interrupted"; // Previous compile crashed
  }
  const lastCompiled = new Date(state.wiki_last_compiled);
  const lastStateUpdate = new Date(state.last_updated);
  if (isNaN(lastCompiled.getTime()) || isNaN(lastStateUpdate.getTime())) return "stale"; // Corrupted timestamps
  if (lastStateUpdate > lastCompiled) return "stale";
  return false; // Wiki is fresh
}

/**
 * Determine the contextual next-command suggestion based on node states.
 * Includes specific node names in suggestions where possible.
 */
function determineSuggestion(counts, state, nodeIds, nodeStates, manifest) {
  const { total, pending, specced, built, revised, reviewed, inProgress } = counts;

  // If there's an active sweep that completed, suggest status/measure
  if (state && state.sweep_state) {
    const ss = state.sweep_state;
    // Sweep completed successfully (not halted, not interrupted)
    if (ss.current_phase === "finalizing" || (!ss.operation && ss.pass_number)) {
      return "/forgeplan:status or /forgeplan:measure";
    }
  }

  // Helper: find first node in a given status
  // "revised" is NOT built — it means "spec changed, needs rebuild"
  const builtStatuses = ["built"];
  function firstNodeInStatus(targetStatuses) {
    for (const id of nodeIds) {
      const ns = nodeStates[id];
      const status = (ns && ns.status) ? ns.status : "pending";
      if (targetStatuses.includes(status)) return id;
    }
    return null;
  }

  // Sprint 10B: Ingest-aware suggestions — descriptive specs need refinement before review/sweep
  // Check state.json first (spec_type cached there since ingest/spec commands write it),
  // fall back to reading spec YAML files if state doesn't have spec_type
  if (manifest && manifest.project) {
    const ingestBuildPhase = (manifest.project.build_phase) || 1;

    // Fast path: check state.json for cached spec_type
    for (const nodeId of nodeIds) {
      const ns = nodeStates[nodeId];
      if (!ns) continue;
      // Only skip nodes that are truly complete (reviewed). "revised" needs rebuild, not terminal.
      const isTerminal = ns.status === "reviewed";
      if (isTerminal) continue;
      const nodePhase = (manifest.nodes[nodeId] && manifest.nodes[nodeId].phase) || 1;
      if (nodePhase > ingestBuildPhase) continue;
      if (ns.spec_type === "descriptive") {
        return `/forgeplan:spec ${nodeId} (refine descriptive specs from ingest)`;
      }
    }

    // Slow path fallback: read spec YAML files (for projects ingested before spec_type caching)
    const specsDir = path.join(process.cwd(), ".forgeplan", "specs");
    if (fs.existsSync(specsDir)) {
      try {
        const specFiles = fs.readdirSync(specsDir).filter(f => f.endsWith(".yaml"));
        for (const sf of specFiles) {
          const nodeId = sf.replace(".yaml", "");
          if (!nodeIds.includes(nodeId)) continue;
          const nodePhase = (manifest.nodes[nodeId] && manifest.nodes[nodeId].phase) || 1;
          if (nodePhase > ingestBuildPhase) continue;
          const ns = nodeStates[nodeId];
          // Only skip nodes that are truly complete (reviewed). "revised" needs rebuild, not terminal.
          const isTerminal = ns && ns.status === "reviewed";
          if (isTerminal) continue;
          // Skip if state already has spec_type (already checked above)
          if (ns && ns.spec_type) continue;
          const filePath = path.join(specsDir, sf);
          const stat = fs.statSync(filePath);
          if (stat.size > 1024 * 1024) continue;
          const content = fs.readFileSync(filePath, "utf-8");
          if (content.includes('spec_type: "descriptive"') || content.includes("spec_type: descriptive")) {
            return `/forgeplan:spec ${nodeId} (refine descriptive specs from ingest)`;
          }
        }
      } catch (_) {}
    }
  }

  // Sprint 10B: Phase-aware suggestions — if only future-phase nodes remain, suggest advancement
  const buildPhase = (manifest && manifest.project && manifest.project.build_phase) || 1;
  const maxPhase = manifest ? Math.max(1, ...nodeIds.map(id => (manifest.nodes[id].phase || 1))) : 1;
  if (maxPhase > 1) {
    const currentPhaseNodes = nodeIds.filter(id => (manifest.nodes[id].phase || 1) <= buildPhase);
    // Only "reviewed" counts as complete. "revised" means spec changed, needs rebuild.
    const currentPhaseComplete = currentPhaseNodes.filter(id => {
      const ns = nodeStates[id];
      return ns && ns.status === "reviewed";
    }).length;
    if (currentPhaseComplete === currentPhaseNodes.length && currentPhaseNodes.length > 0 && buildPhase < maxPhase) {
      return `/forgeplan:deep-build (advance to phase ${buildPhase + 1})`;
    }
    // Only suggest actions for current-phase nodes
    const currentPending = currentPhaseNodes.filter(id => {
      const ns = nodeStates[id];
      return !ns || ns.status === "pending";
    });
    const currentSpecced = currentPhaseNodes.filter(id => {
      const ns = nodeStates[id];
      return ns && ns.status === "specced";
    });
    if (currentSpecced.length > 0) {
      // Check if the specced node has an interface-only spec (needs full spec before build)
      const specPath = path.join(process.cwd(), ".forgeplan", "specs", `${currentSpecced[0]}.yaml`);
      try {
        const specStat = fs.statSync(specPath);
        if (specStat.size < 1024 * 1024) {
          const specContent = fs.readFileSync(specPath, "utf-8");
          if (specContent.includes('spec_type: "interface-only"') || specContent.includes("spec_type: interface-only")) {
            return `/forgeplan:spec ${currentSpecced[0]} (promote interface-only spec to full)`;
          }
        }
      } catch (_) {}
      return `/forgeplan:build ${currentSpecced[0]}`;
    }
    if (currentPending.length > 0) {
      return `/forgeplan:spec ${currentPending[0]}`;
    }
  }

  // Any revised nodes — they need rebuild before anything else progresses
  if (revised > 0) {
    const node = firstNodeInStatus(["revised"]);
    if (node) return `/forgeplan:build ${node} (spec changed, needs rebuild)`;
  }

  // All reviewed — suggest sweep or integrate
  if (reviewed === total) {
    return "/forgeplan:sweep --cross-check or /forgeplan:integrate";
  }

  // All built or mix of built+reviewed — suggest review for a specific node
  if ((built + reviewed) === total && total > 0) {
    const node = firstNodeInStatus(builtStatuses);
    if (node) return `/forgeplan:review ${node}`;
    return "/forgeplan:sweep";
  }

  // Some built, some not — suggest the specific next action
  if ((built + reviewed) > 0 && (built + reviewed) < total) {
    // Suggest reviewing an unreviewed built node, or building a specced/revised node
    const builtNode = firstNodeInStatus(builtStatuses);
    if (builtNode) return `/forgeplan:review ${builtNode}`;
    const revisedNode = firstNodeInStatus(["revised"]);
    if (revisedNode) return `/forgeplan:build ${revisedNode} (spec changed, needs rebuild)`;
    const speccedNode = firstNodeInStatus(["specced"]);
    if (speccedNode) return `/forgeplan:build ${speccedNode}`;
    const pendingNode = firstNodeInStatus(["pending"]);
    if (pendingNode) return `/forgeplan:spec ${pendingNode}`;
    return "/forgeplan:next";
  }

  // All specced — suggest build for a specific node or deep-build
  if (specced === total && total > 0) {
    const node = firstNodeInStatus(["specced"]);
    if (node) return `/forgeplan:build ${node} or /forgeplan:deep-build`;
    return "/forgeplan:deep-build";
  }

  // Mix of specced and pending — suggest spec for a specific node
  if (specced > 0 && pending > 0 && (specced + pending) === total) {
    const node = firstNodeInStatus(["pending"]);
    if (node) return `/forgeplan:spec ${node}`;
    return "/forgeplan:spec";
  }

  // All pending — suggest spec --all
  if (pending === total && total > 0) {
    return "/forgeplan:spec --all";
  }

  // Some in-progress work — suggest next
  if (inProgress > 0) {
    return "/forgeplan:next";
  }

  // Fallback
  return "/forgeplan:next";
}

/**
 * Get sweep progress line for active (non-stuck) sweeps.
 * Returns null if no active sweep or if sweep is stuck/interrupted
 * (those are already handled by the warning logic).
 */
function getSweepProgress(state) {
  if (!state || !state.sweep_state || !state.sweep_state.operation) {
    return null;
  }

  const ss = state.sweep_state;

  // Skip if the sweep is in a stuck/interrupted state — warnings already cover it.
  // We detect "stuck" here by checking if there's also an active_node in a bad status,
  // which means the warning section already printed a recovery message.
  const stuckStatuses = ["building", "reviewing", "review-fixing", "revising", "sweeping"];
  if (state.active_node && stuckStatuses.includes(state.active_node.status)) {
    return null;
  }

  const op = ss.operation === "deep-building" ? "Deep-build" : "Sweep";
  const phase = ss.current_phase || "unknown";
  const pass = ss.pass_number || 1;

  // Count resolved findings
  let resolvedCount = 0;
  if (ss.findings && ss.findings.resolved && Array.isArray(ss.findings.resolved)) {
    resolvedCount = ss.findings.resolved.length;
  }

  // Count pending findings
  let pendingCount = 0;
  if (ss.findings && ss.findings.pending && Array.isArray(ss.findings.pending)) {
    pendingCount = ss.findings.pending.length;
  }

  let line = `${op} in progress: pass ${pass}, phase: ${phase}`;
  if (resolvedCount > 0 || pendingCount > 0) {
    line += `, ${resolvedCount} findings resolved`;
    if (pendingCount > 0) {
      line += `, ${pendingCount} pending`;
    }
  }

  // Show agent convergence if available
  if (ss.agent_convergence && typeof ss.agent_convergence === "object") {
    const agents = Object.entries(ss.agent_convergence);
    if (agents.length > 0) {
      const converged = agents.filter(([, a]) => a.status === "converged" || a.status === "force-converged").length;
      const active = agents.filter(([, a]) => a.status === "active").length;
      line += ` | agents: ${converged}/${agents.length} converged`;
      if (active > 0) line += `, ${active} active`;
    }
  }

  return line;
}

main();
