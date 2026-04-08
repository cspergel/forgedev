# ForgePlan Core — Development Context

## What This Project Is

ForgePlan Core is a Claude Code plugin that serves as an architecture-governed AI build harness. The `.forgeplan/` directory is the product. Claude Code is the first interface. The plugin is how developers interact with it.

## Canonical Reference Documents

**ALWAYS reference these before making architectural decisions:**
- `Planning Documents/ForgePlan_Core_Execution_Plan.md` — The build plan. Sprint-by-sprint deliverables, schemas, enforcement model, agent specs.
- `Planning Documents/ForgePlan_Concept_v4.1.md` — The vision document. Long-term product direction (Sections 1-16, 18-23). Section 17 is superseded by the Execution Plan.

**The Execution Plan is the authority for Sprints 1-6 implementation details.** For Sprint 7+ roadmap, **this CLAUDE.md file is the living authority** — it reflects dogfood feedback, code reviews, and product decisions made during development that the Execution Plan predates. The Concept Doc is the authority for product vision.

## Project Structure

```
ForgeDev/                              # Repo root IS the plugin root
├── .claude-plugin/
│   ├── plugin.json                    # Plugin manifest
│   └── marketplace.json               # Marketplace definition
├── CLAUDE.md                          # This file — dev context
├── Planning Documents/                # Vision + execution plans
├── commands/                          # Slash commands (.md files)
├── agents/                            # architect, builder, reviewer, sweep-*
├── hooks/
│   └── hooks.json                     # SessionStart, PreCompact, PostCompact, PreToolUse, PostToolUse, Stop
├── scripts/                           # validate-manifest, cross-model-review, etc.
├── templates/                         # Blueprint templates, schema templates
│   ├── blueprints/                    # Client portal, SaaS starter, etc.
│   └── schemas/                       # Schema templates
├── skills/                            # Plugin skills
└── docs/
    └── plans/                         # Implementation plans
```

## Sprint Status

### Sprint 1: Foundation (COMPLETE)
**Goal:** User can run `/forgeplan:discover` and produce a validated manifest with shared models. **DONE.**

### Sprint 2: Build Harness (COMPLETE)
**Goal:** A user can spec and build a single node with hook enforcement. **DONE.**

Hardened through 14 cross-model review rounds (Claude + Codex). Key hardening:
- Fail-closed enforcement (corrupted state/manifest blocks operations)
- Whitelist-based Bash gate (blocks all non-read commands during active operations)
- Per-operation write boundaries (build, review, revise each have distinct allowed paths)
- Pre-build file snapshot for safe reset classification
- Spec validator with manifest cross-checking and strict field shapes
- Revision→rebuild pipeline wired into /forgeplan:next

### Sprint 3: Review and Recovery (COMPLETE)
**Goal:** The build-review loop works end to end. Crashes are recoverable. **DONE.**

Most deliverables were implemented during Sprint 1/2 hardening (review, revise, recover, session-start, conversation logging). Sprint 3 added the Stop hook — the last enforcement gate. All 7 deliverables verified against plan.

### Sprint 4: Integration and BYOK (COMPLETE)
**Goal:** Multi-node projects complete the full lifecycle. Cross-model review works. **DONE.**

Deliverables: cross-model-review.js (MCP/CLI/API modes, 3 providers, env var resolution, fetch-based), BYOK config with strict/advisory modes, integrate-check.js with fault-side ID, status-report.js with dependency graph, SaaS starter + internal dashboard blueprints, README.

### Sprint 5: Dogfood and Ship (COMPLETE)
**Goal:** Prove the four things. Run the change propagation test. **DONE.**

Dogfood results on client portal (7 nodes, 61+ files):
- Quality metrics: 0 broken references, 0 duplicate types, 0 abandoned stubs
- Integration: 16 pass, 2 expected warnings, 0 failures
- Change propagation: Added phone to User → 6 nodes cascaded → 0 breakage
- All 49 acceptance criteria verified across 7 nodes
- 15 commands all working end-to-end

### Sprint 6: Autonomous Iterative Sweep (COMPLETE)
**Goal:** Cross-model alternating sweep with `/forgeplan:sweep` and `/forgeplan:deep-build`. **DONE.**

Original deliverables: sweep_state schema, "sweeping" status across all hooks/scripts, sweep agent definitions, /forgeplan:sweep (7-phase orchestration), /forgeplan:deep-build (6-phase autonomous pipeline), cross-model-bridge.js (MCP/CLI/API modes), sweep crash recovery, sweep-mode enforcement, Layer 2 sweeping bypass.

Sprint 6 hardening (same sprint, post-initial):
- 12 sweep agents (was 6): added code-quality, test-quality, config-environment, frontend-ux, documentation, cross-node-integration (opus)
- Progressive agent convergence: agents that return CLEAN twice are retired, cross-cutting agents re-run if any agent has findings
- Anti-oscillation guard: force-converge agents stuck for 3 passes
- /forgeplan:configure: automated cross-model setup wizard (Codex/Gemini MCP/CLI/API)
- Graceful fallback on cross-model failure (continues with Claude-only)
- Smart blocked-finding resolution: Category A (spec update, auto), B (shared extraction, auto), C (architecture decisions, persist and prompt)
- Blocked decisions persistence across sessions (state.json → session-start detection → resume)
- Plugin restructured for marketplace distribution (repo root = plugin root)
- SSH keys + Codex MCP end-to-end working
- Escape hatch for corrupted state.json deadlock
- Atomic state writes (write tmp, rename)
- False certification fix (bridge error no longer masks as "clean")
- 15+ adversarial analysis fixes (cycle detection, token budget, path normalization, etc.)
- Outside-project-path writes allowed (other plugins not blocked)
- Dogfooded on client-portal: 60 findings, 53 auto-fixed, cross-model certified

