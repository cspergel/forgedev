---
name: code-review
description: 4-phase review process, severity taxonomy, 280+ structured checks across security, correctness, contracts, and maintainability
when_to_use: During spec-diff audits, sweep reviews, and code quality assessments
priority: 85
source: awesome-skills
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [reviewer, sweep-skeptic]
tech_filter: []
---

# Code Review

## 4-Phase Review Process

Execute all phases in order. Each phase produces findings before the next begins.

### Phase 1: Structural Scan (30 seconds)
Quick pass — what changed, what's the shape:
- File count and change size (additions/deletions)
- New dependencies added
- New files vs modified files
- Config changes (env, build, CI)
- Schema or migration changes

**Output:** Change summary with risk areas flagged for deep review.

### Phase 2: Contract Verification
Check every interface boundary:
- [ ] Function signatures match their callers
- [ ] API request/response types match both sides
- [ ] Shared model imports — not local redefinitions
- [ ] Database schema matches ORM/query expectations
- [ ] Environment variables used are documented and have defaults
- [ ] Error types match catch handlers

**Find it:** Trace data flow from entry point through each layer. Every type transition is a potential mismatch.

### Phase 3: Logic and Correctness
Line-by-line review of business logic:
- [ ] Edge cases: null, undefined, empty string, empty array, zero, negative
- [ ] Boundary conditions: off-by-one, inclusive vs exclusive ranges
- [ ] Async correctness: awaited promises, error propagation, race conditions
- [ ] State transitions: every state reachable, no dead states, no invalid transitions
- [ ] Math: integer overflow, floating-point comparison, division by zero
- [ ] String handling: encoding, locale, case sensitivity, Unicode

### Phase 4: Quality and Maintainability
Patterns and long-term health:
- [ ] Functions under 40 lines, files under 300 lines
- [ ] No commented-out code (delete it, git has history)
- [ ] No TODO without a tracking reference
- [ ] Test coverage for new logic (not just happy path)
- [ ] Error messages are actionable (what happened, what to do)
- [ ] Naming: functions say what they do, variables say what they hold

## Severity Taxonomy

Every finding MUST have exactly one severity:

| Severity | Meaning | Action |
|----------|---------|--------|
| CRITICAL | Blocks merge. Security vulnerability, data loss, crash in production. | Must fix before merge. |
| HIGH | Likely bug or contract violation. Will cause issues in production. | Fix before merge unless explicitly deferred. |
| MEDIUM | Code smell, missing edge case, weak test. Won't crash but degrades quality. | Fix in this PR or create tracked issue. |
| LOW | Style, naming, minor improvement. No functional impact. | Author's discretion. |
| NIT | Suggestion only. Alternative approach, readability tweak. | Ignore freely. |

**Rules:**
- Never inflate severity to get attention. CRITICAL means production impact.
- Every CRITICAL/HIGH must cite specific code and explain the failure scenario.
- Group related findings — 5 findings about the same pattern = 1 finding with examples.

## Structured Check Categories

### Security (45 checks)
- Input validation at every boundary
- Output encoding for context (HTML, SQL, shell)
- Auth on every endpoint, authz on every resource access
- No secrets in code, logs, or error messages
- Dependency audit (known CVEs)

### Correctness (80 checks)
- Null/undefined handling on every optional field
- Promise chains: no unhandled rejections, no fire-and-forget
- Loop invariants: termination guaranteed, no infinite loops
- Regex: anchored, no catastrophic backtracking
- Date/time: timezone-aware, no naive comparisons

### Contracts (65 checks)
- Request/response shape matches spec
- Error responses follow consistent schema
- Pagination: cursor-based for large sets, offset-based only if stable
- Status codes: 201 for create, 204 for delete, 404 vs 403 correct
- Headers: Content-Type, Cache-Control, CORS set correctly

### Maintainability (50 checks)
- Single responsibility per function and module
- Dependencies flow one direction (no circular imports)
- Configuration externalized (no hardcoded URLs, ports, limits)
- Logging: structured, leveled, no sensitive data
- Tests: arrange-act-assert, one assertion concept per test

### Performance (40 checks)
- N+1 queries: loops with DB calls inside
- Unbounded queries: missing LIMIT, no pagination
- Memory: large arrays built in memory vs streaming
- Caching: repeated identical computations or fetches
- Bundle size: unnecessary imports, missing tree-shaking

## Review Output Format

```markdown
## [SEVERITY] Title — file:line

**What:** Description of the issue.
**Why:** Impact if not fixed.
**Fix:** Concrete suggestion with code.
```

**Rules for output:**
- One finding per issue. Don't bundle unrelated problems.
- Always include file path and line number.
- Always suggest a fix, not just flag the problem.
- If unsure, say "Potential issue" and explain the condition under which it's a bug.
- Praise good patterns briefly — reinforces what to keep doing.
