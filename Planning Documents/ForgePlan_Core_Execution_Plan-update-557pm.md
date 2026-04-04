# ForgePlan Core — Plugin Execution Plan

## Build-Ready Specification for Week 1 Start

**Author:** Craig Spergel
**Date:** April 2026
**Status:** Ready to Build
**Grand Vision:** See ForgePlan Concept Document v4.1

---

## What This Document Is

This is the **build plan**, not the vision document. The vision (23 sections, standalone app, phantom previews, marketplace, multiplayer) is preserved in the concept document and remains the long-term direction. This document strips the vision down to what gets built **this week and the next ten weeks** — the plugin that proves whether architecture-governed AI builds are materially better than ad hoc AI coding.

## Identity

**ForgePlan Core** — an architecture-governed AI build harness.

Claude Code is the first interface. The `.forgeplan/` directory is the product. The plugin is how developers interact with it today. The standalone visual workstation is how everyone interacts with it later — but only if the core harness proves its value first.

## What ForgePlan Core Must Prove

Four things. Nothing else matters until these are demonstrated on real projects:

1. **Users can define architecture faster than they expected.** The `/discover` conversation should produce a complete, validated manifest in under ten minutes for a typical 5-8 node project.

2. **Build outputs are more coherent than normal AI coding.** Fewer broken references, fewer duplicate types, fewer abandoned stubs, fewer naming inconsistencies compared to unstructured Claude Code / Cursor usage.

3. **Revisions propagate better than normal AI coding.** When a spec changes, the system identifies what's affected and guides remediation rather than leaving the user to find breakage manually.

4. **Recovery and review catch problems people actually hit.** The review loop finds real bugs. The crash recovery handles real interruptions. The integration check finds real interface mismatches.

## The Canonical Demo: Client Portal

Every example, every template, every dogfood build uses the same project: a client portal where small business owners upload tax documents for their accountant. This project has:

- **7 nodes:** database, auth, api, file-storage, frontend-login, frontend-dashboard, frontend-accountant-view
- **Shared models:** User (client vs accountant roles), Document (upload lifecycle)
- **Auth complexity:** email/password + Google OAuth, role-based access
- **File handling:** upload, storage, retrieval with encryption
- **Multiple frontend views:** different dashboards per role

This is complex enough to stress-test the harness but small enough to build in a day with the plugin working correctly.

## Success Metric

After Sprint 5 dogfooding, answer this question with data:

> Can a user build the client portal project with fewer broken references, fewer duplicate types, and fewer abandoned stubs than building the same project with vanilla Claude Code?

If yes, ForgePlan Core works. If no, the harness needs redesign before the standalone app makes sense.

---

## The `.forgeplan/` Directory Structure

```
.forgeplan/
├── manifest.yaml              # Central command file — the spider web
├── config.yaml                # Cross-model settings, preferences (optional)
├── state.json                 # Ephemeral session state
├── specs/
│   ├── database.yaml
│   ├── auth.yaml
│   ├── api.yaml
│   ├── file-storage.yaml
│   ├── frontend-login.yaml
│   ├── frontend-dashboard.yaml
│   └── frontend-accountant-view.yaml
├── conversations/
│   ├── discovery.md           # Why each node exists
│   └── nodes/
│       ├── auth.md            # Build decisions per node
│       └── api.md
└── reviews/
    ├── auth.md                # Structured review reports
    └── api.md
```

This directory is the product. Everything else is interface.

---

## Node Spec Template — The Enforcement Contract

The spec is the most important file in the system. Everything downstream — build enforcement, review, integration, Stop hook — depends on spec quality. The template includes five fields beyond basic description that make specs testable and enforceable:

```yaml
node: auth
name: "Authentication Service"

description: >
  Handles login, registration, session management, and role-based access.

# INPUTS (external entry points)
inputs:
  - name: email
    type: string
    required: true
    validation: "valid email format"
  - name: password
    type: string
    required: true
    validation: "min 8 characters"

# OUTPUTS (guaranteed responses)
outputs:
  - name: user
    type: $shared.User
  - name: session
    type: SupabaseSession
  - name: error
    type: AuthError

# SHARED MODEL DEPENDENCIES (must match manifest shared_models exactly)
shared_dependencies:
  - User

# LOCAL DATA MODELS (node-specific, not shared)
data_models:
  AuthError:
    code: string
    message: string

# INTERFACES (strict directional contracts)
interfaces:
  - target_node: database
    type: read/write
    contract: "User persistence via Supabase Auth"
  - target_node: api
    type: outbound
    contract: "JWT token injection for protected routes"
  - target_node: frontend-login
    type: outbound
    contract: "Auth context with login/logout/register"

# ACCEPTANCE CRITERIA (must be testable — Stop hook evaluates these by ID)
acceptance_criteria:
  - id: AC1
    description: "User can register with email/password"
    test: "POST /register returns user + session"
  - id: AC2
    description: "Google OAuth login works"
    test: "OAuth flow returns valid session"
  - id: AC3
    description: "Session persists across reload"
    test: "Reload retains authenticated state"
  - id: AC4
    description: "Role-based access enforced"
    test: "Client cannot access accountant routes"

# CONSTRAINTS (strict behavioral rules)
constraints:
  - "Must use Supabase Auth"
  - "No password storage in app code"
  - "All auth state via React context"

# NON-GOALS (explicit scope boundaries — prevents feature creep)
non_goals:
  - "No custom JWT implementation"
  - "No multi-tenant org support"
  - "No password reset flow in V1"

# FAILURE MODES (what the Reviewer specifically checks for)
failure_modes:
  - "Invalid login attempts not rate-limited"
  - "Session not persisted after page reload"
  - "Role leakage: client accessing accountant routes"

# FILE SCOPE (deterministic enforcement boundary)
file_scope: "src/auth/**"

# DEPENDENCIES
depends_on:
  - database
```

**Why each new field matters:**

- **`shared_dependencies`** — explicit list of shared models this node uses. The harness injects these definitions into the Builder's context and the PreToolUse hook blocks local redefinitions.
- **`acceptance_criteria.id` + `test`** — makes the Stop hook precise. Instead of evaluating vague descriptions, it checks specific criterion IDs against testable assertions. The Builder agent uses the `test` field to write actual test cases. Anchor comments reference these IDs (`// @forgeplan-spec: AC1`).
- **`non_goals`** — the negative constraint that pairs with acceptance criteria. The Builder agent is explicitly told not to implement these. The Reviewer flags any non-goal that was implemented anyway. This is the highest-leverage field for preventing feature creep.
- **`failure_modes`** — gives the Reviewer a concrete checklist of things to break. Instead of generic "check for security issues," the Reviewer tests whether rate limiting is enforced, whether sessions persist, and whether role boundaries hold. These are the bugs that actually ship to production.
- **`interfaces.type`** — directional typing (read/write, outbound, inbound) makes the integration check more precise about which side of a failed connection is at fault.

