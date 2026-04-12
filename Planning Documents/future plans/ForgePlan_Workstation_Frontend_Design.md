# ForgePlan Workstation — Frontend Design Document

**Architecture down. Code forward. Governance always.**

**Prepared by:** Craig Spergel
**Date:** April 2026
**Status:** DRAFT — CONFIDENTIAL
**Companion documents:** ForgePlan Concept Document v4.1, ForgePlan Core Execution Plan

---

# 1. Design Philosophy: This Is Not an IDE

ForgePlan Workstation is not a code editor with a planning panel bolted on. It is an architecture workstation where the visual blueprint is the primary interface, the navigation system, the debugging tool, and the knowledge graph of the entire application. Code exists inside the architecture, not beside it.

The user opens ForgePlan and sees a canvas. Not a file tree. Not a terminal. Not tabs of open files. A clean, inviting canvas where their idea will take visual shape — or already has.

**What the user never sees by default:**
- A file tree or file browser
- A tab bar with open files
- A terminal window
- A sidebar full of icons
- A status bar with git branch info

**What the user always sees:**
- The architecture canvas — their entire application as a visual knowledge graph
- Breadcrumbs — where they are in the conceptual hierarchy
- A context panel — whatever is relevant to what they're interacting with right now

The principle: every pixel on screen answers the question "how does my application work?" not "what files does my application have?"

---

# 2. The Canvas: The Entire Application at a Glance

## 2.1 Canvas as Full-Screen Default

The canvas occupies 100% of the viewport on launch. No chrome, no sidebar, no toolbar competing for attention. The architecture IS the application. Nodes represent functional units. Edges represent data flow and dependency. The user's mental model of their application and the visual representation on screen are the same thing.

The canvas background is subtle — a faint dot grid or clean solid — never distracting. The nodes and connections are the content. Everything else recedes.

## 2.2 Node Design

Each node is a rounded card on the canvas representing a functional unit of the application: a frontend page, an API layer, a database, an auth system, a third-party integration.

**Node anatomy:**

```
┌─────────────────────────────┐
│  ⬡  Auth Service            │  ← Icon + name
│                             │
│  JWT · Supabase · OAuth     │  ← Tech tags (subtle, muted)
│                             │
│  ████████████░░  6/8 AC     │  ← Acceptance criteria progress
│                             │
│  ● Building...              │  ← Status indicator (animated)
└─────────────────────────────┘
```

**Node states drive visual treatment:**

| State | Visual | Meaning |
|-------|--------|---------|
| Pending | Gray outline, dashed border | Not started |
| Specced | Gray outline, solid border | Has spec, not built |
| Building | Yellow/amber pulse animation | Build agent is working |
| Verifying | Amber with checkmark cycling | verify-runnable.js checking compilation, tests, server |
| Built | Solid fill, muted color | Code generated, not reviewed |
| Reviewing | Orange pulse | Review panel is analyzing |
| Complete | Solid green fill, subtle glow | Built, reviewed, approved |
| Failed | Red fill, attention indicator | Review failed or build crashed |
| Sweeping | Blue pulse | Sweep agent is auditing |
| Phase-Locked | Ghosted/dimmed, phase badge | Future phase — not yet buildable |

The pulse animations are slow and subtle — breathing, not flashing. The user should feel calm watching their system build, not anxious.

**Node type differentiation:**

Nodes are color-coded by type so the architecture's structure is immediately legible at a glance:

- **Infrastructure** (database, storage, caching): Deep blue/steel tones
- **Services** (auth, API, business logic): Purple/violet tones
- **Frontend** (pages, components, views): Green/teal tones
- **Integrations** (Stripe, Twilio, email, third-party): Warm orange tones

These are background tints, not loud colors. The canvas should feel cohesive, not like a bag of Skittles.

## 2.3 Connections: Typed, Directional Contracts

Connections between nodes are not generic lines. They are typed, directional arrows that represent real data flow contracts.

**Connection anatomy:**

```
[Auth] ──JWT middleware──▶ [API]
```

- **Direction:** Arrows show data flow. Auth provides JWT to API, not the other way around.
- **Label:** The connection type appears on hover or always, depending on zoom level. "JWT middleware," "Supabase read/write," "REST endpoint," "Event listener."
- **Thickness:** Proportional to the amount of data or the number of interface points between nodes. A node with one API call to another gets a thin line. A node with twelve shared interfaces gets a thick one.
- **Health color:** Green = healthy/verified. Yellow = unverified. Red = broken (interface mismatch, missing endpoint, type error). Gray = not yet built.

**On hover:** The connection expands to show the contract summary — what data shape is expected, what the endpoint is, whether the types match. This is the interface contract from the spec, rendered visually.

**On click:** The connection opens a detail panel showing the full interface contract, both sides' implementations, and any mismatches. If the connection is red, the panel explains what's broken in plain language: "The frontend calls GET /api/clients but the API only has GET /api/users. The endpoint name doesn't match."

## 2.4 Canvas Interactions

**Pan and zoom:** Standard canvas interactions. Scroll to zoom, drag to pan. Pinch-to-zoom on trackpad.

