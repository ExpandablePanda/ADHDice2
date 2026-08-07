# Task State Engine

Last reviewed: 2026-08-03
Role: canonical active authority

## Purpose

This document is the active contract for the shared Task State Engine. It describes implemented state evaluation, status and action routing, recurrence and rollover planning, Calendar facts, reward eligibility, and the narrow persistence projection. It is not a release log or proof of deployed SQL, browser behavior, or complete surface convergence.

The engine is the shared domain boundary for current task-state decisions. TaskApp architecture and source-map documents describe caller ownership and file locations; this document describes the state contract those callers are expected to use.

## Authority Model

- State evaluation is pure: current task data, logical-date context, schedule facts, and explicit History are inputs; calculated state and eligibility facts are outputs.
- `evaluateTaskState` is the calculation authority. It does not write rows, award rewards, or perform browser/runtime coordination.
- The default-on integration switch is `TASK_STATE_ENGINE_INTEGRATION_ENABLED = true`. The legacy path remains a compatibility fallback while connected seams are being revalidated.
- Read, action, Calendar, and rollover adapters route their respective decisions through the engine when the switch is enabled.
- A compatibility fallback must not be described as proof that every consumer has converged.

The engine owns domain calculations, while TaskApp and its adapters own invocation timing, presentation, optimistic state, and persistence calls. A caller may project engine facts for a surface, but it must not create a second recurrence or History interpretation for that surface.

## Effective Timeline foundation

The pure `buildTaskEffectiveTimeline` helper combines explicit History with calculated dates, emits only the bounded Calendar window, and calculates current-state facts over an internal range that is independent of that window. Explicit History wins for its logical date, retains its row and occurrence metadata, and is marked handled. Calculated Missed and Open dates describe an unresolved obligation without creating permanent History; they may recalculate after a schedule change.

Task History Calendar now consumes the Effective Timeline for active and complete tasks. Calculated Missed dates appear in Calendar without becoming History rows, and current missed-streak summaries use the Effective Timeline. Positive current streaks and current Missed streaks are mutually exclusive, while historical/best streaks and completion statistics remain saved-History based. Archived and trashed Calendar and streak behavior remains on the existing fallback. Status-circle convergence, No Repeat conversion, and Delayed display priority remain deferred. Persistence and rollover behavior remain unchanged.

### Effective Timeline schedule-anchor precedence

The task's current `dueOn` is the authoritative active calculation cursor, followed by `activeOccurrenceDueOn` and only then explicit History occurrence metadata or a successful repeating History logical date. Explicit History retains its original occurrence identity and due date for historical display. Rows before a manually updated current cursor remain historical display facts and do not rewind the active schedule. A backdated current due date may therefore calculate Missed dates before a later explicit success; no History rows are rewritten or automatically inserted. When an explicit handled Done, Did My Best, or Complete row identifies an older occurrence, the timeline may separately reconstruct calculated historical Missed days from that occurrence through the day before the handled row. This reconstruction does not persist History rows, explicit History still wins within the interval, and old History cannot rewind a newer live cursor.

## Logical Date and Occurrence Identity

Logical date is derived from the user-scoped timezone and rollover context, not from an arbitrary browser render timestamp. Recurrence evaluation uses that logical date together with schedule facts and the active occurrence.

Occurrence identity is explicit in History-facing calculations. A recurring occurrence is not identified only by the task's displayed status; due date, occurrence key, and related History facts distinguish the occurrence being evaluated. The engine may calculate cursor or occurrence metadata internally even when those values are not persistable task-row fields.

This identity boundary protects future and overdue occurrences from status-only replay. Any caller that creates or consumes an occurrence-specific History entry must carry the same logical-date and occurrence context through its read or action plan.

## Status Read Authority

`read-authority.ts` exposes the centralized active-status read path. With the default-on switch, it adapts task and History inputs into engine state and projects the resulting status for presentation. The legacy `getTaskDisplayStatusWithHistory()` path remains available for compatibility.

The active TaskApp projection uses the newer centralized status path. This is a routing fact about the inspected production projection, not a claim that every List, child-preview, or derived hierarchy consumer already uses it.

Engine-only `unscheduled` is a valid calculated state. When a task-state patch crosses the persistence boundary, it projects to supported stored `pending`; that projection does not make stored status a substitute for the engine's full state.

## Action Authority

`action-authority.ts` evaluates the requested task action and returns an action plan. The plan can include a proposed task patch, a proposed History mutation, reward eligibility, and the guards or revision context needed by the caller.

The action authority centralizes ordinary Done, Missed, and related transitions across connected callers. It plans the mutation; the owning caller performs the guarded persistence operation and handles errors. The engine does not award rewards.

Action planning is also the compatibility boundary for recurring actions: callers should consume the returned task patch and proposed History mutation together instead of temporarily persisting a contradictory intermediate status for rollover to repair.

## Calendar Projection

Calendar state and action adapters use the same engine-derived facts and explicit History identity as the task-state path. Calendar projection is a fact projection for the requested logical date and occurrence; it should not independently reconstruct recurrence or status rules. Historical Missed inference uses the handled row's occurrence due date or occurrence identity, remains calculated and non-persistent, and does not replace the current live cursor.

Calendar presentation may differ from task-row presentation, but its state decisions remain inside the shared authority boundary. Browser rendering and deployed RPC behavior are outside this document's evidence.

The Calendar adapter may expose both state facts and action authority for the requested occurrence. It is not a separate persistence authority and must use the same projection rules when a Calendar action changes task state.

For an existing editable logical date, Calendar action availability evaluates each candidate against normalized History with the current date outcome replaced. The owning History path then upserts the same user/task/date identity, retaining known occurrence metadata and keeping past reward/economy handling outside the correction path.

