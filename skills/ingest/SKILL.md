---
description: Ingest an existing repository into ForgePlan and generate descriptive specs.
argument-hint: "[--force] [--confirm-auto]"
disable-model-invocation: true
---

# /forgeplan:ingest

Bootstrap ForgePlan governance on an existing codebase. This is step 1 — it generates descriptive specs (what the code does) not prescriptive specs (what it should do). Run `/forgeplan:spec` on each node after ingest to add real requirements.

## Prerequisites
- Must be run from the project root directory
- No existing `.forgeplan/` directory (unless --force flag)

## Process

### Step 0: Create .forgeplan/ directory
Create `.forgeplan/` if it doesn't exist (needed for Step 2 mapping file):
```bash
mkdir -p .forgeplan
```

### Step 1: Translator Scans Repo
Dispatch the Translator agent in repo mode (read `agents/translator.md`).
Include in prompt: "You are in REPO MODE. Scan the codebase at [cwd]. Read the directory structure, package.json, imports, and tests. Output the standard JSON mapping with source: repo."
Translator outputs structured JSON mapping.

**Validate output:** Same validation as discover.md's Translator path — parse JSON, check required fields (project_name, proposed_nodes, shared_models, tier_assessment, ambiguities). Strip markdown fences if present. Fall back to error message if invalid after 3 retries: "Repo structure too unusual for automatic ingestion. Run /forgeplan:discover manually."

### Step 1.5: Force-Ingest Confirmation (--force only)
If `--force` was passed AND `.forgeplan/` already contains ANY ForgePlan content beyond `.ingest-mapping.json`, present an explicit overwrite warning before proceeding:
```
⚠ Re-ingesting will OVERWRITE existing ForgePlan artifacts:
  - .forgeplan/manifest.yaml (your current architecture)
  - .forgeplan/specs/*.yaml (all node specs)
  - .forgeplan/state.json (build/review state)
  - .forgeplan/wiki/ (knowledge base)
  - .forgeplan/plans/ (implementation planning artifacts)
  - .forgeplan/research/ (research artifacts that could steer future specs/builds)
  - Any other existing `.forgeplan/` governance files except preserved sweeps/conversations

  Existing sweep reports and conversation logs will be preserved.

  This cannot be undone. Continue? (y/n)
```
If the user declines, halt. **`--confirm-auto` does NOT skip this destructive overwrite confirmation.** It only skips the later mapping-acceptance gate.

### Step 2: Ground-Truth Validation
Write Translator output to `.forgeplan/.ingest-mapping.json`
Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-ingest.js" .forgeplan/.ingest-mapping.json` (append `--force` if the user passed `--force` to ingest)
If FAIL: re-dispatch Translator with validation errors as context. Max 3 retries.
If still failing after 3 retries: halt with "Repo structure too unusual for automatic ingestion. Run /forgeplan:discover manually."

### Step 3: Review Panel — Mapping Review
Dispatch 3 review agents (review-structuralist, review-contractualist, review-skeptic) with design lens.
Include: "You are reviewing a REPO MAPPING for an existing codebase. Check that the proposed node decomposition matches the actual code structure, that shared models are real, and that file scopes are accurate."
Loop until clean (max 5 passes). Architect fixes mapping issues between passes.

### Step 4: Confirmation Gate
Display proposed node map:
```
ForgePlan proposes this decomposition for your existing codebase:
  [node-id] ([file_scope], [N] files) — depends on: [deps]
  ...
  Shared models: [list]
  Tier: [tier]
Accept? [Y to accept / N to re-run Translator / E to edit manually]
```
If --confirm-auto: skip this gate.

### Step 5: Generate Manifest + Descriptive Specs
Architect generates manifest.yaml and spec files from confirmed mapping.
Specs are labeled `spec_type: "descriptive"` and `generated_from: "repo-ingestion"`.
All node statuses set to "built" (code already exists).
Set `build_phase: 1` and `build_phase_started_at` to current timestamp.

### Step 6: Review Panel — Spec Review
Dispatch same 3 review agents with design lens.
"You are reviewing DESCRIPTIVE SPECS generated from an existing codebase. Check that the specs accurately describe the existing code, that acceptance criteria reflect actual behavior, and that interfaces match real imports/exports."
Loop until clean (max 5 passes).

### Step 7: Write Manifest + Specs + State
Write `.forgeplan/manifest.yaml`, `.forgeplan/state.json`, `.forgeplan/specs/*.yaml`
Initialize state with all nodes in "built" status. For each node, also set `nodes.[node-id].spec_type` to `"descriptive"` in state.json — this caches the spec_type so session-start.js doesn't need to read spec YAML files on every session start.
Create `.forgeplan/` directory structure (specs/, plans/, conversations/, reviews/, sweeps/) using `mkdir -p` (safe — does not overwrite existing directories or their contents). **When `--force` is set:** delete and recreate stale governance directories before writing new artifacts: `wiki/`, `plans/`, `reviews/`, and `research/`. Then overwrite `manifest.yaml`, `state.json`, and `specs/*.yaml`. Preserve existing `sweeps/` and `conversations/` directories and their contents.

### Step 7.5: Validate Generated Specs
For each generated spec, run validation:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.js" .forgeplan/specs/[node-id].yaml .forgeplan/manifest.yaml
```
If any spec fails validation, fix the spec (re-engage Architect) and re-validate. Do not proceed to Step 8 with invalid specs.

### Step 8: Compile Wiki
If tier is MEDIUM or LARGE:
1. Create wiki skeleton: `.forgeplan/wiki/index.md`, `.forgeplan/wiki/nodes/[node-id].md` per node, `.forgeplan/wiki/decisions.md`, `.forgeplan/wiki/rules.md`
2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/compile-wiki.js"` to compile institutional knowledge from specs and code into the wiki.
If tier is SMALL: skip wiki compilation, but still ensure any stale wiki directory left by `--force` was removed in Step 7.

### Step 9: Baseline Sweep (Read-Only)
Run `/forgeplan:sweep --baseline` for baseline quality assessment.
**CRITICAL: Do NOT auto-fix findings during baseline sweep.** This is an INFORMATIONAL pass only — the sweep agents report findings but no fix agents are dispatched. On an existing repo, auto-fixing would rewrite user code during onboarding.

### Step 10: Guide Onboarding
Output via /forgeplan:guide:
```
Your project has been mapped into ForgePlan with descriptive specs.
  [N] nodes mapped, [N] shared models identified
  [N] findings from baseline sweep (informational only, no auto-fixes)

Your specs are auto-generated (descriptive) — they capture what exists
but don't yet enforce requirements. To refine into full governance:
  → /forgeplan:spec [node]    Replace descriptive spec with prescriptive requirements
  → /forgeplan:review [node]  Review a node against its refined spec
  → /forgeplan:status         See which nodes still carry descriptive specs

  → /forgeplan:guide            Get guidance anytime

Once specs are refined to prescriptive, future changes go through the full pipeline.
```
