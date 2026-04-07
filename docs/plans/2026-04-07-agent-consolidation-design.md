# Agent Consolidation Design

**Date:** 2026-04-07
**Status:** Design complete. Implementation: write new agent files now, rewire sweep.md after Sprint 9.
**Context:** Product strategy decision to reduce sweep token cost and convergence time by consolidating 12 domain agents + 4 team agents (16 total) into 5 broadened team agents, all opus. Plus 5 new pre-build review agents for design/spec/plan validation.

---

## Foundational Principle: Architecture Down, Node Up

Everything in ForgePlan flows from this principle. It's not purely top-down or bottom-up — it's both, at different levels.

### The Principle

```
ARCHITECTURE DOWN (design time):
  Vision → Manifest → All nodes defined → All interfaces specified
  "Here's the whole system, here's how everything connects"

NODE UP (build time):
  Database first → Auth on top → API on top → Frontend on top
  "Build each piece bottom-up in dependency order, slotting into the architecture"
```

You design the building from the roof down (how many floors, where the elevator shafts go, where the plumbing runs). You *build* it from the foundation up. But because you designed it top-down, the plumber on floor 3 knows exactly where the pipes from floor 4 will connect.

### The Manifest Is the Spine

Every artifact and every agent in ForgePlan is structured around the manifest's node graph:

```
Manifest (node graph + interfaces + shared models)
    ↓ shapes
Design docs (structured around nodes + boundaries)
    ↓ shapes
Specs (one per node, referencing manifest contracts)
    ↓ shapes
Implementation plans (phase → node → task)
    ↓ shapes
Code (built per-node, enforced by hooks)
    ↓ validated by
Sweep agents (review per-node against specs)
    ↑ validated by
Review agents (review docs per-node against manifest)
```

Without node-structured documents, agents can't do node-aware review. Without node-aware review, you miss interface mismatches. Without catching interface mismatches early, you get drift. The manifest enables the entire chain.

### What This Means for Agents

Pre-build review agents don't review prose — they review prose *against architecture*:

- **Red** checks assumptions about nodes that *don't exist yet* — Sprint 2's plan assumes auth works a certain way, is that matching the actual auth spec?
- **Orange** checks contracts *between* nodes — does Sprint 2's API node consume Sprint 1's auth interface correctly?
- **Blue** traces flows *across* nodes — does the user journey survive the node boundary?
- **White** checks completeness *per node* against its spec — does every AC for this node have tasks?
- **Rainbow** checks the phasing — are we building the right nodes in the right sprint? Is the dependency order correct?

### Current Gaps (to be closed post-Sprint 9)

**Gap 1: No `phase` field on nodes.**
The manifest has no way to tag nodes with "build in Sprint 1" vs "build in Sprint 2." The multi-phase document handling in the architect currently makes later phases into *non-goals* rather than *deferred nodes*. Later phases should stay as real nodes with defined interfaces, just tagged `phase: N` and `status: deferred`.

*Fix:* Add `phase` field to manifest node schema. Values: integer (1, 2, 3) or `"future"`. Discovery tags every node with a phase. Phase-aware commands only operate on the current phase's nodes.

**Gap 2: No pre-build review insertion point.**
The pipeline currently goes: `discover → spec → build → review → sweep`. There's nowhere for review agents to run before spec or build.

*Fix:* Add review gates to the pipeline:
```
discover → [REVIEW manifest+design] → spec → [REVIEW each spec] → plan → [REVIEW plan] → build
```
Can be integrated into existing commands as pre-flight checks or as a new `/forgeplan:review-design` command.

**Gap 3: Interface contracts in skeleton specs are too vague.**
Skeleton specs have `interfaces` with `target_node` and prose `contract` descriptions. Orange needs concrete field names, types, response shapes, and status codes.

*Fix:* Skeleton specs include structured interface contracts:
```yaml
interfaces:
  - target_node: api
    direction: outbound
    contract:
      endpoint: "POST /auth/login"
      request: { email: string, password: string }
      response: { user_id: string, token: string, role: string }
      errors: [401, 422]
```

**Gap 4: Implementation plans aren't a formal artifact.**
No `/forgeplan:plan` command. Flow goes spec → build directly. If review agents should review plans, plans need to exist as structured, node-centric documents.

*Fix:* Add `/forgeplan:plan [node-id | --phase N]` that generates a node-structured implementation plan from specs. Review agents validate before build.

