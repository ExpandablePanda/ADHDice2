# Phase 1D-1: Canonical Persistence Contract and Target Storage Design

## Status and boundary

This is an architecture and storage-design document for the `codex/chatgpt-diagnostic-branch`.

It defines the target durable representation of the canonical facts established by Phases 1A through 1C. It does not define migration, backfill, cutover, SQL, deployment, generated types, repositories, diagnostics implementation, or UI behavior.

The target model is intentionally not a preservation of the current database shape. Current tables, columns, checked-in SQL, and application adapters are evidence and migration constraints only.

Evidence is from checked-in source. It does not prove which historical SQL patches are deployed, which RPC is active in Supabase, or how two live browser tabs race.

## Executive decision

The recommended target is a small set of canonical fact stores with one compact command-operation ledger and separate downstream reward effect records:

```text
User profile settings
        |
        v
Task entity row ------------- current lifecycle/container/workflow facts
        |
        +-- immutable schedule-boundary snapshots
        +-- materialized-on-demand occurrence facts
        +-- occurrence effective-date overrides
        +-- explicit History facts
        +-- manual Calendar overrides
        +-- command/replay evidence
        +-- reward entitlement -> grant -> claim
        |
        v
EffectiveTaskState and EffectiveTimeline (derived)
        |
        +-- guarded status/due/active projections
        +-- streak and Calendar projections
```

The key design choices are:

1. Task configuration and current lifecycle/container/workflow facts remain addressable by stable entity ID, but recurrence configuration is represented by immutable effective-dated schedule-boundary snapshots rather than only mutable Task columns.
2. `schedule_model` is explicit: `unscheduled`, `one_time`, `rolling`, or `fixed`. It is not inferred from an overloaded combination of `due_on`, Repeat, and status.
3. A stable recurrence anchor is a canonical schedule fact. It is never reconstructed indefinitely from moving `due_on`.
4. Occurrence rows are materialized only when an occurrence becomes a canonical fact through an explicit outcome, Delay, correction, or other required evidence. Future projected dates do not receive rows merely because they can be calculated.
5. Delay stores an immutable occurrence origin and a separate effective-date override. A delayed origin never becomes a new occurrence.
6. Explicit History, Calendar scheduling overrides, lifecycle/container facts, and workflow facts are separate authorities.
7. Calculated Missed, current status, current effective obligation grouping, and streaks remain derived or rebuildable projections.
8. A compact command ledger provides durable replay and stale-command evidence. It is not universal event sourcing.
9. Reward entitlement, reward grant/banking, and reward claim/consumption are separate durable facts with separate identities.

No new product decisions are required by Phase 1D-1. The persistence model represents the locked Phase 1B behavior.

## 1. Audit sources and current authority boundary

Required architecture sources inspected:

- [`task-state-phase-0-inventory.md`](task-state-phase-0-inventory.md)
- [`task-state-phase-1a-core-model.md`](task-state-phase-1a-core-model.md)
- [`task-state-phase-1b1-recurrence-transitions.md`](task-state-phase-1b1-recurrence-transitions.md)
- [`task-state-phase-1b2a-workflow-lifecycle-transitions.md`](task-state-phase-1b2a-workflow-lifecycle-transitions.md)
- [`task-state-phase-1b2b-rollover-reward-semantics.md`](task-state-phase-1b2b-rollover-reward-semantics.md)
- [`task-state-phase-1c-command-read-output-contract.md`](task-state-phase-1c-command-read-output-contract.md)

Checked-in persistence/application sources inspected include:

- `supabase/schema.sql` and relevant patches for Task, History, revisions, profile settings, repeat fields, rollover, rewards, economy, achievements, and subtasks;
- `src/lib/database.types.ts`;
- `src/lib/task-db-mutations.ts`, `src/lib/task-history.ts`, `src/hooks/useTaskHistoryActions.ts`, `src/hooks/useTaskUpdateAction.ts`, `src/hooks/useTaskEditorSaveAction.ts`, `src/hooks/useTaskBatchEditAction.ts`, and `src/hooks/useTaskCrudActions.ts`;
- `src/lib/task-state-engine/{types,legacy-adapter,recurrence,effective-timeline,action-authority,rollover-authority,persistence-projection}.ts`;
- `src/hooks/useTaskRewardController.ts`, `src/lib/task-rewards.ts`, `src/lib/pending-reward-dice.ts`, and `src/hooks/useEconomy.ts`;
- checked-in rollover RPC sources, reward RPC sources, achievement capture/evaluation sources, and profile/logical-day sources.

Current source proves multiple reachable writers and readers. It does not prove a deployed RPC or live database state.

## 2. Current physical storage inventory

The inventory is limited to persistence that can affect canonical Task truth, occurrence interpretation, lifecycle/workflow, rollover coordination, rewards/economy, achievements consuming Task events, hierarchy identity, or logical-day context. Focus, Health, Records, notes, layout, and unrelated product tables are excluded.

Canonical classification uses the required labels:

- **A. canonical fact**
- **B. derived state**
- **C. projection/cache**
- **D. compatibility/legacy**
- **E. operational/idempotence fact**
- **F. ambiguous/mixed responsibility**

Trust means trust for the current target authority, not whether the row is useful migration evidence.

### 2.1 Task entity and configuration rows

| Table / boundary | Field | Current meaning | Actual writers | Actual readers | Classification | Trust | Target disposition |
|---|---|---|---|---|---|---|---|
| `adhdice_clean_tasks` | `id` | Stable Task row identity | Task insert/import/promotion paths | All Task, History, hierarchy, reward, and achievement paths | A | HIGH | KEEP |
| `adhdice_clean_tasks` | `user_id` | Row owner | Inserts and guarded updates | Every scoped Task/child/reward query | A | HIGH | KEEP |
| `adhdice_clean_tasks` | `parent_task_id` | Same-table hierarchy parent; null means top-level in current code | Task creation/editor/legacy promotion/hierarchy actions | Hierarchy, Paths, milestones, achievements, views, rewards | A/F | MEDIUM | RENAME / CLARIFY |
| `adhdice_clean_tasks` | `revision` | Row-wide optimistic-concurrency integer | Trigger `adhdice_clean_tasks_bump_revision()` and compatibility writes | `task-db-mutations.ts`, rollover plan guards, conflict handling | E | HIGH | RENAME / CLARIFY |
| `adhdice_clean_tasks` | `title`, `notes`, tags, priority, energy, estimates, links | User-controlled descriptive/configuration metadata | CRUD/editor/batch/import | All Task surfaces and reports | A | HIGH | KEEP |
| `adhdice_clean_tasks` | `status` | Simultaneously stored status, active-status projection, lifecycle label, editor value, bucket input, and compatibility fallback | CRUD, action/history adapters, rollover RPCs, reward finalizer, editor/batch/status actions | Engine adapter, TaskApp, Table/List/Home/Paths/Smart Lists, rewards, archive/trash | F/C/D | LOW for authority | PROJECTION ONLY |
| `adhdice_clean_tasks` | `due_on` | One-time due date, moving rolling cursor, fixed active cursor, Delay target, legacy recurrence anchor, and status input depending on caller | CRUD/editor/history sync, engine projection, rollover RPCs, reward finalizer, repair SQL | Recurrence helpers, engine adapter, Calendar, due displays, editors, rollover, rewards | F | LOW | PROJECTION ONLY |
| `adhdice_clean_tasks` | `active_status_logical_date` | Active-status origin/cache; intended to track In Progress in some paths | `applyTaskActiveStatusTracking()`, engine projection, rollover RPCs | Engine adapter, stale In Progress rollover, active-status helpers | F/C | LOW | MOVE |
| `adhdice_clean_tasks` | `active_occurrence_due_on` | Active occurrence date/cache, In Progress metadata, History metadata source, and timer identity input | Active-status tracking, engine projection, rollover RPCs, compatibility paths | Engine adapter, History metadata, timers, repair/shadow, status paths | F/C | LOW | PROJECTION ONLY |
| `adhdice_clean_tasks` | `scheduled_on` | Separate scheduled-date field used by older/task-list adapters; its relationship to `due_on` is not one canonical meaning | CRUD/editor/import/legacy promotion | Task adapters, list displays, derived models | F | UNKNOWN | RETIRE AFTER MIGRATION |
| `adhdice_clean_tasks` | `due_time` | Within-day time field used by legacy status/display logic; not a logical-day occurrence identity | CRUD/editor | Legacy recurrence/status helpers and display | F | LOW | RENAME / CLARIFY |
| `adhdice_clean_tasks` | `repeat_frequency` | Repeat family selector, including `none`, daily, weekly, monthly, custom, and Daily Until Complete | CRUD/editor/batch/import, legacy promotion, rollover compatibility | Both recurrence families, engine adapter, Calendar, reward finalizer, RPCs | A/F | MEDIUM | MOVE |
| `adhdice_clean_tasks` | `repeat_interval` | Repeat interval | CRUD/editor/batch/import and SQL-compatible paths | Engine and legacy recurrence/RPCs | A | MEDIUM | MOVE |
| `adhdice_clean_tasks` | `repeat_days_of_week` | Fixed weekday set | CRUD/editor/batch/import | Engine, legacy recurrence, monthly/weekly RPCs | A | MEDIUM | MOVE |
| `adhdice_clean_tasks` | `repeat_day_of_month` | Monthly day rule | CRUD/editor/import | Engine, legacy recurrence, RPCs | A | MEDIUM | MOVE |
| `adhdice_clean_tasks` | `repeat_monthly_mode` | Monthly day/ordinal-weekday discriminator | CRUD/editor/import and patches | Engine, legacy recurrence, RPCs | A | MEDIUM | MOVE |
| `adhdice_clean_tasks` | `repeat_monthly_ordinal`, `repeat_monthly_weekday` | Monthly ordinal-weekday rule | CRUD/editor/import and patches | Engine, legacy recurrence, RPCs | A | MEDIUM | MOVE |
| `adhdice_clean_tasks` | `subtasks_auto_reset` | Recurring-child reset preference; currently also reachable from reward finalization | Editor/settings/batch | Reward finalizer and Task hierarchy | A/F | MEDIUM | RENAME / CLARIFY |
| `adhdice_clean_tasks` | `completed_at` | Completion timestamp, active-status projection, and compatibility lifecycle marker | Complete flow, editor/batch/status paths, rollover/finalizer, engine projection | Complete flow, reports, achievements, projections, UI | F/C | LOW for terminal authority | ADD CANONICAL REPLACEMENT |
| `adhdice_clean_tasks` | `trashed_at` | Timestamp associated with reversible Trash | CRUD/editor/trash paths | Trash helpers, Home/Paths/On-Time/views | A/F | MEDIUM | ADD CANONICAL REPLACEMENT |
| `adhdice_clean_tasks` | `created_at`, `updated_at` | Row timestamps; `updated_at` is not a semantic event identity | Database defaults/triggers and all updates | Freshness comparisons, adapters, UI | E/C | HIGH for timing only | KEEP |

