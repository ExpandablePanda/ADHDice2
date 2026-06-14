# Current State

Last reviewed: 2026-06-14

Role: active working

## Current App Version
- Current visible app/package version: the visible UI badge, `public/app-version.json`, and `package.json` are aligned at `6.1.13`.
- Where version is displayed/updated: displayed in the top-level `TaskApp` HUD/app version surfaces; package version is updated in `package.json`.
- Current release: `6.1.13`, the HUD sandbox frame/viewport/canvas width unification pass.

## 6.1.13 Summary

- The HUD workspace frame that owns the resize handles is now the authoritative sandbox width, measured from the available command-center region and capped by that region.
- The scroll viewport fills that frame with `width: 100%`, and the drawable canvas fills the viewport while using shared content dimensions only as minimum overflow bounds.
- Horizontal scrollbar chrome and the right resize handle now share the same frame basis, so packed widget content cannot shorten the visible sandbox.

## 6.1.12 Summary

- Default and stale 880px HUD workspaces now fill the available command-center region instead of hard-capping the scroll viewport before the right-side controls.
- Workspace width drag-resizes are marked as intentional and continue to honor their saved width; legacy non-default widths are also treated as intentional during normalization.
- Auto-width workspaces use the measured viewport region for canvas overflow math without moving or repacking widgets.

## 6.1.11 Summary

- The Calm HUD widget now has a 54px minimum and default height so its fixed 40px chip fits inside the padded, clipped widget shell.
- Persisted Calm widgets saved below 54px are repaired during HUD state normalization while preserving the 104px width contract from 6.1.10.
- Shared widget overflow, shell padding, canvas bounds, and viewport width behavior remain unchanged.

## 6.1.10 Summary

- The Calm HUD widget now has a 104px minimum and default width so its no-wrap icon-and-label chip fits inside the clipped widget shell.
- Persisted Calm widgets saved at the previous 88px minimum are repaired to the new content-safe width during HUD state normalization.
- The 6.1.8 shared canvas bounds helper and 6.1.9 viewport/canvas width basis remain unchanged.

## 6.1.9 Summary

- The HUD workspace width now belongs entirely to the scroll viewport and drawable canvas instead of being partially consumed by viewport padding.
- The command-center viewport no longer narrows the visible sandbox interior relative to the saved workspace width, so right-edge widgets can render against the same width basis the layout math uses.
- The 6.1.8 shared content-dimension helper and focused HUD layout tests remain in place unchanged.

## 6.1.8 Summary

- HUD workspace canvas sizing now derives from the actual visible widget bounds instead of always adding a synthetic trailing gutter, so the sandbox no longer pretends it needs extra empty space when widgets still fit.
- When widgets truly overflow the saved sandbox size, the HUD now adds a deliberate right/bottom reachability gutter so the last widget edge and bottom-right resize affordance remain scrollable instead of clipping early.
- The canvas extent calculation now lives in the shared HUD layout module, which keeps edit-mode drag/reorder, resize, and scroll behavior aligned on the same bounds math.

## 6.1.7 Summary

- HUD edit mode no longer renders per-widget drag or hide controls outside the selected widget shell, so top-row widgets no longer clip edit chrome past the HUD sandbox boundary.
- Selected widgets now drag directly from the widget body in edit mode, with a small pointer-movement threshold to avoid accidental reorder starts from simple taps.
- Hide/remove for the active selection now lives in the HUD edit toolbar, while the selected widget keeps an internal resize handle and subtle outline without changing layout packing, lane insertion, or persisted minimum-size behavior.

## 6.1.6 Summary

- Focus Alarm now clamps to a larger content-safe minimum size so its title, interval, status, and interval controls do not clip after persisted layout normalization or resize.
- HUD widget shell padding is tighter in edit mode at about 5px per side, with normal-mode shell padding reduced conservatively so widgets feel less bloated without changing external edit chrome.
- Focus Alarm uses the compact HUD rendering path consistently in the command HUD.

## 6.1.5 Summary

- HUD edit chrome now appears on the selected widget only, with drag and remove grouped in a compact external toolbar and the resize handle kept below the content box instead of protruding horizontally into adjacent widgets.
- HUD edit mode now uses slightly tighter widget shell padding while preserving normal/non-edit widget padding.
- The 6.1.4 per-widget minimum resize bounds remain active and unchanged.

## 6.1.4 Summary

- HUD edit controls now sit farther outside the measured widget content box, so the drag grip, remove button, and resize handle read as external edit chrome without changing widget alignment, lane packing, or row height.
- HUD widget resize now clamps each widget type to usable minimum dimensions, with chip-style command widgets kept wide enough for their labels.
- Persisted local HUD widgets that were previously resized below the new usable minimums are repaired during HUD state normalization before layout placement.

## 6.1.3 Summary