**Gap 5: Multi-phase handling is backwards.**
Currently "later phases become non-goals." Under Architecture Down, later phases should remain as real nodes with `phase: N` and `status: deferred`, interfaces fully defined. The architecture captures the full vision, not a truncated version.

*Fix:* Architect's multi-phase handling changes to keep all nodes in manifest with phase tags. Only non-goals are things genuinely OUT of scope, not "later."

---

## Part 1: Consolidated Sweep Agents (Post-Build Code Review)

### Motivation

- 16 agents cause inter-agent disagreement that drives oscillation and slow convergence
- Token cost scales linearly with agent count
- Most domain agents catch issues a well-prompted broader agent would also catch
- Fewer agents = fewer opinions = faster convergence = lower total cost
- "Buy once cry once" — all opus, get it right in fewer passes

### The Lineup

| Agent | Color | Stance | Key Question | Model |
|---|---|---|---|---|
| Red | Adversarial | Break it | "What input makes this fail?" | opus |
| Orange | Contract | Diff it | "Do both sides agree on the shape?" | opus |
| Blue | Experience | Walk it | "Can a human complete this flow?" | opus |
| Rainbow | Architect | Zoom out | "Does this make sense? Is it too complex?" | opus |
| White | Compliance | Trace it | "Does the code do what the spec says? What did everyone miss?" | opus |

### Red Agent (Adversarial)

**Absorbs:** auth-security, error-handling, config-environment, database

**Primary stance:** "I'm trying to break this." Every check starts from the attacker/bad-input perspective.

**What it audits:**
- **Security boundaries:** Auth bypasses, role escalation, session hijacking, CSRF, injection (SQL, XSS, command). For each auth gate, find an input that passes incorrectly. For each allowed operation, check if it can write/delete outside its scope.
- **Error handling:** Follow every error from throw to catch. Does the right error reach the right handler? Can an error put the system in an unrecoverable state? Are there unhandled promise rejections, empty catches, swallowed errors that hide real problems?
- **Config/environment:** Secrets in code, missing env var validation, config drift between .env.example and actual usage, hardcoded values that should be configurable. Default values that are insecure.
- **Database:** SQL injection, missing parameterized queries, connection pool leaks, missing indexes on frequently queried fields, N+1 query patterns, transactions that can leave partial state on failure. Missing cascade deletes that create orphaned records.

**How it works:** For each finding domain, the agent traces execution with pathological inputs — empty strings, null, boundary values, unicode edge cases, path traversal. It doesn't just check "does validation exist" — it checks "can I get past the validation."

**Confidence calibration:** 90+ = specific exploit path demonstrated. 75-89 = pattern is vulnerable but exploit depends on runtime context. Below 75 = filtered out.

### Orange Agent (Contract)

**Absorbs:** type-consistency, api-contracts, imports, cross-node-integration

**Primary stance:** "Does every producer and consumer agree on the shape of data?" Every check traces data as it crosses a boundary — function calls, API endpoints, imports, shared models.

**What it audits:**
- **Type consistency:** Shared models in the manifest vs actual type definitions in code. Fields added in one place but missing in another. Enum values that a producer emits but a consumer doesn't handle. `as any` or `@ts-ignore` hiding real mismatches.
- **API contracts:** Request/response shapes match between caller and handler. Status codes are consistent (does the frontend handle every status the backend can return?). Query parameters, headers, and body schemas agree across the boundary. Pagination contracts match (offset/limit vs cursor — both sides agree).
- **Import chains:** Circular dependencies. Importing from a path that bypasses the module's public API. Re-exports that silently drop members. Barrel files that pull in unused heavy modules.
- **Cross-node integration:** Data flowing from Node A to Node B — does the shape survive the journey? Field renames, optional vs required mismatches, date format differences (ISO string vs timestamp vs Date object). When Node A adds a field, does Node B's consumer handle it or silently drop it?

**How it works:** For each shared model and each API boundary, the agent reads both sides — the producer and the consumer — and diffs them. It doesn't trust types alone; it checks runtime serialization/deserialization too (JSON.parse dropping undefined fields, Date objects becoming strings).

**Confidence calibration:** 90+ = concrete field/type mismatch cited on both sides. 75-89 = mismatch likely but one side uses dynamic typing. Below 75 = filtered.

### Blue Agent (Experience)

**Absorbs:** frontend-ux, test-quality, user-flows

**Primary stance:** "Does the human experience actually work end-to-end?" Every check follows a real user or a real test through the system, not just individual components in isolation.

