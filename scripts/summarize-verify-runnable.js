#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function usage() {
  console.error(
    "Usage:\n" +
    "  node scripts/summarize-verify-runnable.js <json-file>\n" +
    "  node scripts/summarize-verify-runnable.js --stdin"
  );
  process.exit(2);
}

function readInput() {
  const mode = process.argv[2];
  if (!mode) {
    usage();
  }

  if (mode === "--stdin") {
    return new Promise((resolve, reject) => {
      let raw = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        raw += chunk;
      });
      process.stdin.on("end", () => resolve(raw));
      process.stdin.on("error", reject);
    });
  }

  const filePath = path.resolve(process.cwd(), mode);
  return Promise.resolve(fs.readFileSync(filePath, "utf8"));
}

function main(raw) {
  const parsed = JSON.parse(raw);
  const status = parsed.status || "unknown";
  const steps = Array.isArray(parsed.steps) ? parsed.steps : [];

  console.log(`Overall: ${status}`);
  for (const step of steps) {
    const name = step.name || step.step || "unknown-step";
    const stepStatus = step.status || "unknown";
    console.log(`  ${name}: ${stepStatus}`);
  }

  if (Array.isArray(parsed.warnings) && parsed.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of parsed.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

readInput()
  .then(main)
  .catch((err) => {
    console.error(`summarize-verify-runnable failed: ${err.message}`);
    process.exit(1);
  });