**Select a node:** Single click highlights the node and shows its summary in the context panel (right side).

**Expand a node:** Double-click or click the expand icon to zoom into the node's interior. The canvas smoothly transitions from the high-level view into a detailed view of that node's components. Breadcrumbs update.

**Multi-select:** Drag to select multiple nodes. Useful for bulk operations: "build these three nodes" or "review this group."

**Right-click context menu:** Build, review, revise, view spec, view code, view conversation history. The available actions depend on the node's state.

---

# 3. Hierarchical Zoom: The Conceptual Telescope

## 3.1 Zoom Levels

The architecture is not flat. It's a hierarchy. Zooming into a node reveals its internal structure, which may itself contain sub-nodes.

**Level 1 — System overview:** 5-8 major systems. Frontend, Backend, Database, Auth, Integrations. This is what the user sees on first open.

**Level 2 — Component view:** Inside "Frontend" you see Landing Page, Login Flow, Dashboard, Settings, Accountant View. Inside "Backend" you see API Routes, Business Logic, Background Jobs.

**Level 3 — Detail view:** Inside "Dashboard" you see Patient List, Document Viewer, Upload Panel, Notification Bar. Each is a component with its own spec.

**Level 4 — Code view:** Inside "Patient List" you see the actual code. Monaco editor embedded within the node boundary. The code is *inside the architecture*, not in a separate panel.

At every level, breadcrumbs show the path: **Project → Frontend → Dashboard → Patient List**. Click any breadcrumb to jump to that level.

## 3.2 Zoom Transitions

Transitions between levels are smooth and animated. When you double-click "Frontend," the other top-level nodes fade and slide out of frame. The Frontend node expands to fill the canvas, and its children appear from within it. The feeling is "zooming into" the architecture, like a telescope focusing deeper.

When you zoom back out (click a breadcrumb or press Escape), the children collapse back into the parent and the sibling nodes slide back into view. The transition communicates spatial relationship — the children are *inside* the parent, not beside it.

## 3.3 Breadcrumbs as Navigation

The breadcrumb bar sits at the top of the canvas, always visible. It serves three functions:

1. **Location awareness:** Where am I in the hierarchy right now?
2. **Quick navigation:** Click any level to jump directly there.
3. **Context for AI agents:** When the user is viewing Patient List, the breadcrumbs tell the AI "this is a frontend component inside the Dashboard, inside the Frontend layer." The agent's context is scoped accordingly.

---

# 4. The Context Panel: Everything About What You're Looking At

## 4.1 Panel Behavior

The context panel slides in from the right side of the canvas when the user selects a node, connection, or other canvas element. It takes up approximately 35-40% of the screen width. The canvas compresses to accommodate it — the architecture remains visible but narrower.

When nothing is selected, the panel is hidden. The canvas gets the full viewport.

## 4.2 Panel Modes

The context panel has tabs or modes depending on what the user needs. The default mode is determined by the node's current state:

**Spec Card (default for specced/pending nodes):**
Shows the node's specification as a formatted, readable card:
- Acceptance criteria as a checklist (AC1 ✓, AC2 ✓, AC3 ✗)
- Constraints as tags
- Non-goals as a "this node does NOT" section
- Failure modes as a "what could go wrong" section
- Interfaces as a list of connections with types
- Shared dependencies as linked shared model references

The spec is editable. The user can click any field and edit in natural language. "Add Google OAuth" → the system adds a new acceptance criterion, creates an interface to Google, and updates the preview.

**Build Log (default for building nodes):**
Live streaming output from the Builder agent. Shows what's being generated, which files are being created, which acceptance criterion is being worked on. Progress bar showing criteria completion.

**Review Report (default for reviewed nodes):**
The review panel provides five perspectives, not a single flat report. Each of the five review agents (Adversary, Contractualist, Pathfinder, Structuralist, Skeptic) gets its own collapsible section with findings color-coded by severity (CRITICAL = red, IMPORTANT = amber, SUGGESTION = blue). The user sees a 360-degree audit:

- **Adversary** found a security issue — input validation missing on file upload
- **Contractualist** found a type mismatch — API returns `{data: users}` but frontend expects `{users}`
- **Skeptic** questions an assumption — spec says "rate limit to 10/min" but no implementation found
- **Structuralist** suggests simplification — two utility functions do the same thing
- **Pathfinder** traced the user flow — dead-end state after failed OAuth redirect

Each finding is expandable to show code evidence. The overall recommendation (APPROVE / REQUEST CHANGES / HALT) is prominent at the top. CRITICAL findings from any agent halt the pipeline — the user sees exactly why and can approve the fix or override.

The review panel lens shifts automatically by pipeline stage: Design lens during design review, Plan lens during plan review, Code lens during build review. The user doesn't configure this — the context panel shows whichever lens is active.

**Code View (available for any built node):**
Monaco editor showing the node's generated code. Anchor comments are highlighted — `@forgeplan-spec: AC1` gets a colored sidebar annotation linking it to the acceptance criterion. Read-only by default. Tier 3 users can toggle to edit mode. Connected to the shared LSP instance for code intelligence (go-to-definition, find references, diagnostics).

