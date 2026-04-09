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

### Skill Registry — The Central Artifact

Instead of computing skill selections at every agent dispatch, skills are pre-computed into a **registry file** that commands read instantly. The cascade logic runs at specific moments (discovery, research, skill approval) and writes its results to the registry. Every build/sweep just reads the file — zero latency.

```yaml
# .forgeplan/skills-registry.yaml — auto-generated, do not edit manually
# Regenerated by: /forgeplan:discover, /forgeplan:research, /forgeplan:skill approve/refresh
generated_at: "2026-04-08T14:30:00Z"
manifest_hash: "a3f8c1d..."           # Hash of manifest tech_stack + nodes — triggers auto-refresh on change
tech_stack_snapshot:                   # What was matched when this registry was generated
  language: typescript
  api_framework: express
  database: supabase
  frontend: react

assignments:
  builder:
    - path: skills/core/coding-standards.md
      name: coding-standards
      priority: 85
      tier: curated
    - path: skills/core/backend-patterns.md
      name: backend-patterns
      priority: 85
      tier: curated
    - path: skills/conditional/supabase-postgres.md
      name: supabase-postgres
      priority: 75
      tier: curated
    - path: .forgeplan/skills/express-zod-routes.md
      name: express-zod-routes
      priority: 30
      tier: learned

  sweep-adversary:
    - path: skills/core/owasp-security.md
      name: owasp-security
      priority: 90
      tier: curated
    # ...

  # One section per agent
```

**At dispatch time, the orchestrator does:**
```
1. Read .forgeplan/skills-registry.yaml
2. Look up assignments[agent_name]
3. Include skill metadata (name, path, priority) in Agent prompt (~100 tokens per skill)
4. Include instruction: "Read full skill content from [path] when relevant"
5. Dispatch agent
```

No scanning, no frontmatter parsing, no cascade computation. Just a YAML lookup.

### How the Registry Gets Written — Event-Driven Cascade

The 4-tier cascade logic runs at specific moments, not every dispatch:

| Event | What Happens | Tiers Evaluated |
|-------|-------------|----------------|
| `/forgeplan:discover` or `/forgeplan:greenfield` | Full cascade on new project — matches curated skills to tech_stack, flags gaps for research | 1 + 3 |
| `/forgeplan:research` | Research fills gaps, generates new skills → updates registry | 3 |
| `/forgeplan:skill approve` | Learned skill promoted from drafts/ → added to registry | 4 |
| `/forgeplan:skill install [path]` | Manual skill added → inserted into registry | 2 |
| `/forgeplan:skill refresh` | Full re-evaluation of all skills against current manifest | 1 + 2 + 3 + 4 |
| **Auto-refresh (manifest change)** | See below | 1 + 2 |

**Tier definitions (same cascade, event-driven execution):**

```
Tier 1: CURATED (built-in, vetted by us) — Priority 80-100
  → Scans skills/core/ and skills/conditional/
  → Matches by tech_filter, agent_filter, tier_filter in SKILL.md frontmatter
  → Written to registry at discover time

Tier 2: PROJECT-SPECIFIC (manual install) — Priority 50-79
  → Reads .forgeplan/skills/ (not drafts/)
  → Added to registry via /forgeplan:skill install

Tier 3: AUTO-RESEARCH (generated from research) — Priority 40-49
  → When Tier 1 can't cover a tech_stack component (e.g., "drizzle" but
    no drizzle skill), Researcher generates a lightweight SKILL.md
  → Written to .forgeplan/skills/ + registry at research time
  → Only triggers during discover/greenfield/research, never mid-build

Tier 4: LEARNED (from skill learner module) — Priority 20-39
  → Generated as drafts in .forgeplan/skills/drafts/
  → User reviews via /forgeplan:skill review, approves → moves to .forgeplan/skills/
  → Added to registry via /forgeplan:skill approve
```

**Conflict resolution:** When two skills from different tiers match the same agent, priority wins. Within the same priority, the more specific `tech_filter` match wins. Built-in curated (80-100) always override learned (20-39).

### Auto-Refresh — Eliminating Staleness

The registry stores a `manifest_hash` (hash of `tech_stack` + `nodes` keys from manifest.yaml). Staleness is caught at two points:

**1. SessionStart hook (passive detection):**
```javascript
// In session-start.js — lightweight, runs every session
const currentHash = hashManifestSkillInputs(manifest);
const registryHash = registry.manifest_hash;
if (currentHash !== registryHash) {
  // Manifest changed since last registry generation
  console.log("⚠ Skill registry is stale (manifest changed). Run /forgeplan:skill refresh or it will auto-refresh on next build.");
  staleSkillRegistry = true;
}
```

