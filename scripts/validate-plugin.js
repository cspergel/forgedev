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

const inlineOrchestrationPaths = [
  path.join(skillsRoot, "greenfield", "SKILL.md"),
  path.join(skillsRoot, "deep-build", "SKILL.md"),
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

function assertDiscoverCompletion(errors) {
  const discoverPath = path.join(skillsRoot, "discover", "SKILL.md");
  if (!fs.existsSync(discoverPath)) {
    pushError(errors, "skills/discover/SKILL.md: missing");
    return;
  }

  const content = fs.readFileSync(discoverPath, "utf8");
  const completionIndex = content.indexOf("Next steps");
  if (completionIndex === -1) {
    pushError(errors, "skills/discover/SKILL.md: missing completion next-steps block");
    return;
  }

  const completionBlock = content.slice(completionIndex, Math.min(content.length, completionIndex + 1200));
  const greenfieldIndex = completionBlock.indexOf("/forgeplan:greenfield");
  const specIndex = completionBlock.indexOf("/forgeplan:spec --all");
  const deepBuildIndex = completionBlock.indexOf("/forgeplan:deep-build");

  if (greenfieldIndex === -1) {
    pushError(errors, "skills/discover/SKILL.md: completion block must recommend /forgeplan:greenfield");
  }
  if (specIndex !== -1 && greenfieldIndex !== -1 && greenfieldIndex > specIndex) {
    pushError(errors, "skills/discover/SKILL.md: /forgeplan:greenfield must appear before /forgeplan:spec --all in completion guidance");
  }
  if (deepBuildIndex !== -1 && greenfieldIndex !== -1 && greenfieldIndex > deepBuildIndex) {
    pushError(errors, "skills/discover/SKILL.md: /forgeplan:greenfield must appear before /forgeplan:deep-build in completion guidance");
  }
}

function assertNoNestedSpecSkill(errors) {
  for (const filePath of inlineOrchestrationPaths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const rel = path.relative(repoRoot, filePath);
    const content = fs.readFileSync(filePath, "utf8");
    if (!content.includes("Skill(forgeplan:spec)")) {
      pushError(errors, `${rel}: must explicitly forbid nested Skill(forgeplan:spec) invocation`);
    }
    if (!content.includes("skills/spec/SKILL.md")) {
      pushError(errors, `${rel}: must direct the orchestrator to inline the spec workflow from skills/spec/SKILL.md`);
    }
  }
}

function assertNoNestedDeepBuildSkill(errors) {
  const greenfieldPath = path.join(skillsRoot, "greenfield", "SKILL.md");
  if (!fs.existsSync(greenfieldPath)) {
    return;
  }
  const content = fs.readFileSync(greenfieldPath, "utf8");
  if (!content.includes("Skill(forgeplan:deep-build)")) {
    pushError(errors, "skills/greenfield/SKILL.md: must explicitly forbid nested Skill(forgeplan:deep-build) invocation");
  }
  if (!content.includes("skills/deep-build/SKILL.md")) {
    pushError(errors, "skills/greenfield/SKILL.md: must direct the orchestrator to inline the deep-build workflow from skills/deep-build/SKILL.md");
  }
}

function assertNoNestedBuilderSkill(errors) {
  const deepBuildPath = path.join(skillsRoot, "deep-build", "SKILL.md");
  if (!fs.existsSync(deepBuildPath)) {
    return;
  }
  const content = fs.readFileSync(deepBuildPath, "utf8");
  if (!content.includes("Skill(forgeplan:builder)")) {
    pushError(errors, "skills/deep-build/SKILL.md: must explicitly forbid nested Skill(forgeplan:builder) invocation");
  }
  if (!content.includes("/forgeplan:build [node-id]")) {
    pushError(errors, "skills/deep-build/SKILL.md: must direct orchestration to the public /forgeplan:build [node-id] entry point");
  }
}

function assertDeepBuildSnapshotContract(errors) {
  const deepBuildPath = path.join(skillsRoot, "deep-build", "SKILL.md");
  if (!fs.existsSync(deepBuildPath)) {
    return;
  }
  const content = fs.readFileSync(deepBuildPath, "utf8");
  if (!content.includes("Glob tool")) {
    pushError(errors, "skills/deep-build/SKILL.md: build-all loop must require Glob tool snapshots");
  }
  if (!content.includes("Do **not** use Bash/Node ad hoc file enumeration")) {
    pushError(errors, "skills/deep-build/SKILL.md: build-all loop must forbid Bash/Node ad hoc snapshot enumeration");
  }
}

function assertPlannerArtifactContract(errors) {
  const architectPath = path.join(repoRoot, "agents", "architect.md");
  const greenfieldPath = path.join(skillsRoot, "greenfield", "SKILL.md");

  if (fs.existsSync(architectPath)) {
    const content = fs.readFileSync(architectPath, "utf8");
    if (!content.includes("PLAN_STATUS: WRITTEN")) {
      pushError(errors, "agents/architect.md: Planner Mode must define a compact PLAN_STATUS receipt");
    }
    if (!content.includes("Do not inline the full plan content")) {
      pushError(errors, "agents/architect.md: Planner Mode must forbid returning the full plan body in the agent response");
    }
  }

  if (fs.existsSync(greenfieldPath)) {
    const content = fs.readFileSync(greenfieldPath, "utf8");
    if (!content.includes("Do not try to reconstruct the plan from session context")) {
      pushError(errors, "skills/greenfield/SKILL.md: plan generation must forbid reconstructing the plan from session context");
    }
    if (!content.includes("PLAN_STATUS: WRITTEN")) {
      pushError(errors, "skills/greenfield/SKILL.md: plan generation must require a compact planner receipt");
    }
  }
}

function assertStateTransitionUsage(errors) {
  const stateTransitionPath = path.join(repoRoot, "scripts", "state-transition.js");
  if (!fs.existsSync(stateTransitionPath)) {
    pushError(errors, "scripts/state-transition.js: missing deterministic state transition helper");
    return;
  }

  const checks = [
    {
      file: path.join(skillsRoot, "build", "SKILL.md"),
      marker: "state-transition.js\" start-build",
      message: "skills/build/SKILL.md: build setup must use state-transition.js start-build",
    },
    {
      file: path.join(skillsRoot, "build", "SKILL.md"),
      marker: "state-transition.js\" complete-build",
      message: "skills/build/SKILL.md: build completion must use state-transition.js complete-build",
    },
    {
      file: path.join(skillsRoot, "review", "SKILL.md"),
      marker: "state-transition.js\" start-review",
      message: "skills/review/SKILL.md: review setup must use state-transition.js start-review",
    },
    {
      file: path.join(skillsRoot, "review", "SKILL.md"),
      marker: "state-transition.js\" start-review-fixing",
      message: "skills/review/SKILL.md: multi-agent review fixes must use state-transition.js start-review-fixing",
    },
    {
      file: path.join(skillsRoot, "review", "SKILL.md"),
      marker: "state-transition.js\" complete-review",
      message: "skills/review/SKILL.md: review completion must use state-transition.js complete-review",
    },
    {
      file: path.join(skillsRoot, "review", "SKILL.md"),
      marker: "state-transition.js\" restore-previous-status",
      message: "skills/review/SKILL.md: strict review recovery must use state-transition.js restore-previous-status",
    },
    {
      file: path.join(skillsRoot, "spec", "SKILL.md"),
      marker: "state-transition.js\" set-spec-status",
      message: "skills/spec/SKILL.md: spec completion must use state-transition.js set-spec-status",
    },
  ];

  for (const check of checks) {
    if (!fs.existsSync(check.file)) {
      continue;
    }
    const content = fs.readFileSync(check.file, "utf8");
    if (!content.includes(check.marker)) {
      pushError(errors, check.message);
    }
  }

  const stopHookPath = path.join(repoRoot, "scripts", "stop-hook.js");
  if (fs.existsSync(stopHookPath)) {
    const stopHookContent = fs.readFileSync(stopHookPath, "utf8");
    if (!stopHookContent.includes("state-transition.js\" complete-build")) {
      pushError(errors, "scripts/stop-hook.js: successful build verification must instruct use of state-transition.js complete-build");
    }
    if (stopHookContent.includes("Update .forgeplan/state.json: set nodes.")) {
      pushError(errors, "scripts/stop-hook.js: must not instruct manual state.json editing on build completion");
    }
  }
}

function assertStateTransitionBashAllowlist(errors) {
  const preToolUsePath = path.join(repoRoot, "scripts", "pre-tool-use.js");
  if (!fs.existsSync(preToolUsePath)) {
    return;
  }
  const content = fs.readFileSync(preToolUsePath, "utf8");
  if (!content.includes("state-transition\\.js")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include state-transition.js helper commands");
  }
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

assertDiscoverCompletion(errors);
assertNoNestedSpecSkill(errors);
assertNoNestedDeepBuildSkill(errors);
assertNoNestedBuilderSkill(errors);
assertDeepBuildSnapshotContract(errors);
assertPlannerArtifactContract(errors);
assertStateTransitionUsage(errors);
assertStateTransitionBashAllowlist(errors);

if (errors.length > 0) {
  console.error("Plugin validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Plugin validation passed.");
