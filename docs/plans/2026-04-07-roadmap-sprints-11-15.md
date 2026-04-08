# ForgePlan Roadmap: Sprints 11–15

**Date:** 2026-04-07
**Status:** Sprint 11-12 designed (research-informed), Sprint 13-15 planned

---

## Sprint 11: Skills for All Agents + Blueprints
**Design doc:** `docs/plans/2026-04-07-sprint11-design.md` (v3, 5 pillars, 22 tasks, 5 batches)

### Pillars
1. **Skills for ALL agents** — 28 core + 5 conditional skills mapped across 10 agents. Per-agent `skills:` frontmatter. Dynamic selection by orchestrator before dispatch. Tier-aware loading (SMALL=2-3, LARGE=5-6).
2. **Skill learner module** — portable microservice. Watch patterns → suggest saving as SKILL.md → auto-activate. Research-to-skill pipeline. Standalone release candidate.
3. **Research-backed blueprints** — `deps.lock.yaml` with vetted, license-checked dependencies. Blueprint generation from `/forgeplan:research` output.
4. **Community blueprints** — Copier-style versioning with `blueprint-origin.yaml`. Install from GitHub: `template:github:user/repo`.
5. **Anti-slop design quality** — Frontend-design skill with anti-slop rules. Design pass agent in deep-build pipeline (build → verify → DESIGN PASS → review → sweep). One round of user steering after design pass.

