---
name: backend-patterns
description: Repository/service/middleware layering, N+1 prevention, transaction management, caching strategies
when_to_use: During backend node builds — API routes, database layers, service logic
priority: 85
source: affaan-m/everything-claude-code
validated_at: "2026-04-09"
overrides: []
tier_filter: [MEDIUM, LARGE]
agent_filter: [builder]
tech_filter: []
---

# Backend Patterns

## Layer Architecture

Enforce strict 3-layer separation. Each layer calls ONLY the one below it.

```
Route/Controller → Service → Repository
     ↓                ↓           ↓
  Validation     Business     Data access
  Auth check     Orchestration   Queries
  Response       Error mapping   Transactions
```

**Rules:**
- Routes NEVER call repositories directly
- Repositories NEVER throw HTTP errors (no `404`, no `res.status()`)
- Services own business logic — routes are thin dispatchers
- One service per domain entity, one repository per database table/collection

## Repository Pattern

```typescript
// Repository returns domain objects, not raw DB rows
interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, changes: Partial<User>): Promise<User>;
}
```

- Repository methods return domain types, never ORM/query-builder types
- Keep queries in the repository — no SQL/query DSL in services
- Use a factory or DI to inject repositories into services (testability)

## N+1 Prevention

Before writing any list/collection endpoint, ask: "Does this query inside a loop?"

- **Eager load** relations needed in the response (joins, `include`, `populate`)
- **Batch queries** when loading related data: `WHERE id IN (...)` not N separate queries
- **DataLoader pattern** for GraphQL or nested resolvers

```typescript
// BAD: N+1
const users = await db.users.findAll();
for (const user of users) {
  user.orders = await db.orders.findByUserId(user.id); // N queries
}

// GOOD: Batch
const users = await db.users.findAll();
const orders = await db.orders.findByUserIds(users.map(u => u.id));
```

## Transaction Management

- Transactions live in the SERVICE layer, never in repositories or routes
- Use a transaction wrapper that auto-rolls-back on throw
- Keep transactions as short as possible — no network calls inside transactions
- For multi-table writes, ALWAYS use a transaction

```typescript
async function transferFunds(from: string, to: string, amount: number) {
  return db.transaction(async (tx) => {
    await tx.accounts.debit(from, amount);
    await tx.accounts.credit(to, amount);
    await tx.ledger.record({ from, to, amount });
  });
}
```

## Middleware Ordering

Apply middleware in this order:

1. Request ID / correlation ID
2. Logging (request start)
3. CORS
4. Rate limiting
5. Body parsing
6. Authentication (who are you?)
7. Authorization (can you do this?)
8. Validation (is the input correct?)
9. Route handler
10. Error handler (catch-all, ALWAYS last)

## Caching Strategy

| Data Type | Strategy | TTL |
|-----------|----------|-----|
| Static config | In-memory, warm on startup | Until restart |
| User session | Redis/store | Match session expiry |
| Expensive queries | Cache-aside with invalidation | 1-5 min |
| Public API responses | HTTP cache headers | Varies |

**Rules:**
- Cache at the SERVICE layer, not repository (service knows invalidation rules)
- Always set a TTL — no infinite caches
- Invalidate on write — don't rely on TTL alone for mutable data
- Cache keys must include all query parameters that affect the result

## Pagination

- Default to cursor-based for large/real-time datasets
- Offset-based only for admin UIs with page numbers
- ALWAYS set a max page size (e.g., 100) — never trust client `limit`
- Return `hasMore` or `nextCursor` — let clients know if more data exists

## Error Responses

Standardize ALL error responses:

```typescript
interface ApiError {
  code: string;       // Machine-readable: "USER_NOT_FOUND"
  message: string;    // Human-readable: "User not found"
  status: number;     // HTTP status: 404
  details?: unknown;  // Optional validation errors
}
```

- Map domain errors to HTTP status in the ROUTE layer, not services
- Never leak stack traces or internal details to clients
- Log the full error server-side, return a safe summary to client
