# FORGEPLAN

## Concept Document

*The AI Development Workstation*

Where Architecture Drives the Build

Version 4.0 — Full Technical Specification with Hardened Plugin Implementation

Prepared by Craig Spergel

April 2026

**DRAFT — CONFIDENTIAL**

# 1. Executive Summary

Software development is undergoing a fundamental shift. LLMs have made it possible for anyone to describe an application and watch it materialize. Yet a critical gap remains between consumer vibecoding tools that abstract away too much and professional tools that assume developer fluency. Neither solves the fundamental problem: the loss of architectural coherence as complexity grows.


> **Core Thesis**
>
> ForgePlan is a purpose-built AI Development Workstation where the visual architecture diagram is the primary interface, the persistent source of truth, and the governing constraint system for all AI-driven code generation. The architecture is not documentation. It is an enforceable contract that agents cannot deviate from.


ForgePlan serves three tiers of users within a single application: non-technical builders working through visual blueprints and conversation, emerging developers who want to see under the hood, and professional developers who need full control but benefit from persistent architectural awareness. The tiers are a zoom level, not separate products.

# 2. The Problem

Vibecoding platforms optimize for the first five minutes but create fragile codebases that collapse under modification. The root cause is the absence of a persistent plan. Every prompt is interpreted in isolation. There is no contract the agent builds against. Specific failure modes include: code being stubbed and never completed, inconsistent naming across sessions creating broken references, features silently dropped or reimplemented in incompatible ways, and the inability to make architectural changes without cascading breakage.

Professional AI coding tools solve quality but assume developer fluency. No existing product occupies the space between: providing a visual, conversational entry point that progressively reveals complexity while maintaining architectural coherence throughout the lifecycle.

# 3. The Architecture-First Paradigm

When a user opens ForgePlan, they see a canvas, not a code editor. The user describes what they want through text, voice, or template selection. The AI generates a visual blueprint: a node graph showing major systems, connections, and data flow. The user and AI refine this together through conversation before any code is written.

Template blueprints provide starting points for common patterns: online stores, client portals, dashboards. Alternatively, a guided conversation interview builds the architecture in real time, each answer visibly updating the blueprint. This mirrors the natural workflow of experienced builders who flush out ideas through conversation before coding.

Phantom previews generate low-fidelity UI mockups for frontend nodes during discovery, giving users the emotional payoff of seeing their app take shape immediately while understanding these are previews. As the build progresses, phantoms are replaced by working UI node by node. Phantom previews also serve a steering function, allowing users to redirect design before code is written.

# 4. The Progressive Complexity Model

Three tiers as a zoom level, not a switch. Tier 1 (Blueprint): architecture canvas plus conversation, code hidden, AI builds from specs automatically. Tier 2 (X-Ray): architecture canvas plus code inspection with AI explanations, guided edits. Tier 3 (Full Control): full code editor and terminal, bidirectional sync. The graduation path actively invites deeper exploration through contextual learning nudges.

# 5. The Build Harness: Five-Phase Workflow

Phase 1 (Discovery): Conversational architecture generation with adaptive questioning. Phase 2 (Specification): Structured node specs with inputs, outputs, dependencies, acceptance criteria. Phase 3 (Build): Node-by-node construction following dependency order, with visual status tracking. Phase 4 (Review): Cross-model audit for spec compliance, interface integrity, security, and pattern consistency. Phase 5 (Integration): Full-system data flow verification with visual tracing.

Each agent’s system prompt includes the node spec, adjacent interface contracts, and an explicit directive: do not deviate from this spec. If the spec is ambiguous, ask the user; do not improvise.

# 6. The Project Manifest and Node Spec Architecture

A two-layer file system: a single Project Manifest defining every node ID, type, connections, build status, and pointer to its spec file; and individual Node Spec files containing detailed contracts per node. The manifest is the single source of truth. Every operation begins by reading it. No node can exist without a manifest entry, and no agent can operate without reading the manifest first.

This directly prevents stubbing and naming drift. Every component has an explicit definition before the agent starts. Every entity has a canonical ID and name injected into every agent’s context.

# 7. Multi-LLM Orchestration and Cross-Checking

Three agent roles: Architect (system design, discovery, spec authoring), Builder (code generation per node), and Reviewer (audit, security, spec compliance). The Reviewer should be a different model from the Builder. ForgePlan ships with bundled compute for two to three builds per month; power users bring their own API keys and can assign specific models to specific roles.

# 8. The Bidirectional Sync Architecture

