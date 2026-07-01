# Frontend UI Rules

## Purpose

This document defines the first ADHDice frontend UI system foundation from already-approved live UI. It exists to help future implementation tickets reuse existing ADHDice patterns instead of inventing one-off styling.

## Required Rule For Future Codex Frontend Work

- Codex must not invent new chip, card, panel, or menu styling when an approved ADHDice pattern already exists.
- When a request says "chip," default to the approved list rail chip family.
- Prefer minimal extraction or reuse of approved sources over rewriting working UI.
- If a new semantic chip color is needed, preserve the approved geometry, font size, font weight, radius, border weight, and visual density.

## Approved Source Categories

- Chips: approved and active source.
- Segmented toggles: approved and active source.
- Dropdown/menu shell: approved and active source.
- Edit Task panels: approved visual source, deferred extraction.
- List View cards: approved visual source, deferred extraction.

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

## Deferred Approved Sources: Edit Task Panels And List View Cards

- Edit Task panels in `src/components/ui/task-management-table-v2.tsx` are approved visual sources for future extraction work.
- List View cards in `src/components/task-app/tasks-list-adapter.tsx` are approved visual sources for future extraction work.
- These sources are deferred for later tickets and should not be opportunistically extracted here.

## Forbidden Frontend Behavior

- Do not invent a new chip family when the approved one already fits.
- Do not introduce native/system dropdown styling for ADHDice menus.
- Do not opportunistically migrate unrelated old UI during a different feature ticket.
- Do not restyle deferred Edit Task panels or List View cards inside unrelated work.
- Do not broaden small frontend tickets into redesign passes.

## Migration Policy

- Reuse approved live sources first.
- Extract the smallest reusable primitive that preserves live output.
- Adopt new primitives only where the change is behavior-neutral and visually identical.
- If a surface is risky because of drag, reorder, selection, or other interaction complexity, leave it in place and document the blocker.
- Do not migrate ugly old UI opportunistically inside unrelated feature tickets.
