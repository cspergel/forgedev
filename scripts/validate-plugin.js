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
  if (!content.includes("review-next-action.js")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include review-next-action.js");
  }
  if (!content.includes("autonomy-handoff.js")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include autonomy-handoff.js");
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
  if (!content.includes("iso-now.js")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include iso-now.js");
  }
  if (!content.includes("load-sweep-findings.js")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include load-sweep-findings.js");
  }
  if (!content.includes("deep-build-finalize-context.js")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include deep-build-finalize-context.js");
  }
  if (!content.includes("deep-build-verification-contract.js")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include deep-build-verification-contract.js");
  }
  if (!content.includes("deep-build-cross-model-gate.js")) {
    pushError(errors, "scripts/pre-tool-use.js: Bash allowlist must include deep-build-cross-model-gate.js");
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
  if (!content.includes('relPath === ".forgeplan/config.yaml"')) {
    pushError(errors, "scripts/pre-tool-use.js: active sweep/deep-build operations must allow sanctioned .forgeplan/config.yaml writes");
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
    if (!content.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/autonomy-handoff.js"')) {
      pushError(errors, "skills/build/SKILL.md: build completion should surface autonomous handoff guidance with autonomy-handoff.js");
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
    if (!content.includes("iso-now.js")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 5 should use iso-now.js for deterministic sweep artifact timestamps");
    }
    if (!content.includes("load-sweep-findings.js")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 5 should load sweep findings with load-sweep-findings.js");
    }
    if (!content.includes('state-transition.js" set-sweep-phase "claude-sweep"')) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 5 must explicitly transition into claude-sweep before sweep bootstrap");
    }
    if (!content.includes("Do **not** invoke `Skill(forgeplan:sweep)`")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 5 must forbid invoking Skill(forgeplan:sweep)");
    }
    if (!content.includes('Read `${CLAUDE_PLUGIN_ROOT}/skills/sweep/SKILL.md` and execute the sweep workflow inline')) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 5 must inline the sweep workflow from skills/sweep/SKILL.md");
    }
    if (!content.includes("Do **not** inspect `.forgeplan/state.json` with ad hoc `python -c`, `node -e`, or shell snippets")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 5 must forbid ad hoc shell phase inspection");
    }
    if (!content.includes("Do **not** start node-scoped fixes directly from `claude-sweep`")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 5 must forbid starting node fixes before claude-fix");
    }
    if (!content.includes("deep-build-cross-model-gate.js")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 7 must enforce cross-model requirements with deep-build-cross-model-gate.js");
    }
    if (!content.includes("Do **not** silently continue to Phase 8")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 7 must forbid silently skipping required LARGE-tier cross-model review");
    }
    if (!content.includes("review.allow_large_tier_skip: true")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 7 must document the explicit degraded-skip opt-in for LARGE tier");
    }
    if (!content.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/status-report.js"')) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 8 finalization should use status-report.js");
    }
    if (!content.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/deep-build-finalize-context.js"')) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 8 finalization should use deep-build-finalize-context.js");
    }
    if (!content.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/deep-build-verification-contract.js"')) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 8 finalization should use deep-build-verification-contract.js");
    }
    if (!content.includes("Do **not** use ad hoc shell inspection for finalization context")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 8 finalization must forbid ad hoc shell inspection");
    }
    if (!content.includes("no `git log` / git-history inspection")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 8 finalization must forbid git log based report inference");
    }
    if (!content.includes("The `Build Models` table must match the actual `selected_builder_model`")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 8 report generation must require actual builder-model data from state");
    }
    if (!content.includes("deep-build-finalize-context.js.integration.warnings")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 8 report generation must source integration warning classification from deep-build-finalize-context.js.integration.warnings");
    }
    if (!content.includes("Mirror the raw artifact `status` and `error_type` first")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 8 report generation must mirror runtime artifact status/error_type before interpretation");
    }
    if (!content.includes("must_avoid_sweep_clean_language")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 8 report generation must use sweep.reporting_guidance to avoid overclaiming closure");
    }
    if (!content.includes("Do **not** attempt `git add`, `git commit`, or `git tag` during an active deep-build or sweep")) {
      pushError(errors, "skills/deep-build/SKILL.md: deep-build should forbid in-run git commits during active sweep/deep-build operations");
    }
    if (!content.includes("manual-testing-ready")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 8 finalization must distinguish manual-testing-ready from certified completion");
    }
    if (!content.includes("Readiness language must come from `deep-build-verification-contract.js`")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 8 finalization must source readiness language from deep-build-verification-contract.js");
    }
    if (!content.includes('Do **not** claim "full test suite clean", "ready to ship", or "fully certified"')) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 8 finalization must forbid overclaiming readiness beyond deterministic evidence");
    }
    if (!content.includes("degraded certification")) {
      pushError(errors, "skills/deep-build/SKILL.md: Phase 7/8 must distinguish degraded certification from full certification");
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
    if (!content.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/review-next-action.js"')) {
      pushError(errors, "skills/review/SKILL.md: review completion should use review-next-action.js for deterministic closeout guidance");
    }
    if (!content.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/autonomy-handoff.js"')) {
      pushError(errors, "skills/review/SKILL.md: review completion should surface autonomous handoff guidance with autonomy-handoff.js");
    }
    if (!content.includes("If the terminal status is `\"reviewed-with-findings\"`")) {
      pushError(errors, "skills/review/SKILL.md: advisory review closeout must distinguish reviewed-with-findings from a blocking in-place REQUEST CHANGES banner");
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
    if (!content.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/status-report.js"')) {
      pushError(errors, "skills/recover/SKILL.md: recovery state verification should use status-report.js");
    }
    if (!content.includes("Do **not** use ad hoc `node -e`, `python -c`, or `cat ... | python3 -c ...` snippets")) {
      pushError(errors, "skills/recover/SKILL.md: recovery flow must forbid ad hoc shell snippets for state inspection");
    }
  }

  const sessionStartPath = path.join(repoRoot, "scripts", "session-start.js");
  if (fs.existsSync(sessionStartPath)) {
    const content = fs.readFileSync(sessionStartPath, "utf8");
    if (!content.includes("Recommended recovery:")) {
      pushError(errors, "scripts/session-start.js: interrupted operations should surface a recommended recovery action");
    }
    if (!content.includes("Autonomy:")) {
      pushError(errors, "scripts/session-start.js: ambient display should surface autonomous resume guidance when available");
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
    if (!content.includes('Cannot start sweep fix for "') || !content.includes('while current_phase is "claude-sweep"')) {
      pushError(errors, "scripts/state-transition.js: start-sweep-fix must reject direct fixes from claude-sweep");
    }
    if (!content.includes('during "claude-fix" because no pending findings are assigned')) {
      pushError(errors, "scripts/state-transition.js: start-sweep-fix should reject claude-fix nodes with no pending findings");
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
    if (!content.includes(".forgeplan/skills-registry.yaml")) {
      pushError(errors, "skills/deep-build/SKILL.md: design pass must consult .forgeplan/skills-registry.yaml for design-pass skills");
    }
    if (!content.includes("design-pass` registry assignments")) {
      pushError(errors, "skills/deep-build/SKILL.md: design pass must include design-pass registry assignments, not just frontend-design");
    }
    if (!content.includes("Do **not** try to edit files before activating the owning node")) {
      pushError(errors, "skills/deep-build/SKILL.md: design pass fixes must activate the owning node before any Write/Edit");
    }
    if (!content.includes('state-transition.js" start-sweep-fix')) {
      pushError(errors, "skills/deep-build/SKILL.md: design pass fixes must use state-transition.js start-sweep-fix");
    }
    if (!content.includes("Do **not** dispatch one fix agent per design finding on the same node")) {
      pushError(errors, "skills/deep-build/SKILL.md: design pass fixes should batch same-node findings instead of per-finding fanout");
    }
  }

  const designPassAgentPath = path.join(repoRoot, "agents", "design-pass.md");
  if (fs.existsSync(designPassAgentPath)) {
    const content = fs.readFileSync(designPassAgentPath, "utf8");
    if (!content.includes(".forgeplan/skills-registry.yaml")) {
      pushError(errors, "agents/design-pass.md: design-pass agent should read .forgeplan/skills-registry.yaml");
    }
    if (!content.includes("specific design docs, profiles, or skill references")) {
      pushError(errors, "agents/design-pass.md: design-pass agent should read the exact docs/profiles/skills surfaced by compose-design-context.js");
    }
  }

  const sweepPath = path.join(skillsRoot, "sweep", "SKILL.md");
  if (fs.existsSync(sweepPath)) {
    const content = fs.readFileSync(sweepPath, "utf8");
    if (!content.includes("prepare-sweep-context.js")) {
      pushError(errors, "skills/sweep/SKILL.md: sweep setup must use prepare-sweep-context.js");
    }
    if (!content.includes("iso-now.js")) {
      pushError(errors, "skills/sweep/SKILL.md: sweep report generation should use iso-now.js for deterministic timestamps");
    }
    if (!content.includes("Do **not** call `date`")) {
      pushError(errors, "skills/sweep/SKILL.md: sweep report generation must forbid ad hoc shell timestamps");
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
    if (!content.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/load-sweep-findings.js" --stdin')) {
      pushError(errors, "skills/sweep/SKILL.md: Phase 3 should use load-sweep-findings.js for deterministic findings ingestion");
    }
    if (!content.includes("Do **not** hand-edit `.forgeplan/state.json` or use ad hoc `python -c` / `node -e` snippets for findings ingestion")) {
      pushError(errors, "skills/sweep/SKILL.md: Phase 3 should forbid manual findings ingestion via shell snippets");
    }
    if (!content.includes("Do **not** probe `.forgeplan/state.json` with ad hoc shell snippets after findings ingestion")) {
      pushError(errors, "skills/sweep/SKILL.md: Phase 3/4 handoff should forbid ad hoc state probing after load-sweep-findings");
    }
    if (!content.includes('Do **not** call `start-sweep-fix` while `sweep_state.current_phase` is still `"claude-sweep"`')) {
      pushError(errors, "skills/sweep/SKILL.md: Phase 3/4 boundary must forbid start-sweep-fix during claude-sweep");
    }
    if (!content.includes('summarize-integrate-check.js" --stdin')) {
      pushError(errors, "skills/sweep/SKILL.md: Phase 5 should use summarize-integrate-check.js when integration output needs deterministic summarization");
    }
    if (!content.includes("Do **not** run ad hoc shell inspection, `node -e`, `python -c`, `date`, or checkpoint git commands")) {
      pushError(errors, "skills/sweep/SKILL.md: Phase 5 must forbid ad hoc shell/git sidecars after integration verdicts");
    }
    if (!content.includes("checkpoint commits are post-run/manual-only")) {
      pushError(errors, "skills/sweep/SKILL.md: Phase 5 should explicitly defer checkpoint commits until after the sweep completes");
    }
    if (!content.includes("The only required operations here are report writing, optional wiki compile, deterministic worktree cleanup, and clearing sweep state")) {
      pushError(errors, "skills/sweep/SKILL.md: Phase 7 must limit finalization to deterministic cleanup/report operations");
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

  if (fs.existsSync(designContextPath)) {
    const content = fs.readFileSync(designContextPath, "utf8");
    if (!content.includes("skills-registry.yaml")) {
      pushError(errors, "scripts/lib/design-context.js: should consult .forgeplan/skills-registry.yaml for design skill references");
    }
    if (!content.includes("inferProjectDesignProfiles")) {
      pushError(errors, "scripts/lib/design-context.js: should infer fallback design profiles when no explicit design config exists");
    }
    if (!content.includes("Auto-Selected Inspiration Profiles")) {
      pushError(errors, "scripts/lib/design-context.js: composed design context should surface auto-selected inspiration profiles");
    }
    if (!content.includes("Design Skill References")) {
      pushError(errors, "scripts/lib/design-context.js: composed design context should surface registry-assigned design skills");
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

function assertIntegrateArtifactPersistence(errors) {
  const integrateCheckPath = path.join(repoRoot, "scripts", "integrate-check.js");
  if (!fs.existsSync(integrateCheckPath)) return;

  const content = fs.readFileSync(integrateCheckPath, "utf8");
  if (!content.includes('integrate-check.json')) {
    pushError(errors, "scripts/integrate-check.js: should persist .forgeplan/integrate-check.json for later verification/finalization phases");
  }
  if (!content.includes("persistReport(manifestPath, report)")) {
    pushError(errors, "scripts/integrate-check.js: should persist the integration report before printing it");
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
    if (!content.includes("buildNodeSummaryData")) {
      pushError(errors, "scripts/lib/wiki-builder.js: wiki builder should emit machine-readable node summary data");
    }
    if (!content.includes("buildIndexData")) {
      pushError(errors, "scripts/lib/wiki-builder.js: wiki builder should emit machine-readable index data");
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
    if (!content.includes('dataArtifacts["index.json"]')) {
      pushError(errors, "scripts/compile-wiki.js: wiki compiler should emit a machine-readable wiki index");
    }
    if (!content.includes("data/nodes/")) {
      pushError(errors, "scripts/compile-wiki.js: wiki compiler should emit machine-readable per-node summaries");
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
    if (!content.includes("wiki_index_json")) {
      pushError(errors, "scripts/prepare-sweep-context.js: sweep context should expose wiki_index_json");
    }
    if (!content.includes("wiki_node_summaries")) {
      pushError(errors, "scripts/prepare-sweep-context.js: sweep context should expose wiki_node_summaries");
    }
  }

  const loadSweepFindingsPath = path.join(repoRoot, "scripts", "load-sweep-findings.js");
  if (fs.existsSync(loadSweepFindingsPath)) {
    const content = fs.readFileSync(loadSweepFindingsPath, "utf8");
    if (!content.includes("next_phase")) {
      pushError(errors, "scripts/load-sweep-findings.js: helper should report the next phase after findings ingestion");
    }
    if (!content.includes('state.sweep_state.findings.pending = pending')) {
      pushError(errors, "scripts/load-sweep-findings.js: helper should write node-scoped findings into sweep_state.findings.pending");
    }
    if (!content.includes('state.sweep_state.current_phase = pending.length > 0 ? "claude-fix" : "integrate"')) {
      pushError(errors, "scripts/load-sweep-findings.js: helper should set current_phase deterministically from pending findings");
    }
    if (!content.includes('trimmed.startsWith("# Sweep Report")')) {
      pushError(errors, "scripts/load-sweep-findings.js: helper should accept sweep markdown reports as input");
    }
  } else {
    pushError(errors, "scripts/load-sweep-findings.js: missing deterministic sweep findings ingestion helper");
  }
}

function assertStatusContract(errors) {
  const statusSkillPath = path.join(skillsRoot, "status", "SKILL.md");
  const statusReportPath = path.join(repoRoot, "scripts", "status-report.js");

  if (fs.existsSync(statusSkillPath)) {
    const content = fs.readFileSync(statusSkillPath, "utf8");
    if (!content.includes("nextSteps")) {
      pushError(errors, "skills/status/SKILL.md: status output should use the nextSteps array from status-report.js");
    }
    if (!content.includes("autonomyHandoff")) {
      pushError(errors, "skills/status/SKILL.md: status output should surface the autonomyHandoff section when available");
    }
  }

  if (fs.existsSync(statusReportPath)) {
    const content = fs.readFileSync(statusReportPath, "utf8");
    if (!content.includes("nextSteps")) {
      pushError(errors, "scripts/status-report.js: status report should emit nextSteps");
    }
    if (!content.includes("autonomyHandoff")) {
      pushError(errors, "scripts/status-report.js: status report should emit autonomyHandoff");
    }
    if (!content.includes("determineSuggestedNextSteps")) {
      pushError(errors, "scripts/status-report.js: status report should compute deterministic suggested next steps");
    }
    if (!content.includes("determineAutonomyHandoff")) {
      pushError(errors, "scripts/status-report.js: status report should compute deterministic autonomous handoff guidance");
    }
  }
}

function assertRuntimeVerifyWorkspaceContract(errors) {
  const runtimeVerifyPath = path.join(repoRoot, "scripts", "runtime-verify.js");

  if (!fs.existsSync(runtimeVerifyPath)) {
    pushError(errors, "scripts/runtime-verify.js: missing");
    return;
  }

  const content = fs.readFileSync(runtimeVerifyPath, "utf8");
  if (!content.includes("findNodeWorkspaceDir")) {
    pushError(errors, "scripts/runtime-verify.js: should detect the active Node/frontend workspace before starting the dev server");
  }
  if (!content.includes("cwd: serverCwd")) {
    pushError(errors, "scripts/runtime-verify.js: should spawn the dev server from the resolved workspace directory");
  }
  if (!content.includes('package.json (${nodeWorkspace.relative === "." ? "repo root" : nodeWorkspace.relative})')) {
    pushError(errors, "scripts/runtime-verify.js: environment errors should identify which package.json location was checked");
  }
}

function assertDeepBuildFinalizeContextContract(errors) {
  const finalizeContextPath = path.join(repoRoot, "scripts", "deep-build-finalize-context.js");

  if (!fs.existsSync(finalizeContextPath)) {
    pushError(errors, "scripts/deep-build-finalize-context.js: missing");
    return;
  }

  const content = fs.readFileSync(finalizeContextPath, "utf8");
  if (!content.includes("actionable_count")) {
    pushError(errors, "scripts/deep-build-finalize-context.js: should expose actionable integration warning counts");
  }
  if (!content.includes("all_informational")) {
    pushError(errors, "scripts/deep-build-finalize-context.js: should expose whether integration warnings are all informational");
  }
  if (!content.includes("error_type")) {
    pushError(errors, "scripts/deep-build-finalize-context.js: should expose runtime error_type from runtime-verify.json");
  }
  if (!content.includes("must_mirror_runtime_artifact_first")) {
    pushError(errors, "scripts/deep-build-finalize-context.js: should expose runtime-reporting guardrails");
  }
  if (!content.includes("must_avoid_sweep_clean_language")) {
    pushError(errors, "scripts/deep-build-finalize-context.js: should expose sweep-reporting guardrails to prevent overclaiming closure");
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
assertIntegrateArtifactPersistence(errors);
assertWikiKnowledgeContract(errors);
assertRuntimeVerifyWorkspaceContract(errors);
assertStatusContract(errors);
assertDeepBuildFinalizeContextContract(errors);

if (errors.length > 0) {
  console.error("Plugin validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Plugin validation passed.");