The Project Graph is the source of truth, with the visual canvas and code both derived from it. Bidirectional sync is achievable because the system generates code using known patterns with anchor comments tying each function back to its node ID. V1 focuses on greenfield projects.

# 9. Navigating Complexity: Hierarchical Zoom

Hierarchical zoom with persistent breadcrumbs. Top level shows major systems. Drilling in reveals subsystems, then components, then code. Organized by feature and function, not by file tree. The user always knows where they are.

# 10. Version Control for Architecture

Architectural versioning: snapshot, branch, and revert the entire architecture as atomic operations. Before major changes, the system auto-snapshots. Users can branch to explore alternatives, visually diff, and merge. V1 supports linear snapshots; branching is V2.

# 11. Error Recovery and Architectural Debugging

The architecture view functions as a diagnostic tool. Data flows are traced visually. Broken connections are highlighted. Plain-English explanations appear on tap. Post-deployment health indicators show system status at the architectural level.

# 12. Conversation History as Institutional Knowledge

Conversations are attached to the architecture, not ephemeral. Each node has a conversation log showing design rationale. This transforms conversations from disposable context into permanent institutional knowledge that improves AI performance on future modifications.

# 13. The Graduation Path: Progressive Skill Building

Contextual learning nudges invite Tier 1 users to explore deeper features. Skill milestones track engagement and offer opportunities. ForgePlan creates developers, not just app builders, increasing lifetime value and organic advocacy.

# 14. Collaboration and Multiplayer

Architecture as coordination layer. Node ownership and soft-locking. Shared blueprint reviews with multi-cursor viewing. Interface changes trigger notifications to adjacent node owners.

# 15. Form Factor: Purpose-Built Standalone Application

A standalone desktop application where the architecture canvas is the full-screen default. Code editor and terminal are embedded and scoped per node. Everything in one window, one mental context. Web preview mode serves as the acquisition funnel for Tier 1 users.

# 16. Recommended Technology Stack

Tauri 2.0 for the desktop shell. React Flow for the architecture canvas. Monaco Editor for embedded code editing. Tree-sitter plus CodePrism for code graph analysis. Adapted Task Master patterns for orchestration. Pre-wired integrations with Supabase, Stripe, Twilio, Resend, and Vercel.

# 17. Phase 0: The Claude Code Plugin — Full Implementation Plan

Before building the standalone ForgePlan application, the first development step is a custom Claude Code plugin that implements the complete architecture-first build methodology within the terminal. This section provides the full technical specification for that plugin.

## 17.1 Strategic Purpose

The plugin serves three strategic functions. First, it validates the harness methodology in a real development environment before investing in the full standalone application. Second, it produces an immediately useful tool that developers can adopt today. Third, it creates a natural migration path: users who discover the plugin and internalize the architecture-first workflow become the natural first customers when the standalone application launches.

The plugin is not a stripped-down version of ForgePlan. It is the ForgePlan methodology expressed through files and terminal interactions rather than a visual canvas. The manifest, the node specs, the build harness, the review process, and the dependency ordering are all fully functional. The only thing missing is the graphical interface, which the standalone application will add.

## 17.2 Plugin File Structure

The plugin follows the standard Claude Code plugin format with skills, commands, agents, hooks, and supporting scripts.

```
forgeplan-plugin/
├── .claude-plugin/
│ └── plugin.json
├── skills/
│ ├── discovery/
│ │ └── SKILL.md # Conversational architecture discovery
│ ├── specification/
│ │ ├── SKILL.md # Node spec generation and validation
│ │ └── templates/
│ │ ├── node-spec.yaml # Spec template
│ │ └── manifest.yaml # Manifest template
│ ├── build-node/
│ │ └── SKILL.md # Spec-constrained code generation
│ ├── review-node/
│ │ └── SKILL.md # Cross-model code review
│ └── manifest-ops/
│ └── SKILL.md # Manifest CRUD and status tracking
├── commands/
│ ├── discover.md # Launch architecture discovery
│ ├── spec.md # Generate or view a node spec
│ ├── build.md # Build a specific node
│ ├── review.md # Review a completed node
│ ├── revise.md # Reopen a completed node for spec changes
│ ├── status.md # Show full project build status
│ ├── next.md # Get next buildable node
│ ├── recover.md # Handle crashed/interrupted builds
│ └── integrate.md # Run integration checks
├── agents/
│ ├── architect.md # Discovery and spec-writing agent
│ ├── builder.md # Spec-constrained build agent
│ └── reviewer.md # Cross-model review agent
├── hooks/
│ └── hooks.json # PreToolUse, PostToolUse, Stop hooks
├── scripts/
│ ├── validate-spec-compliance.sh
│ ├── validate-manifest.sh # Cycle detection, schema validation
│ ├── update-manifest-status.sh
│ ├── check-dependency-order.sh
│ ├── check-stop-bounces.sh # Bounce counter for Stop hook
│ ├── cross-model-review.js # External API call for BYOK review
│ └── generate-status-report.sh
└── blueprints/
├── saas-starter.yaml
├── client-portal.yaml
└── internal-dashboard.yaml
```

