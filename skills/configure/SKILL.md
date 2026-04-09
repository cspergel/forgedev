---
name: configure
description: Set up cross-model review, configure which AI models verify your code, and customize ForgePlan settings. Interactive setup wizard.
user-invocable: true
allowed-tools: Read Write Edit Bash
---

# ForgePlan Configuration

Automated setup for cross-model review and other settings.

## Process

1. Check if `.forgeplan/config.yaml` already exists
2. If it exists, read it and show current settings
3. Present the menu, then **execute the setup automatically** — don't show manual steps

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

**AUTOMATE EVERYTHING. Run each step, read the output, handle errors, and keep going. Only ask the user if something truly requires human action (browser login). Show brief progress like "Checking Codex CLI... installed." for each step.**

**Step 1: Check if MCP server is already registered.**
Run:
```bash
claude mcp list 2>&1
```
- If output contains `codex-cli` with status "Connected" → tell user "Codex MCP already configured and connected!" → skip to writing config.
- If output contains `codex-cli` with "Failed" or "Error" → remove it and continue from step 2:
  ```bash
  claude mcp remove codex-cli 2>&1
  ```

**Step 2: Check if Codex CLI is installed.**
Run:
```bash
which codex 2>/dev/null || where codex 2>/dev/null
```
- If found → "Codex CLI found." → continue.
- If not found → "Installing Codex CLI..." then run:
  ```bash
  npm install -g @openai/codex 2>&1
  ```
  - Read the output. If it contains "added" or shows a version → success, continue.
  - If it contains "ERR!" or "EACCES" → try with npx prefix instead and inform user:
    ```
    Global install failed. Trying alternative...
    ```
    If that also fails, tell user: "Could not install Codex CLI. Please run `npm install -g @openai/codex` manually, then run /forgeplan:configure again." and STOP.

**Step 3: Check if Codex is authenticated.**
Run:
```bash
codex login status 2>&1
```
- If output contains "Logged in" → "Codex authenticated." → continue to step 4.
- If output contains "not logged in" or error → tell user:
  ```
  Opening browser for ChatGPT login...
  ```
  Then run:
  ```bash
  codex login 2>&1
  ```
  This is interactive — the user completes the browser flow.
  After it returns, verify by running `codex login status` again.
  - If now "Logged in" → continue.
  - If still not logged in → ask user: "Login didn't complete. Do you have an OpenAI API key you can paste instead?" If yes, run `codex login --api-key "THEIR_KEY"`. If no, suggest option 5 (Direct API mode) and STOP.

**Step 4: Register the MCP server.**
Run:
```bash
claude mcp add codex-cli -- codex mcp serve 2>&1
```
- Read the output.
- If success → "Codex MCP server registered." → continue.
- If output contains "already exists" → remove and re-add:
  ```bash
  claude mcp remove codex-cli 2>&1 && claude mcp add codex-cli -- codex mcp serve 2>&1
  ```
- If output contains any other error → show the error to the user and suggest option 3 (CLI mode) as fallback:
  ```
  MCP registration failed: [error]. Falling back to CLI mode — this works just as well.
  ```
  Then write CLI config instead and skip to "After Writing Config".

**Step 5: Verify connection.**
Run:
```bash
claude mcp list 2>&1
```
- If `codex-cli` shows "Connected" → "Codex MCP connected and working!" → continue.
- If `codex-cli` shows "Failed" → diagnose:
  - Run `codex --version 2>&1` to check if the CLI is accessible.
  - If the CLI works but MCP doesn't, tell user:
    ```
    MCP connection failed but Codex CLI works fine. Switching to CLI mode instead — same functionality, different transport.
    ```
    Remove the broken MCP (`claude mcp remove codex-cli`) and write CLI config instead.
- If `codex-cli` is missing from the list → the add command silently failed. Try again once, then fall back to CLI mode.

**Step 6: Write config and confirm.**
Write `.forgeplan/config.yaml` and show the success message (see "After Writing Config" section).

### If user picks 2 (Gemini via MCP):

**This requires an API key — ask for it, then automate everything else.**

Ask: "Paste your Gemini API key (get one free at https://aistudio.google.com/apikey):"

Once they provide the key:

