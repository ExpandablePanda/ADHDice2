# Phase 1C: Canonical Task Command / Read / Output Contract

Status: active working architecture specification
Scope: canonical Task reads, commands, command results, persistence plans, diagnostics, side-effect intents, and caller migration boundaries
Implementation status: specification only; no production implementation is started by this document
Required sources: [Phase 1A core model](task-state-phase-1a-core-model.md), [Phase 1B-1 recurrence transitions](task-state-phase-1b1-recurrence-transitions.md), [Phase 1B-2A workflow/lifecycle transitions](task-state-phase-1b2a-workflow-lifecycle-transitions.md), [Phase 1B-2B rollover/reward semantics](task-state-phase-1b2b-rollover-reward-semantics.md), [Phase 0 inventory](task-state-phase-0-inventory.md)

## Scope and authority

`TARGET` — Phases 1A and 1B define what Task state means. Phase 1C defines the boundary through which every caller reads that state or requests a business-state transition. It does not reopen recurrence, reward, lifecycle, workflow, Calendar, History, or rollover product semantics already locked by those phases.

This document defines conceptual contracts and implementation planning boundaries only. It does not add types, functions, diagnostics, persistence, schema, SQL, Supabase behavior, UI, tests, or migration code.

`CURRENT` — The active branch already routes the main TaskApp active-status projection, action planning, Calendar reads, and client rollover planning through `src/lib/task-state-engine/`. It has not converged every caller. The engine remains pure with respect to persistence, but caller-owned writes, compatibility fallbacks, legacy recurrence helpers, raw stored-status reads, History live-status code, legacy rollover RPCs, and reward-owned recurrence finalization remain reachable. Current source behavior is evidence of migration scope, not target authority. See [TASK_STATE_ENGINE.md](../TASK_STATE_ENGINE.md), [TASKAPP_ARCHITECTURE.md](../TASKAPP_ARCHITECTURE.md), and [Phase 0](task-state-phase-0-inventory.md).

### Contract vocabulary

The following words have one meaning throughout this document:

- **Canonical fact** — a user/authorized event or durable state required to reconstruct Task truth, such as explicit History, a schedule boundary, a Calendar override, terminal lifecycle, container state, or workflow fact.
- **Derived state** — a deterministic result of canonical facts plus `LogicalDayContext`, such as current Missed, active obligation, fixed-calendar membership, timeline days, and streaks.
- **Projection** — a rebuildable representation for compatibility, rendering, indexing, or performance, such as stored `Task.status`, `due_on`, and active occurrence fields.
- **Command** — an explicit request to validate and transition canonical Task facts. A command is not a generic Task row patch.
- **Persistence plan** — the result’s categorized description of canonical fact writes, projection writes, and downstream intent records. It is not SQL.
- **Side-effect intent** — a downstream request, such as a reward entitlement or achievement evaluation, that cannot alter Task chronology.
- **Diagnostic** — structured evidence that state is ambiguous, unsupported, stale, contradictory, or otherwise needs attention. Diagnostics replace unsafe guessing.

### Global target boundary

```text
legacy/storage inputs
        │
        ▼
legacy-adapter
  canonical facts/input + provenance + diagnostics
        │
        ▼
canonical read/evaluator ────────────────┐
        │                                │
        ▼                                │
EffectiveTaskState                       │
        │                                │
        ├─ read projections               │
        ├─ capability projections         │
        └─ diagnostic output              │
                                         │
explicit TaskCommand ───────────────────┘
        │
        ▼
TaskCommandResult
        │
        ├─ canonical fact mutation plan
        ├─ History/boundary/override/lifecycle/workflow plan
        ├─ guarded persistence projections
        ├─ reward/achievement intents
        └─ refresh/re-read requirements
```

The evaluator is the only Task-truth calculator. The command layer is the only validation and transition authority. Repositories execute categorized plans; they do not reinterpret them.

## 1. Current authority map

The following table is a source-backed `CURRENT` map. It intentionally records legacy and compatibility behavior that later implementation must migrate or retire.

| Current caller/path | Intent | Current calculator/authority | Current Task write | Current History write | Current reward/achievement side effect | Bypasses engine? | Target replacement |
|---|---|---|---|---|---|---|---|
| `TaskApp` active-status projection in `src/components/task-app.tsx` | Supply status projections to Home, Table/List, search, editor, Paths, and On-Time | `resolveActiveTaskStatuses()` → `evaluateTaskState()` when enabled; raw stored status can remain in downstream fallbacks | None in read path; `projectTasksForActiveStatusRead()` creates a presentation copy | None | None | Partially: engine read has a legacy disabled branch and projections may fall back to `task.status` | One `readTaskState()` result per entity; consumers project subsets without fallback calculators |
| `src/lib/task-app-derived.ts` stable index | Build memberships, search entities, buckets, and status facets | Rebuilds `taskDisplayStatusByTaskId` from `task.status` | None | Reads cached History facts and summaries | None | Yes, for status projection | Consume `EffectiveTaskState.displayProjection` and canonical capabilities supplied by the read boundary |
| Table/List row adapters and `TaskManagementTableV2` | Render status, sort/filter, row actions, child rows | Mostly supplied status map; child and local rows still read `task.status`/subtask status | Status actions callback to TaskApp; no direct parent Task write in the row | None directly | Routes completed candidates to reward controller | Read fallbacks bypass canonical read; mutation callbacks converge only when wired | Table/List/Home use one display projection; child entities receive the same Task-state contract by identity |
| Home and Smart List derivation | Filter open/done/urgent/status/list/streak facts | `task.status`, `due_on`, `task-lists.ts`, `task-buckets.ts`, optional status map, saved History facts | None | None | None | Yes where status map is absent or a helper uses raw status | Status predicates consume canonical active/lifecycle projections; History predicates consume explicit/timeline facts deliberately |
| `src/lib/task-cockpit.ts` | Legacy display labels, due buckets, overdue and open checks | `getTaskDisplayStatus()`, `getTaskDisplayStatusWithHistory()`, `task.status`, `due_on`, selected History | None | None | Agent-plan and other legacy readers can consume its result | Yes | Retire as a calculator; retain only formatting or a temporary adapter that consumes canonical output |
| `src/lib/task-history.ts` live resolver | Reconcile live status after History edits | `syncLiveTaskStatus()` uses engine when enabled, otherwise `resolveLiveTaskStatusFromHistory()` and `task-repeat.ts` | Direct guarded Task update of status, due, completed/active fields | Direct delete/upsert and weekly automatic-Missed cleanup | May call completion/reward callback through caller | Yes in fallback and helper-owned History flow | `SetOutcome`, `ClearOutcome`, and `SetCalendarStateOverride` commands with one result |
| `src/lib/task-repeat.ts` | Legacy recurrence, next due, overdue date and status calculations | `calcNextDueDateFromDate()`, `resolveRecurringLiveStatusFromNextDueDate()`, overdue helpers | Can feed direct Task patches through callers | `buildOverdueTaskMissedDateKeys()` feeds automatic rows | Reward finalizer calls its next-date logic | Yes | Canonical recurrence evaluator and command result; helper becomes compatibility read-only adapter then retires |
| TaskApp status action path | Done, Did My Best, Missed, Delayed, and status control | `updateTaskStatus()` → `evaluateTaskActionAuthority()` when enabled | `updateTask()`/guarded row update with `mutationPlan.taskUpdate` | `syncTaskHistoryEntry(s)` with proposed inserts | `onTasksCompleted` → reward controller | Legacy path remains available for non-engine statuses/fallback | `SetOutcome`, `DelayOccurrence`, or lifecycle/workflow command, persisted from one result |
| TaskApp editor save and `useTaskEditorSaveAction.ts` | Save metadata, schedule, status, subtasks, notes | Engine action/schedule authority for occurrence-sensitive edits; direct active-status tracking otherwise | Generic Task row update plus optional engine patch | History sync after Task update; rollback path on failure | `onTasksCompleted`; legacy finalization when engine disabled | Yes for generic status/active tracking and fallback | Metadata patch may remain simple; schedule/outcome/lifecycle portions become explicit commands with one categorized result |
| `useTaskUpdateAction.ts` generic update | Title, metadata, due/repeat/status and compatibility updates | Classifies occurrence sensitivity; schedule authority only for schedule-only edits | `updateTaskRowWithLegacyEnergyFallback()` with generic `TaskUpdate` | History sync or `reconcileOverdueTaskMisses()` depending on flags | `onTasksCompleted` | Yes whenever occurrence-sensitive values reach generic update without a command plan | Split metadata update from command dispatch; reject occurrence-sensitive generic patches |
| `useTaskBatchEditAction.ts` | Multi-select status, due/repeat, metadata, route/focus | Per-task action/schedule authority during preflight | Per-task direct guarded Task update | Per-task History sync after Task write | Per-task candidates to reward controller | It is a weaker caller-owned loop, even though it invokes the engine | Batch is a collection of explicit commands with per-entity results and declared atomicity |
| History Calendar in `task-view-adapters.tsx` | Read Calendar, edit/clear explicit History, historical corrections | `buildTaskHistoryCalendarDueDateSet()` plus `resolveTaskHistoryCalendarRead()`; action statuses use engine authority | History live-status synchronization can write status/due/active fields | Direct delete/upsert; automatic weekly Missed cleanup | Historical reward handling is outside this path | Yes: legacy due-date set and fallback virtual state remain reachable | Calendar reads `EffectiveTimelineDay`; edits dispatch `SetOutcome`/`ClearOutcome` or override commands |
| History Calendar action hook | Mark date Done/DMB/Missed/Clear/Delay/Complete | `evaluateTaskActionAuthority()` with historical override metadata | Direct Task reconciliation after History mutation | Upsert/delete one row per entity/date | No direct reward entitlement from recalculation; target command may return one intent | Fallback resolver and direct writes remain | Command result owns History, chronology replay, projection, diagnostics, and reward intent |
| `delayTaskToDate()` in `TaskApp` | Delay current task to future date | Local lifecycle/status guard plus `evaluateTaskActionAuthority(outcome=delayed)` | Sends caller-computed `due_on` plus engine patch through generic update | Proposed Delayed History via options | Explicitly passes reward eligibility, normally false | Caller still computes and duplicates Delay envelope | `DelayOccurrence` targets an occurrence and returns scheduled/effective dates and boundary mutation |
| Complete flow in `TaskApp`/`task-complete.ts` | Terminal completion, timed completion, milestone completion | Engine action authority for normal Task; separate milestone RPC for milestone | `buildCompleteTaskUpdateValues()` plus engine projection; guarded Task update | Separate Complete History write with rollback handling | Queues reward after completion; milestone may award separately | Yes: lifecycle and History are separate caller operations; milestone path is separate | `CompleteTask` owns terminal, History, recurrence stop, cursor clearing, and one reward intent; milestone remains an explicit downstream/lifecycle integration |
| Archive path | Move active Task to Archive | `buildTaskStatusUpdate()`/lifecycle helpers and visibility logic | Direct `status=archived`, `completed_at`, `trashed_at` fields | None | None | Yes | `ArchiveTask` changes container only, preserves History and terminal fact |
| Trash path in `useTaskCrudActions.ts` | Reversible trash or hard-delete follow-up | Direct CRUD/milestone lifecycle path | Direct `status=trashed`, `trashed_at`, clears completion | None | None | Yes | `TrashTask` container command; hard delete stays separate destructive repository operation |
| Restore from Trash / Archive | Re-enter active or prior container | Direct `status=pending` or milestone restore RPC | Direct status/container-compatible patch | None | None | Yes | `RestoreTrashedTask`/`RestoreArchivedTask` restores proven container eligibility then re-reads canonical state |
| `applyTaskActiveStatusTracking()` | Enter/leave In Progress | Stored status transition and current logical date | Writes `active_status_logical_date` and `active_occurrence_due_on` | None | None | Yes | `StartInProgress`/`ClearInProgress` modify workflow fact only |
| Task rollover in `TaskApp` | Coordinate logical-day changes | `createEngineRolloverPlan()` and engine RPC when available | RPC applies projected Task patches | Engine plan may propose History; legacy RPC may write its own rows | Queues rollover rewards after engine History commit | Yes when RPC fallback is used; engine planner currently proposes rollover rows | Pure re-read plus safe projection reconciliation and retryable downstream intents; no ordinary automatic Missed History |
| `adhdice_reconcile_task_rollover` | Legacy rollover fallback | Deployed RPC behavior is not established by source | RPC-owned Task updates | RPC-owned rollover/reconciliation rows | May couple achievement/reward behavior | Yes | Retire as business-state fallback after deployment proof; keep only separately authorized compatibility/migration operation |
| `reconcileOverdueTaskMisses()` in `useTaskRewardController.ts` | Fill missing overdue History before reward/finalization | `buildOverdueTaskMissedDateKeys()` and raw Task fields | No Task write in helper | Direct automatic `missed` upserts | Called during reward/finalization | Yes | Read calculated Missed; no ordinary row creation; explicit repair must be separate and provenance-labelled |
| `finalizeRecurringTasks()` in `useTaskRewardController.ts` | Advance recurring Task after reward candidates | `calcNextDueDateFromDate()` and `resolveRecurringLiveStatusFromNextDueDate()` | Direct `due_on/status/completed_at` update; resets legacy subtasks | Calls overdue Missed helper first | Runs as reward candidate follow-up | Yes | Retire recurrence/status ownership; reward consumer accepts result/intents only |
| `useTaskRewardController.ts` and `useEconomy.ts` | Determine eligibility, bank dice, claims, economy | Current status transition plus saved History/streak stats and reward-claim rows | Reward path may trigger legacy recurring Task writes | Reads/writes reward claim/roll/economy stores, not canonical Task History by design | Banks/claims dice, points, XP, tokens; retries some RPCs | Reward controller bypasses command authority when it infers completion from status | Consume `HandledSuccessRewardIntent`; never calculate status, recurrence, History, or due dates |
| Same-table Steps/Substeps and `useTaskSubtaskActions.ts` | Child status and reward behavior | Direct subtask status writes; parent Task reward candidate is used for claim context | Direct subtask row status update; parent Task unchanged | No Task History for legacy subtask row | Child reward callback uses `subtaskId` claim reference | Yes | Parent, Step, and Substep are explicit Task entities under the same command/read contract; no silent descendant mutation |

