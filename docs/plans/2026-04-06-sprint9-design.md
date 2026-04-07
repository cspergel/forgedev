# Sprint 9 Design v2: Living Knowledge Tree + Node Splitting + State Hardening + Guide Enhancement

**Date:** 2026-04-06
**Status:** Approved (revised after 5-team design review + wiki deep-design session)
**Goal:** Self-correcting knowledge tree with cross-references and evidence tracking reduces token usage and improves build quality. Node splitting enables tier upgrades. State hardening prevents corruption. Guide gets smarter from accumulated knowledge.

## v2 Revisions (from 5-team review + design session)
- Keep Layer 3 (Rules) with 5-layer resilience + self-correction loop
- Drop infer patterns fallback -- markers only, no inference
- Add cross-references (pattern-to-rule-to-decision knowledge graph)
- Add evidence tracking (WHY + history on every entry)
- Simplify update-state.js to shared utility (no file locking)
- Add pre-tool-use.js wiki whitelist
- Builder writes 3 new marker types + Stop hook enforces existing markers
- Node split: atomic manifest write, pre-validate, mandatory integrate
- Wiki recompiles between sweep passes (not just at start)
- Rules populated from spec constraints at spec time (useful before first build)
- Massive changes: compile-wiki.js reconciles vs manifest, archives missing nodes
- Marker enforcement: Stop hook verifies @forgeplan-node and @forgeplan-spec exist

---

## Sprint 9: 4 Pillars (Pillar 3 Five-Team already shipped in Sprint 8)

### Pillar 1: Semantic Memory (Living Knowledge Tree)

**Full Karpathy 3-layer model:**
- Layer 3: Rules (deterministic conventions from markers + spec constraints)
- Layer 2: Wiki (compiled summaries with [file:line] citations + cross-references + evidence)
- Layer 1: Source (fallback, always available, never gated)

**5 anchor marker types (builder writes all 5):**
- @forgeplan-node (existing), @forgeplan-spec (existing)
- @forgeplan-pattern (NEW), @forgeplan-rule (NEW), @forgeplan-decision (NEW, ID: D[N]-[slug])

**Cross-references (knowledge graph):** Entries link to each other. Pattern→Rule→Decision. When pattern changes, agents trace impact through links.

**Evidence tracking (WHY + history):** Every rule/pattern/decision tracks WHY it exists, evidence of value (passes since adoption, violations), when added, when last verified. Agents judge relevance from evidence.

**Rules: 5-layer resilience:**
1. Spec constraints → rules.md at spec time (before code exists!)
2. Code markers → rules.md at build time
3. Verified timestamps (stale rules tagged [STALE])
4. Agent self-validation (read cited line before reporting violation)
5. Source fallback (always available)

**Self-correction loop (rules.md regenerated from scratch every compile):**
- Stale rule (marker deleted) → vanishes on recompile
- Missing rule (spec constraint) → auto-appears
- Wrong rule → Red Team finds contradiction → fix agent removes marker → recompile drops
- Builder self-repair: sees [STALE] tag → re-adds marker if still valid

**Wiki lifecycle — grows at EVERY phase:**
- Discovery: index.md + skeleton node pages + wiki/ dirs
- Spec: node pages get ACs/interfaces/constraints. rules.md gets spec constraints (useful before first build!)
- Build: PostToolUse appends file entries + extracts markers from tool_input
- Review: findings → node "Past Findings"
- Sweep: full recompile via compile-wiki.js + recompile between passes after Phase 4 fixes
- Revise: impact → decisions.md, interface changes on node pages

**PostToolUse wiki (lightweight, <20ms):**
- Scan tool_input only (not full file). Regex for markers. Append to wiki files. Direct fs writes (bypasses PreToolUse). If wiki dir missing: create silently.

**compile-wiki.js (~300 lines, full recompile):**
- Runs at: sweep Phase 1.5, between sweep passes, SessionStart if stale
- Reads specs + source + previous wiki + sweep reports
- Builds cross-references + evidence
- REGENERATES from scratch (self-correction)
- Reconciles vs manifest (missing nodes → archived)
- Atomic writes

**Massive change handling:** Nodes removed → archived (history preserved). Nodes added → created from spec+source. Full rediscovery → archives all, fresh start.

**Marker enforcement:** Stop hook verifies @forgeplan-node and @forgeplan-spec before build completion. Sweep contract-drift flags nodes with 0 pattern/rule markers.

**Builder reads wiki before building:** rules.md + patterns.md + wiki/nodes/[dep].md. Falls back to specs if wiki missing.

### Pillar 2: Node Splitting

