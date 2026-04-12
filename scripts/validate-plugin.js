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
  if (!content.includes("skills/build/SKILL.md")) {
    pushError(errors, "skills/deep-build/SKILL.md: must direct orchestration to inline the build workflow from skills/build/SKILL.md");
  }
}

function assertNoNestedReviewerSkill(errors) {
  const deepBuildPath = path.join(skillsRoot, "deep-build", "SKILL.md");
  if (!fs.existsSync(deepBuildPath)) {
    return;
  }
  const content = fs.readFileSync(deepBuildPath, "utf8");
  if (!content.includes("forgeplan:reviewer")) {
    pushError(errors, "skills/deep-build/SKILL.md: must explicitly forbid internal forgeplan:reviewer dispatch");
  }
  if (!content.includes("skills/review/SKILL.md")) {
    pushError(errors, "skills/deep-build/SKILL.md: must direct orchestration to inline the review workflow from skills/review/SKILL.md");
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
      marker: "state-transition.js\" increment-bounce",
      message: "skills/build/SKILL.md: failed AC evaluation must use state-transition.js increment-bounce",
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
      marker: "reviewed-with-findings",
      message: "skills/review/SKILL.md: advisory review flow must document reviewed-with-findings for deferred findings",
    },
    {
      file: path.join(skillsRoot, "review", "SKILL.md"),
      marker: "state-transition.js\" restore-previous-status",
      message: "skills/review/SKILL.md: strict review recovery must use state-transition.js restore-previous-status",
    },
    {
      file: path.join(skillsRoot, "deep-build", "SKILL.md"),
      marker: "state-transition.js\" start-sweep-fix",
      message: "skills/deep-build/SKILL.md: verify-runnable remediation must use state-transition.js start-sweep-fix for node-scoped fixes",
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
    if (!stopHookContent.includes("files_created") || !stopHookContent.includes("files_modified")) {
      pushError(errors, "scripts/stop-hook.js: must skip AC enforcement for untouched interrupted builds by checking files_created/files_modified");
    }
  }
}

function assertStateTransitionBashAllowlist(errors) {
  const preToolUsePath = path.join(repoRoot, "scripts", "pre-tool-use.js");
  if (!fs.existsSync(preToolUsePath)) {
    return;
  }
  const content = fs.readFileSync(preToolUsePath, "utf8");
  if (!content.includes("state-transition.js")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include state-transition.js helper commands");
  }
  if (!content.includes("summarize-verify-runnable.js")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include summarize-verify-runnable.js");
  }
  if (!content.includes("summarize-integrate-check.js")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include summarize-integrate-check.js");
  }
  if (!content.includes("prepare-sweep-context.js")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include prepare-sweep-context.js");
  }
  if (!content.includes("start-sweep-fix")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include state-transition.js start-sweep-fix");
  }
  if (!content.includes("nodeScriptPattern(")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must support quoted node script paths via nodeScriptPattern()");
  }
  if (!content.includes("/^\\s*cd\\s+/")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must allow cd wrappers around otherwise safe commands");
  }
  if (!content.includes("splitReadOnlyShellSegments")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash guard must support splitting safe read-only shell wrappers");
  }
  if (!content.includes("splitShellLikeSegments")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash guard must use a quote-aware shell segment splitter for read-only pipelines");
  }
  if (!content.includes("normalizeReadOnlySegment")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash guard must normalize benign shell redirections before safe-command matching");
  }
  if (!content.includes("python(?:3)?\\s+-m\\s+pytest") || !content.includes("^\\s*pytest\\b")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must permit targeted pytest verification during active remediation");
  }
  if (!content.includes("relPath.startsWith(\".forgeplan/reviews/\")")) {
    pushError(errors, "scripts/pre-tool-use.js: sweep/deep-build analysis mode must allow .forgeplan/reviews/ writes for parallel review batches");
  }
}