### Current audit conclusion

The engine is the correct target center, but the current production graph is not yet a single contract. The migration goal is convergence at the shared read/command/result boundary, not surface-specific compensation. Legacy helpers may temporarily translate or compare, but they may not remain hidden policy authorities.

## 2. Canonical read contract

### 2.1 Conceptual function

The target read entry point is conceptually:

```text
readTaskState(input: CanonicalTaskReadInput): EffectiveTaskState
```

It is pure and deterministic. It may return diagnostics, but it never writes Task rows, History, projections, rewards, achievements, or browser state.

```text
CanonicalTaskReadInput
  ├─ entity identity and kind
  ├─ Task configuration facts
  ├─ terminal/container/workflow facts
  ├─ explicit History for the required range or reconstructable scope
  ├─ recurrence anchor and current occurrence evidence
  ├─ forward schedule boundaries
  ├─ manual Calendar scheduling-state overrides
  ├─ LogicalDayContext
  └─ legacy provenance/diagnostic metadata when adapting old data
        ↓
EffectiveTaskState
```

The conceptual input shape is:

```ts
type CanonicalTaskReadInput = {
  entity: {
    entityId: string;
    entityKind: "parent" | "step" | "substep";
    parentEntityId: string | null;
    hierarchyPath: readonly string[];
  };
  configuration: TaskConfiguration;
  lifecycle: TaskLifecycleFacts;
  workflow: TaskWorkflowFacts;
  explicitHistory: readonly ExplicitHistoryEvent[];
  recurrenceAnchor: RecurrenceAnchor | null;
  currentOccurrenceEvidence: CurrentOccurrenceEvidence;
  scheduleBoundaries: readonly ScheduleBoundaryEvent[];
  calendarOverrides: readonly CalendarStateOverride[];
  logicalDay: LogicalDayContext;
  legacyProvenance?: readonly LegacyProvenanceFact[];
  evaluationRange?: { startLogicalDate: string; endLogicalDate: string };
};
```

The names are conceptual. Implementation/API naming is not a product decision.

### 2.2 Read requirements

The evaluator must:

1. use one timezone-aware `LogicalDayContext`, including the user timezone, configured rollover boundary, evaluation instant, current logical date, and context identity;
2. use Task configuration plus a stable recurrence anchor, not `due_on` as a recurrence anchor;
3. treat explicit History as authoritative for its entity/logical date, including historical corrections;
4. apply schedule boundaries forward from their logical boundary;
5. apply Calendar scheduling-state overrides as distinct date-scoped facts;
6. preserve `scheduledDueOn` as the immutable origin and `effectiveDueOn` as the movable expected date;
7. group same-Task origin occurrences by effective obligation when Delay creates a fixed-calendar collision, preserving every origin;
8. reconstruct multi-day rolling, one-time, and fixed-calendar chronology within the requested range;
9. calculate Missed without depending on a prior rollover write;
10. stop recurrence at permanent Complete and suspend active evaluation in Archive/Trash;
11. keep workflow state orthogonal to schedule state;
12. operate identically for Parent, Step, and Substep entities; and
13. return structured diagnostics when canonical truth cannot be safely proven.

The evaluator must not depend on stale `Task.status`, stale `due_on`, a previous rollover result, a Calendar window’s lower bound, a reward claim, or a UI control being enabled.

### 2.3 Read range semantics

The current state must be independent of the requested Calendar window. A narrow Calendar window may limit returned `timeline.days`, but it must not change current active status, current obligation, streaks, or recurrence membership. The evaluator may internally replay from the earliest required authoritative boundary to the current logical date and then project the requested range.

If the required History or boundary evidence is unavailable, the read returns the safest proven state plus a diagnostic. It does not replace missing authoritative input with an empty array and does not use a stored projection as a silent substitute.

## 3. EffectiveTaskState contract

`EffectiveTaskState` is the canonical read output. It is a fact-rich state object, not a UI-specific status enum and not a persistence patch.

```ts
type EffectiveTaskState = {
  identity: EffectiveTaskIdentity;
  lifecycle: EffectiveLifecycleFacts;
  scheduling: EffectiveSchedulingFacts;
  currentObligation: EffectiveObligation | null;
  futureSchedule: FutureOccurrenceProjection;
  active: ActiveScheduleFacts;
  timeline: EffectiveTimeline;
  streaks: EffectiveStreakFacts;
  capabilities: TaskCapabilities;
  diagnostics: TaskStateDiagnostic[];
  projections: NonAuthoritativeProjectionRecommendations;
};
```

### 3.1 Identity

`EffectiveTaskIdentity` contains:

- `entityId` and user scope;
- `entityKind`: `parent`, `step`, or `substep`;
- read-only parent/ancestor references;
- hierarchy provenance and invalid-link diagnostics when relevant; and
- a stable entity identity used by History, commands, reward entitlements, and idempotence.

Parent, Step, and Substep use the same evaluator and command semantics. Entity kind is context, not permission to use a weaker status calculator.

### 3.2 Lifecycle, container, and workflow

`EffectiveLifecycleFacts` keeps axes separate:

```ts
type EffectiveLifecycleFacts = {
  terminalState: "active" | "permanently_complete";
  containerState: "active" | "archived" | "trashed";
  workflowState: "none" | "in_progress";
  workflowLogicalDate: string | null;
  workflowOccurrenceIdentity: string | null;
  activeEvaluation: "enabled" | "suspended_terminal" | "suspended_container";
};
```

Permanent Complete remains terminal through Archive, Trash, and restore. Archive/Trash preserve History and schedule evidence, suspend active evaluation, and do not create inactive-time History.

### 3.3 Scheduling facts

`EffectiveSchedulingFacts` includes:

- one of the four scheduling models: genuinely unscheduled, one-time scheduled, rolling recurring, fixed-calendar recurring;
- normalized recurrence configuration;
- stable recurrence anchor and anchor provenance;
- applicable schedule boundaries and their forward start dates;
- manual Calendar override facts in scope;
- schedule evaluation range and logical-day context identity; and
- whether the schedule is supported, partially reconstructed, or ambiguous.

`due_on` is not part of this contract as an authority input. If present in the legacy input, it is current-occurrence evidence/projection data and may produce a diagnostic when it conflicts with canonical chronology.

### 3.4 Current effective obligation

`EffectiveObligation` is the current unresolved or applicable obligation after chronology, boundaries, overrides, lifecycle, and grouping have been applied:

```ts
type EffectiveObligation = {
  effectiveObligationId: string;
  effectiveDueOn: string;
  obligationState: "open" | "overdue" | "satisfied" | "terminated";
  resolutionState: "unresolved" | "handled" | "merged_handled" | "terminated";
  originOccurrences: readonly TaskOccurrenceOrigin[];
  scheduledDueOn: string | null;
  effectiveDueOnProvenance: "scheduled" | "delayed" | "boundary" | "merged";
  resolutionLogicalDate: string | null;
  resolutionOutcome: "done" | "did_my_best" | "missed" | "delayed" | "complete" | null;
  historyEvidence: readonly string[];
};
```

