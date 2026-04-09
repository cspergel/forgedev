#!/usr/bin/env node

/**
 * skill-registry.js — ForgePlan Core Skill Registry Engine
 *
 * Pre-computes agent-to-skill assignments into .forgeplan/skills-registry.yaml.
 * Commands read this file at dispatch time — zero cascade computation at runtime.
 *
 * Subcommands:
 *   generate          Full cascade: scan, parse, match, write registry
 *   refresh           Alias for generate (re-evaluates against current manifest)
 *   validate          Check all skills pass quality gate, output JSON report
 *   compile-architect Read architect skills, compile into tier-aware block, output to stdout
 *
 * Usage: node skill-registry.js <subcommand> [--verbose]
 *
 * Exit codes:
 *   0 — success
 *   1 — validation failures found
 *   2 — error (missing manifest, parse error, etc.)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));

// ---------- Constants ----------

const VERBOSE = process.argv.includes("--verbose");

/** All agents that receive registry assignments (architect gets compiled skills instead). */
const REGISTRY_AGENTS = [
  "builder",
  "reviewer",
  "researcher",
  "sweep-adversary",
  "sweep-contractualist",
  "sweep-pathfinder",
  "sweep-structuralist",
  "sweep-skeptic",
];

/** Required frontmatter fields for any SKILL.md. */
const REQUIRED_FIELDS = ["name", "description", "when_to_use"];

/** Approximate tokens-per-line for size estimation. */
const TOKENS_PER_LINE = 4;

/** Maximum recommended skill size in tokens. */
const MAX_TOKENS = 5000;

/** Maximum recommended line count (~5000 tokens / ~4 tokens per line). */
const MAX_LINES = Math.ceil(MAX_TOKENS / TOKENS_PER_LINE);

/** Staleness threshold in days for validated_at. */
const STALENESS_DAYS = 90;

/** Default priority when not specified in frontmatter. */
const DEFAULT_PRIORITY = 50;

/** Default max_active per agent from config schema. */
const DEFAULT_MAX_ACTIVE = 5;

/** Default skill sources (searched in order). */
const DEFAULT_SOURCES = [".forgeplan/skills", "skills"];

// ---------- Logging ----------

function log(msg) {
  process.stderr.write(msg + "\n");
}
function debug(msg) {
  if (VERBOSE) log("  [debug] " + msg);
}

// ---------- Frontmatter Parsing ----------

/**
 * Parse YAML frontmatter from a SKILL.md file.
 * Reads ONLY between the first `---` and the second `---`.
 * Returns { frontmatter, lineCount, errors, warnings } or null on hard failure.
 */
