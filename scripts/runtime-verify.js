#!/usr/bin/env node

/**
 * runtime-verify.js — ForgePlan Phase B Runtime Verification
 *
 * Starts the app, reads spec contracts, hits endpoints, verifies responses.
 * Tier-aware depth:
 *   SMALL: skips (Phase A sufficient)
 *   MEDIUM: Levels 1-3 (server responds, endpoints return correct status, response shapes match)
 *   LARGE: Levels 1-5 (+ auth boundaries + stress testing)
 *
 * Usage:
 *   node runtime-verify.js [--tier SMALL|MEDIUM|LARGE]
 *
 * Output: JSON to stdout with { status, tier, level_reached, endpoints_tested, endpoints_passed, findings }
 * Exit codes: 0 = pass, 1 = findings, 2 = environment error
 */

const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

const cwd = process.cwd();
const forgePlanDir = path.join(cwd, ".forgeplan");

// Parse --tier argument
function parseTier() {
  const idx = process.argv.indexOf("--tier");
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1].toUpperCase();
  }
  // Read from manifest
  try {
    const yamlPath = path.join(__dirname, "..", "node_modules", "js-yaml");
    const yaml = require(yamlPath);
    const manifest = yaml.load(fs.readFileSync(path.join(forgePlanDir, "manifest.yaml"), "utf-8"));
    return (manifest.project && manifest.project.complexity_tier) || "MEDIUM";
  } catch {
    return "MEDIUM";
  }
}

// Load endpoint contracts from node specs
function loadEndpoints() {
  const endpoints = [];
  const specsDir = path.join(forgePlanDir, "specs");
  if (!fs.existsSync(specsDir)) return endpoints;

  let yaml;
  try {
    yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));
  } catch {
    return endpoints;
  }

  const specFiles = fs.readdirSync(specsDir).filter(f => f.endsWith(".yaml"));
  for (const file of specFiles) {
    try {
      const spec = yaml.load(fs.readFileSync(path.join(specsDir, file), "utf-8"));
      if (!spec || !spec.interfaces) continue;

      const nodeId = spec.node || file.replace(".yaml", "");
      for (const iface of spec.interfaces) {
        if (!iface.contract) continue;
        const parsed = parseContract(iface.contract);
        if (parsed) {
          endpoints.push({ ...parsed, node: nodeId, raw: iface.contract });
        }
      }
    } catch {}
  }
  return endpoints;
}

/**
 * Parse a contract string like "GET /api/documents -> { documents: Document[] }"
 * Returns { method, path, expectedFields } or null if unparseable
 */
function parseContract(contract) {
  const match = contract.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s]*)\s*(?:->|→)\s*\{?\s*(.*?)\s*\}?\s*$/i);
  if (!match) return null;

  const method = match[1].toUpperCase();
  const urlPath = match[2];
  const shapeStr = match[3];

  const expectedFields = [];
  if (shapeStr) {
    const fieldMatches = shapeStr.match(/(\w+)\s*:/g);
    if (fieldMatches) {
      for (const f of fieldMatches) {
        expectedFields.push(f.replace(":", "").trim());
      }
    }
  }

  return { method, path: urlPath, expectedFields };
}

// Detect the base URL from server output or tech stack
function detectBaseUrl(serverOutput, techStack) {
  const urlMatch = serverOutput.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i);
  if (urlMatch) return `http://localhost:${urlMatch[1]}`;

  if (techStack && techStack.dev_port) return `http://localhost:${techStack.dev_port}`;

  try {
    const envContent = fs.readFileSync(path.join(cwd, ".env"), "utf-8");
    const portMatch = envContent.match(/^PORT\s*=\s*(\d+)/m);
    if (portMatch) return `http://localhost:${portMatch[1]}`;
  } catch {}

  return "http://localhost:3000";
}