Each `TaskOccurrenceOrigin` contains an immutable `occurrenceIdentity`, `scheduledDueOn`, recurrence source, optional `effectiveDueOn`, and provenance. A Delay never changes the origin identity. A fixed deferred occurrence merged with a normal same-day occurrence creates one effective obligation with multiple origins, one resolution, and one reward entitlement at most.

`obligationState` and `resolutionState` must not be inferred from a display status alone. A checkpoint History row can be handled while a one-time obligation remains unresolved/Missed.

### 3.5 Future schedule

`FutureOccurrenceProjection` contains projected fixed-calendar membership and other future occurrences required by the requested range. It includes origin identities, scheduled dates, effective dates if a boundary affects them, and whether each date is informational or the current obligation.

Future fixed membership remains independent of an older active Missed occurrence. Future projections do not create History, consume an obligation, grant rewards, or advance recurrence.

### 3.6 Active schedule facts

`ActiveScheduleFacts` is separate from lifecycle and workflow:

```ts
type ActiveScheduleFacts = {
  scheduleState: "unscheduled" | "not_due" | "due_open" | "missed" | "delayed" | "upcoming";
  activeOccurrenceIdentity: string | null;
  activeScheduledDueOn: string | null;
  activeEffectiveDueOn: string | null;
  continuousOverdue: boolean;
  activeMissedOrigins: readonly string[];
  handledCurrentLogicalDate: boolean;
  currentDayOutcome: ExplicitOutcome | null;
};
```

`in_progress` is not a replacement schedule state. A valid workflow overlay may be displayed separately while the schedule facts still say Due/Open or Missed. In Progress never satisfies recurrence, clears Missed, changes `due_on`, or grants a reward.

### 3.7 Effective Timeline

`EffectiveTimeline` includes every requested logical date with:

- `logicalDate`;
- Calendar scheduling state: `Unscheduled`, `Not Due`, `Due/Open`, `Missed`, or a target equivalent;
- explicit outcome, if any;
- handled state;
- obligation state;
- origin occurrence identities;
- effective-obligation grouping identity;
- scheduled/effective due dates;
- manual override and schedule-boundary provenance;
- explicit versus calculated origin; and
- diagnostic references.

Calculated Missed days are derived timeline entries. They do not become explicit History merely because they are returned.

### 3.8 Streaks

`EffectiveStreakFacts` contains:

- current positive streak;
- current Missed streak;
- the chronology range used;
- whether Not Due/Unscheduled days were neutral or streak-breaking;
- occurrence-based versus logical-day-based counting mode; and
- explanation/provenance references sufficient to explain the streak.

Current positive and current Missed streaks are derived and mutually exclusive in the active summary. Historical/best statistics may use a deliberately named explicit-History source, but they must not be substituted for current state.

### 3.9 Capabilities

Capabilities are pure projections from current canonical state and facts:

```ts
type TaskCapabilities = {
  canDelay: boolean;
  canComplete: boolean;
  canEnterInProgress: boolean;
  canClearInProgress: boolean;
  canRestore: boolean;
  canArchive: boolean;
  canTrash: boolean;
  canEditHistoricalDate: boolean;
  canEditFutureDate: boolean;
  availableCalendarActions: readonly CalendarActionCapability[];
};
```

Capabilities are advisory UI projections. Command validation remains authoritative. A missing or stale capability projection cannot make an invalid command valid and cannot be used to infer a second product policy.

### 3.10 Diagnostics and projections

`diagnostics` is the complete structured diagnostic set for the read. `projections` contains optional recommendations only:

- stored `Task.status` value;
- stored `due_on` value;
- active occurrence projection;
- completed timestamp projection;
- workflow tracking fields; and
- whether each projection is safe to repair under a supplied revision proof.

These recommendations are explicitly non-authoritative. They are never fed back into the evaluator as a higher-precedence fact.

## 4. Active/display status contract

### 4.1 Four distinct layers

1. **Canonical lifecycle facts** — terminal state and container state. Complete is not Archive; Archive/Trash do not erase Complete.
2. **Active schedule state** — derived `Unscheduled`, `Not Due`, Due/Open, Missed, Delayed, or Upcoming from canonical chronology.
3. **Workflow overlay** — In Progress, if the workflow fact is valid; it does not satisfy or override schedule semantics.
4. **UI/display projection** — a surface-friendly label, chip, filter value, or icon derived from the first three layers.

No layer may be represented by raw stored `Task.status` as fallback authority.

### 4.2 Canonical precedence

For an active read, apply this precedence:

1. contradictory lifecycle facts produce diagnostics and the safest proven lifecycle state;
2. `terminalState = permanently_complete` wins over active recurrence and remains true in any container;
3. `containerState = trashed` or `archived` suspends active schedule evaluation and active workflow;
4. for an active, non-terminal Task, derive schedule state from recurrence, boundaries, overrides, History, and logical day;
5. active Missed/overdue obligation takes precedence over a stale status or an unrelated later Not Due date;
6. Delayed is shown when the targeted obligation has a valid future effective due date, while historical Missed facts remain preserved;
7. a valid In Progress workflow is exposed as a workflow overlay, not as proof of success and not as a way to hide Missed or Due/Open schedule state;
8. Due/Open/Pending is used for an applicable unresolved obligation on the current logical date;
9. Upcoming is a display projection for a near future effective due date;
10. Not Due means an active recurring schedule exists but the date is between obligations;
11. Unscheduled means no schedule applies on that date, including a genuinely unscheduled Task and a one-time date before its due date; and
12. if canonical state cannot be obtained, the target is fail-safe: expose unavailable/needs-attention state and diagnostics rather than inventing a status.

The exact label mapping is a UI projection choice. The precedence is not.

### 4.3 Target mapping

| Canonical facts | Display projection |
|---|---|
| Permanently Complete, any container | Complete; container may also expose Archive/Trash |
| Trashed, non-terminal | Trashed |
| Archived, non-terminal | Archived |
| Active unresolved overdue obligation | Missed |
| Active delayed obligation with future effective date | Delayed |
| Valid In Progress workflow without a schedule override | In Progress overlay plus underlying schedule fact |
| Current applicable unresolved obligation | Due/Open/Pending |
| Near future effective obligation | Upcoming |
| Recurring schedule between occurrences | Not Due |
| No active schedule on date | Unscheduled |

## 5. Canonical TaskCommand envelope

Every occurrence-sensitive or business-state mutation enters through one conceptual envelope:

```ts
type TaskCommand = {
  commandId: string;
  commandType: TaskCommandType;
  userId: string;
  entity: {
    entityId: string;
    entityKind: "parent" | "step" | "substep";
  };
  logicalDay: LogicalDayContext;
  requestedLogicalDate: string | null;
  intent: TaskCommandIntent;
  expected: {
    taskRevision: number | null;
    historyRevision: string | null;
    relevantFactsFingerprint: string | null;
    occurrenceIdentity: string | null;
  };
  actor: {
    kind: "user" | "authorized_automation" | "migration_tool";
    actorId: string;
    source: string;
  };
  idempotence: {
    identity: string;
    retryOfCommandId: string | null;
  };
};
```

`LogicalDayContext` is required even for commands targeting a historical date because validation, boundaries, recurrence, and reward entitlement all depend on the current user-scoped context.

The envelope must carry the requested logical date for historical outcomes, Calendar overrides, Delay actions, and any command where the action date differs from the current logical date. It must carry an occurrence identity or enough explicit target data for the command layer to resolve one safely.

Generic `updateTask({ status, due_on, repeat_frequency, ... })` is not the domain interface for occurrence-sensitive work. A metadata-only edit may remain a simple update if it cannot affect Task-state semantics. A schedule, outcome, lifecycle, workflow, or occurrence edit must be rejected or translated into an explicit command before persistence.

## 6. Canonical command taxonomy

The following command types are the minimum contract. They target one explicit entity. No command silently mutates descendants.

### 6.1 Outcomes

- `SetOutcome(Done)`
- `SetOutcome(DidMyBest)`
- `SetOutcome(Missed)` for explicit user/authorized action only
- `ClearOutcome`
- `CompleteTask`
- `ReopenCompletedTask` or `ClearCompleteCorrection` only as an explicit completion-correction command

`SetOutcome` accepts a current or historical logical date. It replaces the one explicit outcome for that entity/date when authorized and preserves occurrence metadata. A calculated Missed date is not converted into explicit History by a read or rollover.

`CompleteTask` is separate because it is both a successful explicit outcome and a terminal lifecycle transition. `SetOutcome(Complete)` may be the command vocabulary surface, but it must resolve to the same terminal command semantics, not to a generic status patch.

### 6.2 Scheduling

- `SetDueDate`
- `ClearDueDate`
- `SetRepeat`
- `ClearRepeat`
- `ChangeRepeat`
- `DelayOccurrence`

Set/Clear/Change schedule commands create forward schedule boundaries and return the affected occurrence, its scheduled/effective due dates, chronology replay boundary, and resulting projection. They do not create a success outcome or reward intent.

`DelayOccurrence` requires one safely identified occurrence and a target effective date strictly after the command logical date. It preserves the immutable scheduled origin, creates explicit Delayed audit/provenance, and does not mutate Repeat.

### 6.3 Calendar scheduling-state overrides

- `SetCalendarStateOverride`
- `ClearCalendarStateOverride`

These commands change Calendar interpretation for one entity/logical date. They are not aliases for setting Done, DMB, Missed, or Complete. They do not silently rewrite Repeat or rebase future recurrence.

### 6.4 Workflow

- `StartInProgress`
- `ClearInProgress`

These commands modify workflow facts only. They do not satisfy recurrence, pause Missed, move `due_on`, or grant rewards. Done, DMB, Complete, Delay, Archive, and Trash may explicitly terminate the workflow fact as part of their result.

### 6.5 Lifecycle/container

- `ArchiveTask`
- `RestoreArchivedTask`
- `TrashTask`
- `RestoreTrashedTask`

Archive and Trash change container facts, preserve History, suspend active evaluation, and create no success reward. Restore restores proven container eligibility and re-evaluates current state without synthesizing inactive-time History.

Hard delete/permanent deletion is a separate destructive repository operation, not a normal Task State Engine command. Its retention, cascade, and History-deletion policy remain outside Phase 1C.

### 6.6 Logical-day coordination

Rollover/time passage is not a user outcome command. It is conceptually:

```text
evaluateCurrentLogicalDay(input)
  → optional safe projection reconciliation
  → optional retry/reconciliation of already justified downstream intents
  → diagnostics and refresh requirements
```

It may be implemented as a `ReconcileLogicalDayProjection` coordination operation, but that operation cannot create ordinary automatic Missed History, auto-DMB stale In Progress, advance recurrence independently, or grant a reward merely because time passed.

