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

## 1.1 The First Ten Minutes Rule

**This is the most important design principle in the entire product.**

The first ten minutes must be astonishingly clean. The user describes an idea. A few questions. Nodes appear. A preview appears. Architecture approved. Build starts. The user immediately feels "I get this." If that works, the rest of the system becomes believable. If it doesn't, no amount of review panels or sweep agents will save it.

Everything in this document — the review panel with five agents and three lens variants, the eight context panel tabs, the phased build visualization, the sweep agent attribution, the confidence scores, the wiki, the research results — is real capability that exists in the backend. **None of it appears in the first ten minutes.** The user's first experience is a blank canvas, a chat panel, and nodes materializing as they talk. That's it.

## 1.2 Progressive Disclosure: Complexity Reveals Itself When Relevant

ForgePlan has enormous depth. 21 commands, 16+ agents, 6 hook types, 32 skills, phased builds, cross-model verification, semantic memory, blast radius analysis. Showing all of this upfront would be overwhelming and incomprehensible. Hiding it permanently would waste the product's power.

The solution is progressive disclosure — the same principle already built into the skill registry (Sprint 11). The frontend applies it to every visual element:

**What's visible from the start:**
- The canvas (full screen, clean, inviting)
- The chat panel (during discovery)
- Nodes as they materialize
- Phantom previews alongside frontend nodes
- Breadcrumbs for navigation

**What appears when it becomes relevant:**
- The context panel → slides in when the user clicks a node
- The review gate bar → appears only when a review gate activates
- Sweep indicators → appear only when sweep is running
- Phase badges → appear only on LARGE projects with multiple phases
- Build log → appears only when a node is building and the user clicks it
- Verification checkmarks → appear only during the verification step

**What's available on demand but never forced:**
- The code view → user zooms into a node and toggles X-Ray
- The wiki tab → appears in the context panel only after wiki content exists
- The research tab → appears only after research has been run
- Review agent attribution → findings are summarized by default; expand to see which agent found what
- Confidence scores → internal to the engine; the user sees findings, not numbers
- Sweep agent names → the user sees "3 findings fixed" not "Adversary found 1, Contractualist found 2"

**What power users discover over weeks:**
- Terminal access inside node detail view (Tier 3 zoom depth)
- Cross-model configuration
- Complexity tier override
- Skill management
- Manual sweep triggering with specific agent selection

## 1.3 What the User Never Sees by Default

- A file tree or file browser
- A tab bar with open files
- A terminal window
- A sidebar full of icons
- A status bar with git branch info
- Agent names or agent counts
- Token usage or model indicators
- Confidence scores
- Phase numbers (unless the project has phases)
- Review lens labels (Design/Plan/Code — the system switches automatically)

## 1.4 What the User Always Sees

- The architecture canvas — their entire application as a visual knowledge graph
- Breadcrumbs — where they are in the conceptual hierarchy
- Node status colors — instant understanding of what's done, what's in progress, what's broken

The principle: every pixel on screen answers the question "how does my application work?" not "what files does my application have?" And the corollary: **every pixel earns its place by being relevant right now, not by being available just in case.**

---

# 2. Visibility Matrix — What Appears When

This matrix is the enforceable contract for progressive disclosure. Every UI element in the product has exactly one visibility tier. If a designer or engineer wants to add something to a tier earlier than listed here, they need a reason strong enough to justify adding visual weight to a simpler experience. The default answer is "show it later."

## Tier 0: First 30 Seconds (App Launch)

The user opens ForgePlan for the first time. They should feel calm and invited, not overwhelmed.

| Visible | Not Visible |
|---|---|
| Clean canvas (full viewport, subtle dot grid) | Any panel, sidebar, toolbar, or chrome |
| Three launch options: "Describe Your Idea" / "Start from Template" / "Import Existing Project" | Settings, configuration, model selection |
| ForgePlan logo (minimal, corner) | Agent names, command lists, status indicators |
| | Breadcrumbs (nothing to navigate yet) |
| | Any mention of AI, models, tokens, or technical infrastructure |

**The feeling:** "This is simple. I know what to do."

## Tier 1: First 5 Minutes (Discovery Conversation)

The user has clicked "Describe Your Idea." They're talking to the system and watching their architecture take shape.