## 17.3 The Project Manifest Schema

Every ForgePlan project contains a .forgeplan/ directory at the project root. The manifest lives at .forgeplan/manifest.yaml and defines the complete project structure.

```
# .forgeplan/manifest.yaml
```
project:
```
name: "Client Portal"
version: "1.0.0"
created: "2026-04-04"
stack: ["react", "supabase", "tailwind"]
status: building # discovery | specifying | building | reviewing | complete
shared_models: # Canonical types used across nodes
User:
id: uuid
email: string
name: string
role: enum[client, accountant]
created_at: timestamp
referenced_by: [auth, api, frontend-dashboard]
Document:
id: uuid
owner_id: uuid # references User.id
filename: string
upload_date: timestamp
status: enum[pending, processed, archived]
referenced_by: [file-storage, api, frontend-dashboard]
validation:
circular_dependency_check: true
orphan_node_check: true
file_scope_overlap_check: true
nodes:
database:
```
type: infrastructure
```
name: "Database Layer"
status: complete
revision_count: 0
spec: specs/database.yaml
depends_on: []
connects_to: [auth, api]
file_scope: "supabase/**" # Directory pattern for new file creation
files: ["src/lib/supabase.ts"] # Explicit files tracked by PostToolUse
auth:
```
type: service
```
name: "Authentication"
status: building
revision_count: 0
spec: specs/auth.yaml
depends_on: [database]
connects_to: [api, frontend-login]
file_scope: "src/auth/**"
files: ["src/auth/client.ts", "src/auth/useAuth.ts"]
api:
```
type: service
```
name: "API Layer"
status: pending
revision_count: 0
spec: specs/api.yaml
depends_on: [database, auth]
connects_to: [frontend-dashboard]
file_scope: "src/api/**"
files: []
frontend-login:
```
type: frontend
```
name: "Login Page"
status: pending
revision_count: 0
spec: specs/frontend-login.yaml
depends_on: [auth]
connects_to: [frontend-dashboard]
file_scope: "src/pages/login/**"
files: []
```

Status values follow a strict lifecycle: pending (not yet started), building (agent actively working), review (built, awaiting review), complete (reviewed and approved), failed (review found issues, needs rebuild). The revision_count tracks how many times a completed node has been reopened for spec modification, providing visibility into architectural churn.

Each node has both a file_scope (a directory glob pattern defining the node’s territory) and a files list (explicitly tracked files auto-populated by the PostToolUse hook). The file_scope is set during discovery and defines where the Builder agent is allowed to create new files. The files list grows automatically as the agent works. This two-layer approach solves the file scope evolution problem: the Builder agent can create helper functions, type files, and additional components within its territory without the PreToolUse hook blocking the write, while still being prevented from touching files in other nodes’ territories. The file_scope_overlap_check in the validation section ensures no two nodes’ directory patterns overlap.

The shared_models section defines canonical data types that appear in multiple nodes. When the auth node defines a User and the api node also references User, they must reference the same shared model definition rather than defining their own versions. The Builder agent receives all relevant shared models in its context, ensuring type consistency across the entire codebase. This directly prevents the naming inconsistency problem where different agent sessions create incompatible data structures.

The validation section enables automated safety checks that run every time the manifest is written. The circular_dependency_check uses topological sort to detect cycles in the dependency graph and blocks the save if any are found. The orphan_node_check flags nodes that have no connections, which usually indicates a discovery gap. The file_scope_overlap_check ensures no two nodes claim the same file, which would create ambiguity for the PreToolUse hook about which spec governs a given file write. These checks are implemented in the validate-manifest.sh script and run automatically via the Architect skill whenever the manifest is modified.

## 17.4 The Node Spec Schema

Each node has an individual spec file in .forgeplan/specs/ containing the full contract the build agent must follow.