### 6.7 Hierarchy

All commands target one explicit Task entity. Parent, Step, and Substep use the same command semantics and separate entity/date reward identities. A future hierarchy command may own an explicit multi-entity operation; until then, a parent command does not silently complete/reset/reward children, and a child command does not mutate the parent.

## 7. Command validation authority

The command layer reads current `EffectiveTaskState` and owns validation for:

- whether Delay has a valid target obligation and future target date;
- whether Complete is allowed and what obligation it resolves;
- whether a historical date is editable;
- whether a future date is read-only;
- whether an archived or trashed Task must be restored before active mutation;
- whether In Progress can begin or end;
- whether an occurrence exists and is unambiguous;
- whether a fixed delayed collision is resolved by same-Task merge;
- whether a reward entitlement is eligible; and
- whether concurrency evidence is sufficient.

The result decision is one of:

```text
accepted
accepted_with_warning
rejected
needs_explicit_resolution
```

UI controls may use `capabilities`, but they do not own validity. A command must remain correct if the UI sends it despite a stale or missing capability projection.

`accepted_with_warning` means the canonical transition is safe and the warning does not require user choice. `needs_explicit_resolution` means no safe transition can be chosen without a user/authorized decision; no ambiguous canonical write is produced.

## 8. Canonical TaskCommandResult

The conceptual result is:

```ts
type TaskCommandResult = {
  command: {
    commandId: string;
    commandType: TaskCommandType;
    idempotenceIdentity: string;
    replayed: boolean;
  };
  decision: "accepted" | "accepted_with_warning" | "rejected" | "needs_explicit_resolution";
  diagnostics: TaskStateDiagnostic[];
  beforeState: EffectiveTaskState | null;
  afterState: EffectiveTaskState | null;
  canonicalFacts: CanonicalFactMutationPlan;
  history: HistoryMutationPlan;
  scheduleBoundaries: ScheduleBoundaryMutationPlan;
  calendarOverrides: CalendarOverrideMutationPlan;
  lifecycle: LifecycleMutationPlan;
  workflow: WorkflowMutationPlan;
  projections: PersistenceProjectionPlan;
  rewardEntitlementIntents: HandledSuccessRewardIntent[];
  achievementIntents: AchievementIntent[];
  hierarchyIntents: HierarchyIntent[];
  refresh: RefreshRequirements;
};
```

`beforeState` and `afterState` are canonical states, not stored-row snapshots. A rejected or unresolved command has no canonical fact writes and normally has `afterState = beforeState` or `null` when a safe pre-state cannot be established.

The result must not return an ambiguous generic Task patch as its only output. Every mutation is categorized and carries a reason, source command identity, affected entity/date/occurrence, and expected revision proof.

### 8.1 Three explicit result layers

#### Canonical fact writes

These create or change truth needed for future reconstruction:

- explicit History outcome;
- schedule boundary;
- Calendar scheduling-state override;
- recurrence configuration;
- stable recurrence anchor when genuinely changed or established;
- terminal lifecycle state;
- container state;
- In Progress workflow fact;
- occurrence/deferred-date fact when canonical storage later requires it; and
- reward-entitlement proof/intention where the product contract requires a durable claim of eligibility.

#### Derived projection writes

These rebuild compatibility/performance fields from `afterState`:

- stored display `status`;
- `due_on` effective current-obligation projection;
- active occurrence/logical-date workflow projection;
- completion timestamp projection;
- other explicitly allow-listed cache fields.

Projection writes include `projectionSourceRevision`, `canonicalStateFingerprint`, `repairable`, and a reason. They can be skipped or retried independently after canonical facts succeed.

#### Downstream side effects

These are not Task truth:

- `HandledSuccessRewardIntent`;
- achievement evaluation intent;
- notification or analytics intent when later authorized; and
- explicit hierarchy intent only when a future command owns it.

Side effects consume canonical command/event identities. They never change Task chronology, recurrence, status, due dates, History, lifecycle, or workflow facts.

## 9. Canonical fact mutation plan

Each mutation is conceptually:

```ts
type CanonicalFactMutation = {
  operation: "create" | "replace" | "clear" | "change";
  factType: CanonicalFactType;
  entityId: string;
  logicalDate: string | null;
  occurrenceIdentity: string | null;
  before: unknown;
  after: unknown;
  reason: string;
  sourceCommandId: string;
};
```

The command result may include these fact categories:

| Fact category | Canonical meaning | Typical commands | Must not be replaced by |
|---|---|---|---|
| Explicit History | One explicit outcome per entity/logical date plus occurrence/provenance | SetOutcome, CompleteTask, DelayOccurrence | Calculated Missed or stored status |
| Schedule boundary | Forward-authoritative due/Repeat decision | SetDueDate, ClearDueDate, SetRepeat, ChangeRepeat, DelayOccurrence | Replaying current Repeat over the past |
| Calendar override | Date-scoped scheduling-state correction | Set/ClearCalendarStateOverride | Outcome History alias |
| Recurrence configuration | User-selected cadence/family | Set/Clear/ChangeRepeat | Reward finalization or rollover |
| Recurrence anchor | Stable schedule basis, with provenance | Schedule commands when genuinely changed | Moving `due_on` cursor |
| Terminal lifecycle | Permanent Complete fact | CompleteTask, explicit reopen correction | Archive/Trash |
| Container state | Active/Archived/Trashed placement | Archive, Restore, Trash | Complete semantics |
| Workflow fact | In Progress session/workflow | Start/ClearInProgress and explicit terminators | Success outcome or stale-session rollover |
| Occurrence/deferred fact | Immutable origin, effective date, grouping/provenance | DelayOccurrence, schedule commands | A new occurrence identity for a deferred date |
| Reward entitlement fact | Proof that one entity/date handled-success reward may be consumed | Success command result/consumer boundary | Current status or a new retry |

No SQL, table, column, RPC, transaction syntax, or physical schema is specified here.

## 10. History write contract

### 10.1 One authoritative explicit outcome

For each entity and logical date, canonical History contains at most one explicit outcome. Replace is an explicit command operation with a new command identity and revision proof; clear removes the explicit fact and returns that date to derived chronology.

Each explicit History event carries, when applicable:

- entity identity and entity kind;
- logical date;
- outcome: Done, Did My Best, Missed, Delayed, or Complete;
- occurrence identity;
- immutable `scheduledDueOn`/origin date;
- `effectiveDueOn` for Delay or another effective-date boundary;
- recurrence source and schedule-boundary reference;
- provenance: user, authorized automation, import, or separately authorized repair;
- event/command identity and occurred-at timestamp;
- replacement/cleared predecessor identity; and
- reward entitlement reference when an explicit handled success is eligible.

### 10.2 Calculated versus explicit Missed

A calculated Missed day is a derived timeline/state result. It is not persisted as ordinary explicit History by a read, rollover, reward scan, or status projection.

An explicit Missed command is allowed only where the command layer validates it as a user/authorized fact. Legacy automatic Missed rows are compatibility provenance. They may corroborate or conflict with canonical chronology, but they do not silently become new user-authored facts.

### 10.3 Historical edits and rewards

Historical edits replace the explicit row for that entity/date, replay chronology under the locked recurrence/boundary rules, and return the resulting `afterState`. A historical non-success → handled success edit may produce one reward entitlement if that entity/date entitlement is unused. Derived downstream Missed or recurrence changes never produce reward intents.

Done → Did My Best → Complete on one entity/date shares one handled-success entitlement. A later reversal does not automatically claw back a consumed reward, and a later success after reversal does not create a second entitlement for the same entity/date.

## 11. Scheduling mutation contract

Schedule commands are not field patches. Their results explicitly identify:

- schedule configuration before/after;
- stable recurrence anchor before/after and provenance;
- forward schedule boundary logical date;
- affected occurrence identity;
- immutable `scheduledDueOn`;
- resulting `effectiveDueOn`;
- chronology replay start and stop boundaries;
- explicit History changes, if any (Delay may create Delayed audit History; ordinary due/Repeat edits do not invent outcomes);
- resulting current obligation and future schedule;
- `due_on` projection recommendation; and
- diagnostics or concurrency rejection.

### 11.1 SetDueDate/ClearDueDate

These establish a forward boundary. For a one-time Task, the changed date remains one obligation. For rolling recurrence, the current rolling obligation changes according to the target boundary. For fixed recurrence, a current occurrence may be overridden without changing fixed Repeat membership. Earlier explicit History is preserved.

### 11.2 SetRepeat/ClearRepeat/ChangeRepeat

These change recurrence configuration from the command logical date forward. They do not reinterpret earlier chronology. Selecting Repeat on a genuinely unscheduled Task uses the locked first-due rules. `due_on` is a projection of the resulting current effective obligation, not the new recurrence anchor unless a canonical anchor fact explicitly says so.

### 11.3 DelayOccurrence

Delay:

1. validates an active entity and a safe target occurrence;
2. requires a target effective date strictly after the action logical date;
3. preserves the immutable scheduled origin and occurrence identity;
4. creates a Delayed History/audit fact and forward boundary;
5. sets the effective date for that obligation;
6. leaves Repeat and stable anchor unchanged;
7. ends the same-obligation active Missed condition without erasing historical Missed facts;
8. merges same-Task fixed origins landing on one effective date into one effective obligation; and
9. emits no reward intent.

## 12. Complete command contract

`CompleteTask` returns one coherent result containing:

- explicit Complete History for the command logical date;
- applicable obligation resolution, including one-time, rolling, fixed, or no-schedule cases;
- terminal lifecycle transition to `permanently_complete`;
- recurrence termination and no future active schedule;
- clearing of current effective cursor/projection fields when safe;
- preservation of all earlier History, boundaries, occurrence origins, and Calendar outcomes;
- projection recommendations for stored status/container fields;
- one handled-success reward intent for the entity/date if unused;
- achievement intent only as a downstream consumer input; and
- diagnostics and concurrency evidence.

Archive is not the mechanism that makes Complete true. A completed Task may be displayed in Archive, but the terminal fact survives Archive, Trash, and restore. Reopening requires an explicit completion correction command, not a container restore.

## 13. Archive / Trash / Restore contract

`ArchiveTask` and `TrashTask`:

- change container facts only;
- preserve explicit History, schedule boundaries, occurrence identity, recurrence configuration, and terminal state;
- suspend active workflow and active recurrence evaluation;
- prevent inactive-time Missed accrual;
- do not manufacture History; and
- do not create success rewards.

`RestoreArchivedTask` and `RestoreTrashedTask`:

