# ForgePlan Standalone Workstation — Extraction Architecture

**The Port Plan: Plugin → Core Engine → Visual Workstation**

**Prepared by:** Craig Spergel
**Date:** April 2026
**Status:** DRAFT — CONFIDENTIAL
**Prerequisite:** Plugin dogfooded on a real large project with proven results

---

# 1. The Strategy: Don't Rewrite — Extract and Wrap

The plugin codebase is not throwaway. It IS the core engine, currently wearing a Claude Code costume. The port strategy is:

1. **Extract** the core engine into a standalone TypeScript library
2. **Build** the tool execution layer that replaces what Claude Code gave for free
3. **Wrap** the core engine in the Tauri desktop shell with React Flow frontend
4. **Abstract** model calls behind the Provider Interface

No feature is cut. No capability is lost. The methodology, enforcement, and autonomous sweep all transfer completely. We're changing the runtime, not the product.

**Guiding principle:** Every architectural decision below optimizes for one thing — minimizing the distance between "working plugin" and "working standalone workstation." If a technology choice means rewriting existing code, it's the wrong choice. If a technology choice means the existing code runs as-is, it's the right choice.

**Additional extraction principle from dogfooding:** the standalone harness should not keep rereading large `skills/`, registry, and agent-definition markdown files just to remember stable ForgePlan operating rules. Those files are useful during plugin dogfooding because they are easy to patch and inspect, but the workstation should progressively internalize:
- phase advancement rules
- sweep and recovery policy
- role dispatch contracts
- ownership and parallelism constraints

External files should remain for project policy, extensibility, and model/provider configuration. Control-plane law should migrate into intrinsic runtime modules so long-run builds stop paying repeated token cost to relearn the harness itself.

---

# 2. The Stack Decision: Why TypeScript Core + Rust Shell

The existing plugin is 100% TypeScript/JavaScript. Every script, every schema parser, every validation routine, every agent prompt assembler. Rewriting this in Rust for the Tauri backend would be months of work for zero new capability. Instead:

**TypeScript Core Engine** — All existing plugin code extracts into a standalone npm package. Runs in Node.js. Zero rewrite needed for the logic layer.

**Rust Shell (Tauri)** — Thin wrapper that provides: the desktop window, the file system watcher, the IPC bridge to the React frontend, and process management for spawning the TypeScript core engine and model provider subprocesses.

**React Frontend** — React Flow canvas, Monaco editor, context panels, chat UI. Communicates with the Rust shell via Tauri commands and events. The Rust shell forwards to the TypeScript core engine.

```
┌─────────────────────────────────────────────────────────────────┐
│  React Frontend (React Flow + Monaco + Tailwind + Zustand)      │
│  - Canvas rendering, panels, previews, animations               │
│  - Zero business logic — pure presentation                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Tauri IPC (commands + events)
┌──────────────────────────┴──────────────────────────────────────┐
│  Rust Shell (Tauri 2.0)                                         │
│  - Window management, file watcher (notify crate)               │
│  - Spawns/manages TypeScript core as sidecar process            │
│  - IPC bridge: frontend ↔ core engine                           │
│  - Native menus, dialogs, system tray                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Stdio / IPC pipe
┌──────────────────────────┴──────────────────────────────────────┐
│  TypeScript Core Engine (Node.js sidecar)                       │
│  - ALL existing plugin code: manifest parser, spec validator,   │
│    dependency graph, sweep orchestrator, state manager,         │
│    cross-model bridge, agent dispatch, enforcement hooks        │
│  - Tool execution layer (replaces Claude Code's tools)          │
│  - Provider Interface (model-agnostic API calls)                │
│  - Conversation/context management                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Provider Interface
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐
│  Claude  │  │  OpenAI  │  │  Google  │  │  Local (Ollama)  │
│  API     │  │  API     │  │  API     │  │  API             │
└──────────┘  └──────────┘  └──────────┘  └──────────────────┘
```

**Why this is fastest:**
- The TypeScript core engine is literally a copy of the plugin code with Claude Code-specific plumbing replaced
- Tauri's sidecar feature is designed for exactly this — running a Node.js process alongside the Rust backend
- The React frontend is a greenfield build but uses off-the-shelf components (React Flow, Monaco, shadcn/ui)
- No language boundary for the core logic — it stays in the language it was written in

**What should not transfer unchanged forever:** prompt-heavy control-plane knowledge. The plugin currently keeps significant orchestration truth in skill files and agent markdown because that made dogfooding fast and patchable. The workstation should preserve compatibility at first, then steadily compile that stable orchestration law into runtime code and compact prompt templates. Otherwise the standalone app inherits the same token and latency penalty from rereading its own operating manual.

---

# 3. The TypeScript Core Engine — What Extracts and What's New

## 3.1 What Transfers with Copy-Paste (Zero Rewrite)

Based on the actual plugin through Sprint 11:

```
forgeplan-core/
├── schemas/
│   ├── state-schema.json           ← unchanged (includes sweep_state, phase fields)
│   ├── manifest-schema.json        ← unchanged (includes phase field, complexity tiers)
│   └── spec-schema.json            ← unchanged (descriptive specs from Sprint 10B)
│
├── scripts/
│   ├── validate-manifest.js        ← unchanged
│   ├── validate-spec.js            ← unchanged
│   ├── topo-sort.js                ← unchanged
│   ├── next-node.js                ← unchanged (phase-aware from 10B)
│   ├── verify-runnable.js          ← unchanged (stack-adaptive, PID safety, error classification — Sprint 7A)
│   ├── runtime-verify.js           ← unchanged (5-level endpoint verification, tier-aware — Sprint 8)
│   ├── blast-radius.js             ← unchanged (Sprint 11)
│   ├── integrate-check.js          ← unchanged
│   ├── skill-registry.js           ← unchanged (4-tier cascade, quality gate — Sprint 11)
│   ├── worktree-manager.js         ← unchanged (parallel sweep fixes — Sprint 7B)
│   ├── validate-ingest.js          ← unchanged (repo ingestion validation — Sprint 10B)
│   ├── verify-cross-phase.js       ← unchanged (phase boundary enforcement — Sprint 10B)
│   ├── cross-model-bridge.js       ← unchanged (MCP/CLI/API, 3 providers — Sprint 4/6)
│   └── status-report.js            ← unchanged (dependency graph visualization — Sprint 4)
│
├── agents/
│   │  # Core pipeline agents (Sprint 10A 3-stage pipeline)
│   ├── interviewer.md              ← unchanged (Discovery stage — Sprint 10A)
│   ├── architect.md                ← unchanged (Design+Plan stage, research-aware — Sprint 8/10A)
│   ├── translator.md               ← unchanged (Design+Plan stage — Sprint 10A)
│   ├── researcher.md               ← unchanged (Sprint 8/10A)
│   ├── builder.md                  ← unchanged (Build+Code Review stage, research-aware — Sprint 8)
│   ├── reviewer.md                 ← unchanged
│   │
│   │  # Review panel agents (Sprint 10A — 5 agents × 3 lens variants = 15 prompts)
│   ├── review-panel/
│   │   ├── adversary.md            ← unchanged
│   │   ├── contractualist.md       ← unchanged
│   │   ├── pathfinder.md           ← unchanged
│   │   ├── structuralist.md        ← unchanged
│   │   └── skeptic.md              ← unchanged
│   │
│   │  # Sweep agents (Sprint 9 consolidated from 12 → 5)
│   └── sweep/
│       ├── sweep-agent-1.md        ← unchanged (consolidated domain)
│       ├── sweep-agent-2.md        ← unchanged
│       ├── sweep-agent-3.md        ← unchanged
│       ├── sweep-agent-4.md        ← unchanged
│       └── sweep-agent-5.md        ← unchanged
│
├── skills/                          ← 32 SKILL.md files (Sprint 11)
│   └── [32 skill files]            ← unchanged, all transfer directly
│
├── templates/
│   ├── blueprints/
│   │   ├── client-portal/          ← unchanged
│   │   ├── saas-starter/           ← unchanged (Sprint 4)
│   │   └── internal-dashboard/     ← unchanged (Sprint 4)
│   └── skill-library/              ← unchanged
│
├── wiki/                            ← semantic memory wiki (Sprint 9)
│   └── [wiki content]             ← unchanged, project knowledge base
│
└── config/
    └── complexity-tiers.yaml       ← unchanged (SMALL/MEDIUM/LARGE definitions — Sprint 7A)
```

That's roughly 50-60% of the total codebase. The plugin has grown substantially since the original 6-sprint plan, but everything added follows the same pattern: pure TypeScript/JavaScript that reads files, writes files, and has zero Claude Code dependency. It all moves with a `cp -r`.

## 3.2 What Needs Replumbing (Same Logic, New Transport)

These modules exist in the plugin but are wired into Claude Code's lifecycle. The enforcement logic is identical — only the integration layer changes.

### 3.2.1 Hook System → Middleware Pipeline

**Plugin version:** Claude Code fires hooks at lifecycle events (PreToolUse, PostToolUse, Stop, SessionStart). The hooks run shell scripts that read state and return allow/deny.

**Standalone version:** The core engine runs its own tool execution pipeline. Every tool call (file write, file edit, bash execution) passes through a middleware chain before and after execution.

```typescript
// forgeplan-core/src/middleware/pipeline.ts

interface ToolCall {
  type: 'write' | 'edit' | 'bash' | 'read' | 'glob' | 'grep';
  path?: string;
  content?: string;
  command?: string;
}

interface MiddlewareResult {
  allowed: boolean;
  reason?: string;
  modified?: ToolCall;  // middleware can modify the call
}

type Middleware = (call: ToolCall, state: ForgeplanState) => MiddlewareResult;

class ToolPipeline {
  private preMiddleware: Middleware[] = [];
  private postMiddleware: Middleware[] = [];

  registerPre(mw: Middleware) { this.preMiddleware.push(mw); }
  registerPost(mw: Middleware) { this.postMiddleware.push(mw); }

  async execute(call: ToolCall, state: ForgeplanState): Promise<ToolResult> {
    // Pre-execution middleware (replaces PreToolUse hook)
    for (const mw of this.preMiddleware) {
      const result = mw(call, state);
      if (!result.allowed) {
        return { blocked: true, reason: result.reason };
      }
    }

    // Execute the tool
    const result = await this.rawExecute(call);

    // Post-execution middleware (replaces PostToolUse hook)
    for (const mw of this.postMiddleware) {
      mw(call, state);  // logging, file registration, etc.
    }

    return result;
  }
}
```

**The existing hook logic plugs directly into this:**

```typescript
// forgeplan-core/src/middleware/file-scope-guard.ts
// This is pre-tool-use.js Layer 1 logic — SAME CODE, different wrapper

import { fileScopeCheck } from '../scripts/pre-tool-use-logic.js';

export const fileScopeGuard: Middleware = (call, state) => {
  if (call.type !== 'write' && call.type !== 'edit') return { allowed: true };
  
  // This function is extracted from the existing pre-tool-use.js
  // Same glob matching, same shared model guard, same logic
  return fileScopeCheck(call.path, state.active_node, state.manifest);
};
```

