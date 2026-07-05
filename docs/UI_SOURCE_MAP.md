# UI Source Map

This map shows which live ADHDice UI surfaces are currently approved as source material, what future Codex work should copy from them, what should stay out of scope, and where extracted primitives should land.

## Primitive Readiness Matrix

| Primitive | Ready for new work | Default use | Notes |
| --- | --- | --- | --- |
| `AdhdChip` | Yes | Chips, filter pills, menu chips, segmented-toggle chips | Primary active primitive. Reuse before inventing new pill/button styling. |
| `AdhdDropdownPanel` | Yes | Dropdown/menu shells | Use for the shell. Inner menu layout may still be ticket-specific. |
| `AdhdIconButton` | Yes | Task/list row toolbar icons via `rowToolbar` | Reuse the compact Table row toolbar language, not the rejected circular card-button direction. |
| `AdhdPanel` | Yes | Overlays, inlays, metadata panels | Primitive is ready; broad legacy Edit Task overlay migration is still deferred. |
| `AdhdCard` | Yes | Task-like cards, records, PATHS cards, reports, notes | Primitive is ready; broad List View card migration is still deferred. |

## Chips

### `src/components/task-app/tasks-surface-switch.tsx`

- Approved source: Tasks / Paths segmented toggle.
- What to copy: grouped shell structure, chip-sized toggle treatment, selected vs inactive visual state.
- What not to copy: feature-specific `TasksSurface` behavior or wording outside segmented-toggle work.
- Primitive target: `AdhdChip` used inside grouped segmented-toggle shells.
- Migration status: approved source; safe adoption allowed when visual output stays identical.

### `src/components/ui/task-table-primitives.tsx`

- Approved source: base chip geometry and button semantics.
- What to copy: `TaskTableChipButton`, `TASK_TABLE_CHIP_BASE_CLASS`, `TASK_TABLE_LIST_CHIP_CLASS`, `TASK_TABLE_ACTIVE_LIST_CHIP_CLASS`, and related compact chip typography.
- What not to copy: unrelated table-only helpers unless the new primitive actually needs them.
- Primitive target: `AdhdChip`.
- Migration status: active primitive source of truth.

### `src/components/task-app/tasks-page.tsx`

- Approved source: list rail chips and compact toolbar chips in live Tasks UI.
- What to copy: default/inactive chip treatment, active chip treatment, compact rail density, and safe count/icon usage patterns.
- What not to copy: unrelated page-specific state wiring, reorder logic, or menu internals unless the ticket directly touches them.
- Primitive target: `AdhdChip`.
- Migration status: partial live adoption source.

## Dropdown/Menu Shell

### `src/components/task-app/tasks-page.tsx`

- Approved source: the Columns dropdown shell and matching floating menu wrappers.
- What to copy: `rounded-[1.25rem]`, lavender border, near-opaque white surface, padding, shadow, backdrop blur, and floating placement style.
- What not to copy: inner menu row styles as a locked standard for all future menus. Those are not fully approved yet.
- Primitive target: `AdhdDropdownPanel`.
- Migration status: active shell source; safe wrapper extraction approved. Tasks header dropdown inner chip/menu treatment is now partially standardized through `AdhdChip` reuse, compact menu text, inline checkmark spacing, left-aligned content-width dropdown chips instead of full-width row pills, and shrink-wrapped chip-only dropdown panels instead of wide enforced minimums, while broader menu-system extraction remains deferred.

## Panels / Overlays / Inlays

### `src/components/ui/task-management-table-v2.tsx`

- Approved source: Edit Task overlay and inlay panel visuals.
- What to copy: `fullEditorCardClass`, `fullMetadataCardClass`, `metadataPanelClass`, `OVERLAY_INPUT_CLASS`, and the live shell/spacing language.
- What not to copy: same-table editing logic, overlay behavior, or panel internals in unrelated tickets.
- Primitive target: `AdhdPanel`.
- Migration status: primitive created from approved source; live Edit Task overlay migration remains deferred.

## Cards

### `src/components/task-app/tasks-list-adapter.tsx`

- Approved source: List View card visuals.
- What to copy: the task-card shell around `rounded-[1.35rem] border p-4 shadow-[0_16px_38px_rgba(81,61,168,0.06)]`, plus the surrounding metadata chip and steps-divider hierarchy.
- What not to copy: list-specific rendering logic, row behaviors, or search/highlight wiring in unrelated tickets.
- Primitive target: `AdhdCard`.
- Migration status: primitive created from approved source; live List View card migration remains deferred.

## Icon Buttons

### `src/components/ui/task-management-table-v2.tsx`

- Approved source: Table View task row toolbar action buttons.
- What to copy: `ROW_ACTION_ICON_BUTTON_CLASS`, the selected pin override, the danger toolbar treatment, `h-7 w-7` hit area, `h-3.5 w-3.5` icons, lavender line-icon color, and the compact hover/focus density used in live table rows.
- What not to copy: broader Table behavior, row editing logic, or use the rejected circular card-button treatment for List View task actions.
- Primitive target: `AdhdIconButton` via a `rowToolbar` variant that preserves the live Table toolbar output.
- Migration status: Table row toolbar is the approved source for List/List-row task action icons; List View top-right task-card action buttons now use the row-toolbar variant, while the broader List View card shell migration remains deferred.

## Off-Model Or Deferred

### `src/components/task-app/task-editor-modal.tsx`

- Approved source: none for the new UI system foundation.
- What to copy: nothing by default.
- What not to copy: legacy task editor modal styling.
- Primitive target: none.
- Migration status: off-model/deferred.

### `src/components/task-app/task-secondary-views.tsx`

- Approved source: none for this ticket.
- What to copy: nothing by default.
- What not to copy: opportunistic secondary-view cleanup or styling.
- Primitive target: none.
- Migration status: deferred.

### Desktop `TaskBucketRail`

- Approved source: not part of the initial chip extraction baseline.
- What to copy: nothing by default in this ticket.
- What not to copy: desktop card-like rail styling as the default chip family.
- Primitive target: none for now.
- Migration status: deferred.

### `task-filter-rows` Reset Filters using `ui-pill-button-light`

- Approved source: not approved as the ADHDice chip foundation.
- What to copy: nothing by default.
- What not to copy: use this older pill styling as the new default chip baseline.
- Primitive target: future migration candidate only if separately approved.
- Migration status: off-model/deferred.
