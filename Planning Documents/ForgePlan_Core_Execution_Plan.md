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
├── config.yaml                # BYOK and preferences (optional)
├── state.json                 # Ephemeral session state (includes sweep_state for Sprint 6)
├── deep-build-report.md       # Sprint 6: final deep-build certification report
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
├── reviews/
│   ├── auth.md                # Structured review reports
│   └── api.md
└── sweeps/                    # Sprint 6: codebase sweep outputs
    ├── sweep-[timestamp].md   # Claude sweep findings
    └── crosscheck-[timestamp].md  # Cross-model verification findings
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

Nine commands ship in Sprints 1–5. Two additional commands ship in Sprint 6. One ships in Sprint 8. Each maps to a clear user action. Sprint 7 adds ambient capabilities (skills, hooks) rather than new commands.

| Command | What It Does |
|---------|-------------|
| `/forgeplan:discover` | Guided conversation → manifest + skeleton specs. Text-based architecture summaries after each addition. Validates for cycles, orphans, scope overlaps. |
| `/forgeplan:spec [node\|--all]` | Generate detailed node spec. `--all` generates in dependency order. User reviews and edits in natural language. |
| `/forgeplan:build [node]` | Set active node. Inject spec + interfaces + shared models. Builder agent generates code with anchor comments. Hooks enforce compliance. |
| `/forgeplan:review [node]` | Audit against seven dimensions (spec compliance, interfaces, security, patterns, anchor comments, non-goal violations, failure mode coverage). Native agent or cross-model via BYOK. Structured pass/fail report. |
| `/forgeplan:revise [node]` | Reopen completed node. Analyze change impact (internal vs interface). Flag affected nodes. |
| `/forgeplan:next` | Dependency-aware next node recommendation. Surfaces stuck/crashed nodes. Surfaces nodes needing rebuild after revision. |
| `/forgeplan:status` | Full project status with text-based dependency graph visualization. |
| `/forgeplan:integrate` | Cross-node interface verification. Identifies which side is at fault. Recommends remediation. |
| `/forgeplan:recover` | Detect and handle crashed builds, interrupted sweeps, and interrupted deep-builds. Resume, restart pass, reset, abort, or flag for manual review. |
| `/forgeplan:sweep` | *Sprint 6.* Claude's parallel agents sweep the codebase, fix findings (node-scoped enforcement active during fixes), then the alternate model (Codex/Gemini via MCP, CLI subprocess, or API) cross-checks the fixes AND re-sweeps for issues Claude missed. Re-integrates after each fix cycle. Alternates until two consecutive clean passes from the alternate model. |
| `/forgeplan:deep-build` | *Sprint 6.* Full autonomous sequence: build all → node review → integrate → Claude sweep → fix → re-integrate → cross-check → fix → re-integrate → repeat → final integrate → report. Tracks `sweep_state` for crash recovery. User walks away, comes back to a finished, cross-model-certified codebase. |
| `/forgeplan:research [node\|--all]` | *Sprint 8.* Research agents search GitHub/npm/PyPI for existing implementations, check license compatibility, gather API docs and best practices. Findings saved to `.forgeplan/research/[node].md` and fed to the builder. |

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
- **Sprint 6 addition:** Also check for `sweep_state` in state.json. If `sweep_state.operation` is non-null, a sweep or deep-build was interrupted. Inject warning with recovery instructions.

**Note:** Sprint 6 extends PreToolUse with sweep-mode enforcement (node-scoped fix mode + sweep analysis mode) and PostToolUse with sweep-mode file tracking. See "Sprint 6: Operational Model" for full specification.

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

**Cross-model implementation:** When BYOK configures a different provider, the `cross-model-review.js` script handles the API call, prompt assembly, response parsing, error handling, and retry logic. When BYOK is not configured, the review runs as a native Claude Code subagent.

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
- Full BYOK multi-provider configuration with cross-model-review.js
- Multiple blueprint templates beyond client portal
- `/forgeplan:recover` crash recovery (can be tested manually by resetting state.json)
- `/forgeplan:integrate` full system verification (can be done manually by reviewing interfaces)
- Broader hardening of PreToolUse Layer 2 prompt quality across edge cases
- `/forgeplan:status` text-based dependency visualization

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

## Sprint Plan — 14 Weeks

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

**Already completed during Sprint 2 hardening:**
- Stop hook with bounce counter — `stop-hook.js` (Layer 1 deterministic) + prompt hook (Layer 2 LLM evaluating criteria by ID). Wired in `hooks.json`.
- SessionStart hook for crash detection — `session-start.js`. Wired in `hooks.json`.
- PreToolUse enforcement for reviewing and revising statuses — per-operation write boundaries in `pre-tool-use.js`
- Node-level conversation logging — `post-tool-use.js` appends to `.forgeplan/conversations/nodes/[node-id].md`

