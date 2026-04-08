# Sprint 11 Design: Skills for All Agents + Blueprints

**Date:** 2026-04-07
**Status:** Draft (research-informed)
**Goal:** Every agent gets domain-specific skills via frontmatter. Builder invokes skills during code generation. Skill learner module captures patterns for reuse. Blueprints backed by research with vetted dependency stacks.
**Research:** `.forgeplan/research/skills-blueprints-sprint11.md`, `skill-system-deep-dive.md`, `dynamic-skill-selection.md`, `baseline-skills-inventory.md`, `skills-per-agent-*.md` (4 files)

---

## Key Research Findings That Shape This Design

1. **SKILL.md is already the standard.** 30+ agent products use it. ForgePlan MUST NOT invent a new format.

2. **Subagents load skills via `skills:` frontmatter** — injects full content at startup. Subagents do NOT inherit parent skills. This is the mechanism for per-agent skill loading.

3. **Select skills BEFORE dispatching agents** (not mid-execution) — changing tools mid-iteration invalidates KV-cache.

4. **15 curated skills outperform 100 general ones.** Curation over accumulation.

5. **Include "when to use" metadata** in skill descriptions — improves selection accuracy by 4-8%.

6. **Progressive disclosure solves context bloat.** Metadata (~100 tokens at startup), full instructions (<5000 tokens on activation), reference files on demand.

7. **ClawHub is the marketplace model.** 13,729+ published skills with semver versioning.

8. **Copier's answer-tracking is the versioning model** for community blueprints.

---

## Pillar 1: Skills for ALL Agents (MANDATORY)

### The Principle

Every agent in ForgePlan gets domain-specific skills that make it better at its job. Skills are loaded via `skills:` frontmatter in the agent's `.md` file. The orchestrator (build.md, sweep.md, etc.) can also dynamically add skills based on node type and tech_stack.

### Complete Skill Map

#### Architect (4 skills — compiled into prompt, tier-aware)

| Skill | Source | What It Adds |
|---|---|---|
| DDD Strategic Design | CodeMachine0121/Claude-Code-Skill-DDD | Bounded contexts → nodes, aggregates → shared models, domain events → connections |
| Design Patterns + Anti-Patterns | ratacat/claude-skills | 20 patterns, symptom-to-pattern framework, God Object/Anemic Domain avoidance |
| Database Designer | alirezarezvani/claude-skills | ERD modeling, normalization (1NF-BCNF), database selection matrix |
| API Designer | Jeffallan/claude-skills | Resource modeling, contract design during discovery |

**Tier-aware loading:**
- SMALL: Anti-pattern checklist only (prevent God Object nodes)
- MEDIUM: + Database Designer + API Designer (inform decomposition)
- LARGE: Full DDD Strategic Design (bounded contexts, event storming)

**Integration:** These are COMPILED into `agents/architect.md` as reasoning sections, not loaded at runtime. The architect's prompt grows ~500-1000 tokens depending on tier. This avoids runtime skill loading overhead for the most context-sensitive agent.

#### Builder (6 core + 5 conditional — frontmatter + dynamic)

**Core skills (always loaded via frontmatter):**

| Skill | Source | What It Adds |
|---|---|---|
| coding-standards | affaan-m/everything-claude-code | KISS/DRY/YAGNI, TypeScript naming, Zod validation, immutability |
| backend-patterns | affaan-m/everything-claude-code | Repository/service/middleware layers, N+1 prevention, transactions, caching |
| tdd-workflow | affaan-m/everything-claude-code | RED-GREEN-REFACTOR, 80%+ coverage gates, mocking strategy |
| authentication-patterns | travisjneuman | OAuth/PKCE, JWT rotation, MFA, RBAC, Clerk/Supabase/NextAuth |
| react-best-practices | Vercel Labs (277K installs) | 69 performance rules across 8 categories |
| composition-patterns | Vercel Labs | Compound components, state lifting, variant components |

**Conditional skills (loaded dynamically by orchestrator based on tech_stack):**

| Skill | When Loaded | What It Adds |
|---|---|---|
| supabase-postgres | `tech_stack.database: supabase` | Schema design, RLS, migrations, Supabase-specific patterns |
| mastering-typescript | Always for TypeScript projects | Branded types, discriminated unions, advanced generics |
| better-auth | `tech_stack.auth: custom` | Auth implementation without a managed provider |
| web-design-guidelines | Frontend nodes exist | 100+ a11y/performance/UX standards |
| frontend-patterns | Non-Next.js React projects | General React patterns (Next.js uses react-best-practices) |