The current Task row lacks a durable recurrence anchor, schedule-boundary history, explicit terminal/container axes, a stable occurrence ledger, or a canonical workflow fact. It also makes row revision cover unrelated metadata and projections.

### 2.2 History and occurrence-adjacent storage

| Table / boundary | Field | Current meaning | Actual writers | Actual readers | Classification | Trust | Target disposition |
|---|---|---|---|---|---|---|---|
| `adhdice_task_history` | `id` | Row identity; also consumed by achievement source capture | Database insert, direct History upsert, rollover RPCs | History, achievements, duration evidence | A/E | HIGH | KEEP |
| `adhdice_task_history` | `task_id`, `user_id` | Entity and owner references | Direct History writes/RPCs | All scoped History/reward/achievement queries | A | MEDIUM; owner consistency is not composite | RENAME / CLARIFY |
| `adhdice_task_history` | `entry_date` | Explicit logical date | History actions, rollover, reward compatibility | Deduplication, Calendar, stats, engine, rewards | A | HIGH | RENAME / CLARIFY |
| `adhdice_task_history` | unique `(user_id, task_id, entry_date)` | One current row per entity/logical date | Database constraint | History upsert/delete and all readers | A/E | HIGH | KEEP |
| `adhdice_task_history` | `occurrence_key` | Optional occurrence identity; current trigger/RPCs use incompatible forms such as `occurrence:YYYY-MM-DD` | History metadata builders, trigger, engine rollover, legacy reconciliation | Engine, repair/shadow, Calendar, duration, achievements | F/D | LOW | ADD CANONICAL REPLACEMENT |
| `adhdice_task_history` | `occurrence_due_on` | Occurrence origin date when present; often inferred from moving Task fields | History builders, trigger, rollover, duration evidence | Engine replay, repair, achievements, rewards | F/D | LOW | RENAME / CLARIFY |
| `adhdice_task_history` | `status` | Explicit outcome, calculated/automatic Missed artifact, and terminal event value | History actions, automatic Missed reconciliation, both rollover RPC families | Engine adapter, stats, Calendar, achievements, rewards | F/D | LOW for provenance | RENAME / CLARIFY |
| `adhdice_task_history` | `event_type` | `status` or `completed_permanently` discriminator | History inserts and completion flow | Complete/History labels and adapters | F | MEDIUM | RENAME / CLARIFY |
| `adhdice_task_history` | `counted_as_due_occurrence` | Denormalized due-opportunity interpretation | Engine rollover, compatibility writers, imports | Legacy stats/reward/repair paths | B/C/D | LOW | PROJECTION ONLY |
| `adhdice_task_history` | `was_completed` | Denormalized completion interpretation | History writers, trigger/RPCs | Saved stats, duration evidence, rewards, achievements | B/C/D | LOW | PROJECTION ONLY |
| `adhdice_task_history` | `created_at`, `updated_at` | Row freshness/order timestamps | Defaults/updated-at trigger | Deduplication and audit-like readers | E/C | MEDIUM | KEEP |
| `adhdice_task_history` | RLS and direct upsert/delete boundary | User-scoped CRUD, not a command transaction | `useTaskHistoryActions` and authenticated clients | History callers | E/D | MEDIUM | RETIRE AFTER MIGRATION |
| `adhdice_task_actual_time_entries` | `occurrence_key`, `occurrence_due_on`, completion link | Duration evidence linked to a History row | Timer/manual evidence writers and linking triggers | Duration statistics/reports | D | MEDIUM | RENAME / CLARIFY |
| `adhdice_task_active_timers` | timer `occurrence_key`, `occurrence_due_on` | Timer/session evidence, not Task outcome | Timer hooks | Timer UI and duration evidence | E/D | MEDIUM | KEEP |

Current History is physically one-row-per-date, but it does not distinguish explicit user outcome from legacy automatic Missed well enough to be the final migration-safe authority when both exist for one date.

### 2.3 Hierarchy storage

| Table / field | Current meaning | Actual writers | Actual readers | Classification | Trust | Target disposition |
|---|---|---|---|---|---|---|
| `adhdice_clean_tasks.parent_task_id` | Same-table child relationship used by current Task hierarchy | Task child creation, editor, movement, imports | Hierarchy, Paths, milestones, achievements, rewards | A/F | MEDIUM | RENAME / CLARIFY |
| `adhdice_task_subtasks` row | Older separate Step/Subtask storage with its own status and nesting | `useTaskSubtaskActions`, legacy promotion | Subtask UI, reward claim compatibility, legacy promotion | D/F | MEDIUM | LEGACY ONLY |
| `adhdice_task_subtasks.status` | Separate child status authority | Subtask actions and recurring reset | Child UI and reward candidates | F/D | LOW | RETIRE AFTER MIGRATION |
| `adhdice_task_subtasks.parent_subtask_id` | Legacy child nesting | Subtask actions | Legacy hierarchy and promotion | D | MEDIUM | LEGACY ONLY |
| `adhdice_legacy_subtask_promotions` | Mapping from old subtask to promoted same-table Task | Legacy promotion | Migration/compatibility readers | E/D | HIGH as mapping evidence | KEEP |
| `adhdice_task_subtasks.sort_order`, title, timestamps | Legacy child metadata | Subtask actions | Legacy child UI/promotion | D | MEDIUM | LEGACY ONLY |

The target uses one canonical Task Entity identity for Parent, Step, and Substep reward/history semantics. Existing separate subtasks are migration input, not a second long-term state authority.

### 2.4 Profile, logical-day, and rollover storage

| Table / boundary | Field | Current meaning | Actual writers | Actual readers | Classification | Trust | Target disposition |
|---|---|---|---|---|---|---|---|
| `adhdice_user_profiles` | `timezone` | User timezone used by TaskApp, legacy SQL, achievements, and some defaults | Profile settings save and profile setup | `logical-day.ts`, TaskApp, engine callers, RPCs, achievements | A/F | MEDIUM due to multiple fallbacks | KEEP |
| `adhdice_user_profiles` | `day_start_time` | User logical-day boundary, stored as text | Profile settings save and profile setup | TaskApp, logical-day helpers, RPCs, achievements | A/F | MEDIUM | RENAME / CLARIFY |
| `adhdice_user_profiles` | `updated_at` | Profile freshness timestamp; no monotonic semantic settings revision | Profile trigger and profile updates | Profile hydration and settings UI | E/C | MEDIUM | ADD CANONICAL REPLACEMENT |
| browser local storage logical-day settings | Local mirror/fallback of timezone/day-start | `saveLogicalDaySettings()` | `logical-day.ts`, TaskApp startup | D/C | LOW | LEGACY ONLY |
| `adhdice_task_rollover_ledger` | `(user_id, logical_date)` | Server coordination gate for one rollover date | Legacy rollover RPC | Legacy RPC | E | MEDIUM | RETIRE AFTER MIGRATION |
| `task-rollover-gate.ts` localStorage key | User/date/timezone/day-start client gate | TaskApp rollover | TaskApp rollover | E/D | LOW across tabs/devices | LEGACY ONLY |
| `TaskRolloverSingleFlightCoordinator` | In-flight de-duplication in one runtime | TaskApp/coordinator | TaskApp | E | HIGH within one runtime only | LEGACY ONLY |
| `adhdice_apply_task_state_engine_rollover` | Client plan application with Task revision checks and History date uniqueness | TaskApp RPC call | TaskApp/server | E/F | UNKNOWN deployment | RETIRE AFTER MIGRATION |
| `adhdice_reconcile_task_rollover` | Legacy server business transition from `due_on`, including automatic Missed and stale In Progress DMB | TaskApp fallback | TaskApp/server | F/D | UNKNOWN deployment | LEGACY ONLY |

### 2.5 Reward, economy, and achievement storage

