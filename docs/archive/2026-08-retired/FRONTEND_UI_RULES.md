> Retired on 2026-08-03. Historical reference only. Durable design guidance moved to [`docs/UI_SYSTEM.md`](../../UI_SYSTEM.md); implementation lookup moved to [`docs/UI_SOURCE_MAP.md`](../../UI_SOURCE_MAP.md). Agents should not load this archived file as current authority.

# Frontend UI Rules

## Purpose

This document defines the first ADHDice frontend UI system foundation from already-approved live UI. It exists to help future implementation tickets reuse existing ADHDice patterns instead of inventing one-off styling.

## Required Rule For Future Codex Frontend Work

- Codex must not invent new chip, card, panel, or menu styling when an approved ADHDice pattern already exists.
- When a request says "chip," default to the approved list rail chip family.
- Prefer minimal extraction or reuse of approved sources over rewriting working UI.
- If a new semantic chip color is needed, preserve the approved geometry, font size, font weight, radius, border weight, and visual density.

## Frontend UI Checklist

- Read `docs/FRONTEND_UI_RULES.md` and `docs/UI_SOURCE_MAP.md` before frontend work.
- Use `AdhdChip` for chips, filter pills, and menu chips.
- Use `AdhdDropdownPanel` for dropdown shells.
- Use `AdhdIconButton` with the `rowToolbar` variant for task-row and list-row toolbar icons.
- Use `AdhdPanel` for overlays, inlays, and metadata panels.
- Use `AdhdCard` for task-like cards, records, PATHS cards, reports, and notes.
- Do not invent new styling unless Andrew explicitly approves it.
- If a ticket does not use an approved primitive, explain why before or in the implementation summary.

## Required Codex Prompt Block

Copy-paste this block into future ADHDice frontend tickets:

```md
Frontend UI guardrails for ADHDice:
- Read `docs/FRONTEND_UI_RULES.md` and `docs/UI_SOURCE_MAP.md` before editing.
- Reuse approved ADHDice primitives and source surfaces.
- Use `AdhdChip` for chips/filter pills/menu chips.
- Use `AdhdDropdownPanel` for dropdown shells.
- Use `AdhdIconButton` `rowToolbar` for task/list row toolbar icons.
- Use `AdhdPanel` for overlays/inlays/metadata panels.
- Use `AdhdCard` for task-like cards, records, PATHS, reports, and notes.
- Do not invent new styling unless Andrew explicitly approves it.
- If not using an approved primitive, explain why.
- Do not migrate deferred legacy surfaces unless this ticket explicitly asks for it.
```

## Approved Source Categories

- Chips: approved and active source.
- Segmented toggles: approved and active source.
- Dropdown/menu shell: approved and active source.
- Panels / overlays / inlays: approved primitive source.
- Cards: approved primitive source.
- Icon buttons: approved primitive source.
- Edit Task panels: approved visual source, deferred live migration.
- List View cards: approved visual source, deferred live migration.

## Chips

- The default ADHDice chip family comes from the shared task-table chip primitives and the live Tasks rail chip usage.
- Approved geometry and typography come from `TASK_TABLE_CHIP_BASE_CLASS`, `TASK_TABLE_LIST_CHIP_CLASS`, `TASK_TABLE_ACTIVE_LIST_CHIP_CLASS`, and `TaskTableChipButton`.
- The default chip baseline should stay compact, rounded, medium-weight, and visually dense.
- Semantic chips may vary in color only when needed for meaning, but they should keep the same geometry.

## Segmented Toggles

- The Tasks / Paths toggle is the approved segmented toggle source.
- Future segmented toggles should follow that exact visual family before introducing anything new.
- Segmented toggles should behave like chips inside a grouped shell, not like native tabs or browser-default toggles.

## Dropdown/Menu Shell

- The custom opaque white ADHDice dropdown shell is approved.
- Use the existing ADHDice floating shell with rounded corners, lavender border, light shadow, and backdrop blur.
- Native or system dropdown styling is not approved for ADHDice UI.
- This ticket approves the shell only. Inner menu row typography and chip treatments are still allowed to evolve later.

## Panels / Overlays / Inlays

- Use `AdhdPanel` for new overlays, inlays, metadata panels, and floating detail panels.
- Approved panel language comes from the Table inspector/editor shells: opaque or near-opaque white surface, soft lavender border, rounded corners, light floating shadow, calm spacing, and purple-gray label treatment.
- Do not assume panels must be two columns. Layout remains ticket-specific.
- `subpanel` is the approved lighter inner-panel treatment for metadata areas nested inside a larger panel.
- Do not import task-table editing logic into new panel primitives.

## Cards

- Use `AdhdCard` for new task-like cards, record cards, path cards, note cards, or report cards unless a different approved source is explicitly named.
- Approved card language comes from the List View task card shell: wide white card, subtle lavender border, calm spacing, light hierarchy, and soft rounded corners.
- Card primitives should stay task-agnostic. Metadata rows, step previews, and quick panels remain optional consumers, not built-in card behavior.

## Icon Buttons

- Use `AdhdIconButton` for icon-only actions.
- The approved icon-button language comes from the existing List View circular action controls: soft border, white or tinted fill, calm hover shift, and lavender-focused ring treatment.
- Do not create oversized icon buttons by default. The current List View top-right `h-10 w-10` buttons are not the new default standard.
- Default new icon-only actions to the compact size unless the surrounding UI clearly needs a larger touch target.

## Deferred Approved Sources: Edit Task Panels And List View Cards

- Edit Task panels in `src/components/ui/task-management-table-v2.tsx` are approved visual sources for future extraction work.
- List View cards in `src/components/task-app/tasks-list-adapter.tsx` are approved visual sources for future extraction work.
- The new `AdhdPanel`, `AdhdCard`, and `AdhdIconButton` primitives exist for future adoption, but this ticket does not approve opportunistic live migration of Edit Task or List View.

## Forbidden Frontend Behavior

- Do not invent a new chip family when the approved one already fits.
- Do not introduce native/system dropdown styling for ADHDice menus.
- Do not assume every panel should inherit a two-column editor layout.
- Do not create oversized icon-only controls as a default pattern.
- Do not opportunistically migrate unrelated old UI during a different feature ticket.
- Do not restyle deferred Edit Task panels or List View cards inside unrelated work.
- Do not broaden small frontend tickets into redesign passes.

## Migration Policy

- Reuse approved live sources first.
- Extract the smallest reusable primitive that preserves live output.
- Adopt new primitives only where the change is behavior-neutral and visually identical.
- If a surface is risky because of drag, reorder, selection, or other interaction complexity, leave it in place and document the blocker.
- Do not migrate ugly old UI opportunistically inside unrelated feature tickets.
- Do not migrate Edit Task or List View opportunistically inside unrelated tickets, even though the primitives now exist.

## Do Not Migrate Unless Requested

- `src/components/task-app/task-editor-modal.tsx`
- `src/components/task-app/task-secondary-views.tsx`
- Broad List View card migration.
- Broad Edit Task overlay migration.
- Broad Table View density changes.
- Broad menu-system extraction.
- Unrelated chip cleanup.
