---
description: Regenerate src/shared/types/index.ts from the manifest's shared_models. Deterministic — no LLM needed.
user-invocable: true
allowed-tools: Read Bash
---

# Regenerate Shared Types

Regenerate the canonical shared types file from the manifest.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/regenerate-shared-types.js"
```

Parse the JSON output and present:

```
=== Shared Types Regenerated ===
Models: [list]
Fields: [total count]
Output: src/shared/types/index.ts
```

This should be run after modifying shared_models in the manifest (e.g., after adding a field via `/forgeplan:revise --model`).
