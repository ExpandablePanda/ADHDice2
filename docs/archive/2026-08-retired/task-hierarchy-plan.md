> Archived on 2026-08-03.
>
> This body preserves earlier rollout, implementation, and planning history.
> Current hierarchy decisions remain at [docs/task-hierarchy-plan.md](../../task-hierarchy-plan.md).
> Current Daily Until Complete rules remain at [docs/daily-until-complete-plan.md](../../daily-until-complete-plan.md).
> This archived file is historical reference only.
> Agents should not treat release-specific implementation phases as current authority.
>
# Task Hierarchy Plan

Last reviewed: 2026-06-19

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

## 6.4.14 Implementation Note

At this point in the rollout, the full task overlay started treating same-table `parent_task_id` descendants as Steps. The same-table preview section was labeled `Steps`, the create action was `Add Step`, direct descendants were labeled Step, deeper descendants were labeled Substep, and opening still used the existing task inspector/editor path. Legacy `adhdice_task_subtasks` rows were still readable and editable in a separate transition-only surface; that split user-facing surface is superseded by the unified Steps behavior documented in `6.4.20`. No live data conversion, schema change, rewards, recurrence, archive/trash, or primary row filtering changed in this step.

## 6.4.15 Implementation Note

`src/lib/task-legacy-step-promotion.ts` adds the gated bridge from migration-source rows to same-table Steps. `buildLegacyStepPromotionDryRun` is pure and reports totals, already-mapped rows, eligible rows, skipped rows, ambiguous collisions, missing parents, archived/trashed parent tasks, proposed `parent_task_id`, sort mapping, status mapping, and sample rows without writing data. `promoteLegacySteps` is available for a later explicit manual action: it creates real task rows with stable ids matching legacy subtask ids, writes `adhdice_legacy_subtask_promotions`, and rolls back a just-created task row if mapping insert fails. No UI button or automatic live conversion was added.

## 6.4.16 Implementation Note

Settings now includes a tucked-away Legacy Step Promotion operator surface. The operator must run a dry-run report first, then arm a reviewed checkbox before the manual promotion button can call `promoteLegacySteps`; no promotion runs automatically on boot, dry-run, or overlay open. `useWorkspaceData` fetches `adhdice_legacy_subtask_promotions` with core task data and listens for mapping changes. `filterPromotedLegacySubtasks` removes mapped migration-source rows from Table/List render data while preserving unmapped rows, including unmapped children whose legacy parent has already been promoted.

## 6.4.17 Implementation Note

Table View now exposes a compact expandable Steps section on parent rows with valid same-table descendants. List View cards show a matching compact Steps preview. Both surfaces are read-only previews backed by `buildChildTaskPreviewLookup`, show Step/Substep depth plus existing task metadata such as status, due/scheduled date, priority, and estimate, and open a Step through the normal inspector/editor path. Valid descendants remain hidden from top-level rows; invalid hierarchy rows remain findable as ordinary rows.

## 6.4.18 Implementation Note

Nested Step preview rows in Table View and List View now open the normal task inspector/editor from the row/title area as well as the Open chip, with click and keyboard handling stopped from triggering parent row actions. Real Step metadata editing remains inspector-backed through the existing guarded task update callbacks for title, status, due date/time, priority/focus, energy, estimate, actual time, tags/lists, notes, and links where those fields are already supported. Inline quick actions are deferred until the table quick-edit controls can be safely shared. Move, reorder, promote, and demote are deferred because `parent_task_id` is a high-risk update field and hierarchy movement needs explicit product rules.

## 6.4.19 Implementation Note

Table View now renders same-table `parent_task_id` Steps as compact mini rows under the parent row instead of a rounded preview card inside the parent title cell. The mini rows reuse the parent table's column grid where practical, showing Step/Substep depth, title, status, due/scheduled date, estimate, actual time, tags, link, notes, priority flags, energy, repeat, and status metadata while preserving the normal inspector/editor open path. The parent task keeps its own metadata on the main row, valid same-table Steps remain hidden from top-level rows, and mapped migration-source rows stay suppressed.

## 6.4.20 Implementation Note

The normal task-facing UI now presents one unified `Steps` concept. The full Edit Task UI no longer renders the separate same-table explanation panel with `Task rows` wording; same-table Step rows render inside the original Steps editor area, carry existing metadata affordances, and open through the normal task inspector/editor path for metadata edits. Add Step in that editor uses the same-table `parent_task_id` creation path. Unmapped `adhdice_task_subtasks` rows remain available during transition under the same Steps label, while mapped rows stay suppressed and Settings keeps the explicit migration/operator wording for dry-run and gated promotion.