| Table / boundary | Field or identity | Current meaning | Actual writers | Actual readers | Classification | Trust | Target disposition |
|---|---|---|---|---|---|---|---|
| `adhdice_user_profiles` | `level`, `xp`, `points`, `tokens`, `free_roll_bank` | Mutable economy balances | Pending reward claim RPC, roll RPCs, Health/Focus reward RPCs, compatibility economy hook | HUD/economy surfaces | C/E | HIGH for balance, not Task entitlement | KEEP |
| `adhdice_task_events` | `event_type`, Task reference | Older task economy/event audit (`completed`, `missed`, `streak_bonus`) | Compatibility economy paths | Economy/report readers | D | LOW | LEGACY ONLY |
| `adhdice_point_ledger` | `delta`, `source`, `ref_id` | Append-only economy balance audit | Roll/reward/Focus/Health RPCs and helpers | Economy/audit readers | E | HIGH for economy, not Task truth | KEEP |
| `adhdice_task_reward_claims` | task/subtask/date unique keys | Current date claim/entitlement approximation | Pending reward claim RPC and `useEconomy.commitTaskReward()` | `useTaskRewardController.loadEligibleCandidates`, economy hook | E/F/D | MEDIUM | ADD CANONICAL REPLACEMENT |
| `adhdice_task_reward_claims` | `reward_roll_id`, `awarded_token` | Link to a later reward roll and token marker | Pending claim RPC/economy hook | Reward/economy | E/D | MEDIUM | PROJECTION ONLY |
| `adhdice_task_reward_rolls` | reward date, streak, roll breakdown | Bank/roll record, not canonical success event | Pending reward claim RPC/economy hook | Reward history | E | HIGH for existing roll evidence | KEEP |
| `adhdice_pending_reward_dice` | `pending_dice`, `revision` | Aggregate pending bank balance | Award/claim RPCs | HUD/reward controller | E/C | HIGH for balance | KEEP |
| `adhdice_pending_reward_dice_operations` | `operation_id`, request/result payload | Idempotent pending-dice award/claim operation | Award/claim RPCs | Reward controller and RPC replay | E | HIGH for operation replay | RENAME / CLARIFY |
| `adhdice_pending_reward_dice_items` | source operation/index, dice count, claimed operation | Stable pending queue item in current economy flow | Award/claim RPCs | Reward queue/claim RPCs | E | HIGH for downstream item evidence | KEEP |
| `adhdice_roll_history` | `operation_id`, `reward_applied`, roll result | Idempotent paid/free roll and reward application | `adhdice_execute_roll()` | Roll/economy UI | E | HIGH for roll effect, not Task entitlement | KEEP |
| `adhdice_achievement_occurrences` | source History row, source occurrence key, dedupe key | Downstream achievement source/evaluation identity | History trigger and achievement RPCs | Achievement evaluator/progress | E/D | MEDIUM due to automatic History source | RENAME / CLARIFY |
| `adhdice_achievement_evaluation_runs` | `(user_id, operation_id)`, status/version | Idempotent downstream evaluation run | Achievement RPCs | Achievement retry/evaluation | E | HIGH | KEEP |
| achievement awards/notifications | Award and delivery state | Downstream permanent award/effect records | Achievement RPCs | Achievement UI | E/D | HIGH for achievement effect | KEEP |

Current reward claims approximate “has this Task/date been rewarded,” but they do not durably bind the entitlement to a canonical successful event, program version, stable entity identity, or a retryable grant before banking.

## 3. Target persistence principles

The following principles are locked from Phases 1A–1C:

- A canonical fact required to reconstruct Task truth survives reload without React state, local storage, calculated status, `due_on`, pending dice, or rollover execution.
- Derived state is calculated from canonical facts and `LogicalDayContext`. It may have a rebuildable cache, never a higher authority.
- Explicit History is a durable fact. Calculated Missed is not ordinary explicit History.
- A schedule boundary is durable evidence that a schedule definition changed from a logical date forward.
- `scheduledDueOn`, `effectiveDueOn`, and History `logicalDate` are independent values.
- Provenance is part of the fact contract, especially for explicit user actions, legacy automatic Missed, schedule boundaries, Calendar overrides, lifecycle corrections, and reward consumption.
- Durable uniqueness, revision guards, and command identities are required anywhere duplicate state or economy effects matter.
- Rollover is coordination and projection/effect reconciliation. It is not the creator of chronology.
- Stored projections are deterministic, replaceable, and repairable. Projection repair cannot create History or rewards.
- Canonical facts are scoped to one owner and one explicit Task Entity. Parent, Step, and Substep are independent entities unless an explicit future hierarchy command says otherwise.

## 4. Canonical Task configuration storage

### TARGET

Use one canonical `task_entity` row for stable identity, owner, hierarchy, content metadata, and current lifecycle/container/workflow facts. Store schedule definitions in immutable effective-dated `task_schedule_boundary` rows. A Task may have one initial boundary and later boundary snapshots.

The canonical schedule discriminator is explicit:

```text
schedule_model = unscheduled | one_time | rolling | fixed
```

The boundary snapshot also carries:

```text
repeat_frequency       = none | daily | weekly | monthly | custom | daily_until_complete
repeat_interval        = positive integer
repeat_days_of_week    = selected weekday set
repeat_day_of_month    = 1..31 when applicable
repeat_monthly_mode    = day_of_month | ordinal_weekday
repeat_monthly_ordinal = first | second | third | fourth | last when applicable
repeat_monthly_weekday = weekday when applicable
one_time_due_on        = date when schedule_model = one_time
anchor_date            = stable recurrence anchor when membership needs it
due_time               = optional within-day presentation/validation constraint
```

The Task Entity row retains descriptive metadata such as title, notes, tags, priority, energy, estimates, list placement, and hierarchy. It does not retain recurrence configuration as the only canonical copy. A current schedule-boundary ID may be a pointer/cache, but historical replay reads boundary rows by effective date.

### WHY

An explicit discriminator prevents `no due + no Repeat`, one-time, rolling, and fixed schedules from being confused. Full boundary snapshots make historical replay deterministic without interpreting the latest Repeat over the past. Keeping content and current lifecycle on the entity row avoids a table for every UI field.

### CURRENT GAP

Repeat fields are on `adhdice_clean_tasks`; `due_on` is overloaded; `scheduled_on` and `due_time` have inconsistent meanings; no stable anchor or schedule-boundary stream exists.

### MIGRATION IMPACT

Phase 1D-2 must classify each legacy Task into a schedule model, recover or mark anchor confidence, and create an initial boundary without claiming that moving `due_on` was always the historical anchor.

## 5. Recurrence anchor persistence

### TARGET

Persist `anchor_date` and its provenance on the applicable initial/current schedule-boundary snapshot. The anchor is the stable schedule basis, normally a logical date from which rolling cadence or fixed-calendar phase is evaluated. It is not the latest success date, current effective cursor, Calendar display date, or `due_on` projection.

Each anchor carries:

- `anchor_date`;
- `anchor_kind` such as user_selected, first_schedule_boundary, reconstructed, or unknown;
- `anchor_confidence` such as proven, high_confidence, ambiguous, or unavailable;
- `anchor_source_command_id` or migration provenance; and
- the schedule-boundary sequence that made it authoritative.

Editing Repeat or a due date creates a new forward boundary. It does not silently mutate prior anchors. A new schedule boundary may establish a new anchor for the new schedule definition, but the old boundary and anchor remain replayable. Delay never changes the anchor.

### WHY

Phase 1A established that a stable anchor is not recoverable for every legacy Task and that `due_on` historically acts as a moving cursor. Explicit provenance prevents an inferred anchor from becoming false historical fact.

### CURRENT GAP

Weekly/monthly legacy adaptation uses `due_on` as `anchorDate`; rolling Tasks have no generally persisted stable anchor.

### MIGRATION IMPACT

Ambiguous legacy anchors remain explicitly ambiguous until later policy; migration must not invent one merely to satisfy a non-null column.

## 6. Schedule-boundary storage

### TARGET

Use **immutable versioned schedule-boundary snapshots**. This is the recommended form of option B, with each row also serving as the auditable boundary event. Do not maintain a mutable “current schedule” row as the historical authority.

Conceptual fields:

| Field | Meaning |
|---|---|
| `boundary_id` | Stable boundary identity. |
| `user_id`, `entity_id`, `entity_kind` | Owner and Task Entity scope. |
| `effective_from_logical_date` | First logical date governed by this snapshot. |
| `boundary_sequence` | Strict per-entity order; used for replay and stale-command checks. |
| `boundary_type` | `initial`, `due_date_change`, `repeat_change`, `delay`, `correction`, or `reopen`. |
| `schedule_model` | Explicit `unscheduled`, `one_time`, `rolling`, or `fixed`. |
| recurrence fields | Full new recurrence/configuration snapshot, not only a patch. |
| `anchor_date`, anchor provenance/confidence | Stable basis for this schedule definition. |
| `prior_boundary_id` | Previous authoritative boundary, when one exists. |
| `affected_occurrence_id` | Optional occurrence targeted by a Delay/current-occurrence override. |
| `logical_day_context_identity` | Context under which the boundary was accepted. |
| `actor_kind`, `actor_id`, `source` | User, authorized automation, import, or migration provenance. |
| `command_id`, `idempotence_identity` | Accepted command and retry identity. |
| `created_at`, `updated_at`, `revision` | Timing and concurrency evidence. Immutable rows are superseded by later rows, not edited in place. |

A Delay boundary carries the unchanged Repeat/anchor snapshot plus `affected_occurrence_id`; its moved effective date lives in the occurrence override store. This keeps “schedule definition changed” distinct from “one occurrence moved.”

### WHY

Replay can select the boundary with the greatest sequence/effective date not after the requested logical date. Full snapshots prevent a historical read from guessing which fields a partial patch left unchanged. Immutable rows preserve later boundaries during rolling historical correction.

### CURRENT GAP

Due-date, Repeat, and Delay changes are distributed across generic Task updates, editor/history hooks, legacy helpers, and RPCs. No common boundary identity or historical schedule snapshot exists.

### MIGRATION IMPACT

The backfill must produce a base boundary and classify later schedule changes only where source evidence identifies their effective date. Unknown boundary history must remain a migration diagnostic.

## 7. Manual Calendar override storage

### TARGET

Use a separate `task_calendar_override` fact store with one active row per `user_id + entity_id + logical_date`.

Conceptual fields:

```text
override_id
user_id, entity_id, entity_kind
logical_date
override_state = unscheduled | not_due | due_open
reason
provenance_kind = manual | authorized_repair | migration
actor_id, command_id, idempotence_identity
revision
is_active / cleared_at / cleared_by_command_id
created_at, updated_at
```

Create and replace operate on the one active fact. Clear deactivates/removes the active override and records the clearing command; it does not create a History row. Uniqueness applies to active overrides, not to old cleared evidence.

### WHY

Calendar scheduling state and explicit outcome answer different questions. A manual `Not Due` correction must not become fake Missed/Done History or mutate Repeat.

### CURRENT GAP

Calendar editing primarily routes through outcome-style History writes. No target override store exists.