function assertTopLevelOrchestrationStateRules(errors) {
  const deepBuildPath = path.join(skillsRoot, "deep-build", "SKILL.md");
  const recoverPath = path.join(skillsRoot, "recover", "SKILL.md");
  const buildPath = path.join(skillsRoot, "build", "SKILL.md");
  const reviewPath = path.join(skillsRoot, "review", "SKILL.md");
  const builderAgentPath = path.join(repoRoot, "agents", "builder.md");

  if (fs.existsSync(buildPath)) {
    const content = fs.readFileSync(buildPath, "utf8");
    if (!content.includes('Do **not** run additional `set-node-status ... "built"` transitions')) {
      pushError(errors, "skills/build/SKILL.md: completion flow must forbid redundant set-node-status built transitions after complete-build");
    }
  }

  if (fs.existsSync(builderAgentPath)) {
    const content = fs.readFileSync(builderAgentPath, "utf8");
    if (!content.includes("Do not edit project-root aggregators or bootstrap files")) {
      pushError(errors, "agents/builder.md: builder must explicitly forbid root aggregator edits such as main.py during node builds");
    }
  }

  if (fs.existsSync(deepBuildPath)) {
    const content = fs.readFileSync(deepBuildPath, "utf8");
    if (!content.includes("Do **not** hand-edit `.forgeplan/state.json`")) {
      pushError(errors, "skills/deep-build/SKILL.md: must explicitly forbid manual state.json editing");
    }
    if (!content.includes("state-transition.js\" set-sweep-state")) {
      pushError(errors, "skills/deep-build/SKILL.md: deep-build initialization must use state-transition.js set-sweep-state");
    }
    if (!content.includes("state-transition.js\" set-sweep-phase")) {
      pushError(errors, "skills/deep-build/SKILL.md: sweep/deep-build phase changes must use state-transition.js set-sweep-phase");
    }
    if (!content.includes("Do **not** pre-mutate `active_node` or node `status`")) {
      pushError(errors, "skills/deep-build/SKILL.md: build-all loop must forbid pre-mutating node state before /forgeplan:build or /forgeplan:review");
    }
    if (!content.includes('Do **not** add a follow-up `set-node-status "[node-id]" "built"` after it succeeds')) {
      pushError(errors, "skills/deep-build/SKILL.md: build-all loop must forbid redundant set-node-status built transitions after complete-build");
    }
    if (!content.includes("Do **not** attempt root-scope integration edits during the node build loop")) {
      pushError(errors, "skills/deep-build/SKILL.md: build-all loop must forbid root-scope integration edits such as main.py during node builds");
    }
    if (!content.includes("Parallel review optimization")) {
      pushError(errors, "skills/deep-build/SKILL.md: build-all loop must document the parallel review optimization for built-node batches");
    }
    if (!content.includes("do **not** try to edit files directly from sweep-analysis mode")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 3 remediation must forbid direct edits from sweep-analysis mode");
    }
    if (!content.includes("Map each failure to an owning node")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 3 remediation must route verify-runnable failures to owning nodes");
    }
    if (!content.includes("ForgePlan only supports one `active_node` at a time during remediation")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 3 remediation must document the single-active-node constraint");
    }
    if (!content.includes("Do **not** apply fixes for multiple node groups in parallel")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 3 remediation must forbid parallel cross-node write execution");
    }
    if (!content.includes("The step field is `name`, not `step`")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 3 remediation must document the verify-runnable step field name");
    }
    if (!content.includes("Do **not** reinitialize or recreate `sweep_state` here")) {
      pushError(errors, "skills/deep-build/SKILL.md: verify-runnable pass handling must forbid reinitializing sweep_state before integrate");
    }
    if (!content.includes("summarize-verify-runnable.js")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 3 remediation must use summarize-verify-runnable.js for truncated verify-runnable output");
    }
    if (!content.includes("deterministic/runtime truth > explicit spec/contract truth > review/certifier findings > advisory refactor suggestions")) {
      pushError(errors, "skills/deep-build/SKILL.md: cross-model phase must document the finding precedence ladder");
    }
    if (!content.includes("Do **not** create ad hoc helper scripts just to rename, move, or delete source files during remediation")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 3 remediation must forbid ad hoc helper-script file renames/deletes");
    }
    if (!content.includes('Do **not** call `set-sweep-phase "verify-runnable"` between node-scoped fixes')) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 3 remediation must forbid unnecessary set-sweep-phase verify-runnable calls");
    }
    if (!content.includes("summarize-integrate-check.js")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 4 must summarize integrate-check warnings deterministically");
    }
    if (!content.includes("prepare-sweep-context.js")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 5 must use prepare-sweep-context.js for deterministic sweep setup");
    }
  }

  if (fs.existsSync(reviewPath)) {
    const content = fs.readFileSync(reviewPath, "utf8");
    if (!content.includes("dependency-safe batches")) {
      pushError(errors, "skills/review/SKILL.md: --all mode must use dependency-safe batches for MEDIUM/LARGE reviews");
    }
    if (!content.includes("skip this pre-transition")) {
      pushError(errors, "skills/review/SKILL.md: parallel review batches must skip per-node start-review pre-transitions");
    }
    if (!content.includes("Conflict Resolution Policy")) {
      pushError(errors, "skills/review/SKILL.md: review flow must define a reviewer vs certifier conflict policy");
    }
    if (!content.includes("Advisory refactors alone must not force `REQUEST CHANGES`")) {
      pushError(errors, "skills/review/SKILL.md: review flow must forbid advisory refactors from forcing REQUEST CHANGES");
    }
  }

  if (fs.existsSync(recoverPath)) {
    const content = fs.readFileSync(recoverPath, "utf8");
    if (!content.includes("Do **not** hand-edit `.forgeplan/state.json`")) {
      pushError(errors, "skills/recover/SKILL.md: must explicitly forbid manual state.json editing");
    }
    if (!content.includes("state-transition.js\" set-node-status")) {
      pushError(errors, "skills/recover/SKILL.md: recovery flows must use state-transition.js set-node-status");
    }
    if (!content.includes("skills/build/SKILL.md") || !content.includes("skills/review/SKILL.md")) {
      pushError(errors, "skills/recover/SKILL.md: resume flows must inline the build and review workflows from their skill files");
    }
    if (!content.includes("recommend-recovery.js")) {
      pushError(errors, "skills/recover/SKILL.md: recovery flow must call recommend-recovery.js before presenting options");
    }
    if (!content.includes("Recommended: [option number]. [label]")) {
      pushError(errors, "skills/recover/SKILL.md: recovery prompts must surface the deterministic recommendation to the user");
    }
    if (!content.includes('state-transition.js" restart-sweep-pass')) {
      pushError(errors, "skills/recover/SKILL.md: restart-pass recovery must use state-transition.js restart-sweep-pass");
    }
    if (!content.includes("Do **not** hand-edit `.forgeplan/state.json` to null out `fixing_node`")) {
      pushError(errors, "skills/recover/SKILL.md: restart-pass recovery must forbid hand-editing state.json to clear fixing_node");
    }
    if (!content.includes("run `→ /forgeplan:recover` and choose `RESUME`")) {
      pushError(errors, "skills/recover/SKILL.md: restart-pass next-step guidance must point to recover/resume, not a fresh deep-build");
    }
    if (!content.includes('If `claude-sweep`:')) {
      pushError(errors, "skills/recover/SKILL.md: recover resume flow must explicitly handle claude-sweep");
    }
    if (!content.includes("prepare-sweep-context.js")) {
      pushError(errors, "skills/recover/SKILL.md: claude-sweep recovery must use prepare-sweep-context.js for deterministic sweep bootstrap");
    }
    if (!content.includes("Do **not** fall back to heuristic prompt searches")) {
      pushError(errors, "skills/recover/SKILL.md: claude-sweep recovery must forbid heuristic sweep bootstrap reads by default");
    }
  }

  const sessionStartPath = path.join(repoRoot, "scripts", "session-start.js");
  if (fs.existsSync(sessionStartPath)) {
    const content = fs.readFileSync(sessionStartPath, "utf8");
    if (!content.includes("Recommended recovery:")) {
      pushError(errors, "scripts/session-start.js: interrupted operations should surface a recommended recovery action");
    }
  }

  const preToolUsePath = path.join(repoRoot, "scripts", "pre-tool-use.js");
  if (fs.existsSync(preToolUsePath)) {
    const content = fs.readFileSync(preToolUsePath, "utf8");
    if (!content.includes('nodeScriptPattern("recommend-recovery.js"')) {
      pushError(errors, "scripts/pre-tool-use.js: recommend-recovery.js must be allowed during active operations");
    }
    if (!content.includes("restart-sweep-pass")) {
      pushError(errors, "scripts/pre-tool-use.js: restart-sweep-pass must be allowed as a deterministic state-transition op");
    }
  }

  const stateTransitionPath = path.join(repoRoot, "scripts", "state-transition.js");
  if (fs.existsSync(stateTransitionPath)) {
    const content = fs.readFileSync(stateTransitionPath, "utf8");
    if (!content.includes('case "restart-sweep-pass":')) {
      pushError(errors, "scripts/state-transition.js: restart-sweep-pass op must exist for deterministic recovery resets");
    }
  }
}