```
# .forgeplan/specs/auth.yaml
```
node: auth
```
name: "Authentication Service"
description: "Handles user login, registration, and session management"
```
inputs:
```
\- name: email
type: string
validation: "valid email format"
\- name: password
type: string
validation: "minimum 8 characters"
\- name: provider
```
type: enum
```
values: [email, google]
```
outputs:
```
\- name: session
```
type: SupabaseSession
```
\- name: user
```
type: User
```
\- name: error
type: AuthError
data_models:
User: \$shared.User # References shared model from manifest
AuthError: # Node-local model, not shared
code: string
message: string
interfaces:
\- target_node: database
contract: "Supabase Auth client for user management"
\- target_node: api
contract: "JWT middleware for route protection"
\- target_node: frontend-login
contract: "Auth context provider with login/logout/register functions"
```
acceptance_criteria:
```
\- "Email/password registration with input validation"
\- "Google OAuth login via Supabase"
\- "Session persistence across page reloads"
\- "Role-based access control: client vs accountant"
\- "Rate limiting: max 5 failed login attempts per minute"
```
constraints:
```
\- "Use Supabase Auth exclusively; no custom auth implementation"
\- "Passwords never stored or logged in application code"
\- "All auth state managed via React context, not local component state"
```
`tech_stack: ["@supabase/supabase-js", "React context"]`

## 17.5 Slash Commands and Workflow

The plugin provides nine slash commands that implement the five-phase build harness plus recovery and revision workflows.

| **Command**                         | **Phase** | **What It Does**                                                                                                                                                                                                                                                                                                                                                                                                    |
|-------------------------------------|-----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **/forgeplan:discover**             | 1         | Launches the Architect agent into a guided conversation. Asks adaptive questions. Builds manifest.yaml with shared models and node specs in real time. Presents text-based architecture summaries after each addition. Runs cycle detection and validation on every manifest write. Saves conversation to .forgeplan/conversations/discovery.md.                                                                    |
| **/forgeplan:spec [node|--all]** | 2         | Generates or refines the detailed spec for a specific node. Reads the manifest for context, generates the full spec with inputs, outputs, interfaces, acceptance criteria, and constraints. The --all flag generates specs for all pending nodes in dependency order so earlier specs inform later ones. The user reviews and edits each in natural language.                                                       |
| **/forgeplan:build [node]**       | 3         | Sets the active node context. Injects the node spec, adjacent interface contracts, and shared model definitions into the agent’s system prompt. Builder agent generates code with anchor comments, strictly following the spec. PreToolUse hooks validate every file write against spec and file_scope. Stop hook enforces acceptance criteria with bounce-counter safety. On completion, status updates to review. |
| **/forgeplan:review [node]**      | 4         | Launches the Reviewer agent natively, or delegates to cross-model-review.js script when BYOK configures a different provider. Audits five dimensions: spec compliance, interface integrity, security, pattern consistency, and anchor comment coverage. Generates structured review report. Updates status to complete or failed.                                                                                   |
| **/forgeplan:revise [node]**      | 2–4       | Reopens a completed node for spec modification. Shows the current spec and accepts natural-language edits. Analyzes what changed: internal-only changes (constraints, criteria) require only this node to be rebuilt. Interface or shared model changes flag all connected nodes for re-review and mark dependent nodes for potential rebuild. Increments revision_count.                                           |
| **/forgeplan:next**                 | 3–4       | Reads the manifest dependency graph. Identifies nodes whose dependencies are all complete but which are themselves still pending or failed. Returns the recommended next node to build with a brief explanation of why. Also surfaces any nodes stuck in building status from crashed sessions.                                                                                                                     |
| **/forgeplan:status**               | All       | Generates a formatted status report showing every node, its current status, revision count, dependencies, and any review notes. Provides a text-based visualization of the dependency graph. Flags any nodes stuck in building status from crashed sessions.                                                                                                                                                        |
| **/forgeplan:integrate**            | 5         | Runs only when all nodes are complete. Verifies interface contracts between connected nodes. Validates shared model consistency. When a failure is found, identifies which side of the connection is at fault by comparing each node’s implementation against the shared spec, and recommends specific remediation: which node to rebuild and what to fix.                                                          |
| **/forgeplan:recover**              | Any       | Detects nodes stuck in building status from crashed or interrupted sessions. Offers three options per stuck node: resume the build from where it left off (spec still defines what is needed), reset to pending and clean up partial files, or mark as requiring manual review. Resets the bounce counter for the affected node.                                                                                    |
## 17.6 The Hook System: Architecture as Guardrail

The hooks are the enforcement mechanism that makes the architecture a governing constraint rather than passive documentation. Three hook types work together.

**PreToolUse Hook: Spec Compliance Gate**

