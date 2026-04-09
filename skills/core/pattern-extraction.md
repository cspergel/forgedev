---
name: pattern-extraction
description: Structured Problem-Pattern-Rationale-When-to-use format for capturing reusable patterns from research and code
when_to_use: During research to capture and structure recurring patterns for reuse by builder and architect agents
priority: 75
source: affaan-m methodology
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [researcher]
tech_filter: []
---

# Pattern Extraction

## Purpose

When research or code review reveals a reusable pattern, capture it in structured format that downstream agents (builder, architect) can consume directly. Every pattern becomes a potential SKILL.md candidate.

## Pattern Template

```markdown
## Pattern: [Name]

**Problem:** What situation triggers the need for this pattern?
**Context:** What conditions must be true for this pattern to apply?
**Solution:** The concrete implementation approach (with code).
**Rationale:** Why this solution over alternatives.
**When to use:** Specific triggers (tech stack, project size, domain).
**When NOT to use:** Conditions where this pattern is harmful.
**Trade-offs:** What you gain and what you pay.
**Examples:** 1-2 real code examples showing the pattern applied.
```

## Extraction Process

### Step 1: Identify the Pattern
A pattern exists when:
- The same structure appears in 3+ independent sources
- Multiple projects solve the same problem the same way
- A library/framework ASSUMES this structure (it's conventional)
- An anti-pattern is well-documented (the pattern is what to do INSTEAD)

### Step 2: Name It Precisely
Good names describe the mechanism, not the domain:
- "Repository per aggregate" not "database access pattern"
- "Circuit breaker on external calls" not "error handling"
- "Discriminated union for state" not "TypeScript pattern"
- "Zod at the boundary" not "validation"

### Step 3: Capture the Minimum
Include only what a builder needs to implement it. No history, no alternatives comparison, no theoretical background.

**Include:**
- The problem statement (1-2 sentences)
- The solution (code or structural description)
- When to use / when not to use
- One concrete example

**Exclude:**
- Origin story ("this pattern was introduced by...")
- Exhaustive comparison with alternatives
- Academic classification (GoF category, etc.)
- Edge cases the builder won't encounter in this project

### Step 4: Validate Against Code
Before finalizing, check the pattern against the project's codebase:
- Does the tech stack support this pattern natively?
- Does the framework already provide this? (don't reinvent)
- Is there an existing instance in the code to reference?
- Does it conflict with any established project pattern?

## Pattern Categories

### Structural Patterns
How code is organized. Extracted when seeing repeated file/module structures.

```markdown
## Pattern: Service-Repository Separation

**Problem:** Business logic mixed with data access makes testing hard and changes risky.
**Solution:** Service layer owns business rules. Repository layer owns data access. Service calls repository, never the reverse.
**When to use:** Any project with a database and business logic beyond CRUD.
**When NOT to use:** Simple CRUD with no business rules (repository IS the service).
**Trade-off:** More files, but each is testable in isolation.
```

### Behavioral Patterns
How operations are performed. Extracted from repeated runtime sequences.

```markdown
## Pattern: Validate-Transform-Persist

**Problem:** Raw user input reaches business logic or database unsanitized.
**Solution:** Three explicit steps: (1) Validate input shape with Zod/schema, (2) Transform to internal representation, (3) Persist via repository.
**When to use:** Every write operation that accepts external input.
**When NOT to use:** Internal service-to-service calls with already-validated data.
```

### Error Patterns
How failures are handled. Extracted from repeated error-handling structures.

```markdown
## Pattern: Typed Error Classes

**Problem:** Catch blocks can't distinguish between error types, leading to generic handling.
**Solution:** Define error classes per domain (AuthError, ValidationError, NotFoundError). Catch specifically, let unknown errors propagate.
**When to use:** Any project with more than one error category.
**When NOT to use:** Scripts or CLIs where process.exit is acceptable.
```

### Integration Patterns
How systems connect. Extracted from API/service interaction shapes.

```markdown
## Pattern: Anti-Corruption Layer

**Problem:** External API shapes leak into internal domain model.
**Solution:** Adapter module translates between external API types and internal types. Internal code never imports external types directly.
**When to use:** Any third-party API integration (Stripe, Supabase, external service).
**When NOT to use:** Internal service-to-service where you control both sides.
```

## Quality Checks for Extracted Patterns

- [ ] Problem statement describes a real pain point, not a hypothetical
- [ ] Solution is implementable from the description alone (no guessing)
- [ ] "When to use" has at least one concrete trigger condition
- [ ] "When NOT to use" prevents over-application
- [ ] Example compiles and runs (not pseudocode)
- [ ] Pattern is not already covered by an existing skill
- [ ] Pattern is not framework-specific (those go in conditional skills)

## Converting Patterns to Skills

When a pattern is validated and broadly useful:
1. Check if it fits an existing skill (add as a section, don't create new)
2. If new skill: follow SKILL.md format with frontmatter
3. Set priority: project-specific (50-79), research-generated (40-49)
4. Place in `.forgeplan/skills/` for project scope or `skills/core/` for universal
5. Run `/forgeplan:skill refresh` to update registry
