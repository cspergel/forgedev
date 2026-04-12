"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function loadConfig(configPath) {
  const fallback = { review: { mode: "native" } };
  if (!configPath || !fs.existsSync(configPath)) return fallback;
  try {
    return yaml.load(fs.readFileSync(configPath, "utf-8")) || fallback;
  } catch {
    return fallback;
  }
}

function resolveReviewConfig(config) {
  const raw = (config || {}).review || {};
  const mode = raw.mode || "native";
  const provider = normalizeProvider(raw.provider, raw, mode);
  const cliCommand = raw.cli_command || defaultCliCommand(provider, mode);
  const cliArgs = Array.isArray(raw.cli_args)
    ? raw.cli_args
    : defaultCliArgs(cliCommand, provider, mode);
  const mcpServer = raw.mcp_server || defaultMcpServer(provider, mode);
  const model = raw.model || defaultApiModel(provider);
  const timeout = raw.timeout || 120000;

  return {
    mode,
    provider,
    model,
    timeout,
    allow_large_tier_skip: raw.allow_large_tier_skip === true,
    mcp_server: mcpServer,
    cli_command: cliCommand,
    cli_args: cliArgs,
  };
}

function normalizeProvider(provider, rawReview, mode) {
  const explicit = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  if (explicit) {
    if (explicit === "codex" || explicit === "openai-codex") return "openai";
    if (explicit === "gemini") return "google";
    return explicit;
  }

  const cliCommand = String(rawReview.cli_command || "").trim().toLowerCase();
  const mcpServer = String(rawReview.mcp_server || "").trim().toLowerCase();

  if (mode === "cli" && cliCommand.includes("codex")) return "openai";
  if (mode === "cli" && cliCommand.includes("gemini")) return "google";
  if (mode === "mcp" && mcpServer.includes("codex")) return "openai";
  if (mode === "mcp" && mcpServer.includes("gemini")) return "google";

  // MCP/CLI defaults point at Codex, so openai is the right fallback for those modes.
  // API mode with no recognizable provider will error at the switch in callers — that is correct.
  if (mode === "mcp" || mode === "cli") return "openai";
  return "unknown";
}

function defaultMcpServer(provider, mode) {
  if (mode !== "mcp") return "";
  if (provider === "openai") return "codex-cli";
  if (provider === "google") return "gemini";
  return "codex-cli";
}

function defaultCliCommand(provider, mode) {
  if (mode !== "cli") return "";
  if (provider === "openai") return "codex";
  if (provider === "google") return "gemini";
  return "codex";
}

function defaultCliArgs(cliCommand, provider, mode) {
  if (mode !== "cli") return [];
  const normalizedCommand = String(cliCommand || "").trim().toLowerCase();
  // Check command name first (user-explicit), then provider as fallback.
  if (normalizedCommand === "codex" || provider === "openai") return ["exec"];
  if (normalizedCommand === "gemini" || provider === "google") return ["-p"];
  return [];
}

function defaultApiModel(provider) {
  if (provider === "openai") return "gpt-5-codex";
  if (provider === "google") return "gemini-2.5-flash";
  if (provider === "anthropic") return "claude-sonnet-4-6";
  return "";
}

// Intentionally not exported — the two-dirname assumption (config lives at
// .forgeplan/config.yaml → two levels up === cwd) is correct for current usage
// but too fragile to surface as a public API.
function getProjectRootFromConfig(configPath) {
  if (!configPath) return process.cwd();
  return path.dirname(path.dirname(configPath));
}

function resolveApiKey(apiKey) {
  if (!apiKey) return "";
  if (typeof apiKey === "string" && apiKey.startsWith("$")) {
    return process.env[apiKey.slice(1)] || "";
  }
  return apiKey;
}

module.exports = {
  defaultApiModel,
  loadConfig,
  resolveApiKey,
  resolveReviewConfig,
};