**Remaining deliverables:**
- `/forgeplan:review` command with Reviewer agent (native mode) — command and agent are defined, needs functional testing
- Spec-diff review format: per-criterion pass/fail with code evidence citations, per-constraint enforced/violated, per-interface implemented/missing, per-failure-mode handled/absent (no generic feedback allowed)
- `/forgeplan:recover` command with resume/reset/manual-review options — command is defined, needs functional testing
- `/forgeplan:revise` command with change impact analysis and two-step remediation (re-spec then rebuild affected nodes) — command is defined, needs functional testing
- Verify Stop hook correctly gates the building→built transition (the Stop hook owns this transition, not the build command)
- End-to-end build→review→revise→recover loop testing

**Test:** Build and review `auth` node. Verify review report cites specific files for each criterion pass/fail. Intentionally leave AC3 (session persistence) unmet — verify Stop hook bounces with "AC3: FAIL" message. Kill the terminal mid-build — verify SessionStart detects the stuck node on next launch. Revise the `auth` spec to change an interface — verify connected nodes are flagged and the two-step remediation (re-spec then rebuild) is recommended.

### Sprint 4: Integration and BYOK (Weeks 7–8)

**Goal:** Multi-node projects complete the full lifecycle. Cross-model review works.

**Deliverables:**
- `cross-model-review.js` script (OpenAI, Google, Anthropic API support)
- BYOK `config.yaml` with strict/non-strict mode
- `/forgeplan:integrate` command with fault-side identification and remediation guidance
- `/forgeplan:status` command with text-based dependency visualization
- Remaining blueprint templates (SaaS starter, internal dashboard)
- Documentation and README

**Test:** Build the complete 7-node client portal using the plugin. Run `/forgeplan:integrate` and verify all interfaces pass. Configure BYOK with a different reviewer model and confirm cross-model review produces a valid report.

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

**Goal:** Build the autonomous multi-agent codebase review system that alternates between models — Claude builds and fixes, a different model (Codex/GPT/Gemini) reviews the fixes AND sweeps the full codebase for new issues — iterating until the alternate model returns clean on two consecutive passes.

**Why this exists:** Node-level review (Sprints 3–4) catches issues within a single node's spec boundaries. `/forgeplan:integrate` (Sprint 4) catches interface contract mismatches. But neither catches cross-cutting bugs that only emerge when the full codebase runs together — type drift in usage, import chain issues, inconsistent error handling, race conditions at node boundaries. These are the bugs that cause 4–15 manual review cycles. This sprint eliminates that loop.

**Three-Level Review Architecture:**
- **Level 1 (existing):** Node review — spec-scoped, native agent or cross-model via BYOK (Sprint 4), per acceptance criteria
- **Level 2 (new):** Claude codebase sweep — 6 parallel agents (auth/security, type consistency, error handling, database, API contracts, imports) scan full codebase for cross-cutting issues that node-scoped review cannot see
- **Level 3 (new):** Cross-model verification — alternate model verifies Claude's fixes AND independently sweeps for issues Claude missed

#### Operational Model — Sweep/Deep-Build State and Enforcement

Sprint 6 introduces two new operation modes that operate outside the existing node-scoped state machine. These require explicit state tracking, enforcement rules, and recovery semantics — the same first-class treatment given to building, reviewing, and revising in Sprints 2–3.

**New state: `sweep_state` in state.json**

A new top-level object alongside `active_node`. When a sweep or deep-build is running, `active_node` is null (no single node is being built), but `sweep_state` is populated:

```json
{
  "sweep_state": {
    "operation": "sweeping | deep-building",
    "started_at": "ISO 8601",
    "current_phase": "claude-sweep | claude-fix | cross-check | cross-fix | integrate | finalizing",
    "pass_number": 1,
    "current_model": "claude | codex | gemini | gpt",
    "fixing_node": "auth | null",
    "consecutive_clean_passes": 0,
    "max_passes": 10,
    "findings": {
      "pending": [
        { "id": "F1", "source_model": "claude", "node": "auth", "category": "type-consistency", "description": "...", "pass_found": 1 }
      ],
      "resolved": [
        { "id": "F0", "source_model": "codex", "node": "api", "category": "imports", "resolved_by": "claude", "resolved_pass": 2 }
      ]
    },
    "modified_files_by_pass": {
      "1": ["src/auth/middleware.ts", "src/shared/types/index.ts"],
      "2": ["src/api/routes.ts"]
    },
    "integration_results": {
      "last_run": "ISO 8601 | null",
      "passed": true,
      "failures": []
    }
  }
}
```

