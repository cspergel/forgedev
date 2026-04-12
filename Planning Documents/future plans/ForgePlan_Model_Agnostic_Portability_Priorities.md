# ForgePlan Model-Agnostic Portability Priorities

## Purpose

Capture the lowest-risk, highest-leverage path from the current Claude Code plugin
implementation toward a model-agnostic ForgePlan core, without forcing an early
rewrite or destabilizing the current plugin dogfooding path.

This is an extraction roadmap, not a standalone-app roadmap.

## Guiding Principle

Do not rewrite ForgePlan around a new framework yet.

Instead:
- keep `.forgeplan/` as the durable product contract
- move behavior from prompt-only orchestration into deterministic scripts where practical
- add explicit runtime/config seams per role
- stage runtime context locally instead of depending on plugin-install paths
- make model/backend decisions explicit in config rather than implicit in prompts

This preserves the current plugin while making later extraction materially easier.

## Managed-Agents Alignment

Anthropic's managed-agents architecture is a useful reference point here:
- `brain` = model + harness/orchestration policy
- `hands` = sandboxes, MCP tools, workspace actions, external services
- `session` = durable event/state store outside the model context window

The important alignment for ForgePlan is architectural, not vendor-specific:
- ForgePlan should keep the `session` durable and primary via `.forgeplan/` artifacts
- model context should interrogate durable state selectively instead of re-ingesting full raw history
- execution backends and tool environments should become swappable `hands`
- orchestration policy should become the replaceable `brain`, not the whole product

That is a strong argument for continuing to extract toward:
- stable artifacts
- stable runtime interfaces
- replaceable model/back-end adapters

Reference:
- Anthropic, "Scaling Managed Agents: Decoupling the brain from the hands"
  https://www.anthropic.com/engineering/managed-agents

## Best Immediate Portability Targets

### 1. Research

Why first:
- mostly artifact-in / artifact-out
- now has local runtime staging
- now has deterministic fetch helpers
- now has explicit `models.researcher`
- outputs are durable files under `.forgeplan/research/`

Near-term goal:
- keep making research execution policy explicit
- preserve cached raw artifacts
- avoid model/session-specific assumptions

### 2. Cross-Model Review

Why second:
- already partially abstracted
- current scripts already support multiple transport modes
- review output is durable and structured enough to survive extraction

Relevant current pieces:
- `scripts/cross-model-review.js`
- `scripts/cross-model-bridge.js`
- `scripts/lib/review-config.js`

Near-term goal:
- normalize all review backends behind one runner contract

### 3. Spec Generation

Why next:
- consumes manifest + research + node context
- produces spec files and state updates
- does not need a rich interactive UI if run autonomously

Near-term goal:
- give spec generation the same treatment as research:
  - staged local runtime context
  - explicit role config
  - deterministic helpers where possible

### 4. Status / Validation / Reporting

Why early:
- already mostly deterministic
- already low-dependence on Claude-specific behavior
- belongs in the long-term core almost unchanged

Includes:
- manifest validation
- spec validation
- status reporting
- quality measurement
- report generation

### 5. Skill Registry

Why early:
- deterministic
- project-artifact based
- naturally belongs in a model-agnostic core/runtime layer

Near-term goal:
- continue removing assumptions about plugin install layout

## Medium-Difficulty Portability Targets

### 6. Builder

Why not first:
- more coupled to current Claude workflow
- still relies on prompt behavior and session expectations more heavily

Why still important:
- one of the highest-value long-term seams
- builder backend selection per node is central to model agnosticism

### 7. Sweep

Why later:
- more orchestration-heavy
- more convergence/state complexity
- token-cost and policy tuning still need dogfooding

Why important:
- sweep policy is part of ForgePlan's product differentiation
- should eventually be runtime/policy driven, not prompt-driven

## Hardest / Latest Portability Targets

### 8. Discover / Greenfield

Why last:
- heavily tied to prompt choreography
- lots of user interaction, confirmation, and orchestration assumptions
- currently depends more on command semantics than later stages

Near-term goal:
- avoid making these more Claude-coupled than they already are
- keep moving reusable logic into scripts and durable artifacts

## Recommended Porting Order

1. Research
2. Cross-model review
3. Spec generation
4. Status / validation / reporting
5. Skill registry
6. Builder
7. Sweep
8. Discover / greenfield

## What To Avoid Right Now

- building the standalone app before the core seams are cleaner
- rewriting the whole system around a new orchestration framework
- trying to make every command backend-agnostic at once
- moving durable behavior out of `.forgeplan/` artifacts and back into prompts

## Quality Bar For Long-Term Success

This path is high quality long term **if** ForgePlan keeps doing the following:

- `.forgeplan/` remains the system of record
- deterministic scripts own more of the control-plane logic over time
- prompts become role behavior, not the only source of orchestration truth
- role/back-end selection is explicit in config
- runtime context is staged locally and is reusable across models/tools
- each extraction step is additive and preserves current plugin functionality
- the durable session/artifact layer remains outside any one model's context window assumptions

## Practical Test

For any future change, ask:

1. Can this workflow read from local staged runtime context instead of plugin-install paths?
2. Can cheap/mechanical work move into a deterministic script?
3. Can the model/backend choice come from config?
4. Does the result land in a durable `.forgeplan/` artifact?

If the answer is mostly yes, the change is moving ForgePlan toward the long-term
model-agnostic architecture rather than away from it.