A prompt-based PreToolUse hook fires before every Write and Edit operation. It reads the active node context from .forgeplan/state.json, loads the relevant node spec and shared model definitions, and evaluates three things: whether the file being modified falls within the active node’s file_scope directory pattern or explicit files list, whether the change aligns with the node spec’s constraints and acceptance criteria, and whether any data types used in the code match the shared model definitions from the manifest. If the change violates the spec, targets a file outside the node’s territory, or redefines a shared type locally, the hook denies the operation and explains why.

The file_scope pattern is critical for handling file creation during builds. The Builder agent will inevitably need to create files that were not anticipated in the original spec, such as helper functions, additional components, or type definition files. The PreToolUse hook allows new file creation within the node’s file_scope directory glob while blocking writes to files that fall within a different node’s scope. This is permissive for organic growth within a node’s territory but strict about cross-node contamination. The PostToolUse hook then auto-registers newly created files into the manifest’s explicit files list, keeping the manifest current as the codebase grows.

This is the single most important component of the plugin. It is the mechanism by which the architecture governs the build. Without it, the specs are suggestions. With it, they are constraints. The prompt-based approach allows nuanced evaluation: the LLM can understand whether a utility function shared between nodes is acceptable, whether a deviation is justified by the spec’s constraints, or whether a locally defined type is intentional versus an oversight, rather than relying on brittle pattern matching.

**PostToolUse Hook: Status Tracking**

A command-based PostToolUse hook fires after every successful Write and Edit. It updates the node’s file list in the manifest if new files were created within the node’s scope. It also logs the change to .forgeplan/conversations/nodes/[node].md as a build activity record, preserving the context of what was built and when.

**Stop Hook: Build Completeness Verification**

A prompt-based Stop hook fires when the agent attempts to finish a build session. It reads the node spec’s acceptance criteria and evaluates whether all criteria have been met. If criteria are unmet, it returns exit code 2 with a message listing what remains, and the agent continues working. This prevents builds from ending with stubbed or incomplete implementations, which is one of the core problems the entire product exists to solve.

To prevent infinite loops, the Stop hook implements a bounce counter tracked in .forgeplan/state.json. Each time the hook bounces the agent back, the counter increments. After three bounces on the same node, the hook stops blocking and instead surfaces a warning to the user: This node has been bounced back three times. The following acceptance criteria remain unmet: [list]. This may require your input to resolve. Would you like to continue building, skip these criteria, or modify the spec? This ensures the agent never gets stuck in an unresolvable loop while still enforcing completeness in the normal case.

**SessionStart Hook: Crash Recovery Detection**

A command-based SessionStart hook fires when a new Claude Code session begins in a ForgePlan project. It reads the manifest and checks for any nodes stuck in building status, which indicates a previous session crashed or was interrupted mid-build. If stuck nodes are found, the hook injects a system message alerting the user: Warning: node [name] is in building status from a previous session. Run /forgeplan:recover to resume, reset, or manually review this node. This prevents silent state corruption where the user starts building a new node without realizing a previous build left the project in an inconsistent state.

## 17.7 State File Schema

Multiple hooks and commands depend on .forgeplan/state.json to track ephemeral session state. The schema is defined as follows.

```
# .forgeplan/state.json
{
"active_node": "auth", // Currently building node, null if idle
"active_phase": "build", // discover | spec | build | review | integrate
"bounce_counter": {
"auth": 1, // Times Stop hook bounced this node
"api": 0
},
"session_start": "2026-04-04T09:00:00Z",
"last_activity": "2026-04-04T09:45:00Z",
"strict_mode": true, // From config.yaml
"files_created_this_session": [ // For PostToolUse to track new files
"src/auth/client.ts",
"src/auth/types.ts"
]
```
`}`

The state file is ephemeral: it tracks the current session’s working state, not persistent project data. The manifest is the persistent source of truth. The state file is read by the PreToolUse hook to determine which node’s spec to enforce, by the Stop hook to check and increment the bounce counter, by the PostToolUse hook to log newly created files, and by the SessionStart hook to detect crashed sessions. It is reset when a new build or review session begins.

## 17.8 The Agent Definitions

**Architect Agent**

The Architect agent is launched by /forgeplan:discover. Its system prompt instructs it to conduct a structured discovery conversation, proactively surface requirements the user may not have considered (authentication, error handling, data validation, scaling implications), and incrementally build the manifest and skeleton specs as the conversation progresses. It has access to the blueprint templates as starting points. The agent saves the full conversation transcript to .forgeplan/conversations/discovery.md.