**`active_node.status` enum update:** Add `"sweeping"` to the enum in `state-schema.json`. This status is used when the sweep is fixing a specific node — `active_node` is set to that node with status `"sweeping"` while the fix is in progress, then cleared when the fix for that node completes. This reuses the existing node-scoped enforcement for individual fixes. The distinction between sweep and deep-build is tracked by `sweep_state.operation`, not by `active_node.status` — there is no need for a separate `"deep-building"` status since the enforcement behavior is identical.

**PreToolUse enforcement during sweep/deep-build:**

When `sweep_state` is active, PreToolUse operates in one of two modes:

1. **Node-scoped fix mode** (`sweep_state.fixing_node` is set, `active_node` is set with status `"sweeping"`): Existing node-scoped enforcement applies — writes restricted to that node's `file_scope`, shared model guard active. This is the same deterministic enforcement used during normal builds. The only addition: writes to `.forgeplan/sweeps/` and `.forgeplan/state.json` are always allowed. **Exception for shared types:** Unlike normal builds, sweep fixes MAY modify `src/shared/types/index.ts` if the finding specifically involves shared type inconsistency (e.g., type-consistency category findings). This is because sweep fixes play the role of both builder and reviser — they must be able to fix whatever the sweep found. The shared model redefinition guard still applies (no local redefinitions), but the canonical shared types file is writable during sweep fixes.

2. **Sweep analysis mode** (`sweep_state.fixing_node` is null, `active_node` is null): Only `.forgeplan/sweeps/`, `.forgeplan/deep-build-report.md`, and `.forgeplan/state.json` are writable. No project source files can be written — analysis is read-only until a finding is assigned to a node for fixing.

This preserves the node-boundary enforcement that is the core of ForgePlan's value even during autonomous cross-codebase operations. Sweep agents cannot scatter fixes across the codebase without going through the node-scoped gate.

**PostToolUse behavior during sweep/deep-build:**

PostToolUse currently only activates when `active_node.status === "building"`. During sweep fixes (`active_node.status === "sweeping"`), PostToolUse must also activate with the same behavior — auto-register files in the manifest, log changes to conversation files, and classify files as created vs. modified. Additionally, every file written during a sweep fix is appended to `sweep_state.modified_files_by_pass[current_pass]`. This dual tracking (node-level in manifest + pass-level in sweep_state) ensures both the manifest stays accurate and the sweep has a complete picture of what each pass touched.

**Deep-build "build all" orchestration:**

The deep-build sequence begins with "build all nodes." This is not a new parallel build mechanism — it is a sequential loop that reuses the existing `/forgeplan:build` → `/forgeplan:review` → `/forgeplan:next` pipeline. The deep-build orchestrator iterates: call `/forgeplan:next` to get the recommended node, run `/forgeplan:build` on it, run `/forgeplan:review` on it, repeat until `/forgeplan:next` returns `type: "complete"`. All existing enforcement (PreToolUse, PostToolUse, Builder agent) applies exactly as in manual builds. The only difference is that the orchestrator drives the loop instead of the user.

**Re-integration gate:**

`/forgeplan:integrate` runs at three points in the deep-build sequence, not one:
1. **After initial node builds and reviews** — baseline integration check (existing behavior)
2. **After each Claude fix cycle** — verify fixes haven't broken cross-node contracts
3. **As the final certification gate** — must pass before the deep-build can declare clean

Updated deep-build sequence: `build all → node review → **integrate** → Claude sweep → Claude fix → **re-integrate** → cross-check → cross-fix → **re-integrate** → repeat until 2 consecutive clean passes → **final integrate** → report`

**Agent Design Principles (adopted from superpowers patterns):**

These principles apply to ALL agents in ForgePlan, but are especially critical for Sprint 6's autonomous operations:

1. **Fresh Agent on Fix, Not Same Agent Retry.** When a review finds issues and the builder must fix them, spawn a NEW builder agent with the original spec + review findings + current code. Do not have the same agent that produced the bug try to fix it — it will get stuck in its own reasoning loop. This applies to the build→review→rebuild cycle, to sweep fix iterations, and to cross-model remediation cycles.

2. **Don't Trust the Builder.** The Reviewer must independently verify everything by reading actual code. The Builder's self-report ("AC1 is implemented in login.ts") is input to the review, not a substitute for verification. The Reviewer reads login.ts and compares against the spec line-by-line.

