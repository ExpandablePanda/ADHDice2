# TaskApp Architecture

Last reviewed: 2026-08-17
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
is the one Active Status read authority. `TaskApp` computes the shared
`taskDisplayStatusByTaskId` projection and passes it through the existing
derived-data and surface boundaries.

Table, List, Home, editor, Steps/Substeps, filters, counts, smart lists, and
child previews consume that projection. They must not independently interpret
stored `Task.status`, selected Calendar state, partial History, or legacy
History. `getTaskDisplayStatusWithHistory` and other compatibility readers are
translation evidence during convergence, not alternate production authorities.

History date state and Active Status remain separate. Calendar can show today as
Open/Due while Active Status remains Missed because an unresolved Missed has
authority. A successful recurring outcome leaves its History date as Done/Did My
Best while the shared Active Status immediately reflects the next due date.

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
`supabase/functions/task-state-command/*`. A successful mutation must reconcile
Task State, canonical History, recurrence/cursor, Calendar, streaks, rewards,
and the shared UI projection together. Calendar editing is a command route, not
a second Task State system.

Permanent Complete may retain its guarded task/History execution exception, but
it still uses the same authority and cannot be used to justify surface-local
status rules.

## Workspace and History ownership

`useWorkspaceData` owns full canonical Task History loading for all Tasks at
startup, user/workspace-scoped readiness, shared cache updates, and refresh
coordination. TaskApp owns readiness gating and rollover trigger timing; it does
not copy loader rules into the composition root.

The History modal is a consumer of the shared canonical snapshot. Its private
loading/retry state must not become more authoritative than startup History or
change current Task state because it loaded older rows.

## Hierarchy and non-Task-State boundaries

`buildTaskHierarchyAdapter` and `buildTaskAppStructuralData` derive hierarchy
relationships, visibility, and child previews. Same-table Steps/Substeps remain
part of the shared Task model. Legacy checklist/subtask rows and migration
mapping remain compatibility/source data; they cannot independently decide
current status or recurrence.

Focus, rewards/economy, notes/links, list membership, pinning, and presentation
metadata retain their existing owners. They consume Task State projections where
needed and must not infer a second current status.

## Implementation impact map (pending implementation)

- Keep `TaskApp`’s shared status-map wiring, `computeTaskAppDerivedData`, surface
  adapters, and shared hierarchy model; ensure every consumer receives the map.
- Simplify/remove direct `getTaskDisplayStatusWithHistory` calls, stored-status
  fallbacks, List-local status derivation, and child-preview status calculations.
- Collapse `useWorkspaceData` bounded/critical History inputs and modal-full
  History authority into one full canonical startup snapshot as specified by
  [`WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md).
- Keep mutation façades and hooks as orchestration seams, but route all Task
  State-bearing changes through the canonical command result. Do not add a new
  repository, Task table, or parallel coordinator.
- Rewrite/add parity tests covering all surfaces, counts/filters, Calendar vs
  Active Status separation, canonical automatic Missed, Unscheduled blanks, and
  mutation reconciliation. Browser behavior remains a separate QA boundary.

## Known transition statements

The current source still contains compatibility switches and legacy adapters.
That is implementation debt, not a second contract. Until runtime convergence
is completed, the source may expose an authority gap; documentation must report
it as pending rather than present compatibility behavior as locked truth.

## Related documents

- [`TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) — canonical behavioral contract.
- [`WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) —
  full startup History and cache contract.
- [`TASKAPP_SOURCE_MAP.md`](TASKAPP_SOURCE_MAP.md) — source lookup.
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — current lock and open convergence work.
- [`UI_SYSTEM.md`](UI_SYSTEM.md) — UI reuse and interaction rules.