## 6.4.21 Implementation Note

Table View no longer renders unmapped migration-source Step rows as a title-cell-only mini checklist. When a parent row is expanded, source-only rows now render below the parent in the same compact table mini-row grid as same-table Steps, showing status/title plus aligned empty metadata chips for unavailable fields. Same-table `parent_task_id` Steps still use their real task metadata and normal inspector/editor open path.

## 6.4.22 Implementation Note

Same-table Step rows now use the parent task row visual architecture instead of separate card or spreadsheet-row styling. Table View Step rows sit on the shared white table surface with parent-like spacing, Edit Task and List View Step previews remove the `Open` chip, row click selects the Step through the existing editor path, selected Steps show a parent/back affordance, and same-table Step rows use the existing task delete/trash flow from a small row trash icon. Migration-source rows remain transitional with status/title only, and no promotion or source mutation was run.

## 6.4.23 Implementation Note

Full Edit Task Step selection now stays in the parent editor shell. Clicking a same-table Step in the parent Steps section retargets the right-side Meta Data panel to that Step instead of opening the Step as its own editor screen. The Meta Data helper line names the current target as parent or Step, and the `Parent metadata` chip returns the panel to the parent while preserving the existing task update callbacks for Step field edits.

## 6.4.24 Implementation Note

When the right-side Meta Data panel is targeting a Step, it now shows the Step control row again: the selected Step status icon, the full status icon picker, Add Step/Substep through the existing same-table creation control, and same-table Step delete through the existing task delete/trash flow. This keeps Step mode visually consistent with the Steps list while leaving parent metadata mode unchanged.

## 6.4.25 Implementation Note

The Step mode control row now lives on the selected Step row in the left Steps column instead of in the right Meta Data panel. The selected same-table Step row exposes the full status icon picker, Add Step/Substep, and delete controls inline with the Step, while the right side stays focused on task metadata fields only.

## 6.4.26 Implementation Note

The selected Step-row Add Step/Substep affordance now renders as a circular shoeprints icon button instead of a text chip. It still opens the existing same-table child-task creation form and uses the same `parent_task_id` creation path.

## 6.4.27 Implementation Note

Normal task UI no longer displays same-table hierarchy implementation counts like `direct steps` or `total step rows`; user-facing labels remain simply `Steps`. The Steps smart-list predicate now counts valid same-table `parent_task_id` children in addition to visible migration-source rows, so new same-table Steps participate in existing Steps list rules while old source rows remain visible for manual cleanup.

## 6.4.28 Implementation Note

Table View Step title cells now fill the Task column like parent rows, use a smaller depth offset, and render Step titles at medium weight so Step names sit closer to the parent task name without a bold title look.

## 6.4.29 Implementation Note

The Table View parent shoeprints Step button now opens a focused inline same-table Step title draft row under that parent instead of opening the Edit Task UI or creating an old source Step. Same-table Step titles in the full Edit Task Steps list can be clicked and renamed through the existing task title update path.

## 6.4.30 Implementation Note

Table View inline action rows now render directly under the row they edit. Parent metadata actions appear before expanded Steps, and same-table Step row clicks plus Step metadata chips open an inline action row under that Step instead of opening the full Edit Task UI.

## 6.4.31 Implementation Note

Table View Step inline action rows now render from Step preview metadata even when the same-table Step is hidden from the top-level row array. Step metadata chips can open action rows directly under the Step, and Step title clicks switch to a compact in-row rename input that uses the existing task title update path.

## 6.5.0 Implementation Note

Steps remain same-table `adhdice_clean_tasks` rows through `parent_task_id`; legacy `adhdice_task_subtasks` rows remain migration/source rows only. This cleanup pass improves parity without implementing movement or reorder: List View Step previews now use shared metadata chips and quick panels for the same metadata fields available on parent List rows, Step titles can be renamed in-row, and List typography uses the same title primitive as Table View. Table View Step previews carry Date Added and history-derived streak metadata even when child rows are hidden from the top-level task array, include Step/history/delete/streak affordances, use concise parent-style due labels, and sit closer to the parent Steps toggle area. The Edit Task UI keeps one user-facing Steps section, removes the redundant Step status chip beside the status circle, uses the circular Step icon for Add Step controls, and keeps the desktop Meta Data column sticky while scrolling the left Steps list.

## 6.5.1 Implementation Note

