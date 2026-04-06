#!/usr/bin/env node

/**
 * worktree-manager.js — ForgePlan Worktree Parallelism
 *
 * Manages git worktrees for parallel sweep fix agents. Each fix agent
 * operates in an isolated worktree so fixes to different nodes don't
 * conflict. Changes are merged back to the main working tree after.
 *
 * Usage:
 *   node worktree-manager.js create <node-id>     Create a worktree for a node fix
 *   node worktree-manager.js merge <node-id>       Merge worktree changes back
 *   node worktree-manager.js cleanup               Remove all ForgePlan worktrees
 *   node worktree-manager.js list                   List active worktrees
 *
 * Output: JSON to stdout
 * Exit codes: 0 = success, 1 = merge conflict, 2 = error
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const cwd = process.cwd();
const forgePlanDir = path.join(cwd, ".forgeplan");
const worktreeDir = path.join(forgePlanDir, ".worktrees");
const BRANCH_PREFIX = "forgeplan-fix-";

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      cwd: opts.cwd || cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: opts.timeout || 30000,
    }).trim();
  } catch (err) {
    if (opts.throwOnError !== false) {
      throw err;
    }
    return null;
  }
}

function isGitRepo() {
  try {
    run("git rev-parse --is-inside-work-tree");
    return true;
  } catch {
    return false;
  }
}

function getCurrentBranch() {
  return run("git branch --show-current") || "HEAD";
}

function sanitizeNodeId(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function createWorktree(nodeId) {
  nodeId = sanitizeNodeId(nodeId);
  if (!isGitRepo()) {
    console.log(JSON.stringify({ status: "error", message: "Not a git repository" }));
    process.exit(2);
  }

  // Ensure worktree directory exists
  if (!fs.existsSync(worktreeDir)) {
    fs.mkdirSync(worktreeDir, { recursive: true });
  }

  const branchName = `${BRANCH_PREFIX}${nodeId}`;
  const worktreePath = path.join(worktreeDir, nodeId);

  // Clean up if stale worktree exists
  if (fs.existsSync(worktreePath)) {
    try {
      run(`git worktree remove "${worktreePath}" --force`, { throwOnError: false });
    } catch {}
  }

  // Delete stale branch if it exists
  try {
    run(`git branch -D ${branchName}`, { throwOnError: false });
  } catch {}

  // Create worktree from current HEAD
  const baseBranch = getCurrentBranch();
  try {
    run(`git worktree add -b ${branchName} "${worktreePath}" HEAD`);
  } catch (err) {
    console.log(JSON.stringify({
      status: "error",
      message: `Failed to create worktree: ${err.stderr || err.message}`,
    }));
    process.exit(2);
  }

  console.log(JSON.stringify({
    status: "created",
    node_id: nodeId,
    worktree_path: worktreePath,
    branch: branchName,
    base_branch: baseBranch,
  }));
}

function mergeWorktree(nodeId) {
  nodeId = sanitizeNodeId(nodeId);
  const branchName = `${BRANCH_PREFIX}${nodeId}`;
  const worktreePath = path.join(worktreeDir, nodeId);

  if (!fs.existsSync(worktreePath)) {
    console.log(JSON.stringify({
      status: "error",
      message: `No worktree found for node ${nodeId}`,
    }));
    process.exit(2);
  }

  // Commit any uncommitted changes in the worktree
  const status = run("git status --porcelain", { cwd: worktreePath, throwOnError: false });
  if (status) {
    try {
      run("git add -A", { cwd: worktreePath });
      run(`git commit -m "forgeplan: sweep fix for ${nodeId}"`, { cwd: worktreePath });
    } catch (err) {
      // Commit failed with real uncommitted changes — do NOT clean up, report error
      const stderr = err.stderr || err.message || "";
      console.log(JSON.stringify({
        status: "error",
        node_id: nodeId,
        message: `Failed to commit changes in worktree: ${stderr.substring(0, 300)}`,
        worktree_path: worktreePath,
      }));
      process.exit(2);
    }
  }

  // Check if worktree has commits ahead of base
  const baseBranch = getCurrentBranch();
  let commitsAhead = "0";
  try {
    commitsAhead = run(`git rev-list --count ${baseBranch}..${branchName}`);
  } catch {}

  if (commitsAhead === "0") {
    // No changes — clean up
    cleanupWorktree(nodeId);
    console.log(JSON.stringify({
      status: "no_changes",
      node_id: nodeId,
      message: "Worktree had no changes to merge",
    }));
    return;
  }

  // Merge the worktree branch back
  try {
    run(`git merge ${branchName} --no-edit`);
    cleanupWorktree(nodeId);

    console.log(JSON.stringify({
      status: "merged",
      node_id: nodeId,
      commits_merged: parseInt(commitsAhead, 10),
    }));
  } catch (err) {
    // Merge conflict
    const stderr = err.stderr || err.message || "";
    console.log(JSON.stringify({
      status: "conflict",
      node_id: nodeId,
      message: "Merge conflict — manual resolution needed",
      details: stderr.substring(0, 500),
    }));
    // Abort the failed merge so the working tree is clean
    run("git merge --abort", { throwOnError: false });
    process.exit(1);
  }
}

function cleanupWorktree(nodeId) {
  const branchName = `${BRANCH_PREFIX}${nodeId}`;
  const worktreePath = path.join(worktreeDir, nodeId);

  try {
    run(`git worktree remove "${worktreePath}" --force`, { throwOnError: false });
  } catch {}

  try {
    run(`git branch -D ${branchName}`, { throwOnError: false });
  } catch {}
}

function cleanupAll() {
  if (!fs.existsSync(worktreeDir)) {
    console.log(JSON.stringify({ status: "clean", message: "No worktrees to clean up" }));
    return;
  }

  const cleaned = [];
  try {
    const entries = fs.readdirSync(worktreeDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        cleanupWorktree(entry.name);
        cleaned.push(entry.name);
      }
    }
  } catch {}

  // Prune worktree references
  run("git worktree prune", { throwOnError: false });

  // Remove the worktrees directory if empty
  try {
    const remaining = fs.readdirSync(worktreeDir);
    if (remaining.length === 0) {
      fs.rmSync(worktreeDir, { recursive: true });
    }
  } catch {}

  console.log(JSON.stringify({
    status: "cleaned",
    removed: cleaned,
  }));
}

function listWorktrees() {
  if (!fs.existsSync(worktreeDir)) {
    console.log(JSON.stringify({ status: "ok", worktrees: [] }));
    return;
  }

  const worktrees = [];
  try {
    const entries = fs.readdirSync(worktreeDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const wtPath = path.join(worktreeDir, entry.name);
        const branchName = `${BRANCH_PREFIX}${entry.name}`;

        // Check if worktree is valid
        let valid = false;
        try {
          run("git rev-parse --is-inside-work-tree", { cwd: wtPath });
          valid = true;
        } catch {}

        worktrees.push({
          node_id: entry.name,
          path: wtPath,
          branch: branchName,
          valid,
        });
      }
    }
  } catch {}

  console.log(JSON.stringify({ status: "ok", worktrees }));
}

// --- Main ---
const action = process.argv[2];
const nodeId = process.argv[3];

switch (action) {
  case "create":
    if (!nodeId) {
      console.error("Usage: node worktree-manager.js create <node-id>");
      process.exit(2);
    }
    createWorktree(nodeId);
    break;
  case "merge":
    if (!nodeId) {
      console.error("Usage: node worktree-manager.js merge <node-id>");
      process.exit(2);
    }
    mergeWorktree(nodeId);
    break;
  case "cleanup":
    cleanupAll();
    break;
  case "list":
    listWorktrees();
    break;
  default:
    console.error("Usage: node worktree-manager.js <create|merge|cleanup|list> [node-id]");
    process.exit(2);
}