### Sprint 7A: Complexity Calibration (COMPLETE)
**Goal:** Scale the process to the project. Make ForgePlan usable for small projects (not just enterprise). The tier system is the foundation — everything else builds on it. **DONE.**

Deliverables: complexity_tier field in manifest schema + validation, tier-conditional architect agent (SMALL/MEDIUM/LARGE decomposition rules), tier-aware commands (discover, spec, build, review, sweep, deep-build, guide), tier-aware agents (builder, reviewer), verify-runnable.js (stack-adaptive verification gate with PID safety + error classification), config-schema tier_override, 3 blueprint templates updated to new tech_stack format, expanded node types (cli, library, extension, worker, pipeline), orphan check exemption for SMALL tier. 12-agent review passed with all findings resolved.

**Pillar 1: Complexity Calibration (P0 — from dogfood feedback)**
- **The problem:** Full governance on a 3-page app took 10 hours. A single Claude prompt would take 30 minutes. ForgePlan must know when to get out of the way.
- First implementation task: add `complexity_tier` field to manifest schema. Everything reads from it.
- **Complexity is not just size — it's multi-dimensional.** The Architect assesses during discovery based on judgment across these dimensions:

  **Technical complexity:**
  - Auth: none → basic login → OAuth/SSO → multi-tenant with RBAC
  - Data: flat CRUD → relational with joins → real-time sync → event sourcing
  - Integrations: none → 1-2 APIs → payment/billing → multi-provider orchestration
  - Infrastructure: static site → single server → microservices → distributed

  **Domain complexity:**
  - Business rules: simple CRUD → validation logic → state machines → regulatory compliance
  - User flows: linear → branching → concurrent → collaborative real-time
  - Data sensitivity: public → user data → PII/financial → healthcare/legal

  **Scale complexity:**
  - Users: personal tool → small team → multi-tenant → enterprise/public
  - Data volume: trivial → needs indexing → needs caching → needs sharding

- **Not all dimensions apply to every project type.** CLI tools, libraries, data pipelines, and non-web applications may have few applicable dimensions — score only what's relevant. Skip dimensions that don't apply rather than forcing every project into a web-app framework.
- **The tier is the Architect's judgment call, not a formula.** A 3-entity project with HIPAA compliance and payment processing is LARGE. A 20-entity CRUD admin panel is MEDIUM. Entity count is a signal, not the answer.
- After assessment, the Architect presents its reasoning AND the pipeline consequences: "I'd rate this MEDIUM, which means: 3-5 nodes, full specs per node, 4 sweep agents, cross-model optional. If that feels heavy, SMALL would mean: 1-2 nodes, quick specs, 3 agents. Which fits?"
- User can always override.
- **Tier upgrade/downgrade:** If the project changes mid-build (user adds OAuth, payments, new integrations), `/forgeplan:revise` should prompt: "This changes the project complexity. Current tier: SMALL. Reassess?" The `tier_override` field in config.yaml takes effect at the next command invocation. No need to re-run discovery — just update the manifest's `complexity_tier` and the pipeline adapts.

- **What each tier means for the pipeline:**
  ```
  SMALL (simple CRUD, basic/no auth, no third-party integrations):
    Governance: lite — still architecture-down, just compressed.
    → Quick walkthrough: "Here's what I understood. Correct?" (one confirmation)
    → 1-2 coarse nodes (one broad-scope node with file_scope: "src/**")
    → Full-quality specs (ACs, non-goals, tests) but quick conversation —
      Architect drafts, user confirms, no multi-turn refinement
    → Single-pass build — builder generates all code in one session,
      including scaffolding
    → 3 sweep agents: Red (adversarial) + Orange (contract) + White (compliance)
    → No cross-model unless requested
    → Output: working, runnable app in one session

  MEDIUM (auth flows, 1-2 integrations, business rules, role-based access):
    Governance: full specs, moderate process.
    → Section-level walkthrough (scope, non-goals, models, nodes)
    → 3-5 nodes with sensible boundaries
    → Full spec conversation per node — detailed ACs, tests, failure modes
    → Sequential build with review after each
    → 4 sweep agents: Red + Orange + Blue (experience) + White
    → Cross-model optional
    → Output: well-structured app with enforcement

  LARGE (multi-tenant, payments, state machines, compliance, multi-team):
    Governance: full pipeline — this is what ForgePlan was designed for.
    → Per-feature walkthrough during discovery
    → Fine-grained nodes with strict boundaries
    → Full spec conversation with pre-build spec challenge
    → 5 sweep agents (all opus), progressive convergence
    → Cross-model verification (Codex/GPT/Gemini)
    → Deep-build with convergence certification
    → Output: certified, sweep-verified codebase
  ```

  **Key principle:** Spec quality is the same at every tier. What scales is node granularity, verification intensity, and walkthrough depth. The architecture-down approach never disappears — it just gets compressed for simpler projects.
- **Architect agent update (CRITICAL):** Replace absolute decomposition rules ("NEVER collapse auth/API/database") with tier-conditional rules. SMALL tier explicitly allows and encourages coarse nodes. LARGE tier keeps current rules. Test against all three tiers.
- **Deep-build adapts to tier:** SMALL = single-pass build, lightweight audit, no cross-model. MEDIUM = current pipeline with fewer agents. LARGE = full pipeline.