function loadSkillFrontmatter(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return { frontmatter: null, lineCount: 0, errors: [`Cannot read file: ${err.message}`], warnings: [] };
  }

  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;

  // Find frontmatter boundaries
  let fmStart = -1;
  let fmEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      if (fmStart === -1) {
        fmStart = i;
      } else {
        fmEnd = i;
        break;
      }
    }
  }

  if (fmStart === -1 || fmEnd === -1) {
    return {
      frontmatter: null,
      lineCount: totalLines,
      errors: ["No YAML frontmatter found (missing --- delimiters)"],
      warnings: [],
    };
  }

  const fmYaml = lines.slice(fmStart + 1, fmEnd).join("\n");
  let frontmatter;
  try {
    frontmatter = yaml.load(fmYaml);
  } catch (err) {
    return {
      frontmatter: null,
      lineCount: totalLines,
      errors: [`Frontmatter YAML parse error: ${err.message}`],
      warnings: [],
    };
  }

  if (!frontmatter || typeof frontmatter !== "object") {
    return {
      frontmatter: null,
      lineCount: totalLines,
      errors: ["Frontmatter parsed but is not a valid object"],
      warnings: [],
    };
  }

  const errors = [];
  const warnings = [];

  // Validate required fields
  for (const field of REQUIRED_FIELDS) {
    if (!frontmatter[field] || (typeof frontmatter[field] === "string" && !frontmatter[field].trim())) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Apply default priority
  if (frontmatter.priority === undefined || frontmatter.priority === null) {
    frontmatter.priority = DEFAULT_PRIORITY;
  }

  // Normalize array fields (allow single strings)
  for (const arrayField of ["overrides", "tier_filter", "agent_filter", "tech_filter"]) {
    if (frontmatter[arrayField] !== undefined && frontmatter[arrayField] !== null) {
      if (!Array.isArray(frontmatter[arrayField])) {
        frontmatter[arrayField] = [frontmatter[arrayField]];
      }
    } else {
      frontmatter[arrayField] = [];
    }
  }

  // Validate agent_filter values against known agents
  if (frontmatter.agent_filter && frontmatter.agent_filter.length > 0) {
    for (const agent of frontmatter.agent_filter) {
      if (agent !== "architect" && !REGISTRY_AGENTS.includes(agent)) {
        warnings.push(
          `Skill ${frontmatter.name || "(unknown)"} targets unknown agent "${agent}" — will be silently excluded. Valid agents: architect, ${REGISTRY_AGENTS.join(", ")}`
        );
      }
    }
  }

  // Size warning
  const estimatedTokens = totalLines * TOKENS_PER_LINE;
  if (totalLines > MAX_LINES) {
    warnings.push(`Skill is ${totalLines} lines (~${estimatedTokens} tokens), exceeds recommended ${MAX_LINES} lines (~${MAX_TOKENS} tokens)`);
  }

  // Staleness warning
  if (frontmatter.validated_at) {
    const validatedDate = new Date(frontmatter.validated_at);
    if (!isNaN(validatedDate.getTime())) {
      const daysSince = Math.floor((Date.now() - validatedDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > STALENESS_DAYS) {
        warnings.push(`validated_at is ${daysSince} days old (threshold: ${STALENESS_DAYS} days)`);
      }
    }
  }

  return { frontmatter, lineCount: totalLines, errors, warnings };
}

// ---------- Skill Source Scanning ----------

/**
 * Determine tier label for a skill based on its source directory.
 * skills/core/ and skills/conditional/ → "curated"
 * .forgeplan/skills/ → "project" or "learned"
 * Everything else → "project"
 */
function classifyTier(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized.startsWith("skills/core/") || normalized.startsWith("skills/conditional/")) {
    return "curated";
  }
  if (normalized.startsWith(".forgeplan/skills/drafts/")) {
    return "draft"; // drafts are NOT included in registry
  }
  if (normalized.startsWith(".forgeplan/skills/")) {
    return "learned";
  }
  return "project";
}

/**
 * Recursively find all .md files in a directory.
 */
function findMdFiles(dir, visited = new Set()) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      // For symlinks, resolve first to check if target is a directory
      if (entry.isSymbolicLink() && !entry.isDirectory()) {
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isDirectory()) continue; // symlink to a file, not a directory — skip
        } catch (_) { continue; } // broken symlink — skip
      }
      // Skip drafts directory — drafts must be approved first
      if (entry.name === "drafts") continue;
      // Skip specification directory — not a skill for registry
      if (entry.name === "specification") continue;
      // Symlink/junction cycle detection: resolve real path, skip if already visited
      try {
        const realPath = fs.realpathSync(fullPath);
        const normReal = process.platform === "win32" ? realPath.toLowerCase() : realPath;
        if (visited.has(normReal)) continue;
        visited.add(normReal);
      } catch (_) { continue; } // unresolvable symlink — skip
      results.push(...findMdFiles(fullPath, visited));
    } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Scan configured skill sources, parse frontmatter, return metadata array.
 * Each entry: { path, name, description, when_to_use, priority, tier, frontmatter, errors, warnings }
 */
