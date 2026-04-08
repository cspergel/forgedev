# Sprint 12 Design: MCP Integrations + Live Validation

**Date:** 2026-04-07
**Status:** Draft (research-informed)
**Goal:** Pre-configured MCP connections to popular products. Live API validation during builds. Integration templates for popular stacks.
**Research:** `.forgeplan/research/mcp-integrations-sprint12.md`, `specific-mcp-servers.md`, `cloudflare-mcp-cli.md`, `github-mcp-cli.md`

---

## Key Research Findings That Shape This Design

1. **All major services have official MCP servers.** Supabase, Firebase, Stripe, Vercel, Railway, Cloudflare, GitHub, Resend, Postgres — all have first-party MCP servers. Sprint 12 composes and configures, it does NOT build MCP bridges.

2. **Tool explosion is the #1 risk.** 51 GitHub tools + 25 Stripe tools + 20 Supabase tools = 96+ tools in context. ForgePlan MUST load MCP tools selectively per build phase, not dump everything.

3. **`.mcp.json` is the project-scoped config format.** Claude Code supports project-level MCP configuration that can be version-controlled. This is the distribution mechanism.

4. **Cloudflare's Code Mode MCP is the gold standard.** 2,500+ endpoints via 2 tools in ~1,069 tokens. Other MCP servers should aspire to this token efficiency.

5. **`gh` CLI is already sufficient for GitHub.** No MCP needed — `gh` is native, authenticated, JSON-capable. MCP is secondary.

6. **Clerk's MCP is weak.** Docs/snippets only, no API access. Don't prioritize it.

7. **Security: never store credentials in `.mcp.json`.** Use `${ENV_VAR}` syntax. Prefer OAuth over API keys. Version-pin MCP packages.

---

## Pillar 1: Auto-Detection + Configuration

### The Problem

When a user's manifest says `tech_stack.database: supabase`, the builder generates Supabase code blind — it doesn't verify the schema exists, the auth config is correct, or the API endpoints work. MCP changes this by connecting the builder to the actual service during the build.

### Auto-Detection Flow

```
/forgeplan:discover completes → manifest has tech_stack
  ↓
ForgePlan reads tech_stack fields:
  database: supabase     → needs: @supabase/mcp-server-supabase
  auth: clerk            → needs: @anthropic/mcp-clerk (docs only — limited)
  deployment: vercel     → needs: @vercel/mcp (read-only)
  api_framework: express → no MCP needed (local code)
  frontend: react        → no MCP needed (local code)
  ↓
Presents to user:
  "Your project uses Supabase, Clerk, and Vercel.
   MCP servers are available for live validation:

   1. Supabase MCP — verify schemas, check auth config, debug queries
      Setup: requires SUPABASE_ACCESS_TOKEN env var
      Install: npx supabase mcp --init

   2. Vercel MCP — check deployments, read project config
      Setup: OAuth browser flow
      Install: npx @vercel/mcp --init

   3. Clerk MCP — SDK docs and code snippets (no API access)
      Setup: requires CLERK_SECRET_KEY env var
      Note: Limited to docs — no live validation possible

   Enable now? [all / select / skip]"
```

### Detection Signals (Priority Order)

1. `manifest.tech_stack.*` fields — primary signal
2. `package.json` dependencies — confirms what's actually installed
3. `.env` / `.env.example` variables — confirms service is configured
4. Import statements in code — confirms what's actually used

### MCP Server Registry

