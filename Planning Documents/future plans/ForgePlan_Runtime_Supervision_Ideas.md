# ForgePlan Runtime Supervision Ideas

## Source Inspiration

Paper:
- "Stop Wasting Your Tokens: Towards Efficient Runtime Multi-Agent Systems"
- arXiv HTML: https://arxiv.org/html/2510.26585v1
- arXiv abstract: https://arxiv.org/abs/2510.26585

This note captures only the ideas that seem relevant to ForgePlan later.
It is **not** a recommendation to directly adopt the paper's framework.

## Why It Matters

ForgePlan's current dogfood runs suggest:
- the governance concepts are useful
- convergence behavior is real
- token cost is too high in some pre-build phases

The paper is relevant mainly because it argues for:
- lightweight runtime supervision
- cheap adaptive filtering before expensive intervention
- compact supervisory memory instead of repeated raw context

Those themes align with ForgePlan's current optimization needs.

## Complementary Managed-Agents Idea

Related reference:
- Anthropic, "Scaling Managed Agents: Decoupling the brain from the hands"
  https://www.anthropic.com/engineering/managed-agents

The most relevant complementary idea is:
- keep durable session state outside the model context window
- let the harness fetch and transform only the slices needed right now

For ForgePlan, that reinforces:
- compact handoff artifacts between phases
- durable `.forgeplan/` artifacts as the primary session record
- less dependence on huge parent-session context during long runs
- eventually separating orchestration (`brain`) from execution environments/tools (`hands`)

## Ideas Worth Keeping

### 1. Cheap Pre-Dispatch Filters

Before dispatching expensive review/research/planning agents, run a lightweight
deterministic filter that asks:
- Is this a high-risk step?
- Is the artifact obviously malformed?
- Is the issue mechanical rather than reasoning-heavy?
- Is a full multi-agent pass actually necessary?

Potential ForgePlan uses:
- plan review gate before launching 5 review agents
- design review gate after small deltas
- research escalation gate before allowing multi-agent deep research

### 2. Risk-Based Escalation

Not every phase needs the same level of scrutiny.

Useful later pattern:
- low-risk -> allow / approve
- medium-risk -> lightweight guidance or single-agent pass
- high-risk -> full review panel / deeper verification

This is especially relevant for:
- later plan-review passes
- later design-review passes
- sweep reruns after only small fixes

### 3. Observation Purification

Long raw tool outputs and oversized documents should be cleaned before agents
see them.

Possible ForgePlan applications:
- summarize research raw artifacts before review/spec use
- compress plan/design handoffs into structured summaries
- trim repeated raw manifest/spec context in later passes

### 4. Compact Supervisory Memory

Instead of repeatedly feeding full prior artifacts, maintain a compact
phase-level memory containing:
- key decisions
- open risks
- unresolved findings
- changed sections
- phase-local summary

This maps closely to the planned ForgePlan handoff-artifact work.

### 5. Multi-Level Intervention

Useful supervision actions for ForgePlan could look like:
- `approve` -> continue without deeper review
- `provide_guidance` -> small correction, no full panel
- `correct_observation` -> replace noisy input with cleaned summary
- `run_verification` -> escalate to full agent review or external check

This is a useful mental model for reducing waste without weakening governance.

## What Not To Do

- Do not try to directly import the paper's framework into ForgePlan.
- Do not prioritize this ahead of the already-obvious repo-specific fixes.
- Do not assume runtime supervision alone solves the current pre-build token problem.

ForgePlan's biggest near-term gains still likely come from:
- compact handoff artifacts
- diff-only later passes
- narrower lens-specific review packets
- deterministic prechecks

## Best Future Use

Revisit these ideas when working on:
- token-cost reduction
- adaptive review escalation
- compact handoff / supervisory memory
- later standalone runtime design

The paper is most useful as confirmation that runtime supervision is a serious
design direction, not as a direct implementation plan.