This follow-up keeps Steps as same-table task rows and fixes active parity gaps without adding movement/reorder. Parent and Step row actions now use bare icons with hover/focus circles, Step shoeprints actions live with row actions and create inline substep drafts, repeated metadata-chip clicks toggle inline action rows closed, List View parent titles rename inline, and List parent/Step cards expose empty and filled metadata chips for status, due, priority, repeat, lists, tags, estimate, actual time, energy, link, and notes while Date Added stays read-only. Search child matches surface the top-level parent and show sibling Steps; Step streak chips continue to come from child task history preview stats.

## 6.6.0 Same-Parent Sibling Reorder

Table View, Edit Task, and List View now share explicit Move Up and Move Down controls and one pure reorder planner. The planner rejects top-level or invalid hierarchy rows, never writes `parent_task_id`, preserves sibling identity and relative order, and normalizes `sort_order` only within the affected parent group. Drag/drop, cross-parent movement, promote, and demote are not part of this slice.

## 6.6.1 Step/Substep Chevron Collapse

Table View and List View now expose a compact chevron beside the title of any same-table Step that owns visible same-table children. Toggling the chevron hides or reveals only that step's descendants inside the current preview surface; it does not change task data, `parent_task_id`, sorting, or persistence. The visibility rule is shared through a small pure helper so collapsed descendants stay local to the UI surface and siblings continue to render in stable order.

## 6.6.2 Parent Steps Toggle Polish

The parent-level `Steps` affordance is now part of the same chevron control language. In Table View, the parent-row `Steps` toggle uses the same hover/focus circle treatment as the child chevrons. In List View, the parent card's `Steps` section is no longer permanently glued open; it has its own collapsible chevron header while search-matched parents still auto-expand so child hits remain visible.

## 6.6.3 Parent Steps Toggle Parity

List View now reuses the same parent `Steps` control structure as Table View rather than a list-specific variant. Both surfaces keep the `Steps` text neutral and put the interactive hover/focus affordance only on the chevron button.

## 6.7.0 Same-Parent Drag Reorder

The same shared reorder foundation now supports dedicated grip-handle drag/drop for same-parent sibling Steps and same-parent sibling Substeps in Table View, Edit Task, and List View. The helper in `src/lib/task-sibling-reorder.ts` still owns the reorder plan; it now also accepts before/after insertion instructions and continues to reject top-level rows, invalid hierarchy, cross-parent targets, and no-op placements. Persistence still updates only `sort_order` through the existing guarded task update path, while `parent_task_id`, promote/demote, parent-task drag, and cross-parent movement remain out of scope.

## 6.7.1 Same-Parent Drag Reorder Polish

The existing Table View, Edit Task, and List View drag paths now keep synchronous transient drag bookkeeping in refs and publish drop-indicator state only when the stable target task ID or before/after placement changes. This removes redundant render churn during native `dragover` while preserving grip-only drag start, same-parent and same-depth validation, drop-only persistence, Move Up/Move Down fallback controls, and the existing shared reorder planner. No movement scope or task hierarchy fields changed.

## 6.7.2 Same-Parent Drag Speed Polish

The shared reorder planner and movement guardrails are unchanged, but the drop persistence path now feels faster. After a valid same-parent drop, the planned sibling `sort_order` values are reflected locally right away, then the affected sibling rows persist through the existing guarded task-row update seam in parallel. If a guarded save conflicts or fails, the workspace reloads the latest cloud state rather than inventing a second movement system. Cross-parent movement, promote/demote, and `parent_task_id` edits remain deferred.

## 6.7.3 List View Step Preview Limit Removal

List View's collapsible parent `Steps` section no longer enforces the earlier four-row preview cap for same-table Steps/Substeps. When the section is expanded, all currently visible descendants render inline; when collapsed, the section stays hidden. Step/Substep chevrons still control descendant visibility within that expanded set, search-matched parents still force the section open, and same-parent reorder, rename, metadata chips, child creation, and `parent_task_id` behavior are unchanged.

## 6.7.4 Edit Task Step Preview Limit Removal

The full Edit Task UI now follows the same no-preview-cap rule for same-table Steps/Substeps. Inside the editor's left `Steps` section, all currently visible descendants render inline instead of truncating to a short preview, and the old `hidden in preview` footer copy is removed. Descendant chevrons still control local collapse, the right Meta Data column still targets the selected Step or parent, and same-parent reorder plus all hierarchy guardrails remain unchanged.

## Next Ticket

`6.7.5 Step Movement Guardrails Follow-Up`

Goal: evaluate any future movement rules beyond same-parent sibling reorder, including whether cross-parent movement or promote/demote should ever exist and what extra repair/guard UI they would require.

Verification should stay narrow: focused helper tests only plus `git diff --check`.
