---
name: code-review-graph
description: Tree-sitter knowledge graph for token reduction on reviews, structural code analysis, targeted review strategy
when_to_use: During code review to build structural understanding efficiently and focus review on high-risk areas
priority: 80
source: tirth8205
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [reviewer]
tech_filter: []
---

# Code Review Graph

## Purpose

Build a structural knowledge graph of the code BEFORE reading line-by-line. This reduces token usage by 6-8x because you understand the architecture first and only deep-read the risky parts.

## Phase 1: Build the Graph

### Extract Nodes (functions, classes, types)
For each file in the review scope, extract:

```
Node: {
  name: string           // function/class/type name
  kind: "function" | "class" | "type" | "interface" | "route" | "component"
  file: string           // file path
  line: number           // start line
  exports: boolean       // is it exported?
  params: string[]       // parameter names + types
  returns: string        // return type
  complexity: number     // branch count estimate
}
```

### Extract Edges (calls, imports, implements)
For each node, identify:

```
Edge: {
  from: string          // caller/importer
  to: string            // callee/imported
  kind: "calls" | "imports" | "implements" | "extends" | "uses-type"
  file: string
  line: number
}
```

### Build the Adjacency
Group by file, then by relationship:

```
auth.service.ts:
  exports: [login, register, validateToken, refreshSession]
  calls: [userRepository.findByEmail, bcrypt.compare, jwt.sign]
  used-by: [auth.controller.ts, middleware/auth.ts]

auth.controller.ts:
  exports: [authRouter]
  calls: [authService.login, authService.register]
  used-by: [app.ts]
```

## Phase 2: Identify Review Targets

### Risk Scoring
Score each node 0-100 based on:

| Factor | Weight | Scoring |
|--------|--------|---------|
| Complexity (branches) | 30% | 0-5: 20, 6-10: 50, 11-15: 80, 16+: 100 |
| Fan-in (number of callers) | 25% | 1: 20, 2-3: 40, 4-6: 70, 7+: 100 |
| Fan-out (number of callees) | 15% | 1-2: 20, 3-5: 50, 6+: 80 |
| Boundary crossing | 20% | Internal: 0, Module boundary: 50, API/DB: 100 |
| Changed in diff | 10% | Unchanged: 0, Modified: 80, New: 100 |

### Review Priority
- **Score > 70:** Deep line-by-line review. Read full function body.
- **Score 40-70:** Targeted review. Read signature, check edge cases, verify contracts.
- **Score < 40:** Skim. Check naming, verify types, move on.

## Phase 3: Targeted Review

### High-Risk Patterns in the Graph

| Pattern | Risk | What to Check |
|---------|------|--------------|
| High fan-in node | Breaking change blast radius | All callers handle new behavior |
| High fan-out node | Coordination complexity | Error handling for each dependency |
| Cycle in graph | Circular dependency | Extract shared interface |
| Orphan node (no callers) | Dead code | Confirm it's used (entry point, test, CLI) |
| Long call chain (>4 hops) | Data corruption risk | Type preservation through chain |
| Hub node (high fan-in + fan-out) | God object | Should this be split? |

### Boundary Review (always deep-read)
Every edge that crosses a module boundary is a potential contract violation:

- [ ] Types match on both sides of the call
- [ ] Error types are handled by the caller
- [ ] Null/undefined from callee is handled by caller
- [ ] Shared types are imported, not redefined
- [ ] Async boundaries have proper await

## Phase 4: Summarize Efficiently

### Token-Efficient Review Output
Instead of quoting entire files, reference the graph:

```markdown
## [HIGH] auth.service.login — Missing error handling for DB timeout

**Graph context:** login (fan-in: 3, complexity: 12) calls userRepository.findByEmail
**Issue:** findByEmail can throw on DB timeout, but login's catch block only handles AuthError
**Impact:** Unhandled rejection crashes the auth controller (3 callers affected)
**Fix:** Add catch for DatabaseError, return 503
```

### What to Skip (Token Savings)
- Boilerplate code that matches known patterns (standard Express middleware, React component structure)
- Import blocks (validated by TypeScript compiler)
- Test descriptions (only audit test assertions)
- Config files with no logic (just key-value)
- Generated files (types from schema, routes from codegen)

## Severity Guide

| Finding | Severity |
|---------|----------|
| Hub node with >10 fan-in (God object) | HIGH |
| Circular dependency in graph | HIGH |
| Boundary call with mismatched types | HIGH |
| Dead code (orphan, no callers, not entry point) | MEDIUM |
| Long call chain without error handling | MEDIUM |
| Missing type at module boundary | MEDIUM |
| Low-risk node over-reviewed (token waste) | LOW — process note |