**Tier-aware loading:**
- SMALL: coding-standards + 1 stack-specific (2-3 total)
- MEDIUM: coding-standards + backend-patterns + tdd-workflow + 1-2 stack-specific (4-5 total)
- LARGE: All 6 core + relevant conditional (5-6 total, max governed by config.yaml)

#### Reviewer (3 skills)

| Skill | Source | What It Adds |
|---|---|---|
| code-review-skill | awesome-skills | 4-phase review process, severity taxonomy (blocking/important/nit/suggestion) |
| code-review-graph | tirth8205 | Tree-sitter knowledge graph for 6.8x token reduction on reviews |
| Confidence scoring pattern | Anthropic methodology | 0-100 confidence scoring on judgment-based dimensions |

#### Researcher (3 skills)

| Skill | Source | What It Adds |
|---|---|---|
| deep-research-skill | 199-biotechnologies | 8-phase pipeline, source credibility scoring (0-100), self-critique |
| managing-dependencies | andrew | Supply chain risk: transitive depth, bus factor, typosquatting |
| Pattern extraction | affaan-m methodology | Structured Problem → Pattern → Rationale → When-to-use format |

#### Adversary — sweep agent (3 skills)

| Skill | Source | What It Adds |
|---|---|---|
| sharp-edges + insecure-defaults | Trail of Bits | Algorithm footguns, fail-secure analysis, configuration cliffs |
| owasp-security | agamm | Full OWASP Top 10:2025, ASVS 5.0 verification levels |
| secure-code-review | mahmutka | Semgrep integration, CWE taxonomy, deserialization/XXE |

#### Contractualist — sweep agent (2 skills)

| Skill | Source | What It Adds |
|---|---|---|
| mastering-typescript | SpillwaveSolutions | Branded types, discriminated unions, Zod boundary validation |
| api-contract-auditor | levnikolaevich | Layer leakage detection, entity exposure, missing DTOs |

#### Pathfinder — sweep agent (3 skills)

| Skill | Source | What It Adds |
|---|---|---|
| web-interface-guidelines | Vercel Labs | 99 specific UX rules across 7 categories |
| accesslint reviewer | AccessLint | Programmatic WCAG audit + contrast calculator MCP server |
| tdd-workflow | affaan-m | Test quality audit, anti-pattern catalog, E2E Playwright patterns |

#### Structuralist — sweep agent (2 skills)

| Skill | Source | What It Adds |
|---|---|---|
| layer-boundary-auditor | levnikolaevich | Grep-based I/O isolation, transaction boundary ownership |
| simplify + simplicity principles | Anthropic | POLA enforcement, function size limits, AI bloat detection |

#### Skeptic — sweep agent (2 skills)

| Skill | Source | What It Adds |
|---|---|---|
| differential-review | Trail of Bits | Git-history-aware review, cross-function data flow tracking |
| code-review | awesome-skills | 280+ structured checks, 4-phase review, boundary condition checklists |

### Skill Loading Mechanism

**For agents dispatched via Agent tool (builder, sweep agents, reviewer, researcher):**
```
build.md orchestrator:
  1. Read node type + tech_stack from manifest
  2. Read config.yaml skills section (enabled? explicit? disabled? max_active?)
  3. Determine tier → select skill count
  4. Read relevant SKILL.md files from skills/ directories
  5. Embed skill content in Agent tool prompt alongside spec + manifest
  6. Dispatch builder with skills pre-loaded
```

**For the architect agent (invoked directly by discover.md):**
- Skills are COMPILED into `agents/architect.md` as tier-aware reasoning sections
- No runtime loading — the prompt already contains the methodology
- Keeps the discovery conversation fast (no skill lookup overhead)

### Per-Project Configuration

```yaml
# .forgeplan/config.yaml
skills:
  enabled: true                    # Master toggle (default: true for MEDIUM/LARGE, false for SMALL)
  auto_detect: true                # Orchestrator auto-detects relevant skills (default: true)
  explicit:                        # Always activate these skills regardless of detection
    - frontend-design
    - api-patterns
  disabled:                        # Never activate these skills even if detected
    - tailwind                     # User prefers vanilla CSS
  max_active: 5                    # Maximum concurrent skills to prevent context bloat
```