---

## Commands — What Ships

Nine commands ship in Sprints 1–5. Two additional commands ship in Sprint 6. Each maps to a clear user action.

| Command | What It Does |
|---------|-------------|
| `/forgeplan:discover` | Guided conversation → manifest + skeleton specs. Text-based architecture summaries after each addition. Validates for cycles, orphans, scope overlaps. |
| `/forgeplan:spec [node\|--all]` | Generate detailed node spec. `--all` generates in dependency order. User reviews and edits in natural language. |
| `/forgeplan:build [node]` | Set active node. Inject spec + interfaces + shared models. Builder agent generates code with anchor comments. Hooks enforce compliance. |
| `/forgeplan:review [node]` | Audit against seven dimensions (spec compliance, interfaces, security, patterns, anchor comments, non-goal violations, failure mode coverage). Native Claude agent, or cross-model via CLI subprocess (uses existing Codex/Gemini subscription, no API key needed) or API mode. Structured pass/fail report. |
| `/forgeplan:revise [node]` | Reopen completed node. Analyze change impact (internal vs interface). Flag affected nodes. |
| `/forgeplan:next` | Dependency-aware next node recommendation. Surfaces stuck/crashed nodes. |
| `/forgeplan:status` | Full project status with text-based dependency graph visualization. |
| `/forgeplan:integrate` | Cross-node interface verification. Identifies which side is at fault. Recommends remediation. |
| `/forgeplan:recover` | Detect and handle crashed builds. Resume, reset, or flag for manual review. |
| `/forgeplan:sweep` | *Sprint 6.* Claude's parallel agents sweep the codebase, fix findings, then the alternate model (Codex/Gemini via CLI subprocess or API) cross-checks the fixes AND re-sweeps for issues Claude missed. Alternates until two consecutive clean passes from the alternate model. |
| `/forgeplan:deep-build` | *Sprint 6.* Full autonomous sequence: build all nodes → node review → integrate → Claude sweep → Claude fix → cross-model verification → fix → re-verify → done. User walks away, comes back to a finished, cross-model-certified codebase. No extra API keys needed if using CLI mode. |

---

## Enforcement — How It Actually Works

The reviewer correctly flagged that all-prompt enforcement is squishy. The implementation uses **layered enforcement**: fast deterministic checks first, LLM evaluation only when needed.

### PreToolUse Hook (Every Write/Edit)

**Layer 1 — Deterministic (instant, no tokens):**
- Is there an active node in state.json? If not, warn.
- Does the target file path match the active node's `file_scope` glob? If not, **block**.
- Does the target file fall within ANY other node's `file_scope`? If yes, **block**.
- Is the file already in another node's `files` list? If yes, **block**.
- **Shared model guard:** scan the file content for type/interface/class definitions that match any name in the manifest's `shared_models` (e.g., `type User`, `interface User`, `class User`). If found and this node's spec lists that model in `shared_dependencies`, verify it's an import, not a redefinition. If it's a redefinition, **block** with message: "User is a shared model defined in the manifest. Import it from the shared types module — do not redefine locally."

**Layer 2 — LLM-mediated (only if Layer 1 passes):**
- Does the code content comply with the node spec's constraints?
- Does it use shared model types with correct field structure (not just correct name)?
- Is it adding functionality not in the spec?
- Is it implementing something explicitly listed in the spec's `non_goals`?

This means 80%+ of enforcement is instant glob matching. The LLM only evaluates semantic compliance on files that are already confirmed to be in the right territory. False positives drop dramatically.

### PostToolUse Hook (Every Write/Edit)

Deterministic only:
- Auto-register new files into the manifest's `files` list.
- Log the change to the node's conversation file.

### Stop Hook (Build completion)

**Layer 1 — Deterministic:**
- Check bounce counter in state.json. If ≥ 3, escalate to user instead of blocking.
- Check `stop_hook_active` flag to prevent infinite loops.

**Layer 2 — LLM-mediated:**
- Evaluate acceptance criteria from the node spec by ID (AC1, AC2, etc.) and their `test` fields.
- If unmet criteria exist and bounce counter < 3, return exit code 2 with the specific criterion IDs and test descriptions that remain unmet.
- Check that failure modes listed in the spec have been addressed.

### SessionStart Hook

Deterministic only:
- Read manifest. Flag any nodes stuck in `building` status.
- Inject warning message if found.

---

## Agents — Three Roles, Clear Boundaries

### Architect Agent

**Launched by:** `/forgeplan:discover`
**Context:** Blueprint templates, guided question framework
**Key behaviors:**
- Adaptive questioning that maps answers to architectural decisions
- **Explicit decomposition enforcement:** DO NOT collapse auth, api, database, or file-storage into a single "backend" node unless the user explicitly justifies it. Each system with distinct responsibility gets its own node.
- Presents text-based architecture summary after each manifest update (node count, connections as arrows, dependency chains)
- Identifies shared models during conversation and defines them canonically in the manifest — any entity referenced by two or more nodes (User, Document, Transaction) must be a shared model, never defined locally in individual specs
- Runs `validate-manifest.sh` after every manifest write (cycle detection, orphan check, scope overlap)
- Before finalizing: verifies all critical systems are accounted for (auth, data persistence, business logic, frontend per role). If something is missing, asks a clarifying question rather than finalizing with gaps
- Saves full conversation to `.forgeplan/conversations/discovery.md`

### Builder Agent

**Launched by:** `/forgeplan:build [node]`
**Context assembled from:** node spec + adjacent interface contracts + shared models + tech stack config

**Pre-Build Spec Challenge (runs before any code is written):**

Before writing a single line of code, the Builder agent must:
1. Read the full node spec and identify any ambiguities, missing edge cases, or underspecified behaviors.
2. Either (A) ask the user for clarification, or (B) document explicit assumptions in the node's conversation log at `.forgeplan/conversations/nodes/[node].md`.
3. Only proceed to code generation after ambiguities are resolved or documented.

This prevents "silent bad builds" where a technically complete spec produces incorrect code because edge cases were never discussed. The spec is not the last word — it is the starting point for a brief negotiation before the build begins.

**Constraint directive (injected into system prompt):**

> You are building the [node name] component. BEFORE WRITING ANY CODE: review the spec for ambiguities, missing edge cases, and underspecified behaviors. Ask the user to clarify, or document your assumptions in the conversation log. THEN begin building. Follow the node spec exactly. Do not add functionality not specified in the spec. Do not implement anything listed in the spec's non_goals section. Do not create or modify files outside this node's file_scope directory. If the spec is ambiguous and you did not resolve it in the pre-build challenge, ask the user — do not improvise. Use shared model definitions from the manifest for all types listed in the spec's shared_dependencies; do not redefine them locally — import them. Include `// @forgeplan-node: [node-id]` at the top of every file. Annotate major functions with `// @forgeplan-spec: [criterion-id]` using the acceptance criteria IDs (AC1, AC2, etc.) from the spec. Write tests corresponding to the `test` field of each acceptance criterion.