**Command: /forgeplan:split [node-id]**
- Prerequisites: node built/reviewed/revised, no active_node, no sweep_state
- Architect-assisted (split mode = code analysis, NOT discovery)
- Analysis: directory groupings → import clusters → domain boundaries
- AC assignment via @forgeplan-spec markers
- depends_on/connects_to redistribution by tracing imports
- shared_dependencies inherited per child (filtered to models used)
- Orphan files identified and presented to user
- Pre-validate before executing (run validate-manifest on hypothetical)
- Execute atomically (single manifest write, tmp+rename)
- Mandatory /forgeplan:integrate after split
- Tier upgrade check (2→3 = SMALL→MEDIUM, 5→6 = MEDIUM→LARGE)
- Children start as "built" → route through review

### Pillar 3: State Management Hardening

**Shared atomicWriteJson utility (scripts/lib/atomic-write.js, ~15 lines)**
- Extract existing pattern. All 3 scripts switch to shared import.
- No file locking (hooks are serial, no concurrency)

**SessionEnd hook (scripts/session-end.js, ~60 lines)**
- Writes session summary to wiki/sessions/
- Diffs current state vs last summary
- Ctrl+C fallback: session-start reads wiki node pages

**Parallel fix: worktrees handle isolation, no temp state needed**

### Pillar 4: Guide Enhancement

- Reads wiki for: recurring findings, split recommendations (>15 findings or >20 files), pattern propagation
- Concrete: string match on category + file count thresholds

### Pre-Tool-Use Updates
- Whitelist .forgeplan/wiki/ for all active statuses
- Whitelist compile-wiki.js and session-end.js in Bash safe patterns

### File Inventory: 5 new + ~20 modified

### Build Order: 13 steps (see design doc)

### 5-Team Review Key Findings (incorporated into v2):
- Red: PreToolUse must whitelist wiki/, builder must WRITE markers not just read
- Blue: Split needs orphan file handling, wiki empty during first node build (accepted)
- Orange: pre-tool-use.js missing from modified files, state-schema needs wiki_last_compiled
- Rainbow: Simplify update-state.js (no locking), cut "infer patterns" fallback
- White: SessionEnd verified as real hook, compile-wiki.js needs exact marker regex specified

## Cross-References (Knowledge Graph)

Wiki entries link to each other creating a web of knowledge. Example:

Pattern auth-middleware [src/auth/middleware.ts:12] -> Enforces Rule always-validate-token -> Based on Decision D3-httponly-cookies

When a pattern changes, agents trace impact: "This pattern enforces Rule X from Decision D3. If I change it, does the rule still hold?"

## Evidence Tracking (WHY + History)

Every rule/pattern/decision tracks:
- WHY it exists (the finding, requirement, or choice that created it)
- EVIDENCE of value (passes since adoption, violations found/prevented)
- HISTORY (when added, last verified, violation count)

Agents use evidence to prioritize: 0 violations across 5 passes = well-established. 2 violations in 3 passes = needs attention.

## Annotation Enforcement

Stop hook marker verification: verifies every file has @forgeplan-node and every AC has @forgeplan-spec. Missing markers are bounce-worthy.

Sweep contract-drift: flags nodes with 0 @forgeplan-pattern and 0 @forgeplan-rule markers.

## Pre-Tool-Use Updates

Whitelist .forgeplan/wiki/ for all active statuses. Whitelist compile-wiki.js and session-end.js in Bash safe patterns.

## File Inventory: 5 new files + ~20 modified files

New: commands/split.md (~100), scripts/compile-wiki.js (~300), scripts/lib/atomic-write.js (~15), scripts/session-end.js (~60)

Modified: architect.md, builder.md, all 16 sweep agents, post-tool-use.js, pre-tool-use.js, session-start.js, stop-hook.js, sweep.md, discover.md, spec.md, review.md, guide.md, help.md, hooks.json, state-schema.json, CLAUDE.md, plugin.json

## Build Order (13 steps)

1. scripts/lib/atomic-write.js (no deps)
2. Wiki structure + compile-wiki.js (standalone)
3. pre-tool-use.js whitelist (unblocks wiki writes)
4. PostToolUse wiki integration (depends 2, 3)
5. Builder marker writing + wiki reading (depends 2)
6. Discover/spec wiki init + rules from constraints (depends 2)
7. Review wiki writes (depends 2)
8. Sweep Phase 1.5 + between-pass recompile (depends 2)
9. Node splitting command (depends 2, 3)
10. SessionEnd hook + session-end.js (depends 1)
11. Session-start wiki reading (depends 10)
12. Guide enhancement (depends 2, 9)
13. Integration testing + team review