The key insight: **separate the enforcement logic from the hook plumbing.** The enforcement logic (glob matching, shared model guard, spec compliance check) lives in pure functions that take inputs and return allow/deny. The hook plumbing (how those functions get called) is what changes. Extract the pure functions first, then wire them into the new middleware pipeline.

### 3.2.2 Agent Dispatch → Provider Interface

**Plugin version:** Uses Claude Code's `Agent` tool (subagent spawning) or direct conversation.

**Standalone version:** Calls model APIs directly with the agent's system prompt.

```typescript
// forgeplan-core/src/providers/interface.ts

interface ModelProvider {
  name: string;
  
  // Core operations
  chat(messages: Message[], options?: ChatOptions): AsyncGenerator<StreamChunk>;
  
  // Convenience wrappers that the core engine calls
  buildNode(spec: NodeSpec, context: BuildContext): AsyncGenerator<StreamChunk>;
  reviewNode(spec: NodeSpec, code: FileMap, context: ReviewContext): Promise<ReviewReport>;
  sweepCodebase(files: FileMap, agentPrompt: string, context: SweepContext): Promise<SweepFindings>;
  
  // Discovery conversation
  discoverArchitecture(message: string, history: Message[]): AsyncGenerator<StreamChunk>;
  
  // Capabilities (for model tier routing)
  capabilities: {
    maxContextTokens: number;
    supportsStreaming: boolean;
    supportsFunctionCalling: boolean;
    tier: 'basic' | 'standard' | 'advanced';  // for role assignment
  };
}
```

**Provider implementations:**

```typescript
// forgeplan-core/src/providers/claude.ts

class ClaudeProvider implements ModelProvider {
  name = 'claude-sonnet';
  
  async *chat(messages: Message[], options?: ChatOptions) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options?.maxTokens || 8192,
        system: options?.systemPrompt,
        messages,
        stream: true
      })
    });
    // Stream SSE chunks
    yield* this.parseSSEStream(response);
  }
  
  async buildNode(spec: NodeSpec, context: BuildContext) {
    const systemPrompt = loadAgentPrompt('builder.md');
    const constraintDirective = assembleConstraintDirective(spec, context);
    return this.chat([
      { role: 'user', content: constraintDirective + '\n\nBuild this node.' }
    ], { systemPrompt });
  }
  
  // ... reviewNode, sweepCodebase, etc.
}
```

```typescript
// forgeplan-core/src/providers/openai.ts

class OpenAIProvider implements ModelProvider {
  name = 'gpt-4o';
  
  async *chat(messages: Message[], options?: ChatOptions) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: options?.systemPrompt },
          ...messages
        ],
        stream: true
      })
    });
    yield* this.parseSSEStream(response);
  }
  
  // ... same interface, different API format
}
```

**MCP provider (for Codex):**

```typescript
// forgeplan-core/src/providers/mcp.ts

class MCPProvider implements ModelProvider {
  name = 'codex-mcp';
  
  async *chat(messages: Message[], options?: ChatOptions) {
    // Use MCP protocol to communicate with Codex MCP server
    const result = await this.mcpClient.callTool('codex', {
      prompt: options?.systemPrompt + '\n\n' + messages.map(m => m.content).join('\n')
    });
    yield { type: 'text', text: result };
  }
}
```

**Role-based routing from config:**

```typescript
// forgeplan-core/src/providers/router.ts

class ProviderRouter {
  private providers: Map<string, ModelProvider>;
  private roleConfig: RoleConfig;  // from config.yaml

  getProvider(role: 'architect' | 'builder' | 'reviewer' | 'sweep-security' | ...): ModelProvider {
    const modelName = this.roleConfig[role];  // e.g., "claude-sonnet"
    return this.providers.get(modelName);
  }
}

// Usage in the core engine:
const architect = router.getProvider('architect');
const builder = router.getProvider('builder');
const reviewer = router.getProvider('reviewer');
```

The `config.yaml` role assignments work exactly as designed in the execution plan:

```yaml
roles:
  architect: claude-sonnet
  builder: claude-sonnet
  reviewer: codex-mcp
  sweep_agents:
    security: codex-mcp
    types: claude-haiku
    errors: gemini-flash
    database: claude-sonnet
    api: codex-mcp
    imports: claude-haiku
```

### 3.2.3 Tool Execution Layer — Replacing What Claude Code Gave for Free

Claude Code provides: `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, and manages sandboxing. The standalone needs its own versions.

```typescript
// forgeplan-core/src/tools/index.ts

interface ToolExecutor {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  edit(path: string, oldStr: string, newStr: string): Promise<void>;
  glob(pattern: string, cwd?: string): Promise<string[]>;
  grep(pattern: string, paths: string[], options?: GrepOptions): Promise<GrepResult[]>;
  bash(command: string, options?: BashOptions): Promise<BashResult>;
  listDir(path: string): Promise<DirEntry[]>;
}
```

**Implementation approach: use existing battle-tested libraries, don't build from scratch.**

```typescript
// forgeplan-core/src/tools/executor.ts

import { readFile, writeFile } from 'fs/promises';
import { glob as fastGlob } from 'fast-glob';
import { execaCommand } from 'execa';
import { replaceInFile } from 'replace-in-file';

class LocalToolExecutor implements ToolExecutor {
  private projectRoot: string;
  private pipeline: ToolPipeline;  // middleware enforcement

  async write(path: string, content: string): Promise<void> {
    const fullPath = resolve(this.projectRoot, path);
    
    // Enforce: file must be within project root (prevent path traversal)
    if (!fullPath.startsWith(this.projectRoot)) {
      throw new Error(`Path traversal blocked: ${path}`);
    }

    // Run through middleware pipeline (PreToolUse enforcement)
    const result = await this.pipeline.execute(
      { type: 'write', path: fullPath, content },
      this.state
    );
    
    if (result.blocked) {
      throw new EnforcementError(result.reason);
    }

    await writeFile(fullPath, content, 'utf-8');
  }

  async bash(command: string, options?: BashOptions): Promise<BashResult> {
    // Safety: run in project directory, with timeout
    const result = await execaCommand(command, {
      cwd: this.projectRoot,
      timeout: options?.timeout || 30000,
      shell: true,
      reject: false  // don't throw on non-zero exit
    });
    
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    };
  }

  async glob(pattern: string, cwd?: string): Promise<string[]> {
    return fastGlob(pattern, { 
      cwd: cwd || this.projectRoot,
      dot: false,
      ignore: ['node_modules/**', '.git/**']
    });
  }

  // ... read, edit, grep, listDir
}
```

**Key libraries that do the heavy lifting:**

| Need | Library | Why |
|---|---|---|
| File operations | Node.js `fs/promises` | Built-in, zero dependencies |
| Glob matching | `fast-glob` | Battle-tested, fast, same patterns as Claude Code |
| Process execution | `execa` | Safe subprocess spawning, cross-platform, timeout support |
| String replacement | `replace-in-file` | Handles the str_replace pattern from Claude Code |
| Grep | `ripgrep` (via `@vscode/ripgrep`) | Same engine VS Code uses, fast, cross-platform binary |
| YAML parsing | `js-yaml` | Already using this in the plugin |
| JSON Schema validation | `ajv` | Already using this for state/manifest validation |
| File watching | `chokidar` (Node.js side) + `notify` (Rust side) | Both battle-tested |

### 3.2.4 Context Management — The Hard Part Done Right

Claude Code manages conversation history automatically. The standalone needs its own.

```typescript
// forgeplan-core/src/context/manager.ts

interface ContextManager {
  // Add a message to the conversation
  addMessage(role: 'user' | 'assistant', content: string, metadata?: MessageMetadata): void;
  
  // Get messages that fit within the token budget
  getMessages(maxTokens: number): Message[];
  
  // Compact: summarize older messages to free context space
  compact(preserveKeys: string[]): Promise<void>;
  
  // Save/restore for crash recovery
  save(path: string): Promise<void>;
  restore(path: string): Promise<void>;
}

class ForgeplanContextManager implements ContextManager {
  private messages: Message[] = [];
  private tokenCounter: TokenCounter;
  
  getMessages(maxTokens: number): Message[] {
    // Always keep: system prompt, current node spec, shared models, last N messages
    // Summarize: older build logs, previous node conversations
    
    const critical = this.messages.filter(m => m.metadata?.critical);
    const recent = this.messages.slice(-20);
    const available = maxTokens - this.tokenCounter.count(critical) - this.tokenCounter.count(recent);
    
    // Fill remaining budget with summarized history
    const summarized = this.summarizeOlderMessages(available);
    
    return [...critical, ...summarized, ...recent];
  }

  async compact(preserveKeys: string[]): Promise<void> {
    // The PreCompact/PostCompact pattern from the plugin:
    // 1. Identify messages older than the last 10 that aren't critical
    // 2. Summarize them into a single "context so far" message
    // 3. Replace the originals with the summary
    // 4. preserveKeys = things that must survive compaction:
    //    - active node spec
    //    - shared model definitions
    //    - current acceptance criteria status
    //    - sweep findings in progress
    
    const toCompact = this.messages.filter(m => 
      !m.metadata?.critical && 
      !preserveKeys.includes(m.metadata?.key)
    ).slice(0, -10);
    
    if (toCompact.length < 5) return;  // not worth compacting yet
    
    const summary = await this.provider.chat([
      { role: 'user', content: `Summarize this build conversation, preserving: current node being built, decisions made, issues encountered, acceptance criteria status.\n\n${toCompact.map(m => m.content).join('\n')}` }
    ]);
    
    // Replace old messages with summary
    this.messages = [
      ...this.messages.filter(m => m.metadata?.critical || preserveKeys.includes(m.metadata?.key)),
      { role: 'assistant', content: summary, metadata: { key: 'compacted-history', critical: true } },
      ...this.messages.slice(-10)
    ];
  }
}
```

**Token counting:**

```typescript
// forgeplan-core/src/context/tokens.ts

// Use tiktoken for accurate counting (same tokenizer as GPT)
// For Claude, token count is approximate but close enough for budgeting
import { encoding_for_model } from 'tiktoken';

class TokenCounter {
  private encoder = encoding_for_model('gpt-4');  // reasonable approximation
  
  count(messages: Message[]): number {
    return messages.reduce((sum, m) => 
      sum + this.encoder.encode(m.content).length, 0
    );
  }
}
```

### 3.2.5 Agent Loop — The Build Turn Cycle

In Claude Code, the agent runs in a loop: receive prompt → think → call tools → observe results → think → call more tools → done. The standalone needs to replicate this agentic loop.

```typescript
// forgeplan-core/src/engine/agent-loop.ts

class AgentLoop {
  private provider: ModelProvider;
  private tools: ToolExecutor;
  private pipeline: ToolPipeline;
  private context: ContextManager;

