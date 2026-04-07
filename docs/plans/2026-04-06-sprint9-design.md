# Sprint 9 Design: Semantic Memory + Node Splitting + State Hardening + Guide Enhancement

**Date:** 2026-04-06
**Status:** Approved (v3 — revised after 5-team review)
**Goal:** Compiled knowledge base reduces token usage. Node splitting enables tier upgrades. State hardening prevents corruption. Guide reads wiki for smarter recommendations.

> **Note:** Pillar 3 (Five-Team Review Model) from the original Sprint 9 plan was shipped in Sprint 8. The three team-colored sweep agents (sweep-adversarial, sweep-user-flows, sweep-contract-drift) are already live. This design covers the remaining four pillars.

> **Review history:** v1 initial draft → v2 brainstorming refinements → v3 revised after 5-team review (Red, Blue, Orange, Rainbow, White). Key changes in v3: dropped SessionEnd hook (unanimous — not a supported hook type), added split recovery breadcrumb, reduced markers from 5→3, deferred evidence tracking, scoped wiki pages to novel info only, added tier-aware wiki behavior, fixed multiple contract mismatches.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Knowledge architecture | Karpathy 3-layer (Rules → Wiki → Source) | Agents read compiled wiki first (cheap), drill into source only to verify |
| Wiki lifecycle | Grows at every phase, regenerated at sweep | Not a post-build artifact — wiki starts at discovery, gains value continuously. Self-correction via regeneration prevents staleness |
| Anchor markers | 3 types (node, spec, decision) | Builder writes all 3. Patterns and rules are INFERRED by compile-wiki.js from spec constraints and code analysis — not manually annotated. Avoids subjective pattern-vs-rule categorization by LLM builders (Rainbow review finding) |
| Rules resilience | 5-layer model with self-correction | Rules can't go stale because they're regenerated from scratch every compile. Markers deleted → rules vanish. Spec constraints → rules auto-appear |
| Node splitting | Architect-assisted analysis mode | Split is a code analysis task, not discovery. Architect reads imports/directories/domains, proposes split, user confirms |
| State atomicity | Shared utility, no file locking | Hooks are serial (no concurrency). Extract existing atomicWriteJson pattern into shared module. Simple > complex |
| Session context | SessionStart "look-back" (NOT SessionEnd hook) | SessionEnd is not a supported Claude Code hook type (confirmed by 5/5 review teams). SessionStart displays current node statuses and detects interrupted operations via `previous_status`. PostToolUse appends wiki data continuously during session, providing cross-session context without relying on a clean exit |
| Guide wiki reading | String match + thresholds | Concrete: category match on recurring findings, file count > 20 triggers split recommendation. No LLM reasoning needed |
| Parallel fix state | Worktrees handle isolation | No temp state files needed — worktree-manager.js already handles per-node isolation |
| Wiki trust boundary | Wiki is context, NEVER enforcement | Rules.md describes observed conventions. Sweep agents must NEVER treat rules as an allow-list or skip security analysis because a rule exists. The sweep-adversarial agent audits rules.md itself for rules that weaken security posture (Red Team finding) |
| Tier-aware wiki | SMALL tier skips wiki entirely | Wiki adds overhead that contradicts Sprint 7A's "get out of the way" philosophy for small projects. SMALL uses existing markers (node, spec) only. MEDIUM+ gets full wiki (Blue/Rainbow finding) |
| Token savings mechanism | Sweep dispatch reduces source files on repeat passes | Concrete mechanism: on sweep pass 2+, agents receive wiki node pages + source files modified since last pass + source files with pending findings for the agent's category. sweep-adversarial (Red Team) always receives full source on every pass. Pass 1 always sends full source. This is the dispatch change in sweep.md Phase 2 that produces actual token reduction (Rainbow finding, refined by Red/Blue R2) |

---

## Pillar 1: Semantic Memory (Living Knowledge Tree)

> **Tier gate:** Wiki is created and maintained only for MEDIUM and LARGE tier projects. SMALL tier projects skip wiki entirely — they use specs and source directly. All wiki-related hooks, compile-wiki.js invocations, and builder wiki reading are gated on `manifest.project.complexity_tier !== "SMALL"`.

### The Three Layers

The knowledge tree follows the Karpathy wiki pattern — three layers of increasing abstraction, each with a clear purpose:

```
Layer 3: Rules    (.forgeplan/wiki/rules.md)
  ↑ compiled from
Layer 2: Wiki     (.forgeplan/wiki/nodes/[id].md, decisions.md)
  ↑ compiled from
Layer 1: Source   (.forgeplan/specs/*.yaml, src/**/*.ts — always available)
```

**Layer 1 — Source (fallback, always available, never gated):**
Raw specs and code files. Every agent can always read these. No compilation needed. This is the ground truth.

