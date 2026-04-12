# ForgePlan Living Token And Speed Roadmap

## Purpose

Reduce token burn, latency, and long-run fragility without weakening:
- node ownership enforcement
- review pressure
- verification quality
- durable artifact quality
- model-agnostic portability

This is a living roadmap. Update it as dogfood runs expose new waste or prove
that an assumed optimization would actually hurt quality.

## Current Read

Dogfooding is showing two different classes of cost:

1. Real reasoning cost
- spec interpretation
- node-local implementation decisions
- adversarial review
- convergence on hard failures

2. Avoidable orchestration cost
- repeated full-context rereads
- prompt surfaces re-teaching stable rules
- weak phase handoffs
- re-deriving AC evidence from raw code
- over-broad review packets
- whole-project verification when only a small slice changed
- state/control-plane confusion causing extra turns

The main opportunity is to remove avoidable orchestration cost while preserving
or increasing review quality.

## Non-Negotiables

Do not optimize by:
- removing review pressure
- skipping verification entirely
- widening file write permissions
- hiding failures instead of making them cheaper to process
- shifting more orchestration truth into chat memory

The system of record remains:
- `.forgeplan/` artifacts
- deterministic state transitions
- node/file ownership rules

## Design Principles

### 1. Durable Artifacts Over Re-Derivation

Heavy phases should write artifacts and compact receipts.
Downstream phases should read receipts first, then drill into raw artifacts only
when needed.

### 2. Stable Prefix, Dynamic Tail

Prompts should be structured for cacheability:
- stable governance and role rules first
- stable node/spec contract second
- dynamic task/diff/failure payloads last

This should be true across:
- builder
- reviewer
- design-pass
- sweep fix agents

### 3. Contract-Scoped Context

Default context should be:
- active file(s)
- owning node spec
- adjacent contracts/interfaces
- shared model definitions
- only the directly relevant failure evidence

Not:
- broad project implementation by default

### 4. Incremental Certification

Re-certify the smallest safe graph slice:
- changed node
- directly affected shared contracts
- immediate downstream dependents when required

Whole-project sweeps should happen at explicit convergence boundaries, not as
the default response to every change.

### 5. Deterministic Runtime First

If a step is mechanical, move it into:
- a script
- a validator
- a receipt
- a state transition helper

Every deterministic helper removes tokens and reduces drift.

## Success Metrics

Track these per large dogfood run:

### Speed
- wall-clock time to finish build-all
- wall-clock time to finish verify-runnable remediation
- average time per node build
- average time per node review

### Token Use
- total tokens per phase
- tokens per node build
- tokens per node review
- tokens spent on recovery/rework caused by orchestration bugs

### Quality
- critical findings caught before certification
- regressions introduced by optimizations
- number of false approvals
- number of missed cross-node issues

### Stability
- count of manual recoveries required
- count of stale-state incidents
- count of false hook/tool blocks
- count of redundant state transitions

## Workstreams

## A. Control-Plane Waste Removal

Goal:
- stop burning tokens on orchestration mistakes

Priority actions:
- continue moving node/sweep transitions into deterministic helpers
- eliminate remaining manual `state.json` reasoning paths
- ensure every recover/deep-build/remediation branch has one canonical path
- keep hook allowlists aligned with real remediation workflows

Why this matters:
- orchestration bugs consume tokens without improving quality
- every false block or recovery loop destroys latency and user confidence

Done when:
- recover/resume is boring
- verify-runnable remediation is boring
- node review completion semantics are deterministic and trustworthy

## B. Artifact And Receipt Contracts

Goal:
- stop re-deriving expensive context from raw files every phase

Priority actions:
- require compact receipts from builder, reviewer, design-pass, and sweep fix agents
- standardize receipt shape:
  - `what changed`
  - `why`
  - `what was verified`
  - `open risks`
  - `next readers`
- make downstream phases read receipts first

Key target:
- stop-hook and review should consume builder AC evidence receipts before
  re-reading large code/test surfaces

Expected impact:
- major token reduction
- better auditability
- easier model-agnostic portability

## C. Context Packet Narrowing

Goal:
- give agents less irrelevant code

Priority actions:
- build node-local context packets from:
  - owning node files
  - adjacent interface contracts
  - shared models
  - specific failing tests/logs
- stop default inclusion of broad repo context
- enforce lens-specific packets for different reviewer roles

Examples:
- contract review gets interfaces and schemas, not all service code
- workflow review gets routes, state transitions, and role gates
- security review gets auth, permission, input handling, and audit surfaces

Expected impact:
- lower drift
- lower token burn
- better node discipline

## D. Incremental Review And Certification

Goal:
- review only what truly changed

Priority actions:
- add node hash receipts for:
  - node code
  - node spec
  - adjacent contract signatures
- if the hash set is unchanged, skip expensive re-review
- re-open only:
  - changed node
  - nodes whose contract dependencies actually changed

