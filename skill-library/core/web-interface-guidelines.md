---
name: web-interface-guidelines
description: 99 specific UX rules across 7 categories for auditing web interfaces during pathfinder sweeps
when_to_use: During pathfinder sweeps to audit user-facing interfaces for UX quality, interaction patterns, and user journey completeness
priority: 85
source: Vercel Labs
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [sweep-pathfinder]
tech_filter: []
---

# Web Interface Guidelines

99 rules across 7 categories. Every rule is auditable against code.

## 1. Navigation (14 rules)

- [ ] Every page reachable in 3 clicks or fewer from landing
- [ ] Current page/section is visually indicated in navigation
- [ ] Back button works correctly on every page (no broken history)
- [ ] Deep links work — every meaningful state has a URL
- [ ] 404 page exists with navigation back to known-good pages
- [ ] Breadcrumbs on any page more than 2 levels deep
- [ ] Tab order follows visual layout (left-to-right, top-to-bottom)
- [ ] Skip-to-content link is first focusable element
- [ ] Logo links to home page
- [ ] Navigation is consistent across all pages (same position, same items)
- [ ] Mobile navigation collapses to a reachable hamburger/drawer
- [ ] No orphan pages (pages with no inbound links)
- [ ] Pagination controls are keyboard-accessible
- [ ] Infinite scroll has a "load more" fallback for accessibility

## 2. Forms (16 rules)

- [ ] Every input has a visible label (not just placeholder)
- [ ] Required fields are marked (asterisk or "required" text)
- [ ] Validation errors appear next to the field, not just at top of form
- [ ] Error messages say what's wrong AND how to fix it
- [ ] Submit button is disabled during submission (prevent double submit)
- [ ] Form preserves input on validation failure (no clearing fields)
- [ ] Success feedback is visible and unambiguous after submit
- [ ] Tab order through fields follows visual order
- [ ] Autocomplete attributes set correctly (email, name, address, tel)
- [ ] Password fields have show/hide toggle
- [ ] File upload shows selected filename and allows removal
- [ ] Multi-step forms show progress indicator
- [ ] Long forms are broken into sections or steps
- [ ] Confirmation before destructive actions (delete, discard changes)
- [ ] Unsaved changes warning when navigating away from dirty form
- [ ] Date inputs use native date picker or well-tested library

## 3. Feedback (14 rules)

- [ ] Loading states visible for any operation >200ms
- [ ] Skeleton screens or spinners — never blank screen while loading
- [ ] Error states are distinct from empty states
- [ ] Empty states have a call-to-action ("No items yet — create one")
- [ ] Success messages auto-dismiss (toast) or have manual dismiss
- [ ] Error messages persist until user dismisses or fixes the issue
- [ ] Progress indicators for multi-step operations
- [ ] Optimistic UI updates with rollback on failure
- [ ] Network error shows retry option, not just error message
- [ ] Rate limit hit shows "try again in X seconds"
- [ ] Toast/notification stacking — multiple messages don't overlap
- [ ] No alert() or confirm() dialogs — use inline UI
- [ ] Disabled buttons have tooltip explaining why they're disabled
- [ ] Action completion is obvious (item added to list, redirect to detail)

## 4. Content (14 rules)

- [ ] No placeholder text in production ("Lorem ipsum", "TODO", "test")
- [ ] Consistent terminology — same concept uses same word everywhere
- [ ] Button labels are specific ("Save Changes", not "Submit")
- [ ] Links describe their destination ("View invoice", not "Click here")
- [ ] Error copy is human-readable (not error codes or stack traces)
- [ ] Dates are formatted for the user's locale
- [ ] Numbers are formatted with appropriate separators (1,000 not 1000)
- [ ] Currency shows symbol and code for international apps
- [ ] Truncated text has tooltip or expand option showing full content
- [ ] Table headers are descriptive and sortable where appropriate
- [ ] No jargon or developer terminology in user-facing text
- [ ] Help text or tooltips for non-obvious fields
- [ ] Consistent capitalization (Title Case for headings, sentence case for labels)
- [ ] Plural handling correct ("1 item" vs "2 items", not "1 item(s)")

## 5. Responsive Design (13 rules)

- [ ] Usable at 320px viewport width (minimum mobile)
- [ ] No horizontal scrolling on any viewport
- [ ] Touch targets minimum 44x44px on mobile
- [ ] Text readable without zooming (minimum 16px body text)
- [ ] Images scale with viewport (no overflow, no distortion)
- [ ] Tables have horizontal scroll wrapper OR reflow to cards on mobile
- [ ] Modals fit within viewport on mobile (no content cut off)
- [ ] Fixed elements (headers, footers) don't consume >20% of mobile viewport
- [ ] Critical actions reachable with thumb on mobile (bottom-half of screen)
- [ ] Viewport meta tag present and correct
- [ ] Media queries use min-width (mobile-first) not max-width
- [ ] Print stylesheet hides navigation, shows content
- [ ] No hover-only interactions — every hover action has a tap equivalent

## 6. Performance UX (14 rules)

- [ ] First meaningful content visible within 1.5 seconds
- [ ] Interactive within 3 seconds on 3G connection
- [ ] No layout shift after initial render (CLS < 0.1)
- [ ] Images have explicit width/height to prevent layout shift
- [ ] Above-the-fold images are eager-loaded, below-fold are lazy
- [ ] Route transitions feel instant (<100ms perceived)
- [ ] Search results appear as user types (debounced 300ms)
- [ ] Large lists use virtualization (render only visible items)
- [ ] File uploads show progress percentage
- [ ] Expensive operations don't block the main thread
- [ ] No flash of unstyled content (FOUC)
- [ ] Font loading doesn't cause text reflow (use font-display: swap)
- [ ] Pagination or infinite scroll for lists >50 items
- [ ] API calls are deduplicated (no identical concurrent requests)

## 7. Security UX (14 rules)

- [ ] Login form doesn't reveal whether email exists ("Invalid credentials" not "Email not found")
- [ ] Password requirements shown before user types (not just on error)
- [ ] Session timeout warns before logout (not abrupt redirect)
- [ ] Logout clears all client-side state (tokens, caches, form data)
- [ ] Sensitive actions require re-authentication (password change, delete account)
- [ ] OAuth consent screen shows exactly what permissions are requested
- [ ] HTTPS indicators visible — no mixed content warnings
- [ ] Copy-paste allowed on password fields (password managers need it)
- [ ] Autofill works correctly on login forms
- [ ] MFA setup shows recovery codes with explicit "I saved these" confirmation
- [ ] API errors don't leak internal details to the user
- [ ] File download prompts show filename and size before downloading
- [ ] External links open in new tab with `rel="noopener noreferrer"`
- [ ] No sensitive data in URL query parameters (visible in browser history)

## Severity Guide

| Finding | Severity |
|---------|----------|
| No loading states (blank screen during fetch) | HIGH |
| Form clears on validation error | HIGH |
| No error handling visible to user | HIGH |
| Missing empty states | MEDIUM |
| Inconsistent navigation | MEDIUM |
| Touch targets too small on mobile | MEDIUM |
| Placeholder text in production | MEDIUM |
| Missing breadcrumbs on deep pages | LOW |
| Button labels are generic ("Submit") | LOW |
