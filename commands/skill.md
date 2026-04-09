---
description: Manage ForgePlan skills — list assignments, refresh registry, install new skills, validate quality. Skills enhance agent capabilities with domain-specific patterns.
user-invocable: true
argument-hint: "[list | refresh | install <path> | validate]"
allowed-tools: Read Write Edit Bash Glob Grep
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

### `/forgeplan:skill install <path>`

Add a skill from a file path or URL to the project's skill directory.

1. Copy the SKILL.md file to `.forgeplan/skills/`
2. Run quality validation: `node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" validate`
3. If validation passes: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" refresh`
4. If validation fails: remove the file and report errors
5. Show: "Installed [name] (priority [N]). Assigned to: [agent list]"

### `/forgeplan:skill validate`

Check all skills pass quality gates.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/skill-registry.js" validate
```

Show results: passed, failed, warnings.