**2. PreToolUse hook (active refresh before build/sweep):**
```javascript
// In pre-tool-use.js — only runs when about to dispatch an agent
if (staleRegistry || !registryExists) {
  // Auto-refresh: re-run cascade with current manifest
  execSync('node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" refresh');
  // Registry is now current — proceed with dispatch
}
```

This means:
- Changing `tech_stack` in the manifest → next session warns, next build auto-refreshes
- Adding a node → same
- No manual `/forgeplan:skill refresh` needed unless you want it immediately
- First build on a project without a registry → auto-generates one

**Quality gate (runs during registry writes, not at dispatch):**
- Required frontmatter: `name`, `description`, `when_to_use` (reject if missing)
- Size limit: 5000 tokens max (reject if over, warn in registry output)
- Freshness: `validated_at` field, warn if >90 days stale for Tier 2-4 skills
- Not in config.yaml `disabled` list
- No more than `max_active` skills per agent (excess dropped by lowest priority)

### Progressive Disclosure — Context Management

Even with the registry pre-computed, full skill content is NOT dumped into agent prompts. Two-phase loading:

**At dispatch:** Agent receives skill metadata index from registry (~100 tokens per skill × 3-5 skills = 300-500 tokens):
```
Available skills:
  1. coding-standards (priority 85) — KISS/DRY/YAGNI, TypeScript naming. Path: skills/core/coding-standards.md
  2. backend-patterns (priority 85) — Repository/service layers, N+1 prevention. Path: skills/core/backend-patterns.md
  3. supabase-postgres (priority 75) — Schema design, RLS, migrations. Path: skills/conditional/supabase-postgres.md
Read full skill content when relevant to your current task.
```

**During execution:** Agent reads 1-2 full skills via Read tool when they're relevant to the specific code being written. A builder working on a database migration reads supabase-postgres. A builder working on route handlers reads backend-patterns. Not both at once.

Context budget per agent: ~500 tokens (metadata) + 2000-5000 tokens (1-2 full skills) = **2500-5500 tokens total**, not 10K-25K.

### Per-Project Configuration

```yaml
# .forgeplan/config.yaml
skills:
  enabled: true                    # Master toggle (default: true for MEDIUM/LARGE, false for SMALL)
  auto_detect: true                # Orchestrator auto-matches curated skills to tech_stack
  auto_research: true              # Tier 3: auto-generate skills for unrecognized tech
  auto_refresh: true               # Auto-refresh registry when manifest changes (default: true)
  explicit:                        # Always include these skills regardless of detection
    - frontend-design
    - api-patterns
  disabled:                        # Never include these skills even if detected
    - tailwind                     # User prefers vanilla CSS
  max_active: 5                    # Maximum skills per agent in registry
  sources:                         # Skill search paths (searched in order)
    - .forgeplan/skills            # Project-specific (learner, manual, research-generated)
    - skills                       # Plugin built-in (curated, vendored)
    # - ~/.claude/skills           # User global (cross-project)
```

---

## Pillar 2: Skill Learner Module (Portable Microservice)

### What It Does

Watches coding patterns, detects repetition, and helps users build a personal SKILL.md library from their actual work.

### Core Loop

```
Monitor → Detect → Suggest → Draft → Review → Activate → Validate → Promote
```

1. **Monitor:** PostToolUse hook tracks file writes during builds — what patterns are being generated
2. **Detect:** After 3+ occurrences of similar structure (same imports, same error handling shape, same middleware pattern), flag it
3. **Suggest:** "You've built 3 Express route handlers with Zod validation + try/catch + error response. Save as a skill?"
4. **Draft:** Generate a SKILL.md with the pattern + examples from actual code → `.forgeplan/skills/drafts/` (NOT active yet)
5. **Review:** User runs `/forgeplan:skill review [name]` to inspect the draft. Can edit, approve, or discard. Only approved skills move to `.forgeplan/skills/`
6. **Activate:** Next build with similar node type, the approved skill is auto-detected and loaded via the Skill Cascade (Tier 4, priority 20-39)
7. **Validate:** Sweep agents verify the generated code quality — if sweep finds issues in skill-guided code, downrank the skill (reduce priority, add `quality_issues` field)
8. **Promote:** After 5+ successful uses with no sweep issues, suggest promoting to `~/.claude/skills/` (cross-project). User confirms.

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

## SKILL.md Format Specification

