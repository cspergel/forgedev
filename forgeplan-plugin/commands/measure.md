---
description: How clean is my code? Counts broken references, duplicate type definitions, and abandoned stubs. Shows a quality score you can track over time.
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