3. **Structured Agent Status Protocol.** Agents report completion using a fixed enum (`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`) instead of free-text claims. The orchestrator switch-cases on this enum for deterministic flow control. Status transitions (e.g., "building" → "built") are gated on independent verification, not on the agent setting `DONE`.

4. **Scoped Context Per Agent.** Each agent receives ONLY the context it needs — its node spec, adjacent interface contracts, and relevant shared model definitions. Full project context is not injected. This prevents cross-contamination, reduces token usage, and makes parallel dispatch safe.

5. **Model Tiering by Complexity.** Simple leaf nodes with narrow specs → cheaper/faster model. Complex integration nodes with many dependencies → most capable model. The sweep agents can be tiered too: type consistency checks (mechanical, pattern-matching) → cheaper model; security audit (reasoning-heavy) → most capable model.

6. **Adversarial Prompt Testing Before Deployment.** Before Sprint 6 goes live, run pressure scenarios against builder and reviewer prompts. Test: Does the builder deviate from spec under time pressure? Does the reviewer rubber-stamp when given a "looks complete" preamble? Document failure modes and add explicit counters to prompts.

If re-integration fails after a fix cycle, the integration failures become new findings in the sweep, and the loop continues. This prevents the stale-integration problem where sweep fixes silently break contracts validated earlier.

#### Recovery and Resumability

Sweep and deep-build are the longest-running autonomous operations in ForgePlan. Crash recovery is not optional.

**Crash detection:** `SessionStart` hook checks for `sweep_state` in addition to `active_node`. If `sweep_state` exists with a non-null `operation`, a sweep or deep-build was interrupted.

**`/forgeplan:recover` behavior for sweep/deep-build:**

When recovery detects an interrupted sweep or deep-build, it offers three options:

1. **Resume from last completed pass** — Restores `sweep_state`, re-reads the sweep/crosscheck reports already on disk, and continues from `pass_number`. Findings already marked resolved stay resolved. The current pass is re-run from scratch (since partial fix state within a pass is not recoverable).

2. **Restart current pass** — Keeps all state from prior passes but re-runs the interrupted pass from the beginning. Useful when the crash happened mid-fix and the codebase may be in a partially-modified state for the current pass.

3. **Abort to pre-sweep state** — Resets `sweep_state` to null. All nodes retain their current status (built/reviewed). Sweep reports remain on disk for reference but the autonomous loop is terminated. User can re-run `/forgeplan:sweep` or `/forgeplan:deep-build` manually.

**State persistence:** `sweep_state` is written to `state.json` after every significant transition: phase change, pass increment, finding resolution, integration result. This ensures recovery has an accurate snapshot even if the crash happens between operations.

**Pass limit safety:** `max_passes` defaults to 10. If the loop reaches `max_passes` without achieving two consecutive clean passes, it halts and produces a report with all unresolved findings. This prevents infinite autonomous loops.

#### Deliverables (Weeks 11–12)

- `sweep_state` schema additions to `state-schema.json`
- PreToolUse sweep-mode enforcement (node-scoped fix mode + sweep analysis mode)
- SessionStart sweep/deep-build crash detection
- `/forgeplan:recover` sweep/deep-build resume/restart/abort options
- Six Claude sweep agent definitions with specialized system prompts (categories: auth-security, type-consistency, error-handling, database, api-contracts, imports)
- `/forgeplan:sweep` command spawning parallel subagents, merging findings into `.forgeplan/sweeps/sweep-[timestamp].md`
- Claude auto-fix cycle: group findings by node, fix with scope enforcement (reusing node-scoped PreToolUse), re-review modified nodes
- PostToolUse sweep-mode activation (file registration + pass-level modified-file tracking)
- `next-node.js` sweep awareness: add `"sweeping"` to stuck status detection, return "sweep in progress" when `sweep_state` is active
- `validate-manifest.js` status list update: add `"sweeping"` to valid node statuses
- `/forgeplan:integrate` sweep-mode prerequisite: verify no node is currently in `"sweeping"` status before running integration checks
- Cross-check report format at `.forgeplan/sweeps/crosscheck-[timestamp].md`

#### Deliverables (Weeks 13–14)

- Extend `cross-model-review.js` (Sprint 4) into `cross-model-bridge.js` — same script, expanded with sweep orchestration capabilities. Three-mode support: MCP mode (recommended, existing subscription), CLI subprocess mode, and API mode. The Sprint 4 single-node review functionality is preserved as a subset.
- Alternate model parallel agent orchestration: fix verification agents (scoped to modified files) + full codebase sweep agents (entire codebase)
- The alternating fix cycle: Claude fix → **re-integrate** → cross-check → Claude fix → **re-integrate** → re-cross-check → repeat until two consecutive clean passes
- `/forgeplan:deep-build` command chaining the full autonomous sequence: build all → node review → integrate → Claude sweep → fix → re-integrate → cross-check → fix → re-integrate → repeat → final integrate → report
- Deep build report at `.forgeplan/deep-build-report.md` with findings tracked by source model, pass number, and resolution status

