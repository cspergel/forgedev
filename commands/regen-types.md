---
description: Rebuild the shared TypeScript types from your manifest. Run this after changing shared model fields to keep the type definitions in sync.
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

## After Regeneration

After presenting the regeneration result, warn:

```
Note: Nodes that import these shared types may need rebuilding to use the updated fields.
```

Suggest:
- `/forgeplan:affected [ModelName]` to see which nodes use the changed model
- `/forgeplan:build [node-id]` to rebuild affected nodes
- `/forgeplan:integrate` to verify cross-node interfaces still connect correctly
