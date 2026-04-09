---
name: accesslint
description: WCAG 2.2 audit checklist, contrast ratio calculator, a11y testing commands, screen reader compatibility rules
when_to_use: During pathfinder sweeps to audit accessibility compliance across frontend nodes
priority: 80
source: AccessLint
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [sweep-pathfinder]
tech_filter: []
---

# AccessLint — Accessibility Reviewer

## WCAG 2.2 Audit Checklist (Level AA)

### Perceivable

#### Images and Media
- [ ] Every `<img>` has `alt` attribute — decorative images use `alt=""`
- [ ] Alt text describes the image's PURPOSE, not its appearance
- [ ] Charts/graphs have text alternative summarizing the data
- [ ] Video has captions, audio has transcript
- [ ] No information conveyed by color alone (use icon + color, or text + color)

#### Text and Readability
- [ ] Text contrast ratio >= 4.5:1 (normal text) and >= 3:1 (large text, 18px+ or 14px+ bold)
- [ ] UI component contrast >= 3:1 against adjacent colors (borders, icons, focus rings)
- [ ] Text resizable to 200% without loss of content or function
- [ ] No text embedded in images (except logos)
- [ ] Line height >= 1.5x font size, paragraph spacing >= 2x font size
- [ ] Content reflows at 320px width without horizontal scrolling

#### Structure
- [ ] One `<h1>` per page, headings follow hierarchy (no skipping h2 to h4)
- [ ] Lists use `<ul>`, `<ol>`, `<dl>` — not styled divs
- [ ] Data tables use `<th>` with `scope` attribute
- [ ] Landmarks present: `<main>`, `<nav>`, `<header>`, `<footer>`
- [ ] Language attribute set on `<html>` element

### Operable

#### Keyboard
- [ ] All interactive elements reachable by Tab key
- [ ] Tab order matches visual order
- [ ] No keyboard traps (can Tab into AND out of every component)
- [ ] Custom components (dropdowns, modals, tabs) have correct keyboard patterns
- [ ] Escape closes modals and popups
- [ ] Focus visible on every interactive element (outline or equivalent)
- [ ] Skip-to-content link as first focusable element

#### Focus Management
- [ ] Focus moves to modal when opened, returns when closed
- [ ] Focus moves to new content when dynamically loaded
- [ ] Focus never moves unexpectedly (no auto-focus on load unless login form)
- [ ] Focus indicator has >= 3:1 contrast against adjacent colors
- [ ] Focus is not hidden or suppressed (`outline: none` without replacement)

#### Timing and Motion
- [ ] No time limits, or user can extend/turn off
- [ ] Auto-updating content can be paused (carousels, live feeds)
- [ ] Animations respect `prefers-reduced-motion` media query
- [ ] No content flashes more than 3 times per second

### Understandable

#### Forms
- [ ] Every input has a programmatic label (`<label for>` or `aria-label`)
- [ ] Error messages identify the field AND describe the problem
- [ ] Required fields indicated programmatically (`aria-required="true"` or `required`)
- [ ] Input purpose identified with `autocomplete` attribute where applicable
- [ ] Form instructions appear before the form, not just in tooltips
- [ ] Error summary at top of form with links to each error field

#### Predictability
- [ ] No context change on focus (no navigating away when field receives focus)
- [ ] No context change on input (no form submit on selection change)
- [ ] Navigation consistent across pages
- [ ] Components named consistently across pages

### Robust

#### ARIA
- [ ] ARIA roles match the component behavior (not decorative ARIA)
- [ ] `aria-label` or `aria-labelledby` on components without visible text
- [ ] `aria-live="polite"` on dynamic content regions (notifications, updates)
- [ ] `aria-expanded` on toggleable controls (accordions, dropdowns)
- [ ] `role="alert"` on error messages that appear dynamically
- [ ] No redundant ARIA (`role="button"` on `<button>` is redundant)
- [ ] `aria-hidden="true"` on decorative/duplicate content

## Contrast Ratio Reference

Calculate: `(L1 + 0.05) / (L2 + 0.05)` where L1 is lighter relative luminance.

| Requirement | Ratio | Applies To |
|-------------|-------|------------|
| AA normal text | 4.5:1 | Body text, labels, links |
| AA large text | 3:1 | 18px+ regular, 14px+ bold |
| AA UI components | 3:1 | Borders, icons, focus indicators |
| AAA normal text | 7:1 | Enhanced (target for critical text) |

### Common Failures
- Light gray text on white: `#999 on #fff` = 2.85:1 (FAIL)
- Placeholder text: browsers default to ~2:1 contrast (FAIL for required info)
- Disabled states: exempt from contrast but must be identifiable

## Automated Testing Commands

```bash
# axe-core via CLI
npx @axe-core/cli http://localhost:3000

# Lighthouse accessibility audit
npx lighthouse http://localhost:3000 --only-categories=accessibility --output=json

# Pa11y — WCAG2AA by default
npx pa11y http://localhost:3000
```

### What Automation Misses (Manual Check Required)
- Alt text quality (present but wrong)
- Logical tab order (technically reachable but confusing)
- Meaningful link text in context
- Correct heading hierarchy for content
- Keyboard interaction patterns on custom widgets
- Screen reader announcement order

## Severity Guide

| Finding | Severity |
|---------|----------|
| No keyboard access to interactive element | CRITICAL |
| Keyboard trap (can't Tab out) | CRITICAL |
| Missing form labels (no programmatic association) | HIGH |
| Text contrast below 3:1 | HIGH |
| Missing alt text on informational images | HIGH |
| Heading hierarchy skipped | MEDIUM |
| Missing ARIA live region on dynamic content | MEDIUM |
| Focus indicator low contrast | MEDIUM |
| Decorative image has descriptive alt text | LOW |
| Missing `autocomplete` attribute | LOW |
