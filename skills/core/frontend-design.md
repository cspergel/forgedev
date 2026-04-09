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