### MIGRATION IMPACT

Existing History rows cannot be reclassified as overrides without evidence. Migration must preserve them as History and only create override facts from explicit source evidence.

## 8. Explicit History storage

### TARGET

Use one authoritative current `task_history_fact` per entity and logical date. It is a replaceable fact row, not an append-only universal event stream; command evidence records replacements and clears.

Conceptual fields:

| Field | Meaning |
|---|---|
| `history_id` | Stable row identity. |
| `user_id`, `entity_id`, `entity_kind` | Owner and Task Entity. |
| `logical_date` | Explicit outcome date; unique per entity. |
| `outcome` | `done`, `did_my_best`, `missed`, `delayed`, or `complete`. |
| `event_kind` | Explicit outcome, terminal completion, Delay audit, correction, or authorized automation. This replaces overloaded `event_type`. |
| `occurrence_id`, `occurrence_key` | Referenced origin when safe. |
| `scheduled_due_on` | Immutable occurrence origin date, nullable only when no safe identity exists. |
| `effective_due_on` | Effective target for Delay or another explicit effective-date fact. |
| `schedule_boundary_id` | Boundary governing the event/occurrence interpretation. |
| `recurrence_source_fingerprint` | Rule/anchor evidence used when the event was accepted. |
| `provenance_kind`, `actor_kind`, `actor_id`, `source` | User, authorized automation, import, or explicitly authorized repair. |
| `logical_day_context_identity`, timezone/day-start snapshot | Context under which the command was accepted. |
| `revision` | Per-row optimistic concurrency revision. |
| `last_command_id`, `idempotence_identity` | Mutation/replay evidence. |
| `replaced_history_id` / predecessor reference | Optional correction lineage. |
| `created_at`, `updated_at` | Fact timing. |

The unique identity is `(user_id, entity_id, logical_date)`. `status` becomes `outcome`; current `event_type` becomes a narrow `event_kind` only where terminal/audit distinction is required. `counted_as_due_occurrence` and `was_completed` are derived compatibility projections, not policy authority.

An explicit Missed command is a user/authorized fact. Calculated Missed has no History row. Legacy automatic Missed is not inserted into the canonical explicit store during ordinary evaluation.

### WHY

One authoritative explicit outcome per entity/date gives replacements and clears precise semantics. Occurrence and effective-date evidence survives reload without conflating “what happened on this date” with “what obligation remains.”

### CURRENT GAP

The current row is one-per-date, but direct hooks, legacy reconciliation, and rollover all write it. Automatic Missed can occupy the same row as explicit facts, occurrence keys vary, and provenance is not durable enough to distinguish authority.

### MIGRATION IMPACT

Phase 1D-2 must classify current rows as explicit, legacy automatic, or ambiguous and preserve conflicting legacy evidence before any canonical explicit row is selected.

## 9. Occurrence identity storage

### TARGET

Use a materialized-on-demand `task_occurrence_fact` row with a UUID surrogate plus the deterministic natural key:

```text
occurrence_key = task:{entityId}:occurrence:{scheduledDueOn}
```

Conceptual fields:

```text
occurrence_id
user_id, entity_id, entity_kind
occurrence_key                  unique per user/entity
scheduled_due_on                immutable origin date
source_boundary_id
recurrence_source_fingerprint
origin_kind = proven | reconstructed | legacy_ambiguous
origin_confidence
origin_provenance
resolution_state = unresolved | resolved | superseded
resolved_logical_date, resolved_outcome, resolved_history_id
revision, created_at, updated_at
```

Rows are created when an occurrence is a canonical fact: explicit outcome, Delay, historical correction, occurrence resolution, or necessary audit evidence. The system does not create rows for every projected future fixed date. A UUID makes foreign-key references stable; the deterministic key makes replay and legacy comparison inspectable.

If a future product permits multiple independent obligations on one scheduled date, the natural key must gain a deterministic discriminator such as `occurrence_ordinal`; the current product does not require it.

### WHY

The UUID supports durable references and correction lineage while the natural key preserves the Phase 1A identity contract. Materialization avoids turning Calendar projection into a table of hypothetical future facts.

### CURRENT GAP

Current History may hold `occurrence_key` and `occurrence_due_on`, but identity can be absent, stale, or use the wrong string form. `active_occurrence_due_on` and `due_on` are not stable occurrence identities.

### MIGRATION IMPACT

Migration must assign proven versus reconstructed confidence and route ambiguous rows to legacy evidence rather than silently assigning a false occurrence.

## 10. Effective due and Delay persistence

### TARGET

Use an append-only `task_occurrence_effective_override` store keyed by `occurrence_id`. It records one effective-date change per accepted Delay/correction boundary; the current effective date is the latest applicable override under boundary order.

Conceptual fields:

```text
override_id
user_id, entity_id, occurrence_id
scheduled_due_on                copied immutable check value
effective_due_on                deferred target; strictly after action logical date
action_logical_date
delay_kind = delay | correction
prior_override_id
schedule_boundary_id
history_id                      Delayed audit History when required
provenance_kind, actor_kind, actor_id, source
command_id, idempotence_identity
revision, created_at, updated_at
```

`effective_due_on` is never written back as a replacement for `scheduled_due_on`. For an undelayed occurrence, effective date is derived as scheduled date. Repeated Delay creates a new boundary/override fact; it does not mutate the origin row or create a new origin.

### WHY

Delay must survive reload, historical correction, and same-date collision while preserving the original occurrence identity. A separate override is more precise than overloading a schedule boundary or `due_on`.

### CURRENT GAP

Current Delay is represented by status and a moving `due_on` projection; current History has no durable scheduled/effective pair or stable Delay boundary.

### MIGRATION IMPACT

Only Delay evidence with a safe origin can be backfilled as canonical overrides. Ambiguous `status=delayed` plus `due_on` remains compatibility evidence pending classification.

## 11. Same-Task effective-obligation merge

### TARGET

Do not persist a redundant merged-obligation row. Derive an `EffectiveObligation` grouping by:

```text
same entity
+ same effectiveDueOn
+ active boundary/override validity
```

The grouping contains references to all contributing immutable `occurrence_id` values, including a normal fixed origin and a delayed origin. It has one effective date, one user-facing outcome, one streak contribution, and one reward entitlement identity. It is a read/result object, not a canonical fact.

Resolution updates each contributing occurrence’s resolution evidence in the same canonical command transaction, or records one resolution group reference in the command result where the occurrence ledger supports it. It never creates a second outcome per origin.

### WHY

Origin rows plus effective overrides already contain the complete provenance. A merged row would duplicate derived grouping and could become a second authority.

### CURRENT GAP

Current storage has no stable origin/effective model or grouping identity; fixed Delay collision behavior exists only in the target semantics.

### MIGRATION IMPACT

No historical merged rows are needed. Migration must preserve both origins and derive the grouping after origin/override classification.

## 12. Lifecycle, container, and workflow storage

### TARGET

Store current lifecycle/container facts on the canonical Task Entity row, because they are current authoritative eligibility facts and are always read with the entity:

```text
terminal_state       = active | permanently_complete
container_state      = active | archived | trashed
prior_container_state = active | archived, required while trashed
completed_at         = terminal transition timestamp, nullable
trashed_at           = current Trash transition timestamp, nullable
canonical_revision
```

Store the independent workflow fact on the same row for the current one-session-per-entity product model:

```text
workflow_state       = none | in_progress
workflow_started_at
workflow_logical_date
workflow_occurrence_id, nullable
workflow_command_id
workflow_revision
```

A future multi-session product may split workflow into a child table, but it is not required now. Archive/Trash transitions clear active workflow as part of the same canonical mutation and preserve `prior_container_state` for Trash restore. The command ledger preserves transition provenance; a universal lifecycle event stream is not required.

### WHY

Current lifecycle axes are current state facts, not projections. Keeping them on the entity avoids separate tables without conflating them with schedule status. Workflow fields are a small orthogonal fact and must survive refresh when the product requires it.

### CURRENT GAP

Current `status`, `completed_at`, `trashed_at`, active fields, and archive-like UI rules distribute lifecycle meaning. Trash does not have durable prior-container evidence, and In Progress is encoded through status/active fields.

### MIGRATION IMPACT

Migration must map `complete`, `archived`, `trashed`, and timestamps conservatively. A Trash restore with no proven prior container must fail safe rather than infer `active`.

## 13. Complete persistence and atomicity

### TARGET

Complete is represented by two canonical facts in one Task command transaction:

1. `task_history_fact(outcome=complete, event_kind=terminal_complete)` for the command logical date; and
2. `task_entity.terminal_state=permanently_complete`, with the applicable occurrence resolution and workflow termination.

The command ledger records the accepted command and both fact references. The entity’s terminal timestamp is a projection of the terminal lifecycle transition or a canonical lifecycle timestamp, not proof by itself. A later reopen is an explicit correction command with a new command identity and revision proof.

### WHY

Complete is both an explicit successful History outcome and a terminal lifecycle fact. One without the other would make reload reconstruction contradictory. Archive is not proof of Complete.

### CURRENT GAP

Complete currently spans History `status/event_type`, `completed_at`, stored `status=complete`, and archive-like visibility. The engine action patch does not own every lifecycle field.

### MIGRATION IMPACT

Phase 1D-2 must reconcile Complete History, `completed_at`, and status combinations without deleting later contradictory History or silently reopening recurrence.

## 14. Archive, Trash, and restore evidence

### TARGET

Archive changes only `container_state` to `archived`. Trash changes `container_state` to `trashed` and stores `prior_container_state` at the transition. Restore reads that proven field; it does not guess from status, `trashed_at`, or `due_on`.

Both transitions preserve schedule boundaries, History, occurrence facts/overrides, terminal completion, and reward evidence. They create no inactive-time History and no reward. Archive/Trash do not downgrade `permanently_complete`.

If `prior_container_state` is missing or contradictory, restore returns `needs_explicit_resolution` and keeps the safest inactive state. Hard delete is a separate destructive operation.