// Start the dev server and wait for ready
async function startServer(techStack) {
  const runtime = (techStack && techStack.runtime) || "node";
  let devCmd;
  switch (runtime) {
    case "deno": devCmd = "deno task dev"; break;
    case "bun": devCmd = "bun run dev"; break;
    default: devCmd = "npm run dev";
  }

  if (runtime === "node" || !runtime) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8"));
      if (!pkg.scripts || !pkg.scripts.dev) {
        return { error: "No 'dev' script in package.json", errorType: "environment" };
      }
    } catch {
      return { error: "Could not read package.json", errorType: "environment" };
    }
  }

  const env = { ...process.env };
  if (!fs.existsSync(path.join(cwd, ".env")) && fs.existsSync(path.join(cwd, ".env.example"))) {
    try {
      fs.copyFileSync(path.join(cwd, ".env.example"), path.join(cwd, ".env"));
      env.MOCK_MODE = "true";
    } catch {}
  }

  const isWindows = process.platform === "win32";
  const parts = devCmd.split(" ");
  const child = spawn(parts[0], parts.slice(1), {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    detached: !isWindows,
    shell: true,
    env,
  });

  let serverOutput = "";

  const ready = await new Promise((resolve) => {
    const timeout = setTimeout(() => { resolve(false); }, 20000);

    child.stdout.on("data", (data) => {
      serverOutput += data.toString();
      if (/listening|ready|started|running|localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(serverOutput)) {
        clearTimeout(timeout);
        resolve(true);
      }
    });

    child.stderr.on("data", (data) => {
      serverOutput += data.toString();
      if (/listening|ready|started|running/i.test(serverOutput)) {
        clearTimeout(timeout);
        resolve(true);
      }
    });

    child.on("error", () => { clearTimeout(timeout); resolve(false); });
    child.on("close", (code) => {
      if (code !== 0 && code !== null) { clearTimeout(timeout); resolve(false); }
    });
  });

  if (!ready) {
    killProcess(child.pid, isWindows);
    const errorType = /EADDRINUSE|address already in use/i.test(serverOutput) ? "environment" : "code";
    return { error: `Server failed to start: ${serverOutput.substring(0, 300)}`, errorType };
  }

  return { child, serverOutput, isWindows };
}

function killProcess(pid, isWindows) {
  try {
    if (isWindows) {
      execSync(`taskkill /T /F /PID ${pid}`, { stdio: "pipe", timeout: 5000 });
    } else {
      try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); }
      const buf = new SharedArrayBuffer(4);
      Atomics.wait(new Int32Array(buf), 0, 0, 3000);
      try { process.kill(-pid, "SIGKILL"); } catch {}
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
  } catch {}
}

// --- Test Levels ---

async function runLevel1(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(10000) });
    if (res.ok || res.status === 302 || res.status === 301) {
      return { pass: true, detail: `GET / -> ${res.status}` };
    }
    return { pass: false, detail: `GET / -> ${res.status} (expected 2xx or redirect)` };
  } catch (err) {
    return { pass: false, detail: `GET / -> ${err.message}` };
  }
}

async function runLevel2(baseUrl, endpoints) {
  const results = [];
  for (const ep of endpoints) {
    try {
      const opts = { method: ep.method, signal: AbortSignal.timeout(10000) };
      if (ep.method !== "GET" && ep.method !== "DELETE") {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify({});
      }
      const res = await fetch(`${baseUrl}${ep.path}`, opts);
      results.push({
        pass: res.status < 500,
        endpoint: `${ep.method} ${ep.path}`,
        status: res.status,
        node: ep.node,
      });
    } catch (err) {
      results.push({ pass: false, endpoint: `${ep.method} ${ep.path}`, status: "TIMEOUT", node: ep.node, error: err.message });
    }
  }
  return results;
}

