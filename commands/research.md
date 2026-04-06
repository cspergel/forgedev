---
description: Research agents search for existing implementations, check licenses, gather docs. Run before speccing to make informed dependency and pattern choices.
user-invocable: true
argument-hint: "[topic (e.g., 'supabase auth', 'stripe payments', 'file uploads')]"
allowed-tools: Read Write Bash Glob Grep Agent WebSearch WebFetch
---

# Research

Dispatch research agents to gather best practices, packages, and documentation for a topic.

## Prerequisites

- `.forgeplan/manifest.yaml` should exist (for tech_stack context), but research can run without it

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

4. **Dispatch 4 research agents in parallel** (single message, 4 Agent tool calls):

   For each agent, provide:
   - The agent's system prompt (read from its `.md` file in `${CLAUDE_PLUGIN_ROOT}/agents/`)
   - The research topic
   - The project context (tech_stack, description)

   Agents to dispatch:
   - **Researcher** (`researcher.md`): package search + best practices
   - **License Checker** (`license-checker.md`): dependency risk analysis — pass the Researcher's recommended packages if available, otherwise pass tech_stack dependencies
   - **Inspiration** (`inspiration.md`): similar project references
   - **Docs Agent** (`docs-agent.md`): API documentation extraction

   **Note:** The License Checker ideally runs after the Researcher (to check the recommended packages). For parallel dispatch, pass it the manifest's known dependencies. If the Researcher finishes first and you can dispatch License Checker with the results, do so — otherwise the parallel dispatch with manifest deps is acceptable.

5. **Merge results** into a single report:
   - Start with a **Summary** section: key recommendations, flagged packages, reference count
   - Then include each agent's full output under its own heading
   - If any agent failed or returned empty results, note: "Agent [name] returned no results — [reason or 'could not access web']"

6. **Write the report:**
   - Save to `.forgeplan/research/[topic-slug]-[ISO-date].md`
   - Topic slug: lowercase, spaces replaced with hyphens, non-alphanumeric stripped, max 50 chars
   - Example: `.forgeplan/research/supabase-auth-2026-04-06.md`

7. **Present summary to user:**
   ```
   === Research Complete: [topic] ===

   Recommended packages: [top 3 with one-line rationale each]
   License issues: [count] flagged (or "all clear")
   Reference projects: [count] found
   Docs gathered: [list of technologies]

   Full report: .forgeplan/research/[filename].md

   This research will be used by /forgeplan:spec to inform implementation details.
   ```