- HUD layout/edit mode now restacks sortable lanes by each lane's tallest widget, vertically centers shorter widgets inside the lane, and keeps row gaps consistent as taller widgets move between lanes.
- HUD widget edit controls now sit in external chrome around the widget shell, so drag, remove, and resize affordances remain available without covering widget content or affecting layout sizing.
- HUD layout/edit mode now sorts widgets as independent horizontal lanes: pointer y chooses the lane, pointer x chooses the insertion slot, and lane contents shift right without auto-wrapping displaced widgets into another row.
- The HUD layout/edit sandbox can be resized locally with right-edge, bottom-edge, and bottom-right handles; dimensions persist through the existing local HUD UI state.
- HUD widget dragging now clears through shared release cleanup for pointer up, pointer cancel, lost pointer capture, Escape, and window blur so the HUD does not stay in drag mode after release.
- Refocus, New Task, and Quick Capture now render as compact task-table-style chips while preserving their existing actions.

## 6.0.10 Summary

- HUD layout/edit mode now treats visible widgets as a sortable row-flow grid while dragging, so dropping between nearby widgets repacks the visible HUD widgets and persists the resulting order through the existing local HUD UI state.
- The edit-mode drag preview now uses a dashed insertion tile instead of only crosshair guide lines, while resize and remove controls stay on the existing widget shell.

## 6.0.9 Summary
- The collapsed HUD brand area is now a larger explicit button inside the compact rail, so tapping the ADHDice logo/version reliably expands the HUD in browser and PWA paths without removing horizontal scrolling from the rest of the lane.
- The open HUD brand area now mirrors that behavior as a button that collapses the HUD while the existing separate Collapse chip remains available.
- The Refresh chip still performs the soft workspace/data refresh path when already current, but now first checks `public/app-version.json` with a cache-busting fetch and reloads into a newer deployed bundle when a version mismatch is found.
- Refresh reload attempts are user-triggered only and use a short session-scoped retry guard to avoid reload loops when the same newer version was just attempted.

## 5.5.10 Summary
- Runtime Archive vs Trash is now wired to the approved SQL split: genuine Archive uses `status: "archived"`, real Trash uses `status: "trashed"`, and active task views exclude both.
- Move-to-trash actions now set `status: "trashed"` with `trashed_at`, while archive actions clear `trashed_at` and keep archived tasks out of the auto-delete path.
- Restore flows from both Archive and Trash now return tasks to `pending` with `trashed_at: null`, and the guarded expected-task snapshot protections remain in place for single-task and batch delete/archive/restore paths.
- Trash countdown copy now derives from `trashed_at`, the top toolbar Trash chip points at the real Trash bucket, and Archive now has its own runtime entry point and copy.

## 5.5.7 Summary
- Guarded permanent task delete now checks the local expected revision before removing cloud rows, removes locally only after confirmed delete or confirmed remote-missing state, and refreshes newer cloud rows instead of blindly deleting them.
- Task-history live-status sync now uses the guarded task update path, so history edits still save, but stale live-task status/completed-at writes refresh the latest cloud row instead of overwriting it.
- Recurring reward finalization now uses the guarded task update path before advancing `due_on` or resetting `completed_at`, so stale finalization writes refresh the latest cloud row instead of clobbering newer remote task data.
- Batch edit was re-audited and remains on the guarded task update helper already.
- Import was re-audited: the live import path is still insert-only and there is no current runtime "update existing ID" branch to harden in this phase.
- Same-table hierarchy helpers remain shared-logic-only groundwork; no mini-task UI, drag/drop, or legacy migration work shipped in this pass.

## Current Product Shape
- Tasks: primary dashboard with shared cloud-backed task rows, list/grid/cards/matrix views, filters, buckets, conflict-aware guarded updates/deletes/finalization sync, and legacy subtask support from `adhdice_task_subtasks`.
- Archive vs Trash: fully split at runtime on top of the applied SQL. Archive is a stable non-active bucket, Trash is the 30-day auto-delete bucket keyed by `trashed_at`, and active views exclude both.
- Focus: focus categories, timers, active sessions, history, and focus-day task selection.
- Roll: reward/economy surface with boards, prize baskets, free-roll banking, point spending, and history.
- Achievements: dice-face unlock tracking, set progress, and celebration overlays.
- Health: check-ins, meals, weight logging, imported metrics, Apple Health import flow, and care-oriented achievements.
- Notes: note CRUD and task linking.
- Stats: task, focus, and economy aggregates from current workspace state.
- Settings: profile and app-level configuration, including theme, calm-mode preferences, and economy reset.
- Test: isolated sandbox for prototypes that must stay off the live Tasks surface.

## Done In 5.5.7
1. Same-table task hierarchy helper foundation exists in memory-safe shared logic:
   `isTopLevelTask`, `isChildTask`, `groupTasksByParentId`, `buildTaskTree`, `sortTaskSiblings`, `getTaskDescendants`, `getTaskAncestors`, and `detectTaskHierarchyIssues`.