- restore only a proven prior container eligibility/state;
- preserve permanent Complete if present;
- re-evaluate active state under the current LogicalDayContext;
- create no History for time spent inactive; and
- emit a diagnostic when prior container, deferred occurrence, or terminal state cannot be safely reconstructed.

Hard delete is separate and destructive. No command result in this contract assumes it is reversible or defines its physical behavior.

## 14. In Progress command contract

`StartInProgress` requires an active, non-terminal, non-archived, non-trashed Task and records workflow identity, logical date, and optional occurrence identity. `ClearInProgress` clears only that workflow fact.

Neither command:

- satisfies a recurrence;
- creates success History;
- pauses or clears Missed;
- changes `due_on` or effective due date; or
- grants a reward.

Done, Did My Best, Complete, Delay, Archive, and Trash may include workflow termination in their canonical fact plan when the action explicitly ends the workflow. Rollover never converts stale In Progress into DMB or Done. If stale metadata cannot be safely reconstructed, return a diagnostic and preserve the safest schedule facts.

## 15. Manual Calendar override commands

`SetCalendarStateOverride` and `ClearCalendarStateOverride` operate on a date-scoped scheduling interpretation:

```ts
type CalendarStateOverride = {
  entityId: string;
  logicalDate: string;
  state: "unscheduled" | "not_due" | "due_open";
  reason: string;
  provenance: "manual" | "authorized_repair";
};
```

The override may affect Calendar interpretation, effective chronology, streaks, and active obligation interpretation when it targets the actual obligation date. It never silently rewrites Repeat or creates an outcome History row.

`mark 8/8 Done` is `SetOutcome(Done)`. `8/8 should be Not Due` is `SetCalendarStateOverride(Not Due)`. The result must preserve this distinction so later reads, History, rewards, and diagnostics can explain what happened.

## 16. Rollover/read reconciliation contract

Time passage changes `LogicalDayContext`; it does not itself create a Task business event.

The target rollover coordinator may:

- obtain the new context;
- re-read/evaluate canonical Task state;
- compute safe, guarded projection repairs;
- retry/reconcile a reward or achievement intent already justified by a canonical command/event; and
- publish diagnostics and refresh requirements.

Normal rollover must not:

- create automatic explicit Missed History;
- auto-DMB stale In Progress;
- advance recurrence independently;
- consume a fixed occurrence merely because it was projected; or
- grant a reward merely because a day closed or old calculated Missed was discovered.

If no projection or already-justified downstream side effect requires a write, a logical-day transition may produce zero Task mutations. A pure read is still a successful rollover evaluation.

Legacy automatic Missed rows may be read with provenance and surfaced as warnings. They are not recreated, silently normalized into user facts, or used as a reason to run a second recurrence calculator.

## 17. Reward-intent output boundary

The Task command does not bank dice directly. For the first handled success on one entity/logical date, an accepted command may emit:

```ts
type HandledSuccessRewardIntent = {
  entityId: string;
  entityKind: "parent" | "step" | "substep";
  logicalDate: string;
  entitlementIdentity: string;
  outcome: "done" | "did_my_best" | "complete";
  rewardProgram: string;
  rewardProgramVersion: string;
  sourceCommandId: string;
  sourceCanonicalEventId: string;
};
```

Done, Did My Best, and Complete have equal reward value and share the entity/date entitlement. Parent, Step, and Substep identities are independent. A merged same-Task effective obligation produces at most one intent for the entity/date, not one intent per origin.

The reward consumer:

- stores/applies the entitlement and banking result idempotently;
- retries independently after network or downstream failure;
- uses stable item/claim identities rather than queue position;
- may emit an achievement intent from the canonical event; and
- never changes Task status, History, recurrence, effective due date, lifecycle, or workflow.

Reward failure does not undo canonical Task fact persistence. Reward success is never proof that the Task transition succeeded.

## 18. Concurrency and stale-command protection

Commands use optimistic concurrency. The expected proof is the smallest relevant proof that prevents semantic drift:

- Task revision/version for Task configuration/lifecycle/workflow changes;
- History revision/fingerprint for outcome and Calendar edits;
- relevant schedule/occurrence fingerprint for Delay and schedule changes;
- expected occurrence identity and scheduled/effective due values where applicable; and
- deterministic command/idempotence identity for retries.

The command layer must reject, re-evaluate, or return a diagnostic when the facts changed such that the request could target a different occurrence. It must not silently apply a stale Delay to a new due date.

Examples:

- Two tabs mark the same entity/date Done: one canonical handled-success state, one entitlement; the second returns the existing result or a safe no-op.
- A schedule changes before Delay arrives: reject/re-evaluate against the new state; do not move the wrong occurrence.
- A retry repeats the same command identity: return the same effect identity/result without duplicate History, recurrence transition, or reward.

## 19. Atomicity boundaries

Canonical fact changes that jointly establish one transition must conceptually commit together. The physical transaction/repository design is deferred.

Examples:

- recurring Done/DMB: explicit History success plus the recurrence/occurrence transition facts required to make the next state reconstructable;
- Delay: Delayed History plus its forward effective-date boundary and origin/provenance fact;
- Complete: Complete History plus terminal lifecycle transition and recurrence termination;
- historical correction: explicit History replacement/clear plus any canonical boundary/override fact directly part of that correction.

Projection repair is subordinate and may retry separately. Failure to repair `Task.status`, `due_on`, or an active field must not undo a successful canonical fact transition or create a compensating business event.

Reward banking, claiming, economy, and achievements are downstream failure domains. They may retry independently from the canonical result and must be idempotent.

## 20. TaskStateDiagnostic result contract

The architecture-level diagnostic shape is:

```ts
type TaskStateDiagnostic = {
  code: string;
  severity: "warning" | "error" | "needs_attention";
  entityId: string | null;
  entityKind: "parent" | "step" | "substep" | null;
  logicalDate: string | null;
  occurrenceIdentity: string | null;
  affectedAuthority: "configuration" | "history" | "recurrence" | "boundary" | "override" | "lifecycle" | "workflow" | "projection" | "reward" | "concurrency";
  summary: string;
  machineAction: "ignore" | "retry" | "repair_projection" | "reject" | "needs_user_resolution" | "migration_review";
  mayContinue: boolean;
  userResolutionRequired: boolean;
  provenance: readonly string[];
};
```

Diagnostic codes must be stable enough for the engine, command layer, migration tools, developer diagnostics, and future UI. They are not UI copy and are not persisted by this document.

Examples include malformed logical-day context, missing recurrence anchor, ambiguous occurrence identity, contradictory boundaries, stale revision, unsupported legacy recurrence, explicit/automatic Missed conflict, invalid lifecycle combination, stale In Progress evidence, unsafe projection repair, duplicate command identity with conflicting payload, reward entitlement without a canonical success, and reward finalization attempting recurrence mutation.

Fail-safe behavior is:

1. preserve user facts;
2. return the safest provable state;
3. do not synthesize History to resolve uncertainty;
4. do not silently select between unresolved authorities;
5. reject or require explicit resolution when transition semantics are unsafe; and
6. make retry/projection-repair/migration actions machine-classifiable.

## 21. Read projection contracts

Every consumer receives either `EffectiveTaskState` or a named projection derived from it.

| Consumer | Canonical input | Allowed projection | Forbidden behavior |
|---|---|---|---|
| Table/List/Home | `EffectiveTaskState` per entity | Display status, lifecycle/container labels, capabilities, row fields | Raw stored-status fallback or local recurrence/status calculation |
| Smart Lists | Current active projection plus timeline/history facts | Status predicates, current active filters, deliberate historical predicates | Treating current active status and historical outcomes as one predicate |
| Calendar | `EffectiveTimelineDay` and capabilities | Date cells, action affordances, streak explanation | Running a competing due-date generator |
| History | Effective timeline plus explicit History | Explicit row editor, calculated-day display, date-specific command affordances | Converting calculated Missed into explicit row on read |
| Streak summaries | Effective chronology | Current positive/Missed streak; saved-History stats under separate names | Saved rows alone for current chronology |
| Editor | Canonical state plus editable configuration | Draft fields and capability display | Directly patching occurrence-sensitive status/due/repeat fields |
| Rewards | Reward intents/results | Entitlement queue, dice/economy projection | Inferring success from status or advancing recurrence |
| Achievements | Canonical events/state and achievement intents | Achievement progress/notifications | Mutating Task state or using time passage as success |
| Paths/On-Time/Home overlays | Canonical display/capability projections | Surface-specific subset | Child-only raw status authority |

If a consumer cannot obtain canonical state, the target is an explicit unavailable/diagnostic state. It must not invent a second calculator.

## 22. Persistence projection contract

The target projection boundary is:

```text
canonical facts + EffectiveTaskState
        ↓
projectPersistableTaskState(state, expectedStoredState)
        ↓
guarded compatibility projection plan
```

Projection rules:

- deterministic and reconstructable from canonical facts;
- non-authoritative and explicitly labelled;
- limited to an allow-list owned by the projection boundary;
- guarded by expected revision and canonical state fingerprint;
- safe to retry or repair;
- zero-effective-write aware; and
- never read back as a higher-precedence chronology source.

Current fields should eventually be classified as follows:

| Field/concept | Target classification |
|---|---|
| explicit History row/outcome | Canonical fact |
| recurrence configuration | Canonical configuration fact |
| recurrence anchor | Canonical fact/value with provenance |
| schedule boundary | Canonical fact/value |
| Calendar override | Canonical fact/value |
| terminal lifecycle | Canonical fact |
| container state | Canonical fact |
| workflow In Progress data | Canonical workflow fact while needed; otherwise legacy-only |
| `Task.status` | Derived display/lifecycle compatibility projection; never fallback authority |
| `due_on` | Current effective-obligation projection; never occurrence identity or recurrence anchor |
| `active_occurrence_due_on` | Workflow/current-occurrence compatibility projection; never sole authority |
| `active_status_logical_date` | In Progress workflow projection/fact only; never general status authority |
| `completed_at` | Lifecycle/projection field whose meaning must follow terminal fact |
| `counted_as_due_occurrence`, `was_completed` | Derived/compatibility metadata; not independent policy authority |
| current streak counters | Rebuildable cache/projection |
| reward claim/grant identity | Downstream durable entitlement/effect evidence |

Callers cannot directly edit a projection field as a substitute for the corresponding command.

## 23. Legacy adapter contract

`src/lib/task-state-engine/legacy-adapter.ts` is the translation boundary:

```text
legacy Task/History shape
        ↓
canonical facts/input + provenance + TaskStateDiagnostic
```

It may:

- translate field names and legacy status values;
- normalize dates and recurrence configuration;
- classify stored fields as facts, evidence, or projections;
- reconstruct safe occurrence/anchor values with confidence;
- preserve source identity and provenance; and
- report missing, stale, unsupported, or contradictory data.

