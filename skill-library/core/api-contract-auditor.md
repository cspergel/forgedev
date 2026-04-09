---
name: api-contract-auditor
description: Layer leakage detection, entity exposure auditing, missing DTO identification, contract consistency across node boundaries
when_to_use: During sweep review of API routes, service layers, and cross-node interfaces
priority: 85
source: levnikolaevich
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [sweep-contractualist]
tech_filter: []
---

# API Contract Auditor

## Layer Leakage Detection

Audit every API response for internal details that leak through layers:

### Database Layer Leaks
- [ ] No database IDs exposed (internal auto-increment, ObjectId) unless they ARE the public ID
- [ ] No `createdAt`/`updatedAt` timestamps unless the client needs them
- [ ] No `_id`, `__v`, `_rev` or ORM metadata in responses
- [ ] No join table artifacts or foreign key fields
- [ ] No soft-delete flags (`deletedAt`, `isDeleted`) in client responses

**Find it:** Compare DB model fields against API response shape. Every extra field is a leak.

### Infrastructure Leaks
- [ ] No internal service URLs, hostnames, or port numbers
- [ ] No file system paths (upload directories, temp paths)
- [ ] No connection strings or DSN fragments
- [ ] No internal error codes or stack traces in production responses
- [ ] No queue names, topic ARNs, or bucket names

### Business Logic Leaks
- [ ] No permission bitmasks — return boolean capabilities (`canEdit`, `canDelete`)
- [ ] No internal status codes — map to user-facing labels
- [ ] No pricing formulas or discount calculation details
- [ ] No internal user roles beyond what the requesting user needs

## Entity Exposure Audit

For each API entity, verify the exposure surface:

| Check | Rule |
|-------|------|
| Create payload | Only writable fields, no server-generated fields |
| Read response | Only fields the requesting role needs (role-scoped DTOs) |
| Update payload | Only mutable fields, no ID or audit fields |
| List response | Minimal projection — not the full entity |
| Error response | No entity internals in error details |

```typescript
// GOOD: Scoped DTO
type UserResponse = Pick<User, "id" | "name" | "email" | "role">;

// BAD: Full entity leak
app.get("/users/:id", (req, res) => res.json(user));
```

## Missing DTO Checklist

Every API boundary MUST have explicit DTOs. Audit for:

- [ ] **Request DTOs** — validated input shape per endpoint (not raw `req.body`)
- [ ] **Response DTOs** — explicit shape per endpoint (not raw entity)
- [ ] **Separate Create/Update DTOs** — create includes required fields, update makes them optional
- [ ] **List vs Detail DTOs** — list returns summary, detail returns full
- [ ] **Error DTOs** — consistent shape: `{ error: string, code: string, details?: unknown }`

**Red flags for missing DTOs:**
- `res.json(entity)` — sending raw DB entity
- `req.body as EntityType` — trusting input without validation
- Same type used for request AND response
- No type annotation on route handler parameters

## Cross-Node Contract Checks

When one node calls another's API:

- [ ] Request shape matches the callee's validated input schema exactly
- [ ] Response handling accounts for ALL possible status codes (not just 200)
- [ ] Error responses are caught and mapped, not passed through raw
- [ ] Shared model types are imported from shared definitions, not redefined locally
- [ ] Pagination parameters are forwarded correctly (offset drift, cursor encoding)

```typescript
// GOOD: Typed client with error handling
const result = await api.getUser(userId);
if (!result.ok) return mapError(result.error);

// BAD: Untyped fetch with optimistic parsing
const user = await fetch(`/api/users/${id}`).then(r => r.json());
```

## Versioning and Evolution

- [ ] No breaking changes to existing response shapes without version bump
- [ ] New required request fields get defaults or are additive-only
- [ ] Deprecated fields marked with docs, not silently removed
- [ ] Enum values are additive — removing a value breaks clients

## Severity Classification

| Severity | Example |
|----------|---------|
| CRITICAL | Full DB entity in response, no request validation |
| HIGH | Internal IDs exposed, missing error DTOs, raw entity pass-through |
| MEDIUM | Missing list/detail DTO split, no pagination on list endpoints |
| LOW | Extra timestamp fields, verbose error messages in dev mode |
