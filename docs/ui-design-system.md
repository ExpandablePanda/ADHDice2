# ADHDice UI Design System

Last reviewed: 2026-07-14

This file is the default reference for new chips, pills, and text-labeled interactive controls in ADHDice.

## Core principle

When adding controls to new overlays, pages, or menus, reuse the same visual language already established in the task table instead of inventing a new local style.

When a control has text inside it, default to the shared task-table chip language in `src/components/ui/task-table-primitives.tsx` instead of writing a new one-off button or chip class.

In ADHDice, the default mental model is not "text button first." It is "clickable chip first."

## Chips and status pills

Default chip spec:

```ts
inline-flex items-center justify-center rounded-full border px-2 py-1 text-[13px] font-medium leading-none whitespace-nowrap
```

Use this size and type treatment for:

- status pills
- metadata chips
- passive filter chips
- inline state indicators like `Done`, `Did My Best`, `Missed`, `No Entry`
- text-labeled quick actions like `Edit`, `Save`, `Due`, `Priority`, `Clear`, `Delete`

Chip rules:

- Use sentence case, not all caps.
- Do not add wide tracking for standard chips.
- Keep chip text at `13px` and `font-medium`.
- Prefer quiet borders and soft fills over loud solid fills.
- Reuse existing semantic colors:
  - green for `Done` / success
  - blue for `Did My Best` / supportive progress
  - red for `Missed` / destructive states
  - gray for inactive / empty states

### Icon + label controls

All chip or button controls containing both an icon and a visible label must use explicit `inline-flex` alignment and `gap-1.5` by default. Use `gap-2` only when an established larger control family already uses it. Never rely on JSX whitespace, literal spaces in labels, or one-off icon margins when a flex gap is available. Text-only chips do not need a gap.

Use the shared constant with the current chip primitive:

```tsx
<TaskTableChipButton className={TASK_TABLE_ICON_LABEL_GAP_CLASS}>
  <Pause aria-hidden="true" size={12} />
  Pause task timer
</TaskTableChipButton>
```

Manual QA must verify icon/label spacing at desktop and narrow mobile widths.

### Horizontal overflow arrows

The approved horizontally overflowing chart/card pattern is implemented by `ActivitySummaryCard` in `src/components/focus-history.tsx`, with measurement helpers in `src/lib/focus-activity-scroll.ts`. Reuse those paths rather than recreating the interaction or arrow appearance.

- Use a relative outer shell around a native horizontal scroll viewport.
- Visually hide the native scrollbar with the existing `adhdice-scrollbar` utility while preserving native touch, trackpad, keyboard, wheel, and supported horizontal scrolling.
- Keep the scroll region focusable and give overlay buttons accessible direction-specific labels.
- Render circular left/right overlay controls only when overflow exists in that direction. Do not use up/down arrows for a horizontal-only surface.
- Measure boundaries with approximately `2px` tolerance.
- Scroll by approximately `max(160px, clientWidth * 0.75)` and respect reduced-motion preferences.
- Use `ResizeObserver` or equivalent measurement for viewport/content changes, and recompute when data, mode, range, or resize state changes.
- Leave enough viewport/content padding that arrows do not obscure the first or last content.
- Do not alter or cap underlying data merely to avoid overflow.

## Text controls

Rules for any interactive control with visible text:

- Default to a clickable chip using the task-table chip scale.
- Keep the text at the same visual size and weight as the table chips unless there is an explicit product reason not to.
- Treat `TaskTableChipButton` as the default implementation for text-labeled controls.
- Only use a non-chip text button when the UI truly needs a larger action row or a documented exception.
- If you make an exception, it should be deliberate and rare, not the default fallback.

## What to avoid

- all-caps pills for normal state labels
- text smaller than the table chips for routine metadata
- extra-bold chip typography
- one-off radii or padding that do not match the task table
- defaulting to conventional text buttons when a clickable chip would work
- introducing a new chip scale unless there is a clear product reason

## Source of truth

The current task-table implementation in `src/components/ui/task-management-table-v2.tsx` is the living visual baseline for chip sizing, text weight, and control tone.

The reusable implementation entry point for that language is `src/components/ui/task-table-primitives.tsx`.

The repo audit entry point for drift is `npm run audit:text-buttons`.

## Codex implementation checklist

- Before completion, inspect every new icon-and-label chip/button for explicit `inline-flex` alignment and `gap-1.5` (or an already-established larger-family `gap-2`), and verify desktop plus narrow-mobile spacing.
- For horizontal chart/card overflow, reuse the Focus Activity shell, measurement helpers, directional arrow behavior, accessibility labels, and reduced-motion contract.