It must not:

- invent user History;
- promote calculated Missed to explicit facts;
- silently resolve contradictory chronology;
- choose product policy different from Phases 1A/1B;
- use `due_on` as an implicit recurrence anchor when canonical anchor evidence is absent; or
- write Task, History, reward, or projection data.

During migration, the adapter may return `safe`, `warning`, or `ambiguous` provenance classifications. After canonical storage exists, it should shrink to a compatibility translator and then be retired for canonical rows.

## 24. Repository/persistence boundary

The command result requires conceptual repositories. They do not imply separate physical tables.

| Conceptual repository | Owns | Does not own |
|---|---|---|
| Task configuration repository | title/metadata that is not state-sensitive, recurrence configuration, stable anchor when applicable | Current display status or reward effects |
| Explicit History repository | One explicit outcome/entity/date, occurrence and provenance metadata, replace/clear | Calculated Missed or current status |
| Schedule-boundary repository | Forward due/Repeat/Delay boundary facts | General History replacement |
| Calendar override repository | Date-scoped scheduling interpretation | Repeat mutation or outcome History |
| Lifecycle/container/workflow repository | Terminal, Archive/Trash, restore evidence, In Progress facts | Recurrence calculations |
| Occurrence/deferred-state repository | Immutable origin, effective date, merge provenance, resolution evidence where needed | UI labels |
| Reward entitlement/effect repository | Entitlement identity, grant/claim/retry evidence | Task chronology or recurrence |
| Projection repository/compatibility layer | Rebuildable stored status/due/active fields | Canonical truth |
| Achievement repository | Downstream evaluation identity/version and achievement effect | Task transitions |

The storage phase must make each canonical concept durably representable, but this document does not choose tables, columns, constraints, SQL, RPCs, or transaction syntax.

## 25. Current caller migration matrix

Disposition values mean: `KEEP` as the target authority, `REFACTOR` to consume the contract, `WRAP TEMPORARILY` behind a named adapter, `RETIRE` after convergence/proof, or `INVESTIGATE` where current behavior/data needs a bounded follow-up.

| Current caller/path | Current authority | Target read/command | Direct writes now | Target writes | Legacy dependency | Risk | Disposition |
|---|---|---|---|---|---|---|---|
| TaskApp active-status projection | Engine adapter with stored fallback | `readTaskState()` / display projection | None | None or projection only | `read-authority` disabled branch | Incomplete surface convergence | REFACTOR |
| Table/List reads | Status map plus raw row/child status | `EffectiveTaskState.active` and display projection | None | None | `task.status`, child status | Table/List parity | REFACTOR |
| Home | Derived active collections/status map | Canonical active/lifecycle projection | None | None | bucket helpers | Filter drift | REFACTOR |
| Smart Lists | `task-lists.ts` status map or raw status, saved History facts | Canonical status predicate or explicit timeline predicate | None | None | `task.status` fallback | Current versus historical predicate confusion | REFACTOR |
| History Calendar reads | Effective Timeline plus legacy due-date set | `EffectiveTimeline` only | None | None | `buildTaskHistoryCalendarDueDateSet` | Competing recurrence projection | REFACTOR |
| History Calendar outcome edits | Engine action when enabled, legacy live resolver otherwise | Set/ClearOutcome with historical date | Task status/due/active reconciliation; History upsert/delete | Result categories | direct History path, weekly cleanup | Historical butterfly effects | REFACTOR |
| TaskApp status actions | Action authority plus generic update | SetOutcome/DelayOccurrence/CompleteTask | Task row then History sync | Canonical facts, then projection | `updateTask`, active tracking | Partial transition and stale retries | REFACTOR |
| Editor save | Action/schedule authority plus generic metadata update | Metadata update plus explicit command per state-sensitive slice | Generic Task update, History sync, subtasks/notes | Categorized command result | `applyTaskActiveStatusTracking`, overdue helper | Mixed save atomicity | REFACTOR |
| Batch edit | Per-task engine preflight and caller loop | Batch of explicit entity commands | Per-task Task/History writes | Per-result plans under selected atomicity | Generic update and reward callback | Partial batch semantics | REFACTOR |
| `task-cockpit.ts` | Stored status/due and selected History | Display formatter over `EffectiveTaskState` | None | None | Legacy status logic | Hidden second calculator | RETIRE |
| `task-history.ts` live resolver | Engine or legacy History rebase | Read/command boundary | Task + History direct writes | Command result repositories | `task-repeat.ts` | Historical correction drift | RETIRE |
| `task-repeat.ts` recurrence | Legacy next-date/bucket helpers | Canonical recurrence read/command | Indirect Task writes | Command result | reward finalizer and History fallback | Duplicate recurrence | RETIRE |
| `task-active-status.ts` | Direct stored In Progress tracking | Start/ClearInProgress | Active fields | Workflow fact/projection from result | generic update hooks | Workflow/status conflation | WRAP TEMPORARILY |
| Complete flow | Separate Task and History operations; milestone RPC branch | CompleteTask | Task update, History write, rollback | Atomic canonical plan, then projection/effects | `task-complete.ts`, milestone path | Terminal/History contradiction | REFACTOR |
| Archive | Generic status/container patch | ArchiveTask | Task status/container fields | Container fact plus projection | archive-like helpers | Complete overwritten by Archive | REFACTOR |
| Trash | Generic CRUD and milestone path | TrashTask | status/trashed_at or hard delete follow-up | Container fact | trash helper/RPC | Loss of prior container evidence | REFACTOR |
| Restore Archive | Generic status reset where present | RestoreArchivedTask | status reset | Proven container restore then re-read | raw stored status | Synthetic recurrence | REFACTOR |
| Restore Trash | Generic `status=pending` or milestone restore | RestoreTrashedTask | status reset | Proven prior container restore then re-read | raw status | Unknown prior state | REFACTOR |
| Rollover authority | Engine plan plus legacy RPC fallback | Pure read/reconcile coordination | RPC Task patches and possible History | Projection-only repair plus retryable intents | engine/legacy RPC coexistence | Time creates truth | REFACTOR |
| Legacy rollover RPC | RPC-owned recurrence/status/History | No target business command | RPC-owned writes | None after retirement | deployed state unknown | Runtime divergence | RETIRE |
| `reconcileOverdueTaskMisses` | Reward controller + legacy overdue helper | Read calculated Missed; explicit repair command only | Automatic History upsert | None in normal rollover | `task-history`, `task-repeat` | Automatic rows become authority | RETIRE |
| `finalizeRecurringTasks` | Reward controller owns next due/status/reset | Command result already owns recurrence | Task due/status and child reset | Downstream effect only; explicit hierarchy command if approved | `task-repeat` | Reward mutates chronology | RETIRE |
| Reward controller | Status transition + claim tables | Consume reward intents/results | Reward/economy stores; currently can call recurrence finalizer | Entitlement/effect repositories | current status and saved streaks | Duplicate/late reward | REFACTOR |
| Economy hook | Reward roll/claim and profile/ledger | Consume downstream reward effect | Economy stores | Effect repositories | reward claim status | Economy/task coupling | KEEP |
| Achievement controller | Canonical/rollover-triggered evaluations | Consume AchievementIntent | Achievement stores/effects | Effect repository | rollover and reward triggers | Duplicate event meaning | REFACTOR |
| Parent Task actions | Parent entity status/History | Same command/read contract | Parent Task/History | Parent entity result | hierarchy UI | Child implication | KEEP |
| Step/Substep actions | Direct subtask status / same-table Task callbacks | Same contract for explicit child entity | Child row status or Task status | Child entity result | legacy subtask table and reward claim ref | Parent-child coupling | REFACTOR |
| Persistence projection | Allow-listed engine patch | `projectPersistableTaskState(afterState)` | status/due/completed/active fields | Guarded projections only | legacy row shape | Projection treated as truth | KEEP |

## 26. Forbidden target patterns

Implementation must eliminate these patterns:

- UI directly calculates the next due date after Done/DMB/Complete.
- Reward code advances recurrence, changes status, or writes `due_on`.
- Calendar calculates recurrence separately from the canonical evaluator.
- History action resolution creates a second active-status algorithm.
- Raw stored `Task.status` overrides canonical read or serves as an implicit fallback authority.
- `due_on` is used as immutable occurrence identity or recurrence anchor.
- Rollover writes ordinary automatic Missed History.
- Stale In Progress becomes automatic DMB or Done.
- Generic `updateTask` patches occurrence-sensitive status, due, repeat, or lifecycle fields without a command.
- Archive overwrites permanent Complete semantics.
- Restore invents a due date or recurrence when prior state cannot be proven.
- Parent completion implicitly completes, resets, or rewards children.
- A Step/Substep action silently mutates its parent.
- A projection repair is treated as a user/business event.
- A retry creates a duplicate History row, recurrence transition, or reward entitlement.
- A narrow Calendar window changes current state or streaks.
- Saved History-only stats are used as current active status.
- A missing History load is replaced with an empty/stale snapshot for an occurrence-sensitive transition.
- A legacy adapter silently guesses through contradictory chronology.
- An achievement or economy write is used as proof that the Task transition committed.

## 27. Canonical happy-path examples

### Example 1: recurring Done

```text
Table/List command: SetOutcome(Done, entity, logicalDate)
  → read canonical state with current LogicalDayContext
  → validate occurrence and concurrency proof
  → write explicit Done History + recurrence/occurrence transition facts
  → derive afterState and one effective due projection
  → produce one HandledSuccessRewardIntent(entity, logicalDate)
  → persist canonical facts and guarded projection
  → reward consumer applies entitlement/banking idempotently
```

The caller never calculates the replacement status or due date.

### Example 2: historical Missed → Done

```text
History Calendar: SetOutcome(Done, 8/8)
  → replace explicit outcome for entity/8/8
  → replay chronology from the required boundary
  → preserve later manual schedule/Repeat boundaries
  → derive rolling/fixed effects as applicable
  → emit a reward intent only for explicit 8/8 success if unused
  → emit no reward for downstream recalculated dates
```

### Example 3: Delay

```text
DelayOccurrence(origin=8/10, actionDate=8/11, effectiveDate=8/13)
  → validate target and revision
  → preserve origin task:{id}:occurrence:8/10
  → write Delayed History/boundary with scheduledDueOn=8/10, effectiveDueOn=8/13
  → group with a same-Task 8/13 origin if fixed collision applies
  → derive afterState and due_on projection=8/13
  → emit no reward intent
```

### Example 4: one-time Complete

