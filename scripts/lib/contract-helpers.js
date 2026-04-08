"use strict";

/**
 * contract-helpers.js — Shared helpers for contract/interface verification
 *
 * Used by both integrate-check.js (same-phase) and verify-cross-phase.js (cross-phase)
 * to avoid duplicated logic that must stay in sync.
 */

const fs = require("fs");
const path = require("path");

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeType(text) {
  return String(text || "").replace(/\s+/g, "").toLowerCase();
}

/** Extract function names from a contract string like "validateToken(token: string): AuthResult" */
function extractFunctionNames(contract) {
  const names = [];
  const regex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  let match;
  while ((match = regex.exec(contract || "")) !== null) {
    const name = match[1];
    if (!["if", "for", "while", "switch", "catch", "function", "return", "new", "typeof", "instanceof"].includes(name)) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

/** Extract type/interface names from contract like ": AuthResult" or "returns User" */
function extractTypeNames(contract) {
  const names = [];
  const regex = /(?::\s*|->?\s*|returns?\s+)([A-Z][a-zA-Z0-9_]*)/g;
  let match;
  while ((match = regex.exec(contract || "")) !== null) {
    names.push(match[1]);
  }
  return [...new Set(names)];
}

/** Count comma-separated parameters (handling empty param list) */
function countParams(paramList) {
  const trimmed = (paramList || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(",").map(part => part.trim()).filter(Boolean).length;
}

/** Extract function signatures from a contract string */
function extractContractFunctionSignatures(contract) {
  const signatures = new Map();
  const regex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)\s*(?::\s*([A-Za-z_$][A-Za-z0-9_<>,.[\]|? ]*))?/g;
  let match;
  while ((match = regex.exec(contract || "")) !== null) {
    signatures.set(match[1], {
      paramCount: countParams(match[2]),
      returnType: match[3] ? match[3].trim() : null,
    });
  }
  return signatures;
}

/** Extract exported function signatures from source code */
function extractExportedFunctionSignatures(source) {
  const signatures = new Map();
  const patterns = [
    /export\s+(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)\s*(?::\s*([A-Za-z_$][A-Za-z0-9_<>,.[\]|? ]*))?/g,
    /export\s+(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*([A-Za-z_$][A-Za-z0-9_<>,.[\]|? ]*))?\s*=>/g,
  ];
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(source || "")) !== null) {
      signatures.set(match[1], {
        paramCount: countParams(match[2]),
        returnType: match[3] ? match[3].trim() : null,
      });
    }
  }
  return signatures;
}

/** Find the canonical export file (index.ts/js/tsx) for a node */
function findCanonicalExportFile(cwd, node) {
  // Check node.files first for an index file
  const nodeFiles = (Array.isArray(node.files) ? node.files : [])
    .map(file => path.isAbsolute(file) ? file : path.join(cwd, file))
    .filter(file => fs.existsSync(file));
  const preferred = nodeFiles.find(file => /(^|[\\/])index\.(ts|tsx|js)$/.test(file));
  if (preferred) return preferred;

  // Fallback to scope-dir candidates
  const fileScope = node.file_scope || "";
  const scopeDir = fileScope.replace(/\*\*.*$/, "").replace(/[\\/]+$/, "");
  const candidates = [
    path.join(cwd, scopeDir, "index.ts"),
    path.join(cwd, scopeDir, "index.tsx"),
    path.join(cwd, scopeDir, "index.js"),
  ];
  return candidates.find(file => fs.existsSync(file)) || null;
}

/** Read file content with size guard, returns null on failure */
function readFileSafe(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch (_) {
    return null;
  }
}

/** Check if a file contains a regex pattern (with size guard) */
function fileContainsPattern(filePath, pattern) {
  const content = readFileSafe(filePath);
  if (content === null) return false;
  return pattern.test(content);
}

module.exports = {
  escapeRegex,
  normalizeType,
  extractFunctionNames,
  extractTypeNames,
  countParams,
  extractContractFunctionSignatures,
  extractExportedFunctionSignatures,
  findCanonicalExportFile,
  readFileSafe,
  fileContainsPattern,
};
