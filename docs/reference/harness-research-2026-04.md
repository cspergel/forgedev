# Standalone Harness Research — April 2026

**Purpose:** Pre-Sprint-20 reference for building ForgePlan as a standalone model-agnostic AI build harness. Covers agent orchestration frameworks, coding runtimes, durable execution engines, sandboxing, and multi-agent coordination patterns.

**Target architecture:** Core/adapter/client — Core owns pipeline state machine, Adapters implement runAgent/runHook/readWorkspace/writeWorkspace/emitStatus/requestUserDecision, Client is desktop/web. Node.js primary runtime. Multi-model (Claude, GPT-4o, Gemini, Codex). Long-running sessions (30-40 nodes, hours). Deterministic pipeline, not prompt-driven orchestration.

---

## Summary Table

| Framework | Lang | Stars | License | Model-Agnostic | Node.js Native | Verdict |
|---|---|---|---|---|---|---|
| LangGraph | Python + JS | 28.9K | MIT | Yes | Partial (JS port) | Reference (state machine patterns) |
| LangGraph.js | TypeScript | — | MIT | Yes | Yes | **Build-on candidate** |
| Mastra | TypeScript | 22.9K | Other | Yes (90+ providers) | Yes | **Build-on candidate** |
| Temporal | Go (multi-SDK) | 19.5K | MIT | Yes | Yes (TS SDK) | **Build-on for durability layer** |
| DBOS Transact TS | TypeScript | 1.1K | MIT | Yes | Yes | Reference (lightweight alt to Temporal) |
| Inngest | Go + TS SDK | 5.2K | Other | Yes | Yes | Reference (simpler durable execution) |
| VoltAgent | TypeScript | 7.8K | MIT | Yes | Yes | Reference |
| OpenAI Agents JS | TypeScript | 2.6K | MIT | Partial (OpenAI-first) | Yes | Reference only |
| Google ADK (TS) | TypeScript | 18.9K (Python) | Apache 2.0 | Partial (Gemini-first) | Yes (Dec 2025) | Reference only |
| PydanticAI | Python | 16.2K | MIT | Yes (12+ providers) | No | Reference (design patterns) |
| CrewAI | Python | 48.5K | MIT | Yes | No | Reference only |
| AutoGen/AG2 | Python | 56.9K | CC-BY-4.0 | Yes | No | Reference only |
| Semantic Kernel | C# (+ Python) | 27.7K | MIT | Yes | No (C#/Python only) | Reference only |
| Haystack | Python | 24.8K | Apache 2.0 | Yes | No | Skip |
| Agno | Python | 39.3K | Apache 2.0 | Yes | No | Reference only |
| LiteLLM | Python | 42.9K | Other | Yes (100+ LLMs) | No | **Use as model router** |
| E2B | TypeScript/Python | 11.7K | Apache 2.0 | N/A | Yes | Reference (sandboxing) |
| Daytona | TypeScript | 72.2K | AGPL-3.0 | N/A | Yes | Reference (sandboxing) |
| Trigger.dev | TypeScript | 14.5K | Apache 2.0 | N/A | Yes | Reference |
| OpenHarness | Python | 8.6K | MIT | Yes | No | Reference (harness design) |

---

## Category 1: Agent Orchestration Frameworks

### LangGraph (Python) + LangGraph.js (TypeScript)

**Stars:** 28,905 (Python) | **License:** MIT | **Last commit:** 2026-04-10 | **Language:** Python + TypeScript port

**Architecture:** Directed state graph modeled after Google's Pregel system. Three primitives: State (shared TypedDict/Pydantic), Nodes (functions that read/update state), Edges (functions determining next node). Execution in discrete "super-steps" — nodes activate on incoming messages, halt when no messages remain.

**Key capabilities for ForgePlan:**
- Parallel execution: multi-outgoing edges execute all destinations in parallel as part of next superstep
- Send API: dynamic unknown-ahead-of-time edges, enabling map-reduce over unknown-N items (directly applicable to "dispatch N sweep agents over discovered nodes")
- Interrupts + Command primitive: pause execution awaiting external input, then `resume` — maps directly to the human-in-the-loop RequestUserDecision adapter method
- Checkpointing: automatic state save after every node, supports MemorySaver / SQLite / PostgreSQL / Redis / MongoDB as backends — exact match for crash recovery requirement
- Time-travel debugging: inspect or replay from any prior checkpoint — valuable for debugging stuck builds
- Thread-based sessions: each build run = one thread_id, supports multi-turn resumption from last checkpoint
- Model-agnostic: nodes contain arbitrary code, no LLM coupling in the graph itself

**LangGraph.js specifics:**
- Full TypeScript, targets Node.js / Bun / Deno / Cloudflare Workers
- Checkpointing via `@langchain/langgraph-checkpoint-postgres`, `@langchain/langgraph-checkpoint-sqlite`
- Multi-agent patterns: supervisor graph (centralized coordinator routes to specialist workers), swarm (decentralized handoffs via `@langchain/langgraph-swarm`)
- Production deployment via LangGraph Cloud (managed) or self-hosted LangGraph Server

**Gaps for ForgePlan:**
- Carries LangChain ecosystem weight — dependency bloat unless using core only
- No replay/time-travel in JS port yet (Python has it, JS is catching up)
- Hook system (PreToolUse, PostToolUse, Stop) must be hand-built as graph nodes — not native
- Sweep agent parallel dispatch maps to Send API but needs custom aggregation logic