```text
CompleteTask(one-time entity, logicalDate=8/13)
  → validate the one-time obligation and lifecycle
  → write Complete History
  → resolve obligation and set terminalState=permanently_complete
  → terminate recurrence and clear current cursor projection
  → derive afterState
  → emit one entity/8/13 reward intent if unused
```

Archive is not used to make the Task Complete.

### Example 5: logical-day rollover

```text
new LogicalDayContext
  → read canonical facts
  → derive Missed/timeline/streak changes purely
  → optionally repair a stale projection under revision proof
  → optionally retry an already justified downstream intent
  → create no automatic Missed History and no success reward
```

The result may contain zero Task mutations.

### Example 6: Parent + Step Done

```text
SetOutcome(Done, Parent, 8/8)
SetOutcome(Done, Step, 8/8)
  → two explicit entity commands or an explicit future multi-command operation
  → independent before/after states and History identities
  → two entity/date reward entitlements
  → no implied child/parent completion or reward
```

## 28. Batch command behavior

Batch is a collection of individually validated commands, not a weaker semantic path:

```text
BatchCommand
  → normalize one command per explicit entity
  → read current state per entity
  → validate each command independently
  → produce one TaskCommandResult per entity
  → apply declared operation atomicity policy
  → preserve each diagnostic and reward intent
```

The conceptual operation policy must be explicit:

- **all-or-nothing** — no canonical fact writes if any entity is rejected or needs resolution;
- **partial success** — accepted entities commit, rejected entities return individual results; or
- **caller-selected policy** — the caller must choose and record the policy before execution.

The default should be conservative for a batch that mixes occurrence-sensitive commands: preflight all entities, preserve individual proofs, and do not silently continue after an authoritative History/concurrency failure. A batch cannot replace individual entity command identities or collapse separate reward entitlements.

## 29. Command replay and idempotence

Commands may be retried because of network failure, tab suspension, timeout, or caller replay. The target property is:

```text
same command identity + same accepted payload + same proof
  → same canonical transition identity
  → same result/effect identities
  → no duplicate History
  → no duplicate recurrence transition
  → no duplicate reward entitlement
```

An identical retry after downstream reward failure reuses the committed Task transition and returns/retries the same reward entitlement. It does not execute the Task transition a second time.

An intentional later historical edit must have a new command identity and a new relevant revision proof, even if it writes the same outcome text. Historical command identity must distinguish a network retry from a later user correction.

## 30. Storage requirements discovered by Phases 1A–1C

This is a consolidated conceptual gap list, not a schema design.

| Durable concept | Current representation/evidence | Classification | Later storage requirement |
|---|---|---|---|
| Explicit History per entity/logical date | `adhdice_task_history` keyed by user/task/date in current callers | Partially represented | Preserve one authoritative outcome, replacement/clear identity, provenance, and revision evidence |
| Occurrence origin identity | `occurrence_key`, `occurrence_due_on`, active fields; missing/ambiguous legacy rows | Partially represented / legacy ambiguous | Durable immutable occurrence identity with confidence/provenance |
| Immutable `scheduledDueOn` | History `occurrence_due_on` where present; often inferred from `due_on` | Partially represented / legacy ambiguous | Separate scheduled origin from moving effective date |
| Effective due / Delay provenance | Current `due_on` and Delayed status; no complete origin/effective model | Missing/partially represented | Durable Delay boundary, origin, effective date, and merge provenance |
| Recurrence anchor | Legacy adapter uses `due_on` as anchor evidence; no universally stable anchor | Missing/legacy ambiguous | Stable anchor with recoverability/provenance classification |
| Current occurrence/deferred cursor | `due_on`, `active_occurrence_due_on`, engine-only cursor fields | Partially represented | Canonical current occurrence/effective obligation facts separate from projections |
| Schedule boundaries | Distributed due/Repeat edits; no single fact stream | Missing | Forward-authoritative boundary identity and replay semantics |
| Manual Calendar overrides | Current Calendar primarily writes outcomes; override is target-only | Missing | Date-scoped override fact distinct from History outcome |
| Terminal lifecycle | `completed_at`, `status=complete`, Complete History | Partially represented | Independent permanent Complete fact preserved through containers |
| Container state | `status=archived/trashed`, `trashed_at`, archive-like rules | Partially represented | Active/archived/trashed fact plus prior-container restore evidence |
| In Progress workflow | `active_status_logical_date`, `active_occurrence_due_on`, `status=in_progress` | Partially represented / conflated | Workflow fact independent of schedule state and explicit termination evidence |
| Historical Complete correction/reopen | Current completion flow and History removal helpers | Legacy ambiguous | Explicit correction identity and terminal-state proof |
| Same-Task effective-obligation grouping | No durable grouping; engine target only | Missing | Stable merge identity with all origin references and one resolution |
| Reward entitlement proof | Current reward claim tables keyed by reward date/task/subtask | Partially represented | Entity/date/program entitlement distinct from current status and durable before effect |
| Reward grant/claim identity | Reward roll/claim rows and operation IDs | Partially represented | Stable effect identity, retry state, and no-duplicate proof |
| Pending reward/economy retry | Pending dice tables/local queue/RPC operation IDs | Partially represented | Downstream retry independent from canonical Task transition |
| Achievement evaluation identity/version | Current achievement operation/effect mechanisms | Partially represented | Canonical event source identity and evaluation version |
| Task revision | Current guarded Task updates use `revision` | Adequately represented for current row proof | Extend proof to command/relevant-facts semantics |
| History revision/fingerprint | Caller snapshot/reload and deduplication | Missing/partially represented | Stable relevant-History concurrency proof |
| Command idempotence evidence | Some operation IDs for milestone/reward/rollover | Partially represented | Canonical command identity and replay result evidence |
| Projection revision/source | Current allow-listed projection and guarded row update | Partially represented | Canonical state fingerprint and repairable projection metadata |
| Legacy provenance | Adapter warnings/unsupported issues; History import/rollover provenance | Partially represented | Durable or reproducible provenance sufficient for migration diagnostics |
| Legacy automatic Missed classification | `provenance=rollover` in engine shape; current rows vary | Legacy ambiguous | Preserve as compatibility evidence; do not promote to user fact |
| Parent/Step/Substep entity identity | Same-table Tasks plus legacy subtask reward references | Partially represented | Uniform entity identity and independent History/reward scope |

No item in this table authorizes schema or migration work in Phase 1C.

## 31. Command/read contract invariants

These invariants are architecture acceptance criteria for later implementation. They extend the locked Phase 1A/1B invariants without reopening them.

1. One canonical read authority evaluates Task truth.
2. One canonical command layer validates state-sensitive mutations.
3. Equal canonical facts plus equal LogicalDayContext produce equal EffectiveTaskState, diagnostics, capabilities, and eligibility.
4. Reads are pure and never write Task, History, projection, reward, or achievement state.
5. UI surfaces do not independently recalculate Task truth.
6. Every state-sensitive command carries LogicalDayContext.
7. Occurrence-sensitive mutations are commands, not generic Task patches.
8. Explicit History and Calendar scheduling-state overrides are different canonical facts.
9. Calculated Missed is not automatically persisted as explicit History.
10. `due_on` is a current effective-obligation projection, not recurrence anchor or occurrence identity.
11. Stored `Task.status` is a projection/compatibility value, never a fallback authority.
12. Recurrence advancement belongs to the canonical Task command transition.
13. Reward consumers cannot mutate recurrence, status, due dates, or History.
14. Rollover is coordination/read reconciliation, not a success command.
15. Complete’s canonical History and terminal lifecycle transition are one semantic transition.
16. Archive and Trash do not erase or downgrade permanent Complete.
17. Archive and Trash do not create inactive-time History or success rewards.
18. In Progress is workflow only.
19. In Progress does not pause Missed, satisfy recurrence, move `due_on`, or grant rewards.
20. Command retries with the same identity are idempotent.
21. Reward entitlement/effect retries are idempotent.
22. Historical handled success creates at most one entity/date reward entitlement.
23. Derived chronology replay never manufactures downstream reward entitlements.
24. Same-Task merged origins resolve through one effective obligation and one entity/date outcome.
25. Parent, Step, and Substep commands are independent unless an explicit hierarchy command owns a multi-entity operation.
26. Projection failure cannot corrupt or undo canonical truth.
27. A stale command cannot silently apply to a different occurrence.
28. Diagnostics replace unsafe guessing through ambiguity or contradiction.
29. The legacy adapter translates and classifies; it does not choose product policy.
30. Calendar consumes canonical timeline facts.
31. Streaks consume effective chronology, not only persisted rows.
32. Smart List current status predicates consume canonical status projections; historical predicates name their source deliberately.
33. Editor occurrence-sensitive saves dispatch commands.
34. Batch actions preserve individual command semantics, diagnostics, proofs, and reward intents.
35. A future Calendar date is read-only unless an explicit command contract authorizes a non-outcome override.
36. Schedule boundaries are forward-authoritative and preserve earlier chronology.
37. Delay preserves `scheduledDueOn` while changing `effectiveDueOn`.
38. Delay does not change Repeat or stable recurrence anchor.
39. Complete stops future recurrence and does not depend on Archive.
40. Restore re-evaluates canonical state and creates no inactive-time History.
41. A logical-day transition may legitimately produce zero Task mutations.
42. Rollover cannot turn stale In Progress into DMB or Done.
43. Explicit outcome replacement is one entity/date replacement, not duplicate History.
44. Clearing explicit History returns authority to the effective timeline for that date.
45. Legacy automatic Missed rows remain provenance evidence and do not become new user facts.
46. Reward entitlement identity is based on entity/date/program, not status name, cursor, queue position, or rollover count.
47. Done, Did My Best, and Complete have equal reward value and one shared entity/date entitlement.
48. A success reversal does not automatically claw back a consumed reward entitlement.
49. Achievement evaluation is downstream and idempotent.
50. Direct legacy writers have an explicit migration/retirement path.

## 32. Contract scenario matrix

These are architecture scenarios, not implementation tests. Each row states the canonical input/operation, decision, fact/projection result, after-state expectation, reward result, and diagnostic expectation.

