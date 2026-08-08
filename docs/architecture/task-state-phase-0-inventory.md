# ADHDice Task Architecture Inventory and Dependency Map

## Scope and method

This is a Phase 0, diagnosis-only inventory of the current branch. It is a static source inspection, not an implementation plan or migration. The inspected branch is `codex/chatgpt-diagnostic-branch`. The working tree was clean before this document was created.

The inventory follows imports, direct callers, callback wiring, and database mutation boundaries. A file is not classified as obsolete merely because its name contains `legacy`, `shadow`, `fallback`, or `repair`. Runtime claims about deployed Supabase functions, browser behavior, multiple tabs, or production data are explicitly marked as unverified unless supported by checked-in source or current-state documentation.

Verification restrictions honored:

- No production code, tests, schema, migrations, or Supabase data were changed.
- No tests, build, full lint, typecheck, browser automation, dev server, SQL, migration, commit, or push was run.
- The only repository change is this document.

## Executive findings

The Task State Engine is an active canonical boundary for the main TaskApp read projection, occurrence-sensitive action planning, Calendar reads, and client rollover planning. It is not yet the only state system. The current branch still contains several reachable competing interpretations:

1. `resolveActiveTaskStatuses()` evaluates the engine for the main active-status map, but downstream consumers can fall back to stored `task.status`, especially for child/hierarchy rows and contexts without the projection map.
2. `getTaskDisplayStatusWithHistory()` remains the legacy display calculator and is still imported by the engine read adapter's disabled branch and by the development shadow comparison. `getTaskDisplayStatus()` is also used by agent-plan construction.
3. `resolveLiveTaskStatusFromHistory()` plus `resolveRecurringLiveStatusFromNextDueDate()` remains a separate live-status/rebase path used by History actions when the engine action authority is unavailable and by legacy-compatible code.
4. `src/lib/task-repeat.ts` and `src/lib/task-state-engine/recurrence.ts` both calculate recurrence membership, next dates, and cadence advancement. `src/lib/task-history.ts` combines both families.
5. Effective Timeline correctly treats calculated Missed state as non-persistent display state, but `evaluateTaskState()` can propose rollover/reconciliation Missed History rows and `useTaskRewardController.reconcileOverdueTaskMisses()` can still persist automatic Missed rows on a legacy-compatible path.
6. TaskApp has an engine rollover RPC path and a legacy `adhdice_reconcile_task_rollover` fallback. The source proves coexistence and conditional reachability; it does not prove which RPC is deployed for a particular account.
7. Table, List, Home, Paths, On-Time, editor, and History Calendar are not all equivalent consumers. Most receive the TaskApp active-status projection, but Calendar also constructs a legacy due-date set, child rows can read raw stored status, and Smart List rules intentionally fall back to stored status when no projection map is supplied.

Static inventory counts used in the final handoff:

| Metric | Count | Counting rule |
|---|---:|---|
| Distinct active-status authority families | 5 | Engine read, legacy cockpit, History live-status resolver, stored-status/bucket consumers, and direct editor/active-status tracking. Effective Timeline is counted separately as Calendar/streak authority. |
| Recurrence calculators or recurrence paths | 7 | Engine recurrence, Effective Timeline projection, legacy `task-repeat`, legacy History rebase, reward finalizer, engine rollover RPC source, and legacy rollover RPC source. |
| Task mutation entry paths | 14 | Distinct production intent boundaries in the Task mutation matrix; UI surfaces that converge on the same TaskApp command are not double-counted. |
| Direct Task/History persistence boundaries | 7 | Task insert/update/delete helpers, single History upsert, batch History upsert, History delete, and the rollover RPC boundary. |
| Task State Engine directory files | 18 | All files directly under `src/lib/task-state-engine/`, including `calendar.ts`. |

## 1. Task State Engine directory inventory

Line counts are approximate handwritten source counts from `wc -l`. “Writes” means it produces a mutation plan or projection; it does not mean the file itself calls Supabase.

| File | Lines | Purpose and exports | Production callers / runtime role | Reads / derives / writes | Overlap or transition signal | Preliminary disposition |
|---|---:|---|---|---|---|---|
| `src/lib/task-state-engine/types.ts` | 202 | Defines lifecycle, active status, Calendar state, History outcomes/provenance, recurrence shapes, snapshots, History rows, effective timeline, actions, patches, streaks, and engine results. | Imported by nearly every engine module and by TaskApp adapters. | Type-only state model; no reads or writes. | Defines an internal model that is richer than the DB Task row; recurrence cursor and satisfied occurrence identity are not DB fields. | KEEP |
| `src/lib/task-state-engine/calendar.ts` | 67 | `parseDateKey`, `formatDateKey`, `shiftDateKey`, `daysBetween`, `dateRange`, `logicalDateForTimestamp`, `calendarStateForOutcome`, `authoritativeRowsByDate`. | Used internally by engine, Effective Timeline, recurrence, Calendar/read adapters, repair, shadow, and indirectly by TaskApp. | Reads normalized dates; derives logical days and date precedence; no writes. | Shared date kernel; overlaps with older date helpers in `task-history.ts` and `task-repeat.ts`. | KEEP |
| `src/lib/task-state-engine/recurrence.ts` | 197 | `isUnscheduled`, `isUntilComplete`, `allowedOutcomes`, `isScheduledOccurrence`, `scheduledOccurrences`, `nextFixedOccurrence`, `nextFixedOccurrenceOnOrAfter`, `recurrenceAfterSuccess`, `occurrenceIdentity`. | Engine, Effective Timeline, repair report, shadow, and `src/lib/task-history.ts` import it. | Reads recurrence configuration; derives occurrence membership, next date, advancement, and identity; no writes. | Intended canonical recurrence family, but `src/lib/task-repeat.ts` remains active. | KEEP |
| `src/lib/task-state-engine/effective-timeline.ts` | 326 | `buildTaskEffectiveTimeline`; builds explicit plus calculated Calendar days, future schedule, unresolved occurrence, positive/missed streaks. | `task-history-streak-summaries.ts`; Calendar adapter through `task-view-adapters.tsx`; engine-related tests. | Reads Task and History; derives effective state and streaks; does not persist calculated days. | Competes with saved-row-only `computeTaskSpecificHistoryStats()` and legacy Calendar due-date helpers. | KEEP |
| `src/lib/task-state-engine/engine.ts` | 634 | `evaluateTaskState`, `findUnresolvedMissedOccurrence`, `isSuccessfulTaskHistoryOutcome`; action validation, replay, lifecycle, rollover, patch and reward eligibility. | Read adapter, action authority, Calendar adapter, rollover planner, repair and shadow. TaskApp invokes it through adapters. | Reads Task/History and logical-day context; derives active state, next due, Calendar, History changes, Task patch and reward plan. It can propose History inserts but does not call Supabase. | Main domain authority, but its rollover/reconciliation History proposals coexist with inferred non-persistent Missed Timeline state. | KEEP |
| `src/lib/task-state-engine/read-authority.ts` | 67 | `TASK_STATE_ENGINE_INTEGRATION_ENABLED = true`, deprecated alias, `resolveActiveTaskStatuses`, `projectTasksForActiveStatusRead`. | TaskApp builds the active-status map at lines 2654-2687 and projects `tasksForActiveStatusRead`; tests cover the adapter. | Reads Task/History; derives visible active statuses; projects a new Task-shaped view; no DB writes. | Legacy cockpit remains imported for the disabled branch, so the switch is a compatibility boundary, not proof of deletion. | KEEP |
| `src/lib/task-state-engine/action-authority.ts` | 219 | Schedule-change detection, occurrence-sensitive detection, History row conversion, `evaluateTaskActionAuthority`, `evaluateTaskScheduleAuthority`. | TaskApp status/delay/complete actions; editor, generic update, batch edit, History actions; Calendar action adapter. | Reads Task/History/action input; derives an engine mutation plan and persistable patch; no direct DB write. | Caller-owned writes permit legacy callers to bypass the plan; action hooks retain fallback logic. | KEEP |
| `src/lib/task-state-engine/calendar-authority.ts` | 130 | `resolveTaskHistoryCalendarRead`, `resolveTaskHistoryCalendarStates`, `resolveTaskHistoryCalendarActionStatuses`; Calendar action status union and authority state. | `task-view-adapters.tsx` and TaskApp History modal wiring. | Reads Task/History; derives Effective Timeline/Calendar states; no DB write. | Calendar adapter still computes a legacy due-date set before calling this authority and has archived/trashed fallback behavior. | KEEP |
| `src/lib/task-state-engine/due-date-authority.ts` | 48 | `buildManualDueDateTaskUpdate`, deprecated `reconcileManualDueDateChange`; compatibility surface delegating to schedule authority. | No current production import found; referenced by `test/task-state-engine-integration.test.ts`. | Reads schedule intent; derives Task schedule patch; no direct write. | Explicitly marked compatibility/deprecated and appears test-only, but deletion requires caller/test migration confirmation. | INVESTIGATE |
| `src/lib/task-state-engine/rollover-authority.ts` | 109 | `createEngineRolloverPlan`, `engineRolloverPlanHasMutations`, rollover task/History plan types. | TaskApp `runDayReset`; tests. The plan is sent to an RPC. | Reads all loaded Task/History rows; derives Task patches, History summaries, reward eligibility; no direct DB write. | Coexists with legacy RPC fallback and client-side `reconcileOverdueTaskMisses`. | KEEP |
| `src/lib/task-state-engine/persistence-projection.ts` | 120 | Persistable patch allow-list and `canonicalizePersistableTaskStatePatch`, `canonicalizeStoredTaskStateForPatch`, `projectPersistableTaskStatePatch`. | Action authority and rollover planner; exported through barrel. | Reads engine patch and stored Task values; derives safe Task-row projection; no direct write. | Deliberately excludes engine-only status/cursor/occurrence metadata, but the DB still stores overlapping cache fields. | KEEP |
| `src/lib/task-state-engine/legacy-adapter.ts` | 354 | `adaptLegacyTaskState`; maps DB Task/History to engine snapshots and reports warnings/unsupported fields. | Read/action/Calendar/rollover authorities, Effective Timeline streak summary, repair and shadow. | Reads legacy DB shape; derives canonical engine input plus data-quality issues; no writes. | Active translation boundary. It flags absent recurrence cursor/satisfied occurrence identity and unsupported `due_time`, so it cannot be removed yet. | KEEP |
| `src/lib/task-state-engine/runtime-bridge.ts` | 119 | Development-only `registerTaskStateShadowBridge`, window bridge, report/export helpers. | Dynamically registered by TaskApp during development; exposes `window.__ADHDICE_RUN_TASK_STATE_SHADOW__`. | Reads diagnostics and formats reports; no production writes. | Diagnostics are active in development and are not a production authority. | KEEP |
| `src/lib/task-state-engine/shadow.ts` | 1300 | `runTaskStateShadow`, patch safety inspection/assertion, report types/formatters; compares legacy and engine status, Calendar, recurrence, and proposed History. | Development bridge from TaskApp; tests. Imports legacy cockpit, legacy live resolver, legacy Calendar due helpers, and engine. | Reads Task/History; derives comparison report and safety findings; no writes. | Large diagnostic comparator intentionally contains both systems; its presence is evidence of unresolved divergence, not a deletion instruction. | KEEP |
| `src/lib/task-state-engine/recurring-date-repair-report.ts` | 516 | `buildRecurringDateRepairReport`, affected Task IDs, confidence/rejection/report types; read-only recurrence replay. | Development diagnostic bridge and tests; no production mutation call. | Reads Tasks/History; derives repair evidence and proposed next due; no writes. | Task-specific diagnostic scope and legacy-data repair logic; requires a defined remediation workflow before removal. | INVESTIGATE |
| `src/lib/task-state-engine/recurring-date-repair-runtime.ts` | 56 | Development-only window registration for the recurring-date repair report. | TaskApp dynamic development registration; tests. | Read-only report bridge; no writes. | Runtime shell for a targeted diagnostic, not an app state authority. | INVESTIGATE |
| `src/lib/task-state-engine/index.ts` | 23 | Barrel exports recurrence, adapters, engine, calendar, rollover, repair, persistence, shadow, Effective Timeline, and types. | TaskApp, Calendar adapter, tests, and indirect consumers. | No state work. | Publicizes both canonical and diagnostic/compatibility surfaces from one import boundary. | KEEP |

