#!/usr/bin/env node

/**
 * cross-model-bridge.js — ForgePlan Core Cross-Model Sweep Bridge
 *
 * Extends cross-model-review.js (Sprint 4) with sweep orchestration.
 * Sends full codebase + sweep findings to an alternate model for:
 *   1. Fix verification (scoped to modified files)
 *   2. Independent full codebase sweep
 *
 * Three modes: MCP (recommended), CLI, API (same as cross-model-review.js)
 *
 * Usage:
 *   node cross-model-bridge.js <sweep-report-path> [config-path]
 *
 * Output: JSON with findings array to stdout
 * Also writes to .forgeplan/sweeps/crosscheck-[timestamp].md
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));

// Import shared utilities from cross-model-review.js
const { collectNodeFiles } = require(
  path.join(__dirname, "cross-model-review.js")
);

async function main() {
  const sweepReportPath = process.argv[2];
  const configPath =
    process.argv[3] || path.join(process.cwd(), ".forgeplan", "config.yaml");

  if (!sweepReportPath) {
    console.error(
      "Usage: node cross-model-bridge.js <sweep-report-path> [config.yaml]"
    );
    process.exit(2);
  }

  const cwd = process.cwd();
  const forgePlanDir = path.join(cwd, ".forgeplan");

  // Load config
  let config = { review: { mode: "native" } };
  if (fs.existsSync(configPath)) {
    try {
      config = yaml.load(fs.readFileSync(configPath, "utf-8")) || config;
    } catch (err) {
      console.error(
        `Warning: Could not parse config: ${err.message}. Using defaults.`
      );
    }
  }

  const reviewConfig = config.review || {};
  const mode = reviewConfig.mode || "native";

  if (mode === "native") {
    console.log(
      JSON.stringify({
        status: "skipped",
        message:
          "Cross-model review not configured. Set review.mode in config.yaml.",
      })
    );
    process.exit(0);
  }

  // Load state for sweep context
  const statePath = path.join(forgePlanDir, "state.json");
  let state = {};
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    } catch {}
  }

  // Load manifest
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    console.error(`Cannot read manifest: ${err.message}`);
    process.exit(2);
  }

  // Load sweep report
  let sweepReport = "";
  if (fs.existsSync(sweepReportPath)) {
    sweepReport = fs.readFileSync(sweepReportPath, "utf-8");
  }

  // Collect ALL files across ALL nodes
  const allFiles = collectAllNodeFiles(cwd, forgePlanDir, manifest);

  // Load shared types
  const sharedTypesPath = path.join(cwd, "src", "shared", "types", "index.ts");
  let sharedTypes = "";
  if (fs.existsSync(sharedTypesPath)) {
    sharedTypes = fs.readFileSync(sharedTypesPath, "utf-8");
  }

  // Get modified files from current pass (for focused verification)
  const modifiedFiles =
    state.sweep_state?.modified_files_by_pass?.[
      String(state.sweep_state?.pass_number || 1)
    ] || [];

  // Assemble the cross-check prompt with token budget awareness
  let prompt = assembleCrossCheckPrompt(
    manifest,
    allFiles,
    sharedTypes,
    sweepReport,
    modifiedFiles
  );

  // Token estimation and truncation for external model context limits
  const TOKEN_LIMIT = 100000;
  const estimatedTokens = Math.ceil(prompt.length / 4);
  if (estimatedTokens > TOKEN_LIMIT) {
    console.error(
      `Warning: Prompt truncated from ${estimatedTokens} to ~${TOKEN_LIMIT} estimated tokens for ${reviewConfig.provider || "external"} context limit.`
    );
    // First try: only include modified files + their specs (not the full codebase)
    const reducedFiles = {};
    for (const filePath of modifiedFiles) {
      if (allFiles[filePath]) {
        reducedFiles[filePath] = allFiles[filePath];
      }
    }
    prompt = assembleCrossCheckPrompt(
      manifest,
      reducedFiles,
      sharedTypes,
      sweepReport,
      modifiedFiles
    );

    const reducedTokens = Math.ceil(prompt.length / 4);
    if (reducedTokens > TOKEN_LIMIT) {
      console.error(
        `Warning: Reduced prompt still ${reducedTokens} estimated tokens. Splitting into per-node cross-checks.`
      );
      // Second try: split into per-node cross-checks — only include first node's files
      const nodeIds = Object.keys(manifest.nodes || {});
      const perNodeFiles = {};
      for (const nodeId of nodeIds) {
        const nodeFileList = collectNodeFiles(cwd, forgePlanDir, nodeId);
        for (const [fp, content] of Object.entries(nodeFileList)) {
          if (modifiedFiles.includes(fp)) {
            perNodeFiles[fp] = content;
          }
        }
        // Check if this subset fits
        const testPrompt = assembleCrossCheckPrompt(
          manifest,
          perNodeFiles,
          sharedTypes,
          sweepReport,
          modifiedFiles
        );
        if (Math.ceil(testPrompt.length / 4) <= TOKEN_LIMIT) {
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

  // Graceful fallback: if cross-check failed, don't block the pipeline
  if (result.status === "error") {
    const fallbackReport = `## Cross-Model Sweep Verification — Skipped (Fallback)\n\n` +
      `Cross-model verification via ${mode} failed. The pipeline continues with Claude-only sweep results.\n\n` +
      `**Error:** ${result.report.replace(/^## .*\n\n/, "")}\n\n` +
      `**What this means:** Claude's own sweep agents still ran and their findings are valid. ` +
      `Cross-model verification adds an independent second opinion but is not required.\n\n` +
      `**To fix:** Run \`/forgeplan:configure\` to check your setup, or retry with \`/forgeplan:sweep --cross-check\`.\n`;

    result = { status: "error", report: fallbackReport };
    console.error(`Warning: Cross-model verification failed, falling back to Claude-only sweep results.`);
  }

  // Write crosscheck report
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(
    forgePlanDir,
    "sweeps",
    `crosscheck-${timestamp}.md`
  );
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, result.report, "utf-8");

  // Extract structured findings from the report
  const findings = extractFindings(result.report, reviewConfig.provider || "alternate");

  // Determine status — preserve error status, don't mask it as clean
  // Also detect malformed output: if no FINDING blocks AND the report doesn't
  // contain recognizable review content (e.g., it's blank, truncated, or gibberish),
  // treat as error rather than falsely certifying as "clean"
  let finalStatus;
  if (result.status === "error") {
    finalStatus = "error";
  } else if (findings.length === 0) {
    const report = result.report || "";
    const hasSubstantiveContent = report.length > 100 &&
      (/\bclean\b/i.test(report) || /\bno\s+(issues?|findings?|problems?)\b/i.test(report) || /\bpass/i.test(report) || /FINDING:/i.test(report));
    if (!hasSubstantiveContent) {
      console.error(`Warning: Cross-model response appears malformed or truncated (${report.length} chars, no recognizable review content). Treating as error.`);
      finalStatus = "error";
    } else {
      finalStatus = "clean";
    }
  } else {
    finalStatus = "findings";
  }

  // Output structured result
  console.log(
    JSON.stringify(
      {
        status: finalStatus,
        mode,
        provider: reviewConfig.provider || "unknown",
        report_path: reportPath,
        findings_count: findings.length,
        findings,
      },
      null,
      2
    )
  );
}

/**
 * Collect all implementation files across all nodes.
 */
