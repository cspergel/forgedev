---
name: coding-standards
description: KISS/DRY/YAGNI enforcement, TypeScript naming conventions, Zod validation boundaries, immutability patterns
when_to_use: Always during code generation and review for TypeScript/JavaScript projects
priority: 85
source: affaan-m/everything-claude-code
validated_at: "2026-04-09"
overrides: []
tier_filter: [MEDIUM, LARGE]
agent_filter: [builder, reviewer]
tech_filter: [typescript, javascript]
---

# Coding Standards

## Core Principles

Apply in this priority order when they conflict:

1. **KISS** — Prefer the simplest solution that works. No abstractions until the second use case.
2. **DRY** — Extract only when logic is duplicated 3+ times. Two similar blocks are NOT duplication.
3. **YAGNI** — Never build for hypothetical future requirements. Delete speculative code.

## TypeScript Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Interface/Type | PascalCase, noun | `UserProfile`, `OrderStatus` |
| Function | camelCase, verb-first | `getUserById`, `validateInput` |
| Boolean | camelCase, is/has/can/should prefix | `isActive`, `hasPermission` |
| Constant | UPPER_SNAKE for true constants | `MAX_RETRY_COUNT`, `API_BASE_URL` |
| Enum | PascalCase name, PascalCase members | `enum Role { Admin, Viewer }` |
| File | kebab-case | `user-profile.ts`, `order-service.ts` |
| Type parameter | Single uppercase or descriptive | `T`, `TResult`, `TInput` |

## Zod Validation Boundaries

Validate at ENTRY POINTS ONLY — not between internal layers:

- API route handlers (request body, params, query)
- Environment variable loading
- External service responses
- User-facing form inputs
- File/config parsing

```typescript
// GOOD: Validate once at boundary, trust internally
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});
type CreateUserInput = z.infer<typeof CreateUserSchema>;
```

**Rules:**
- Co-locate schema with its route/handler, not in a shared schemas file (unless 3+ consumers)
- Derive TypeScript types from Zod schemas via `z.infer<>`, never maintain both manually
- Use `.transform()` for normalization (trim, lowercase email) at the boundary
- Use `.refine()` for business rules that depend on multiple fields

## Immutability

- Default to `const` — use `let` only when reassignment is unavoidable
- Use `readonly` on interface properties unless mutation is the explicit purpose
- Prefer `as const` for literal objects and arrays
- Use spread/map/filter for transformations, never mutate-in-place on shared data
- Function parameters are NEVER mutated — return new values

```typescript
// GOOD: Immutable update
const updated = { ...user, lastLogin: new Date() };

// BAD: Mutation
user.lastLogin = new Date();
```

## Function Design

- Max 40 lines per function body. If longer, extract a named helper.
- Max 3 parameters. Use an options object for 4+.
- Single return type — avoid `string | null | undefined` unions. Pick one empty representation.
- Pure functions preferred: same input → same output, no side effects.
- Side effects (DB, network, file) isolated to dedicated service functions.

## Error Handling

- Use typed error classes, not bare `throw new Error("...")`.
- Never catch-and-ignore. Log or re-throw with context.
- Prefer Result types (`{ ok: true, data } | { ok: false, error }`) for expected failures.
- Reserve try/catch for unexpected failures and external boundaries.

```typescript
// GOOD: Typed result
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
```

## Import Organization

Order imports in this sequence, separated by blank lines:

1. Node built-ins (`node:fs`, `node:path`)
2. External packages (`express`, `zod`)
3. Internal aliases (`@/services`, `@/models`)
4. Relative imports (`./utils`, `../types`)

## Anti-Patterns — Reject These

- **God files** (>300 lines) — split by responsibility
- **Barrel exports** (`index.ts` re-exporting everything) — causes circular deps and tree-shaking failures
- **Any/unknown escape hatches** — narrow the type instead
- **Nested ternaries** — use early returns or switch/if-else
- **Magic strings/numbers** — extract to named constants
- **Default exports** — use named exports for refactorability
