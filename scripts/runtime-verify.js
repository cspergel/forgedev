#!/usr/bin/env node

/**
 * runtime-verify.js — ForgePlan Phase B Runtime Verification
 *
 * Starts the app, reads spec contracts, hits endpoints, verifies responses.
 * Tier-aware depth:
 *   SMALL: skips (Phase A sufficient)
 *   MEDIUM: Levels 1-3 (server responds, endpoints return correct status, response shapes match)
 *   LARGE: Levels 1-5 (+ auth boundary detection [informational] + stress testing)
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

// Synchronous sleep that works in all Node.js environments.
// Atomics.wait requires SharedArrayBuffer which may throw in some configs.
function sleepSync(ms) {
  try {
    const buf = new SharedArrayBuffer(4);
    Atomics.wait(new Int32Array(buf), 0, 0, ms);
  } catch {
    // Fallback: busy-wait with Date.now() — less efficient but universal
    const end = Date.now() + ms;
    while (Date.now() < end) { /* spin */ }
  }
}

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
    yaml = require("js-yaml");
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

// Resolve a node ID to its file_scope from the manifest (gives fix agents a directory target)
function resolveNodeFile(nodeId) {
  try {
    const yaml = require("js-yaml");
    const manifest = yaml.load(fs.readFileSync(path.join(forgePlanDir, "manifest.yaml"), "utf-8"));
    if (manifest.nodes && manifest.nodes[nodeId] && manifest.nodes[nodeId].file_scope) {
      // Convert glob to directory: "src/api/**" → "src/api/"
      return manifest.nodes[nodeId].file_scope.replace(/\*\*.*$/, "").replace(/\*$/, "");
    }
  } catch {}
  return "";
}

/**
 * Parse a contract string like "GET /api/documents -> { documents: Document[] }"
 * Returns { method, path, expectedFields } or null if unparseable
 */
function parseContract(contract) {
  const match = contract.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s]*)\s*(?:->|→)\s*\{?\s*(.*?)\s*\}?\s*$/i);
  if (!match) return null;

  const method = match[1].toUpperCase();
  // Replace route params (:id, :slug, :userId) with test values so the URL is fetchable
  const urlPath = match[2].replace(/:(\w+)/g, (_, param) => {
    // Use sensible test values based on common param names
    if (/id$/i.test(param)) return "1";
    if (/slug/i.test(param)) return "test-slug";
    if (/email/i.test(param)) return "test@example.com";
    return "test";
  });
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