### Reviewer Agent

**Launched by:** `/forgeplan:review [node]`

**Review method: spec-diff, not vibes.** The Reviewer does not produce generic feedback like "looks good" or "consider error handling." Every review finding must reference a specific spec element and cite specific code evidence. The review is a structured comparison of implementation against contract.

**Seven audit dimensions (each requires per-item pass/fail with evidence):**

1. **Spec compliance** — for EACH acceptance criterion by ID:
   - AC1: PASS/FAIL — cite the code file and function that implements it
   - AC2: PASS/FAIL — cite evidence
   - (etc. for every criterion)
   - Does each criterion's `test` field have a corresponding test file?

2. **Interface integrity** — for EACH interface in the spec:
   - target_node: [name] — PASS/FAIL — is the contract implemented? Is the directional `type` respected?

3. **Constraint enforcement** — for EACH constraint:
   - "Must use Supabase Auth" — ENFORCED/VIOLATED — cite evidence

4. **Pattern consistency** — does code follow conventions from completed nodes?

5. **Anchor comment coverage** — are all files annotated with `@forgeplan-node`? Are major functions annotated with `@forgeplan-spec: [criterion-id]`?

6. **Non-goal enforcement** — for EACH non_goal: was it implemented? If so, flag specific files for removal.

7. **Failure mode coverage** — for EACH failure_mode: does the implementation handle it? Cite the defensive code or flag its absence.

**Cross-model implementation (three modes):** The system supports three modes for running the alternate model, configured in `config.yaml`:

- **MCP mode (recommended):** If the user has Codex configured as an MCP server (`claude mcp add codex -- codex mcp-server`), the system uses structured MCP tool calls to communicate with the alternate model. This is the cleanest integration — structured request/response, no output parsing, runs within the Claude Code session. Uses the user's existing OpenAI subscription. This pattern is validated by the [Auto-claude-code-research-in-sleep](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep) project, which uses the same Codex MCP approach for autonomous cross-model review loops.
- **CLI mode (no extra keys needed):** If the user has Codex CLI, Gemini CLI, or another AI coding agent installed but not configured as MCP, the system spawns it as a child process, feeds the review prompt via stdin or temp file, and captures the output. Uses existing subscriptions, no API keys required. Slightly less reliable than MCP due to output parsing.
- **API mode (for power users / autonomous runs):** For overnight deep-build runs where reliability matters more than cost, the system makes direct API calls to OpenAI, Google, or Anthropic endpoints. Requires an API key with credits loaded but produces the most structured, reliable responses.

```
# .forgeplan/config.yaml
cross_model:
  provider: codex-mcp         # Options: codex-mcp, codex-cli, openai-api, gemini-cli, gemini-api
  # codex-mcp: uses Codex as MCP server (recommended — structured tool calls, existing subscription)
  #   Setup: claude mcp add codex -- codex mcp-server
  # codex-cli: spawns local Codex CLI as subprocess, uses existing subscription
  # openai-api: direct API calls, requires api_key below
  # gemini-cli: spawns local Gemini CLI, uses existing subscription
  # gemini-api: direct API calls to Google, requires api_key below
  api_key: ${OPENAI_API_KEY}  # Only needed for *-api modes
  
preferences:
  auto_review: true           # Automatically trigger review after build
  strict_mode: true           # PreToolUse hook denies all spec violations
  conversation_logging: true  # Save all build conversations
```

The pitch: "If you have Claude Code and any other AI coding tool installed, ForgePlan can make them review each other's work automatically. No extra API keys required."

**Output format** (at `.forgeplan/reviews/[node].md`):

```
## Review: auth
### Acceptance Criteria
- AC1: PASS — src/auth/register.ts implements email/password registration
- AC2: PASS — src/auth/oauth.ts implements Google OAuth flow
- AC3: FAIL — no session persistence logic found after page reload
- AC4: PASS — src/auth/middleware.ts enforces role-based route protection

### Constraints
- "Must use Supabase Auth": ENFORCED — all auth calls use @supabase/supabase-js
- "No password storage": ENFORCED — no password variables stored beyond auth call

### Interfaces
- database (read/write): PASS — Supabase client correctly configured
- api (outbound): PASS — JWT middleware exported and documented
- frontend-login (outbound): PASS — AuthContext provider with login/logout/register

### Non-Goals
- No violations found

### Failure Modes
- "Rate limiting not enforced": FAIL — no rate limiting logic found
- "Session not persisted": FAIL — matches AC3 failure above
- "Role leakage": PASS — middleware checks role before route access

### Recommendation: REQUEST CHANGES (2 failures: AC3, rate limiting)
```

This format makes review objective and actionable. Every finding points to a specific spec element and a specific piece of code (or its absence).

---

## MVP Proof Layers

Not everything needs to be polished in the first pass. The build has two layers: what must work to validate the thesis, and what's nice-to-have for a complete product.

**Must Work (thesis proof — nothing ships without these):**
- `/forgeplan:discover` produces a correct, validated, decomposed manifest from a conversational description
- `validate-manifest.sh` catches cycles, orphans, and scope overlaps
- At least one node spec generated with all fields (acceptance criteria with IDs and tests, non_goals, failure_modes, shared_dependencies, constraints, interfaces with types)
- At least one node built with PreToolUse enforcement active (deterministic file scope blocking + LLM spec compliance)
- At least one node reviewed with spec-diff format (per-criterion PASS/FAIL with code evidence, not generic feedback)
- At least one `/forgeplan:revise` cycle that changes a shared model field and correctly propagates to dependent nodes — this is the killer proof

**Nice-to-Have (product polish — important but not thesis-critical):**
- Full cross-model configuration with `cross-model-bridge.js` (MCP mode for Codex, CLI mode for other tools, API mode for power users)
- Multiple blueprint templates beyond client portal
- `/forgeplan:recover` crash recovery (can be tested manually by resetting state.json)
- `/forgeplan:integrate` full system verification (can be done manually by reviewing interfaces)
- Broader hardening of PreToolUse Layer 2 prompt quality across edge cases
- `/forgeplan:status` text-based dependency visualization

**Sprint 6 Proof (autonomous loop — the premium differentiator):**
- `/forgeplan:sweep` with parallel agents finds real cross-cutting bugs that per-node review missed
- Auto-fix cycle resolves findings without human intervention
- Two consecutive clean sweep passes achieved on the client portal project
- `/forgeplan:deep-build` runs the full autonomous sequence end-to-end without human intervention
- Self-improvement demonstrated: sweep of ForgePlan's own codebase produces fixes that improve the tool itself

