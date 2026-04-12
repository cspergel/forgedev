#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function usage() {
  console.error(
    "Usage:\n" +
    "  node scripts/summarize-integrate-check.js <json-file> [--json]\n" +
    "  node scripts/summarize-integrate-check.js --stdin [--json]"
  );
  process.exit(2);
}

function readInput(mode) {
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

function classifyWarning(item) {
  const detail = String(item.detail || "").toLowerCase();
  if (detail.includes("one-way dependency")) {
    return {
      key: "informational-one-way-dependency",
      actionable: false,
      reason: "reciprocal interface missing, but explicitly described as possible one-way dependency",
    };
  }
  if (detail.includes("shared model field inconsistency")) {
    return {
      key: "actionable-shared-model-inconsistency",
      actionable: true,
      reason: "shared model field references disagree across specs or manifest definitions",
    };
  }
  if (detail.includes("too vague for deterministic implementation verification")) {
    return {
      key: "actionable-vague-contract",
      actionable: true,
      reason: "contract text is too vague to verify safely",
    };
  }
  if (detail.includes("no canonical export file")) {
    return {
      key: "actionable-missing-export-anchor",
      actionable: true,
      reason: "cannot verify exports for the documented interface",
    };
  }
  if (detail.includes("no target files were available")) {
    return {
      key: "actionable-missing-target-files",
      actionable: true,
      reason: "target side has no files available for interface verification",
    };
  }
  if (detail.includes("did not find") && detail.includes("importing or using")) {
    return {
      key: "actionable-missing-usage-evidence",
      actionable: true,
      reason: "deterministic scans could not find target-side usage of contracted symbols",
    };
  }
  return {
    key: "actionable-generic-warning",
    actionable: true,
    reason: "warning requires sweep attention",
  };
}

function summarize(parsed) {
  const interfaces = Array.isArray(parsed.interfaces) ? parsed.interfaces : [];
  const warnings = interfaces.filter((item) => item.status === "WARN");
  const buckets = new Map();

  for (const item of warnings) {
    const cls = classifyWarning(item);
    if (!buckets.has(cls.key)) {
      buckets.set(cls.key, {
        key: cls.key,
        actionable: cls.actionable,
        reason: cls.reason,
        count: 0,
      });
    }
    buckets.get(cls.key).count += 1;
  }

  const bucketList = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  return {
    verdict: parsed.verdict || "UNKNOWN",
    total: parsed.total || interfaces.length,
    passed: parsed.passed || 0,
    failed: parsed.failed || 0,
    pending: parsed.pending || 0,
    warned: parsed.warned || warnings.length,
    actionableWarnings: bucketList.filter((bucket) => bucket.actionable).reduce((sum, bucket) => sum + bucket.count, 0),
    informationalWarnings: bucketList.filter((bucket) => !bucket.actionable).reduce((sum, bucket) => sum + bucket.count, 0),
    buckets: bucketList,
  };
}

function printHuman(summary) {
  console.log(
    `Verdict: ${summary.verdict} | Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed} | Pending: ${summary.pending} | Warned: ${summary.warned}`
  );
  console.log(
    `Warnings: ${summary.informationalWarnings} informational, ${summary.actionableWarnings} actionable`
  );
  for (const bucket of summary.buckets) {
    console.log(
      `  ${bucket.key}: ${bucket.count} (${bucket.actionable ? "actionable" : "informational"}) — ${bucket.reason}`
    );
  }
}

async function main() {
  const mode = process.argv[2];
  const asJson = process.argv.includes("--json");
  if (!mode) {
    usage();
  }

  const raw = await readInput(mode);
  const parsed = JSON.parse(raw);
  const summary = summarize(parsed);

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printHuman(summary);
}

main().catch((err) => {
  console.error(`summarize-integrate-check failed: ${err.message}`);
  process.exit(1);
});