function assertDesignLibraryContract(errors) {
  const designContextPath = path.join(repoRoot, "scripts", "lib", "design-context.js");
  const composePath = path.join(repoRoot, "scripts", "compose-design-context.js");
  const listPath = path.join(repoRoot, "scripts", "list-design-profiles.js");
  const syncPath = path.join(repoRoot, "scripts", "sync-awesome-design-library.js");
  const buildPath = path.join(skillsRoot, "build", "SKILL.md");
  const deepBuildPath = path.join(skillsRoot, "deep-build", "SKILL.md");
  const preToolUsePath = path.join(repoRoot, "scripts", "pre-tool-use.js");

  if (!fs.existsSync(designContextPath)) {
    pushError(errors, "scripts/lib/design-context.js: missing");
  }
  if (!fs.existsSync(composePath)) {
    pushError(errors, "scripts/compose-design-context.js: missing");
  }
  if (!fs.existsSync(listPath)) {
    pushError(errors, "scripts/list-design-profiles.js: missing");
  }
  if (!fs.existsSync(syncPath)) {
    pushError(errors, "scripts/sync-awesome-design-library.js: missing");
  }

  if (fs.existsSync(buildPath)) {
    const content = fs.readFileSync(buildPath, "utf8");
    if (!content.includes("compose-design-context.js")) {
      pushError(errors, "skills/build/SKILL.md: frontend builds must use compose-design-context.js");
    }
    if (!content.includes("design.mixins") || !content.includes("design.blend_notes")) {
      pushError(errors, "skills/build/SKILL.md: frontend builds must mention design.mixins and design.blend_notes");
    }
  }

  if (fs.existsSync(deepBuildPath)) {
    const content = fs.readFileSync(deepBuildPath, "utf8");
    if (!content.includes("compose-design-context.js")) {
      pushError(errors, "skills/deep-build/SKILL.md: design pass must use compose-design-context.js");
    }
  }

  const sweepPath = path.join(skillsRoot, "sweep", "SKILL.md");
  if (fs.existsSync(sweepPath)) {
    const content = fs.readFileSync(sweepPath, "utf8");
    if (!content.includes("prepare-sweep-context.js")) {
      pushError(errors, "skills/sweep/SKILL.md: sweep setup must use prepare-sweep-context.js");
    }
    if (!content.includes("do **not** use mutating Bash like `mkdir -p`")) {
      pushError(errors, "skills/sweep/SKILL.md: sweep setup must forbid mutating Bash mkdir during active sweep");
    }
    if (!content.includes(".forgeplan/sweeps/.gitkeep")) {
      pushError(errors, "skills/sweep/SKILL.md: sweep setup should direct missing sweeps/ creation through Write");
    }
    if (!content.includes("If ANY required state update fails, do **not** continue with parallel fix mode")) {
      pushError(errors, "skills/sweep/SKILL.md: parallel fix mode must forbid continuing after failed state setup");
    }
    if (!content.includes("the state annotation isn't critical")) {
      pushError(errors, "skills/sweep/SKILL.md: parallel fix mode must explicitly reject the 'state annotation is not critical' shortcut");
    }
    if (!content.includes("If ANY worktree creation fails, abort parallel fix mode and fall back to sequential mode")) {
      pushError(errors, "skills/sweep/SKILL.md: parallel fix mode must require successful worktree creation before dispatch");
    }
    if (!content.includes("Do **not** dispatch parallel fix agents in the main working tree")) {
      pushError(errors, "skills/sweep/SKILL.md: parallel fix mode must forbid main-tree parallel dispatch");
    }
    if (!content.includes("Agents must NOT write to `.forgeplan/state.json`")) {
      pushError(errors, "skills/sweep/SKILL.md: parallel fix agents must be forbidden from mutating state.json directly");
    }
  }

  if (fs.existsSync(preToolUsePath)) {
    const content = fs.readFileSync(preToolUsePath, "utf8");
    if (!content.includes("compose-design-context.js")) {
      pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include compose-design-context.js");
    }
    if (!content.includes("list-design-profiles.js")) {
      pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include list-design-profiles.js");
    }
  }
}

