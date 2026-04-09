---
name: mastering-typescript
description: Branded types, discriminated unions, advanced generics, Zod boundary validation for type-safe architectures
when_to_use: During code generation and contract review for TypeScript projects requiring strong type guarantees
priority: 80
source: SpillwaveSolutions
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [builder, sweep-contractualist]
tech_filter: [typescript]
---

# Mastering TypeScript

## Branded Types

Use branded types to prevent accidental mixing of structurally identical primitives:

```typescript
type UserId = string & { readonly __brand: "UserId" };
type OrderId = string & { readonly __brand: "OrderId" };
```

**Rules:**
- Brand all entity IDs — never pass raw `string` between service boundaries
- Create branded types for domain units (currency, weight, duration) that share a primitive base
- Brand at construction (factory function or Zod `.transform()`), trust internally
- Never cast to branded type outside the factory — use a constructor function

```typescript
const userId = (id: string): UserId => id as UserId;
```

## Discriminated Unions

Model every state machine and variant as a discriminated union:

```typescript
type Result<T> =
  | { status: "ok"; data: T }
  | { status: "error"; error: string };
```

**Rules:**
- Use a single literal `kind`, `type`, or `status` field as the discriminant
- Every branch must be handled — enable `noUncheckedIndexedAccess` and `strictNullChecks`
- Never use `default` in switch on discriminated unions — forces compile error on new variants
- Prefer unions over enums — unions are narrowable, enums are not

## Advanced Generics

**Constrain, don't widen:**

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

**Rules:**
- Max 3 type parameters per function. More means the API is too complex.
- Always constrain with `extends` — naked `T` is almost always wrong
- Use `infer` in conditional types to extract nested types, not manual indexing
- Prefer mapped types (`Pick`, `Omit`, `Partial`) over manual property copying
- Avoid `as` assertions — if you need one, the types are wrong upstream

## Utility Type Patterns

| Pattern | Use Case |
|---------|----------|
| `Readonly<T>` | All DTOs and response types |
| `Pick<T, K>` | API responses that expose subset of entity |
| `Omit<T, K>` | Form inputs that exclude server-generated fields |
| `Record<K, V>` | Lookup maps with known key sets |
| `Extract<T, U>` | Narrow a union to matching members |
| `NonNullable<T>` | After null-check guard, assert the narrowed type |

## Zod + TypeScript Integration

- Define Zod schema FIRST, derive TypeScript type with `z.infer<>`
- Never maintain a Zod schema AND a separate interface for the same shape
- Use `.brand<>()` to produce branded types from Zod validation

```typescript
const UserIdSchema = z.string().uuid().brand<"UserId">();
type UserId = z.infer<typeof UserIdSchema>;
```

**Boundary validation pattern:**
- Validate at API entry, environment loading, external responses
- Internal function signatures use the inferred type, never re-validate
- Use `.transform()` for normalization (trim, lowercase) at the boundary only

## Type Narrowing

- Prefer `in` operator and type predicates over `as` casts
- Write custom type guards for complex domain checks
- Never use `any` to bypass narrowing — use `unknown` + guard instead

```typescript
function isUser(obj: unknown): obj is User {
  return typeof obj === "object" && obj !== null && "email" in obj;
}
```

## Anti-Patterns — Reject These

- **`any` usage** — always narrow to `unknown` + type guard
- **Type assertions (`as`)** — fix the upstream type instead
- **Enums with string values** — use `as const` objects or union literals
- **`Object` / `Function` types** — use specific shapes and signatures
- **Ignoring strict mode errors** — fix them, never `@ts-ignore`
- **Index signatures on known shapes** — use explicit properties or `Record`
- **Generic sprawl** (4+ type params) — simplify the API surface