### Engine directory call graph

```text
DB Task + DB History
        │
        ▼
legacy-adapter.ts ───────────────┐
        │                         │
        ├── recurrence.ts         │
        ├── calendar.ts           │
        ▼                         │
engine.ts ────────┬───────────────┘
                  ├─ read-authority.ts → TaskApp active-status projection
                  ├─ action-authority.ts → caller-owned Task/History writes
                  ├─ calendar-authority.ts → Calendar Effective Timeline
                  ├─ rollover-authority.ts → client plan → Supabase RPC
                  └─ repair/shadow diagnostics
```

The important boundary is that the engine is pure with respect to persistence. `action-authority.ts`, `rollover-authority.ts`, and the caller hooks decide whether and how to write the proposed plan. That is a useful authority boundary, but it also leaves room for callers to retain legacy mutation behavior.

## 2. Current status authorities

### Distinct active-status authority families

The inventory found five distinct active-status authority families. These are families rather than a count of every helper call; `getTaskDisplayStatus()` and `getTaskDisplayStatusWithHistory()` are grouped as the legacy cockpit family, while Calendar Effective Timeline is intentionally counted in the Calendar/streak section below.

| Family | Function/files | Inputs | Output and production use | Stored-status or History dependence | Can disagree with Effective Timeline? |
|---|---|---|---|---|---|
| 1. Engine active read | `resolveActiveTaskStatuses()` → `evaluateTaskState()` in `task-state-engine/read-authority.ts` and `engine.ts` | Task snapshot, normalized History, `now`, timezone, rollover | `statusesByTaskId` plus projected Task objects. Main TaskApp projection for Home, Table/List contexts, Paths, On-Time, editor selection, search/derived contexts. | Reads both Task configuration and History; treats stored fields as legacy input/projection. | Yes, where downstream code falls back to raw status or where legacy due helpers use different recurrence semantics. |
| 2. Legacy cockpit display | `getTaskDisplayStatus()` / `getTaskDisplayStatusWithHistory()` in `src/lib/task-cockpit.ts` | Stored Task, optional History, logical date | Visible display status, including stored-status short-circuits and due-date buckets. Read adapter's disabled branch and shadow comparison import it; agent-plan uses the no-History form. | Trusts `task.status`, `due_on`, and selected History rows. | Yes. It does not replay the full Effective Timeline. |
| 3. History live-status/rebase | `resolveLiveTaskStatusFromHistory()` in `src/lib/task-history.ts`, using `resolveRecurringLiveStatusFromNextDueDate()` in `src/lib/task-repeat.ts` | Task, History, logical-day context, edited dates, optional next-date calculator | Returns a Task status/due projection after a History edit. `useTaskHistoryActions` uses it when engine action authority is unavailable; shadow compares it. | Reads History, due date, and legacy recurrence. | Yes. It can derive from a different cursor/rebase algorithm and is guarded only by caller conditions. |
| 4. Stored-status/bucket path | `task.status` consumers in `task-buckets.ts`, `task-app-derived.ts`, `task-lists.ts`, `task-list-sort.ts`, `task-table-row.ts`, child paths | Stored Task and optional projection map | Open/finished/urgent buckets, Smart List display status, sort order, child status, row fallback. | Primarily trusts stored `status`; uses projection map when supplied. | Yes. It can show stale stored state whenever a projection is absent or a child path reads raw status. |
| 5. Direct editor/active tracking | `task-editor-model.ts`, `task-editor-modal.tsx`, `task-active-status.ts`, `applyTaskActiveStatusTracking()` in mutation hooks | Draft status, requested status, active logical date, active occurrence due date | Draft/editor status and persistence of `in_progress` tracking fields; used by generic/batch/editor paths when no engine plan is available. | Reads draft/stored status and writes active tracking fields. | Yes. Draft selection is not the Effective Timeline and the direct tracker can bypass engine semantics. |

### Current Status Authority Graph

```text
TaskApp hydration
  ├─ Tasks + History
  └─ logical day / timezone / rollover
        │
        ▼
resolveActiveTaskStatuses() [engine enabled]
        │
        ├─ adaptLegacyTaskState()
        ├─ evaluateTaskState()
        └─ statusesByTaskId
              │
              ▼
projectTasksForActiveStatusRead()
        │
        ├─ HomePage → status icon + shared updateTaskStatus()
        ├─ TaskApp derived index → Smart Lists/buckets/search
        ├─ Table/List row context → displayStatus, with stored fallbacks
        ├─ PathsWorkspace → projection map, raw child fallback
        ├─ OnTimePlannerWorkspace → projection map, raw task fallback
        └─ Task editor selection → engine-projected Task-shaped object

Status action UI
  └─ TaskApp.updateTaskStatus()
       ├─ load/deduplicate History
       ├─ evaluateTaskActionAuthority()
       │    └─ adaptLegacyTaskState() → evaluateTaskState()
       ├─ projectPersistableTaskStatePatch()
       ├─ runGuardedTaskRowUpdate() → adhdice_clean_tasks
       └─ syncTaskHistoryEntry(s)() → adhdice_task_history

Fallback / competing read paths
  ├─ getTaskDisplayStatusWithHistory() [legacy cockpit]
  ├─ resolveLiveTaskStatusFromHistory() [History rebase fallback]
  ├─ getTaskDisplayStatus() [agent-plan and legacy display]
  ├─ task.status [child, bucket, no-map fallback]
  └─ buildTaskHistoryCalendarDueDateSet() [Calendar parallel input]
```

The graph is not equivalent to “the engine owns every visible status.” The engine owns the TaskApp active-status projection when its input readiness is satisfied; individual consumers still have fallback branches, and mutation callers still contain non-engine-compatible branches.

## 3. Recurrence implementations and authority graph

### Recurrence path inventory