function scanSkillSources(config, projectRoot) {
  const sources = (config && config.skills && config.skills.sources) || DEFAULT_SOURCES;
  const skills = [];
  const seen = new Set(); // dedupe by name

  for (const sourceDir of sources) {
    const absDir = path.isAbsolute(sourceDir)
      ? sourceDir
      : path.join(projectRoot, sourceDir);

    debug(`Scanning source: ${sourceDir} (${absDir})`);
    const mdFiles = findMdFiles(absDir);
    debug(`  Found ${mdFiles.length} .md files`);

    for (const filePath of mdFiles) {
      const relPath = path.relative(projectRoot, filePath).replace(/\\/g, "/");
      const result = loadSkillFrontmatter(filePath);

      if (!result.frontmatter) {
        skills.push({
          path: relPath,
          name: path.basename(filePath, ".md"),
          tier: classifyTier(relPath),
          errors: result.errors,
          warnings: result.warnings,
          valid: false,
        });
        continue;
      }

      const fm = result.frontmatter;
      const skillName = fm.name || path.basename(filePath, ".md");
      const tier = classifyTier(relPath);

      // Dedupe: highest priority wins (curated 80-100 beats learned 20-39)
      if (seen.has(skillName)) {
        const existing = skills.find(s => s.name === skillName);
        const newPriority = (typeof fm.priority === "number" && isFinite(fm.priority))
          ? Math.max(0, Math.min(100, Math.round(fm.priority)))
          : DEFAULT_PRIORITY;
        if (existing && newPriority > existing.priority) {
          debug(`  Replacing skill "${skillName}" (priority ${existing.priority} → ${newPriority})`);
          skills.splice(skills.indexOf(existing), 1);
        } else {
          debug(`  Skipping duplicate skill "${skillName}" from ${relPath} (lower priority)`);
          continue;
        }
      }
      seen.add(skillName);

      skills.push({
        path: relPath,
        name: skillName,
        description: fm.description || "",
        when_to_use: fm.when_to_use || "",
        priority: (typeof fm.priority === "number" && isFinite(fm.priority))
          ? Math.max(0, Math.min(100, Math.round(fm.priority)))
          : DEFAULT_PRIORITY,
        tier,
        source: fm.source || null,
        validated_at: fm.validated_at || null,
        overrides: fm.overrides || [],
        tier_filter: fm.tier_filter || [],
        agent_filter: fm.agent_filter || [],
        tech_filter: fm.tech_filter || [],
        lineCount: result.lineCount,
        errors: result.errors,
        warnings: result.warnings,
        valid: result.errors.length === 0,
      });
    }
  }

  return skills;
}

// ---------- Manifest Hash ----------

/**
 * Compute a deterministic hash of ALL inputs that affect skill selection.
 * Delegates to skill-helpers.js computeManifestHash() — the CANONICAL implementation.
 * Both the registry writer (this file) and the staleness checker (skill-helpers.js)
 * must use the exact same hash function so registries are not falsely marked stale.
 *
 * @param {object} manifest - parsed manifest.yaml
 * @param {object} [config] - parsed config.yaml (optional, improves hash coverage)
 * @param {string} [projectRoot] - project root path (optional, enables skill-file hashing)
 */
function computeManifestHash(manifest, config, projectRoot) {
  const { computeManifestHash: canonicalHash } = require("./lib/skill-helpers");
  return canonicalHash(manifest, config, projectRoot);
}

// ---------- Skill Matching ----------

/**
 * Check if a skill's tech_filter matches the project's tech_stack.
 * Returns true if tech_filter is empty (matches all) or any filter value
 * appears in the tech_stack values.
 */
function matchesTechFilter(skill, manifest) {
  if (!skill.tech_filter || skill.tech_filter.length === 0) return true;

  const techStack = (manifest.project && manifest.project.tech_stack) || {};
  const stackValues = Object.values(techStack)
    .map((v) => String(v).toLowerCase())
    .filter(Boolean);
  // Also include the keys as matchable (e.g., "database", "frontend")
  const stackKeys = Object.keys(techStack).map((k) => k.toLowerCase());
  const allStackTerms = [...stackValues, ...stackKeys];

  return skill.tech_filter.some((filter) =>
    allStackTerms.some((term) => term.includes(String(filter).toLowerCase()))
  );
}

