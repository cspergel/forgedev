---
name: database-designer
description: ERD modeling, normalization rules (1NF-BCNF), database selection matrix, migration best practices
when_to_use: During discovery and architecture design to model data, select databases, and design schemas
priority: 80
source: alirezarezvani/claude-skills
validated_at: "2026-04-09"
overrides: []
tier_filter: [MEDIUM, LARGE]
agent_filter: []
tech_filter: []
---

# Database Designer

## ERD Modeling

### Entity Identification
From the manifest's `shared_models` and node specs, identify:

1. **Entities** — things with identity and lifecycle (User, Document, Invoice)
2. **Value Objects** — things without identity (Address, Money, DateRange)
3. **Relationships** — how entities connect (User owns Documents, Invoice references User)

### Relationship Types

| Type | Schema Pattern | When |
|------|---------------|------|
| One-to-One | FK on either table, or embed | Profile ↔ User |
| One-to-Many | FK on the "many" side | User → Documents |
| Many-to-Many | Junction table with composite PK | User ↔ Role |
| Self-referential | FK to same table | Employee → Manager |
| Polymorphic | Discriminator column + nullable FKs | Comment → (Post OR Document) |

### Relationship Checklist
For every relationship:
- [ ] Cardinality defined (1:1, 1:N, M:N)
- [ ] Required or optional on each side
- [ ] Cascade behavior defined (ON DELETE CASCADE, SET NULL, RESTRICT)
- [ ] Index on foreign key columns
- [ ] Ownership clear (which side controls the relationship lifecycle)

## Normalization Rules

### Quick Reference

| Form | Rule | Violation Example |
|------|------|------------------|
| 1NF | No repeating groups, atomic values | `tags: "a,b,c"` in one column |
| 2NF | No partial dependencies (all non-key columns depend on full PK) | In (order_id, product_id) → product_name depends only on product_id |
| 3NF | No transitive dependencies (non-key depends only on PK) | zip_code → city (city depends on zip, not on PK) |
| BCNF | Every determinant is a candidate key | Rare — 3NF is sufficient for most projects |

### When to Denormalize
- Read-heavy queries joining 4+ tables → materialize a view
- Analytics/reporting on operational data → separate read model
- Cache-like access patterns → duplicated column with sync strategy
- **Always document WHY** with a comment in the migration

### Denormalization Rules
- [ ] Every denormalized field has a documented source of truth
- [ ] Sync strategy is explicit (trigger, application code, event)
- [ ] Stale data consequences are acceptable for the use case
- [ ] A migration can reconstruct the denormalized data from source

## Database Selection Matrix

| Factor | PostgreSQL | MySQL | SQLite | MongoDB | Redis |
|--------|-----------|-------|--------|---------|-------|
| Relational data | Best | Good | Good (single-writer) | Poor | N/A |
| JSON/document | Good (jsonb) | Adequate | Poor | Best | Good |
| Full-text search | Good (tsvector) | Good | Basic | Good (Atlas) | N/A |
| Transactions | ACID, MVCC | ACID | ACID (file-level lock) | Multi-doc since 4.0 | Optimistic (WATCH/MULTI) |
| Scale | Vertical + read replicas | Vertical + replicas | Single process | Horizontal (sharding) | In-memory, clustering |
| Best for | General purpose, complex queries | Web apps, read-heavy | Embedded, dev, testing | Unstructured, rapid prototyping | Caching, sessions, queues |
| Avoid when | Need horizontal writes | Need advanced JSON | Multi-writer, >1GB | Need joins, strong consistency | Need persistence guarantees |

### Selection Checklist
- [ ] Data model defined (relational, document, key-value, graph?)
- [ ] Expected data volume estimated (GB range)
- [ ] Read/write ratio understood (read-heavy, write-heavy, balanced)
- [ ] Consistency requirements defined (strong, eventual, per-operation)
- [ ] Hosting constraints identified (managed service, self-hosted, embedded)

## Migration Best Practices

### Migration Rules
- [ ] Every schema change is a migration file (never manual DDL)
- [ ] Migrations are idempotent (safe to run twice)
- [ ] Down migration exists for every up migration
- [ ] Migrations are tested on a copy of production data shape
- [ ] No data loss — add columns before removing old ones (expand-contract)

### Expand-Contract Pattern
For breaking changes (rename column, change type):
```
Migration 1: ADD new_column (expand)
Deploy: Write to BOTH columns, read from new
Migration 2: Backfill new_column from old_column
Migration 3: DROP old_column (contract)
```

### Index Strategy
- [ ] Foreign keys have indexes
- [ ] Columns in WHERE clauses frequently used have indexes
- [ ] Composite indexes match query column order (leftmost prefix)
- [ ] No index on low-cardinality columns (boolean, enum with 2-3 values)
- [ ] Partial indexes for filtered queries (WHERE is_active = true)
- [ ] Monitor: unused indexes waste write performance

## Schema Design Checklist

- [ ] Every table has a primary key (UUID preferred over auto-increment for distributed)
- [ ] Timestamps present: `created_at`, `updated_at` (auto-managed)
- [ ] Soft delete via `deleted_at` if recovery needed (not boolean `is_deleted`)
- [ ] Enum values stored as strings, not integers (readable, extensible)
- [ ] Money stored as integer cents, not float
- [ ] Text fields have sensible max lengths
- [ ] Nullable columns are intentionally nullable (not default)
- [ ] Check constraints on fields with business rules (positive amounts, valid status)

## Severity Guide

| Finding | Severity |
|---------|----------|
| No migration for schema change (manual DDL) | CRITICAL |
| Missing cascade behavior on critical FK | HIGH |
| Float used for money | HIGH |
| No index on frequently-queried FK | MEDIUM |
| Denormalization without documented sync strategy | MEDIUM |
| Missing timestamps on mutable entities | LOW |
| Auto-increment PK where UUID is better for distribution | LOW |