// Fetch with one retry on timeout (per design: "Retry once with 10s timeout. Still fails → finding.")
async function fetchWithRetry(url, opts = {}) {
  try {
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      // Retry once with same timeout
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(10000) });
    }
    throw err;
  }
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
  let createdTempEnv = false;
  const tempEnvPath = path.join(cwd, ".env.verify-tmp");
  if (!fs.existsSync(path.join(cwd, ".env")) && fs.existsSync(path.join(cwd, ".env.example"))) {
    try {
      // Use a temp file instead of creating .env permanently (side-effect free verification)
      fs.copyFileSync(path.join(cwd, ".env.example"), tempEnvPath);
      createdTempEnv = true;
      env.MOCK_MODE = "true";
      // Load temp env vars into the env object so the spawned process gets them
      const envContent = fs.readFileSync(tempEnvPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!env[key]) env[key] = val; // don't override existing env vars
        }
      }
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

  // Register cleanup BEFORE writing PID — so Ctrl+C during startup wait can kill the child
  const pidFile = path.join(forgePlanDir, ".verify-pids");
  const earlyCleanup = () => {
    killProcess(child.pid, isWindows);
    try { fs.unlinkSync(pidFile); } catch {}
  };
  process.on("SIGINT", () => { earlyCleanup(); process.exit(1); });
  process.on("SIGTERM", () => { earlyCleanup(); process.exit(1); });

  // Track PID for crash recovery
  try {
    fs.writeFileSync(pidFile, `${Date.now()}:${child.pid}\n`, "utf-8");
  } catch {}

  let serverOutput = "";

  // Two-phase ready detection:
  // Phase 1: Watch stdout/stderr for log patterns (fast, ~1-5s for most servers)
  // Phase 2: If no log match after 10s, try HTTP probe (catches silent/non-standard servers)
  const ready = await new Promise((resolve) => {
    let resolved = false;
    const done = (val) => { if (!resolved) { resolved = true; clearTimeout(logTimeout); clearTimeout(probeTimeout); resolve(val); } };

    // Server ready detection patterns. Must balance:
    // - Catch: "listening on :3000", "ready 3217", "started on port 3000", "http://localhost:3000"
    // - Reject: "Error: port 3000 in use", "ready for retry", "running migration failed"
    const readyPattern = new RegExp([
      /(?:listening|serving|started)\s+(?:on\s+)?(?:port\s+)?\d{2,5}/.source,  // "listening 3000", "started on port 3000"
      /(?:listening|ready|started|running)\s+(?:on|at)\s+\S*:\d+/.source,       // "listening on :3000", "running at 0.0.0.0:3000"
      /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/.source,            // "http://localhost:3000"
      /ready\s+\d{2,5}/.source,                                                  // "ready 3217"
    ].join("|"), "i");

    child.stdout.on("data", (data) => {
      serverOutput += data.toString();
      if (readyPattern.test(serverOutput)) done(true);
    });

    child.stderr.on("data", (data) => {
      serverOutput += data.toString();
      if (readyPattern.test(serverOutput)) done(true);
    });

    child.on("error", () => done(false));
    child.on("close", (code) => {
      if (code !== 0 && code !== null) done(false);
    });

    // Phase 2: After 10s with no log match, start HTTP probing
    // SAFETY: Only probe if child process is still alive (prevents false-positive
    // against a pre-existing server on the same port)
    const probePort = (techStack && techStack.dev_port) || 3000;
    let childExited = false;
    child.on("exit", () => { childExited = true; });

    const probeTimeout = setTimeout(async () => {
      for (let attempt = 0; attempt < 10 && !resolved; attempt++) {
        // If our child process already exited, don't probe — it's not our server
        if (childExited) { done(false); return; }
        try {
          await fetch(`http://localhost:${probePort}/`, { signal: AbortSignal.timeout(800) });
          // Double-check child is still alive before accepting probe result
          if (childExited) { done(false); return; }
          done(true);
          return;
        } catch {
          // Also try extracting port from server output
          const portMatch = serverOutput.match(/(?::|\bport\s+)(\d{4,5})\b/i);
          if (portMatch && portMatch[1] !== String(probePort)) {
            try {
              await fetch(`http://localhost:${portMatch[1]}/`, { signal: AbortSignal.timeout(800) });
              done(true);
              return;
            } catch {}
          }
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      done(false); // 20s total, no log match, no HTTP response
    }, 10000);

    // Hard timeout at 25s (safety net)
    const logTimeout = setTimeout(() => done(false), 25000);
  });

  if (!ready) {
    killProcess(child.pid, isWindows);
    // Clean up PID file on start failure (don't leave stale entry)
    try { fs.unlinkSync(pidFile); } catch {}
    // Clean up temp .env
    if (createdTempEnv) { try { fs.unlinkSync(tempEnvPath); } catch {} }
    const errorType = /EADDRINUSE|address already in use/i.test(serverOutput) ? "environment" : "code";
    return { error: `Server failed to start: ${serverOutput.substring(0, 300)}`, errorType };
  }

  return { child, serverOutput, isWindows, _cleanupTempEnv: createdTempEnv ? tempEnvPath : null };
}

function killProcess(pid, isWindows) {
  try {
    if (isWindows) {
      // Graceful first (no /F), then force after 5s
      try { execSync(`taskkill /T /PID ${pid}`, { stdio: "pipe", timeout: 5000 }); } catch {}
      sleepSync(5000);
      try { execSync(`taskkill /T /F /PID ${pid}`, { stdio: "pipe", timeout: 5000 }); } catch {}
    } else {
      // SIGTERM to process group, wait 5s, then SIGKILL
      try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); }
      sleepSync(5000);
      try { process.kill(-pid, "SIGKILL"); } catch {}
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
  } catch {}
}