**Verdict: Reference (state machine patterns) / Build-on if choosing TS + checkpointing is top priority.** The checkpoint model and parallel super-steps are the closest existing implementation to what ForgePlan's pipeline state machine needs. The JS port is production-quality as of early 2026 and actively maintained.

---

### Mastra

**Stars:** 22,883 | **License:** Other (Apache 2.0 core, source-available enterprise) | **Last commit:** 2026-04-10 | **Language:** TypeScript

**Architecture:** TypeScript-first framework from the Gatsby team. Three-layer model: Agents (reasoning + tool invocation), Workflows (step-based graph engine with `.then()`, `.branch()`, `.parallel()`, `.foreach()`), Memory (four types: message history, working memory, semantic recall, observational memory). Built-in model routing to 90+ providers via Vercel AI SDK under the hood.

**Key capabilities for ForgePlan:**
- Native TypeScript / Node.js — no Python sidecar
- `mastra dev` local development server at `localhost:4111` with auto-generated Swagger/OpenAPI docs and built-in Studio UI — directly usable as local daemon
- Suspend/resume: workflows can pause, serialize state to storage, resume on external trigger — maps to RequestUserDecision and checkpoint-based recovery
- Parallel execution: `.parallel()` API for concurrent step execution
- 90+ providers through single string interface (`'anthropic/claude-sonnet-4-6'`, `'openai/gpt-4o'`, etc.)
- Storage adapters: PostgreSQL, LibSQL/SQLite, MongoDB, DynamoDB, Cloudflare Durable Objects
- MCP server support built in
- Human-in-the-loop via workflow suspension gate
- Skill/tool registry composable with Zod schemas
- Inngest integration: Mastra workflows can optionally delegate to Inngest as runner for managed durable execution

**Gaps for ForgePlan:**
- Workflow suspend/resume is newer (2025-2026) — durability guarantees less proven than Temporal
- No execution replay/time-travel debugging (LangGraph has this)
- SOC 2 not certified as of early 2026 (enterprise compliance non-issue for local harness)
- "Other" license on enterprise features — check before using those; core is Apache 2.0
- LLM payload sizes in workflow state: not explicitly addressed in docs, potential issue for storing full agent conversations as checkpoint state (same Temporal history saturation problem)
- Ecosystem is 40+ providers vs LangChain's 1,000+ (less critical since we're routing through LiteLLM anyway)

**Production assessment:** Active changelog (weekly releases), addresses discovered issues quickly. Convex's attempt to reimplement Mastra found the workflow engine non-trivially complex — suggests real implementation depth, not just wrappers. The `mastra dev` local server is the closest existing thing to ForgePlan's "local daemon/service model."

**Verdict: Strong Build-on candidate.** Best TypeScript-native framework for the combined agent + workflow + local-dev-server requirement. Would use as the scaffold layer (workflow engine, agent dispatch, memory, model routing) while owning the ForgePlan pipeline state machine on top of it.

---

### CrewAI

**Stars:** 48,543 | **License:** MIT | **Last commit:** 2026-04-10 | **Language:** Python

**Architecture:** Role-based multi-agent orchestration. Crews = teams of role-playing agents. Flows = application process manager (state, events, control flow). Sequential or parallel task execution. Human-in-the-loop via flow pausing.

**Key capabilities:** Excellent role-based agent specialization. Good for teams of agents with distinct roles (maps to Adversary/Contractualist/Pathfinder/Structuralist/Skeptic). State persists across workflow steps.

**Gaps for ForgePlan:**
- Python only — no Node.js
- Token costs can spiral badly (reported "$400+ when agent loops go uncapped")
- No checkpoint/replay equivalent to LangGraph
- Less control over exact pipeline steps than ForgePlan needs

**Verdict: Reference only.** Design of role-specialized agents is worth studying. Not viable as foundation (Python, token risks).

---

### AutoGen / AG2

**Stars:** 56,938 | **License:** CC-BY-4.0 | **Last commit:** 2026-04-06 | **Language:** Python

**Architecture:** Event-driven actor model (autogen-core). Higher-level AgentChat with Selector Group Chat, Swarm, and GraphFlow patterns. Multi-agent via message passing through shared context.

**Governance note:** Split from Microsoft in November 2024; now maintained as AG2 under ag2ai org. AG2 is a fork/continuation, not officially Microsoft-maintained.

**Key capabilities:** Mature multi-agent patterns. GraphFlow (directed graph) is closest to ForgePlan needs.

**Gaps for ForgePlan:**
- Python only — no TypeScript SDK
- CC-BY-4.0 license is non-standard for a library (attribution required, potential commercial friction)
- No production observability platform included
- AG2 community notes: "not production-ready for most enterprise use cases"

**Verdict: Reference only.** Multi-agent group chat patterns are interesting precedent. Not viable as foundation.

---

### PydanticAI

**Stars:** 16,243 | **License:** MIT | **Last commit:** 2026-04-10 | **Language:** Python

**Architecture:** Agent = stateful control loop around a stateless model. Clean dependency injection via `DepsType`, strongly typed outputs via `OutputType`. Models as strings (`'provider:model-name'`). Five execution modes including `agent.iter()` for node-by-node graph iteration via `AgentRun`. Uses pydantic-graph finite state machine internally.