function assertCrossModelConflictPolicy(errors) {
  const bridgePath = path.join(repoRoot, "scripts", "cross-model-bridge.js");
  const reviewPath = path.join(repoRoot, "scripts", "cross-model-review.js");

  if (fs.existsSync(bridgePath)) {
    const content = fs.readFileSync(bridgePath, "utf8");
    if (!content.includes("Kind: contract-violation | runtime-risk | test-gap | spec-conflict | advisory-refactor")) {
      pushError(errors, "scripts/cross-model-bridge.js: prompt must require cross-model finding kind classification");
    }
    if (!content.includes("normalizeKind")) {
      pushError(errors, "scripts/cross-model-bridge.js: parser must normalize cross-model finding kinds");
    }
  }

  if (fs.existsSync(reviewPath)) {
    const content = fs.readFileSync(reviewPath, "utf8");
    if (!content.includes("ADVISORY REFACTOR")) {
      pushError(errors, "scripts/cross-model-review.js: review prompt must distinguish advisory refactors from blocking failures");
    }
    if (!content.includes("SPEC CONFLICT")) {
      pushError(errors, "scripts/cross-model-review.js: review prompt must distinguish spec conflicts from implementation failures");
    }
  }
}

function assertWikiKnowledgeContract(errors) {
  const wikiBuilderPath = path.join(repoRoot, "scripts", "lib", "wiki-builder.js");
  const compileWikiPath = path.join(repoRoot, "scripts", "compile-wiki.js");
  const prepareSweepContextPath = path.join(repoRoot, "scripts", "prepare-sweep-context.js");

  if (fs.existsSync(wikiBuilderPath)) {
    const content = fs.readFileSync(wikiBuilderPath, "utf8");
    if (!content.includes("## Operational Summary")) {
      pushError(errors, "scripts/lib/wiki-builder.js: node pages should include an Operational Summary section");
    }
    if (!content.includes("## Hotspots")) {
      pushError(errors, "scripts/lib/wiki-builder.js: wiki index should surface project hotspots");
    }
    if (!content.includes("## Node Health")) {
      pushError(errors, "scripts/lib/wiki-builder.js: wiki index should summarize node health");
    }
  }

  if (fs.existsSync(compileWikiPath)) {
    const content = fs.readFileSync(compileWikiPath, "utf8");
    if (!content.includes("const operationalSummary")) {
      pushError(errors, "scripts/compile-wiki.js: wiki compiler should derive per-node operational summaries");
    }
    if (!content.includes("topHotspots")) {
      pushError(errors, "scripts/compile-wiki.js: wiki compiler should derive project-level hotspots");
    }
  }

  if (fs.existsSync(prepareSweepContextPath)) {
    const content = fs.readFileSync(prepareSweepContextPath, "utf8");
    if (!content.includes("wiki_index")) {
      pushError(errors, "scripts/prepare-sweep-context.js: sweep context should expose wiki_index");
    }
    if (!content.includes("wiki_last_compiled")) {
      pushError(errors, "scripts/prepare-sweep-context.js: sweep context should expose wiki_last_compiled");
    }
    if (!content.includes("wiki_is_stale")) {
      pushError(errors, "scripts/prepare-sweep-context.js: sweep context should expose wiki_is_stale");
    }
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
assertNoNestedReviewerSkill(errors);
assertDeepBuildSnapshotContract(errors);
assertPlannerArtifactContract(errors);
assertStateTransitionUsage(errors);
assertStateTransitionBashAllowlist(errors);
assertTopLevelOrchestrationStateRules(errors);
assertDesignLibraryContract(errors);
assertCrossModelConflictPolicy(errors);
assertWikiKnowledgeContract(errors);

if (errors.length > 0) {
  console.error("Plugin validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Plugin validation passed.");
