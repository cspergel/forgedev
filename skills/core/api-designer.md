---
name: api-designer
description: Resource modeling, contract design, endpoint naming, versioning strategy, error schema design for API architecture
when_to_use: During discovery and architecture design to model APIs, define contracts, and establish endpoint conventions
priority: 80
source: Jeffallan/claude-skills
validated_at: "2026-04-09"
overrides: []
tier_filter: [MEDIUM, LARGE]
agent_filter: []
tech_filter: []
---

# API Designer

## Resource Modeling

### From Shared Models to Endpoints
Every shared model with external access becomes a REST resource:

```
shared_model: User → /api/users
shared_model: Document → /api/documents
shared_model: Invoice → /api/invoices
```

### Resource Naming Rules
- [ ] Nouns, not verbs: `/users` not `/getUsers`
- [ ] Plural: `/users` not `/user`
- [ ] Lowercase with hyphens: `/file-uploads` not `/fileUploads`
- [ ] Nested for owned resources: `/users/:id/documents` (documents belonging to a user)
- [ ] Max 2 levels of nesting (deeper = flatten with query params)
- [ ] No trailing slashes
- [ ] No file extensions in URLs (`.json`, `.xml`)

### Resource Hierarchy
Map the entity ownership graph to URL structure:

| Relationship | URL Pattern | Example |
|-------------|-------------|---------|
| Independent | `/resources` | `/users`, `/products` |
| Owned (1:N) | `/parent/:id/children` | `/users/:id/orders` |
| Lookup | `/resources?filter=value` | `/orders?status=pending` |
| Action (non-CRUD) | `/resources/:id/action` | `/orders/:id/cancel` |
| Singleton sub-resource | `/parent/:id/child` (no ID) | `/users/:id/profile` |

## Contract Design

### Contract Checklist
For every endpoint:
- [ ] Request type defined with all fields and constraints
- [ ] Response type defined (separate from DB entity)
- [ ] All fields have types (no `any` or untyped objects)
- [ ] Optional vs required is explicit
- [ ] Date format specified (ISO 8601 always)
- [ ] ID format specified (UUID, CUID, integer)
- [ ] Enum values listed (not just `string`)

### HTTP Methods

| Method | Purpose | Idempotent | Request Body | Response |
|--------|---------|-----------|--------------|----------|
| GET | Read resource(s) | Yes | No | Resource(s) |
| POST | Create resource | No | Resource data | Created resource + 201 |
| PUT | Full replace | Yes | Complete resource | Updated resource |
| PATCH | Partial update | Yes | Changed fields only | Updated resource |
| DELETE | Remove resource | Yes | No | 204 No Content |

### Status Codes

| Code | When | Body |
|------|------|------|
| 200 | Success (GET, PUT, PATCH) | Resource |
| 201 | Created (POST) | New resource + Location header |
| 204 | Deleted (DELETE) | None |
| 400 | Validation error | Error with field-level details |
| 401 | Not authenticated | Error |
| 403 | Not authorized | Error (don't reveal resource existence) |
| 404 | Not found | Error |
| 409 | Conflict (duplicate, version mismatch) | Error with conflict details |
| 422 | Valid syntax but semantic error | Error with explanation |
| 429 | Rate limited | Error + Retry-After header |
| 500 | Server error | Generic error (no internals) |

## Error Schema

### Consistent Error Format
Every error response uses the same shape:

```typescript
type ErrorResponse = {
  error: {
    code: string;          // machine-readable: "VALIDATION_ERROR", "NOT_FOUND"
    message: string;       // human-readable: "Email is already registered"
    details?: FieldError[];  // field-level errors for validation
    requestId?: string;    // correlation ID for debugging
  };
};

type FieldError = {
  field: string;     // "email", "password"
  message: string;   // "Must be a valid email address"
  code: string;      // "INVALID_FORMAT", "TOO_SHORT"
};
```

### Error Design Rules
- [ ] Error codes are stable strings, not numbers (easier to search, won't collide)
- [ ] Messages are user-presentable (no stack traces, no internal paths)
- [ ] Field errors map to specific input fields (frontend can highlight)
- [ ] 401 vs 403 is correct (not authenticated vs not authorized)
- [ ] 404 is returned for resources the user CAN'T see too (don't reveal existence)
- [ ] 500 never contains implementation details

## Pagination

### Pagination Rules
- [ ] Default limit set (20), max limit enforced (100)
- [ ] Cursor-based for mutable datasets, offset-based only for stable/small
- [ ] Empty page returns `data: []`, not 404
- [ ] Consistent parameter names across all endpoints

## Versioning + Rate Limiting

- [ ] URL prefix versioning: `/api/v1/users` (recommended)
- [ ] Breaking changes (remove field, change type, new required field) require version bump
- [ ] Additive changes (new optional field, new endpoint) do NOT require version bump
- [ ] Rate limits per endpoint sensitivity (auth: strict, read: relaxed)
- [ ] 429 response includes `Retry-After` header

## Severity Guide

| Finding | Severity |
|---------|----------|
| No error schema (inconsistent error formats) | HIGH |
| 500 response leaks internal details | HIGH |
| No pagination on unbounded list endpoint | HIGH |
| Verb in URL path (/getUsers, /deleteItem) | MEDIUM |
| Missing status code for a documented error case | MEDIUM |
| 401/403 confusion | MEDIUM |
| No rate limiting on write endpoints | MEDIUM |
| Inconsistent naming conventions across endpoints | LOW |
| Missing Content-Type header | LOW |
