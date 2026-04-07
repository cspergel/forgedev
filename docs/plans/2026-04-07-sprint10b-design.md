# Sprint 10B Design: Phased Builds + Repo Ingestion

**Date:** 2026-04-07
**Status:** Draft v2 (revised after 5-team review of Sprint 10 v1)
**Goal:** Large projects build in phases (architecture-down, sprint-forward). Existing repos get governance retroactively via `/forgeplan:ingest`. Wiki captures institutional knowledge from ingested codebases.
**Depends on:** Sprint 10A (pipeline + review panel must be in place)

> **Key review findings addressed:** Stub enforcement gap (Red CRITICAL), phantom auth boundaries (Red CRITICAL), repo ingestion containment (Red CRITICAL), schema over-engineering (Rainbow), /forgeplan:advance replaced by discover re-entry + deep-build auto-detection.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Schema simplicity | Only `phase: integer` on nodes + `build_phase: integer` on project | design_depth derivable from phase vs build_phase. total_phases derivable. interfaces redundant with spec contracts. (Rainbow review) |
| Phase field name | `build_phase` (not `current_phase`) | Avoids collision with sweep_state.current_phase (Orange review) |
| Phase advancement | Auto-detected by deep-build, not a separate command | /forgeplan:advance removed. When all build_phase N nodes are certified, deep-build prompts "Advance to phase N+1?" (Blue review: Planner had no home. Simplify.) |
| Stub enforcement | Hard gate: pre-tool-use.js blocks builds on nodes where phase > build_phase | Stubs bypass Layer 2 (no spec). Block at Layer 1 deterministically. (Red CRITICAL) |
| Stub security | Builder implements fail-CLOSED stubs for auth/security dependencies | Stubs that provide auth MUST deny by default, not allow. (Red CRITICAL) |
| Cross-phase validation | Mandatory /forgeplan:integrate after each phase completes | Not optional. Catches interface drift before next phase starts. (Red CRITICAL) |
| Repo ingestion containment | Translator validates: no symlinks escaping project, no existing .forgeplan/, max scope breadth | Prevents mapping attacks. (Red CRITICAL) |
| Double review gate | Gate 1 = deterministic ground-truth validation + panel review. Gate 2 = spec review | Gate 1 checks ACCURACY (does mapping match repo?), not just coherence. (Red review) |
| Descriptive vs prescriptive specs | Clearly labeled: `spec_type: "descriptive"` on ingested specs | User knows these describe what code does, not what it should do. Can edit to add requirements. |
| Wiki on ingest | compile-wiki.js runs immediately after ingest | Wiki captures institutional knowledge from codebase. Most valuable for legacy projects. |

---

## Pillar 1: Phased Builds

### The Problem

ForgePlan assumes discover→spec all→build all. A 40-node project takes weeks before code drops.

### The Solution: Minimal Schema, Maximum Value

**Only two new fields needed:**

```yaml
# Project level in manifest
project:
  build_phase: 1              # Which phase is currently being built

# Node level
nodes:
  auth:
    phase: 1                  # Which build phase this node belongs to
    # ... existing fields
  api:
    phase: 2
    # ... existing fields
  frontend:
    phase: 3
    # ... existing fields
```

**Everything else is derived:**
- `design_depth` = derived from `node.phase` vs `project.build_phase`:
  - phase == build_phase → full (detailed specs, ACs, constraints)
  - phase == build_phase + 1 → interface (spec has interfaces section but no ACs)
  - phase > build_phase + 1 → stub (manifest entry only, no spec file)
- `total_phases` = `Math.max(...nodes.map(n => n.phase))`
- No `interfaces.provides/consumes` field — interface contracts live in the spec's existing `interfaces` section, which is already structured YAML

### Backward Compatibility

`phase` is OPTIONAL with default 1. Existing manifests without `phase` fields pass validation — every node is treated as phase 1. `build_phase` defaults to 1 if absent. No migration script needed. This is the same pattern used for `wiki_last_compiled` and `split_from` in Sprint 9.

### Enforcement: Stub Nodes Cannot Be Built

**Hard gate in pre-tool-use.js:**

