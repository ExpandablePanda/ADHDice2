# TaskApp Source Map

Last reviewed: 2026-08-03
Role: active implementation lookup

This map supports [`TASKAPP_ARCHITECTURE.md`](TASKAPP_ARCHITECTURE.md). It lists
the production seams needed to trace TaskApp routing and ownership; it is not a
complete file or prop inventory.
Use it to locate the production seam before editing.

| Area | Current file or symbol | Responsibility | Relationship and boundary |
| --- | --- | --- | --- |
| Root composition | `src/components/task-app.tsx` — `TaskApp` | Authenticated root composition, route selection, hook wiring, overlays, callbacks, rollover triggers | Upstream of page modules and domain hooks; not the implementation owner of every child behavior |
| Page loading | `src/components/task-app.tsx` — dynamic page declarations | Lazy page boundaries and route loading fallbacks | Keeps page modules outside the initial static graph |
| Tasks workspace | `src/components/task-app/tasks-page-orchestrator.tsx` — `TasksWorkspace` | Tasks tabs, tab interactions, surface shell, supplied panel composition | Receives data/panels from `TaskApp`; delegates surface selection to `TaskPage` |
| Tasks page | `src/components/task-app/task-page.tsx` — `TaskPage` | Surface and Table/List/alternate view selection | Presentation router; does not own task data or persistence |
| Surface switch | `src/components/task-app/tasks-surface-switch.tsx` — `TasksSurfaceSwitch` | Tasks/Paths surface control | Local control; state and callbacks come from the Tasks shell |
| Table adapter | `src/components/task-app/tasks-list-adapter.tsx` — `TasksTableAdapter` | Stable row-model construction, row context, Table adapter wiring | Constructs a committed window plus overscan; shared table owns display windowing |
| List adapter | `src/components/task-app/tasks-list-adapter.tsx` — `TasksListAdapter` | List entry point and adapter boundary | Delegates to `TasksSimpleList`; List retains local card/list presentation |
| List surface | `src/components/task-app/tasks-list-adapter.tsx` — `TasksSimpleList` | List rows/cards, local row window, inline actions, shared overlay entry | Separate presentation path with shared behavior; contains the known status-read seam |
| Shared table | `src/components/ui/task-management-table-v2.tsx` — `TaskManagementTableV2` | Table display/filter/sort state, row actions, hierarchy rows, inspector, overlay | Shared downstream consumer for Table, List overlays, and Edit Task behavior |
| Flow layer | `src/components/task-app/task-edit-flows.tsx` — `TaskEditFlows` | Secondary modal/flow assembly | Rendered by the TaskApp flow layer; Task editing is owned by the shared inspector |
| Task editor authority | `src/components/ui/task-management-table-v2.tsx` — `TaskManagementTableV2` | Existing-task inspector and shared overlay editing | Sole active Task editor for existing and newly created Tasks |
| Hierarchy adapter | `src/lib/task-hierarchy.ts` — `buildTaskHierarchyAdapter` | Parent/child maps, depth, invalid-link diagnostics, safe lookups | Pure structural helper consumed by derived data and reorder planning |
| Structural projection | `src/lib/task-app-derived.ts` — `buildTaskAppStructuralData` | Hierarchy diagnostics, primary visibility, child previews | Feeds canonical/search/view derivation; child preview status is a qualified seam |
| Child previews | `src/lib/task-app-derived.ts` — `buildChildTaskPreviewLookup` | Descendant metadata and History/streak preview data | Consumed by Table/List/Edit Task rendering; not a persistence authority |
| Sibling reorder | `src/lib/task-sibling-reorder.ts` — `buildTaskSiblingReorderPlan` | Same-parent reorder plan and guardrails | Changes sibling `sort_order`; does not authorize general parent movement |
| Mutation façade | `src/hooks/useTaskActions.ts` — `useTaskActions` | Aggregates task action hooks into one caller-facing API | Façade/aggregator, not one monolithic mutation implementation |
| Extracted actions | `src/hooks/useTask*Action.ts` | CRUD, create, update, editor save, History, batch, notes/links, routing, subtasks, lists | Local mutation owners composed behind the façade; guarded persistence remains downstream |
| Status read authority | `src/lib/task-state-engine/read-authority.ts` — `resolveActiveTaskStatuses`, `projectTasksForActiveStatusRead` | Active-status calculation and presentation projection | Engine path is canonical; legacy helper calls remain a known List seam |
| Action authority | `src/lib/task-state-engine/action-authority.ts` — action planning | Task action transitions and proposed History | Shared semantic authority; TaskApp supplies context and invokes persistence |
| Rollover authority | `src/lib/task-state-engine/rollover-authority.ts` | Recurrence/rollover planning and persistable projection | TaskApp owns triggers; coordinator/engine own rules and single-flight behavior |
| Workspace loader | `src/hooks/useWorkspaceData.ts` — `useWorkspaceData` | Hydration, critical facts, readiness, caches, Realtime refresh | Upstream data authority for TaskApp and page consumers |
| History loaders | `useWorkspaceData` — critical facts and per-task/full History loaders | Bounded startup facts and readiness-aware detail loading | Consumers must wait for readiness; not a TaskApp rendering concern |
| Reward controller | `src/hooks/useTaskRewardController.ts` — `useTaskRewardController` | Eligibility, pending rewards, dice banking, reward refresh | Domain controller composed by TaskApp; compatibility paths remain local |
| Economy | `src/hooks/useEconomy.ts` — `useEconomy` | Economy snapshot, ledger, roll/claim/reset operations | Separate domain persistence owner; TaskApp routes presentation |
| Focus | `src/hooks/useFocus.ts` — `useFocus` | Focus categories, sessions, counters, data lifecycle | Page-gated domain hook; TaskApp integrates route, selection, and alarm boundaries |

