---
description: Generate or refine one node spec or all specs.
argument-hint: "[node-id|--all]"
disable-model-invocation: true
---

# Generate Node Specification

Generate a detailed node spec for the specified node(s).

**Before starting:** Read the specification skill at `${CLAUDE_PLUGIN_ROOT}/skills/specification/SKILL.md` for field definitions, quality rules, and the canonical type mapping table.

**Target:** $ARGUMENTS

## Prerequisites

- `.forgeplan/manifest.yaml` must exist (run `/forgeplan:discover` first)
- `.forgeplan/state.json` must exist
- The target node must exist in the manifest (or use `--all`)

If the argument contains `--autonomous` or `--all --autonomous`, use the Autonomous Mode described below for ALL nodes regardless of tier. Do not prompt for any user input. This is used by `/forgeplan:greenfield` for fully autonomous spec generation.

## Single Node Mode (`/forgeplan:spec [node-id]`)

1. Read the manifest to get the node's metadata, connections, shared model dependencies, and tech stack
2. Read the existing skeleton spec at `.forgeplan/specs/[node-id].yaml` if it exists
3. Read specs of nodes this node connects to (for interface context)
4. Engage the user in a brief conversation to fill in details. Ask about each section that needs more specificity:
   - **Inputs/outputs:** What data enters and exits this node? What types? What validation?
   - **Acceptance criteria:** What specific, testable things must be true when this node is complete? Frame each as: "AC[n]: [description] — test: [how to verify]"
   - **Constraints:** What technology choices or behavioral rules must the implementation follow?
   - **Non-goals:** What is explicitly NOT in scope? (At least 1 required — this prevents feature creep)
   - **Failure modes:** What are the likely bugs that could ship? (At least 1 required — this guides the reviewer)
   - **Interfaces:** For each connection, what is the contract? What direction (read/write, outbound, inbound)?
5. Write the complete spec to `.forgeplan/specs/[node-id].yaml` using ALL 14 fields from the node spec schema
6. Run spec validation: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-spec.js" .forgeplan/specs/[node-id].yaml .forgeplan/manifest.yaml`
7. Run manifest validation: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.js" .forgeplan/manifest.yaml`
8. **Read** `.forgeplan/state.json`, then **update** (do not overwrite): set `nodes.[node-id].status` to `"specced"` (or `"revised"` if the node was previously `"built"` — see Descriptive Spec Refinement above), `nodes.[node-id].spec_type` to the spec's `spec_type` value (e.g., `"prescriptive"`, `"interface-only"`), and `last_updated` to current ISO timestamp. Preserve all other existing fields.
9. Present a summary of the spec and confirm with the user

## All Nodes Mode (`/forgeplan:spec --all`)

