#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { getRecoveryRecommendation } = require("./lib/recovery-recommendation");

function main() {
  const cwd = process.cwd();
  const statePath = path.join(cwd, ".forgeplan", "state.json");

  if (!fs.existsSync(statePath)) {
    process.stderr.write("No .forgeplan/state.json found.\n");
    process.exit(1);
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (err) {
    process.stderr.write(`Could not parse .forgeplan/state.json: ${err.message}\n`);
    process.exit(1);
  }

  const recommendation = getRecoveryRecommendation(state);
  if (!recommendation) {
    process.stderr.write("No active recovery recommendation.\n");
    process.exit(1);
  }

  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(recommendation, null, 2) + "\n");
    return;
  }

  process.stdout.write(
    `Recommended: ${recommendation.optionNumber}. ${recommendation.optionLabel}\n` +
    `Reason: ${recommendation.reason}\n`
  );
}

main();