#### Implementation Notes (from cross-model code review)

These items were identified during independent code review of the Sprint 6 plan against the existing Sprint 1–4 codebase. They must be addressed during Sprint 6 implementation:

**Hook updates — comprehensive file checklist for `"sweeping"` status:**
- `state-schema.json` — add `"sweeping"` to `active_node.status` enum, add `sweep_state` as top-level object
- `pre-tool-use.js` — add sweep analysis mode + node-scoped fix mode (lines 108-112 early return must check `sweep_state` before allowing all writes). Add `cross-model-bridge.js` to the Bash whitelist.
- `post-tool-use.js` — activate during `"sweeping"` status (line 92 currently only fires for `"building"`). Add pass-level modified-file tracking to `sweep_state.modified_files_by_pass`.
- `stop-hook.js` — **decide explicitly:** should the Stop hook fire during `"sweeping"` fixes? If no (sweep fixes are verified by cross-model re-check, not AC evaluation), document this decision and add `"sweeping"` to the allow-through statuses. If yes, add `"sweeping"` to the status check at line 70.
- `session-start.js` — add `sweep_state` check alongside `active_node` check (line 34 stuck statuses list needs `"sweeping"`)
- `next-node.js` — add `"sweeping"` to stuck status detection (line 84), return "sweep in progress" when `sweep_state` is active
- `validate-manifest.js` — add `"sweeping"` to valid node statuses (line 71)

**Shared types exception — simplify the mechanism:**
The plan says sweep fixes MAY modify `src/shared/types/index.ts` for type-consistency findings. The implementation has two options:
- **(A) Simple:** All sweep fixes may write to shared types (same as revise behavior). Simpler to implement, slightly less restrictive.
- **(B) Category-gated:** PreToolUse checks `sweep_state.fixing_node`, looks up the associated finding in `sweep_state.findings.pending`, and only allows shared types writes if the finding's `category` is `"type-consistency"`. More precise but more complex.
Choose one during implementation. Option A is recommended for V1.

**cross-model-bridge.js relationship to cross-model-review.js:**
Keep `cross-model-review.js` for single-node BYOK review (Sprint 4). Create `cross-model-bridge.js` as a new file that imports shared utilities (`assembleReviewPrompt`, `parseReviewResponse`, `collectNodeFiles`) from `cross-model-review.js` and adds sweep orchestration: multi-node file collection, sweep-style prompts, batch/parallel API calls, and finding extraction. This preserves backward compatibility with the review command.

**integrate-check.js output mapping for sweep_state:**
The current `integrate-check.js` outputs `verdict: "PASS"|"FAIL"|...` and `interfaces: [...]`. The `sweep_state.integration_results` expects `passed: boolean` and `failures: []`. The deep-build orchestrator must map between these:
```
passed = (verdict === "PASS" || verdict === "PASS_WITH_WARNINGS")
failures = interfaces.filter(i => i.status === "FAIL")
```

**Deep-build report format:**
Specify a concrete format (like the sweep/crosscheck reports). Should include: total passes, findings by source model, resolution timeline, final integration result, and wall-clock time.

**Per-pass git commits (recommended):**
Create a git commit after each completed fix cycle. This makes "abort to pre-sweep state" trivially safe (git reset) and provides a clean audit trail. Tag format: `forgeplan-sweep-pass-[N]`.

**Test:** Run `/forgeplan:sweep` on a codebase with planted bugs. Verify Claude's agents find their issues. Fix. Verify re-integration runs after fixes. Run cross-check — verify it catches at least one issue Claude missed. Kill the terminal mid-sweep — verify `/forgeplan:recover` detects the interrupted sweep and offers resume/restart/abort. Run `/forgeplan:deep-build` end-to-end on the client portal. Verify two consecutive clean cross-model passes, re-integration at each gate, and documented findings by source.

**Exit criteria:** `/forgeplan:deep-build` runs autonomously on the client portal. Codex certifies clean on two consecutive passes. Deep build report shows cross-model review caught issues single-model review missed. Re-integration passes at every gate point. Recovery from mid-sweep crash works correctly. Total autonomous build time under 90 minutes.

---

