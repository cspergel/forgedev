---
name: design-patterns
description: 20 patterns with symptom-to-pattern framework, God Object and Anemic Domain avoidance, anti-pattern detection
when_to_use: During architecture design and review to select appropriate patterns and detect structural anti-patterns
priority: 85
source: ratacat/claude-skills
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: []
tech_filter: []
---

# Design Patterns + Anti-Patterns

## Symptom-to-Pattern Framework

Don't pick patterns by name. Pick them by the problem you're seeing.

| Symptom | Pattern | When to Apply |
|---------|---------|--------------|
| Object creation logic scattered everywhere | **Factory** | 3+ places create the same type with different configs |
| Need to swap implementations at runtime | **Strategy** | if/else chain on type to select behavior |
| Object has too many optional parameters | **Builder** | Constructor has >4 params or many are optional |
| Need to observe state changes | **Observer/Event Emitter** | 2+ unrelated modules react to the same event |
| Need to add behavior without modifying class | **Decorator** | Cross-cutting concerns (logging, caching, auth) |
| External API types leak into domain | **Adapter** | Any third-party integration boundary |
| Complex subsystem with many entry points | **Facade** | Consumers need 1-2 operations from a 20-method API |
| Object state determines behavior | **State Machine** | if/else on status field in multiple methods |
| Request passes through multiple handlers | **Chain of Responsibility** | Middleware pipeline (auth → validate → handle) |
| Need undo or history | **Command** | User actions that are reversible |
| Need to process tree structures | **Composite** | Recursive data (menus, folders, org charts) |
| Expensive object, only need one | **Singleton** | ONLY for truly global state (DB pool, logger config) |
| Need consistent object copies | **Prototype** | Creating variations of a complex base object |
| Need to traverse without exposing internals | **Iterator** | Custom collection types |
| Algorithm skeleton with variable steps | **Template Method** | Same workflow, different implementations per step |
| Need to coordinate object creation | **Abstract Factory** | Multiple related objects created together |
| Decouple sender from receiver | **Mediator** | Multiple components that all communicate with each other |
| Attach metadata without subclassing | **Proxy** | Access control, lazy loading, logging |
| Multiple representations of same data | **Bridge** | Same logic, different UIs or storage backends |
| Save and restore state | **Memento** | Undo/redo, draft saving |

## The 5 Most Useful Patterns (80/20)

These cover 80% of real-world needs:

### 1. Repository Pattern
**Use when:** Data access logic is mixed with business logic.
```typescript
// Interface
interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<User>;
}

// Implementation (swappable for tests)
class PostgresUserRepository implements UserRepository { ... }
class InMemoryUserRepository implements UserRepository { ... }
```

### 2. Strategy Pattern
**Use when:** You have a switch/if-else on a type to select behavior.
```typescript
// Instead of: if (type === 'pdf') ... else if (type === 'csv') ...
const exporters: Record<ExportType, Exporter> = {
  pdf: new PdfExporter(),
  csv: new CsvExporter(),
};
const exporter = exporters[type]; // No conditional
```

### 3. Adapter Pattern
**Use when:** External API types don't match your internal model.
```typescript
// Stripe returns { amount_cents, currency }
// Internal model uses { amount: Decimal, currency: Currency }
function fromStripeCharge(charge: Stripe.Charge): Payment {
  return { amount: new Decimal(charge.amount_cents).div(100), ... };
}
```

### 4. Decorator/Middleware Pattern
**Use when:** Cross-cutting concerns (logging, auth, caching, retry).
```typescript
const withLogging = (handler: Handler): Handler => async (req, res) => {
  console.log(`${req.method} ${req.path}`);
  return handler(req, res);
};
```

### 5. Facade Pattern
**Use when:** Complex subsystem needs a simple entry point.
```typescript
// Instead of: 10 imports from billing/
class BillingFacade {
  async chargeCustomer(userId: string, amount: number): Promise<Invoice> {
    // Coordinates: customer lookup, payment method, charge, invoice
  }
}
```

## Anti-Pattern Detection

### God Object
**Symptom:** One class/module with 10+ methods, 500+ lines, imported by everything.
**Detection:**
- File has >10 exports
- File is imported by >5 other files
- Class has >8 methods
- Multiple unrelated responsibilities in one file

**Fix:** Split by responsibility. Each new module owns one cohesive set of operations.

### Anemic Domain Model
**Symptom:** Models are data bags, all logic in services.
**Detection:** Service has `calculateTotal(order)` instead of `order.calculateTotal()`.
**Fix:** Push behavior into models. Validation belongs on the entity.

### Shotgun Surgery
**Symptom:** One change requires edits in 5+ files.
**Fix:** Consolidate related logic into one module.

### Feature Envy
**Symptom:** Method uses more data from another class than its own.
**Fix:** Move the method to the class whose data it uses.

### Primitive Obsession
**Symptom:** Using `string` for emails, URLs, IDs, money.
**Fix:** Branded types: `type Email = string & { readonly brand: unique symbol };`

## Pattern Selection Rules

1. Don't use a pattern to prevent a problem you don't have. Wait for the symptom.
2. Prefer functions over classes in TypeScript. Not everything needs OOP.
3. One pattern per problem. Strategy+Factory+Observer for one feature = overengineering.
4. If the pattern adds more code than it saves, skip it.
5. Singleton is almost never the answer. Use dependency injection.

## Severity Guide

| Finding | Severity |
|---------|----------|
| God Object (10+ responsibilities in one module) | HIGH |
| Shotgun Surgery (feature change touches 5+ files) | HIGH |
| Pattern used with only one implementation | MEDIUM |
| Anemic domain model (logic in service, not entity) | MEDIUM |
| Primitive obsession on security-sensitive values | MEDIUM |
| Missing adapter on third-party integration | MEDIUM |
| Feature envy (method uses wrong class's data) | LOW |