### WHY

Direct prior-container evidence is the smallest safe restore contract. Command evidence remains available for audit but should not be required to replay every lifecycle event.

### CURRENT GAP

Current Trash is mainly `status=trashed` plus `trashed_at`; restore evidence is inferred by UI/legacy rules. Archive and Complete overlap through status strings.

### MIGRATION IMPACT

Legacy Trash rows without reliable prior container require an ambiguity classification. No restore default is authorized by this phase.

## 15. In Progress workflow persistence

### TARGET

Persist `workflow_state`, `workflow_logical_date`, `workflow_started_at`, optional `workflow_occurrence_id`, `workflow_command_id`, and `workflow_revision` on the Task Entity row. `active_status_logical_date` maps only to `workflow_logical_date` when the legacy row proves In Progress; otherwise it is not used as a general logical date. `active_occurrence_due_on` maps to an occurrence only when identity is proven.

In Progress does not resolve recurrence, pause Missed, move `due_on`, create History, or grant a reward. Crossing a logical-day boundary may leave workflow active while the underlying schedule becomes derived Missed.

### WHY

The workflow fact is small, independently meaningful, and must survive reload when required. It should not be a second status authority.

### CURRENT GAP

Current status and active fields encode In Progress, and rollover SQL can convert stale In Progress to automatic Did My Best.

### MIGRATION IMPACT

Only proven active sessions become workflow facts. Stale or impossible active-field combinations become compatibility evidence and diagnostics.

## 16. `due_on` target role

### TARGET

Retain `due_on` temporarily as a guarded effective-obligation projection. Its target meaning is:

```text
current effective due date for the engine-derived active obligation, if one exists
```

It is nullable when no active obligation exists or the Task is terminal/inactive. It is rebuilt from schedule boundaries, occurrence facts, effective overrides, History, lifecycle, overrides, and LogicalDayContext. It is protected by:

- `projection_source_canonical_revision`;
- `projection_source_fingerprint`;
- `projection_version`; and
- expected entity revision on write.

Only the canonical projection boundary may write it during transition. Consumers may display/read it as an optimization but may not use it to reconstruct schedule truth. After all callers converge, it may be retired; the target architecture does not require it.

### WHY

The cursor remains useful for compatibility/query performance, but it cannot represent immutable origin, stable anchor, fixed future membership, or History authority.

### CURRENT GAP

Current readers treat `due_on` as configuration, cursor, anchor, status input, and Delay target.

### MIGRATION IMPACT

Backfill can populate a projection only after canonical schedule/occurrence reconstruction. A stale or ambiguous `due_on` cannot block canonical data creation or be silently promoted.

## 17. `Task.status` target role

### TARGET

Keep `status` only as a compatibility/display/query projection during transition. It may expose a single display bucket for legacy consumers, but it must be generated from:

```text
terminal_state + container_state + derived active schedule state + workflow overlay
```

It must not be read as a composite canonical axis. A later target may replace it with named projections (`display_status`, `container_state`, `active_schedule_status`) or remove it after all readers converge. The recommended final path is to retire the overloaded column rather than preserve it as a second authority.

### WHY

One status enum cannot truthfully represent permanent Complete inside Archive, active Missed plus In Progress, Not Due, Unscheduled, and a trashed-but-restorable Task at once.

### CURRENT GAP

Stored status is consumed by engine fallbacks, UI buckets, Smart Lists, child rows, editor drafts, reward eligibility, rollover, and lifecycle code.

### MIGRATION IMPACT

Migration must classify status values by axis and populate projections only after canonical facts are proven. Legacy readers need a compatibility projection window.

## 18. Reward entitlement persistence

### TARGET

Use a dedicated `task_reward_entitlement` record. Its uniqueness identity is:

```text
user_id + entity_id + logical_date + reward_program_version
```

Conceptual fields:

```text
entitlement_id
user_id, entity_id, entity_kind, logical_date
reward_program_version
canonical_history_id, canonical_command_id, canonical_event_identity
outcome_snapshot = done | did_my_best | complete
effective_obligation_identity, nullable
eligibility_kind = handled_success | authorized_automation
state = pending | fulfilled | blocked
grant_id, nullable
created_at, updated_at, fulfilled_at
```

Only an explicit or authorized canonical `Done`, `Did My Best`, or `Complete` command creates/recognizes the entitlement. Delay, Missed, calculated Missed, In Progress, Archive, Trash, and time passage do not. The unique identity is independent of status name, current cursor, occurrence count, queue position, and retry count. Parent, Step, and Substep use their own canonical `entity_id`.

### WHY

The entitlement is the durable proof that a handled-success reward has been consumed or is still retryable. Current status cannot answer that after reversal or reload.

### CURRENT GAP

Current claims use Task/Subtask/date uniqueness, but lack program version, canonical event binding, effective obligation provenance, and a distinct pre-grant entitlement state.

### MIGRATION IMPACT

Existing claims, pending items, reward rolls, and task History need a classification matrix. Ambiguous old claims cannot be assumed to represent a canonical success without evidence.

## 19. Reward grant, bank, and claim separation

### TARGET

Use separate downstream records:

1. `task_reward_entitlement`: one entity/date/program eligibility proof;
2. `reward_grant`: one stable banked-roll/economy grant linked to that entitlement; and
3. `reward_claim`: later consumption of one stable grant item.

Conceptual grant fields:

```text
grant_id, entitlement_id, user_id
grant_operation_identity
grant_kind = banked_roll
units / dice_count / deterministic payload
state = pending | applied | failed | reconciled
economy_reference
created_at, applied_at, updated_at
```

Conceptual claim fields:

```text
claim_id, grant_id, user_id
claim_operation_identity
state = pending | consumed | failed
consumed_at, economy_reference, created_at, updated_at
```

The entitlement-to-grant relationship is one-to-zero/one. Grant application is idempotent on `grant_operation_identity`; claim consumption is idempotent on `claim_operation_identity` and stable `grant_id`. The queue is a view, never an identity.

### WHY

Task success can commit while banking fails; banking can commit before the user later claims. Separate records make both failure domains retryable without mutating Task chronology.

### CURRENT GAP

Pending dice operations are durable and useful, but current claims are used as both eligibility and effect evidence. Reward rolls and point ledger entries are not consistently bound to a canonical Task event.

### MIGRATION IMPACT

Existing pending items and rolls can be preserved as downstream evidence and linked where operation identity is sufficient. No old economy balance is rewritten by this document.

## 20. Command and idempotence persistence

### TARGET

Use a compact `task_command_operation` ledger for canonical state-changing commands. Recommended conceptual fields:

```text
command_operation_id
user_id, entity_id, entity_kind
command_id
command_type
idempotence_identity
accepted_payload_digest
logical_day_context_identity
requested_logical_date, occurrence_identity
expected_entity_revision, expected_history_revision
expected_relevant_facts_fingerprint
decision = accepted | warning | rejected | needs_explicit_resolution
result_version, result_snapshot_or_fact_references
created_at, completed_at
```

Uniqueness is `(user_id, idempotence_identity)` and separately `command_id` where command IDs are globally unique per user. An identical retry with the same payload digest and proof returns the stored result/fact references. A conflicting payload under the same identity is rejected.

Use a hybrid, not a universal event log:

- command-operation ledger for canonical command replay and result evidence;
- command IDs/provenance on affected canonical facts;
- reward grants/claims for downstream effect idempotence; and
- optional reconciliation-operation entries only when rollover has a justified projection/effect retry.

Do not use browser local storage, a queue index, a status string, or a rollover date ledger as the only idempotence proof.

### WHY

The ledger is the smallest durable mechanism that handles two tabs, network retry, historical replacement, Delay, Complete, lifecycle, and exact result replay without event-sourcing every read or projection.

### CURRENT GAP

Operation IDs exist for pending dice, rolls, achievement evaluation, and rollover coordination, but no command identity spans canonical Task/History facts and reward intent.

### MIGRATION IMPACT

Migration does not invent command identities for every old write. It records legacy provenance and starts durable command identity at the canonical cutover boundary.

## 21. Revision and optimistic concurrency

### TARGET

Use a layered revision strategy:

| Fact | Revision/proof |
|---|---|
| Task Entity | `canonical_revision`; semantic Task/lifecycle/workflow changes increment it. Projection-only repair does not create a new business event. |
| Explicit History | Per-row `revision`; replace/clear requires the expected row revision or absent-row proof. |
| Schedule boundary | Immutable `boundary_sequence` plus expected latest sequence. |
| Calendar override | Per-entity/date `revision`; active replacement/clear requires expected revision. |
| Occurrence fact | Per-occurrence `revision`; resolution and identity changes require expected state. |
| Effective-date override | Immutable sequence and prior-override identity; no in-place semantic rewrite. |
| Reward entitlement | Unique identity plus state revision; grant transition requires expected entitlement state. |
| Command operation | Payload digest, expected proof, and stored result. |
| Profile logical-day settings | Monotonic `settings_revision` on the profile row. |

Commands carry the relevant subset of these proofs plus a facts fingerprint. They do not require one global lock for every Task. A transaction may use narrower entity/date/occurrence locks or uniqueness constraints where required; physical lock syntax belongs later.

### WHY

Narrow revisions prevent stale commands from silently applying to a changed occurrence while avoiding unnecessary global serialization.

### CURRENT GAP

Only `adhdice_clean_tasks.revision` is broadly established. History, boundaries, overrides, occurrence facts, rewards, and profile settings lack a coherent revision contract.

### MIGRATION IMPACT

Existing Task revision can seed entity revision. Missing History/boundary revisions require conservative initial values and ambiguity handling.

## 22. Logical-day configuration persistence

### TARGET

The canonical source remains the user profile’s current `timezone` and `day_start_time`, with a monotonic `settings_revision`. The stored profile value outranks browser timezone and local storage.

Every state-sensitive command stores or references a `LogicalDayContext` identity containing:

```text
user_id + settings_revision + timezone + day_start_time + evaluated logical date
```

Explicit History, schedule boundaries, reward entitlements, and command operations retain the context identity or the necessary timezone/day-start snapshot. This preserves provenance when settings later change. Local storage is an acceleration/fallback for display startup only; it cannot authorize a mutation or outrank the profile.

### WHY

The logical day is a user-scoped boundary, not browser midnight. Context identity prevents an in-flight command from a prior timezone/day-start generation from overwriting a new generation.

### CURRENT GAP

Profile settings are durable, but TaskApp, local storage, engine defaults, and legacy SQL provide multiple fallback paths; some hooks default to UTC/00:00 when context is omitted.

### MIGRATION IMPACT

Old History rows may lack context snapshots. Migration should classify that provenance rather than rewriting logical dates.

## 23. Calculated Missed and streak storage

### TARGET

Do not create canonical rows or counters solely because time passed. Calculated Missed, positive streak, Missed streak, Upcoming, Not Due, Unscheduled, and active display status are derived from canonical facts plus LogicalDayContext.

Optional caches are permitted only with:

```text
projection_source_revision
canonical_fingerprint
projection_version
rebuildable = true
```

Projection repair cannot create History, resolve an occurrence, or create a reward entitlement.

### WHY

Rollover is coordination, and a closed day must remain reconstructable when the app was closed, a timer failed, or a device was offline.

### CURRENT GAP

Effective Timeline calculates Missed without a row, while legacy reconciliation and rollover write automatic Missed rows. Streak caches and saved-row statistics overlap.

### MIGRATION IMPACT

Legacy automatic Missed rows require classification before they are excluded from canonical explicit chronology.

## 24. Legacy automatic Missed representation

### TARGET

Preserve legacy automatic Missed as compatibility evidence in a separate `task_legacy_history_evidence` store, or an explicitly equivalent legacy partition during transition. Conceptual fields:

```text
legacy_evidence_id
source_history_id
user_id, entity_id, logical_date
legacy_outcome
legacy_occurrence_key, legacy_occurrence_due_on
legacy_counted_as_due_occurrence, legacy_was_completed
source_kind = legacy_rollover | legacy_reward_reconciliation | unknown
classification = automatic_missed | explicit_missed | ambiguous
source_patch_or_operation
captured_at, retained_at
```

The canonical explicit History authority ignores `automatic_missed` evidence as a user-authored outcome while using it as migration corroboration. A true explicit user Missed becomes a `task_history_fact` only when provenance is proven. Calculated Missed remains derived and is not copied into either store by ordinary reads.

### WHY

The same Task/date can have an automatic row and a later explicit user outcome. One canonical explicit row cannot preserve both without conflating authority.

### CURRENT GAP

Current automatic and explicit rows share `adhdice_task_history`, and source paths use different provenance conventions or no durable provenance.

### MIGRATION IMPACT

Phase 1D-2 must classify, preserve, and cross-reference old rows before canonical History uniqueness is enforced.

## 25. Canonical transaction boundaries

These are conceptual repository transactions, not SQL instructions.

### SetOutcome recurring success

Atomically commit:

- command identity and expected proof;
- explicit History replacement for the entity/logical date;
- occurrence resolution/effective-obligation transition;
- required schedule/cursor fact changes needed for deterministic reconstruction; and
- workflow termination when the command ends In Progress.

The reward entitlement intent is downstream of the canonical commit. Grant failure does not roll back Task/History.

### Complete

Atomically commit Complete History, terminal lifecycle, applicable occurrence resolution, workflow termination, recurrence termination/boundary, and command evidence. Reward grant is downstream/retryable.

### Delay

Atomically commit Delayed History, occurrence effective-date override, schedule boundary reference, origin/provenance, and command evidence. Delay creates no success entitlement.

### Calendar override

Create/replace/clear the one active entity/date override, its revision, and command evidence atomically. It never writes fake History.

### Archive/Trash/restore

Atomically update container state, prior-container evidence when entering Trash, workflow termination, lifecycle revision, and command evidence. Preserve all History/schedule/occurrence/reward facts.

### Reward effect

Separate transaction/effect domain: entitlement recognition, grant application, bank item creation, and later claim consumption each have stable effect identities and retry state. No reward transaction may mutate Task chronology.

## 26. Security and ownership requirements

Every canonical fact has `user_id` and an owner-consistent `entity_id`. The target physical design should enforce owner consistency through composite foreign-key relationships or repository/RPC checks that are equivalent and non-bypassable.

Required expectations:

- a History, boundary, override, occurrence, workflow, entitlement, grant, and command row cannot reference an entity owned by another user;
- a Parent/Step/Substep entity kind is checked against the canonical entity row, not trusted from a client payload;
- reward grants and claims cannot cross user or entity scope;
- RLS is enabled for every exposed canonical/effect table;
- policies restrict rows to the authenticated owner and include update `WITH CHECK` ownership protection;
- privileged functions verify `auth.uid()` and never accept a client-supplied owner as authority;
- achievement consumers receive canonical source identity but cannot mutate Task facts; and
- generated database types are derived from the final schema later, not hand-edited during this phase.

No RLS SQL is written here.

## 27. Delete, cascade, and retention behavior

Hard delete remains separate from Trash. Target referential behavior is:

- Task Entity deletion removes or archives Task-detail facts only according to a later retention policy;
- History, boundaries, Calendar overrides, occurrence facts, workflow facts, and projections may cascade with the Task if product retention permits;
- reward entitlements, grants, claims, point ledger rows, roll history, and achievement source/effect records are economic/audit facts and should not be assumed to cascade merely because the Task row is deleted;
- references from reward/economy/achievement records to deleted Task detail should use retained identity/snapshot or a restricted delete policy;
- legacy promotion mappings may cascade with legacy rows only after migration ownership is complete; and
- no retention period, legal hold, or irreversible cascade is selected by Phase 1D-1.

The unresolved retention choice is an operational/storage-policy decision for a later phase. It is not a reason to use Trash as a substitute for hard delete.

## 28. Canonical target schema / ER diagram

```text
USER_PROFILE
  user_id PK
  timezone, day_start_time, settings_revision
        |
        | owner-scoped
        v
TASK_ENTITY
  entity_id PK, user_id FK, entity_kind, parent_entity_id
  content metadata
  terminal_state, container_state, prior_container_state
  workflow_state, workflow date/start/occurrence
  canonical_revision, projection metadata
        |
        +------------------------------+
        |                              |
        v                              v
TASK_SCHEDULE_BOUNDARY             TASK_COMMAND_OPERATION
  boundary_id PK                    command/replay proof
  effective logical date            payload/proof/result
  full schedule snapshot
  stable anchor
        |
        +------------------------------+
        |                              |
        v                              v
TASK_OCCURRENCE_FACT              TASK_CALENDAR_OVERRIDE
  occurrence_id PK                 entity/date active override
  natural occurrence_key           one active per entity/date
  scheduledDueOn                    unscheduled/not_due/due_open
  source/provenance
  resolution evidence
        |
        v
TASK_OCCURRENCE_EFFECTIVE_OVERRIDE
  occurrence origin -> effectiveDueOn
  Delay boundary/provenance
        |
        +------------------------------+
        |                              |
        v                              v
TASK_HISTORY_FACT                  TASK_REWARD_ENTITLEMENT
  one explicit outcome/entity/date  one entity/date/program
  outcome/provenance/occurrence     canonical event binding
        |                              |
        | downstream                    v
        |                         REWARD_GRANT
        |                              |
        |                              v
        |                         REWARD_CLAIM
        v
ACHIEVEMENT SOURCE/EVALUATION      ECONOMY LEDGER / BANK / ROLL
  downstream only                  downstream only

Projection fields (`status`, `due_on`, active compatibility fields, cached
streaks) are rebuildable outputs from the canonical stores. An
EffectiveObligation merge is derived from occurrence facts and overrides; it
has no physical canonical row.
```

Canonical relationships are owner-scoped. Derived relationships are timeline, status, streak, future occurrence, and same-date effective-obligation projections. Compatibility relationships are legacy History evidence, old subtasks, status/due projections, pending-dice payloads, and existing reward claims where they cannot yet be mapped.

## 29. Exact target recommendation

