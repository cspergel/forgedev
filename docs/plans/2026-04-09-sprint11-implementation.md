# Sprint 11: Skills for All Agents — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Every ForgePlan agent gets domain-specific skills via a pre-computed registry. Skills load with zero dispatch latency and minimal context bloat.

**Architecture:** Event-driven skill registry (`skills-registry.yaml`) pre-computes agent→skill assignments. Written at project events (discover, research, skill approve). Read instantly at dispatch. Progressive disclosure: metadata at dispatch, full content on-demand via Read tool.

**Tech Stack:** Node.js scripts, YAML registry, SKILL.md format with extended frontmatter.

**Scope:** Must-ship Batches 1-2 only. Stretch (design pass, learner, blueprints) deferred.

---

## Batch 1: Registry Engine + Core Skills

### Task 1: Create `scripts/skill-registry.js`

The core engine. Subcommands: `generate`, `refresh`, `validate`, `compile-architect`.

**Files:**
- Create: `scripts/skill-registry.js`
- Read: `templates/schemas/config-schema.yaml` (skills section)
- Read: `docs/plans/2026-04-07-sprint11-design.md` (registry format, cascade logic, quality gate)

**What it does:**
1. `generate` — Full cascade: scan skill sources, parse SKILL.md frontmatter, match against manifest tech_stack + node types, resolve conflicts by priority, cap at max_active per agent, write `.forgeplan/skills-registry.yaml`
2. `refresh` — Same as generate but re-evaluates against current manifest (called by auto-refresh hooks)
3. `validate` — Check all skills in sources pass quality gate (required frontmatter, size limit, freshness)
4. `compile-architect` — Read architect skill SKILL.md files, compile into a single block, output for embedding in architect.md

**Key implementation details:**
- Parse SKILL.md frontmatter only (everything between first `---` and second `---`) — do NOT read full content
- Frontmatter fields: `name`, `description`, `when_to_use` (required), `priority` (default 50), `source`, `validated_at`, `overrides`, `tier_filter`, `agent_filter`, `tech_filter` (optional)
- Quality gate: reject if missing required frontmatter, warn if >5000 tokens (count lines × ~4 tokens/line as estimate), warn if `validated_at` >90 days stale
- `manifest_hash`: hash of `JSON.stringify({ tech_stack: manifest.project.tech_stack, nodes: Object.keys(manifest.nodes) })`
- Agent names for assignments: `builder`, `reviewer`, `researcher`, `sweep-adversary`, `sweep-contractualist`, `sweep-pathfinder`, `sweep-structuralist`, `sweep-skeptic`
- The architect gets compiled skills, not registry assignments

**Registry output format:**
```yaml
generated_at: "[ISO timestamp]"
manifest_hash: "[hash]"
tech_stack_snapshot:
  language: typescript
  # ... copied from manifest
assignments:
  builder:
    - path: skills/core/coding-standards.md
      name: coding-standards
      description: "KISS/DRY/YAGNI, TypeScript naming"
      priority: 85
      tier: curated
      hint: read_now | reference    # orchestrator hint for task-to-skill matching
  # ... per agent
quality_warnings: []                 # skills that passed with warnings (stale, near size limit)
```

**Step 1:** Create the script with argument parsing and subcommand routing.

**Step 2:** Implement `loadSkillFrontmatter(filePath)` — reads a SKILL.md, extracts YAML frontmatter, validates required fields, returns metadata object or null.

**Step 3:** Implement `scanSkillSources(config)` — reads config.yaml `skills.sources`, scans each directory for `*.md` files, calls `loadSkillFrontmatter` on each, returns array of skill metadata objects with `tier` field set based on source directory (core/conditional = curated, .forgeplan/skills = project/learned).

**Step 4:** Implement `matchSkillsToAgent(agentName, skills, manifest, config)` — filters skills by `agent_filter`, `tech_filter`, `tier_filter`, applies config `explicit`/`disabled` lists, sorts by priority descending, caps at `max_active`. For each skill, set `hint` to `read_now` if tech_filter matches the current node type specifically, `reference` otherwise.