  async run(systemPrompt: string, userMessage: string, options?: AgentOptions): Promise<AgentResult> {
    this.context.addMessage('user', userMessage, { critical: true });
    
    let turnCount = 0;
    const maxTurns = options?.maxTurns || 50;
    
    while (turnCount < maxTurns) {
      // Get response from model (with tool definitions)
      const response = await this.provider.chat(
        this.context.getMessages(options?.maxContextTokens || 100000),
        { 
          systemPrompt,
          tools: this.getToolDefinitions(),
        }
      );

      // Parse the response for tool calls
      const toolCalls = this.extractToolCalls(response);
      
      if (toolCalls.length === 0) {
        // Model is done — no more tool calls, just text response
        this.context.addMessage('assistant', response.text);
        return { success: true, response: response.text };
      }

      // Execute each tool call through the middleware pipeline
      for (const call of toolCalls) {
        try {
          const result = await this.tools.execute(call);
          this.context.addMessage('assistant', `Tool: ${call.type}(${call.path || call.command})`);
          this.context.addMessage('user', `Result: ${result.output}`, { key: 'tool-result' });
        } catch (e) {
          if (e instanceof EnforcementError) {
            // PreToolUse blocked the call — tell the model why
            this.context.addMessage('user', `BLOCKED: ${e.message}. Adjust your approach.`);
          } else {
            this.context.addMessage('user', `Error: ${e.message}`);
          }
        }
      }

      turnCount++;
      
      // Check context budget — compact if needed
      if (this.context.tokenCount() > options?.compactionThreshold) {
        await this.context.compact(['active-spec', 'shared-models', 'criteria-status']);
      }
    }

    return { success: false, reason: 'Max turns exceeded' };
  }
}
```

### 3.2.6 Stop Hook → Build Completion Checker

**Plugin version:** Shell script that runs after the agent signals completion. Checks acceptance criteria.

**Standalone version:** Part of the agent loop's exit condition.

```typescript
// forgeplan-core/src/engine/completion-checker.ts

class BuildCompletionChecker {
  async check(nodeId: string, state: ForgeplanState): Promise<CompletionResult> {
    const spec = loadSpec(nodeId);
    const bounceCount = state.nodes[nodeId]?.bounce_count || 0;
    
    // Layer 1: Deterministic
    if (bounceCount >= 3) {
      return { complete: false, action: 'escalate_to_user', reason: 'Bounce limit reached' };
    }
    
    // Layer 2: LLM-mediated — check each acceptance criterion
    const reviewer = this.router.getProvider('reviewer');
    const report = await reviewer.reviewNode(spec, this.getNodeFiles(nodeId), {
      mode: 'completion-check',
      criteriaOnly: true  // just check AC, not full 7-dimension review
    });
    
    const unmet = report.criteria.filter(c => c.status === 'FAIL');
    
    if (unmet.length > 0) {
      state.nodes[nodeId].bounce_count = bounceCount + 1;
      return {
        complete: false,
        action: 'bounce',
        unmetCriteria: unmet.map(c => c.id),
        reason: `Unmet: ${unmet.map(c => `${c.id}: ${c.description}`).join(', ')}`
      };
    }
    
    return { complete: true };
  }
}
```

## 3.3 What's Genuinely New (Doesn't Exist in Plugin)

### 3.3.1 The Orchestrator — Replaces Claude Code's Command Dispatch

The plugin uses 21+ slash commands. The standalone needs an orchestrator that the frontend (or CLI) calls. Every command maps to an orchestrator method.

```typescript
// forgeplan-core/src/engine/orchestrator.ts

class ForgeplanOrchestrator {
  private agentLoop: AgentLoop;
  private tools: ToolExecutor;
  private router: ProviderRouter;
  private state: StateManager;
  private completionChecker: BuildCompletionChecker;
  private tierConfig: TierConfig;
  private skillRegistry: SkillRegistry;
  private preAnalyzer: PreAnalyzer;
  private reviewCache: ReviewCache;
  private incrementalEngine: IncrementalEngine;
  
  // === Core pipeline (Sprints 1-6) ===
  async discover(message: string, options?: { from?: string, autonomous?: boolean }): Promise<DiscoveryResult>;
  async spec(nodeId: string | '--all', options?: { autonomous?: boolean }): Promise<SpecResult>;
  async buildNode(nodeId: string | '--all'): Promise<BuildResult>;
  async reviewNode(nodeId: string): Promise<ReviewReport>;
  async revise(nodeId: string, changes: SpecChanges): Promise<ReviseResult>;
  async next(): Promise<NextRecommendation>;
  async status(): Promise<StatusReport>;
  async integrate(): Promise<IntegrationReport>;
  async recover(): Promise<RecoveryResult>;
  async sweep(options?: { crossCheck?: boolean }): Promise<SweepReport>;
  async deepBuild(): Promise<DeepBuildReport>;
  async configure(): Promise<ConfigResult>;
  
  // === Research + autonomous (Sprint 8) ===
  async research(topic: string): Promise<ResearchReport>;
  async greenfield(description: string): Promise<GreenfieldReport>;
  
  // === Analysis + utility (Sprints 7-11) ===
  async guide(): Promise<GuideRecommendation>;
  async affected(sharedModel: string): Promise<AffectedNodes>;
  async measure(): Promise<QualityMetrics>;
  async regenTypes(): Promise<void>;
  async validate(): Promise<ValidationReport>;
  async split(nodeId: string): Promise<SplitResult>;
  async ingest(repoPath: string): Promise<IngestResult>;
  async skill(action: 'list' | 'refresh' | 'install' | 'validate'): Promise<SkillResult>;
  
  // Event emitter for frontend communication
  private emit(event: string, data: any) { this.eventBus.emit(event, data); }
}
```

The Orchestrator is tier-aware. Before executing any pipeline operation, it reads the `complexity_tier` from the manifest and configures: agent dispatch count, verification depth, cross-model requirements, walkthrough depth, and sweep agent selection. SMALL projects get 3 agents and skip cross-model. LARGE projects get all 5 agents, cross-model verification, and progressive convergence certification.

The greenfield pipeline is the flagship. It chains: discover (autonomous) → research → spec (autonomous) → deep-build (build → verify-runnable → review panel → sweep → cross-model → final verify). One confirmation from the user (architecture approval), then everything else runs autonomously.

## 3.4 Sprint 7-11 Systems — What the Original Extraction Plan Missed

The original extraction architecture was written at Sprint 6. Sprints 7-11 added substantial new systems. Here is every addition and its extraction impact.

### 3.4.1 Complexity Tier System (Sprint 7A)

**What it is:** SMALL/MEDIUM/LARGE classification based on multi-dimensional judgment (technical complexity, domain complexity, scale complexity). Drives the entire pipeline — agent count, verification depth, walkthrough granularity, cross-model requirements.

**What transfers directly:** The tier definitions in `config/complexity-tiers.yaml`. The tier assessment logic in the Architect agent prompt.

**What needs replumbing:** The Orchestrator must read the tier from the manifest and configure all downstream operations accordingly. The ProviderRouter needs tier-aware dispatch (SMALL = 3 sweep agents, MEDIUM = 4, LARGE = 5). `verify-runnable.js` is already a standalone script — transfers directly.

### 3.4.2 PreCompact/PostCompact Hooks (Sprint 7B)

**What it is:** Two additional hook types that save critical context before Claude Code compacts conversation history, and re-inject it afterward. Prevents loss of manifest state, enforcement rules, and active node context during long builds.

**Plugin version:** Claude Code fires PreCompact before compaction and PostCompact after.

**Standalone version:** The ContextManager (Section 3.2.4) already handles compaction. PreCompact/PostCompact logic merges directly into `ContextManager.compact()` — the `preserveKeys` parameter defines what survives compaction. No separate hooks needed; the logic is the same but integrated rather than hook-driven.

### 3.4.3 Confidence Scoring (Sprint 7B)

**What it is:** Every sweep/review finding gets a 0-100 confidence score. Findings below 75 are filtered in Phase 3 of the sweep. Prevents low-confidence noise from wasting fix cycles.

**Extraction impact:** The sweep agent response parser must extract confidence scores. The SweepOrchestrator filters findings by confidence before dispatching fixes. This is a data flow change in the sweep pipeline, not a new system.

### 3.4.4 Worktree-Based Parallel Fixes (Sprint 7B)

**What it is:** `worktree-manager.js` uses git worktrees to fix multiple nodes simultaneously. Instead of fixing findings sequentially (fix node A → fix node B → fix node C), each node's fixes happen in a separate git worktree in parallel, then merge back.

**What transfers directly:** The `worktree-manager.js` script is pure Node.js using git commands. It transfers with copy-paste.

**What needs replumbing:** The SweepOrchestrator's fix cycle must call the worktree manager to spawn parallel fixes instead of sequential ones. The middleware pipeline must be worktree-aware — each worktree runs its own enforcement scope.

### 3.4.5 Research Agent + Greenfield Pipeline (Sprint 8)

**What it is:** `/forgeplan:research` vets packages, checks licenses, finds architecture patterns. `/forgeplan:greenfield` chains the entire pipeline autonomously: discover → research → spec → deep-build, with one user confirmation.

**What transfers directly:** The Researcher agent prompt, the research skill. The greenfield command logic (it's an orchestration sequence, not new infrastructure).

**What needs replumbing:** The Orchestrator needs a `greenfield()` method that chains other methods. The research results need to be stored in `.forgeplan/research/` and injected into the Builder's context during spec and build phases.

### 3.4.6 Runtime Verification (Sprint 8)

**What it is:** `runtime-verify.js` starts the built application, reads manifest interfaces, and verifies endpoints respond correctly (status codes, response shapes). Tier-aware: SMALL skips, MEDIUM tests endpoints, LARGE adds stress + auth boundary testing.

**What transfers directly:** The script itself is pure Node.js. It spawns processes, makes HTTP requests, and reports results.

**What needs replumbing:** The Orchestrator must call runtime-verify as part of the build completion pipeline (after verify-runnable, before review). The results feed into sweep findings if verification fails.

### 3.4.7 3-Stage Design Pipeline (Sprint 10A)

**What it is:** The pipeline is now three stages, not the original discover→spec→build:
1. **Discovery** — Interviewer (Socratic requirements), Translator (document import), Researcher
2. **Design + Plan** — Architect produces design, Planner mode produces implementation plan, review panel reviews both
3. **Build + Code Review** — Builder executes, review panel reviews code, sweep runs

**What transfers directly:** All agent prompts (Interviewer, Translator, Researcher, Architect, Builder). The 5 review panel agent prompts with their 3 lens variants each.

**What needs replumbing:** The Orchestrator's greenfield pipeline must implement the 3-stage sequence with review panel gates between stages. The ProviderRouter must dispatch the right agents at each stage. The review panel's 5 agents × 3 lenses means 15 prompt variants — the AgentLoop needs to handle multi-agent dispatch with lens selection.

### 3.4.8 Review Panel (Sprint 10A)

**What it is:** 5 review agents (Adversary, Contractualist, Pathfinder, Structuralist, Skeptic), each with 3 lens variants (Design, Plan, Code). Universal across all stages. Tier-dispatched: SMALL = 3, MEDIUM = 4, LARGE = 5.

**What transfers directly:** All 15 prompt variants.

**What needs replumbing:** A `ReviewPanel` class in the engine that dispatches the correct agents with the correct lens variant at the correct pipeline stage. Circuit breaker logic: max passes per stage, CRITICALs halt the pipeline, IMPORTANTs become warnings.

### 3.4.9 Phased Builds (Sprint 10B)

**What it is:** Large projects build in phases. Each node has a `phase` field. Phase enforcement gate in PreToolUse prevents building future-phase nodes until the current phase completes. Cross-phase integration verification at phase boundaries.

**What transfers directly:** `verify-cross-phase.js` is a pure script. The phase enforcement logic in PreToolUse is deterministic.

**What needs replumbing:** The manifest schema includes the phase field (already in the copy-paste layer). The middleware pipeline needs the phase enforcement gate. The Orchestrator's deep-build must advance phases with cross-phase integration checks (4 checkpoints: pre_increment → post_increment → promoting_specs → promotion_complete).

### 3.4.10 Repo Ingestion (Sprint 10B)

**What it is:** `/forgeplan:ingest` scans an existing codebase, generates a manifest with descriptive specs, runs validation, applies governance retroactively. Uses Translator in repo mode, `validate-ingest.js` for ground-truth validation, double review gate.

**What transfers directly:** `validate-ingest.js`, Translator agent prompt, the ingest command logic.

**What needs replumbing:** The Orchestrator needs an `ingest()` method. The Translator must be able to analyze an existing directory structure and map it to ForgePlan nodes. Descriptive specs (with `spec_type` and `generated_from` fields) are a spec schema extension that transfers with the schema.

### 3.4.11 Skill Registry (Sprint 11)

**What it is:** `skill-registry.js` — event-driven registry with 4-tier cascade (agent-specific → node-type → project-wide → library defaults), quality gate, priority-based conflict resolution. 32 SKILL.md files. Progressive disclosure (metadata at dispatch, full content on-demand). Auto-refresh hooks detect staleness.

**What transfers directly:** `skill-registry.js` is pure Node.js. All 32 SKILL.md files. The skill command logic.

**What needs replumbing:** The AgentLoop must call the skill registry before dispatching any agent to load the appropriate skills. The middleware pipeline needs the auto-refresh hooks (session-start staleness detection + pre-tool-use active refresh). The Orchestrator's `/skill` method wraps the registry's list/refresh/install/validate operations.

### 3.4.12 Batched Fix Context + Phase 4.5 Pre-Verification (Sprint 11)

**What it is:** Instead of fixing findings one at a time, batch fixes by file with blast radius context (blast-radius.js). Phase 4.5 is a deterministic pre-verification step between sweep fix and re-sweep — catches regressions at script cost (zero tokens) before spending tokens on another LLM sweep pass.

**What transfers directly:** `blast-radius.js` is pure Node.js. Phase 4.5 is a script-level check.

**What needs replumbing:** The SweepOrchestrator must batch findings by file and include blast radius context in the fix prompt. Phase 4.5 integrates into the sweep cycle between fix and re-sweep.

### 3.4.13 Semantic Memory Wiki (Sprint 9)

**What it is:** A persistent knowledge base at `.forgeplan/wiki/` that grows with each build. Stores compiled architectural knowledge, design decisions, pattern conventions, and research findings. Fed into agent context for project-aware responses.

**What transfers directly:** The wiki directory and its content format.

**What needs replumbing:** The Orchestrator must read wiki content and inject it into agent context when relevant (build, review, sweep). The wiki must be updated after discovery, research, and design phases. The ContextManager should include wiki excerpts in the critical context that survives compaction.

### 3.4.14 Six Hook Types, Not Four

The original extraction doc described 4 hooks (PreToolUse, PostToolUse, Stop, SessionStart). The actual plugin has 6:

| Hook | Middleware Equivalent |
|---|---|
| PreToolUse | `pipeline.registerPre()` — file scope, shared model guard, phase gate, spec compliance |
| PostToolUse | `pipeline.registerPost()` — file registration, change logging |
| Stop | `completionChecker.check()` — bounce counter, acceptance criteria evaluation |
| SessionStart | `orchestrator.initialize()` — crash detection, ambient status, skill staleness check |
| PreCompact | `contextManager.compact()` — save critical context before compaction |
| PostCompact | `contextManager.compact()` — re-inject context after compaction |

The PreCompact/PostCompact hooks merge into the ContextManager's compaction logic. SessionStart becomes the Orchestrator's initialization sequence. The extraction plan's middleware pipeline already covers PreToolUse and PostToolUse correctly.
```

