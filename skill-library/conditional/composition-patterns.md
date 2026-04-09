---
name: composition-patterns
description: Compound components, state lifting, render props, variant components, slot patterns for flexible React architecture
when_to_use: During builds of frontend nodes to design flexible, composable component APIs
priority: 70
source: Vercel Labs
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [builder]
tech_filter: [react]
---

# Composition Patterns

## Compound Components

Components that share implicit state through Context. Best for tightly-related UI groups.

### Pattern
```typescript
// The parent owns the state
function Select({ children, value, onChange }: SelectProps) {
  return (
    <SelectContext.Provider value={{ value, onChange }}>
      <div role="listbox">{children}</div>
    </SelectContext.Provider>
  );
}

// Children read from context
function Option({ value, children }: OptionProps) {
  const ctx = useSelectContext();
  const isSelected = ctx.value === value;
  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={() => ctx.onChange(value)}
    >
      {children}
    </div>
  );
}

// Attach as static properties
Select.Option = Option;

// Usage — clean, declarative
<Select value={role} onChange={setRole}>
  <Select.Option value="admin">Admin</Select.Option>
  <Select.Option value="editor">Editor</Select.Option>
  <Select.Option value="viewer">Viewer</Select.Option>
</Select>
```

### When to Use Compound Components
- Component has 2+ sub-parts that must share state (Tabs, Accordion, Select, Menu)
- API would otherwise require 5+ props (configuration object smell)
- Sub-parts can appear in different orders or combinations
- The parent-child relationship is semantically meaningful

### When NOT to Use
- Only 1-2 simple props needed (just use props)
- No shared state between parts (just use children)
- Components are used independently in different contexts

## State Lifting

Move state to the lowest common ancestor of components that need it.

### Decision Framework
```
Component A and Component B both need stateX?

Are they siblings?
  → Lift stateX to parent

Is parent too far up (prop drilling > 2 levels)?
  → Use Context at the subtree root
  → OR restructure: move components closer together

Does lifting cause unnecessary re-renders?
  → Split state: fast-changing state stays low, slow-changing lifts
  → OR use Context with useMemo on the value
```

### Rules
- [ ] State lives at the lowest point where all consumers can access it
- [ ] Lifted state is passed down as props (not through refs or globals)
- [ ] If lifting causes prop drilling >2 levels, use Context
- [ ] Colocate state with behavior: form state in form component, not app root

## Render Props (Legacy) vs Custom Hooks (Modern)

Use render props when the component manages DOM (event listeners, refs). Prefer custom hooks when there's no DOM to manage -- hooks are simpler and compose better.

## Variant Components

Use `cva` (class-variance-authority) for typed variant props:
- Define variants as enums: `variant: { primary, secondary, danger, ghost }`, `size: { sm, md, lg }`
- Set `defaultVariants` for the most common use case
- Name variants by purpose ("danger" not "red")
- Accept `className` for one-off overrides
- Loading/disabled states must work across all variants

## Slot Pattern

Named content areas (`header?`, `footer?`, `actions?`, `children`) via typed ReactNode props. Use when component has distinct visual regions and consumer needs to customize content per region. Component controls layout, consumer controls content.

## Composition Checklist

- [ ] Props count under 7 (if more, consider compound components or slots)
- [ ] No boolean prop explosion (variant enum > 3 booleans)
- [ ] `children` used for primary content (not a named prop)
- [ ] Forwarded refs on components that wrap DOM elements (`forwardRef`)
- [ ] Spread remaining props to root DOM element (`...props`)
- [ ] Component is keyboard-accessible (role, aria attributes, key handlers)
- [ ] TypeScript types are strict (no `any`, explicit union types for variants)

## Severity Guide

| Finding | Severity |
|---------|----------|
| Prop drilling >3 levels deep | MEDIUM |
| Component with >10 props (needs composition) | MEDIUM |
| Duplicated state between sibling components | MEDIUM |
| Boolean prop set controlling unrelated behaviors | LOW |
| Missing forwardRef on wrapper component | LOW |
| Variant component missing disabled/loading states | LOW |