| Path | Functions / files | What it calculates | Caller evidence | Authority assessment |
|---|---|---|---|---|
| Engine recurrence kernel | `task-state-engine/recurrence.ts` | Scheduled-date membership for rolling/weekly/monthly, next fixed occurrence, next occurrence after success, occurrence identity. | Engine, Effective Timeline, repair, shadow, and `task-history.ts`. | Best candidate for canonical recurrence semantics. |
| Effective Timeline projection | `task-state-engine/effective-timeline.ts` | Historical missed chains, future scheduled dates, rebasing after explicit success, current occurrence and streaks. | Calendar adapter and History streak summary. | Canonical derived projection, not a separate cursor writer. |
| Legacy recurrence helper | `src/lib/task-repeat.ts` | `calcNextDueDateFromDate`, recurring live status, daily-until-complete missed keys, overdue reconciliation gate, repeat labels. | History, History actions, reward controller, editor/update hooks, TaskApp, UI formatting. | Still active; competing implementation. |
| Legacy History recurrence | `src/lib/task-history.ts` | Due-date set, scheduled-date test, historical Missed backfill, live status from History, calendar virtual state, saved-row streaks. | Calendar adapter, History actions, rewards, summaries, reports, sorting. | Mixed implementation: imports engine recurrence for some checks and legacy `task-repeat` for others. |
| Reward/finalization recurrence | `useTaskRewardController.finalizeRecurringTasks()` | Computes next due after successful reward/completion and writes Task status/due. | Reward eligibility/finalization callbacks in TaskApp and action hooks. | Repeats legacy due/status calculation outside the engine plan for non-engine-managed candidates. |
| Engine rollover database path | `adhdice_apply_task_state_engine_rollover` SQL sources, invoked by TaskApp | Applies client-generated engine rollover plan, including task patch and History plan. | `TaskApp.runDayReset()` RPC call. | Target path, but deployed availability is not verified here. |
| Legacy rollover database path | `adhdice_reconcile_task_rollover` SQL sources, invoked as fallback | Server-side overdue/recurrence reconciliation and automatic Missed persistence. | TaskApp fallback if engine RPC is missing/schema-cache unavailable. | Conditionally reachable compatibility path; semantics are not proven identical to engine RPC. |

### Recurrence Authority Graph

```text
Task repeat fields + due_on + explicit History
        │
        ├─ canonical candidate: task-state-engine/recurrence.ts
        │       └─ engine.ts / effective-timeline.ts
        │
        ├─ legacy: task-repeat.ts
        │       ├─ task-history.ts
        │       ├─ useTaskHistoryActions.ts
        │       ├─ useTaskRewardController.ts
        │       └─ editor/update compatibility branches
        │
        ├─ Calendar legacy due-date set
        │       └─ task-view-adapters.tsx
        │
        └─ server rollover alternatives
                ├─ apply_task_state_engine_rollover(plan)
                └─ reconcile_task_rollover(user, now)
```

The likely canonical owner is the engine recurrence kernel plus Effective Timeline. That is a recommendation only. `task-repeat.ts`, the History rebase helpers, reward finalizer, and legacy RPC must be behaviorally compared before absorption or removal.

## 4. Task mutation matrix

The matrix counts intent boundaries, not every button. Table, List, Home, Grid, Paths, On-Time, and scratch/task surfaces generally converge on TaskApp callbacks; they are listed as entry surfaces under the shared command rows.

| # | User action / source | Entry surface | Command / hook | Engine used? | Task write | History write | Reward/economy side effect | Competing path or risk |
|---:|---|---|---|---|---|---|---|---|
| 1 | Create a Task | Home, Grid, editor, composer | TaskApp `saveTaskEditor()` → `useTaskEditorSaveAction` | No action for a new row; editor schedule/action planning is not applicable to insert | None by default | Focus/economy callbacks may run | Insert uses `insertTaskRowWithLegacyEnergyFallback()` into `adhdice_clean_tasks`; defaults can be set by editor model. |
| 2 | Import Tasks | Import modal / task CRUD | `useTaskCrudActions.importTasks()` → local `insertImportedTaskRow()` | No | Direct `adhdice_clean_tasks.insert()` with column fallbacks | None | No engine History plan; imported status/due/repeat values enter as stored facts. |
| 3 | Generic Task update | Table/List row actions, Paths, On-Time, task widgets, metadata controls | TaskApp `updateTask()` → `useTaskUpdateAction` | Yes for occurrence-sensitive/schedule changes when enabled; otherwise direct update | `runGuardedTaskRowUpdate()` → `updateTaskRowWithLegacyEnergyFallback()` | Optional `syncTaskHistoryEntry()` for explicit outcome | Optional `reconcileOverdueTaskMisses()`, reward callbacks | `shouldReconcileOverdueTaskMisses()` and legacy live-status inputs remain in hook. |
| 4 | Existing editor save | Task editor modal/shared editor | `saveTaskEditor()` → `useTaskEditorSaveAction` | Yes for occurrence-sensitive/schedule changes; `evaluateTaskActionAuthority` / schedule authority | Guarded Task update | Optional History sync; rollback/refresh on failure | Focus, notes, subtasks, rewards; legacy overdue reconciliation when no engine authority | Draft status and due fields are UI-owned until save; `applyTaskActiveStatusTracking()` remains compatibility behavior. |
| 5 | Batch edit | Table/List batch menu | `useTaskBatchEditAction` | Yes for schedule/action-sensitive changes | Per-task guarded updates | Per-task History synchronization when action plan exists | Optional reward/notification callbacks | Batch path has its own preflight and can use active-status tracking if authority is unavailable. |
| 6 | Set status / record outcome | Table, List, Home, Grid, Paths, On-Time, scratch, TaskApp controls | TaskApp `updateTaskStatus()` | Yes: action authority for done/did_my_best/missed/delayed and complete | Direct guarded Task write from the mutation plan | `syncTaskHistoryEntry(s)`; permanent complete can use completed event semantics | Reward/economy and timed completion gates | Completion has specialized flow and History compensation; direct UI status is still raw Task input before command. |
| 7 | Delay to date | Table/List delay picker, editor, TaskApp | TaskApp `delayTaskToDate()` → `evaluateTaskActionAuthority` | Yes | Guarded Task patch with delayed due/active fields | History plan may record delayed outcome | Reward/notification path as applicable | Delay status, due date, and unresolved occurrence semantics must stay aligned across engine and stored projection. |
| 8 | Permanent Complete | Complete button/timed completion/editor | TaskApp completion flow around lines 5492-5587 | Yes when authority returns a plan | Guarded Task update, completed fields | History sync for complete outcome/event; rollback on History failure | Reward queue and timed completion | `ProposedTaskStatePatch` deliberately cannot archive/trash/delete; lifecycle mutation remains outside engine. |
| 9 | History Calendar edit | History Calendar modal | TaskApp `onSetStatuses` → `syncTaskHistoryEntries`; complete/delay may route through status commands | Yes for Calendar read/action status and historical override | Optional live Task sync; engine plan can advance/rebase | Direct delete/upsert for selected dates | Notification/reward callbacks | Calendar builds legacy `dueDates` before Effective Timeline; explicit vs calculated semantics can diverge. |
| 10 | Trash / archive-like status | Editor, TaskApp status controls | `useTaskCrudActions.trashTask()` / TaskApp status command | Engine patch does not own lifecycle/archive/trash/delete | Guarded update to `status: trashed`/`trashed_at` or lifecycle values | Usually no normal History outcome | Cleanup/economy callbacks as configured | Engine reads archived/trashed as lifecycle facts, but patch allow-list excludes these operations. |
| 11 | Permanent delete | Trash/cleanup action | `useTaskCrudActions.deleteTask()` → `deleteTaskRow()` | No | Revision-aware `adhdice_clean_tasks.delete()` | No direct History reconciliation in client path; DB cascade/contract is external | Related cleanup callbacks | Deletion is outside Task State Engine and may rely on DB relationships. |
| 12 | Recurring reward finalization | Reward controller after completion/claim | `useTaskRewardController.finalizeRecurringTasks()` | Only indirectly; candidates marked `engineManaged` are excluded, non-engine-managed candidates use legacy finalizer | `updateTaskRowWithLegacyEnergyFallback()` with legacy next due/status | `reconcileOverdueTaskMisses()` can upsert automatic Missed rows first | Reward claim/economy and subtask reset | Second completion/recurrence writer remains reachable for non-engine-managed candidates. |
| 13 | Logical-day rollover | Startup, visibility, pageshow, timer, resume | `TaskApp.runDayReset()` → coordinator/gate → engine plan → RPC | Yes for plan; server path selected at runtime | Engine RPC or legacy RPC writes Task rows | Engine/legacy RPC can write automatic History | Rollover achievement/reward evaluation may follow | Two RPC authorities coexist; client fallback is deliberate until deployment is confirmed. |
| 14 | Legacy subtask promotion to Task | Migration/compatibility flow | `promoteLegacySteps()` in `task-legacy-step-promotion.ts` | No | Direct Task insert and compensating delete on mapping failure | No Task History plan | Mapping table write; no Task reward | Migration-only/compatibility path, not a status authority, but it creates Tasks outside normal command layer. |

### Common persistence layer

The normal Task write path converges on `src/lib/task-db-mutations.ts`:

- `insertTaskRowWithLegacyEnergyFallback()` writes `adhdice_clean_tasks` with energy/column fallback handling.
- `updateTaskRowWithLegacyEnergyFallback()` performs revision-aware optimistic updates and handles actual-time/energy compatibility.
- `deleteTaskRow()` performs revision-aware deletion.
- TaskApp wraps updates in `runGuardedTaskRowUpdate()` and refreshes the latest row before mutation.

The exceptions are imported-row insertion in `useTaskCrudActions`, legacy-step promotion, and the server rollover RPC. No production source import of `adhdice_tasks` was found; the current DB Task table name in these paths is `adhdice_clean_tasks`.

## 5. History authority map

### A. Explicit History persistence

