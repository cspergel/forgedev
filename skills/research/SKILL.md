---
description: Research packages, patterns, and docs for a ForgePlan project.
argument-hint: "[topic]"
disable-model-invocation: true
---

# Research

Dispatch research agents to gather best practices, packages, and documentation for a topic.

## Prerequisites

- `.forgeplan/manifest.yaml` should exist (for tech_stack context), but research can run without it
- **Optional but recommended for MEDIUM/LARGE projects:** Firecrawl MCP server for better web scraping. If Firecrawl tools are not available in the current session and the project is MEDIUM or LARGE tier, suggest setup:
  ```
  For deeper research, consider enabling Firecrawl (converts web pages to clean markdown):
    Run: npx -y firecrawl-cli@latest init --all --browser
    This auto-configures the Firecrawl MCP server for Claude Code.
    Get a free API key at https://firecrawl.dev if prompted.

  This is optional — research works without it, but documentation extraction
  is significantly better with Firecrawl.
  ```
  Only show this suggestion once per session (check if already suggested by looking for `firecrawl` in the conversation context).

## Process

1. **Load context:**
   - Read `.forgeplan/manifest.yaml` if it exists — extract `project.name`, `project.description`, `project.tech_stack`
   - If no manifest, use `$ARGUMENTS` as the sole context

2. **Determine research topic:**
   - If `$ARGUMENTS` is provided, use it as the topic
   - If no arguments AND manifest exists, read the manifest and suggest topics based on tech_stack integrations
   - If no arguments AND no manifest, halt with: "Provide a research topic (e.g., `/forgeplan:research supabase auth`) or run `/forgeplan:discover` first to create a manifest."

3. **Create research output directory:**
   ```bash
   mkdir -p .forgeplan/research
   ```

4. **Prepare local research runtime context:**

   Run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/research-prepare.js"
   ```

   This stages a local Researcher prompt and any assigned researcher skills into:
   - `.forgeplan/runtime/research/researcher.md`
   - `.forgeplan/runtime/research/skills/`
   - `.forgeplan/research/_raw/`

   It also returns the selected research model from `.forgeplan/config.yaml`:
   - `models.researcher` if configured
   - otherwise default to `sonnet`
   - `research.mode` if configured (`standard` or `deep`)
   - `research.max_agents` if configured, otherwise default to `1`

   Use the staged local paths for dispatch so research does not rely on repeated out-of-workspace reads from the plugin cache.

5. **Determine fanout policy before dispatch:**

   Research must be **cheap by default**.

   - Default to **1 primary Researcher agent**
   - Respect `research.max_agents` from `research-prepare.js`, but cap normal usage to:
     - `1` agent in `standard` mode
     - `2` agents in `deep` mode
   - Do **not** dispatch 3+ parallel full research agents for a normal `/forgeplan:research` call
   - Do **not** let multiple agents independently re-fetch the same web sources unless you have a material contradiction to resolve

   If a second agent is used, it is an **audit / contradiction-check pass**, not a second full parallel researcher. The first agent gathers packages/docs/prior art and writes raw artifacts into `.forgeplan/research/_raw/`. The second agent reads those cached artifacts plus the first report, then only checks:
   - contradictions
   - missing prior art
   - weakly supported claims
   - risky recommendations

6. **Dispatch the Researcher agent:**

   Provide:
   - The staged agent prompt from `.forgeplan/runtime/research/researcher.md`
   - The research topic
   - The project context (tech_stack, description)
   - The selected model from `models.researcher`
   - The selected `research.mode`
   - The effective `max_agents`
   - Any staged `read_now` / `reference` skills returned by `research-prepare.js`
   - The local raw artifact directory: `.forgeplan/research/_raw/`

   - **Researcher** (`researcher.md`): consolidated research agent — handles package search, license checking, reference implementations, best practices, architecture patterns, API documentation extraction, and prior art in one pass. (Sprint 10A: absorbs former license-checker, inspiration, and docs-agent.)
   - Prefer deterministic fetches through:
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/scripts/research-fetch.js" ...
     ```
     for npm registry/package/download lookups and direct URL capture into `.forgeplan/research/_raw/`.
   - Use WebFetch / Firecrawl / WebSearch only when the deterministic helper cannot cover the source.
   - If using multiple agents, dispatch them **sequentially through shared cached artifacts**, not as 2-5 independent full-context web crawls.

7. **Format the report:**
   - Start with a **Summary** section: key recommendations, flagged packages, reference count
   - Then include the full research output
   - If the agent failed or returned empty results, note: "Researcher returned no results — [reason or 'could not access web']"

8. **Write the report:**
   - Save to `.forgeplan/research/[topic-slug]-[ISO-date].md`
   - Topic slug: lowercase, spaces replaced with hyphens, non-alphanumeric stripped, max 50 chars
   - Example: `.forgeplan/research/supabase-auth-2026-04-06.md`

9. **Present summary to user:**
   ```
   === Research Complete: [topic] ===

   Recommended packages: [top 3 with one-line rationale each]
   License issues: [count] flagged (or "all clear")
   Reference projects: [count] found (architecture patterns extracted)
   Docs gathered: [list of technologies]

   Full report: .forgeplan/research/[filename].md

   This research will be used by /forgeplan:spec to inform implementation details.
   ```