### 3.3.2 The Event Bus — Backend ↔ Frontend Communication

```typescript
// forgeplan-core/src/events/bus.ts

type EventType = 
  | 'manifest_updated'
  | 'node_status_changed'
  | 'build_progress'
  | 'build_bounced'
  | 'review_complete'
  | 'sweep_finding'
  | 'sweep_pass_complete'
  | 'cross_check_complete'
  | 'deep_build_progress'
  | 'discovery_response'
  | 'discovery_node_added'
  | 'integration_result'
  | 'error';

class EventBus {
  private handlers: Map<EventType, Set<EventHandler>> = new Map();
  
  on(event: EventType, handler: EventHandler) { /* ... */ }
  off(event: EventType, handler: EventHandler) { /* ... */ }
  emit(event: EventType, data: any) { /* ... */ }
}
```

In the Tauri integration, the event bus bridges to Tauri's event system:

```rust
// src-tauri/src/bridge.rs

// The Rust shell subscribes to the TypeScript core's stdout
// and forwards events to the frontend via Tauri events

fn forward_core_events(core_process: &mut Child, app_handle: &AppHandle) {
    let stdout = core_process.stdout.take().unwrap();
    let reader = BufReader::new(stdout);
    
    for line in reader.lines() {
        if let Ok(line) = line {
            if let Ok(event) = serde_json::from_str::<CoreEvent>(&line) {
                app_handle.emit_all(&event.event_type, &event.data).unwrap();
            }
        }
    }
}
```

### 3.3.3 Multi-Model Behavioral Calibration

The sneaky hard part. Same prompt, different results across models.

```typescript
// forgeplan-core/src/providers/calibration.ts

interface ModelCalibration {
  // Prompt adjustments per model
  promptModifiers: {
    // Claude follows structured output instructions well
    // GPT needs more explicit JSON formatting instructions
    // Gemini benefits from few-shot examples
    outputFormatting: string;
    
    // Claude respects "do not" instructions well
    // GPT sometimes ignores negative constraints
    // Gemini needs constraints repeated
    constraintReinforcement: string;
    
    // Review precision: how to ask for specific evidence
    reviewPrecision: string;
  };
  
  // Capability tiers
  tier: 'basic' | 'standard' | 'advanced';
  
  // Recommended roles
  recommendedRoles: string[];  // e.g., ['sweep-types', 'sweep-imports'] for haiku-class
  
  // Token efficiency: how many tokens this model typically uses for a build
  avgTokensPerBuild: number;
  avgTokensPerReview: number;
}

const CALIBRATIONS: Record<string, ModelCalibration> = {
  'claude-sonnet': {
    promptModifiers: {
      outputFormatting: '',  // Claude handles structured output natively
      constraintReinforcement: '',  // Claude follows negative constraints well
      reviewPrecision: '',  // Claude produces precise spec-diff reviews
    },
    tier: 'advanced',
    recommendedRoles: ['architect', 'builder', 'reviewer', 'sweep-all'],
    avgTokensPerBuild: 15000,
    avgTokensPerReview: 8000,
  },
  'gpt-4o': {
    promptModifiers: {
      outputFormatting: '\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown fences. No preamble.',
      constraintReinforcement: '\n\nREPEATING KEY CONSTRAINT: Do NOT modify files outside the specified file_scope.',
      reviewPrecision: '\n\nFor each criterion, you MUST cite a specific file path and line number as evidence.',
    },
    tier: 'advanced',
    recommendedRoles: ['reviewer', 'sweep-security', 'sweep-api'],
    avgTokensPerBuild: 18000,
    avgTokensPerReview: 10000,
  },
  'claude-haiku': {
    promptModifiers: {
      outputFormatting: '',
      constraintReinforcement: '',
      reviewPrecision: '\n\nBe specific. Cite file paths.',
    },
    tier: 'basic',
    recommendedRoles: ['sweep-types', 'sweep-imports'],  // fast, cheap, focused tasks
    avgTokensPerBuild: 12000,
    avgTokensPerReview: 5000,
  },
  // ... gemini-pro, gemini-flash, codex, etc.
};
```

The calibration data starts as best guesses and gets refined through dogfooding. The deep-build report tracks performance per model per role, which feeds back into calibration tuning over time.

---

# 4. The Tauri Shell — Thin Rust Wrapper

The Rust backend is deliberately thin. It does four things:

## 4.1 Sidecar Management

Spawn and manage the TypeScript core engine as a Node.js sidecar process. Tauri has built-in sidecar support.

```rust
// src-tauri/src/sidecar.rs

use tauri::api::process::{Command, CommandEvent};

pub fn spawn_core_engine(app: &AppHandle) -> Result<()> {
    let (mut rx, _child) = Command::new_sidecar("forgeplan-core")
        .expect("failed to create sidecar")
        .spawn()
        .expect("failed to spawn sidecar");
    
    // Forward events from core engine to frontend
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    if let Ok(event) = serde_json::from_str::<CoreEvent>(&line) {
                        app_handle.emit_all(&event.event_type, &event.data).ok();
                    }
                }
                CommandEvent::Stderr(line) => {
                    app_handle.emit_all("core_error", &line).ok();
                }
                _ => {}
            }
        }
    });
    
    Ok(())
}
```

## 4.2 IPC Commands

Thin pass-through commands that the React frontend calls, which forward to the TypeScript core.

```rust
// src-tauri/src/commands.rs

#[tauri::command]
async fn build_node(node_id: String, state: State<'_, CoreState>) -> Result<(), String> {
    state.core.send_command("build_node", &node_id).await
}

#[tauri::command]
async fn discover(message: String, state: State<'_, CoreState>) -> Result<(), String> {
    state.core.send_command("discover", &message).await
}

#[tauri::command]
async fn deep_build(state: State<'_, CoreState>) -> Result<(), String> {
    state.core.send_command("deep_build", "").await
}

#[tauri::command]
async fn update_spec(node_id: String, changes: String, state: State<'_, CoreState>) -> Result<(), String> {
    state.core.send_command("update_spec", &format!("{}:{}", node_id, changes)).await
}

// ... one command per orchestrator method
```

## 4.3 File Watching

Native file system watching via the `notify` crate. More efficient than Node.js file watchers.

```rust
// src-tauri/src/watcher.rs

use notify::{Watcher, RecursiveMode, watcher};

pub fn watch_forgeplan_dir(project_path: &Path, app: AppHandle) -> Result<()> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = watcher(tx, Duration::from_millis(200))?;
    
    watcher.watch(project_path.join(".forgeplan"), RecursiveMode::Recursive)?;
    
    std::thread::spawn(move || {
        for event in rx {
            match event {
                Ok(event) => {
                    // Determine what changed and emit appropriate event
                    if event.paths.iter().any(|p| p.ends_with("manifest.yaml")) {
                        app.emit_all("manifest_file_changed", ()).ok();
                    }
                    if event.paths.iter().any(|p| p.ends_with("state.json")) {
                        app.emit_all("state_file_changed", ()).ok();
                    }
                    // ... specs, reviews, sweeps
                }
                Err(e) => eprintln!("Watch error: {:?}", e),
            }
        }
    });
    
    Ok(())
}
```

## 4.4 Native Menus and Dialogs

Open project, new project, settings, about. Standard desktop app chrome that React can't provide.

