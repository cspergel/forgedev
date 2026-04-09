---
name: sharp-edges
description: Algorithm footguns, fail-secure analysis, configuration cliffs, insecure defaults detection
when_to_use: During adversarial sweeps to find subtle security pitfalls that pass standard checks
priority: 85
source: Trail of Bits
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [sweep-adversary]
tech_filter: []
---

# Sharp Edges + Insecure Defaults

## Algorithm Footguns

### Timing Attacks
- [ ] String comparison of secrets uses constant-time (`crypto.timingSafeEqual`, not `===`)
- [ ] Token lookup is hash-based, not sequential scan
- [ ] No early-return on partial password match

### Randomness
- [ ] Cryptographic tokens use `crypto.randomBytes` or `crypto.randomUUID`, never `Math.random()`
- [ ] Session IDs have >= 128 bits of entropy
- [ ] No predictable seeds in any security-relevant PRNG

### Floating Point
- [ ] Money calculations use integer cents or Decimal library, never `float`
- [ ] No equality comparison on floats in business logic
- [ ] Rounding mode is explicit for financial calculations

### Regular Expressions
- [ ] No ReDoS-vulnerable patterns (nested quantifiers, overlapping alternation)
- [ ] User-supplied regex is rejected or sandboxed with timeout
- [ ] Validate with `safe-regex` or equivalent before compilation

## Fail-Secure Analysis

For every security-relevant operation, verify the failure mode:

| Operation | Fail-OPEN (BAD) | Fail-CLOSED (GOOD) |
|-----------|-----------------|---------------------|
| Auth middleware error | Request proceeds | Request denied (403) |
| Rate limiter crash | No limiting | Block all (or degrade) |
| Input validation throw | Raw input used | Request rejected |
| Permission check timeout | Access granted | Access denied |
| Certificate validation error | Connection proceeds | Connection refused |
| Feature flag service down | All features enabled | Minimum feature set |

### How to Audit
1. Find every `try/catch` around security code
2. Check: does the `catch` block deny or allow?
3. Find every `.catch()` on auth/permission promises — same question
4. Search for `|| true`, `?? true`, `|| 'allow'` near auth logic

## Configuration Cliffs

### Environment Variable Traps
- [ ] Missing env var causes startup crash, not silent fallback to insecure default
- [ ] `NODE_ENV` is not the sole auth gate (no `if (NODE_ENV !== 'production') skipAuth()`)
- [ ] Debug flags cannot be enabled via query params or headers in production
- [ ] CORS origin is not set from env var without validation

### Default Value Dangers
- [ ] No default passwords, API keys, or JWT secrets in code
- [ ] Session timeout has a maximum, not just a default
- [ ] File upload limits have sane defaults (not unlimited)
- [ ] Database connection pooling has max limit set

### Deployment Drift
- [ ] `.env.example` documents every required variable
- [ ] Missing required config fails fast with clear error message
- [ ] No `|| 'development'` fallback for `NODE_ENV`
- [ ] SSL/TLS is not optional based on environment

## Detection Commands

```bash
# Timing attack: non-constant string compare on secrets
grep -rn "=== .*token\|=== .*secret\|=== .*password\|=== .*key" --include="*.ts" --include="*.js"

# Insecure randomness
grep -rn "Math.random()" --include="*.ts" --include="*.js"

# Fail-open catch blocks
grep -rn "catch.*{" -A2 --include="*.ts" | grep -i "return true\|allow\|next()\|continue"

# Missing env var fallback
grep -rn "process.env\.\w* ||" --include="*.ts" --include="*.js"
```

## Severity Guide

| Finding | Severity |
|---------|----------|
| `Math.random()` for tokens | CRITICAL |
| Fail-open auth catch block | CRITICAL |
| Non-constant-time secret comparison | HIGH |
| Missing env var with insecure fallback | HIGH |
| ReDoS-vulnerable regex | MEDIUM |
| Float arithmetic for money | MEDIUM |