**Step 1: Check if MCP server is already registered.**
Run:
```bash
claude mcp list 2>&1
```
- If `gemini` shows "Connected" → "Gemini MCP already configured!" → skip to writing config.
- If `gemini` shows "Failed" → remove it: `claude mcp remove gemini 2>&1` and continue.

**Step 2: Register the MCP server.**
Run (substituting their actual key):
```bash
claude mcp add gemini -s user --env GEMINI_API_KEY=THEIR_KEY -- npx -y @rlabs-inc/gemini-mcp 2>&1
```
- If success → continue.
- If "already exists" → remove and re-add.
- If other error → show error, suggest option 5 (Direct API with google provider) as fallback.

**Step 3: Verify connection.**
Run:
```bash
claude mcp list 2>&1
```
- If `gemini` shows "Connected" → continue.
- If "Failed" → the API key might be wrong. Ask user to double-check their key. If they provide a new one, remove and re-add. If they can't fix it, fall back to API mode:
  ```
  MCP connection failed. Setting up direct API mode instead — same functionality.
  ```
  Write API config with their key and `gemini-2.5-flash` model instead.

**Step 4: Write config and confirm.**
Write `.forgeplan/config.yaml`:
```yaml
review:
  mode: mcp
  mcp_server: gemini
```

### If user picks 3 (OpenAI via CLI):

**AUTOMATE EVERYTHING. Show brief progress for each step.**

**Step 1: Check if Codex CLI is installed.**
Run:
```bash
which codex 2>/dev/null || where codex 2>/dev/null
```
- If found → "Codex CLI found." → continue.
- If not found → "Installing Codex CLI..." then run `npm install -g @openai/codex 2>&1`.
  - If install fails → tell user to install manually, STOP.

**Step 2: Check if Codex is authenticated.**
Run:
```bash
codex login status 2>&1
```
- If "Logged in" → continue.
- If not → "Opening browser for ChatGPT login..." → run `codex login 2>&1`.
  - After return, verify with `codex login status` again.
  - If still not logged in → ask for API key, try `codex login --api-key`. If that fails → suggest option 5.

**Step 3: Quick test.**
Run:
```bash
codex exec "Respond with only the word OK" 2>&1
```
- If output contains "OK" → "Codex working!" → continue.
- If it fails or times out → show the error. Common fixes:
  - "rate limit" → tell user to wait and retry.
  - "model not found" → Codex may need a config update. Try: `codex exec -c model="gpt-4o" "Respond with OK"`.
  - Other error → show it and suggest option 5 (Direct API) as fallback.

**Step 4: Write config and confirm.**
Write `.forgeplan/config.yaml`:
```yaml
review:
  mode: cli
  cli_command: codex
  cli_args: ["exec"]
```

### If user picks 4 (Gemini via CLI):

**AUTOMATE EVERYTHING except the interactive auth step.**

**Step 1: Check if Gemini CLI is installed.**
Run:
```bash
which gemini 2>/dev/null || where gemini 2>/dev/null
```
- If found → "Gemini CLI found." → continue.
- If not found → "Installing Gemini CLI..." then run `npm install -g @google/gemini-cli 2>&1`.
  - If install fails → tell user to install manually, STOP.

**Step 2: Check authentication.**
Run a quick test to see if already authenticated:
```bash
gemini -p "Respond with only the word OK" 2>&1
```
- If output contains "OK" → already authenticated, skip to step 4.
- If output contains "auth" or "login" or "credential" error → tell user:
  ```
  Gemini needs a one-time Google login. Please run this command and complete the auth:
    ! gemini
  Then type /quit when done, and I'll continue setup.
  ```
  Wait for user to confirm, then re-test.
  - If test passes → continue.
  - If still fails → suggest option 5 (Direct API with google provider) as fallback.

**Step 3: Write config and confirm.**
Write `.forgeplan/config.yaml`:
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

Write `.forgeplan/config.yaml`:
```yaml
review:
  mode: api
  provider: [provider]
  api_key: [key-or-env-ref]
  model: [model-or-default]
```

### If user picks 6 (Native Only):

Write `.forgeplan/config.yaml`:
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
=== Configuration Complete ===

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