---

# 5. The React Frontend — Connecting to the Engine

## 5.1 Tauri Event Subscriptions

The frontend subscribes to events from the Rust shell (which originate from the TypeScript core engine):

```typescript
// src/hooks/useForgeplanEvents.ts

import { listen } from '@tauri-apps/api/event';
import { useCanvasStore, useBuildStore, useDiscoveryStore } from '../stores';

export function useForgeplanEvents() {
  useEffect(() => {
    const unlisten = [
      listen('manifest_updated', (event) => {
        useCanvasStore.getState().updateFromManifest(event.payload);
      }),
      
      listen('node_status_changed', (event) => {
        const { nodeId, status, progress } = event.payload;
        useCanvasStore.getState().updateNodeStatus(nodeId, status);
        useBuildStore.getState().updateProgress(nodeId, progress);
      }),
      
      listen('discovery_node_added', (event) => {
        const { node, connections } = event.payload;
        useCanvasStore.getState().addNodeAnimated(node, connections);
      }),
      
      listen('discovery_response', (event) => {
        useDiscoveryStore.getState().addMessage('assistant', event.payload.message);
      }),
      
      listen('sweep_finding', (event) => {
        useBuildStore.getState().addSweepFinding(event.payload);
      }),
      
      listen('build_progress', (event) => {
        useBuildStore.getState().updateBuildLog(event.payload.nodeId, event.payload.chunk);
      }),
    ];
    
    return () => { unlisten.forEach(fn => fn.then(u => u())); };
  }, []);
}
```

## 5.2 Tauri Command Invocations

The frontend triggers actions via Tauri commands:

```typescript
// src/api/forgeplan.ts

import { invoke } from '@tauri-apps/api/tauri';

export const forgeplan = {
  discover: (message: string) => invoke('discover', { message }),
  buildNode: (nodeId: string) => invoke('build_node', { nodeId }),
  reviewNode: (nodeId: string) => invoke('review_node', { nodeId }),
  deepBuild: () => invoke('deep_build'),
  sweep: () => invoke('sweep'),
  revise: (nodeId: string, changes: string) => invoke('update_spec', { nodeId, changes }),
  integrate: () => invoke('integrate'),
  recover: () => invoke('recover'),
};
```

## 5.3 Canvas ↔ Manifest Transform

The React Flow canvas reads from the manifest. Every manifest update transforms into React Flow nodes and edges:

```typescript
// src/transforms/manifest-to-canvas.ts

function manifestToNodes(manifest: Manifest): ReactFlowNode[] {
  return Object.entries(manifest.nodes).map(([id, node]) => ({
    id,
    type: getNodeType(node),  // 'infrastructure' | 'service' | 'frontend' | 'integration'
    position: node.canvas_position || autoLayout(id, manifest),
    data: {
      label: node.name,
      status: node.status,
      techTags: node.tech_stack || [],
      criteriaProgress: getCriteriaProgress(id),
      hasPhantomPreview: node.type === 'frontend',
    },
  }));
}

function manifestToEdges(manifest: Manifest): ReactFlowEdge[] {
  const edges: ReactFlowEdge[] = [];
  
  for (const [nodeId, node] of Object.entries(manifest.nodes)) {
    // From connects_to
    for (const target of (node.connects_to || [])) {
      edges.push({
        id: `${nodeId}-${target}`,
        source: nodeId,
        target,
        type: 'forgeplanEdge',  // custom edge with labels and health
        data: {
          label: getInterfaceLabel(nodeId, target, manifest),
          health: getConnectionHealth(nodeId, target),
        },
      });
    }
  }
  
  return edges;
}
```

---

# 6. Critical Scaling Systems — What Makes This Work at Scale

The orchestration and build process is token-heavy by design. A deep-build with six parallel sweep agents, cross-model verification, and multi-node builds burns significant tokens. That's acceptable for medium-to-large projects where the value justifies the cost. But without the systems below, costs scale linearly with project size and quality degrades as context fills up. These systems change the scaling curve from linear to sublinear — costs grow slower than project size, and quality stays constant regardless of scale.

The architecture-down approach is itself the primary scaling strategy. The manifest is a compression layer. Instead of stuffing an entire codebase into context, you stuff the manifest (a structural summary of everything) plus the active node's spec plus adjacent interface contracts. The manifest is a hierarchical index that lets you scope context precisely. But the manifest alone isn't enough. These five complementary systems work together to make large-scale builds economically viable and technically sound.

## 6.1 LSP Integration Layer — Free Intelligence, Zero Tokens

The Language Server Protocol gives the core engine semantic code understanding without spending a single token. LSP knows the difference between a type definition, a type reference, an import, and a comment. It resolves symbols, traces call hierarchies, and reports diagnostics — all locally.

**What LSP replaces that currently costs tokens:**

| Current Approach (Grep) | LSP Approach | Token Savings |
|---|---|---|
| Grep for `type User` across all files, send all hits to LLM to classify which are definitions vs imports vs comments | `getTypeDefinitions('User')` returns exactly one location | ~2,000 tokens per shared model check |
| Send full source files to sweep agent to find type mismatches | `getDiagnostics()` returns all type errors pre-computed | ~5,000-15,000 tokens per sweep agent |
| Send full source files to find unused exports and circular imports | `getReferences()` + `getCallHierarchy()` traces the full dependency graph | ~3,000-8,000 tokens per import sweep |
| Builder reads adjacent node files to understand interfaces | LSP provides typed function signatures and exported symbols without full file contents | ~1,000-3,000 tokens per node build |

**Implementation:**

```typescript
// forgeplan-core/src/intelligence/lsp-client.ts

interface CodeIntelligence {
  // Structural analysis — zero tokens
  getTypeDefinitions(typeName: string): Promise<SymbolLocation[]>;
  getTypeReferences(typeName: string): Promise<SymbolLocation[]>;
  getExportedSymbols(filePath: string): Promise<Symbol[]>;
  getImports(filePath: string): Promise<ImportInfo[]>;
  getDiagnostics(filePath?: string): Promise<Diagnostic[]>;
  getCallHierarchy(symbol: Symbol): Promise<CallHierarchyItem[]>;
  
  // Code summarization — structural summary without full source
  getFileSignature(filePath: string): Promise<FileSignature>;
  getNodeStructuralSummary(nodeId: string): Promise<StructuralSummary>;
}

interface FileSignature {
  path: string;
  exports: { name: string; kind: string; type?: string }[];
  imports: { from: string; symbols: string[] }[];
  classes: { name: string; methods: string[]; implements?: string[] }[];
  functions: { name: string; params: string; returnType: string }[];
  lineCount: number;
}

interface StructuralSummary {
  nodeId: string;
  fileCount: number;
  totalLines: number;
  exports: ExportSummary[];
  sharedModelUsage: { model: string; fields: string[]; locations: string[] }[];
  diagnostics: Diagnostic[];  // pre-computed issues — FREE
  interfaceCompliance: { target: string; status: 'match' | 'mismatch'; detail?: string }[];
}
```

**The pre-analysis pipeline — run before any LLM call:**

```typescript
// forgeplan-core/src/intelligence/pre-analyzer.ts

class PreAnalyzer {
  private lsp: CodeIntelligence;
  
  async analyzeBeforeSweep(): Promise<PreAnalysisReport> {
    // Step 1: Get all diagnostics (type errors, unused vars, etc.) — FREE
    const diagnostics = await this.lsp.getDiagnostics();
    
    // Step 2: Check shared model consistency — FREE
    const sharedModels = this.manifest.shared_models;
    const modelIssues: Finding[] = [];
    
    for (const [name, definition] of Object.entries(sharedModels)) {
      const defs = await this.lsp.getTypeDefinitions(name);
      if (defs.length > 1) {
        modelIssues.push({
          id: `PRE-T-${name}`,
          category: 'type-consistency',
          description: `${name} is defined in ${defs.length} locations: ${defs.map(d => d.path).join(', ')}`,
          severity: 'critical',
          source: 'lsp-pre-analysis'  // not an LLM — free
        });
      }
      
      const refs = await this.lsp.getTypeReferences(name);
      // Check if any reference accesses a field not on the definition
      // LSP diagnostics will already flag these as type errors
    }
    
    // Step 3: Check for circular imports — FREE
    const importGraph = await this.buildImportGraph();
    const cycles = this.detectCycles(importGraph);
    
    // Step 4: Check for dead exports — FREE
    const deadExports = await this.findDeadExports();
    
    return {
      diagnosticFindings: diagnostics.map(d => this.diagnosticToFinding(d)),
      modelIssues,
      circularImports: cycles.map(c => this.cycleToFinding(c)),
      deadExports: deadExports.map(e => this.deadExportToFinding(e)),
      // These are all concrete findings discovered with ZERO tokens
      // The sweep agents only need to handle what LSP can't:
      // - semantic judgment (is this error handling pattern consistent?)
      // - security analysis (is this input properly validated?)
      // - API contract verification (does this match the frontend expectation?)
    };
  }
  
  async getNodeContextForBuild(nodeId: string): Promise<BuildContext> {
    // Instead of loading full adjacent node files into context,
    // use LSP to get just the structural signatures
    const spec = loadSpec(nodeId);
    const adjacentSignatures: Record<string, FileSignature[]> = {};
    
    for (const iface of spec.interfaces) {
      const targetNodeFiles = this.getNodeFiles(iface.target_node);
      for (const file of targetNodeFiles) {
        // Get the exported function signatures, type definitions,
        // and API route definitions — WITHOUT the full source code
        adjacentSignatures[iface.target_node] = adjacentSignatures[iface.target_node] || [];
        adjacentSignatures[iface.target_node].push(await this.lsp.getFileSignature(file));
      }
    }
    
    // The builder gets: the spec + structural signatures of adjacent nodes
    // NOT: full source code of adjacent nodes
    // Token savings: potentially 50-70% reduction in build context size
    return {
      spec,
      sharedModels: this.manifest.shared_models,
      adjacentInterfaces: adjacentSignatures,
    };
  }
}
```

**Language server setup:**

For TypeScript/JavaScript projects (the primary target), use `typescript-language-server` — the same LSP that VS Code and Monaco use. The standalone workstation already embeds Monaco, so the language server instance is shared between the code editor view and the core engine's pre-analyzer.

For multi-language support, Tree-sitter provides AST parsing across 100+ languages. It's not as rich as a full LSP but gives you symbol extraction, import tracing, and structural summaries for Python, Go, Rust, Java, and others. The core engine would use Tree-sitter as the fallback when no language-specific LSP is available.

```typescript
// forgeplan-core/src/intelligence/factory.ts

function createCodeIntelligence(projectPath: string): CodeIntelligence {
  const lang = detectProjectLanguage(projectPath);
  
  switch (lang) {
    case 'typescript':
    case 'javascript':
      return new TypeScriptLSPClient(projectPath);  // Full LSP
    case 'python':
      return new PylspClient(projectPath);  // Python LSP (pylsp or pyright)
    default:
      return new TreeSitterFallback(projectPath, lang);  // AST-only, no diagnostics
  }
}
```

## 6.2 The Manifest as Context Compression Layer

This is the most important architectural insight for scaling. The manifest is not just an organizational tool — it's a **context compression layer** that keeps LLM calls efficient regardless of project size.