// --- Test Levels ---

async function runLevel1(baseUrl, endpoints) {
  // Try GET / first — works for frontend apps and servers with a root route
  try {
    const res = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(10000) });
    if (res.ok || res.status === 302 || res.status === 301) {
      return { pass: true, detail: `GET / -> ${res.status}` };
    }
    // 401/403 on GET / means the server IS running but the root is protected — that's fine
    if (res.status === 401 || res.status === 403) {
      return { pass: true, detail: `GET / -> ${res.status} (protected root — server is responding)` };
    }
    // 5xx on GET / is a real server error — don't fall back, report failure
    if (res.status >= 500) {
      return { pass: false, detail: `GET / -> ${res.status} (server error)` };
    }
    // 4xx on GET / (404, 405, etc.) — server runs but root not served. Try a spec endpoint.
    if (res.status >= 400 && endpoints.length > 0) {
      const fallback = endpoints[0];
      const opts = { method: fallback.method, signal: AbortSignal.timeout(10000) };
      if (fallback.method !== "GET" && fallback.method !== "DELETE") {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify({});
      }
      const fallbackRes = await fetch(`${baseUrl}${fallback.path}`, opts);
      if (fallbackRes.status < 500) {
        return { pass: true, detail: `GET / -> 404 (API-only app), but ${fallback.method} ${fallback.path} -> ${fallbackRes.status} (server is responding)` };
      }
    }
    return { pass: false, detail: `GET / -> ${res.status} and no spec endpoints respond` };
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
      const res = await fetchWithRetry(`${baseUrl}${ep.path}`, opts);
      // Level 2 checks route existence, not correctness:
      // - 2xx/3xx = route works
      // - 401/403 = route exists, auth required (expected without token)
      // - 400/422 = route exists, validation rejected our empty/probe body (correct behavior for write endpoints)
      // - 404 = route NOT registered (fail for spec-defined endpoints)
      // - 5xx = server error (always fail)
      const pass = res.status < 500 && res.status !== 404;
      results.push({
        pass,
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
      const res = await fetchWithRetry(`${baseUrl}${ep.path}`);
      if (!res.ok) {
        // 401/403 = auth-protected endpoint, skip shape check (we can't get the body without auth)
        if (res.status === 401 || res.status === 403) {
          results.push({ pass: true, endpoint: `${ep.method} ${ep.path}`, node: ep.node, detail: `Skipped shape check — auth required (${res.status})` });
          continue;
        }
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
    // No-auth test — protected endpoints should return 401/403, not 200
    try {
      const opts = { method: ep.method, signal: AbortSignal.timeout(10000) };
      if (ep.method !== "GET" && ep.method !== "DELETE") {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify({});
      }
      const res = await fetchWithRetry(`${baseUrl}${ep.path}`, opts);
      // Level 4 auth boundary test — INFORMATIONAL, not hard pass/fail.
      // We can't distinguish public vs protected endpoints from spec contracts alone.
      // 401/403 = protected, 2xx = public (login, signup, health, webhooks are legitimately public),
      // 5xx = server error (always a real failure).
      const isProtected = res.status === 401 || res.status === 403;
      const isError = res.status >= 500;
      results.push({
        pass: !isError, // Only 5xx is a hard failure — public vs protected is informational
        endpoint: `${ep.method} ${ep.path}`,
        test: "no-auth",
        status: res.status,
        node: ep.node,
        // severity: MEDIUM for public endpoints (informational review item, not a confirmed bug)
        authStatus: isProtected ? "protected" : isError ? "error" : "public",
      });
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
      let serverErrors = 0;
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        const res = await fetch(`${baseUrl}${ep.path}`, { signal: AbortSignal.timeout(10000) });
        times.push(Date.now() - start);
        if (res.status >= 500) serverErrors++;
      }
      const avgFirst10 = times.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
      const avgLast10 = times.slice(-10).reduce((a, b) => a + b, 0) / 10;
      const degradation = avgLast10 / Math.max(avgFirst10, 1);
      // Fail if latency degrades >3x OR if any requests returned 500+
      results.push({ pass: degradation < 3 && serverErrors === 0, endpoint: `${ep.method} ${ep.path}`, test: "rapid-sequential-50", degradation: degradation.toFixed(1) + "x", serverErrors, node: ep.node });
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
    const yaml = require("js-yaml");
    const manifest = yaml.load(fs.readFileSync(path.join(forgePlanDir, "manifest.yaml"), "utf-8"));
    techStack = (manifest.project && manifest.project.tech_stack) || {};
  } catch {}

  const endpoints = loadEndpoints();
  const server = await startServer(techStack);

  if (server.error) {
    // Use the classified error type: "environment" for port/config issues, "code" for boot regressions
    const status = server.errorType === "environment" ? "environment_error" : "fail";
    const exitCode = server.errorType === "environment" ? 2 : 1;
    console.log(JSON.stringify({
      status,
      tier,
      message: server.error,
      errorType: server.errorType,
      level_reached: 0,
      endpoints_tested: 0,
      endpoints_passed: 0,
      findings: status === "fail" ? [{
        node: "app-shell",
        category: "runtime-verification",
        severity: "HIGH",
        confidence: 95,
        description: `Server failed to start: ${server.error.substring(0, 200)}`,
        file: resolveNodeFile("app-shell"),
        line: "",
        fix: "Fix the startup error — check server entry point and dependencies",
      }] : [],
    }, null, 2));
    process.exit(exitCode);
  }

  const baseUrl = detectBaseUrl(server.serverOutput, techStack);
  const findings = [];
  let levelReached = 0;
  let endpointsTested = 0;
  let endpointsPassed = 0;

  const runtimePidFile = path.join(forgePlanDir, ".verify-pids");
  const cleanup = () => {
    killProcess(server.child.pid, server.isWindows);
    try { fs.unlinkSync(runtimePidFile); } catch {}
    // Clean up temp .env created by startServer
    if (server._cleanupTempEnv) { try { fs.unlinkSync(server._cleanupTempEnv); } catch {} }
  };
  process.on("SIGINT", () => { cleanup(); process.exit(1); });
  process.on("SIGTERM", () => { cleanup(); process.exit(1); });

  try {
    // Level 1
    const l1 = await runLevel1(baseUrl, endpoints);
    levelReached = 1;
    endpointsTested++;
    if (l1.pass) { endpointsPassed++; }
    else {
      findings.push({ node: "app-shell", category: "runtime-verification", severity: "HIGH", confidence: 95,
        description: `Server does not respond to GET /: ${l1.detail}`, file: resolveNodeFile("app-shell"), line: "",
        fix: "Ensure the server binds to a port and handles GET / requests" });
    }

    // Warn if no endpoint contracts found — Phase B has limited value without them
    if (endpoints.length === 0) {
      findings.push({ node: "project", category: "runtime-verification", severity: "LOW", confidence: 70,
        description: "No API endpoint contracts found in node specs. Phase B could only verify server starts. Add interface contracts (e.g., 'GET /api/users -> { users: User[] }') to node specs for meaningful endpoint testing.",
        file: resolveNodeFile("project"), line: "", fix: "Add contract fields to interface definitions in .forgeplan/specs/" });
    }

    // Levels 2-3 for MEDIUM+
    if (endpoints.length > 0) {
      const l2 = await runLevel2(baseUrl, endpoints);
      levelReached = 2;
      for (const r of l2) {
        endpointsTested++;
        if (r.pass) { endpointsPassed++; }
        else { findings.push({ node: r.node, category: "runtime-verification", severity: "HIGH", confidence: 90,
          description: `${r.endpoint} returns ${r.status} (server error)`, file: resolveNodeFile(r ? r.node : "app-shell"), line: "",
          fix: `Fix the handler for ${r.endpoint} — it should not return 5xx` }); }
      }

      const l3 = await runLevel3(baseUrl, endpoints);
      levelReached = 3;
      for (const r of l3) {
        endpointsTested++;
        if (r.pass) { endpointsPassed++; }
        else {
          const desc = (r.missingFields && r.missingFields.length > 0)
            ? `${r.endpoint} response missing fields: ${r.missingFields.join(", ")}`
            : `${r.endpoint} response invalid: ${r.detail || "non-JSON or error"}`;
          const fix = (r.missingFields && r.missingFields.length > 0)
            ? `Add missing fields to the response: ${r.missingFields.join(", ")}`
            : `Ensure endpoint returns valid JSON with expected fields`;
          findings.push({ node: r.node, category: "runtime-verification", severity: "MEDIUM", confidence: 85,
            description: desc, file: resolveNodeFile(r ? r.node : "app-shell"), line: "", fix });
        }
      }
    }

    // Levels 4-5 for LARGE only
    if (tier === "LARGE" && endpoints.length > 0) {
      const l4 = await runLevel4(baseUrl, endpoints);
      levelReached = 4;
      for (const r of l4) {
        endpointsTested++;
        if (r.pass) {
          endpointsPassed++;
          // Report public endpoints as informational findings (not failures)
          if (r.test === "no-auth" && r.authStatus === "public") {
            findings.push({ node: r.node, category: "runtime-verification", severity: "LOW",
              confidence: 60, description: `${r.endpoint} is publicly accessible without auth — verify this is intentional`,
              file: resolveNodeFile(r ? r.node : "app-shell"), line: "", fix: "If this endpoint should require auth, add auth middleware. If it's intentionally public (login, signup, health), no action needed." });
          }
        }
        else { findings.push({ node: r.node, category: "runtime-verification",
          severity: r.test === "malformed-input" ? "HIGH" : "MEDIUM",
          confidence: 85, description: `${r.endpoint} ${r.test}: ${r.detail || `status ${r.status}`}`, file: resolveNodeFile(r ? r.node : "app-shell"), line: "",
          fix: r.test === "malformed-input" ? "Add input validation — malformed requests should return 400, not 500"
            : `Server error on ${r.endpoint}` }); }
      }

      const l5 = await runLevel5(baseUrl, endpoints);
      levelReached = 5;
      for (const r of l5) {
        endpointsTested++;
        if (r.pass) { endpointsPassed++; }
        else { findings.push({ node: r.node, category: "runtime-verification",
          severity: r.test.startsWith("injection") ? "HIGH" : "MEDIUM", confidence: 80,
          description: `${r.endpoint} ${r.test}: ${r.detail || "failed"}`, file: resolveNodeFile(r ? r.node : "app-shell"), line: "",
          fix: r.test.startsWith("injection") ? "Sanitize inputs — injection payloads should return 400, not 500"
            : r.test.includes("concurrent") ? "Fix concurrency handling — server returns 500 under parallel requests"
            : "Investigate response time degradation under load" }); }
      }
    }
  } finally {
    cleanup();
  }

  // Only HIGH or MEDIUM findings cause a "fail" status.
  // LOW/informational findings (e.g., "public endpoint — verify intentional") are advisories, not failures.
  const actionableFindings = findings.filter(f => f.severity === "HIGH" || f.severity === "MEDIUM");
  const status = actionableFindings.length === 0 ? "pass" : "fail";
  console.log(JSON.stringify({ status, tier, level_reached: levelReached, endpoints_tested: endpointsTested,
    endpoints_passed: endpointsPassed, findings }, null, 2));
  process.exit(status === "pass" ? 0 : 1);
}

main().catch((err) => {
  console.error(`runtime-verify failed: ${err.message}`);
  process.exit(2);
});
