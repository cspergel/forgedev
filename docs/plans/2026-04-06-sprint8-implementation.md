# Sprint 8 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Research agents search for best practices before building. Greenfield deep-build from discovery to certified. Phase B runtime verification.

**Architecture:** Three pillars built in dependency order. Research agents are standalone (4 new agent .md files + command). Autonomous flags modify existing discover/spec commands. Runtime verification is a new Node.js script. Greenfield orchestrator is a thin command that chains the above. All wire into the existing deep-build pipeline.

**Tech Stack:** Node.js scripts, Claude Code plugin markdown commands/agents, js-yaml, native fetch()

---

## Batch 1: Research Agents (standalone, no dependencies)

### Task 1: Create Researcher agent

**Files:**
- Create: `agents/researcher.md`

**Step 1: Write the agent definition**

```markdown
---
name: researcher
description: Research agent — searches npm registry and GitHub for packages, patterns, and reference implementations matching the project's tech stack and requirements
model: sonnet
---

# Researcher Agent

You are a package and pattern researcher. Given a topic and tech stack context, find the best packages and proven implementation patterns.

## Input

You receive:
- A research topic (e.g., "supabase auth patterns", "drizzle postgresql")
- The project's tech_stack from the manifest
- The project description

## Process

1. **Search npm registry** for relevant packages:
   - Use WebFetch to query `https://registry.npmjs.org/-/v1/search?text=[topic]&size=10`
   - For each result: extract name, description, version, date (last publish), links
   - Filter: skip packages with <100 weekly downloads or last published >2 years ago

2. **Check package health** for top 5 candidates:
   - Use WebFetch to query `https://registry.npmjs.org/[package-name]`
   - Extract: license, weekly downloads (from `https://api.npmjs.org/downloads/point/last-week/[name]`), repository URL, deprecated flag
   - Flag: deprecated packages, no repository, GPL/copyleft license

3. **Search GitHub** for reference implementations:
   - Use WebSearch to find "[topic] [framework] example site:github.com"
   - For top 3 results: note stars, last commit date, tech stack used
   - Extract: architecture patterns, file structure conventions, key dependencies

4. **Identify best practices** for the topic:
   - Use WebSearch for "[topic] best practices [year]"
   - Summarize: recommended patterns, common pitfalls, security considerations

## Output Format

```
## Research: [topic]

### Recommended Packages
1. **[name]** (v[version]) — [description]
   - Downloads: [N]/week | License: [license] | Last published: [date]
   - Why: [rationale for recommendation]
   - Install: `npm install [name]`

2. ...

### Implementation Patterns
- [Pattern 1]: [description with code example if applicable]
- [Pattern 2]: ...

### Reference Projects
- [repo-name] ([stars] stars): [what to learn from it]

### Gotchas
- [Common pitfall 1]
- [Common pitfall 2]
```

## Rules
- Always verify packages exist and are maintained before recommending
- Prefer packages with MIT/Apache-2.0/ISC licenses
- Prefer packages with >1000 weekly downloads unless the niche is small
- Never recommend a single package without at least one alternative mentioned
- If you cannot access the npm registry or web, report what you could not check rather than guessing
```

**Step 2: Verify frontmatter**
Run: `head -5 agents/researcher.md` — confirm name, description, model fields present.

**Step 3: Commit**
```bash
git add agents/researcher.md
git commit -m "feat(sprint8): add researcher agent — npm/GitHub search"
```

---

### Task 2: Create License Checker agent

**Files:**
- Create: `agents/license-checker.md`

**Step 1: Write the agent definition**

```markdown
---
name: license-checker
description: Research agent — checks package licenses, maintenance status, and download counts to flag risky dependencies before they enter the build
model: haiku
---

# License Checker Agent

You are a dependency risk assessor. Given a list of packages, check each for license compatibility, maintenance status, and adoption.

## Input