**Model support:** OpenAI, Anthropic, Google, xAI, Bedrock, Cerebras, Cohere, Groq, Hugging Face, Mistral, OpenRouter, Outlines. One of the most complete model coverage lists in any framework.

**Key capabilities:** Exceptional type safety via Pydantic. Clean retry via `ModelRetry` exception. `usage_limits` prevents token runaway. `max_concurrency` for parallel agent rate control. DBOS integration available for durable execution. Multi-provider via single decorator pattern.

**Gaps for ForgePlan:**
- Python only
- No built-in workflow engine (pairs with DBOS or external runner)
- No Node.js path

**Verdict: Reference only.** The dependency injection model and typed agent pattern are worth porting to TypeScript design. The agent.iter() / pydantic-graph FSM is directly analogous to ForgePlan's pipeline state machine concept.

---

### Haystack

**Stars:** 24,795 | **License:** Apache 2.0 | **Last commit:** 2026-04-10 | **Language:** Python (MDX docs)

**Architecture:** Modular pipeline component system. Agent = loop-based chat generator with tool calling. Components composable via `ComponentTool`. State schema for cross-step sharing. Serializable pipelines.

**Gaps for ForgePlan:**
- Python only — no Node.js support (feature request open, not implemented)
- Pipeline serialization ≠ durable execution (no recovery from mid-step failure)
- Designed for RAG / retrieval workflows, not build orchestration

**Verdict: Skip.** No Node.js path. Design philosophy (modular pipeline components) has some inspiration value but Mastra covers the same ground in TypeScript.

---

### Agno

**Stars:** 39,332 | **License:** Apache 2.0 | **Last commit:** 2026-04-10 | **Language:** Python

**Architecture:** "Stateful control loop around a stateless model." Three-layer: Framework (agents, teams, memory, guardrails), Runtime (stateless FastAPI backend), Control Plane (AgentOS UI). Horizontally scalable. 100+ integrations. Background execution.

**Key capabilities:** Production-scale stateless runtime + UI control plane model is interesting precedent for ForgePlan's Core/adapter/client split. AgentOS = control plane, agents = stateless workers.

**Gaps for ForgePlan:**
- Python only
- "Stateless runtime" means durability must be external
- Managed cloud-centric

**Verdict: Reference only.** The three-tier architecture (framework/runtime/control-plane) is a useful model for ForgePlan's own architecture.

---

## Category 2: AI Coding Agent Runtimes

### OpenAI Agents SDK (Python + JavaScript)

**Stars:** 20,690 (Python), 2,613 (JS) | **License:** MIT | **Last commit:** 2026-04-09 | **Language:** Python + TypeScript

**Architecture:** Three primitives: Agents (LLMs with instructions + tools), Handoffs (agent delegation), Guardrails (input/output validation). Built-in agent loop handles tool invocation → result → continuation. Multi-model via LiteLLM adapter and "any-LLM" bridge. Session persistence via SQLAlchemy, Redis, Dapr.

**JS/TS specifics:**
- Full TypeScript SDK (`@openai/agents`)
- `AgentHooks` class for lifecycle management
- `Tool` type with `FunctionTool`, `ShellTool`, `ComputerTool` variants
- `RunState` + `RunContext` for execution lifecycle
- Span/trace types for observability
- Realtime WebRTC/SIP transport for voice
- Model agnostic via `setDefaultModelProvider()` — though specialized tools (code interpreter, file search) bind to OpenAI

**Gaps for ForgePlan:**
- Handoffs are sequential delegation, not parallel dispatch — no native parallel fan-out
- OpenAI-first despite model agnosticism claims — deep integration with OpenAI-specific tools
- No durable execution / checkpoint recovery built in
- Hook system is observability-focused, not enforcement-focused (ForgePlan needs enforcement hooks)

**Verdict: Reference only.** `AgentHooks` lifecycle pattern and `RunContext`/`RunState` model are worth studying. Not suitable as foundation due to sequential handoffs and OpenAI coupling.

---

### Google Agent Development Kit (ADK) — TypeScript

**Stars:** 18,855 (Python ADK) | **License:** Apache 2.0 | **Last commit:** 2026-04-10 | **Language:** Python (primary), TypeScript (released Dec 17, 2025)

**Architecture:** Code-first, open-source framework for multi-agent systems. TypeScript version adds end-to-end type safety, deployment-agnostic (local, container, serverless). "Model-agnostic" — supports third-party tools beyond Gemini/Vertex. MCP Toolbox for Databases integration.

**Key capabilities:** TypeScript version is notable as the youngest serious TS agent framework (4 months old as of research). Multi-agent composition with strong typing. Google Cloud deployment optional (not required for local use).

**Gaps for ForgePlan:**
- TypeScript version too new (Dec 2025) to have production track record
- Optimized for Gemini — "model-agnostic" claim not yet battle-tested with non-Gemini models in TS version
- No durable execution / checkpoint recovery
- No explicit local daemon/service model
- Uncertain how suspend/resume for human-in-the-loop is handled

**Verdict: Reference only.** Watch closely — Google backing + TypeScript-first could make this a serious contender in 6-12 months. Too new to build on for Sprint 20+.

---

### Vertex AI Agent Builder

**Nature:** Cloud service suite, not a local framework. Requires Google Cloud. Managed deployment, scaling, governance on GCP. Agent Engine = hosted agent runtime. Not self-hostable.

**Verdict: Skip.** Cloud-only, vendor-locked. Irrelevant for local harness.

---

