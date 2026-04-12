# ForgePlan Ground-Up Redesign Principles

## Purpose

Capture a key lesson from POC dogfooding:

The high-level ForgePlan thesis appears directionally strong, but some parts of
the execution architecture may deserve redesign later if a cleaner structure
produces better scalability, lower token cost, and stronger long-term quality.

## Keep vs Rebuild

### Keep

These ideas currently look worth preserving:
- architecture-first building
- explicit specs and contracts
- governed code generation
- multi-stage review / verification
- durable project artifacts under `.forgeplan/`
- long-running harness behavior instead of ad hoc prompting

### Potentially Rebuild

These areas may deserve substantial redesign later:
- control-plane orchestration
- phase handoff structure
- session/context management
- agent context packaging
- escalation policy
- backend/runtime abstraction

## Principle

It is acceptable to redo parts of the implementation later if:
- the core build mentality stays intact
- the new structure is cleaner
- the result scales better
- token cost drops materially
- long-running autonomy becomes more reliable
- the architecture becomes more model-agnostic

Do not preserve a clumsy implementation just because it came first.
Preserve the right ideas; redesign the weak machinery.

## Preferred Direction

If ForgePlan is rebuilt more cleanly later, favor:
- artifact-first orchestration
- state-machine-driven phase transitions
- compact handoff artifacts instead of large message relays
- durable session state outside the model context window
- selective escalation instead of expensive review everywhere
- formal backend/role adapters
- narrower context packets by lens

## Warning

Do not confuse:
- "the current plugin implementation"
with
- "the actual ForgePlan product thesis"

The plugin is a proving ground, not necessarily the final architectural shape.

## Practical Rule

When evaluating future redesigns, ask:

1. Does this preserve the core governance thesis?
2. Does this reduce waste at scale?
3. Does this improve portability across models/runtimes?
4. Does this make long-running autonomous execution more robust?

If yes, a significant redesign can be the correct move rather than a failure of
the original concept.