### Key Technical Decisions
- SKILL.md standard (30+ agents support it — don't invent a new format)
- Subagent skill loading via `skills:` frontmatter (confirmed working)
- Select skills BEFORE dispatch (not mid-execution — KV-cache preservation)
- Architect skills compiled into prompt (not runtime loaded)
- 15 curated skills outperform 100 general ones

### Exit Criteria
- All 10 agents have curated skills loaded and functioning
- Builder generates noticeably better code with skills vs without (A/B test on client portal)
- Skill learner detects at least one pattern during a MEDIUM build
- Frontend builds pass anti-slop checklist with zero violations
- At least one blueprint has `deps.lock.yaml` with all packages APPROVED

### Research Reports
- `skills-blueprints-sprint11.md`, `skill-system-deep-dive.md`, `dynamic-skill-selection.md`
- `baseline-skills-inventory.md`, `skills-per-agent-architect.md`, `skills-per-agent-builder.md`
- `skills-per-agent-sweep.md`, `skills-per-agent-reviewer-researcher.md`

---

## Sprint 12: MCP Integrations + Live Validation
**Design doc:** `docs/plans/2026-04-07-sprint12-design.md`

### Pillars
1. **Auto-detection + configuration** — Read `tech_stack` from manifest, suggest relevant MCP servers. `mcp-registry.yaml` maps services to MCP packages. Guide user through setup.
2. **Live validation during builds** — Builder validates generated code against live services via MCP. Schema verification (tables/columns exist), auth config validation, API endpoint verification. Graceful degradation — MCP is advisory, never blocking.
3. **Selective tool loading** — Phase-aware MCP tool budgets to prevent context bloat. Build phase gets schema+auth tools, sweep gets contract tools, deploy gets deployment tools. Max 20 tools per phase.
4. **Integration templates** — `.mcp.json` generation for project-level MCP config. `.env.example` enhancement with MCP-required variables and setup instructions.

### MCP Server Priorities

| Priority | Service | Why |
|---|---|---|
| P1 | Supabase | Most common database, rich MCP (20+ tools), schema validation highest value |
| P1 | Stripe | Payment integration is error-prone, MCP validates product/price IDs |
| P1 | Postgres | Direct database access for non-Supabase projects |
| P2 | Cloudflare | Code Mode MCP (2,500 endpoints, ~1K tokens), Anthropic partnership |
| P2 | Firebase | Official Claude plugin, 30+ tools |
| P2 | Vercel | Common deployment target, read-only MCP is low-risk |
| P2 | Resend | 56+ tools, comprehensive email operations |
| P3 | Railway | Solid but smaller user base |
| P3 | GitHub | `gh` CLI already sufficient — MCP is secondary |
| P3 | Clerk | Docs only — minimal MCP value |

### Key Technical Decisions
- Compose and configure, don't build MCP servers (12,000+ already exist)
- Tool explosion is the #1 risk — selective loading per phase mandatory
- `.mcp.json` for project-scoped config (version-controlled, `${ENV_VAR}` syntax for creds)
- Cloudflare Code Mode is the gold standard for token efficiency
- `gh` CLI preferred over GitHub MCP (zero setup, already works)

### Exit Criteria
- Auto-detection correctly identifies MCP servers from `tech_stack` for P1 services
- Builder successfully validates at least one schema against live Supabase instance
- Selective tool loading keeps per-phase tool count under 20
- `.mcp.json` generated and working for a project using Supabase + Stripe
- Graceful degradation verified: build completes normally when MCP is disconnected

### Research Reports
- `mcp-integrations-sprint12.md`, `specific-mcp-servers.md`
- `cloudflare-mcp-cli.md`, `github-mcp-cli.md`

---

## Sprint 13: Dogfood Sprint (Zero Feature Development)

### Goal
Prove the system works end-to-end by building real apps. No new features — only use what exists. Every friction point becomes a ticket for Sprint 14, not a mid-sprint fix.

### Build 1: SMALL App
**What:** A real app Craig actually wants. Candidates: personal dashboard, URL shortener, bookmark manager, CLI tool, simple API.

**How:**
1. Run `/forgeplan:greenfield [description]`
2. Zero manual intervention — let the pipeline run
3. Measure: time, tokens, touches, where it breaks

**Success criteria:**
- Discovery → running app in under 30 minutes
- Zero manual code edits (all generated)
- Sweep converges in 1-2 passes (3 agents)
- Anti-slop check: frontend doesn't look AI-generated
- Total token cost under $10

**What to track:**
- [ ] Time from `/forgeplan:greenfield` to running app
- [ ] Number of manual interventions (target: 0)
- [ ] Number of hook bounces (target: < 3)
- [ ] Sweep findings count and convergence passes
- [ ] Token cost (total across all agents)
- [ ] Skills activated — which ones? Did they help?
- [ ] Where did you get frustrated?
- [ ] Where did it feel like magic?
- [ ] Would you show this app to someone?

### Build 2: MEDIUM App
**What:** Something with auth, multiple roles, 1-2 integrations. Real enough to stress the system. Candidates: CodePilot plugin (scoped to plugin only), client portal variant, team task manager, invoice app.

**How:**
1. Run `/forgeplan:greenfield [description]` or `/forgeplan:discover --from doc.md`
2. Let the pipeline run — intervene only when asked (Category C decisions)
3. Full pipeline: discover → research → spec → build → verify → design pass → review → sweep → certify

**Success criteria:**
- Discovery → certified app in under 4 hours (including research + spec conversations)
- Manual interventions under 5 (Category C decisions don't count — those are design choices)
- Sweep converges in 2-3 passes (4 agents)
- Integration check passes on first run
- At least 3 skills activated meaningfully
- MCP validation works for at least 1 service (if connected)
- Anti-slop check passes
- Total token cost under $50

**What to track:**
- [ ] Everything from Build 1, plus:
- [ ] Spec quality — did specs capture the right things?
- [ ] Node decomposition — was the tier assessment correct?
- [ ] Cross-node integration — any drift between nodes?
- [ ] Research quality — were package recommendations good?
- [ ] Design pass — did it improve the frontend?
- [ ] User steering — what feedback did you give? Was it applied correctly?
- [ ] Recovery — did anything crash? Did `/forgeplan:recover` work?
- [ ] Wiki — did semantic memory provide useful context?

### Deliverables
- **Dogfood report:** detailed write-up of both builds with measurements
- **Friction log:** every point where the system was confusing, slow, or wrong
- **Bug tickets:** prioritized list of issues found (becomes Sprint 14 backlog)
- **Feature requests:** things you wished existed (becomes Sprint 15+ backlog)
- **Token cost analysis:** breakdown by phase (discover, spec, build, review, sweep)

### Rules
- **NO feature development during this sprint.** If something is broken, document it and work around it.
- **NO prompt tweaking.** The agent prompts are what they are. If they're wrong, that's a Sprint 14 fix.
- **Document EVERYTHING.** The dogfood report is the most valuable deliverable — it replaces speculation with data.

---

## Sprint 14: Refinement (Bug Fixes + Polish from Dogfood)

### Goal
Fix everything Sprint 13 found. This sprint's backlog comes entirely from the dogfood report — no speculative features.

### Expected Categories (based on past sprint patterns)

**P0 — Blocking issues (fix first):**
- Pipeline failures (commands that crash or loop)
- Enforcement bugs (hooks that block valid operations or allow invalid ones)
- State corruption (state.json left in unrecoverable state)

**P1 — Major friction (fix second):**
- Slow convergence (sweep taking 4+ passes when it should take 2)
- Bad decomposition (architect producing wrong node count for the tier)
- Skill misfires (wrong skills loaded, skills that hurt more than help)
- MCP validation false positives (flagging correct code as wrong)
- Design pass issues (anti-slop too aggressive or not aggressive enough)

**P2 — Polish (fix third):**
- Confusing messages (error messages that don't tell you what to do)
- Missing recovery paths (states where no command helps)
- Token waste (agents reading too much context for simple operations)
- Documentation gaps (commands not explained in help/guide)

**P3 — Nice-to-haves:**
- Quality-of-life improvements suggested during dogfood
- Performance optimizations
- Better defaults

### Process
1. Triage the dogfood bug tickets by priority
2. Fix P0s first — these block the product from being usable
3. Fix P1s — these make the product frustrating
4. Fix P2s if time allows
5. Re-run both dogfood builds (SMALL + MEDIUM) to verify fixes
6. Compare metrics: did time, tokens, touches improve?

### Exit Criteria
- Both dogfood builds (SMALL + MEDIUM) complete with zero P0 issues
- Token cost reduced by at least 20% from Sprint 13 measurements
- Manual interventions reduced from Sprint 13 measurements
- All P0 and P1 tickets resolved
- Dogfood report v2 written with improved metrics

### Deliverables
- Fixed codebase
- Dogfood report v2 (re-run measurements)
- Before/after comparison (Sprint 13 vs Sprint 14 metrics)
- Remaining backlog prioritized for future sprints

---

## Sprint 15: Standalone App (ForgePlan Workstation)

### Goal
Build the visual canvas that turns ForgePlan from a CLI plugin into a standalone product. This is the Execution Plan's "ForgePlan Workstation" — a desktop app with real-time visualization of the build process.

### Core Features

**1. Node Visualization**
- Interactive dependency graph colored by node status (pending → building → built → reviewed → certified)
- Click any node for details: spec summary, acceptance criteria, files, sweep findings
- Real-time status updates during deep-build
- Dependency arrows show data flow direction
- Tech: Tauri + React Flow (per Execution Plan)

**2. Phantom-to-Live Preview (Progressive)**

**Phase 1 — Phantom Preview:**
- Static renders during build: component screenshots (frontend), endpoint maps (API), schema diagrams (database)
- User sees the app taking shape during deep-build
- Visual documentation, not a running app

**Phase 2 — Interactive Preview:**
- Previews become clickable: frontend components render in iframe sandbox, API endpoints return example responses
- Still mock data but the UI is real

**Phase 3 — Live Preview:**
- The actual running app: Playwright verifies UI flows, API responds with real logic
- Preview IS the app running against mock/seed data

**Phase 4 — Production Preview:**
- Connect real services: preview becomes staging environment
- One click to deploy

**3. Real-Time Build Steering**
- User watches the build happening in the preview canvas
- Can drop comments during build: "darker here", "make this collapsible", "too much spacing"
- Build agent picks up comments and incorporates them
- Comments are persisted as design decisions in the wiki

**4. Lifecycle Bar**
```
[Discover] → [Research] → [Spec] → [Build] → [Verify] → [Design] → [Review] → [Sweep] → [Certify] → [Ship]
```
- Each stage lights up as the project progresses
- Click any stage for details (findings, timing, token cost)
- During deep-build, advances automatically in real-time
- The bar IS the product story

**5. Cost Dashboard**
- Per-session token usage and cost
- Per-phase breakdown (discover is cheap, sweep is expensive)
- Historical trends across sessions
- Budget alerts

**6. Demo Mode**
- One command: `DEMO_MODE=true npm run dev`
- Fake login credentials (demo@example.com / demo123)
- Seed data exercising every feature
- Mock API responses for external services
- "Demo Mode" banner in UI
- Useful for: stakeholder demos, user testing, sales

### Tech Stack
- **Desktop:** Tauri (Rust backend, web frontend)
- **Frontend:** React + React Flow (node visualization) + Monaco (code editor)
- **Preview:** iframe sandbox for phantom previews, Playwright for live verification
- **Backend:** Node.js (reuses ForgePlan scripts/hooks)
- **Database:** SQLite (local project state, session history, cost tracking)

### Architecture
```
┌─────────────────────────────────────┐
│  Tauri Shell (Desktop Window)       │
│  ┌───────────────────────────────┐  │
│  │  React UI                     │  │
│  │  ┌──────────┐ ┌────────────┐  │  │
│  │  │ Node     │ │ Preview    │  │  │
│  │  │ Graph    │ │ Canvas     │  │  │
│  │  │ (React   │ │ (iframe/   │  │  │
│  │  │  Flow)   │ │  Playwright│  │  │
│  │  └──────────┘ └────────────┘  │  │
│  │  ┌──────────────────────────┐ │  │
│  │  │ Lifecycle Bar            │ │  │
│  │  └──────────────────────────┘ │  │
│  │  ┌──────────┐ ┌────────────┐  │  │
│  │  │ Terminal  │ │ Cost       │  │  │
│  │  │ (Claude   │ │ Dashboard  │  │  │
│  │  │  Code)    │ │            │  │  │
│  │  └──────────┘ └────────────┘  │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  Rust Backend                 │  │
│  │  - .forgeplan/ watcher        │  │
│  │  - Claude Code process mgmt   │  │
│  │  - SQLite (sessions, cost)    │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### What Sprint 15 Ships vs What's Deferred

**Ships in Sprint 15:**
- Node visualization (React Flow graph with status colors)
- Lifecycle bar (real-time progress)
- Phase 1 phantom preview (static renders)
- Cost dashboard (per-session, per-phase)
- Demo mode (seed data + mock services)
- Embedded terminal (Claude Code runs inside the app)

**Deferred (Sprint 16+):**
- Phase 2-4 interactive/live/production previews
- Real-time build steering (comment injection)
- Playwright-based UI verification
- Multi-project workspace
- Team collaboration features
- Cloud deployment (Tauri is desktop-first)

### Prerequisites
- Sprint 13 dogfood validates the CLI pipeline works reliably
- Sprint 14 fixes ensure stable foundation
- Tauri development environment setup
- React Flow evaluation (or alternative: D3, vis.js, cytoscape)

### Exit Criteria
- Desktop app launches, reads `.forgeplan/` directory, renders node graph
- Lifecycle bar shows accurate progress during a `/forgeplan:deep-build`
- Phase 1 phantom preview renders component structure for a frontend node
- Cost dashboard shows per-phase token breakdown for a completed build
- Demo mode works on the client portal project
- App works on Windows, macOS, Linux (Tauri cross-platform)

---

## Summary: The Road to Product

| Sprint | Focus | Output |
|---|---|---|
| **10** (current) | Design pipeline, production agents, repo ingestion | Architecture-down at tool level |
| **11** | Skills + blueprints + anti-slop design | Every agent is domain-expert, builds look professional |
| **12** | MCP integrations + live validation | Builder validates against real services, not blind code gen |
| **13** | Dogfood: SMALL + MEDIUM builds | Proof it works, friction log, metrics baseline |
| **14** | Fix everything dogfood found | Reliable, polished pipeline |
| **15** | Standalone app with visual canvas | The product people see and want |

After Sprint 15: external users, marketing, community blueprints, potential monetization.