```javascript
// Sprint 10B: Phase enforcement — cannot build nodes outside current phase
const buildPhase = manifest.project.build_phase || 1;
const nodePhase = manifest.nodes[activeNodeId] && manifest.nodes[activeNodeId].phase;
if (nodePhase && nodePhase > buildPhase) {
  return { block: true, message: `Node "${activeNodeId}" is phase ${nodePhase} but current build_phase is ${buildPhase}. Run phase advancement first.` };
}
```

This is Layer 1 (deterministic). No spec needed — the phase number is the gate. Prevents the Red Team's CRITICAL finding: stub nodes with no spec bypassing Layer 2.

### Fail-Closed Stubs for Security Dependencies

When a Phase 1 node depends on a Phase 2+ node that provides auth/security:

**Builder Critical Rule:**
```
When importing from a future-phase node that provides authentication,
authorization, or security services: implement a FAIL-CLOSED stub.

WRONG: export function validateToken(token) { return { valid: true, user: mockUser }; }
RIGHT: export function validateToken(token) { throw new Error("Auth not implemented — Phase 2 required"); }

A fail-closed stub DENIES access by default. The only safe stub for security is one that fails.
```

### Phase-Aware Commands

| Command | Phase behavior |
|---------|---------------|
| `/forgeplan:discover` | Architect proposes phase assignments based on dependency analysis. User confirms. |
| `/forgeplan:spec` | Full specs for build_phase nodes. Interface-only specs for build_phase+1. Skip build_phase+2+. |
| `/forgeplan:build` | Only build_phase nodes. pre-tool-use blocks builds on future-phase nodes. |
| `/forgeplan:sweep` | Sweep built nodes only. Don't flag unbuilt future-phase nodes. DO flag broken interface contracts against future nodes. |
| `/forgeplan:deep-build` | Build current phase. After certification: prompt "All phase N nodes certified. Advance to phase N+1? [Y/n]". If yes: increment build_phase, promote next-phase nodes, run /forgeplan:integrate, start new spec+build cycle. |
| `/forgeplan:integrate` | MANDATORY after each phase. Verify built interfaces match what future nodes expect. |

### Phase Advancement (No Separate Command)

`/forgeplan:advance` is removed. Phase advancement happens organically:

1. User builds all phase N nodes via deep-build or manual build+review+sweep
2. All phase N nodes reach `reviewed` or `swept` status
3. Deep-build (or user via `/forgeplan:guide`) detects: "All phase N nodes certified"
4. Prompt: "Advance to phase N+1? This will: (a) run cross-phase integration check, (b) increment build_phase, (c) promote phase N+1 nodes to full spec depth. [Y/n]"
5. Cross-phase review: universal panel runs with cross-phase lens
6. If clean: `build_phase` increments in manifest. `build_phase_started_at` timestamp set in state.
7. Promoted nodes (now at build_phase) need full specs. Deep-build runs `/forgeplan:spec` for each promoted node to flesh out interface-only specs into full specs with ACs, constraints, tests. Interface-only specs have status "specced" in state — deep-build detects they need spec promotion because they have a spec file but no `acceptance_criteria` section (interface specs only have `interfaces`).
8. New build cycle starts for promoted nodes.
9. If cross-phase issues: fix cycle, then re-check.

**Cross-phase review lens:**

| Agent | Cross-Phase Focus |
|-------|------------------|
| **Structuralist** | Do built interfaces match what future nodes expect? |
| **Contractualist** | Did shared model fields change during implementation? |
| **Skeptic** | Are next-phase assumptions still valid given what was built? |
| **Pathfinder** | Do user flows spanning phases work? |
| **Adversary** | Did this phase introduce security patterns the next must follow? |

### Session-Start Phase Awareness

Add to session-start.js ambient display:
```
Phase: 2 of 3 (auth, database, api built | frontend, reporting pending)
```

If phase has been active for >7 days without advancement (compare `state.last_updated` timestamp against a `build_phase_started_at` timestamp stored when build_phase changes):
```
WARNING: Phase 1 has been active for 15 sessions. Phase 2 stubs (auth) are fail-closed — security boundaries not enforced at runtime.
```