### Skill Expansion — How Agents Get New Skills

**Path 1: Research-to-Skill Pipeline (automatic)**
```
/forgeplan:research finds patterns → auto-generates lightweight SKILL.md
  → saved to .forgeplan/skills/
  → next build picks it up automatically
  → sweep validates the pattern worked
  → if validated, promote to shared skill
```

**Path 2: Skill Learner Module (semi-automatic)**
```
PostToolUse hook monitors code generation patterns
  → detects when similar patterns appear 3+ times
  → suggests: "You've built 3 Stripe webhook handlers this way. Save as a skill?"
  → generates SKILL.md from the pattern
  → saved to .forgeplan/skills/
  → auto-activates on similar future work
```

**Path 3: Manual Install (user-driven)**
```
User finds a skill on ClawHub / GitHub / npm
  → installs to ~/.claude/skills/ or .forgeplan/skills/
  → config.yaml explicit: section can force-load it
```

---

## Pillar 2: Skill Learner Module (Portable Microservice)

### What It Does

Watches coding patterns, detects repetition, and helps users build a personal SKILL.md library from their actual work.

### Core Loop

```
Monitor → Detect → Suggest → Save → Activate → Validate → Promote
```

1. **Monitor:** PostToolUse hook tracks file writes during builds — what patterns are being generated
2. **Detect:** After 3+ occurrences of similar structure (same imports, same error handling shape, same middleware pattern), flag it
3. **Suggest:** "You've built 3 Express route handlers with Zod validation + try/catch + error response. Save as a skill?"
4. **Save:** Generate a SKILL.md with the pattern + examples from actual code → `.forgeplan/skills/`
5. **Activate:** Next build with similar node type, the skill is auto-detected and loaded
6. **Validate:** Sweep agents verify the generated code quality — if sweep finds issues in skill-guided code, downrank the skill
7. **Promote:** After 5+ successful uses with no sweep issues, suggest promoting to `~/.claude/skills/` (cross-project)

### Architecture: Portable Microservice

- Self-contained module: `scripts/skill-learner/` directory with clean API boundary
- Dependencies: ONLY fs, path, and the SKILL.md format — no ForgePlan-specific state
- Can be extracted and released as a standalone Claude Code plugin
- Interface: `detectPatterns(files)` → `generateSkill(pattern)` → `saveSkill(skill, directory)`

### What It Does NOT Do

- Does not automatically modify agent behavior without user consent (always suggests, never forces)
- Does not couple to manifest/nodes/state — works with just a codebase + skills directory
- Does not replace curated skills — it supplements them with project-specific patterns

---

## Pillar 3: Research-Backed Blueprints

### What a Blueprint Becomes

Current blueprints (Sprint 4) are static YAML manifests. Sprint 11 blueprints become **research-backed starter kits**:

```
templates/blueprints/
  client-portal/
    blueprint.yaml          # Manifest template (existing)
    deps.lock.yaml          # Vetted dependency versions (NEW)
    skills/                 # Blueprint-specific skills (NEW)
      portal-auth.md        # Auth patterns for portal apps
      document-upload.md    # File handling patterns
    research-date: 2026-04  # When deps were last verified (NEW)
```

### Vetted Dependency Stacks

Each blueprint includes a `deps.lock.yaml` with researched, license-checked dependencies:

```yaml
# deps.lock.yaml — generated by /forgeplan:research, manually curated
research_date: "2026-04-07"
runtime: node
language: typescript

dependencies:
  express:
    version: "^4.21.0"
    license: MIT
    downloads_weekly: 25000000
    status: APPROVED
    purpose: "API framework"

  zod:
    version: "^3.24.0"
    license: MIT
    downloads_weekly: 8000000
    status: APPROVED
    purpose: "Runtime validation"

  bcryptjs:
    version: "^2.4.3"
    license: MIT
    downloads_weekly: 2500000
    status: APPROVED
    purpose: "Password hashing (pure JS — no native build deps)"
    note: "Preferred over bcrypt to avoid postinstall build issues"
```

### Blueprint Generation from Research

```
/forgeplan:research "multi-tenant SaaS with Stripe and Supabase"
  → Research report with recommended packages + patterns + reference projects

/forgeplan:blueprint --from-research "multi-tenant-saas"
  → Generates blueprint.yaml + deps.lock.yaml + skills/ from the research
  → User confirms and customizes
  → Blueprint saved to templates/blueprints/multi-tenant-saas/
```

