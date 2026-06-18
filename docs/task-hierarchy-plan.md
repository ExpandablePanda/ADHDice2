# Task Hierarchy Plan

Last reviewed: 2026-06-18

Role: active working

## 6.4.2 Architecture Decision Lock

- Child tasks and grandchildren should be represented as same-table task rows in `adhdice_clean_tasks`.
- `parent_task_id` is the hierarchy relationship for parent task, child task, and child-of-child task rows.
- The rollout method should be a hybrid bridge/migration, not an immediate hard cutover.
- Legacy separate subtasks in `adhdice_task_subtasks` must remain readable during transition.
- Legacy subtasks should eventually be promotable or migratable into same-table child task rows.
- The separate subtask table should not be expanded into a full duplicate task model.
- Transition work must avoid double-rendering the same child item and avoid double-rewarding the same completion.

## Current Model Baseline

- Main task rows already carry task-level metadata: status, priority, energy, due and scheduled dates, due time, estimates, actual time, tags, list/category relationships, notes and links through existing task surfaces, recurrence fields, archive/trash status, `trashed_at`, `completed_at`, and guarded `revision`.
- Same-table hierarchy already exists at the schema, type, and helper level through `parent_task_id`.
- Shared hierarchy helpers live in `src/lib/task-hierarchy.ts` and currently cover top-level detection, child detection, parent grouping, sibling sorting, tree building, descendant lookup, ancestor lookup, and issue detection for missing parents, self-parenting, and circular parent chains.
- Active Table View and List View still consume task rows mostly as a flat list. They do not yet render same-table child task rows as nested mini-tasks.
- Legacy subtasks live in `adhdice_task_subtasks`, nest through `parent_subtask_id`, and currently carry title, status, sort order, parent task id, optional parent subtask id, ownership, and timestamps.
- Legacy subtasks do not carry the full task metadata model, guarded task revisions, archive/trash fields, recurrence behavior, task history rows, task-level notes/links/list membership, or actual-time behavior.
- Legacy subtask completion can create reward claim identities through `subtask_id`. Recurring task finalization intentionally ignores subtask reward claims.

## Provisional Product Defaults

### Visibility

- Child tasks should render nested under their parent by default.
- Child tasks should not automatically appear as duplicate top-level rows in All, Today, List, or other primary task views.
- A later explicit "show children as standalone tasks" mode can opt into standalone visibility.

### Completion

- Parent and child completion should remain independent at first.
- Completing a parent should not silently complete all children.
- Completing all children should not silently complete the parent.
- Optional parent/child completion automation should be a later explicit product decision.

### Rewards and XP

- Final child-task reward behavior is unresolved.
- Early implementation should avoid duplicate rewards.
- Same-table child task reward eligibility, subtask promotion reward continuity, and parent/child reward aggregation need a later explicit ticket.

### Recurrence

- Child tasks should not receive special recurrence behavior in the first implementation pass.
- Because same-table child tasks inherit normal task recurrence fields, the implementation must avoid accidentally exposing child recurrence UI or finalization paths before product rules are approved.
- Recurring parent behavior should stay separate from child completion unless a later ticket explicitly defines coupling.

### Archive and Trash

Later implementation should choose one of these behaviors:

- Parent archive/trash cascades archive/trash writes to descendants.
- Parent archive/trash hides descendants while preserving descendant rows.
- Parent and children are independently archived/trashed.

Safest provisional default: parent archive/trash should hide descendants while preserving descendant rows. This avoids surprise destructive cascade writes and avoids orphan-like child rows appearing in primary views when their parent is archived or trashed. Direct child archive/trash can still be independent when the user explicitly acts on a child row.

### Depth

- Helper logic should support at least parent to child to grandchild.
- Helper logic should be able to detect deeper nesting, cycles, and orphans.
- Visible UI can later cap rendered depth if needed for usability.

### Drag, Reorder, and Move

- Drag/reorder/move hierarchy behavior is out of scope for 6.4.2.
- Future move behavior must prevent circular parent relationships.
- Future move behavior must avoid orphan surprises when moving, promoting, demoting, archiving, trashing, or restoring nested task rows.

## Bridge and Migration Guardrails

- Mixed data states are expected during transition: a parent may have legacy subtasks, same-table child tasks, or both.
- Read adapters should keep the item source explicit so legacy subtasks and same-table child tasks are not accidentally merged as if they were the same row.
- Same-table child tasks should use guarded task mutation seams when their task metadata is edited.
- Legacy subtask mutation hooks should remain legacy-subtask-only until promotion/migration behavior is explicitly implemented.
- Promotion from legacy subtask to same-table child task should be deliberate and auditable. It should define source legacy row handling before launch: keep readable, mark migrated, hide through an adapter, or remove after confirmed backfill.
- Reward continuity during promotion must be explicit because existing reward claims can reference `subtask_id`.
- Backfill should preserve sibling order, nesting, ownership, completion status, and created/updated timestamps where practical.
- Orphan and cycle detection should run before any visible nested rendering or move operation trusts a hierarchy.