**Layer 2 — Wiki (compiled summaries with citations):**
Per-node knowledge pages and decision logs. Each entry includes `[file:line]` citations back to source. Wiki pages contain ONLY information not already in specs/manifest/state: decisions, past findings, and cross-node references. File tables, AC listings, and dependency info are NOT duplicated here — agents read those from their canonical sources (manifest.yaml, specs/*.yaml, state.json). (Rainbow finding: reduce duplication)

**Layer 3 — Rules (deterministic conventions from spec constraints and code analysis):**
Machine-readable rules derived from spec `constraints` fields and code analysis by compile-wiki.js. NOT from manual markers — compile-wiki.js infers patterns and rules by analyzing spec constraints, recurring code patterns (same import used in 3+ files = pattern), and `@forgeplan-decision` markers. Regenerated from scratch every compile — they can't go stale.

### Anchor Markers (3 Types)

The builder writes 3 marker types during builds. The existing 2 (node, spec) are unchanged. Sprint 9 adds 1 new type (decision).

```typescript
// Existing markers (Sprint 2):
// @forgeplan-node: auth
// @forgeplan-spec: AC-AUTH-1

// New marker (Sprint 9):
// @forgeplan-decision: D-auth-1-session-storage -- sessions stored in database, not JWT. See decisions.md
```

**Marker format:**
```
@forgeplan-node: [node-id]
@forgeplan-spec: [criterion-id]
@forgeplan-decision: D-[node]-[N]-[slug] -- [one-line description]
```

Decision IDs are node-scoped (`D-auth-1-slug`, `D-api-2-slug`) to prevent collisions when nodes are built in parallel via worktrees. The slug is grep-friendly. The description uses ` -- ` (ASCII double-hyphen, not em-dash) for maximum cross-platform portability.

Patterns and rules are NOT manually annotated. compile-wiki.js infers them:
- **Rules:** Derived from spec `constraints` fields (e.g., spec says `constraints: ["all queries must use ORM"]` → rules.md gets `no-raw-sql` rule). This is a deterministic mapping: read constraints array from YAML, emit each as a rule.
- **Patterns (V1 — regex-only, no AST parsing):** Detected via three concrete heuristics:
  1. **Import clustering:** Files sharing 3+ identical imports are grouped as a pattern (e.g., "auth-middleware-pattern: files importing passport, bcrypt, jwt")
  2. **Middleware signatures:** Grep for `(req, res, next)` function signatures — files with this pattern are tagged as middleware
  3. **Error handling shapes:** Grep for `catch` blocks and classify by response pattern (calls `next(error)`, returns JSON error envelope, re-throws). 3+ files with same shape = pattern
  - Threshold: 3+ files must share a structure to be recognized as a pattern
  - All detection is regex-based. No AST parsing. More sophisticated detection (structural similarity, type-aware analysis) deferred to Sprint 10 Green Team.

This eliminates the subjective "is this a pattern or a rule?" categorization problem and reduces marker clutter from ~5-8 per file to ~2-3 per file.

### Cross-References

Entries link to each other as flat lists (not a navigable graph — agents don't traverse graphs yet):

```markdown
## Decision: D-auth-1-session-storage
**Nodes:** auth, api
**Related rules:** session-token-storage, no-jwt-only
**Files:** [src/auth/strategies/local.ts:42], [src/api/middleware/session.ts:15]
```

### Wiki Trust Boundary (CRITICAL — Red Team v2 + v3 findings)

**All wiki artifacts (rules.md AND decisions.md) are descriptive records, NEVER prescriptive directives.**

Rules.md describes observed conventions — it is NEVER an allow-list. Decisions.md records choices made — it is NEVER a mandate for future nodes.

**Structural defense (stronger than prompt instructions):**
- Sweep agents do NOT receive rules.md in their dispatch context. They receive only wiki node pages (decisions, past findings) and source files. This structurally prevents rules from influencing sweep analysis. Rules.md is only sent to the BUILDER (where it provides helpful context, not enforcement).
- The sweep-adversarial agent (Red Team) is the exception: it receives rules.md specifically to AUDIT it for dangerous rules (e.g., rules that bypass auth, allow raw SQL, disable validation).

**Builder relationship to rules.md:**
- Rules.md is descriptive ("what we observed in the codebase"), NOT prescriptive ("what you must do")
- The builder reads rules.md to understand existing conventions, then validates them against the spec
- If a rule contradicts a spec constraint, the spec wins — always
- The builder ALWAYS reads spec constraints directly, regardless of wiki state. Wiki is supplementary context, never the primary source of conventions

**Decisions.md trust:**
- Decisions are historical records of choices, not directives for future work
- The builder reads decisions to understand WHY choices were made, not to blindly follow them
- If a decision's rationale no longer applies (e.g., "CSRF disabled for testing" in a production node), the builder should flag it, not follow it

### Five-Layer Resilience

Rules can't go stale because of five overlapping safety mechanisms:

```
Layer 1: Spec constraints → rules.md at SPEC TIME (before code exists!)
         Example: spec says "all queries must use ORM" → rule auto-created

Layer 2: Code analysis → rules.md at COMPILE TIME
         Example: compile-wiki.js detects same error-handler pattern in 4 files → pattern extracted

Layer 3: Verified timestamps (stale rules tagged [STALE])
         Example: spec constraint removed → next compile tags rule [STALE]

Layer 4: Agent self-validation (read cited line before reporting violation)
         Example: sweep-code-quality reads [file:line] before citing rule violation

Layer 5: Source fallback (always available)
         Example: if rules.md is corrupted, agents read specs + source directly
```

### Self-Correction Loop

Rules.md is **regenerated from scratch** every compile — not patched. This makes the system self-correcting:

| Scenario | What happens |
|----------|-------------|
| Stale rule (spec constraint removed) | Vanishes on next recompile — constraint not found, rule not emitted |
| Missing rule (spec constraint exists) | Auto-appears — compile reads spec constraints, emits rule |
| Wrong rule (incorrect convention) | Red Team flags the rule itself → fix agent updates spec constraint → recompile corrects |
| Massive refactor (many patterns change) | Full recompile rebuilds everything from current source state |

> **Limitation:** Self-correction handles structural issues (missing/stale). It does NOT detect semantically wrong-but-structurally-valid rules. The sweep-adversarial agent covers this gap by auditing rules.md for rules that contradict security best practices. (Red Team finding)

### Wiki Lifecycle — Grows at Every Phase

The wiki is not a post-build artifact. It starts at discovery and gains value at every phase:

**Discovery (MEDIUM/LARGE only):**
```
.forgeplan/wiki/
├── index.md              ← project overview, tier, tech stack
├── nodes/
│   ├── auth.md           ← skeleton: decisions placeholder, cross-references placeholder
│   ├── api.md
│   └── ...
├── decisions.md          ← empty, populated during build
└── rules.md              ← populated from spec constraints (before first build!)
```

Note: `wiki/nodes/[id].md` is a FILE, not a directory. All references in this design use this format consistently.

**Handoff with existing discovery-index.md:** The architect agent already writes `.forgeplan/wiki/discovery-index.md` during large-document discovery (architect.md line 53). Sprint 9 wiki initialization in discover should check for this existing file and incorporate it into `wiki/index.md` rather than overwriting it. The discovery-index.md serves as the document→architecture mapping; wiki/index.md serves as the project overview. Both can coexist.

**Spec phase:** Rules.md gets spec-derived constraints. Example: spec says `constraints: ["all endpoints require auth"]` → rules.md gets `no-unauthenticated-endpoints` rule before any code exists. Note: this happens during compile-wiki.js runs, not during spec generation itself. The spec command is not modified — compile-wiki.js reads specs as input.

**Build phase:** PostToolUse appends decision markers to node pages. Conversation logging captures context.

**Review phase:** Review findings are written to `.forgeplan/reviews/` (existing behavior). compile-wiki.js reads these review reports and populates the "Past Findings" section of each node's wiki page during compilation. The producer path: review → `.forgeplan/reviews/[node].md` → compile-wiki.js → `wiki/nodes/[node].md` Past Findings section.

**Sweep phase:** Full recompile via compile-wiki.js at Phase 1 step 6 (before agent dispatch). Recompile at Phase 7 finalization (for next session). Cross-references rebuilt.

**Revise phase:** Impact recorded in decisions.md. Interface changes reflected on node pages.

### Node Wiki Page Format

Each node gets a knowledge page at `.forgeplan/wiki/nodes/[node-id].md`. Pages contain ONLY novel information — not data already in manifest/spec/state:

```markdown
# Node: auth

## Decisions (from @forgeplan-decision markers)
- **D-auth-1-session-storage**: Database sessions, not JWT-only. Why: need server-side revocation. [src/auth/strategies/local.ts:42]
- **D-auth-4-oauth-library**: Using passport.js. Why: mature, well-documented, multi-strategy. [src/auth/strategies/google.ts:8]

## Past Findings
| Pass | Agent | Finding | Resolution |
|------|-------|---------|------------|
| 1 | sweep-auth-security | Missing CSRF protection on login form | Fixed: added csurf middleware |
| 2 | sweep-error-handling | OAuth callback doesn't handle denied permission | Fixed: redirect to /login?error=denied |

## Cross-References
- Patterns shared with: api (error-boundary — inferred by compile-wiki.js)
- Rules shared with: database (no-raw-sql — from spec constraint)
- Connected to: api node via auth middleware export
```

Note: File tables, AC listings, status, dependencies, and connections are NOT included — these live in manifest.yaml, specs/*.yaml, and state.json respectively. Agents read those from canonical sources.

### Decisions.md Format

The cross-cutting decisions page at `.forgeplan/wiki/decisions.md`:

```markdown
# Architectural Decisions

## D-auth-1-session-storage
**Nodes:** auth, api
**Choice:** Database sessions, not JWT-only
**Why:** Need server-side revocation for security compliance
**Files:** [src/auth/strategies/local.ts:42], [src/api/middleware/session.ts:15]
**Status:** Active

## D-api-2-error-format
**Nodes:** api, auth
**Choice:** Standardized JSON error envelope: { error: { code, message, details } }
**Why:** Frontend needs consistent error parsing across all endpoints
**Files:** [src/api/middleware/error-handler.ts:8]
**Status:** Active
```

### PostToolUse Wiki Integration (Lightweight, <20ms)

The PostToolUse hook already runs after every Write/Edit. Sprint 9 adds wiki appending — a lightweight operation that doesn't slow builds.

> **Tier gate:** Only runs for MEDIUM/LARGE projects. Skipped when `manifest.project.complexity_tier === "SMALL"`.

**What it does:**
1. Scan `tool_input` for decision markers via regex
2. For **Write** tool: scan `tool_input.content` (full file content)
3. For **Edit** tool: scan `tool_input.new_string` only (the replacement text — partial extraction is acceptable because compile-wiki.js does a full scan later)
4. If markers found, append to `.forgeplan/wiki/nodes/[active-node].md` (note: this is a file path, not a directory)
5. Append file change entry to the node's change log
6. Direct `fs.writeFileSync` (bypasses PreToolUse — this is a hook writing to wiki, not Claude writing via Write tool)
7. If wiki directory doesn't exist: create full skeleton structure silently (index.md, nodes/, decisions.md, rules.md — not just empty dirs)

**What it does NOT do:**
- Full file parsing (too slow for a hook)
- Cross-reference building (that's compile-wiki.js)
- Pattern/rule inference (that's compile-wiki.js)
- LLM reasoning (deterministic regex only)

**Marker regex patterns:**
```javascript
const MARKER_PATTERNS = {
  node:     /@forgeplan-node:\s*(\S+)/g,
  spec:     /@forgeplan-spec:\s*(\S+)/g,
  decision: /@forgeplan-decision:\s*(D-\S+-\d+-\S+)\s*--\s*([^\n]+)/g,
};
```

Note: Uses ASCII ` -- ` (double-hyphen), not Unicode em-dash, for cross-platform compatibility. The regex `--` matches two consecutive hyphens.

**Dual-writer clarification:** PostToolUse appends to wiki pages during builds (incremental, transient). compile-wiki.js regenerates all pages from scratch (batch, authoritative). PostToolUse entries are NOT preserved by compile-wiki.js — they are overwritten during regeneration because compile-wiki.js re-greps source for all markers. PostToolUse's value is providing real-time cross-session context BETWEEN compiles. After a compile, PostToolUse entries are redundant. No merge strategy needed — the compiler is always authoritative.

**Known limitation:** Markers inside string literals, test assertions, and template literals will be matched as false positives. This is acceptable because: (a) decision markers in test files are rare, (b) compile-wiki.js does a full-file scan and can deduplicate, (c) adding comment-context detection would add complexity for minimal benefit. If false positives become a problem in practice, a follow-up can add comment-prefix detection (`/\/\/\s*@forgeplan/`).

**Integration point in post-tool-use.js:** After the existing conversation logging block (line ~279), before the final state write.

### compile-wiki.js Specification (~450 lines)

The full wiki compiler. Runs at sweep Phase 1 step 6 (before agent dispatch) and at Phase 7 finalization (for the next session).

> **Does NOT run:** Between sweep passes (Rainbow finding: unvalidated performance cost with marginal value — agents already have source files). Does NOT run at SessionStart (would block startup — instead, SessionStart outputs a stderr advisory if wiki is stale, and Claude decides whether to act on it).

> **Script internals:** compile-wiki.js writes files directly via Node.js `fs` module, bypassing Claude's tool system entirely. PreToolUse enforcement only applies to Claude's Write/Edit tools, not to subprocess file operations. The Bash whitelist in pre-tool-use.js is needed only to allow Claude to invoke this script. (White Team finding)

**Input:**
- `.forgeplan/manifest.yaml` — node list, shared models, tier
- `.forgeplan/specs/*.yaml` — acceptance criteria, constraints, interfaces
- Source files (use manifest's per-node `files` array when available, fall back to file_scope globs) — grep for decision markers
- Previous wiki pages (for preserving Past Findings history)
- `.forgeplan/sweeps/` — findings from sweep passes (note: `sweeps/`, not `sweep-reports/`)

**Process:**
```
0. If wiki/ directory does not exist, create full skeleton (index.md, nodes/, decisions.md, rules.md).
   This handles: tier upgrades (SMALL→MEDIUM), manual wiki deletion, and first-run scenarios.
1. Read manifest → get node list, shared models, tier, tech stack
2. For each node:
   a. Read spec → extract constraints, interfaces
   b. Get file list from manifest node.files array (if populated by PostToolUse)
      OR glob file_scope (fallback for first build)
   c. Grep all files for decision markers → extract with [file:line]
   d. Infer patterns (V1 — regex-only, no AST, source files only):
      - Exclude test files from pattern inference: skip **/*.test.*, **/*.spec.*, **/__tests__/**
        (test files share imports like vitest/jest that would create false "import cluster" patterns)
      - Import clustering: group files sharing 3+ identical imports
      - Middleware signatures: grep for (req, res, next) function signatures
      - Error handling shapes: grep catch blocks, classify by response pattern
      - Threshold: 3+ source files sharing a structure = pattern
   e. Re-derive "Past Findings" from `.forgeplan/sweeps/` reports and `.forgeplan/reviews/` files
      (true regeneration — do NOT copy from previous wiki page, which would be patching)
   f. Generate node wiki page from scratch (NOT patch — regenerate)
   g. For nodes with split_from field: check if any decisions reference the parent node,
      redistribute those decisions to this child based on which files are in this node's scope
3. Generate cross-cutting pages:
   a. decisions.md — all decisions with nodes, files, and status
   b. rules.md — all rules from spec constraints + inferred patterns
4. Reconcile vs manifest:
   a. Nodes in wiki but not in manifest → archive to wiki/archived/ (create dir on demand)
   b. Nodes in manifest but not in wiki → create skeleton
   c. Prune archived pages older than 30 days or exceeding 50 entries (max 10 pruned per run)
5. Write all pages with batch atomicity (entire step 5 wrapped in try/finally):
   a. Set `state.wiki_compiling = true` via atomicWriteJson (crash detection flag)
   b. Delete `.forgeplan/wiki/.tmp-compile/` if it exists (cleanup from previous interrupted compile)
   c. Write all pages to `.forgeplan/wiki/.tmp-compile/` staging directory
   d. For each page: rename from staging to final location (per-file atomic)
   e. Remove staging directory
   f. (in finally block) Set `state.wiki_compiling = false` — ALWAYS resets, even on failure
   SessionStart checks `wiki_compiling === true` → previous compile was interrupted → output
   stderr advisory: "Wiki compilation was interrupted. Will retry on next sweep."
   (SessionStart does NOT re-run compile synchronously — keeps startup fast.)
   Between steps c and d, the old wiki is still intact. Between d steps, some pages are new
   and some are old, but the next compile will fix any inconsistency (self-correction).
6. Update state.wiki_last_compiled timestamp via atomicWriteJson
```

**Performance safeguards:**
- Use manifest `files` array instead of re-globbing file_scope (avoids filesystem traversal)
- Exclusion patterns for glob fallback ONLY (manifest files array is already curated by PostToolUse and needs no filtering): `!**/node_modules/**`, `!**/dist/**`, `!**/build/**`, `!**/.next/**`, `!**/__snapshots__/**`, `!**/*.generated.*`
- Binary file exclusion: skip files with extensions `.png`, `.jpg`, `.gif`, `.ico`, `.woff`, `.eot`, `.ttf`, `.pdf`, `.zip` (applies to both glob fallback and manifest files array — `fs.readFileSync` throws on binary files)
- If file count exceeds 100, use a single multi-pattern regex pass per file instead of separate scans
- Process nodes in parallel (`Promise.all`) for I/O-bound operations
- Target: <5s for 10-node project with ~200 files

**Staleness detection (for SessionStart advisory):**
```javascript
function isWikiStale(forgePlanDir) {
  const state = readState(forgePlanDir);
  if (!state.wiki_last_compiled) return true;
  // Also check wiki integrity — if files were deleted, wiki needs rebuild
  if (!fs.existsSync(path.join(forgePlanDir, 'wiki', 'index.md'))) return true;
  const lastCompiled = new Date(state.wiki_last_compiled);
  const lastStateUpdate = new Date(state.last_updated);
  return lastStateUpdate > lastCompiled;
}
```

SessionStart outputs to stderr: `"Knowledge base is stale (last compiled: [time]). Run compile-wiki.js or start a sweep to refresh."` Claude picks this up as guidance. This keeps SessionStart fast and non-blocking. (White Team finding)

**Error output specification:** compile-wiki.js writes errors to stderr with actionable messages:
- Invalid YAML in spec: `"Wiki compile error: invalid YAML in .forgeplan/specs/auth.yaml line 15: [parse error]. Fix the spec and re-run."`
- Missing file: `"Wiki compile warning: manifest references src/auth/middleware.ts but file not found. Skipping."`
- Regex timeout (>5s): `"Wiki compile warning: pattern inference skipped for node auth (too many files: 250). Consider splitting this node."`
- Success: `"Wiki compiled: 7 nodes, 12 rules, 5 patterns, 8 decisions. (3.2s)"`
Errors in individual nodes do NOT halt the entire compile — skip the failing node, compile the rest, report the error.

**Compile attempt tracking:** If compile-wiki.js fails catastrophically (e.g., cannot read manifest), track attempts in state. After 3 failed attempts, skip compilation and warn: `"Wiki compilation has failed 3 times. Run 'node scripts/compile-wiki.js --verbose' to diagnose."` Reset counter on next successful compile.

### Builder Wiki Reading

The builder reads wiki before building to leverage existing knowledge:

> **Tier gate:** Only for MEDIUM/LARGE. SMALL builders read specs directly — no wiki overhead.

**Read order (before implementation):**
1. **Always read spec constraints directly** — the spec is the primary source of conventions, regardless of wiki state. This ensures the builder has convention guidance even on first build when rules.md is empty.
2. `.forgeplan/wiki/rules.md` — supplementary context: inferred patterns and conventions from prior builds. If empty or missing, skip (not an error).
3. `.forgeplan/wiki/nodes/[dep-node].md` for each dependency — understand decisions and past issues

**Fallback:** If wiki doesn't exist OR wiki pages are empty (first build, before any sweep), the builder uses spec constraints as the sole source of conventions. Wiki is supplementary context, never the primary source and never a gate.

**Note on partial wiki during sequential builds:** During sequential builds (before any sweep), wiki pages contain only real-time PostToolUse data (decision markers). rules.md is empty until compile-wiki.js runs (first sweep). The builder always reads spec constraints directly regardless, so this causes no gap in convention guidance. (White/Blue Team finding)

**Builder writes decision markers during build:**
The builder MUST write `@forgeplan-decision` markers when making non-obvious technical choices. This is the data source for the decisions layer of the knowledge tree.

Builder marker writing rules:
- `@forgeplan-node` and `@forgeplan-spec`: Already required (Sprint 2). Continue writing these.
- `@forgeplan-decision`: Write when making a non-obvious technical choice. Use node-scoped ID: `D-[node]-[N]-[slug]`. At minimum 1 per node for the most significant architectural choice.

Patterns and rules are NOT manually annotated by the builder. compile-wiki.js infers them from spec constraints and code analysis.

### Marker Enforcement

**Stop hook (existing behavior, no change needed):**
Already verifies `@forgeplan-node` and `@forgeplan-spec` markers. Sprint 9 does NOT add enforcement for `@forgeplan-decision` — these are advisory. The sweep contract-drift agent flags nodes with 0 decision markers instead.

**Sweep contract-drift agent update:**
Add check: "Does this node have 0 `@forgeplan-decision` markers?" If yes, emit finding with confidence 60: "Node [id] has no decision markers. Consider annotating significant architectural choices for the knowledge graph." This is advisory — not a build blocker.

### Massive Change Handling

| Scenario | Wiki behavior |
|----------|--------------|
| Node removed from manifest | Archive to `wiki/archived/[node-id].md` (history preserved, dir created on demand) |
| Node added to manifest | Create skeleton from spec + source (if available) |
| Full rediscovery (/forgeplan:discover on existing project) | Archive all current pages, fresh start from new manifest |
| Node renamed | Old archived, new created. Decision logged in decisions.md |
| Tier upgrade (SMALL→MEDIUM) | Wiki created for the first time — compile-wiki.js generates from existing specs + source |
| Wiki manually deleted by user | SessionStart detects wiki_last_compiled set but index.md missing → triggers full recompile advisory |

**Archive retention:** compile-wiki.js prunes archived pages older than 30 days or exceeding 50 entries during reconciliation.

---

## Pillar 2: Node Splitting

### Command: `/forgeplan:split [node-id]`

Decomposes an existing node into finer-grained nodes while preserving code, state, and enforcement integrity. Required for tier upgrades (SMALL→MEDIUM, MEDIUM→LARGE) to work end-to-end.

### Prerequisites

- Target node must be in status: `built`, `reviewed`, or `revised`
- No `active_node` set (no operation in progress)
- No `sweep_state.operation` active (no sweep running)
- Node must have code (can't split a `specced` node — nothing to analyze)

### Architect Split Mode

The split command invokes the architect with a `--split [node-id]` argument. The architect agent has a dedicated "split mode" section that activates when this argument is present. This is code analysis, NOT discovery — the architect reads the existing code structure, not the user's project description.

**Analysis steps:**
1. Read the existing node spec from `.forgeplan/specs/[node-id].yaml`
2. Glob the node's `file_scope` to get file list
3. Analyze code structure:
   - **Directory groupings:** `src/auth/` vs `src/api/` vs `src/database/` → natural boundaries
   - **Import clusters:** files that import each other heavily belong together
   - **Domain boundaries:** auth logic vs business logic vs data access
4. Assess: how many ACs, how many responsibilities, how many files?
5. Propose split with reasoning

### Split Proposal Template

The architect presents a structured proposal:

```
## Split Proposal: [node-id] → [child-1], [child-2], ...

### Current State
- Files: 23
- ACs: 12
- Responsibilities: auth, API routes, middleware, validation

### Proposed Split

**[child-1]: auth**
- File scope: src/auth/**
- Files: 8
- ACs: AC-AUTH-1, AC-AUTH-2, AC-AUTH-3 (from @forgeplan-spec markers)
- Depends on: database
- Connects to: api (provides middleware)
- split_from: auth-api

**[child-2]: api**
- File scope: src/api/**
- Files: 12
- ACs: AC-API-1, AC-API-2, AC-API-3, AC-API-4
- Depends on: auth, database
- Connects to: frontend-dashboard, frontend-login
- split_from: auth-api

### Orphan Files (need assignment)
- src/utils/helpers.ts — used by both auth and api
- src/config/index.ts — shared config

### Consequence
- Node count: 1 → 2 (total project: 2 → 3)
- Tier impact: Current tier SMALL. You now have 3 nodes.
  Would you like to reassess complexity? MEDIUM governance adds:
  full specs per node, 6-8 sweep agents, cross-model optional.
  (Node count is a signal, not a formula — your project may still be SMALL
  if the domain complexity hasn't changed.)
- Mandatory: /forgeplan:integrate after split

Confirm? [Y/n/modify]
```

Note: Tier upgrade is advisory, not a hard threshold. The architect presents consequences and asks the user to reassess based on actual project complexity, not just node count. This is consistent with Sprint 7A's principle that "the tier is the Architect's judgment call, not a formula." (Blue Team finding)

### AC Assignment via Markers

ACs are assigned to child nodes by reading `@forgeplan-spec` markers in the code:

```typescript
// In src/auth/middleware.ts:
// @forgeplan-spec: AC-AUTH-1
export function requireAuth(req, res, next) { ... }
```

If `AC-AUTH-1` is in `src/auth/middleware.ts` and `src/auth/` belongs to child node `auth`, then `AC-AUTH-1` goes to the `auth` child spec. If a file has markers for multiple ACs that land in different children, the file goes to the child with the most ACs (or user decides).

### Dependency Redistribution

`depends_on` and `connects_to` are redistributed by tracing imports:

1. For each child node, scan its files for `import` and `require()` statements (static ES module imports and CommonJS require — V1 does NOT trace dynamic `import()` or re-exports)
2. If imports reference files in another node → add `depends_on`
3. If exports are consumed by another node → add `connects_to`
4. `shared_dependencies` inherited per child, filtered to models actually used (grep for type name in child's files)

### Orphan File Handling

Files not cleanly assignable to any child:
1. Present list to user with analysis of who imports them
2. Options: assign to a specific child, create a new `shared` node, or move to a `lib/` directory
3. Shared utilities used by all children → suggest leaving in parent scope or extracting to shared

### Execution (With Recovery)

The split writes multiple files and is NOT truly atomic. A crash mid-execution can leave inconsistent state. The recovery breadcrumb pattern handles this:

```
1. Pre-validate: run validate-manifest.js on hypothetical new manifest (in memory)
2. Write recovery breadcrumb: .forgeplan/.split-in-progress.json with before-images and plan:
   {
     "parent_node_id": "auth-api",
     "child_nodes": ["auth", "api"],
     "started_at": "2026-04-06T14:30:00Z",
     "before_images": {
       "manifest_yaml": "<full manifest YAML before split>",
       "state_json": "<full state JSON before split>",
       "parent_spec_path": ".forgeplan/specs/auth-api.yaml",
       "parent_spec_content": "<full spec YAML>"
     },
     "planned_changes": {
       "specs": [{ "path": ".forgeplan/specs/auth.yaml", "content": "..." }, ...],
       "manifest_yaml": "<new manifest YAML>",
       "state_updates": { "auth": { "status": "built", "split_from": "auth-api" }, ... }
     },
     "completed_steps": []
   }
3. If validation passes, execute in order (marking each step in completed_steps):
   a. Write new specs for each child → mark "specs" in completed_steps
   b. Write new manifest (atomic: write to .tmp, rename) → mark "manifest"
   c. Update state.json: create entries for each child, remove parent → mark "state"
   d. Update wiki: create child node pages, archive parent page (MEDIUM/LARGE only) → mark "wiki"
4. Delete recovery breadcrumb: remove .forgeplan/.split-in-progress.json
5. If validation fails: show errors, don't execute
```

**Recovery:** session-start.js detects `.forgeplan/.split-in-progress.json` on startup. If found, it reads the breadcrumb and displays actionable context:
```
Split of "auth-api" into ["auth", "api"] was interrupted.
  Started: 2026-04-06T14:30:00Z
  Completed steps: specs, manifest
  Remaining steps: state, wiki
  Resume (complete remaining steps) or Rollback (restore original state)?
```
- **Resume:** Re-validates the planned manifest (breadcrumb.planned_changes.manifest_yaml) via validate-manifest.js. If valid, replays only steps NOT in completed_steps (idempotency: check if artifact already exists before writing). If invalid, offer rollback instead.
- **Rollback:** Restores from before_images: write back original manifest, state, and spec. Delete any child specs that were created. Remove breadcrumb.

This pattern is wired into `/forgeplan:recover` (not just session-start.js) so recovery is accessible via an interactive command flow.

**Children start as "built":** They inherit the parent's code — it already exists. Route them through review to verify the split didn't break anything.

**Post-split output:** The split command explicitly names all child nodes and provides next steps:
```
Split complete: auth-api → auth, api

Next steps:
  1. /forgeplan:review auth     Review the auth node
  2. /forgeplan:review api      Review the api node
  3. /forgeplan:integrate        Verify cross-node interfaces

Note: The parent node "auth-api" no longer exists. Use child node IDs for all commands.
```

### Manifest Schema: split_from Field

Child nodes created by split include a `split_from` field in the manifest:

```yaml
nodes:
  auth:
    name: Auth Service
    type: service
    split_from: auth-api    # Parent node that was split
    # ... other fields
```

`split_from` is optional. validate-manifest.js checks:
- Type: must be a string
- Sibling consistency: if 2+ nodes share the same `split_from` value, their file_scopes must not overlap (they are siblings from the same parent — overlapping scopes would mean the split was malformed)
- The validator does NOT attempt to verify the parent historically existed — the `split_from` value is self-documenting. No `removed_nodes` field or "ID history" concept is needed.

### Post-Split Required Action

Mandatory: run `/forgeplan:integrate` after split to verify cross-node interfaces still work. The split may have broken `connects_to` contracts if the architect's import analysis missed something.

---

## Pillar 3: State Management Hardening

### Shared atomicWriteJson Utility

**File:** `scripts/lib/atomic-write.js` (~15 lines)

Three scripts currently implement their own atomic write pattern (write to .tmp, rename):
- `post-tool-use.js` (line ~44)
- `session-start.js` (inline)
- `stop-hook.js` (inline)

Extract into shared module:

```javascript
const fs = require("fs");
const path = require("path");

function atomicWriteJson(filePath, data) {
  const tmp = filePath + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Clean up .tmp file on failure (rename can fail on Windows if target locked by antivirus)
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore cleanup errors */ }
    throw err; // Re-throw so caller knows the write failed
  }
}

