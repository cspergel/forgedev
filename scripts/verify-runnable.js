#!/usr/bin/env node

/**
 * verify-runnable.js - ForgePlan Verification Gate (Phase A)
 *
 * Stack-adaptive verification that the project actually installs, type-checks,
 * runs tests, and starts its dev surface(s). Supports split-stack projects such
 * as Python backend + frontend/ Next.js workspaces.
 *
 * Usage:
 *   node verify-runnable.js [--skip-server]
 *
 * Output: JSON to stdout with { status, steps, errors }
 * Exit codes: 0 = pass/warnings, 1 = code errors found, 2 = environment/config error
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

const cwd = process.cwd();
const forgePlanDir = path.join(cwd, ".forgeplan");
const pidFile = path.join(forgePlanDir, ".verify-pids");
const skipServer = process.argv.includes("--skip-server");
const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));

const currentRunPids = [];

function sleepSync(ms) {
  try {
    const buf = new SharedArrayBuffer(4);
    Atomics.wait(new Int32Array(buf), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* spin */ }
  }
}

function fileExists(relPath) {
  return fs.existsSync(path.join(cwd, relPath));
}

function fileExistsIn(baseDir, relPath) {
  return fs.existsSync(path.join(baseDir, relPath));
}

function loadManifest() {
  const manifestPath = path.join(forgePlanDir, "manifest.yaml");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}

function loadTechStack() {
  const manifest = loadManifest();
  return (manifest && manifest.project && manifest.project.tech_stack) || {};
}

function normalizeRuntimeParts(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[+,/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      if (part === "typescript" || part === "javascript") return ["node"];
      return [part];
    });
}

function inferRuntimeParts() {
  const parts = [];
  if (fileExists("pyproject.toml") || fileExists("requirements.txt") || fileExists("Pipfile") || fileExists("poetry.lock")) {
    parts.push("python");
  }
  if (fileExists("package.json") || fileExists(path.join("frontend", "package.json"))) {
    parts.push("node");
  }
  if (fileExists("deno.json") || fileExists("deno.jsonc")) parts.push("deno");
  if (fileExists("bun.lockb") || fileExists("bun.lock")) parts.push("bun");
  return parts.length > 0 ? Array.from(new Set(parts)) : ["node"];
}

function getRuntimeParts(techStack) {
  const configured = normalizeRuntimeParts(techStack.runtime);
  return configured.length > 0 ? Array.from(new Set(configured)) : inferRuntimeParts();
}

function detectRuntime(techStack) {
  return getRuntimeParts(techStack).join("+");
}

function detectLanguage(techStack, runtime) {
  if (techStack.language) return techStack.language;
  if (runtime.includes("typescript")) return "typescript";
  if (runtime.includes("python")) return "python";
  if (fileExists("tsconfig.json")) return "typescript";
  return runtime.includes("node") ? "javascript" : runtime;
}

function candidateDirsFromManifest(manifest, nodeType) {
  const candidates = new Set();
  const nodes = manifest && manifest.nodes ? Object.values(manifest.nodes) : [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (nodeType && node.type !== nodeType) continue;
    const scope = String(node.file_scope || "");
    const match = scope.match(/^([^/{]+)\//);
    if (match) candidates.add(match[1]);
  }
  return Array.from(candidates);
}

function findNodeWorkspaceDir(manifest) {
  const candidates = [
    ".",
    ...candidateDirsFromManifest(manifest, "frontend"),
    "frontend",
    "web",
    "client",
    "ui",
    "app",
  ];

  for (const candidate of Array.from(new Set(candidates))) {
    const absolute = candidate === "." ? cwd : path.join(cwd, candidate);
    if (fs.existsSync(path.join(absolute, "package.json"))) {
      return { relative: candidate, absolute };
    }
  }

  return null;
}

function readPackageJson(baseDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(baseDir, "package.json"), "utf-8"));
  } catch {
    return null;
  }
}

function detectPythonInstallCommand(baseDir = cwd) {
  if (fileExistsIn(baseDir, "requirements.txt")) return "python -m pip install -r requirements.txt";
  if (fileExistsIn(baseDir, "pyproject.toml") && fileExistsIn(baseDir, "poetry.lock")) return "poetry install";
  if (fileExistsIn(baseDir, "Pipfile")) return "pipenv install --dev";
  if (fileExistsIn(baseDir, "pyproject.toml")) return "python -m pip install -e .";
  return null;
}