Scope:
- build verification
- node review
- sweep recertification
- cross-model verification

Expected impact:
- major savings on long runs
- fewer full sweeps

## E. Phase Handoff Compression

Goal:
- shrink what each phase needs from the previous one

Priority actions:
- every heavy phase writes:
  1. durable artifact
  2. compact handoff summary
- handoff summaries become the first input to the next phase

Minimum handoff fields:
- stable decisions
- changed sections
- unresolved risks
- exact files/contracts to inspect next

Expected impact:
- major reduction in full rereads

## F. Review Parallelism With Serialized State Finalization

Goal:
- speed up safe read-heavy work without breaking ownership rules

Priority actions:
- parallelize node-local review analysis for dependency-safe batches
- keep state transitions serialized
- keep write phases serialized when one `active_node` is required

Rules:
- parallelize read-heavy review
- do not parallelize cross-node writes under a single active remediation context

Expected impact:
- better latency on medium/large runs
- no quality loss if batch boundaries are correct

## G. Verify-Runnable Remediation Discipline

Goal:
- make Phase 3 efficient and predictable

Priority actions:
- keep failure-to-owner routing deterministic
- allow safe targeted verification commands during active remediation
- analyze multiple failures together when useful
- serialize fixes by owner
- re-run only the smallest meaningful verification slice before a full retry

Important:
- diagnostics should be allowed
- arbitrary shell mutation should still be blocked

Expected impact:
- lower recovery time during real repo debugging
- fewer false tooling dead-ends

## H. Prompt Cacheability And Stateful Continuation

Goal:
- reduce repeated transmission/re-tokenization of stable context

Priority actions:
- restructure prompts with stable prefix / dynamic tail
- separate static governance from volatile task payloads
- measure cache hit behavior per phase
- design future workstation runtime to preserve session state outside prompt text

Near-term:
- prompt restructuring
- explicit stable/static sections

Later:
- evaluate stateful transport/session continuation when the core runtime is
  clean enough to benefit from it

Important:
- transport upgrades are not a substitute for good control-plane architecture

## I. Model-Agnostic Core Extraction

Goal:
- make optimizations portable across hosts and models

Priority actions:
- keep `.forgeplan/` as durable session state
- move more orchestration into deterministic scripts
- separate:
  - core runtime
  - host adapter
  - model adapter
  - UI
- make receipts, hashes, validators, and transitions host-neutral

Expected impact:
- lower future rewrite cost
- easier workstation path
- fewer host-specific inefficiencies

## Implementation Order

### Phase 1: Stop Wasting Tokens On Harness Bugs
- finish control-plane normalization
- remove stale/manual state mutation paths
- align Bash/tool guards with real remediation workflows
- stabilize recover/deep-build/verify-runnable

Gate:
- long runs stop failing for orchestration reasons first

### Phase 2: Shrink Phase Inputs And Outputs
- standardize receipts
- add compact handoffs
- narrow context packets
- cap oversized agent responses

Gate:
- measurable reduction in per-phase tokens without loss of review quality

### Phase 3: Incrementalize Certification
- add node/spec/contract hashing
- implement dependency-aware invalidation
- skip unchanged review/certification work

Gate:
- later passes stop re-reading unchanged nodes

### Phase 4: Add Safe Parallelism
- parallel review batches
- parallel analysis where write ownership is not shared
- keep state/write finalization serialized

Gate:
- lower wall-clock time without more state incidents

### Phase 5: Stateful Runtime Upgrades
- only after core seams are cleaner
- evaluate sessionful transport and workstation-native continuation
- keep the runtime host-neutral

Gate:
- transport optimization sits on top of a stable core, not in place of one

## Immediate Concrete Tasks

### Now
- builder AC evidence receipts
- reviewer compact findings receipts
- diff-only pass 2+ behavior
- contract-only context packets for review/fix agents
- better per-phase token and latency instrumentation

### Next
- node hash receipts
- downstream invalidation graph
- partial verify-runnable reruns by slice
- safer targeted verification command allowlists

### Later
- stateful workstation session continuation
- richer runtime cache strategy
- LSP/semantic context for code-phase precision

## Quality Guardrails

Every optimization must answer:

1. What exact token/latency waste does this remove?
2. What evidence says it will not hide real defects?
3. What artifact or deterministic check replaces the removed reasoning?
4. How will we measure quality before and after?

Reject any optimization that:
- removes adversarial pressure with no replacement
- broadens write permissions to save time
- hides uncertainty in summary artifacts
- depends on one host/model quirk to work

## Practical Rule

Preserve scrutiny.
Remove rework.

ForgePlan should spend tokens on:
- hard reasoning
- adversarial verification
- boundary cases
- integration judgment

It should stop spending tokens on:
- retelling itself how it works
- rediscovering unchanged context
- fighting its own control plane
- recertifying untouched nodes