module.exports = { atomicWriteJson };
```

All 3 scripts switch to `const { atomicWriteJson } = require("./lib/atomic-write");`

**No file locking.** Hooks are serial (Claude Code guarantees this). No concurrent writes possible. Adding locking would be complexity for zero benefit.

### Session Context via SessionStart Look-Back (NOT SessionEnd)

> **Design change from v2:** SessionEnd was dropped. It is not a supported Claude Code hook type (confirmed by all 5 review teams). The 6 supported hook types are: SessionStart, PreCompact, PostCompact, PreToolUse, PostToolUse, Stop.

**Instead:** SessionStart already runs at every session. Enhance it to "look back" at what changed since the last session:

1. Read `state.json` → compare `session_id` with previous
2. If new session: display current node statuses and detect interrupted operations. The existing `previous_status` field only tracks pre-operation state (set when building/reviewing starts, cleared on completion) — it shows interrupted operations but NOT completed transitions. This is sufficient because SessionStart's existing ambient display already shows current status and suggested next command (Sprint 7B). The look-back adds value for interrupted operations specifically.
3. Output session context to stderr:
   ```
   Current state: auth (reviewed), api (building — interrupted)
   Wiki: not yet initialized. Will be created during first sweep.
   ```
   If `wiki_last_compiled` is null and wiki/ doesn't exist, say "not yet initialized" (not "stale").
   If `wiki_last_compiled` is set but wiki/ is missing, say "wiki deleted — will rebuild on next sweep."
   If `wiki_compiling` is true, say "wiki compilation was interrupted — will retry on next sweep."
4. Detect `.forgeplan/.split-in-progress.json` → offer recovery (also wired into `/forgeplan:recover`)

PostToolUse already appends decision markers and file changes to wiki during builds. This provides continuous cross-session context without relying on a clean exit hook. Even if a session crashes, the PostToolUse data is already written.

### State Schema Updates

Add to `templates/schemas/state-schema.json`:

```json
"wiki_last_compiled": {
  "type": ["string", "null"],
  "format": "date-time",
  "default": null,
  "description": "Timestamp of last compile-wiki.js run. Used for staleness detection."
},
"wiki_compiling": {
  "type": "boolean",
  "default": false,
  "description": "True while compile-wiki.js is running. If true at SessionStart, previous compile was interrupted — re-run."
}
```

These go at the top level alongside `session_id`, `last_updated`, etc.

> **IMPORTANT:** `wiki_last_compiled` is an OPTIONAL field — do NOT add it to the `required` array. Existing state.json files do not have this field. The staleness check (`if (!state.wiki_last_compiled) return true`) handles the null/missing case gracefully. Adding it to `required` would break all existing projects. (Orange Team finding)

### Parallel Fix Isolation

No changes needed. Worktree-manager.js (Sprint 7B+) already handles per-node worktree isolation for parallel sweep fixes. Worktrees provide full process isolation — each fix agent works in its own copy of the repo. No temp state files, no locking, no merge conflicts during fixes.

---

## Pillar 4: Guide Enhancement

### Wiki-Informed Recommendations

> **Tier gate:** Wiki-based recommendations only for MEDIUM/LARGE. SMALL guide operates as before (state-based recommendations only).

The guide skill reads wiki for smarter, evidence-based suggestions:

**What guide reads:**
1. `.forgeplan/wiki/rules.md` — are rules being followed?
2. `.forgeplan/wiki/decisions.md` — any unresolved decisions?
3. Sweep reports (`.forgeplan/sweeps/`) — recurring findings by category

**Concrete recommendation triggers:**

| Signal | Threshold | Recommendation |
|--------|-----------|----------------|
| Recurring findings in same category | >3 findings, same category, across 2+ passes | "Persistent [category] issues. Consider adding a spec constraint or refactoring the pattern." |
| High file count in node | >20 files in single node's file_scope | "Node [id] has [N] files. Consider `/forgeplan:split [id]` for finer governance." |
| High finding density | >15 findings per node in single sweep pass | "High finding density on [id] suggests more decomposition needed. Current tier: [tier]." |
| Stale wiki | wiki_last_compiled older than last state change | "Knowledge base is stale. Will refresh on next sweep, or run: node scripts/compile-wiki.js" |

**Implementation:** String matching on finding categories + file count thresholds. No LLM reasoning needed — these are deterministic checks.

### New Guide Sections

Add to guide.md after the "all reviewed" state:

```markdown
### Sweep complete, wiki available (MEDIUM/LARGE only)
Check: sweep completed AND wiki pages exist AND tier !== "SMALL"