---

## Pillar 4: Community Blueprints with Versioning

### Versioning Model (Copier Pattern)

```yaml
# .forgeplan/blueprint-origin.yaml
blueprint: "client-portal"
version: "1.2.0"
source: "forgeplan/blueprints"
created_at: "2026-04-07"
answers:
  database: supabase
  auth: supabase-auth
  frontend: react
  deployment: vercel
```

Update flow:
```
/forgeplan:blueprint --update
  → Reads blueprint-origin.yaml
  → Fetches latest version
  → Shows diff
  → User confirms which changes to apply
```

### Community Blueprint Format

```
my-blueprint/
  blueprint.yaml          # Manifest template
  deps.lock.yaml          # Vetted dependencies
  skills/                 # Domain-specific skills
  README.md               # What this blueprint is for
  CHANGELOG.md            # Version history
```

Install: `/forgeplan:discover template:github:username/my-blueprint`

---

## Pillar 5: Anti-Slop Design Quality

### The Problem

Every AI-built app looks the same: purple gradients, rounded cards, too much padding, emoji in headers, "Welcome to your dashboard!" The instant someone sees it they know AI built it. ForgePlan-built apps should be indistinguishable from human-designed apps.

### Anti-Slop Rules (baked into frontend-design skill)

The `frontend-design` skill loaded during frontend node builds includes these hard rules:

- No gradient backgrounds unless the user asks for them
- No emoji in UI text
- No "Welcome to..." hero sections
- No purple-blue-teal default palette
- No excessive border-radius (not everything is a pill)
- No card-based layouts for everything
- White space is intentional, not padding bloat
- Typography hierarchy over color hierarchy
- One accent color, not a rainbow
- If it looks like a Vercel template, start over
- Prefer system fonts or one font family max
- Muted, professional color palettes by default
- Dense, information-rich layouts over spacious empty ones
- No stock placeholder copy — real labels, real microcopy

### Design Pass (deep-build pipeline addition)

A dedicated design agent runs after frontend nodes are built, before review:

```
deep-build pipeline:
  build → verify-runnable → DESIGN PASS → review → sweep → certify
```

**What the design pass does:**
1. Reads all frontend node files
2. Checks anti-slop rules (deterministic — regex/AST for gradient classes, emoji, specific phrases)
3. Checks visual consistency (same spacing scale, color usage, typography across components)
4. Checks component quality (loading/empty/error states have distinct, non-generic visuals)
5. Generates findings like sweep agents: `FINDING: F1 — Generic "Welcome" hero section in App.tsx:12`
6. Fix agent applies changes (same fresh-agent-on-fix pattern as sweep)

**Tier-aware depth:**
- SMALL: Anti-slop rule check only (fast, deterministic)
- MEDIUM: + visual consistency check
- LARGE: + component quality audit

### User Steering (one round, at the end)

After the design pass, before sweep:
```
"Frontend design pass complete. Here's a summary of what was built:
  - 3 pages: login, dashboard, settings
  - Palette: slate-900/white/blue-600 accent
  - Layout: sidebar + content area
  - Typography: Inter, 3 sizes

  Would you like to adjust anything? (e.g., 'darker', 'more minimal',
  'add a logo placeholder', 'use green accent instead')
  Or press enter to continue to sweep."
```

One round of feedback. User steers taste, system handles quality.

### Future: Phantom-to-Live Steering (Standalone App)

In the standalone ForgePlan Workstation, users will watch the build happening in a visual preview. They can drop comments during the build: "darker here", "make this sidebar collapsible", "too much spacing." The build agent picks up comments in real-time. This is a visual canvas feature — deferred to post-plugin.

---

## Implementation Order

### Batch 1: Skill Infrastructure (foundation)
1. Install/vendor the 28 core skill SKILL.md files into `skills/` directory structure
2. Add `skills:` frontmatter to ALL 10 agent `.md` files with their curated skills
3. Add skills section to `templates/schemas/config-schema.yaml`
4. Update `commands/build.md` — orchestrator reads config, selects skills, embeds in builder prompt
5. Update `commands/sweep.md` — orchestrator loads sweep agent skills before dispatch

