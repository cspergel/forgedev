---
name: secure-code-review
description: Semgrep rule patterns, CWE taxonomy mapping, deserialization and XXE detection
when_to_use: During security-focused sweeps to systematically identify vulnerability classes
priority: 80
source: mahmutka
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [sweep-adversary]
tech_filter: []
---

# Secure Code Review

## CWE Taxonomy — Priority Classes

Focus on these CWE categories in order of exploitability:

### Tier 1: Immediate Exploitation Risk
| CWE | Name | What to Grep |
|-----|------|-------------|
| CWE-89 | SQL Injection | Template literals in queries, string concat with user input |
| CWE-79 | XSS | `dangerouslySetInnerHTML`, `innerHTML`, unescaped template vars |
| CWE-502 | Deserialization | `JSON.parse` on untrusted input without schema validation |
| CWE-611 | XXE | XML parsing without disabling external entities |
| CWE-918 | SSRF | `fetch`/`axios` with user-controlled URLs |

### Tier 2: Auth and Access
| CWE | Name | What to Grep |
|-----|------|-------------|
| CWE-287 | Improper Auth | Routes without auth middleware |
| CWE-862 | Missing Authorization | No ownership check in data queries |
| CWE-639 | IDOR | Direct use of `req.params.id` in DB queries without user filter |
| CWE-352 | CSRF | State-changing GET routes, missing CSRF tokens on forms |

### Tier 3: Data Handling
| CWE | Name | What to Grep |
|-----|------|-------------|
| CWE-312 | Cleartext Storage | Passwords stored without hashing |
| CWE-532 | Log Injection | User input in log statements without sanitization |
| CWE-209 | Error Info Leak | Stack traces in HTTP responses |

## Semgrep-Style Detection Rules

Apply these patterns mentally during review (or suggest as Semgrep rules):

### Deserialization Without Validation
```
# BAD: parse and trust
const data = JSON.parse(req.body);
processOrder(data);

# GOOD: parse and validate
const data = orderSchema.parse(JSON.parse(req.body));
processOrder(data);
```
**Rule:** Every `JSON.parse` of external input MUST be followed by schema validation (Zod, Joi, etc.) before use.

### XXE in XML Parsing
```
# BAD: default XML parser settings
const parser = new XMLParser();
const result = parser.parse(userXml);

# GOOD: external entities disabled
const parser = new XMLParser({
  processEntities: false,
  externalEntities: false
});
```
**Rule:** All XML parsers must explicitly disable external entity resolution.

### Prototype Pollution
```
# BAD: recursive merge without protection
function deepMerge(target, source) {
  for (const key in source) {
    target[key] = source[key]; // __proto__ injection
  }
}

# GOOD: filter dangerous keys
const BLOCKED = ['__proto__', 'constructor', 'prototype'];
```
**Rule:** Object merge/spread from user input must block prototype keys.

## Review Checklist by File Type

### Route/Controller Files
- [ ] Every route has auth middleware (or explicit `@public` annotation)
- [ ] Input validated with schema before processing
- [ ] Errors caught and sanitized before response
- [ ] No direct DB queries (should go through service layer)

### Service/Business Logic Files
- [ ] All DB queries parameterized
- [ ] Ownership verified before data access
- [ ] Sensitive operations logged (without PII)
- [ ] Transaction boundaries explicit

### Configuration Files
- [ ] No secrets in committed files
- [ ] Security headers configured
- [ ] CORS is restrictive, not permissive
- [ ] Rate limiting configured on auth endpoints

## Severity Mapping

| CWE Tier | Default Severity | Escalate When |
|----------|-----------------|---------------|
| Tier 1 | CRITICAL | Always critical |
| Tier 2 | HIGH | CRITICAL if auth bypass is confirmed |
| Tier 3 | MEDIUM | HIGH if PII is involved |
