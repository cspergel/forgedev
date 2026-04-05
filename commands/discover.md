---
description: Start architecture discovery — guided conversation that produces a validated manifest with nodes, shared models, and dependency graph. This is the entry point for every new ForgePlan project.
user-invocable: true
argument-hint: "[project description or 'template:client-portal']"
allowed-tools: Read Write Edit Bash Glob Grep
agent: architect
---

# Architecture Discovery

You are starting a ForgePlan architecture discovery session.

## Setup

First, set up the project directory for a greenfield build if needed:

**1. Git initialization** (if not already a git repo):
```bash
git init
```

**2. Create the `.forgeplan/` directory structure** (before any scaffolding — tech stack decisions happen during the conversation, not before):
```
.forgeplan/
├── specs/
├── conversations/
│   └── nodes/
├── reviews/
└── sweeps/
```

**3. Set up ForgePlan CLAUDE.md:**
- If no `CLAUDE.md` exists: copy `${CLAUDE_PLUGIN_ROOT}/templates/forgeplan-claude.md` to `CLAUDE.md`
- If a `CLAUDE.md` already exists: append the ForgePlan section under a `# ForgePlan Project` heading at the end, but only if it doesn't already contain that heading

**4. Set up .gitignore:**
Append the entries from `${CLAUDE_PLUGIN_ROOT}/templates/forgeplan-gitignore` to the project's `.gitignore` if not already present. Also ensure these common entries are present:
```
node_modules/
dist/
.env
.env.*
```

## Template Mode

If the user's argument starts with `template:`, load the corresponding blueprint:
- `template:client-portal` → Load from `${CLAUDE_PLUGIN_ROOT}/templates/blueprints/client-portal.yaml` (7 nodes, 2 shared models — document upload portal)
- `template:saas-starter` → Load from `${CLAUDE_PLUGIN_ROOT}/templates/blueprints/saas-starter.yaml` (8 nodes, 3 shared models — multi-tenant SaaS with Stripe)
- `template:internal-dashboard` → Load from `${CLAUDE_PLUGIN_ROOT}/templates/blueprints/internal-dashboard.yaml` (6 nodes, 2 shared models — internal ops dashboard)

When loading a template:
1. Create the `.forgeplan/` directory structure and copy CLAUDE.md + .gitignore entries (per Setup above)
2. Copy the blueprint to `.forgeplan/manifest.yaml`
3. Set `created_at` to the current ISO 8601 timestamp
4. Generate skeleton specs for each node into `.forgeplan/specs/`
5. Run validation: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.js" .forgeplan/manifest.yaml`
6. Present the architecture summary to the user
7. Ask if they want to customize anything before proceeding

## Guided Discovery Mode

If no template is specified, begin the guided architecture discovery conversation.

User's project description: $ARGUMENTS

Follow the Architect agent's conversation framework:
1. **Understand** the project (2-3 questions)
2. **Establish tech stack** — ask the user what they want to use, or recommend based on the project type. Cover these categories:
   - **Runtime:** Node.js / Deno / Bun
   - **Language:** TypeScript / JavaScript
   - **Database:** Supabase / PostgreSQL (pg) / MySQL / SQLite / DuckDB / MongoDB / Firebase / PlanetScale / Turso / Neon / none
   - **ORM/Query builder:** Drizzle / Prisma / Knex / TypeORM / raw SQL / Supabase client / Mongoose / none
   - **API framework:** Express / Fastify / Hono / Koa / none (if serverless)
   - **Auth:** Supabase Auth / NextAuth / Clerk / Lucia / custom / none
   - **Test framework:** Vitest / Jest / Mocha / node:test
   - **Frontend:** React / Vue / Svelte / Next.js / Nuxt / SvelteKit / none (API only)
   - **Deployment:** Docker / Vercel / Railway / Fly.io / AWS / self-hosted / undecided

   Write these into the manifest under a `tech_stack` section:
   ```yaml
   tech_stack:
     runtime: node
     language: typescript
     database: supabase
     orm: supabase-js
     api_framework: express
     auth: supabase-auth
     test_framework: vitest
     frontend: react
     deployment: docker
   ```
   The Builder agent reads this to install correct dependencies and use the right patterns.

   **If the user doesn't know what to pick:** For each category, briefly explain the top 2-3 options with pros/cons, then recommend one based on their project type. Example:
   ```
   Database options for your project:
     Supabase — Hosted Postgres + auth + storage. Fastest to start, free tier.
                Downside: vendor lock-in, less control.
     PostgreSQL (self-hosted) — Full control, any hosting. More setup.
     SQLite — Zero config, file-based. Great for small projects.
                Downside: no concurrent writes, not for production APIs.

   For a URL shortener with auth, I'd recommend Supabase — fastest path
   to a working product with built-in auth.
   ```
   Always make a recommendation. Don't leave the user stuck choosing.
3. **Decompose** into nodes (3-5 questions, enforce granularity)
4. **Identify** shared models (entities used by 2+ nodes)
5. **Map** connections and dependencies. For each interface, establish the **import convention**: how Node B imports from Node A. Use the pattern `src/[node-name]/index.ts` as the canonical export point for every node. Document this in each interface's `contract` field.
6. **Validate** and present summary
7. **Confirm** with user before finalizing

After each node addition or major change, show an updated text-based architecture summary.

**After tech stack is decided and manifest is written, scaffold the project:**

If no `package.json` exists and tech_stack.runtime is `node` (or not set):
```bash
npm init -y
```

Install language tooling based on tech_stack.language:
- TypeScript: `npm install --save-dev typescript @types/node` and `npx tsc --init` (if no tsconfig.json exists)
- JavaScript: no additional tooling needed

Create `src/` directory if it doesn't exist.

This happens AFTER the tech stack conversation so the right tooling is installed.

After writing the manifest, always run validation:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.js" .forgeplan/manifest.yaml
```

## Completion

When discovery is complete:
1. Save the conversation log to `.forgeplan/conversations/discovery.md`
2. Initialize `.forgeplan/state.json` with:
```json
{
  "session_id": "${CLAUDE_SESSION_ID}",
  "last_updated": "[current ISO timestamp]",
  "active_node": null,
  "nodes": {},
  "shared_types_created_by": null,
  "stop_hook_active": false,
  "discovery_complete": true,
  "sweep_state": null
}
```
3. Populate the `nodes` object in state.json with each node ID set to `{"status": "pending"}`
4. Create an initial git commit to establish a recovery baseline:
   ```bash
   git add -A && git commit -m "forgeplan: project architecture initialized"
   ```
5. Present the final summary and suggest next steps:
   ```
   Architecture complete! [N] nodes, [N] shared models.

   Next steps — choose your path:

     Manual (more control):
       → /forgeplan:spec --all     Generate detailed specs (interactive)
       → /forgeplan:build [node]   Build nodes one at a time

     Autonomous (walk away):
       → /forgeplan:deep-build     Specs all nodes, builds, reviews, sweeps,
                                    and cross-model certifies — fully autonomous.
   ```