### Batch 2: Architect + Dynamic Selection
6. Compile architect skills into `agents/architect.md` as tier-aware reasoning sections
7. Update `commands/discover.md` — tier-aware architect skill sections activate
8. Build dynamic skill selection: orchestrator reads node type + tech_stack → picks conditional skills
9. Update `commands/review.md` — reviewer skill loading

### Batch 3: Design Quality + Anti-Slop
10. Create `skills/frontend-design/SKILL.md` with anti-slop rules + clean design patterns
11. Create `agents/design-pass.md` — post-build design agent for visual consistency
12. Update `commands/deep-build.md` — add design pass phase after build, before review
13. Add user steering prompt — one round of aesthetic feedback after design pass

### Batch 4: Skill Learner Module
14. Create `scripts/skill-learner/` module — pattern detection engine
15. Wire into PostToolUse hook — monitor code generation patterns
16. Build SKILL.md generator — transform detected patterns into standard format
17. Add `/forgeplan:skill` command — manage skills (list, create, promote, delete)

### Batch 5: Blueprints
18. Create `deps.lock.yaml` for existing blueprints (client-portal, saas-starter, internal-dashboard)
19. Update builder to read `deps.lock.yaml` for dependency versions
20. Create `/forgeplan:blueprint` command (create from research, update, list)
21. Add `blueprint-origin.yaml` tracking + update flow
22. Add `template:github:user/repo` support to discover.md

---

## What This Sprint Does NOT Include

- Skill marketplace/registry hosting (use ClawHub or GitHub directly)
- Skill authoring wizard (use standard SKILL.md format manually)
- Blueprint CI/CD (automated dependency updates) — Sprint 14+
- Cross-platform skill compatibility testing — deferred
- Phantom-to-live steering (standalone app — Sprint 15)
- Semantic skill retrieval (only needed at 20+ skills — defer unless needed)

---

## Future Sprint Roadmap

| Sprint | Focus |
|---|---|
| 12 | MCP Integrations — live API validation, auto-detection, selective tool loading |
| 13 | **Dogfood Sprint** — build SMALL + MEDIUM app end-to-end, zero feature dev, measure everything |
| 14 | Bug fixes + refinements from dogfood findings |
| 15 | **Standalone App** — visual canvas, phantom-to-live preview, node visualization, lifecycle bar, real-time build steering |
- Semantic retrieval for skills (only needed at 20+ skills — we have 28, borderline, defer to Sprint 12 if needed)

---

## Files That Need Changes (~25)

**Agent files (10):**
- `agents/architect.md` — compiled skill sections (tier-aware)
- `agents/builder.md` — `skills:` frontmatter with 6 core skills
- `agents/reviewer.md` — `skills:` frontmatter with 3 skills
- `agents/researcher.md` — `skills:` frontmatter with 3 skills
- `agents/sweep-adversary.md` — `skills:` frontmatter with 3 skills
- `agents/sweep-contractualist.md` — `skills:` frontmatter with 2 skills
- `agents/sweep-pathfinder.md` — `skills:` frontmatter with 3 skills
- `agents/sweep-structuralist.md` — `skills:` frontmatter with 2 skills
- `agents/sweep-skeptic.md` — `skills:` frontmatter with 2 skills
- `agents/docs-agent.md` — archived (consolidated into researcher in Sprint 10A)

**Command files (6):**
- `commands/build.md` — skill loading orchestration
- `commands/sweep.md` — sweep agent skill loading
- `commands/review.md` — reviewer skill loading
- `commands/discover.md` — community blueprint support
- `commands/research.md` — `--blueprint` flag
- `commands/skill.md` — NEW: skill management command

**New files (~8):**
- `skills/` directory with 28+ SKILL.md files (installed/vendored)
- `scripts/skill-learner/` module (3-4 files)
- `commands/blueprint.md` — NEW: blueprint management
- `templates/blueprints/*/deps.lock.yaml` — 3 files

**Schema/config:**
- `templates/schemas/config-schema.yaml` — skills section
- `CLAUDE.md` — Sprint 11 documentation

---

## Skills We Should PUBLISH

Our 7-dimension spec compliance review approach is unique in the ecosystem. After Sprint 11, publish as open-source SKILL.md files:
- `forgeplan-spec-compliance` — the Reviewer's 7-dimension audit methodology
- `forgeplan-architecture-down` — the Architect's decomposition approach
- `forgeplan-sweep-convergence` — the progressive convergence algorithm

These become ForgePlan's contribution back to the skill ecosystem and a marketing channel.
