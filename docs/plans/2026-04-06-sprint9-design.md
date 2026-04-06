# Sprint 9 Design: Semantic Memory + State Hardening + Node Splitting + Guide Enhancement

**Date:** 2026-04-06
**Status:** Approved
**Goal:** Living knowledge tree reduces token usage across all phases. Node splitting enables tier upgrades. State hardening prevents corruption. Guide gets smarter from past sweeps.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Node split strategy | Architect-assisted proposal, user confirms | User knows they need to split but may not know best boundaries |
| Code during split | Scopes narrow, files stay in place | No git churn, no broken imports, non-destructive |
| Child node status | Start as "built" → route through review | Code exists, just needs verification against narrower specs |
| Wiki timing | Every phase (discovery → spec → build → review → sweep → revise) | Knowledge tree grows from birth, not just sweep-time |
| Wiki layers | Full Karpathy: Rules (L3) + Wiki (L2) + Source fallback (L1) | Rules enable instant checks, wiki enables cheap reads, source is always available |
| Wiki update on write | PostToolUse adds file entries + extracts markers | Small overhead per write, massive cumulative value |
| State writes | Centralized update-state.js with file locking | Prevents race conditions from parallel agents |
| Session persistence | SessionEnd hook writes session summary to wiki | Next session knows what happened |

## Pillar 1: Semantic Memory (Living Knowledge Tree)

### Three Layers (Full Karpathy)

```
Layer 3: Rules     → machine-actionable patterns extracted from @forgeplan markers
Layer 2: Wiki      → compiled summaries with [file:line] citations
Layer 1: Source    → full code (fallback — ALWAYS available, never gated by wiki)
```

**Agent read strategy:** Rules first (instant violation check) → Wiki second (cheap context) → Source last (expensive, only to verify specific findings). Any agent can fall back to full source at any time.

### Anchor Markers (extending existing system)

```typescript
// @forgeplan-node: auth                    ← existing (which node owns this file)
// @forgeplan-spec: AC3                     ← existing (which AC this implements)
// @forgeplan-pattern: auth-middleware       ← NEW: names a reusable pattern
// @forgeplan-rule: always-validate-token    ← NEW: declares a codebase rule
// @forgeplan-decision: D7                  ← NEW: links to an architectural decision
```

Builder already writes the first two. Sprint 9 adds 3 new marker types. The wiki compiler reads these to auto-extract patterns and rules from code declarations.

### Wiki Structure

```
.forgeplan/wiki/
├── nodes/
│   ├── auth.md              # Per-node: summary, files, patterns, findings, decisions
│   ├── api.md
│   └── database.md
├── patterns.md              # Cross-cutting patterns extracted from @forgeplan-pattern markers
├── rules.md                 # Machine-actionable rules from @forgeplan-rule markers
├── decisions.md             # Architectural decisions from @forgeplan-decision markers
├── index.md                 # Quick reference: nodes, shared models, tech stack
└── sessions/
    └── 2026-04-06.md        # Session summaries (from SessionEnd hook)
```

### Node Wiki Page Format

```markdown
## [Node Name]
Summary: [one paragraph — what this node does]

### Key Files
- `src/auth/middleware.ts` — requireAuth middleware [lines 12-45]
- `src/auth/routes.ts` — login, register, refresh endpoints [lines 8-89]

### Patterns Used
- **auth-middleware** [src/auth/middleware.ts:12]: All protected routes use `requireAuth(role)`
- **token-refresh** [src/auth/routes.ts:67]: Refresh tokens stored in httpOnly cookies

### Rules (machine-actionable)
- RULE: Every route in src/api/ MUST use requireAuth middleware [source: src/auth/middleware.ts:12]
- RULE: Never store tokens in localStorage [source: decision D3]

### Past Findings (cross-session)
- Sweep pass 2: "Missing rate limiting on /auth/login" → RESOLVED (pass 3)
- Sweep pass 4: "Token expiry not checked on refresh" → RESOLVED

### Decisions
- D3: Use httpOnly cookies for tokens, not localStorage [rationale: XSS protection]
```

### Wiki Lifecycle — Grows at Every Phase

| Phase | What gets written | Who reads it |
|-------|------------------|--------------|
| **Discovery** | `index.md` (project overview, tier, stack), skeleton node pages | Spec command |
| **Spec** | Node pages get ACs, interfaces, constraints, non-goals | Builder |
| **Build** | Every file write → node's "Key Files" + extract markers → patterns/rules/decisions | Adjacent builders, reviewer |
| **Review** | Findings → node's "Past Findings". Dimension scores. | Sweep agents |
| **Sweep** | Full recompile: consolidate markers, finding history, pattern extraction | Next session |
| **Revise** | Impact analysis → decisions.md. Interface changes on affected node pages. | Rebuild agents |

### PostToolUse Wiki Integration