```yaml
# ${CLAUDE_PLUGIN_ROOT}/templates/mcp-registry.yaml
# Maps tech_stack values to MCP servers

supabase:
  package: "@supabase/mcp-server-supabase"
  transport: stdio
  auth: env_var
  env_vars: ["SUPABASE_ACCESS_TOKEN"]
  capabilities: [schema, auth, storage, debug, sql]
  priority: 1
  setup_command: "npx supabase mcp --init"
  docs: "https://supabase.com/docs/guides/getting-started/mcp"

stripe:
  package: "@anthropic/mcp-stripe"
  transport: stdio
  auth: oauth_or_api_key
  env_vars: ["STRIPE_API_KEY"]
  capabilities: [products, prices, customers, subscriptions, payments]
  priority: 1
  setup_command: "npx @anthropic/mcp-stripe --init"
  note: "Use restricted API keys with minimal permissions"

firebase:
  package: "@anthropic/firebase-mcp"
  transport: stdio
  auth: env_var
  env_vars: ["GOOGLE_APPLICATION_CREDENTIALS"]
  capabilities: [firestore, auth, storage, hosting, functions]
  priority: 2
  setup_command: "firebase mcp:init"

vercel:
  package: "@vercel/mcp"
  transport: stdio
  auth: oauth
  capabilities: [deployments, projects, env_vars, domains]
  priority: 2
  note: "Mostly read-only. Good for deployment verification."

railway:
  package: "@anthropic/railway-mcp"
  transport: stdio
  auth: env_var
  env_vars: ["RAILWAY_API_TOKEN"]
  capabilities: [projects, services, deployments, variables, templates]
  priority: 3

cloudflare:
  package: null  # Uses remote HTTP transport
  transport: http
  url: "https://mcp.cloudflare.com/mcp"
  auth: oauth
  capabilities: [workers, d1, kv, r2, pages, dns, containers]
  priority: 2
  note: "Code Mode — 2,500+ endpoints via 2 tools (~1K tokens). Most efficient MCP."

resend:
  package: "resend-mcp"
  transport: stdio
  auth: env_var
  env_vars: ["RESEND_API_KEY"]
  capabilities: [emails, domains, api_keys, audiences, contacts, broadcasts]
  priority: 2
  note: "56+ tools — most comprehensive. Consider selective loading."

postgres:
  package: "@anthropic/postgres-mcp-pro"
  transport: stdio
  auth: env_var
  env_vars: ["DATABASE_URL"]
  capabilities: [schema, queries, performance, migrations]
  priority: 1
  note: "Use CrystalDBA's Postgres MCP Pro — reference server archived due to SQL injection."

github:
  package: null  # Use gh CLI instead
  transport: null
  capabilities: [repos, prs, issues, actions, releases]
  priority: 3
  note: "gh CLI is preferred — already native in Claude Code, zero setup. MCP optional."

clerk:
  package: "@anthropic/mcp-clerk"
  transport: stdio
  auth: env_var
  env_vars: ["CLERK_SECRET_KEY"]
  capabilities: [docs, snippets]
  priority: 3
  note: "Docs only — no API access, no user management. Use for SDK reference only."
```

---

## Pillar 2: Live Validation During Builds

### The Core Idea

When the builder generates code that interacts with an external service, and the MCP server for that service is connected, the builder can VALIDATE against the live service:

```
Builder generates: supabase.from("users").select("id, email, role")
  ↓
MCP validation: call supabase MCP → list tables → "users" exists? ✓
                call supabase MCP → get columns("users") → has id, email, role? ✓
  ↓
If validation fails: "Table 'users' exists but has no 'role' column.
                      Available columns: id, email, name, created_at.
                      Fix the query or add the column."
```

### What Gets Validated (Per Service)

**Supabase / Postgres:**
- Table/column names in queries match actual schema
- Auth configuration matches spec (providers, redirect URLs)
- RLS policies exist for tables referenced in spec
- Storage buckets exist for file upload features

**Stripe:**
- Product/price IDs referenced in code exist
- Webhook endpoint configuration matches spec
- API version in code matches account setting

**Vercel:**
- Environment variables in code match project env vars
- Build configuration is valid for the framework
- Domain configuration exists

**Cloudflare:**
- Worker routes match spec endpoints
- D1 database exists and schema matches
- KV namespaces exist
- R2 buckets configured

### Validation Timing

```
Build phase:      Builder generates code → MCP validates → fix before commit
Review phase:     Reviewer checks MCP-validated code → fewer false positives
Sweep phase:      Contractualist agent uses MCP to verify contracts against live services
Verify-runnable:  Runtime verification uses MCP to confirm services are reachable
```

### Graceful Degradation (CRITICAL)

**MCP validates, it does NOT block.** If no MCP server is connected:
- Builder generates code normally (same as today)
- Review and sweep proceed with static analysis only
- A note appears: "MCP not connected for [service] — validation was static only"

If MCP is connected but the service is unreachable:
- Log warning: "Supabase MCP connected but service unreachable — skipping live validation"
- Continue with static analysis
- Do NOT fail the build because an external service is down

### Builder Integration

```markdown
## MCP-Augmented Building (Sprint 12)

After generating code that references an external service:
1. Check if an MCP server is connected for that service (read .mcp.json or active MCP connections)
2. If connected: validate the generated code against the live service
   - Schema/table/column names exist
   - Auth configuration matches
   - API endpoints/IDs are valid
3. If validation fails: fix the code before proceeding
4. If not connected: skip validation, note in build log
5. MCP validation is ADVISORY — it informs the builder, it does not block the build
```

---

## Pillar 3: Selective Tool Loading (Context Budget)

### The Problem

Loading all MCP tools for all connected services dumps 100+ tool definitions into context (~23K tokens for GitHub alone). This degrades AI performance.

### Solution: Phase-Aware Tool Loading

