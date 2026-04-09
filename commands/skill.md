---
description: Manage ForgePlan skills — list assignments, refresh registry, install new skills, validate quality. Skills enhance agent capabilities with domain-specific patterns.
user-invocable: true
argument-hint: "[list | refresh | install <path-or-url> | validate]"
allowed-tools: Read Write Edit Bash Glob Grep WebFetch
---

# Skill Management

## Subcommands

### `/forgeplan:skill list`

Show all available skills and their agent assignments.

1. Read `.forgeplan/skills-registry.yaml`
2. If registry missing: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" generate` first
3. Display:
```
=== Skill Registry ===
Generated: [timestamp] | Manifest hash: [hash]

Builder (3 skills):
  [*] coding-standards (priority 85, curated) — READ NOW
  [*] backend-patterns (priority 85, curated) — READ NOW
  [ ] tdd-workflow (priority 85, curated) — REFERENCE

Sweep-Adversary (2 skills):
  [*] owasp-security (priority 90, curated) — READ NOW
  [ ] sharp-edges (priority 85, curated) — REFERENCE
...

Quality: 30 skills validated, 0 warnings
```

### `/forgeplan:skill refresh`

Re-evaluate all skills against the current manifest and regenerate the registry.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" refresh
```

Show before/after diff: "Registry refreshed. [N] assignments changed."

### `/forgeplan:skill install <path-or-url>`

Add a skill from a local file path or a URL to the project's skill directory.

**Local file path:**

1. Create `.forgeplan/skills/` directory if it doesn't exist: `mkdir -p .forgeplan/skills/`
2. Copy the SKILL.md file to `.forgeplan/skills/`
3. Run quality validation: `node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" validate`
4. If validation passes: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" refresh`
5. If validation fails: remove the file and report errors
6. Show: "Installed [name] (priority [N]). Assigned to: [agent list]"

**URL (https://...):**

1. Detect URL: argument starts with `https://` or `http://`
2. Use WebFetch to download the content from the URL
3. Validate the downloaded content:
   - Must contain YAML frontmatter (content between `---` delimiters at the start)
   - Frontmatter must include required fields: `name`, `description`, `when_to_use`
   - If frontmatter is missing or invalid: abort with error "Downloaded content is not a valid SKILL.md — must have YAML frontmatter with name, description, and when_to_use fields."
4. Extract the skill name from frontmatter `name` field. Sanitize for filesystem: replace non-alphanumeric chars (except hyphens) with hyphens, lowercase, trim to 64 chars
5. Create `.forgeplan/skills/` directory if it doesn't exist: `mkdir -p .forgeplan/skills/`
6. Write the content to `.forgeplan/skills/[sanitized-name].md`
7. Run quality validation: `node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" validate`
8. If validation passes: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" refresh`
9. If validation fails: remove the file and report errors
10. Show: "Installed [name] from URL. Assigned to: [agent list]"

### `/forgeplan:skill validate`

Check all skills pass quality gates.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" validate
```

Show results: passed, failed, warnings.