| Path | File/function | Operation | Meaning | Task side effect | Recurrence side effect |
|---|---|---|---|---|---|
| Selected-date clear | `useTaskHistoryActions.deleteHistoryDates()` | Direct `adhdice_task_history.delete()` | Removes an explicit saved fact for a logical date. | May leave Task projection to be resynchronized by caller. | Does not itself calculate a new cursor. |
| Single History action | `useTaskHistoryActions.syncTaskHistoryEntry()` | Direct `adhdice_task_history.upsert()` with `onConflict: user_id,task_id,entry_date` | Saves one explicit outcome and occurrence metadata. | Optional `syncLiveTaskStatus()` updates Task. | Clears compatible automatic Missed rows and may use legacy next-date fallback. |
| Batch History action | `useTaskHistoryActions.syncTaskHistoryEntries()` | Direct delete/upsert for selected dates | Saves or clears a set of explicit outcomes. | Optional live Task synchronization. | Legacy-only Missed backfill branch is gated by engine integration flag. |
| Automatic overdue reconciliation | `useTaskRewardController.reconcileOverdueTaskMisses()` | Direct History select/upsert | Persists automatic Missed rows with `counted_as_due_occurrence: false`. | Usually called before recurring finalization or from non-engine editor/update paths. | Uses `buildOverdueTaskMissedDateKeys()` and legacy recurrence. |
| Engine/legacy rollover RPC | TaskApp `runDayReset()` and SQL sources | Server-side Task/History mutation | Applies a client plan or legacy reconciliation. | Writes Task projection and possibly lifecycle/status fields. | May insert rollover/reconciliation Missed rows. |

### B. History interpretation and projection

| Path | File/function | Explicit saved fact? | Inferred/calculated fact? | Display/statistics? | Recurrence/mutation? |
|---|---|---:|---:|---|---|
| Normalize by logical date | `deduplicateTaskHistoryByLogicalDate()` in `task-history.ts` | Yes; picks latest updated/created/id row | No | Input normalization | No mutation |
| Saved History facts | `buildTaskHistoryFacts()` / `computeTaskHistoryStats()` / `computeTaskSpecificHistoryStats()` | Yes | No; saved rows are the source | Statistics, last done, saved streaks, due opportunity reports | Uses legacy schedule helpers for due interpretation |
| Effective Timeline | `buildTaskEffectiveTimeline()` | Yes; explicit row wins for a logical date | Yes; calculated scheduled/open/missed/not-due days have no History row | Calendar, current completion/missed streak, current occurrence | Uses engine recurrence; no writes |
| Calendar adapter | `resolveTaskHistoryCalendarRead()` and `task-view-adapters.tsx` | Yes | Yes | Visible Calendar state and selected action statuses | Engine read/action boundary, but legacy due-date set is built in parallel |
| Legacy live resolver | `resolveLiveTaskStatusFromHistory()` | Yes | Partly; derives Task status/due from History and next date | Mutation-time Task projection | Uses legacy recurrence; may write through caller |
| Shadow comparator | `runTaskStateShadow()` | Yes | Yes | Diagnostic mismatches/anomalies | Compares legacy and engine; no writes |
| Streak summary adapter | `buildTaskHistoryStreakSummary()` | Yes | Yes when Effective Timeline is available | Compact Table/List streak fields | Engine timeline first, saved stats fallback |

### Explicit versus calculated Missed state

The current branch has three semantically different Missed forms:

1. A manually saved explicit Missed History row, typically with occurrence metadata and a user action provenance after adaptation.
2. A calculated Missed Calendar day from Effective Timeline. This has `origin: calculated`, no History row id, and must not create a persistence side effect.
3. An automatic Missed History row written by legacy reconciliation or proposed by engine rollover/reconciliation. This is persisted state even though its business meaning is “the schedule was not handled.”

Therefore the statement “Missed is derived and not persisted” is only true for Effective Timeline calculated days. It is not true for all current rollover and legacy compatibility paths. Backdated success cleanup in `syncTaskHistoryEntry(s)` also treats old automatic Missed rows as removable explicit rows, which further couples the two categories.

## 6. Rollover and logical-day authority

### Rollover Authority Graph

```text
now / timezone / configured day-start
        │
        ▼
logical-day.ts
  └─ getLogicalDayKey() / rollover configuration
        │
        ├─ task-rollover-gate.ts
        │    └─ localStorage user|logicalDay|timezone|rolloverTime gate
        │
        └─ task-rollover-coordinator.ts
             └─ single-flight owner/generation
                    │
                    ▼
TaskApp.runDayReset(source)
  ├─ waits for Task + History readiness when engine integration is enabled
  ├─ reads current Tasks/History
  ├─ createEngineRolloverPlan()
  ├─ if engine plan has mutations:
  │     └─ RPC adhdice_apply_task_state_engine_rollover(plan)
  ├─ if engine RPC is missing/schema-cache unavailable:
  │     └─ RPC adhdice_reconcile_task_rollover(user, now)
  └─ refreshes/reconciles workspace and records local gate

Other reachable rollover-like paths
  ├─ useTaskUpdateAction → shouldReconcileOverdueTaskMisses()
  │    └─ reconcileOverdueTaskMisses() [legacy automatic History]
  ├─ useTaskEditorSaveAction → same legacy branch when no authority
  └─ useTaskRewardController.finalizeRecurringTasks()
       └─ legacy next due/status write for non-engine-managed candidates
```

Current responsibilities are split as follows:

| Responsibility | Current authority |
|---|---|
| Logical day | `logical-day.ts` using configured timezone and day-start; engine receives the value. |
| Whether client rollover runs | `task-rollover-gate.ts` plus `task-rollover-coordinator.ts`, triggered by TaskApp startup/visibility/pageshow/timer/resume wiring. |
| Overdue and occurrence interpretation | Engine planner for the engine branch; legacy `task-repeat.ts`/`task-history.ts` for compatibility branches; server logic for either RPC. |
| Task writes | Caller-owned Task helper for client action paths; selected RPC for rollover. |
| History writes | `useTaskHistoryActions` for user edits; reward controller for legacy automatic Missed; selected RPC for rollover. |
| Automatic Missed policy | Not singular. Effective Timeline calculates; engine can propose rollover/reconciliation rows; legacy reconciliation persists rows. |
| Deployed runtime authority | Unknown from source inspection. Checked-in SQL contains both function families; no live SQL or Supabase inspection was performed. |

The current source deliberately makes engine and legacy rollover mutually exclusive within one coordinator execution, but it does not remove the legacy fallback. It also does not prevent all other legacy reconciliation paths from being invoked by non-rollover actions.

## 7. Stored versus derived Task state

### Current database fields

The Task type in `src/lib/database.types.ts` contains `status`, `due_on`, `active_status_logical_date`, `active_occurrence_due_on`, `due_time`, repeat configuration, `completed_at`, `trashed_at`, and optimistic `revision`. Task History contains `entry_date`, `occurrence_key`, `occurrence_due_on`, `status`, `event_type`, `counted_as_due_occurrence`, and `was_completed`. The engine adapter explicitly notes that persisted `recurrence_cursor` and `satisfied_occurrence_identity` fields do not exist in the current Task shape.

| Field / concept | Current use classification | Current consumers | Desired long-term role to decide in Phase 1+ |
|---|---|---|---|
| `Task.status` | Persisted projection/cache plus compatibility input; not a sufficient sole authority. | TaskApp projection, buckets, Smart Lists, Table/List fallback, editor draft, mutations, reward finalizer. | Stable projection of canonical effective state, or reduced lifecycle/configuration fact; must not silently compete with derived state. |
| `Task.due_on` | Overloaded stored schedule cursor / one-off due date / legacy live-status input. | Engine adapter, legacy recurrence, Calendar helpers, Table/List due display, editor, rollover, finalizer. | Canonical active occurrence due date or explicit configuration anchor; exact meaning must be formalized. |
| `Task.active_occurrence_due_on` | Persisted active occurrence anchor/cache. | Engine adapter, active-status tracking, stale In Progress rollover, History metadata, timer/occurrence consumers. | Canonical persisted active occurrence identity component, or removable projection if occurrence identity moves to an explicit repository. |
| `Task.active_status_logical_date` | Persisted active-status origin/cache. | Engine adapter and direct active-status tracking; stale In Progress rollover. | Canonical session/logical-day fact only if `in_progress` remains a persisted state; otherwise derived/transient. |
| `Task.due_time` | Stored within-day scheduling field; engine adapter marks it unsupported for logical-date semantics. | Legacy cockpit, editor, display, Task update. | Either a separate time-of-day presentation constraint or an explicit engine input; cannot remain an undocumented authority. |
| Repeat fields (`repeat_frequency`, interval, weekdays, monthly fields) | Authoritative Task configuration input. | Both recurrence families, editor, display labels, engine adapter, legacy finalizer. | Canonical configuration repository fields consumed by one recurrence kernel. |
| `Task.completed_at` | Lifecycle/completion projection and compatibility metadata. | Complete flow, editor, database Task row, reports. | Projection of explicit terminal completion fact or lifecycle fact with one clear precedence rule. |
| `Task.trashed_at` | Lifecycle persistence. | Trash/delete/editor/UI visibility. | Canonical lifecycle fact, outside active occurrence calculation. |
| `Task.revision` | Optimistic concurrency control, not domain state. | Guarded Task update/delete, rollback/refresh. | Remain repository concurrency metadata. |
| History `entry_date` | Explicit logical-day key. | Deduplication, Calendar, stats, writes. | Canonical explicit event date, unique per task/logical day unless multi-event semantics are deliberately introduced. |
| History `occurrence_key` / `occurrence_due_on` | Persisted occurrence metadata, sometimes absent in legacy rows. | Engine replay, Calendar, repair report, automatic Missed cleanup, On-Time identity. | Canonical occurrence identity and due anchor for every consuming/handling outcome; define identity invariants. |
| History `status` / `event_type` | Explicit outcome plus terminal event discriminator. | Engine adapter, saved stats, Calendar, History actions. | Canonical explicit outcome/event record; `complete`/archive precedence must be formalized. |
| `counted_as_due_occurrence` / `was_completed` | Denormalized History metadata. | Legacy due/streak/stat helpers, engine adapter, rewards. | Derived-at-write metadata only if its derivation is specified and repairable; otherwise remove duplicate meaning. |
| Engine recurrence cursor / satisfied identity | Internal derived state; not persisted in current Task row. | `engine.ts`, Effective Timeline, repair/shadow. | Decide whether it remains reconstructable or becomes an explicit canonical persisted fact. |
| Calculated Missed Calendar day | Derived display state; no History row id. | Effective Timeline, Calendar, current Missed streak. | Remain non-persistent inferred state unless Phase 1 explicitly changes the model. |