**Step 5:** Implement `generateRegistry(manifest, config, skillSources)` — calls `matchSkillsToAgent` for each agent, computes `manifest_hash`, writes `.forgeplan/skills-registry.yaml`.

**Step 6:** Implement `validate` subcommand — scans all skills, reports quality gate failures.

**Step 7:** Implement `compile-architect` subcommand — reads architect skills from skills/core/, extracts full content (not just frontmatter), compiles into a single markdown block with tier-aware sections, computes hash.

**Step 8:** Wire up CLI: `node skill-registry.js generate|refresh|validate|compile-architect`

**Step 9:** Verify: `node --check scripts/skill-registry.js`

**Step 10:** Commit: `git add scripts/skill-registry.js && git commit -m "feat(sprint11): skill-registry.js — registry engine with cascade, quality gate, compile-architect"`

---

### Task 2: Write First 10 Core Skills

Vendor/write the 10 highest-priority skills into `skills/core/`. Each is a SKILL.md with proper frontmatter. These are the foundation — every project uses at least 2-3 of them.

**Files:**
- Create: `skills/core/coding-standards.md`
- Create: `skills/core/backend-patterns.md`
- Create: `skills/core/tdd-workflow.md`
- Create: `skills/core/authentication-patterns.md`
- Create: `skills/core/owasp-security.md`
- Create: `skills/core/mastering-typescript.md`
- Create: `skills/core/react-best-practices.md`
- Create: `skills/core/api-contract-auditor.md`
- Create: `skills/core/deep-research.md`
- Create: `skills/core/code-review.md`

**For each skill:**
1. Research the source repo (listed in design doc skill map)
2. Extract the key patterns, rules, and examples
3. Write as a SKILL.md with proper frontmatter:
   ```yaml
   ---
   name: [skill-name]
   description: [one line]
   when_to_use: [when this skill is relevant]
   priority: 85
   source: [github-user/repo]
   validated_at: "2026-04-09"
   agent_filter: [builder, reviewer, etc.]
   tech_filter: [typescript, react, etc.]  # or empty for all
   tier_filter: [MEDIUM, LARGE]            # or empty for all
   ---
   ```
4. Keep under 5000 tokens (~150 lines max)
5. Focus on actionable rules and patterns, not theory

**Approach:** Dispatch parallel research agents to fetch and distill the source skills, then write them. This is the most parallelizable task in the sprint.

**Step 1:** Research and write skills 1-5 (builder + security focused): coding-standards, backend-patterns, tdd-workflow, authentication-patterns, owasp-security

**Step 2:** Research and write skills 6-10 (review + research focused): mastering-typescript, react-best-practices, api-contract-auditor, deep-research, code-review

**Step 3:** Run `node scripts/skill-registry.js validate` to verify all 10 pass quality gate

**Step 4:** Commit: `git add skills/core/*.md && git commit -m "feat(sprint11): first 10 curated core skills"`

---

### Task 3: Auto-Refresh Hooks

Wire skill registry staleness detection into session-start.js and pre-tool-use.js.

**Files:**
- Modify: `scripts/session-start.js` (~line 350, after wiki staleness check)
- Modify: `scripts/pre-tool-use.js` (~line 500, in the Bash whitelist section or a new section before agent dispatch)

**session-start.js addition (passive detection):**
After the wiki staleness check, add:
```javascript
// Skill registry staleness check
const registryPath = path.join(forgePlanDir, "skills-registry.yaml");
if (fs.existsSync(registryPath)) {
  try {
    const yaml = require(yamlPath);
    const registry = yaml.load(fs.readFileSync(registryPath, "utf-8"));
    const currentHash = hashManifestSkillInputs(manifest);
    if (registry.manifest_hash && registry.manifest_hash !== currentHash) {
      lines.push("  Skills: registry stale (manifest changed) — will auto-refresh on next build");
    }
  } catch {}
} else if (manifest && Object.keys(manifest.nodes || {}).length > 0) {
  lines.push("  Skills: no registry — run /forgeplan:skill refresh or it will auto-generate on next build");
}
```

