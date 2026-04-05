---
description: Measure code quality — count broken references, duplicate types, and abandoned stubs. Used to compare ForgePlan builds against vanilla builds.
user-invocable: true
allowed-tools: Read Bash
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