Knowledge base has been compiled from your sweep results.

  Review your project's knowledge:
  → Read .forgeplan/wiki/decisions.md      Architectural decisions with context
  → Read .forgeplan/wiki/rules.md          Inferred conventions from specs and code

  Next actions:
  → /forgeplan:revise [node]     Make improvements based on patterns
  → /forgeplan:deep-build        Run another sweep cycle
  → /forgeplan:split [node]      Decompose a node if findings suggest it
```

---

## Pre-Tool-Use Updates

### Wiki Directory Whitelist

Add `.forgeplan/wiki/` to allowed write paths, scoped by operation type to maintain security boundaries:

**Changes to pre-tool-use.js:**

1. **Bash safe patterns** — add compile-wiki.js:
```javascript
/^\s*node\s+[^\s]*compile-wiki\.js/,    // wiki knowledge compilation
```

2. **Write/Edit path allowance — scoped by operation** (Red Team finding: don't blanket-allow all wiki/ writes):

Insert BEFORE the existing `.forgeplan/` block at line ~178 (before the general block fires):
```javascript
// Wiki writes — scoped by operation type
// SECURITY: path traversal is already prevented by path.relative() at line 75-77 which resolves
// ".forgeplan/wiki/../../state.json" to "state.json" before we see it. Defense-in-depth: reject
// any relPath containing ".." segments.
if (relPath.includes('..')) {
  return { block: true, message: `Path traversal detected: ${relPath}` };
}
if (relPath.startsWith('.forgeplan/wiki/')) {
  if (activeStatus === 'sweeping') {
    return { block: false }; // Sweep is cross-cutting, needs full wiki access
  }
  if (activeStatus === 'building' || activeStatus === 'review-fixing') {
    const activeNodeId = state.active_node?.node;
    if (activeNodeId && relPath === `.forgeplan/wiki/nodes/${activeNodeId}.md`) {
      return { block: false }; // Only the active node's wiki page
    }
    return { block: true, message: `Wiki write restricted: can only write to wiki/nodes/${activeNodeId}.md during ${activeStatus}` };
  }
}
```

Note: Uses `activeStatus` (matching existing variable name at line 152 of pre-tool-use.js), `state.active_node.node` (matching state schema field name), and `{ block: false }` / `{ block: true, message }` return format. No `path.normalize()` needed — `relPath` is already forward-slash normalized by existing code at line 75-77 (`path.relative().replace(/\\\\/g, "/")`), and `path.relative` already resolves traversal. The `..` guard is defense-in-depth only. (Red Team v5 finding: path.normalize is counterproductive on Windows — converts forward slashes back to backslashes)

3. **Sweep analysis mode whitelist** — add wiki/ to the hardcoded allowlist at lines 131-146 (the code path where `sweep_state` is active but `active_node` is null):
```javascript
// Add to the sweep analysis mode allowlist:
'.forgeplan/wiki/',
```
This is a SEPARATE code path from the active_node path above. Without this addition, compile-wiki.js called during sweep Phase 1 would be blocked. (Orange Team finding)

### Annotation Enforcement Updates

**Stop hook (existing behavior, no change needed):**
Already verifies `@forgeplan-node` and `@forgeplan-spec` markers. Sprint 9 does NOT add enforcement for `@forgeplan-decision` — this is advisory. The sweep contract-drift agent flags missing markers instead.

**Sweep contract-drift agent update:**
Add check: "Does this node have 0 `@forgeplan-decision` markers?" If yes, emit finding with confidence 60: "Node [id] has no decision markers. Consider annotating significant architectural choices for the knowledge graph." This is advisory — not a build blocker.

---

## File Inventory

### New Files (5)

| File | Lines | Purpose |
|------|-------|---------|
| `scripts/compile-wiki.js` | ~150 | Wiki compiler orchestrator: argument parsing, manifest/state loading, file discovery, compile attempt tracking, atomic writes, staleness function. Delegates page generation to wiki-builder.js |
| `scripts/lib/wiki-builder.js` | ~300 | Wiki page generation library. Exports: `buildNodePage(nodeId, spec, files, previousPage)`, `buildDecisionsPage(allDecisions)`, `buildRulesPage(specConstraints, inferredPatterns)`, `extractDecisionMarkers(fileContents)`, `inferPatterns(allFiles)`. Handles all markdown generation, pattern inference, cross-reference building |
| `scripts/lib/atomic-write.js` | ~15 | Shared atomicWriteJson utility extracted from 3 scripts |
| `commands/split.md` | ~80 | Slash command for `/forgeplan:split [node-id]` — orchestrates architect split mode |
| `.forgeplan/wiki/` (directory) | — | Wiki directory structure created during discovery for MEDIUM/LARGE (index.md, nodes/, decisions.md, rules.md) |

> **Removed from v2:** `scripts/session-end.js` — SessionEnd is not a supported hook type. Session context handled by SessionStart look-back + PostToolUse continuous appending.

### Modified Files (~18)

| File | Changes | Difficulty |
|------|---------|------------|
| `agents/architect.md` | Add split mode (code analysis, proposal template, dependency redistribution, triggered by `--split` arg) | High |
| `agents/builder.md` | Add wiki reading (rules + dep nodes, MEDIUM/LARGE only), decision marker writing rules | Medium |
| `commands/discover.md` | Initialize wiki directory structure during discovery (MEDIUM/LARGE only) | Low |
| `commands/guide.md` | Add wiki-informed recommendations (recurring findings, split triggers) | Medium |
| `commands/sweep.md` | Add compile-wiki.js at Phase 1 step 6 and Phase 7 finalization | Medium |
| `commands/deep-build.md` | Update phase diagram to include wiki compilation | Low |
| `scripts/post-tool-use.js` | Add wiki appending (~30 lines): scan tool_input for decision markers, append to node pages. Handle Write (content) vs Edit (new_string) differently | Medium |
| `scripts/session-start.js` | Add wiki staleness advisory (stderr message), split recovery detection (.split-in-progress.json), session look-back diff | Medium |
| `scripts/pre-tool-use.js` | Whitelist wiki/ writes (scoped by operation + node), compile-wiki.js in Bash safe patterns, wiki/ in sweep analysis mode allowlist | Medium |
| `scripts/validate-manifest.js` | Add split_from field validation | Low |
| `templates/schemas/state-schema.json` | Add `wiki_last_compiled` AND `wiki_compiling` fields (both optional, NOT in required array) | Low |
| `agents/sweep-contract-drift.md` | Add decision marker density check (0 markers = finding) | Low |
| `scripts/stop-hook.js` | Switch to shared atomicWriteJson import | Low |
| `scripts/compact-context.js` | Add wiki/decisions.md to compact context. EXCLUDE wiki/rules.md — sweep agents must not receive rules through context restoration (trust boundary enforcement). Only decisions and cross-refs are safe to restore. | Low |

| `commands/recover.md` | Add split recovery: detect .split-in-progress.json, offer resume/rollback with re-validation | Medium |
| `templates/schemas/manifest-schema.yaml` | Add `split_from` as optional node field | Low |

> **Not modified:** `hooks/hooks.json` (no SessionEnd hook to add), `commands/spec.md` (rules.md populated by compile-wiki.js, not spec command)

---

## Build Order (12 Steps)

Ordered by architectural dependency. Each step can be verified independently.

### Step 1: State Schema + Shared Utility (foundation)
**Files:** `templates/schemas/state-schema.json`, `scripts/lib/atomic-write.js`
- Add `wiki_last_compiled` AND `wiki_compiling` fields to state schema (both optional, NOT in required array)
- Create atomic-write.js shared module
- Update `stop-hook.js`, `post-tool-use.js`, `session-start.js` to use shared import
**Verify:** Scripts still function with shared import (run session-start.js)

### Step 2: compile-wiki.js (core engine)
**Files:** `scripts/compile-wiki.js`, `scripts/lib/wiki-builder.js`
- Implement compiler: manifest reading, spec parsing, decision marker extraction, pattern inference, cross-reference building, atomic writes
- Decision marker regex: `/@forgeplan-decision:\s*(D-\S+-\d+-\S+)\s*--\s*([^\n]+)/g`
- Pattern inference from spec constraints + recurring code structures
- Self-correction: regenerate from scratch, not patch
- Reconcile vs manifest (archive removed nodes, create new skeletons)
- Performance: use manifest files array, multi-pattern regex for >100 files, Promise.all for parallel I/O
- Compile attempt tracking (max 3 failures before skip)
**Verify:** Run against existing .forgeplan/ directory — should produce wiki/ pages

### Step 3: Pre-Tool-Use Whitelist (bootstrap safety)
**Files:** `scripts/pre-tool-use.js`
- Add compile-wiki.js to Bash safe patterns
- Add .forgeplan/wiki/ to write paths — scoped: sweeping/deep-building = all wiki/, building/review-fixing = active node's wiki page only
- Add .forgeplan/wiki/ to sweep analysis mode allowlist (separate code path, lines 131-146)
- Use `{ block: false }` return format (not `{ allowed: true }`)
**Verify:** Bash command `node scripts/compile-wiki.js` passes pre-tool-use check. Write to wiki/nodes/auth.md during building status passes. Write to wiki/nodes/api.md during building of auth node is blocked.

### Step 4: PostToolUse Wiki Appending
**Files:** `scripts/post-tool-use.js`
- Add tier gate: skip if SMALL
- Add decision marker extraction regex
- Handle Write tool (scan `tool_input.content`) vs Edit tool (scan `tool_input.new_string`)
- Append to `wiki/nodes/[active-node].md` (file, not directory)
- Create full wiki skeleton if missing (not just empty dirs)
- Skip if `tool_input.content` (Write) or `tool_input.new_string` (Edit) exceeds 50KB — large files are unlikely to contain meaningful markers and scanning them wastes time
- Skip binary files: if file extension matches `.png`, `.jpg`, `.gif`, `.woff`, `.eot`, `.ico`, `.pdf`, skip marker scanning entirely
- Keep it <20ms (scan tool_input only, no full file reads)
**Verify:** Requires active build context (active_node set in state.json). Write a file with `@forgeplan-decision` marker → check `wiki/nodes/[node].md` page updated

### Step 5: SessionStart Enhancements
**Files:** `scripts/session-start.js`
- Add `isWikiStale()` helper with wiki integrity check (wiki_last_compiled set but index.md missing = deleted)
- If stale: output stderr advisory (NOT synchronous compile — keeps startup fast)
- Add session look-back: display current node statuses, detect interrupted operations via previous_status field (shows in-progress ops only, not completed transitions — this is sufficient alongside the existing ambient status display)
- Add split recovery: detect `.forgeplan/.split-in-progress.json`, offer resume/rollback
**Verify:** Start session with stale wiki → should see advisory message. Start session with .split-in-progress.json → should see recovery prompt

### Step 6: Builder Wiki Reading + Decision Marker Writing
**Files:** `agents/builder.md`
- Add tier gate: SMALL skips wiki reading entirely
- Add "Wiki-Informed Building" section: read rules.md, dep node pages (MEDIUM/LARGE only)
- Add note: during sequential builds (before sweep), wiki pages are partial — read spec as primary source
- Add decision marker writing rules: `D-[node]-[N]-[slug]` format, at minimum 1 per node
- Fallback: if wiki missing, read specs directly (handles first build)
**Verify:** Read updated builder.md, confirm instructions are clear, tier-gated, and non-blocking

### Step 7: Discover Wiki Initialization
**Files:** `commands/discover.md`
- Add tier gate: only create wiki/ for MEDIUM/LARGE
- After manifest creation, create wiki/ directory structure
- Generate index.md from manifest (project name, tier, tech stack)
- Generate skeleton node pages from manifest nodes
- Generate rules.md from spec constraints (if specs already exist)
- Delegate to compile-wiki.js for page generation (single source of truth — don't duplicate skeleton logic)
**Verify:** Run discover for MEDIUM project → check wiki/ directory created. Run discover for SMALL project → no wiki/ created

### Step 8: Architect Split Mode
**Files:** `agents/architect.md`
- Add split mode section (triggered when split command passes `--split [node-id]` argument)
- Code analysis process: directory groupings, import clusters, domain boundaries
- Proposal template with AC assignment, dependency redistribution, orphan handling
- Advisory tier reassessment (not hard threshold)
**Verify:** Read updated architect.md, confirm split analysis process is complete and trigger mechanism is clear

### Step 9: Validate-Manifest Updates
**Files:** `scripts/validate-manifest.js`
- Add split_from field validation: if present, referenced parent should have existed (informational, not blocking)
- Wiki directory existence check (non-blocking info)
**Verify:** Run validate-manifest.js on existing manifest — no new errors

### Step 10: Split Command + Recovery
**Files:** `commands/split.md`, `commands/recover.md`
- **split.md:** Prerequisite checks (node status, no active operation), invoke architect in split mode via `--split` argument, pre-validate with validate-manifest.js on hypothetical manifest, write `.split-in-progress.json` breadcrumb before execution, execute (new specs, manifest, state with split_from, wiki), delete breadcrumb, output child node names and next steps, require /forgeplan:integrate
- **recover.md:** Add split-specific recovery branch: detect `.split-in-progress.json`, read breadcrumb, re-validate planned manifest via validate-manifest.js, offer resume (replay incomplete steps with idempotency checks) or rollback (restore from before_images). This is the interactive recovery surface — session-start.js only detects and advises, recover.md executes.
**Verify:** Read both commands. Trace split flow including crash-at-each-step recovery. Verify recover.md has the split branch alongside existing stuck-build recovery.

### Step 11: Sweep Integration
**Files:** `commands/sweep.md`, `agents/sweep-contract-drift.md`
- Add compile-wiki.js invocation at Phase 1 step 7 (after existing step 6 "set active_node null", before dispatching agents)
- Add compile-wiki.js invocation at Phase 7 step 4 (after summary, before clearing sweep_state)
- On pass 2+, dispatch agents with wiki pages + modified files + files with pending findings (not full source). Exception: sweep-adversarial always gets full source.
- Convergence: do not retire agent if its category has pending findings
- Contract-drift: add decision marker density check (0 markers = finding, confidence 60)
- Gate all wiki operations on tier !== SMALL
**Verify:** Read updated sweep.md, confirm phase steps are numbered correctly, compile invocations placed at the right step numbers

### Step 12: Guide + Deep-Build + Compact Context
**Files:** `commands/guide.md`, `commands/deep-build.md`, `scripts/compact-context.js`
- Guide: add wiki-informed recommendation triggers and new guide sections (MEDIUM/LARGE only)
- Deep-build: update phase steps to include wiki compilation after build and at finalization
- Compact context: add wiki/decisions.md to saved context (EXCLUDE wiki/rules.md per trust boundary — sweep agents must not receive rules through context restoration)
**Verify:** Read all 3 files, confirm wiki integration is consistent and tier-gated

---

## Integration with Existing Pipeline

### Sweep Phase Steps (Updated)

Uses integer step numbers within existing phases, not ".5" sub-phases:

```
Phase 1: Initialize
  Steps 1-6: (existing) Load manifest, state, specs, select agents, set active_node null
  Step 7: Run compile-wiki.js (NEW — build knowledge base before agents read it)
           Skip for SMALL tier.

