#!/usr/bin/env node
"use strict";

const path = require("path");
const yaml = require("js-yaml");
const fs = require("fs");
const { loadConfig, resolveReviewConfig } = require("./lib/review-config");

function safeReadYaml(filePath, fallback = null) {
  try {
    return yaml.load(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function main() {
  const cwd = process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  const configPath = path.join(forgePlanDir, "config.yaml");

  const manifest = safeReadYaml(manifestPath, {}) || {};
  const config = loadConfig(configPath);
  const reviewConfig = resolveReviewConfig(config);
  const tier =
    (config.complexity && config.complexity.tier_override) ||
    (manifest.project && manifest.project.complexity_tier) ||
    "MEDIUM";

  const configured = reviewConfig.mode && reviewConfig.mode !== "native";
  const explicitLargeSkip = reviewConfig.allow_large_tier_skip === true;
  let requirement = "optional";
  let status = "ready";
  let message = "Cross-model review may proceed.";

  if (tier === "SMALL") {
    requirement = "skipped";
    status = "skipped";
    message = "SMALL tier skips cross-model verification.";
  } else if (tier === "MEDIUM") {
    requirement = "optional";
    if (!configured) {
      status = "skipped";
      message = "MEDIUM tier may skip cross-model verification when no alternate model is configured.";
    }
  } else if (tier === "LARGE") {
    requirement = "required";
    if (!configured) {
      if (explicitLargeSkip) {
        status = "degraded_allowed";
        message = "LARGE tier cross-model verification is explicitly skipped by config (review.allow_large_tier_skip=true). Continue only as degraded certification.";
      } else {
        status = "prompt_required";
        message = "LARGE tier should configure cross-model verification. Prompt the user to run /forgeplan:configure or explicitly set review.allow_large_tier_skip=true to continue in degraded mode.";
      }
    }
  }

  console.log(JSON.stringify({
    type: "deep_build_cross_model_gate",
    tier,
    requirement,
    configured: Boolean(configured),
    allow_large_tier_skip: explicitLargeSkip,
    review_mode: reviewConfig.mode || "native",
    provider: reviewConfig.provider || null,
    status,
    message,
  }, null, 2));
}

main();