The sprints below are sequenced to deliver the "must work" items first. Every sprint test validates a must-work capability.

---

## How Success Metrics Are Measured

The success metric — "fewer broken references, fewer duplicate types, and fewer abandoned stubs" — requires explicit definitions so measurement is objective.

**Broken references** — a function call, import, type reference, or variable that points to something that doesn't exist or has the wrong name. Measured by: run the project's type checker (TypeScript `tsc --noEmit`) and linter after the full build. Count the number of errors that are reference errors (undefined variable, missing module, property does not exist on type). Compare ForgePlan build vs vanilla Claude Code build of the same project.

**Duplicate types** — the same conceptual entity (User, Document, etc.) defined more than once with different field structures across different files. Measured by: grep the codebase for `type [ModelName]`, `interface [ModelName]`, and `class [ModelName]` for each shared model. Count instances where the same model name appears with different field definitions. In a correct ForgePlan build this count should be zero — all shared models are imported from a single canonical definition.

**Abandoned stubs** — functions, components, or endpoints that are declared but not implemented (empty bodies, TODO comments, placeholder returns, `throw new Error('not implemented')`). Measured by: grep for `TODO`, `FIXME`, `not implemented`, `throw new Error`, and empty function bodies (`{}` with no logic). Count instances. In a correct ForgePlan build this count should be zero — the Stop hook prevents builds from completing with unmet acceptance criteria.

**Measurement protocol for Sprint 5:**
1. Build the client portal with ForgePlan Core. Record the three counts.
2. Build the same client portal with vanilla Claude Code (same prompts, same feature set, no ForgePlan harness). Record the three counts.
3. Compare. The delta is the proof.

---

## Sprint Plan — 14 Weeks (6 Sprints)

### Sprint 1: Foundation (Weeks 1–2)

**Goal:** A user can run `/forgeplan:discover` and produce a validated manifest with shared models.

**Deliverables:**
- Plugin scaffold: `plugin.json`, directory structure, all command/skill/agent stubs
- Manifest schema with `shared_models`, `validation`, `file_scope`, `revision_count`
- Node spec schema with all fields: `shared_dependencies`, `acceptance_criteria` (with IDs and `test` fields), `non_goals`, `failure_modes`, `interfaces` (with `type`), `constraints`, `file_scope`
- `validate-manifest.sh` script (topological sort for cycles, orphan detection, scope overlap check)
- `state.json` schema
- `/forgeplan:discover` command with Architect agent (anti-collapse enforcement, shared model identification, text summaries)
- Discovery conversation logging to `.forgeplan/conversations/discovery.md`
- Client portal blueprint template

**Test:** Run `/forgeplan:discover`, describe the client portal, get a 7-node manifest with 2 shared models, validated with no cycles and no scope overlaps.

### Sprint 2: Build Harness (Weeks 3–4)

**Goal:** A user can spec and build a single node with hook enforcement.

**Deliverables:**
- `/forgeplan:spec` command with `--all` flag, specification skill
- `/forgeplan:build` command with Builder agent
- Builder agent pre-build spec challenge step (identify ambiguities, ask or document assumptions before coding)
- Builder agent constraint directive with anchor comments (referencing criterion IDs), shared model injection, and non_goals enforcement
- PreToolUse hook — Layer 1 deterministic (glob matching + shared model redefinition guard) + Layer 2 LLM-mediated (spec compliance, non_goals checking)
- PostToolUse hook — file registration + conversation logging
- Active node context management via `state.json`
- `/forgeplan:next` command with dependency graph traversal

**Test:** Spec and build the `database` node for the client portal. Verify the Builder challenges at least one ambiguity in the spec before coding. Verify PreToolUse blocks writes outside `file_scope`. Verify PreToolUse blocks a local `User` type redefinition. Verify anchor comments are generated. Verify `/forgeplan:next` correctly recommends `auth` after `database` is complete.

### Sprint 3: Review and Recovery (Weeks 5–6)

**Goal:** The build-review loop works end to end. Crashes are recoverable.

**Deliverables:**
- `/forgeplan:review` command with Reviewer agent (native mode)
- Spec-diff review format: per-criterion pass/fail with code evidence citations, per-constraint enforced/violated, per-interface implemented/missing, per-failure-mode handled/absent (no generic feedback allowed)
- Stop hook with bounce counter (Layer 1 deterministic + Layer 2 LLM evaluating criteria by ID and test fields)
- SessionStart hook for crash detection
- `/forgeplan:recover` command with resume/reset/manual-review options
- `/forgeplan:revise` command with change impact analysis
- Node-level conversation logging

**Test:** Build and review `auth` node. Verify review report cites specific files for each criterion pass/fail. Intentionally leave AC3 (session persistence) unmet — verify Stop hook bounces with "AC3: FAIL" message. Kill the terminal mid-build — verify SessionStart detects the stuck node on next launch. Revise the `auth` spec to change an interface — verify connected nodes are flagged.

### Sprint 4: Integration and Cross-Model Review (Weeks 7–8)

**Goal:** Multi-node projects complete the full lifecycle. Cross-model review works.

**Deliverables:**
- `cross-model-bridge.js` script with three-mode support: MCP mode (uses Codex as MCP server via `claude mcp add codex` — structured tool calls, cleanest integration, existing subscription), CLI subprocess mode (spawns Codex CLI / Gemini CLI as child process — existing subscriptions, no API key), and API mode (direct HTTP calls — requires API key, most reliable for autonomous runs)
- `config.yaml` schema with `cross_model.provider` setting (codex-mcp, codex-cli, openai-api, gemini-cli, gemini-api), strict/non-strict mode, auto-review preference
- `/forgeplan:integrate` command with fault-side identification and remediation guidance
- `/forgeplan:status` command with text-based dependency visualization
- Remaining blueprint templates (SaaS starter, internal dashboard)
- Documentation and README

**Test:** Build the complete 7-node client portal using the plugin. Run `/forgeplan:integrate` and verify all interfaces pass. Configure cross-model review in MCP mode (codex-mcp) — verify structured MCP tool calls work with no API key. Test CLI mode as fallback. If API key available, test API mode. Compare output quality and reliability across all three modes.

### Sprint 5: Dogfood and Ship (Weeks 9–10)

**Goal:** Prove the four things. Run the change propagation test. Ship to marketplace.

**Activities:**
- Build the client portal end-to-end using only the plugin
- Build a second project (SaaS starter) to verify generalization
- **Measure:** broken references, duplicate types, abandoned stubs vs baseline vanilla Claude Code build
- Tune PreToolUse Layer 2 prompt quality based on false positive/negative rates
- Tune Stop hook bounce threshold based on real usage patterns
- Validate anchor comment coverage for standalone app parser compatibility
- Exercise `/forgeplan:revise` to test change propagation under real conditions
- Exercise `/forgeplan:recover` with intentional crashes
- Community beta feedback
- Publish to Claude Code plugin marketplace as **ForgePlan Core**