After each significant addition to the manifest, the Architect agent presents a text-based architecture summary to the user so they can see the blueprint taking shape even in the terminal. The summary shows all nodes, their connections rendered as arrows, dependency chains, and current node count. For example: Current architecture: 6 nodes, 9 connections. database → auth → api → frontend-dashboard. auth → frontend-login → frontend-dashboard. database → file-storage → api. This provides the watching the blueprint build experience described in Section 3 within the constraints of a terminal interface.

After every manifest write, the Architect agent runs the validate-manifest.sh script to check for circular dependencies, orphan nodes, and file scope overlaps. If validation fails, the agent is instructed to resolve the issue before proceeding. For example, if the user describes a feature that would create a circular dependency (auth depends on api which depends on auth), the Architect surfaces this immediately: I notice this would create a circular dependency between auth and api. Let me suggest an alternative structure that avoids this. This catches architectural problems during discovery, when they are cheapest to fix, rather than during the build phase.

The Architect agent is also responsible for identifying shared data models during discovery and defining them in the manifest’s shared_models section. When the user describes a concept like user or document that will be referenced by multiple nodes, the Architect creates a canonical shared model definition rather than allowing each node to define its own version. This prevents the type inconsistency problems that arise when different agent sessions create incompatible data structures.

**Builder Agent**

The Builder agent is launched by /forgeplan:build [node]. Its system prompt is dynamically assembled from five sources: the node spec for the target node, the interface contracts from all connected nodes, the shared model definitions from the manifest for any types referenced by this node, the project’s tech stack configuration, and an explicit constraint directive.

The constraint directive reads: You are building the [node name] component. Follow the node spec exactly. Do not add functionality not specified in the spec. Do not modify files outside this node’s file scope as defined in the manifest. If the spec is ambiguous, ask the user; do not improvise. If you need to create a shared utility, document it in the conversation log and get user approval before proceeding. Use the shared model definitions from the manifest for all data types marked with \$shared; do not redefine them locally.

The Builder agent is also instructed to generate anchor comments in all produced code. At the top of every file, the agent writes a comment: // @forgeplan-node: [node-id]. Major functions and components receive inline annotations: // @forgeplan-spec: [acceptance-criterion-id]. These anchor comments serve two purposes. In the plugin, they make it easy for the Reviewer agent to trace implementation back to spec criteria. In the future standalone application, they provide the landmarks the bidirectional sync parser needs to map code back to the architecture graph. Anchor comments are a build requirement, not optional documentation, and the Reviewer checks for their presence.

**Reviewer Agent**

The Reviewer agent is launched by /forgeplan:review [node]. Its system prompt includes the node spec, the generated code, the interface contracts with adjacent nodes, the shared model definitions, and instructions to evaluate five dimensions: does the implementation match every acceptance criterion in the spec? Do the interfaces with adjacent nodes match the contracts? Are there security issues (exposed secrets, missing input validation, injection vulnerabilities)? Does the code follow patterns established in previously completed nodes? Are anchor comments present on all files and major functions?

When BYOK is configured with a different model for the reviewer role, the review command does not use the native Claude Code agent system, which only supports the active Claude session. Instead, it delegates to the cross-model-review.js script, which reads the node spec and all generated code for the node, assembles them into a prompt, calls the external provider’s API (OpenAI, Google, etc.) with the appropriate API key from config.yaml, parses the structured response, and writes the review report to .forgeplan/reviews/[node].md. The script handles error cases: API failures, malformed responses, and rate limits, with clear error messages surfaced to the user. When BYOK is not configured, the review runs as a native Claude Code subagent using the active session, which is simpler but loses the cross-model blind spot coverage.

The review report follows a structured format: a pass/fail verdict per acceptance criterion, a pass/fail per interface contract, a security findings section, a pattern consistency section, an anchor comment coverage check, and an overall recommendation of approve, request changes, or rebuild. The /forgeplan:status command reads these reports and surfaces any failed items alongside the node status.

## 17.9 Conversation Logging and Design Rationale

Every phase of the ForgePlan workflow generates conversation logs that are stored alongside the architecture, creating the institutional knowledge layer described in Section 12.

- Discovery conversations are saved to .forgeplan/conversations/discovery.md and capture why each node exists and what alternatives were considered.

- Node-level conversations are saved to .forgeplan/conversations/nodes/[node].md and capture the build context: what decisions were made during implementation, what edge cases were discussed, and what the user’s intent was for specific behaviors.

- Review reports are saved to .forgeplan/reviews/[node].md and capture what was approved, what was flagged, and what was fixed.