function detectPythonServerCommand(techStack, baseDir = cwd) {
  const port = techStack.dev_port || 8000;
  if (fileExistsIn(baseDir, "manage.py")) return `python manage.py runserver ${port}`;
  if (fileExistsIn(baseDir, "main.py")) {
    try {
      const content = fs.readFileSync(path.join(baseDir, "main.py"), "utf-8");
      if (/FastAPI|fastapi/i.test(content) && /\bapp\s*=/.test(content)) {
        return `python -m uvicorn main:app --host 127.0.0.1 --port ${port}`;
      }
    } catch {}
    return "python main.py";
  }
  if (fileExistsIn(baseDir, path.join("app", "main.py"))) {
    try {
      const content = fs.readFileSync(path.join(baseDir, "app", "main.py"), "utf-8");
      if (/FastAPI|fastapi/i.test(content) && /\bapp\s*=/.test(content)) {
        return `python -m uvicorn app.main:app --host 127.0.0.1 --port ${port}`;
      }
    } catch {}
  }
  return null;
}

function detectNodeInstallCommand(nodeWorkspace) {
  return nodeWorkspace ? "npm install" : null;
}

function detectNodeTypecheckCommand(nodeWorkspace) {
  if (!nodeWorkspace) return null;
  const pkg = readPackageJson(nodeWorkspace.absolute);
  if (pkg && pkg.scripts && pkg.scripts["type-check"]) return "npm run type-check";
  if (fileExistsIn(nodeWorkspace.absolute, "tsconfig.json")) return "npx tsc --noEmit -p tsconfig.json";
  return null;
}

function detectNodeTestCommand(nodeWorkspace) {
  if (!nodeWorkspace) return null;
  const pkg = readPackageJson(nodeWorkspace.absolute);
  if (pkg && pkg.scripts && pkg.scripts.test) return "npm test";
  return null;
}

function detectNodeServerCommand(nodeWorkspace) {
  if (!nodeWorkspace) return null;
  const pkg = readPackageJson(nodeWorkspace.absolute);
  if (pkg && pkg.scripts && pkg.scripts.dev) return "npm run dev";
  return null;
}

function runStep(name, command, timeoutMs, stepCwd = cwd) {
  const result = { name, command, status: "pass", output: "", error: "" };

  try {
    result.output = execSync(command, {
      encoding: "utf-8",
      timeout: timeoutMs,
      cwd: stepCwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result;
  } catch (err) {
    result.status = "fail";
    result.output = err.stdout || "";
    result.error = err.stderr || err.message || "";

    if (/ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|fetch failed/i.test(result.error)) {
      result.errorType = "transient";
    } else if (/EACCES|EPERM|permission denied/i.test(result.error)) {
      result.errorType = "environment";
    } else if (/ENOENT|command not found|not recognized/i.test(result.error)) {
      result.errorType = "environment";
    } else if (/EADDRINUSE|address already in use/i.test(result.error)) {
      result.errorType = "environment";
    } else {
      result.errorType = "code";
    }

    return result;
  }
}

function writePid(pid) {
  currentRunPids.push(pid);
  fs.writeFileSync(pidFile, currentRunPids.join("\n"), "utf-8");
}

function killPidTree(pid) {
  const isWindows = process.platform === "win32";
  try {
    if (isWindows) {
      execSync(`taskkill /T /F /PID ${pid}`, { stdio: "pipe", timeout: 5000 });
    } else {
      try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); }
      sleepSync(3000);
      try { process.kill(-pid, "SIGKILL"); } catch {}
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
  } catch {}
}

function cleanupPids() {
  for (const pid of currentRunPids) {
    killPidTree(pid);
  }
  try { fs.unlinkSync(pidFile); } catch {}
}

function detectProjectType(manifest, nodeWorkspace) {
  let hasFrontend = false;
  let hasApi = false;
  let hasLibraryNode = false;
  let hasCliNode = false;

  if (manifest && manifest.nodes) {
    for (const node of Object.values(manifest.nodes)) {
      if (node.type === "frontend") hasFrontend = true;
      if (node.type === "service" || node.type === "integration") hasApi = true;
      if (node.type === "library") hasLibraryNode = true;
      if (node.type === "cli") hasCliNode = true;
    }
  }

  let hasBinField = false;
  if (nodeWorkspace) {
    const pkg = readPackageJson(nodeWorkspace.absolute);
    hasBinField = Boolean(pkg && pkg.bin);
  }

  const isLibrary = hasLibraryNode || (!hasFrontend && !hasApi && !hasBinField);
  const isCli = hasCliNode || hasBinField;
  return { hasFrontend, hasApi, isLibrary, isCli };
}

function stepName(base, label, multi) {
  return multi ? `${base}:${label}` : base;
}

function scanForTests(dir) {
  if (!fs.existsSync(dir)) return false;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return true;
      if (["node_modules", ".git", ".forgeplan", ".venv", "venv", "__pycache__"].includes(entry.name)) continue;
      if (/^tests?$/i.test(entry.name)) return true;
      if (scanForTests(path.join(dir, entry.name))) return true;
    } else if (/\.(test|spec)\.\w+$/.test(entry.name) || /^test_.*\.py$/.test(entry.name)) {
      return true;
    }
  }
  return false;
}