| Appears Now | Still Hidden |
|---|---|
| Chat panel (bottom of canvas, conversational) | Context panel (nothing selected yet) |
| Nodes materializing with smooth animation | Node detail tabs (Spec, Code, Review, etc.) |
| Connections drawing themselves between nodes | Review gate indicators |
| Phantom preview mockups for frontend nodes | Agent names or agent counts |
| Node names and type-color tinting | Complexity tier details (badge appears, details don't) |
| Complexity tier badge (e.g., "MEDIUM") | Sweep indicators, findings, certification |
| | Build progress indicators |
| | Phase badges or phase dividers |
| | Terminal, code editor, file lists |

**The feeling:** "I'm describing my idea and watching it become a blueprint. I understand every piece because I watched it appear."

## Tier 2: Architecture Approval + Build Start (Minutes 5-10)

The user has confirmed the architecture. Research and review gates run. Build begins.

| Appears Now | Still Hidden |
|---|---|
| Thin review progress bar ("Reviewing..." → green → dissolve) | Review agent names or counts |
| "Ready to build" confirmation prompt | Review findings (unless CRITICALs exist) |
| Build status on nodes (amber pulse = building, green = complete) | Build log details (available on click, not shown by default) |
| Overall progress indicator ("3 of 7 nodes complete") | Verification step details (compile, test, server) |
| Phantom-to-live preview transition on frontend nodes | Sweep indicators (sweep hasn't started yet) |
| | Skills loaded per node |
| | Anchor comment annotations |
| | Wiki, research, conversation history tabs |

**The feeling:** "My app is being built. I can see it happening. I trust the process."

## Tier 3: First Complete Build (Minutes 10-30)

All nodes are green. Review and sweep have run. The project is certified.

| Appears Now | Still Hidden |
|---|---|
| Certification badge ("✓ Certified — ready to ship") | Per-agent attribution of findings |
| Context panel (slides in when user clicks a node) | Confidence scores |
| Spec tab (acceptance criteria, constraints) | Cross-model verification details |
| Review tab (findings as plain-language list, severity colors) | Sweep pass counts |
| Code tab (Monaco with anchor comment highlights) | Token usage or model indicators |
| Connection health indicators (green/yellow/red) | Phase advancement controls |
| Node click → right panel with relevant tabs only | Worktree parallelism details |
| | Skill registry |
| | Manual sweep/review commands |

**The feeling:** "It's done. I can explore what was built. The review found things and fixed them. I can see the code if I want."

## Tier 4: First Revise / Evolve (Day 1-2)

The user wants to change something. This is where the architecture-first paradigm proves its value.

| Appears Now | Still Hidden |
|---|---|
| Blast radius visualization (orange = direct, yellow = indirect, dim = unaffected) | Blast radius script details |
| Tooltip on affected nodes explaining why they're affected | Incremental engine internals |
| "Propagate Changes" confirmation | Review cache behavior |
| Change ripple animation (nodes rebuilding in dependency order) | Token cost comparison |
| Incremental progress ("Rebuilding 3 of 7 nodes — 4 unchanged") | |
| Sweep findings on modified nodes only | |
| Wiki tab (now has content from the first build) | |

**The feeling:** "I changed one thing and the system showed me exactly what it affected, fixed everything automatically, and only rebuilt what needed rebuilding."

## Tier 5: Power User (Week 2+)

The user has built multiple projects. They understand the system and want more control.

| Discoverable Now | Still Internal |
|---|---|
| Review agent attribution (expand a finding to see which agent found it) | Token counts per operation |
| Sweep agent names in sweep findings detail | Internal state.json structure |
| Complexity tier override in settings | Hook firing sequence |
| Cross-model configuration (which model reviews, which builds) | Middleware pipeline details |
| Manual sweep trigger with agent selection | Provider Interface internals |
| Research tab (package vetting, license checks) | Calibration data per model |
| Conversation History tab | Context compaction mechanics |
| Phased build controls (for LARGE projects) | Bounce counter values |
| `/forgeplan:split` for node decomposition | |
| Settings panel (model assignments, API keys, tier override) | |

**The feeling:** "I understand how the system works and I can tune it. I know which agents catch which issues. I can configure the models for my workflow."

## Tier 6: Developer / Advanced (Intentionally Accessed)

The user explicitly wants developer-level access. Nothing at this tier appears unless toggled.

| Available on Toggle | Never Shown in UI |
|---|---|
| Terminal panel scoped to active node (Tier 3 zoom depth) | Raw API responses |
| Monaco in edit mode (not just read-only) | Internal prompt assembly |
| Full build log with tool call details | Middleware allow/deny decisions |
| Skill registry management (`/forgeplan:skill`) | PreCompact/PostCompact internals |
| Manual command execution | Agent prompt text |
| Raw sweep/review reports (markdown files in `.forgeplan/`) | State schema details |
| Git integration (commit history, worktree status) | |
| Manifest YAML editor | |

**The feeling:** "I'm a developer using a power tool. I have full access to everything, but the architecture view is still my primary navigation."

## Enforcement Rules

1. **No element may appear at a tier earlier than listed** without explicit product decision and documented justification.
2. **Every new feature must be assigned a visibility tier** before implementation. "Where does this appear in the matrix?" is a required design review question.
3. **When in doubt, defer to a later tier.** It's always easier to make something visible earlier than to hide something users already expect.
4. **Tier 0-2 must be tested with non-technical users.** If someone who has never coded cannot complete Tier 0-2 without confusion, the design has failed.
5. **Tier 5-6 features must not leak into Tier 0-3 experiences.** A power-user setting panel must never flash on screen during first launch. An agent name must never appear in a review finding title.
6. **The canvas is the constant.** At every tier, the canvas is the primary interface. Panels, indicators, and controls are additive layers on the canvas, never replacements for it.

---

# 3. The Canvas: The Entire Application at a Glance

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

# 4. Hierarchical Zoom: The Conceptual Telescope

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

# 5. The Context Panel: Everything About What You're Looking At

## 4.1 Panel Behavior

The context panel slides in from the right side of the canvas when the user selects a node, connection, or other canvas element. It takes up approximately 35-40% of the screen width. The canvas compresses to accommodate it — the architecture remains visible but narrower.

**When nothing is selected, the panel is hidden. The canvas gets the full viewport.** This is the default state. The user is never greeted by an empty panel waiting to be filled. The panel earns its screen space by having something relevant to show.

## 4.2 Panel Modes — Tabs Appear When They Have Content

The context panel shows tabs based on what's relevant to this node at this moment. **Not all tabs exist at all times.** A node that's just been specced shows only Spec. A node that's been built and reviewed shows Spec, Build, Review, and Code. The wiki tab only exists after there's wiki content. The research tab only exists after research has run. The sweep tab only exists after the node has been swept.

The default tab is determined by the node's current state — the system shows what the user most likely needs right now, not what's most impressive:

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
The review report shows findings, not agents. The user sees a clean list: 3 issues found, 2 resolved, 1 needs attention. Each finding has a severity color (CRITICAL = red, IMPORTANT = amber, SUGGESTION = blue) and a one-line summary in plain language.

The five review panel agents (Adversary, Contractualist, Pathfinder, Structuralist, Skeptic) are the engine behind the findings — but the user doesn't see agent names by default. They see: "Security issue: input validation missing on file upload" and "Interface mismatch: API returns wrapped object but frontend expects flat array." The finding IS the value. Which agent found it is implementation detail.

**On expand:** Clicking a finding reveals the full detail — code evidence, file paths, the specific spec criterion it relates to, and (at the bottom, subdued) which review agent identified it. Power users who want to understand the review methodology can see this. New users never need to.

**Review gate status** is shown as a simple bar at the top: APPROVED (green) or CHANGES REQUESTED (amber) with a count. Not "Adversary: PASS, Contractualist: 2 findings, Pathfinder: PASS, Structuralist: 1 suggestion, Skeptic: PASS." That's internal data, not user-facing information.

**Code View (available for any built node):**
Monaco editor showing the node's generated code. Anchor comments are highlighted — `@forgeplan-spec: AC1` gets a colored sidebar annotation linking it to the acceptance criterion. Read-only by default. Tier 3 users can toggle to edit mode. Connected to the shared LSP instance for code intelligence (go-to-definition, find references, diagnostics).

**Conversation History (available for any node):**
The full design rationale: why this node was created, what alternatives were considered, what decisions were made during discovery, what the user said that led to this architecture.

**Wiki (available project-wide and per-node):**
The semantic memory wiki — accumulated architectural knowledge that grows with each build, research session, and review cycle. Project-level wiki shows conventions, patterns, and design principles that apply everywhere. Node-level wiki shows specific knowledge about that node: why this approach was chosen, what the research found, what past sweeps caught. This is the institutional knowledge layer — richer and more structured than raw conversation logs.

**Sweep Findings (available after sweep):**
Same philosophy as review: findings, not agents. The user sees "8 issues found, 6 auto-fixed, 2 need attention" — not "Adversary found 2, Contractualist found 3, Skeptic found 3." Each finding is a plain-language description with severity and resolution status. Expandable for full detail including source agent and confidence score — but collapsed by default.

**Research (available after research phase):**
Package research results, license checks, architecture patterns, and prior art findings from the Researcher agent. Shows which packages were vetted, which were rejected and why, and the recommended patterns.

## 4.3 Panel Navigation

Tabs appear across the top of the panel — **but only tabs that have content.** The full set is: **Spec | Build | Review | Code | Wiki | History | Sweep | Research**

A user will never see all eight tabs at once unless they're looking at a fully built, reviewed, swept node on a project that has wiki content and research results. In practice:

- A freshly specced node: **Spec**
- A node currently building: **Spec | Build** (Build active, streaming)
- A completed node on a simple project: **Spec | Review | Code**
- A fully swept node on a mature project: **Spec | Review | Code | Wiki | Sweep**

The active tab defaults to whatever the user most likely needs right now. Building → Build tab. Just reviewed → Review tab. The system anticipates; the user just clicks a node and sees the right thing.

---

# 6. Phantom Previews: The Dopamine Layer

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

# 7. The Design Pipeline: Three Stages on the Canvas

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

After discovery completes, a brief review runs. The canvas shows this minimally — a thin progress bar across the top: **"Reviewing architecture..."** with a subtle animation. Not "5 agents analyzing your architecture" — the user doesn't need to know how many agents are working. They need to know the review is happening and when it's done.

If the review passes clean (no CRITICALs, no IMPORTANTs), the progress bar turns green and dissolves. The user might barely notice it happened. That's fine — seamless quality assurance is better than theatrical quality assurance.

If the review finds something, the bar stays and a finding card appears in the context panel: "Consider: the Architect suggested merging file-storage into the API for a project this size. Accept or keep separate?" The user makes one decision. Gate passes. The canvas transitions to the next stage.

CRITICALs are rare at the design stage but they halt the pipeline clearly: the bar turns red, the finding is prominent, and the user must resolve it before proceeding. No ambiguity about what's blocked or why.

## 6.3 Stage 2: Research + Planning

After design approval, the Researcher agent runs automatically — vetting packages, checking licenses, finding architecture patterns. Research results appear in the context panel's Research tab. The canvas doesn't change during research (no new nodes), but a subtle indicator shows research is in progress.

The Architect then enters Planner mode, producing an implementation plan. This is visible in the context panel as a structured plan document.

## 6.4 Review Gate 2: Plan Review

Same visual treatment as Gate 1 — a thin progress bar, brief review, green and dissolve if clean. The user experiences the review gates as quality checkpoints that the system handles, not as ceremonial pauses that demand attention. The gates exist to catch problems early. When there are no problems, they're nearly invisible.

## 6.5 Stage 3: Build + Code Review

This is the build experience described in Section 8. After the plan review gate passes, building begins. Reviews and sweeps run automatically after builds. The user doesn't need to know that five agents are reviewing or that the sweep has three phases. They see nodes turning green and a progress indicator that says "building" then "reviewing" then "complete."

The three-stage pipeline gives the canvas three distinct visual moods — not modes, not layouts, moods:
1. **Discovery** — exploratory, conversational, nodes materializing, previews appearing. The canvas feels like a collaborative whiteboard.
2. **Review** — brief, calm, a thin progress bar. The canvas feels like a quality checkpoint that the system handles.
3. **Build** — purposeful, progressive, nodes lighting up in dependency order. The canvas feels like watching construction from above.

The transitions between moods are subtle. The chat panel slides away when build starts. The progress bar appears and dissolves. No mode switches, no page transitions, no "you are now in build mode" announcements. The canvas is always the canvas. The mood shifts because the activity shifted.

---

# 8. Build Experience: Watching the System Come Alive

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

# 9. Debugging: The Architecture as Diagnostic Tool

## 8.1 Visual Error Tracing

When something breaks, the architecture shows it. A red node means the node itself has an issue. A red connection means data isn't flowing correctly between two nodes.

The user doesn't read stack traces. They look at the canvas and see: the connection between Auth and API is red. They click it. A plain-English explanation appears: "The auth middleware exports a function called `verifyToken` but the API is trying to import `authenticateUser`. The function name doesn't match."

For Tier 1 users who can't read code, this is the only way they would ever be able to debug their own application. For developers, it's faster than reading logs.

## 8.2 Data Flow Tracing

The user can select a data flow path and "trace" it visually. Click the login button on the frontend preview → the canvas highlights the path: Frontend-Login → Auth → Database → Auth → API → Frontend-Dashboard. Each connection along the path lights up in sequence, showing the data flow. If the trace fails at any point, the failing connection turns red and the explanation appears.

## 8.3 Health Monitoring (Post-Deployment)

After deployment, the architecture view includes real-time health indicators. Each node shows its service status. A node that's returning errors turns yellow or red. A connection that's timing out shows a warning. The user sees their system's health at the architectural level — not in a separate monitoring dashboard.

---

# 10. Evolution: Change Impact Visualization

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

# 11. The Three Tiers as Zoom Depth

The progressive complexity model is not a mode switch. It's how far the user zooms in.

**Tier 1 (Blueprint):** The user sees nodes, connections, phantom previews, and chat. Code is invisible. Building happens behind the scenes. The user interacts entirely through conversation and clicking. This is the full-screen canvas experience.

**Tier 2 (X-Ray):** The user zooms into a node and sees the code alongside the spec. Anchor comments are highlighted: "this function implements AC3." The user can read and understand the code with AI explanations on hover. They can't edit, but they can see.

**Tier 3 (Full Control):** The user toggles edit mode on a node's code view. Monaco becomes fully editable. A terminal panel appears at the bottom of the node's detail view (scoped to that node's directory). Changes are tracked and synced back to the architecture. This is the developer experience — full code access without losing architectural context.

The transition between tiers is invisible. There's no "switch to developer mode" button. The user simply zooms deeper. A Tier 1 user who has never seen code can tap "X-Ray" on any node out of curiosity and start learning. A Tier 3 developer can zoom out to the architecture view at any time and see how their code edit fits into the larger system.

---

# 12. Frontend ↔ Backend Architecture

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
│                   Electron IPC Bridge                               │
│                    (commands + events)                              │
│                            │                                       │
│  ┌─────────────────────────┼────────────────────────────────────┐  │
│  │               Backend (Node.js / Electron)                    │  │
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

**The .forgeplan/ directory is the single source of truth.** Both the frontend and backend read from it. The backend writes to it. The frontend never writes directly to the filesystem — all mutations go through the backend via Electron IPC.

**Frontend → Backend (user actions):**
- User clicks "Build" on a node → `ipcRenderer.invoke('build_node', { nodeId: 'auth' })`
- User edits a spec field → `ipcRenderer.invoke('update_spec', { nodeId: 'auth', field: 'acceptance_criteria', value: '...' })`
- User starts discovery conversation → `ipcRenderer.invoke('send_discovery_message', { message: '...' })`
- User clicks "Deep Build" → `ipcRenderer.invoke('deep_build', {})`

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

The stores subscribe to Electron IPC events. When the backend emits `manifest_updated`, the CanvasStore transforms the manifest into React Flow nodes and edges. The canvas re-renders. The user sees the change.

## 11.4 The Core Engine is Headless

The ForgePlan Core Engine has zero knowledge of the frontend. It reads and writes `.forgeplan/` files. It calls model providers through the Provider Interface. It orchestrates builds, reviews, and sweeps. It could run as a CLI tool, a server, or embedded in a desktop app — it doesn't care.

This separation is what makes the system model-agnostic AND interface-agnostic. The Claude Code plugin is one interface to the core engine. The Electron workstation is another. A future web app could be a third. The core engine and the `.forgeplan/` directory are the product. Everything else is a view.

---

# 13. Key User Journeys

## 12.1 First Launch: "I Have an Idea"

1. User opens ForgePlan. Clean canvas. Three options: **"Describe Your Idea"**, **"Start from Template"**, or **"Import Existing Project."**
2. User clicks "Describe Your Idea." Chat panel slides up from the bottom. Nothing else on screen.
3. User types: "I want a portal where clients upload tax documents and accountants review them."
4. A focused question comes back. Canvas still empty — no premature nodes. The conversation feels natural, not like a form.
5. After 3-4 questions, the first nodes materialize. Auth. Database. Two frontend views. Connections draw themselves. Phantom previews show wireframe mockups alongside.
6. A few more questions. The architecture is complete. A small badge appears: **"MEDIUM complexity."** The user doesn't need to know what this means yet.
7. "Your blueprint is ready. Look good?" The user scans the canvas — seven nodes, clear connections, preview mockups that match their vision. They confirm.
8. A brief, quiet review runs (thin progress bar, barely noticeable if everything's clean). Research runs in the background. Then: "Ready to build."
9. One tap. Build starts. Nodes light up in order. The user watches their app materialize — or goes to get coffee.

**Total time to "I get this": under five minutes.** The user saw a canvas, talked about their idea, watched nodes appear, confirmed once, and building started. They never saw an agent name, a tier configuration, a review panel, or a sweep indicator. Those exist. They'll discover them later. Right now they feel something no other tool gives them: understanding of what's being built and confidence that it's being built right.

## 12.1b First Launch: "I Have an Existing Project"

1. User clicks "Import Existing Project." A file dialog opens.
2. User selects their project directory. The Translator agent scans the codebase.
3. Nodes materialize on the canvas representing the existing code structure — the user sees their application as an architecture for the first time. Descriptive specs appear in the context panel showing what the Translator found.
4. `validate-ingest.js` runs ground-truth validation. The double review gate checks the Translator's analysis. Mismatches are flagged.
5. The semantic wiki populates with knowledge extracted from the existing codebase.
6. The user now has governance over their existing project. They can run sweeps, reviews, and revisions using the full ForgePlan pipeline.

## 12.2 Build: "Make It Real" (Greenfield Pipeline)

1. User confirmed the architecture. The greenfield pipeline takes over. The chat panel slides away. The canvas has the full viewport now — just nodes and connections.
2. Database node starts pulsing amber. A small label: "Building..."
3. Database completes. A brief checkmark animation. Green. Auth starts.
4. The user can click any building node to see what's happening inside (context panel opens with Build tab). Or they can just watch from the canvas level. Both are fine.
5. Frontend nodes show phantom previews evolving into real UI as they build.
6. A thin progress bar at the top shows overall progress: "4 of 7 nodes complete."
7. All nodes green. A brief "Reviewing..." indicator. Then "Sweeping..." Then just: green. Done.
8. The canvas settles. All nodes solid green. All connections green. A certification badge: **"✓ Certified — ready to ship."**

The user didn't see agent names, confidence scores, lens variants, or sweep pass counts. They saw their idea become a certified application. The machinery was invisible. The result was obvious.

For users who want transparency, everything is available: click any node to see the full review report, sweep findings, verification results, build log, and wiki. But the default experience is: watch it build, see it complete.

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

# 14. Visual Design Language

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

- **Purposeful, not decorative.** Every animation communicates state: a node is building (pulse), a change is propagating (ripple), a connection is healthy (subtle flow). If an animation doesn't answer a question the user has right now, it shouldn't exist.
- **Slow and calm.** Pulse animations are 2-3 second cycles. Transitions between zoom levels are 300-500ms. Nothing flashes. Nothing bounces. The user should feel like they're watching a system work, not a UI perform.
- **Spatial consistency.** Zooming in feels like moving closer. Zooming out feels like stepping back. Nodes that are children are spatially inside their parents. The canvas has physical metaphor consistency.
- **Earn the motion.** The first time a node appears on the canvas — that deserves animation. It's a meaningful moment. The fifteenth node status update during a deep-build — that can be a quiet color change. The more something happens, the less theatrical it should be. Reserve the best animations for the moments that matter: first node appearing, build completing, architecture approved, certification achieved.
- **Never block.** No animation should prevent the user from interacting. Review gates show progress but the user can still pan, zoom, and click nodes. Build animations run but the context panel is still responsive. The UI is never "loading" in a way that locks the user out.

---

# 15. What This Is Not

This is not VS Code with a graph panel. The graph IS the application. The code editor is a detail view inside the graph.

This is not Figma with code generation. The architecture is executable, not decorative. Nodes have enforcement hooks, acceptance criteria, and cross-model review. This isn't a drawing tool.

This is not Lovable with a plan view. Lovable generates an entire app from a prompt with no architecture. ForgePlan builds an architecture first, then generates code inside it node by node with governance at every step.

This is not Miro or Excalidraw with AI. Those are static diagramming tools. The ForgePlan canvas is a live, reactive, stateful representation of a running build system. Nodes have status. Connections have health. The architecture is not documentation — it is the operating system of the build.

This is not an IDE. IDEs organize around files. ForgePlan organizes around architecture. The user thinks in systems and connections, not directories and imports.

**This is not a dashboard for a build system.** The biggest risk for ForgePlan's frontend is becoming a dashboard that displays all 21 commands, 16 agents, 6 hook types, and 32 skills in panels and tabs and indicators. That would be an impressive engineering demo and a terrible product. The user doesn't need to see the machinery. They need to see their application taking shape. The machinery runs behind the canvas, surfacing only the results — findings, status changes, completed nodes — when they're relevant. The moment the UI feels like a control panel, it has failed.

**This is a visual architecture workstation.** The first tool where the blueprint is the interface, the constraint system, the navigation, the debugger, and the knowledge graph — all at once. And from the user's perspective, it's a clean canvas where their idea becomes a certified application through a calm, guided, visual process.

---

# 16. Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| Desktop Shell | Electron (Node.js backend) | Cross-platform. Node.js backend runs all existing ForgePlan scripts natively — no rewrite needed. Direct filesystem access to `.forgeplan/`. Bundles everything in one install, no external daemon. |
| Architecture Canvas | React Flow (xyflow) | MIT-licensed. Battle-tested. Custom node components. Built-in pan/zoom/layout. |
| Code Editor | Monaco Editor | VS Code engine. Syntax highlighting, intellisense. Embeds within React components. |
| Frontend Framework | React + Tailwind CSS | Largest ecosystem, best component libraries, best AI code generation support. |
| State Management | Zustand | Lightweight, no boilerplate, TypeScript-native. Perfect for canvas + panel state coordination. |
| IPC Layer | Electron IPC (ipcMain + ipcRenderer) | Commands for actions (invoke), events for state updates (on). Type-safe with contextBridge. |
| File Watching | chokidar (Node.js) | Battle-tested Node.js filesystem events. Detects `.forgeplan/` changes from CLI or other tools. |
| Preview Sandboxing | iframe with srcdoc | Isolates generated preview components from the main app. Safe rendering of AI-generated code. |
| Layout Algorithm | dagre or elk.js | Automatic graph layout for node positioning. Hierarchical layout matches dependency structure. |
| Model Adapter | Vercel AI SDK | Universal adapter for 50+ providers. Normalizes streaming, tool calling, structured output across Claude, GPT, Gemini, OpenRouter, Ollama, and more. |

---

# 17. Relationship to Other Documents

| Document | What It Defines | Relationship |
|---|---|---|
| **Concept Document v4.1** | The complete product vision — all 23 sections from paradigm to marketplace | This design doc implements Sections 3 (Architecture-First Paradigm), 4 (Progressive Complexity), 9 (Hierarchical Zoom), 11 (Error Recovery), and 15-16 (Form Factor, Tech Stack) |
| **Core Execution Plan** | The plugin build spec — 6 sprints, 14 weeks | This design doc is the Phase 2 build target. The plugin proves the methodology. This workstation makes the methodology visual and accessible. |
| **Sprint 6 Implementation Plan** | The autonomous sweep system — 14 tasks | The sweep visualization (nodes pulsing blue, finding counters, cross-model verification indicators) in this design doc renders the Sprint 6 infrastructure visually. |

The `.forgeplan/` directory is the bridge. The plugin creates it. The workstation renders it. Both read and write the same files. A user can start with the CLI plugin and open the workstation to see their architecture visualized for the first time — with no migration required.

---

# 18. Model & Provider Configuration

## 18.1 The Mental Model

ForgePlan runs on AI models. The user brings their own. The app doesn't bundle a model or require a specific provider — it connects to whatever the user already has or wants to use.

The configuration experience is layered:

- **Default:** One model for everything. Simple. Works for most users.
- **Typical power user:** Two models — a primary for architecture/building/review, a secondary for sweep runs (where parallel agent cost matters). This covers 90% of advanced users.
- **Expert:** Full per-role assignment if desired. Available in Settings, never forced.

## 18.2 Supported Provider Types

| Type | How It Works | Auth | Examples |
|------|-------------|------|---------|
| **CLI Subprocess** | Shell out to installed CLI tool | CLI handles its own login (subscription or API key) | `claude`, `codex`, `gemini` |
| **Direct API** | HTTPS to provider API | API key stored in OS keychain | Anthropic, OpenAI, Google |
| **OpenRouter** | One API key, 100+ models | API key | Any frontier model, always current |
| **Local** | HTTP to localhost | None | Ollama, LM Studio |
| **Self-hosted proxy** | HTTP to user's endpoint | Varies | LiteLLM, Groq, Together AI, Bedrock, Azure |

**API key is always the fallback** for any provider. CLI subprocess is the zero-friction subscription path — the user logs in once to Claude Code / Codex CLI / Gemini CLI and ForgePlan uses their existing session. No separate OAuth flow required; the CLI handles all auth.

Model lists pull **dynamically** from the provider or OpenRouter. Version numbers are never hardcoded in the UI — what's available today is different from what's available in six months.

## 18.3 Quick Setup (First Launch)

On first launch, a one-time setup prompt:

```
Set up your AI provider

Which do you use?
  ☑ Claude          ○ CLI (use my subscription)
                    ○ API key  [sk-ant-...]

  ☑ OpenAI / Codex  ○ CLI (use my subscription)
                    ○ API key  [sk-...]

  ☐ OpenRouter      One key, 100+ models  [sk-or-...]
                    → Recommended if you want to try different models

  ☐ Local model     Ollama / LM Studio  [http://localhost:11434]

  ☐ Other           Custom endpoint, Azure, Bedrock...

  [Continue →]
```

After setup, model selection:

```
Model
  [claude-opus-4-6 ▼]    ← pulls live model list from selected providers

  [ ] Use a separate model for sweep runs  (saves cost on parallel agents)
```

That second checkbox is the "typical power user" path. Most users never touch anything else.

## 18.4 Sweep Model (The Typical Two-Model Setup)

Sweep runs dispatch 3-5 parallel agents simultaneously. This is where model cost concentrates. Users who want to optimize set a dedicated sweep model — typically a faster, less expensive model for parallel analysis work.

```
Sweep model
  [Same as primary ▼]   ← default
  or pick a different model for parallel sweep agents
```

The system never forces this choice. It's one checkbox that unlocks one additional dropdown. The user doesn't need to think about "roles" — they just pick a sweep model if they want to.

## 18.5 Advanced: Full Per-Role Assignment (Power Users)

Available in Settings → Model Configuration → Advanced. Never surfaced to new users.

Roles that can be independently assigned:
- **Architect** (discovery, tier assessment, manifest generation)
- **Builder** (code generation per node)
- **Reviewer** (spec-diff review after each build)
- **Sweep agents** (parallel codebase audit — all sweep agents use the same model)
- **Research** (package vetting, prior art, architecture patterns)

Default for all roles: primary model. Users override only what they want to change.

## 18.6 Phantom Preview Quality

Phantom previews generate wireframe-to-live UI mockups during discovery and building. They are token-intensive for large projects.

```
Phantom Previews  [ON ▼]

Quality:  ● Full     ○ Wireframe only     ○ Off
          (default)  (low cost)           (none)

Generate: ● During discovery (live as nodes appear)
          ○ On demand (click to generate per node)
```

**Default is ON at full quality** — this is the dopamine hit, the product's emotional core. Users who are cost-conscious or on free tiers can reduce quality or switch to on-demand generation. This setting is also a natural monetization lever: full-quality live previews could be a premium feature or credit-consuming feature on lower plans.

## 18.7 Settings Panel Structure

The Settings panel (accessible via gear icon, Tier 5+ in the visibility matrix) is organized:

```
⚙ Settings

Providers
  → Add / configure AI providers
  → Test connection

Model
  → Primary model selector (live list from provider)
  → Sweep model selector
  → [Advanced] Full per-role assignment

Phantom Previews
  → Quality toggle (Full / Wireframe / Off)
  → Generation timing (Live / On demand)

Project
  → Complexity tier override
  → Build phase settings

Advanced
  → CLI paths (claude, codex, gemini executables)
  → Custom endpoints
  → Token budget limits
  → Per-node model overrides
```

Nothing in Settings is required to start a project. Defaults work out of the box for any user with at least one configured provider.

---

# 19. Web Playground — The Acquisition Funnel

## 19.1 Why Lead with the Web

Asking someone to download a 200 MB desktop app from a product they've never heard of is a high-friction ask. Asking them to click a URL and describe their app idea is zero friction.

The web playground is the first ten minutes of ForgePlan running in a browser. Same React Flow canvas. Same chat panel. Same phantom previews. Same node materialization animations. The user describes their idea, watches the architecture build, and walks away convinced. The web playground converts "curious" to "I need this." Builds happen in the desktop app.

## 19.2 What Runs in the Browser

The web playground covers discovery and design — everything before the build:

- Discovery conversation with the Interviewer/Architect
- Real-time node materialization on the canvas
- Phantom previews for frontend nodes
- Complexity tier assessment
- Research phase (package vetting, license checks)
- Design review gate
- Plan generation and plan review gate
- Downloadable `.forgeplan/` directory at the end — the complete blueprint ready to build

The web playground does NOT run builds. No file generation, no `npm install`, no test execution, no dev server spawning. That's compute-heavy work that belongs on the user's machine. The web playground is cheap to serve (a few Interviewer/Architect calls per session, ~$0.50-1.00 in API costs) and easy to give away free.

## 19.3 The Handoff

When the user finishes discovery and design in the web playground, they've confirmed their architecture, the design review passed, and the plan is ready. They see two options:

1. **Download ForgePlan + Build** — downloads the desktop app with the `.forgeplan/` directory pre-loaded. They open it, click "Build All," and the greenfield pipeline runs locally with their own keys.
2. **Download Blueprint** — downloads just the `.forgeplan/` directory. They open it in the desktop app they already have, or run `npx forgeplan deep-build` from the CLI.

Either way, the architecture transfers instantly. No re-describing. No re-configuring. The manifest, specs, research results, phantom previews, wiki, and design review reports are all in the `.forgeplan/` directory.

This is NOT how Lovable works. Lovable is a vending machine — insert prompt, receive app. ForgePlan's web playground is a design studio — describe your idea, understand the architecture, approve the blueprint, then take it to the workshop (desktop app) to build it with governance at every step.

## 19.4 What the Desktop App Adds

The desktop app is the full product. Everything the web playground does, plus:

- Full greenfield build pipeline (build → verify → review → sweep → certify)
- BYOK with user's own API keys (no credits needed)
- Full context panel depth (all 8 tabs)
- Tier 3 code editing with Monaco + LSP
- CLI access alongside the visual canvas
- Local file system integration
- Offline capability
- Phased builds for LARGE projects
- Repo ingestion
- Deep-build overnight runs

## 19.5 Shared Frontend Components

The web playground and desktop app share the same React components. The canvas, chat panel, node components, edge components, phantom previews, and breadcrumbs are identical. The only difference is the backend: the web playground hits a server API for the discovery/research agents; the desktop app talks to the Electron main process for everything including builds. Building the web playground first gives you 70% of the desktop app's frontend for free.

## 19.6 Implementation

The web playground is a Next.js or Vite app deployed on Vercel. The core engine's Interviewer, Architect, and Researcher agents run server-side (lightweight — just conversation and manifest generation). No file system access, no process spawning, no sandbox needed. Dead simple to scale.

The same `forgeplan-core` npm package powers all three interfaces:
- **Web playground:** discovery/design agents only, server-side, outputs `.forgeplan/` directory as a download
- **Desktop app:** full pipeline including builds, runs in Electron main process
- **CLI:** full pipeline, runs from terminal

Three interfaces, one engine, one `.forgeplan/` directory format.

---

# 20. Voice Input — Talk to the Canvas

## 20.1 How It Works

During discovery, a microphone button appears in the chat panel. The user presses it, speaks naturally, and releases. The audio is transcribed and fed to the Interviewer agent as if the user had typed it. The canvas updates identically regardless of whether input was typed or spoken.

## 20.2 Implementation (Simple Path — Ship First)

The browser's `MediaRecorder` API captures audio. The audio is sent to a cloud transcription service (Whisper API via OpenAI, or Deepgram for lower latency). The transcription text is injected into the chat input and sent to the agent. Total implementation: a microphone button component, a recording hook, and a transcription API call. A few hours of work.

Works on both web playground (browser-native) and desktop app (Electron has full browser APIs).

## 20.3 Future: Local Transcription (Privacy-First)

For enterprise users who can't send voice data to the cloud, bundle a local Whisper model. This adds ~500 MB for model weights and requires GPU for real-time performance. Not worth the complexity at launch. Add it when enterprise customers ask for it.

## 20.4 Voice in the Visibility Matrix

Voice input is a Tier 1 feature — it appears during the first five minutes. The microphone button is visible in the chat panel alongside the text input. No configuration required. The user sees it and either uses it or ignores it.

---

# 21. GitHub Action — Continuous Architectural Governance

## 21.1 What It Does

A GitHub Action that runs `/forgeplan:sweep` on every pull request. The PR gets a comment:

```
✅ ForgePlan Sweep: 0 findings. All 23 acceptance criteria verified.
```

Or:

```
⚠️ ForgePlan Sweep: 2 findings
CRITICAL: Auth middleware missing on /api/admin route
WARNING: Document type used without shared model import in src/api/handlers.ts
```

## 21.2 Why It Matters

This makes ForgePlan useful for teams that may never use the desktop app or web playground for building. They use their existing tools (Cursor, VS Code, Claude Code) for development, and ForgePlan as a CI/CD quality gate. The `.forgeplan/` directory lives in their repo. Every PR gets architecturally validated.

This is also a retention mechanism: the `.forgeplan/` directory stays alive and maintained in codebases that might otherwise drift. And it's a new distribution channel — developers discover ForgePlan through the GitHub Action, then try the web playground for their next project.

## 21.3 Implementation

The GitHub Action is a thin wrapper around the CLI:

```yaml
# .github/workflows/forgeplan-sweep.yml
name: ForgePlan Sweep
on: [pull_request]
jobs:
  sweep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npx forgeplan sweep --ci --output json > results.json
      - uses: forgeplan/action-comment@v1
        with:
          results: results.json
```

The `--ci` flag runs the sweep in non-interactive mode. The `--output json` flag produces structured results. The action-comment step posts the results as a PR comment. One day of engineering, if that.

## 21.4 Revenue

Per-repo pricing: $10/repo/month for continuous ForgePlan sweep on every PR. Separate revenue line from the web playground and desktop app. Teams pay for the quality gate, not the build tool.

---

# 22. Revenue Model

## 22.1 Model C: Platform + Compute (User Chooses)

Two paths to the same product. The user picks the one that fits their workflow:

**Path A — Buy Credits (non-technical users, quick builds):**
User buys credits. ForgePlan proxies all API calls. The user never configures API keys, never picks a model, never thinks about providers. They describe their idea, click build, and credits are deducted based on project complexity.

| Tier | Approximate Credit Cost |
|---|---|
| SMALL greenfield (3 nodes) | 50 credits |
| MEDIUM greenfield (5-7 nodes) | 200 credits |
| LARGE greenfield (10+ nodes) | 500 credits |
| Single sweep pass | 30 credits |
| Single node build | 20-40 credits |

Credit pricing TBD based on actual compute costs after launch. Target: 30-40% markup over raw API costs.

**Path B — BYOK (developers, power users):**
User brings their own API keys. ForgePlan charges nothing for compute — the user pays their provider directly. The platform is free or charges a small monthly fee for the orchestration, agents, enforcement, canvas, and review panel.

## 22.2 Pricing Tiers

| Tier | Price | Includes | Target |
|---|---|---|---|
| **Free** | $0 | Unlimited discovery + design on web playground. Download your `.forgeplan/` blueprint. BYOK builds on desktop app (you pay your provider). | Try it, get hooked, design for free |
| **Starter** | $29/mo | 5 builds/month (credits included), 3 sweep agents, desktop app | Solo builders, freelancers |
| **Pro** | $59/mo | Unlimited builds, 5 sweep agents, cross-model verification, voice input, phased builds, ingestion | Serious builders, small teams |
| **Team** | $99/seat/mo | Everything in Pro, shared templates, GitHub Action, collaboration features | Agencies, startups |
| **BYOK** | Free platform | Bring your own keys. Full feature access. You pay your provider, not us. | Developers who already have API keys |

The free tier is the web playground. Discovery and design are free forever — because they cost almost nothing to serve (~$0.50 per session in API costs) and they're the hook that converts users. Builds are where the compute concentrates, and builds happen on the desktop app — either via credits (Starter/Pro) or BYOK (free platform).

## 22.3 The GitHub Action as Separate Revenue

$10/repo/month for continuous sweep on every PR. Independent of the main subscription. Teams that use Cursor or VS Code for building can still use ForgePlan as a quality gate.

## 22.4 Template Marketplace (Post-Traction)

Free templates for community growth. Premium templates ($5-20 one-time) for production-ready architectures. Revenue share with template authors. Deferred until the marketplace has volume — not a launch feature.

## 22.5 Pricing Philosophy

Discovery and design are free. Builds are where the value — and the cost — concentrates. The web playground gives away the experience that hooks users (watching their architecture materialize costs almost nothing to serve). The desktop app charges for the experience that delivers value (building certified codebases costs real compute).

BYOK users pay nothing to ForgePlan because they pay their provider directly. This removes the pricing objection entirely for developers. Credit users pay ForgePlan because they don't want to manage API keys. Both get the same product. The revenue model flexes around the user, not the other way around.

The first design session on the web playground is the most important moment. It converts "curious" to "convinced" with zero financial commitment. The user downloads the desktop app already knowing what ForgePlan does because they experienced it in their browser.

## 22.6 Pricing Caveat

All pricing is preliminary. Final pricing requires data from the first hundred builds: actual compute costs per tier, average builds per user per month, conversion rates from free to paid. Ship first. Measure. Then price correctly.

---

# 23. Go-to-Market Sequencing

Everything ships in order of user acquisition impact, not engineering complexity.

**Phase 1 — Ship (Weeks 1-3):**
- Model-agnostic core engine extraction + token efficiency improvements
- Web playground with discovery + design pipeline (server-side Interviewer/Architect/Researcher only — no builds)
- Voice input on the web playground (cloud transcription)
- Free discovery. Download blueprint. Build locally.
- The URL someone clicks from a tweet → describe idea → watch architecture build → download blueprint → build in desktop app

**Phase 2 — Expand (Weeks 4-5):**
- Desktop app (Electron, same frontend, adds offline + BYOK + full depth)
- CLI (`npx forgeplan greenfield`)
- GitHub Action for continuous sweep on PRs
- Plugin stays alive as Claude Code free tier

**Phase 3 — Grow (Month 2-3):**
- Template gallery (export/import `.forgeplan/` directories, community sharing)
- Build analytics (convergence trends, token usage, quality metrics over time)
- "Built with ForgePlan" certification badge

**Phase 4 — Platform (Month 4+):**
- Premium templates with revenue share
- Team collaboration features
- Enterprise features (SSO, audit logs, self-hosted)
- Local voice transcription for privacy-sensitive customers

At every phase, the web playground is the front door. The desktop app is the power tool. The CLI is the developer interface. The GitHub Action is the enterprise wedge. All four read and write the same `.forgeplan/` directory.

---

**Architecture down. Code forward. Governance always.**

**END OF DOCUMENT**