| # | Canonical input and command/read | Decision | Canonical fact changes | Projection changes | AfterState | Reward intent | Diagnostics |
|---:|---|---|---|---|---|---|---|
| 1 | Same Task facts/context read by Table and List | accepted read | none | same display projection | identical active/lifecycle state | none | none |
| 2 | Same Task facts/context read by Calendar and current status | accepted read | none | date projection only | same chronology, date-specific state | none | none |
| 3 | Rolling Task due 8/10, Done 8/10 | accepted | explicit Done + rolling transition | due/status projection from result | handled 8/10, next due 8/13 | one Done 8/10 | none |
| 4 | Rolling Task due 8/10, DMB 8/8 | accepted | explicit DMB + rolling rebase | next due projection | next due 8/11 | one DMB 8/8 | none |
| 5 | One-time due 8/10, Complete 8/6 | accepted | Complete History + terminal lifecycle | clear active cursor | permanently Complete; 8/10 never Missed | one Complete 8/6 | none |
| 6 | One-time due 8/10, overdue, Complete 8/13 | accepted | Complete History + terminal lifecycle | clear cursor/status projection | overdue obligation resolved, terminal | one Complete 8/13 | none |
| 7 | Explicit History Missed 8/10 becomes Done 8/10 | accepted historical correction | replace History | replayed projection | chronology corrected from 8/10 | one if unused | correction provenance |
| 8 | Delay rolling origin 8/10 on 8/11 until 8/13 | accepted | Delayed History + boundary/effective date | due_on=8/13 projection | one delayed obligation, origin remains 8/10 | none | none |
| 9 | Fixed Friday origin delayed to Monday normal Monday origin | accepted | Delay/boundary and origin provenance | one effective Monday projection | one merged Monday obligation with two origins | max one Monday intent | none |
| 10 | Fixed older Missed plus future Friday occurrence read | accepted read | none | active Missed/future schedule projections | both older obligation and future membership | none | none |
| 11 | Set Calendar 8/8 Not Due where no outcome exists | accepted | override only | Calendar projection | 8/8 Not Due; Repeat unchanged | none | none |
| 12 | Mark 8/8 Done on same data | accepted | explicit Done History | chronology/display projection | 8/8 handled | one if unused | none |
| 13 | One-time overdue 8/11 Done without Complete | accepted checkpoint | explicit Done only | active obligation remains Missed | checkpoint handled; obligation unresolved | one Done 8/11 | none |
| 14 | Genuinely unscheduled Task Delay | rejected | none | none | unchanged unscheduled | none | no obligation; reject |
| 15 | Future date outcome edit without override authority | rejected | none | none | unchanged | none | future date read-only |
| 16 | Archived active Task SetOutcome(Done) | rejected | none | none | archived, unchanged | none | restore required |
| 17 | Archived Task Restore then read | accepted | container restore only | safe projection repair if proven | active state re-evaluated, no backlog History | none | warning if cursor ambiguous |
| 18 | Trashed permanently Complete Task restore | accepted | container restore only | Complete projection preserved | permanently Complete, no recurrence | none | none |
| 19 | StartInProgress on active Due/Open Task | accepted | workflow fact | workflow projection | schedule remains Due/Open | none | none |
| 20 | In Progress crosses logical day with no outcome | accepted read/reconcile | none | optional workflow cleanup projection | schedule may be Missed; no synthetic success | none | stale workflow warning if needed |
| 21 | Logical-day rollover finds one-time overdue | accepted read | none | optional safe due/status projection | calculated Missed | none | none |
| 22 | Five-day offline gap on rolling overdue Task | accepted read | none | optional repair only | one frozen obligation; calculated Missed range | none | none |
| 23 | Five-day offline gap on fixed Task | accepted read | none | optional projection | fixed missed occurrences plus future membership | none | none |
| 24 | Stale `due_on`, chronology safely reconstructable | accepted read/reconcile | none | guarded due projection repair | canonical cursor/obligation | none | projection repair provenance |
| 25 | Stale stored status, canonical state says Not Due | accepted read | none | status projection may repair | Not Due | none | none |
| 26 | Stale command after another tab changes Schedule | rejected/re-evaluate | none | none | current state from fresh facts | none | stale revision/occurrence |
| 27 | Two tabs mark same date Done | one accepted, one replay/no-op | one explicit History | one projection transition | one handled state | one entitlement | replay/no-op diagnostic optional |
| 28 | Retry same accepted Done command after timeout | replayed accepted | no duplicate facts | same projection | same afterState | same entitlement identity | replayed=true |
| 29 | Reward bank fails after Done commit | accepted Task command | canonical facts already committed | projections may commit | handled state remains | pending/retryable intent | reward retry warning |
| 30 | Reward retry after prior successful bank | replay/no-op effect | no Task change | no Task change | unchanged | existing effect returned | duplicate effect handled |
| 31 | Parent Done only | accepted | Parent History | Parent projection | Parent handled; child unchanged | Parent one | none |
| 32 | Step Done only | accepted | Step History | Step projection | Step handled; Parent unchanged | Step one | none |
| 33 | Substep Done only | accepted | Substep History | Substep projection | Substep handled; ancestors unchanged | Substep one | none |
| 34 | Batch Done for Parent + Step with all-or-nothing policy | accepted if both proofs valid | two entity facts | two projections | two independent afterStates | two intents | per-entity diagnostics |
| 35 | Batch has one stale entity under partial policy | partial success | accepted entity only | accepted projection only | per-entity states | accepted intents only | stale entity rejection |
| 36 | Legacy History row lacks occurrence identity but chronology is safe | accepted with warning | no synthetic row | safe projection only | proven state | only explicit command success may reward | legacy provenance warning |
| 37 | Legacy row has two possible active occurrences | needs resolution | none | none | safest state only | none | ambiguous occurrence |
| 38 | Contradictory schedule boundaries | needs resolution | none | none | safest proven state | none | boundary conflict |
| 39 | Explicit History and automatic Missed conflict | accepted read with warning if safe | preserve explicit fact; no new row | safe projection only | explicit outcome wins per precedence | explicit success may reward once | provenance conflict |
| 40 | Clear explicit Done on a date with calculated Missed beneath | accepted | clear explicit row | timeline projection returns | calculated chronology resumes | no new reward | none |
| 41 | Complete then Archive | accepted two commands | terminal + container facts | Complete/Archive projections | permanently Complete in Archive | one Complete intent only | none |
| 42 | Archive then Complete without restore | rejected | none | none | archived active state | none | restore required |
| 43 | Calendar marks Not Due on actual active obligation date | accepted if override valid | override fact | active obligation re-evaluated | obligation removed/adjusted per override | none | warning if conflict remains |
| 44 | Calendar marks later unrelated date Not Due while older rolling Missed remains | accepted | later override only | timeline projection | older active Missed remains | none | none |
| 45 | Done → DMB same entity/date after reward | accepted replacement | History replacement | same current projection | handled state | no second intent | entitlement already consumed |
| 46 | Done → Missed → Done after reward | accepted corrections | explicit replacements | chronology recomputed | final handled state | no second intent | no clawback |
| 47 | Reward finalizer attempts next due update | rejected compatibility mutation | none | none | canonical state unchanged | existing reward may continue | migration diagnostic |
| 48 | Projection write fails after canonical Complete | accepted canonical transition | Complete facts committed | projection pending | terminal state still Complete | intent remains valid | projection retry warning |
| 49 | History load fails for occurrence-sensitive command | rejected | none | none | unchanged | none | authoritative input unavailable |
| 50 | Read has malformed timezone/rollover boundary | rejected read/needs attention | none | none | no unsafe state invention | none | invalid LogicalDayContext |

## 33. Product decisions

No new product decisions are required by Phase 1C. Phase 1B product semantics are locked. This document makes implementation/API boundaries explicit without changing Done, Did My Best, Missed, Delay, Complete, recurrence, lifecycle, workflow, rollover, Calendar override, reward, or hierarchy policy.

The only unresolved items exposed here are implementation, storage, migration, compatibility-retirement, deployment-proof, and QA concerns. They are not product questions.

## 34. Handoff

### A. Canonical read contract

One pure `readTaskState(CanonicalTaskReadInput)` evaluator consumes configuration, lifecycle/container/workflow facts, explicit History, recurrence anchor/evidence, schedule boundaries, Calendar overrides, logical-day context, and legacy provenance. It returns `EffectiveTaskState` plus diagnostics and never writes.

### B. Canonical command contract

One `TaskCommand` envelope carries command type, user/entity identity, LogicalDayContext, requested logical date, intent, expected revision/concurrency proof, actor/provenance, and deterministic idempotence identity. Occurrence-sensitive work cannot enter as a generic Task patch.

### C. Canonical result contract

One `TaskCommandResult` returns decision, diagnostics, before/after canonical states, categorized canonical fact plans, History, schedule-boundary, override, lifecycle, workflow, projection, reward, achievement, hierarchy, and refresh requirements.

### D. Projection contract

`projectPersistableTaskState(afterState)` produces deterministic, guarded, repairable compatibility projections. `Task.status`, `due_on`, active occurrence fields, and streak caches never override canonical chronology.

### E. Side-effect contract

Handled-success reward intents are downstream, entity/date/program scoped, equal for Done/DMB/Complete, and idempotent. Reward/economy/achievement consumers never mutate Task chronology or recurrence.

### F. Migration matrix

TaskApp, Table/List/Home, Smart Lists, Calendar, History, editor, batch, status actions, lifecycle actions, rollover, reward, and hierarchy callers are identified above. The primary migration is `REFACTOR` to command/read results; duplicate calculators and reward-owned recurrence are `RETIRE` after proof; narrow translation/provenance seams are `KEEP` or `WRAP TEMPORARILY`.

### G. Storage gaps

The next storage phase must make explicit History, occurrence origin, scheduled/effective due, recurrence anchor, schedule boundaries, Calendar overrides, independent lifecycle/container/workflow, reward entitlement/effect identity, restore evidence, command/revision/idempotence, and provenance durably representable. No schema is designed here.

### H. Legacy authorities to retire

Retire or narrow `getTaskDisplayStatus*` as calculators, `resolveLiveTaskStatusFromHistory`, duplicate `task-repeat` recurrence paths, `adhdice_reconcile_task_rollover` as a business fallback, `reconcileOverdueTaskMisses()`, and `finalizeRecurringTasks()` as Task-state writers. Retire only after separate runtime/deployment and migration proof.

### I. Remaining architecture work before production implementation

1. Define persistence/storage and migration design for the durable concepts above.
2. Define implementation sequencing and the compatibility gate between command/read authority and legacy adapters.
3. Define compatibility retirement and deployment-proof criteria for the engine/legacy paths.
4. Define focused contract tests and QA evidence for reads, commands, replay, concurrency, projection repair, rewards, hierarchy, and Calendar parity.

Recommended next phase: persistence/storage and migration design, followed by implementation sequencing and a focused contract-test/QA strategy. Those phases must remain separate and are not started here.

## Scope and verification record

This document is architecture/documentation only. Production code, tests, schema, SQL, Supabase, UI, diagnostics implementation, version surfaces, and runtime behavior were not changed or implemented. Per the requested verification boundary, only `git diff --check` is to be run after this file is written. Browser, build, lint, typecheck, tests, SQL, Supabase, and deployment verification are outside this Phase 1C pass.
