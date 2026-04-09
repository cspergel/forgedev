---
name: simplify
description: POLA enforcement, function size limits, AI bloat detection, simplicity-first code quality
when_to_use: During structural sweeps to identify unnecessary complexity, bloat, and violations of least astonishment
priority: 80
source: Anthropic
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [sweep-structuralist]
tech_filter: []
---

# Simplify + Simplicity Principles

## Principle of Least Astonishment (POLA)

Code should do what a reader expects from reading the name and signature. Every violation is a finding.

### POLA Checklist
- [ ] Function names describe their ONLY effect — no hidden side effects
- [ ] `getX()` is pure (no writes, no mutations, no network calls)
- [ ] `setX()` sets X and nothing else
- [ ] Boolean functions (`isX`, `hasX`, `canX`) return only true/false, no side effects
- [ ] Constructor does initialization only — no async work, no I/O, no business logic
- [ ] Default parameter values are safe and unsurprising (empty string, zero, empty array)
- [ ] Error handling follows the type system — thrown errors match documented types

### Naming Violations
- `handleClick` that also saves to database and sends analytics
- `validateInput` that also transforms the data
- `getUser` that creates a user if not found
- `utils.ts` or `helpers.ts` (dumping ground — decompose by purpose)

## Function Size Limits

| Metric | Limit | Action |
|--------|-------|--------|
| Lines per function | 40 | MEDIUM: extract helper |
| Parameters per function | 4 | MEDIUM: use options object |
| Cyclomatic complexity | 10 | HIGH: decompose into strategies |
| Nesting depth | 3 | MEDIUM: early return / guard clause |
| Lines per file | 300 | MEDIUM: split by responsibility |
| Exports per file | 5 | LOW: consider splitting module |

### How to Measure
1. Count lines between function open/close braces (exclude blank lines and comments)
2. Count `if`, `else`, `for`, `while`, `case`, `catch`, `&&`, `||`, `?:` for cyclomatic complexity
3. Count indentation levels for nesting depth

## AI Bloat Detection

AI-generated code has specific bloat signatures. Flag these patterns:

### Unnecessary Abstraction
- [ ] Single-implementation interfaces (interface + one class = just use the class)
- [ ] Abstract base classes with one child
- [ ] Factory functions that always return the same type
- [ ] Strategy pattern with one strategy
- [ ] Wrapper functions that just call through to another function with identical signature
- [ ] `BaseService` / `AbstractRepository` used by exactly one concrete class

### Overengineering Signals
- [ ] Generic types used in only one place (`Repository<T>` but only `Repository<User>` exists)
- [ ] Event emitters with one listener
- [ ] Plugin systems with no plugins
- [ ] Configuration objects for non-configurable things
- [ ] `options` parameter where every caller passes the same values

### Verbose Patterns
- [ ] Try/catch that just re-throws (no transformation, no logging)
- [ ] Null checks on values that cannot be null (TypeScript strict mode proves it)
- [ ] Type assertions that the compiler already infers
- [ ] Comments restating the code (`// increment counter` above `counter++`)
- [ ] Empty catch blocks or `catch (e) { throw e; }`

### Copy-Paste Signatures
- [ ] Two functions with >80% identical bodies — extract shared logic
- [ ] Repeated error handling blocks — create error handler middleware
- [ ] Identical validation logic in multiple routes — extract validator

## Simplification Techniques

### Guard Clauses Over Nesting
```typescript
// BAD: deep nesting
function process(user) {
  if (user) {
    if (user.isActive) {
      if (user.hasPermission) {
        return doWork(user);
      }
    }
  }
  return null;
}

// GOOD: guard clauses
function process(user) {
  if (!user) return null;
  if (!user.isActive) return null;
  if (!user.hasPermission) return null;
  return doWork(user);
}
```

### Composition Over Inheritance
- Prefer functions that compose over class hierarchies
- Prefer `pipe(a, b, c)` over `class C extends B extends A`
- Mixins and HOCs are last resort, not first tool

### Delete Before Refactor
- Dead code: delete it, git has history
- Unused imports: delete them
- Commented-out code: delete it
- TODO without ticket: create ticket or delete

## Severity Guide

| Finding | Severity |
|---------|----------|
| Hidden side effects in getter/pure function | HIGH |
| Function over 80 lines | HIGH |
| Cyclomatic complexity over 15 | HIGH |
| Single-use abstraction layer | MEDIUM |
| AI-generated wrapper with no added value | MEDIUM |
| Function over 40 lines | MEDIUM |
| Copy-paste code block (2+ instances) | MEDIUM |
| Nesting depth over 3 | LOW |
| Missing guard clause (deep nesting instead) | LOW |