function collectAllNodeFiles(cwd, forgePlanDir, manifest) {
  const allFiles = {};
  if (!manifest.nodes) return allFiles;

  for (const [nodeId, nodeData] of Object.entries(manifest.nodes)) {
    const nodeFiles = collectNodeFiles(cwd, forgePlanDir, nodeId);
    for (const [filePath, content] of Object.entries(nodeFiles)) {
      allFiles[filePath] = content;
    }
  }
  return allFiles;
}

/**
 * Assemble the cross-model sweep verification prompt.
 */
function assembleCrossCheckPrompt(
  manifest,
  allFiles,
  sharedTypes,
  sweepReport,
  modifiedFiles
) {
  let prompt = `# Cross-Model Codebase Verification\n\n`;
  prompt += `You are an independent code auditor reviewing a codebase that was just swept and fixed by a different AI model (Claude). `;
  prompt += `Your job is TWO-FOLD:\n`;
  prompt += `1. **Verify the fixes** — Check that Claude's fixes are correct and don't introduce new issues\n`;
  prompt += `2. **Independent sweep** — Find issues Claude MISSED. You are a fresh pair of eyes.\n\n`;
  prompt += `Do NOT trust Claude's work. Verify independently.\n\n`;

  // Manifest context
  prompt += `## Project Manifest\n\`\`\`yaml\n${yaml.dump(manifest, { lineWidth: -1 })}\`\`\`\n\n`;

  // Shared types
  if (sharedTypes) {
    prompt += `## Shared Types (src/shared/types/index.ts)\n\`\`\`typescript\n${sharedTypes}\n\`\`\`\n\n`;
  }

  // Modified files (focused verification)
  if (modifiedFiles.length > 0) {
    prompt += `## Files Modified by Claude's Fixes (VERIFY THESE FIRST)\n`;
    for (const filePath of modifiedFiles) {
      if (allFiles[filePath]) {
        prompt += `### ${filePath}\n\`\`\`\n${allFiles[filePath]}\n\`\`\`\n\n`;
      }
    }
  }

  // All other files
  prompt += `## Full Codebase\n\n`;
  for (const [filePath, content] of Object.entries(allFiles)) {
    if (!modifiedFiles.includes(filePath)) {
      prompt += `### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
    }
  }

  // Claude's sweep report
  if (sweepReport) {
    prompt += `## Claude's Sweep Report (for reference — do NOT assume these are all the issues)\n\`\`\`\n${sweepReport}\n\`\`\`\n\n`;
  }

  // Instructions
  prompt += `## Your Task\n\n`;
  prompt += `1. For each file Claude modified: verify the fix is correct, complete, and doesn't introduce regressions.\n`;
  prompt += `2. Sweep the ENTIRE codebase for issues Claude missed. Check ALL of these dimensions:\n`;
  prompt += `   - Auth/security, type consistency, error handling, database, API contracts, imports\n`;
  prompt += `   - Code quality, test quality, config/environment, frontend UX, documentation, cross-node integration\n`;
  prompt += `3. Report findings in this EXACT format (one field per line, NO multiline values, keep Description and Fix on a single line each):\n\n`;
  prompt += `\`\`\`\nFINDING: F[N]\nNode: [node-id]\nCategory: [auth-security|type-consistency|error-handling|database|api-contracts|imports|code-quality|test-quality|config-environment|frontend-ux|documentation|cross-node-integration]\nSeverity: HIGH | MEDIUM | LOW\nConfidence: [0-100]\nDescription: [what's wrong — single line]\nFile: [exact file path]\nLine: [approximate line number]\nFix: [specific remediation — single line]\n\`\`\`\n\n`;
  prompt += `IMPORTANT: Each field MUST be exactly one line. The parser uses line-by-line extraction.\n\n`;
  prompt += `If everything is clean, report: CLEAN: No findings. All fixes verified.\n`;

  return prompt;
}

/**
 * Extract structured findings from a cross-check report.
 * Handles both standard format and cross-node-integration format (Counter-File:, Node: [id] -> [id]).
 */
// Normalize category aliases from external models to canonical names
const CATEGORY_ALIASES = {
  "security": "auth-security",
  "auth": "auth-security",
  "authentication": "auth-security",
  "types": "type-consistency",
  "typing": "type-consistency",
  "errors": "error-handling",
  "exceptions": "error-handling",
  "db": "database",
  "sql": "database",
  "api": "api-contracts",
  "endpoints": "api-contracts",
  "routes": "api-contracts",
  "import": "imports",
  "dependencies": "imports",
  "quality": "code-quality",
  "tests": "test-quality",
  "testing": "test-quality",
  "config": "config-environment",
  "environment": "config-environment",
  "env": "config-environment",
  "frontend": "frontend-ux",
  "ui": "frontend-ux",
  "ux": "frontend-ux",
  "accessibility": "frontend-ux",
  "docs": "documentation",
  "integration": "cross-node-integration",
  "cross-node": "cross-node-integration",
};

function normalizeCategory(raw) {
  const lower = raw.trim().toLowerCase();
  return CATEGORY_ALIASES[lower] || lower;
}

function normalizeSeverity(raw) {
  const upper = raw.trim().toUpperCase();
  if (["HIGH", "MEDIUM", "LOW"].includes(upper)) return upper;
  if (upper === "CRITICAL" || upper === "SEVERE") return "HIGH";
  if (upper === "MINOR" || upper === "INFO") return "LOW";
  return upper;
}

function extractFindings(report, sourceModel) {
  const findings = [];

  // Standard format with Confidence
  const findingRegex =
    /FINDING:\s*F(\d+)\s*\n\s*Node:\s*(.+)\s*\n\s*Category:\s*(.+)\s*\n\s*Severity:\s*(.+)\s*\n\s*Confidence:\s*(\d+)\s*\n\s*Description:\s*(.+)\s*\n\s*File:\s*(.+)\s*\n\s*(?:Counter-File:\s*.+\s*\n\s*)?Line:\s*(.+)\s*\n\s*Fix:\s*(.+)/gi;

  // Fallback without Confidence (backward compat), also handles optional Counter-File
  const fallbackRegex =
    /FINDING:\s*F(\d+)\s*\n\s*Node:\s*(.+)\s*\n\s*Category:\s*(.+)\s*\n\s*Severity:\s*(.+)\s*\n\s*Description:\s*(.+)\s*\n\s*File:\s*(.+)\s*\n\s*(?:Counter-File:\s*.+\s*\n\s*)?Line:\s*(.+)\s*\n\s*Fix:\s*(.+)/gi;

  let match;
  while ((match = findingRegex.exec(report)) !== null) {
    // Normalize cross-node Node field: "auth -> api" → use first node ID
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

  // If primary regex found nothing, try fallback without Confidence field
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
        confidence: 80, // Default confidence for findings without explicit score
        description: match[5].trim(),
        file: match[6].trim(),
        line: match[7].trim(),
        fix: match[8].trim(),
      });
    }
  }

  return findings;
}

