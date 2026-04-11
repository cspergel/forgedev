#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));

const repoRoot = path.join(__dirname, "..");
const pluginManifestPath = path.join(repoRoot, ".claude-plugin", "plugin.json");
const skillsRoot = path.join(repoRoot, "skills");
const hooksPath = path.join(repoRoot, "hooks", "hooks.json");

const commandSkillRules = {
  affected: { argumentHint: "[model-name]" },
  build: { argumentHint: "[node-id|--all]" },
  configure: {},
  "deep-build": {},
  discover: { argumentHint: "[description|template:name|--from <file>]" },
  greenfield: { argumentHint: "[description|--from <file>]" },
  guide: {},
  help: {},
  ingest: { argumentHint: "[--force] [--confirm-auto]" },
  integrate: {},
  measure: {},
  next: {},
  recover: {},
  "regen-types": {},
  research: { argumentHint: "[topic]" },
  review: { argumentHint: "[node-id|--all]" },
  revise: { argumentHint: "[node-id|--model <name>]" },
  skill: { argumentHint: "[list|refresh|install|validate|review|approve|promote]" },
  spec: { argumentHint: "[node-id|--all]" },
  split: { argumentHint: "[node-id]" },
  status: {},
  sweep: { argumentHint: "[--cross-check|--baseline]" },
  validate: { argumentHint: "[manifest|spec <node-id>|all]" },
};

const publicCommandSurfacePaths = [
  path.join(skillsRoot, "guide", "SKILL.md"),
  path.join(skillsRoot, "help", "SKILL.md"),
  path.join(skillsRoot, "discover", "SKILL.md"),
  path.join(repoRoot, "README.md"),
  path.join(repoRoot, "templates", "forgeplan-claude.md"),
];

function parseFrontmatter(skillPath) {
  const content = fs.readFileSync(skillPath, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("missing YAML frontmatter");
  }
  return yaml.load(match[1]);
}

function pushError(errors, message) {
  errors.push(message);
}

function findForgePlanCommands(content) {
  const matches = [];
  const regex = /\/forgeplan:([a-z0-9-]+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

const errors = [];

let pluginManifest;
try {
  pluginManifest = JSON.parse(fs.readFileSync(pluginManifestPath, "utf8"));
} catch (err) {
  console.error(`Failed to read ${pluginManifestPath}: ${err.message}`);
  process.exit(1);
}

if (pluginManifest.skills !== "./skills") {
  pushError(errors, `.claude-plugin/plugin.json: expected "skills" to be "./skills", got ${JSON.stringify(pluginManifest.skills)}`);
}

let hooksConfig;
try {
  hooksConfig = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
} catch (err) {
  pushError(errors, `hooks/hooks.json: failed to parse JSON (${err.message})`);
}

if (hooksConfig && typeof hooksConfig === "object") {
  const preToolUseHooks = Array.isArray(hooksConfig.hooks && hooksConfig.hooks.PreToolUse)
    ? hooksConfig.hooks.PreToolUse
    : [];
  const writeEditEntry = preToolUseHooks.find((entry) => entry && entry.matcher === "Write|Edit");

  if (!writeEditEntry) {
    pushError(errors, `hooks/hooks.json: missing PreToolUse matcher for "Write|Edit"`);
  } else {
    const writeHooks = Array.isArray(writeEditEntry.hooks) ? writeEditEntry.hooks : [];
    const commandHook = writeHooks.find(
      (hook) => hook && hook.type === "command" && hook.command === "node \"${CLAUDE_PLUGIN_ROOT}/scripts/pre-tool-use.js\""
    );
    const agentHook = writeHooks.find((hook) => hook && hook.type === "agent");

    if (!commandHook) {
      pushError(errors, `hooks/hooks.json: Write|Edit PreToolUse is missing the deterministic command hook`);
    }

    if (!agentHook) {
      pushError(errors, `hooks/hooks.json: Write|Edit PreToolUse must use an agent hook for Layer 2 verification`);
    } else {
      if (typeof agentHook.prompt !== "string" || !agentHook.prompt.includes("$ARGUMENTS")) {
        pushError(errors, `hooks/hooks.json: Write|Edit agent hook must include a prompt with $ARGUMENTS`);
      }
      if (agentHook.timeout !== 60) {
        pushError(errors, `hooks/hooks.json: Write|Edit agent hook timeout must be 60 seconds`);
      }
    }

    const promptHook = writeHooks.find((hook) => hook && hook.type === "prompt");
    if (promptHook) {
      pushError(errors, `hooks/hooks.json: Write|Edit PreToolUse must not use a prompt hook`);
    }
  }
}

for (const [skillName, rule] of Object.entries(commandSkillRules)) {
  const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    pushError(errors, `Missing skill file: skills/${skillName}/SKILL.md`);
    continue;
  }

  let frontmatter;
  try {
    frontmatter = parseFrontmatter(skillPath);
  } catch (err) {
    pushError(errors, `skills/${skillName}/SKILL.md: ${err.message}`);
    continue;
  }

  if (!frontmatter || typeof frontmatter !== "object") {
    pushError(errors, `skills/${skillName}/SKILL.md: frontmatter did not parse into an object`);
    continue;
  }

  if (frontmatter.name !== undefined) {
    pushError(
      errors,
      `skills/${skillName}/SKILL.md: command skills must not set frontmatter.name; that strips the forgeplan: namespace`
    );
  }

  if (typeof frontmatter.description !== "string" || frontmatter.description.trim().length === 0) {
    pushError(errors, `skills/${skillName}/SKILL.md: missing description`);
  } else if (frontmatter.description.length > 250) {
    pushError(errors, `skills/${skillName}/SKILL.md: description exceeds 250 chars (${frontmatter.description.length})`);
  }

  if (frontmatter["disable-model-invocation"] !== true) {
    pushError(errors, `skills/${skillName}/SKILL.md: disable-model-invocation must be true`);
  }

  if (frontmatter["user-invocable"] === false) {
    pushError(errors, `skills/${skillName}/SKILL.md: user-invocable must not be false for command skills`);
  }

  if (rule.argumentHint && frontmatter["argument-hint"] !== rule.argumentHint) {
    pushError(
      errors,
      `skills/${skillName}/SKILL.md: expected argument-hint ${JSON.stringify(rule.argumentHint)}, got ${JSON.stringify(
        frontmatter["argument-hint"]
      )}`
    );
  }
}

const validCommandNames = new Set(Object.keys(commandSkillRules));

for (const surfacePath of publicCommandSurfacePaths) {
  if (!fs.existsSync(surfacePath)) {
    pushError(errors, `${path.relative(repoRoot, surfacePath)}: missing public command surface file`);
    continue;
  }

  const content = fs.readFileSync(surfacePath, "utf8");
  for (const commandName of findForgePlanCommands(content)) {
    if (!validCommandNames.has(commandName)) {
      pushError(
        errors,
        `${path.relative(repoRoot, surfacePath)}: references unknown public command /forgeplan:${commandName}`
      );
    }
  }
}

if (errors.length > 0) {
  console.error("Plugin validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Plugin validation passed.");
