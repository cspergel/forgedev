# Sprint 11 Batches 3-4 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add anti-slop design quality (frontend-design skill + design pass agent + deep-build pipeline integration + user steering) and skill learner module (pattern detection + SKILL.md generation + PostToolUse wiring + skill review/approve flow).

**Architecture:** Batch 3 adds a new skill, a new agent, and a new phase to deep-build. Batch 4 creates a self-contained `scripts/skill-learner/` module that monitors code patterns via PostToolUse and generates draft skills for user review. Both are additive — no existing functionality changes.

**Tech Stack:** Node.js scripts, Claude Code plugin markdown commands/agents, SKILL.md format. No new dependencies.

**Design doc:** `docs/plans/2026-04-07-sprint11-design.md` — Pillar 5 (Anti-Slop) and Pillar 2 (Skill Learner). READ THIS for full context.

---

## Batch 3: Design Quality + Anti-Slop (Tasks 1-4)

### Task 1: Create frontend-design skill

**Files:**
- Create: `skills/core/frontend-design.md`

**Step 1: Write the skill file**

Create `skills/core/frontend-design.md` with full SKILL.md frontmatter:

```markdown
---
name: frontend-design
description: Anti-slop design rules + clean UI patterns. Prevents AI-generated aesthetic (gradients, emoji, purple palettes, excessive padding). Enforces typography hierarchy, intentional spacing, professional color palettes.
when_to_use: During frontend node builds and design pass reviews. Loaded automatically for any node with type frontend or when tech_stack.frontend is not "none".
priority: 90
source: forgeplan/internal
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [builder, sweep-pathfinder, design-pass]
tech_filter: [react, vue, svelte, nextjs, nuxt, sveltekit]
---

# Frontend Design — Anti-Slop Rules

## Hard Rules (violations are findings)

These patterns are banned unless the user explicitly requests them:

1. **No gradient backgrounds.** Use solid colors. If a section needs visual separation, use a border or background shade, not a gradient.
2. **No emoji in UI text.** Labels, headings, buttons, and navigation must use text only. Icons are fine (Lucide, Heroicons) — emoji are not.
3. **No "Welcome to..." hero sections.** The first thing the user sees should be actionable content, not a greeting. Dashboards show data. Login shows the form. Settings show the settings.
4. **No purple-blue-teal default palette.** Use neutral base (slate/zinc/gray) with ONE accent color. If unsure, use blue-600 or emerald-600 — not both. Never three accent colors.
5. **No excessive border-radius.** Buttons: `rounded-md` (6px). Cards: `rounded-lg` (8px). Nothing should be `rounded-full` unless it's an avatar or icon button.
6. **No card-for-everything layouts.** Not every content group needs a bordered card. Use spacing and typography to create hierarchy. Cards are for distinct, interactive items (e.g., a list of projects), not for wrapping every section.
7. **Typography hierarchy over color hierarchy.** Use font size and weight to show importance. The primary heading is large+bold. The secondary is medium. The body is regular. Don't use color to distinguish importance — color is for status and actions.
8. **One accent color, not a rainbow.** Pick one. Use it for primary buttons, active states, and links. Everything else is neutral. A second color (e.g., red for destructive actions) is acceptable but must be used sparingly.
9. **Intentional white space.** Padding serves a purpose: grouping related items, separating sections. If two sections have the same padding, they look equally important — is that true? Dense, information-rich layouts are preferred over spacious empty ones.
10. **System fonts or one family.** Use `font-sans` (system font stack) or ONE custom font. Never two custom fonts. The font choice should not be the first thing a user notices.
11. **No stock placeholder copy.** Every string in the UI should be real. Not "Lorem ipsum." Not "Your amazing description here." Write actual labels, actual empty states, actual error messages.
12. **Muted, professional palettes.** Default to: slate-50 background, slate-900 text, one accent. If the project has a brand color, use it as the accent. If not, use a neutral accent (blue-600, emerald-600).

## Patterns to Follow

### Layout
- Sidebar + content for dashboards (sidebar: 240-280px, collapsible on mobile)
- Centered single-column for auth pages (max-w-sm)
- Full-width header + content for public pages
- Never nest more than 2 levels of containers

### Component Quality
- Every async operation has a loading state (skeleton, not spinner — unless it's a button)
- Every list has an empty state with guidance ("No documents yet. Upload your first.")
- Every form has inline validation errors next to the field, not a banner at the top
- Error states show what went wrong AND what to do about it

### Color Usage
```
Background:  slate-50 / white
Surface:     white / slate-50 (for cards/sections on slate-50 bg)
Text:        slate-900 (primary), slate-600 (secondary), slate-400 (muted)
Accent:      [one color]-600 (buttons, links, active states)
Destructive: red-600 (delete, errors — sparingly)
Success:     emerald-600 (confirmations — sparingly)
Border:      slate-200
```

### Spacing Scale
Use a consistent scale: 4px (gap), 8px (tight), 12px (default), 16px (comfortable), 24px (section gap), 32px (major section). Don't mix arbitrary values.

## The Test
If a developer looks at the built frontend and immediately thinks "AI made this" — the design pass failed. The goal is an app that looks like a human designed it quickly but competently.
```