// --- Mode implementations (mirror cross-model-review.js patterns) ---

function crossCheckViaMcp(config, prompt, cwd) {
  const mcpServer = (config.mcp_server || "codex").replace(/[^a-zA-Z0-9_-]/g, "");
  const timeout = config.timeout || 300000; // 5 min for full codebase
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
  // Sanitize: strip shell metacharacters but allow path chars (: \ / . - _ spaces)
  const command = (config.cli_command || "codex").replace(/[;&|`$(){}!#<>]/g, "");
  const args = config.cli_args || [];
  const timeout = config.timeout || 300000;
  const tmpPrompt = path.join(cwd, ".forgeplan", ".tmp-crosscheck-prompt.md");

  try {
    fs.writeFileSync(tmpPrompt, prompt, "utf-8");
    // Quote tmpPrompt to handle paths with spaces (e.g., "Coding Projects")
    const fullArgs = [...args, `"${tmpPrompt}"`];
    const result = execSync(`${command} ${fullArgs.join(" ")}`, {
      encoding: "utf-8",
      timeout,
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { status: "completed", report: result.trim() };
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
  let apiKey = config.api_key;
  if (apiKey && apiKey.startsWith("$")) {
    apiKey = process.env[apiKey.slice(1)] || "";
  }
  const model = config.model;

  if (!apiKey) {
    return {
      status: "error",
      report: `## Cross-Check Error (API)\n\nNo api_key configured for "${provider}".`,
    };
  }

  let url, headers, body;

  switch (provider) {
    case "openai":
      url = "https://api.openai.com/v1/chat/completions";
      headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      body = JSON.stringify({
        model: model || "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8192,
      });
      break;
    case "google":
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.5-flash"}:generateContent?key=${apiKey}`;
      headers = { "Content-Type": "application/json" };
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
      text = data.choices?.[0]?.message?.content || "";
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
    collectAllNodeFiles,
    assembleCrossCheckPrompt,
    extractFindings,
  };
}