---

## Pillar 2: Repo Ingestion

### Command: `/forgeplan:ingest`

For existing projects that want governance retroactively.

**Containment rules (Red Team CRITICALs addressed):**
- Resolve all symlinks: reject any that escape the project root
- Reject repos with existing `.forgeplan/` directory (unless `--force` flag: "I know, re-ingest")
- Enforce maximum file_scope breadth: no `**` at project root, no scope covering >60% of total files
- Validate every proposed file_scope path actually exists as a regular directory

### Flow

```
1. Translator scans repo (NOT Researcher — Researcher does ecosystem search, not code scanning)
   - Directory structure → proposed nodes
   - package.json / imports → dependencies
   - Shared types (files imported by 3+ others) → shared models
   - Test directories → test coverage baseline
   - Containment checks: symlinks, .forgeplan existence, scope breadth

2. Interviewer confirms mapping with user
   - "I found 8 directories that look like node boundaries. Here's my mapping: [table]"
   - "These 3 types are imported everywhere — I'd make them shared models: [list]"
   - "Sound right? Anything I missed?"

3. Ground-truth validation (DETERMINISTIC, not LLM)
   - Script verifies: every claimed directory exists, file counts per scope are accurate,
     claimed shared types actually exist in codebase, no scope overlaps
   - If validation fails: Translator re-maps with corrections

4. Universal Review Panel — Mapping Review (design lens)
   - Structuralist: are node boundaries in the right places?
   - Contractualist: are shared models correctly identified?
   - Skeptic: does this mapping match what the code actually does?
   - Loop until clean (max 5 passes)

5. Architect validates and generates manifest + specs
   - Specs are DESCRIPTIVE — labeled `spec_type: "descriptive"`
   - Specs describe what the code DOES, not what it SHOULD do
   - User can edit specs later to add requirements, constraints, non-goals

6. Universal Review Panel — Spec Review (design lens)
   - Second gate: review generated specs for coherence
   - Loop until clean (max 5 passes)

7. User confirms → manifest + specs written

8. compile-wiki.js runs immediately
   - Wiki captures: existing patterns, decisions inferred from code, rules from spec constraints
   - For legacy repos this is CRITICAL — the wiki becomes "here's what this codebase does and why"
   - Institutional knowledge extracted and made explicit

9. First sweep (optional, recommended)
   - Baseline quality assessment
   - Wiki enriched with findings
   - Phase tagging: existing code = phase 1, planned features = phase 2+

10. Governance active from this point forward
```

### Ground-Truth Validation Script

New script: `scripts/validate-ingest.js`

```javascript
// Validates Translator's repo mapping against actual filesystem
// Input: proposed mapping (JSON)
// Checks:
//   1. Every proposed node directory exists
//   2. File counts per scope match reality (±10% tolerance)
//   3. Claimed shared types exist and are actually imported by 3+ files
//   4. No symlinks escape project root
//   5. No scope covers >60% of files
//   6. No .forgeplan/ directory exists (unless --force)
//   7. No scope overlaps between proposed nodes
// Output: validation report with PASS/FAIL per check
```

### Descriptive Spec Format

Ingested specs are labeled to distinguish from prescriptive (user-written) specs:

```yaml
# .forgeplan/specs/auth.yaml (generated by /forgeplan:ingest)
spec_type: "descriptive"   # This spec describes what the code does, not requirements
generated_from: "repo-ingestion"
generated_at: "2026-04-07T14:30:00Z"

name: "Authentication"
type: "service"
file_scope: "src/auth/**"

# These ACs were inferred from code — they may be incomplete or wrong
# Edit this spec to add your actual requirements
acceptance_criteria:
  - id: AC-AUTH-1
    description: "POST /auth/login accepts email+password, returns JWT"
    inferred_from: "src/auth/routes/login.ts:15"
    # ...
```

---

## Schema Changes

### Manifest Schema

```yaml
# Project level — add build_phase
project:
  build_phase: 1    # integer, default 1

# Node level — add phase
nodes:
  [node-id]:
    phase: 1        # integer, default 1
```

