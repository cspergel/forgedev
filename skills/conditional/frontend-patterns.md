---
name: frontend-patterns
description: General React patterns for non-Next.js projects — state management, data fetching, routing, error boundaries
when_to_use: During builds of frontend nodes in React projects that don't use Next.js
priority: 70
source: react-patterns
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [builder]
tech_filter: [react]
---

# Frontend Patterns (React)

## Project Structure

```
src/
  components/        # Shared UI components (Button, Modal, Table)
    ui/              # Atomic components (no business logic)
  features/          # Feature modules (one per domain concept)
    auth/
      components/    # Feature-specific components
      hooks/         # Feature-specific hooks
      api.ts         # API calls for this feature
      types.ts       # Types for this feature
  hooks/             # Shared custom hooks
  lib/               # Utilities, API client setup, constants
  routes/            # Route definitions (pages/views)
  types/             # Shared types (from shared_models)
```

### Structure Rules
- [ ] Components in `components/` are reusable — no business logic
- [ ] Feature modules are self-contained — imports from other features go through shared types
- [ ] No circular imports between features
- [ ] Route components are thin — delegate to feature components
- [ ] API calls live in feature modules, not in components

## State Management

### State Rules
Server data → React Query/SWR. URL state → useSearchParams. Shared UI → Context or Zustand. Local → useState.
- [ ] Server state managed by data-fetching library (not useState)
- [ ] No prop drilling past 2 levels (use Context or composition)
- [ ] Global state is minimal (auth user, theme, locale — not form data)
- [ ] Derived state is computed, not stored (`const total = items.reduce(...)`)
- [ ] No useState for values derivable from props or other state

### Context Checklist
- [ ] Context provider wraps only the subtree that needs it
- [ ] Context value memoized (useMemo) to prevent re-renders
- [ ] Large contexts split by update frequency (auth rarely changes, cart changes often)
- [ ] Custom hook wraps useContext with null check and clear error message

## Data Fetching

### Fetching Rules
- [ ] Every query has a unique, stable key (include all dependencies)
- [ ] Mutations invalidate related queries (`queryClient.invalidateQueries`)
- [ ] Optimistic updates for fast-feeling UI (with rollback on error)
- [ ] Loading skeleton matches the shape of the loaded content
- [ ] Error states show what went wrong and offer retry
- [ ] No useEffect + fetch (use React Query / SWR)

## Routing (React Router)

### Route Definition
```typescript
const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <RootError />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "documents", element: <DocumentList /> },
      { path: "documents/:id", element: <DocumentDetail /> },
      { path: "settings", element: <Settings /> },
    ],
  },
  { path: "/login", element: <Login /> },
  { path: "*", element: <NotFound /> },
]);
```

### Route Rules
- [ ] Every route has an error boundary (errorElement)
- [ ] Auth-protected routes redirect to login, then back after auth
- [ ] 404 catch-all route exists
- [ ] Route params validated before use (`:id` is a valid UUID?)
- [ ] Deep links work (refresh on any URL returns correct content)
- [ ] Breadcrumbs reflect route hierarchy

## Error Boundaries

### Error Boundary Rules
- [ ] Root error boundary catches unhandled errors (prevents white screen)
- [ ] Per-feature error boundaries isolate failures (one panel fails, rest works)
- [ ] Error fallback shows: what happened, retry button, navigation home
- [ ] API errors handled in component (not thrown to boundary)
- [ ] Error boundary state resets on navigation (key prop on route)

## Component Patterns

### Composition Over Props
Prefer compound components with children over boolean prop explosions. See `composition-patterns` skill for details.

### Custom Hooks
- [ ] Hook name starts with `use`
- [ ] Hook does one thing (useAuth, useDocuments, useDebounce)
- [ ] Hook returns what the component needs (not internal state management details)
- [ ] No hooks inside conditions or loops
- [ ] Dependencies array is complete (exhaustive-deps rule enabled)

### Performance
- [ ] React.memo on components rendered in lists
- [ ] useMemo for expensive computations derived from props/state
- [ ] useCallback for functions passed as props to memoized children
- [ ] Virtualization for lists >50 items (react-window, @tanstack/virtual)
- [ ] Code splitting per route (lazy + Suspense)
- [ ] No inline object/array literals in JSX props (creates new reference every render)

## Severity Guide

| Finding | Severity |
|---------|----------|
| No error boundary (white screen on error) | HIGH |
| useEffect + setState for API calls (no cache, no dedup) | HIGH |
| Prop drilling past 3 levels | MEDIUM |
| Missing loading/error/empty states | MEDIUM |
| Server state in useState instead of React Query | MEDIUM |
| Hook dependency array incomplete | MEDIUM |
| Inline objects in JSX props causing re-renders | LOW |
| Component file >200 lines (split it) | LOW |