## 8. UI consumption matrix

| Surface | Visible status source | Due date source | Streak source | Repeat label source | Independent derivation / bypass | Direct Task mutation? |
|---|---|---|---|---|---|---|
| Table | TaskApp `taskDisplayStatusByTaskId` through row context; row falls back to `task.status`. | Task fields and row helpers; due display uses legacy formatting helpers. | Compact History streak summary / row context, with saved-stat fallback. | `task-repeat.ts` formatting helpers. | Child rows in `tasks-list-adapter.tsx` can use `childTask.status`; raw Task fallback remains. | Yes, via TaskApp callbacks for status, edit, delay, batch, pin/order and related actions. |
| List | Same active-status map in the list/table adapter; Smart List rule context uses map when supplied, stored status otherwise. | Task row/legacy due helpers. | History facts/compact summaries. | `task-repeat.ts` labels. | Folder/list rule evaluation and child hierarchy can fall back to stored fields. | Yes, via shared TaskApp callbacks and list rail mutations; status writes converge on commands. |
| Task editor | Selected Task comes from `tasksForActiveStatusRead`; draft status is local editor state until save. | Draft `dueOn`/due fields; save authority reconciles schedule. | Modal stats from History/summary context. | `task-repeat.ts` summary/label helpers. | Subtask status is a separate draft model; `task-active-status` tracking remains a compatibility path. | Yes, through `saveTaskEditor()` and trash/complete actions. |
| History Calendar | `resolveTaskHistoryCalendarRead()` / Effective Timeline when engine input is available. | Engine timeline occurrence dates, but `task-view-adapters.tsx` also builds legacy `buildTaskHistoryCalendarDueDateSet()` before the read. | Effective Timeline current streak, with saved stats fallback. | Legacy repeat helpers and Calendar labels. | Explicit History overrides calculated state; archived/trashed has fallback; legacy due set remains parallel. | Yes, selected dates call History delete/upsert and optional live Task synchronization. |
| Home | Receives `tasksForActiveStatusRead`, so parent Task status is engine-projected. | Displays Task-derived shape; Home itself does not calculate recurrence. | Not a primary Home display. | Not a primary Home display. | `useHomeTodoState` persists only Home selection/order state; status control uses raw projected Task passed by TaskApp. | Yes, `onSetStatus` routes to TaskApp `updateTaskStatus`; Home todo selection state has its own persistence. |
| Smart Lists | `task-lists.ts` uses `taskDisplayStatusByTaskId` if provided, otherwise stored `task.status`. | Rule evaluator consumes Task fields and legacy due facts. | History facts and saved/current streak fields. | Task repeat configuration/labels. | Fallback behavior makes projection availability semantically significant. | Usually through shared row/status callbacks, not direct repository calls. |
| Paths linked Tasks | `PathsWorkspace` maps `taskDisplayStatusByTaskId` into linked Task objects. | Task fields. | Not a primary Paths calculation. | Task fields/labels. | Child chips and hierarchy nodes render raw `task.status` in several paths; status menu calls TaskApp callback. | Yes, status and editor opening route to TaskApp. |
| On-Time linked Tasks | `taskDisplayStatusByTaskId[task.id] ?? task.status`; linked occurrence identity is separately stored in planner state. | Task occurrence/current fields plus On-Time item identity. | Learned duration statistics, not task completion streak authority. | Task formatting. | Current occurrence matching is an additional identity layer; temporary items have no Task state. | Yes, status action routes to TaskApp; planner item state is separate. |
| Task Grid/Card views | Usually receive filtered Task collections already built by TaskApp; status controls render `task.status` from those projected objects. | Projected Task fields. | Task History stats passed by TaskApp. | Repeat formatting helpers. | Subtask status is raw subtask state; collection filters depend on derived index/map. | Yes, shared status/editor callbacks. |

## 9. Legacy, shadow, and compatibility sweep

This sweep is limited to Task-state-related hits. Unrelated storage, focus, achievements, and generic migration helpers are not candidates for deletion merely because they contain “legacy.”

| System | Evidence | Current classification | Why it remains / uncertainty |
|---|---|---|---|
| `task-state-engine/legacy-adapter.ts` | Imported by read/action/Calendar/rollover/repair/shadow and streak summary. | Still required | It converts the DB shape and reports missing/unsupported occurrence facts. |
| `task-state-engine/read-authority.ts` compatibility flag | `TASK_STATE_ENGINE_INTEGRATION_ENABLED = true`; deprecated alias remains. | Still required during convergence | The flag controls legacy read fallback and gates legacy Missed reconciliation/finalization behavior. |
| `task-state-engine/shadow.ts` + `runtime-bridge.ts` | Development-only dynamic registration from TaskApp; compares legacy and engine outputs. | Still required for diagnosis | It is the branch’s explicit divergence detector; not a production write path. |
| `recurring-date-repair-report.ts` + runtime | Development-only report for a fixed affected Task ID set. | Migration/repair-only, currently active | It is read-only evidence for malformed legacy recurrence state; disposal requires a completed repair decision. |
| `src/lib/task-repeat.ts` | Imported by History, History actions, reward controller, editor/update hooks, TaskApp, and UI formatting. | Still required by current callers; target for absorption | It contains both business recurrence and presentation labels, so it cannot be removed as a cosmetic cleanup. |
| `src/lib/task-history.ts` legacy helpers | Live status, due-date set, Missed backfill, overdue keys, saved stats. | Still required by current callers; unclear long-term role | Some saved-stat and normalization functions should remain, but recurrence/status functions overlap the engine. |
| `src/lib/task-cockpit.ts` | Legacy display status functions imported by read-authority disabled branch, shadow, and agent-plan. | Compatibility / unclear | Direct production visibility is narrower than engine projection but still part of current behavior. |
| `useTaskRewardController` legacy finalizer | Excludes `engineManaged` candidates but finalizes non-engine-managed recurring Tasks. | Still active compatibility path | It writes Task due/status and automatic Missed History outside the engine plan. |
| `shouldReconcileOverdueTaskMisses()` | Used by generic update/editor and legacy-compatible TaskApp paths. | Still active compatibility path | It gates automatic History persistence; exact reachability depends on authority result and flag. |
| Engine rollover RPC family | `adhdice_apply_task_state_engine_rollover` SQL patches and TaskApp invocation. | Active target path; deployment unclear | Checked-in SQL is source evidence only; no live function inspection was allowed. |
| Legacy rollover RPC family | `adhdice_reconcile_task_rollover` SQL and TaskApp fallback. | Still active compatibility path | Fallback is explicit when engine RPC is missing/schema cache unavailable. |
| `task-db-compat.ts` | Missing-column/enum fallback used by Task mutation helpers. | Still required | Compatibility with database rollout state; unrelated to status authority but on every normal Task write. |
| `task-legacy-step-promotion.ts` | Direct Task insert plus mapping table for old subtasks. | Migration-only / still callable | It creates Tasks outside the command layer. Do not delete until promotion coverage and ownership are decided. |
| `forceRecurringFinalization` option | Passed by editor path when engine integration is disabled. | Compatibility-only | It is a flag-controlled fallback, not proof that the finalizer is obsolete. |
| Prototype/Test page imports | Dynamic imports in TaskApp, `AppPage` includes `Test`, dock includes `Test`. | Production-routable diagnostic UI | These are not Task State compatibility systems, but they are still shipped/routable source and should be moved or gated later. |

## 10. Large-file / god-object audit

The line count is a discovery signal only. No split is recommended solely because a file is large.

