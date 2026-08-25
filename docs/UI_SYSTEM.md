# ADHDice UI System

Last reviewed: 2026-08-03
Role: canonical active authority

## Purpose and Visual Direction

ADHDice UI should feel calm, compact, readable, and structured. Reuse the visual
language established by approved live surfaces instead of inventing local styling.

The system favors quiet borders, soft fills, restrained lavender accents, clear
hierarchy, comfortable grouping, and compact density. Interaction should remain
legible without becoming visually loud or crowded.

## Typography and Text

- Use sentence case for labels and controls; do not use all caps for routine UI.
- Keep routine metadata and compact controls at the established chip scale and
  medium weight unless a documented larger control family is required.
- Preserve readable hierarchy between titles, labels, values, helper text, and
  muted states.
- Avoid wide tracking, extra-bold routine labels, and text that is smaller than
  the surrounding approved control family.
- Prefer existing semantic color meaning: green for success, blue for supportive
  progress, red for destructive states, and gray for inactive or empty states.

## Chips and Text-Labeled Controls

- Use the canonical `AdhdChip` primitive for chips, filter pills, menu chips,
  status pills, metadata, and compact text-labeled actions.
- Keep the default chip language compact, rounded, medium-weight, and visually
  dense, with quiet borders and soft fills.
- Preserve chip geometry when introducing a new semantic tone; color may change
  for meaning, but the basic density and shape should remain stable.
- Controls containing an icon and visible text use explicit inline-flex alignment
  and the compact `gap-1` rhythm by default. Use `gap-2` only for an established
  larger family.
- Do not rely on JSX whitespace, literal label spaces, or one-off icon margins
  when a flex gap is available.
- Use a larger non-chip text control only for a documented action-row need or
  another deliberate exception.

## Segmented Controls

- Treat segmented controls as grouped chips with selected and inactive states.
- Reuse the approved Tasks / Paths segmented-toggle family before introducing a
  new toggle treatment.
- Do not default to native tabs, browser-default toggles, or unrelated button
  styling for a segmented control.

## Icon Buttons

- Use `AdhdIconButton` for icon-only actions.
- Use its compact `rowToolbar` treatment for task-row and list-row toolbar icons
  when the surrounding surface uses row actions.
- Default new icon-only actions to compact sizing while preserving an adequate
  touch target for the surrounding interaction.
- Do not use circular List View card controls as the general icon-button default;
  a larger or specialized control requires a local product reason.
- Preserve visible hover, focus, selected, and danger states without making the
  control visually dominant.

## Cards, Panels, and Overlays

- Use `AdhdCard` for task-like cards, records, PATHS cards, reports, notes, and
  other task-agnostic card surfaces.
- Use `AdhdPanel` for overlays, inlays, metadata panels, and floating detail
  surfaces. Use `subpanel` for a lighter inner panel when nesting is needed.
- Cards and panels should use calm spacing, soft rounded surfaces, restrained
  borders, and light elevation.
- Do not assume every panel needs a two-column editor layout.
- Keep card primitives task-agnostic; metadata rows, previews, and quick panels
  remain optional consumers rather than built-in behavior.
- Do not import table editing logic or unrelated flow behavior into a visual
  primitive.

## Dropdowns and Menus

- Use `AdhdDropdownPanel` for approved dropdown and floating menu shells.
- Use the opaque or near-opaque white surface, rounded corners, lavender border,
  light shadow, and restrained backdrop treatment established by the shell.
- Native or system dropdown styling is not the ADHDice default.
- The shell is standardized; inner menu rows, wording, and specialized controls
  remain ticket-specific unless the source map says they are standardized.
- Keep menu content aligned, readable, and sized to its content where the local
  interaction calls for a compact menu rather than a forced wide panel.

## Spacing and Density

- Prefer the smallest spacing that preserves readable grouping and reliable input.
- Keep related controls visually grouped and avoid accidental gaps caused by
  literal text or local margins.
- Preserve the density of the approved source surface when extracting a primitive.
- Do not add padding, radii, shadows, or control scales solely to make a local
  component look more distinctive.

## Responsive Behavior

- Let controls wrap, scroll, or stack deliberately when available width changes;
  do not cap or alter underlying data merely to avoid overflow.
- Preserve native touch, trackpad, wheel, and keyboard scrolling for horizontal
  content.
- Keep enough content and viewport padding that overlay controls do not obscure
  the first or last item.
- Recheck icon-label spacing and compact controls at narrow mobile widths as well
  as desktop widths.

## Accessibility and Interaction

- Use semantic buttons and controls with accessible names that describe the action
  or direction; icon-only controls require an accessible label.
- Keep interactive regions keyboard reachable and preserve a visible focus state.
- Directional overflow controls should appear only when overflow exists in that
  direction and should not replace native scrolling.
- Respect reduced-motion preferences for animated transitions and scrolling.
- Preserve disabled, selected, danger, and focus states clearly without relying on
  color alone where the state is important.

## Prohibited Styling

- Do not invent a new chip, card, panel, menu, typography, or interaction family
  when an approved pattern already fits.
- Do not introduce one-off radii, padding, tracking, density, or semantic colors
  without a documented product reason.
- Do not use native dropdown styling as a substitute for the approved shell.
- Do not make oversized icon-only controls the default.
- Do not turn a focused frontend ticket into a redesign pass or broad cleanup.

## Reuse and Migration Policy

- Reuse an approved live source before extracting or rewriting a pattern.
- Extract the smallest primitive that preserves the live visual output and behavior.
- Adopt a primitive only when the change is behavior-neutral and visually aligned.
- Leave risky drag, reorder, selection, or flow-heavy surfaces in place until a
  dedicated migration ticket addresses them.
- Do not migrate deferred legacy surfaces or unrelated old UI opportunistically.
- If a ticket does not use an approved primitive, explain the deliberate exception.

## Related Documents

- [`UI_SOURCE_MAP.md`](UI_SOURCE_MAP.md) — current source files, exclusions, and migration status.
- `npm run audit:text-buttons` — available text-control drift audit; scan coverage and continued usefulness require a separate tooling freshness review.