### Sprint 7: Ambient Mode — Proactive Guidance and Contextual Awareness (Weeks 15–17)

**Goal:** ForgePlan becomes an ambient assistant that proactively guides users based on project context — like superpowers but for architecture-governed builds. The plugin detects what the user is doing, what state the project is in, and offers relevant guidance without requiring explicit slash commands.

**Why this exists:** Users don't know what they don't know. A user creating files in a pattern that looks like a new project shouldn't have to discover `/forgeplan:discover` exists. A user mid-build shouldn't have to remember to run `/forgeplan:review` when all nodes are built. A user who just finished a project shouldn't have to guess what maintenance commands are available. Superpowers proves this pattern works — ambient skill detection dramatically improves discoverability and reduces friction. ForgePlan should do the same for architecture-governed development.

**Inspiration:** The superpowers plugin (obra/superpowers) demonstrates the pattern:
- SessionStart injects context into every conversation
- A meta-skill ("using-superpowers") trains Claude to check for relevant capabilities before every response
- PreToolUse prompts intercept actions and apply guidance
- The result: users get the right tool at the right time without memorizing commands

**Design principle:** Ambient mode is **advisory, never blocking.** Unlike enforcement hooks (PreToolUse Layer 1/2) which can BLOCK operations, ambient mode only **suggests**. It never prevents the user from doing what they want. Think of it as a knowledgeable colleague watching over your shoulder who speaks up when they notice something relevant.

#### Three Pillars of Ambient Mode

**Pillar 1: Contextual SessionStart — "Where Are You?"**

Expand `session-start.js` beyond crash detection into a full project state assessment that injects contextual guidance into every new conversation.

Detection scenarios and responses:

| Scenario | Detection | Guidance |
|----------|-----------|----------|
| No project, no `.forgeplan/` | Directory has no `.forgeplan/` | "I notice you're in a project without ForgePlan architecture. If you'd like to define the structure, try `/forgeplan:discover`." |
| Fresh project, manifest exists, all pending | `.forgeplan/manifest.yaml` exists, all nodes `status: "pending"` | "Your architecture is defined with N nodes. Ready to spec? → `/forgeplan:spec --all`" |
| All specced, none built | All nodes `status: "specced"` | "All N specs are ready. Time to build → `/forgeplan:build --all`" |
| Build in progress | Some nodes built, some pending/specced | "Build progress: N/M nodes. Next up → `/forgeplan:next`" |
| All built, not reviewed | All nodes `status: "built"` | "All nodes built! Quality check time → `/forgeplan:review --all`" |
| All reviewed | All `status: "reviewed"` | "Project complete! Verify integration → `/forgeplan:integrate`" |
| Sweep in progress (Sprint 6) | `sweep_state` is active | "Autonomous sweep in progress (pass N). Status → `/forgeplan:status`" |
| Stuck nodes | Nodes in transient states without active_node | "N node(s) may be stuck. Recovery → `/forgeplan:recover`" |

The SessionStart output uses a **prompt hook** (not just stderr warnings) to inject this context into Claude's awareness so it can reference it naturally in conversation.

**Pillar 2: Activity Detection — "What Are You Doing?"**

A new PreToolUse prompt hook (lightweight, advisory-only) that detects user activity patterns and suggests relevant ForgePlan capabilities.

| Activity Pattern | Detection | Suggestion |
|------------------|-----------|------------|
| Creating new files in a structured pattern | Write/Edit to multiple new files in `src/` subdirectories | "Looks like you're building a new module. Want ForgePlan to govern this? → `/forgeplan:discover`" |
| Modifying a shared type/model | Write/Edit to files matching shared model patterns | "You're changing a shared data structure. ForgePlan can trace the impact → `/forgeplan:affected [model]`" |
| Writing tests | Write/Edit to `test/` or `__tests__/` or `*.test.*` | "If these tests map to a ForgePlan node, the spec's acceptance criteria can guide coverage → `/forgeplan:review [node]`" |
| Package/dependency changes | Write/Edit to `package.json`, `requirements.txt`, etc. | "Dependency change detected. Run integration check to verify contracts → `/forgeplan:integrate`" |
| Large refactor (many files touched in session) | PostToolUse tracking: 10+ files modified in one session | "Large refactor in progress. Consider running quality metrics → `/forgeplan:measure`" |

**Important constraints:**
- This hook runs ONLY when there is NO active operation (no `active_node`, no `sweep_state`). During builds/reviews/sweeps, the enforcement hooks handle everything — ambient detection would just add noise.
- The hook fires at most **once per pattern per session** (debounce). It tracks which suggestions have been shown in a session-scoped counter to avoid nagging.
- The hook is a `prompt` type, not `command` — it adds context to Claude's awareness but cannot block.
- Suggestions are **one line each**, not walls of text. They appear as natural recommendations in Claude's response, not as system alerts.

