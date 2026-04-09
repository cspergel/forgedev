---
name: react-best-practices
description: 69 performance rules across 8 categories — rendering, state, effects, components, data fetching, accessibility, patterns, anti-patterns
when_to_use: During code generation for React and Next.js frontend nodes
priority: 80
source: Vercel Labs (277K installs)
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [builder]
tech_filter: [react, nextjs]
---

# React Best Practices

## 1. Component Design

- One component per file. File name matches component name (PascalCase).
- Max 150 lines per component. Extract sub-components at 100+.
- Props interface co-located above the component, exported if shared.
- Use `children` prop for composition. Avoid prop drilling past 2 levels.
- Prefer function components. Never use class components in new code.

```tsx
interface UserCardProps {
  readonly user: User;
  readonly onSelect: (id: string) => void;
}
```

## 2. Rendering Performance

- **Stable references:** Wrap callbacks in `useCallback`, computed objects in `useMemo` — but only when passed as props to memoized children.
- **Avoid premature memo:** Don't `React.memo()` everything. Measure first with React DevTools Profiler.
- **Key stability:** Use stable IDs for list keys, never array index (unless list is static and never reordered).
- **Conditional rendering:** Use early returns, not nested ternaries. Avoid `&&` with numbers (use `Boolean(count) &&`).
- **Lazy loading:** `React.lazy()` + `Suspense` for route-level splits. Don't lazy-load components under 5KB.

## 3. State Management

- **Lift state only when shared.** Keep state as close to its consumer as possible.
- **Derive, don't store.** If computable from existing state, compute it — no `useEffect` sync.
- **Single source of truth.** Never duplicate server state in local state — use React Query / SWR.
- **Reducer for complex state.** 3+ related `useState` calls = refactor to `useReducer`.
- **URL as state.** Pagination, filters, search — use URL params, not React state.

```tsx
// GOOD: Derived value
const total = items.reduce((sum, i) => sum + i.price, 0);

// BAD: Synced state
const [total, setTotal] = useState(0);
useEffect(() => { setTotal(items.reduce(...)) }, [items]);
```

## 4. Effects

- **No data fetching in useEffect.** Use React Query, SWR, or server components.
- **Cleanup always.** Every subscription, timer, or listener must return a cleanup function.
- **Minimal deps.** If the dependency array is 4+ items, the effect is doing too much — split it.
- **No state sync effects.** If an effect just sets state from other state, derive it instead.
- **Event handlers over effects.** If something happens in response to a user action, put it in the handler.

## 5. Data Fetching

- Use server components for initial data (Next.js App Router).
- Client fetching: React Query with `staleTime` configured per resource.
- Loading states: Suspense boundaries at route level, skeleton components for sections.
- Error boundaries: One per route segment minimum. Show recovery action, not just error text.
- Optimistic updates for mutations that must feel instant (likes, toggles).

## 6. Forms

- Use controlled inputs for validation. Uncontrolled + `FormData` for simple submissions.
- Validate on blur (not every keystroke). Show errors below the field.
- Disable submit during pending. Show spinner inside the button.
- Server-side validation is mandatory — client validation is UX only.

## 7. Accessibility

- Every interactive element must be keyboard-navigable (Tab, Enter, Escape).
- Images: `alt` text always. Decorative images get `alt=""`.
- Form inputs: associated `<label>` or `aria-label`. Never placeholder-only.
- Color contrast: 4.5:1 minimum for text, 3:1 for large text.
- Focus management: trap focus in modals, restore on close.
- Announce dynamic content changes with `aria-live` regions.

## 8. Patterns to Use

- **Compound components** for related UI (Tabs + Tab + TabPanel)
- **Render props / children-as-function** for headless behavior sharing
- **Custom hooks** for reusable stateful logic (prefix with `use`)
- **Context + useReducer** for localized shared state (not global app state)
- **Portals** for modals, tooltips, toasts — render outside DOM hierarchy

## Anti-Patterns — Reject These

- **Prop drilling 3+ levels** — use Context or composition
- **State in parent for single-child use** — push state down
- **`useEffect` for derived state** — compute inline
- **Fetching in `useEffect`** — use data fetching library
- **Inline object/array literals as props** — creates new reference every render
- **Index as key on dynamic lists** — use stable IDs
- **Barrel exports from component directories** — causes bundle bloat
- **God components (300+ lines)** — decompose by responsibility
- **Mixing server and client concerns** — respect the component boundary
