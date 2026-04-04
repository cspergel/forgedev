---
description: Run cross-node interface verification. Checks that all node interfaces are correctly implemented on both sides and identifies which side is at fault for any mismatches.
user-invocable: true
allowed-tools: Read Glob Grep Bash
---

# Integration Check

Verify all cross-node interfaces are correctly implemented.

## Process

1. Run the deterministic integration checker:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/integrate-check.js"
```

2. Parse the JSON output and present results to the user.

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
- Running `/forgeplan:status` for a full project overview
- The project is ready for deployment or further testing

If interfaces fail, suggest specific remediation for each failure based on the fault side.
