#!/usr/bin/env node

/**
 * cross-model-review.js - ForgePlan Core Cross-Model Review
 *
 * Sends node code + spec to an alternate LLM for independent review.
 * Three modes of operation:
 *   1. MCP mode (recommended) - uses structured MCP tool calls via claude mcp
 *   2. CLI mode - spawns Codex/Gemini CLI as subprocess
 *   3. API mode - direct HTTP API calls (requires API key)
 *
 * Usage:
 *   node cross-model-review.js <node-id> [config-path]
 *   Defaults to .forgeplan/config.yaml for config
 *
 * Output: structured review report to stdout (JSON)
 * Also writes to .forgeplan/reviews/[node-id]-crossmodel.md
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const yaml = require("js-yaml");
const { loadConfig, resolveApiKey, resolveReviewConfig } = require("./lib/review-config");

async function main() {
  const nodeId = process.argv[2];
  const configPath =
    process.argv[3] || path.join(process.cwd(), ".forgeplan", "config.yaml");

  if (!nodeId) {
    console.error("Usage: node cross-model-review.js <node-id> [config.yaml]");
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
      message: "Cross-model review not configured. Using native Claude reviewer. Set review.mode in .forgeplan/config.yaml to enable.",
    }));
    process.exit(0);
  }

  const specPath = path.join(forgePlanDir, "specs", `${nodeId}.yaml`);
  if (!fs.existsSync(specPath)) {
    console.error(`Spec not found: ${specPath}`);
    process.exit(2);
  }
  const spec = fs.readFileSync(specPath, "utf-8");

  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  let manifest = "";
  if (fs.existsSync(manifestPath)) {
    manifest = fs.readFileSync(manifestPath, "utf-8");
  }

  const nodeFiles = collectNodeFiles(cwd, forgePlanDir, nodeId);
  const prompt = assembleReviewPrompt(nodeId, spec, manifest, nodeFiles);

  let result;
  switch (mode) {
    case "mcp":
      result = reviewViaMcp(reviewConfig, prompt, cwd);
      break;
    case "cli":
      result = reviewViaCli(reviewConfig, prompt, cwd);
      break;
    case "api":
      result = await reviewViaApi(reviewConfig, prompt);
      break;
    default:
      console.error(`Unknown review mode: ${mode}. Use mcp, cli, api, or native.`);
      process.exit(2);
  }

  if (result.status === "error") {
    const fallbackReport = `## Cross-Model Review - Skipped (Fallback)\n\n` +
      `Cross-model review via ${mode} failed. The pipeline continues with Claude-only review.\n\n` +
      `**Error:** ${result.report.replace(/^## .*\n\n/, "")}\n\n` +
      `**What this means:** The native Claude reviewer still ran. Cross-model verification ` +
      `adds an independent second opinion but is not required for the build to proceed.\n\n` +
      `**To fix:** Run \`/forgeplan:configure\` to check your setup, or retry later.\n`;

    result = {
      status: "skipped_fallback",
      report: fallbackReport,
      findingsCount: 0,
    };
    console.error("Warning: Cross-model review failed, falling back to Claude-only review.");
  }

  const reportPath = path.join(forgePlanDir, "reviews", `${nodeId}-crossmodel.md`);
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(reportPath, result.report, "utf-8");

  console.log(JSON.stringify({
    status: result.status,
    mode,
    provider: reviewConfig.provider || "unknown",
    node: nodeId,
    report_path: reportPath,
    findings_count: result.findingsCount || 0,
  }, null, 2));
}

function collectNodeFiles(cwd, forgePlanDir, nodeId) {
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  const files = {};

  try {
    const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
    const node = manifest.nodes && manifest.nodes[nodeId];
    if (node && Array.isArray(node.files)) {
      for (const filePath of node.files) {
        const absPath = path.join(cwd, filePath);
        if (fs.existsSync(absPath)) {
          files[filePath] = fs.readFileSync(absPath, "utf-8");
        }
      }
    }
  } catch {
    // Best effort only.
  }

  return files;
}

function assembleReviewPrompt(nodeId, spec, manifest, nodeFiles) {
  let prompt = `# Cross-Model Code Review: ${nodeId}\n\n`;
  prompt += "You are reviewing a node implementation against its spec. ";
  prompt += "The code was written by a different AI model. Do NOT trust it - verify independently.\n\n";

  prompt += `## Node Spec\n\`\`\`yaml\n${spec}\n\`\`\`\n\n`;

  if (manifest) {
    prompt += `## Manifest (shared models and project context)\n\`\`\`yaml\n${manifest}\n\`\`\`\n\n`;
  }

  prompt += "## Implementation Files\n\n";
  for (const [filePath, content] of Object.entries(nodeFiles)) {
    prompt += `### ${filePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
  }

  prompt += "## Review Instructions\n\n";
  prompt += "For EACH acceptance criterion in the spec:\n";
  prompt += "- AC[N]: PASS - [evidence] or AC[N]: FAIL - [what's missing]\n\n";
  prompt += "For EACH constraint: ENFORCED or VIOLATED with evidence.\n";
  prompt += "For EACH interface: verify the contract is implemented.\n";
  prompt += "For EACH non_goal: verify it was NOT implemented.\n";
  prompt += "For EACH failure_mode: verify defensive code exists.\n\n";
  prompt += "End with: Recommendation: APPROVE or REQUEST CHANGES (N failures)\n";

  return prompt;
}

function reviewViaMcp(config, prompt, cwd) {
  const mcpServer = String(config.mcp_server || "codex-cli").replace(/[^a-zA-Z0-9_-]/g, "");
  const timeout = config.timeout || 120000;
  const tmpPrompt = path.join(cwd, ".forgeplan", ".tmp-review-prompt.md");

  try {
    fs.writeFileSync(tmpPrompt, prompt, "utf-8");
    const result = execSync(
      `claude mcp call ${mcpServer} review --input "${tmpPrompt}"`,
      { encoding: "utf-8", timeout, cwd, stdio: ["pipe", "pipe", "pipe"] }
    );
    return parseReviewResponse(result);
  } catch (err) {
    return {
      status: "error",
      report: `## Cross-Model Review Error (MCP)\n\nMCP call to "${mcpServer}" failed: ${err.message}\n\nEnsure the MCP server is configured via \`claude mcp add ${mcpServer}\`.`,
      findingsCount: 0,
    };
  } finally {
    try { fs.unlinkSync(tmpPrompt); } catch {}
  }
}

function reviewViaCli(config, prompt, cwd) {
  const command = config.cli_command || "codex";
  const args = Array.isArray(config.cli_args) ? config.cli_args : [];
  const timeout = config.timeout || 120000;
  const tmpPrompt = path.join(cwd, ".forgeplan", ".tmp-review-prompt.md");

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
    return parseReviewResponse(proc.stdout);
  } catch (err) {
    return {
      status: "error",
      report: `## Cross-Model Review Error (CLI)\n\nCLI command "${command}" failed: ${err.message}\n\nEnsure ${command} is installed and accessible.`,
      findingsCount: 0,
    };
  } finally {
    try { fs.unlinkSync(tmpPrompt); } catch {}
  }
}

async function reviewViaApi(config, prompt) {
  const provider = config.provider || "openai";
  const apiKey = resolveApiKey(config.api_key);
  const model = config.model;

  if (!apiKey) {
    return {
      status: "error",
      report: `## Cross-Model Review Error (API)\n\nNo api_key configured for provider "${provider}" in .forgeplan/config.yaml.\nUse a direct key or env var reference like "$OPENAI_API_KEY".`,
      findingsCount: 0,
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
        report: `## Cross-Model Review Error (API)\n\nUnknown provider "${provider}". Use openai, google, or anthropic.`,
        findingsCount: 0,
      };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        status: "error",
        report: `## Cross-Model Review Error (API)\n\nHTTP ${response.status} from ${provider}: ${errorText.substring(0, 500)}`,
        findingsCount: 0,
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

    return parseReviewResponse(text);
  } catch (err) {
    return {
      status: "error",
      report: `## Cross-Model Review Error (API)\n\nAPI call to ${provider} failed: ${err.message}`,
      findingsCount: 0,
    };
  }
}

function extractOpenAiResponsesText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const parts = [];
  for (const item of data.output || []) {
    if (!item || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (typeof content.text === "string" && content.text.trim()) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n\n");
}

function parseReviewResponse(text) {
  const report = typeof text === "string" ? text.trim() : String(text).trim();
  const failMatches = report.match(/\bFAIL\b/gi) || [];
  const violatedMatches = report.match(/\bVIOLATED\b/gi) || [];
  const findingsCount = failMatches.length + violatedMatches.length;

  let status = "unknown";
  const lines = report.split("\n");
  const recLine = lines.slice().reverse().find((line) => /^\s*Recommendation:/i.test(line));

  if (recLine) {
    if (/REQUEST CHANGES/i.test(recLine)) status = "changes_requested";
    else if (/APPROVE/i.test(recLine)) status = "approved";
  }

  if (status === "unknown") {
    status = findingsCount > 0 ? "changes_requested" : "approved";
  }

  return { status, report, findingsCount };
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`ForgePlan cross-model review failed: ${err.message}`);
    process.exit(2);
  });
} else {
  module.exports = {
    assembleReviewPrompt,
    collectNodeFiles,
    extractOpenAiResponsesText,
    parseReviewResponse,
  };
}