After every Write/Edit during a build:
1. Register file in manifest (existing behavior)
2. Update `wiki/nodes/[node-id].md`: add/update file entry with one-line purpose
3. Scan written content for `@forgeplan-pattern`, `@forgeplan-rule`, `@forgeplan-decision` markers
4. If found: update `patterns.md`, `rules.md`, or `decisions.md` accordingly

### Builder Wiki Reading

Before building a node, the builder reads:
- `wiki/nodes/[adjacent-node].md` for each dependency — learns their patterns
- `wiki/patterns.md` — established patterns to follow
- `wiki/rules.md` — constraints to respect
- This replaces reading ALL source files of adjacent nodes (~85% token savings)

### compile-wiki.js (Full Recompile During Sweep)

1. Read all specs (ACs, interfaces, constraints)
2. Read all source files, extract ALL anchor markers
3. Read previous wiki pages (preserve cross-session findings)
4. Read sweep reports + review reports (for finding history)
5. Generate: per-node pages, patterns.md, rules.md, decisions.md, index.md
6. Every citation includes `[file:line]` for instant drill-down
7. Markers are primary extraction source; fallback: infer patterns from code structure

### Token Savings Estimate

| Scenario | Without Wiki | With Wiki | Savings |
|----------|-------------|-----------|---------|
| Builder reading adjacent nodes | 50KB source | 5KB wiki pages | ~90% |
| Sweep agent (16 agents × 100KB) | 1.6MB | 160KB wiki + 40KB drill-ins | ~88% |
| Second session cold start | 100KB re-read | 10KB wiki | ~90% |

## Pillar 2: Node Splitting

### Command: `/forgeplan:split [node-id]`

**allowed-tools:** Read Write Edit Bash Glob Grep Agent

### Flow

1. Read manifest + target node's spec + all files in its file_scope
2. Dispatch Architect agent in **split mode**:
   - Analyze the code: directory groupings, import clusters, domain separation
   - Propose child nodes with names, file_scopes, and AC assignment
   - Show which ACs, constraints, interfaces, failure modes go to each child
3. Present proposal to user:
   ```
   Proposed split of "backend" into 3 nodes:

   auth (src/auth/**)
     ACs: AC1 (login), AC2 (register), AC5 (role check)
     Files: middleware.ts, routes.ts, service.ts

   api (src/api/**)
     ACs: AC3 (CRUD documents), AC4 (search), AC6 (pagination)
     Files: routes/*.ts, controllers/*.ts

   payments (src/payments/**)
     ACs: AC7 (create invoice), AC8 (Stripe webhook)
     Files: stripe.ts, invoice.ts

   Confirm? (y/n/adjust)
   ```
4. User confirms or adjusts
5. Execute the split:
   - Remove parent node from manifest, add children with narrower file_scopes
   - Create child specs with inherited ACs, constraints, interfaces, failure modes
   - Re-register files: reassign from parent to correct child based on new scopes
   - Set child nodes status to `"built"` (code exists, needs review)
   - Update shared model dependencies per child
   - Archive parent spec to `.forgeplan/specs/[parent-id].archived.yaml`
   - Increment `project.revision_count`
   - Run `validate-manifest.js`
   - Update wiki: remove parent page, create child pages
6. Suggest next steps:
   ```
   Split complete: "backend" → auth, api, payments
   Children are marked as "built" — existing code needs review against narrower specs.

   Next:
     → /forgeplan:review --all    Review each child against its new spec
     → /forgeplan:integrate       Verify cross-node interfaces still work
   ```

### Tier Upgrade Integration

After a split increases the node count past a tier boundary:
- 1-2 nodes → 3+ nodes: suggest SMALL → MEDIUM upgrade
- Present: "Your project now has [N] nodes. Current tier: SMALL. Upgrade to MEDIUM? This enables: full specs, 7-9 sweep agents, cross-model optional."
- If user accepts: update `project.complexity_tier` in manifest

### Files

- Create: `commands/split.md` (~80 lines)
- Modify: `agents/architect.md` (add split mode analysis)
- Modify: `scripts/validate-manifest.js` (validate split artifacts)
- Modify: `commands/help.md` (add split command)

## Pillar 3: State Management Hardening

### `scripts/update-state.js`

Centralized atomic read-modify-write for state.json:

```javascript
/**
 * Atomic state update with file locking.
 *
 * Usage:
 *   const { updateState } = require('./update-state.js');
 *   await updateState(statePath, (state) => {
 *     state.nodes.auth.status = "built";
 *     return state;
 *   });
 *
 * Handles: read → lock → modify → write tmp → rename → unlock
 * Retries on conflict (another process writing simultaneously)
 */
```

All scripts that currently use `atomicWriteJson` switch to `updateState`:
- `post-tool-use.js` (3 write sites)
- `stop-hook.js` (3 write sites)
- `session-start.js` (1 write site)