/**
 * Check if a skill's tier_filter matches the project's complexity tier.
 * Returns true if tier_filter is empty (matches all) or contains the current tier.
 */
function matchesTierFilter(skill, manifest) {
  if (!skill.tier_filter || skill.tier_filter.length === 0) return true;
  const tier = (manifest.project && manifest.project.complexity_tier) || "MEDIUM";
  return skill.tier_filter.map((t) => String(t).toUpperCase()).includes(tier.toUpperCase());
}

/**
 * Check if a skill's agent_filter matches the given agent name.
 * Returns true if agent_filter is empty (matches all) or contains the agent.
 */
function matchesAgentFilter(skill, agentName) {
  if (!skill.agent_filter || skill.agent_filter.length === 0) return true;
  return skill.agent_filter.map((a) => String(a).toLowerCase()).includes(agentName.toLowerCase());
}

/**
 * Determine the hint for a skill assignment.
 * "read_now" if tech_filter specifically matches the manifest tech stack.
 * "reference" otherwise (including when tech_filter is empty / matches-all).
 */
function computeHint(skill, manifest) {
  // Skills with a specific tech_filter that matches → read_now
  if (skill.tech_filter && skill.tech_filter.length > 0 && matchesTechFilter(skill, manifest)) {
    return "read_now";
  }
  return "reference";
}

/**
 * Match and rank skills for a specific agent.
 * Filters by agent_filter, tech_filter, tier_filter, config explicit/disabled.
 * Sorts by priority descending, caps at max_active.
 */
function matchSkillsToAgent(agentName, skills, manifest, config) {
  const skillsConfig = (config && config.skills) || {};
  const explicit = (skillsConfig.explicit || []).map((s) => String(s).toLowerCase());
  const disabled = (skillsConfig.disabled || []).map((s) => String(s).toLowerCase());
  const maxActive = typeof skillsConfig.max_active === "number" ? skillsConfig.max_active : DEFAULT_MAX_ACTIVE;

  // Filter valid skills for this agent
  let candidates = skills.filter((skill) => {
    if (!skill.valid) return false;
    if (skill.tier === "draft") return false;

    // Disabled list takes precedence
    if (disabled.includes(skill.name.toLowerCase())) {
      debug(`  ${agentName}: "${skill.name}" disabled by config`);
      return false;
    }

    // Agent filter
    if (!matchesAgentFilter(skill, agentName)) return false;

    // Tech filter
    if (!matchesTechFilter(skill, manifest)) {
      // Exception: explicit list overrides tech filter
      if (!explicit.includes(skill.name.toLowerCase())) return false;
    }

    // Tier filter (project complexity tier, not skill tier)
    if (!matchesTierFilter(skill, manifest)) {
      // Exception: explicit list overrides tier filter
      if (!explicit.includes(skill.name.toLowerCase())) return false;
    }

    return true;
  });

  // Explicit skills always included (if they pass agent filter)
  for (const explicitName of explicit) {
    const already = candidates.find((s) => s.name.toLowerCase() === explicitName);
    if (!already) {
      const found = skills.find(
        (s) => s.name.toLowerCase() === explicitName && s.valid && matchesAgentFilter(s, agentName)
      );
      if (found) candidates.push(found);
    }
  }

  // Apply overrides: collect ALL overriders for each target, apply highest-priority one.
  // A lower-priority overrider encountered first must not shadow a higher-priority one.
  const overrideTargets = new Set();
  for (const c of candidates) {
    if (Array.isArray(c.overrides)) {
      for (const name of c.overrides) overrideTargets.add(name);
    }
  }
  if (overrideTargets.size > 0) {
    candidates = candidates.filter(c => {
      if (overrideTargets.has(c.name)) {
        // Collect ALL candidates that claim to override this skill
        const allOverriders = candidates.filter(
          o => o !== c && Array.isArray(o.overrides) && o.overrides.includes(c.name)
        );
        if (allOverriders.length > 0) {
          // Sort by priority descending; highest-priority overrider wins
          allOverriders.sort((a, b) => b.priority - a.priority);
          const bestOverrider = allOverriders[0];
          if (bestOverrider.priority >= c.priority) {
            debug(`  Skill "${c.name}" overridden by "${bestOverrider.name}" (priority ${bestOverrider.priority}, checked ${allOverriders.length} overrider(s))`);
            return false;
          }
        }
      }
      return true;
    });
  }

  // Sort by priority descending; within same priority, curated > project > learned
  const tierOrder = { curated: 0, project: 1, learned: 2 };
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (tierOrder[a.tier] || 3) - (tierOrder[b.tier] || 3);
  });

  // Cap at max_active
  if (candidates.length > maxActive) {
    debug(`  ${agentName}: capping from ${candidates.length} to ${maxActive} skills`);
    candidates = candidates.slice(0, maxActive);
  }

  // Build assignment entries with hints and selector metadata.
  // Always write filter/override arrays (empty [] not undefined) so YAML serialization
  // preserves them — consumers like build.md read tech_filter for per-node refinement
  // and will silently skip refinement if the field is missing from the registry entry.
  return candidates.map((skill) => ({
    path: skill.path,
    name: skill.name,
    description: skill.description,
    priority: skill.priority,
    tier: skill.tier,
    hint: computeHint(skill, manifest),
    tech_filter: Array.isArray(skill.tech_filter) ? skill.tech_filter : [],
    tier_filter: Array.isArray(skill.tier_filter) ? skill.tier_filter : [],
    agent_filter: Array.isArray(skill.agent_filter) ? skill.agent_filter : [],
    overrides: Array.isArray(skill.overrides) ? skill.overrides : [],
  }));
}