async function runServerStep(stepId, command, stepCwd, steps) {
  const parts = command.split(" ");
  const isWindows = process.platform === "win32";
  const child = spawn(parts[0], parts.slice(1), {
    cwd: stepCwd,
    stdio: ["pipe", "pipe", "pipe"],
    detached: !isWindows,
    shell: true,
  });

  writePid(child.pid);

  let serverOutputBuf = "";
  const serverStarted = await new Promise((resolve) => {
    let output = "";
    const timeout = setTimeout(() => {
      serverOutputBuf = output;
      resolve(false);
    }, 15000);

    child.stdout.on("data", (data) => {
      output += data.toString();
      serverOutputBuf = output;
      if (/listening|ready|started|running|localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(output)) {
        clearTimeout(timeout);
        resolve(true);
      }
    });

    child.stderr.on("data", (data) => {
      output += data.toString();
      serverOutputBuf = output;
      if (/listening|ready|started|running/i.test(output)) {
        clearTimeout(timeout);
        resolve(true);
      }
    });

    child.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });

    child.on("close", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  });

  if (serverStarted) {
    steps.push({ name: stepId, status: "pass", output: "Dev server started successfully." });
    return { hasCodeErrors: false, hasEnvErrors: false };
  }

  const serverOutput = serverOutputBuf || "";
  if (/EADDRINUSE|address already in use/i.test(serverOutput)) {
    steps.push({
      name: stepId,
      status: "fail",
      output: "Dev server failed: port already in use (EADDRINUSE). Another process is using the port.",
      errorType: "environment",
    });
    return { hasCodeErrors: false, hasEnvErrors: true };
  }

  steps.push({
    name: stepId,
    status: "fail",
    output: "Dev server did not start within 15 seconds.",
    errorType: "code",
  });
  return { hasCodeErrors: true, hasEnvErrors: false };
}

