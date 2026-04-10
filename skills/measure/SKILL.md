---
name: measure
description: Measure broken refs, duplicate types, and stub debt.
disable-model-invocation: true
---

# Measure Quality

Run the quality measurement script and present the results.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/measure-quality.js"
```

Parse the JSON output and present to the user:

```
=== Quality Report ===

Broken References: [count]
[details if any]

Duplicate Types: [count]
[details if any]

Abandoned Stubs: [count]
[details if any]

Total Issues: [total]
```

If a previous report exists at `.forgeplan/quality-report.json`, compare against it and show the delta.

## Remediation Guidance

After presenting the report, if there are any issues (total > 0), suggest specific remediation:

- **Broken References:** "These imports or references point to files/symbols that don't exist."
  - `/forgeplan:sweep` to find and fix cross-cutting reference issues automatically
  - `/forgeplan:regen-types` if broken references involve shared model types
  - `/forgeplan:build [node-id]` to rebuild specific nodes with broken references
- **Duplicate Types:** "The same type is defined in multiple places instead of using the shared model."
  - `/forgeplan:regen-types` to regenerate canonical shared types from the manifest
  - `/forgeplan:sweep` to detect and consolidate duplicated definitions
- **Abandoned Stubs:** "Functions or classes that are declared but have no implementation."
  - `/forgeplan:review [node-id]` to identify which acceptance criteria are incomplete
  - `/forgeplan:build [node-id]` to rebuild the node with stub implementations filled in

If total issues is 0, suggest:
- `/forgeplan:status` for a full project overview
- `/forgeplan:guide` for guidance on next steps
