---
name: tdd-workflow
description: RED-GREEN-REFACTOR cycle, 80%+ coverage gates, mocking strategy, test anti-patterns
when_to_use: During node builds that include tests, and during sweep test quality audits
priority: 85
source: affaan-m/everything-claude-code
validated_at: "2026-04-09"
overrides: []
tier_filter: [MEDIUM, LARGE]
agent_filter: [builder, sweep-pathfinder]
tech_filter: []
---

# TDD Workflow

## RED-GREEN-REFACTOR Cycle

For every acceptance criterion:

1. **RED** — Write a failing test that asserts the expected behavior. Run it. Confirm it fails.
2. **GREEN** — Write the minimum code to make the test pass. No extras.
3. **REFACTOR** — Clean up duplication, naming, structure. Tests must still pass.

**Rules:**
- Never write production code without a failing test first
- Each test covers ONE behavior — if the test name has "and", split it
- Commit after each GREEN phase (not after RED)

## Test Structure — AAA Pattern

Every test follows Arrange-Act-Assert:

```typescript
it("returns 404 when user does not exist", async () => {
  // Arrange
  const repo = createMockUserRepo({ findById: async () => null });
  const service = new UserService(repo);
  // Act
  const result = await service.getUser("nonexistent-id");
  // Assert
  expect(result).toEqual({ ok: false, error: "USER_NOT_FOUND" });
});
```

- One `Act` per test — multiple acts means multiple tests
- No logic in tests (no if/else, no loops, no try/catch)
- Test names describe behavior, not implementation: "returns 404 when..." not "calls findById"

## Coverage Gates

| Metric | Minimum | Target |
|--------|---------|--------|
| Line coverage | 80% | 90%+ |
| Branch coverage | 75% | 85%+ |
| Function coverage | 85% | 95%+ |

**What to cover:**
- All acceptance criteria (1:1 mapping, reference AC IDs in describe blocks)
- All error paths and failure modes from the spec
- Edge cases: empty input, boundary values, concurrent access

**What NOT to cover (excluded from metrics):**
- Generated code, type definitions, config files
- Third-party library internals
- Simple getters/setters with no logic

## Mocking Strategy

**Mock at boundaries, not internals:**

| Layer | Mock? | How |
|-------|-------|-----|
| External APIs | YES | Mock the HTTP client or SDK |
| Database | YES (unit) / NO (integration) | Mock the repository interface |
| File system | YES | Mock fs operations |
| Internal services | RARELY | Only when testing orchestration |
| Pure functions | NEVER | Test with real inputs |

**Rules:**
- Prefer dependency injection over module mocking (`jest.mock` is a last resort)
- Mock interfaces, not implementations — `MockUserRepository` not `jest.mock("./user-repo")`
- Verify mock interactions sparingly — assert outputs, not that mocks were called
- Reset mocks between tests (`beforeEach`) — no shared mutable state

## Test File Organization

```
src/
  services/
    user-service.ts
    user-service.test.ts       # Unit tests — co-located
  routes/
    user-routes.ts
    user-routes.test.ts
tests/
  integration/
    user-flow.test.ts          # Cross-layer integration
  e2e/
    auth-journey.test.ts       # Full user journey
```

- Unit tests: co-located with source files
- Integration tests: `tests/integration/` — test service+repo together with test DB
- E2E tests: `tests/e2e/` — full HTTP requests against running server

## Test Anti-Patterns — Reject These

- **Test interdependence** — tests that fail when run in different order
- **Snapshot abuse** — snapshots for logic (only use for UI component output)
- **Testing implementation** — asserting internal state or private method calls
- **Flaky time tests** — inject clock/timer, never use real `Date.now()` in assertions
- **Giant setup** — if `beforeEach` is >10 lines, extract a factory function
- **Commenting out tests** — delete or fix, never comment out

## Integration Test Pattern

```typescript
describe("POST /api/users", () => {
  let app: Express;
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    app = createApp({ database: db });
  });
  afterAll(() => db.cleanup());
  afterEach(() => db.reset());

  it("creates user and returns 201", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ email: "test@example.com", name: "Test" });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe("test@example.com");
  });
});
```
