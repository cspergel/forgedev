---
name: ddd-strategic-design
description: Bounded contexts to nodes, aggregates to shared models, domain events to connections, strategic DDD for architecture decomposition
when_to_use: During discovery and architecture design for LARGE tier projects to decompose domains into well-bounded nodes
priority: 90
source: CodeMachine0121/Claude-Code-Skill-DDD
validated_at: "2026-04-09"
overrides: []
tier_filter: [LARGE]
agent_filter: [architect]
tech_filter: []
---

# DDD Strategic Design

## Bounded Context → Node Mapping

Every bounded context becomes one or more ForgePlan nodes. The context boundary IS the node boundary.

### Identifying Bounded Contexts
Ask these questions for each domain concept:
1. Does this concept mean something DIFFERENT in different parts of the system?
2. Would a change here force changes in another area?
3. Does this have its own data lifecycle (create, update, archive)?
4. Could a different team own this independently?

**If yes to 2+ questions → it's a separate bounded context → it's a separate node.**

### Context Map

| Relationship | ForgePlan Mapping | Example |
|-------------|------------------|---------|
| Shared Kernel | `shared_models` in manifest | User model shared by auth + billing |
| Customer/Supplier | `connections` with direction | API node supplies, frontend consumes |
| Conformist | Consumer node imports supplier types | Frontend conforms to API response shapes |
| Anti-Corruption Layer | Adapter in consumer node | Payment node adapts Stripe types to internal |
| Open Host Service | Public API node with versioned contracts | REST API with versioned endpoints |
| Published Language | Shared schema (OpenAPI, GraphQL) | API contract in shared definitions |

### Boundary Validation
For each proposed node boundary, verify:
- [ ] No shared mutable state across the boundary (DB table owned by one context)
- [ ] Communication is through explicit interfaces (not shared DB queries)
- [ ] Each context has its own data model (may share IDs, not full entities)
- [ ] Changes within the boundary don't require changes outside it

## Aggregate → Shared Model Mapping

### Identifying Aggregates
An aggregate is a cluster of entities that must be consistent together:
- Has a root entity (the one you reference externally by ID)
- Child entities don't exist without the root
- All mutations go through the root

### Mapping Rules

| DDD Concept | ForgePlan Artifact |
|------------|-------------------|
| Aggregate root | `shared_models` entry with all fields |
| Value object | Inline type within the shared model |
| Entity within aggregate | Nested type or separate shared model with FK |
| Aggregate ID | ID field in shared model (used across nodes) |

### When to Share vs. Localize
- **Share** (→ `shared_models`): Referenced by 2+ nodes, has a lifecycle, has an identity
- **Localize** (→ node-internal type): Used only within one node, no external identity

```yaml
# manifest.yaml
shared_models:
  User:
    fields:
      id: uuid
      email: string
      role: enum(client, accountant, admin)
      # Value objects inline
      address:
        street: string
        city: string
        zip: string
    owned_by: auth        # Only auth node mutates User
    referenced_by: [api, frontend-dashboard, billing]
```

## Domain Events → Connections

### Identifying Domain Events
Look for sentences like "When X happens, then Y should..."
- "When a user registers, create their default settings" → event
- "When a document is uploaded, scan for viruses" → event
- "When payment fails, notify the user" → event

### Event Mapping

| Event Pattern | ForgePlan Connection |
|--------------|---------------------|
| Command (do this) | Synchronous connection (API call) |
| Event (this happened) | Async connection (webhook, queue, pub/sub) |
| Query (tell me about) | Read connection (API GET, DB view) |

### Connection Definition
```yaml
connections:
  - from: auth
    to: api
    type: event
    event: "user.registered"
    payload: { userId: uuid, email: string, role: string }
    contract: "api must create default settings within 5s"
```

## Ubiquitous Language

Define terms precisely per bounded context. If "User" means different things in auth vs billing, share only the ID -- each context defines its own projection.

## Decomposition Checklist

Before finalizing node boundaries:

- [ ] Every node owns its data (no shared database tables across nodes)
- [ ] Every cross-node reference goes through `shared_models` or `connections`
- [ ] No circular dependencies between nodes
- [ ] Each node can be built and tested independently
- [ ] Each node has a clear single responsibility (one sentence description)
- [ ] Node count matches complexity tier expectations (LARGE: 5-12 nodes)
- [ ] Shared models are minimal (only what's needed across boundaries)

## Common Decomposition Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Too many shared models | >5 shared models for <8 nodes | Merge contexts or localize types |
| Too few nodes | One node has 15+ files | Split by subdomain |
| Anemic domain model | Services do all logic, models are just data | Push behavior into aggregates |
| Chatty connections | 10+ API calls between two nodes per operation | Merge or redesign boundary |
| Big Ball of Mud node | "core" or "common" node with everything | Decompose by capability |

## Severity Guide

| Finding | Severity |
|---------|----------|
| Shared mutable state across node boundaries | CRITICAL |
| Circular dependency between nodes | HIGH |
| Aggregate split across multiple nodes | HIGH |
| Missing bounded context (two domains in one node) | HIGH |
| Shared model not referenced by 2+ nodes (should be local) | MEDIUM |
| Missing domain event between contexts | MEDIUM |
| Inconsistent terminology across contexts | LOW |