**What it audits:**
- **User flows:** Trace each user journey from the spec's acceptance criteria through actual code. Can the user complete the flow? Are there dead-end error states where no action helps? Misleading error messages that don't tell the user what to do? States where the UI shows stale data after a mutation?
- **Frontend UX:** Loading states — what does the user see during async operations? Empty states — what happens when there's no data? Error states — does the UI recover gracefully or just show a blank screen? Accessibility basics — form labels, keyboard navigation, focus management after modals/dialogs. Responsive breakpoints if applicable.
- **Test quality:** Do tests actually assert behavior or just assert that code ran without throwing? Tests that mock so heavily they're testing the mock, not the code. Missing negative test cases (does it test what should fail, not just what should pass?). Flaky patterns — shared state between tests, time-dependent assertions, order-dependent test suites. Coverage gaps where spec acceptance criteria have no corresponding test.

**How it works:** The agent reads specs first to understand intended user journeys, then traces each journey through the code — route → controller → service → database → response → UI render. It's looking for breaks in the chain, not isolated component issues.

**Confidence calibration:** 90+ = traced a complete flow, found a concrete break point. 75-89 = flow likely broken but depends on state/timing. Below 75 = filtered.

### Rainbow Agent (Architect)

**Absorbs:** code-quality, documentation, holistic architecture, simplicity review

**Primary stance:** "Zoom out. Does this system make sense as a whole? Is anything harder than it needs to be?"

**What it audits:**
- **Over-engineering detection:** Abstractions with only one consumer — a factory pattern for one class, a strategy pattern with one strategy, a config system for 3 values. Middleware chains where a simple function call would do. Custom implementations of things a standard library or framework already provides (hand-rolled auth when Passport/NextAuth exists, custom validation when Zod/Joi is already in the deps). Premature generalization — code built for flexibility nobody asked for. Deep inheritance hierarchies that could be flat composition. Event systems where a direct function call is clearer.
- **Code quality patterns:** Duplicated logic, inconsistent naming, dead code, unnecessary re-renders, missing caching, synchronous operations that should be async.
- **Documentation accuracy:** Do README instructions work? Do comments match reality?
- **Architectural coherence:** Unexpected couplings, leaky abstractions, inconsistent patterns, layer violations, files in wrong directories.

**How it works:** For simplicity detection specifically, Rainbow asks: "Could a junior developer understand this in 5 minutes? If not, is the complexity earning its keep or is it accidental?" It compares the complexity of the solution against the complexity of the problem from the spec. A 3-field form with a Redux store, 4 custom hooks, and a saga is a finding.

**Confidence calibration:** 90+ = concrete over-engineering with simpler alternative named. 75-89 = complexity suspicious but might be justified by requirements not in spec. Below 75 = filtered.

### White Agent (Compliance + Fresh Eyes + Gap Finder)

**Absorbs:** spec compliance tracing, generalist review, cross-agent gap detection

**Primary stance:** "Does the code do what the spec says? What did everyone else miss? What just seems off?"

**Pass 1 mode (parallel with other agents):**
- **Spec compliance tracing:** For each acceptance criterion in the node spec, trace through the code and confirm it's actually implemented — not just that a function exists with the right name, but that the behavior matches. "User can upload PDF up to 10MB" → find the upload handler → check the size limit → check it rejects 11MB → check the error message. If a criterion has no corresponding code path, that's a finding.
- **Fresh-eyes generalist:** Logic bugs — inverted conditions, off-by-one errors, wrong comparison operators, calculations that don't match the domain. Missing functionality that falls between nodes — the spec says "send confirmation email" but no node owns email sending. Race conditions in async flows. Default values that are wrong for the domain (timeout of 0, page size of 10000). Copy-paste code where one copy was updated but the other wasn't.

**Pass 2+ mode (adds gap finding):**
- Everything from Pass 1, plus:
- **Cross-agent gap analysis:** Receives the previous pass's findings from Red, Orange, Blue, and Rainbow. Looks at what they collectively didn't check. If Red tested auth boundaries but nobody checked the password reset flow, White flags it. If Orange verified API contracts but nobody checked webhook payload shapes, White catches it. Essentially asks: "What corners of the codebase did no agent touch?"

**How it works:** White reads specs first, builds a mental checklist of every acceptance criterion, then traces each one through code. It's the only agent that explicitly maps spec → code, making it the ground truth for "is this feature actually done?" On pass 2+, it also reads the other agents' finding lists and deliberately looks in the places they didn't.