**Change Propagation Test (the killer differentiator):**

This is the test that proves ForgePlan Core is materially better than existing tools. After the client portal is fully built and all nodes are complete:

1. **Add a field to a shared model.** Add `phone: string` to the User shared model in the manifest.
2. Run `/forgeplan:revise` on every node that lists User in `shared_dependencies`.
3. **Measure:** do all nodes update correctly? Do any nodes retain the old User definition? Do the interfaces still pass?
4. Run `/forgeplan:integrate` to verify the system is still coherent.

**Brutal Real-World Test:**

Add document versioning to the system — a feature that ripples across every layer:
- Database schema changes (version column, version history table)
- API changes (version endpoints, version comparison logic)
- Frontend changes (version selector, diff view)
- Storage changes (multiple versions per document)

Run this modification through `/forgeplan:revise` and measure:
- How many nodes does the system correctly identify as affected?
- How many interface contracts need updating?
- After rebuilding affected nodes, does `/forgeplan:integrate` pass?

Compare the same modification done in vanilla Claude Code. **This is the proof point.** If ForgePlan Core handles this cleanly and vanilla Claude Code produces a mess, the thesis is validated.

**Exit criteria:** Measurable improvement on the success metric. Change propagation test passes. At least one complete project built with the plugin that demonstrates fewer broken references, fewer duplicate types, and fewer abandoned stubs than the same project built without it.

### Sprint 6: Autonomous Iterative Sweep — The Cross-Model Self-Improving Loop (Weeks 11–14)

**Goal:** Build the autonomous multi-agent codebase review system that alternates between models — Claude builds and fixes, a different model (Codex/GPT) reviews the fixes AND sweeps the full codebase for new issues — iterating until the alternate model returns clean on two consecutive passes.

**Why this exists:** Node-level review (Sprints 3–4) catches issues within a single node's spec boundaries. `/forgeplan:integrate` (Sprint 4) catches interface contract mismatches at the architectural level. But neither catches the class of bugs that only emerge when the full codebase is running together — cross-cutting concerns, subtle type drift in usage (not definition), import chain issues, inconsistent error handling patterns, race conditions at node boundaries, and performance problems that span multiple layers. These are the bugs that cause fifteen-loop manual review cycles. This sprint eliminates that loop.

**The critical insight:** Same-model review has systematic blind spots. A model is less likely to catch its own mistakes on re-review. The power of this system comes from the **alternating cross-model loop**: Claude writes and fixes, a different model audits. The alternate model finds things Claude missed because it has different training biases, different attention patterns, and different failure modes. The exit condition is that the *alternate model* — the one that didn't write the code — returns clean. That's a much stronger guarantee than same-model verification.

#### 6.1 Three-Level Review Architecture

The system operates at three distinct levels that compound on each other:

**Level 1: Node Review (already built).** Spec-scoped. Checks each node against its acceptance criteria, constraints, failure modes, and interfaces. Catches issues within a node's boundaries. Runs via `/forgeplan:review [node]`. Same model that built the node.

**Level 2: Same-Model Codebase Sweep.** Cross-cutting, full-codebase analysis using Claude's six parallel sweep agents. Not scoped to any single node. Catches obvious cross-node issues: type drift, inconsistent patterns, import problems, API mismatches. This is the "first pass" that cleans up what Claude can see about its own code before handing off to a different model.

**Level 3: Cross-Model Verification.** The alternate model (Codex, GPT, Gemini — configured in `config.yaml`) performs two jobs simultaneously via multiple parallel agents: **(A)** a Fix Verifier agent reviews every fix Claude made in Level 2 — did the fix actually resolve the finding, or did it introduce a new problem? **(B)** multiple Fresh Sweep agents independently scan the entire codebase looking for issues that Claude's blind spots missed entirely. The alternate model can run in CLI mode (spawning the user's existing Codex/Gemini CLI installation — no API key needed) or API mode (direct API calls for more structured responses).

Level 1 catches spec violations. Level 2 catches cross-cutting bugs within Claude's capability. Level 3 catches what Claude can't see about its own code. Fixes from Level 3 go back to Claude for fixing (Level 2). Claude fixes them. Level 3 re-verifies the fixes AND re-sweeps. This alternation continues until Level 3 returns clean on two consecutive passes.

The exit condition is specifically that the **alternate model** returns clean — not the model that wrote and fixed the code. This is the difference between "I checked my own homework" and "someone else checked my homework."

#### 6.2 The Cross-Model Alternating Sweep

The sweep is not a single-model process. The core mechanism is an **alternating loop between two different LLM providers** — the same pattern you're doing manually today between Claude and Codex, but automated.

**Why alternating matters:** Same-model review has blind spots. Claude will consistently miss certain categories of issues that Codex catches, and vice versa. A single-model sweep that runs ten passes will keep missing the same things on every pass. Alternating models means each pass catches issues the previous model was blind to. The codebase converges toward clean faster because two different sets of eyes are checking the work.

**The alternating cycle:**

1. **Claude Sweep** — Claude's parallel agents (six specialized subagents) scan the entire codebase. Findings collected into a sweep report.
2. **Claude Fix** — Claude's Builder agent fixes all findings from the Claude sweep.
3. **Codex Cross-Check** — The codebase is sent to the alternate model via the configured mode. In MCP mode (recommended), `cross-model-bridge.js` uses structured MCP tool calls to Codex — the cleanest integration with the user's existing subscription. In CLI mode, it spawns Codex CLI as a subprocess. In API mode, it makes direct API calls. Either way, Codex spawns its own parallel agents with two distinct jobs:
   - **Fix Verification Agents:** Review *only* the files Claude modified in step 2. Did Claude's fixes actually resolve the findings? Did the fixes introduce new problems?
   - **Full Codebase Sweep Agents:** Independently scan the *entire* codebase looking for issues Claude's sweep missed entirely. Different model, different blind spots, different findings.
4. **Claude Fix** — Claude's Builder fixes all findings from Codex's cross-check (both fix verification failures and new codebase findings).
5. **Codex Re-Cross-Check** — Codex verifies Claude's latest fixes AND sweeps the full codebase again.
6. **Repeat steps 4–5** until Codex returns clean on *both* fix verification and full codebase sweep for two consecutive passes.

**The exit condition is Codex saying "clean" twice in a row** — not Claude. The model that *didn't* write the code and *didn't* fix the bugs is the one that certifies the codebase. That's a much stronger guarantee than self-certification.

#### 6.3 Claude's Parallel Sweep Agents (Step 1)

Each sweep agent is a Claude Code subagent (using the Task tool) with a focused system prompt and a specific audit scope. They run in parallel — not sequentially — because their concerns are independent. A full sweep with six agents running in parallel takes roughly the same time as a single agent doing one review.