| File | Lines | Major responsibilities | Mixes 3+ responsibility classes? |
|---|---:|---|---:|
| `src/components/task-app.tsx` | 9376 | App routing/page shell; workspace hydration and readiness; active-status projection; TaskApp derived indexes/search; Task CRUD/status/editor callbacks; Task/History persistence; rollover coordinator/RPC; rewards/timers/actual time; realtime/profile/focus/health wiring; Test page rendering. | Yes: rendering, routing, data access, caching, realtime, domain calculations, mutation, persistence. Highest architectural concentration. |
| `src/components/task-app/tasks-list-adapter.tsx` | 3724 | List/table adapter; search commit; rail/folder/list drag and CAS intent; table row context; child/hierarchy display; menus and status/editor callbacks. | Yes: rendering, list-domain calculations, interaction/mutation intent, caching/row context. |
| `src/components/ui/task-management-table-v2.tsx` | 10271 | Table/prototype rendering; columns/filters/sorts; drag/resize/layout; row actions; timer/editor affordances; status/due/repeat presentation; test-page preview. | Yes: rendering, UI state, row/domain presentation calculations, interaction callbacks. It is shared by live and Test surfaces. |
| `src/components/task-app/tasks-page.tsx` | 1765 | Task surface switch/header; task tabs/list/table/grid secondary view composition; operation controls and callback contracts. | Yes: rendering, routing/surface state, interaction orchestration. |
| `src/components/task-app/task-view-adapters.tsx` | 1046 | Calendar/status adapter; History Calendar date/state rendering; task grid/card/matrix secondary views; legacy due set plus engine Calendar read; action callback wiring. | Yes: rendering, Calendar/domain calculations, adapter/mutation intent. |
| `src/components/task-app/task-editor-modal.tsx` | 1198 | Draft form; status/repeat/due controls; subtask editing; validation/serialization; editor-specific complete/trash actions. | Yes: rendering, draft state, business-rule validation, mutation intent. |
| `src/hooks/useWorkspaceData.ts` | 1664 | Task/History/profile/list/focus data loading; paged critical History; realtime subscriptions; resume/refresh coordination; local migration and cache reconciliation. | Yes: data access, caching, realtime, synchronization, domain readiness. |
| `src/hooks/useTaskHistoryActions.ts` | 627 | History normalization; engine action authority; explicit History delete/upsert; live Task status synchronization; recurrence fallback; notifications/reward callbacks. | Yes: domain calculations, Task/History persistence, mutation orchestration, compatibility. |
| `src/components/task-app/health-page.tsx` | 2565 | Health page rendering; metric/log entry forms; chart/table presentation; health-specific state and callbacks. | Mixed internally, but not a primary Task State authority; Task links are contextual. |
| `src/components/task-app/paths-workspace.tsx` | 2578 | Paths graph/list rendering; linked Task hierarchy; status/editor callbacks; list membership/task relationship views; navigation. | Yes: rendering, relationship/domain projection, routing, mutation intent; no direct Task repository write found. |
| `src/components/task-app/roll-page.tsx` | 2131 | Dice/roll UI; realtime channels; roll history/reward display; game state and animation. | Yes internally, but not a primary Task State owner. Task links/rewards are adjacent. |
| `src/hooks/useFocus.ts` | 1382 | Focus categories/sessions; active session timer; realtime; local migration; Task focus-day persistence; reward/economy integration. | Yes: data access, realtime, timers, persistence, domain calculations; separate Focus authority. |
| `src/hooks/useHealth.ts` | 1500 | Health data loading, forms, local/remote sync, realtime and health calculations. | Yes internally, but separate Health domain rather than Task State. |

The most important god-object risk for this task is `task-app.tsx`: it is simultaneously the UI router, projection assembler, mutation command dispatcher, persistence coordinator, rollover executor, and compatibility switch owner. `useTaskHistoryActions.ts` is the second most direct contradiction site because it owns both explicit History persistence and legacy live Task status reconciliation.

## 11. Prototype and test code in the production source tree

| File | Production import / route evidence | Current role | Eventually dev-only? | Safe to delete later? |
|---|---|---|---|---|
| `src/components/task-app/test-d20-face-mapper.tsx` | Dynamically imported by TaskApp; rendered under `page === "Test"`; `Test` is in `AppPage` and the bottom dock. | Dice face mapping sandbox. | Yes, unless Test becomes an intentional shipped diagnostics page. | Likely, after confirming no QA workflow depends on it. |
| `src/components/task-app/test-dice-face-mapper.tsx` | Same TaskApp dynamic import and Test-page render. | D6/camera face mapping sandbox. | Yes. | Likely, after QA confirmation. |
| `src/components/task-app/test-dice-material-lab.tsx` | Same TaskApp dynamic import and Test-page render. | Material/color exploration lab. | Yes. | Likely, after design asset decisions. |
| `src/components/task-app/test-task-table-prototype.tsx` | Same TaskApp dynamic import and Test-page render; its copy says it is isolated to Test. | Table prototype for due/priority/repeat chips. | Yes. | Likely, but `TaskManagementTableV2` itself is shared and must not be removed with the prototype. |
| `src/components/task-app/brainstorm-qa-workspace.tsx` | Imported/rendered as a Tasks surface by TaskApp; `src/lib/brainstorm-qa.ts` supplies session state. | QA session/workspace UI, not a Task State engine. | Prefer dev/QA-only or explicit feature gate. | Unclear until QA workflow ownership is decided. |

The Test page is not merely dead source: it is production-routable through `dockItems` and the `PagePlaceholder` Test branch. No deletion is proposed in Phase 0.

## 12. Testing architecture audit

No test command was run. The inventory is based on checked-in test names, fixtures, imports, and assertions.

### Important test groups

| Concern | Important tests | Fixture style / evidence |
|---|---|---|
| Core Task State Engine | `test/task-state-engine.test.ts` | Clean synthetic engine snapshots; broad coverage of actions, status, occurrence identity, cursor protection, patches, and lifecycle. |
| Engine integration/adapters | `test/task-state-engine-integration.test.ts`, `test/task-state-engine-read-authority.test.ts`, `test/task-action-hooks-smoke.test.ts` | Production-shaped Task/History values and mocked mutation boundaries; verifies adapters and optimistic Task/History coordination. |
| Effective Timeline | `test/task-effective-timeline.test.ts`, `test/task-effective-timeline-consumers.test.ts` | Clean synthetic timeline fixtures; explicit versus calculated days, future projection, streaks, and consumer shape. |
| Legacy recurrence/History | `test/task-history.test.ts` | Production-shaped recurrence fields and saved History; tests due sets, legacy backfill, live status, saved streaks, and calendar rebase. |
| History writes | `test/task-history-batch-actions.test.ts`, `test/task-history-calendar-overrides.test.ts`, `test/task-history-open-flow.test.ts` | Mocked repository/upsert/delete fixtures; includes automatic Missed cleanup and occurrence metadata. |
| History streak summaries | `test/task-history-streak-summaries.test.ts` | Compact/paged History fixtures; checks summary/table/modal agreement. |
| Rollover | `test/task-active-status-rollover.test.ts`, `test/task-state-engine-rollover-authority.test.ts`, `test/task-rollover-coordinator.test.ts`, `test/task-rollover-gate.test.ts` | Synthetic engine and source-contract tests; coordinator/gate behavior; SQL text assertions in related tests. |
| Status/UI projection | `test/task-live-status-render-integration.test.ts`, `test/stable-task-projection.test.ts`, `test/task-buckets-and-lists.test.ts`, `test/task-active-status-hierarchy-filter.test.ts` | Production-shaped Task/History and mocked table/list caches; verifies stale status correction and projection identity. |
| Table/List structure | `test/task-list-sort-and-sticky.test.ts`, `test/task-table-row-keys.test.ts`, `test/task-table-layout-persistence.test.ts`, `test/task-table-measurements.test.ts` | UI model and layout fixtures; status behavior is not browser proof. |
| Repair/shadow | `test/task-state-engine-recurring-date-repair.test.ts`, `test/task-state-engine-shadow.test.ts`, `test/task-state-engine-date-repair-sql.test.ts` | Explicit legacy/malformed fixture cases; read-only report and SQL source contracts. |

### Test coverage gaps

The test inventory is stronger for clean semantics and targeted known cases than for arbitrary dirty production combinations. The following gaps should be made explicit before implementation:

| Malformed/legacy state | Evidence currently present | Gap or needed scenario |
|---|---|---|
| Multiple successful History dates sharing the same old occurrence identity | Engine tests cover duplicate prevention and future-cursor protection; repair tests cover contradictory evidence. | Need a direct fixture with two or more successful dates claiming the same old `occurrence_key`, then assert one deterministic consuming occurrence, no double advancement, and a surfaced anomaly. |
| Stale `due_on` after a later successful History entry | Effective Timeline tests include current anchor versus stale metadata and later success rebasing. | Need end-to-end adapter/action coverage where stored `due_on` is stale, the later success is explicit, and Table/List/Calendar/editor all converge after reload. |
| Contradictory stored status versus Effective History | Shadow tests include stale `pending`/`missed` comparisons. | Need a production-shaped projection test for every consumer fallback, especially child rows, Smart List without a map, agent-plan, and editor draft initialization. |
| Stale `active_occurrence_due_on` | Engine/rollover tests cover active anchors and stale In Progress. | Need malformed combinations where active status, active logical date, active occurrence due date, `due_on`, and History identity disagree, with explicit precedence assertions. |
| Old automatic Missed rows mixed with calculated Missed logic | History batch tests remove automatic rows; Effective Timeline tests preserve calculated Missed without persistence. | Need a single fixture containing automatic identity-bearing Missed, identity-less legacy Missed, and calculated Missed for overlapping dates; assert deduplication, Calendar display, streaks, cleanup, and no new persistence for calculated days. |
| Engine plan followed by legacy finalizer | Engine-managed candidates are excluded in reward tests. | Need a mutation integration test proving a successful engine-managed action cannot later enter `finalizeRecurringTasks()` through a callback/reward path. |
| Engine RPC unavailable with loaded client plan | Source has explicit fallback and SQL contract tests. | Need a mocked RPC error-path test proving which server authority wins and that a second automatic Missed writer cannot run in the same logical-day execution. |
| Archived/trashed/complete precedence | Engine has read-only lifecycle tests. | Need every UI consumer and History Calendar adapter to assert lifecycle precedence over stored active status and calculated schedule. |

The source test suite does not prove deployed RPC behavior, live Supabase constraints, browser rendering, multi-tab generation, or BFCache/resume behavior. Those remain separate validation layers.

## 13. Explicit authority tables

### A. Current authority table