When the standalone ForgePlan application is built, these conversation logs will be imported and attached to the visual architecture nodes, creating the rich contextual history that powers future modifications.

## 17.10 BYOK Configuration

The plugin supports bring-your-own-key configuration for multi-model orchestration. Users create a .forgeplan/config.yaml file specifying API keys and model assignments.

```
# .forgeplan/config.yaml
models:
architect: claude-sonnet-4 # default, uses active Claude Code session
builder: claude-sonnet-4 # default
reviewer: gpt-4o # different model for cross-checking
api_keys:
openai: \${OPENAI_API_KEY} # references env variable
anthropic: \${ANTHROPIC_API_KEY}
preferences:
auto_review: true # automatically trigger review after build
strict_mode: true # PreToolUse hook denies all spec violations
conversation_logging: true # save all build conversations
```

When reviewer is set to a model from a different provider, the review command delegates to the cross-model-review.js script rather than using the active Claude Code session. This script reads the node spec, gathers all generated code files for the node, assembles a structured review prompt, and makes an API call to the configured provider. The script supports OpenAI, Google Gemini, and Anthropic API endpoints. It parses the response into the structured review report format and writes it to .forgeplan/reviews/[node].md. API errors, rate limits, and malformed responses are handled with clear user-facing error messages and automatic retry logic.

In strict mode, the PreToolUse hook blocks all spec violations. In non-strict mode, violations generate warnings but allow the write to proceed, which is useful during early exploration before specs are fully refined. The auto_review preference automatically triggers /forgeplan:review after every successful build, streamlining the build-review cycle.

## 17.11 Example: Building a Client Portal

This walkthrough shows the complete workflow from empty directory to deployed application.

1.  **Initialize.** The user runs /forgeplan:discover in their project directory. The Architect agent asks: What are you building? Who uses it? What’s the most important thing they do? Do they need to log in? The user explains: a portal where small business clients upload tax documents for their accountant.

2.  **Blueprint generation.** The Architect creates .forgeplan/manifest.yaml with seven nodes: database, auth, api, file-storage, frontend-login, frontend-dashboard, frontend-accountant-view. Dependencies are mapped: auth depends on database, api depends on database and auth, frontend nodes depend on api and auth.

3.  **Specification.** The user runs /forgeplan:spec database, then /forgeplan:spec auth, reviewing and approving each spec. The user adds Google OAuth to the auth spec by saying: I also want Google login. The spec updates.

4.  **Build.** The user runs /forgeplan:next. The plugin reports: database is ready to build (no dependencies). The user runs /forgeplan:build database. The Builder agent creates the Supabase client, migration files, and type definitions. Every file write is validated by the PreToolUse hook. When the agent tries to stop, the Stop hook checks acceptance criteria and confirms all are met. Status updates to review.

5.  **Review.** The user runs /forgeplan:review database. The Reviewer (using GPT-4o via BYOK) audits the implementation. It passes. Status updates to complete.

6.  **Continue.** The user runs /forgeplan:next. Now auth is available. The cycle repeats: build, review, next, build, review, next. Each build is constrained by its spec and validated by hooks.

7.  **Integrate.** When all seven nodes are complete, the user runs /forgeplan:integrate. The plugin verifies that the auth context provider correctly connects to the login page, that the API routes are protected by the JWT middleware defined in the auth spec, and that the file upload component correctly interfaces with the file-storage API. Issues are reported per connection.

## 17.12 Implementation Sprints

The plugin itself will be built using the ForgePlan methodology, dogfooding the architecture-first approach.