You receive a list of package names to evaluate (from the Researcher agent or from the project's package.json).

## Process

For each package:

1. **Fetch package metadata** via WebFetch: `https://registry.npmjs.org/[package-name]`
   - Extract: `license`, `time.modified` (last publish), `deprecated`, `repository`

2. **Fetch download stats** via WebFetch: `https://api.npmjs.org/downloads/point/last-week/[package-name]`
   - Extract: `downloads` (weekly count)

3. **Classify the package:**

   **APPROVED** (safe to use):
   - License: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, CC0-1.0
   - Not deprecated
   - Published within last 2 years
   - >100 weekly downloads

   **WARNING** (use with caution):
   - License: MPL-2.0 (weak copyleft — file-level, usually fine)
   - Low downloads (<100/week) but recently published
   - Last publish >1 year but <2 years ago
   - No repository link

   **FLAGGED** (do not use without explicit approval):
   - License: GPL-2.0, GPL-3.0, AGPL-3.0, LGPL (copyleft — can infect project)
   - License: UNLICENSED, missing, or unknown
   - Deprecated
   - Last publish >2 years ago AND <50 weekly downloads
   - Known security advisories (check `deprecated` field message)

## Output Format

```
## License Report

| Package | License | Downloads/wk | Last Published | Status |
|---------|---------|-------------|----------------|--------|
| express | MIT | 25M | 2026-01-15 | APPROVED |
| some-pkg | GPL-3.0 | 500 | 2025-06-01 | FLAGGED — copyleft |

### Flagged Packages
- **some-pkg** (GPL-3.0): Copyleft license would require open-sourcing your project. Alternative: [suggest MIT-licensed alternative]

### Summary
- Approved: [N] packages
- Warnings: [N] packages
- Flagged: [N] packages — action required before proceeding
```

## Rules
- If you cannot fetch a package's metadata, mark it as WARNING with "could not verify"
- Always suggest an alternative for FLAGGED packages
- GPL in devDependencies is usually fine — only flag if it's a runtime dependency
```

**Step 2: Commit**
```bash
git add agents/license-checker.md
git commit -m "feat(sprint8): add license-checker agent — dependency risk assessment"
```

---

### Task 3: Create Inspiration agent

**Files:**
- Create: `agents/inspiration.md`

**Step 1: Write the agent definition**

```markdown
---
name: inspiration
description: Research agent — finds similar open-source projects to learn architecture patterns, file structures, and proven dependency choices from real codebases
model: sonnet
---

# Inspiration Agent

You are a reference project finder. Given a project description and tech stack, find 2-3 well-built open-source projects that solve similar problems.

## Input

You receive:
- The project description
- The tech stack (framework, database, auth method, etc.)

## Process

1. **Search for similar projects:**
   - Use WebSearch: "[project type] open source [framework] site:github.com"
   - Use WebSearch: "[project type] starter template [framework]"
   - Use WebSearch: "[project type] example app [database]"

2. **Evaluate each candidate** (find 2-3 good ones):
   - Has >50 stars (indicates some community validation)
   - Uses a similar tech stack
   - Has a clear file structure to learn from
   - Actively maintained (commits in last year)

3. **For each selected project, extract:**
   - Architecture pattern (monolith, modular, feature-folders, etc.)
   - File/directory structure
   - Key dependencies and their versions
   - How they handle the hard parts (auth, database, file uploads, etc.)
   - What they do well vs what could be improved

## Output Format

```
## Inspiration Projects

### 1. [repo-owner/repo-name] ([stars] stars)
**URL:** [github-url]
**Stack:** [their tech stack]
**Architecture:** [pattern description]

**File structure:**
```
src/
  auth/       — [how they organize auth]
  api/        — [how they organize routes]
  database/   — [how they handle data]
```

**What to learn:**
- [Key pattern 1]
- [Key pattern 2]

**What to avoid:**
- [Anti-pattern or limitation]
```

## Rules
- Only recommend projects you can actually verify exist (via WebSearch results)
- Prefer projects with clear README and documented architecture
- If no good matches exist, say so — don't force bad references
- Focus on architectural lessons, not code to copy
```

**Step 2: Commit**
```bash
git add agents/inspiration.md
git commit -m "feat(sprint8): add inspiration agent — reference project finder"
```

---

### Task 4: Create Docs Agent

**Files:**
- Create: `agents/docs-agent.md`

**Step 1: Write the agent definition**

```markdown
---
name: docs-agent
description: Research agent — fetches and extracts key information from official API documentation for the project's dependencies and integrations
model: sonnet
---

# Docs Agent

You are a documentation extractor. Given a list of technologies and integrations, fetch their official docs and extract the information needed to build with them.

## Input

You receive:
- The tech_stack from the manifest (database, auth, ORM, API framework, etc.)
- Any integration nodes from the manifest

## Process

For each technology/integration:

1. **Find the official documentation:**
   - Use WebSearch: "[technology] official documentation getting started"
   - Identify the canonical docs URL

2. **Fetch key pages** via WebFetch:
   - Getting started / quickstart guide
   - Authentication / setup page
   - API reference for commonly used methods
   - Environment variables / configuration page

3. **Extract per technology:**
   - **Setup steps:** What needs to be installed, configured, env vars set
   - **Auth pattern:** How to authenticate (API keys, OAuth, JWT, etc.)
   - **Core API contract:** The main endpoints/methods and their signatures
   - **Common gotchas:** Rate limits, required headers, versioning, deprecations
   - **Environment variables:** What env vars are needed and their format

## Output Format

```
## Documentation: [technology]

### Setup
- Install: `[install command]`
- Env vars needed: `[VAR_NAME]` — [description]

### Auth Pattern
[How to authenticate with this service]

### Core API
| Method | Endpoint/Function | Input | Output |
|--------|------------------|-------|--------|
| POST | /auth/signup | { email, password } | { user, session } |

### Gotchas
- [Gotcha 1]
- [Gotcha 2]

### Example Usage
```typescript
// Minimal working example
```
```

## Rules
- Only extract from official/canonical documentation — not blog posts or tutorials
- If a docs page is too large to fetch, summarize what you found and note what you couldn't access
- Focus on what the Builder agent needs to write correct code — not comprehensive API coverage
- Always include environment variable requirements — missing env vars are a top build failure cause
```

**Step 2: Commit**
```bash
git add agents/docs-agent.md
git commit -m "feat(sprint8): add docs-agent — API documentation extractor"
```

---

### Task 5: Create Research command

**Files:**
- Create: `commands/research.md`

**Step 1: Write the command**

```markdown
---
description: Research agents search for existing implementations, check licenses, gather docs. Run before speccing to make informed dependency and pattern choices.
user-invocable: true
argument-hint: "[topic (e.g., 'supabase auth', 'stripe payments', 'file uploads')]"
allowed-tools: Read Write Bash Glob Grep Agent WebSearch WebFetch
---

# Research

Dispatch research agents to gather best practices, packages, and documentation for a topic.

## Prerequisites

- `.forgeplan/manifest.yaml` should exist (for tech_stack context), but research can run without it

## Process

1. **Load context:**
   - Read `.forgeplan/manifest.yaml` if it exists — extract `project.name`, `project.description`, `project.tech_stack`
   - If no manifest, use `$ARGUMENTS` as the sole context

2. **Determine research topic:**
   - If `$ARGUMENTS` is provided, use it as the topic
   - If no arguments, read the manifest and suggest topics based on tech_stack integrations

3. **Create research output directory:**
   ```bash
   mkdir -p .forgeplan/research
   ```

4. **Dispatch 4 research agents in parallel** (single message, 4 Agent tool calls):

   For each agent, provide:
   - The agent's system prompt (from its `.md` file in `${CLAUDE_PLUGIN_ROOT}/agents/`)
   - The research topic
   - The project context (tech_stack, description)

   Agents to dispatch:
   - **Researcher** (`researcher.md`): package search + best practices
   - **License Checker** (`license-checker.md`): dependency risk analysis
   - **Inspiration** (`inspiration.md`): similar project references
   - **Docs Agent** (`docs-agent.md`): API documentation extraction

5. **Merge results** into a single report:
   - Combine all 4 agent outputs into one markdown document
   - Add a summary section at the top with key recommendations
   - If any agent failed or returned empty results, note it

6. **Write the report:**
   - Save to `.forgeplan/research/[topic-slug]-[ISO-date].md`
   - Topic slug: lowercase, spaces replaced with hyphens, max 50 chars

7. **Present summary to user:**
   ```
   === Research Complete: [topic] ===

   Recommended packages: [top 3 with one-line rationale each]
   License issues: [count] flagged (or "all clear")
   Reference projects: [count] found
   Docs gathered: [list of technologies]

   Full report: .forgeplan/research/[filename].md

   This research will be used by /forgeplan:spec to inform implementation details.
   ```
```

**Step 2: Commit**
```bash
git add commands/research.md
git commit -m "feat(sprint8): add /forgeplan:research command — dispatches 4 research agents"
```

---

### Task 6: Whitelist research scripts + update help

**Files:**
- Modify: `scripts/pre-tool-use.js` — whitelist curl in Bash safe patterns (for npm registry API)
- Modify: `commands/help.md` — add research + greenfield commands

**Step 1: Add curl to Bash whitelist in pre-tool-use.js**

Find the `safePatterns` array and add after the existing entries:
```javascript
    /^\s*curl\s/,                             // HTTP requests for research agents
```

**Step 2: Update help.md**

Add to the "Autonomous" section table:
```markdown
| `/forgeplan:research [topic]` | Search npm, GitHub, and docs for best practices, packages, and reference implementations before building. |
| `/forgeplan:greenfield [description]` | Full pipeline: describe → discover → research → spec → build → verify → review → sweep → certify. One confirmation, then walk away. |
```

**Step 3: Commit**
```bash
git add scripts/pre-tool-use.js commands/help.md
git commit -m "feat(sprint8): whitelist curl for research, update help with new commands"
```

---

## Batch 2: Autonomous Discover + Spec

### Task 7: Add --autonomous flag to discover.md

**Files:**
- Modify: `commands/discover.md`

**Step 1: Add Autonomous Discovery Mode section**

After the Document Import Mode section and before Guided Discovery Mode, add:

```markdown
## Autonomous Discovery Mode

If the user's argument contains `--autonomous`, or if this command is invoked by `/forgeplan:greenfield`:

**Minimum viable input guard:** The description (from `$ARGUMENTS` after removing flags) must contain at least a domain/purpose AND one user action. If it's too vague (e.g., "build me an app", "make a website"), halt with:
```
I need at least what domain this serves and one thing a user can do.
Example: "A URL shortener where users paste a link and get a short URL"
```

Process:
1. Complete all Setup steps (git init, .forgeplan/ structure, CLAUDE.md, .gitignore) without asking
2. The Architect assesses complexity tier, decomposes into nodes, and selects tech stack — all autonomously based on the project description
3. **Default to mock mode** for all external service dependencies: set `tech_stack.mock_mode: true` in the manifest
4. Present ONE confirmation summary:
   ```
   I'll build: [project name] ([TIER])
   Stack: [runtime] / [language] / [framework] / [database] / [auth]
   Nodes ([N]): [node-id-1], [node-id-2], ...
   Shared models: [Model1], [Model2]

   Confirm? (y/n)
   ```
5. If confirmed → generate manifest + skeleton specs, run validation, complete Setup + Completion steps
6. If rejected → ask "What would you change?" — address that one thing, then re-present the summary
7. After confirmation, do NOT present "Next steps" options — the greenfield orchestrator handles what comes next
```

**Step 2: Commit**
```bash
git add commands/discover.md
git commit -m "feat(sprint8): add --autonomous flag to discover — one-confirmation mode"
```

---

### Task 8: Add --autonomous flag to spec.md + research reading

**Files:**
- Modify: `commands/spec.md`

**Step 1: Update the Autonomous Mode section**

The autonomous mode section already exists (line 73+). Extend it to read research findings. After step 2 ("Read the existing skeleton spec and adjacent node specs for context"), add:

```markdown
2b. **Read research findings** if available: check `.forgeplan/research/` for any `.md` files. Extract:
    - Recommended packages → add to spec constraints (e.g., "Use [package] for [purpose]")
    - API contracts from docs → inform interface definitions
    - Best practices → inform acceptance criteria and failure modes
    - License-flagged packages → add to constraints as exclusions (e.g., "Do NOT use [package] — GPL")
```

Also add `--autonomous` flag handling to the top of the Process section:
```markdown
If the argument contains `--autonomous` or `--all --autonomous`, use the Autonomous Mode described below for ALL nodes. Do not prompt for any input.
```

**Step 2: Commit**
```bash
git add commands/spec.md
git commit -m "feat(sprint8): spec reads research findings, --autonomous flag for greenfield"
```

---

### Task 9: Update architect.md and builder.md to reference research

**Files:**
- Modify: `agents/architect.md`
- Modify: `agents/builder.md`

**Step 1: Add research awareness to architect.md**

At the end of the "Phase 1: Understanding the Project" section, add:
```markdown
**Research context:** If `.forgeplan/research/` contains research reports, read them before the tech stack conversation. Use research findings to:
- Recommend specific packages with evidence (download counts, license status)
- Reference architecture patterns from similar projects
- Flag known gotchas from API documentation
```

**Step 2: Add research awareness to builder.md**

In the builder's constraint directive section, add after the existing rules:
```markdown
10. **Research-informed building:** Before starting implementation, check `.forgeplan/research/` for any research reports. If present:
    - Use recommended packages from the research (don't substitute alternatives unless the recommended one doesn't work)
    - Follow API patterns documented by the Docs Agent
    - Respect license exclusions (packages flagged as GPL/copyleft)
```

**Step 3: Commit**
```bash
git add agents/architect.md agents/builder.md
git commit -m "feat(sprint8): architect and builder read research findings"
```

---

## Batch 3: Runtime Verification Script

### Task 10: Create runtime-verify.js

**Files:**
- Create: `scripts/runtime-verify.js`

**Step 1: Write the script**

This is the largest single file (~350 lines). Key sections:

```javascript
#!/usr/bin/env node

/**
 * runtime-verify.js — ForgePlan Phase B Runtime Verification
 *
 * Starts the app, reads spec contracts, hits endpoints, verifies responses.
 * Tier-aware depth: SMALL skips (Phase A sufficient), MEDIUM Levels 1-3, LARGE Levels 1-5.
 *
 * Usage:
 *   node runtime-verify.js [--tier SMALL|MEDIUM|LARGE]
 *
 * Output: JSON to stdout with { status, tier, level_reached, endpoints_tested, endpoints_passed, findings }
 * Exit codes: 0 = pass, 1 = findings, 2 = environment error
 */
```

Core sections to implement:
1. **loadSpecs()** — read manifest + all service/API node specs, extract interfaces
2. **parseContract(contractStr)** — parse `"GET /api/docs → { docs: Doc[] }"` into `{ method, path, expectedShape }`
3. **startApp()** — reuse verify-runnable's process management (spawn, PID tracking, ready detection, tree kill)
4. **runLevel1(baseUrl)** — `GET /` returns 200
5. **runLevel2(baseUrl, endpoints)** — each endpoint returns expected status
6. **runLevel3(baseUrl, endpoints)** — response body has expected fields
7. **runLevel4(baseUrl, endpoints)** — auth boundary tests (401/403/400)
8. **runLevel5(baseUrl, endpoints)** — stress tests (concurrent, rapid, malformed)
9. **main()** — orchestrate: read tier, start app, run levels, kill app, output JSON

Import process management from verify-runnable.js (export the helpers first — see Task 11).

**Step 2: Run syntax check**
```bash
node --check scripts/runtime-verify.js
```

**Step 3: Commit**
```bash
git add scripts/runtime-verify.js
git commit -m "feat(sprint8): add runtime-verify.js — Phase B endpoint verification"
```

---

### Task 11: Export verify-runnable helpers + whitelist runtime-verify

**Files:**
- Modify: `scripts/verify-runnable.js` — export process management functions
- Modify: `scripts/pre-tool-use.js` — whitelist runtime-verify.js

**Step 1: Add exports to verify-runnable.js**

At the bottom of the file, before the `main().catch()` call, add:
```javascript
if (require.main !== module) {
  module.exports = { killPid, killPidTree, writePid, cleanupPids, runStep };
}
```

**Step 2: Add runtime-verify.js to Bash whitelist in pre-tool-use.js**

Find the `safePatterns` array, add:
```javascript
    /^\s*node\s+[^\s]*runtime-verify\.js/,       // Phase B runtime verification
```

**Step 3: Commit**
```bash
git add scripts/verify-runnable.js scripts/pre-tool-use.js
git commit -m "feat(sprint8): export verify-runnable helpers, whitelist runtime-verify"
```

---

## Batch 4: Greenfield Orchestrator

### Task 12: Create greenfield.md command

**Files:**
- Create: `commands/greenfield.md`

**Step 1: Write the thin orchestrator**

```markdown
---
description: Full pipeline: describe your app, confirm once, walk away. Chains discover → research → spec → deep-build to produce a certified, runnable application from a single description.
user-invocable: true
argument-hint: "[project description or --from document.md]"
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# Greenfield Build

One command to go from idea to certified app. You describe what you want, confirm the architecture once, and ForgePlan handles the rest: discover → research → spec → build → verify → review → sweep → certify.

## Process

### Step 0: Check for existing state (resume support)

Read the project directory to determine where to start:
- If `.forgeplan/manifest.yaml` does NOT exist → start from Step 1 (discover)
- If manifest exists but `.forgeplan/specs/` has no complete specs (all have empty test fields) → start from Step 2 (research) or Step 3 (spec)
- If manifest exists and specs are complete but nodes are pending → start from Step 4 (deep-build)
- If nodes are partially built → start from Step 4 (deep-build handles resume via next-node.js)

Log which step is being resumed: "Resuming greenfield from Step [N] — [reason]."

### Step 1: Discover (autonomous)

Run the discover command in autonomous mode:
- Pass through the user's arguments (project description or --from flag)
- Use the --autonomous flag for one-confirmation mode

```
/forgeplan:discover --autonomous $ARGUMENTS
```

If discover fails or the user rejects the confirmation, halt greenfield with the error. The user can re-run after making changes.

### Step 2: Research

Read `.forgeplan/manifest.yaml` to extract research topics:
- For each `tech_stack` entry that names a specific technology: research it
  - `auth: supabase-auth` → topic: "supabase auth patterns"
  - `database: postgresql` + `orm: drizzle` → topic: "drizzle postgresql setup"
  - `frontend: react` → skip (too generic, research won't add value)
  - `deployment: docker` → skip (build-time concern, not spec-time)
- For each integration node in the manifest: research the integration
- If no specific technologies or integrations are found: skip research entirely

For each topic, dispatch `/forgeplan:research [topic]`. Topics can be researched in parallel.

If research fails for a topic, log a warning and continue — research is informative, not blocking.

### Step 3: Spec all nodes (autonomous)

```
/forgeplan:spec --all --autonomous
```

This generates full specs for all nodes in dependency order, reading research findings from `.forgeplan/research/` to inform implementation details.

If spec generation fails, halt with error and preserve state.

### Step 4: Deep-build (full pipeline)

```
/forgeplan:deep-build
```

Deep-build handles everything from here: build → verify-runnable → review → integrate → sweep → runtime-verify → cross-model → certified.

### Final Output

After deep-build completes, present:
```
=== Greenfield Build Complete ===
Project: [name] ([tier])
Nodes: [N] built, reviewed, and certified
Research: [N] topics researched
Findings: [N] found and resolved
Runtime verification: [pass/fail/skipped]
Cross-model: [status]

Your project is ready:
  cd [project-dir]
  npm run dev

Reports:
  .forgeplan/deep-build-report.md
  .forgeplan/research/
```
```

**Step 2: Commit**
```bash
git add commands/greenfield.md
git commit -m "feat(sprint8): add /forgeplan:greenfield — full pipeline orchestrator"
```

---

## Batch 5: Deep-build Phase 4.5 Wiring

### Task 13: Wire runtime-verify.js into deep-build Phase 4.5

**Files:**
- Modify: `commands/deep-build.md`

**Step 1: Replace the Phase 4.5 placeholder**

Replace the entire Phase 4.5 section (the Sprint 8 placeholder note + description) with:

```markdown
### Phase 4.5: Runtime verification (Phase B)

**Re-anchor:** Re-read `.forgeplan/manifest.yaml` for complexity_tier and node specs.

**Tier gate:** Read `complexity_tier` (with config.yaml `tier_override` check):
- **SMALL:** Skip Phase B entirely. Log: "Skipping runtime verification — SMALL tier (Phase A sufficient)." Proceed to Phase 5.
- **MEDIUM/LARGE:** Run runtime verification.

Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/runtime-verify.js" --tier [TIER]
```

Check the result:

**If `status: "pass"`:** Log level reached and endpoints tested. Proceed to Phase 5.

**If `status: "fail"`:** Runtime verification found issues.
1. Add each finding to `sweep_state.findings.pending` (set `pass_found`, `category: "runtime-verification"`)
2. Dispatch fix agents for affected nodes (same as sweep Phase 4 fix cycle — fresh agent per node, node-scoped enforcement)
3. After fixes, re-run `runtime-verify.js`
4. Repeat up to 3 times. If still failing, log unresolved findings and proceed to Phase 5 (cross-model will catch remaining issues)

**If `status: "environment_error"`:** Log the error. Do NOT add as code findings. Attempt auto-fix:
- Missing .env → copy from .env.example, set MOCK_MODE=true
- Port conflict → report to user
- After auto-fix attempt, retry once. If still failing, skip Phase B with warning and proceed to Phase 5.
```

**Step 2: Commit**
```bash
git add commands/deep-build.md
git commit -m "feat(sprint8): wire runtime-verify.js into deep-build Phase 4.5"
```

---

### Task 14: Update manifest schema + add tech_stack.infrastructure field

**Files:**
- Modify: `templates/schemas/manifest-schema.yaml`

**Step 1: Add infrastructure field**

In the `tech_stack` section, add:
```yaml
    infrastructure: "[docker|none]"          # Optional: external service dependencies (Docker, Redis, etc.)
```

**Step 2: Commit**
```bash
git add templates/schemas/manifest-schema.yaml
git commit -m "feat(sprint8): add tech_stack.infrastructure field to manifest schema"
```

---

## Batch 6: Integration + Polish

### Task 15: Update CLAUDE.md + version bump

**Files:**
- Modify: `CLAUDE.md` — mark Sprint 8 complete, update command table
- Modify: `.claude-plugin/plugin.json` — version 0.8.0

**Step 1: Update CLAUDE.md Sprint 8 section**

Add `(COMPLETE)` to the Sprint 8 header and a deliverables summary line.

Update the command table to include:
```
| `/forgeplan:research` | 8 | Research agents search for existing implementations, check licenses, gather docs |
| `/forgeplan:greenfield` | 8 | Full pipeline: describe → discover → research → spec → build → certify |
```

**Step 2: Bump plugin version**

In `.claude-plugin/plugin.json`, change `"version": "0.6.0"` to `"version": "0.8.0"`.

**Step 3: Commit**
```bash
git add CLAUDE.md .claude-plugin/plugin.json
git commit -m "docs: mark Sprint 8 complete, bump version to 0.8.0"
```

---

### Task 16: Review with agents

Dispatch 3 review agents:
1. **Research pillar review** — check all 4 agents + command for consistency
2. **Greenfield flow review** — trace the full pipeline from greenfield → discover → research → spec → deep-build
3. **Runtime-verify review** — check the script for correctness, process safety, tier-aware depth

Fix any findings, then commit.