### NVIDIA Agent Intelligence Toolkit (AgentIQ)

**Stars:** ~2K (NeMo-Agent-Toolkit) | **License:** Apache 2.0 | **Language:** Python

**Architecture:** Composable agent framework treating agents/tools/workflows as function calls. Integrates with LangChain, LlamaIndex, CrewAI, Semantic Kernel, MCP. TypeScript support planned but not yet available.

**Gaps for ForgePlan:** Python only. No Node.js path currently. GPU-optimization focus not relevant to a build harness.

**Verdict: Skip.** No Node.js. Monitor for TypeScript release.

---

### Semantic Kernel

**Stars:** 27,682 | **License:** MIT | **Last commit:** 2026-04-08 | **Language:** C# (primary), Python, Java

**Architecture:** Middleware orchestration layer. Plugins (skills), planners, memory, connectors to 20+ LLM providers. Sequential, concurrent, and group-chat orchestration patterns. Microsoft Agent Framework (Oct 2025 public preview) merges AutoGen's dynamic multi-agent orchestration with Semantic Kernel's production foundations.

**Key capabilities:** Model-agnostic (OpenAI, Azure OpenAI, Ollama, LMStudio, ONNX, Hugging Face). Sequential pipeline pattern directly relevant. Production-ready via C# / Azure integration.

**Gaps for ForgePlan:** No TypeScript/Node.js SDK. C#-primary. Enterprise Azure focus. Agent Governance Toolkit (April 2026) adds runtime policy enforcement (OWASP agentic AI risks) — the policy interception model (pre/post-action hooks) is architecturally interesting for ForgePlan's enforcement layer.

**Verdict: Reference only.** The Agent Governance Toolkit's policy engine (sub-millisecond enforcement, OPA Rego/Cedar policies, pre-action interception) is a design reference for ForgePlan's PreToolUse enforcement. Not viable as foundation.

---

## Category 3: Durable Execution / Local Daemon Patterns

### Temporal

**Stars:** 19,506 | **License:** MIT | **Last commit:** 2026-04-10 | **Language:** Go (server) + TypeScript SDK

**Architecture:** Workflow-as-code durable execution engine. Workflows = persistent coroutines that survive process crashes. State stored in Cassandra or PostgreSQL. Each workflow has a unique ID, guaranteed single active instance. Activities (tasks) execute with configurable retry policies.

**Key capabilities for ForgePlan:**
- Durability guarantee: workflows run to completion despite any infrastructure failure
- Long-running: supports years-long workflows (30-40 node builds over hours = trivial)
- TypeScript SDK: mature, used in production by Replit (TS + Go), Gorgias (TS)
- Local dev: `temporal server start-dev` — single binary, no Docker required
- Self-hosting: Docker Compose (Cassandra/Postgres + multiple worker pools)
- Parallel activities: code parallel tasks and concurrent workflows at scale
- Multi-agent: each agent = specialized Workflow with unique ID, Temporal ensures single active instance
- Human-in-the-loop: workflows pause signaling/querying for external input

**Critical limitations for ForgePlan:**
- **Payload size cap:** 2 MB per request, 4 MB per gRPC message — LLM responses easily exceed this. Full agent conversation history as workflow state will hit this wall. Mitigation: external storage references (pass S3 keys, not content), compression codec. This is a real operational burden for an AI build harness.
- **Workflow history saturation:** 51,200 events or 50 MB per workflow execution (warn at 10,240/10 MB). A 30-40 node build with full conversation logs will approach this. Mitigation: break into child workflows per node.
- **Operational complexity:** Running Temporal self-hosted requires managing Cassandra/Postgres + frontend/matching/history/worker services. Steep for developer local setup.
- **Learning curve:** Determinism requirement (workflows must replay identically), versioning discipline.

**Self-hosting reality:** Docker Compose setup works for development. Production requires multi-service cluster. Not "just `npm install`" — this is infrastructure you operate.

**Verdict: Build-on for durability layer if operational complexity is acceptable.** The gold standard for long-running durable execution. TypeScript SDK is production-quality. The payload size limitation is the most significant practical obstacle — plan for external storage for LLM response bodies from day one. Child-workflow-per-node pattern solves history saturation.

---

### DBOS Transact (TypeScript)

**Stars:** 1,133 | **License:** MIT | **Last commit:** 2026-04-08 | **Language:** TypeScript

**Architecture:** Lightweight durable workflow library backed entirely by Postgres. No external orchestration server — just `npm install @dbos-inc/dbos-sdk` and annotate functions with decorators. Postgres stores workflow checkpoints, step outputs, queues. Recovery: on startup, detect PENDING workflows, replay with cached step outputs, resume from last completed step.

**Key capabilities for ForgePlan:**
- Zero external infrastructure beyond Postgres (or SQLite for local dev)
- Native TypeScript / Node.js
- Idempotent step execution with checkpoint recovery
- Integration with PydanticAI, LlamaIndex, OpenAI Agents SDK documented
- "Develop locally, deploy anywhere"
- Postgres throughput: 10K+ writes/sec — handles even intensive build pipelines
- No payload size cap (stored in Postgres JSONB, configurable)

**Gaps for ForgePlan:**
- Parallel step execution not clearly documented — architecture emphasizes sequential checkpoint recovery
- Very young (1.1K stars, v2.0 Jan 2025) — less battle-tested than Temporal
- Requires idempotent steps and deterministic workflows (same constraint as Temporal)
- No time-travel debugging or workflow replay UI