| **Sprint**   | **Duration** | **Deliverables**                                                                                                                                                                                                                                                                                                                                                                                        |
|--------------|--------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Sprint 1** | Weeks 1–2    | Plugin scaffold with plugin.json. Manifest schema with shared_models, validation, file_scope, and revision_count. Node spec schema with \$shared references. validate-manifest.sh script (cycle detection, orphan check, scope overlap). state.json schema. /forgeplan:discover command with Architect agent including text-based architecture summaries. Discovery conversation logging.               |
| **Sprint 2** | Weeks 3–4    | /forgeplan:spec command with --all flag and specification skill. /forgeplan:build command with Builder agent including anchor comment generation and shared model injection. PreToolUse hook for spec compliance, file_scope enforcement, and shared model validation. PostToolUse hook for file list auto-registration. Active node context via state.json. /forgeplan:next with dependency traversal. |
| **Sprint 3** | Weeks 5–6    | /forgeplan:review command with Reviewer agent (native mode). Five-dimension structured review reports. Stop hook with bounce counter and user escalation. SessionStart hook for crash recovery detection. /forgeplan:recover command. /forgeplan:revise command with change impact analysis (internal vs interface changes). Node-level conversation logging.                                           |
| **Sprint 4** | Weeks 7–8    | cross-model-review.js script for BYOK multi-provider support with error handling and retry logic. /forgeplan:integrate command with fault-side identification and remediation guidance. Blueprint templates (SaaS starter, client portal, dashboard). BYOK config.yaml with strict/non-strict mode. /forgeplan:status with dependency visualization and crash detection. Documentation and README.      |
| **Sprint 5** | Weeks 9–10   | Dogfooding: use the plugin to build a real project end-to-end. Exercise /forgeplan:revise to test change propagation. Test crash recovery via /forgeplan:recover. Validate anchor comment coverage for standalone app parser. Tune Stop hook bounce thresholds and PreToolUse prompt quality based on real usage. Community feedback. Publish to Claude Code plugin marketplace.                        |
## 17.13 From Plugin to Standalone Application

The plugin and the standalone application share the same underlying data structures. The .forgeplan/ directory, the manifest, the node specs, the conversation logs, and the review reports are identical in both contexts. When the standalone ForgePlan application is built, it reads the same .forgeplan/ directory and renders it visually: the manifest becomes the architecture canvas, the node specs become the interactive cards, the status values become the green/yellow/red indicators, and the conversation logs become the attached design rationale.

A user who has been using the Claude Code plugin can open their project in the standalone application and see their entire architecture visualized for the first time, with no migration required. This is the bridge between Phase 0 and Phase 1 of the product.


> **Key Principle**
>
> The .forgeplan/ directory is the product. The Claude Code plugin is one interface to it. The standalone application is another. The visual canvas is a third. Any tool that can read and write the manifest and node specs can participate in the ForgePlan ecosystem. This makes the architecture portable and tool-agnostic.


# 18. Deployment and DevOps Layer

The architecture view extends to deployment with a Production layer showing hosting, database, and service connections as status-indicated nodes. Deploying is a single action. Post-deployment monitoring is visualized at the architectural level.

# 19. Template and Component Marketplace

Users publish complete architectures as templates and individual node implementations as components. Shared units include the node spec, implementation, and tested interfaces. Quality signals include review history and integration success rates across projects.

# 20. First Five Minutes: The Onboarding Journey

Download, open, select Client Portal template, answer four guided questions, confirm blueprint with phantom previews, watch the build progress node by node, deploy with one action. Under fifteen minutes from download to live URL. Never saw a terminal, never wrote a line of code, never lost sight of the architecture.

# 21. Market Positioning and Revenue Model

*Lovable and Replit are vending machines*. *Cursor and Claude Code are power tools*. *ForgePlan is a workshop*: tools, workbench, blueprints on the wall, and a master builder guiding the process.

Revenue tiers: Free (one project, one LLM, web preview, bundled compute for first build), Builder at \$25–\$35/month (five projects, multi-LLM, phantom previews, desktop app), Team at \$50–\$75/seat/month (unlimited projects, collaboration, BYOK), Enterprise (custom, self-hosted). Bundled compute model means no API key wall before the first build experience.

# 22. Risks and Open Questions

- **Bidirectional sync fidelity.** Core technical risk. Mitigated by opinionated generated code patterns in V1.

- **Market education.** New category. Mitigated by web preview funnel and phantom previews.

- **LLM cost structure.** Multi-model is more expensive. Mitigated by per-node scoped context and bundled compute.

- **Competitive response.** Architecture is the foundation, not a feature. Cannot be replicated by bolting a panel onto an existing IDE.

- **Scope discipline.** V1 scoped to discovery, canvas, specs, single-LLM build, basic review, and deployment.

- **Plugin adoption.** Phase 0 must demonstrate clear value within the Claude Code ecosystem to build early community.

# 23. Conclusion

ForgePlan is predicated on a simple observation: the reason software projects fail is not that the code is bad. It is that the plan was lost, was never made, or was never enforced.

By making the visual architecture the primary interface, the governing constraint for AI agents, and the persistent navigational anchor for every user, ForgePlan addresses the root cause of project failure. It creates a new category: the AI Development Workstation, where planning and building are a single, integrated, visually driven workflow.

The Phase 0 plugin brings this methodology to developers today, within tools they already use. The standalone application will bring it to everyone. The opportunity is not to make another coding tool. It is to make building software navigable for everyone.

**END OF DOCUMENT**