**The problem without the manifest:** A 50-node project might have 200 files and 30,000 lines of code. Stuffing all of that into context for every build, review, or sweep call is impossible (exceeds context windows) and wasteful (most of it is irrelevant to the current operation).

**The solution:** The manifest is a structural index of the entire project that fits in ~500-2,000 tokens regardless of project size. It tells the engine everything it needs to know to scope context correctly:

- Which nodes exist and their current status
- Which nodes depend on which other nodes
- Which shared models are used where
- Which files belong to which node
- Which interfaces connect which nodes

When the Builder agent builds the `auth` node, it doesn't need the entire codebase. It needs:
1. The `auth` node spec (~200-500 tokens)
2. Shared model definitions referenced in the spec (~100-300 tokens)
3. Adjacent interface contracts — just the signatures, not full source (~200-500 tokens via LSP)
4. The Builder agent prompt (~500-1,000 tokens)

Total: ~1,000-2,300 tokens of context for any individual node build, regardless of whether the project has 7 nodes or 70 nodes. The manifest lets the engine know exactly what to include and what to exclude.

**How the manifest scales:**

| Project Size | Manifest Size | Per-Node Build Context | Without Manifest |
|---|---|---|---|
| 7 nodes, 50 files | ~300 tokens | ~2,000 tokens | ~15,000 tokens (all files) |
| 20 nodes, 150 files | ~800 tokens | ~2,500 tokens | ~50,000 tokens (impossible to fit) |
| 50 nodes, 400 files | ~2,000 tokens | ~3,000 tokens | ~120,000 tokens (absolutely impossible) |

The per-node build context grows slowly (because adjacent interface contracts grow slightly with more nodes) while the "without manifest" context grows linearly with project size. At 20+ nodes, the manifest approach is the only viable approach. At 50+ nodes, it's the difference between "works" and "doesn't work at all."

**The manifest also compresses sweep context:**

Instead of sending all 400 files to a sweep agent, the engine:
1. Reads the manifest to identify which files are relevant to each sweep concern
2. Uses LSP to pre-compute structural summaries of those files
3. Uses LSP diagnostics to identify pre-computed findings (zero tokens)
4. Sends only the files with potential issues + their structural context to the sweep agent

The sweep agent receives a focused, pre-filtered payload instead of a raw dump. Token costs for a 50-node sweep might be 30,000-50,000 tokens instead of 500,000+ tokens.

**The manifest must be maintained:**

The manifest is only useful as a context compression layer if it's accurate. Every build, every review, every revise must update the manifest. This is already enforced by the PostToolUse middleware (file registration) and the Orchestrator (status updates after every operation). The key discipline: the manifest is never stale. It is updated after every atomic operation, not at the end of a build session. This is what "governance always" means in practice — the manifest governs context scoping, so its accuracy is a system requirement, not a nice-to-have.

## 6.3 Token Cost Optimization — Making Large Builds Economical

Beyond LSP and manifest-based context scoping, several additional strategies reduce token costs:

### 6.3.1 Diff-Based Context for Reviews and Sweeps

When the Reviewer or sweep agent reviews code after a fix, it doesn't need the full file. It needs the diff — what changed, plus enough surrounding context to understand the change.

```typescript
// forgeplan-core/src/context/diff-context.ts

class DiffContextBuilder {
  async buildReviewContext(nodeId: string, previousCommit: string): Promise<string> {
    const diff = await this.tools.bash(`git diff ${previousCommit} -- ${this.getNodeFiles(nodeId).join(' ')}`);
    
    // For each changed file, include:
    // 1. The diff hunks (what changed)
    // 2. The function signatures surrounding each hunk (structural context via LSP)
    // 3. The spec criteria that map to the changed functions (via anchor comments)
    
    // NOT included: unchanged files, unchanged functions within changed files
    
    return this.formatDiffContext(diff, nodeId);
  }
}
```

For the cross-model fix verification step (Sprint 6), this is critical. The Fix Verifier agent in Codex doesn't need every file Claude touched — it needs the diffs of what Claude changed plus the original findings those changes were supposed to fix. That's a small, focused payload.

### 6.3.2 Structural Summaries Instead of Full Source

When the Builder needs to understand an adjacent node's interface, it doesn't need the full source code. It needs the structural signature — exports, function signatures, type definitions.

```typescript
// Instead of:
// "Here is the full auth module (800 lines):"
// [800 lines of code]

// Send:
// "Auth module exports:"
// - verifyToken(token: string): Promise<DecodedToken>
// - createSession(userId: string): Promise<Session>  
// - requireRole(role: UserRole): Middleware
// - AuthContext: React.Context<AuthState>
// Types: DecodedToken { userId, role, exp }, Session { id, userId, createdAt }

// Token reduction: ~800 lines → ~15 lines. 95%+ savings.
```

LSP provides these signatures automatically. For the standalone, this is integrated into the `PreAnalyzer.getNodeContextForBuild()` method shown in Section 6.1.

### 6.3.3 Tiered Model Routing for Cost

Not every operation needs the most expensive model. The `config.yaml` role routing already supports this, but the cost implications are worth making explicit:

| Operation | Quality Need | Recommended Tier | Approx Cost |
|---|---|---|---|
| Architect (discovery) | High — nuanced design decisions | Advanced (Sonnet/GPT-4o) | $$$ per session |
| Builder | High — correct code generation | Advanced (Sonnet/GPT-4o) | $$$ per node |
| Reviewer | High — precise spec-diff judgment | Advanced (Sonnet/GPT-4o) | $$ per node |
| Sweep: Security | High — must catch real vulnerabilities | Advanced | $$ per sweep |
| Sweep: Types | Medium — LSP pre-computes most findings | Basic (Haiku/Flash) | $ per sweep |
| Sweep: Imports | Low — LSP pre-computes almost everything | Basic (Haiku/Flash) | $ per sweep |
| Sweep: Errors | Medium — pattern matching | Standard | $ per sweep |
| Sweep: Database | Medium — schema awareness | Standard | $$ per sweep |
| Sweep: API Contracts | High — cross-node reasoning | Advanced | $$ per sweep |
| Fix Verification | Medium — diff review | Standard | $ per pass |
| Completion Check | Medium — criteria evaluation | Standard | $ per node |

With LSP pre-analysis, the type consistency and import/dependency sweep agents can run on the cheapest models (or potentially not run at all if LSP found zero issues). This can cut sweep costs by 30-50%.

### 6.3.4 Caching and Memoization

Don't re-review nodes that haven't changed. Don't re-sweep files that haven't been modified since the last clean sweep.

```typescript
// forgeplan-core/src/cache/review-cache.ts

class ReviewCache {
  private cache: Map<string, { hash: string; report: ReviewReport }> = new Map();
  
  async shouldReview(nodeId: string): Promise<boolean> {
    const cached = this.cache.get(nodeId);
    if (!cached) return true;
    
    // Hash all files in the node's file_scope
    const currentHash = await this.hashNodeFiles(nodeId);
    
    // If files haven't changed since last review, skip
    if (currentHash === cached.hash) {
      return false;  // node unchanged — use cached review report
    }
    
    return true;
  }
  
  async shouldSweep(filePaths: string[]): Promise<string[]> {
    // Return only files that have changed since last clean sweep
    const lastSweepHashes = this.loadSweepHashes();
    
    return filePaths.filter(path => {
      const currentHash = hashFile(path);
      return currentHash !== lastSweepHashes[path];
    });
  }
}
```

For a 50-node project where the user revises one node and triggers a rebuild: instead of re-reviewing all 50 nodes, the cache identifies that only 3 nodes were affected (the revised node plus 2 downstream). The other 47 nodes use cached review reports. Token savings: 94%.

### 6.3.5 Structured Output Enforcement

LLMs waste tokens on prose preambles, conversational filler, and unstructured responses. Forcing structured output (JSON) for all internal operations eliminates this waste.

```typescript
// Instead of the model responding:
// "I've analyzed the auth module and found the following issues. 
//  First, there's a problem with the JWT expiration..."
// (200 tokens of prose before the actual findings)

// Force JSON response:
// { "findings": [{ "id": "S1", "file": "auth.ts", "line": 12, "issue": "JWT expiration 30 days" }] }
// (40 tokens, same information)

// Applied in the provider layer:
class ClaudeProvider implements ModelProvider {
  async sweepCodebase(files: FileMap, agentPrompt: string, context: SweepContext) {
    const response = await this.chat([
      { role: 'user', content: `${agentPrompt}\n\nRespond ONLY with a JSON array of findings. No prose. No preamble. Each finding: { "id": string, "file": string, "line": number, "issue": string, "severity": "critical"|"warning"|"minor" }` }
    ]);
    
    return JSON.parse(response.text);  // Clean structured data
  }
}
```

This applies to reviews, sweep findings, completion checks, and integration reports — every internal operation where the output is consumed by the engine, not shown to the user. The Builder agent's output is the exception — it generates code and prose explanations that the user might read.

## 6.4 Incremental Operations — Don't Redo What's Already Done

The naive approach to any change is: rebuild everything, re-review everything, re-sweep everything. The smart approach is: identify exactly what changed, rebuild only what's affected, re-review only modified nodes, re-sweep only modified files.

**The blast radius calculator already exists** in your plugin (`blast-radius.js`). It takes a changed node and returns all affected nodes. This is the foundation for incremental operations.

```typescript
// forgeplan-core/src/engine/incremental.ts

class IncrementalEngine {
  async revise(nodeId: string, changes: SpecChanges): Promise<ReviseResult> {
    // Step 1: Calculate blast radius
    const affected = this.blastRadius.calculate(nodeId, changes);
    // Returns: { direct: ['api', 'frontend-login'], indirect: ['frontend-dashboard'] }
    
    // Step 2: Rebuild only affected nodes (dependency order)
    const buildOrder = this.topoSort.sort(affected.all());
    for (const id of buildOrder) {
      await this.orchestrator.buildNode(id);
    }
    
    // Step 3: Review only rebuilt nodes (cached reports for unchanged nodes)
    for (const id of buildOrder) {
      await this.orchestrator.reviewNode(id);
    }
    
    // Step 4: Sweep only modified files
    const modifiedFiles = this.getModifiedFilesSinceLastSweep();
    await this.orchestrator.sweep({ fileScope: modifiedFiles });
    
    // Step 5: Integration check (always full — it's cheap and catches cross-node issues)
    await this.orchestrator.integrate();
    
    return { affectedNodes: buildOrder, rebuiltFiles: modifiedFiles.length };
  }
}
```

**For deep-build after the initial build:**

The first deep-build of a project builds everything from scratch — that's unavoidable. But subsequent deep-builds (after revisions or feature additions) should be incremental:

1. Identify which nodes are new or modified since last deep-build
2. Build only those nodes
3. Review only those nodes + any nodes whose interfaces changed
4. Sweep only modified files (LSP pre-analysis + focused LLM sweep)
5. Cross-model verify only the diff since last clean certification

A 50-node project where 3 nodes changed should cost ~10% of a full deep-build, not 100%.

## 6.5 The Manifest Update Discipline