The `hashManifestSkillInputs` function hashes `tech_stack` + node keys (same as skill-registry.js).

**pre-tool-use.js addition (active refresh):**
Before any agent dispatch (when the command is about to use the Agent tool), check registry freshness. If stale or missing, run `skill-registry.js refresh` synchronously.

**Step 1:** Add `hashManifestSkillInputs()` as a shared function (put in `scripts/lib/skill-helpers.js` or inline in both scripts).

**Step 2:** Add staleness warning to session-start.js `buildAmbientStatus()`.

**Step 3:** Add auto-refresh to pre-tool-use.js before agent dispatch.

**Step 4:** Verify: `node --check scripts/session-start.js && node --check scripts/pre-tool-use.js`

**Step 5:** Commit: `git add scripts/session-start.js scripts/pre-tool-use.js scripts/lib/skill-helpers.js && git commit -m "feat(sprint11): auto-refresh hooks for skill registry staleness"`

---

### Task 4: Wire `build.md` — Skill Loading for Builder

Update the build command to read the registry and include task-to-skill hints in the builder prompt.

**Files:**
- Modify: `commands/build.md` (add skill loading section after Phase Gate, before Pre-Build Spec Challenge)

**Addition to build.md:**
After the Phase Gate section, add a "Skill Loading" section:
```markdown
## Skill Loading (Sprint 11)

Before dispatching the Builder agent, load skills from the registry:

1. Read `.forgeplan/skills-registry.yaml`. If missing, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" refresh` first.
2. Look up `assignments.builder` — get the list of skill paths, names, descriptions, and hints.
3. Include in the Agent tool prompt for the Builder:
   - For each skill with `hint: read_now`: "READ NOW: [path] — [description]. Directly relevant to this node."
   - For each skill with `hint: reference`: "REFERENCE: [path] — [description]. Read if you need guidance on this topic."
4. The Builder agent reads full skill content via the Read tool during execution.
```

**Step 1:** Add the Skill Loading section to build.md.

**Step 2:** Commit: `git add commands/build.md && git commit -m "feat(sprint11): build.md — skill loading from registry with task-to-skill hints"`

---

### Task 5: Wire `sweep.md` — Skill Loading for Sweep Agents

Same pattern as build.md but for the 5 sweep agents dispatched in parallel.

**Files:**
- Modify: `commands/sweep.md` (add skill loading to Phase 2 dispatch, after agent selection)

**Addition to sweep.md Phase 2:**
After the tier-aware agent selection but before dispatching:
```markdown
**Skill loading (Sprint 11):** Before dispatching each agent, read `.forgeplan/skills-registry.yaml` and look up `assignments.[agent-name]`. Include skill metadata (paths + hints) in each agent's dispatch prompt. Each agent reads full skill content on-demand during execution.
```

**Step 1:** Add skill loading instruction to sweep.md Phase 2.

**Step 2:** Commit: `git add commands/sweep.md && git commit -m "feat(sprint11): sweep.md — skill loading from registry for sweep agents"`

---

## Batch 2: Full Skill Set + Wiring

### Task 6: Write Remaining 18 Curated + 5 Conditional Skills

Same process as Task 2 for the remaining skills.

**Files:**
- Create: 18 more files in `skills/core/` (see design doc skill map for full list)
- Create: 5 files in `skills/conditional/` (supabase-postgres, better-auth, web-design-guidelines, frontend-patterns, mastering-typescript-conditional)

**Step 1:** Research and write sweep agent skills (sharp-edges, secure-code-review, api-contract-auditor-sweep, layer-boundary-auditor, simplify, differential-review, code-review-sweep, web-interface-guidelines, accesslint, tdd-workflow-sweep)

**Step 2:** Research and write reviewer + researcher skills (code-review-skill, code-review-graph, confidence-scoring, deep-research-skill, managing-dependencies, pattern-extraction)

**Step 3:** Research and write architect skills (ddd-strategic-design, design-patterns, database-designer, api-designer)

**Step 4:** Write 5 conditional skills (supabase-postgres, better-auth, web-design-guidelines, frontend-patterns, composition-patterns)

**Step 5:** Run `node scripts/skill-registry.js validate` — all skills must pass

**Step 6:** Commit: `git add skills/ && git commit -m "feat(sprint11): full skill set — 28 core + 5 conditional"`

---

### Task 7: Compile Architect Skills

Run the compile-architect subcommand and embed the output in architect.md.

**Files:**
- Modify: `agents/architect.md` (add compiled skill sections with tier-aware gating)

**Step 1:** Run `node scripts/skill-registry.js compile-architect` — generates the compiled block.

**Step 2:** Add the compiled block to architect.md after the existing Phase 5 section, with a `<!-- compiled_from_hash: [hash] -->` comment.

**Step 3:** Commit: `git add agents/architect.md && git commit -m "feat(sprint11): architect — compiled tier-aware skill sections"`

---

### Task 8: Wire `discover.md` — Generate Registry After Manifest

Update discover to call `skill-registry.js generate` after writing the manifest.

**Files:**
- Modify: `commands/discover.md` (add registry generation after manifest validation)

**Step 1:** After the manifest validation step in discover.md, add: "Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" generate` to create the skill registry for this project."

