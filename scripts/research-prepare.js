#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readYamlIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return yaml.load(fs.readFileSync(filePath, "utf-8")) || {};
  } catch {
    return {};
  }
}

function copyFileIfExists(src, dest) {
  if (!fs.existsSync(src)) {
    return false;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function main() {
  const cwd = process.cwd();
  const pluginRoot = path.resolve(__dirname, "..");
  const forgePlanDir = path.join(cwd, ".forgeplan");
  const runtimeDir = path.join(forgePlanDir, "runtime", "research");
  const stagedSkillsDir = path.join(runtimeDir, "skills");
  const researchDir = path.join(forgePlanDir, "research");
  const rawDir = path.join(researchDir, "_raw");
  const configPath = path.join(forgePlanDir, "config.yaml");
  const registryPath = path.join(forgePlanDir, "skills-registry.yaml");
  const config = readYamlIfExists(configPath);
  const registry = readYamlIfExists(registryPath);

  ensureDir(runtimeDir);
  ensureDir(stagedSkillsDir);
  ensureDir(rawDir);

  const sourcePrompt = path.join(pluginRoot, "agents", "researcher.md");
  const stagedPrompt = path.join(runtimeDir, "researcher.md");
  copyFileIfExists(sourcePrompt, stagedPrompt);

  const assignments = (((registry || {}).assignments || {}).researcher) || {};
  const stagedSkills = [];

  for (const bucketName of ["read_now", "reference"]) {
    const bucket = Array.isArray(assignments[bucketName]) ? assignments[bucketName] : [];
    for (const entry of bucket) {
      const sourcePath = entry && entry.path ? path.resolve(cwd, entry.path) : null;
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        continue;
      }
      const fileName = `${bucketName}__${path.basename(sourcePath)}`;
      const stagedPath = path.join(stagedSkillsDir, fileName);
      fs.copyFileSync(sourcePath, stagedPath);
      stagedSkills.push({
        bucket: bucketName,
        original_path: entry.path,
        staged_path: path.relative(cwd, stagedPath).replace(/\\/g, "/"),
        description: entry.description || "",
      });
    }
  }

  const selectedModel =
    (((config || {}).models || {}).researcher) ||
    "sonnet";
  const researchConfig = (config && typeof config.research === "object" && config.research) || {};
  const maxAgentsRaw = Number(researchConfig.max_agents);
  const maxAgents = Number.isFinite(maxAgentsRaw) && maxAgentsRaw > 0
    ? Math.max(1, Math.min(2, Math.floor(maxAgentsRaw)))
    : 1;
  const mode = typeof researchConfig.mode === "string" && researchConfig.mode.trim()
    ? researchConfig.mode.trim()
    : "standard";

  const result = {
    runtime_dir: path.relative(cwd, runtimeDir).replace(/\\/g, "/"),
    research_dir: path.relative(cwd, researchDir).replace(/\\/g, "/"),
    raw_dir: path.relative(cwd, rawDir).replace(/\\/g, "/"),
    researcher_prompt: path.relative(cwd, stagedPrompt).replace(/\\/g, "/"),
    selected_model: selectedModel,
    research_mode: mode,
    max_agents: maxAgents,
    staged_skills: stagedSkills,
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
