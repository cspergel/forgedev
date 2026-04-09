---
name: authentication-patterns
description: OAuth/PKCE, JWT rotation, MFA, RBAC, patterns for Clerk/Supabase/NextAuth
when_to_use: When building auth nodes or any node with authentication/authorization requirements
priority: 80
source: travisjneuman
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [builder]
tech_filter: [typescript, javascript]
---

# Authentication Patterns

## OAuth 2.0 + PKCE (Public Clients)

PKCE is REQUIRED for all browser/mobile OAuth flows. Never use implicit grant.

```typescript
// 1. Generate verifier + challenge
const verifier = crypto.randomBytes(32).toString("base64url");
const challenge = crypto
  .createHash("sha256").update(verifier)
  .digest("base64url");
// 2. Send challenge in /authorize, send verifier in /token
```

**Rules:**
- Store `code_verifier` in session/memory, never in localStorage
- Use `state` parameter to prevent CSRF — validate on callback
- Validate `id_token` signature and claims (iss, aud, exp, nonce)
- Check `at_hash` claim matches access token hash

## JWT Management

- **Access tokens:** Short-lived (15 min max), stored in memory only
- **Refresh tokens:** Long-lived, stored in httpOnly secure cookie, rotated on every use
- **Never store JWTs in localStorage** — XSS exposes them

**Token rotation pattern:**
1. Client sends expired access token
2. Server returns 401
3. Client sends refresh token to `/auth/refresh`
4. Server validates refresh token, issues NEW access + NEW refresh token
5. Server invalidates the old refresh token (one-time use)
6. If an already-used refresh token appears, invalidate ALL tokens for that user (theft detection)

**JWT payload — keep minimal:**
- `sub` (user ID), `role`, `exp`, `iat`, `jti` (unique token ID)
- Never include PII (email, name) — look it up from `sub` when needed

## MFA Implementation

- TOTP (RFC 6238) as the default second factor
- Recovery codes: 10 single-use codes, generated at MFA setup, hashed in DB
- Enforce MFA on sensitive operations even within an authenticated session (step-up auth)
- Rate limit MFA attempts: 5 failures → 15 min lockout

## RBAC (Role-Based Access Control)

```typescript
// Middleware pattern
function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ code: "FORBIDDEN" });
    }
    next();
  };
}
// Usage: router.delete("/users/:id", requireRole("admin"), deleteUser);
```

**Rules:**
- Check permissions server-side on EVERY request — never trust client-side role checks
- Default deny: if no role annotation, endpoint is inaccessible
- Role hierarchy (admin > editor > viewer) — implement as a set, not inheritance
- Audit log all permission-escalation actions

## Session Security

- Set cookies: `httpOnly`, `secure`, `sameSite: "strict"`, `path: "/"`
- Session ID: cryptographically random, min 128 bits
- Regenerate session ID after login (prevent session fixation)
- Absolute timeout (24h) + idle timeout (30 min)
- Bind session to user-agent + IP range (detect hijacking)

## Provider-Specific Patterns

### Supabase Auth
- Use `supabase.auth.getSession()` server-side, never trust client session
- RLS policies are the REAL authorization layer — RBAC middleware is defense-in-depth
- Use `supabase.auth.onAuthStateChange()` for client session sync
- Store custom claims in `app_metadata` (admin-only), user prefs in `user_metadata`

### NextAuth / Auth.js
- Use the `jwt` callback to attach role/permissions to the token
- Use the `session` callback to expose role to the client
- Protect API routes with `getServerSession()`, not client-side checks
- Use `pages` config to customize auth UI, not middleware redirects

### Clerk
- Use `auth()` in server components, `useAuth()` in client components
- Organizations API for multi-tenant — map org roles to app permissions
- Use Clerk webhooks for user sync to your database
- `clerkMiddleware()` in middleware.ts — protect routes declaratively

## Password Security

- Hash with bcrypt (cost factor 12+) or argon2id
- Min 8 characters, max 128 (prevent DoS via bcrypt)
- Check against HaveIBeenPwned API (k-anonymity model, sends only 5-char prefix)
- No password composition rules (NIST 800-63B) — length is what matters
- Rate limit login: 10 attempts → progressive delay, 20 → account lockout + email