**Conversation History (available for any node):**
The full design rationale: why this node was created, what alternatives were considered, what decisions were made during discovery, what the user said that led to this architecture.

**Wiki (available project-wide and per-node):**
The semantic memory wiki — accumulated architectural knowledge that grows with each build, research session, and review cycle. Project-level wiki shows conventions, patterns, and design principles that apply everywhere. Node-level wiki shows specific knowledge about that node: why this approach was chosen, what the research found, what past sweeps caught. This is the institutional knowledge layer — richer and more structured than raw conversation logs.

**Sweep Findings (available for swept nodes):**
Cross-cutting issues that touched this node during the codebase sweep. Shows finding ID, source model (Claude or Codex), source agent (Adversary, Contractualist, etc.), confidence score, category, description, and resolution status. Findings below the confidence threshold (75) are dimmed but visible.

**Research (available after research phase):**
Package research results, license checks, architecture patterns, and prior art findings from the Researcher agent. Shows which packages were vetted, which were rejected and why, and the recommended patterns.

## 4.3 Panel Navigation

Tabs across the top of the panel: **Spec | Build | Review | Code | Wiki | History | Sweep | Research**

Only relevant tabs are shown. A pending node shows only Spec and History. A complete node shows all tabs. A node currently building shows Build as the active tab with a live indicator. Research tab only appears after `/forgeplan:research` has been run. Wiki tab appears once the project has accumulated wiki content.

---

# 5. Phantom Previews: The Dopamine Layer

## 5.1 What They Are

For every frontend-facing node, the system generates a low-fidelity UI mockup during the discovery phase. These are wireframe-quality screens — approximate layout, placeholder content, rough structure. Not functional. Not beautiful. Just enough to show "this is what this part of your app will look like."

Phantom previews render in the context panel when a frontend node is selected, or in a split view if the user toggles "Preview Mode."

## 5.2 Purpose

The emotional payoff of seeing your idea take shape immediately. Without phantom previews, the user spends twenty minutes in discovery conversation looking at boxes and arrows. With phantom previews, they see wireframes of their login page, their dashboard, their settings screen updating in real time as the conversation progresses.

The steering function is equally important. The user sees the preview and says "no, the sidebar should be on the left" or "I want a card layout, not a table." These corrections happen before any real code is written, which means the final build is more likely to match the user's vision.

## 5.3 Preview Lifecycle

| Phase | Preview State |
|-------|--------------|
| Discovery | Wireframe — gray boxes, placeholder text, rough layout |
| Specced | Enhanced wireframe — real labels from the spec, approximate colors |
| Building | Partially live — components replace wireframe sections as they're built |
| Complete | Fully live — the real, working UI replaces the preview entirely |

The transition from wireframe to live UI happens node by node. The user watches their application materialize. Wireframe boxes dissolve into real components. This is the visual proof that the build is working.

## 5.4 Implementation

Phantom previews are generated by an LLM call: "Generate a simple wireframe-style React component for [node description] using Tailwind. Return only the JSX." The result renders in a sandboxed iframe or React preview component within the context panel.

If the preview generation fails (the LLM returns invalid JSX), a styled placeholder card appears instead — the node name, description, and a "Preview unavailable" message. The system never shows a broken iframe.

---

# 6. The Design Pipeline: Three Stages on the Canvas

The build process is a three-stage pipeline, each with visual representation on the canvas and review gates between stages.

## 6.1 Stage 1: Discovery — Watching the Blueprint Build

### Chat Panel

During discovery, a chat panel appears at the bottom of the canvas (not the right side — the right is reserved for phantom previews during discovery). The user types or speaks. The Interviewer agent (for MEDIUM/LARGE projects) or the Architect directly (for SMALL projects) responds. After each response that adds or modifies the architecture, the canvas updates in real time.

The Interviewer uses Socratic questioning — one question at a time, detecting ambiguity, surfacing assumptions. The conversation feels like talking to a collaborator, not filling out a form: "What kind of users will access this system?" "Does the accountant need to see all clients or just their assigned ones?" "Should document uploads be stored locally or in cloud storage?"

For projects started from a document (`--from`), the Translator agent analyzes the document and proposes an architecture. Nodes appear on the canvas all at once, with the Translator's analysis in the context panel showing how each document section mapped to each node.

### Real-Time Canvas Updates

As the conversation progresses, nodes appear on the canvas with smooth animation. A new node doesn't just pop in — it slides in from the edge, finds its position in the layout, and connections draw themselves to existing nodes. The layout algorithm repositions existing nodes to accommodate the new one gracefully.

When a node is modified through conversation, it briefly highlights (a subtle flash) to draw the user's attention to what changed. If a connection is added, the line draws itself with a quick animation.

### Complexity Tier Display

During discovery, the Architect assesses the project's complexity tier. The canvas shows this assessment prominently — a badge or indicator: "MEDIUM — 4 sweep agents, sequential build with review, cross-model optional." The user sees what their project complexity means for the pipeline. If the user disagrees ("this is more complex than that, we need payments and compliance"), they can override. The tier changes and the pipeline adjusts visually.

### Decision Steering

