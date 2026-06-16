# Current State

Last reviewed: 2026-06-15

Role: active working

## Current App Version
- Current working app version: `6.2.21`.
- Current release group: `6.2.x` Task View / Table View / List View stabilization.
- Version surfaces that should stay aligned for code-changing implementation work:
  - `package.json`
  - `package-lock.json`
  - `public/app-version.json`
  - visible app constants in `src/components/task-app.tsx` (`APP_VERSION` / `HUD_VERSION`)

## 6.2 Checkpoint
- The existing dense task table experience is now explicitly `Table View`.
- A true `List View` exists for desktop and mobile.
- Table View and List View now share one stable task shell.
- The shared shell puts search, actions, and view controls on row 1, with list chips on row 2.
- List View metadata chips are back on the approved pill styling.
- List View quick-edit panels use the approved task-table chip language.
- In List View, status interaction opens an inline panel instead of instantly completing the task.
- Tags, due date, priority, repeat, and list/category quick-edit panels exist where supported in List View.
- In `6.2.7`, the desktop search width was widened to improve the shared shell layout.
- In `6.2.8`, first-boot authenticated body render is gated behind the same boot readiness seam as the HUD so default theme/profile state does not flash during reload.
- In `6.2.9`, the first-boot gate keeps the same behavior while moving its boot-complete effect back into the unconditional hook path, fixing the React hook-order crash during auth/session transitions.
- In `6.2.10`, the full HUD loading shell is limited to first boot so later tab-return and resume sync states keep the live HUD mounted instead of swapping back to the placeholder shell.
- In `6.2.11`, the live HUD brand tile and workspace glass surfaces keep subtle fallback fills so Safari tab-return resume is less likely to repaint them as black/glitched blocks while the live HUD remains mounted.
- In `6.2.12`, those live HUD fallback fills are still present, but their light/dark opacity balance is softened so the HUD reads closer to the earlier glass treatment instead of a solid gray slab.
- In `6.2.13`, List View task cards open the shared task row context menu on right-click so row actions stay aligned with Table View for the clicked task.
- In `6.2.14`, the live fixed HUD/header wrappers use slightly stronger light-mode fallback fills so the full-width top region is less likely to reveal a black compositor/backdrop state after idle or tab return, without changing the first-boot-only loading-shell gate or the inner HUD widget layout.
- In `6.2.15`, that wrapper-only hardening is rebalanced toward a cooler, lighter-tint glass and a softer inner blur so reload no longer washes the upper task body in a frosted-white slab while still avoiding the delayed black header seam.
- In `6.2.16`, the confirmed failing outer fixed HUD/header wrapper now paints as a direct light surface without the broad full-width backdrop blur, so Safari is less likely to mis-compose that top shell after reload, idle, or tab return while the inner live HUD layout stays intact.
- In `6.2.17`, the outer fixed HUD/header wrapper owns one solid direct-painted surface, while the accumulated brand-tile and widget fallback fills from the earlier hardening attempts are removed or returned to their pre-hardening treatment so the live HUD reads as one connected surface.
- In `6.2.18`, the live HUD shell, logo/version wrapper, workspace, and widget tiles inherit one solid white surface token in light mode instead of stacking different translucent fills; the XP label is also protected from flex shrink so it cannot collapse into an unlabeled purple block.
- In `6.2.19`, tab hide no longer writes visible resume-pending state, and silent resume refresh preserves existing task, subtask, economy, and profile identities when fetched values are unchanged; the rendered command-center avatar also receives the stable HUD fallback surface and priority loading.
- In `6.2.20`, the initial workspace loading gate now clears in the same React transition that commits critical task, subtask, profile, and economy data, so the loading shell cannot disappear one render before the authenticated workspace is ready.
- In `6.2.21`, the top HUD uses normal-flow sticky positioning instead of a separate full-width fixed compositor layer; the obsolete measured-height spacer and resize observer are removed while the HUD layout, controls, and first-boot shell remain unchanged.

## Current Product Shape
- Tasks: primary dashboard with guarded cloud-backed task rows, shared shell controls, Table View, List View, cards, matrix, filters, buckets, and legacy subtask support from `adhdice_task_subtasks`.
- Archive vs Trash: fully split at runtime. Archive is a stable non-active bucket, Trash is the 30-day auto-delete bucket keyed by `trashed_at`, and active task views exclude both.
- Focus: focus categories, timers, active sessions, history, and focus-day task selection.
- Roll: reward/economy surface with boards, prize baskets, free-roll banking, point spending, and history.
- Achievements: dice-face unlock tracking, set progress, and celebration overlays.
- Health: check-ins, meals, weight logging, imported metrics, Apple Health import flow, and care-oriented achievements.
- Notes: note CRUD and task linking.
- Stats: task, focus, and economy aggregates from current workspace state.
- Settings: profile and app-level configuration, including theme, calm-mode preferences, and economy reset.
- Test: isolated sandbox for prototypes that must stay off the live Tasks surface.

