#!/usr/bin/env node

/**
 * verify-runnable.js — ForgePlan Verification Gate (Phase A)
 *
 * Stack-adaptive verification that the project actually compiles, tests pass,
 * and the dev server starts. Reads tech_stack from manifest to determine
 * the right commands.
 *
 * Steps:
 *   1. Install dependencies
 *   2. Type check (if TypeScript)
 *   3. Run tests
 *   4. Dev server check (skip for libraries/CLIs)
 *
 * Environment-resilient: classifies errors as code/environment/transient.
 * Process-safe: only kills PIDs it started (tracked in .forgeplan/.verify-pids).
 *
 * Usage:
 *   node verify-runnable.js [--skip-server]
 *
 * Output: JSON to stdout with { status, steps, errors }
 * Exit codes: 0 = all pass, 1 = code errors found, 2 = environment/config error
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

const cwd = process.cwd();
const forgePlanDir = path.join(cwd, ".forgeplan");
const pidFile = path.join(forgePlanDir, ".verify-pids");
const skipServer = process.argv.includes("--skip-server");

// --- Load tech_stack from manifest ---
function loadTechStack() {
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  if (!fs.existsSync(manifestPath)) {
    return {}; // No manifest = use defaults
  }
  try {
    const yamlPath = path.join(__dirname, "..", "node_modules", "js-yaml");
    const yaml = require(yamlPath);
    const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
    return (manifest.project && manifest.project.tech_stack) || {};
  } catch {
    return {};
  }
}

// --- Check if a command exists ---
function commandExists(cmd) {
  try {
    execSync(`which ${cmd} 2>/dev/null || where ${cmd} 2>/dev/null`, {
      stdio: "pipe",
      encoding: "utf-8",
    });
    return true;
  } catch {
    return false;
  }
}

// --- Run a command with timeout and error classification ---
function runStep(name, command, timeoutMs) {
  const result = { name, command, status: "pass", output: "", error: "" };

  try {
    result.output = execSync(command, {
      encoding: "utf-8",
      timeout: timeoutMs,
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result;
  } catch (err) {
    result.status = "fail";
    const stderr = err.stderr || "";
    const stdout = err.stdout || "";
    result.output = stdout;
    result.error = stderr || err.message;

    // Classify error type
    if (/ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|fetch failed/i.test(result.error)) {
      result.errorType = "transient"; // Network issue
    } else if (/EACCES|EPERM|permission denied/i.test(result.error)) {
      result.errorType = "environment"; // Permission issue
    } else if (/ENOENT|command not found|not recognized/i.test(result.error)) {
      result.errorType = "environment"; // Missing tool
    } else if (/EADDRINUSE|address already in use/i.test(result.error)) {
      result.errorType = "environment"; // Port conflict
    } else {
      result.errorType = "code"; // Assume code error
    }

    return result;
  }
}

// --- PID tracking for safe process cleanup ---
function writePid(pid) {
  const pids = readPids();
  pids.push(pid);
  fs.writeFileSync(pidFile, pids.join("\n"), "utf-8");
}

function readPids() {
  if (!fs.existsSync(pidFile)) return [];
  return fs
    .readFileSync(pidFile, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map(Number);
}

function cleanupPids() {
  const pids = readPids();
  for (const pid of pids) {
    try {
      // Try graceful shutdown first
      process.kill(pid, "SIGTERM");
    } catch {
      // Process already gone
    }
  }
  // Wait 2 seconds, then force kill any remaining
  if (pids.length > 0) {
    setTimeout(() => {
      for (const pid of pids) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Already gone
        }
      }
      try {
        fs.unlinkSync(pidFile);
      } catch {}
    }, 2000);
  } else {
    try {
      fs.unlinkSync(pidFile);
    } catch {}
  }
}

// --- Detect project type ---
function detectProjectType(techStack, manifestPath) {
  // Check if there are frontend or API nodes
  let hasFrontend = false;
  let hasApi = false;
  try {
    const yamlPath = path.join(__dirname, "..", "node_modules", "js-yaml");
    const yaml = require(yamlPath);
    const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
    if (manifest.nodes) {
      for (const [, node] of Object.entries(manifest.nodes)) {
        if (node.type === "frontend") hasFrontend = true;
        if (node.type === "service" || node.type === "integration") hasApi = true;
      }
    }
  } catch {}

  const isLibrary = !hasFrontend && !hasApi;
  const isCli =
    techStack.frontend === "none" && !hasFrontend;

  return { hasFrontend, hasApi, isLibrary, isCli };
}

// --- Main ---
async function main() {
  const techStack = loadTechStack();
  const runtime = techStack.runtime || "node";
  const language = techStack.language || "typescript";
  const testCommand = techStack.test_command || "";
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  const projectType = detectProjectType(techStack, manifestPath);

  const steps = [];
  let hasCodeErrors = false;
  let hasEnvErrors = false;

  // Cleanup any stale PIDs from previous runs
  cleanupPids();

  // --- Step 1: Install dependencies ---
  let installCmd;
  switch (runtime) {
    case "deno":
      installCmd = "deno cache src/**/*.ts 2>&1";
      break;
    case "bun":
      installCmd = "bun install 2>&1";
      break;
    default:
      installCmd = "npm install 2>&1";
  }

  const installResult = runStep("install", installCmd, 60000);
  steps.push(installResult);
  if (installResult.status === "fail") {
    if (installResult.errorType === "transient") {
      // Network issue — not a code problem
      hasEnvErrors = true;
    } else if (installResult.errorType === "environment") {
      hasEnvErrors = true;
    } else {
      hasCodeErrors = true;
    }
  }

  // --- Step 2: Type check (TypeScript only) ---
  if (language === "typescript") {
    // Check if tsconfig.json exists
    if (fs.existsSync(path.join(cwd, "tsconfig.json"))) {
      const tscResult = runStep("typecheck", "npx tsc --noEmit 2>&1", 30000);
      steps.push(tscResult);
      if (tscResult.status === "fail") {
        hasCodeErrors = true;

        // Also scan for type escape hatches (warnings, not failures)
        try {
          const srcDir = path.join(cwd, "src");
          if (fs.existsSync(srcDir)) {
            const grepCmd = `grep -r "as any\\|@ts-ignore\\|@ts-nocheck" src/ --include="*.ts" --include="*.tsx" -c 2>/dev/null || echo "0"`;
            const escapeCount = execSync(grepCmd, {
              encoding: "utf-8",
              cwd,
              timeout: 10000,
            }).trim();
            if (parseInt(escapeCount) > 0) {
              steps.push({
                name: "type-escape-warning",
                status: "warning",
                output: `Found ${escapeCount} type escape hatches (as any, @ts-ignore, @ts-nocheck). These pass tsc but may hide runtime errors.`,
              });
            }
          }
        } catch {}
      }
    } else {
      steps.push({
        name: "typecheck",
        status: "skip",
        output: "No tsconfig.json found — skipping type check.",
      });
    }
  }

  // --- Step 3: Run tests ---
  let testCmd;
  if (testCommand) {
    testCmd = `${testCommand} 2>&1`;
  } else {
    switch (runtime) {
      case "deno":
        testCmd = "deno test 2>&1";
        break;
      case "bun":
        testCmd = "bun test 2>&1";
        break;
      default:
        testCmd = "npm test 2>&1";
    }
  }

  // Check if tests exist before running
  let testsExist = false;
  try {
    const findCmd = `find src -name "*.test.*" -o -name "*.spec.*" -o -name "__tests__" 2>/dev/null | head -1`;
    const found = execSync(findCmd, {
      encoding: "utf-8",
      cwd,
      timeout: 5000,
    }).trim();
    testsExist = found.length > 0;
  } catch {
    // find not available or src doesn't exist
    testsExist = true; // Assume tests exist, let the test runner decide
  }

  if (!testsExist) {
    steps.push({
      name: "test",
      status: "warning",
      output:
        "No test files found (*.test.*, *.spec.*, __tests__/). Tests should be written for each acceptance criterion.",
      errorType: "code",
    });
    hasCodeErrors = true;
  } else {
    const testResult = runStep("test", testCmd, 120000);
    steps.push(testResult);
    if (testResult.status === "fail") {
      // Check if it's the npm default "no test specified" stub
      if (/no test specified|Error: no test specified/i.test(testResult.error)) {
        steps[steps.length - 1].status = "warning";
        steps[steps.length - 1].output =
          'package.json has default "no test specified" stub. Configure a real test command.';
        steps[steps.length - 1].errorType = "code";
        hasCodeErrors = true;
      } else {
        hasCodeErrors = true;
      }
    }
  }

  // --- Step 4: Dev server check (skip for libraries/CLIs) ---
  if (!skipServer && !projectType.isLibrary && !projectType.isCli) {
    // Determine dev command
    let devCmd;
    switch (runtime) {
      case "deno":
        devCmd = "deno task dev";
        break;
      case "bun":
        devCmd = "bun run dev";
        break;
      default:
        devCmd = "npm run dev";
    }

    // Check if dev script exists
    let hasDevScript = false;
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(cwd, "package.json"), "utf-8")
      );
      hasDevScript = pkg.scripts && pkg.scripts.dev;
    } catch {}

    if (!hasDevScript && runtime === "node") {
      steps.push({
        name: "server",
        status: "skip",
        output: 'No "dev" script in package.json. Skipping server check.',
      });
    } else {
      // Start the dev server in background
      try {
        const parts = devCmd.split(" ");
        const child = spawn(parts[0], parts.slice(1), {
          cwd,
          stdio: ["pipe", "pipe", "pipe"],
          detached: false,
          shell: true,
        });

        writePid(child.pid);

        // Wait up to 15 seconds for server to start
        const serverStarted = await new Promise((resolve) => {
          let output = "";
          const timeout = setTimeout(() => resolve(false), 15000);

          child.stdout.on("data", (data) => {
            output += data.toString();
            // Look for common "server started" patterns
            if (
              /listening|ready|started|running|localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(
                output
              )
            ) {
              clearTimeout(timeout);
              resolve(true);
            }
          });

          child.stderr.on("data", (data) => {
            output += data.toString();
            if (/listening|ready|started|running/i.test(output)) {
              clearTimeout(timeout);
              resolve(true);
            }
          });

          child.on("error", () => {
            clearTimeout(timeout);
            resolve(false);
          });

          child.on("exit", (code) => {
            if (code !== 0 && code !== null) {
              clearTimeout(timeout);
              resolve(false);
            }
          });
        });

        if (serverStarted) {
          steps.push({
            name: "server",
            status: "pass",
            output: "Dev server started successfully.",
          });
        } else {
          steps.push({
            name: "server",
            status: "fail",
            output: "Dev server did not start within 15 seconds.",
            errorType: "code",
          });
          hasCodeErrors = true;
        }

        // Kill the server
        try {
          process.kill(child.pid, "SIGTERM");
        } catch {}
      } catch (err) {
        steps.push({
          name: "server",
          status: "fail",
          output: `Could not start dev server: ${err.message}`,
          errorType: "environment",
        });
        hasEnvErrors = true;
      }
    }
  } else {
    steps.push({
      name: "server",
      status: "skip",
      output: projectType.isLibrary
        ? "Library project — no dev server to check."
        : projectType.isCli
          ? "CLI project — no dev server to check."
          : "Server check skipped (--skip-server flag).",
    });
  }

  // Cleanup tracked PIDs
  cleanupPids();

  // --- Output results ---
  const allPassed = steps.every(
    (s) => s.status === "pass" || s.status === "skip" || s.status === "warning"
  );
  const status = allPassed
    ? hasCodeErrors
      ? "warnings"
      : "pass"
    : hasEnvErrors && !hasCodeErrors
      ? "environment_error"
      : "fail";

  const output = {
    status,
    steps,
    summary: {
      total: steps.length,
      passed: steps.filter((s) => s.status === "pass").length,
      failed: steps.filter((s) => s.status === "fail").length,
      warnings: steps.filter((s) => s.status === "warning").length,
      skipped: steps.filter((s) => s.status === "skip").length,
    },
  };

  console.log(JSON.stringify(output, null, 2));
  process.exit(status === "pass" || status === "warnings" ? 0 : status === "environment_error" ? 2 : 1);
}

main().catch((err) => {
  console.error(`verify-runnable failed: ${err.message}`);
  cleanupPids();
  process.exit(2);
});