| Concern | Current authority/authorities | Competing paths | Runtime consumers | Risk |
|---|---|---|---|---|
| Recurrence | Engine `recurrence.ts` for engine paths; legacy `task-repeat.ts` and `task-history.ts` elsewhere; two RPC families. | Legacy due-date and finalizer algorithms. | Engine, Calendar, History, editor/update, rewards, rollover. | Same Task configuration can produce different next occurrence. |
| Active status | TaskApp engine read projection via `resolveActiveTaskStatuses()`. | Legacy cockpit, live History resolver, stored status/bucket fallbacks, direct active tracking. | Home, Table/List, Paths, On-Time, editor, Smart Lists, agent plan. | Visible status can depend on which adapter/map/fallback a surface receives. |
| Current occurrence | Engine replay plus `active_occurrence_due_on`/History identity. | `due_on` alone, legacy History identity inference, On-Time item occurrence identity. | Engine, Calendar, timers, History, On-Time. | Stale or missing identity can consume/reopen the wrong occurrence. |
| Next due | Engine result/patch; legacy `calcNextDueDateFromDate`; server RPC. | Reward finalizer and legacy History rebase. | Task row, editor, Calendar, rollover, display. | A success can advance due date twice or leave stale cursor. |
| Calendar | Effective Timeline through Calendar authority. | Legacy due-date set and `getTaskHistoryCalendarVirtualState`; saved-stat helpers. | History Calendar, modal stats, reports. | Calculated Missed and explicit automatic Missed can overlap. |
| History | `useTaskHistoryActions` for explicit UI writes; RPC/reward controller for automatic writes. | Direct single/batch/delete branches and legacy reconciliation. | Calendar, stats, streak summaries, rewards, engine input. | Explicit and inferred facts are not one repository semantic. |
| Missed inference | Effective Timeline for non-persistent calculated Missed. | Engine rollover proposals and legacy automatic Missed persistence. | Calendar, current Missed streak, rollover, History cleanup. | “Derived” Missed can become saved Missed on another path. |
| Positive streak | Effective Timeline current completion streak when available; saved `computeTaskSpecificHistoryStats` fallback. | Saved-row-only stats and compact summary fallback. | Table/List/modal/History/rewards. | Current streak can differ from historical saved streak. |
| Missed streak | Effective Timeline current Missed streak when available; saved stats fallback. | Legacy due-opportunity/streak calculations. | Calendar, Table/List summaries, History, rewards. | Calculated overdue days and saved Missed rows are mixed differently. |
| Delayed | Engine action/Calendar state, stored delayed status/due projection. | Editor draft and legacy status/date helpers. | TaskApp, Calendar, Table/List, editor. | Delayed may preserve or reset occurrence/streak differently by path. |
| Complete | Engine action outcome and Task/History plan; lifecycle fields remain caller-owned. | Direct completion flow, reward finalizer, stored `completed_at`, `complete` History event. | Complete action, Calendar, filters, rewards. | Engine patch cannot own archive/delete/lifecycle transitions. |
| Archive | Stored lifecycle/status and UI/CRUD code; not Task State Engine patch authority. | `isArchiveLikeTask`, complete/trashed visibility rules. | Archive/trash views, filters, Calendar fallback. | Complete, archive-like, and trashed semantics are not one engine state transition. |
| Rollover | TaskApp coordinator/gate plus engine plan/RPC. | Legacy RPC fallback, `shouldReconcileOverdueTaskMisses`, reward finalizer. | Startup, visibility, pageshow, timer, editor/update/reward. | Multiple automatic writers can make different decisions. |
| Persistence | `task-db-mutations.ts`, `useTaskHistoryActions`, caller-owned plans, and RPCs. | Direct import/promotion/finalizer writes. | All mutation surfaces, refresh/realtime. | No universal command/repository layer enforces engine participation. |

### B. Proposed canonical ownership

This is an architectural recommendation only. It is not an implementation authorization.

| Concern | Proposed canonical owner | Systems to absorb | Systems eventually removable |
|---|---|---|---|
| Recurrence | Engine recurrence kernel plus Effective Timeline | `task-repeat.ts` business recurrence; legacy History recurrence; reward finalizer calculations; equivalent RPC logic | Duplicate next-date/status calculators after parity proof |
| Active status | Engine `evaluateTaskState()` exposed through one read projection | Cockpit status-with-History, live History resolver, direct bucket status interpretation | Legacy status calculators and status fallback branches |
| Current occurrence | Explicit occurrence identity in engine input/History, with one stored projection policy | `due_on`-only inference, active field ad hoc tracking, On-Time identity translation | Ambiguous identity reconstruction after data repair |
| Next due | Engine result and one persistence projection | `calcNextDueDateFromDate`, reward finalizer, legacy RPC date advancement | Duplicate Task due writers |
| Calendar | Effective Timeline/Calendar authority | Legacy due-date set and virtual-state recurrence calculators | Parallel Calendar status/date derivation |
| Explicit History | History repository/command layer fed by engine mutation plans | Direct hook-specific upserts/deletes and automatic row conventions | Scattered History writes |
| Calculated Missed | Effective Timeline only; no persistence | Automatic Missed persistence except explicitly defined audit events | Legacy `reconcileOverdueTaskMisses` and implicit Missed History rows if not formally retained |
| Positive/Missed streaks | Effective Timeline current facts; separate saved-History statistics API | Mixed `computeTaskSpecificHistoryStats` uses for current state | Current-state dependence on saved-row-only stats |
| Delayed | Engine action/state model with explicit due/occurrence rules | Editor/legacy delayed calculations | UI-specific delayed semantics |
| Complete/Archive | Engine outcome for completion; lifecycle repository for archive/trash/delete, with formal precedence | Direct completion and archive-like heuristics | Hidden lifecycle inference from status strings |
| Rollover | One engine planner and one deployed server transaction | Legacy RPC, client automatic Missed reconciliation, reward finalizer rollover | Fallback RPC after deployment convergence |
| Persistence | Task and History repositories that accept engine plans | Hook-local direct writes, import/promotion exceptions where applicable | Uncoordinated direct Task/History writes |

### C. File disposition map

Exactly one preliminary disposition is selected for each row. “Delete after migration” means only after an approved migration and parity evidence, not during Phase 0.

| File | Current role | KEEP | ABSORB | DELETE AFTER MIGRATION | INVESTIGATE | Reason |
|---|---|:---:|:---:|:---:|:---:|---|
| `task-state-engine/types.ts` | Canonical internal model | ✓ |  |  |  | Required shared contract. |
| `task-state-engine/calendar.ts` | Engine date/logical-day kernel | ✓ |  |  |  | Shared pure foundation. |
| `task-state-engine/recurrence.ts` | Candidate canonical recurrence kernel | ✓ |  |  |  | Keep as target while legacy parity is established. |
| `task-state-engine/effective-timeline.ts` | Effective Calendar/streak projection | ✓ |  |  |  | Required derived-state owner. |
| `task-state-engine/engine.ts` | Pure Task state/action evaluator | ✓ |  |  |  | Core authority. |
| `task-state-engine/read-authority.ts` | Main active-status read switch/projection | ✓ |  |  |  | Current production read boundary. |
| `task-state-engine/action-authority.ts` | Action/schedule plan adapter | ✓ |  |  |  | Current production mutation planning boundary. |
| `task-state-engine/calendar-authority.ts` | Calendar read/action adapter | ✓ |  |  |  | Current Calendar boundary. |
| `task-state-engine/due-date-authority.ts` | Deprecated compatibility adapter |  |  |  | ✓ | No production caller found; test/API migration status unclear. |
| `task-state-engine/rollover-authority.ts` | Client rollover planner | ✓ |  |  |  | Current engine rollover plan. |
| `task-state-engine/persistence-projection.ts` | Safe Task-row patch projection | ✓ |  |  |  | Required allow-list boundary. |
| `task-state-engine/legacy-adapter.ts` | DB-to-engine translation | ✓ |  |  |  | Required until persisted occurrence model converges. |
| `task-state-engine/runtime-bridge.ts` | Development shadow bridge | ✓ |  |  |  | Active diagnostic tooling. |
| `task-state-engine/shadow.ts` | Legacy/engine comparison and patch safety | ✓ |  |  |  | Needed while contradictions remain measurable. |
| `task-state-engine/recurring-date-repair-report.ts` | Read-only malformed recurrence report |  |  |  | ✓ | Targeted repair scope and retention decision are unresolved. |
| `task-state-engine/recurring-date-repair-runtime.ts` | Development repair bridge |  |  |  | ✓ | Dependent on repair workflow completion. |
| `task-state-engine/index.ts` | Public barrel | ✓ |  |  |  | Required export boundary. |
| `src/lib/task-repeat.ts` | Legacy recurrence/status/presentation helper |  | ✓ |  |  | Absorb business calculations into engine; retain presentation helpers only if needed. |
| `src/lib/task-history.ts` | History normalization, stats, legacy recurrence/rebase | ✓ | ✓ |  |  | Keep explicit normalization/stats; absorb overlapping recurrence/status parts. |
| `src/lib/task-cockpit.ts` | Legacy display-status/due bucket helper |  | ✓ |  |  | Absorb status authority; retain pure presentation formatting if still needed. |
| `src/hooks/useTaskHistoryActions.ts` | History command/persistence and live Task sync | ✓ | ✓ |  |  | Keep as command facade while moving writes behind repository/engine plan. |
| `src/hooks/useTaskRewardController.ts` | Rewards plus legacy recurring finalizer/automatic Missed | ✓ | ✓ |  |  | Keep reward ownership; absorb/remove Task state calculations after engine convergence. |
| `src/lib/task-legacy-step-promotion.ts` | Legacy subtask-to-Task migration | ✓ |  |  |  | Keep until migration ownership and data completion are confirmed. |
| `src/lib/task-db-compat.ts` | DB schema/enum compatibility fallbacks | ✓ |  |  |  | Separate database rollout concern; not safe to infer obsolete. |
| `src/lib/task-rollover-coordinator.ts` | Client single-flight coordination | ✓ |  |  |  | Coordination remains useful after authority convergence. |
| `src/lib/task-rollover-gate.ts` | Client logical-day idempotence gate | ✓ |  |  |  | Coordination remains useful; validate against server idempotence. |
| `src/lib/logical-day.ts` | Logical-day configuration/date helper | ✓ |  |  |  | Shared context input. |

