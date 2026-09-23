# TaskApp Architecture

Last reviewed: 2026-09-23
Role: canonical production routing and ownership contract

## Purpose

`TaskApp` is the authenticated application composition root. It selects pages,
composes workspace data and callbacks, owns route-level overlays and rollover
trigger timing, and passes authoritative projections to rendered surfaces. It
does not own independent Task State rules.

Detailed behavioral rules live in [`TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md);
loading ownership lives in [`WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md).

## One Active Status read authority

`resolveActiveTaskStatuses` in `src/lib/task-state-engine/read-authority.ts`
remains the one Active Status semantic authority. After the Phase 1E cutover,
the trusted current-projection writer persists its result and `TaskApp` reads
the valid entity-scoped current projection through the shared current-read
boundary. `TaskApp` passes the resulting `taskDisplayStatusByTaskId`
projection through the existing derived-data and surface boundaries.

Table, List, Home, editor, Steps/Substeps, filters, counts, smart lists, and
child previews consume that projection. They must not independently interpret
stored `Task.status`, selected Calendar state, partial History, or legacy
History. `getTaskDisplayStatusWithHistory` and other compatibility readers are
translation evidence during convergence, not alternate production authorities.

History date state and Active Status remain separate. Calendar can show today as
Open/Due while Active Status remains Missed because an unresolved Missed has
authority. A successful recurring outcome leaves its History date as Done/Did My
Best while the shared Active Status immediately reflects the next due date.
These semantic results are copied into the current projection; the projection
does not become a new chronology authority.

## Root and surface routing

The production Tasks route remains layered:

1. `TaskApp` selects the Tasks page and supplies data, projections, panels, and
   callbacks.
2. `TasksWorkspace` owns tab state and the workspace shell.
3. `TaskPage` selects the active Table/List/alternate surface.
4. Surface adapters and shared row components render projections and local
   controls.

`TasksTableAdapter`, `TasksListAdapter`, `TaskManagementTableV2`, editor flows,
hierarchy adapters, and child previews may own presentation and local
interaction. None may become a second status, recurrence, Calendar, History, or
streak authority.

## Mutation routing

Status changes and Task State changes from Table, List, Home, Calendar, editor,
and batch flows use the same canonical command infrastructure. The owning hook
may coordinate loading, optimistic state, errors, and reconciliation, but the
command planner/trusted boundary owns the authoritative result.

The important seams are the existing `useTaskActions` façade and extracted
action hooks, `useTaskHistoryActions`, editor/batch action hooks,
`src/lib/task-state-canonical/command-service.ts`, and
`supabase/functions/task-state-command/*`. A successful semantic mutation must
atomically invalidate an existing affected projection while reconciling Task
State, canonical History, recurrence/cursor, Calendar, streaks, and rewards.
The immediate post-commit projection write is a separate trusted,
revision-fenced operation; projection repair alone cannot write canonical facts
or reward evidence. Calendar editing is a command route, not a second Task
State system.

Permanent Complete may retain its guarded task/History execution exception, but
it still uses the same authority and cannot be used to justify surface-local
status rules.

## Workspace and History ownership

`useWorkspaceData` owns canonical Task/entity and current-projection loading for
ordinary workspace startup, user/workspace-scoped projection readiness, shared
projection cache updates, and refresh coordination. Historical Task History is
a lazy/bounded consumer domain except for explicit repair, rebuild, parity, or
migration work. TaskApp owns current-projection readiness and rollover trigger
timing; it does not copy loader rules into the composition root.

The History modal is a lazy historical consumer. Its private loading/retry state
must not become a current Task authority or change current Task state merely
because it loaded older rows. An explicit History mutation reconciles the
affected entity's canonical facts and current projection through the command
boundary.

## Hierarchy and non-Task-State boundaries

`buildTaskHierarchyAdapter` and `buildTaskAppStructuralData` derive hierarchy
relationships, visibility, and child previews. Same-table Steps/Substeps remain
part of the shared Task model. Legacy checklist/subtask rows and migration
mapping remain compatibility/source data; they cannot independently decide
current status or recurrence.

Focus, rewards/economy, notes/links, list membership, pinning, and presentation
metadata retain their existing owners. They consume Task State projections where
needed and must not infer a second current status.

## Implemented routing contract

- `TaskApp` computes/forwards the shared current status map to all active
  surfaces, including On-Time action controls.
- `useWorkspaceData` supplies valid current projections for normal workspace
  use; modal and repair reads do not create a private current-state authority.
- All Task State mutations route through the existing canonical command
  infrastructure and trusted result reconciliation, including the current
  projection write in the same authoritative persistence boundary.
- Calendar consumes canonical/effective-timeline authority; it is not a second
  Task State system.
- Task, History, behavior-policy, logical-day, and Realtime invalidation is
  entity/domain scoped. List and Folder changes refresh their own domains and
  do not cause broad Task State reloads.
- Browser behavior and deployed Edge/RPC parity remain separate verification
  boundaries.

## Compatibility boundary

The source still contains explicitly named compatibility translation and the
legacy adapter for migration/test inputs. Neither is a live production
authority. Retired migration artifacts remain historical records only.

## Related documents

- [`TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) — canonical behavioral contract.
- [`WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) —
  transitional source loading seams and post-cutover current-read contract.
- [`architecture/task-state-phase-1e-current-task-read-projection-contract.md`](architecture/task-state-phase-1e-current-task-read-projection-contract.md)
  — canonical current projection, freshness, invalidation, repair, and
  migration contract.
- [`TASKAPP_SOURCE_MAP.md`](TASKAPP_SOURCE_MAP.md) — source lookup.
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — current closure state and verification boundaries.
- [`UI_SYSTEM.md`](UI_SYSTEM.md) — UI reuse and interaction rules.
