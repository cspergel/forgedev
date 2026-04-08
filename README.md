# ForgePlan

Architecture-governed AI builds. A [Claude Code](https://claude.ai/claude-code) plugin.

```bash
/forgeplan:greenfield "A task manager with teams, permissions, and Supabase"
# One confirmation. Walk away. Come back to a certified, runnable codebase.
```

```
✓ Discovered: 5 nodes, 2 shared models (MEDIUM tier)
✓ Researched: 12 packages vetted, all MIT
✓ Specced: 47 acceptance criteria across 5 nodes
✓ Built: 38 files, all tests passing
✓ Verified: compiles, tests pass, dev server starts
✓ Reviewed: 5/5 nodes pass 7-dimension spec audit
✓ Swept: 5 agents, 2 passes, 0 findings remaining
✓ Certified. Ready to ship.
```

## What it does

ForgePlan sits between you and your AI-generated code. You describe the architecture once — nodes, boundaries, shared models, acceptance criteria — and the harness enforces it as code gets generated. Writes outside a node's file scope are rejected by a hook. Shared type redefinitions are blocked. Builds don't complete until acceptance criteria are met.

The pipeline: **discover** → **spec** → **build** → **verify** → **review** → **sweep** → **certify**.

Each step scales to your project. A simple app gets 3 sweep agents and finishes in one session. A complex app gets all 5 agents, cross-model verification, and convergence certification.

## Install

```bash
# Claude Code plugin — add via settings, then:
/forgeplan:help
```

## Commands

Start here:

```bash
/forgeplan:greenfield [description]    # Idea → certified app (autonomous)
/forgeplan:guide                       # What should I do next?
```

When you want more control:

```bash
/forgeplan:discover                    # Architecture conversation or --from doc.md
/forgeplan:research [topic]            # Package search, license check, patterns
/forgeplan:spec [node|--all]           # Generate enforcement contracts
/forgeplan:build [node|--all]          # Build with file scope + shared model enforcement
/forgeplan:review [node]               # 7-dimension spec-diff audit
/forgeplan:sweep [--cross-check]       # Multi-agent codebase audit
/forgeplan:deep-build                  # Full autonomous pipeline
```

[All 21 commands →](commands/)

## How enforcement works

| What | How |
|------|-----|
| File scope | Builder can only write to its node's directory. Hook rejects everything else. |
| Shared models | Types in the manifest must be imported from canonical source. Local redefinitions blocked. |
| Shell commands | Only safe commands allowed during builds. Dangerous operations rejected. |
| Acceptance criteria | Stop hook checks every criterion. Unmet criteria bounce the builder back. |
| Phase boundaries | Future-phase nodes are locked until current phase completes. |

80%+ of enforcement is instant glob matching. LLM-based checks only when needed.

## Sweep agents

Five agents audit your code from different angles after every build. All opus.

| Agent | Job |
|-------|-----|
| **Adversary** | Tries to break it — injection vectors, false-pass conditions, error handling gaps |
| **Contractualist** | Diffs both sides of every boundary — type mismatches, API contract violations, import drift |
| **Pathfinder** | Walks every user flow end-to-end — dead-end states, accessibility, test quality |
| **Structuralist** | Zooms out — over-engineering, dead code, inconsistent patterns, documentation accuracy |
| **Skeptic** | Traces every spec criterion to code — logic bugs, missing implementations, cross-agent gaps |

SMALL projects get 3 agents. MEDIUM gets 4. LARGE gets all 5. Agents that return clean twice are retired. Typical convergence: 1-2 passes.

## The `.forgeplan/` directory

```
.forgeplan/
├── manifest.yaml       # Nodes, shared models, tech stack, connections
├── state.json          # Build progress, sweep state
├── specs/              # Per-node enforcement contracts
├── wiki/               # Compiled knowledge base (grows with each build)
├── sweeps/             # Audit reports
├── research/           # Package and pattern research
└── conversations/      # Design rationale logs
```

This directory is the product. Portable across tools — anything that reads the manifest participates.

## Dogfood results

Tested on a 7-node, 61-file client portal (role-based access, file upload, multiple frontend views):

- Shared model field added → 6 nodes cascaded automatically → 0 breakage
- 60 sweep findings caught → 53 auto-fixed → 7 required human decisions (presented, not guessed)
- Cross-model certified by Codex. 2 consecutive clean passes.

## What's next

- **Skills system** — every agent gets domain-specific SKILL.md files for better output
- **MCP integrations** — builder validates code against live Supabase/Stripe/Cloudflare during builds
- **Standalone app** — visual node graph, live preview, real-time build steering

## Links

- [Commands reference](commands/)
- [Agent definitions](agents/)
- [Planning documents](Planning%20Documents/)
- [Sprint designs](docs/plans/)

---

*Define the architecture. Enforce it always.*
