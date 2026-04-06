# Sprint 8 Design: Research Agents + Greenfield Pipeline + Runtime Verification

**Date:** 2026-04-06
**Status:** Approved
**Goal:** Research agents search for best practices before building. Greenfield deep-build from discovery to certified. Phase B runtime verification.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Web access for research | Hybrid: structured APIs + WebSearch/WebFetch | npm registry API and `gh` CLI for reliable data, web tools for docs/inspiration |
| Greenfield command | Thin orchestrator `/forgeplan:greenfield` | Delegates to discover→research→spec→deep-build. Each command stays maintainable (<300 lines) |
| Autonomous interaction | One confirmation then full autonomy | Architect presents summary: name, tier, tech stack, nodes. User confirms once. Prevents wrong-stack builds without slowing the pipeline |
| Research timing | After discover, before spec | Architecture doesn't need npm stats. Specs need implementation details (which packages, API patterns) |
| Phase B architecture | Pure script `runtime-verify.js` | Spec contracts are structured YAML — no LLM reasoning needed for HTTP calls. Deterministic, cheap, testable |
| Stress testing | LARGE tier only (Level 5) | Concurrent/rapid requests add ~30s. Only matters for projects seeing real traffic |

## Pillar 1: Research Agents

### Command: `/forgeplan:research [topic]`

**allowed-tools:** Read Write Bash Glob Grep Agent WebSearch WebFetch

Reads manifest for project context, dispatches 4 agents in parallel:

### Agent 1 — Researcher (`agents/researcher.md`, model: sonnet)
- Searches npm registry API (`https://registry.npmjs.org/-/v1/search?text=...`) via Bash/curl
- Searches GitHub via `gh search repos` for reference implementations
- For each candidate: weekly downloads, last publish date, stars
- Output: ranked package list with rationale

### Agent 2 — License Checker (`agents/license-checker.md`, model: haiku)
- Reads `https://registry.npmjs.org/[pkg]` for license field per package
- Flag: GPL (copyleft), UNLICENSED, no license, deprecated
- Approve: MIT, Apache-2.0, BSD, ISC
- Output: license report with pass/flag per package

### Agent 3 — Inspiration (`agents/inspiration.md`, model: sonnet)
- Uses WebSearch to find similar open-source projects
- Notes: architecture patterns, file structure, key dependencies
- Output: 2-3 reference projects with "what to learn from each"

### Agent 4 — Docs Agent (`agents/docs-agent.md`, model: sonnet)
- Uses WebFetch to read official docs for key dependencies
- Extracts: auth patterns, API contracts, common gotchas, setup requirements
- Output: per-integration cheat sheet

### Storage
Results merged into `.forgeplan/research/[topic]-[timestamp].md`. Spec command and builder read this directory.

## Pillar 2: Greenfield Pipeline

### Command: `/forgeplan:greenfield`

**allowed-tools:** Read Write Edit Bash Glob Grep Agent

Thin orchestrator (~60 lines) that chains:

```
Step 1: /forgeplan:discover --autonomous "$ARGUMENTS"
Step 2: /forgeplan:research (topics from manifest tech_stack + integrations)
Step 3: /forgeplan:spec --all --autonomous
Step 4: /forgeplan:deep-build (full pipeline from here)
```

### Step 1 — Autonomous Discover (`--autonomous` flag)

Changes to `commands/discover.md`:
- Architect reads input, assesses tier, decomposes nodes, selects tech stack — all without asking
- Defaults to `MOCK_MODE=true` for external service dependencies
- Presents ONE confirmation: "I'll build [name] ([tier]): [tech stack]. [N] nodes: [list]. Confirm?"
- If rejected → ask what to change, then re-confirm
- **Minimum viable input guard:** If description is too vague (no domain AND no user actions), halt with structured prompt: "I need at least what domain this serves and one thing a user can do."

### Step 2 — Auto-Research

Greenfield reads manifest, identifies topics from `tech_stack` and integrations:
- `auth: supabase-auth` → research "supabase auth patterns"
- `database: postgresql` + `orm: drizzle` → research "drizzle postgresql patterns"
- Each integration node → research the integration's API

Dispatches `/forgeplan:research` for each topic in parallel. Skips if no integrations detected.

### Step 3 — Autonomous Spec (`--autonomous` flag)

Changes to `commands/spec.md`:
- Generates full specs from manifest + research findings without interactive conversation
- For each node: fills ACs, test fields, interfaces, constraints, failure modes
- Reads `.forgeplan/research/` for implementation guidance (package choices, API patterns)
- Runs validation after each spec

### Step 4 — Deep-build