**Agent 1: Auth & Security Sweep**
- Scope: every file in the codebase
- Focus: session handling gaps, token expiration edge cases, role leakage across route boundaries, exposed secrets or API keys, missing input validation on user-facing endpoints, CORS configuration, CSP headers
- System prompt: "You are a security auditor. Review the entire codebase for authentication and authorization vulnerabilities. For each finding, cite the exact file, line, and the specific vulnerability. Do not report style issues or opinions — only concrete security risks."

**Agent 2: Type Consistency Sweep**
- Scope: all type definitions, interfaces, imports, and function signatures
- Focus: shared model usage drift (field accessed that doesn't exist on the canonical type, type assertion bypassing the shared model, local type that shadows a shared model name without matching its structure), inconsistent nullable handling across nodes
- System prompt: "You are a type system auditor. Verify that every usage of shared model types matches the canonical definition in the manifest. Check for local redefinitions, missing fields, extra fields, incorrect types, and any type assertions that bypass the shared model structure. For each finding, cite the file, the expected type, and the actual usage."

**Agent 3: Error Handling Sweep**
- Scope: all try/catch blocks, error returns, error boundaries, API error responses
- Focus: inconsistent error formats across nodes (one node returns `{error: "message"}`, another returns `{code: 401, detail: "message"}`), uncaught promise rejections, missing error boundaries in React components, silent failures where errors are caught but not logged or surfaced
- System prompt: "You are an error handling auditor. Review the entire codebase for inconsistent error patterns, uncaught exceptions, silent failures, and missing error boundaries. Every API endpoint should return errors in the same format. Every async operation should have error handling. For each finding, cite the file and the specific inconsistency."

**Agent 4: Database & Query Sweep**
- Scope: all database queries, migrations, schema definitions
- Focus: N+1 query patterns, missing indexes on frequently queried columns, queries that don't match the schema (referencing columns that don't exist or using wrong types), missing migration files for schema changes, raw SQL injection risks in dynamic queries
- System prompt: "You are a database auditor. Review all database interactions for performance issues, schema mismatches, missing migrations, and injection risks. For each finding, cite the query, the file, and the specific issue."

**Agent 5: API Contract Sweep**
- Scope: all API routes, all frontend API calls, all middleware
- Focus: frontend calling an endpoint that doesn't exist, endpoint returning a shape that doesn't match what the frontend destructures, middleware applied inconsistently across routes that should have the same protection, API versioning inconsistencies
- System prompt: "You are an API contract auditor. For every frontend API call, verify the corresponding backend endpoint exists, accepts the parameters being sent, and returns the shape being destructured. For every protected route, verify the auth middleware is applied. For each finding, cite both the frontend call and the backend endpoint."

**Agent 6: Import & Dependency Sweep**
- Scope: all import statements, package.json, module resolution
- Focus: circular import chains that span multiple files, unused imports, missing dependencies (imported but not in package.json), duplicate utility functions that should be shared, dead code (exported functions that nothing imports)
- System prompt: "You are a dependency auditor. Trace all import chains for circular dependencies. Identify unused imports, missing package dependencies, duplicate utility functions, and dead code. For each finding, cite the specific import chain or unused export."

#### 6.4 The Sweep Report Format

Each agent produces a structured findings list. These are merged into a unified sweep report at `.forgeplan/sweeps/sweep-[timestamp].md`:

```
## Codebase Sweep — Pass 1
### Timestamp: 2026-05-15T14:30:00Z
### Agents: 6 parallel | Duration: 3m 42s

### Auth & Security (Agent 1)
- FINDING-S1: src/api/routes/documents.ts:47 — upload endpoint missing file type validation. Accepts any file extension. Risk: malicious file upload.
- FINDING-S2: src/auth/middleware.ts:12 — JWT expiration set to 30 days. Recommend 24 hours with refresh token.
- Total: 2 findings

### Type Consistency (Agent 2)
- FINDING-T1: src/api/handlers/user.ts:23 — accesses user.phone but User shared model does not define phone field. Will throw at runtime.
- Total: 1 finding

### Error Handling (Agent 3)
- FINDING-E1: src/api/routes/auth.ts:34 — returns {error: "invalid"} but src/api/routes/documents.ts:56 returns {message: "not found", status: 404}. Inconsistent error format.
- FINDING-E2: src/pages/dashboard.tsx:89 — async fetch in useEffect with no error handling. Silent failure on network error.
- Total: 2 findings

### Database & Query (Agent 4)
- No findings

### API Contract (Agent 5)
- FINDING-A1: src/pages/accountant-view.tsx:34 — calls GET /api/clients but no such endpoint exists. Only GET /api/users with role filter.
- Total: 1 finding

### Import & Dependency (Agent 6)
- FINDING-I1: Circular import: src/lib/auth.ts → src/lib/api.ts → src/hooks/useAuth.ts → src/lib/auth.ts
- FINDING-I2: src/utils/formatDate.ts is exported but never imported anywhere. Dead code.
- Total: 2 findings

### Summary
- Total findings: 8
- Critical (blocks deployment): 2 (FINDING-S1, FINDING-A1)
- Warning (should fix): 4 (FINDING-S2, FINDING-T1, FINDING-E1, FINDING-E2)
- Minor (cleanup): 2 (FINDING-I1, FINDING-I2)
- Status: REQUIRES FIXES — proceeding to auto-fix cycle
```

#### 6.5 Codex Cross-Check Agents (Steps 3 and 5)

After Claude fixes its own sweep findings, the codebase is sent to the alternate model for cross-checking. In MCP mode (recommended), `cross-model-bridge.js` uses structured MCP tool calls — cleanest integration, existing subscription, no API key. In CLI mode, it spawns Codex CLI as a child process. In API mode, it makes direct API calls. Either way, the alternate model spawns its own parallel agents with two distinct responsibilities:

**Fix Verification Agents (scoped to modified files only):**

These agents receive the list of files Claude modified during the fix cycle and the original findings those fixes were meant to address. They verify:
- Did the fix actually resolve the original finding? (Not just suppress it — actually fix the root cause.)
- Did the fix introduce any new issues in the modified files?
- Is the fix consistent with the patterns used elsewhere in the codebase?

This is fast because it's scoped to only the changed files, not the whole codebase.

**Full Codebase Sweep Agents (entire codebase, fresh eyes):**

These are Codex's equivalent of Claude's six parallel agents — but running on a different model with different blind spots. They can be organized by the same concern areas (security, types, errors, database, API, imports) or Codex can take its own approach to organizing the review. The key is that they scan the *entire* codebase independently, not just the files Claude touched. This catches the class of issues that Claude consistently misses regardless of how many passes it runs.

Codex's findings are collected into a cross-check report at `.forgeplan/sweeps/crosscheck-[timestamp].md` with the same structured format as Claude's sweep report, plus a section for fix verification results:

```
## Cross-Check Report — Codex Pass 1
### Fix Verification (12 files reviewed)
- FIX-S1 (file validation): VERIFIED — fix correctly validates file extensions
- FIX-A1 (missing endpoint): VERIFIED — endpoint added, matches frontend call
- FIX-E1 (error format): PARTIAL — auth routes fixed but documents route still inconsistent
- Total: 2 verified, 1 partial

### New Codebase Findings
- XFINDING-1: src/auth/oauth.ts:67 — Google OAuth callback does not validate state parameter. CSRF risk.
- XFINDING-2: src/api/middleware/auth.ts:23 — JWT verification uses HS256 but Supabase issues RS256 tokens. Will reject valid tokens.
- XFINDING-3: src/pages/dashboard.tsx:112 — document list fetched on every render, no caching or deduplication. Performance issue.
- Total: 3 new findings (Claude missed these on all passes)

### Summary
- Fix verification: 2 clean, 1 needs rework
- New findings: 3
- Status: REQUIRES FIXES — returning to Claude for remediation
```

#### 6.6 The Complete Alternating Fix Cycle

The full cycle after Claude's initial sweep:

1. **Claude fixes its own sweep findings.** Grouped by node. PreToolUse enforcement active. Cross-node fixes use sweep-fix mode with explicit logging. Modified nodes get a quick Level 1 spec re-review to catch regressions.

2. **Codex cross-checks.** Fix verification agents review modified files. Full codebase sweep agents scan everything. Cross-check report generated.

3. **Claude fixes Codex's findings.** Both the partial fix verifications and the new findings Codex discovered. Same node-scoped fix process with logging.

4. **Codex re-cross-checks.** Verifies Claude's latest fixes resolved Codex's findings. Sweeps the full codebase again — because Claude's fixes for Codex's findings might have introduced something new.

5. **Repeat steps 3–4** until Codex returns: all fix verifications VERIFIED, zero new codebase findings, on two consecutive passes.

**Why two consecutive clean Codex passes:** The first clean pass means Codex found nothing. But Claude's fixes from the previous cycle might have introduced subtle issues that only become visible on re-analysis. The second clean pass confirms stability — the codebase was clean, it was re-examined, and it's still clean. Two consecutive clean passes from the model that didn't write the code is the strongest automated quality guarantee possible.

**Typical cycle count:** Based on the manual workflow pattern (4–15 loops), the automated version should converge in 2–4 full alternating cycles for a well-specced project, because the specs prevent the structural problems that cause high loop counts. The spec eliminates ambiguity upfront, so most findings are surface-level issues (missing validation, inconsistent patterns) rather than architectural problems that cascade.

#### 6.7 The Autonomous Loop: `/forgeplan:deep-build`

The full autonomous sequence, combining everything from Sprints 1–6:

```
/forgeplan:deep-build

Step 1: Build all pending nodes (dependency order)
  └─ For each node:
     ├─ Pre-build spec challenge (identify ambiguities)
     ├─ Builder generates code with anchor comments
     ├─ PreToolUse enforces spec on every write
     ├─ Stop hook verifies acceptance criteria
     └─ Status → review

Step 2: Review all built nodes (per-node, Level 1)
  └─ For each node:
     ├─ Reviewer audits 7 dimensions with spec-diff
     ├─ FAIL items → Builder fixes → re-review
     └─ Status → complete

Step 3: Integration check
  └─ /forgeplan:integrate
     ├─ Verify interface contracts
     ├─ Verify shared model consistency
     └─ Fix any mismatches

Step 4: Claude codebase sweep (parallel agents)
  └─ 6 agents run in parallel
     ├─ Findings collected into sweep report
     └─ Claude Builder fixes all findings

Step 5: Codex cross-check (parallel agents)
  └─ Fix verification agents → review Claude's fixes
  └─ Full codebase sweep agents → find what Claude missed
     ├─ Cross-check report generated
     └─ Claude Builder fixes all Codex findings

Step 6: Codex re-cross-check
  └─ Verify latest fixes + full codebase re-sweep
     ├─ If findings → Claude fixes → Codex re-checks (repeat)
     └─ If clean → one more Codex pass (stability confirmation)
        └─ If clean → DONE (two consecutive Codex-clean passes)

Step 7: Final report
  └─ .forgeplan/deep-build-report.md
     ├─ Total build time
     ├─ Nodes built: 7
     ├─ Node review cycles per node
     ├─ Claude sweep passes: 1
     ├─ Codex cross-check passes: 3 (2 clean)
     ├─ Total findings found and fixed: 15
     ├─ Findings by source: Claude sweep: 8, Codex cross-check: 7
     ├─ Final state: ALL PASS (certified by cross-model verification)
     └─ Codebase ready for deployment
```

The user runs `/forgeplan:deep-build`, walks away, and comes back to a fully built, fully reviewed, fully cross-model-verified codebase with a complete audit trail. Every finding and fix is documented. The exit condition is objective: two consecutive clean cross-check passes from the alternate model, with all node-level reviews passing.

The deep build report explicitly tracks findings by source model — showing how many issues Claude caught versus how many Codex caught. Over time, this data reveals each model's blind spots and can inform which model is assigned to which sweep agent role for optimal coverage.

#### 6.8 Self-Improvement: Pointing the Loop at Itself

When the sweep system is used to build and review ForgePlan's own codebase, a compounding cross-model improvement cycle emerges:

- Codex's cross-check reviews the PreToolUse hook code. It finds an edge case where the shared model guard doesn't catch type aliases — something Claude missed because Claude wrote the code. The Builder fixes it. The improved PreToolUse hook catches more issues in future builds, which means fewer findings reach the sweep phase.
- Codex's cross-check reviews Claude's sweep agent prompts. It finds that Agent 3 (Error Handling) is producing vague findings that make auto-fixing imprecise. The prompt is tightened. The improved Agent 3 produces more specific findings on the next sweep, which means the Builder fixes them more accurately, which means fewer re-sweep cycles.
- Codex catches an issue in the `cross-model-bridge.js` script itself that Claude consistently missed. The fix makes Codex cross-checks more reliable, which means the alternating loop converges faster.
- The deep-build report tracks findings by source model across multiple builds. Over time, a pattern emerges: Claude consistently misses CSRF-related issues but catches type drift reliably, while Codex catches CSRF but misses circular imports. This data is used to refine both models' sweep agent prompts, making each subsequent build cleaner at every level.

Each pass through the loop improves the quality of the tools doing the reviewing, which improves the quality of the reviews, which improves the quality of the code, which reduces the number of cycles needed. And because the improvement is driven by cross-model feedback — each model exposing the other's blind spots — the convergence is faster than any single-model self-improvement loop could achieve. The system doesn't just get cleaner. It gets faster at getting clean.