Phase 2: Dispatch agents
  Pass 1: Agents receive full source files + wiki pages (if available)
  Pass 2+: Agents receive wiki pages + source files modified since last pass
            + source files referenced by any PENDING finding for the agent's category
            (Read from sweep_state.modified_files_by_pass[String(pass-1)] for modified files,
             and sweep_state.findings.pending filtered by agent category for pending-finding files)
            Agents still have Read/Grep tools for on-demand source inspection of other files.
            The modified+pending dispatch reduces upfront token cost, not agent capability.
            Exception: sweep-adversarial (Red Team, Opus) ALWAYS receives full source on every pass.
  Convergence: Do NOT retire an agent if its category still has pending findings in sweep_state.
               Only count a clean pass when agent returns CLEAN AND zero pending findings in its category.

Phase 3: Merge/dedup findings
  (existing behavior, no changes)

Phase 4: Fix cycle
  Step 1-N: (existing) Dispatch fix agents, apply fixes
  Step N+1: (NO recompile here — defer to Phase 7. Agents already have source.)

Phase 5: Re-integrate / loop back to Phase 2
  (existing behavior, no changes)

Phase 6: Cross-model verification
  (existing behavior, no changes)

Phase 7: Finalize
  Steps 1-3: (existing) Update sweep_state to finalizing, write summary, clean worktrees
  Step 4: Run compile-wiki.js (NEW — update wiki for next session). Skip for SMALL tier.
  Step 5: Clear sweep_state, present results (existing steps 4-5, renumbered)
