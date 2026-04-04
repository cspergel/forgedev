---
description: Run cross-node interface verification. Checks that all node interfaces are correctly implemented on both sides and identifies which side is at fault for any mismatches.
user-invocable: true
allowed-tools: Read Glob Grep Bash
---

# Integration Check

Verify all cross-node interfaces are correctly implemented.

## Prerequisites

- All nodes should be in "built" or "reviewed" status for a complete check
- Can run partial checks on completed nodes

## Process

For each interface defined in any node's spec:

1. Read the interface contract from the source node's spec
2. Read the corresponding interface from the target node's spec
3. Verify both sides implement the contract:
   - Does the source node export what it claims?
   - Does the target node import and use it correctly?
   - Do the data types match (especially shared model usage)?
   - Is the directional type (read/write, outbound, inbound) respected?

4. For each mismatch, identify the fault side:
   - **Source fault** — the source doesn't export what its spec promises
   - **Target fault** — the target doesn't import correctly
   - **Spec fault** — the specs disagree on the contract
   - **Both** — neither side implements the contract

## Output

```
=== Integration Report ===

[PASS] auth → database: User persistence via Supabase Auth
[PASS] auth → api: JWT token injection for protected routes
[FAIL] auth → frontend-login: Auth context with login/logout/register
       Fault: TARGET — frontend-login does not import AuthContext from auth module
       Fix: Update frontend-login to import { AuthContext } from 'src/auth/context'

Summary: [passed]/[total] interfaces verified
Recommendation: [PASS | FAIL with remediation steps]
```