#### 6.9 Sprint 6 Deliverables

**Weeks 11–12:**
- Six Claude sweep agent definitions with specialized system prompts
- `/forgeplan:sweep` command that spawns Claude's parallel subagents and merges findings into unified sweep report
- Sweep report format and `.forgeplan/sweeps/` directory structure
- Claude auto-fix cycle: group findings by node, fix with scope enforcement, re-review modified nodes
- Sweep-fix mode for cross-node modifications with explicit logging
- Cross-check report format for Codex responses at `.forgeplan/sweeps/crosscheck-[timestamp].md`

**Weeks 13–14: Deep Build + Cross-Model Integration + Dogfood**
- Codex cross-check integration via `cross-model-bridge.js` with three-mode support: MCP mode (structured tool calls via `claude mcp add codex` — recommended, cleanest, existing subscription), CLI subprocess mode (spawns Codex CLI, existing subscription), and API mode (direct API calls, requires key). MCP mode is the recommended default for Codex specifically; CLI mode is the fallback for other models.
- Codex parallel agent orchestration: fix verification agents (scoped to modified files) and full codebase sweep agents (entire codebase) running simultaneously via the alternate model
- The alternating fix cycle: Claude fix → Codex cross-check → Claude fix → Codex re-cross-check → repeat until two consecutive clean Codex passes
- `/forgeplan:deep-build` command that chains the full sequence: build → node review → integrate → Claude sweep → Claude fix → Codex cross-check → Claude fix → Codex re-cross-check → until clean → final report
- Deep build report generation at `.forgeplan/deep-build-report.md` with findings tracked by source model
- Test all three modes for cross-model review. Verify MCP mode works with zero API key configuration and produces structured responses.
- Dogfood: run `/forgeplan:deep-build` on the client portal project using MCP mode (codex-mcp). Measure alternating cycle count. Compare findings caught by Claude vs Codex.
- Dogfood: run `/forgeplan:deep-build` on ForgePlan's own codebase. Document self-improvement findings.

**Test:** Run `/forgeplan:sweep` on a codebase with known planted bugs. Verify Claude's agents find their respective issues. Fix them. Run Codex cross-check — verify it catches at least one issue Claude missed (plant a subtle bug that Claude's prompt isn't tuned for). Fix it. Run Codex again — verify clean. Run Codex a third time (stability pass) — verify still clean. Run `/forgeplan:deep-build` end-to-end on the client portal. Verify the final report shows two consecutive clean Codex passes and documents all findings by source model.

**Exit criteria:** `/forgeplan:deep-build` runs autonomously on the client portal project. Completes without human intervention. Codex certifies the codebase clean on two consecutive passes. Deep build report shows findings from both models, demonstrating that cross-model review caught issues single-model review missed. Total autonomous build time for the 7-node client portal is under 90 minutes.

**Success metric:** Compare the deep-build output to the Sprint 5 manual build output. Measure: does the cross-model alternating loop catch issues the manual process missed? Is the final codebase quality equal or better? How many alternating cycles were needed? Does the cycle count decrease when running deep-build on subsequent projects (convergence improvement)?

---

## What Is Deferred (Not Cut)

Everything below remains in the vision document. None of it is built until the plugin proves the core thesis.

| Feature | Why It's Deferred | When It Unlocks |
|---------|-------------------|-----------------|
| Phantom previews | Requires visual canvas; not needed to prove harness value | Standalone app Phase 1 |
| Desktop shell (Tauri + React Flow + Monaco) | Major engineering investment; premature before harness is proven | After plugin reaches 500+ active users |
| Marketplace (templates + components) | Requires user base to generate content | After 50+ projects built with the plugin |
| Deployment layer | Vercel/Supabase deployment can be done manually; not the differentiator | Standalone app Phase 1 |
| Multiplayer / collaboration | Single-user harness must work first | Standalone app Phase 2 |
| Non-technical builder positioning | Different audience, different onboarding, different GTM | After developer harness is proven |
| Bidirectional sync (code → architecture) | Only needed for Tier 3 in standalone app; plugin generates code, doesn't parse it back | Standalone app Phase 2 |
| Architecture branching | Linear snapshots (via git) sufficient for V1 | Standalone app Phase 2 |
| Full architectural versioning | Git handles this adequately for the plugin | Standalone app Phase 2 |

---

## Week 1 — What to Do Monday

1. **Create the plugin scaffold.** `forgeplan-plugin/` with `.claude-plugin/plugin.json`, all directory stubs, empty command/skill/agent files.

2. **Define the manifest schema.** Write the YAML template with `project`, `shared_models`, `validation`, and `nodes` sections. Include the client portal as the reference example.

3. **Define the node spec schema.** Write the YAML template with all fields: `inputs`, `outputs`, `shared_dependencies`, `data_models`, `interfaces` (with `type`), `acceptance_criteria` (with `id` and `test`), `constraints`, `non_goals`, `failure_modes`, `file_scope`, `depends_on`. Use the auth node as the reference example. This template is the most important artifact in the system — everything downstream depends on its quality.

4. **Write `validate-manifest.sh`.** Topological sort for cycle detection. Orphan node check. File scope overlap check. This is the first script that makes the manifest more than a document.

5. **Write the Architect agent prompt** (`agents/architect.md`). The discovery conversation framework, explicit node decomposition rules (never collapse auth/api/database/storage into one node), shared model identification instructions, text-based summary format, validation trigger after every manifest write.

6. **Write the `/forgeplan:discover` command** (`commands/discover.md`). Wire it to the Architect agent.

7. **Test it.** Run `/forgeplan:discover` in a fresh directory. Describe the client portal. See if a valid, useful manifest comes out the other end.

That's day one through day three. If the discovery flow produces a good manifest, the rest of the sprint is spec schema and templates. If it doesn't, iterate until it does — because if the architecture can't be defined well, nothing else matters.

---

## Relationship to the Grand Vision

This execution plan is **Sprint 1 through Sprint 6 of Section 17** in the concept document. Sprints 1–5 deliver the architecture-governed build harness. Sprint 6 delivers the autonomous iterative sweep system — the self-improving review loop that turns ForgePlan from a build tool into an autonomous quality engineering platform. Everything in Sections 1–16 and 18–23 of the concept document remains the long-term product direction. The concept document is the north star. This document is the first set of directions to get on the road.

When the plugin proves the four things, the next document will be: **ForgePlan Workstation — Standalone Application Build Plan**, covering the Tauri shell, React Flow canvas, Monaco integration, and the visual rendering of the `.forgeplan/` directory that developers have already been building in their terminals. The `/forgeplan:deep-build` autonomous loop becomes the "Deep Build" premium feature in the visual workstation — the user clicks a button, walks away, and comes back to a fully built, fully reviewed, fully swept application.

The vision is intact. The build starts now.