```

### Deep-Build Phase Steps (Updated)

Renumbered to sequential integers (current deep-build.md uses Phase 2.5 and 4.5 — renumber to 3 and 6):

```
Phase 1: Initialize
Phase 2: Build all nodes (per tier)
  Final step: Run compile-wiki.js after all builds complete (NEW, MEDIUM/LARGE)
Phase 3: Verify-runnable (Phase A) [was Phase 2.5]
Phase 4: Integration check [was Phase 3]
Phase 5: Claude sweep (includes wiki compilation at Phase 1 step 7 and Phase 7 step 4) [was Phase 4]
Phase 6: Runtime verification (Phase B, MEDIUM/LARGE only) [was Phase 4.5]
Phase 7: Cross-model verification (tier-aware) [was Phase 5]
Phase 8: Final report + verify-runnable + certification [was Phase 6]
```

---

## Migration Path for Existing Projects

Sprint 9 features are additive — no breaking changes to existing state.json, manifest.yaml, or specs.

**On first session with Sprint 9 code:**
- `wiki_last_compiled` and `wiki_compiling` fields are absent from state.json. The staleness check handles null gracefully (`if (!state.wiki_last_compiled) return true`). No migration needed.
- `split_from` field is absent from existing manifests. validate-manifest.js treats it as optional. No migration needed.
- Wiki directory does not exist. PostToolUse and compile-wiki.js both handle missing wiki gracefully (create skeleton or skip based on tier). No migration needed.

**When does wiki get created for existing MEDIUM/LARGE projects?**
- First sweep after Sprint 9 upgrade: compile-wiki.js runs at Phase 1 step 7, creates wiki/ from existing specs + source + sweep reports. Full wiki available from that point.
- Or: user manually runs `node scripts/compile-wiki.js` to bootstrap wiki.

**No migration script needed.** All Sprint 9 features activate automatically based on tier and existing project state.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Wiki compilation too slow for large projects | compile-wiki.js uses manifest files array (no re-globbing), multi-pattern regex for >100 files, Promise.all for parallel I/O. Target: <5s for 10-node project |
| PostToolUse hook latency increase | Scan tool_input only (<20ms). No file reads. Direct fs writes. Benchmark after implementation |
| Builder ignores wiki (prompt too long) | Wiki reading is 2 specific files, not "read everything." Rules.md is typically <50 lines |
| Decision marker clutter in code | Only 1 new marker type. ~1 decision marker per significant architectural choice. Far less than JSDoc |
| Split command creates invalid state | Recovery breadcrumb with before-images, per-step completion tracking, and re-validation on resume. Wired into /forgeplan:recover for interactive recovery. Mandatory integrate after split |
| Split regret (wrong boundary chosen) | V1 has no unsplit/merge command. Workaround: manually edit manifest to recombine nodes, re-run /forgeplan:integrate. Merge command deferred to Sprint 10+ |
| Pass 2+ stale wiki after fixes | Wiki only compiled at Phase 1 and Phase 7. Pass 2+ agents receive modified files + pending-finding files alongside wiki, so they see actual code for files that matter. Agents have Read/Grep for on-demand access to other files. Adversarial agent always gets full source |
| Wiki used as enforcement allow-list | CRITICAL: Rules.md is context, NEVER enforcement. Sweep agents independently analyze code. Adversarial agent audits rules.md for dangerous rules |
| Wiki pages conflict with source truth | Self-correction loop: wiki regenerated from scratch every compile. Source is always authoritative. Wiki is a compiled view, never the source of truth |
| SMALL tier overhead from wiki | Wiki entirely skipped for SMALL tier. All wiki hooks, compile-wiki, and builder wiki reading are tier-gated |
| Wiki manually deleted by user | SessionStart detects wiki_last_compiled set but index.md missing → advisory to recompile. PostToolUse recreates full skeleton if wiki dir missing |
| Semantically wrong rules pass self-correction | Self-correction handles structural staleness only. Sweep-adversarial agent covers semantic validation of rules.md |
| Scalability beyond 20 nodes | V1 targets 10-node projects. At 50+ nodes: rules.md and decisions.md become too large for agent context, compile-wiki.js exceeds 5s target, sweep dispatch wiki pages may exceed token budget. **Sprint 10 backlog:** per-domain rules/decisions files at N > 20 nodes, incremental compilation for large projects |
| compile-wiki.js is a single point of failure | 5-layer resilience: if compile fails, agents fall back to specs + source (Layer 1). Compile attempt tracking limits retries. wiki_compiling flag detects interruptions. Source is always authoritative — wiki is an optimization, not a requirement |

---

## Success Criteria

1. **Token reduction (MEDIUM/LARGE):** On sweep pass 2+, agents receive wiki + modified files + pending-finding files (not full source), reducing token usage vs pass 1. sweep-adversarial always gets full source. Measure: compare total tokens dispatched in pass 1 vs pass 2
2. **Knowledge persistence:** Decisions documented in pass 1 are visible in wiki for pass 3 without re-discovery
3. **Split works end-to-end:** Split a SMALL-tier 2-node project → 3 nodes → user reassesses tier → MEDIUM governance applies correctly
4. **Self-correction verified:** Remove a spec constraint → recompile → corresponding rule vanishes from rules.md
5. **No regression:** All existing commands/hooks still work without wiki present (SMALL tier, first build scenario)
6. **Guide gives actionable advice:** Guide surfaces specific split recommendations and pattern observations based on wiki data, not generic next-step suggestions
7. **SMALL tier unaffected:** A SMALL-tier project experiences zero wiki overhead — no wiki dir created, no PostToolUse wiki appending, no compile-wiki invocations

---

## Review Findings Incorporated (v3)

For traceability, key review findings and how they were addressed:

| Finding | Team(s) | Resolution |
|---------|---------|------------|
| SessionEnd not a real hook type | All 5 | Dropped. SessionStart look-back + PostToolUse continuous appending |
| Split "atomic" is multi-file | Red, Blue, White | Added .split-in-progress.json breadcrumb + recovery |
| Token savings has no mechanism | Rainbow | Defined: pass 2+ sends wiki + modified files + pending-finding files. Adversarial always gets full source |
| Return format {allowed:true} wrong | Orange, White | Fixed to {block: false} throughout |
| tool_input differs Write vs Edit | Orange, White | Specified: content for Write, new_string for Edit |
| Wiki path file vs directory | Blue | Standardized on wiki/nodes/[id].md (file) |
| sweep-reports/ vs sweeps/ | Orange | Fixed to .forgeplan/sweeps/ |
| Sweep analysis mode missing wiki whitelist | Orange | Added wiki/ to separate sweep analysis allowlist |
| Wiki whitelist too broad | Red | Scoped by operation: building = active node only, sweeping = all |
| SMALL tier wiki overhead | Blue, Rainbow | Added tier gate: SMALL skips wiki entirely |
| 5 markers too many, subjective | Rainbow | Reduced to 3 (node, spec, decision). Patterns/rules inferred by compile-wiki |
| Evidence tracking no consumer | Rainbow | Deferred. compile-wiki generates rules/patterns without pass-counting metadata |
| Wiki duplicates manifest/spec/state | Rainbow | Wiki pages contain only novel info: decisions, findings, cross-refs |
| SessionStart compile blocks startup | Blue, Rainbow, White | Changed to stderr advisory, compile deferred to sweep or explicit invocation |
| Builder marker minimums too rigid | Blue, Rainbow | Changed to "when applicable" + per-node advisory from sweep |
| compile-wiki ~300 lines underestimated | White | Revised to ~450, split into orchestrator + wiki-builder lib |
| Phase ".5" numbering mismatch | Orange, White | Changed to step numbers within existing phases |
| split_from/removed_nodes undefined | Orange | Defined split_from field, dropped removed_nodes (unnecessary) |
| wiki_last_compiled must be optional | Orange | Explicitly noted NOT in required array |
| Decision ID collision in parallel | Rainbow | Node-scoped IDs: D-[node]-[N]-[slug] |
| Rules.md as enforcement allow-list | Red | Added trust boundary section: rules are context, never allow-lists |
| Decisions.md format unspecified | Blue | Added format example |
| Wiki deletion recovery | Blue | SessionStart integrity check + PostToolUse skeleton recreation |
| Partial wiki during sequential builds | White | Added note to builder: read spec as primary source before first sweep |
| Split needs explicit next-steps output | Blue | Added post-split output template with child names and commands |
| Architect split trigger mechanism | Orange | Specified: --split argument passed by split command |
| Archive retention | Rainbow | compile-wiki prunes >30 days or >50 entries |

## Review Round 2 Findings Incorporated (v4)

| Finding | Team(s) | Resolution |
|---------|---------|------------|
| Pattern inference algorithm undefined / manipulable | Red, Rainbow, White | Defined V1 regex-only scope: import clustering, middleware signatures, error handling shapes. No AST parsing. Threshold: 3+ files |
| Trust boundary prompt-only, not structural | Red | Structural defense: sweep agents do NOT receive rules.md. Only builder gets it. Adversarial agent receives it to audit. Trust boundary expanded to cover decisions.md |
| Token savings blind spot: unmodified files with pending findings | Red, Blue | Pass 2+ now includes files with pending findings for agent's category + adversarial always gets full source. Convergence blocks if pending findings exist |
| Split breadcrumb schema undefined / forgery risk | Red, White | Defined full JSON schema with before_images. Resume re-validates via validate-manifest.js. Wired into /forgeplan:recover |
| Decision IDs orphaned after split | Red | compile-wiki.js step 2g redistributes parent decisions to children based on file scope |
| Decision descriptions as injection vector | Red | Trust boundary expanded: decisions are historical records, not directives. Builder verifies against spec |
| Builder reads empty rules.md on first build | Blue | Builder ALWAYS reads spec constraints directly as primary source. Wiki is supplementary, not primary |
| Tier upgrade wiki bootstrap gap | Blue | compile-wiki.js step 0: create wiki/ if missing |
| node_id vs node property name in code snippet | Orange | Fixed to state.active_node?.node |
| deep-building not a valid status + wrong variable name | Orange | Removed deep-building check, fixed to activeStatus |
| Sweep Phase 1 step numbering collision | Orange | compile-wiki.js is step 7 (after existing step 6) |
| wiki-builder.js missing from file inventory | Orange, White | Added as separate row with API surface defined |
| split_from validation unverifiable | Orange | Clarified: type check + sibling file_scope overlap check. No historical existence check |
| Modified files consumption path unspecified | White | Specified: read modified_files_by_pass[String(N-1)] + pending findings by category |
| Split recovery not in recover.md | Codex | Added recover.md to modified files. Split recovery wired into /forgeplan:recover |
| Session look-back has no persisted baseline | Codex | Uses existing per-node previous_status field in state schema |
| Past Findings producer path undefined | Codex | Explicit: review → .forgeplan/reviews/ → compile-wiki.js → wiki Past Findings |
| discovery-index.md handoff with wiki | Codex | Added handoff note: discover checks for existing discovery-index.md |
| manifest-schema.yaml needs split_from | Codex | Added to modified files |
| Phase 7 duplicate step number in sweep.md | Orange | Explicit step numbers in design (steps 1-3, then 4 for wiki, then 5 for cleanup) |
| Archive pruning per-run cap | Red | Max 10 pruned per compilation run |

## Qwen 3.5 Review Findings Incorporated (v5)

| Finding | Severity | Resolution |
|---------|----------|------------|
| Path traversal in wiki write whitelist (.forgeplan/wiki/../../state.json) | CRITICAL | Added path.normalize() before startsWith check |
| compact-context.js bypasses trust boundary (restores rules.md to sweep agents) | CRITICAL | compact-context.js now saves only decisions.md, excludes rules.md |
| Wiki batch atomicity — partial compile on crash | CRITICAL | Added wiki_compiling flag + staging directory (.tmp-compile/) |
| Past Findings preservation contradicts "regenerate from scratch" | HIGH | Changed to re-derive from sweeps/ and reviews/ (true regeneration) |
| No exclusion patterns for compile-wiki.js (node_modules, dist, etc.) | HIGH | Added exclusion patterns for glob fallback |
| Greedy regex backtracking in decision marker pattern | HIGH | Changed `.+` to `[^\n]+` |
| Deep-build still uses Phase 2.5/4.5 numbering | LOW | Renumbered to sequential phases |
| Import tracing only handles static imports | MEDIUM | Noted: V1 handles import + require(), not dynamic import() |
| No migration path for existing projects | MEDIUM | Added migration section — all features activate automatically, no script needed |
| Node ID validation for wiki paths | MEDIUM | Deferred — validate-manifest.js already validates node IDs. Wiki creation uses manifest-validated IDs |
| Split command argument passing to architect | MEDIUM | Not needed — Claude reads command .md instructions directly (standard Claude Code pattern) |