**Step 2: Verify the skill parses correctly**

Run: `node -e "const fs=require('fs');const content=fs.readFileSync('skills/core/frontend-design.md','utf-8');const match=content.match(/^---\\n([\\s\\S]*?)\\n---/);console.log(match?'Frontmatter OK':'MISSING FRONTMATTER')"`
Expected: `Frontmatter OK`

**Step 3: Validate via registry**

Run: `node scripts/skill-registry.js validate`
Expected: All skills pass validation including frontend-design.

**Step 4: Commit**

```bash
git add skills/core/frontend-design.md
git commit -m "feat(sprint11-b3): frontend-design skill with anti-slop rules"
```

---

### Task 2: Create design-pass agent

**Files:**
- Create: `agents/design-pass.md`

**Step 1: Write the agent definition**

Create `agents/design-pass.md`:

```markdown
---
name: design-pass
description: Post-build design quality agent. Checks frontend code for AI-slop patterns, visual consistency, and component quality. Generates findings like sweep agents. Tier-aware depth.
model: opus
---

# Design Pass Agent

You review frontend code for design quality. You are NOT checking for bugs — the sweep agents handle that. You are checking whether the UI looks like a human designed it or whether it screams "AI generated this."

Read the `frontend-design` skill from the skill registry before starting. Its rules are your checklist.

## What You Audit

### Level 1: Anti-Slop Rules (ALL tiers)

For every frontend file (.tsx, .jsx, .vue, .svelte, .css, .html), check:

1. **Gradient backgrounds:** Search for `gradient`, `bg-gradient`, `linear-gradient`, `radial-gradient`. Flag each occurrence with file:line.
2. **Emoji in UI text:** Search for emoji characters in strings rendered to the UI (JSX text content, template literals in components). Exclude comments, console.log, and test files.
3. **"Welcome" hero sections:** Search for "Welcome to", "Welcome back", "Hello,", "Hi there" in component output. Flag generic greetings.
4. **Purple-blue-teal palette:** Search for multiple accent colors. If more than 2 distinct color families are used as accents (not neutrals), flag it.
5. **Excessive border-radius:** Search for `rounded-full` on non-avatar/non-icon elements, `rounded-3xl`, `rounded-[20px]` or larger custom values.
6. **Card overuse:** If >60% of top-level page sections are wrapped in card/bordered containers, flag: "Consider using spacing and typography instead of cards for section separation."
7. **Stock placeholder copy:** Search for "Lorem ipsum", "Your [noun] here", "placeholder", "example.com" (non-test files).
8. **Multiple font imports:** If more than 1 custom font family is imported, flag it.

### Level 2: Visual Consistency (MEDIUM + LARGE)

9. **Spacing inconsistency:** Sample padding/margin values across components. If more than 4 distinct non-standard spacing values are used (outside the 4/8/12/16/24/32 scale), flag with examples.
10. **Color inconsistency:** Extract all color classes/values. If the same semantic role (e.g., "primary button") uses different colors in different files, flag.
11. **Typography inconsistency:** Check heading sizes across pages. If h1 is `text-2xl` on one page and `text-4xl` on another, flag.

### Level 3: Component Quality (LARGE only)

12. **Missing loading states:** For each component that makes an async call (fetch, useQuery, useSWR), check if there's a loading/skeleton state. Flag missing ones.
13. **Missing empty states:** For each list/table component, check if there's an empty state (when data is []). Flag missing ones.
14. **Missing error states:** For each async component, check if there's an error state. Flag missing ones.
15. **Error message quality:** For each error message shown to users, check if it says what went wrong AND what to do. "An error occurred" alone is a finding.

## How to Report

```
FINDING: D[N]
Node: [node-id]
Category: design-quality
Severity: HIGH | MEDIUM | LOW
Confidence: [0-100]
Description: [what's wrong — cite the specific anti-slop rule violated]
File: [exact file path]
Line: [approximate line number]
Fix: [specific remediation — e.g., "Replace gradient with solid bg-slate-50"]
```

Use D-prefix (D1, D2...) to distinguish from sweep findings (F-prefix).

**Severity guide:**
- HIGH: Gradient backgrounds, emoji in UI text, stock placeholder copy, multiple font families
- MEDIUM: Excessive border-radius, card overuse, spacing/color/typography inconsistency
- LOW: Missing loading/empty/error states (functional, not aesthetic)

## Rules
- Only check frontend files (.tsx, .jsx, .vue, .svelte, .css, .html, .astro)
- Skip test files, config files, and node_modules
- Findings must cite the specific anti-slop rule from the frontend-design skill
- If the project has no frontend nodes, report: `CLEAN: No frontend nodes to review.`
- If ALL checks pass: `CLEAN: Design pass complete. No anti-slop violations.`
```

**Step 2: Verify the file parses**

Run: `node -e "const fs=require('fs');const content=fs.readFileSync('agents/design-pass.md','utf-8');const match=content.match(/^---\\n([\\s\\S]*?)\\n---/);console.log(match?'Frontmatter OK':'MISSING FRONTMATTER')"`
Expected: `Frontmatter OK`

**Step 3: Commit**

```bash
git add agents/design-pass.md
git commit -m "feat(sprint11-b3): design-pass agent — post-build design quality review"
```

---

### Task 3: Wire design pass into deep-build pipeline

**Files:**
- Modify: `commands/deep-build.md`

**Step 1: Read the current deep-build.md**

Read `commands/deep-build.md` fully. The design pass goes between Phase 2 (build) and Phase 3 (verify-runnable). It should be a new Phase 2.5 or renumber existing phases.

**Step 2: Add the design pass phase**

Insert after Phase 2 (Build all nodes) and before Phase 3 (verify-runnable). Add as Phase 2b (don't renumber everything):

```markdown
### Phase 2b: Design pass (frontend quality)

**Skip this phase if:** no frontend nodes exist in the manifest (all nodes have `type` other than `frontend`), OR `complexity_tier` is `SMALL` and config does not explicitly enable design pass.

1. Set `sweep_state.current_phase` to `"design-pass"`
2. Read the skill registry. Check if `frontend-design` skill is assigned to `design-pass` agent.
3. Identify all frontend nodes (nodes with `type: "frontend"` or nodes whose `file_scope` contains frontend files)
4. Dispatch the design-pass agent using the Agent tool:
   - Read `agents/design-pass.md` for the system prompt
   - Include the `frontend-design` skill content from `skills/core/frontend-design.md`
   - Include all frontend node files
   - Include the manifest for context
   - **Tier-aware depth:** Pass the complexity tier so the agent knows which levels to check (Level 1 only for SMALL, Levels 1-2 for MEDIUM, Levels 1-3 for LARGE)
5. Parse the agent's response for FINDING blocks (D-prefix) or CLEAN
6. If CLEAN: log "Design pass clean." Proceed to user steering (step 8).
7. If findings: dispatch a fresh fix agent per finding (same pattern as sweep Phase 4 — fresh agent, node-scoped). After fixes, re-run the design pass agent once to verify. If still has findings after 2 passes, move remaining to `needs_manual_attention` with reason "design quality — user review recommended."
8. **User steering (one round):** Present a summary of the frontend build:
   ```
   Frontend design pass complete. Here's what was built:
     - [N] pages: [list page names from frontend nodes]
     - Palette: [detected primary colors from the code]
     - Layout: [detected layout pattern]

     Would you like to adjust anything? (e.g., 'darker', 'more minimal',
     'use green accent instead', 'add sidebar')
     Or press enter to continue to verification.
   ```
   - If user provides feedback: dispatch a fix agent with the feedback as instructions, targeting all frontend node files. Re-run design pass after.
   - If user presses enter / says "continue" / no response: proceed.
   - **In autonomous mode (greenfield/deep-build without user interaction):** Skip user steering. The design pass findings + fixes are sufficient.
9. Proceed to Phase 3 (verify-runnable)
```

**Step 3: Verify deep-build.md has no syntax issues**

Read the modified file and ensure the phase numbering is consistent and references to "Phase 3" etc. still work.

**Step 4: Commit**

```bash
git add commands/deep-build.md
git commit -m "feat(sprint11-b3): design pass phase in deep-build pipeline (Phase 2b)"
```

---

### Task 4: Update sweep.md and skill registry for design-pass agent

**Files:**
- Modify: `scripts/skill-registry.js` — add `design-pass` to known agents
- Modify: `commands/sweep.md` — reference design-pass in the pipeline description (informational, not a sweep agent)

**Step 1: Add design-pass to REGISTRY_AGENTS**

Read `scripts/skill-registry.js`. Find the `REGISTRY_AGENTS` array (around line 34-44). Add `"design-pass"` to the array so the registry can assign skills to it.

**Step 2: Refresh the registry**

Run: `node scripts/skill-registry.js generate`
Verify: `frontend-design` skill is now assigned to `design-pass` agent in the output.

**Step 3: Update sweep.md informational note**

Read `commands/sweep.md`. In the opening description or after the agent list, add a note: "Note: The design-pass agent (frontend quality) runs during deep-build Phase 2b, NOT during sweep. Sweep agents focus on code correctness, not aesthetics."

**Step 4: Commit**

```bash
git add scripts/skill-registry.js commands/sweep.md
git commit -m "feat(sprint11-b3): register design-pass agent + document in sweep.md"
```

---

## Batch 4: Skill Learner Module (Tasks 5-9)

### Task 5: Create skill-learner pattern detection engine

**Files:**
- Create: `scripts/skill-learner/index.js`
- Create: `scripts/skill-learner/detector.js`

**Step 1: Create the directory**

```bash
mkdir -p scripts/skill-learner
```

**Step 2: Write the pattern detector**

Create `scripts/skill-learner/detector.js`:

```javascript
// Skill Learner — Pattern Detection Engine
// Portable microservice: depends only on fs, path, crypto
// Can be extracted as standalone Claude Code plugin
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/**
 * Detect recurring code patterns across files.
 * Returns patterns that appear 3+ times.
 *
 * @param {string[]} files - Array of file paths to analyze
 * @param {Object} options - Detection options
 * @param {number} options.minOccurrences - Minimum times a pattern must appear (default: 3)
 * @param {string[]} options.exclude - Glob patterns to exclude
 * @returns {{ patterns: Pattern[], stats: { filesScanned: number, patternsFound: number } }}
 */
function detectPatterns(files, options = {}) {
  const minOccurrences = options.minOccurrences || 3;
  const patterns = {};

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue; // skip unreadable files
    }

    // Extract structural patterns
    extractImportClusters(content, filePath, patterns);
    extractMiddlewarePatterns(content, filePath, patterns);
    extractErrorHandlingPatterns(content, filePath, patterns);
    extractValidationPatterns(content, filePath, patterns);
    extractRoutePatterns(content, filePath, patterns);
    extractComponentPatterns(content, filePath, patterns);
  }

  // Filter to patterns with minOccurrences+ hits
  const recurring = Object.entries(patterns)
    .filter(([_, p]) => p.occurrences.length >= minOccurrences)
    .map(([key, p]) => ({
      id: key,
      type: p.type,
      description: p.description,
      occurrences: p.occurrences,
      count: p.occurrences.length,
      exampleCode: p.exampleCode,
      hash: crypto.createHash("sha256").update(key + p.type).digest("hex").slice(0, 12),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    patterns: recurring,
    stats: { filesScanned: files.length, patternsFound: recurring.length },
  };
}

// --- Pattern extractors ---

function extractImportClusters(content, filePath, patterns) {
  const imports = [];
  const importRegex = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
  let match;
  while ((match = importRegex.exec(content))) {
    imports.push(match[1] || match[2]);
  }
  if (imports.length < 2) return;

  // Sort imports for consistent keys, take top 5
  const key = imports.sort().slice(0, 5).join("+");
  const patternKey = `import-cluster:${key}`;
  if (!patterns[patternKey]) {
    patterns[patternKey] = {
      type: "import-cluster",
      description: `Files importing: ${imports.slice(0, 5).join(", ")}`,
      occurrences: [],
      exampleCode: imports.map(i => `import ... from "${i}";`).join("\n"),
    };
  }
  patterns[patternKey].occurrences.push(filePath);
}

function extractMiddlewarePatterns(content, filePath, patterns) {
  // Express-style middleware: (req, res, next) =>
  const middlewareRegex = /(?:async\s+)?(?:function\s+\w+)?\s*\(\s*req\s*,\s*res\s*(?:,\s*next)?\s*\)/g;
  const matches = content.match(middlewareRegex);
  if (!matches || matches.length === 0) return;

  const patternKey = "middleware:express-handler";
  if (!patterns[patternKey]) {
    patterns[patternKey] = {
      type: "middleware",
      description: "Express-style route handler (req, res, next)",
      occurrences: [],
      exampleCode: matches[0],
    };
  }
  patterns[patternKey].occurrences.push(filePath);
}

function extractErrorHandlingPatterns(content, filePath, patterns) {
  // try/catch with specific response patterns
  const tryCatchRegex = /try\s*\{[\s\S]*?\}\s*catch\s*\(\w+\)\s*\{[\s\S]*?(?:res\.status|next\(|throw|console\.error)/g;
  const matches = content.match(tryCatchRegex);
  if (!matches) return;

  // Classify by response pattern
  if (/res\.status\(\d+\)\.json/.test(content)) {
    const patternKey = "error-handling:json-response";
    if (!patterns[patternKey]) {
      patterns[patternKey] = {
        type: "error-handling",
        description: "Try/catch with JSON error response (res.status().json())",
        occurrences: [],
        exampleCode: "try { ... } catch (err) { res.status(500).json({ error: err.message }); }",
      };
    }
    patterns[patternKey].occurrences.push(filePath);
  }
  if (/next\(\s*(?:err|error|e)\s*\)/.test(content)) {
    const patternKey = "error-handling:next-error";
    if (!patterns[patternKey]) {
      patterns[patternKey] = {
        type: "error-handling",
        description: "Try/catch forwarding to error middleware (next(err))",
        occurrences: [],
        exampleCode: "try { ... } catch (err) { next(err); }",
      };
    }
    patterns[patternKey].occurrences.push(filePath);
  }
}

function extractValidationPatterns(content, filePath, patterns) {
  // Zod schema usage
  if (/z\.\w+\(\)/.test(content) && /\.parse\(|\.safeParse\(/.test(content)) {
    const patternKey = "validation:zod-parse";
    if (!patterns[patternKey]) {
      patterns[patternKey] = {
        type: "validation",
        description: "Zod schema validation with parse/safeParse",
        occurrences: [],
        exampleCode: "const schema = z.object({ ... }); const result = schema.safeParse(input);",
      };
    }
    patterns[patternKey].occurrences.push(filePath);
  }
}

function extractRoutePatterns(content, filePath, patterns) {
  // Express route definitions
  const routeRegex = /(?:app|router)\.(get|post|put|patch|delete)\s*\(/g;
  const methods = new Set();
  let match;
  while ((match = routeRegex.exec(content))) {
    methods.add(match[1]);
  }
  if (methods.size === 0) return;

  const patternKey = `route:express-${[...methods].sort().join("+")}`;
  if (!patterns[patternKey]) {
    patterns[patternKey] = {
      type: "route",
      description: `Express routes using: ${[...methods].join(", ")}`,
      occurrences: [],
      exampleCode: [...methods].map(m => `router.${m}("/path", handler);`).join("\n"),
    };
  }
  patterns[patternKey].occurrences.push(filePath);
}

function extractComponentPatterns(content, filePath, patterns) {
  // React component with hooks
  if (/import.*React|from\s+['"]react['"]/.test(content)) {
    const hooks = [];
    if (/useState/.test(content)) hooks.push("useState");
    if (/useEffect/.test(content)) hooks.push("useEffect");
    if (/useQuery|useSWR/.test(content)) hooks.push("data-fetching");
    if (/useForm/.test(content)) hooks.push("useForm");

    if (hooks.length >= 2) {
      const patternKey = `component:react-${hooks.sort().join("+")}`;
      if (!patterns[patternKey]) {
        patterns[patternKey] = {
          type: "component",
          description: `React component using: ${hooks.join(", ")}`,
          occurrences: [],
          exampleCode: hooks.map(h => `const [...] = ${h}(...);`).join("\n"),
        };
      }
      patterns[patternKey].occurrences.push(filePath);
    }
  }
}

module.exports = { detectPatterns };
```

**Step 3: Write the index.js orchestrator**

Create `scripts/skill-learner/index.js`:

```javascript
// Skill Learner — Orchestrator
// Portable microservice: depends only on fs, path, detector
const fs = require("fs");
const path = require("path");
const { detectPatterns } = require("./detector");

const DRAFTS_DIR = ".forgeplan/skill-drafts";

/**
 * Scan project files and detect recurring patterns.
 * @param {string} projectRoot - Project root directory
 * @param {Object} options
 * @param {number} options.minOccurrences - Min occurrences to flag (default: 3)
 * @returns {{ patterns: Pattern[], stats: object }}
 */
function scan(projectRoot, options = {}) {
  const files = collectSourceFiles(projectRoot);
  return detectPatterns(files, options);
}

/**
 * Generate a draft SKILL.md from a detected pattern.
 * @param {Object} pattern - Pattern from detectPatterns
 * @param {Object} options
 * @param {string} options.projectName - For context
 * @returns {string} SKILL.md content
 */
function generateDraft(pattern, options = {}) {
  const name = pattern.id
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 64);

  const content = `---
name: ${name}
description: "${pattern.description}"
when_to_use: "When building ${pattern.type} with similar patterns (detected ${pattern.count} times in codebase)"
priority: 30
source: skill-learner/auto-detected
validated_at: "${new Date().toISOString().split("T")[0]}"
overrides: []
tier_filter: []
agent_filter: [builder]
tech_filter: []
---

# ${pattern.description}

## Pattern

This pattern was automatically detected by the Skill Learner. It appeared in ${pattern.count} files:

${pattern.occurrences.map(f => `- \`${f}\``).join("\n")}

## Example

\`\`\`
${pattern.exampleCode}
\`\`\`

## When to Use

Apply this pattern when building similar ${pattern.type} components. This is a DRAFT — review and approve before it becomes an active skill.

## Status

**DRAFT** — detected by Skill Learner, awaiting human review via \`/forgeplan:skill review\`.
`;

  return content;
}

/**
 * Save a draft skill to the drafts directory.
 * @param {string} projectRoot
 * @param {Object} pattern
 * @returns {string} Path to saved draft
 */
function saveDraft(projectRoot, pattern) {
  const draftsDir = path.join(projectRoot, DRAFTS_DIR);
  if (!fs.existsSync(draftsDir)) {
    fs.mkdirSync(draftsDir, { recursive: true });
  }

  const content = generateDraft(pattern);
  const fileName = pattern.hash + ".md";
  const filePath = path.join(draftsDir, fileName);

  // Don't overwrite existing drafts (already suggested)
  if (fs.existsSync(filePath)) {
    return null; // Already drafted
  }

  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

/**
 * Collect source files for analysis (skip node_modules, dist, .forgeplan, etc.)
 */
function collectSourceFiles(projectRoot) {
  const files = [];
  const exclude = new Set(["node_modules", "dist", "build", ".forgeplan", ".git", ".next", ".nuxt", "coverage"]);
  const extensions = new Set([".js", ".ts", ".jsx", ".tsx", ".vue", ".svelte"]);

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (exclude.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (extensions.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  walk(projectRoot);
  return files;
}

module.exports = { scan, generateDraft, saveDraft, collectSourceFiles };
```

**Step 4: Verify modules load**

Run: `node -e "const sl = require('./scripts/skill-learner'); console.log(typeof sl.scan, typeof sl.generateDraft, typeof sl.saveDraft)"`
Expected: `function function function`

**Step 5: Commit**

```bash
git add scripts/skill-learner/
git commit -m "feat(sprint11-b4): skill-learner module — pattern detection + draft generation"
```

---

### Task 6: Wire skill learner into PostToolUse hook

**Files:**
- Modify: `scripts/post-tool-use.js`

**Step 1: Read post-tool-use.js**

Read `scripts/post-tool-use.js` to understand the current structure. Find where file tracking happens (the file registration section). The skill learner check should run periodically — not on every single file write (too expensive), but after a batch of writes (e.g., every 20 file writes during a build).

**Step 2: Add skill learner trigger**

At the end of the hook's main processing (after file registration and wiki updates), add:

```javascript
// --- Skill Learner: periodic pattern check ---
// Only run during builds (not reviews/sweeps) and only every 20 file writes
if (activeStatus === "building" && state.nodes) {
  const activeNodeState = state.nodes[activeNodeId] || {};
  const writeCount = (activeNodeState._skill_learner_writes || 0) + 1;
  state.nodes[activeNodeId] = { ...activeNodeState, _skill_learner_writes: writeCount };

  if (writeCount % 20 === 0) {
    try {
      const skillLearner = require("./skill-learner");
      const result = skillLearner.scan(cwd, { minOccurrences: 3 });
      if (result.patterns.length > 0) {
        let draftsCreated = 0;
        for (const pattern of result.patterns) {
          const saved = skillLearner.saveDraft(cwd, pattern);
          if (saved) draftsCreated++;
        }
        if (draftsCreated > 0) {
          process.stderr.write(`[ForgePlan] Skill Learner: ${draftsCreated} new pattern(s) detected. Review with /forgeplan:skill review\n`);
        }
      }
    } catch {
      // Skill learner is non-blocking — failures are silent
    }
  }
}
```

Important: this must be inside a try/catch and must NOT block the hook. The `_skill_learner_writes` field is transient — it's fine in state.json because it resets naturally when the node status changes.

**Step 3: Verify post-tool-use.js parses**

Run: `node --check scripts/post-tool-use.js`
Expected: No output (clean parse)

**Step 4: Commit**

```bash
git add scripts/post-tool-use.js
git commit -m "feat(sprint11-b4): wire skill learner into PostToolUse — periodic pattern scan"
```

---

### Task 7: Add review/approve/promote subcommands to /forgeplan:skill

**Files:**
- Modify: `commands/skill.md`

**Step 1: Read current skill.md**

Read `commands/skill.md` to see existing subcommands (list, refresh, install, validate).

**Step 2: Add review, approve, and promote subcommands**

Append after the `validate` subcommand:

```markdown
### `/forgeplan:skill review`

Show draft skills detected by the Skill Learner, pending human review.

1. Read all `.md` files in `.forgeplan/skill-drafts/`
2. If no drafts: "No skill drafts pending. The Skill Learner detects patterns during builds — drafts appear after 20+ file writes."
3. For each draft, display:
   ```
   === Skill Drafts (pending review) ===

   [N]. [name] — [description]
       Pattern: [type] (detected [count] times)
       Files: [first 3 file paths]...
       Action: approve / skip / delete
   ```
4. Wait for user input per draft: `approve`, `skip`, or `delete`
5. For approved drafts: move to the approve flow (see below)
6. For deleted drafts: remove the file from `.forgeplan/skill-drafts/`
7. For skipped: leave as-is for later review

### `/forgeplan:skill approve <draft-hash>`

Promote a draft skill to the project's active skill directory.

1. Read the draft from `.forgeplan/skill-drafts/[hash].md`
2. Present the full skill content for final review
3. Ask: "Approve this skill? It will be added to .forgeplan/skills/ and included in future builds. (y/n/edit)"
4. If `y`: copy to `.forgeplan/skills/[name].md`, delete the draft, run `skill-registry.js refresh`
5. If `edit`: open the content for editing, then re-confirm
6. If `n`: leave as draft

### `/forgeplan:skill promote <name>`

Promote a project-local skill to user-global scope.

1. Read the skill from `.forgeplan/skills/[name].md`
2. Verify it has been used successfully (check if it's been in the registry for 5+ builds without being disabled or causing issues)
3. Copy to `~/.claude/skills/[name].md` (user-global directory)
4. Show: "Promoted [name] to global skills. It will be available in all your ForgePlan projects."
5. Run `skill-registry.js refresh`
```

**Step 3: Commit**

```bash
git add commands/skill.md
git commit -m "feat(sprint11-b4): /forgeplan:skill review, approve, promote subcommands"
```

---

### Task 8: Add Tier 3 auto-research trigger to skill registry

**Files:**
- Modify: `scripts/skill-registry.js`

**Step 1: Read skill-registry.js**

Read `scripts/skill-registry.js`. Find the cascade function where skills are assigned to agents. After the cascade completes, check for agents that have fewer skills than expected (below `min_skills` threshold).

**Step 2: Add gap detection**

After the cascade resolves assignments, add a gap detection step:

```javascript
// --- Tier 3: Auto-research gap detection ---
// If an agent has 0 skills assigned after cascade (and config doesn't disable skills),
// flag it as a research opportunity
function detectSkillGaps(assignments, manifest) {
  const gaps = [];
  const tier = manifest.project && manifest.project.complexity_tier;

  for (const [agent, skills] of Object.entries(assignments)) {
    // Skip architect (compiled separately) and agents not dispatched for this tier
    if (agent === "architect") continue;
    if (tier === "SMALL" && !["sweep-adversary", "sweep-contractualist", "sweep-skeptic", "builder"].includes(agent)) continue;

    if (skills.length === 0) {
      gaps.push({
        agent,
        reason: `No skills assigned to ${agent} after cascade. Consider /forgeplan:research for ${agent}-relevant patterns.`,
      });
    }
  }

  return gaps;
}
```

Add this after the main assignment loop. If gaps are found, include them in the registry output under a `skill_gaps` key so session-start.js can surface them:

```yaml
# In skills-registry.yaml
skill_gaps:
  - agent: sweep-pathfinder
    reason: "No skills assigned. Consider /forgeplan:research for UX patterns."
```

**Step 3: Update session-start.js to surface gaps**

Read `scripts/session-start.js`. In the skill registry status section, add: if `skill_gaps` exists and has entries, display: "Skills: [N] active, [M] agents have no skills — run /forgeplan:research to find relevant patterns"

**Step 4: Verify both files parse**

Run: `node --check scripts/skill-registry.js && node --check scripts/session-start.js`
Expected: No output (clean parse)

**Step 5: Commit**

```bash
git add scripts/skill-registry.js scripts/session-start.js
git commit -m "feat(sprint11-b4): skill gap detection + session-start surfacing"
```

---

### Task 9: Integration test — verify full skill learner flow

**Files:**
- No new files — verification only

**Step 1: Verify skill-learner module works standalone**

Run:
```bash
node -e "
const sl = require('./scripts/skill-learner');
const result = sl.scan('.', { minOccurrences: 2 });
console.log('Files scanned:', result.stats.filesScanned);
console.log('Patterns found:', result.stats.patternsFound);
result.patterns.forEach(p => console.log(' ', p.type, ':', p.description, '(' + p.count + ' occurrences)'));
"
```

Expected: Scans ForgePlan's own scripts and finds some patterns (import clusters, error handling patterns).

**Step 2: Verify draft generation**

Run:
```bash
node -e "
const sl = require('./scripts/skill-learner');
const result = sl.scan('.', { minOccurrences: 2 });
if (result.patterns.length > 0) {
  const draft = sl.generateDraft(result.patterns[0]);
  console.log(draft.slice(0, 500));
} else {
  console.log('No patterns found (expected — ForgePlan scripts may not have enough duplication)');
}
"
```

Expected: Either generates a valid SKILL.md draft or reports no patterns found.

**Step 3: Verify skill registry still works**

Run: `node scripts/skill-registry.js validate`
Expected: All skills pass including frontend-design.

**Step 4: Verify git is clean**

Run: `git status`
Expected: Only expected changes.

**Step 5: Final commit if needed**

```bash
git add -A
git commit -m "feat(sprint11-b3b4): Batches 3+4 complete — design pass + skill learner"
```