| Concern | TARGET | WHY | CURRENT GAP | MIGRATION IMPACT |
|---|---|---|---|---|
| Task identity/content/hierarchy | One owner-scoped Task Entity with explicit `entity_kind` and self parent identity | Uniform Parent/Step/Substep facts and independent rewards | Same-table parent links and separate legacy subtasks lack one entity contract | Map promoted/current rows; retain old subtasks as evidence |
| Schedule model/configuration | Immutable full schedule snapshots in boundary rows with explicit four-way discriminator | Historical replay and no overloaded due semantics | Mutable Repeat fields and distributed writers | Create initial/boundary snapshots with confidence |
| Recurrence anchor | Stable anchor in boundary snapshot with confidence/provenance | Membership survives cursor movement | No universal anchor; `due_on` is overloaded | High-risk anchor classification |
| Explicit History | One current explicit outcome per entity/date with occurrence/effective/provenance metadata | Date replacement/clear is deterministic | Current row mixes automatic Missed and explicit facts | Separate/classify legacy automatic rows |
| Occurrence identity | UUID fact plus deterministic natural key, materialized on demand | Durable references without future-row explosion | Optional/inconsistent History keys and active date fields | Reconstruct proven identities; flag ambiguous rows |
| Delay | Append-only occurrence effective-date override plus Delayed History and boundary | Preserves origin and target across reload/collision | `status`/`due_on` approximation | Safe only where target origin is proven |
| Same-date merge | Derived grouping of origins by effective date | Avoids duplicate fact/reward rows | No stored origin/effective grouping | No merge table; preserve both origins |
| Calendar override | Separate one-active-per-entity/date fact | Not Due/Unscheduled is not History outcome | Missing; Calendar edits write outcomes | Do not infer overrides from generic History |
| Terminal lifecycle | Task Entity `terminal_state` | Complete survives containers | `status`, `completed_at`, Complete History split | Reconcile contradictions conservatively |
| Container/restore | Entity `container_state` plus `prior_container_state` for Trash | Restore never guesses | Trash timestamp/status lack prior container | Unknown prior container fails safe |
| Workflow | Entity workflow fields, separate from schedule status | In Progress survives relevant boundary without satisfying recurrence | Active fields/status conflated | Map only proven sessions |
| `due_on` | Guarded effective cursor projection | Compatibility without authority | Used as config/anchor/active status input | Rebuild after canonical facts |
| `Task.status` | Display/query compatibility projection, retire after convergence | One enum cannot represent independent axes | Read by many fallbacks | Compatibility read window required |
| Missed/streaks | Derived only; optional fingerprinted caches | Time passage remains reconstructable | Automatic rows and saved counters overlap | Classify old automatic rows |
| Reward entitlement | Dedicated entity/date/program unique fact | One durable proof across reversals/retries | Current claim table is only an approximation | Link old claims only with evidence |
| Reward grant | One idempotent downstream effect per entitlement | Task success can survive grant failure | Pending dice partly supplies this | Preserve and link existing operations |
| Reward claim | Separate stable grant consumption | Queue reorder/retry cannot consume wrong item | Current claim/roll roles overlap | Map existing roll/claim evidence |
| Command idempotence | Compact command operation ledger plus fact command IDs | Exact retry and stale proof | Operation IDs are subsystem-specific | Start canonical identity at cutover |
| Revision | Narrow entity/date/boundary/occurrence/effect revisions | Prevents stale semantic writes without global lock | Only Task revision is broad | Seed conservative revisions |
| Logical day | Profile settings + settings revision; context snapshots on commands/facts | Profile outranks browser/local storage | Multiple fallbacks and omitted context | Preserve old context uncertainty |
| Achievements | Downstream canonical-event consumer with own idempotence | No achievement mutation of Task truth | History trigger consumes mixed rows | Repoint source identity later |

### Recommended structures added by the target

1. `task_schedule_boundary` immutable full snapshots.
2. `task_occurrence_fact` materialized-on-demand origin/resolution records.
3. `task_occurrence_effective_override` append-only Delay/correction records.
4. `task_calendar_override` active date-scoped scheduling facts.
5. `task_history_fact` canonical explicit outcome store, whether implemented as a renamed/reworked History table or equivalent.
6. `task_legacy_history_evidence` for automatic/ambiguous legacy rows.
7. `task_command_operation` compact canonical command/replay ledger.
8. `task_reward_entitlement`, `reward_grant`, and `reward_claim` downstream identities.
9. Task Entity lifecycle/workflow fields and profile `settings_revision`.

These are conceptual structures. They are not SQL authorization.

### Structures eliminated or reduced by minimalism review

- No row for every theoretical future occurrence.
- No persisted merged-obligation table.
- No canonical automatic Missed row for time passage.
- No canonical current streak or Missed counter.
- No universal event-sourcing stream for every read/projection.
- No separate lifecycle event table required for the current one-row current-state model; command evidence supplies correction/replay identity.
- No separate workflow table required while the product supports one active workflow fact per entity.
- No reward entitlement per occurrence origin in a same-Task effective merge.
- No reward grant/claim role assigned to Task History status.

## 30. Minimalism review

The proposed model was challenged against the required questions:

- Schedule membership cannot be safely derived from moving `due_on`, so a stable anchor and boundary snapshots are stored.
- Current effective obligation, future fixed membership, merged obligations, status, and streaks can be derived, so they are not added as canonical tables.
- Explicit History and occurrence resolution are not duplicates: History records what was recorded on an entity/date; the occurrence fact records which immutable obligation was consumed and prevents duplicate consumption.
- Calendar overrides are a separate table because their authority is different from History outcome.
- Lifecycle is kept on the entity row because it is current entity eligibility, while the command ledger handles provenance; a lifecycle event stream would overbuild the contract.
- Workflow is kept on the entity row because there is one current workflow fact per entity; it is not duplicated in status or History.
- Reward entitlement is separate because current status/history cannot survive reversal and retry safely; grant and claim are separate because they occur in different failure domains.
- Parent/Step/Substep share entity, History, occurrence, and reward storage only after explicit `entity_kind` and owner checks; they do not share implied outcome semantics.

The target is sufficient for deterministic reconstruction and guarded projections without making UI concepts canonical.

## 31. Storage invariants

1. Explicit History is a durable canonical fact.
2. Calculated Missed is not ordinary persisted History.
3. `scheduledDueOn` is an immutable occurrence origin.
4. `effectiveDueOn` never replaces occurrence identity.
5. `due_on` is never canonical recurrence authority.
6. `Task.status` is not canonical composite state.
7. History outcome and Calendar override are different facts.
8. There is at most one explicit outcome per entity/logical date.
9. There is at most one active Calendar override per entity/logical date.
10. Complete History and terminal lifecycle cannot contradict after a successful Complete command commit.
11. Archive and Trash cannot erase or downgrade Complete.
12. Trash restore requires proven prior-container evidence or fails safe.
13. In Progress is an independent workflow fact.
14. In Progress does not satisfy recurrence or pause Missed.
15. Reward entitlement survives later status reversal.
16. There is at most one reward entitlement per entity/logical date/program version.
17. Parent, Step, and Substep entitlement identities are independent.
18. Done, Did My Best, and Complete share one handled-success entitlement for one entity/date.
19. Reward grant is not Task chronology authority.
20. Reward claim is not proof of Task success.
21. Command retry cannot duplicate canonical facts.
22. Conflicting payloads under one idempotence identity are rejected.
23. Projection repair cannot create History.
24. Projection repair cannot grant reward.
25. Recurrence anchor is stable canonical evidence.
26. Schedule boundaries preserve which definition governed each historical logical date.
27. Manual Calendar overrides do not rewrite Repeat.
28. Legacy automatic Missed remains distinguishable from explicit user Missed.
29. Logical-day settings have one durable current source of truth.
30. Local storage cannot outrank profile logical-day settings.
31. Positive streak is derived.
32. Missed streak is derived.
33. Same-date merged origins preserve every origin identity.
34. Same-date merged origins resolve once and contribute one outcome/streak result.
35. Canonical facts are owner-scoped and cross-owner references are rejected.
36. Hard delete and Trash are separate operations.
37. `active_status_logical_date` cannot mean general Task logical date.
38. `active_occurrence_due_on` cannot be the sole occurrence identity.
39. `counted_as_due_occurrence` and `was_completed` cannot override outcome/provenance/chronology.
40. A missing legacy occurrence identity does not invalidate a trustworthy explicit outcome.
41. An ambiguous legacy anchor is stored as ambiguous, not invented.
42. A delayed target strictly after the Delay action date is required.
43. Delay does not change Repeat or stable anchor.
44. Archive/Trash create no inactive-time History.
45. Rollover can produce zero Task fact writes.
46. Time passage cannot create a success entitlement.
47. Reward effect failure leaves canonical Task truth committed and retryable.
48. A success reversal does not automatically claw back a consumed reward.
49. Historical recalculation does not manufacture downstream rewards.
50. Achievement consumers are downstream and idempotent.
51. A stale command cannot apply to a different occurrence.
52. A stale projection cannot override reconstructable canonical chronology.
53. One entity revision does not replace narrower History/boundary/occurrence/effect proofs.
54. Canonical rows retain command/provenance identity sufficient for replay and migration diagnosis.
55. Future projected occurrences are not materialized merely by Calendar read.
56. A cleared Calendar override returns that date to calculated authority.
57. Clearing explicit History returns that date to timeline authority.
58. A terminal Complete fact stops future recurrence until explicit correction/reopen.
59. Restore never synthesizes outcomes for inactive time.
60. No downstream reward path can mutate recurrence, status, due dates, or History.

## 32. Storage scenario matrix