Everything above depends on the manifest being accurate. If the manifest is stale, context scoping sends the wrong files, blast radius calculations miss affected nodes, and incremental builds skip things that should have been rebuilt.

The discipline is simple and non-negotiable:

**After every atomic operation, the manifest updates.** Not at the end of a build session. Not when the user remembers. After every file write, every spec change, every status transition, every review completion.

The PostToolUse middleware already handles file registration (every new file is added to the node's file list in the manifest). The Orchestrator handles status updates (node goes from `building` to `built` after build completes). The Revise command handles interface change propagation (modified interfaces flag affected nodes).

**The manifest is append-forward, never stale.** Every change is recorded. Every status reflects reality. The manifest is the single source of truth that the context compression layer, the blast radius calculator, the incremental engine, and the review cache all depend on.

This is what "governance always" means operationally. The governance isn't just about preventing bad code. It's about maintaining the data structures that make the entire system efficient at scale. Without manifest accuracy, you lose the scaling advantage and fall back to brute-force approaches that don't work beyond 10 nodes.

---

# 7. Port Timeline — The Fastest Path

## Phase 1: Core Engine Extraction (Weeks 1-4)

**Week 1: Foundation — Copy and Restructure**
- Create `forgeplan-core/` package with npm init and TypeScript config
- Copy all scripts, schemas, templates, agents, blueprints (the 40% free transfer)
- Extract enforcement logic from hook scripts into pure functions (file-scope-guard, shared-model-guard, spec-compliance as standalone modules)
- Build the middleware pipeline (ToolPipeline class with registerPre/registerPost)
- Wire existing enforcement functions into middleware
- Verify: `validate-manifest.js`, `validate-spec.js`, `topo-sort.js` all pass their existing tests unchanged

**Week 2: Agent Execution — The Runtime**
- Build the Provider Interface and Claude provider (the model you know best)
- Build the tool execution layer (read/write/edit/glob/grep/bash using the library stack: fs/promises, execa, fast-glob, @vscode/ripgrep, replace-in-file)
- Build the agent loop (prompt → tool calls → observe → repeat)
- Build the completion checker (Stop hook logic)
- Build the context manager with compaction (token counting via tiktoken, critical context preservation, summarization of older messages)
- Verify: can run a single `buildNode` call end-to-end and produce a valid file with enforcement active

**Week 3: Orchestration + Intelligence**
- Build the Orchestrator with all command methods (discover, build, review, revise, sweep, deep-build, integrate, recover)
- Build the event bus for frontend communication
- Add OpenAI provider and MCP provider
- Build the `config.yaml` parser and role router
- Build the LSP integration layer: TypeScriptLSPClient wrapping typescript-language-server, Tree-sitter fallback for non-TS projects
- Build the PreAnalyzer: structural analysis before LLM calls (type definitions, references, diagnostics, import graph, dead exports — all zero tokens)
- Verify: can run `deepBuild` from the CLI and produce a multi-node project

**Week 4: Efficiency — Caching, Incremental, Structured Output**
- Build the review cache (hash node files, skip re-review of unchanged nodes)
- Build the sweep cache (hash files, skip re-sweep of unchanged files)
- Build the incremental engine (blast radius → targeted rebuild/review/sweep)
- Build diff-based context builder (git diff → focused review payloads)
- Integrate structured output enforcement into all internal provider calls (JSON responses for reviews, sweep findings, completion checks)
- Integrate LSP pre-analysis into the sweep pipeline: pre-compute findings before LLM agents, send only relevant files + structural summaries to sweep agents
- End-to-end optimization test: run deep-build, measure total token usage, compare to a deep-build without LSP/caching/structured-output. Target: 40-60% reduction.
- Verify: revise one node in a 7-node project, confirm only affected nodes rebuild and re-review

**Deliverable:** `forgeplan-core` npm package that runs from a CLI. `npx forgeplan discover`, `npx forgeplan build auth`, `npx forgeplan deep-build`. Full feature parity with the plugin, model-agnostic, with LSP intelligence, caching, and incremental operations. Token-optimized.

## Phase 2: Tauri Shell (Weeks 5-6)

**Week 5:**
- Scaffold Tauri project with React frontend
- Configure sidecar to spawn `forgeplan-core` Node.js process
- Build IPC command pass-throughs (one per orchestrator method)
- Build event forwarding (core stdout → Tauri events → React)
- Build file watcher on `.forgeplan/` directory
- Verify: can invoke `buildNode` from React and receive status events

**Week 6:**
- Polish sidecar lifecycle management (startup, shutdown, crash recovery)
- Build project open/new dialogs
- Build settings panel (config.yaml editor — model assignments, API keys)
- Build native menus
- Package and test on Mac, Windows, Linux
- Verify: app launches, connects to core engine, responds to commands

**Deliverable:** A Tauri desktop app that launches, connects to the core engine, and can invoke all commands. No visual canvas yet — just a basic UI proving the plumbing works.

## Phase 3: React Flow Canvas (Weeks 7-9)

**Week 7:**
- Build manifest-to-canvas transform
- Build custom node components (ForgeplanNode with status colors, progress bars, tech tags)
- Build custom edge components (ForgeplanEdge with labels, health indicators, direction arrows)
- Build hierarchical zoom (double-click to expand, breadcrumbs for navigation)
- Wire canvas to live events (node status changes animate in real-time)
- Verify: open a project with a completed `.forgeplan/` directory and see the architecture rendered correctly

**Week 8:**
- Build the context panel (right slide-in with tabs: Spec, Build, Review, Code, History, Sweep)
- Embed Monaco editor for code view with anchor comment highlighting (connect to shared LSP instance for code intelligence)
- Build the spec card UI (formatted acceptance criteria, constraints, non-goals, interfaces)
- Build the review report UI (PASS/FAIL per criterion with color indicators)
- Build the sweep findings UI
- Verify: click a node, see all its information in the context panel

**Week 9:**
- Build the discovery chat panel (bottom slide-up, streaming responses)
- Wire discovery responses to animated node insertion on canvas
- Build phantom preview system (LLM-generated wireframes in sandboxed iframe)
- Build decision steering UI (ghosted preview nodes that solidify on confirm)
- Build the build progress visualization (amber pulse, progress bar, dependency flow glow)
- Verify: run a full discovery conversation and watch the blueprint build on the canvas

## Phase 4: Interactive Features + Polish (Weeks 10-13)

**Week 10:**
- Build interactive spec editing (click to edit fields, natural language bar for freeform changes)
- Build the revise flow (change impact highlighting — orange direct, yellow indirect, dim unaffected)
- Build change propagation animation (ripple effect outward through dependency graph)
- Verify: revise a node and watch the impact visualization before confirming

**Week 11:**
- Build the deep-build visual experience (nodes lighting up in sequence, sweep phase indicators)
- Build the sweep visualization (blue pulse, finding counters, cross-model verification indicators)
- Build the deep-build report view
- Verify: run deep-build and watch the entire process on the canvas

**Week 12:**
- Build the debugging experience (red connections with plain-English explanations, data flow tracing)
- Build the phantom-to-live preview transition
- Build the three-tier zoom depth (Blueprint → X-Ray → Full Control with Monaco edit mode)
- Verify: the full user journey from discovery through debug works end-to-end

**Week 13:**
- Visual polish: animations, transitions, colors, typography, loading states, error states
- Onboarding flow (welcome screen, template selection, first-run guidance)
- Documentation and README
- Cross-platform testing and packaging
- Ship

**Total: 13 weeks from extraction start to shippable visual workstation.**

---

# 8. What Makes This Fast

**The core engine extracts in 4 weeks** because 80% of the code is already model-agnostic. You're not rewriting logic — you're rebuilding plumbing around existing logic. Week 4 adds the efficiency systems (LSP, caching, incremental operations) that make the standalone economically viable at scale.

**The Tauri shell is 2 weeks** because it's deliberately thin. It spawns a Node.js process and forwards messages. That's it. The complexity lives in TypeScript (the core engine) and React (the frontend), not Rust.

**The React frontend is 7 weeks** but that's parallelizable with the core engine work. Someone could start on the canvas components in Week 2 using mock data while the core engine is being extracted.

**The efficiency layer pays for itself immediately.** LSP pre-analysis eliminates 30-50% of sweep agent token costs by pre-computing findings that don't need LLM judgment. The review cache eliminates re-reviewing unchanged nodes. The incremental engine eliminates rebuilding unaffected nodes. Structured output enforcement eliminates LLM prose waste on internal operations. Together, these reduce the token cost of a deep-build by 40-60% compared to the naive approach — which makes the product economically viable for the medium-to-large projects it's designed for.

**Nothing is sacrificed.** Every plugin feature maps to a standalone feature. Every enforcement hook maps to a middleware function. Every agent prompt transfers unchanged. Every script runs as-is. The autonomous sweep, the cross-model alternating loop, the deep-build pipeline, the change propagation — all of it works because the core engine IS the plugin code, just in a different shell. The efficiency systems are additive — they make everything faster and cheaper without changing what the product does.

---

# 9. The Package Structure

```
forgeplan/
├── packages/
│   ├── core/                          # TypeScript core engine (npm package)
│   │   ├── src/
│   │   │   ├── engine/
│   │   │   │   ├── orchestrator.ts    # 21+ command dispatch (all sprints)
│   │   │   │   ├── agent-loop.ts      # Agentic turn cycle
│   │   │   │   ├── completion-checker.ts
│   │   │   │   ├── greenfield.ts      # Greenfield pipeline orchestration (Sprint 8)
│   │   │   │   ├── review-panel.ts    # 5-agent × 3-lens dispatch (Sprint 10A)
│   │   │   │   └── phase-manager.ts   # Phased build advancement (Sprint 10B)
│   │   │   ├── middleware/
│   │   │   │   ├── pipeline.ts        # Tool execution middleware
│   │   │   │   ├── file-scope-guard.ts
│   │   │   │   ├── shared-model-guard.ts
│   │   │   │   ├── phase-gate.ts      # Phase enforcement (Sprint 10B)
│   │   │   │   ├── spec-compliance.ts
│   │   │   │   └── post-write.ts      # File registration, logging
│   │   │   ├── providers/
│   │   │   │   ├── interface.ts       # ModelProvider interface
│   │   │   │   ├── claude.ts
│   │   │   │   ├── openai.ts
│   │   │   │   ├── google.ts
│   │   │   │   ├── mcp.ts
│   │   │   │   ├── router.ts          # Role-based + tier-aware provider routing
│   │   │   │   └── calibration.ts     # Per-model prompt tuning
│   │   │   ├── tiers/
│   │   │   │   ├── config.ts          # SMALL/MEDIUM/LARGE definitions (Sprint 7A)
│   │   │   │   └── dispatcher.ts      # Tier → agent count, verification depth, etc.
│   │   │   ├── context/
│   │   │   │   ├── manager.ts         # Conversation history + compaction (includes PreCompact/PostCompact)
│   │   │   │   ├── tokens.ts          # Token counting
│   │   │   │   └── confidence.ts      # Confidence scoring filter (Sprint 7B)
│   │   │   ├── tools/
│   │   │   │   ├── executor.ts        # File ops, bash, glob, grep
│   │   │   │   └── sandbox.ts         # Safety constraints
│   │   │   ├── intelligence/
│   │   │   │   ├── lsp-client.ts      # Language Server Protocol integration
│   │   │   │   ├── pre-analyzer.ts    # Pre-sweep structural analysis (zero tokens)
│   │   │   │   ├── tree-sitter.ts     # AST fallback for non-TS languages
│   │   │   │   └── factory.ts         # Language detection → right intelligence backend
│   │   │   ├── cache/
│   │   │   │   ├── review-cache.ts    # Skip re-review of unchanged nodes
│   │   │   │   ├── sweep-cache.ts     # Skip re-sweep of unchanged files
│   │   │   │   └── hash.ts            # File/node content hashing
│   │   │   ├── incremental/
│   │   │   │   └── engine.ts          # Blast radius → targeted rebuild/review/sweep
│   │   │   ├── events/
│   │   │   │   └── bus.ts             # Event emitter
│   │   │   └── state/
│   │   │       └── manager.ts         # state.json read/write
│   │   ├── scripts/                   # ALL plugin scripts — copied unchanged
│   │   │   ├── validate-manifest.js
│   │   │   ├── validate-spec.js
│   │   │   ├── topo-sort.js
│   │   │   ├── next-node.js
│   │   │   ├── verify-runnable.js     # Stack-adaptive (Sprint 7A)
│   │   │   ├── runtime-verify.js      # 5-level endpoint verification (Sprint 8)
│   │   │   ├── blast-radius.js        # Dependency impact analysis (Sprint 11)
│   │   │   ├── integrate-check.js
│   │   │   ├── skill-registry.js      # 4-tier cascade (Sprint 11)
│   │   │   ├── worktree-manager.js    # Parallel sweep fixes (Sprint 7B)
│   │   │   ├── validate-ingest.js     # Repo ingestion validation (Sprint 10B)
│   │   │   ├── verify-cross-phase.js  # Phase boundary verification (Sprint 10B)
│   │   │   ├── cross-model-bridge.js  # MCP/CLI/API (Sprint 4/6)
│   │   │   ├── status-report.js       # Dependency graph visualization (Sprint 4)
│   │   │   └── lib/
│   │   │       └── contract-helpers.js # Shared helpers (Sprint 10B)
│   │   ├── schemas/                   # Copied unchanged (includes phase fields, tier fields)
│   │   ├── agents/                    # ALL agent prompts — copied unchanged
│   │   │   ├── architect.md           # + Planner mode (Sprint 10A)
│   │   │   ├── builder.md             # + research awareness (Sprint 8)
│   │   │   ├── reviewer.md
│   │   │   ├── interviewer.md         # Socratic requirements (Sprint 10A)
│   │   │   ├── translator.md          # Document/repo import (Sprint 10A/10B)
│   │   │   ├── researcher.md          # Packages + patterns (Sprint 8/10A)
│   │   │   ├── review-panel/          # 5 agents × 3 lens variants (Sprint 10A)
│   │   │   └── sweep/                 # 5 consolidated agents (Sprint 9)
│   │   ├── skills/                    # 32 SKILL.md files (Sprint 11)
│   │   ├── wiki/                      # Semantic memory (Sprint 9)
│   │   └── templates/                 # Blueprints + schemas
│   │
│   ├── cli/                           # CLI interface over core
│   │   └── src/
│   │       └── index.ts               # npx forgeplan <command>
│   │
│   └── desktop/                       # Tauri + React workstation
│       ├── src-tauri/                 # Rust shell
│       │   └── src/
│       │       ├── main.rs
│       │       ├── sidecar.rs         # Core engine process management
│       │       ├── commands.rs        # IPC command pass-throughs
│       │       ├── watcher.rs         # .forgeplan/ file watching
│       │       └── bridge.rs          # Event forwarding
│       └── src/                       # React frontend
│           ├── components/
│           │   ├── canvas/
│           │   │   ├── ForgeplanNode.tsx
│           │   │   ├── ForgeplanEdge.tsx
│           │   │   └── Canvas.tsx
│           │   ├── panels/
│           │   │   ├── ContextPanel.tsx
│           │   │   ├── SpecCard.tsx
│           │   │   ├── BuildLog.tsx
│           │   │   ├── ReviewReport.tsx
│           │   │   ├── CodeView.tsx
│           │   │   ├── ConversationHistory.tsx
│           │   │   └── SweepFindings.tsx
│           │   ├── discovery/
│           │   │   ├── ChatPanel.tsx
│           │   │   └── PhantomPreview.tsx
│           │   └── chrome/
│           │       ├── Breadcrumbs.tsx
│           │       ├── Settings.tsx
│           │       └── Onboarding.tsx
│           ├── stores/
│           │   ├── canvas.ts
│           │   ├── build.ts
│           │   ├── discovery.ts
│           │   └── preview.ts
│           ├── transforms/
│           │   └── manifest-to-canvas.ts
│           ├── hooks/
│           │   └── useForgeplanEvents.ts
│           └── api/
│               └── forgeplan.ts       # Tauri invoke wrappers
│
├── .forgeplan/                        # The product (unchanged)
└── forgeplan-plugin/                  # Claude Code plugin (kept as free tier)
```

Three packages. One core engine. Two interfaces (CLI + Desktop). The plugin stays alive as the free tier. All three share the same `.forgeplan/` directory format.

---

# 10. Risk Mitigation

| Risk | Mitigation |
|---|---|
| Tauri sidecar Node.js process management is flaky | Test extensively on all three platforms. Fallback: embed the core engine as a Tauri API endpoint instead of sidecar — same TypeScript code, different process model. |
| Agent loop doesn't replicate Claude Code's quality | Start with Claude as the only fully-supported builder model. The agent loop only needs to work well with Claude initially. Other models are sweep/review roles where expectations are lower. |
| Context management degrades on long builds | Implement aggressive compaction early. Test with the largest project you've built (SNF Admit Assist or CareFlow). If the 40-node build works, everything smaller will too. The manifest as context compression layer keeps per-node context size constant regardless of project size. |
| Multi-model calibration takes too long | Ship with Claude-only initially. Claude handles all roles. Add other models as sweep/review providers incrementally. The config.yaml already supports it — it's just a matter of tuning prompts per model. |
| React Flow performance with 50+ nodes | React Flow handles thousands of nodes. The bottleneck would be custom animations, not node count. Disable animations above 30 nodes if needed. |
| Windows cross-platform issues | Tauri and Node.js are both cross-platform. The main risk is bash execution in the tool layer. Use `execa` with `shell: true` which handles cmd.exe vs bash automatically. Test on Windows weekly. |
| LSP startup time slows builds | Language servers take 2-5 seconds to initialize. Start the LSP when the project opens, not when the first build starts. Keep it running as a long-lived process alongside the core engine. Monaco can share the same LSP instance. |
| Token costs too high for large projects | LSP pre-analysis + review cache + incremental engine + structured output together target 40-60% reduction. If still too high, add model tier routing to push cheap tasks (type sweep, import sweep) to Haiku/Flash-class models. Monitor token usage per deep-build and publish the data. |
| Manifest staleness breaks context scoping | The PostToolUse middleware updates the manifest after every write. This is non-negotiable. Add a manifest integrity check at the start of every operation — if the manifest's file lists don't match the actual filesystem, warn and offer to reconcile. |

---

# 11. The Migration Checklist

When you're ready to start the port (after plugin dogfooding proves the methodology):

**Phase 1: Core Engine (Weeks 1-4)**
- [ ] Create monorepo with `packages/core`, `packages/cli`, `packages/desktop`
- [ ] Copy all scripts, schemas, agents, templates to `packages/core`
- [ ] Extract enforcement logic from hook scripts into pure functions
- [ ] Build ToolPipeline middleware class
- [ ] Build ToolExecutor with fs/execa/fast-glob/ripgrep
- [ ] Build ModelProvider interface and Claude provider
- [ ] Build AgentLoop (prompt → tools → observe → repeat)
- [ ] Build BuildCompletionChecker (Stop hook logic)
- [ ] Build ContextManager with compaction and token counting
- [ ] Build ForgeplanOrchestrator (all commands)
- [ ] Build EventBus
- [ ] Build config.yaml parser and ProviderRouter
- [ ] Add OpenAI provider and MCP provider
- [ ] Build LSP integration (TypeScriptLSPClient + Tree-sitter fallback)
- [ ] Build PreAnalyzer (structural analysis before LLM calls — zero token findings)
- [ ] Build ReviewCache and SweepCache (skip re-review/re-sweep of unchanged code)
- [ ] Build IncrementalEngine (blast radius → targeted operations)
- [ ] Build DiffContextBuilder (git diff → focused review payloads)
- [ ] Integrate structured output enforcement into internal provider calls
- [ ] Build CLI interface (`npx forgeplan <command>`)
- [ ] Verify: CLI deep-build produces same results as plugin
- [ ] Measure: token usage with vs without LSP/caching/incremental (target 40-60% reduction)

**Phase 2: Tauri Shell (Weeks 5-6)**
- [ ] Scaffold Tauri desktop app
- [ ] Build sidecar process management for core engine
- [ ] Build IPC command pass-throughs (one per orchestrator method)
- [ ] Build event forwarding (core stdout → Tauri events → React)
- [ ] Build file watcher on `.forgeplan/` directory (notify crate)
- [ ] Build project open/new dialogs and native menus
- [ ] Build settings panel (config.yaml editor)
- [ ] Cross-platform packaging and testing

**Phase 3: React Flow Canvas (Weeks 7-9)**
- [ ] Build manifest-to-canvas transform (manifest → React Flow nodes + edges)
- [ ] Build custom ForgeplanNode component (status colors, progress, tech tags)
- [ ] Build custom ForgeplanEdge component (labels, health, direction)
- [ ] Build hierarchical zoom with breadcrumb navigation
- [ ] Build context panel with all six tabs (Spec, Build, Review, Code, History, Sweep)
- [ ] Embed Monaco editor with LSP connection and anchor comment highlighting
- [ ] Build discovery chat panel with streaming responses
- [ ] Wire discovery to animated node insertion on canvas
- [ ] Build phantom preview system (LLM wireframes in sandboxed iframe)
- [ ] Build decision steering UI (ghosted nodes that solidify on confirm)
- [ ] Build build progress visualization (amber pulse, progress bar, dependency glow)

**Phase 4: Interactive Features + Polish (Weeks 10-13)**
- [ ] Build interactive spec editing with natural language bar
- [ ] Build revise flow with change impact highlighting (blast radius visualization)
- [ ] Build change propagation animation (ripple outward through dependency graph)
- [ ] Build deep-build visual experience (sequential node lighting, sweep indicators)
- [ ] Build sweep visualization (blue pulse, finding counters, cross-model indicators)
- [ ] Build debugging experience (red connections, plain-English explanations, data flow tracing)
- [ ] Build phantom-to-live preview transition
- [ ] Build three-tier zoom depth (Blueprint → X-Ray → Full Control)
- [ ] Visual polish: animations, transitions, colors, typography, loading/error states
- [ ] Onboarding flow (welcome screen, template selection, first-run guidance)
- [ ] Documentation and README
- [ ] Cross-platform testing and final packaging
- [ ] Ship

---

**Architecture down. Code forward. Governance always.**

**END OF DOCUMENT**
