# UI Source Map

Last reviewed: 2026-08-03
Role: active implementation lookup

Use this document with [`UI_SYSTEM.md`](UI_SYSTEM.md). The system owns durable
rules; this map owns current sources, exclusions, and migration status.

## Primitive Readiness

| Primitive | Current source | Intended use | Exclusions | Status |
| --- | --- | --- | --- | --- |
| `AdhdChip` | `src/components/ui-system/adhd-chip.tsx` | Chips, pills, menu chips, segmented-toggle chips | Do not invent another chip family | Canonical public primitive; active |
| `AdhdIconButton` | `src/components/ui-system/adhd-icon-button.tsx` | Icon-only actions; `rowToolbar` for row actions | Circular card controls are not the general default | Active |
| `AdhdCard` | `src/components/ui-system/adhd-card.tsx` | Task-like cards, records, PATHS, reports, notes | No task-specific behavior in the primitive | Active; broad List migration deferred |
| `AdhdPanel` | `src/components/ui-system/adhd-panel.tsx` | Overlays, inlays, metadata, floating detail | Do not import table editing or flow logic | Active; broad Edit Task migration deferred |
| `AdhdDropdownPanel` | `src/components/ui-system/adhd-dropdown-panel.tsx` | Dropdown and floating menu shells | Inner menu rows remain local unless listed below | Active |

`TaskTableChipButton` in `src/components/ui/task-table-primitives.tsx` is the
lower-level task-table implementation used by `AdhdChip` for its simple case.
It remains a compatibility/source implementation, not a second canonical public
primitive for new work.

## Approved Source Surfaces

| Pattern | Current source | Intended use | Important exclusion | Status |
| --- | --- | --- | --- | --- |
| Segmented controls | `src/components/task-app/tasks-surface-switch.tsx` | Grouped Tasks / Paths toggle using `AdhdChip` | Do not copy feature state or wording | Approved; safe when output is preserved |
| Chip baseline | `src/components/ui/task-table-primitives.tsx` | Compact geometry and button semantics behind `AdhdChip` | Do not copy unrelated table helpers | Active implementation source |
| Live rail chips | `src/components/task-app/tasks-page.tsx` | Active/inactive rail and toolbar chip usage | Do not copy reorder or page state wiring | Partial live adoption source |
| Dropdown shell | `src/components/task-app/tasks-page.tsx` | Columns and matching floating shells | Inner menu system is not globally extracted | Approved shell; broader extraction deferred |
| Panel visuals | `src/components/ui/task-management-table-v2.tsx` | Edit Task overlay and inlay visual source | Do not copy editing logic or internals | Approved visual source; migration deferred |
| Card visuals | `src/components/task-app/tasks-list-adapter.tsx` | List View task-card visual source | Do not copy row, search, or highlight logic | Approved visual source; migration deferred |
| Row-toolbar icons | `src/components/ui/task-management-table-v2.tsx` | Compact Table row actions via `AdhdIconButton` | Do not use circular card controls as the default | Approved source; row-toolbar adoption active |

## Off-Model or Deferred

| Surface | Status and exclusion |
| --- | --- |
| `src/components/task-app/task-editor-modal.tsx` | Legacy/off-model; do not copy by default |
| `src/components/task-app/task-secondary-views.tsx` | Deferred; no opportunistic cleanup |
| Desktop `TaskBucketRail` | Deferred; not the default chip source |
| `task-filter-rows` Reset Filters / `ui-pill-button-light` | Off-model; future migration only with separate approval |
| Broad Edit Task overlay migration | Deferred; not completed by primitive creation |
| Broad List View card migration | Deferred; not completed by primitive creation |

## Lookup Rules

- Prefer the active primitive or approved source above before adding local styling.
- Preserve behavior, interaction ownership, and source-surface output during reuse.
- Do not turn historical class strings into canonical API contracts.
- `npm run audit:text-buttons` remains available; scan coverage and usefulness
  require a separate tooling freshness review.

## Source Ownership Notes

- The UI-system files are the current public primitive locations for all five
  documented `Adhd*` primitives.
- The task-table file remains useful as a visual/implementation baseline for
  chips, but new callers should use `AdhdChip` rather than the lower-level button.
- The Tasks page is an approved live source for rail chips and the dropdown shell;
  page state, reorder behavior, and unrelated menu internals stay local.
- Table editing and List View files provide visual sources only; their behavior,
  row logic, search wiring, and flow ownership are not part of the primitives.
- Exact class inventories are intentionally omitted so source changes do not
  silently become documented API contracts.

## Freshness Boundary

- Primitive names and public exports were confirmed by narrow source inspection;
  no unrelated application source was reviewed for this documentation change.
- Deferred statuses describe documentation boundaries, not completed migrations.
- Recheck source locations and migration status before a future extraction ticket.
- Recheck the audit command's scan coverage in a separate tooling review.