| # | Scenario | Canonical facts written | Derived state not written | Uniqueness/idempotence rule | Projection / migration concern |
|---:|---|---|---|---|---|
| 1 | Genuinely unscheduled Task | Entity + unscheduled initial boundary only | No obligation, Missed, or cursor | Entity/boundary command identity | Legacy `due_on=null`, Repeat none is high-confidence only if no boundary conflict |
| 2 | One-time Task | One-time boundary with `one_time_due_on` and anchor/boundary provenance | No implicit recurrence | One boundary sequence | Classify `scheduled_on`/`due_on` meaning |
| 3 | Rolling Task | Rolling boundary and stable anchor | Future occurrences not materialized | Boundary sequence | Legacy anchor may be ambiguous |
| 4 | Fixed Task | Fixed boundary, anchor, rule snapshot | Future fixed occurrence rows not created by read | Boundary sequence | Preserve fixed phase independent of cursor |
| 5 | First Done | History Done + occurrence fact/resolution + required recurrence transition | No automatic Missed rows | History entity/date and command identity | Reward intent follows canonical commit |
| 6 | Historical Done | History replacement at historical date + occurrence/boundary proof | Downstream replay dates remain derived | New correction command, old command replay unchanged | May create one unused entitlement |
| 7 | Did My Best | History DMB + applicable occurrence transition | No status-based reward duplicate | Shared handled-success entitlement key | Outcome remains distinct from Done |
| 8 | Complete | Complete History + terminal lifecycle + occurrence resolution | No future recurrence/Missed | Atomic command operation | Reconcile `completed_at`/archive-like legacy status |
| 9 | Delay | Delayed History + effective override + boundary reference | No success reward or new origin | Origin identity and command identity | Ambiguous old delayed cursor requires review |
| 10 | Fixed Delay collision | Two origin facts/overrides preserved | No merged canonical row | One effective grouping and one entity/date outcome | Both origins must survive |
| 11 | Manual Not Due override | One active Calendar override | No fake History or Repeat change | One active override/entity/date | Existing outcome rows are not reclassified automatically |
| 12 | Clear Calendar override | Override cleared with command evidence | Date returns to timeline calculation | Override revision | No new History |
| 13 | Rolling historical correction | History replacement + command proof; later boundary remains | Replayed later dates are derived | Boundary sequence stops replay | High butterfly-effect migration risk |
| 14 | Archive | Container state archived + workflow termination if active | No inactive-time Missed/History | Command idempotence | Preserve unresolved facts |
| 15 | Trash | Container trashed + prior-container evidence + workflow termination | No inactive-time Missed/History | Command idempotence | Current prior container often unknown |
| 16 | Restore Archive | Container active, if nonterminal | No synthetic backlog | Restore command replay | Re-evaluate from facts |
| 17 | Restore Trash | Proven prior container restored | No synthetic backlog | Restore command replay | Unknown prior container fails safe |
| 18 | Complete + Archive | Terminal Complete + archived container | No active schedule | Separate lifecycle commands or explicit composite proof | Complete must survive Archive |
| 19 | In Progress | Workflow fields/occurrence reference | No History, rebase, or reward | One active workflow revision | Current active fields are mixed |
| 20 | In Progress crossing due | Optional workflow revision only | Missed is derived; no synthetic DMB | Workflow command identity | Do not use stale rollover DMB path |
| 21 | Calculated Missed | No canonical fact write | Missed timeline/streak only | Pure deterministic replay | Legacy automatic rows may corroborate only |
| 22 | Legacy automatic Missed | Legacy evidence classification only | No canonical explicit success/reward | Legacy evidence source identity | Preserve row and provenance |
| 23 | Two tabs same Done | One History/occurrence transition | No duplicate projection required | Unique command/history/entity-date proof | Second result is replay/no-op or stale rejection |
| 24 | Retry same command | No new canonical facts | Same after-state | Payload digest + idempotence identity | Stored result/fact refs returned |
| 25 | Stale revision | No write | No projection repair | Expected entity/fact revision rejects | Preserve latest state |
| 26 | Reward entitlement | One entity/date/program entitlement | No Task mutation by reward consumer | Unique entitlement identity | Status reversal cannot reopen |
| 27 | Reward grant retry | One grant or existing grant result | No Task/History write | Grant operation identity | Pending remains retryable |
| 28 | Reward already consumed after History reversal | No new entitlement/grant | Current status does not decide reward | Existing unique entitlement wins | No automatic clawback |
| 29 | Parent + Step rewards | Separate entity/date History/entitlement facts | No implied child/parent facts | Entity ID in unique key | Map legacy subtask identity |
| 30 | Step reset same day | Workflow/config reset fact if authorized; no entitlement deletion | No second reward for same date | Entitlement survives reset | Current child reset is reward-coupled |
| 31 | Step re-complete next day | New explicit success and new entitlement | No parent mutation | New logical date key | Logical-day context must be correct |
| 32 | Long offline gap | No required time-passage facts | All Missed/Not Due/streak chronology derived | Pure read replay | No rollover backlog backfill |
| 33 | Projection repair | Projection row/fingerprint only | No History/occurrence/reward | Source revision/fingerprint guard | Repair failure is non-business failure |
| 34 | Repeat change | New full schedule boundary and anchor as applicable | Prior dates unchanged | Boundary sequence/idempotence | Backfill cannot infer missing boundaries freely |
| 35 | Due-date change | New boundary snapshot | No History or reward | Boundary command identity | Current `due_on` is only evidence |
| 36 | Explicit Missed command | History Missed with user provenance | No reward entitlement | One entity/date replacement | Distinguish from calculated/legacy Missed |
| 37 | Clear explicit History | Remove/clear History fact with command proof | Timeline resumes derived authority | Expected History revision | Do not restore stale `due_on` blindly |
| 38 | Terminal correction/reopen | New explicit correction command, lifecycle revision | No automatic economy reversal | New command identity | Later boundaries and History preserved |
| 39 | Invalid timezone/day-start context | No canonical mutation | No logical-day-derived state trusted | Command rejected | Profile context error |
| 40 | Achievement consumes success | Downstream achievement source/evaluation identity only | No Task mutation | Source/evaluation operation uniqueness | Legacy automatic Missed must not qualify success |

## 33. Current-to-target gap table

| Canonical concept | Current physical representation | Adequate? | Target physical representation | Migration complexity | Data ambiguity risk | Required before implementation? |
|---|---|---:|---|---|---|---:|
| Task Entity identity/owner | `adhdice_clean_tasks.id/user_id` | Partially | Owner-scoped Task Entity with entity kind and composite ownership | MEDIUM | LOW | YES |
| Hierarchy identity | `parent_task_id` plus legacy subtasks | Partially | One Task Entity hierarchy contract | HIGH | HIGH | YES |
| Schedule model | Repeat fields + `due_on`/`scheduled_on` | No | Explicit model in immutable boundary snapshot | HIGH | HIGH | YES |
| Recurrence anchor | Often inferred from `due_on` | No | Stable anchor with confidence/provenance | HIGH | HIGH | YES |
| Schedule boundaries | Distributed Task updates/RPCs | No | Immutable full boundary snapshots | HIGH | HIGH | YES |
| Explicit History | One-row-per-date History | Partially | Canonical outcome fact with command/provenance/occurrence metadata | MEDIUM | MEDIUM | YES |
| Legacy automatic Missed | Same History table, mixed provenance | No | Separate legacy evidence/classification | HIGH | HIGH | YES |
| Occurrence identity | Optional `occurrence_key`, `occurrence_due_on`, active fields | Partially | UUID fact plus deterministic natural key | HIGH | HIGH | YES |
| Effective due / Delay | `status=delayed` + `due_on` | No | Occurrence effective override + Delay boundary/History | HIGH | HIGH | YES |
| Same-date merge | Target-only derived semantics | No | Derived grouping from origins/overrides | MEDIUM | MEDIUM | YES |
| Calendar override | Missing; outcome-oriented writes | No | One active entity/date override fact | MEDIUM | HIGH | YES |
| Terminal Complete | `status`, `completed_at`, Complete History | Partially | Entity terminal state + Complete History atomically | HIGH | HIGH | YES |
| Archive/Trash | Status + `trashed_at` and UI rules | Partially | Container state + proven prior container | MEDIUM | HIGH | YES |
| In Progress | Status + active fields | Partially | Orthogonal workflow fact | MEDIUM | MEDIUM | YES |
| `due_on` | Mixed cursor/config/anchor | No | Guarded projection only | LOW | HIGH | YES |
| `Task.status` | Mixed composite status | No | Compatibility display projection, eventual retirement | MEDIUM | HIGH | YES |
| Calculated Missed | Timeline plus automatic rows | No | Derived Missed; legacy evidence separate | HIGH | HIGH | YES |
| Streaks | Timeline plus saved-row counters | Partially | Derived/rebuildable projections | MEDIUM | MEDIUM | YES |
| Reward entitlement | Task/Subtask/date claim uniqueness | Partially | Entity/date/program entitlement bound to canonical event | HIGH | HIGH | YES |
| Reward grant/bank | Pending dice operations/items, rolls | Partially | Stable grant per entitlement | MEDIUM | MEDIUM | YES |
| Reward claim | Roll/claim tables and queue | Partially | Stable grant consumption record | MEDIUM | MEDIUM | YES |
| Command replay | Subsystem-specific operation IDs | Partially | Compact canonical command ledger | HIGH | MEDIUM | YES |
| Revisions | Task row revision only | Partially | Narrow fact revisions and boundary sequences | MEDIUM | MEDIUM | YES |
| Logical-day settings | Profile + local storage + defaults | Partially | Profile source + settings revision + context snapshots | MEDIUM | MEDIUM | YES |
| Achievement event consumption | History-trigger source and operation IDs | Partially | Canonical-event downstream source identity | MEDIUM | HIGH | NO; downstream cutover gate |
| Delete/retention | Cascades/status/30-day helper, no Task-state contract | No | Explicit later retention policy | UNKNOWN | HIGH | NO; policy gate |

Highest-risk gaps are recurrence anchor/boundary recovery, mixed automatic versus explicit Missed, occurrence identity/effective Delay data, Complete/lifecycle contradictions, and legacy reward claims that do not prove canonical handled success.

## 34. Product decisions

No new product decisions are required by Phase 1D-1. Phase 1B already locked:

- four scheduling models;
- Delay identity and fixed same-date merge;
- independent lifecycle/container/workflow axes;
- Complete as terminal and reward-bearing;
- calculated Missed as derived;
- one handled-success entitlement for Done/DMB/Complete per entity/date/program; and
- Parent/Step/Substep reward independence.

The remaining choices are storage naming, data classification, migration mechanics, retention, repository implementation, and deployment sequencing.

## 35. Phase 1D-2 handoff

The next phase is:

```text
PHASE 1D-2
Migration / Backfill / Compatibility Cutover Design
```

It must later cover, without reopening the target model:

- current row classification into canonical, compatibility, and ambiguous evidence;
- safe backfill ordering for entities, schedule boundaries, anchors, History, occurrences, overrides, lifecycle, workflow, and rewards;
- ambiguous legacy anchor/occurrence/Trash/automatic-Missed handling;
- phased dual-read/dual-write only where required;
- schema migration and deployment ordering;
- rollback and compatibility projection strategy;
- legacy authority retirement gates for both rollover RPC families, automatic Missed writers, reward-owned recurrence, and raw status fallbacks;
- verification queries and invariant checks; and
- Supabase deployment/runtime proof.

Migration, backfill, dual-write, cutover, rollback, verification queries, and Supabase deployment were not designed or started here.

## Scope record

- Production code: untouched.
- Tests: untouched.
- Schema and generated database types: untouched.
- SQL creation/modification/execution: not performed.
- Supabase data/RPC deployment: not changed or queried.
- UI and diagnostics implementation: untouched.
- Version surfaces: untouched.
- Migration/backfill/cutover: not started.
- Authorized new file: this document only.
