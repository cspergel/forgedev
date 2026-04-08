# Sprint 11 Design: Skills + Blueprints

**Date:** 2026-04-07
**Status:** Draft (research-informed)
**Goal:** Builder invokes external skills during code generation. Blueprints backed by research with vetted dependency stacks. Community blueprints with versioning.
**Research:** `.forgeplan/research/skills-blueprints-sprint11.md`

---

## Key Research Findings That Shape This Design

1. **SKILL.md is already the standard.** 30+ agent products (Claude Code, Codex, Cursor, Copilot, Gemini CLI) use standard SKILL.md files. ForgePlan MUST NOT invent a new format — use SKILL.md natively.

2. **Progressive disclosure solves context bloat.** The Agent Skills spec uses three stages: metadata (~100 tokens at startup), full instructions (<5000 tokens on activation), reference files on demand. Critical for ForgePlan where the builder might have 5-10 domain skills available.

3. **ClawHub is the marketplace model.** 13,729+ published skills with semver versioning, semantic search, CLI install. ForgePlan community blueprints should follow this pattern.

4. **Plop is the best template engine for blueprints.** 553K/week downloads, MIT, programmatic API the builder can invoke. create-t3-app's modular installer pattern (select features, get correctly wired code, centralized dependency version map) is the architecture model.

5. **Copier's answer-tracking is the versioning model.** `.copier-answers.yml` tracks template version + user answers, enables diff-based updates when blueprints change.

---

## Pillar 1: Skill-Augmented Building

### How It Works

The builder agent detects node type from the manifest and activates relevant skills before generating code.

```
manifest.yaml:
  nodes:
    frontend:
      type: frontend
      tech_stack_override: { frontend: "react" }

Builder reads node → type: frontend, stack: react
  → Activates: frontend-design skill (if installed)
  → Builder now has React component patterns, accessibility rules, styling conventions
  → Generated code follows skill guidance
```

### Skill Detection Flow

1. Builder reads the node's `type` and `tech_stack` fields
2. Scans for installed skills matching the domain:
   - `type: frontend` + `frontend: react` → look for `react`, `frontend-design`, `tailwind` skills
   - `type: service` + `api_framework: express` → look for `express`, `api-design`, `rest` skills
   - `type: database` + `orm: drizzle` → look for `drizzle`, `schema-design` skills
3. Activates matching skills (reads their full instructions)
4. Skills provide: patterns, conventions, anti-patterns, code examples
5. Builder generates code informed by activated skills

### Skill Sources (Priority Order)

1. **Project-local skills:** `.forgeplan/skills/` directory (project-specific conventions)
2. **Plugin-bundled skills:** `${CLAUDE_PLUGIN_ROOT}/skills/` (ForgePlan ships with core skills)
3. **User-installed skills:** `~/.claude/skills/` or ClawHub-installed skills
4. **Research-derived skills:** Auto-generated from `/forgeplan:research` output (Sprint 11 stretch)

### Per-Project Configuration

```yaml
# .forgeplan/config.yaml
skills:
  enabled: true                    # Master toggle (default: true for MEDIUM/LARGE, false for SMALL)
  auto_detect: true                # Builder auto-detects relevant skills (default: true)
  explicit:                        # Always activate these skills regardless of detection
    - frontend-design
    - api-patterns
  disabled:                        # Never activate these skills even if detected
    - tailwind                     # User prefers vanilla CSS
  max_active: 5                    # Maximum concurrent skills to prevent context bloat
```

### Tier-Aware Skill Loading

```
SMALL:  Skills disabled by default (keep it fast). User can enable via config.
MEDIUM: Auto-detect + max 3 active skills.
LARGE:  Auto-detect + max 5 active skills + research-derived skills.
```

### Builder Integration

The builder.md agent prompt gets a new section:

```markdown
## Skill-Augmented Building (Sprint 11)

Before generating code for a node:
1. Read `.forgeplan/config.yaml` skills section
2. If skills.enabled: scan for matching skills based on node type + tech_stack
3. Activate up to skills.max_active matching skills (read their full instructions)
4. Apply skill guidance during code generation
5. If no skills match: build normally (skills are additive, never blocking)

Skills provide GUIDANCE, not enforcement. The spec is still the authority.
If a skill recommends a pattern that contradicts the spec, follow the spec.
```

---

## Pillar 2: Research-Backed Blueprints

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

When the builder runs `npm install`, it uses versions from `deps.lock.yaml` instead of blindly installing latest. The researcher agent validates these periodically.

### Blueprint Generation from Research

After `/forgeplan:research [topic]` runs, the output can seed a new blueprint:

```
/forgeplan:research "multi-tenant SaaS with Stripe and Supabase"
  → Research report with recommended packages + patterns + reference projects

/forgeplan:blueprint --from-research "multi-tenant-saas"
  → Generates blueprint.yaml + deps.lock.yaml + skills/ from the research
  → User confirms and customizes
  → Blueprint saved to templates/blueprints/multi-tenant-saas/
```

---

## Pillar 3: Community Blueprints with Versioning

### Versioning Model (Copier Pattern)

When a project is created from a blueprint, track the source:

```yaml
# .forgeplan/blueprint-origin.yaml
blueprint: "client-portal"
version: "1.2.0"
source: "forgeplan/blueprints"     # or "community/username/blueprint-name"
created_at: "2026-04-07"
answers:                           # User's customization choices
  database: supabase
  auth: supabase-auth
  frontend: react
  deployment: vercel
```

When the blueprint updates (new dependency versions, new patterns, security fixes):
```
/forgeplan:blueprint --update
  → Reads blueprint-origin.yaml
  → Fetches latest version of the blueprint
  → Shows diff: what changed in deps.lock.yaml, skills/, blueprint.yaml
  → User confirms which changes to apply
```

### Community Blueprint Format

Community blueprints are GitHub repos following a standard structure:

```
my-blueprint/
  blueprint.yaml          # Manifest template
  deps.lock.yaml          # Vetted dependencies
  skills/                 # Domain-specific skills
  README.md               # What this blueprint is for
  CHANGELOG.md            # Version history
  version: "1.0.0"        # In blueprint.yaml
```

Install: `/forgeplan:discover template:github:username/my-blueprint`

---

## Implementation Order

1. **Skill detection + activation in builder.md** — builder reads skills based on node type
2. **Config.yaml skills section** — per-project skill configuration
3. **deps.lock.yaml schema + builder integration** — builder reads vetted deps
4. **Blueprint generation from research** — `/forgeplan:blueprint --from-research`
5. **Blueprint versioning** — `.forgeplan/blueprint-origin.yaml` + update flow
6. **Community blueprint install** — `template:github:user/repo` in discover

---

## What This Sprint Does NOT Include

- Skill marketplace/registry (use ClawHub or GitHub directly)
- Skill authoring tools (use standard SKILL.md format)
- Blueprint CI/CD (automated dependency updates) — Sprint 13+
- Cross-platform skill compatibility testing — deferred

---

## Files That Need Changes (~12)

- `agents/builder.md` — skill detection + activation + deps.lock reading
- `commands/build.md` — skill loading before build
- `commands/discover.md` — `template:github:user/repo` community blueprint support
- `templates/schemas/config-schema.yaml` — skills section
- `templates/schemas/manifest-schema.yaml` — blueprint_origin field (optional)
- `templates/blueprints/client-portal/deps.lock.yaml` — NEW: vetted deps for existing blueprint
- `templates/blueprints/saas-starter/deps.lock.yaml` — NEW: vetted deps
- `templates/blueprints/internal-dashboard/deps.lock.yaml` — NEW: vetted deps
- `commands/research.md` — `--blueprint` flag for blueprint generation
- `commands/blueprint.md` — NEW: blueprint management command (create from research, update, list)
- `CLAUDE.md` — Sprint 11 documentation