```yaml
# .forgeplan/config.yaml
mcp:
  selective_loading: true          # Default: true
  phase_tools:
    build:                         # During /forgeplan:build
      supabase: [schema, auth]     # Only schema + auth tools
      stripe: [products, prices]   # Only product/price tools
      vercel: []                   # No Vercel tools during build
    review:                        # During /forgeplan:review
      supabase: [schema]           # Schema verification only
      stripe: []                   # No Stripe tools during review
    sweep:                         # During /forgeplan:sweep
      supabase: [schema, auth]     # Full validation
      stripe: [products, webhooks] # Contract verification
    deploy:                        # During deployment verification
      vercel: [deployments, env_vars]
      cloudflare: [workers, d1]
```

### Default Tool Budgets Per Phase

| Phase | Max MCP Tools | Rationale |
|---|---|---|
| Build | 20 | Builder needs schema + auth verification |
| Review | 10 | Reviewer needs read-only verification |
| Sweep | 15 | Contractualist needs contract verification |
| Verify | 10 | Runtime verification needs connectivity checks |

---

## Pillar 4: Integration Templates

### `.mcp.json` Generation

When the user enables MCP during `/forgeplan:discover` or `/forgeplan:configure`, generate a project-level `.mcp.json`:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    },
    "stripe": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-stripe"],
      "env": {
        "STRIPE_API_KEY": "${STRIPE_API_KEY}"
      }
    }
  }
}
```

This file is version-controlled (credentials use env var references). Team members clone the repo and it just works (once they set their env vars).

### `.env.example` Enhancement

When MCP servers are configured, update `.env.example` with the required variables:

```bash
# MCP Server Authentication (see .mcp.json)
SUPABASE_ACCESS_TOKEN=           # Get from: supabase.com/dashboard → Settings → Access Tokens
STRIPE_API_KEY=rk_test_          # Get from: dashboard.stripe.com/apikeys (use restricted key)
```

---

## Implementation Order

1. **mcp-registry.yaml** — static mapping of tech_stack values to MCP servers
2. **Auto-detection in discover/configure** — read tech_stack, suggest MCP servers
3. **`.mcp.json` generation** — create project-level MCP config
4. **Builder MCP validation** — validate generated code against live services
5. **Selective tool loading** — phase-aware config in config.yaml
6. **Sweep MCP validation** — Contractualist uses MCP for contract verification
7. **`.env.example` enhancement** — document required env vars

---

## What This Sprint Does NOT Include

- Building custom MCP servers (all are vendor-provided)
- MCP server health monitoring/dashboards
- Automatic credential rotation
- Multi-environment MCP configs (dev/staging/prod) — Sprint 13+
- MCP usage analytics/token tracking

---

## Files That Need Changes (~15)

- `templates/mcp-registry.yaml` — NEW: tech_stack → MCP server mapping
- `commands/discover.md` — MCP detection + suggestion after tech_stack conversation
- `commands/configure.md` — MCP setup wizard enhancement
- `agents/builder.md` — MCP validation during code generation
- `agents/sweep-contractualist.md` — MCP contract verification
- `commands/build.md` — selective tool loading per phase
- `commands/sweep.md` — selective tool loading for sweep phase
- `templates/schemas/config-schema.yaml` — mcp section with selective_loading + phase_tools
- `scripts/verify-runnable.js` — MCP connectivity checks
- `scripts/runtime-verify.js` — MCP-augmented endpoint verification
- `CLAUDE.md` — Sprint 12 documentation

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Tool explosion degrades AI performance | HIGH | Selective loading, phase-aware budgets, max 20 tools per phase |
| MCP server down blocks builds | HIGH | Graceful degradation — MCP is advisory, never blocking |
| Credential leakage in `.mcp.json` | HIGH | `${ENV_VAR}` syntax only, never raw credentials |
| Version drift in MCP servers | MEDIUM | Pin versions in mcp-registry.yaml, periodic research updates |
| Token cost of MCP validation calls | MEDIUM | Cache validation results within a build session, don't re-validate unchanged code |
| Clerk MCP is nearly useless | LOW | Document limitation, don't promise live validation for Clerk |

---

## MCP Server Priority for Sprint 12

| Priority | Service | Why |
|---|---|---|
| P1 | Supabase | Most common database choice, rich MCP (20+ tools), schema validation is highest value |
| P1 | Stripe | Payment integration is complex and error-prone, MCP validates product/price IDs |
| P1 | Postgres | Direct database access for projects not using Supabase |
| P2 | Cloudflare | Code Mode MCP is revolutionary (2,500 endpoints, ~1K tokens), strong Anthropic partnership |
| P2 | Firebase | Official Claude plugin, 30+ tools, growing ecosystem |
| P2 | Vercel | Common deployment target, read-only MCP is low-risk |
| P2 | Resend | 56+ tools but email is usually not the critical path |
| P3 | Railway | Solid but smaller user base |
| P3 | GitHub | `gh` CLI is already sufficient |
| P3 | Clerk | Docs only — minimal value from MCP |
