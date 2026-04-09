---
name: web-design-guidelines
description: 100+ accessibility, performance, and UX standards for frontend builds — anti-slop rules, visual consistency, component quality
when_to_use: During frontend node builds to enforce design quality and prevent AI-generated visual cliches
priority: 70
source: Anthropic
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [builder, sweep-pathfinder]
tech_filter: [react, vue, svelte, nextjs, nuxt, sveltekit]
---

# Web Design Guidelines

## Anti-Slop Rules (Hard Requirements)

AI-generated frontends have tells. These rules prevent them.

- [ ] No gradient backgrounds unless the user requests them
- [ ] No emoji in UI text (labels, headings, buttons, navigation)
- [ ] No "Welcome to..." hero sections
- [ ] No purple-blue-teal default palette
- [ ] No excessive border-radius (not everything is a pill: `rounded-full`)
- [ ] No card-based layout for everything (use tables, lists, grids as appropriate)
- [ ] No padding bloat (8-16px is enough for most containers)
- [ ] One accent color, not a rainbow
- [ ] No stock placeholder copy ("Lorem ipsum", "Your amazing feature")
- [ ] No decorative icons next to every heading
- [ ] Prefer system fonts or one font family maximum
- [ ] Muted, professional color palettes by default
- [ ] Dense, information-rich layouts over spacious empty ones
- [ ] If it looks like a template, redesign

## Typography

### Hierarchy
- [ ] 3-4 font sizes maximum across the entire app
- [ ] Heading sizes decrease predictably (h1 > h2 > h3, never h3 bigger than h2)
- [ ] Body text 16px minimum (14px minimum for secondary/caption text)
- [ ] Line height 1.4-1.6 for body text, 1.1-1.3 for headings
- [ ] Max line length 65-75 characters for readability
- [ ] Font weight used for emphasis, not font size

### Rules
- [ ] One typeface for UI (system font stack or Inter/Geist)
- [ ] Bold for headings and labels, regular for body, no light/thin weights for text
- [ ] Monospace for code, data, and technical values only
- [ ] No underlined text except links
- [ ] Consistent text alignment (left for content, center sparingly)

## Color

### Palette Construction
- [ ] Background: white or near-white (1-2 shades for depth)
- [ ] Text: dark gray (not pure black — `#1a1a1a` or equivalent)
- [ ] Accent: one saturated color for interactive elements
- [ ] Danger: red family for destructive actions and errors
- [ ] Success: green family for confirmations
- [ ] Warning: amber/yellow family for cautions
- [ ] Neutral: gray scale for borders, disabled states, secondary text

### Color Rules
- [ ] Maximum 5 unique colors in the palette (excluding grays)
- [ ] Accent color used ONLY for primary actions and active states
- [ ] Never use color as the ONLY indicator (add icon, text, or pattern)
- [ ] Dark mode: invert value, keep hue — don't just swap black and white
- [ ] Contrast ratios meet WCAG AA (4.5:1 normal text, 3:1 large text)

## Spacing

### Scale
Use a consistent spacing scale (multiples of 4px):

| Token | Value | Use |
|-------|-------|-----|
| xs | 4px | Tight groups (icon + label) |
| sm | 8px | Related items within a group |
| md | 16px | Sections within a card/component |
| lg | 24px | Between components |
| xl | 32px | Between major sections |
| 2xl | 48px | Page-level spacing |

### Rules
- [ ] Same spacing scale used everywhere (no magic numbers)
- [ ] Padding inside containers: 16-24px (not 32-48px)
- [ ] Gap between form fields: 12-16px
- [ ] Section spacing increases with hierarchy level
- [ ] No double-spacing (margin on both container AND child)

## Layout

### Structure
- [ ] Sidebar + content (dashboard apps) or header + content (content apps)
- [ ] Sidebar width: 240-280px (not 320px — wastes horizontal space)
- [ ] Content area has max-width (1200-1440px) to prevent line stretching
- [ ] Footer is minimal or absent in app UIs (not needed)
- [ ] Responsive: sidebar collapses to drawer on mobile

### Component Layout
- [ ] Tables for tabular data (not cards)
- [ ] Cards ONLY for distinct objects with multiple attributes (not for list items)
- [ ] Lists for sequential items
- [ ] Grid for visual/media content (products, galleries)
- [ ] Forms in a single column (not multi-column except on very wide screens)

## Component Quality

### Every Interactive Component Needs
- [ ] Default state (normal appearance)
- [ ] Hover state (cursor change + visual feedback)
- [ ] Focus state (visible outline for keyboard navigation)
- [ ] Active/pressed state
- [ ] Disabled state (reduced opacity + no pointer events + tooltip for why)
- [ ] Loading state (spinner or skeleton, not frozen UI)

### Every Data Component Needs
- [ ] Loading state (skeleton matching the content shape)
- [ ] Empty state (message + action: "No documents yet. Create one.")
- [ ] Error state (message + retry button)
- [ ] Populated state (the actual content)

## Performance

- [ ] Images use `next/image` or equivalent with width/height (prevent CLS)
- [ ] Icons from a single icon library (lucide-react, heroicons — not mixing)
- [ ] No CSS framework >50KB unless justified (tailwind purges to <10KB)
- [ ] Bundle split by route (dynamic imports for route components)
- [ ] API calls deduplicated (React Query / SWR, not raw fetch)
- [ ] Debounce search inputs (300ms)
- [ ] Virtualize lists >50 items

## Severity Guide

| Finding | Severity |
|---------|----------|
| No loading states (blank screen during fetch) | HIGH |
| No error states (unhandled rejection, white screen) | HIGH |
| No empty states (blank page when no data) | MEDIUM |
| AI slop detected (gradient hero, emoji headings) | MEDIUM |
| Inconsistent spacing scale | MEDIUM |
| Text contrast below WCAG AA | HIGH |
| More than 5 colors in palette | LOW |
| Magic number spacing (not on scale) | LOW |