2. Guarded task mutation coverage now includes permanent delete, history-driven live-status sync, and recurring finalization on top of the existing guarded update paths.
3. Batch edit remains on the guarded task update helper; import remains insert-only with no live update-existing-ID branch.
4. Resume/refocus task sync hardening remains in place and verified for task-row refetch only.

## Deferred On Purpose
- `scheduled_on` remains shadow-only and is not runtime-authoritative in this pass.
- Legacy subtasks in `adhdice_task_subtasks` are unchanged.
- Same-table child task rendering, drag/drop, cross-parent move/promote/demote behavior, and legacy-subtask migration remain deferred.
- Runtime adoption of `scheduled_on`, any `next_scheduled_on` behavior, and reward-economy redesign remain deferred.
- Import update-existing-ID behavior remains deferred because the current live import path does not expose that branch yet.
- Snapshot/restore UX, schema, and SQL-backed restore execution remain deferred to a later phase.

## Fragile / High-Risk Areas
- `src/components/task-app.tsx`
- `src/hooks/useTaskCrudActions.ts`
- `src/hooks/useTaskHistoryActions.ts`
- `src/hooks/useTaskRewardController.ts`
- `src/hooks/useWorkspaceData.ts`
- `src/components/ui/task-management-table-v2.tsx`
- task revision/conflict handling
- same-table hierarchy rollout work that has not reached UI or persistence behavior yet

## Snapshot / Restore Planning Notes
- Recommended snapshot scope for a future task-workspace restore is: `adhdice_clean_tasks`, `adhdice_task_history`, `adhdice_task_subtasks`, task-routing/manual list memberships, task-list definitions, task-note links, focused-task selections by logical day, task-grid/HUD layout state that affects task surfaces, and directly related user profile/settings rows that change task behavior.
- Recommended snapshot task shape should preserve task rows as the primary source, include `parent_task_id` for same-table hierarchy, include legacy `adhdice_task_subtasks` alongside same-table tasks during the transition era, and keep task history separate from live task rows so restores can choose whether to restore live state only or live state plus history.
- Recommended restore boundary for the future SQL/runtime phase is "task workspace data only" first. Focus sessions, economy ledgers/reward claims, health data, and broader app settings should stay outside the initial restore boundary unless product rules explicitly require a coupled restore.
- Likely SQL-required future boundary: stable snapshot metadata/versioning tables, restore transaction semantics, and explicit overwrite/merge rules for shared keys such as task lists, manual memberships, and note links. No SQL was applied in `5.5.7`.

## Next Recommended Tickets
1. Manually verify cross-surface Archive/Trash behavior after the SQL rollout, especially status edits, table actions, and batch delete flows against real cloud rows.
2. Define the future snapshot payload contract and restore overwrite rules before adding any restore SQL or runtime restore entry points.
3. Add non-destructive selectors/adapters that can consume the same-table hierarchy helpers without changing current visible task rendering.
4. Plan the same-table child-task UI rollout separately from legacy subtask migration, with explicit rules for mixed data states.
5. Decide when `scheduled_on` becomes authoritative and gate that behind a dedicated runtime/data contract ticket.

## Manual QA Checks
1. Enter HUD layout/edit mode.
2. Put a tall widget and shorter widgets in the same row.
3. Confirm the tallest widget determines that row's height.
4. Confirm shorter widgets vertically center within that row.
5. Move the tall widget to another row and confirm the original row shrinks.
6. Confirm rows have consistent spacing and do not create awkward giant gaps.
7. Confirm the selected widget only shows a subtle outline plus an internal resize handle, with no drag/delete chrome protruding outside the HUD sandbox.
8. Confirm dragging a widget body in edit mode reorders it directly without triggering normal widget actions.
9. Confirm `Hide selected` only appears enabled when a widget is selected and still hides the selected widget correctly.
10. Confirm lane insertion still works.
11. Confirm sandbox resizing still works.
12. Confirm horizontal scrolling still works when a row is wider than the sandbox.
13. Refresh and confirm layout/sandbox dimensions persist.
14. Confirm `New Task`, `Refocus`, and `Quick Capture` cannot be resized below their readable chip widths.
15. Refresh after attempting a too-small resize and confirm the repaired layout persists cleanly.
16. Confirm Focus Alarm cannot be resized below a readable content-safe size and does not cut off `FOCUS ALARM`, `Every 5m`, `Off`, or its interval controls.
17. Confirm HUD widgets have tighter internal spacing in edit mode without making labels/icons unreadable.
18. Confirm the Calm widget cannot be resized below 104px wide or 54px tall and its icon, label, and pill edges remain fully visible after refresh.
19. Confirm the default HUD viewport extends through the available command-center region toward the Collapse controls.
20. Resize the HUD narrower, refresh, and confirm the intentional width persists.
21. Confirm the visible HUD/app version reads `6.1.13`.
