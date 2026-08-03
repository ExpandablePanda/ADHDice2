# TaskApp Architecture

Last reviewed: 2026-08-03
Role: canonical active authority

## Purpose

This document defines current production ownership and routing boundaries around
`TaskApp`, including where each behavior stops. It does not restate the detailed
Task State Engine, workspace-loading, UI-system, verification, or QA contracts.

## Root Composition Boundary

`TaskApp` is the authenticated application composition root. It owns:

- top-level page selection and dynamic page boundaries;
- configuration, loading, and authentication shells;
- cross-surface hook composition and callback wiring;
- route-level overlays, reward/achievement presentation, and dock-driven routing;
- Focus alarm state, persistence, and scheduled-ring orchestration;
- rollover trigger wiring after the workspace is ready.

`TaskApp` is not the direct implementation owner of every page, rendered row,
mutation, status rule, or domain cache; extracted components, adapters, hooks,
and shared authorities remain responsible for their own behavior.

## Tasks Route and Surface Routing

The production Tasks route is layered:

1. `TaskApp` selects the Tasks page and supplies data, panels, and callbacks.
2. `TasksWorkspace` owns Tasks tab state, tab interactions, and the workspace shell.
3. `TaskPage` selects the active Tasks surface and Table/List/alternate view.
4. `TasksSurfaceSwitch`, page adapters, and the rendered surface implement local
   controls and presentation.

The Tasks workspace includes Table, List, and alternate task views plus Paths,
Report, On-Time, Brainstorm, and Completed Milestones. The current surface list
is broader than the historical TaskApp page inventory.

## Table, List, and Edit Task Ownership

Table and List have separate adapters and local presentation behavior, sharing substantial
row, hierarchy, action, and inspector behavior through `TaskManagementTableV2`.

`TasksTableAdapter` builds stable row models and supplies task context to the shared table.
`TasksListAdapter` delegates to the List surface, which owns its card/list presentation
and local row-model window.

Row-model construction and rendered-table windowing are separate boundaries: the adapter
constructs a committed window with overscan, while `TaskManagementTableV2` maintains its
displayed-task window and table state. They must not be documented as one owner.

Existing-task editing uses the shared `TaskManagementTableV2` inspector and overlay.
`TaskEditFlows` and `TaskEditorModal` remain active for creation and some secondary flows;
they are not the sole existing-task editor authority.

## Task Hierarchy Ownership

`buildTaskHierarchyAdapter` and `buildTaskAppStructuralData` derive hierarchy relationships,
invalid-link diagnostics, primary visibility, and child previews. Adapters and `TaskManagementTableV2`
render those results in Table, List, and Edit Task.

Same-table Steps/Substeps are current production behavior. Valid descendants are represented
through the shared task model and remain separate from legacy
`adhdice_task_subtasks` migration/source rows. Same-parent Move Up/Move Down and
drag/drop use the shared sibling-reorder planner. Explicit move-into-parent or
unlink paths exist, but cross-parent drag, promote/demote, migration scope, and
child reward/recurrence rules remain bounded by product decisions.

Hierarchy rendering and mutation are distributed; no single TaskApp-level child-row conversion layer is authoritative.

## Mutation and Persistence Boundaries

`useTaskActions` is a façade/aggregator delegating to extracted hooks for CRUD,
creation, editor save, updates, History, batch edits, notes/links, routing,
legacy subtasks, and task-list actions.

`TaskApp` composes those hooks and supplies status, completion, reorder, move,
editor-opening, and optimistic reconciliation handlers. Guarded task-row and
History persistence remains below those handlers.

Mutation changes must preserve revision/conflict, optimistic rollback, no-op,
and projection boundaries. Detailed persistence semantics belong in
[`TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md).

## Status, History, Recurrence, and Rollover Boundaries

Task State Engine authorities own active-status reads, action planning, Calendar
facts, recurrence evaluation, rollover planning, and persistable projection.
`TaskApp` consumes the projected read result and coordinates actions; it must
not introduce a second status authority.

`useWorkspaceData` owns critical current-state facts, authenticated History
readiness, and cached History loaders. `TaskApp` owns rollover trigger timing
and readiness gating; the engine/coordinator own the rules.

Normal action-authority flows may carry a task mutation plan and proposed
History together. Permanent completion remains a qualified exception: its
guarded task and History operations are separate and include rollback handling.
Neither path should be described as universal single-operation atomicity.

See [`TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) for state semantics and
[`WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) for
the separate loading diagnostic and freshness caveat.

## Workspace Loading and Readiness Boundaries

`useWorkspaceData` owns hydration, readiness, critical facts, cached per-task/full
History loading, and workspace/task Realtime refresh. Page-specific hooks own
their gated data; `TaskApp` passes returned data and readiness to consumers.

Do not widen TaskApp startup responsibilities by copying loader details here.
Preserve canonical task rows and bounded facts; History detail is a
readiness-aware consumer concern.

## Rewards and Focus Integration

`useTaskRewardController` owns pending rewards, eligibility, dice banking,
refresh, and compatibility behavior. `useEconomy` owns economy/profile, ledger,
roll, claim, and reset operations. `TaskApp` integrates and routes them.

`useFocus` owns Focus categories, sessions, counters, and data lifecycle.
`TaskApp` controls page routing, task-selection integration, and the alarm
boundary. Focus loading details remain in Focus/workspace authorities.

## Known Authority Seams

- Some List View paths still call `getTaskDisplayStatusWithHistory()` directly
  instead of the same projected status path as `TaskApp`.
- Row-model construction and rendered-table windowing have separate owners.
- Some hierarchy preview or derived child-status paths may use stored status;
  full engine convergence is not claimed here.
- Browser rendering, Realtime, multi-tab/BFCache, deployed RPC state, and
  performance behavior were not validated by this phase.

## Change Rules

- Trace from the active route to the rendered consumer and mutation consumer.
- Do not add a second mutation, status, History, or rollover authority.
- Preserve shared Table/List/Edit Task behavior unless a local divergence is
  intentional and documented.
- Use neighboring canonical documents for state, loading, UI, and verification
  semantics instead of duplicating them here.
- When routing or ownership changes, validate the exact production seam.
- Keep extraction boundaries explicit and remove stale ownership claims when a
  responsibility moves.

## Non-Authorities

This document is not:

- the Task State Engine specification;
- the workspace-loading implementation specification;
- the UI design system or source-style guide;
- a browser QA checklist or general verification guide;
- release history;
- a complete source-file or prop inventory.

## Related Documents

- [`TASKAPP_SOURCE_MAP.md`](TASKAPP_SOURCE_MAP.md) — current source lookup.
- [`TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) — status, action, Calendar, recurrence, rollover, and persistence semantics.
- [`WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) — source-based loading diagnostic; freshness caveat applies.
- [`UI_SYSTEM.md`](UI_SYSTEM.md) and [`UI_SOURCE_MAP.md`](UI_SOURCE_MAP.md) — UI rules and approved source surfaces.
- [`AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) and [`VERIFICATION.md`](VERIFICATION.md) — workflow and production-path verification rules.
- [`task-hierarchy-plan.md`](task-hierarchy-plan.md) — active hierarchy decisions and deferred product boundaries.
- [`qa/TASK_HIERARCHY.md`](qa/TASK_HIERARCHY.md) — focused hierarchy QA.