**Step 2:** Do the same in `commands/greenfield.md` Step 1 (after discover completes).

**Step 3:** Commit: `git add commands/discover.md commands/greenfield.md && git commit -m "feat(sprint11): discover/greenfield — generate skill registry after manifest"`

---

### Task 9: Wire `review.md` — Skill Loading for Reviewer

Same pattern as build.md.

**Files:**
- Modify: `commands/review.md`

**Step 1:** Add skill loading section to review.md (read registry, look up `assignments.reviewer`, include hints in reviewer prompt).

**Step 2:** Commit: `git add commands/review.md && git commit -m "feat(sprint11): review.md — skill loading from registry"`

---

### Task 10: Add Skill Metadata to All 10 Agent Prompts

Each agent .md file gets a note about available skills (not embedded content — just awareness that skills exist and how to read them).

**Files:**
- Modify: all 10 agent .md files (builder, reviewer, researcher, 5 sweep, architect note)

**Addition to each agent (except architect):**
```markdown
## Skills (Sprint 11)

You may receive skill assignments from the orchestrator. Skills are domain-specific instruction sets that enhance your capabilities. When provided:
- **READ NOW** skills: read the full content from the given path before starting work
- **REFERENCE** skills: read only if you encounter a relevant question during execution
- If no skills are provided, work normally — skills are supplementary, not required
```

**Step 1:** Add the skills section to all 10 agents.

**Step 2:** Commit: `git add agents/*.md && git commit -m "feat(sprint11): all agents — skill awareness section"`

---

### Task 11: Add `/forgeplan:skill` Command

The skill management command.

**Files:**
- Create: `commands/skill.md`

**Subcommands:**
- `list` — show all available skills, their assignments, and quality status
- `refresh` — re-run `skill-registry.js refresh`
- `install [path]` — add a skill to `.forgeplan/skills/` and refresh registry
- `validate` — run quality gate on all skills

(The `review`, `approve`, `promote` subcommands are stretch — learner module dependency.)

**Step 1:** Write `commands/skill.md` with the must-ship subcommands.

**Step 2:** Update `commands/help.md` to include the new command.

**Step 3:** Commit: `git add commands/skill.md commands/help.md && git commit -m "feat(sprint11): /forgeplan:skill command — list, refresh, install, validate"`

---

## Verification

After all tasks complete:

1. Run `node --check` on all modified scripts
2. Run `node scripts/skill-registry.js validate` — all skills pass quality gate
3. Run `node scripts/skill-registry.js generate` on a test manifest — produces valid registry
4. Verify session-start.js detects stale/missing registry
5. Verify build.md, sweep.md, review.md reference registry correctly
6. Run internal 5-agent sweep on all changes

---

## Commit Strategy

One commit per task (11 total for must-ship). Each commit is independently valid — no half-wired states.