// ---------- Registry Generation ----------

/**
 * Generate the full skills registry and write to .forgeplan/skills-registry.yaml.
 */
function generateRegistry(manifest, config, projectRoot) {
  const skills = scanSkillSources(config, projectRoot);
  const validSkills = skills.filter((s) => s.valid);
  const invalidSkills = skills.filter((s) => !s.valid);

  log(`Skill registry: scanned ${skills.length} skills, ${validSkills.length} valid, ${invalidSkills.length} invalid`);

  if (invalidSkills.length > 0) {
    for (const s of invalidSkills) {
      log(`  SKIP: ${s.path} — ${s.errors.join("; ")}`);
    }
  }

  // Build assignments per agent
  const assignments = {};
  for (const agent of REGISTRY_AGENTS) {
    const matched = matchSkillsToAgent(agent, validSkills, manifest, config);
    if (matched.length > 0) {
      assignments[agent] = matched;
    }
    debug(`  ${agent}: ${matched.length} skills assigned`);
  }

  // Collect quality warnings
  const qualityWarnings = [];
  for (const skill of validSkills) {
    for (const w of skill.warnings) {
      qualityWarnings.push({ skill: skill.name, path: skill.path, warning: w });
    }
  }

  // Build tech_stack_snapshot
  const techStack = (manifest.project && manifest.project.tech_stack) || {};

  // Build registry object
  const registry = {
    generated_at: new Date().toISOString(),
    manifest_hash: computeManifestHash(manifest, config, projectRoot),
    tech_stack_snapshot: techStack,
    assignments,
    quality_warnings: qualityWarnings,
  };

  // Write to .forgeplan/skills-registry.yaml
  const forgePlanDir = path.join(projectRoot, ".forgeplan");
  if (!fs.existsSync(forgePlanDir)) {
    log("Warning: .forgeplan/ directory does not exist. Creating it.");
    fs.mkdirSync(forgePlanDir, { recursive: true });
  }

  const registryPath = path.join(forgePlanDir, "skills-registry.yaml");
  const header =
    "# .forgeplan/skills-registry.yaml — auto-generated, do not edit manually\n" +
    "# Regenerated by: /forgeplan:discover, /forgeplan:research, /forgeplan:skill refresh\n" +
    "# Re-run: node scripts/skill-registry.js generate\n";
  const yamlContent = header + yaml.dump(registry, { lineWidth: 120, noRefs: true, sortKeys: false });

  // Atomic write with lock: write .tmp → rename old to .bak → rename .tmp to target → delete .bak
  // Lock mechanism: exclusive file creation (wx flag) prevents concurrent refreshes
  const lockPath = registryPath + ".lock";
  const tmpPath = registryPath + ".tmp";
  const bakPath = registryPath + ".bak";

  // Acquire lock via exclusive creation — wx flag atomically creates and fails if file exists
  const MAX_LOCK_RETRIES = 3;
  const LOCK_WAIT_MS = 100;
  let lockAcquired = false;
  for (let attempt = 0; attempt < MAX_LOCK_RETRIES; attempt++) {
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
      lockAcquired = true;
      break;
    } catch (lockErr) {
      if (lockErr.code === "EEXIST") {
        // Another process holds the lock — check for stale lock on last attempt
        if (attempt === MAX_LOCK_RETRIES - 1) {
          try {
            const lockStat = fs.statSync(lockPath);
            if (Date.now() - lockStat.mtimeMs > 30000) {
              log("Warning: Stale registry lock detected (>30s), removing and proceeding.");
              try { fs.unlinkSync(lockPath); } catch (_) {}
              try { fs.unlinkSync(tmpPath); } catch (_) {}
              // Try one more exclusive create after clearing stale lock
              try {
                fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
                lockAcquired = true;
              } catch (_) {
                log("Warning: Registry write lock held by another process. Using existing registry.");
                return registry;
              }
            } else {
              log("Warning: Registry write lock held by another process. Using existing registry.");
              return registry;
            }
          } catch (_) {
            log("Warning: Could not check lock state. Using existing registry.");
            return registry;
          }
        } else {
          debug(`Registry write lock detected (attempt ${attempt + 1}/${MAX_LOCK_RETRIES}), waiting ${LOCK_WAIT_MS}ms...`);
          const waitUntil = Date.now() + LOCK_WAIT_MS;
          while (Date.now() < waitUntil) { /* spin wait */ }
        }
      } else {
        // Non-EEXIST error (permission, disk full, etc.) — bail out of write path entirely
        log(`Warning: Lock acquisition failed (${lockErr.message}). Using in-memory registry.`);
        return registry;
      }
    }
  }

  if (!lockAcquired) {
    log("Warning: Could not acquire registry lock. Using existing registry.");
    return registry;
  }

  try {
    fs.writeFileSync(tmpPath, yamlContent, "utf-8");
    // Move existing registry to .bak (if it exists)
    if (fs.existsSync(registryPath)) {
      try { fs.unlinkSync(bakPath); } catch (_) {} // clean stale .bak
      fs.renameSync(registryPath, bakPath);
    }
    // Move .tmp to target — target doesn't exist now so rename is safe on Windows
    fs.renameSync(tmpPath, registryPath);
    // Clean up .bak and lock
    try { fs.unlinkSync(bakPath); } catch (_) {}
    try { fs.unlinkSync(lockPath); } catch (_) {}
  } catch (err) {
    // Recovery: if target is gone but .bak exists, restore it
    if (!fs.existsSync(registryPath) && fs.existsSync(bakPath)) {
      try { fs.renameSync(bakPath, registryPath); } catch (_) {}
    }
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    try { fs.unlinkSync(lockPath); } catch (_) {}
    throw err;
  }

  log(`Registry written: ${registryPath}`);
  log(`  ${Object.keys(assignments).length} agents, ${Object.values(assignments).reduce((s, a) => s + a.length, 0)} total assignments`);
  if (qualityWarnings.length > 0) {
    log(`  ${qualityWarnings.length} quality warning(s)`);
  }

  return registry;
}

