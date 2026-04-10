---
description: Validate the manifest and specs for cycles, scope overlaps, and consistency.
argument-hint: "[manifest|spec <node-id>|all]"
disable-model-invocation: true
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

## Remediation Guidance

After presenting results, if any validation failed, suggest the specific fix for each failure type:

- **Circular dependencies:** "Nodes form a dependency cycle that prevents build ordering."
  - Edit `.forgeplan/manifest.yaml` to break the cycle by removing or redirecting a `depends_on` entry
  - `/forgeplan:discover` to re-architect the dependency graph
- **Orphan nodes:** "Node exists in manifest but has no connections to other nodes."
  - Add appropriate `depends_on` or interface connections in the manifest
  - Or remove the node if it's no longer needed
- **Scope overlaps:** "Two or more nodes claim the same file paths in their `file_scope`."
  - Edit `.forgeplan/manifest.yaml` to give each node a distinct `file_scope`
  - `/forgeplan:revise [node-id]` to update the overlapping node's scope
- **Missing required fields (spec):** "Spec is missing required fields like acceptance_criteria, non_goals, or failure_modes."
  - `/forgeplan:spec [node-id]` to regenerate or complete the spec
- **Manifest/spec mismatch:** "Spec references nodes, models, or fields not in the manifest."
  - `/forgeplan:spec [node-id]` to regenerate the spec from current manifest
  - Edit the manifest to add the missing entries

If all validations pass:
- `/forgeplan:next` to see what to do next
- `/forgeplan:status` for a full project overview
