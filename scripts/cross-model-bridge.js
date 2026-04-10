#!/usr/bin/env node

/**
 * cross-model-bridge.js - ForgePlan Core Cross-Model Sweep Bridge
 *
 * Extends cross-model-review.js with sweep orchestration.
 * Sends full codebase + sweep findings to an alternate model for:
 *   1. Fix verification (scoped to modified files)
 *   2. Independent full codebase sweep
 *
 * Three modes: MCP, CLI, API.
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const yaml = require("js-yaml");
const { loadConfig, resolveApiKey, resolveReviewConfig } = require("./lib/review-config");
const {
  collectNodeFiles,
  extractOpenAiResponsesText,
} = require(path.join(__dirname, "cross-model-review.js"));

async function main() {
  const sweepReportPath = process.argv[2];
  const configPath =
    process.argv[3] || path.join(process.cwd(), ".forgeplan", "config.yaml");

  if (!sweepReportPath) {
    console.error("Usage: node cross-model-bridge.js <sweep-report-path> [config.yaml]");
    process.exit(2);
  }

  const cwd = process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");
  const config = loadConfig(configPath);
  const reviewConfig = resolveReviewConfig(config);
  const mode = reviewConfig.mode;

  if (mode === "native") {
    console.log(JSON.stringify({
      status: "skipped",
      message: "Cross-model review not configured. Set review.mode in config.yaml.",
    }));
    process.exit(0);
  }

  const statePath = path.join(forgePlanDir, "state.json");
  let state = {};
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    } catch {}
  }

  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    console.error(`Cannot read manifest: ${err.message}`);
    process.exit(2);
  }

  const sweepReport = fs.existsSync(sweepReportPath)
    ? fs.readFileSync(sweepReportPath, "utf-8")
    : "";

  const allFiles = collectAllNodeFiles(cwd, forgePlanDir, manifest);

  const sharedTypesPath = path.join(cwd, "src", "shared", "types", "index.ts");
  const sharedTypes = fs.existsSync(sharedTypesPath)
    ? fs.readFileSync(sharedTypesPath, "utf-8")
    : "";

  const modifiedFiles =
    state.sweep_state?.modified_files_by_pass?.[
      String(state.sweep_state?.pass_number || 1)
    ] || [];

  let prompt = assembleCrossCheckPrompt(
    manifest,
    allFiles,
    sharedTypes,
    sweepReport,
    modifiedFiles
  );

  const tokenLimit = 100000;
  const estimatedTokens = Math.ceil(prompt.length / 4);
  if (estimatedTokens > tokenLimit) {
    console.error(
      `Warning: Prompt truncated from ${estimatedTokens} to ~${tokenLimit} estimated tokens for ${reviewConfig.provider || "external"} context limit.`
    );

    const reducedFiles = {};
    for (const filePath of modifiedFiles) {
      if (allFiles[filePath]) reducedFiles[filePath] = allFiles[filePath];
    }
    prompt = assembleCrossCheckPrompt(
      manifest,
      reducedFiles,
      sharedTypes,
      sweepReport,
      modifiedFiles
    );

    const reducedTokens = Math.ceil(prompt.length / 4);
    if (reducedTokens > tokenLimit) {
      console.error(
        `Warning: Reduced prompt still ${reducedTokens} estimated tokens. Splitting into per-node cross-checks.`
      );
      const nodeIds = Object.keys(manifest.nodes || {});
      const perNodeFiles = {};
      for (const nodeId of nodeIds) {
        const nodeFileList = collectNodeFiles(cwd, forgePlanDir, nodeId);
        for (const [filePath, content] of Object.entries(nodeFileList)) {
          if (modifiedFiles.includes(filePath)) {
            perNodeFiles[filePath] = content;
          }
        }
        const testPrompt = assembleCrossCheckPrompt(
          manifest,
          perNodeFiles,
          sharedTypes,
          sweepReport,
          modifiedFiles
        );
        if (Math.ceil(testPrompt.length / 4) <= tokenLimit) {
          prompt = testPrompt;
          break;
        }
      }
    }
  }

  let result;
  switch (mode) {
    case "mcp":
      result = crossCheckViaMcp(reviewConfig, prompt, cwd);
      break;
    case "cli":
      result = crossCheckViaCli(reviewConfig, prompt, cwd);
      break;
    case "api":
      result = await crossCheckViaApi(reviewConfig, prompt);
      break;
    default:
      console.error(`Unknown review mode: ${mode}`);
      process.exit(2);
  }

  if (result.status === "error") {
    const fallbackReport = `## Cross-Model Sweep Verification - Skipped (Fallback)\n\n` +
      `Cross-model verification via ${mode} failed. The pipeline continues with Claude-only sweep results.\n\n` +
      `**Error:** ${result.report.replace(/^## .*\n\n/, "")}\n\n` +
      `**What this means:** Claude's own sweep agents still ran and their findings are valid. ` +
      `Cross-model verification adds an independent second opinion but is not required.\n\n` +
      `**To fix:** Run \`/forgeplan:configure\` to check your setup, or retry with \`/forgeplan:sweep --cross-check\`.\n`;

    result = { status: "error", report: fallbackReport };
    console.error("Warning: Cross-model verification failed, falling back to Claude-only sweep results.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(forgePlanDir, "sweeps", `crosscheck-${timestamp}.md`);
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, result.report, "utf-8");

  const findings = extractFindings(result.report, reviewConfig.provider || "alternate");

  let finalStatus;
  if (result.status === "error") {
    finalStatus = "error";
  } else if (findings.length === 0) {
    const report = result.report || "";
    const hasSubstantiveContent = report.length > 100 &&
      (/\bclean\b/i.test(report) ||
        /\bno\s+(issues?|findings?|problems?)\b/i.test(report) ||
        /\bpass/i.test(report) ||
        /FINDING:/i.test(report));
    finalStatus = hasSubstantiveContent ? "clean" : "error";
    if (finalStatus === "error") {
      console.error(`Warning: Cross-model response appears malformed or truncated (${report.length} chars, no recognizable review content). Treating as error.`);
    }
  } else {
    finalStatus = "findings";
  }

  console.log(JSON.stringify({
    status: finalStatus,
    mode,
    provider: reviewConfig.provider || "unknown",
    report_path: reportPath,
    findings_count: findings.length,
    findings,
  }, null, 2));
}

function collectAllNodeFiles(cwd, forgePlanDir, manifest) {
  const allFiles = {};
  if (!manifest.nodes) return allFiles;

  for (const [nodeId] of Object.entries(manifest.nodes)) {
    const nodeFiles = collectNodeFiles(cwd, forgePlanDir, nodeId);
    for (const [filePath, content] of Object.entries(nodeFiles)) {
      allFiles[filePath] = content;
    }
  }
  return allFiles;
}

function assembleCrossCheckPrompt(manifest, allFiles, sharedTypes, sweepReport, modifiedFiles) {
  let prompt = "# Cross-Model Codebase Verification\n\n";
  prompt += "You are an independent code auditor reviewing a codebase that was just swept and fixed by a different AI model (Claude). ";
  prompt += "Your job is TWO-FOLD:\n";
  prompt += "1. **Verify the fixes** - Check that Claude's fixes are correct and don't introduce new issues\n";
  prompt += "2. **Independent sweep** - Find issues Claude MISSED. You are a fresh pair of eyes.\n\n";
  prompt += "Do NOT trust Claude's work. Verify independently.\n\n";

  prompt += `## Project Manifest\n\`\`\`yaml\n${yaml.dump(manifest, { lineWidth: -1 })}\`\`\`\n\n`;

  if (sharedTypes) {
    prompt += `## Shared Types (src/shared/types/index.ts)\n\`\`\`typescript\n${sharedTypes}\n\`\`\`\n\n`;
  }

  if (modifiedFiles.length > 0) {
    prompt += "## Files Modified by Claude's Fixes (VERIFY THESE FIRST)\n";
    for (const filePath of modifiedFiles) {
      if (allFiles[filePath]) {
        prompt += `### ${filePath}\n\`\`\`\n${allFiles[filePath]}\n\`\`\`\n\n`;
      }
    }
  }

  prompt += "## Full Codebase\n\n";
  for (const [filePath, content] of Object.entries(allFiles)) {
    if (!modifiedFiles.includes(filePath)) {
      prompt += `### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
    }
  }

  if (sweepReport) {
    prompt += `## Claude's Sweep Report (for reference - do NOT assume these are all the issues)\n\`\`\`\n${sweepReport}\n\`\`\`\n\n`;
  }

  prompt += "## Your Task\n\n";
  prompt += "1. For each file Claude modified: verify the fix is correct, complete, and doesn't introduce regressions.\n";
  prompt += "2. Sweep the ENTIRE codebase for issues Claude missed. Check ALL of these dimensions:\n";
  prompt += "   - Auth/security, type consistency, error handling, database, API contracts, imports\n";
  prompt += "   - Code quality, test quality, config/environment, frontend UX, documentation, cross-node integration\n";
  prompt += "3. Report findings in this EXACT format (one field per line, NO multiline values, keep Description and Fix on a single line each):\n\n";
  prompt += "```\n";
  prompt += "FINDING: F[N]\n";
  prompt += "Node: [node-id or \"project\" for cross-cutting issues]\n";
  prompt += "Category: [auth-security|type-consistency|error-handling|database|api-contracts|imports|code-quality|test-quality|config-environment|frontend-ux|documentation|cross-node-integration|runtime-verification]\n";
  prompt += "Severity: HIGH | MEDIUM | LOW\n";
  prompt += "Confidence: [0-100]\n";
  prompt += "Description: [what's wrong - single line]\n";
  prompt += "File: [exact file path]\n";
  prompt += "Line: [approximate line number]\n";
  prompt += "Fix: [specific remediation - single line]\n";
  prompt += "```\n\n";
  prompt += "IMPORTANT: Each field MUST be exactly one line. The parser uses line-by-line extraction.\n\n";
  prompt += "If everything is clean, report: CLEAN: No findings. All fixes verified.\n";

  return prompt;
}

const CATEGORY_ALIASES = {
  security: "auth-security",
  auth: "auth-security",
  authentication: "auth-security",
  types: "type-consistency",
  typing: "type-consistency",
  errors: "error-handling",
  exceptions: "error-handling",
  db: "database",
  sql: "database",
  api: "api-contracts",
  endpoints: "api-contracts",
  routes: "api-contracts",
  import: "imports",
  dependencies: "imports",
  quality: "code-quality",
  tests: "test-quality",
  testing: "test-quality",
  config: "config-environment",
  environment: "config-environment",
  env: "config-environment",
  frontend: "frontend-ux",
  ui: "frontend-ux",
  ux: "frontend-ux",
  accessibility: "frontend-ux",
  docs: "documentation",
  integration: "cross-node-integration",
  "cross-node": "cross-node-integration",
};

const VALID_CATEGORIES = [
  "auth-security",
  "type-consistency",
  "error-handling",
  "database",
  "api-contracts",
  "imports",
  "code-quality",
  "test-quality",
  "config-environment",
  "frontend-ux",
  "documentation",
  "cross-node-integration",
  "runtime-verification",
];

function normalizeCategory(raw) {
  const lower = raw.trim().toLowerCase();
  const mapped = CATEGORY_ALIASES[lower] || lower;
  return VALID_CATEGORIES.includes(mapped) ? mapped : "code-quality";
}

function normalizeSeverity(raw) {
  const upper = raw.trim().toUpperCase();
  if (["HIGH", "MEDIUM", "LOW"].includes(upper)) return upper;
  if (upper === "CRITICAL" || upper === "SEVERE") return "HIGH";
  if (upper === "MINOR" || upper === "INFO" || upper === "WARNING") return "LOW";
  if (upper === "MODERATE" || upper === "IMPORTANT") return "MEDIUM";
  return "MEDIUM";
}

function extractFindings(report, sourceModel) {
  const findings = [];

  const findingRegex =
    /FINDING:\s*F(\d+)\s*\n\s*Node:\s*(.+)\s*\n\s*Category:\s*(.+)\s*\n\s*Severity:\s*(.+)\s*\n\s*Confidence:\s*(\d+)\s*\n\s*Description:\s*(.+)\s*\n\s*File:\s*(.+)\s*\n\s*(?:Counter-File:\s*.+\s*\n\s*)?Line:\s*(.+)\s*\n\s*Fix:\s*(.+)/gi;

  const fallbackRegex =
    /FINDING:\s*F(\d+)\s*\n\s*Node:\s*(.+)\s*\n\s*Category:\s*(.+)\s*\n\s*Severity:\s*(.+)\s*\n\s*Description:\s*(.+)\s*\n\s*File:\s*(.+)\s*\n\s*(?:Counter-File:\s*.+\s*\n\s*)?Line:\s*(.+)\s*\n\s*Fix:\s*(.+)/gi;

  let match;
  while ((match = findingRegex.exec(report)) !== null) {
    const rawNode = match[2].trim();
    const node = rawNode.includes("->") ? rawNode.split("->")[0].trim() : rawNode;
    findings.push({
      id: `F${match[1]}`,
      source_model: sourceModel,
      node,
      category: normalizeCategory(match[3]),
      severity: normalizeSeverity(match[4]),
      confidence: parseInt(match[5], 10),
      description: match[6].trim(),
      file: match[7].trim(),
      line: match[8].trim(),
      fix: match[9].trim(),
    });
  }

  if (findings.length === 0) {
    while ((match = fallbackRegex.exec(report)) !== null) {
      const rawNode = match[2].trim();
      const node = rawNode.includes("->") ? rawNode.split("->")[0].trim() : rawNode;
      findings.push({
        id: `F${match[1]}`,
        source_model: sourceModel,
        node,
        category: normalizeCategory(match[3]),
        severity: normalizeSeverity(match[4]),
        confidence: 80,
        description: match[5].trim(),
        file: match[6].trim(),
        line: match[7].trim(),
        fix: match[8].trim(),
      });
    }
  }

  return findings;
}

function crossCheckViaMcp(config, prompt, cwd) {
  const mcpServer = String(config.mcp_server || "codex-cli").replace(/[^a-zA-Z0-9_-]/g, "");
  const timeout = config.timeout || 300000;
  const tmpPrompt = path.join(cwd, ".forgeplan", ".tmp-crosscheck-prompt.md");

  try {
    fs.writeFileSync(tmpPrompt, prompt, "utf-8");
    const result = execSync(
      `claude mcp call ${mcpServer} review --input "${tmpPrompt}"`,
      { encoding: "utf-8", timeout, cwd, stdio: ["pipe", "pipe", "pipe"] }
    );
    return { status: "completed", report: result.trim() };
  } catch (err) {
    return {
      status: "error",
      report: `## Cross-Check Error (MCP)\n\nMCP call to "${mcpServer}" failed: ${err.message}`,
    };
  } finally {
    try { fs.unlinkSync(tmpPrompt); } catch {}
  }
}

function crossCheckViaCli(config, prompt, cwd) {
  const command = config.cli_command || "codex";
  const args = Array.isArray(config.cli_args) ? config.cli_args : [];
  const timeout = config.timeout || 300000;
  const tmpPrompt = path.join(cwd, ".forgeplan", ".tmp-crosscheck-prompt.md");

  try {
    fs.writeFileSync(tmpPrompt, prompt, "utf-8");
    const safeArgs = [...args.map(String), tmpPrompt].map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`);
    const proc = spawnSync(command, safeArgs, {
      encoding: "utf-8",
      timeout,
      cwd,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (proc.error) throw proc.error;
    if (proc.status !== 0) {
      const err = new Error(proc.stderr || `CLI exited with code ${proc.status}`);
      err.stderr = proc.stderr;
      throw err;
    }
    return { status: "completed", report: (proc.stdout || "").trim() };
  } catch (err) {
    return {
      status: "error",
      report: `## Cross-Check Error (CLI)\n\n"${command}" failed: ${err.message}`,
    };
  } finally {
    try { fs.unlinkSync(tmpPrompt); } catch {}
  }
}

async function crossCheckViaApi(config, prompt) {
  const provider = config.provider || "openai";
  const apiKey = resolveApiKey(config.api_key);
  const model = config.model;

  if (!apiKey) {
    return {
      status: "error",
      report: `## Cross-Check Error (API)\n\nNo api_key configured for "${provider}".`,
    };
  }

  let url;
  let headers;
  let body;

  switch (provider) {
    case "openai":
      url = "https://api.openai.com/v1/responses";
      headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      body = JSON.stringify({
        model: model || "gpt-5-codex",
        input: prompt,
        reasoning: { effort: "medium" },
        max_output_tokens: 8192,
      });
      break;
    case "google":
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.5-flash"}:generateContent`;
      headers = { "Content-Type": "application/json", "x-goog-api-key": apiKey };
      body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      });
      break;
    case "anthropic":
      url = "https://api.anthropic.com/v1/messages";
      headers = {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      };
      body = JSON.stringify({
        model: model || "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });
      break;
    default:
      return {
        status: "error",
        report: `## Cross-Check Error\n\nUnknown provider "${provider}".`,
      };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(300000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        status: "error",
        report: `## Cross-Check Error (API)\n\nHTTP ${response.status}: ${errorText.substring(0, 500)}`,
      };
    }

    const data = await response.json();
    let text = "";
    if (provider === "openai") {
      text = extractOpenAiResponsesText(data);
    } else if (provider === "google") {
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else if (provider === "anthropic") {
      text = data.content?.[0]?.text || "";
    }

    return { status: "completed", report: text.trim() };
  } catch (err) {
    return {
      status: "error",
      report: `## Cross-Check Error (API)\n\n${err.message}`,
    };
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Cross-model bridge failed: ${err.message}`);
    process.exit(2);
  });
} else {
  module.exports = {
    assembleCrossCheckPrompt,
    collectAllNodeFiles,
    extractFindings,
  };
}
