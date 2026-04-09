---
name: better-auth
description: Auth implementation without managed provider — session management, password hashing, token rotation, RBAC patterns
when_to_use: During builds of auth nodes when using custom authentication instead of a managed provider
priority: 75
source: better-auth
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [builder]
tech_filter: [custom-auth]
---

# Better Auth — Custom Authentication Patterns

## Session Management

### Session Storage
```typescript
// Server-side sessions (preferred over JWT-only)
interface Session {
  id: string;               // crypto.randomUUID()
  userId: string;
  createdAt: Date;
  expiresAt: Date;          // absolute timeout
  lastActiveAt: Date;       // idle timeout tracking
  userAgent: string;        // device identification
  ipAddress: string;        // for anomaly detection
}
```

### Session Rules
- [ ] Session ID generated with `crypto.randomBytes(32)` — minimum 256 bits of entropy
- [ ] Stored server-side (database or Redis), not only in JWT
- [ ] Absolute timeout: 24 hours (configurable)
- [ ] Idle timeout: 30 minutes of inactivity
- [ ] Session regenerated on login (prevent session fixation)
- [ ] Session invalidated on logout (delete from store, not just client)
- [ ] Session invalidated on password change (all sessions for that user)

### Cookie Configuration
```typescript
const sessionCookie = {
  httpOnly: true,         // no JS access
  secure: true,           // HTTPS only
  sameSite: "lax",        // CSRF protection
  path: "/",
  maxAge: 86400,          // 24 hours
  // domain: set only if needed for subdomains
};
```

### Cookie Checklist
- [ ] `httpOnly: true` — prevents XSS from reading session
- [ ] `secure: true` — HTTPS only (set false only in dev)
- [ ] `sameSite: "lax"` or `"strict"` — never `"none"` without reason
- [ ] No sensitive data in cookie value (only session ID)
- [ ] Cookie cleared on logout (set maxAge: 0)

## Password Handling

### Password Rules
Use Argon2id or bcrypt for hashing. Libraries handle constant-time comparison.
- [ ] Argon2id (preferred) or bcrypt — never MD5, SHA1, SHA256 alone
- [ ] Minimum 8 characters, maximum 72 (bcrypt limit) or 128
- [ ] Check against breached password list (HaveIBeenPwned API k-anonymity)
- [ ] No password composition rules beyond minimum length (NIST 800-63B)
- [ ] Rate limit login attempts (5 per minute per account)
- [ ] Constant-time comparison for hash verification (library handles this)
- [ ] Password stored ONLY as hash — never logged, never in error messages

### Password Reset Flow
1. User requests reset → generate random token (32 bytes)
2. Store token hash (SHA256 of token) with expiry (1 hour)
3. Email the token (not the hash) in a one-time-use link
4. On reset: verify token against stored hash, set new password
5. Invalidate token immediately after use
6. Invalidate ALL active sessions for the user

## Token Rotation (JWT + Refresh)

### Rotation Rules
- [ ] Access token: 15 minutes max
- [ ] Refresh token: 7 days max, single-use (rotate on every refresh)
- [ ] Refresh token stored server-side (database, not just client)
- [ ] Used refresh token invalidates the family (detect token theft)
- [ ] JWT secret is minimum 256 bits, loaded from environment
- [ ] JWT contains only claims needed for authorization (userId, role)
- [ ] JWT does NOT contain: email, name, permissions list (fetch from DB)

## Role-Based Access Control (RBAC)

### RBAC Implementation
Define roles as permission maps: `{ admin: ["users:*", "settings:*"], viewer: ["documents:read"] }`. Middleware checks permission on every request, returns 403 if missing.

### RBAC Checklist
- [ ] Permissions checked server-side on every request (not just UI hiding)
- [ ] Role assigned at registration or by admin — never self-assigned
- [ ] Role stored in database, not in JWT (JWT role is a cache, DB is source of truth)
- [ ] Default role is least-privileged (viewer, not admin)
- [ ] Permission change takes effect immediately (re-check on each request)
- [ ] Admin actions require re-authentication

## OAuth Integration

### OAuth Checklist
- [ ] State parameter generated per request (prevents CSRF)
- [ ] PKCE used for public clients (SPA, mobile)
- [ ] Redirect URI is exact match (no wildcards)
- [ ] ID token verified (signature, issuer, audience, expiry)
- [ ] Link OAuth identity to local user account (not a separate user per provider)
- [ ] Handle account linking (user logs in with Google, later adds email/password)

## Severity Guide

| Finding | Severity |
|---------|----------|
| Passwords stored in plaintext or weak hash | CRITICAL |
| Session ID with low entropy (<128 bits) | CRITICAL |
| Missing httpOnly on session cookie | CRITICAL |
| No session invalidation on logout | HIGH |
| JWT secret hardcoded in source | HIGH |
| No refresh token rotation (reuse allowed) | HIGH |
| No rate limiting on login endpoint | HIGH |
| Access token lifetime >1 hour | MEDIUM |
| Role check only in UI, not server-side | MEDIUM |
| Missing PKCE on OAuth flow | MEDIUM |