**Verdict: Reference / Lightweight alternative to Temporal.** If Temporal's operational complexity is a blocker for local dev experience, DBOS is the pragmatic alternative. Postgres is something developers already run. The lack of parallel step documentation is a concern for ForgePlan's parallel sweep dispatch.

---

### Inngest

**Stars:** 5,180 | **License:** Other (proprietary server, open source SDK) | **Last commit:** 2026-04-10 | **Language:** Go (server) + TypeScript SDK

**Architecture:** Event-driven durable execution. Functions composed of atomic Steps (`step.run()`), each automatically retried and persisted. State aggregates across parallel steps via `Promise.all()` (TypeScript). Serverless-first — invoked via HTTP, no persistent worker process.

**Key capabilities for ForgePlan:**
- TypeScript SDK with native async/await patterns
- Parallel steps via `Promise.all()` with state aggregation — directly applicable to parallel sweep agent dispatch
- Local dev server (Inngest Dev Server) — runs locally for development
- Self-hosting: server is open-source but not prominently documented for self-hosting
- Automatic retries, versioning, observability included
- Step limits: 1,000 steps per function, 4 MB total across all parallel steps

**Gaps for ForgePlan:**
- **Not truly self-hostable**: Inngest's server is open-source Go but the production path is cloud SaaS. Self-hosting is complex and not well-supported.
- **Serverless model conflicts with local daemon pattern**: ForgePlan needs a local persistent service, not a functions-as-a-service model invoked via HTTP
- **4 MB parallel step data limit**: problematic if aggregating full LLM responses from 5 sweep agents
- **Step-based pricing** on cloud: expensive for AI workloads with many model calls and retries

**Verdict: Reference only.** The `Promise.all()` parallel step aggregation pattern is directly adoptable in custom code. The durable step concept (atomic, retried, persisted) is the right mental model. But the serverless/cloud-first architecture conflicts with ForgePlan's local daemon requirement.

---

### Trigger.dev

**Stars:** 14,477 | **License:** Apache 2.0 | **Last commit:** 2026-04-10 | **Language:** TypeScript

**Architecture:** Background jobs framework with durable task execution. "No timeouts, elastic scaling" (cloud). TypeScript-native with step-based execution. `triggerAndWait` for sequential agent coordination. Realtime API + React hooks for frontend status. Self-hosting supported.

**Key capabilities for ForgePlan:**
- TypeScript/Node.js native
- Mastra integration documented (triggerAndWait for sequential agents while Mastra handles agent logic)
- Self-hosting available (documented)
- Realtime status emission via React hooks — relevant for client/UI layer
- Scheduled (cron) tasks

**Gaps for ForgePlan:**
- Less detailed durability documentation than Temporal
- Cloud-first, local dev requires Trigger.dev Dev Server
- Unclear parallel execution limits vs Inngest

**Verdict: Reference.** The Mastra + Trigger.dev pairing (Trigger for orchestration, Mastra for agent logic) is a viable pattern. Trigger.dev as the durable execution layer under a Mastra agent system could work, with better Node.js ergonomics than Temporal.

---

### LlamaIndex Workflows (TypeScript)

**Stars:** 48,480 (repo includes Python + TS) | **License:** MIT | **Last commit:** 2026-04-08 | **Language:** TypeScript (`@llamaindex/workflow-core`)

**Architecture:** Event-driven state machine. Steps connected via typed Events. Async-first. Parallel via `@step(num_workers=N)`. Runs on Node.js, Deno, Bun, Cloudflare Workers. Typed state shared across steps.

**Key capabilities for ForgePlan:**
- Lightweight — `npm i @llamaindex/workflow-core` standalone
- Event-driven step connection (vs explicit graph edges) is a different but valid model
- Parallel workers per step
- TypeScript typed state

**Gaps for ForgePlan:**
- No checkpoint/recovery — state is in-memory, lost on crash
- Parallel state updates require developer-managed thread safety
- LlamaIndex is pivoting heavily to "document agent and OCR platform" — workflow primitives may be deprioritized

**Verdict: Reference only.** The event-driven step model (vs graph edges) is a design alternative worth considering. Not suitable as foundation (no durability).

---

### VoltAgent

**Stars:** 7,787 | **License:** MIT | **Last commit:** 2026-04-08 | **Language:** TypeScript

**Architecture:** Supervisor agent pattern with sub-agent specialization. Shared memory across agents. Pause/Resume for long-running workflows. 40+ integrations. Zod schema tool validation. VoltOps console for observability.

**Key capabilities for ForgePlan:**
- TypeScript/Node.js native
- Supervisor + specialized sub-agents maps to ForgePlan's Architect + sweep agent dispatch
- Pause/Resume for human-in-the-loop
- Real-time monitoring via VoltOps

**Gaps for ForgePlan:**
- No durable execution / checkpoint recovery
- VoltOps console = additional cloud dependency for full observability
- Less architectural control than building on LangGraph.js or Mastra directly

**Verdict: Reference.** Supervisor pattern and pause/resume are applicable. Not suitable as foundation on its own.

---

## Category 4: Tool Execution and Sandboxing

### E2B

**Stars:** 11,652 | **License:** Apache 2.0 | **Last commit:** 2026-04-10 | **Language:** TypeScript + Python SDKs

