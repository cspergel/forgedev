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

  1. OpenAI (Codex/GPT) via MCP     — recommended if you use OpenAI
  2. Google Gemini via MCP            — recommended if you use Gemini
  3. OpenAI (Codex/GPT) via CLI       — uses Codex CLI subprocess
  4. Google Gemini via CLI             — uses Gemini CLI subprocess
  5. Direct API (any provider)         — HTTP API calls with your key
  6. Native Only (no cross-model)      — Claude reviews its own work
  7. Show current config

Which setup? [1-7]:
```

### If user picks 1 (OpenAI via MCP):

First check if the MCP server is already registered:
```bash
claude mcp list 2>&1
```

If `codex-cli` or similar OpenAI server is listed, skip to config write.

If not, guide them through setup:
```
To use OpenAI/Codex via MCP, we need two things:

Step 1: Install the Codex CLI (if not already installed)
  ! npm install -g @openai/codex

Step 2: Authenticate Codex
  ! codex login
  This opens a browser for ChatGPT login (easiest).
  Or use an API key directly: ! codex login --api-key "YOUR_OPENAI_API_KEY"
  Check status: ! codex login status

Step 3: Add the Codex MCP server to Claude Code
  ! claude mcp add codex-cli -- codex mcp serve

Step 4: Verify it's working
  ! claude mcp list
  Look for "codex-cli" with status "Connected"
```

After setup confirmed, write config:
```yaml
review:
  mode: mcp
  mcp_server: codex-cli
```

**Alternative (simpler OpenAI MCP — no Codex CLI needed):**
```
If you just want OpenAI chat completions without the full Codex CLI:

  ! claude mcp add mcp-openai -e OPENAI_API_KEY=sk-your-key-here -- npx -y @mzxrai/mcp-openai@latest

This exposes an openai_chat tool. Simpler but less feature-rich than Codex.
```

### If user picks 2 (Gemini via MCP):

```
To use Google Gemini via MCP:

Step 1: Get a Gemini API key (free)
  Go to: https://aistudio.google.com/apikey
  Create a key and copy it.

Step 2: Add the Gemini MCP server to Claude Code
  ! claude mcp add gemini -s user -- env GEMINI_API_KEY=YOUR_KEY npx -y @rlabs-inc/gemini-mcp

  (Replace YOUR_KEY with your actual API key)

  Optional: limit to text tools only (faster startup):
  ! claude mcp add gemini -s user -- env GEMINI_API_KEY=YOUR_KEY env GEMINI_TOOL_PRESET=text npx -y @rlabs-inc/gemini-mcp

Step 3: Verify it's working
  ! claude mcp list
  Look for "gemini" with status "Connected"
```

After setup confirmed, write config:
```yaml
review:
  mode: mcp
  mcp_server: gemini
```

### If user picks 3 (OpenAI via CLI):

```
To use Codex CLI for cross-model review:

Step 1: Install the Codex CLI
  ! npm install -g @openai/codex

Step 2: Authenticate
  ! codex login
  (or: ! codex login --api-key "YOUR_OPENAI_API_KEY")

Step 3: Verify it works
  ! codex exec "Hello, respond with OK"

Note: Codex CLI has experimental Windows support.
If you're on Windows and it doesn't work, use API mode (option 5) instead.
```

Verify the CLI exists:
```bash
which codex 2>/dev/null || where codex 2>/dev/null
```

If found, write config:
```yaml
review:
  mode: cli
  cli_command: codex
  cli_args: ["exec"]
```

### If user picks 4 (Gemini via CLI):

```
To use Gemini CLI for cross-model review:

Step 1: Install the Gemini CLI (requires Node.js 20+)
  ! npm install -g @google/gemini-cli

Step 2: Authenticate (run once interactively)
  ! gemini
  Follow the Google account auth flow, then exit.

Step 3: Verify it works
  ! gemini -p "Hello, respond with OK"
```

Verify the CLI exists:
```bash
which gemini 2>/dev/null || where gemini 2>/dev/null
```

If found, write config:
```yaml
review:
  mode: cli
  cli_command: gemini
  cli_args: ["-p"]
```

### If user picks 5 (Direct API):

Ask: "Which provider? [openai / google / anthropic]"

Then ask: "API key — paste it or use an env var reference like $OPENAI_API_KEY"

If they paste a raw key (starts with `sk-`, `AIza`, or `ant-`), warn:
```
For security, consider using an environment variable instead:
  1. Set the env var: export OPENAI_API_KEY=sk-...
  2. Reference it in config: $OPENAI_API_KEY

This keeps your key out of config files that might get committed to git.
```

Ask: "Which model? (leave blank for default)"

Defaults and recommended models by provider:

**OpenAI:**
- Default: `gpt-4o` (proven, widely available)
- Recommended: `gpt-4o` or newer if available
- Budget: `gpt-4o-mini`

**Google:**
- Default: `gemini-2.5-flash` (best price-performance)
- Recommended: `gemini-2.5-pro` for thorough reviews
- Budget: `gemini-2.5-flash-lite`

**Anthropic (Claude reviewing Claude):**
- Default: `claude-sonnet-4-6` (balanced)
- Recommended: `claude-sonnet-4-6` (different perspective from Opus builder)
- Note: This is Claude reviewing Claude — useful for model-tier diversity (Sonnet reviewing Opus's work) but not true cross-model verification

Write:
```yaml
review:
  mode: api
  provider: [provider]
  api_key: [key-or-env-ref]
  model: [model-or-default]
```

### If user picks 6 (Native Only):

Write:
```yaml
review:
  mode: native
```

Tell them: "Cross-model review disabled. You can always re-run /forgeplan:configure to enable it later."

### If user picks 7 (Show Current):

Read `.forgeplan/config.yaml` and display it formatted:
```
=== Current Configuration ===
Review mode: [mode]
[mode-specific details]

To change: run /forgeplan:configure again.
```

If no config exists:
```
No .forgeplan/config.yaml found. Using defaults (native review only).
Run /forgeplan:configure to set up cross-model review.
```

## After Writing Config

Confirm:
```
Config saved to .forgeplan/config.yaml

Your setup:
  Review mode: [mode]
  [provider/server details]

To test it:
  /forgeplan:review [any-built-node]

To run a full sweep with cross-model verification:
  /forgeplan:sweep --cross-check

To run the full autonomous pipeline:
  /forgeplan:deep-build
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

### Timeout
```yaml
review:
  timeout: 300000    # milliseconds (default: 300000 = 5 min for sweep, 120000 = 2 min for single node)
```