### SessionEnd Hook

New hook type in `hooks/hooks.json`. Fires when Claude Code session ends.

Writes session summary to `.forgeplan/wiki/sessions/[ISO-date].md`:
```markdown
## Session: 2026-04-06T14:30:00Z

### What happened
- Built nodes: auth, api
- Reviewed nodes: auth
- Sweep: pass 1 found 5 findings, 4 resolved
- Pending: api review, 1 unresolved finding (F3: missing rate limiting)

### State at end
- Nodes: auth (reviewed), api (built), database (reviewed), frontend (specced)
- Active operation: none
- Next recommended: /forgeplan:review api
```

Next session's `session-start.js` reads the latest session summary and includes it in the ambient display.

### Parallel Fix Agent Temp State

During sweep Phase 4 worktree fixes:
- Each agent writes findings resolution to `.forgeplan/.state-[node-id].tmp`
- After worktree merge, `update-state.js` consolidates all temp files into state.json
- No concurrent writes to the same file

### Files

- Create: `scripts/update-state.js` (~80 lines)
- Modify: `hooks/hooks.json` (add SessionEnd)
- Modify: `post-tool-use.js`, `stop-hook.js`, `session-start.js` (use updateState)
- Modify: `commands/sweep.md` (parallel fix writes to temp state)

## Pillar 4: Guide Enhancement

### Pattern Detection from Past Sweeps

The guide command reads the wiki's finding history to make proactive suggestions:

```
/forgeplan:guide

=== ForgePlan Guide ===
Project: Client Portal (LARGE) | 7 nodes

Recommended: /forgeplan:review file-storage
  → Similar nodes (auth, api) had error-handling findings during review.
    file-storage uses the same patterns — review may surface similar issues.

Insight: Past sweeps found 3 recurring issues in frontend nodes:
  - Missing loading states (found in dashboard AND accountant-view)
  - Consider adding loading states to frontend-login proactively.

Tip: The auth node's rate-limiting pattern (wiki/patterns.md) could
     also apply to the api node's public endpoints.
```

### What Guide Reads

1. `wiki/index.md` — project state overview
2. `wiki/nodes/*.md` — per-node finding history
3. `wiki/patterns.md` — established patterns
4. `wiki/sessions/` — recent session summaries
5. `state.json` — current node statuses

### Pattern Matching Logic

- **Recurring findings:** If 2+ nodes had the same category finding (e.g., error-handling), suggest checking similar nodes that haven't been reviewed yet
- **Pattern propagation:** If a pattern was established in node A and node B uses similar code but doesn't follow it, suggest updating node B
- **Proactive sweep suggestions:** If past sweeps consistently find issues in a category, suggest running a targeted sweep before the full pipeline

### Files

- Modify: `commands/guide.md` (add wiki reading + pattern detection)

## File Inventory

### New Files (5)

| File | Lines Est | Purpose |
|------|-----------|---------|
| `commands/split.md` | ~80 | Node splitting orchestrator |
| `scripts/compile-wiki.js` | ~250 | Full wiki compilation from specs + source + markers |
| `scripts/update-state.js` | ~80 | Atomic read-modify-write for state.json |
| `docs/plans/2026-04-06-sprint9-design.md` | — | This document |

### Modified Files (~15)

| File | Changes |
|------|---------|
| `agents/architect.md` | Add split mode analysis |
| `agents/builder.md` | Read wiki before building (patterns, rules, adjacent nodes) |
| `scripts/post-tool-use.js` | Wiki update on every write (file entry + marker extraction) |
| `scripts/session-start.js` | Read latest session summary for ambient display, use updateState |
| `scripts/stop-hook.js` | Use updateState |
| `commands/sweep.md` | Add wiki compilation step before Phase 2 dispatch |
| `commands/discover.md` | Initialize wiki at project birth |
| `commands/spec.md` | Update wiki node pages with ACs/interfaces |
| `commands/guide.md` | Wiki reading + pattern detection |
| `commands/help.md` | Add split command |
| `hooks/hooks.json` | Add SessionEnd hook |
| `templates/schemas/manifest-schema.yaml` | No changes needed |
| `CLAUDE.md` | Mark Sprint 9 complete, update inventory |
| `.claude-plugin/plugin.json` | Version 0.9.0 |

### Build Order

1. `update-state.js` (no deps, other scripts switch to it)
2. Wiki structure + `compile-wiki.js` (standalone)
3. PostToolUse wiki integration (depends on 2)
4. Builder wiki reading (depends on 2)
5. Discover/spec/review wiki writes (depends on 2)
6. Sweep wiki compilation step (depends on 2)
7. Node splitting command (depends on wiki for page management)
8. SessionEnd hook (depends on 1)
9. Guide enhancement (depends on 2)
10. Integration testing + team review