async function main() {
  const manifest = loadManifest();
  const techStack = loadTechStack();
  const runtimeParts = getRuntimeParts(techStack);
  const runtime = detectRuntime(techStack);
  const language = detectLanguage(techStack, runtime);
  const testCommand = techStack.test_command || "";
  const nodeWorkspace = findNodeWorkspaceDir(manifest);
  const projectType = detectProjectType(manifest, nodeWorkspace);
  const multiRuntime = runtimeParts.length > 1;
  const hasPythonRuntime = runtimeParts.includes("python");
  const hasNodeRuntime = runtimeParts.includes("node");

  const onSignal = () => { cleanupPids(); process.exit(1); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const steps = [];
  let hasCodeErrors = false;
  let hasEnvErrors = false;

  const installPlans = [];
  if (hasPythonRuntime) installPlans.push({ label: "python", command: detectPythonInstallCommand(cwd), stepCwd: cwd });
  if (runtimeParts.includes("deno")) installPlans.push({ label: "deno", command: "deno cache src/**/*.ts", stepCwd: cwd });
  if (runtimeParts.includes("bun")) installPlans.push({ label: "bun", command: "bun install", stepCwd: cwd });
  if (hasNodeRuntime) {
    installPlans.push({
      label: nodeWorkspace ? (nodeWorkspace.relative === "." ? "node" : `node@${nodeWorkspace.relative}`) : "node",
      command: detectNodeInstallCommand(nodeWorkspace),
      stepCwd: nodeWorkspace ? nodeWorkspace.absolute : cwd,
    });
  }
  if (installPlans.length === 0) installPlans.push({ label: runtime || "node", command: "npm install", stepCwd: cwd });

  for (const plan of installPlans) {
    const stepId = stepName("install", plan.label, installPlans.length > 1);
    if (!plan.command) {
      steps.push({ name: stepId, status: "skip", output: `No install command inferred for ${plan.label}.` });
      continue;
    }
    const result = runStep(stepId, plan.command, 60000, plan.stepCwd);
    steps.push(result);
    if (result.status === "fail") {
      if (result.errorType === "environment" || result.errorType === "transient") hasEnvErrors = true;
      else hasCodeErrors = true;
    }
  }

  if (language === "typescript" || String(language).includes("typescript") || hasNodeRuntime) {
    const command = hasNodeRuntime ? detectNodeTypecheckCommand(nodeWorkspace) : null;
    const stepCwd = nodeWorkspace ? nodeWorkspace.absolute : cwd;
    const stepId = stepName("typecheck", "node", multiRuntime);

    if (!command) {
      steps.push({ name: stepId, status: "skip", output: "No TypeScript type-check command inferred." });
    } else {
      const result = runStep(stepId, command, 30000, stepCwd);
      steps.push(result);
      if (result.status === "fail") hasCodeErrors = true;
    }
  }

  let explicitTestCmd = null;
  if (testCommand) {
    if (!/^(npm|npx|node|deno|bun|pnpm|yarn|python|pytest|uv|poetry|pipenv)\s/.test(testCommand) && testCommand !== "npm test") {
      steps.push({ name: "test", status: "fail", output: `Untrusted test_command in manifest: "${testCommand}".`, errorType: "code" });
      hasCodeErrors = true;
    } else {
      explicitTestCmd = testCommand;
    }
  }

  const testPlans = [];
  if (explicitTestCmd) {
    testPlans.push({ label: runtime || "project", command: explicitTestCmd, stepCwd: cwd });
  } else {
    if (hasPythonRuntime) testPlans.push({ label: "python", command: "pytest", stepCwd: cwd });
    if (runtimeParts.includes("deno")) testPlans.push({ label: "deno", command: "deno test", stepCwd: cwd });
    if (runtimeParts.includes("bun")) testPlans.push({ label: "bun", command: "bun test", stepCwd: cwd });
    if (hasNodeRuntime) {
      testPlans.push({
        label: nodeWorkspace ? (nodeWorkspace.relative === "." ? "node" : `node@${nodeWorkspace.relative}`) : "node",
        command: detectNodeTestCommand(nodeWorkspace),
        stepCwd: nodeWorkspace ? nodeWorkspace.absolute : cwd,
      });
    }
  }

  for (const plan of testPlans) {
    const stepId = stepName("test", plan.label, testPlans.length > 1);
    const testsExist = (() => {
      try { return scanForTests(plan.stepCwd); } catch { return true; }
    })();

    if (!plan.command) {
      steps.push({ name: stepId, status: "skip", output: `No test command inferred for ${plan.label}.` });
      continue;
    }
    if (!testsExist) {
      steps.push({
        name: stepId,
        status: "warning",
        output: `No test files found under ${plan.stepCwd}.`,
        errorType: "code",
      });
      hasCodeErrors = true;
      continue;
    }

    const result = runStep(stepId, plan.command, 120000, plan.stepCwd);
    steps.push(result);
    if (result.status === "fail") {
      if (/no test specified|Error: no test specified/i.test(result.error)) {
        steps[steps.length - 1].status = "warning";
        steps[steps.length - 1].output = 'package.json has default "no test specified" stub. Configure a real test command.';
        steps[steps.length - 1].errorType = "code";
      }
      hasCodeErrors = true;
    }
  }

  if (!skipServer && !projectType.isLibrary && !projectType.isCli) {
    const serverPlans = [];
    if (hasPythonRuntime) serverPlans.push({ label: "python", command: detectPythonServerCommand(techStack, cwd), stepCwd: cwd });
    if (runtimeParts.includes("deno")) serverPlans.push({ label: "deno", command: "deno task dev", stepCwd: cwd });
    if (runtimeParts.includes("bun")) serverPlans.push({ label: "bun", command: "bun run dev", stepCwd: cwd });
    if (hasNodeRuntime) {
      serverPlans.push({
        label: nodeWorkspace ? (nodeWorkspace.relative === "." ? "node" : `node@${nodeWorkspace.relative}`) : "node",
        command: detectNodeServerCommand(nodeWorkspace),
        stepCwd: nodeWorkspace ? nodeWorkspace.absolute : cwd,
      });
    }

    for (const plan of serverPlans) {
      const stepId = stepName("server", plan.label, serverPlans.length > 1);
      if (!plan.command) {
        steps.push({ name: stepId, status: "skip", output: `No dev server command inferred for ${plan.label}.` });
        continue;
      }
      const result = await runServerStep(stepId, plan.command, plan.stepCwd, steps);
      if (result.hasCodeErrors) hasCodeErrors = true;
      if (result.hasEnvErrors) hasEnvErrors = true;
    }
  } else {
    steps.push({
      name: "server",
      status: "skip",
      output: projectType.isLibrary
        ? "Library project - no dev server to check."
        : projectType.isCli
          ? "CLI project - no dev server to check."
          : "Server check skipped (--skip-server flag).",
    });
  }

  cleanupPids();

  const allPassed = steps.every((step) => step.status === "pass" || step.status === "skip" || step.status === "warning");
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
      passed: steps.filter((step) => step.status === "pass").length,
      failed: steps.filter((step) => step.status === "fail").length,
      warnings: steps.filter((step) => step.status === "warning").length,
      skipped: steps.filter((step) => step.status === "skip").length,
    },
  };

  console.log(JSON.stringify(output, null, 2));
  process.exit(status === "pass" || status === "warnings" ? 0 : status === "environment_error" ? 2 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`verify-runnable failed: ${err.message}`);
    cleanupPids();
    process.exit(2);
  });
} else {
  module.exports = { killPidTree, runStep };
}