All skills use standard SKILL.md with extended frontmatter for the cascade system:

```markdown
---
name: coding-standards
description: KISS/DRY/YAGNI enforcement, TypeScript naming, Zod validation
when_to_use: Always for TypeScript projects during build and review
priority: 85                          # 0-100. Curated: 80-100, Project: 50-79, Research: 40-49, Learned: 20-39
source: affaan-m/everything-claude-code  # Where this skill came from (for attribution + updates)
validated_at: "2026-04-08"            # Last verified as current/correct
overrides: []                         # Skill names this one takes precedence over on conflict
tier_filter: [MEDIUM, LARGE]          # Only load for these tiers (empty = all tiers)
agent_filter: [builder, reviewer]     # Only load for these agents (empty = all agents)
tech_filter: [typescript, javascript] # Only load when tech_stack matches (empty = all stacks)
---

# Coding Standards

[Full skill content — rules, examples, patterns]
[Max 5000 tokens]
```

**Required fields:** `name`, `description`, `when_to_use`
**Optional fields:** `priority` (default 50), `source`, `validated_at`, `overrides`, `tier_filter`, `agent_filter`, `tech_filter`

The `tier_filter`, `agent_filter`, and `tech_filter` fields enable precise matching during the Skill Cascade without loading every skill's full content. The orchestrator reads only frontmatter to build the skill index.

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

### Batch 1: Registry Engine + Core Skills (foundation)
1. Create `scripts/skill-registry.js` — the registry generator:
   - Subcommands: `generate` (full cascade → write registry), `refresh` (re-evaluate against current manifest), `validate` (check all skills pass quality gate)
   - Reads config.yaml skills section + manifest tech_stack + node types
   - Scans skill sources, parses SKILL.md frontmatter only
   - Runs 4-tier cascade: curated → project → auto-research → learned
   - Applies quality gate (required frontmatter, size limit, freshness)
   - Resolves conflicts via priority, caps at `max_active` per agent
   - Writes `.forgeplan/skills-registry.yaml` with `manifest_hash`
2. Add auto-refresh hooks:
   - `session-start.js`: compare `manifest_hash` in registry vs current manifest, warn if stale
   - `pre-tool-use.js`: if registry stale or missing before agent dispatch, run `skill-registry.js refresh`
3. Write/vendor the first 10 core skills into `skills/core/` (coding-standards, backend-patterns, tdd-workflow, authentication-patterns, owasp-security, mastering-typescript, react-best-practices, api-contract-auditor, deep-research, code-review)
4. ~~Add skills section to config-schema.yaml~~ (DONE — shipped in Sprint 10B hardening)
5. Update `commands/build.md` — read registry, include skill metadata in builder prompt
6. Update `commands/sweep.md` — read registry per sweep agent before dispatch

### Batch 2: Full Skill Set + Wiring
7. Write/vendor remaining 18 curated skills + 5 conditional skills into `skills/core/` and `skills/conditional/`
8. Compile architect skills into `agents/architect.md` as tier-aware reasoning sections
9. Update `commands/discover.md` — call `skill-registry.js generate` after manifest is written
10. Update `commands/review.md` — read registry for reviewer skill loading
11. Add `skills:` metadata reference to all 10 agent `.md` files (pointer to available skills, not embedded content)

### Batch 3: Design Quality + Anti-Slop
12. Create `skills/core/frontend-design.md` with anti-slop rules + clean design patterns
13. Create `agents/design-pass.md` — post-build design agent for visual consistency
14. Update `commands/deep-build.md` — add design pass phase after build, before review
15. Add user steering prompt — one round of aesthetic feedback after design pass

### Batch 4: Skill Learner Module
16. Create `scripts/skill-learner/` module — pattern detection engine (detect, generate draft)
17. Wire into PostToolUse hook — monitor code generation patterns
18. Build SKILL.md generator — transform detected patterns into standard format with proper frontmatter
19. Add `/forgeplan:skill` command — list, review (from drafts/), approve, promote, delete, refresh, install
20. Add Tier 3 auto-research trigger to `skill-registry.js` — when cascade finds a gap during discover/greenfield, flag it for Researcher

### Batch 5: Blueprints
21. Create `deps.lock.yaml` for existing blueprints (client-portal, saas-starter, internal-dashboard)
22. Update builder to read `deps.lock.yaml` for dependency versions
23. Create `/forgeplan:blueprint` command (create from research, update, list)
24. Add `blueprint-origin.yaml` tracking + update flow
25. Add `template:github:user/repo` support to discover.md

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