## Known Architecture Impact

- Types: `Task` is the target mini-task shape. `TaskSubtask` should remain the legacy lightweight shape during the bridge.
- Derived task helpers: current primary views filter and bucket flat `Task[]` collections. Same-table child visibility needs a read adapter before rendering changes.
- Table View: current row building combines one task row with legacy subtasks. Same-table child task rows need a separate hierarchy adapter before they appear nested.
- List View: current List View builds rows from the same flat task list and legacy subtask shape. It needs the same adapter as Table View to preserve parity.
- Inspector/edit surfaces: child metadata editing should reuse task edit seams rather than expanding legacy subtask editing into a duplicate task editor.
- DB mutations: same-table child task metadata should use guarded task updates and preserve `revision` conflict behavior.
- Realtime/sync: task rows and legacy subtasks currently reload through separate Supabase subscriptions. Bridge logic must handle both streams without duplicating rendered children.
- History/streaks: task history is keyed by `task_id`; same-table child tasks can use this model, but product rules for parent/child aggregation remain undecided.
- Rewards/XP: reward claim de-duplication distinguishes task claims from legacy subtask claims. Same-table child reward rules must be explicit before enabling child rewards.
- Recurrence: recurring finalization currently operates on task rows and skips legacy subtask claims. Same-table child recurrence needs an explicit rule before UI adoption.
- Archive/trash: primary views exclude archived and trashed task rows, but descendant hiding for archived/trashed parents still needs adapter logic.
- Performance: nested derived trees should be built from indexed maps, not repeated full-list scans inside row rendering.

## 6.4.3 Implementation Note

`src/lib/task-hierarchy.ts` now exposes `buildTaskHierarchyAdapter`, a read-only same-table hierarchy adapter for task-like objects with `id`, `parent_task_id`, and optional ordering metadata. It returns top-level tasks, child tasks, valid children, orphan data, cycle data, depth maps, parent/child maps, root nodes, and safe lookup helpers without changing visible rendering or persistence.

## 6.4.5 Implementation Note

`src/lib/task-app-derived.ts` now returns a hidden `taskHierarchyDiagnostics` object from `computeTaskAppDerivedData`. The diagnostics are built from the same flat task array using `buildTaskHierarchyAdapter` and expose root ids, child ids, valid child ids, orphan ids, cycle ids, invalid ids, depth, max depth, and parent-to-child lookup maps. No component consumes this object for rendering yet.

## 6.4.7 Implementation Note

`src/lib/task-app-derived.ts` now also returns a read-only `childTaskPreviewByParentTaskId` lookup built from the full flat task array. The shared `TaskManagementTableV2` full overlay consumes that lookup for a compact `Child tasks` preview that shows direct/total descendant counts, valid descendant rows, depth indentation, status, due metadata, and priority flags. Legacy `Steps` remain separate and editable through the existing legacy subtask path; same-table child tasks are preview-only and do not change persistence, rewards, recurrence, archive/trash, Table/List row rendering, filters, counts, or sorting.

## 6.4.8 Implementation Note

`src/lib/task-child-creation.ts` provides a focused helper for validating and building same-table child task drafts. The shared `TaskManagementTableV2` full overlay can now add child tasks from the `Child tasks` section through the existing normal task creation path, setting `parent_task_id` to the selected task id. Preview rows can open through the existing shared inspector path so normal task metadata editing is reused, and opening a child allows creating a grandchild. Legacy `Steps` remain separate and editable through the legacy subtask path. No schema, generated types, rewards, recurrence, archive/trash, nested Table/List row rendering, drag/reorder/move, or legacy-subtask persistence behavior changed.

## 6.4.9 Implementation Note

Valid same-table child tasks and grandchildren are nested-context tasks by default. `computeTaskAppDerivedData` now hides valid descendants from primary top-level Table/List row arrays, search results, smart-list counts, and status counts while keeping full task rows available for hierarchy diagnostics, the `Child tasks` preview, and existing child open/edit flows. Orphans, cycles, self-parent rows, and other invalid hierarchy rows remain visible as ordinary primary rows until a repair UI exists. Legacy `Steps` remain separate.

## Next Ticket

`6.4.10 Legacy Step Promotion To Child Task Diagnosis`

Goal: if child visibility holds up in manual QA, diagnose the safest promotion/migration path from legacy `Steps` rows to same-table child task rows without double-rendering or double-rewarding.

Verification should stay narrow: focused helper tests only plus `git diff --check`.