At key decision points, the Architect doesn't just ask a question — it shows the implications visually. "If we add role-based access, that means an auth node with role management, a middleware connection to the API, and permission checks on every frontend page. Here's what that looks like." The proposed nodes appear on the canvas in a ghosted/preview state. The user confirms, and they solidify. The user declines, and they dissolve.

## 6.2 Review Gate 1: Design Review

After discovery completes, the canvas enters a review gate. A horizontal bar appears above the canvas: **"Design Review: 5 agents analyzing your architecture..."**

The review panel (Adversary, Contractualist, Pathfinder, Structuralist, Skeptic — count depends on tier) runs on the design. Their findings appear in the context panel. The canvas highlights any nodes with CRITICAL or IMPORTANT findings — a node might pulse orange if the Adversary found a security concern in the proposed architecture.

The user reviews the findings. CRITICALs must be resolved before proceeding (the gate blocks). IMPORTANTs are warnings that can be acknowledged. When the gate passes, the canvas transitions with a satisfying animation — the review bar turns green and dissolves, signaling "design approved, proceeding to build."

For SMALL projects, this gate is lightweight — 3 agents, quick pass, often automatic.

## 6.3 Stage 2: Research + Planning

After design approval, the Researcher agent runs automatically — vetting packages, checking licenses, finding architecture patterns. Research results appear in the context panel's Research tab. The canvas doesn't change during research (no new nodes), but a subtle indicator shows research is in progress.

The Architect then enters Planner mode, producing an implementation plan. This is visible in the context panel as a structured plan document.

## 6.4 Review Gate 2: Plan Review

Another review gate. The review panel runs on the plan (Plan lens). Same visual treatment — horizontal bar, agent indicators, findings in context panel. This gate ensures the implementation plan is sound before code generation begins.

## 6.5 Stage 3: Build + Code Review

This is the build experience described in Section 7. After the plan review gate passes, building begins. The review panel runs again after each node build (Code lens) and after the full sweep.

The three-stage pipeline gives the canvas three distinct visual modes:
1. **Discovery mode** — nodes materializing, chat active, phantom previews appearing
2. **Review mode** — review gate bar, agent indicators, findings displayed
3. **Build mode** — nodes pulsing with build progress, dependency flow animation

The transitions between modes are the visual heartbeat of the product.

---

# 7. Build Experience: Watching the System Come Alive

## 7.1 Visual Build Progress

When the user initiates a build (clicking "Build" on a node, or running deep-build/greenfield for the entire project), the canvas becomes a live status board:

- The node being built pulses with a slow amber animation
- As files are created, a small counter on the node increments
- As acceptance criteria are met, the progress bar on the node fills
- When the build completes, the node transitions to a verification state — `verify-runnable.js` checks that code compiles, tests pass, and the dev server starts
- If verification passes, the node transitions from amber to green with a satisfying settle animation
- The next buildable node in the dependency chain glows softly, inviting the user to continue

During deep-build or greenfield (full autonomous mode), the user can watch the entire system build itself. Nodes light up in dependency order. Reviews happen. Sweeps run. Cross-model verification cycles show as a subtle oscillation between model indicators. The user can go get coffee and come back to an architecture where every node is green and the codebase is certified.

## 7.2 Phased Build Visualization

For LARGE projects with phased builds, the canvas shows build phases as visual layers. Phase 1 nodes are fully opaque and interactive. Phase 2+ nodes are ghosted — visible but dimmed, with a "Phase 2" badge, locked from building.

When Phase 1 completes (all nodes green, cross-phase integration verified), the phase advancement animation plays: a brief shimmer across the canvas, Phase 1 nodes settle into a "completed" state (slightly dimmed but green), Phase 2 nodes solidify and become interactive. The visual message: "Phase 1 is done and stable. Phase 2 is now active."

Phase boundaries show as subtle horizontal or vertical dividers on the canvas. The user can see the full project scope (all phases) while understanding what's buildable now versus what's locked for later. This prevents the overwhelm of seeing 30+ nodes on a LARGE project — phases chunk the work into digestible visual groups.

## 7.3 Build Detail View

If the user clicks a node while it's building, the context panel shows the live build log: which file is being generated, which criterion is being worked on, what the Builder agent is doing. Skills loaded for this node type are listed at the top. This is optional — the user doesn't need to watch. But the transparency is available.

## 7.4 Verification Indicators

After each node build, verification runs automatically. The canvas shows this as a brief secondary animation on the node — a checkmark icon that cycles through verification stages:

- ✓ Compiles (type check passes)
- ✓ Tests pass
- ✓ Dev server starts (for MEDIUM/LARGE — runtime-verify.js)
- ✓ Endpoints respond correctly (for LARGE — Phase B verification)

If any verification fails, the node shows a yellow warning icon instead of going green. The context panel shows the failure details with error classification: is it a code error (needs fix agent), environment error (auto-fixable), or transient error (retry)?

## 7.5 Phantom-to-Live Transition

For frontend nodes, the phantom preview in the context panel updates as the build progresses. The wireframe login page gains real form fields. The placeholder dashboard gets actual data table components. The user sees their application becoming real, component by component.

