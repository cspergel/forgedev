---
description: Set up cross-model review, configure which AI models verify your code, and customize ForgePlan settings. Interactive setup wizard.
user-invocable: true
allowed-tools: Read Write Edit Bash
---

# ForgePlan Configuration

Interactive setup for cross-model review and other settings.

## Process

1. Check if `.forgeplan/config.yaml` already exists
2. If it exists, read it and show current settings
3. Walk the user through configuration options

## Configuration Wizard

Present this to the user:

```
=== ForgePlan Configuration ===

Cross-model review lets a DIFFERENT AI model verify your code —
catching issues the builder model missed. This powers:
  - /forgeplan:review (cross-model node review)
  - /forgeplan:sweep --cross-check (cross-model sweep verification)
  - /forgeplan:deep-build (automatic cross-model certification)

Choose your setup:

  1. MCP Mode (recommended)
     Uses an MCP server you've already configured.
     Best for: Codex, Gemini, or any MCP-compatible model.
     Requires: `claude mcp add <server-name>` already done.

  2. CLI Mode
     Spawns another AI CLI as a subprocess.
     Best for: Codex CLI, Gemini CLI.
     Requires: The CLI tool installed and on your PATH.

  3. API Mode
     Direct HTTP API calls to OpenAI, Google, or Anthropic.
     Best for: When you have an API key.
     Requires: An API key (can reference env vars).

  4. Native Only (no cross-model)
     All review done by Claude only. No alternate model.
     You can still use /forgeplan:review and /forgeplan:sweep,
     but --cross-check will be skipped.

  5. Show current config
     Display what's currently configured.

Which setup? [1/2/3/4/5]:
```

### If user picks 1 (MCP Mode):

Ask: "What's the name of your MCP server? (e.g., 'codex', 'gemini')"

If they don't have one set up, guide them:
```
You need to register an MCP server first. Run this in your terminal:

  ! claude mcp add <server-name>

For example:
  ! claude mcp add codex

After that, come back and run /forgeplan:configure again.

To see what MCP servers you have:
  ! claude mcp list
```

If they have one, write the config:
```yaml
review:
  mode: mcp
  mcp_server: [their-server-name]
```

### If user picks 2 (CLI Mode):

Ask: "What CLI command runs your alternate model? (e.g., 'codex', 'gemini')"

Verify it exists:
```bash
which [command] 2>/dev/null || where [command] 2>/dev/null
```

If not found, tell them to install it first. If found, write:
```yaml
review:
  mode: cli
  cli_command: [their-command]
```

### If user picks 3 (API Mode):

Ask: "Which provider? [openai / google / anthropic]"

Then ask: "API key — paste it or use an env var reference like $OPENAI_API_KEY"

If they paste a raw key, warn:
```
For security, consider using an environment variable instead:
  1. Set the env var: export OPENAI_API_KEY=sk-...
  2. Reference it in config: $OPENAI_API_KEY

This keeps your key out of config files that might get committed.
```

Ask: "Which model? (leave blank for default)"

Defaults by provider:
- openai: gpt-4o
- google: gemini-2.0-flash
- anthropic: claude-sonnet-4-20250514

Write:
```yaml
review:
  mode: api
  provider: [provider]
  api_key: [key-or-env-ref]
  model: [model-or-default]
```

### If user picks 4 (Native Only):

Write:
```yaml
review:
  mode: native
```

Tell them: "Cross-model review disabled. You can always re-run /forgeplan:configure to enable it later."

### If user picks 5 (Show Current):

Read `.forgeplan/config.yaml` and display it formatted:
```
=== Current Configuration ===
Review mode: [mode]
[mode-specific details]

To change: run /forgeplan:configure again.
```

## After Writing Config

Confirm:
```
Config saved to .forgeplan/config.yaml

Your setup:
  Review mode: [mode]
  [details]

To test it: /forgeplan:review [any-built-node]
To run a full sweep with cross-model: /forgeplan:sweep --cross-check
```

## Additional Settings

If the user asks about other settings, also offer:

### Enforcement Mode
```yaml
enforcement:
  mode: strict    # strict (default) or advisory
```
- `strict`: PreToolUse hooks BLOCK violations
- `advisory`: hooks WARN but don't block

### Model Tiering
```yaml
models:
  architect: inherit    # inherit session model
  builder: opus         # most capable for complex nodes
  reviewer: inherit     # inherit session model
```
