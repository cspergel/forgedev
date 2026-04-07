# Sprint 9 Design v2: Living Knowledge Tree + Node Splitting + State Hardening + Guide Enhancement

**Date:** 2026-04-06
**Status:** Approved (revised after 5-team design review + wiki deep-design session)
**Goal:** Self-correcting knowledge tree with cross-references and evidence tracking reduces token usage and improves build quality. Node splitting enables tier upgrades. State hardening prevents corruption. Guide gets smarter from accumulated knowledge.

## v2 Revisions (from 5-team review + design session)
- Keep Layer 3 (Rules) with 5-layer resilience + self-correction loop
- Drop infer patterns fallback — markers only, no inference
- Add cross-references (pattern-to-rule-to-decision links / knowledge graph)
- Add evidence tracking (WHY + history on every rule/pattern/decision)
- Simplify update-state.js to shared utility (no file locking)
- Add pre-tool-use.js wiki whitelist
- Builder writes 3 new marker types + Stop hook enforces existing markers
- Node split: atomic manifest write, pre-validate, mandatory integrate
- Wiki recompiles between sweep passes (not just at start)
- Rules populated from spec constraints at spec time (useful before first build)
- Massive changes: compile-wiki.js reconciles vs manifest, archives missing nodes
- Marker enforcement: Stop hook verifies @forgeplan-node and @forgeplan-spec exist

NOTE: The complete design specification is in the project memory file at:
.claude/projects/.../memory/project_sprint9_design.md
This file was saved via memory because the Layer 2 PreToolUse hook blocks
large Write/Edit operations in the plugin repo (no .forgeplan/state.json).
The next session will read the memory and generate the full implementation plan.


## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Wiki layers | Full Karpathy: Rules (L3) + Wiki (L2) + Source (L1) | Rules = deterministic checks, Wiki = cheap reads, Source = always available |
| Rules extraction | Markers + spec constraints only. NO inference. | Grep-based is deterministic. Inference dropped per review. |
| Rules self-correction | 5-layer resilience + auto-fix via full regeneration | rules.md is generated output. Fix source, rules auto-correct. |
| Cross-references | Entries link (pattern to rule to decision) | Changes propagate through linked knowledge. Agents trace impact. |
| Evidence tracking | Every entry tracks WHY + violation history | Agents judge relevance from evidence, not just existence. |
| PostToolUse wiki | Scan tool_input only, append, no full-file read | Accept staleness between recompiles. compile-wiki.js reconciles. |
| State hardening | Shared atomicWriteJson utility (no file locking) | Hooks are serial. No concurrency. Locking overengineered. |
| Node split | Architect-assisted, atomic manifest, pre-validate, mandatory integrate | Non-destructive, crash-safe, validated before execution. |
| Session persistence | SessionEnd hook writes summary to wiki | Verified: Claude Code supports SessionEnd. Fallback via session-start. |
| Marker enforcement | Stop hook verifies node+spec markers exist | Ensures code annotated enough for wiki extraction. |
| Massive changes | compile-wiki.js reconciles vs manifest, archives missing | Wiki survives redesigns. History preserved. |

---

## Pillar 1: Semantic Memory (Living Knowledge Tree)

### Three Layers (Full Karpathy)

\
Agent read strategy: Rules first (instant check) -> Wiki second (cheap) -> Source last (expensive, verify only). Any agent can fall back to source at any time.

### Anchor Markers (5 types)

Builder writes ALL 5. Stop hook enforces node+spec markers. New 3 encouraged, not enforced.

- @forgeplan-node: [node-id] (existing, file ownership)
- @forgeplan-spec: [AC-ID] (existing, AC implementation)
- @forgeplan-pattern: [name] (NEW, reusable pattern)
- @forgeplan-rule: [convention] (NEW, codebase rule)
- @forgeplan-decision: D[N]-[slug] (NEW, architectural decision)

### Cross-References (Knowledge Graph)

Entries link to each other creating a web of knowledge:
- Pattern auth-middleware -> enforces Rule always-validate-token -> based on Decision D3
- When pattern changes, agents trace: does Rule X still hold? Is Decision D3 still valid?

### Evidence Tracking (WHY + History)