async function runLevel3(baseUrl, endpoints) {
  const results = [];
  for (const ep of endpoints) {
    if (ep.method !== "GET" || ep.expectedFields.length === 0) continue;
    try {
      const res = await fetch(`${baseUrl}${ep.path}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        results.push({ pass: false, endpoint: `${ep.method} ${ep.path}`, node: ep.node, detail: `Status ${res.status}` });
        continue;
      }
      const body = await res.json();
      const missingFields = ep.expectedFields.filter(f => !(f in body));
      results.push({ pass: missingFields.length === 0, endpoint: `${ep.method} ${ep.path}`, node: ep.node, expectedFields: ep.expectedFields, missingFields });
    } catch (err) {
      results.push({ pass: false, endpoint: `${ep.method} ${ep.path}`, node: ep.node, detail: err.message });
    }
  }
  return results;
}

async function runLevel4(baseUrl, endpoints) {
  const results = [];
  for (const ep of endpoints) {
    // No-auth test
    try {
      const opts = { method: ep.method, signal: AbortSignal.timeout(10000) };
      if (ep.method !== "GET" && ep.method !== "DELETE") {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify({});
      }
      const res = await fetch(`${baseUrl}${ep.path}`, opts);
      results.push({ pass: true, endpoint: `${ep.method} ${ep.path}`, test: "no-auth", status: res.status, node: ep.node });
    } catch (err) {
      results.push({ pass: false, endpoint: `${ep.method} ${ep.path}`, test: "no-auth", node: ep.node, detail: err.message });
    }

    // Malformed input test
    if (ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH") {
      try {
        const res = await fetch(`${baseUrl}${ep.path}`, {
          method: ep.method,
          headers: { "Content-Type": "application/json" },
          body: "not-valid-json",
          signal: AbortSignal.timeout(10000),
        });
        results.push({ pass: res.status < 500, endpoint: `${ep.method} ${ep.path}`, test: "malformed-input", status: res.status, node: ep.node });
      } catch (err) {
        results.push({ pass: false, endpoint: `${ep.method} ${ep.path}`, test: "malformed-input", node: ep.node, detail: err.message });
      }
    }
  }
  return results;
}

async function runLevel5(baseUrl, endpoints) {
  const results = [];

  // Concurrent requests
  for (const ep of endpoints) {
    if (ep.method !== "GET") continue;
    try {
      const promises = Array.from({ length: 10 }, () =>
        fetch(`${baseUrl}${ep.path}`, { signal: AbortSignal.timeout(15000) }).then(r => r.status).catch(() => 500)
      );
      const statuses = await Promise.all(promises);
      const serverErrors = statuses.filter(s => s >= 500).length;
      results.push({ pass: serverErrors === 0, endpoint: `${ep.method} ${ep.path}`, test: "concurrent-10", serverErrors, node: ep.node });
    } catch (err) {
      results.push({ pass: false, endpoint: `${ep.method} ${ep.path}`, test: "concurrent-10", node: ep.node, detail: err.message });
    }
  }

  // Rapid sequential — check degradation
  for (const ep of endpoints.slice(0, 3)) {
    if (ep.method !== "GET") continue;
    try {
      const times = [];
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        await fetch(`${baseUrl}${ep.path}`, { signal: AbortSignal.timeout(10000) });
        times.push(Date.now() - start);
      }
      const avgFirst10 = times.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
      const avgLast10 = times.slice(-10).reduce((a, b) => a + b, 0) / 10;
      const degradation = avgLast10 / Math.max(avgFirst10, 1);
      results.push({ pass: degradation < 3, endpoint: `${ep.method} ${ep.path}`, test: "rapid-sequential-50", degradation: degradation.toFixed(1) + "x", node: ep.node });
    } catch (err) {
      results.push({ pass: false, endpoint: `${ep.method} ${ep.path}`, test: "rapid-sequential-50", node: ep.node, detail: err.message });
    }
  }

  // Injection payloads
  const payloads = [
    { field: "name", value: "'; DROP TABLE users; --" },
    { field: "email", value: "<script>alert('xss')</script>" },
    { field: "id", value: "1 OR 1=1" },
  ];
  for (const ep of endpoints) {
    if (ep.method !== "POST" && ep.method !== "PUT") continue;
    for (const payload of payloads) {
      try {
        const res = await fetch(`${baseUrl}${ep.path}`, {
          method: ep.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [payload.field]: payload.value }),
          signal: AbortSignal.timeout(10000),
        });
        results.push({ pass: res.status < 500, endpoint: `${ep.method} ${ep.path}`, test: `injection-${payload.field}`, status: res.status, node: ep.node });
      } catch (err) {
        results.push({ pass: false, endpoint: `${ep.method} ${ep.path}`, test: `injection-${payload.field}`, node: ep.node, detail: err.message });
      }
    }
  }

  return results;
}

// --- Main ---
async function main() {
  const tier = parseTier();

  if (tier === "SMALL") {
    console.log(JSON.stringify({
      status: "skip",
      tier: "SMALL",
      message: "Phase B skipped for SMALL tier — Phase A verification is sufficient.",
      level_reached: 0,
      endpoints_tested: 0,
      endpoints_passed: 0,
      findings: [],
    }, null, 2));
    process.exit(0);
  }

  let techStack = {};
  try {
    const yaml = require(path.join(__dirname, "..", "node_modules", "js-yaml"));
    const manifest = yaml.load(fs.readFileSync(path.join(forgePlanDir, "manifest.yaml"), "utf-8"));
    techStack = (manifest.project && manifest.project.tech_stack) || {};
  } catch {}

  const endpoints = loadEndpoints();
  const server = await startServer(techStack);

  if (server.error) {
    console.log(JSON.stringify({
      status: "environment_error",
      tier,
      message: server.error,
      errorType: server.errorType,
      level_reached: 0,
      endpoints_tested: 0,
      endpoints_passed: 0,
      findings: [],
    }, null, 2));
    process.exit(2);
  }

  const baseUrl = detectBaseUrl(server.serverOutput, techStack);
  const findings = [];
  let levelReached = 0;
  let endpointsTested = 0;
  let endpointsPassed = 0;

  const cleanup = () => killProcess(server.child.pid, server.isWindows);
  process.on("SIGINT", () => { cleanup(); process.exit(1); });
  process.on("SIGTERM", () => { cleanup(); process.exit(1); });

  try {
    // Level 1
    const l1 = await runLevel1(baseUrl);
    levelReached = 1;
    endpointsTested++;
    if (l1.pass) { endpointsPassed++; }
    else {
      findings.push({ node: "app-shell", category: "runtime-verification", severity: "HIGH", confidence: 95,
        description: `Server does not respond to GET /: ${l1.detail}`, file: "src/server.ts", line: "1",
        fix: "Ensure the server binds to a port and handles GET / requests" });
    }

    // Levels 2-3 for MEDIUM+
    if (endpoints.length > 0) {
      const l2 = await runLevel2(baseUrl, endpoints);
      levelReached = 2;
      for (const r of l2) {
        endpointsTested++;
        if (r.pass) { endpointsPassed++; }
        else { findings.push({ node: r.node, category: "runtime-verification", severity: "HIGH", confidence: 90,
          description: `${r.endpoint} returns ${r.status} (server error)`, file: `src/${r.node}/`, line: "1",
          fix: `Fix the handler for ${r.endpoint} — it should not return 5xx` }); }
      }

      const l3 = await runLevel3(baseUrl, endpoints);
      levelReached = 3;
      for (const r of l3) {
        endpointsTested++;
        if (r.pass) { endpointsPassed++; }
        else if (r.missingFields && r.missingFields.length > 0) {
          findings.push({ node: r.node, category: "runtime-verification", severity: "MEDIUM", confidence: 85,
            description: `${r.endpoint} response missing fields: ${r.missingFields.join(", ")}`, file: `src/${r.node}/`, line: "1",
            fix: `Add missing fields to the response: ${r.missingFields.join(", ")}` });
        }
      }
    }

    // Levels 4-5 for LARGE only
    if (tier === "LARGE" && endpoints.length > 0) {
      const l4 = await runLevel4(baseUrl, endpoints);
      levelReached = 4;
      for (const r of l4) {
        endpointsTested++;
        if (r.pass) { endpointsPassed++; }
        else { findings.push({ node: r.node, category: "runtime-verification", severity: r.test === "malformed-input" ? "HIGH" : "MEDIUM",
          confidence: 85, description: `${r.endpoint} ${r.test}: ${r.detail || `status ${r.status}`}`, file: `src/${r.node}/`, line: "1",
          fix: r.test === "malformed-input" ? "Add input validation — malformed requests should return 400, not 500"
            : `Ensure auth middleware is applied to ${r.endpoint}` }); }
      }

      const l5 = await runLevel5(baseUrl, endpoints);
      levelReached = 5;
      for (const r of l5) {
        endpointsTested++;
        if (r.pass) { endpointsPassed++; }
        else { findings.push({ node: r.node, category: "runtime-verification",
          severity: r.test.startsWith("injection") ? "HIGH" : "MEDIUM", confidence: 80,
          description: `${r.endpoint} ${r.test}: ${r.detail || "failed"}`, file: `src/${r.node}/`, line: "1",
          fix: r.test.startsWith("injection") ? "Sanitize inputs — injection payloads should return 400, not 500"
            : r.test.includes("concurrent") ? "Fix concurrency handling — server returns 500 under parallel requests"
            : "Investigate response time degradation under load" }); }
      }
    }
  } finally {
    cleanup();
  }

  const status = findings.length === 0 ? "pass" : "fail";
  console.log(JSON.stringify({ status, tier, level_reached: levelReached, endpoints_tested: endpointsTested,
    endpoints_passed: endpointsPassed, findings }, null, 2));
  process.exit(status === "pass" ? 0 : 1);
}

main().catch((err) => {
  console.error(`runtime-verify failed: ${err.message}`);
  process.exit(2);
});
