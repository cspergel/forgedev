# Changelog

## [0.5.0] - 2026-04-04

### Sprint 5: Dogfood and Ship
- Added `measure-quality.js` — counts broken references, duplicate types, abandoned stubs
- Added `find-affected-nodes.js` — shared model dependency scanner for change propagation
- Added `regenerate-shared-types.js` — deterministic TypeScript codegen from manifest
- Enhanced `integrate-check.js` with shared model field consistency verification
- Added batch revise mode (`--model` flag) for cascading shared model changes
- Added `review-fixing` status for multi-agent review cycles
- Listed all blueprint templates in discover command

## [0.4.0] - 2026-04-04

### Sprint 4: Integration and BYOK
- Added `cross-model-review.js` with MCP, CLI, and API modes (OpenAI, Google, Anthropic)
- Added BYOK `config.yaml` with strict/advisory enforcement modes
- Added configurable model tiering (opus/auto-high/auto/sonnet/haiku)
- Added multi-agent same-model review cycles with fresh agent dispatch
- Added `integrate-check.js` with fault-side identification
- Added `status-report.js` with dependency visualization
- Added SaaS starter and internal dashboard blueprint templates
- Added plugin README

## [0.3.0] - 2026-04-04

### Sprint 3: Review and Recovery
- Added Stop hook with bounce counter and LLM criteria evaluation
- Stop hook owns the building→built transition exclusively
- All Sprint 3 deliverables (review, revise, recover, session-start) verified

## [0.2.0] - 2026-04-04

### Sprint 2: Build Harness
- Added PreToolUse hook — Layer 1 deterministic + Layer 2 LLM enforcement
- Added PostToolUse hook — file registration and conversation logging
- Added `/forgeplan:next` with deterministic dependency graph traversal
- Hardened through 14 cross-model review rounds

## [0.1.0] - 2026-04-04

### Sprint 1: Foundation
- Plugin scaffold with plugin.json, 9 commands, 3 agents, 1 skill
- Manifest schema with shared_models, validation, nodes
- Node spec schema with 14 required fields
- validate-manifest.js (cycles, orphans, scope overlaps)
- validate-spec.js (field types, quality rules, manifest cross-check)
- `/forgeplan:discover` with Architect agent
- Client portal blueprint template (7 nodes, 2 shared models)