// ---------- Validate Subcommand ----------

/**
 * Validate all skills across all sources. Output JSON report to stdout.
 * Returns { passed, failed, warnings } counts.
 */
function validateSkills(config, projectRoot) {
  const skills = scanSkillSources(config, projectRoot);

  const results = {
    total: skills.length,
    passed: 0,
    failed: 0,
    warning_count: 0,
    skills: [],
  };

  for (const skill of skills) {
    const entry = {
      path: skill.path,
      name: skill.name || path.basename(skill.path, ".md"),
      valid: skill.valid,
      errors: skill.errors || [],
      warnings: skill.warnings || [],
    };

    if (skill.valid) {
      results.passed++;
    } else {
      results.failed++;
    }
    results.warning_count += entry.warnings.length;
    results.skills.push(entry);
  }

  return results;
}

// ---------- Compile Architect Subcommand ----------

/**
 * Read architect skills from skills/core/, extract full content,
 * compile into a single tier-aware markdown block.
 * Outputs to stdout for embedding or piping.
 */
function compileArchitect(config, projectRoot, manifest) {
  const skills = scanSkillSources(config, projectRoot);

  // Filter to architect-relevant skills — core-only (skills/core/ and skills/conditional/).
  // Non-core skills (project-local .forgeplan/skills/, user-installed) are excluded from
  // architect compilation to prevent untrusted content from influencing architecture decisions.
  const architectSkills = skills.filter((s) => {
    if (!s.valid) return false;
    if (s.tier !== "curated") return false; // core-only: curated = skills/core/ or skills/conditional/
    if (s.agent_filter && s.agent_filter.length > 0) {
      return s.agent_filter.map((a) => a.toLowerCase()).includes("architect");
    }
    // Skills with no agent_filter are available to all agents, but for architect compile
    // we only include skills from skills/core/ that are explicitly architect-targeted
    // to prevent bloat. Return false for non-filtered skills.
    return false;
  });

  if (architectSkills.length === 0) {
    return {
      compiled: "<!-- No architect skills found. Run /forgeplan:skill refresh after adding skills with agent_filter: [architect] -->",
      hash: "none",
      skills: [],
    };
  }

  // Sort by priority descending
  architectSkills.sort((a, b) => b.priority - a.priority);

  // Determine project tier for tier-aware sections
  const tier = (manifest && manifest.project && manifest.project.complexity_tier) || "MEDIUM";

  // Read full content of each skill and compile
  const sections = [];
  const skillNames = [];

  for (const skill of architectSkills) {
    const absPath = path.isAbsolute(skill.path)
      ? skill.path
      : path.join(projectRoot, skill.path);

    let content;
    try {
      content = fs.readFileSync(absPath, "utf-8");
    } catch (err) {
      debug(`Cannot read architect skill: ${skill.path} — ${err.message}`);
      continue;
    }

    // Check tier_filter — skip skills not for the current tier
    if (skill.tier_filter && skill.tier_filter.length > 0) {
      const matches = skill.tier_filter
        .map((t) => String(t).toUpperCase())
        .includes(tier.toUpperCase());
      if (!matches) {
        debug(`Skipping "${skill.name}" — tier_filter ${skill.tier_filter.join(",")} does not match ${tier}`);
        continue;
      }
    }

    // Strip frontmatter from content (everything between first --- and second ---)
    const lines = content.split(/\r?\n/);
    let fmEnd = -1;
    let fmCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        fmCount++;
        if (fmCount === 2) {
          fmEnd = i;
          break;
        }
      }
    }
    const body = fmEnd >= 0 ? lines.slice(fmEnd + 1).join("\n").trim() : content.trim();

    if (body) {
      sections.push(`### ${skill.name}\n<!-- priority: ${skill.priority}, tier: ${skill.tier} -->\n\n${body}`);
      skillNames.push(skill.name);
    }
  }

  // Compute hash from skill content (before adding hash to output — hash is of the skills, not of itself)
  const contentForHash = sections.join("\n\n---\n\n");
  const hash = crypto.createHash("sha256").update(contentForHash).digest("hex").slice(0, 12);

  const compiled =
    `<!-- compiled-architect-skills: ${skillNames.join(", ")} -->\n` +
    `<!-- compiled_from_hash: ${hash} -->\n` +
    `<!-- compiled-at: ${new Date().toISOString()} -->\n` +
    `<!-- project-tier: ${tier} -->\n\n` +
    `## Architect Skills (Tier: ${tier})\n\n` +
    contentForHash;

  return {
    compiled,
    hash,
    skills: skillNames,
  };
}

