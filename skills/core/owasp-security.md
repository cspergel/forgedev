---
name: owasp-security
description: Full OWASP Top 10:2025 checklist, ASVS 5.0 verification levels, actionable detection rules
when_to_use: During security sweeps and adversarial review of any node
priority: 90
source: agamm
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [sweep-adversary]
tech_filter: []
---

# OWASP Security

## OWASP Top 10:2025 — Detection Checklist

### A01: Broken Access Control
- [ ] Every endpoint checks authentication AND authorization
- [ ] No IDOR: user can only access own resources (verify ownership in queries)
- [ ] CORS allowlist is explicit, never `*` with credentials
- [ ] Directory traversal: all file paths validated against allowed root
- [ ] Default deny: missing auth annotation = blocked, not open
- [ ] Rate limiting on auth endpoints (login, register, reset)

**Find it:** Grep for routes without auth middleware. Check if DB queries filter by `userId`.

### A02: Cryptographic Failures
- [ ] No secrets in code, env vars, or logs — use secret manager or `.env` (gitignored)
- [ ] TLS 1.2+ enforced (no fallback to HTTP)
- [ ] Passwords: bcrypt/argon2id, never MD5/SHA1/SHA256 alone
- [ ] Encryption at rest for PII and sensitive fields
- [ ] No hardcoded keys, tokens, or API secrets

**Find it:** Search for `password`, `secret`, `key`, `token` in string literals.

### A03: Injection
- [ ] SQL: parameterized queries ONLY — no string concatenation
- [ ] NoSQL: validate query operator inputs (no `$gt`, `$ne` from user input)
- [ ] XSS: output encoding in templates, CSP headers, no `dangerouslySetInnerHTML` with user data
- [ ] Command injection: never pass user input to `exec`/`spawn` unsanitized
- [ ] Path traversal: `path.resolve()` + verify result is under allowed directory

**Find it:** Grep for template literals in SQL, `innerHTML`, `exec(`, `eval(`.

### A04: Insecure Design
- [ ] Threat model exists for auth flows and data boundaries
- [ ] Business logic abuse: rate limits, quantity limits, workflow sequence enforcement
- [ ] No trust of client-side validation as the only check

### A05: Security Misconfiguration
- [ ] No default credentials or example secrets in deployed config
- [ ] Error responses don't leak stack traces, DB schemas, or internal paths
- [ ] Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`
- [ ] Debug mode OFF in production configs
- [ ] Dependencies audited: `npm audit` / `pnpm audit` with zero critical/high

### A06: Vulnerable and Outdated Components
- [ ] No dependencies with known CVEs (check `npm audit`)
- [ ] Lock file committed and reviewed
- [ ] Minimal dependency surface — question every new package

### A07: Authentication Failures
- [ ] Password brute-force protection (rate limit + lockout)
- [ ] Session tokens regenerated after login
- [ ] MFA available for privileged accounts
- [ ] Credential stuffing protection (breached password check)

### A08: Data Integrity Failures
- [ ] CI/CD pipeline: no unsigned/unverified deployments
- [ ] Deserialization: never deserialize untrusted data without schema validation
- [ ] Verify integrity of critical data (checksums, signatures)

### A09: Logging & Monitoring Failures
- [ ] Log all auth events: login, logout, failed attempts, permission denied
- [ ] Never log passwords, tokens, PII, or full credit card numbers
- [ ] Structured logging (JSON) with correlation IDs
- [ ] Alerting on anomalies: burst of 401s, unusual access patterns

### A10: Server-Side Request Forgery (SSRF)
- [ ] Allowlist outbound domains/IPs — never fetch arbitrary user-supplied URLs
- [ ] Block internal network ranges (127.0.0.0/8, 10.0.0.0/8, 169.254.169.254)
- [ ] Validate URL scheme (https only, no file://, no gopher://)

## ASVS 5.0 Verification Levels

Apply the level matching the project's complexity tier:

| Level | When | Key Requirements |
|-------|------|-----------------|
| L1 | SMALL tier | Input validation, output encoding, basic auth, no known vulns |
| L2 | MEDIUM tier | L1 + session management, access control, crypto, error handling, logging |
| L3 | LARGE tier | L2 + defense-in-depth, advanced threat modeling, tamper detection |

### L1 Essentials (ALL projects)
- All user input validated (type, length, range)
- All output encoded for context (HTML, JS, URL, CSS)
- Authentication uses proven library, not custom
- No components with known vulnerabilities

### L2 Additions (MEDIUM+)
- Session idle timeout + absolute timeout
- RBAC enforced server-side on every request
- Cryptographic operations use vetted libraries (no custom crypto)
- All errors handled without information leakage
- Security events logged with tamper-evident storage

### L3 Additions (LARGE)
- Input validation on ALL data sources (APIs, files, DB reads)
- Anti-automation on business-critical operations
- Integrity verification of code and configuration
- Advanced monitoring with automated anomaly response

## Severity Classification for Findings

| Severity | Criteria | Example |
|----------|----------|---------|
| CRITICAL | Exploitable now, data breach risk | SQL injection, no auth on admin route |
| HIGH | Exploitable with effort | IDOR, weak password hashing, missing CSRF |
| MEDIUM | Defense-in-depth gap | Missing security headers, verbose errors |
| LOW | Best practice violation | Missing rate limit on non-sensitive endpoint |