When the node build completes, the preview is the actual running application for that node. The wireframe has fully dissolved into working UI.

---

# 8. Debugging: The Architecture as Diagnostic Tool

## 8.1 Visual Error Tracing

When something breaks, the architecture shows it. A red node means the node itself has an issue. A red connection means data isn't flowing correctly between two nodes.

The user doesn't read stack traces. They look at the canvas and see: the connection between Auth and API is red. They click it. A plain-English explanation appears: "The auth middleware exports a function called `verifyToken` but the API is trying to import `authenticateUser`. The function name doesn't match."

For Tier 1 users who can't read code, this is the only way they would ever be able to debug their own application. For developers, it's faster than reading logs.

## 8.2 Data Flow Tracing

The user can select a data flow path and "trace" it visually. Click the login button on the frontend preview → the canvas highlights the path: Frontend-Login → Auth → Database → Auth → API → Frontend-Dashboard. Each connection along the path lights up in sequence, showing the data flow. If the trace fails at any point, the failing connection turns red and the explanation appears.

## 8.3 Health Monitoring (Post-Deployment)

After deployment, the architecture view includes real-time health indicators. Each node shows its service status. A node that's returning errors turns yellow or red. A connection that's timing out shows a warning. The user sees their system's health at the architectural level — not in a separate monitoring dashboard.

---

# 9. Evolution: Change Impact Visualization

## 9.1 Revise Mode

When the user clicks "Revise" on a completed node, the canvas enters revise mode. The spec card opens in the context panel, editable. As the user makes changes to the spec, the canvas immediately shows the ripple effect:

- Nodes directly connected to the revised node highlight in orange
- The tooltip on each orange node explains why: "Interface changed — this node receives JWT from Auth, which is being modified"
- Nodes indirectly affected (two hops away) highlight in light yellow
- Unaffected nodes dim slightly

The user sees the blast radius of their change before they commit to it. "If I add a phone field to the User model, these six nodes need to update." They can then confirm the change and the system propagates it, or cancel and the highlights dissolve.

## 9.2 Change Propagation Animation

When the user confirms a revise, the canvas shows the propagation in real time. The revised node rebuilds (amber pulse). When it completes, the first ring of affected nodes start rebuilding. Then the second ring. The user watches the change ripple outward through the architecture like a wave. Each node that successfully updates turns green. Any node that fails turns red.

This is the change propagation test made visual. It's also the most compelling demo moment for the product — a thirty-second screen recording of a change rippling through an architecture is worth more than any landing page copy.

---

# 10. The Three Tiers as Zoom Depth

The progressive complexity model is not a mode switch. It's how far the user zooms in.

**Tier 1 (Blueprint):** The user sees nodes, connections, phantom previews, and chat. Code is invisible. Building happens behind the scenes. The user interacts entirely through conversation and clicking. This is the full-screen canvas experience.

**Tier 2 (X-Ray):** The user zooms into a node and sees the code alongside the spec. Anchor comments are highlighted: "this function implements AC3." The user can read and understand the code with AI explanations on hover. They can't edit, but they can see.