**Architecture:** Firecracker microVM sandboxes (~150ms cold start). Full Linux environment per sandbox. Languages: any Linux runtime (Node.js, Python, etc.). TypeScript and Python SDKs. Session duration: up to 24 hours. Self-hosting: core infrastructure open source with self-hosting options.

**For ForgePlan's tool execution:**
- Agents run in isolated VMs — no shared state between agents
- File system access within VM — can run build commands, tests, linters
- Network access configurable
- `~$0.05/hour` per 1 vCPU sandbox
- 24-hour session limit: a 30-40 node build over many hours fits within one session per node
- Self-hosting available: relevant for offline/air-gapped developer environments

**Gaps:**
- Cloud dependency (managed Firecracker VMs) — local self-hosting requires Firecracker on Linux
- Windows self-hosting not straightforward (Firecracker requires Linux kernel)
- For ForgePlan's use case (running trusted build agent code, not arbitrary user code), full VM isolation is overkill — container-level isolation is sufficient

**Verdict: Reference / Use if multi-tenant or high-security requirements arise.** For ForgePlan v1 (trusted agent code, developer's own machine), Docker containers with dropped capabilities is sufficient and requires no cloud dependency.

---

### Daytona

**Stars:** 72,233 | **License:** AGPL-3.0 | **Last commit:** 2026-04-10 | **Language:** TypeScript

**Architecture:** Secure infrastructure for AI-generated code execution. Docker/OCI containers with optional Kata Containers for enhanced isolation. ~90ms cold start (fastest). Native Git integration. LSP support. File system operations. Computer use capabilities. Stateful sessions (no 24-hour cap).

**For ForgePlan:**
- Fastest cold start of any sandbox
- Native Git integration — directly relevant for worktree-based parallel sweep
- Stateful (no session time limit) — fits hours-long builds
- Open source + self-hosted options
- TypeScript SDK
- Computer use (desktop automation) — not relevant but interesting

**Gaps:**
- **AGPL-3.0 license**: if ForgePlan commercial, AGPL requires open-sourcing changes or commercial license
- Pivoted to sandboxing in Feb 2025 — relatively new in this role
- Self-hosting docs not as mature as E2B

**Verdict: Reference / Consider if E2B's cloud dependency is a problem.** AGPL license is the main obstacle. For an open-source ForgePlan, the AGPL is fine. Fastest cold start + Git integration makes it attractive for worktree-based parallel sweep.

---

### Docker (hardened containers)

**Not a framework but the practical answer** for ForgePlan's tool execution sandboxing needs.

For ForgePlan's use case — running trusted build agent code (not arbitrary user input) on a developer's machine — Docker with security hardening is the right default:
- Drop unnecessary capabilities (`--cap-drop=ALL`, `--cap-add=CHOWN,DAC_OVERRIDE,FOWNER,SETGID,SETUID`)
- Read-only root filesystem with explicit write mounts
- CPU/memory resource limits (`--cpus`, `--memory`)
- Network isolation (`--network=none` or custom bridge with whitelist)
- Non-root user

For worktree-based parallel sweep: one container per sweep agent, each mounted to its worktree. Port conflicts avoided by container network isolation. No shared state.

**For Sprint 20+**: start with Docker-based isolation on the developer's machine. Optionally integrate E2B or Daytona for cloud/multi-tenant scenarios.

---

### Sandboxing: vm2 / isolated-vm (Node.js process-level)

**vm2:** Long history of sandbox escapes (CVE-2022-36067, CVE-2023-29017, CVE-2023-32314, CVE-2026-22709). Maintainer has acknowledged ongoing vulnerability risk. Do not use for untrusted code.

**isolated-vm:** Recommended alternative — uses V8 isolates for stronger separation within the Node.js process. Better than vm2, but not OS-level isolation.

**For ForgePlan:** Process-level isolation (vm2/isolated-vm) is appropriate only for running agent-generated code snippets in-process. For running full build commands (npm test, tsc, lint), fork a child process and use Docker for file system isolation. Process-level sandboxes are not the right tool for shell command execution.

---

## Category 5: Multi-Agent Coordination Patterns

### Git Worktree Isolation (Current ForgePlan Approach)

ForgePlan's existing `scripts/worktree-manager.js` is validated by industry practice as of 2026:
- Claude Code added native `isolation: worktree` for subagents (each subagent gets isolated worktree)
- JetBrains shipped first-class worktree support in 2026.1; VS Code in July 2025
- Worktrunk (CLI for worktree management): purpose-built for parallel AI agent workflows
- ccswarm: workflow automation for coordinating Claude Code agents with Git worktree isolation

**Known limitations confirmed by research:**
- File isolation only — ports, databases, caches, test state still shared
- Port conflict workaround: deterministic port assignment by hashing branch name (`PORT=$(( 3100 + $(echo "${BRANCH_NAME}" | cksum | cut -d' ' -f1) % 6899 ))`)
- Shared git hooks (`.git/hooks/`) may fail in fresh worktrees before dep install
- Submodules multiply disk usage per worktree

**Best practice emerging in 2026:** Combine worktrees (git isolation) with containers (runtime isolation). One container per sweep agent, mounted to its worktree. Eliminates port conflicts and shared cache issues.

---

### Parallel Dispatch Patterns

**LangGraph Send API:** Dynamic fan-out to unknown-N nodes. State aggregated via reducer functions. This is the cleanest model for "dispatch N sweep agents over M nodes and aggregate findings."

**Inngest Promise.all:** Steps execute in parallel, state aggregated when all complete. 4 MB total limit across parallel steps — constraint for LLM response aggregation.

**Mastra `.parallel()`:** Steps execute concurrently. State merged on completion.

**OpenAI Agents JS handoffs:** Sequential delegation, not parallel. Wrong pattern for sweep dispatch.

**Key pattern for ForgePlan's parallel sweep:** Fan-out via `Promise.all(agents.map(a => runAgent(a, nodeSpec)))` at the orchestration layer, with each agent in an isolated container/worktree. State aggregation collects findings arrays and deduplicates. This pattern works with any framework that supports concurrent async calls.

---

### OpenHarness (academic reference)

**Stars:** 8,584 | **License:** MIT | **Language:** Python

The most explicit "harness" architecture in the ecosystem. Designed by HKU Data Intelligence Lab. Key design concepts:
- Separates LLM intelligence layer (decisions) from execution layer (tools, memory, safety)
- 10+ subsystems: Engine, Tools, Skills, Plugins, Permissions, Hooks, Memory, Coordinator, MCP client
- Hook system (pre/post tool execution) — architecturally similar to ForgePlan's existing hook types
- Skill loading from `.md` files with frontmatter — nearly identical to ForgePlan's SKILL.md system
- Provider-agnostic LLM integration via OpenAI-compatible endpoints
- Compatibility with Anthropic/Claude Code ecosystem

**Verdict: Reference.** The most architectural similar open-source project to ForgePlan's vision. Python-only so not directly reusable. Provides validation that the harness architecture (hooks, skills as markdown, agent specialization, plugin system) is a coherent and independently-developed design pattern.

---

## Category 6: Model Routing / Provider Abstraction

### LiteLLM

**Stars:** 42,860 | **License:** Other (MIT core, BSL enterprise) | **Last commit:** 2026-04-10 | **Language:** Python

**Architecture:** Single API to call 100+ LLM providers in OpenAI format. Supports Bedrock, Azure, OpenAI, Vertex AI, Anthropic, Cohere, Mistral, HuggingFace, Ollama, VLLM, and more. Proxy server mode (AI Gateway) with cost tracking, guardrails, load balancing, logging.

**For ForgePlan:** LiteLLM as the model routing layer under the harness's Adapter interface is the pragmatic approach. The harness core speaks to one interface (`openai.chat.completions.create`), LiteLLM translates to any provider. This is cheaper to maintain than per-provider adapters.

**Gaps:** Python only — for a Node.js harness, either run LiteLLM as a sidecar proxy (Adapter calls HTTP endpoint), or use the OpenAI JS SDK with each provider's OpenAI-compatible endpoint directly.

**For Node.js:** Most providers now expose OpenAI-compatible endpoints. Alternative: `ai` package (Vercel AI SDK) provides a provider-agnostic TypeScript interface supporting 20+ providers — this is the Node.js equivalent of LiteLLM for the common case.

---

### Vercel AI SDK

**Stars:** ~35K | **License:** Apache 2.0 | **Language:** TypeScript

The de facto model routing layer for TypeScript. Powers Mastra's provider routing. Supports OpenAI, Anthropic, Google, Mistral, Groq, Amazon Bedrock, Azure, Cohere, and more via unified interface. Streaming-first. Tool calling built in. `generateText`, `streamText`, `generateObject` with Zod schema output.

**For ForgePlan:** Use as the model provider adapter layer. Core calls `ai.generateText({ model, messages, tools })`, adapter selects provider. Replaces per-provider adapter implementations.

---

## Architecture Synthesis: Recommended Stack for ForgePlan Standalone Harness

### Option A: Mastra + Temporal (Maximum Durability)

```
ForgePlan Core (pipeline state machine, enforcement logic)
  └── Mastra (agent dispatch, model routing, memory, local dev server)
        └── Temporal (durable workflow engine, crash recovery, long-run)
              └── Vercel AI SDK (provider abstraction: Claude, GPT-4o, Gemini, Codex)
  └── Docker containers (per-agent isolation for parallel sweep)
  └── Git worktrees (file isolation for parallel sweep)
```

**Pros:** Temporal's durability is unmatched. Mastra provides local dev UX. TypeScript throughout.
**Cons:** Temporal operational complexity. Payload size workarounds needed. Three layers of framework = debugging complexity.

---

### Option B: Mastra + DBOS (Simpler Durability)

```
ForgePlan Core (pipeline state machine, enforcement logic)
  └── Mastra (agent dispatch, model routing, memory, local dev server)
        └── DBOS (durable step execution, Postgres-backed)
              └── Vercel AI SDK (provider abstraction)
  └── Docker containers (per-agent isolation)
  └── Git worktrees (file isolation)
```

**Pros:** Postgres is ubiquitous — developers already run it or can SQLite locally. No external orchestration server. DBOS is pure TypeScript. Better developer ergonomics than Temporal.
**Cons:** Less battle-tested than Temporal. Parallel step support unclear. Newer project (v2.0 Jan 2025).

---

### Option C: Custom State Machine + LangGraph.js (Graph-Centric)

```
ForgePlan Core (pipeline state machine = LangGraph StateGraph)
  └── LangGraph.js (graph execution, checkpointing, parallel Send API)
        └── Vercel AI SDK (provider abstraction)
  └── Docker containers (per-agent isolation)
  └── Git worktrees (file isolation)
```

**Pros:** LangGraph's checkpoint + Send API are the most direct technical match for ForgePlan's pipeline state machine (nodes, edges, parallel dispatch, recovery). No abstraction overhead — core IS the graph.
**Cons:** No built-in local dev server (must build one). Less integrated memory/skill system than Mastra. LangChain ecosystem dependency (manageable if using `@langchain/langgraph` only).

---

### Option D: Custom Everything (Maximum Control)

```
ForgePlan Core (custom pipeline state machine)
  └── Custom adapter layer (implements runAgent / runHook / etc.)
        └── Vercel AI SDK (provider abstraction)
  └── SQLite/Postgres (custom checkpoint store)
  └── Docker containers (per-agent isolation)
  └── Git worktrees (file isolation)
```

**Pros:** Zero framework lock-in. ForgePlan owns every abstraction. No fighting framework assumptions for unusual patterns (hook enforcement, spec-diff review, convergence certification).
**Cons:** Building what LangGraph/Mastra/Temporal already solved (state persistence, parallel dispatch, recovery). Significantly more implementation work.

---

### Recommended Starting Point

**For Sprint 20+: Option B (Mastra + DBOS) with Option C (LangGraph.js) as fallback.**

Reasoning:
1. **Mastra's local dev server** (`mastra dev`) is the only framework that ships a local daemon UX out of the box — reduces the "local service" implementation work dramatically
2. **Mastra's model routing** (90+ providers via Vercel AI SDK) eliminates per-provider adapter work
3. **DBOS's Postgres-backed durability** is developer-friendly (no Temporal cluster) and sufficient for ForgePlan's scale (one developer at a time, not thousands concurrent)
4. **LangGraph.js as fallback**: if Mastra's workflow suspend/resume proves insufficient for 30-40 node builds, LangGraph's checkpoint model is the best-proven alternative in TypeScript
5. **Custom pipeline state machine stays in ForgePlan Core** regardless of which framework is used underneath — the Execution Plan's pipeline logic (Phase 1→6, convergence certification, hook enforcement) is too ForgePlan-specific to delegate to any framework

---

## Key Architectural Lessons from Research

### On Context as a First-Class Resource (from OPENDEV paper)
The central design constraint for long-running builds is context pressure, not compute. Every design decision — prompt structure, compaction triggers, tool schema size, memory architecture — must optimize for staying within the context window while preserving signal. Build compaction into the agent loop, not as an afterthought. ForgePlan's existing PreCompact/PostCompact hooks are architecturally correct.

### On Payload Size vs Durability
Every durable execution framework (Temporal, Inngest, DBOS) has payload size limits that conflict with storing full LLM conversations as workflow state. The pattern is: store LLM responses externally (file system, S3, Postgres blob), checkpoint only metadata (node_id, phase, findings[], status). This is the "external storage references" pattern.

### On Worktree + Container Isolation
Worktrees alone are insufficient for parallel sweep agents. The 2026 industry consensus: worktrees for git isolation, containers for runtime isolation (ports, caches, databases). ForgePlan's `scripts/worktree-manager.js` needs a container layer on top for full isolation in Sprint 20+.

### On the Supervisor Pattern
Mastra, VoltAgent, and LangGraph.js all converge on the Supervisor Agent pattern for multi-agent coordination — a centralized coordinator routes to specialized workers. This is exactly ForgePlan's architecture (pipeline orchestrator → Architect/Builder/Reviewer/Sweep agents). The pattern is validated.

### On Hook Enforcement (PreToolUse/PostToolUse)
No framework provides ForgePlan-style enforcement hooks natively. OpenAI Agents `AgentHooks` and Microsoft's Agent Governance Toolkit (policy engine, OWASP agentic AI risks, sub-millisecond enforcement) come closest in concept. For Sprint 20+, enforcement hooks must be custom-built on top of whatever framework is chosen — this is a ForgePlan differentiator, not a solved problem.

### On Progressive Convergence
No framework has convergence certification (agents must pass twice consecutively before retiring). This is ForgePlan-proprietary and must stay in Core. The "clean twice → retired, stuck 3 passes → force-converge" logic is custom regardless of underlying framework.

---

## Quick Reference: What to Borrow From Each Framework

| Framework | Borrow |
|---|---|
| LangGraph.js | Checkpoint model, Send API fan-out, StateGraph node/edge pattern |
| Mastra | Local dev server UX, model routing via Vercel AI SDK, memory architecture, suspend/resume |
| Temporal | Child-workflow-per-node pattern, activity retry semantics, unique workflow ID per build |
| DBOS | Postgres-backed step idempotency, decorator-based annotation, local-first durability |
| PydanticAI | Typed dependency injection, `agent.iter()` graph node iteration, `usage_limits` |
| OpenAI Agents JS | `RunState`/`RunContext` lifecycle, `AgentHooks` observability pattern |
| OpenHarness | Harness layering (intelligence vs execution), hook system design, skill-as-markdown |
| OPENDEV paper | Context pressure as first-class concern, dual-memory architecture, schema-level tool filtering, git snapshot undo |
| Daytona | Git-native sandbox with worktree integration, stateful sessions |
| Agent Governance Toolkit | Policy engine architecture, pre/post-action interception model |
| Vercel AI SDK | Provider abstraction layer for TypeScript (use directly, not via LiteLLM sidecar) |

---

*Research conducted April 2026. All star counts and timestamps as of April 10, 2026.*
