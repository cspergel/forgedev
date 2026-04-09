---
name: layer-boundary-auditor
description: Grep-based I/O isolation verification, transaction boundary ownership, layer leakage detection
when_to_use: During structural sweeps to verify clean architecture boundaries between layers
priority: 85
source: levnikolaevich
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [sweep-structuralist]
tech_filter: []
---

# Layer Boundary Auditor

## Canonical Layer Model

```
Routes/Controllers  →  Services  →  Repositories  →  Database
     ↓                    ↓              ↓
  Validation          Business        Data Access
  Auth check          Logic           Queries
  Response format     Orchestration   Transactions
```

**Rule:** Each layer may only call the layer directly below it. Never skip layers.

## Boundary Violations to Detect

### 1. Database Leakage into Routes
```bash
# Controllers/routes should NEVER import DB clients directly
grep -rn "import.*prisma\|import.*knex\|import.*mongoose\|import.*supabase" routes/ controllers/ api/
```
**Violation:** Route file contains `prisma.user.findMany()`. Fix: move to repository, call via service.

### 2. Request Object Leakage into Services
```bash
# Services should NEVER reference req/res/ctx
grep -rn "req\.\|res\.\|ctx\.\|request\.\|response\." services/ --include="*.ts"
```
**Violation:** Service accepts `req` parameter. Fix: extract needed data in controller, pass primitives/DTOs.

### 3. ORM Entity Leakage into Responses
```bash
# Routes should return DTOs, not raw DB entities
grep -rn "res.json(.*await.*find\|res.send(.*await.*get" routes/ controllers/ --include="*.ts"
```
**Violation:** `res.json(await userRepo.findById(id))` exposes internal fields. Fix: map to response DTO.

### 4. Business Logic in Controllers
Signs a controller has too much logic:
- More than 15 lines between request parsing and response sending
- Conditional branches based on business rules
- Multiple repository calls without a service orchestrating them
- Error handling that makes business decisions

### 5. Cross-Repository Transactions
```bash
# Only services should coordinate multi-entity transactions
grep -rn "transaction\|BEGIN\|COMMIT" repositories/ --include="*.ts"
```
**Violation:** Repository A calls Repository B inside a transaction. Fix: service layer owns transaction scope.

## Transaction Boundary Ownership

| Layer | Transaction Responsibility |
|-------|--------------------------|
| Route | Never starts transactions |
| Service | Owns transaction lifecycle — begin, commit, rollback |
| Repository | Participates in transactions passed from service |
| Database | Executes within provided transaction context |

### Audit Steps
1. Find all `transaction`/`BEGIN`/`$transaction` calls
2. Verify each is in a service file (not route or repo)
3. Verify rollback exists in every catch/error path
4. Verify transaction timeout is set (no infinite locks)

## I/O Isolation Rules

### Pure vs Impure
- **Services** should be mostly pure: given inputs, return outputs. I/O at boundaries only.
- **Repositories** are the I/O boundary for data.
- **Controllers** are the I/O boundary for HTTP.

### File System Access
- Only dedicated file-handling services/repositories touch the filesystem
- Never `fs.readFile` in a controller or business service
- File paths never constructed from user input without validation

### External API Calls
- Wrapped in dedicated client/adapter modules
- Never `fetch()` directly in business logic
- Retry/timeout/circuit-breaker at the adapter level

## Checklist

- [ ] No DB imports in route/controller files
- [ ] No `req`/`res` references in service files
- [ ] No raw ORM entities in API responses
- [ ] Transactions owned by service layer only
- [ ] External API calls wrapped in adapters
- [ ] File system access isolated to dedicated modules
- [ ] Each layer has clear, single responsibility
- [ ] No circular dependencies between layers

## Severity Guide

| Finding | Severity |
|---------|----------|
| DB client in route file | HIGH |
| Raw entity in API response (exposes internal fields) | HIGH |
| Request object passed to service | MEDIUM |
| Transaction started in repository | MEDIUM |
| Business logic in controller (< 30 lines) | LOW |