**Tier 3 (Full Control):** The user toggles edit mode on a node's code view. Monaco becomes fully editable. A terminal panel appears at the bottom of the node's detail view (scoped to that node's directory). Changes are tracked and synced back to the architecture. This is the developer experience — full code access without losing architectural context.

The transition between tiers is invisible. There's no "switch to developer mode" button. The user simply zooms deeper. A Tier 1 user who has never seen code can tap "X-Ray" on any node out of curiosity and start learning. A Tier 3 developer can zoom out to the architecture view at any time and see how their code edit fits into the larger system.

---

# 11. Frontend ↔ Backend Architecture

## 11.1 System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     ForgePlan Workstation                         │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   Frontend (React)                          │  │
│  │                                                             │  │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │  │
│  │  │  React Flow │  │   Monaco   │  │   Context Panel     │  │  │
│  │  │  Canvas     │  │   Editor   │  │  (Spec / Review /   │  │  │
│  │  │             │  │  (embed)   │  │   Code / History)   │  │  │
│  │  └──────┬──────┘  └──────┬─────┘  └──────────┬──────────┘  │  │
│  │         │                │                    │              │  │
│  │  ┌──────┴────────────────┴────────────────────┴───────────┐ │  │
│  │  │              State Manager (Zustand)                     │ │  │
│  │  │  Canvas state · panel mode · active node · zoom level   │ │  │
│  │  │  breadcrumb path · preview data · build progress        │ │  │
│  │  └──────────────────────┬──────────────────────────────────┘ │  │
│  └─────────────────────────┼────────────────────────────────────┘  │
│                            │                                       │
│                     Tauri IPC Bridge                                │
│                    (commands + events)                              │
│                            │                                       │
│  ┌─────────────────────────┼────────────────────────────────────┐  │
│  │               Backend (Rust / Tauri)                          │  │
│  │                         │                                     │  │
│  │  ┌─────────────────────┴──────────────────────────────────┐  │  │
│  │  │               ForgePlan Core Engine                      │  │  │
│  │  │                                                          │  │  │
│  │  │  Manifest Parser  ·  Spec Validator  ·  Dependency Graph │  │  │
│  │  │  Sweep Orchestrator  ·  State Manager  ·  File Watcher   │  │  │
│  │  │  Cross-Model Bridge (MCP / CLI / API)                    │  │  │
│  │  │                                                          │  │  │
│  │  │  ┌────────────────────────────────────────────────────┐  │  │  │
│  │  │  │             Provider Interface                      │  │  │  │
│  │  │  │  buildNode()  ·  reviewNode()  ·  sweepCodebase()   │  │  │  │
│  │  │  └──────┬──────────────┬──────────────┬───────────────┘  │  │  │
│  │  └─────────┼──────────────┼──────────────┼──────────────────┘  │  │
│  │            │              │              │                      │  │
│  │  ┌─────────┴───┐  ┌──────┴──────┐  ┌───┴──────────┐          │  │
│  │  │   Claude    │  │   OpenAI    │  │    Google    │          │  │
│  │  │   Provider  │  │   Provider  │  │   Provider   │          │  │
│  │  │  Sonnet/Opus│  │  GPT/Codex  │  │   Gemini     │          │  │
│  │  └─────────────┘  └─────────────┘  └──────────────┘          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │               .forgeplan/ Directory (filesystem)               │  │
│  │  manifest.yaml · config.yaml · state.json                     │  │
│  │  specs/ · conversations/ · reviews/ · sweeps/                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## 11.2 Data Flow

**The .forgeplan/ directory is the single source of truth.** Both the frontend and backend read from it. The backend writes to it. The frontend never writes directly to the filesystem — all mutations go through the backend via Tauri IPC commands.

**Frontend → Backend (user actions):**
- User clicks "Build" on a node → `invoke('build_node', { nodeId: 'auth' })`
- User edits a spec field → `invoke('update_spec', { nodeId: 'auth', field: 'acceptance_criteria', value: '...' })`
- User starts discovery conversation → `invoke('send_discovery_message', { message: '...' })`
- User clicks "Deep Build" → `invoke('deep_build', {})`

**Backend → Frontend (state updates):**
- Build progress → `emit('node_status_changed', { nodeId: 'auth', status: 'building', progress: 0.6 })`
- Manifest changed → `emit('manifest_updated', { manifest: {...} })`
- Sweep finding → `emit('sweep_finding', { finding: {...} })`
- Discovery response → `emit('discovery_response', { message: '...', manifest_delta: {...} })`

**File watcher:** The backend runs a file watcher on the `.forgeplan/` directory. Any change to manifest.yaml, state.json, or any spec/review file triggers a re-read and emits the appropriate event to the frontend. This means if the user also has the CLI plugin running in a separate terminal (editing the same `.forgeplan/` directory), the visual app stays in sync.

## 11.3 State Management (Frontend)

Zustand (lightweight, no boilerplate) manages frontend state:

```
CanvasStore:
  nodes: Node[]              // React Flow nodes derived from manifest
  edges: Edge[]              // React Flow edges derived from connections
  zoomLevel: number          // Current zoom depth (1-4)
  breadcrumbPath: string[]   // ["Project", "Frontend", "Dashboard"]
  selectedNodeId: string?    // Currently selected node
  panelMode: string?         // "spec" | "build" | "review" | "code" | "history" | "sweep"

BuildStore:
  activeBuilds: Map<nodeId, BuildProgress>  // Live build tracking
  sweepState: SweepState?                    // Active sweep/deep-build progress

DiscoveryStore:
  messages: Message[]        // Chat history
  isActive: boolean          // Whether discovery conversation is in progress

PreviewStore:
  previews: Map<nodeId, PreviewData>  // Phantom preview components
```

The stores subscribe to Tauri events. When the backend emits `manifest_updated`, the CanvasStore transforms the manifest into React Flow nodes and edges. The canvas re-renders. The user sees the change.

## 11.4 The Core Engine is Headless

The ForgePlan Core Engine has zero knowledge of the frontend. It reads and writes `.forgeplan/` files. It calls model providers through the Provider Interface. It orchestrates builds, reviews, and sweeps. It could run as a CLI tool, a server, or embedded in a desktop app — it doesn't care.

This separation is what makes the system model-agnostic AND interface-agnostic. The Claude Code plugin is one interface to the core engine. The Tauri workstation is another. A future web app could be a third. The core engine and the `.forgeplan/` directory are the product. Everything else is a view.

---

# 12. Key User Journeys

## 12.1 First Launch: "I Have an Idea"

1. User opens ForgePlan. Clean canvas. Three options: **"Describe Your Idea"**, **"Start from Template"**, or **"Import Existing Project."**
2. User clicks "Describe Your Idea." Chat panel slides up from the bottom.
3. User types: "I want a portal where clients upload tax documents and accountants review them."
4. The Interviewer agent responds with a single focused question. Canvas remains empty — no premature nodes. The Interviewer detects ambiguity: "Will accountants only see their assigned clients, or all clients?"
5. After 3-4 questions, the Architect assesses complexity: **"MEDIUM tier — role-based access, file uploads, two user types. 4 sweep agents, sequential build."** The tier badge appears on the canvas.
6. The first nodes materialize on the canvas with smooth animation. Phantom previews show wireframe mockups of each portal.
7. More questions, more nodes. Auth appears. Database appears. File Storage appears. Connections draw themselves between nodes.
8. After 5-7 minutes, the canvas shows a complete 7-node architecture. **Design Review gate activates** — the review panel's 4 agents analyze the architecture. Findings appear in the context panel. A minor suggestion from the Structuralist: "Consider merging file-storage into the API node for a MEDIUM project." The user agrees or dismisses. Gate passes.
9. The Researcher runs automatically — vetting Supabase, React, Tailwind. Research results appear in the Research tab.
10. The Architect produces an implementation plan. **Plan Review gate activates** — the review panel reviews the plan. Gate passes.
11. The user sees: "Your blueprint is designed, researched, and reviewed. Ready to build?" One confirmation. The greenfield pipeline takes over.

## 12.1b First Launch: "I Have an Existing Project"

1. User clicks "Import Existing Project." A file dialog opens.
2. User selects their project directory. The Translator agent scans the codebase.
3. Nodes materialize on the canvas representing the existing code structure — the user sees their application as an architecture for the first time. Descriptive specs appear in the context panel showing what the Translator found.
4. `validate-ingest.js` runs ground-truth validation. The double review gate checks the Translator's analysis. Mismatches are flagged.
5. The semantic wiki populates with knowledge extracted from the existing codebase.
6. The user now has governance over their existing project. They can run sweeps, reviews, and revisions using the full ForgePlan pipeline.

## 12.2 Build: "Make It Real" (Greenfield Pipeline)

1. User confirmed the architecture at the end of discovery. The greenfield pipeline runs autonomously.
2. The dependency graph determines the order. Database node starts pulsing amber.
3. As the database builds, a progress bar fills. Skills are loaded for this node type. Files appear in the detail view.
4. Database build completes. Verification runs: ✓ compiles, ✓ tests pass. Node goes green. Auth starts pulsing. The dependency arrow from Database to Auth glows briefly.
5. The user clicks Auth while it's building. The context panel shows the live build log with the spec card side by side.
6. Auth completes. Verification passes. API starts. Frontend nodes start after API.
7. For frontend nodes, the phantom preview updates in real time. Wireframe login form gains real input fields. Placeholder dashboard gets actual components. A design pass checks for AI-slop patterns. The user can optionally steer: "make it darker" or "use a sidebar layout."
8. All nodes green. Integration check runs — connections flash as they're verified. All green. Runtime verification (Phase B) starts the app and verifies endpoints respond correctly.
9. **Code Review gate** — the review panel's 4 agents audit each node against its spec. Per-agent findings appear in the Review tab. The Adversary found a missing CSRF check. Auto-fixed.
10. Sweep begins. 4 agents (MEDIUM tier) audit the full codebase in parallel. Finding counters appear on affected nodes. Progressive convergence: agents that return clean twice are retired. Typical: 1-2 passes.
11. Cross-model verification (optional for MEDIUM). Codex cross-checks Claude's fixes and does a fresh sweep.
12. Two consecutive clean passes. **Certified.** Canvas shows all green nodes, all green connections, a certification badge. The app is built, verified, reviewed, swept, and certified.

## 12.3 Evolve: "Add a Feature"

1. User has a fully built client portal. All nodes green.
2. User clicks the Database node, opens spec, types: "Add document versioning — each upload should keep previous versions."
3. The canvas immediately shows the blast radius (via `blast-radius.js`): Database node turns orange (direct change). API node turns orange (needs new version endpoints). Frontend-Client node turns yellow (needs version selector in the UI). File Storage turns yellow (needs to store multiple versions per document). The tooltip on each affected node explains why.
4. The tier system checks: "This changes complexity. Current tier: MEDIUM. Reassess?" The user confirms — still MEDIUM.
5. User confirms the change. Database rebuilds. API rebuilds. The changes ripple outward with the propagation animation. Frontend components update. Each rebuilt node goes through verification.
6. Incremental sweep runs — only modified files are re-swept (unchanged nodes use cached review reports). Catches a type mismatch in the document list component. Auto-fixed via batched fix context.
7. All green again. Versioning is live. Total time: ten minutes. Token cost: ~10% of a full deep-build because the incremental engine only rebuilt and re-swept what changed.

## 12.4 Debug: "Something's Broken"

1. User sees a red connection between API and Frontend-Dashboard.
2. They click the connection. Context panel shows: "The Dashboard calls GET /api/documents but the API returns documents nested under `{ data: { documents: [...] } }`. The Dashboard is trying to read the response as a flat array."
3. User clicks "Fix." The Builder agent adjusts the frontend component to destructure correctly. Connection turns green.
4. Alternatively, user clicks "See Details" and the panel shows both sides — the API response shape and the frontend destructuring code — side by side, with the Contractualist's analysis of the interface mismatch. Even a non-developer can see the problem.

---

# 13. Visual Design Language

## 13.1 Color Palette

The workstation should feel calm, professional, and focused. Not dark-mode-by-default like every dev tool. Not pastel-candy like every vibecoding tool.

- **Canvas background:** Near-white (#FAFBFC) with a subtle dot grid, or a soft dark (#1A1B1E) for dark mode. User choice.
- **Node fills:** Muted, desaturated tones by type category. Not vivid. The status indicators (green/amber/red) provide the vibrancy.
- **Text:** Dark gray (#1F2937) on light, light gray (#E5E7EB) on dark. High contrast for readability.
- **Accent:** A single strong accent color for interactive elements, CTAs, and active states. Something that reads as "this is ForgePlan" without being garish.
- **Status colors:** Green (#22C55E) for complete/healthy. Amber (#F59E0B) for in-progress. Red (#EF4444) for failed/broken. Blue (#3B82F6) for sweep/analysis. These are universal and unsurprising.

## 13.2 Typography

- **Node names:** Semi-bold, clean sans-serif. Readable at multiple zoom levels.
- **Spec cards:** Comfortable reading font. Generous line height. The user will spend time reading specs — it should feel like a well-designed document, not a cramped tooltip.
- **Code:** Monospace, obviously. But embedded within the architecture view, not in a separate IDE pane.
- **Chat:** Conversational weight. Slightly lighter than spec cards. Should feel like a comfortable dialogue.

## 13.3 Animation Principles

- **Purposeful, not decorative.** Every animation communicates state: a node is building (pulse), a change is propagating (ripple), a connection is healthy (subtle flow).
- **Slow and calm.** Pulse animations are 2-3 second cycles. Transitions between zoom levels are 300-500ms. Nothing flashes. Nothing bounces. The user should feel like they're watching a system work, not a UI perform.
- **Spatial consistency.** Zooming in feels like moving closer. Zooming out feels like stepping back. Nodes that are children are spatially inside their parents. The canvas has physical metaphor consistency.

---

# 14. What This Is Not

This is not VS Code with a graph panel. The graph IS the application. The code editor is a detail view inside the graph.

This is not Figma with code generation. The architecture is executable, not decorative. Nodes have enforcement hooks, acceptance criteria, and cross-model review. This isn't a drawing tool.

This is not Lovable with a plan view. Lovable generates an entire app from a prompt with no architecture. ForgePlan builds an architecture first, then generates code inside it node by node with governance at every step.

This is not Miro or Excalidraw with AI. Those are static diagramming tools. The ForgePlan canvas is a live, reactive, stateful representation of a running build system. Nodes have status. Connections have health. The architecture is not documentation — it is the operating system of the build.

This is not an IDE. IDEs organize around files. ForgePlan organizes around architecture. The user thinks in systems and connections, not directories and imports.

**This is a visual architecture workstation.** The first tool where the blueprint is the interface, the constraint system, the navigation, the debugger, and the knowledge graph — all at once.

---

# 15. Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| Desktop Shell | Tauri 2.0 (Rust backend) | Under 5 MB binary, 30-60 MB RAM. Cross-platform. Native performance for file watching and manifest parsing. |
| Architecture Canvas | React Flow (xyflow) | MIT-licensed. Battle-tested. Custom node components. Built-in pan/zoom/layout. |
| Code Editor | Monaco Editor | VS Code engine. Syntax highlighting, intellisense. Embeds within React components. |
| Frontend Framework | React + Tailwind CSS | Largest ecosystem, best component libraries, best AI code generation support. |
| State Management | Zustand | Lightweight, no boilerplate, TypeScript-native. Perfect for canvas + panel state coordination. |
| IPC Layer | Tauri Commands + Events | Type-safe Rust ↔ JavaScript bridge. Commands for actions, events for state updates. |
| File Watching | notify (Rust crate) | Native filesystem events. Detects `.forgeplan/` changes from CLI or other tools. |
| Preview Sandboxing | iframe with srcdoc | Isolates generated preview components from the main app. Safe rendering of AI-generated code. |
| Layout Algorithm | dagre or elk.js | Automatic graph layout for node positioning. Hierarchical layout matches dependency structure. |

---

# 16. Relationship to Other Documents

| Document | What It Defines | Relationship |
|---|---|---|
| **Concept Document v4.1** | The complete product vision — all 23 sections from paradigm to marketplace | This design doc implements Sections 3 (Architecture-First Paradigm), 4 (Progressive Complexity), 9 (Hierarchical Zoom), 11 (Error Recovery), and 15-16 (Form Factor, Tech Stack) |
| **Core Execution Plan** | The plugin build spec — 6 sprints, 14 weeks | This design doc is the Phase 2 build target. The plugin proves the methodology. This workstation makes the methodology visual and accessible. |
| **Sprint 6 Implementation Plan** | The autonomous sweep system — 14 tasks | The sweep visualization (nodes pulsing blue, finding counters, cross-model verification indicators) in this design doc renders the Sprint 6 infrastructure visually. |

The `.forgeplan/` directory is the bridge. The plugin creates it. The workstation renders it. Both read and write the same files. A user can start with the CLI plugin and open the workstation to see their architecture visualized for the first time — with no migration required.

---

**Architecture down. Code forward. Governance always.**

**END OF DOCUMENT**
