# Current State

Last reviewed: 2026-06-13

Role: active working

## Current App Version
- Current visible app/package version: the visible UI badge, `public/app-version.json`, and `package.json` are aligned at `6.0.9`.
- Where version is displayed/updated: displayed in the top-level `TaskApp` HUD/app version surfaces; package version is updated in `package.json`.
- Current release: `6.0.9`, the narrow HUD/PWA follow-up focused on the brand tap target and user-triggered bundle refresh checks.

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
1. Trash an active task and confirm it leaves active views, appears under Trash, and shows a countdown based on `trashed_at`.
2. Archive a task and confirm it appears under Archive, does not show the Trash countdown, and does not appear under Trash.
3. Restore one task from Trash and one from Archive and confirm both return to `pending` without a countdown chip.
4. Select multiple tasks from an active view, use the batch delete flow, and confirm they move to Trash rather than being permanently removed.
5. Permanently delete a task from Trash after creating a remote revision conflict and confirm the latest cloud row is refreshed instead of being silently removed.
6. Confirm the visible HUD/app version reads `6.0.9`.