// ---------- Config + Manifest Loading ----------

/**
 * Load .forgeplan/config.yaml if it exists.
 */
function loadConfig(projectRoot) {
  const configPath = path.join(projectRoot, ".forgeplan", "config.yaml");
  if (!fs.existsSync(configPath)) {
    debug("No config.yaml found, using defaults");
    return {};
  }
  try {
    return yaml.load(fs.readFileSync(configPath, "utf-8")) || {};
  } catch (err) {
    log(`Warning: could not parse config.yaml: ${err.message}`);
    return {};
  }
}

/**
 * Load .forgeplan/manifest.yaml. Returns null if not found.
 */
function loadManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, ".forgeplan", "manifest.yaml");
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    log(`Error: could not parse manifest.yaml: ${err.message}`);
    return null;
  }
}

// ---------- CLI ----------

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const subcommand = args[0];

  if (!subcommand || !["generate", "refresh", "validate", "compile-architect"].includes(subcommand)) {
    log("Usage: node skill-registry.js <generate|refresh|validate|compile-architect> [--verbose]");
    log("");
    log("Subcommands:");
    log("  generate          Scan skills, match to agents, write .forgeplan/skills-registry.yaml");
    log("  refresh           Same as generate (re-evaluates against current manifest)");
    log("  validate          Check all skills pass quality gate, output JSON report");
    log("  compile-architect Compile architect skills into a single tier-aware block");
    process.exit(2);
  }

  const projectRoot = process.cwd();
  const config = loadConfig(projectRoot);

  // Check if skills are enabled (default true for MEDIUM/LARGE)
  const skillsEnabled = config.skills && config.skills.enabled !== undefined
    ? config.skills.enabled
    : true; // default enabled

  if (subcommand === "validate") {
    // Validate runs regardless of enabled flag
    const report = validateSkills(config, projectRoot);
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");

    if (report.failed > 0) {
      log(`Validation: ${report.failed} skill(s) FAILED, ${report.passed} passed, ${report.warning_count} warnings`);
      process.exit(1);
    }
    log(`Validation: all ${report.passed} skill(s) passed (${report.warning_count} warnings)`);
    process.exit(0);
  }

  if (subcommand === "compile-architect") {
    const manifest = loadManifest(projectRoot);
    // compile-architect works even without a manifest (uses defaults)
    const result = compileArchitect(config, projectRoot, manifest);
    process.stdout.write(result.compiled + "\n");
    log(`Compiled ${result.skills.length} architect skill(s), hash: ${result.hash}`);
    process.exit(0);
  }

  // generate / refresh
  if (subcommand === "generate" || subcommand === "refresh") {
    if (!skillsEnabled) {
      log("Skills are disabled in config.yaml (skills.enabled: false). Skipping registry generation.");
      log("Set skills.enabled: true or remove the setting to enable.");
      process.exit(0);
    }

    const manifest = loadManifest(projectRoot);
    if (!manifest) {
      log("Error: no .forgeplan/manifest.yaml found. Run /forgeplan:discover first.");
      process.exit(2);
    }

    try {
      generateRegistry(manifest, config, projectRoot);
      process.exit(0);
    } catch (err) {
      log(`Error generating registry: ${err.message}`);
      if (VERBOSE) log(err.stack);
      process.exit(2);
    }
  }
}

// ---------- Exports (for use by other scripts) ----------

module.exports = {
  loadSkillFrontmatter,
  scanSkillSources,
  computeManifestHash,
  matchSkillsToAgent,
  generateRegistry,
  compileArchitect,
  REGISTRY_AGENTS,
};

// Run if invoked directly
if (require.main === module) {
  main();
}