No orchestration changes — deep-build already handles build → verify-runnable → review → integrate → sweep → runtime-verify → cross-model → certified.

### Error Recovery

If any step fails, greenfield preserves state and reports which step failed. Re-running `/forgeplan:greenfield` detects existing state and resumes:
- Manifest exists → skip discover
- Specs exist → skip spec
- Nodes built → skip to review/sweep
- Each step checks preconditions before deciding to run or skip

## Pillar 3: Runtime Verification (Phase B)

### Script: `scripts/runtime-verify.js`

Called from deep-build Phase 4.5 (replaces no-op placeholder).

### Flow
1. Read manifest for node specs, interfaces, tech stack
2. Read `complexity_tier` for depth selection
3. Start the app (reuse verify-runnable's process management)
4. Wait for server ready (stdout pattern matching)
5. Read each service/API node spec's `interfaces` section
6. Parse contracts: `"GET /api/documents → { documents: Document[] }"` → method, path, expected shape
7. Execute tier-appropriate test levels
8. Kill the app cleanly
9. Output JSON report

### Tier-Aware Depth

```
SMALL: Phase B does NOT run (verify-runnable Phase A is sufficient)

MEDIUM (Levels 1-3):
  Level 1: Server starts and responds to GET /
  Level 2: Each API endpoint returns correct status code
  Level 3: Response body shape matches spec contract (has expected fields)

LARGE (Levels 1-5):
  Level 1-3: Same as MEDIUM
  Level 4: Auth boundary testing
    - Requests without auth token → expect 401
    - Requests with wrong-role token → expect 403
    - Malformed inputs → expect 400, not 500
  Level 5: Stress testing
    - 10 concurrent requests per endpoint → no 500s, no data corruption
    - 50 rapid sequential requests → response time doesn't degrade >3x
    - SQL injection / XSS payloads → all get 4xx not 5xx
```

### Environment Resilience
- No `.env`? Copy from `.env.example`, set `MOCK_MODE=true`
- Server won't start? Classify via verify-runnable's error patterns, report as environment error
- Endpoint times out? Retry once with 10s timeout. Still fails → finding
- Database required but unavailable? If `MOCK_MODE` set, proceed. Otherwise skip DB-dependent tests with warning.

### Output Format
```json
{
  "status": "pass|fail|environment_error",
  "tier": "MEDIUM",
  "level_reached": 3,
  "endpoints_tested": 12,
  "endpoints_passed": 10,
  "findings": [
    {
      "node": "api",
      "category": "runtime-verification",
      "severity": "HIGH",
      "confidence": 95,
      "description": "GET /api/documents returns 500 instead of 200",
      "file": "src/api/routes/documents.ts",
      "line": "42",
      "fix": "Handler throws unhandled error — add try/catch"
    }
  ]
}
```

Findings use the same structure as sweep findings → feed directly into the sweep fix cycle.

## File Inventory

### New Files (8)
| File | Lines Est | Purpose |
|------|-----------|---------|
| `commands/greenfield.md` | ~60 | Thin orchestrator |
| `commands/research.md` | ~80 | Research dispatch + merge |
| `agents/researcher.md` | ~60 | npm/GitHub search |
| `agents/license-checker.md` | ~40 | License analysis |
| `agents/inspiration.md` | ~40 | Similar project search |
| `agents/docs-agent.md` | ~40 | API doc extraction |
| `scripts/runtime-verify.js` | ~350 | Phase B runtime verification |
| `docs/plans/2026-04-06-sprint8-design.md` | — | This document |

### Modified Files (13)
| File | Changes |
|------|---------|
| `commands/discover.md` | `--autonomous` flag, min viable input guard, mock mode |
| `commands/spec.md` | `--autonomous` flag, read research findings |
| `commands/deep-build.md` | Wire Phase 4.5, tier-aware depth |
| `commands/help.md` | Add greenfield + research |
| `agents/architect.md` | Reference research findings |
| `agents/builder.md` | Read `.forgeplan/research/` |
| `scripts/pre-tool-use.js` | Whitelist runtime-verify.js |
| `scripts/verify-runnable.js` | Export process helpers for reuse |
| `templates/schemas/manifest-schema.yaml` | `tech_stack.infrastructure` |
| `CLAUDE.md` | Sprint 8 status, command table |
| `.claude-plugin/plugin.json` | Version 0.8.0 |

### Build Order
1. Research agents (standalone)
2. Autonomous discover + spec flags
3. Runtime verification script
4. Greenfield orchestrator (depends on 1+2)
5. Deep-build Phase 4.5 wiring (depends on 3)
6. Integration testing + dogfood