**Confidence calibration:** 90+ = spec criterion with no corresponding code path, or concrete logic bug with wrong output demonstrated. 75-89 = code exists but behavior likely doesn't match spec intent. Below 75 = filtered.

### Tier Dispatch

| Tier | Agents | Count | Rationale |
|---|---|---|---|
| SMALL | Red + Orange + White | 3 | Security, contracts, spec compliance — the stuff that breaks apps |
| MEDIUM | Red + Orange + Blue + White | 4 | Add user experience and test quality coverage |
| LARGE | All 5 | 5 | Add architectural coherence and simplicity review |

### Timing Model (Option A — Hybrid)

- **Pass 1:** All tier-selected agents run in parallel. White does spec compliance + fresh-eyes.
- **Pass 2+:** All agents run in parallel again. White additionally receives the previous pass's findings from all other agents and adds gap-finding to its mandate.
- **Convergence:** Same progressive reduction rules — agent returns CLEAN twice → retired. Anti-oscillation guard at 3 passes. But with only 5 agents instead of 16, expect convergence in 1-2 passes instead of 3-4.

### Migration Path

This is a post-Sprint 9 change. The consolidation involves:
1. Update the 4 existing team agent `.md` files (Red, Orange, Blue, Rainbow) with broadened prompts
2. Create new `agents/sweep-white.md` (or name TBD)
3. Update `commands/sweep.md` Phase 2 tier selection to reference only the 5 team agents
4. Update CLAUDE.md agent tables
5. Old domain agent `.md` files can be archived or deleted — they're just prompt files, no scripts depend on them
6. No schema changes needed — `agent_convergence` tracks by agent name, which just changes
7. No script changes needed — sweep dispatches agents by reading `.md` files

### Expected Impact

- **Token cost:** ~60-70% reduction per sweep (5 opus agents × 1-2 passes vs 16 mixed agents × 3-4 passes)
- **Convergence speed:** 1-2 passes expected (fewer agents = fewer disagreements)
- **Finding quality:** Equal or better (opus on everything, broader context per agent)
- **Oscillation risk:** Significantly reduced (5 opinions vs 16)

---

## Part 2: Failure Modes in Plans, Specs, and Design Docs

Based on analysis of Sprint 9's 46 independent review passes (22 design + 24 implementation plan), which caught 45+ distinct issues and resulted in only 1 critical during a 20-task build.

### The 8 Failure Modes

| # | Failure Mode | Count in Sprint 9 | Pre-Build Agent |
|---|---|---|---|
| 1 | Wrong assumptions — things believed true but aren't | 3 | Red |
| 2 | Missing specifications — things not defined | 8 | White |
| 3 | Interface/contract mismatches — two sides disagree | 7 | Orange |
| 4 | Security vulnerabilities — exploitable patterns in design | 5 | Red |
| 5 | Atomicity/crash recovery gaps — multi-step without safety | 4 | Blue |
| 6 | Logic flaws / order-of-operations — sequence doesn't work | 5 | Blue |
| 7 | Incomplete edge cases — undefined behaviors | 4 | White |
| 8 | Performance/DoS risks — scalability and abuse patterns | 3 | Red |

### Key Insights from Sprint 9 Data