## 14. Dependency map

### Current reality

```text
Workspace load / realtime
├─ useWorkspaceData
│  ├─ adhdice_clean_tasks → Task rows
│  └─ adhdice_task_history → History rows
│
├─ TaskApp
│  ├─ resolveActiveTaskStatuses
│  │  ├─ legacy-adapter
│  │  ├─ evaluateTaskState
│  │  └─ projectTasksForActiveStatusRead
│  ├─ derived index / search / bucket / Smart List context
│  ├─ runDayReset
│  │  ├─ task-rollover-gate
│  │  ├─ task-rollover-coordinator
│  │  ├─ createEngineRolloverPlan
│  │  ├─ RPC apply_task_state_engine_rollover
│  │  └─ fallback RPC reconcile_task_rollover
│  └─ Task command callbacks
│     ├─ updateTaskStatus
│     ├─ delayTaskToDate
│     ├─ updateTask
│     ├─ saveTaskEditor
│     └─ CRUD/import/delete
│
UI reads
├─ Home
│  └─ projected Tasks → status control → TaskApp command
├─ Table/List
│  ├─ projected row context
│  ├─ task-lists / task-buckets / task-list-sort
│  └─ child/hierarchy stored-status fallbacks
├─ Task editor
│  └─ projected selected Task → local draft → editor save hook
├─ History Calendar
│  ├─ legacy buildTaskHistoryCalendarDueDateSet
│  └─ resolveTaskHistoryCalendarRead → Effective Timeline
├─ Paths / On-Time
│  └─ status map with raw Task fallbacks and shared callbacks
└─ Smart Lists / reports / agent plan
   ├─ projection map where supplied
   └─ stored/legacy status and saved History fallbacks

Task mutations
├─ TaskApp command → action-authority → engine plan
│  ├─ persistence-projection → task-db-mutations → adhdice_clean_tasks
│  └─ useTaskHistoryActions → adhdice_task_history
├─ useTaskUpdateAction / editor / batch compatibility branches
│  └─ task-repeat + resolveLiveTaskStatusFromHistory
├─ useTaskRewardController
│  ├─ reconcileOverdueTaskMisses → adhdice_task_history
│  └─ finalizeRecurringTasks → adhdice_clean_tasks
├─ useTaskCrudActions import/delete
├─ task-legacy-step-promotion → direct Task/mapping writes
└─ rollover RPCs → server-side Task + History writes

Diagnostics
├─ runtime-bridge → shadow → legacy vs engine comparisons
└─ recurring-date-repair-runtime → recurring-date-repair-report
```

### Proposed target architecture

```text
Task configuration
(repeat fields, lifecycle, explicit schedule settings)
                  +
Explicit History
(one canonical occurrence/outcome repository)
                  +
Logical Day
(timezone + rollover context)
                  │
                  ▼
          Canonical Task Engine
          ├─ recurrence
          ├─ occurrence identity
          ├─ effective timeline
          ├─ active status
          ├─ streak facts
          └─ action / rollover plan
                  │
                  ▼
          Effective Task State
                  │
                  ▼
       Canonical projection/read model
          ├─ Table
          ├─ List / Smart Lists
          ├─ Calendar
          ├─ Editor
          ├─ Home
          ├─ Paths
          └─ On-Time

UI intent
    │
    ▼
Task Command Layer
    │
    ▼
Canonical Task Engine
    │
    ▼
Persistence Plan
    │
    ├─ Task repository
    └─ History repository
```

The target diagram intentionally separates calculated state from explicit persistence. It does not prescribe schema changes in this Phase 0 document.

## 15. Top Architectural Risks

Severity is relative to state correctness, not code style. “Observed” refers to documented/current-state browser or QA evidence already associated with this branch, not a browser run performed during this inventory.

| Rank | Severity | Files/systems | Concrete failure mode | Browser bug consistent with it? | Future phase |
|---:|---|---|---|---|---|
| 1 | Critical | `engine.ts`, `task-repeat.ts`, `task-history.ts`, reward finalizer, both rollover RPCs | One successful occurrence is advanced by one path while another path retains or advances a stale `due_on`, producing wrong current occurrence, duplicate advancement, or wrong future schedule. | Yes. Current-state notes describe stale recurring Table status/due behavior after due-date/History changes. | Phase 1 semantics; Phase 2 recurrence convergence. |
| 2 | Critical | Effective Timeline, `useTaskRewardController.reconcileOverdueTaskMisses`, engine rollover | Calculated Missed and automatic persisted Missed represent the same date differently; Calendar/statistics/cleanup can count or delete them inconsistently. | Yes, consistent with History Calendar and recurring Missed discrepancies; exact deployed data not verified. | Phase 1 explicit-vs-inferred History decision; Phase 3 persistence. |
| 3 | High | `read-authority.ts`, `task-cockpit.ts`, `task-buckets.ts`, `task-lists.ts`, child row adapters | Table/List/Home/Paths/Smart List can show different statuses because projection availability and raw child/stored fallbacks differ. | Yes. A stale Table/List visible status is consistent with a fallback boundary or stale projection. | Phase 2 read convergence. |
| 4 | High | TaskApp `runDayReset`, rollover coordinator/gate, two RPC families | Client selects engine plan but falls back to legacy server function, so deployed behavior differs from source-level engine expectations. | Unverified; source proves conditional reachability, not the deployed function. | Phase 3 server rollout/convergence. |
| 5 | High | `useTaskHistoryActions`, `task-history.ts`, Calendar adapter | A History edit can persist explicit outcome, recalculate Task status through legacy resolver, and render Calendar through Effective Timeline with different precedence. | Yes, consistent with backdated History/due-date correction bugs. | Phase 2 command/read convergence. |
| 6 | High | `active_occurrence_due_on`, `active_status_logical_date`, `due_on`, History occurrence metadata | Contradictory active fields identify different occurrences; stale In Progress rollover or completion can resolve the wrong occurrence. | Unverified for every combination; shadow/repair fixtures show the class is possible. | Phase 1 occurrence identity invariants; Phase 3 repair. |
| 7 | Medium-high | `Task.status`, `completed_at`, `trashed_at`, engine patch allow-list, CRUD | Complete/Archive/Trash semantics are split between engine outcome and lifecycle code; a complete History row does not by itself define archive/visibility behavior. | Consistent with filter/visibility discrepancies, but not separately confirmed here. | Phase 1 lifecycle precedence; Phase 2 lifecycle command layer. |
| 8 | Medium-high | `computeTaskSpecificHistoryStats`, Effective Timeline, streak summary adapter | Current streak and saved-History streak answer different questions but are consumed by overlapping Table/List/modal/reward code. | Consistent with streak display differences; no browser run in this inventory. | Phase 1 streak semantics; Phase 2 read model. |
| 9 | Medium | TaskApp, hooks, direct import/promotion writes | Task rows can enter through editor, import, legacy promotion, CRUD, and rollover with different default/identity metadata. | Unverified; malformed legacy state is documented by repair/shadow fixtures. | Phase 3 repository/ingestion normalization. |
| 10 | Medium | `task-app.tsx`, Test page, shared `TaskManagementTableV2` | Production shell ships/routs prototype surfaces and a shared table component serves both experimental and live contexts, increasing accidental coupling during UI work. | Not a Task-state corruption risk by itself; can obscure which surface was QA-tested. | Phase 4 surface cleanup and QA tooling separation. |

## 16. Phase 1 Inputs

Phase 1 must formally decide these semantics before implementation changes are authorized:

- Canonical meaning of `due_on` for one-off, rolling, weekly, monthly, and daily-until-complete Tasks.
- Canonical meaning and storage policy for the current active occurrence.
- Whether occurrence identity is reconstructable or must be persisted explicitly, including identity invariants.
- Stored versus derived status, including whether `Task.status` is a projection/cache or a canonical fact.
- Recurrence cursor semantics and whether a successful early completion consumes the scheduled occurrence or the action date.
- Explicit History semantics: one row per task/logical day, event replacement, occurrence metadata, and terminal events.
- Calculated Missed semantics and the exact rule prohibiting or permitting persistence of inferred Missed state.
- Automatic rollover/reconciliation semantics, including whether rollover may create explicit automatic Missed rows.
- Delayed semantics: due-date movement, active occurrence preservation, Calendar state, and streak effects.
- Complete versus Archive versus Trash priority and lifecycle precedence.
- No Repeat semantics, including whether historical overrides may create History for an unscheduled Task.
- Current positive streak definition and current Missed streak definition, kept separate from saved-History statistics.
- Logical-day timezone and rollover boundary semantics, including resume/visibility/timer idempotence.
- What `active_status_logical_date` and `active_occurrence_due_on` mean when status is not `in_progress`.
- Whether `counted_as_due_occurrence` and `was_completed` are canonical facts or derived/repairable metadata.
- Which server rollover function is canonical and what deployment/version contract protects the client.
- Command-layer ownership for every Task and History write, including imports, legacy promotion, rewards, and deletion.
- Precedence rules for contradictory stored status, stale due fields, stale active fields, identity-less History, and duplicate occurrence identities.

Phase 1 should not begin by deleting legacy files. It should first make these choices observable in fixtures, then use the shadow and repair reports to identify data and callers that must converge.
