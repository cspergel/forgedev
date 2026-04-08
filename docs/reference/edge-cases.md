# Edge Cases and Implementation Notes

From 50-case adversarial review (Sprint 7A). These cover Sprints 7A, 7B, 8, and 9. Grouped by topic, not by sprint, because edge cases often span multiple sprints.

## Verification Pipeline

- If project has no tests: detect before running test suite. Check for test files matching runner glob. If none exist, create a single finding "no tests written" — don't burn 3 retries on empty test suite.
- postinstall failures: classify as environment error, suggest pure-JS alternatives (bcrypt→bcryptjs, sharp→@napi-rs/image).
- Dev server port detection: priority chain — tech_stack.dev_port → PORT in .env → framework detection (scan for vite.config/next.config/app.listen) → fallback 3000. Use ACTUAL reported port from stdout, not expected.
- tsc passes but runtime types unsafe: scan for `as any`, `@ts-ignore`, untyped JSON.parse. Report as warnings, forward to sweep-contractualist (type consistency).
- Tests pass individually but fail together: run twice — parallel then serial. If serial passes, classify as "shared state" finding.
- Docker dependencies: add optional `tech_stack.infrastructure` field. Before tests, check if required services are running. If Docker unavailable, classify as environment error.
- Local vs CI differences: record tool versions in deep-build report. Check package.json engines constraint.
- Monorepo: detect workspaces/pnpm/turbo before install. Run install at root, tests per workspace. Add optional manifest `tech_stack.monorepo` field.
- Process safety: ONLY kill PIDs tracked in .forgeplan/.verify-pids. Never kill by name. Check cwd before killing port processes. SIGTERM→wait 5s→SIGKILL.

## Tier System

- Node splitting is the missing primitive for tier upgrades. `/forgeplan:split [node-id]` decomposes a node into finer-grained nodes while preserving code and state.
- SMALL app-shell: merge into primary node. Don't create a separate app-shell node for SMALL — the single coarse node handles both code and scaffolding.
- Broad file_scope (src/**) degrades Layer 1 enforcement to a rubber stamp. Accept as SMALL tradeoff — Layer 2 (LLM spec compliance) becomes primary guard. Add post-build file count warning if >20 files from one node.
- Tier misclassification detection: if sweep produces >15 findings per node, surface advisory: "High finding density suggests more decomposition needed."
- Non-web projects (CLI, extensions, libraries): expand valid node types beyond service/frontend/database/storage/integration. Added: extension, plugin, cli, worker, library, pipeline.
- User tier override guardrail: if override conflicts with assessed tier, warn with consequence list. Don't silently accept.

## Greenfield Pipeline

- Minimum viable input: autonomous discover requires at least a domain/purpose AND one user action. "Build me an app" halts with structured prompt, not a guess.
- Large documents (50+ pages): DON'T summarize — generate a guide/index file (Karpathy wiki pattern). Map document sections to architecture concepts: "Pages 1-3: Overview → manifest.project. Pages 4-8: Auth → auth node spec." Break into topic chunks. Architect reads index first, drills into sections on demand. Raw doc stays as immutable source. Save index as `.forgeplan/wiki/discovery-index.md`. Chunked PDF reading for >20 pages (Read tool limit). Shared infrastructure with Sprint 9 semantic memory.
- npm install failures in Builder: add retry logic in builder.md, not just verify-runnable. Network detection (npm ping) before starting pipeline.
- Hallucinated package names: after npm install, verify package resolved (check node_modules/[pkg]/package.json). If 404, search npm for correct name.
- Conflicting routes: add route collision detection to integrate-check.js. Maintain route registry in manifest.
- Autonomous mock mode: when discover runs --autonomous, DEFAULT to mock mode for all external service dependencies. Copy .env.example to .env with MOCK_MODE=true before first build.
- Stop hook bounce exhaustion: deep-build marks node as "built with warnings" after 3 bounces, adds unmet ACs to sweep findings, continues pipeline.
- Tech stack confirmation in autonomous mode: even for SMALL, a 5-second "I'll use React, Express, Supabase, TypeScript. OK?" is worth it. Don't build the wrong stack silently.
- Git safety: if .git exists with non-ForgePlan history, warn. Only stage ForgePlan artifacts in the initial commit, not arbitrary existing files.

## Document Import

- Contradiction detection: after extraction, scan for mutually exclusive requirements. Present both sides with explanation, require resolution before proceeding.
- Existing project guard: if src/ has files or .forgeplan/ exists, enter re-architecture mode or warn. Don't scaffold over existing code.
- Completeness checklist: after extraction, run domain-specific checklist (does this need auth? payments? PII handling?). Flag missing topics.
- Multi-phase documents: extract all phases, ask user which to architect now. Later phases become non-goals.
- Multiple documents: support multiple --from args. Classify by type (requirements > decisions > chat > reference). Merge with provenance tracking.
- Formal REQ IDs: preserve as source_ref on acceptance criteria. Show coverage matrix.
- PDF diagrams: attempt structural extraction, cross-reference with text. Flag low-confidence extractions.
- Non-English: extract in source language, generate all ForgePlan artifacts in English.

## Sweep and Cross-Model

- Fix agent verification step: before applying any fix, confirm the finding exists in the code. If not found, mark as false-positive, don't modify code.
- Stale file references: before dispatching fix agent, validate referenced files still exist. If deleted by prior fix, mark as resolved-by-deletion.
- Conflicting recommendations: detect findings touching same file with opposing intent. Flag as Category C (architectural decision).
- Finding identity tracking: track file+description hash across passes, not just count. If >50% net-new findings for 3 passes, fixes are introducing regressions.
- Cross-model provider down: add "certify without cross-model" recovery option. For LARGE tier, allow with explicit user approval + report warning.
- Category/severity normalization: map aliases (security→auth-security, high→HIGH) in extractFindings.
- 20+ blocked decisions: group by severity (HIGH first), then by node. Add "accept all HIGH" shorthand.
- High finding density as tier signal: >15 findings/node on SMALL suggests wrong tier. Surface advisory.