**Pillar 3: The Guide Skill — "How Does This Work?"**

A new skill file (`skills/forgeplan-guide.md`) that Claude loads when it detects a user might benefit from ForgePlan guidance. This is the equivalent of superpowers' "using-superpowers" meta-skill — it teaches Claude how to naturally weave ForgePlan capabilities into conversation.

The skill includes:
- Decision tree: based on what the user is asking/doing, which command or workflow is most relevant
- Natural language patterns: how to suggest commands conversationally (not "Run `/forgeplan:discover`" but "I can help you define the architecture for this — want me to start the discovery conversation?")
- Common user intents mapped to ForgePlan workflows:
  - "I want to build X" → discover → spec → build pipeline
  - "Something's broken" → status → review → recover
  - "I need to change Y" → revise → affected → rebuild
  - "Is this project healthy?" → measure → integrate → status
  - "What can I do?" → guide → help
- Anti-patterns: when NOT to suggest ForgePlan (user is doing unrelated work, quick one-off scripts, non-project directories)

#### New Files

| File | Type | Purpose |
|------|------|---------|
| `scripts/ambient-detect.js` | Script | Activity pattern detection for PreToolUse prompt hook. Reads state, checks patterns, returns suggestions (or empty if nothing relevant). Tracks debounce state in memory (session-scoped). |
| `skills/forgeplan-guide.md` | Skill | Meta-skill teaching Claude how to naturally integrate ForgePlan into conversation. Loaded when ambient detection triggers or user asks for help. |

#### Modified Files

| File | Change |
|------|--------|
| `scripts/session-start.js` | Expand from crash detection → full project state assessment with contextual guidance injection |
| `hooks/hooks.json` | Add SessionStart prompt hook (alongside existing command hook). Add PreToolUse prompt hook for ambient detection (no matcher — fires on all tools, but script short-circuits when active operation is running) |
| `commands/guide.md` | Update to reference the ambient system — explain that ForgePlan proactively suggests actions, and `/forgeplan:guide` is the explicit version |

#### Deliverables (Weeks 15–16)

- Expanded `session-start.js` with full project state assessment (8 scenarios above)
- SessionStart prompt hook that injects state context into Claude's awareness
- `ambient-detect.js` script with activity pattern detection (5 patterns above)
- PreToolUse ambient prompt hook (advisory-only, debounced, no-op during active operations)
- Session-scoped suggestion debounce (max once per pattern type per session)
- `skills/forgeplan-guide.md` meta-skill with decision tree, natural language patterns, and anti-patterns

#### Deliverables (Week 17)