1. Read the manifest and determine dependency order. Always use the deterministic script — do not attempt manual sorting:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/topo-sort.js"
   ```
2. Process each node in dependency order:
   - For the first 1-2 nodes (typically database and auth), engage in full conversation
   - For subsequent nodes, generate a draft spec based on the manifest metadata and already-completed specs, then present it for user review/edit
   - Use completed specs to inform interface contracts on dependent nodes
3. After each spec is written:
   - Run validation
   - Update state.json
   - Present summary and get user confirmation before moving to the next node
4. After all specs are complete, present a full project summary showing all nodes and their acceptance criteria counts

## Tier-Aware Spec Generation

Read `complexity_tier` from `.forgeplan/manifest.yaml` to adapt behavior:

**SMALL tier:** Generate the best spec possible without multi-turn conversation:
- Read manifest (tech_stack, shared_models, node metadata, connections)
- Read existing skeleton spec and adjacent node specs for context
- Draft complete spec with filled ACs, test fields, constraints, non-goals, failure modes
- Present to user: "Here's the spec I generated. Confirm or edit?" (one confirmation, not multi-turn)
- If user confirms, write and validate. If user wants changes, make them and re-confirm.

**MEDIUM tier:** Use the standard interactive flow (current behavior) but streamline:
- For the first 1-2 nodes, full conversation
- For subsequent nodes, generate draft and present for review

**LARGE tier:** Full interactive conversation for every node (current behavior)

## Autonomous Mode (invoked by deep-build)

**This mode overrides the tier-specific interaction styles above. Regardless of tier, autonomous invocation uses the non-interactive flow described here.**

When invoked during `/forgeplan:deep-build` or `/forgeplan:greenfield`, the spec command runs **non-interactively**. When `--all` is also present, process nodes in dependency order (use `topo-sort.js` per the All Nodes Mode section above), applying this autonomous flow to each node:

1. Read the manifest (tech_stack, shared_models, node metadata, connections)
2. Read the existing skeleton spec and adjacent node specs for context
2b. **Read research findings** if available: check `.forgeplan/research/` for any `.md` files. If research reports exist, extract and apply:
    - Recommended packages → add to spec constraints (e.g., "Use [package] for [purpose]")
    - API contracts from docs → use to define interface contracts with concrete method signatures and response shapes
    - Best practices and patterns → inform acceptance criteria (e.g., "Must implement rate limiting per research findings")
    - License-flagged packages → add to constraints as exclusions (e.g., "Do NOT use [package] — GPL license")
    - Known gotchas → add as failure modes (e.g., "Supabase auth tokens expire after 1 hour — must handle refresh")
3. Generate the BEST spec possible without user conversation:
   - Derive acceptance criteria from the node's role, interfaces, and tech stack
   - Infer constraints from tech_stack (e.g., "Must use Express for routing" if tech_stack.api_framework is express)
   - Generate test fields that describe how to verify each AC (e.g., "Run npm test — expect [description]")
   - Derive non-goals from the node's scope boundaries (what adjacent nodes handle instead)
   - Derive failure modes from the interface contracts and data flow
4. Write the spec, run validation, update state
5. Do NOT ask the user for input or confirmation — deep-build is autonomous
6. If the generated spec fails validation, fix the validation errors and retry (up to 3 attempts)

The autonomous spec won't be as nuanced as a user-refined spec, but it will be complete enough for the builder to work with. The sweep phase catches issues that a quick spec misses.

## Spec Quality Gates

Before finalizing any spec, verify. **These gates apply to `prescriptive` and `descriptive` specs only. Interface-only specs (phase > build_phase) skip gates 1-4 — they have no ACs, non-goals, or failure modes by design.**

- [ ] Every acceptance criterion has `id` (AC1, AC2...) AND `test` field *(prescriptive/descriptive only)*
- [ ] Every interface has `type` (read/write | outbound | inbound) AND `contract`
- [ ] At least 1 `non_goal` present *(prescriptive/descriptive only)*
- [ ] At least 1 `failure_mode` present *(prescriptive/descriptive only)*
- [ ] `shared_dependencies` lists every shared model from the manifest that this node uses
- [ ] `file_scope` matches the manifest entry and doesn't overlap with other nodes
- [ ] `depends_on` matches the manifest entry

If any gate fails, fix it before writing the spec file.

## Output

Write the spec to `.forgeplan/specs/[node-id].yaml` and confirm with the user.

Suggest next: `/forgeplan:build [node-id]` to build this node, or `/forgeplan:next` to see the recommended order.

## Descriptive Spec Refinement (Sprint 10B — Post-Ingest)

When the existing spec has `spec_type: "descriptive"` (auto-generated from `/forgeplan:ingest`):

1. **Read the existing descriptive spec as a starting point.** It contains what the code currently does, not what it should do. Present the existing description, interfaces, and any auto-detected patterns to the user.
2. **Engage the user to add real requirements:** acceptance criteria, constraints, non-goals, failure modes. The descriptive spec's description and interfaces are the baseline — enhance them, don't discard them.
3. **Set the output spec to:** `spec_type: "prescriptive"` and clear `generated_from` (or set to null). This marks the spec as human-refined.
4. **Status handling for ingested nodes:** If the node's current status is `"built"` (code already exists from ingest), set status to `"revised"` instead of `"specced"`. This triggers a review against the new prescriptive spec without re-building (the code already exists). Do NOT downgrade a `"built"` node to `"specced"` — that would cause the builder to re-generate code on top of the existing codebase.

## Phase-Aware Spec Depth (Sprint 10B)

Read `build_phase` from manifest. For each node:
- **phase == build_phase:** Generate full spec (ACs, constraints, tests, interfaces, non-goals). Set `spec_type: "prescriptive"`.
- **phase == build_phase + 1:** Generate interface-only spec. **Recommended markers:** Set `spec_type: "interface-only"` and `generated_from: "phase-promotion"` in the YAML frontmatter for best validation accuracy. The spec MUST contain: `node`, `name`, `description`, `file_scope`, `interfaces`, `shared_dependencies`, `depends_on`. These fields must be omitted or left empty: `acceptance_criteria`, `constraints`, `non_goals`, `failure_modes`, `inputs`, `outputs`, `data_models`. (The validator rejects non-empty values but tolerates empty arrays/objects from YAML parsing.) Note: `validate-spec.js` can also detect interface-only shape heuristically (interfaces present + no acceptance_criteria + phase-promotion origin), but explicit markers are preferred.
- **phase > build_phase + 1:** Skip — no spec generated. Node exists in manifest as a stub entry only.

When `--all` is passed, apply this logic to all nodes. When a specific node is named, generate full spec regardless of phase (user override).
