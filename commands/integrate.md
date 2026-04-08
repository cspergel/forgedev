---
description: Do all the pieces fit together? Verifies that every node's interfaces connect correctly, shared models are consistent, and identifies exactly what's broken if something doesn't match.
user-invocable: true
allowed-tools: Read Glob Grep Bash
---

# Integration Check

Verify all cross-node interfaces are correctly implemented.

## Process

0. **Prerequisite:** Read `.forgeplan/state.json`. If any node has `status: "sweeping"`, STOP:
   ```
   Cannot run integration check — node "[node-id]" is currently being fixed by the sweep.
   Wait for the sweep fix to complete, or run /forgeplan:recover to abort the sweep.
   ```

1. Run the deterministic integration checker:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/integrate-check.js"
```

2. Parse the JSON output and present results to the user.

## Cross-Phase Integration Mode (Sprint 10B)

When invoked during phase advancement (by deep-build.md Phase Advancement step 3), run in **cross-phase mode**:

1. Read `build_phase` from manifest. Identify nodes being promoted (phase == build_phase + 1).
2. For each promoted node's interfaces: verify that the `target_node` in the current phase has the expected export/contract.
3. For each current-phase node that `connects_to` a promoted node: verify the promoted node's interface-only spec matches what the current-phase code imports.
4. Report: which cross-phase interfaces are satisfied, which have mismatches.

This is distinct from the standard same-phase integration check — it specifically validates the handoff between phases before advancement proceeds.

3. For any FAIL or WARN results, perform deeper LLM-assisted analysis:
   - Read the actual implementation files for both sides of the interface
   - Verify the source node exports what its spec promises
   - Verify the target node imports and uses it correctly
   - Check shared model types match between nodes

## Output Formatting

Based on the JSON `verdict` field:

### verdict: "PASS"
```
=== Integration Report ===
All [total] interfaces verified.
[list each with PASS status and brief detail]
```

### verdict: "PASS_WITH_WARNINGS"
```
=== Integration Report ===
[passed] passed, [warned] warnings.
[list PASS interfaces]
[list WARN interfaces with remediation]
```

### verdict: "FAIL"
```
=== Integration Report ===
[failed] FAILED, [passed] passed, [pending] pending.

FAILURES:
[For each FAIL]:
  [source] → [target] ([type]): FAIL
  Contract: [contract]
  Fault: [SOURCE | TARGET | SPEC | BOTH]
  Detail: [what's wrong]
  Fix: [specific remediation]
```

### verdict: "INCOMPLETE"
```
=== Integration Report ===
Cannot fully verify — [pending] interface(s) pending (nodes not yet built).
[list pending interfaces]
[list verified interfaces]
```

## After Integration

If all interfaces pass, suggest:
- `/forgeplan:status` — full project overview
- `/forgeplan:measure` — quality metrics (broken refs, duplicates, stubs)
- `/forgeplan:revise --model [ModelName]` — if you need to change a shared model (e.g., add a field to User), this cascades the change to all affected nodes
- `/forgeplan:revise [node-id]` — if you need to change a single node's spec or interfaces
- The project is ready for deployment or further testing

If interfaces fail, suggest specific remediation for each failure based on the fault side:

- **Fault: SOURCE** — "The source node doesn't export what the spec promises."
  - `/forgeplan:build [source-node-id]` to rebuild the source node
  - `/forgeplan:review [source-node-id]` to audit the source implementation
- **Fault: TARGET** — "The target node doesn't correctly import or use the interface."
  - `/forgeplan:build [target-node-id]` to rebuild the target node
  - `/forgeplan:review [target-node-id]` to audit the target implementation
- **Fault: SPEC** — "The interface contract in the spec doesn't match reality on either side."
  - `/forgeplan:revise [node-id]` to update the spec's interface definition
  - `/forgeplan:spec [node-id]` to regenerate the spec if contracts are significantly wrong
- **Fault: BOTH** — "Neither side has implemented the interface."
  - `/forgeplan:build [source-node-id]` and `/forgeplan:build [target-node-id]` — both nodes need building
  - `/forgeplan:next` to see the recommended build order
- **Fault: MISSING_SPEC** — "One or both nodes don't have specs yet."
  - `/forgeplan:spec [node-id]` to generate the missing spec