- Integration testing: verify ambient mode doesn't interfere with enforcement hooks during active operations
- Verify debounce works (same suggestion doesn't repeat)
- Verify prompt hooks don't add latency to normal operations (short-circuit path must be fast)
- Dogfood: start a fresh project from scratch, verify ambient guidance naturally leads user through discover → spec → build → review → integrate without them needing to know the commands upfront
- Update `commands/guide.md` and `commands/help.md` to reference ambient mode
- Update CLAUDE.md sprint status

#### Implementation Notes

**SessionStart dual-hook architecture:**
The existing SessionStart command hook (`session-start.js`) handles crash detection and state cleanup — it must remain a command hook because it writes to `state.json` (clearing stale flags). The new ambient context injection is a separate prompt hook that reads state and produces natural-language guidance. Both fire on SessionStart: the command hook runs first (cleanups), then the prompt hook reads the cleaned state and produces guidance.

**PreToolUse hook ordering:**
The ambient PreToolUse prompt hook must not conflict with the existing enforcement PreToolUse hooks. Order:
1. PreToolUse command hook (deterministic enforcement — `pre-tool-use.js`)
2. PreToolUse enforcement prompt hook (LLM spec compliance — existing Layer 2)
3. PreToolUse ambient prompt hook (advisory suggestions — new)

If the enforcement hooks BLOCK, the ambient hook never fires (blocked = no action to advise on).

**Performance budget:**
`ambient-detect.js` must complete in <50ms for the short-circuit path (active operation running = exit immediately). The full detection path (read state, check patterns) should be <200ms. If it exceeds this, the debounce mechanism means it only adds this latency once per pattern per session, not on every tool call.

**Relationship to existing `/forgeplan:guide` command:**
`/forgeplan:guide` is the explicit "where am I?" command — the user actively asks for guidance. Ambient mode is the implicit version — guidance comes to the user. They complement each other:
- Ambient mode: lightweight, one-line suggestions woven into natural conversation
- `/forgeplan:guide`: full state assessment with all options displayed

**Future: non-technical builder mode (Concept Doc Section 4, Tier 1):**
Ambient mode is the foundation for the non-technical builder experience described in the concept doc. When the standalone visual workstation ships, ambient detection translates directly into UI hints, tooltip guidance, and contextual action buttons. The pattern detection logic (`ambient-detect.js`) can be reused as-is — only the presentation layer changes from Claude conversation to visual UI.

**Exit criteria:** A user who has never seen ForgePlan before can start a Claude Code session in an empty directory, describe what they want to build, and get naturally guided through the full discover → spec → build → review → integrate pipeline without reading documentation or memorizing commands. Ambient suggestions appear at the right time, never repeat unnecessarily, and never interfere with active operations. Dogfood on a new project (not client portal) with a fresh user perspective.

---

### Sprint 8: Research Agents and Autonomous Greenfield (Weeks 18–21)

**Goal:** Fully autonomous greenfield builds where the user describes what they want and walks away. Research agents search for existing implementations, check licenses, and gather best practices before building.

**Why this exists:** The Sprint 6 autonomous loop builds and reviews code. But it still builds everything from scratch. Real developers don't do that — they search GitHub for existing solutions, check npm/PyPI for packages that solve subproblems, read API docs, and study similar projects for patterns. Sprint 8 gives ForgePlan's autonomous pipeline the same research capabilities.

**New agent types:**

| Agent | Role | Tools |
|-------|------|-------|
| Researcher | Search GitHub/npm/PyPI for existing implementations before building a node | WebSearch, WebFetch |
| License Checker | Verify dependency license compatibility (MIT/Apache/GPL chain) | WebFetch (package registry APIs) |
| Inspiration Agent | Find similar projects for pattern reference, extract architectural patterns | WebSearch, WebFetch |
| Docs Agent | Fetch API documentation, framework guides, best practices for the tech stack | WebSearch, WebFetch |

**Integration with existing pipeline:**
- Research runs AFTER spec but BEFORE build: `discover → spec → research → build → review → ...`
- Research findings are saved to `.forgeplan/research/[node].md`
- Builder agent receives research findings as additional context alongside the spec
- The architect agent can also trigger research during discovery to validate that a proposed architecture is feasible

**New command:**
| Command | Description |
|---------|-------------|
| `/forgeplan:research [node]` | Run research agents for a specific node or `--all` for the whole project |

**Deep-build integration:** `/forgeplan:deep-build` gains a `--with-research` flag that inserts the research phase into the autonomous pipeline.

**This is the vision from the concept doc:** "the user describes what they want and walks away." Sprint 6 makes the build autonomous. Sprint 7 makes the interface ambient. Sprint 8 makes the preparation intelligent. Together they deliver the full autonomous experience.

**Exit criteria:** Research agents find relevant packages/implementations for at least 3 of 7 client portal nodes. License checker correctly flags at least one GPL dependency in a test scenario. Builder agent demonstrably uses research findings (cites them in build decisions). Deep-build with research produces fewer custom implementations (more library usage) than without.

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

This execution plan is **Sprint 1 through Sprint 8** of the plugin's development. Sprints 1–5 deliver the architecture-governed build harness. Sprint 6 delivers the autonomous iterative sweep system. Sprint 7 makes ForgePlan an ambient assistant that guides users proactively. Sprint 8 adds research agents for fully autonomous greenfield builds. Everything in Sections 1–16 and 18–23 of the concept document remains the long-term product direction. The concept document is the north star. This document is the directions to get on the road.

The arc: **Sprint 5 proved the harness works** (dogfood with data). **Sprint 6 makes it autonomous** (cross-model sweep). **Sprint 7 makes it discoverable** (ambient guidance). **Sprint 8 makes it intelligent** (research before building). Together, they deliver the concept doc's vision: a user describes what they want, walks away, and comes back to a fully built, fully reviewed, fully researched application — without ever reading a manual.

When the plugin proves this end-to-end, the next document will be: **ForgePlan Workstation — Standalone Application Build Plan**, covering the Tauri shell, React Flow canvas, Monaco integration, and the visual rendering of the `.forgeplan/` directory that developers have already been building in their terminals. The ambient mode pattern detection and research agents translate directly into visual UI — tooltip guidance becomes button hints, research findings become sidebar panels, and the deep-build autonomous loop becomes the "Deep Build" premium feature where the user clicks a button and walks away.

The vision is intact. The build continues.