**Tier-independent improvements (also P0):**
- **Deduplication before presentation:** Semantic dedup in sweep Phase 3, not just file+line matching. Target: < 20% duplication rate (was 62%).
- **Test co-update during rebuild:** Builder MUST update corresponding test files when modifying source. Don't create problems for the sweep to find.
- **Verification pipeline — two phases, environment-resilient:**

  **Phase A: "Make it runnable" gate (Sprint 7A) — `scripts/verify-runnable.js`**
  Quick gate: does it compile, do tests pass, does it start?
  - Reads `tech_stack` from manifest (not hardcoded to Node/TypeScript)
  - Runs after build (before review) and again at final certification
  - **Stack-adaptive steps:**
    - Step 1 — Install deps: `npm install` / `deno cache` / `bun install` (from `tech_stack.runtime`)
    - Step 2 — Type check: `npx tsc --noEmit` (TypeScript only, skip for JS)
    - Step 3 — Run tests: `npm test` / `deno test` / `bun test` / custom from `tech_stack.test_command`
    - Step 4 — Dev server check: start server, verify port binds, kill after check. Skip for libraries/CLIs.
  - **Environment cleanup before EVERY verification run:**
    - **Process safety:** ONLY kill PIDs that verify-runnable itself started (tracked in `.forgeplan/.verify-pids`). Never kill by process name alone (never `taskkill /IM node.exe` or `killall node`).
    - **Port conflict handling:** Before killing a process on the target port, check if its cwd is within the project directory. If it IS within the project: safe to kill (it's ours). If it is NOT within the project: do NOT kill — report "Port N in use by external process" and try an alternate port or halt with a clear message.
    - **Graceful shutdown:** Use SIGTERM first, wait 5 seconds, then SIGKILL only if the process is still running. On Windows: `taskkill /PID [pid]` (graceful), wait 5s, then `taskkill /F /PID [pid]` if needed. Never use `/IM` flag.
    - **PID tracking:** verify-runnable.js writes all spawned PIDs to `.forgeplan/.verify-pids` on start, removes them on clean exit. Cleanup reads this file, kills only listed PIDs, then deletes the file.
    - Clear any lock files (`package-lock.json.tmp`, `.tsbuildinfo`, etc.)
    - Verify required tools are available (`node --version`, `npm --version`, etc.) — if missing, report clearly instead of cryptic errors
    - Set a timeout on every command (30s for install, 10s for type check, 60s for tests, 15s for server start) — kill and report if exceeded
  - **Error classification:** Distinguish between:
    - **Code errors** (syntax, type, test failures) → become findings for fix agents
    - **Environment errors** (port in use, missing tool, permission denied, network timeout) → attempt auto-fix (kill process, retry with different port, suggest tool install), do NOT create code findings
    - **Transient errors** (npm registry timeout, DNS failure) → retry with backoff, do NOT treat as code bugs
  - Gate: 3 retry attempts for code errors. Environment errors get auto-fixed then retried. Transient errors get 3 retries with backoff. If still failing, halt with classified error.

  **Phase B: Runtime verification agent (Sprint 8) — behavioral testing**
  Does the app actually WORK, not just start?
  - New agent (not a sweep agent — this executes code, not reads it)
  - Runs as a deep-build phase: after sweep, before cross-model
  - **What it does:**
    1. Start the app (with environment cleanup from Phase A)
    2. Read manifest interfaces and node specs
    3. For each API endpoint: construct request from spec contract, send via curl/fetch, verify response status + shape
    4. For each acceptance criterion with testable behavior: verify at runtime
    5. For auth boundaries: attempt cross-role access (client→accountant routes should fail)
    6. Report: which behaviors work, which don't, with actual HTTP responses as evidence
    7. Kill the app cleanly after verification
  - **Environment resilience for runtime verification:**
    - If the app fails to start: classify why (missing env vars → create .env from .env.example, port conflict → find free port, missing dependency → npm install)
    - If an endpoint times out: distinguish between "endpoint is slow" and "endpoint is broken" (retry once with longer timeout)
    - If database is required but not available: detect mock mode, use it. If no mock mode, skip database-dependent tests with a warning, don't fail the whole verification
    - Track all environment fixes applied — report them separately from code issues so the user knows what was environment vs code
  - **Tier-aware depth:**
    ```
    SMALL:  Phase A only (compile + tests + server starts)
    MEDIUM: Phase A + Phase B Levels 1-3 (+ hit endpoints, verify responses)
    LARGE:  Phase A + Phase B Levels 1-4 (+ stress: concurrent requests, malformed inputs, auth boundaries)
    ```

- **Tests along the way, not just at the end:** The builder runs tests for each node DURING the build. The Stop hook checks test results as part of AC verification. The sweep fix cycle re-runs affected tests after each fix. Phase A and B are the final gates, but testing happens continuously.

**Files that need changes for Sprint 7A (~15):**
- `templates/schemas/manifest-schema.yaml` — add `complexity_tier` field
- `templates/schemas/config-schema.yaml` — add `tier_override` option
- `agents/architect.md` — tier-conditional decomposition rules (CRITICAL — the hardest change)
- `commands/discover.md` — complexity assessment, tier-aware node recommendations, tier-aware walkthrough
- `commands/spec.md` — SMALL-tier auto-generate branch
- `commands/build.md` — SMALL-tier single-pass mode
- `commands/sweep.md` — tier-aware agent selection (3 / 6-8 / 12)
- `commands/deep-build.md` — tier-aware pipeline (skip cross-model for SMALL)
- `agents/builder.md` — tier-awareness, test co-updates
- `agents/reviewer.md` — tier-aware abbreviated review for SMALL
- `commands/guide.md` — tier-aware descriptions (don't hardcode "12 agents")
- `commands/review.md` — tier-aware review depth for SMALL
- `scripts/verify-runnable.js` — NEW: stack-adaptive compilation + test execution + dev server check with environment cleanup
- `commands/deep-build.md` — add verify-runnable phase after build, tier-aware cross-model, runtime verification phase
- `scripts/pre-tool-use.js` — whitelist verify-runnable.js, deno, bun in Bash safe patterns
- `scripts/validate-manifest.js` — validate complexity_tier field

**Edge cases and implementation notes (from 50-case adversarial review):**
*Note: These cover Sprints 7A, 7B, 8, and 9. They are grouped by topic, not by sprint, because edge cases often span multiple sprints.*

VERIFICATION PIPELINE:
- If project has no tests: detect before running test suite. Check for test files matching runner glob. If none exist, create a single finding "no tests written" — don't burn 3 retries on empty test suite.
- postinstall failures: classify as environment error, suggest pure-JS alternatives (bcrypt→bcryptjs, sharp→@napi-rs/image).
- Dev server port detection: priority chain — tech_stack.dev_port → PORT in .env → framework detection (scan for vite.config/next.config/app.listen) → fallback 3000. Use ACTUAL reported port from stdout, not expected.
- tsc passes but runtime types unsafe: scan for `as any`, `@ts-ignore`, untyped JSON.parse. Report as warnings, forward to sweep-orange (type consistency).
- Tests pass individually but fail together: run twice — parallel then serial. If serial passes, classify as "shared state" finding.
- Docker dependencies: add optional `tech_stack.infrastructure` field. Before tests, check if required services are running. If Docker unavailable, classify as environment error.
- Local vs CI differences: record tool versions in deep-build report. Check package.json engines constraint.
- Monorepo: detect workspaces/pnpm/turbo before install. Run install at root, tests per workspace. Add optional manifest `tech_stack.monorepo` field.
- Process safety: ONLY kill PIDs tracked in .forgeplan/.verify-pids. Never kill by name. Check cwd before killing port processes. SIGTERM→wait 5s→SIGKILL.

TIER SYSTEM:
- Node splitting is the missing primitive for tier upgrades. Sprint 9 scope: /forgeplan:split [node-id] decomposes a node into finer-grained nodes while preserving code and state.
- SMALL app-shell: merge into primary node. Don't create a separate app-shell node for SMALL — the single coarse node handles both code and scaffolding.
- Broad file_scope (src/**) degrades Layer 1 enforcement to a rubber stamp. Accept as SMALL tradeoff — Layer 2 (LLM spec compliance) becomes primary guard. Add post-build file count warning if >20 files from one node.
- Tier misclassification detection: if sweep produces >15 findings per node, surface advisory: "High finding density suggests more decomposition needed."
- Non-web projects (CLI, extensions, libraries): expand valid node types beyond service/frontend/database/storage/integration. Add extension, plugin, cli, worker, library, pipeline.
- User tier override guardrail: if override conflicts with assessed tier, warn with consequence list. Don't silently accept.

GREENFIELD PIPELINE:
- Minimum viable input: autonomous discover requires at least a domain/purpose AND one user action. "Build me an app" halts with structured prompt, not a guess.
- Large documents (50+ pages): DON'T summarize — generate a guide/index file (Karpathy wiki pattern). Map document sections to architecture concepts: "Pages 1-3: Overview → manifest.project. Pages 4-8: Auth → auth node spec." Break into topic chunks. Architect reads index first, drills into sections on demand. Raw doc stays as immutable source. Save index as `.forgeplan/wiki/discovery-index.md`. Chunked PDF reading for >20 pages (Read tool limit). Shared infrastructure with Sprint 9 semantic memory.
- npm install failures in Builder: add retry logic in builder.md, not just verify-runnable. Network detection (npm ping) before starting pipeline.
- Hallucinated package names: after npm install, verify package resolved (check node_modules/[pkg]/package.json). If 404, search npm for correct name.
- Conflicting routes: add route collision detection to integrate-check.js. Maintain route registry in manifest.
- Autonomous mock mode: when discover runs --autonomous, DEFAULT to mock mode for all external service dependencies. Copy .env.example to .env with MOCK_MODE=true before first build.
- Stop hook bounce exhaustion: deep-build marks node as "built with warnings" after 3 bounces, adds unmet ACs to sweep findings, continues pipeline.
- Tech stack confirmation in autonomous mode: even for SMALL, a 5-second "I'll use React, Express, Supabase, TypeScript. OK?" is worth it. Don't build the wrong stack silently.
- Git safety: if .git exists with non-ForgePlan history, warn. Only stage ForgePlan artifacts in the initial commit, not arbitrary existing files.

DOCUMENT IMPORT:
- Contradiction detection: after extraction, scan for mutually exclusive requirements. Present both sides with explanation, require resolution before proceeding.
- Existing project guard: if src/ has files or .forgeplan/ exists, enter re-architecture mode or warn. Don't scaffold over existing code.
- Completeness checklist: after extraction, run domain-specific checklist (does this need auth? payments? PII handling?). Flag missing topics.
- Multi-phase documents: extract all phases, ask user which to architect now. Later phases become non-goals.
- Multiple documents: support multiple --from args. Classify by type (requirements > decisions > chat > reference). Merge with provenance tracking.
- Formal REQ IDs: preserve as source_ref on acceptance criteria. Show coverage matrix.
- PDF diagrams: attempt structural extraction, cross-reference with text. Flag low-confidence extractions.
- Non-English: extract in source language, generate all ForgePlan artifacts in English.

SWEEP AND CROSS-MODEL:
- Fix agent verification step: before applying any fix, confirm the finding exists in the code. If not found, mark as false-positive, don't modify code.
- Stale file references: before dispatching fix agent, validate referenced files still exist. If deleted by prior fix, mark as resolved-by-deletion.
- Conflicting recommendations: detect findings touching same file with opposing intent. Flag as Category C (architectural decision).
- Finding identity tracking: track file+description hash across passes, not just count. If >50% net-new findings for 3 passes, fixes are introducing regressions.
- Cross-model provider down: add "certify without cross-model" recovery option. For LARGE tier, allow with explicit user approval + report warning.
- Category/severity normalization: map aliases (security→auth-security, high→HIGH) in extractFindings.
- 20+ blocked decisions: group by severity (HIGH first), then by node. Add "accept all HIGH" shorthand.
- High finding density as tier signal: >15 findings/node on SMALL suggests wrong tier. Surface advisory.

### Sprint 7B: Ambient Mode + Confidence Scoring (COMPLETE)
**Goal:** Ambient guidance for returning users. Confidence scoring to reduce sweep noise. Document import for the "I brainstormed elsewhere" workflow. **DONE.**

Deliverables: Ambient SessionStart (healthy-state display, contextual next-command, tier display, sweep progress), Confidence Scoring (0-100 per finding across all 12 sweep agents, calibration guidance, <75 filtered in Phase 3, fallback regex for backward compat), Document Import (--from argument in discover, architect document-extraction mode with 8-step process, contradiction detection, completeness checklist, large doc wiki indexing, formal REQ ID preservation, non-English support).

**Pillar 1: Ambient SessionStart**
- Enhance session-start.js to detect full project state (not just stuck builds)
- For healthy projects: show one-line status summary + suggested next command
- Show: node statuses, next recommended action, pending decisions, sweep progress
- Suggest commands contextually ("auth is built but not reviewed → /forgeplan:review auth")
- Non-blocking: fast checks sync, expensive analysis async

**Pillar 2: Confidence Scoring**
- Each sweep finding must include `confidence: 0-100` based on code evidence strength
- Filter findings below 75 before entering fix cycle
- Calibration guidance in each agent: what makes a finding 50 vs 90
- Reduces convergence from ~14 rounds to 3-4 by eliminating noise early
- Cross-model findings scored by Claude after receipt (external model doesn't know the system)

**Pillar 3: Document Import & Conversational Discovery (P0 — essential, not stretch)**
- **Document import is critical.** Many users brainstorm with ChatGPT/Gemini/etc. for hours, then want to bring that plan into ForgePlan. This must work in Sprint 7B.
- Three onboarding paths: greenfield conversation (Path A), document import (Path B), template (Path C)
- `--from` argument for importing markdown, text, PDF files
- Chat exports treated as plain text (best effort — formats change too often)
- **Extraction prompt spec:** The architect agent in document-extraction mode must:
  1. Read the entire document
  2. Extract: project name, user roles, core features, data entities, tech preferences, integrations, constraints
  3. Identify what's clear vs what's ambiguous
  4. For clear items: propose architecture directly
  5. For ambiguous items: ask targeted questions (not re-brainstorm the whole thing)
  6. Present the extracted architecture with tier-appropriate walkthrough (SMALL = one confirmation, MEDIUM = section-level, LARGE = per-feature)
- Walkthrough granularity is tier-dependent
- For autonomous deep-build: walkthrough replaced by automatic validation (proceed if no ambiguities, halt only on critical unclear items)
- Philosophy: **architecture down, not code up.**

**Files that need changes for Sprint 7B (~15):**
- `agents/sweep-*.md` (12 files) — add confidence score output
- `scripts/session-start.js` — full state detection, status summary
- `templates/schemas/state-schema.json` — add confidence to finding schema
- `commands/discover.md` — `--from` argument, document extraction mode
- `agents/architect.md` — document-extraction mode (extract from existing text vs brainstorm)

**Sprint 7B Hardening (post-review fixes):**
- Per-node specificity in session-start.js suggestions (e.g., "/forgeplan:review auth" not generic)
- Per-node status breakdown in ambient display
- Agent convergence display in sweep progress
- Claude re-scoring of cross-model confidence scores in sweep Phase 6
- Pre-fix validation guards (confirm finding exists, validate file exists before fix)
- Cross-node-integration regex fix (Counter-File:, Node: [id] -> [id] format)
- Windows taskkill + SIGKILL fallback in verify-runnable.js
- Chat export plain-text guidance, multi-phase document handling, existing project guard
- Deep-build agent_convergence initialization
- Cross-node Node field normalization in sweep Phase 3

**Sprint 7B+ Infrastructure (competitive gap closures):**

**PreCompact/PostCompact Hooks (context compaction protection):**
- `scripts/compact-context.js` — saves/restores critical context across compaction
- PreCompact: writes project name, tier, node file_scopes, active node, sweep state, enforcement rules to `.forgeplan/.compact-context.md`
- PostCompact: re-injects the summary to stderr so Claude regains awareness
- Added to `hooks/hooks.json` as PreCompact and PostCompact entries
- Critical for long deep-build sessions that hit context limits

**Worktree-Based Parallel Sweep Fixes:**
- `scripts/worktree-manager.js` — create/merge/cleanup/list git worktrees
- Sweep Phase 4 now supports parallel fix mode: when 3+ nodes need fixes with non-overlapping file_scopes, fix agents run in isolated worktrees simultaneously
- Worktrees created per-node, merged back sequentially, conflicts fall back to sequential fix
- Cleanup in sweep Phase 7 finalization and deep-build error handling
- Whitelisted in pre-tool-use.js Bash safe patterns

**Deferred to later sprints:**
- State Management Hardening (update-state.js, parallel agents, active_node as array) → Sprint 9
- Hierarchical Documentation (agent refactoring to < 300 lines) → anytime, maintenance task
- Two-Stage Review (spec compliance then code quality) → Sprint 9
- Guide Skill Enhancement (pattern detection from past sweeps) → Sprint 9
- Cross-harness support (Codex CLI, Gemini CLI, Cursor) → post-Sprint 8, driven by external user feedback

### Sprint 8: Research Agents + Greenfield Pipeline (COMPLETE)
**Goal:** Research agents search for best practices before building. Greenfield deep-build from discovery to certified. Phase B runtime verification. **DONE.**

Deliverables: 2 research agents (researcher, docs-agent) dispatched in parallel by `/forgeplan:research`, `/forgeplan:greenfield` thin orchestrator (discover→research→spec→deep-build with one confirmation), `--autonomous` flags on discover and spec, `scripts/runtime-verify.js` Phase B endpoint verification (Levels 1-5 tier-aware: status codes, response shapes, auth boundaries, stress testing), deep-build Phase 4.5 wiring, builder+architect research awareness, manifest tech_stack.infrastructure field. (Originally 4 agents — license-checker and inspiration consolidated into researcher post-Sprint 9.)

**Pillar 1: Research Agents**
- `/forgeplan:research [topic]` dispatches 2 agents in parallel: Researcher (packages + licenses + reference projects + patterns), Docs Agent (API documentation extraction)
- Researcher uses query expansion, angle diversity (technical, security, community, contrarian), multi-signal quality scoring, and gap detection
- Check licenses (MIT/Apache/etc.), download counts, maintenance status — all in one agent pass
- Find reference implementations for architecture inspiration (not copying)
- Output: recommended dependencies, license report, proven patterns, architecture constraints, research gaps
- Results stored in `.forgeplan/research/` and fed into Architect during discovery
- Optional Firecrawl MCP integration for better web scraping (recommended for MEDIUM/LARGE)

**Pillar 2: Autonomous Greenfield Pipeline**
- The full chain: discover → research → spec all → deep-build (build → verify-runnable → review → sweep → cross-model) → certified
- **Concrete implementation:** New `--greenfield` flag on deep-build (or a new `/forgeplan:greenfield` command) that chains the full pipeline:
  1. Run `/forgeplan:discover` in autonomous mode: Architect reads user input (description or `--from` document), assesses complexity tier, proposes architecture, auto-confirms if unambiguous (halts only if critical ambiguity detected — e.g., "you mentioned both REST and GraphQL, which one?")
  2. Run `/forgeplan:research` on the tech stack and key patterns (if research agents are available)
  3. Run `/forgeplan:spec --all` in autonomous mode (generate specs from manifest + research findings)
  4. Run `/forgeplan:deep-build` which handles the rest:
     - Build all nodes (per tier: SMALL = single-pass, MEDIUM = sequential, LARGE = full pipeline)
     - Run verify-runnable gate AFTER build, BEFORE review (catches broken code early)
     - Review all nodes
     - Integration check
     - Sweep (tier-aware agent count)
     - Cross-model verification (tier-aware: SMALL = skip unless requested, MEDIUM = optional, LARGE = required)
     - Final verify-runnable gate (confirm certified app actually runs and tests pass)
  5. Output: certified, runnable app
- **Autonomous discover mode (critical for greenfield):** The discover command needs a `--autonomous` flag that:
  - Reads the project description or imported document
  - Assesses complexity tier without asking
  - Decomposes into nodes based on tier (SMALL = 1-2, MEDIUM = 3-5, LARGE = fine-grained)
  - Selects tech stack based on project type (recommend defaults, don't ask)
  - Generates manifest and skeleton specs
  - Only halts if there's genuine ambiguity that would lead to a wrong architecture
  - For SMALL tier: the entire discover phase should complete in < 2 minutes with zero user interaction
- **Error recovery in the greenfield chain:** If any step fails (npm install, tsc, test, dev server):
  1. Read the error output
  2. Dispatch a fix agent to resolve it (wrong package name → search for correct one, type error → fix the code, test failure → fix the test)
  3. Retry the failed step (up to 3 attempts)
  4. If still failing after 3 attempts, halt with clear error and preserve state for `/forgeplan:recover`
- Complexity tier determines how much governance the pipeline applies
- **Exit criteria are tier-aware:**
  ```
  SMALL: verify-runnable Phase A passes (install + tests + dev server) + 3-agent sweep clean.
         No Phase B runtime testing. No cross-model.
         "Certified" = it runs, tests pass, basic sweep is clean.

  MEDIUM: verify-runnable Phase A passes + Phase B runtime verification (endpoints + responses) +
          4-agent sweep clean + integration check passes. Cross-model optional.
          "Certified" = runs + endpoints work + thorough sweep + interfaces verified.

  LARGE: verify-runnable Phase A passes + Phase B runtime verification (endpoints + auth boundaries + stress) +
         5-agent sweep converged + integration passes + cross-model verified (2 consecutive clean passes).
         "Certified" = full pipeline, everything tested at every level.
  ```

### Milestone: External Users
**After Sprint 8, before Sprint 9.** Ship to 10+ external users. Get real feedback on the full pipeline (complexity calibration → research → greenfield → certified). Their feedback reshapes Sprint 9+ more than any amount of internal planning. The product has enough features by Sprint 8 — it needs distribution.

### Sprint 9: Semantic Memory + Polish
**Goal:** Compiled knowledge base reduces token usage. Polish from Sprint 7 deferred items.

**Pillar 1: Semantic Memory (Karpathy Wiki Pattern)**
- `.forgeplan/wiki/` with per-node knowledge pages updated by each sweep pass
- Three layers: raw sources (specs, code) → wiki (compiled knowledge) → schema (rules)
- Agents read wiki first (cheap), drill into source only to verify
- Cross-cutting pages: patterns.md, decisions.md, log.md
- Cross-session pattern surfacing: "similar nodes had these issues before"

**Pillar 2: State Management Hardening**
- `update-state.js` for atomic read-modify-write
- Parallel fix agents with per-agent temp state
- Session-end hook for cross-session context

**Pillar 3: Consolidated Five-Team Sweep Model**
Consolidated from 12 domain agents + 4 team agents (16 total) into 5 team-colored agents, all opus. Each agent covers a broad domain with the depth that opus provides, eliminating inter-agent disagreement and reducing convergence from 3-4 passes to 1-2. Proven during Sprint 7B-8 hardening where the Red Team caught a CRITICAL security bypass that 35 Claude agents + 7 Codex rounds + 2 Qwen rounds all missed.

- **Five consolidated sweep agents:**
  - `sweep-red` (Red Team, opus) — Adversarial. Absorbs auth-security, error-handling, config-environment, database. Tries to BREAK the code with pathological inputs, traces false-pass/fail conditions, checks security boundaries and state machine holes.
  - `sweep-orange` (Orange Team, opus) — Contract. Absorbs type-consistency, api-contracts, imports, cross-node-integration. Diffs both sides of every producer/consumer boundary for shape, naming, and behavior agreement.
  - `sweep-blue` (Blue Team, opus) — Experience. Absorbs frontend-ux, test-quality, user-flows. Walks every user journey end-to-end, checks UX states (loading/empty/error), verifies test quality and coverage.
  - `sweep-rainbow` (Rainbow Team, opus) — Architect. Absorbs code-quality, documentation, holistic. Zooms out on architecture, checks for over-engineering and unnecessary complexity, verifies documentation accuracy.
  - `sweep-white` (White Team, opus) — Compliance. NEW agent. Traces every spec acceptance criterion to code implementation, provides fresh-eyes generalist review, and on pass 2+ finds gaps in other agents' coverage.

- **Tier-aware dispatch:**
  ```
  SMALL:  3 agents — Red + Orange + White
  MEDIUM: 4 agents — + Blue
  LARGE:  5 agents — + Rainbow
  ```

- **Design doc:** `docs/plans/2026-04-07-agent-consolidation-design.md` — full design with agent responsibilities, confidence calibration, and migration path.

**Pillar 4: Node Splitting** (deferred from Sprint 7A)
- `/forgeplan:split [node-id]` — decompose an existing node into finer-grained nodes
- Required for tier upgrades (SMALL→MEDIUM) to work end-to-end
- Preserves existing code, state, and enforcement integrity during split

**Pillar 5: Guide Skill Enhancement** (deferred from Sprint 7B)
- Pattern detection from past sweeps: "similar nodes had these issues"
- Read sweep reports + blocked decisions for smarter recommendations

### Sprint 10: Skills + Blueprints
**Goal:** Builder invokes external skills. Blueprints backed by research.

- Skill-augmented building: builder detects node type, invokes `frontend-design`, API patterns, schema design skills
- Configurable per-project: `skills:` section in config.yaml
- Research-backed blueprint generation with vetted dependency stacks
- Community blueprints with versioning

### Sprint 11: Preset Workflows + MCP Integrations
**Goal:** Pre-configured connections to popular products.

- MCP server connections for Supabase, Stripe, Vercel, etc.
- Live API validation during builds
- Integration templates for popular stacks

### Standalone App: Visual Features (Post-Plugin)
**Goal:** Phantom previews and node visualization require a visual canvas — deferred to the standalone ForgePlan Workstation per Execution Plan.

- **Preview System (progressive — Phantom → Live):**
  The preview evolves as the product matures:
  - **Phase 1 — Phantom Preview (early standalone app):** Static renders and diagrams. Component screenshots for frontend, endpoint maps for API, schema diagrams for database. User sees the app taking shape during deep-build, but it's visual documentation, not a running app.
  - **Phase 2 — Interactive Preview:** Previews become clickable. Frontend components render in an iframe sandbox. API endpoints return example responses. Database shows actual schema with sample data. Still using mock data but the UI is real.
  - **Phase 3 — Live Preview:** The actual running app. Playwright verifies UI flows automatically. API endpoints respond with real logic. The preview IS the app — just running against mock/seed data instead of production services.
  - **Phase 4 — Production Preview:** Connect real services. The live preview becomes the staging environment. One click to deploy.
  - At each phase, the preview gets less "phantom" and more "live." The name transitions naturally.

- **Playwright/Browser Testing Integration:**
  Automated browser testing during verification. Playwright navigates the actual app, clicks through flows, verifies UI renders correctly. Extends Phase B runtime verification from API-level to full UI-level. Integrates with the preview system — Playwright tests run against the live preview.

- **Demo Mode:**
  Ask user during discovery: "Want a demo mode?" If yes, the build includes:
  - Fake login credentials (demo@example.com / demo123)
  - Seed data that exercises every feature (sample users, documents, transactions)
  - Mock API responses for external services (Stripe returns fake payments, S3 returns fake uploads)
  - A "Demo Mode" banner in the UI so nobody mistakes it for production
  - One command to toggle: `DEMO_MODE=true npm run dev`
  Useful for: stakeholder demos, user testing, feature validation, sales demos, onboarding walkthroughs.
  Could ship as a CLI feature before the standalone app (it's a build constraint + seed data generator).

- **Node Visualization:**
  Interactive dependency graph colored by status. Click nodes for details. Real-time updates during deep-build. Integrates with the preview system ��� clicking a node shows its live preview alongside specs and findings. Requires Tauri + React Flow + Monaco (per Execution Plan).

- **Lifecycle Bar:**
  A visual progress indicator showing the full journey:
  `[Discover] → [Spec] → [Build] → [Verify] → [Review] → [Sweep] → [Certify] → [Demo] → [Ship]`
  Each stage lights up as the project progresses. Click any stage for details. During deep-build, advances automatically in real-time. Ties together the preview system, node visualization, and the pipeline into one visual. The bar IS the product story.

- These are desktop/web app features except Demo Mode, which could ship as a CLI feature earlier.

## Commands

| Command | Sprint | Description |
|---------|--------|-------------|
| `/forgeplan:discover` | 1 | Guided conversation → manifest + skeleton specs |
| `/forgeplan:spec` | 2 | Generate detailed node spec |
| `/forgeplan:build` | 2 | Build a node with enforcement |
| `/forgeplan:review` | 3 | Audit node against spec |
| `/forgeplan:revise` | 3 | Reopen and change a node |
| `/forgeplan:next` | 2 | Dependency-aware next recommendation |
| `/forgeplan:status` | 4 | Full project status visualization |
| `/forgeplan:integrate` | 4 | Cross-node interface verification |
| `/forgeplan:recover` | 3 | Crash recovery |
| `/forgeplan:sweep` | 6 | Tier-aware parallel sweep (3-5 agents) + progressive convergence + cross-model verification |
| `/forgeplan:deep-build` | 6 | Full autonomous build→review→sweep→cross-check pipeline |
| `/forgeplan:configure` | 6 | Automated cross-model setup wizard (Codex/Gemini MCP/CLI/API) |
| `/forgeplan:guide` | 6 | Evaluates project state, recommends best next step with explanations |
| `/forgeplan:help` | 4 | All available commands |
| `/forgeplan:affected` | 4 | Which nodes use a shared model — impact analysis |
| `/forgeplan:measure` | 5 | Code quality metrics (broken refs, stubs, duplicates) |
| `/forgeplan:regen-types` | 4 | Rebuild shared TypeScript types from manifest |
| `/forgeplan:validate` | 4 | Check manifest/specs for cycles, orphans, consistency |
| `/forgeplan:research` | 8 | Research agents search for existing implementations, check licenses, gather docs |
| `/forgeplan:greenfield` | 8 | Full pipeline: describe → discover → research → spec → build → certify |

## Core Agents

| Agent | Role | Key Behaviors |
|-------|------|--------------|
| Architect | Discovery, manifest creation | Anti-collapse enforcement, shared model identification, text summaries |
| Builder | Node code generation | Pre-build spec challenge, anchor comments, constraint directive |
| Reviewer | Spec-diff audit | 7 audit dimensions, per-criterion PASS/FAIL, code evidence |

### 5 Consolidated Sweep Agents (dispatched in parallel by `/forgeplan:sweep`)

| Agent | Model | Team | Domain |
|-------|-------|------|--------|
| sweep-red | opus | Red (Adversarial) | Security, errors, config, database — tries to BREAK the code |
| sweep-orange | opus | Orange (Contract) | Types, API contracts, imports, cross-node — diffs both sides of every boundary |
| sweep-blue | opus | Blue (Experience) | User flows, frontend UX, test quality — walks every journey end-to-end |
| sweep-rainbow | opus | Rainbow (Architect) | Code quality, docs, architecture, simplicity — zooms out |
| sweep-white | opus | White (Compliance) | Spec tracing, fresh eyes, gap finding — does the code do what the spec says? |

## Six Hook Types

| Hook | Type | Purpose |
|------|------|---------|
| PreToolUse | command + prompt | Layer 1: deterministic file scope + shared model guard. Layer 2: LLM spec compliance |
| PostToolUse | command | Auto-register files, log changes |
| Stop | command | Bounce counter gate; exit-2 message instructs Claude to evaluate ACs and do state transition |
| SessionStart | command | Detect crashed/stuck builds, ambient status display |
| PreCompact | command | Save critical context (manifest, state, enforcement rules) before compaction |
| PostCompact | command | Re-inject context summary after compaction so Claude regains awareness |

## Key Design Decisions

- **Node spec is the most important artifact.** Everything downstream depends on spec quality.
- **Layered enforcement:** Fast deterministic checks first, LLM only when needed. 80%+ of enforcement is instant glob matching.
- **Shared models are canonical.** Any entity referenced by 2+ nodes must be a shared model in the manifest, never defined locally.
- **Spec-diff review, not vibes.** Every review finding must reference a specific spec element and cite specific code evidence.
- **The `.forgeplan/` directory is the product.** The plugin is one interface to it. The standalone app is another.
- **Anchor comments** (`// @forgeplan-node: [id]`, `// @forgeplan-spec: [criterion-id]`) tie code to architecture.

## The Canonical Demo: Client Portal

Every example uses this project:
- **7 nodes:** database, auth, api, file-storage, frontend-login, frontend-dashboard, frontend-accountant-view
- **2 shared models:** User (client vs accountant roles), Document (upload lifecycle)
- Auth: email/password + Google OAuth, role-based access
- File handling: upload, storage, retrieval with encryption
- Multiple frontend views per role

## Platform Notes

- Development on Windows 11, use Unix shell syntax in bash
- Plugin must be cross-platform (scripts should use Node.js, not bash-only)
- validate-manifest should be .js not .sh for Windows compatibility