## Current Open Issue
- Reload/boot can still briefly show a black or glitched HUD/UI state before loading settles.
- The next recommended ticket should diagnose that seam separately before patching.
- Do not mix that diagnosis with List View, Focus Timer, recurrence, or subtask work.

## Fragile / High-Risk Areas
- `src/components/task-app.tsx`
- `src/hooks/useTaskCrudActions.ts`
- `src/hooks/useTaskHistoryActions.ts`
- `src/hooks/useTaskRewardController.ts`
- `src/hooks/useWorkspaceData.ts`
- `src/components/ui/task-management-table-v2.tsx`
- task revision/conflict handling
- same-table hierarchy rollout work that has not reached UI or persistence behavior yet

## Important Deferred Work
- `scheduled_on` remains shadow-only and is not runtime-authoritative yet.
- Legacy subtasks in `adhdice_task_subtasks` are unchanged.
- Same-table child-task rendering, drag/drop, cross-parent move/promote/demote behavior, and legacy-subtask migration remain deferred.
- Runtime adoption of `scheduled_on`, any `next_scheduled_on` behavior, and reward-economy redesign remain deferred.
- Import update-existing-ID behavior remains deferred because the current live import path does not expose that branch yet.
- Snapshot/restore UX, schema, and SQL-backed restore execution remain deferred to a later phase.

## Historical Notes To Preserve

### Guarded Writes / Archive-Trash Runtime
- Guarded task mutation coverage already includes permanent delete, history-driven live-status sync, and recurring finalization on top of the existing guarded update paths.
- Batch edit remains on the guarded task update helper; import remains insert-only with no live update-existing-ID branch.
- Archive vs Trash is already split at runtime: archive uses `status: "archived"`, trash uses `status: "trashed"` plus `trashed_at`, and restore flows return tasks to `pending` with `trashed_at: null`.

### Same-Table Hierarchy Runway
- Same-table hierarchy helper groundwork exists in shared logic:
  - `isTopLevelTask`
  - `isChildTask`
  - `groupTasksByParentId`
  - `buildTaskTree`
  - `sortTaskSiblings`
  - `getTaskDescendants`
  - `getTaskAncestors`
  - `detectTaskHierarchyIssues`
- This groundwork has not yet shipped as visible child-task UI or migration behavior.

### HUD / Workspace History
- The 6.1.x line was heavily HUD-focused: lane-preserving widget reorder, edit-mode chrome cleanup, workspace sizing/clipping fixes, snapshot-based HUD layout persistence, and reset-snapshot controls are all part of the current baseline.
- HUD cloud-sync remains a planning/foundation seam rather than a finished broad rollout; local-first persistence is still the safe assumption unless a ticket explicitly proves otherwise.

## Snapshot / Restore Planning Notes
- Recommended snapshot scope for a future task-workspace restore is: `adhdice_clean_tasks`, `adhdice_task_history`, `adhdice_task_subtasks`, task-routing/manual list memberships, task-list definitions, task-note links, focused-task selections by logical day, task-grid/HUD layout state that affects task surfaces, and directly related user profile/settings rows that change task behavior.
- Recommended snapshot task shape should preserve task rows as the primary source, include `parent_task_id` for same-table hierarchy, include legacy `adhdice_task_subtasks` alongside same-table tasks during the transition era, and keep task history separate from live task rows so restores can choose whether to restore live state only or live state plus history.
- Recommended restore boundary for the future SQL/runtime phase is task workspace data only first. Focus sessions, economy ledgers/reward claims, health data, and broader app settings should stay outside the initial restore boundary unless product rules explicitly require a coupled restore.
- Likely SQL-required future boundary: stable snapshot metadata/versioning tables, restore transaction semantics, and explicit overwrite/merge rules for shared keys such as task lists, manual memberships, and note links. No SQL was applied in `5.5.7`.

## Next Recommended Tickets
1. Diagnose the black/glitched HUD/UI reload seam as an isolated ticket before any other UI work in that area.
2. Define the future snapshot payload contract and restore overwrite rules before adding any restore SQL or runtime restore entry points.
3. Add non-destructive selectors/adapters that can consume the same-table hierarchy helpers without changing current visible task rendering.
4. Plan the same-table child-task UI rollout separately from legacy subtask migration, with explicit rules for mixed data states.
5. Decide when `scheduled_on` becomes authoritative and gate that behind a dedicated runtime/data contract ticket.
