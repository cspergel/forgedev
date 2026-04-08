---
description: Scan an existing codebase and bring it under ForgePlan governance. Generates manifest, descriptive specs, wiki, and runs baseline sweep. Fully autonomous with one confirmation gate.
user-invocable: true
argument-hint: "[--force (re-ingest existing project)] [--confirm-auto (skip confirmation, for autonomous pipelines)]"
allowed-tools: Read Write Edit Bash Glob Grep Agent
---

# /forgeplan:ingest

Bring an existing codebase under ForgePlan governance.

## Prerequisites
- Must be run from the project root directory
- No existing `.forgeplan/` directory (unless --force flag)

## Process

### Step 1: Translator Scans Repo
Dispatch the Translator agent in repo mode (read `agents/translator.md`).
Include in prompt: "You are in REPO MODE. Scan the codebase at [cwd]. Read the directory structure, package.json, imports, and tests. Output the standard JSON mapping with source: repo."
Translator outputs structured JSON mapping.

**Validate output:** Same validation as discover.md's Translator path — parse JSON, check required fields (project_name, proposed_nodes, shared_models, tier_assessment, ambiguities). Strip markdown fences if present. Fall back to error message if invalid after 3 retries: "Repo structure too unusual for automatic ingestion. Run /forgeplan:discover manually."

### Step 2: Ground-Truth Validation
Write Translator output to `.forgeplan/.ingest-mapping.json`
Run: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-ingest.js" .forgeplan/.ingest-mapping.json`
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
Initialize state with all nodes in "built" status.
Create `.forgeplan/` directory structure (specs/, plans/, conversations/, reviews/, sweeps/).

### Step 8: Compile Wiki
If tier is MEDIUM or LARGE, create wiki skeleton:
- `.forgeplan/wiki/index.md` with project summary
- `.forgeplan/wiki/nodes/[node-id].md` for each node
- `.forgeplan/wiki/decisions.md` and `.forgeplan/wiki/rules.md`

### Step 9: Baseline Sweep
Run `/forgeplan:sweep` for baseline quality assessment.
This establishes a finding baseline — the sweep will likely find many issues in an existing codebase. These are informational, not blocking.

### Step 10: Guide Onboarding
Output via /forgeplan:guide:
```
Your project has been ingested into ForgePlan governance.
  [N] nodes mapped, [N] shared models identified
  [N] findings from baseline sweep (informational)

Your specs are auto-generated (descriptive). To add actual requirements:
  → /forgeplan:spec [node]    Edit a node's spec to add requirements
  → /forgeplan:review [node]  Review a node against its spec
  → /forgeplan:status         See the full project state

All future changes go through the ForgePlan pipeline.
```