- **Interface mismatches (#3) were the biggest category** — 7 findings. These are the exact bugs that cause "it compiles but doesn't work" in code. Orange agent territory.
- **Missing specs (#2) were second** — 8 findings of "you didn't define this." White agent territory.
- **Security (#4) required specialized reviewers** — Qwen found 3 CRITICALs that 19 Claude + Codex reviewers missed. Red agent territory.
- **Wrong assumptions (#1) were caught by cross-team review** — no single reviewer caught SessionEnd being fake. Multiple perspectives needed.
- **Logic flaws (#6) were caught by flow-tracing** — Blue agent territory ("walk through this step by step").

### Evidence: Review Investment ROI

- **46 pre-implementation review passes** across design + implementation plan
- **0 remaining findings** at completion
- **Only 1 critical issue** found during 20-task build
- Validates the "buy once cry once" approach — front-loaded review dramatically reduces downstream code fixes

---

## Part 3: Pre-Build Review Agents

### Motivation

Same 5 colors as the sweep agents, but adapted for reviewing **text documents** instead of code. These agents work at three insertion points in the pipeline:

1. **After discovery** → review the manifest + design doc (or imported document)
2. **After each spec** → review the spec against manifest + other specs
3. **After implementation plan** → review plan against design + specs
4. **On imported documents** → review for all 8 failure modes before extraction

Each agent has one definition but is phase-aware — adjusts what it looks for based on what it's reviewing.

### The Lineup

| Agent | Color | Design Docs | Specs | Impl Plans | Model |
|---|---|---|---|---|---|
| Red | Adversarial | False assumptions, security-by-design, perf risks | False AC assumptions, injection vectors | Wrong APIs, unsafe code examples | opus |
| Orange | Contract | Internal contradictions, naming drift, cross-doc consistency | Interface mismatches between specs, shared model drift | Code shape mismatches between tasks | opus |
| Blue | Flow | Unhappy paths, atomicity gaps, bootstrap order | Circular deps, out-of-order user actions | Task ordering, missing rollback | opus |
| White | Completeness | Missing specs, vague requirements, orphan references | Untestable ACs, missing edge cases, undefined defaults | Missing verification, assumed context | opus |
| Rainbow | Architect | Wrong decomposition, over/under-engineering, tech stack fit | Scope vs tier mismatch, too many/few ACs | Uneven task sizes, missed simpler approaches | opus |

### Pre-Build Red Agent (Assumptions + Security + Performance)

**Primary stance:** "What in this document is false, exploitable, or will break under load?"

**On design docs / imported documents:**
- **Wrong assumptions:** Does this reference APIs, hooks, features, or tools that don't actually exist? (Sprint 9: SessionEnd hook didn't exist. `deep-building` wasn't a valid status.) Cross-check claims against actual platform docs, framework capabilities, and the project's existing codebase.
- **Security designed-in:** Does the architecture create attack surfaces? Auth flow with no rate limiting. User input flowing to shell commands. Secrets stored in client-accessible locations. Trust boundaries that exist only in prose, not structurally.
- **Performance/DoS:** Regex patterns that can backtrack. Unbounded loops in described algorithms. Missing pagination on data-heavy queries. Missing exclusion patterns for file scanning operations.

**On specs:**
- Are any acceptance criteria based on false assumptions about the framework/platform?
- Does the spec introduce security-relevant behavior without constraints (e.g., "user can upload files" with no size/type limits)?
- Are there injection vectors in described input handling?

**On implementation plans:**
- Do the code examples reference real APIs/methods? (Sprint 9 Codex caught wrong variable names, non-existent status values)
- Are shell commands cross-platform safe?
- Do code snippets have security issues that would survive into implementation?

**Confidence calibration:** 90+ = verified the assumption is false (checked docs/code). 75-89 = assumption is suspicious, couldn't fully verify. Below 75 = filtered.

### Pre-Build Orange Agent (Contract Consistency)

**Primary stance:** "Do all the interfaces, schemas, and cross-references in this document agree with each other and with existing artifacts?"

**On design docs / imported documents:**
- **Internal contradictions:** Page 3 says REST, page 7 says GraphQL. Auth section says JWT, API section says sessions. Feature list says 5 user roles, data model shows 3. Scan the entire document for claims that conflict with other claims in the same document.
- **Cross-document consistency:** Does this design doc match the existing manifest? If shared models are mentioned, do they match what's already defined? If the doc references existing nodes, do the interfaces align?
- **Naming consistency:** Is the same concept called different names in different sections? (`user_id` vs `userId` vs `userID` vs `user.id`). Field names, endpoint paths, component names — anything referenced in multiple places must use the same name everywhere.
- **Import/export contracts:** When the doc describes data flowing between components, does the producer's described output match the consumer's expected input? Every boundary crossing in the design is a potential mismatch.

**On specs:**
- Does this spec's interface contract match what other specs expect? If auth returns `{user_id}`, does the API spec consume `{user_id}` or `{userId}`?
- Do shared model references match the manifest definition exactly — same fields, same types, same optional/required?
- Do status codes, error shapes, and response formats agree across specs for the same boundary?
- Are enum values consistent — if one spec defines roles as `["client", "accountant"]`, does every other spec use those exact strings?

**On implementation plans:**
- Do code examples use the same variable names, function signatures, and return types as the spec they implement?
- Do file paths in the plan match the node's `file_scope` in the manifest?
- When one task's code produces output consumed by another task's code, do the shapes match?

**Confidence calibration:** 90+ = concrete mismatch cited on both sides with exact text. 75-89 = naming/format inconsistency that's likely unintentional. Below 75 = filtered.

### Pre-Build Blue Agent (Flow Tracing + Atomicity)

**Primary stance:** "Walk through every described sequence step by step. Does it actually work? What happens when it doesn't?"

**On design docs / imported documents:**
- **Flow completeness:** For every user journey or system process described, trace it start to finish. Does step 3 depend on something step 2 doesn't produce? Is there a step where the doc says "then X happens" without explaining how? Are there branches that lead nowhere — error states with no recovery, conditions with no else?
- **Unhappy paths:** The doc describes what happens when things work. What happens when they don't? Network timeout during step 4. User cancels mid-flow. External API returns unexpected format. Database write succeeds but the next step fails — is the system in a consistent state?
- **Atomicity gaps:** Multi-step operations that can fail partway through. Sprint 9: split operation spanned multiple files with no breadcrumb — Blue caught this. Any described sequence that modifies multiple resources needs a rollback or recovery story.
- **Order-of-operations:** Can the described steps actually happen in the described order? Sprint 9: SessionStart compilation would have blocked startup. Builder reading rules.md before first compile — rules.md doesn't exist yet. Dependency chains that create deadlocks or bootstrap problems.

**On specs:**
- For each acceptance criterion, trace the flow through the described architecture. Does the data arrive where it needs to be? Does every async operation have a defined timeout and failure mode?
- Are there circular dependencies between specs? Node A depends on Node B which depends on Node A during initialization.
- What happens when the user does things out of the expected order? Skips a step? Does the same step twice?

**On implementation plans:**
- Are tasks ordered correctly? Does Task 5 modify a file that Task 3 needs to read in its original form?
- Do verification steps actually verify the right thing? "Run npm test" after a task that didn't touch any tested code is a false confidence signal.
- Are there tasks that should be atomic but are split across multiple steps with no rollback?

**Confidence calibration:** 90+ = traced a specific sequence, found a concrete break point or missing recovery path. 75-89 = flow likely has an issue but depends on runtime behavior not specified in the doc. Below 75 = filtered.

### Pre-Build White Agent (Completeness + Edge Cases)

**Primary stance:** "What's not here that should be? What's defined but not defined enough?"

**On design docs / imported documents:**
- **Missing specifications:** Things the author knew what they meant but didn't write down. Sprint 9 had 8 of these — formats unspecified, schemas undefined, algorithms described in vibes not steps. For every noun introduced (a data structure, a process, a rule), White checks: is there enough detail for someone else to implement this without guessing?
- **Incomplete edge cases:** What happens with 0 items? 1 item? 10,000 items? What happens with empty strings, special characters, concurrent access? For every input or data set described, White asks: what are the boundaries and are they specified?
- **Scope creep detection:** Buried requirements that add significant work without acknowledgment. "And it should also support..." halfway through a paragraph. Features mentioned once in passing that imply entire subsystems. If a requirement is mentioned, it should either be explicitly in scope with a node/spec owning it, or explicitly listed as a non-goal.
- **Vague requirements disguised as specific ones:** "The system should handle high traffic." What's high? "Errors should be handled gracefully." What's gracefully? "The UI should feel fast." What's fast? Every qualitative statement needs a quantitative threshold or a concrete behavior.
- **Orphan references:** The doc mentions Stripe but no spec covers payments. A data model references "notifications" but no node owns notification sending. Every capability mentioned must trace to something that implements it.

**On specs:**
- **Untestable acceptance criteria:** Can each AC be verified with a concrete test? "User has a good experience" is not testable. "User sees a loading spinner within 200ms of clicking submit" is. Every AC must have a binary pass/fail condition.
- **Missing ACs:** Compare the spec against the manifest's node description and shared models. Are there obvious behaviors that the node should handle but no AC covers? Auth node with no "failed login" AC. API node with no "malformed request" AC.
- **Undefined defaults:** When the spec says a field is "optional," what happens when it's absent? What's the default? Is the default consistent with what consuming nodes expect?

**On implementation plans:**
- **Missing verification steps:** Does every task have a way to confirm it worked? Sprint 9 implementation plan had explicit verification after each task — plans without this are flying blind.
- **Assumed context:** Does the plan assume knowledge it doesn't state? "Update the existing handler" — which handler? In which file? At which line? Plans should be implementable by someone with zero context.
- **Dependency gaps:** Does the plan reference libraries, tools, or services that aren't in the project yet? Who installs them? When?

**Confidence calibration:** 90+ = specific missing item that would block implementation or cause ambiguity. 75-89 = item is vaguely defined but implementable with reasonable assumptions. Below 75 = filtered.

### Pre-Build Rainbow Agent (Architecture + Simplicity)

**Primary stance:** "Is this design the right size for the problem? Is anything over-engineered or under-thought?"

**On design docs / imported documents:**
- **Wrong decomposition:** Too many components for a simple app, too few for a complex one. A SMALL-tier project with 7 nodes is over-decomposed. A LARGE-tier project with 2 mega-nodes is under-decomposed. Rainbow checks whether the node count and granularity match the complexity tier and the actual problem size.
- **Over-engineering in the design:** Microservices for a single-user tool. Event sourcing for a CRUD app. Custom auth when a managed service would do. Abstraction layers described in the architecture that serve no purpose yet. If the design describes machinery that the requirements don't demand, Rainbow flags it — catch it now before someone builds it.
- **Under-engineering for the tier:** The opposite — a LARGE project with compliance requirements that handwaves auth as "standard OAuth." A multi-tenant system with no described isolation model. Complexity that the design acknowledges but doesn't address.
- **Tech stack fit:** Is the chosen tech stack appropriate for the problem? React for a static marketing page. A full ORM for 2 database tables. WebSockets for data that updates once a day. Does the stack match the scale, the team's expertise (if known), and the deployment target?
- **Phasing/sprint feasibility:** Can this actually be built in the described phases? Is there a phase that depends on 3 previous phases all being complete? Is the first deliverable too large to be useful feedback? Rainbow thinks about build order at the strategic level — not task ordering (Blue's job), but "should Sprint 1 ship auth before the API that uses it?"

**On specs:**
- Is this spec trying to do too much? A single node with 25 acceptance criteria probably needs splitting.
- Is this spec too thin? A critical node with 3 vague ACs probably needs more thought.
- Does the spec's scope match its `file_scope`? A node with `src/**` and 20+ planned files is a red flag for SMALL/MEDIUM tier.

**On implementation plans:**
- Are the task sizes roughly even, or is Task 3 a monster while Tasks 1, 2, 4, 5 are trivial? Uneven tasks signal wrong decomposition.
- Are there simpler approaches the plan doesn't consider? A 200-line script described in the plan when a 20-line alternative exists.
- Does the plan's estimated complexity match the design's stated tier?

**Confidence calibration:** 90+ = concrete over/under-engineering with specific simpler/more robust alternative named. 75-89 = design complexity seems mismatched but could be justified by unstated requirements. Below 75 = filtered.

### Foundational Principle: Architecture Down, Node Up

ForgePlan's approach is not purely top-down or bottom-up — it's both, at different levels:

```
ARCHITECTURE DOWN (design time):
  Vision → Manifest → All nodes defined → All interfaces specified
  "Here's the whole system, here's how everything connects"

NODE UP (build time):
  Database first → Auth on top → API on top → Frontend on top
  "Build each piece bottom-up in dependency order, slotting into the architecture"
```

You design the building from the roof down (how many floors, where the elevator shafts go, where the plumbing runs). You *build* it from the foundation up. But because you designed it top-down, the plumber on floor 3 knows exactly where the pipes from floor 4 will connect.

**Implementation plans must be structured around nodes**, not flat task lists:

```
Phase/Sprint 1: Foundation
  └── Node: database (depends on: nothing)
       ├── Task 1: schema setup
       ├── Task 2: migrations
       └── Task 3: seed data
  └── Node: auth (depends on: database)
       ├── Task 1: local strategy
       ├── Task 2: session management
       └── Task 3: role definitions

Phase/Sprint 2: API Layer
  └── Node: api (depends on: auth, database)
       ├── Task 1: route scaffolding
       └── ...
```

Each node's tasks are granular and bottom-up. The *ordering* of nodes follows the architecture's dependency graph. Each node builds against the full manifest — so the API node in Sprint 2 already knows auth's interface contract from Sprint 1's discovery.

**Pre-build review agents are node-aware — they review through the lens of the manifest's node structure:**

- **Red** checks assumptions about nodes that *don't exist yet* — Sprint 2's plan assumes auth works a certain way, is that assumption matching the actual auth spec?
- **Orange** checks contracts *between* nodes in the plan — does Sprint 2's API node consume Sprint 1's auth interface correctly?
- **Blue** traces flows *across* nodes — does the user journey survive the node boundary?
- **White** checks completeness *per node* against its spec — does every AC for this node have tasks?
- **Rainbow** checks the phasing — are we building the right nodes in the right sprint? Is the dependency order correct?

This is what makes ForgePlan's review fundamentally different from "just review this doc." The manifest gives agents a structural skeleton to validate against. Without node-awareness, agents review prose. With it, they review *architecture*.

**For phased/sprint builds**, this principle extends naturally:
1. Discovery captures the full vision — all nodes, all shared models, the complete picture
2. Nodes get tagged with a phase/sprint — "build this now, build this later, this is future scope"
3. Each sprint: spec + build only the current phase's nodes — but against the full manifest, so interfaces are designed even for nodes that don't exist yet
4. Later sprints: the unbuilt nodes already have interface contracts — when you get to them, they slot in because the boundaries were defined upfront

The manifest becomes the living roadmap. This is exactly how ForgePlan itself was built across 9 sprints — the Execution Plan defined Sprints 1-11 upfront, but each sprint only implemented its deliverables.

### Tier Dispatch (Pre-Build)

Same tier model as sweep — scale agent count to project complexity:

| Tier | Agents | Count | Rationale |
|---|---|---|---|
| SMALL | Red + Orange + White | 3 | Catch false assumptions, contract mismatches, missing specs — the basics |
| MEDIUM | Red + Orange + Blue + White | 4 | Add flow tracing for more complex multi-step processes |
| LARGE | All 5 | 5 | Add architectural fitness review for complex systems |

### Timing Model

Pre-build agents run **after** an artifact is created/imported, **before** the next pipeline phase:

```
Discovery → [Pre-Build Review: design/manifest] → Spec
    ↓
  Spec → [Pre-Build Review: each spec] → Build
    ↓
  Impl Plan → [Pre-Build Review: plan] → Execute
    ↓
  Imported Doc → [Pre-Build Review: document] → Extract to manifest
```

All tier-selected agents run in parallel on the artifact. Findings are presented to the user (or in autonomous mode, auto-fixed where possible — e.g., adding missing spec details, fixing naming inconsistencies). Category C findings (architectural decisions) always require user input.

### Relationship to Sweep Agents

The pre-build and sweep agents share the same color scheme and philosophy but have **completely separate prompt files**:

- `agents/sweep-red.md` — post-build code review (adversarial)
- `agents/review-red.md` — pre-build document review (assumptions + security)
- Same pattern for Orange, Blue, White, Rainbow

This keeps prompts focused. A code review agent and a document review agent have fundamentally different techniques even if they share the same stance.

---

## Part 4: Phased Building (Future Implementation)

The "Architecture Down, Node Up" principle (see Part 3) defines the philosophy. Implementation requires:

1. **Manifest schema change:** Add `phase` or `sprint` field to each node definition (e.g., `phase: 1`, `phase: 2`, `phase: "future"`)
2. **Phase-aware commands:** `spec --phase 1` specs only Phase 1 nodes. `build --phase 1` builds only Phase 1 nodes. `sweep` runs against built phases only but validates interfaces against the full manifest.
3. **Cross-phase interface validation:** When building Phase 2, Orange agent validates that Phase 2's code actually matches the interface contracts Phase 1 was built against. If Phase 1's auth returns `{user_id}` and Phase 2's API consumes it, Orange confirms that's still true in the actual code.
4. **Phase completion gates:** A phase isn't "done" until its nodes pass sweep + verify-runnable. The next phase can begin spec work in parallel but can't build until the dependency phase is certified.
5. **Manifest-as-roadmap display:** `/forgeplan:status` shows phases with completion state. `/forgeplan:guide` recommends next phase when current is certified.

*Detailed design deferred to Sprint 10+. The principle and agent-awareness are established in this document.*

---

## Summary: The Full Agent Model

### 10 Agents Total (5 Colors × 2 Phases)

| Color | Sweep Agent (Post-Build) | Review Agent (Pre-Build) |
|---|---|---|
| Red | Break the code | Challenge the assumptions |
| Orange | Diff the contracts | Diff the documents |
| Blue | Walk the user flows | Walk the described sequences |
| White | Trace spec → code | Find what's missing |
| Rainbow | Zoom out on architecture | Zoom out on design |

### Token Economics

**Old model:** 16 mixed agents × 3-4 convergence passes = ~48-64 agent invocations per sweep
**New model:** 5 opus agents × 1-2 passes = ~5-10 agent invocations per sweep + 5 pre-build invocations per artifact

**Net result:** Higher quality, lower total cost, issues caught earlier when they're cheap to fix.