## History Authority

History is an explicit input to state evaluation and an explicit output of action or rollover planning. History identity records the occurrence and status facts needed to distinguish recurring instances and preserve chronological meaning. A current effective Missed streak suppresses the positive current streak in shared summaries and rows; historical/best streak data remains saved-History based.

A proposed History mutation is separate from the proposed task patch. Callers must preserve guarded revisions, avoid zero-effective writes, and use the owning persistence path. This document does not claim a universal transaction or deployed-database guarantee.

History writes should retain explicit occurrence identity and the status/date facts needed for later chronological reconciliation. Read authority may use bounded current/live facts; full History is not a prerequisite for every active-status decision.

## Recurrence and Rollover

Recurrence evaluation handles logical dates, fixed and repeating schedules, active occurrence identity, overdue or missed transitions, and the next-occurrence facts required by the current state.

The rollover authority plans eligible transitions from bounded current-state facts and relevant History. It returns a task patch, proposed History changes, reward eligibility, and revision context for the caller. Rollover must be idempotent and must not replay a valid future occurrence merely because a displayed status is stale.

The engine is the planning authority; the application and deployed RPCs remain responsible for guarded execution. SQL deployment state is not established here.

Rollover readiness is user-scoped and logical-day-scoped. A changed user, logical day, timezone, or rollover setting must be treated as a new planning context; repeated work in one context should remain single-flight and idempotent.

## Persistence Projection

Keep these layers distinct:

1. Engine-internal calculated state includes normalized status, logical-date facts, occurrence/cursor facts, reward eligibility, and other non-persisted derivations.
2. A proposed task patch contains only changed task-row values intended for persistence.
3. A proposed History mutation carries explicit occurrence/status facts for the History operation.
4. The persistable task-state allow-list currently contains `status`, `dueOn`, `completedAt`, `activeStatusLogicalDate`, and `activeOccurrenceDueOn`.

The projection maps engine-only `unscheduled` to stored `pending` and drops unsupported fields. Recurrence cursor fields and occurrence identity fields are not included in the current task-state persistence projection. They must not be documented as persisted task-row metadata.

Guarded revision checks and no-op suppression are safety boundaries. The exact operation ordering, transaction behavior, and live RPC deployment must be verified separately.

The allow-list is a projection boundary, not a complete serialization of engine state. In particular, calculated occurrence identity, recurrence cursor, reward eligibility, and other engine-only facts must not be added to a task patch merely because they are available in the calculation result.

## Rewards Boundary

The engine returns reward eligibility as part of state or action planning. Reward-bank accounting and awarding remain outside the engine, in the owning application/mutation path. An eligibility result is not evidence that a reward was awarded or persisted.

## Permanent Completion Exception

Ordinary authority flows may carry a task proposal and a History proposal together for the owning caller to apply.

Permanent Complete is a qualified exception. The current TaskApp path performs guarded Task persistence and History persistence as separate guarded operations, with rollback handling when the History operation fails after the Task update. This must not be summarized as one universally atomic write or as proof of database transactionality.

The exception is intentionally narrow: it describes the inspected permanent-completion path, not a guarantee that every action caller has identical rollback behavior. Any change to that path requires separate verification of task failure, History failure, rollback, revision conflict, and reward sequencing.

## Known Convergence Seams

- Some List View paths still call `getTaskDisplayStatusWithHistory()` directly, including identified child and top-level display seams.
- The active TaskApp projection uses the newer centralized status path.
- Some child-preview or derived hierarchy status paths may still depend on stored status.
- Complete convergence is not established. Documentation must not claim that every connected surface uses one status-read path.

These seams are documentation and routing debt, not permission to duplicate the engine. A follow-up convergence ticket should identify each remaining caller, its owner, and its replacement boundary before changing behavior.

## Validation Limits

This documentation pass did not validate:

- live SQL or RPC deployment;
- browser behavior;
- multi-tab or BFCache behavior;
- reward-bank runtime behavior;
- List View parity;
- hierarchy-preview parity.

Source inspection confirms the named contracts and seams only. Runtime, deployed-database, and cross-surface conclusions require separate authorized validation.

The current contract therefore supports source-backed implementation planning, not a claim that the engine is the sole runtime path in production. Keep this distinction visible when updating neighboring architecture, QA, or release documents.

## Change Rules

Review this authority when status reads, actions, History identity or writes, recurrence, rollover, Calendar projection, reward eligibility, or persistence projection changes. Keep engine-internal values separate from persistable fields, preserve explicit occurrence identity, and document compatibility seams until they are source- and runtime-validated.

Do not add release chronology, repair counts, deployment conclusions, or browser claims to this active authority. Preserve such context in the historical archive.

## Related Documents

- [Archived prior authority](archive/2026-08-retired/TASK_STATE_ENGINE.md) — historical reference only.
- [TaskApp architecture](TASKAPP_ARCHITECTURE.md) — production routing and ownership.
- [TaskApp source map](TASKAPP_SOURCE_MAP.md) — current implementation locations.
- [UI system](UI_SYSTEM.md) — visual and interaction authority.
- [Agent workflow](AGENT_WORKFLOW.md) — work modes and scope rules.
- [Verification](VERIFICATION.md) — evidence and reporting requirements.
- [Task QA](qa/TASKS.md), [hierarchy QA](qa/TASK_HIERARCHY.md), and [rewards QA](qa/REWARDS_ROLL.md) — relevant browser checklists.
- [Historical release archive](archive/2026-08-retired/current-state-release-history.md) — release chronology and deployment caveats; historical reference only.