## Classification Rules

- Durable public ownership is defined in `TASKAPP_ARCHITECTURE.md`.
- This map records current source locations and may change as extraction
  proceeds.
- Façades and aggregators must not be mistaken for the underlying authority.
- Local presentation details remain local unless they affect routing or a shared
  mutation/status boundary.
- Deferred or uncertain behavior must remain qualified rather than promoted to
  current architecture.

The map favors the active production path over historical extraction plans and
does not turn implementation convenience into durable public ownership.

## Route Trace

For a Tasks rendering change, trace `TaskApp` to `TasksWorkspace`, then
`TaskPage`, the selected adapter, and finally `TaskManagementTableV2` or the
List-specific renderer. The adapter and shared table may each own a different
window or presentation decision.

For an existing-task edit, trace the opening callback to the shared inspector
overlay. Trace creation through the canonical Task create action followed by
`openExistingTaskEditor`.

## Mutation Trace

For a task action, trace the rendered callback to the `useTaskActions` façade,
the relevant extracted action hook, the Task State Engine authority when state
semantics are involved, and the guarded persistence/reconciliation seam.

For rollover, trace the ready workspace inputs and TaskApp trigger to the
single-flight coordinator and rollover authority. Do not infer that the trigger
owns recurrence rules.

## Known Lookup Caveats

- List status display has a direct legacy-helper seam that is not represented as
  a second canonical authority.
- Child preview status and active status should be treated as distinct until
  their convergence is explicitly verified.
- The source map records source ownership, not browser behavior, deployment
  state, Realtime correctness, or performance proof.

## Neighboring Authorities

- Use `TASK_STATE_ENGINE.md` for status, action, Calendar, recurrence, rollover,
  and persistence semantics.
- Use `WORKSPACE_LOADING_ARCHITECTURE.md` for the loading diagnostic and its
  documented freshness caveat.
- Use `UI_SYSTEM.md`, `UI_SOURCE_MAP.md`, and focused QA files for UI and QA
  rules; those concerns are intentionally not expanded here.
