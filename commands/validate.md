---
description: Is my architecture valid? Checks the manifest for circular dependencies, orphan nodes, and scope overlaps. Validates specs for required fields and consistency with the manifest.
user-invocable: true
argument-hint: "[manifest | spec node-id | all]"
allowed-tools: Read Bash
---

# Validate

Run validation checks on the project's manifest and specs.

**Target:** $ARGUMENTS

## manifest (or no argument)
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.js" .forgeplan/manifest.yaml
```

## spec [node-id]
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.js" .forgeplan/specs/$1.yaml .forgeplan/manifest.yaml
```

## all
Run manifest validation, then validate every spec in `.forgeplan/specs/`:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.js" .forgeplan/manifest.yaml
```
Then for each `.yaml` file in `.forgeplan/specs/`:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.js" [spec-path] .forgeplan/manifest.yaml
```

Present results as a table showing PASS/FAIL per item.