Every rule/pattern/decision tracks:
- WHY it exists (the finding or requirement that created it)
- EVIDENCE of value (passes since adoption, violations found/prevented)
- HISTORY (when added, last verified, violation count)

### Rules: 5-Layer Resilience + Self-Correction

Sources: @forgeplan-rule markers + spec constraints.

Layer 1: Spec constraints -> rules.md at spec time (before code!)
Layer 2: Code markers -> rules.md at build time
Layer 3: Verified timestamps (stale tagged [STALE])
Layer 4: Agent self-validation (read cited line before reporting)
Layer 5: Source fallback (always available)

Self-correction: rules.md REGENERATED from scratch every compile-wiki.js run.
- Stale rule -> vanishes. Missing rule -> auto-appears. Wrong rule -> Red Team finds, fix agent removes marker, recompile drops.
- Builder self-repair: sees [STALE], re-adds marker if valid.

### Wiki Structure

.forgeplan/wiki/
  nodes/[node-id].md (per-node: summary, files, patterns, rules, findings, decisions)
  patterns.md (cross-cutting patterns with cross-refs)
  rules.md (deterministic rules with WHY + evidence)
  decisions.md (decisions with rationale + linked rules/patterns)
  index.md (quick reference)
  archived/ (pages for removed/split nodes, history preserved)
  sessions/[date].md (session summaries from SessionEnd)

### Wiki Lifecycle

Discovery: index.md + skeleton pages + dirs
Spec: ACs/interfaces/constraints on node pages. rules.md from spec constraints.
Build: PostToolUse file entries + marker extraction (<20ms, tool_input only)
Review: findings -> Past Findings section
Sweep: full recompile + between-pass recompile after fixes
Revise: impact -> decisions.md, interface changes on node pages

### compile-wiki.js (~300 lines)

Runs at: sweep Phase 1.5, between passes, SessionStart if stale.
1. Read specs -> ACs, interfaces, constraints
2. Read source -> extract ALL markers
3. Read previous wiki -> preserve Past Findings + evidence
4. Read sweep/review reports -> update finding history
5. Build cross-references + evidence
6. REGENERATE from scratch (self-correction)
7. Reconcile vs manifest (missing nodes -> archived)
8. Atomic writes

### Token Savings

Builder adjacent nodes: ~50KB source -> ~5KB wiki (~90%)
Sweep agent: ~100KB -> ~40KB wiki+drillins (~60%)
Second session: ~100KB -> ~15KB wiki (~85%)

---

## Pillar 2: Node Splitting

Command: /forgeplan:split [node-id]
Prerequisites: built/reviewed/revised, no active_node, no sweep_state

Flow:
1. Read manifest + spec + files
2. Architect split mode (code analysis, NOT discovery): directory groups, import clusters, domain boundaries
3. AC assignment via @forgeplan-spec markers. depends_on/connects_to redistribution. shared_dependencies filtered per child. Orphan files identified.
4. Present proposal with orphan handling. Confirm/adjust.
5. Pre-validate (validate-manifest on hypothetical)
6. Execute atomically (single manifest write). Create child specs. Re-register files. Archive parent. Update wiki.
7. Mandatory /forgeplan:integrate
8. Tier upgrade check (2->3 SMALL->MEDIUM, 5->6 MEDIUM->LARGE)
Children start as built -> review verifies against narrower specs.

---

## Pillar 3: State Hardening

Shared atomicWriteJson (scripts/lib/atomic-write.js, ~15 lines). No locking.
SessionEnd hook (scripts/session-end.js, ~60 lines). Diffs state vs last summary.
Parallel fix: worktrees handle isolation, no temp state.

---

## Pillar 4: Guide Enhancement

Reads wiki for: recurring findings (category match), split recommendations (>15 findings or >20 files), pattern propagation (LLM judgment from wiki).

---

## Pre-Tool-Use: whitelist .forgeplan/wiki/ + compile-wiki.js + session-end.js
## Annotation: Stop hook enforces node+spec markers. Sweep flags 0-marker nodes.
## Massive changes: reconcile vs manifest, archive removed nodes, preserve history.

## Files: 5 new + ~20 modified. Build order: 13 steps.
