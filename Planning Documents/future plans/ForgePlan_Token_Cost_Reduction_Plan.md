# ForgePlan Token Cost Reduction Plan

## Problem Statement

Large greenfield runs are proving that ForgePlan can stay coherent for long,
multi-phase autonomous sessions, but token cost is too high before build.

Observed problems:
- design review passes use too many agents and too much repeated context
- research fanout was too aggressive by default
- planner and plan review consume large raw artifacts instead of compact handoffs
- later passes appear to re-read too much full context instead of only changed context
- long agent outputs are being used as handoff channels when durable artifacts would be better

This is now a product issue, not just a prompt-tuning issue.

## Goal

Cut pre-build token cost by roughly 50% without materially weakening:
- architecture quality
- review pressure
- convergence behavior
- durable artifacts

## Main Hypothesis

Most current waste is orchestration and context-packaging waste, not irreducible
reasoning cost.

The biggest levers are:
- fewer full-context rereads
- smaller phase handoff artifacts
- more deterministic checks before agent dispatch
- narrower agent context by lens
- stricter later-pass diffing

## Immediate Fix Areas

### 1. Research Fanout

Status:
- already partially fixed

Direction:
- keep default research at 1 agent
- allow at most 2 in deep mode
- second agent must be audit-only, reading cached artifacts instead of redoing full research

Expected gain:
- high

## 2. Planner / Plan Handoff

Status:
- planner contract now moving toward artifact + compact receipt

Next step:
- apply the same rule everywhere: heavy phases write files directly and return only compact receipts

Expected gain:
- medium to high

## 3. Phase Handoff Compression

This is likely the biggest remaining lever.

Every phase should produce two outputs:

1. **Primary durable artifact**
- manifest
- specs
- plan
- review file
- research report

2. **Compact handoff artifact**
- one short structured summary for the next phase
- should contain:
  - key decisions
  - open risks
  - changed sections
  - top findings
  - what downstream phases actually need

Examples:
- design review -> `design-handoff.md`
- research -> `research-summary.md`
- spec generation -> `spec-handoff.md`
- plan review -> `plan-handoff.md`

Rule:
- downstream phases should read the compact handoff first
- only drill into the full artifact if needed

Expected gain:
- very high

## 4. Diff-Only Later Passes

Current problem:
- later review passes likely re-read the full plan/manifest/spec set

Required behavior:
- pass 1 can read full context
- pass 2+ should receive:
  - prior findings
  - exact changed sections
  - short fix summary
  - only directly relevant artifact excerpts

Rule:
- no full reread after pass 1 unless the artifact changed globally or the agent explicitly identifies a missing dependency

Expected gain:
- very high

## 5. Lens-Scoped Review Packets

Current problem:
- each review agent appears to receive too much shared context

Needed:
- different context packets by lens

Examples:
- `Adversary`
  - security-sensitive flows
  - auth/rate-limit/secrets/logging sections
  - not the entire plan by default

- `Contractualist`
  - interfaces
  - field names
  - dependencies
  - endpoint/state contracts

- `Pathfinder`
  - user journeys
  - role flows
  - queue/screens/workflow sections

- `Structuralist`
  - architecture map
  - module boundaries
  - file scopes
  - batch ordering

- `Skeptic`
  - unresolved assumptions
  - acceptance/verification logic
  - gap summary

Expected gain:
- high

## 6. Deterministic Prechecks Before Agent Review

Anything mechanical should be caught before agents run.

Targets:
- file_scope path mismatches
- missing dependency declarations
- naming mismatches against shared models
- obvious field coverage gaps
- batch ordering validation
- rate-limit/config checklist
- required security checklist items

Approach:
- add cheap validators/scripts that emit findings before review
- agents then focus on reasoning-heavy issues only

Expected gain:
- medium to high

## 7. Agent Retirement / Convergence Tightening

Current behavior:
- convergence is working, but likely later than ideal

Needed:
- retire clean agents aggressively
- suppress repeated findings without new evidence
- downgrade repeated non-progress findings into advisory/manual-attention earlier

Expected gain:
- medium

## 8. Output Size Controls

Heavy agents should never produce giant parent-facing blobs.

Rules:
- write artifacts directly
- return compact receipts
- use bounded finding templates
- cap internal summary length
- no giant narrative recaps between phases

Expected gain:
- medium

## 9. LSP / Semantic Context (Later)

LSP is useful, but mostly for code-phase efficiency.

Best later targets:
- build
- code review
- sweep
- impact analysis

Less useful for:
- early discovery
- design review
- plan review

Conclusion:
- do not rely on LSP as the primary answer to current pre-build cost
- add it later for code-phase precision

## Recommended Implementation Order

1. Finish research fanout control
2. Enforce artifact + receipt contracts for all heavy phases
3. Add compact handoff artifacts between phases
4. Make review pass 2+ diff-only
5. Narrow agent packets by lens
6. Add deterministic plan/design validators
7. Tighten convergence retirement rules
8. Add LSP-backed code-phase precision later

## Success Criteria

For a LARGE project pre-build pipeline:
- current proof mode: ~200k+ tokens
- target range: 50k-100k
- first meaningful milestone: cut to <=120k without obvious quality loss
- second milestone: consistently operate near <=100k

Quality must remain intact:
- no increase in missed critical findings
- no obvious drop in convergence quality
- no degradation in final artifact usefulness

## Guiding Rule

Do not remove governance pressure first.
Remove waste first.

The system appears to be proving useful review pressure already.
The optimization task is to preserve that pressure while making the context and
handoff model far more disciplined.