### State Schema

```json
"build_phase_started_at": {
  "type": ["string", "null"],
  "format": "date-time",
  "default": null,
  "description": "When the current build_phase was entered. Used for staleness warning (>7 days without advancement). Set when build_phase changes."
}
```

`build_phase` itself lives in the manifest (single source of truth), not state.

### Spec Schema

```yaml
# Optional field for ingested specs
spec_type: "prescriptive"  # default, or "descriptive" for ingested
generated_from: null        # "repo-ingestion" | "document-import" | null
```

### Validation Changes

`validate-manifest.js` additions:
- `build_phase` must be integer >= 1
- `build_phase` must not exceed max node phase
- If `phase` is present, must be integer >= 1 (optional — defaults to 1 if absent for backward compat)
- All nodes in phases <= build_phase must have spec files (enforces "can't build without spec")

---

## New Files

| File | Lines | Purpose |
|------|-------|---------|
| `commands/ingest.md` | ~100 | Repo ingestion command |
| `scripts/validate-ingest.js` | ~150 | Ground-truth validation of Translator mapping |

## Modified Files

| File | Changes |
|------|---------|
| `scripts/pre-tool-use.js` | Phase enforcement gate (block builds on future-phase nodes) |
| `scripts/session-start.js` | Phase awareness in ambient display + staleness warning |
| `scripts/validate-manifest.js` | build_phase + phase field validation |
| `templates/schemas/manifest-schema.yaml` | Add build_phase and phase fields |
| `agents/architect.md` | Phase-aware decomposition, phase assignment proposals |
| `agents/builder.md` | Fail-closed stub rule for security dependencies |
| `commands/discover.md` | Phase assignment during decomposition |
| `commands/spec.md` | Phase-aware spec depth (full / interface / skip) |
| `commands/build.md` | Phase-aware (only build_phase nodes) |
| `commands/sweep.md` | Phase-aware (don't flag unbuilt future nodes) |
| `commands/deep-build.md` | Phase advancement detection + prompt |
| `commands/guide.md` | Phase-aware recommendations |

## Build Order

### Phase 1: Schema + Enforcement
1. Add `build_phase` and `phase` to manifest schema
2. Add `spec_type` and `generated_from` to spec schema template
3. Add phase validation to validate-manifest.js
4. Add phase enforcement gate to pre-tool-use.js
5. Add phase awareness to session-start.js

### Phase 2: Phase-Aware Commands
6. Update architect.md with phase-aware decomposition
7. Update builder.md with fail-closed stub rule
8. Update discover.md with phase assignment
9. Update spec.md with phase-aware depth
10. Update build.md with phase gate
11. Update sweep.md with phase-aware sweep
12. Update deep-build.md with phase advancement detection
13. Update guide.md with phase recommendations

### Phase 3: Repo Ingestion
14. Create scripts/validate-ingest.js
15. Create commands/ingest.md
16. Wire ingest flow: Translator → Interviewer → validate-ingest → Review Panel (x2) → Architect → compile-wiki
17. Update CLAUDE.md

### Phase 4: Verification
18. End-to-end: create a 10-node project with 3 phases, build phase 1, verify phase gate blocks phase 2
19. End-to-end: ingest an existing Express app, verify manifest + specs + wiki generated correctly

## Success Criteria

1. **Phase gate works:** pre-tool-use blocks builds on phase 2 nodes when build_phase is 1
2. **Phase advancement works:** deep-build detects all phase 1 nodes certified, prompts advancement
3. **Fail-closed stubs:** Builder generates deny-by-default stubs for security dependencies
4. **Cross-phase integration:** /forgeplan:integrate mandatory after advancement, catches drift
5. **Repo ingestion works:** Express app ingested, mapped to nodes, specs generated, wiki populated
6. **Ground-truth validation:** validate-ingest.js catches incorrect Translator mappings
7. **Descriptive specs labeled:** Ingested specs clearly marked as descriptive, editable by user
8. **Wiki on ingest:** compile-wiki.js runs after ingest, captures institutional knowledge
9. **Phase staleness warning:** session-start warns after 10+ sessions without advancement
