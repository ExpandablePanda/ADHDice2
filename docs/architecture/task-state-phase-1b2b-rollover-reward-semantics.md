# Phase 1B-2B: Canonical Logical-Day Rollover and Reward/Economy Semantics

Status: architecturally locked product-semantics specification
Scope: logical-day evaluation, rollover coordination, calculated Missed chronology, reward eligibility, economy side effects, idempotence, and historical-correction boundaries
Implementation status: specification only; no production implementation is authorized by this document

This document follows [Phase 0 inventory](task-state-phase-0-inventory.md), [Phase 1A core model](task-state-phase-1a-core-model.md), [Phase 1B-1 recurrence transitions](task-state-phase-1b1-recurrence-transitions.md), and [Phase 1B-2A workflow/lifecycle transitions](task-state-phase-1b2a-workflow-lifecycle-transitions.md). It is an architecture and documentation artifact only.

The following are intentionally unchanged by this phase: production code, tests, schema, migrations, SQL, Supabase, UI, diagnostics implementation, version surfaces, and deployment state.

## Executive decision

The canonical relationship is:

```text
authoritative Task configuration and facts
  + explicit History
  + schedule boundaries and manual Calendar overrides
  + LogicalDayContext
      -> canonical Task chronology and effective state
          -> optional projections
          -> explicit downstream reward/achievement intents
```

It is not:

```text
stored yesterday status
  + a successful cron-like mutation
      -> Task truth
```

Time passing changes what the canonical engine derives. It does not create a second Task-state authority. Rollover is a coordination opportunity for safe projections and downstream side effects, not the source of Missed truth, recurrence truth, or reward truth.

Reward/economy logic consumes a successful canonical event and its pure eligibility result. It never decides status, next due date, occurrence consumption, History chronology, or lifecycle termination.

The canonical handled-success reward rule is:

```text
For each user + Task entity + logical date:
  if the entity first becomes Done, Did My Best, or Complete;
  and the handled-success reward entitlement for that entity/date has not
  already been consumed;
  then grant exactly one normal banked roll.
```

Done, Did My Best, and Complete have equal reward value. The entitlement belongs to the Task entity and logical date, not to a status name, due-ness, recurrence advancement, rollover, hierarchy implication, or current History status. A later non-success interpretation does not restore the consumed entitlement.

## 1. Locked inputs from earlier phases

The following are fixed inputs rather than decisions reopened here:

- The four scheduling models are genuinely unscheduled, one-time scheduled, rolling recurring, and fixed-calendar recurring.
- `Unscheduled` and `Not Due` are different Calendar states.
- A due date without Repeat is one-time, not implicit Daily.
- `scheduledDueOn` is an immutable occurrence origin. `effectiveDueOn` may move after Delay. `due_on` is only a guarded effective cursor projection.
- A same-Task fixed-calendar delayed origin and normal origin that share an effective date form one effective obligation while preserving both origins.
- Done and Did My Best are successful outcomes under the Phase 1B-1 family rules. Complete is a successful terminal outcome under Phase 1B-2A.
- Delay is not success, does not satisfy recurrence, and is not reward eligible.
- Missed is not success. Calculated Missed is normally derived chronology, not an explicit History row.
- Archive and Trash suspend active evaluation while preserving chronology. They do not accrue a persisted inactive-time backlog.
- Complete is terminal. It does not use a reward operation to perform lifecycle termination.
- In Progress is an orthogonal workflow fact. It does not satisfy recurrence and must not become Done or Did My Best merely because time passed.
- Historical corrections alter chronology and streaks. An explicit historical action that changes an unrewarded entity/date into Done, Did My Best, or Complete is reward eligible; downstream recalculation alone is not. A later reversal does not automatically reverse an already granted reward.
- The canonical engine must emit diagnostics instead of silently guessing through unresolved contradictions.

## 2. Current source audit

### 2.1 Audit boundary and evidence limits

`CURRENT` statements in this section are based on checked-in source inspection. They describe reachable source paths, not a claim about which SQL patch is installed in a remote database or which browser tab wins a production race. The current branch still has engine, legacy, compatibility, and fallback seams. Browser behavior, deployed RPC behavior, multi-tab behavior, BFCache behavior, and live reward-bank behavior remain unverified by this documentation pass.

The principal inspected boundaries were:

| Concern | Current source boundary | Current finding |
|---|---|---|
| Logical day | [`src/lib/logical-day.ts`](../../src/lib/logical-day.ts), [`src/components/task-app.tsx`](../../src/components/task-app.tsx), engine [`calendar.ts`](../../src/lib/task-state-engine/calendar.ts) | User timezone and configured day-start are used, but the utility, TaskApp/profile hydration, local-storage mirror, and engine formatter are separate call surfaces. Several hooks retain default `UTC`/`00:00` parameters when callers omit context. |
| Engine evaluation | [`engine.ts`](../../src/lib/task-state-engine/engine.ts), [`effective-timeline.ts`](../../src/lib/task-state-engine/effective-timeline.ts), [`recurrence.ts`](../../src/lib/task-state-engine/recurrence.ts) | The engine derives status, recurrence, Calendar, streak disposition, patches, and reward eligibility. Effective Timeline can calculate Missed without persistence, while `evaluateTaskState()` can propose rollover/reconciliation History. |
| Engine rollover | [`rollover-authority.ts`](../../src/lib/task-state-engine/rollover-authority.ts), TaskApp `runDayReset` | The client builds a plan from loaded Task/History snapshots and may send Task patches and proposed History to an RPC. The plan currently exposes `rewardEligible`. |
| Persistence projection | [`persistence-projection.ts`](../../src/lib/task-state-engine/persistence-projection.ts) | The current allow-list is `status`, `dueOn`, `completedAt`, `activeStatusLogicalDate`, and `activeOccurrenceDueOn`; engine-only cursor and occurrence fields are excluded. `unscheduled` projects to stored `pending`. |
| Legacy rollover | [`supabase/patch_secure_task_rollover_rpc.sql`](../../supabase/patch_secure_task_rollover_rpc.sql), [`supabase/add_task_rollover_rpc.sql`](../../supabase/add_task_rollover_rpc.sql) | The legacy RPC loops over overdue stored `due_on`, inserts/upserts Missed or Did My Best History, advances due dates for recurrence, and writes stored status. It is a competing business-state path, not merely a cache repair. |
| Rollover triggers | TaskApp `runDayReset`, [`task-rollover-coordinator.ts`](../../src/lib/task-rollover-coordinator.ts), [`task-rollover-gate.ts`](../../src/lib/task-rollover-gate.ts) | Startup, visibility resume, BFCache `pageshow`, and a 60-second timer can invoke rollover. In-flight single-flight and a per-user local-storage key reduce repeat work in one document; they are not a cross-tab canonical ledger. |
| Legacy automatic Missed | [`useTaskRewardController.ts`](../../src/hooks/useTaskRewardController.ts), [`task-repeat.ts`](../../src/lib/task-repeat.ts) | `reconcileOverdueTaskMisses()` computes overdue dates and writes automatic Missed History. It is called from legacy reward finalization and several History/editor/update compatibility paths. |
| Reward finalization | [`useTaskRewardController.ts`](../../src/hooks/useTaskRewardController.ts) | `finalizeRecurringTasks()` reconciles overdue Missed rows, calculates a next due date, updates recurring Task status/cursor fields, and can reset child Steps. It is skipped for engine-managed candidates but remains a reachable fallback owner. |
| Task action routing | [`action-authority.ts`](../../src/lib/task-state-engine/action-authority.ts), TaskApp, update/editor/batch/history hooks | Engine-managed actions can carry Task and History plans and reward eligibility. Caller-owned persistence and legacy fallback paths still coexist. |
| Reward bank | [`task-rewards.ts`](../../src/lib/task-rewards.ts), [`pending-reward-dice.ts`](../../src/lib/pending-reward-dice.ts), `useTaskRewardController`, checked-in pending-reward SQL | Explicit status transitions are converted into pending dice, then a bank RPC and a claim RPC apply economy effects. Current operation identities are based on reward date and Task/subtask claim references, not a complete immutable canonical occurrence event. |
| Older economy helper | [`useEconomy.ts`](../../src/hooks/useEconomy.ts) | `commitTaskReward()` performs a client-side claim precheck, reward-roll insert, claim insert, profile update, and point-ledger insert without one universal transaction boundary. No current caller was found in the inspected `src` tree; it remains a compatibility/helper seam. |
| Achievements | Checked-in achievement runtime SQL and [`useAchievements.ts`](../../src/hooks/useAchievements.ts) | Task History triggers capture/evaluate achievement source. Engine rollover SQL defers per-row evaluation and evaluates once with a deterministic user/logical-date operation ID. Exact deployed trigger/RPC state is unverified. |
| Hierarchy rewards | [`useTaskSubtaskActions.ts`](../../src/hooks/useTaskSubtaskActions.ts), `finalizeRecurringTasks()` | Parent Task and Step/Subtask reward candidates are separate. Legacy recurring finalization may reset all parent children when `subtasks_auto_reset` is enabled, coupling optional reward/finalization sequencing to hierarchy mutation. |

### 2.2 Current logical-day authority

`TaskApp` hydrates `day_start_time` and `timezone` from the user profile, calculates `todayKey` with `getLogicalDayKey()`, and mirrors settings in local storage. The engine and read/calendar adapters independently call `logicalDateForTimestamp()` with the supplied timezone and rollover. The legacy SQL family has its own `adhdice_effective_logical_date()` implementation and reads profile settings.

The current formula is conceptually correct for ordinary inputs: local date and local minutes are evaluated in the user timezone, and a local time before the configured boundary belongs to the preceding logical date. The current risk is authority multiplication and context omission, not a rule that midnight should win. A hook defaulting to `00:00`/`UTC`, a local-only settings mirror, or a legacy SQL function can evaluate a different logical day if context is stale or absent.

The target therefore names one `LogicalDayContext` authority and requires every engine, action, Calendar, rollover, History, reward eligibility, and achievement event boundary to receive that context or a stable derived identity. A browser clock or Gregorian midnight must not independently mark a Task Missed.

### 2.3 Current rollover and status authority graph

```text
profile + TaskApp logical-day context
        │
        ├─ TaskApp todayKey / active-status projection
        ├─ engine evaluateTaskState()
        ├─ engine createEngineRolloverPlan()
        │       └─ engine RPC adhdice_apply_task_state_engine_rollover
        │
        └─ fallback adhdice_reconcile_task_rollover

explicit Task action
        │
        ├─ engine action authority -> caller Task/History writes
        ├─ legacy History/status fallback
        └─ queueTaskRewards()
                ├─ pending dice award RPC
                └─ legacy finalizeRecurringTasks()
                        ├─ reconcileOverdueTaskMisses()
                        ├─ next due/status mutation
                        └─ optional Step reset
```

`CURRENT` — `evaluateTaskState()` has two behaviors that the target explicitly corrects:

1. It can insert calculated continuous-overdue Missed rows into `proposedHistoryChanges` for dates before the current logical date.
2. It can treat stale `in_progress` metadata without a same-day row as a rollover `did_my_best` History row, then advance recurrence.

`CURRENT` — `buildTaskEffectiveTimeline()` can represent the same overdue chronology as calculated, non-persistent Missed days. This coexistence is why “a Missed row exists” is not a sufficient definition of canonical Missed.

`CURRENT` — The engine RPC source [`patch_task_state_engine_rollover_7_6_13.sql`](../../supabase/patch_task_state_engine_rollover_7_6_13.sql) accepts proposed Task patches and History, uses an advisory user lock, revision guards, `on conflict do nothing` by Task/date, and a deferred achievement evaluation. The legacy RPC source uses a logical-date ledger and advisory user lock but still derives business transitions from stored `due_on` and writes automatic outcomes. SQL source inspection does not establish deployment.

### 2.4 Current trigger and repeat behavior

The current TaskApp rollover path can be entered on:

- initial load after Task and History readiness;
- visibility returning to the foreground;
- persisted BFCache `pageshow`; and
- a one-minute timer.

`TaskRolloverSingleFlightCoordinator` deduplicates in-flight work by a settings key inside one JavaScript runtime. `task-rollover-gate.ts` persists a user-scoped processed key containing user, logical date, timezone, and rollover time in browser local storage. These are coordination guards, not authoritative chronology facts. They do not by themselves cover two tabs, another device, a process restart, a failed effect after a successful state write, or a changed Task after a stale plan was built.

The engine path loads scoped History, computes a plan, and calls `adhdice_apply_task_state_engine_rollover` when the function is available. Function/schema-cache errors fall back to `adhdice_reconcile_task_rollover`. The fallback is therefore conditionally reachable in source. `didMutate` and committed-row counts then determine whether workspace reconciliation and rollover rewards are requested.

### 2.5 Current automatic Missed behavior

There are three current representations:

1. Effective Timeline calculated Missed, with no History write.
2. Engine rollover/recompute proposed `missed` History, with provenance `rollover` in the engine model.
3. `reconcileOverdueTaskMisses()` and legacy SQL automatic Missed rows, usually keyed only by Task/date in the database boundary.

The legacy date builder treats an overdue one-time Task as Missed on every closed date from its due date through yesterday. For recurring Tasks it builds dates from the stored recurrence/due cursor. The writer upserts rows and returns success when rows already exist. This is idempotent at the date-row level, but it makes ordinary time passage a persisted History event and can conflict with explicit user-owned History.

### 2.6 Current reward/economy behavior

The current source expresses a broad completion-reward intent:

- `isRewardCompletionStatus()` treats `done`, `did_my_best`, and `complete` as reward completion statuses.
- Engine `SUCCESS` and `rewardFor()` also include `done`, `did_my_best`, and `complete`.
- `queueTaskRewards()` receives candidates from Task status actions, editor saves, batch edits, direct Complete, rollover rewards, and Step/Subtask completion.
- Parent Task candidates are filtered through a per-task/per-reward-date claim check. A successful pending-dice award uses `buildPendingRewardAwardOperationId()` based on reward date and Task/Subtask claim identity.
- Pending reward dice are banked by an RPC operation identity and claimed by a client-held operation ID. The account uses revision/updated-at snapshots to protect UI freshness.
- `finalizeRecurringTasks()` is called for non-engine-managed recurring parents or forced legacy finalization. It performs recurrence/status writes after the reward candidate is identified.
- `useEconomy.commitTaskReward()` still contains a separate roll/claim/profile/ledger path, but no current caller was found in the inspected source tree. It should not be treated as the canonical active reward route merely because it exists.

Current behavior does not yet prove the final handled-success entitlement contract. In particular, the engine and status-based helper do not expose a durable distinction between a one-time pre-due checkpoint, a final one-time obligation resolution, and a previously consumed entity/date entitlement. This document resolves the product policy while classifying the missing durable proof as later implementation/storage work.

Current failure behavior is split. The pending-dice RPC path retries network fetch failure once and stores an operation result for replay. If a Task transition succeeds but award persistence fails, the Task is not rolled back by `queueTaskRewards()`. The user receives a warning, but source inspection does not show a complete canonical reward-retry/reconciliation queue tied to the Task event. The target makes that recovery contract explicit.

### 2.7 Current achievement and hierarchy behavior

Checked-in achievement SQL attaches a trigger to Task History inserts and relevant updates. The trigger captures Task achievement occurrences and normally evaluates progress immediately. The engine rollover SQL temporarily defers full evaluation while History rows are inserted, then evaluates once with a deterministic operation ID derived from user and logical date. This means rollover can currently trigger achievement processing as a consequence of persisted History, even when the row was an automatic rollover artifact.

The target permits achievement consumers to react to canonical explicit events or an explicitly defined derived-state evaluation. It does not permit achievement evaluation to mutate Task status, recurrence, due cursor, or History. Historical corrections require a separate achievement policy; they must not accidentally replay economy rewards.

Step/Subtask completion currently creates an independent reward candidate for `done` or `did_my_best` transitions. Parent recurring finalization can reset child statuses after updating the parent due/status. This coupling is not safe as a target ownership rule: if child reset is part of recurrence semantics, it belongs to the canonical Task transition plan; if it is optional reward UI behavior, it must not be required for Task recurrence correctness.

## 3. Canonical LogicalDayContext

### 3.1 One authority

`TARGET` — There is exactly one conceptual `LogicalDayContext` for a user evaluation:

```text
LogicalDayContext = {
  userId,
  timezone: valid IANA timezone,
  rolloverTime: supported local HH:MM boundary,
  evaluatedAt: instant,
  logicalDate: user-local logical date at evaluatedAt,
  contextIdentity: user + logicalDate + timezone + rolloverTime + context generation
}
```

The context is derived from the user timezone, configured rollover boundary, and current timestamp. It is passed into the pure engine. No consumer may substitute local Gregorian midnight, browser date-only formatting, or a fixed 24-hour interval as an independent rollover rule.

At a configured 06:00 boundary:

- August 8 at 23:59 and August 9 at 00:01 are the same logical day.
- August 9 at 05:59 is still the same logical day.
- August 9 at 06:00 evaluates as the next logical day.

The same relationship applies to every supported configured boundary.

### 3.2 Timezone and DST

Logical dates are local calendar values in the user timezone. The conceptual calculation extracts the local date and local wall-clock time at the instant, compares the local time with the configured boundary, and shifts the local date by one calendar day when the boundary has not yet occurred.

The calculation must not add or subtract `86_400_000` milliseconds to an instant to find the next logical day. DST transitions may make a local day shorter or longer than 24 hours. Date-key arithmetic may shift an already-derived local calendar date, but the boundary crossing itself is always re-evaluated from the timezone-aware instant.

Invalid timezone or rollover settings are a diagnostic/error input. The engine must not silently fall back to browser timezone or midnight for a state-changing operation. A display-only surface may show a safe fallback while clearly remaining non-authoritative.

### 3.3 Context handoff

The same context identity must be used for:

- active status and Calendar reads;
- explicit Task action validation and planning;
- rollover planning;
- any projection repair;
- reward eligibility for an explicit event when logical date affects policy;
- achievement event/evaluation intent; and
- retry/reconciliation of downstream effects.

A context change caused by user, logical date, timezone, or rollover setting starts a new evaluation generation. An in-flight request from the prior generation may complete for diagnostics, but it may not overwrite the new generation's canonical projection or apply a stale Task mutation.

## 4. Rollover is coordination, not truth creation

### 4.1 Pure evaluation

The canonical engine evaluates:

```text
TaskConfiguration
  + RecurrenceAnchor
  + lifecycle/container/workflow facts
  + ExplicitHistoryEvent[]
  + ScheduleBoundaryEvent[]
  + ManualCalendarOverride[]
  + LogicalDayContext
      -> CanonicalTaskState
```

If a rolling Task was due on 8/10 and has no success, an evaluation on 8/11 or 8/15 can derive the 8/10 Missed origin, active Missed state, frozen effective due cursor, and the appropriate Missed streak directly from facts plus logical date. It must do so whether or not an app was open at 06:00, a device slept, a scheduled RPC failed, or the next browser visit occurs days later.

The transition from logical day D to D+1 changes the evaluated result. It is not itself a business event that must be persisted in order for the result to become true.

### 4.2 Permitted coordination

Rollover coordination may:

- request a fresh evaluation after a context change;
- apply an idempotent, guarded projection that exactly matches canonical output;
- record a side-effect intent or retryable effect status after canonical facts are committed;
- refresh bounded workspace facts and explicitly owned caches;
- request an achievement evaluation from a canonical event/evaluation identity; and
- emit diagnostics and metrics about stale, conflicting, or unsupported data.

Rollover may not:

- invent an outcome solely because a timer fired;
- manufacture ordinary explicit Missed History for every closed overdue date;
- advance recurrence merely because a stored cursor is old;
- turn In Progress into Did My Best without an explicit canonical rule/event;
- use a reward result as proof that a Task transition succeeded; or
- make any persisted projection the only location where canonical truth exists.

### 4.3 Failure of a rollover run

If rollover planning or persistence fails, the next canonical read must still derive the correct state from facts and LogicalDayContext. A failed projection write may leave stale stored status or `due_on`, but it must not change the engine result or authorize a second independent fallback authority to invent a different chronology.

## 5. Calculated Missed versus explicit History

### 5.1 Target rule

`TARGET` — Normal time-driven Missed chronology is calculated state. Explicit History is a user-owned historical fact, a preserved legacy provenance fact, or the result of a separately authorized explicit repair workflow. Ordinary passage of time must not manufacture a new explicit Missed row.

Therefore:

- calculated rolling Missed days remain calculated;
- calculated fixed missed occurrences remain calculated unless a user or explicit repair workflow records a fact;
- one-time overdue Missed chronology remains calculated day by day until Complete or another valid explicit transition;
- current Missed streaks are derived from that chronology; and
- rollover must not write an ordinary Missed row just to make a calculated display state visible.

An explicit user-marked Missed date remains explicit even if it has the same visible state as a calculated Missed date. The engine must preserve its provenance and cannot rewrite it as automatic merely because time also supports Missed.

### 5.2 Legacy automatic Missed provenance

Existing automatic rows may be encountered during a later migration or normal read. The reader must:

1. preserve the row as historical provenance;
2. distinguish `manual`, `import`, `rollover`, and `reconciliation` provenance when available;
3. compare it with explicit History, occurrence identity, schedule boundaries, and current logical chronology;
4. allow it to explain or corroborate old chronology without promoting it into a new user-authored fact;
5. avoid inserting another automatic row merely because the same date is calculated Missed; and
6. emit a warning or needs-attention diagnostic when it conflicts with a later explicit outcome, a different occurrence identity, or a fixed-calendar membership fact.

Legacy provenance may be used for compatibility reads and a future preview-first repair workflow. This phase does not define migration SQL, delete legacy rows, rewrite their provenance, or authorize a bulk correction.

## 6. Persistence projection classification

Every persistence candidate must be classified before implementation. A projection write must be reproducible from canonical facts and LogicalDayContext. Failure to write it must not corrupt chronology or create an implied business event.

| Value | Classification | Target rule |
|---|---|---|
| Logical-day configuration | **A. Canonical persisted fact** | User timezone and configured rollover boundary are user-scoped configuration facts. The runtime must consume one authoritative source and validate it. Local storage may cache it but cannot outrank the authoritative profile/configuration. |
| Last observed logical day | **C. Projection/cache** | Useful for wake-up optimization only. It is not evidence that prior days were evaluated and cannot suppress a needed canonical read after a context change. |
| Rollover-run/idempotence marker | **C now; E for durable effect ledger if needed** | A browser key or in-flight gate is coordination only. A durable marker is a side-effect guard, not Task chronology. Exact storage/constraint design is later work. |
| `Task.status` | **C. Projection/cache plus compatibility field** | May be repaired when engine output differs and guarded execution proves the target is current. It cannot define Missed, recurrence, or lifecycle truth. |
| `due_on` | **C. Effective cursor projection** | May persist the canonical effective cursor for active use. It is not `scheduledDueOn`, occurrence identity, recurrence anchor, or History authority. |
| Active occurrence projection | **C. Projection/cache** | `active_occurrence_due_on` may mirror a proven current obligation. It must not replace immutable occurrence identity or effective-origin grouping. |
| `active_status_logical_date` | **C. Workflow/status projection** | May record a proven active workflow/status date for compatibility. Rollover must not use it as proof of a successful outcome. |
| Calculated Missed state | **B. Derived state** | Never requires an ordinary explicit History row or Task mutation merely because a day closed. |
| Calculated streak values | **B. Derived state** | Recomputed from effective chronology. Any cache is non-authoritative and reproducible. |
| Recurrence anchor | **A if explicitly persisted as a user/configuration fact; otherwise E** | A stable anchor is canonical input when recurrence cannot be reconstructed from configuration and boundaries. It must not be silently replaced by a stale `due_on` projection. Storage amendment is later work. |
| `scheduledDueOn` | **A. Immutable occurrence fact** | Origin identity and scheduled membership must remain distinct from a moving effective cursor. Existing storage is insufficient for every delayed/merged case; later amendment is required. |
| `effectiveDueOn` | **B/C** | Derived current expectation, optionally projected for guarded UI/mutation use. It is not a new occurrence identity. |
| Reward eligibility | **B. Pure action/effect intent** | Returned from the canonical action result. It is not itself a grant, claim, economy mutation, History write, or recurrence mutation. |
| Handled-success reward entitlement | **E. Required later canonical storage design, unless an equivalent durable claim/ledger proof is demonstrated** | The entitlement must answer whether this user + entity + logical date + reward program/version has already been consumed. Current History status, `Task.status`, `due_on`, and a current success transition are not sufficient authority. |
| Reward grant/effect ledger | **A. Canonical persisted economy fact** | A durable idempotent grant/effect identity records the economic side effect. It must remain associated with the handled-success entitlement and survive later History changes. |
| Banked reward | **A. Economy fact after successful effect** | A banked roll/dice item exists only after an idempotent downstream operation consumes a canonical eligibility event. It does not prove Task success. |
| Reward claim/consumption | **A. Economy fact after successful claim** | Claim identity must target a stable banked reward/effect item, never queue position. Retry must return the same result. |
| Achievement evaluation marker | **C/E** | An evaluation operation identity/gate prevents duplicate evaluation. It does not become Task state and cannot change recurrence/status. |
| Projection repair marker | **C. Operational projection metadata** | Records that a safe projection was attempted/applied, if later needed. It cannot outrank canonical facts or serve as a historical outcome. |
| Explicit user Missed | **A. Canonical persisted History fact** | Preserve as user-authored even when calculated Missed also applies. |
| Legacy automatic Missed | **D. Compatibility/legacy provenance** | Read and diagnose; do not create new rows under this target contract. |

### 6.1 Reward storage capability and gap

The checked-in source provides partial idempotence evidence, but it does not yet prove the required canonical entitlement contract:

- `adhdice_task_reward_claims` has unique indexes for `(user_id, task_id, reward_date)` when `subtask_id` is null and `(user_id, subtask_id, reward_date)` when it is present. This can prevent some duplicate claims for parent Tasks and legacy Subtasks.
- The pending-reward client key and `buildPendingRewardAwardOperationId()` are derived from `rewardDate` plus sorted Task/Subtask claim references. The pending-reward award RPC and claim RPC also accept operation identities and return replay information.
- The older `commitTaskReward()` path prechecks Task/Subtask claims, inserts a reward-roll row, updates the profile and point ledger, and inserts claims through separate client operations. Its claim rows link Task/Subtask, reward date, and reward-roll ID, but not a canonical explicit success event, logical-date entitlement program/version, or durable unconsumed entitlement.
- The checked-in pending payload is also a client/local-storage representation. It can preserve a retry candidate, but it is not by itself durable proof that an entity/date entitlement was consumed.

Therefore existing storage is **partially useful but insufficient as the sole canonical proof** for this target. It may prove a legacy claim in some records, but it does not reliably distinguish every handled-success event, grant, claim, pending grant, and historical entity/date across all current paths. The later implementation/storage contract must add or establish durable entitlement/grant evidence without using current status as a substitute. Exact schema and migration design are explicitly deferred.

## 7. Rollover by scheduling model

### 7.1 Genuinely unscheduled

At logical-day rollover:

- no obligation becomes Missed;
- no due date is created;
- no recurrence activates;
- no automatic History is inserted; and
- a positive streak may end when the closed Unscheduled day has no successful explicit outcome, according to Phase 1B-1.

History alone does not turn an unscheduled Task into scheduled recurrence. A user schedule action is required.

### 7.2 One-time scheduled

Before the effective due logical day closes, there is no Missed state. Once the effective due day closes without Complete:

- the one obligation becomes actively Missed by calculation;
- the effective cursor remains frozen on that obligation;
- later closed logical days extend calculated overdue Missed chronology and the one-time Missed streak;
- Done and Did My Best checkpoints do not satisfy the one-time obligation, although each explicit handled-success checkpoint is independently reward eligible for its own logical date; and
- no automatic Missed History row is required.

Complete ends the one unresolved one-time obligation. A pre-due checkpoint remains an explicit successful History fact without being treated as final obligation resolution; it earns its own handled-success reward for the checkpoint date, and a later Complete on another logical date earns another reward.

### 7.3 Rolling recurring

When the effective due day closes unresolved:

- active Missed begins by derivation;
- the effective due cursor freezes on that obligation;
- each additional overdue logical day extends calculated Missed chronology under the rolling rules;
- no new recurrence occurrence is created merely because another day passed; and
- no automatic History row is required.

Later Done or Did My Best resolves/rebases from the canonical action date under Phase 1B-1. A valid Delay moves the same effective obligation without changing Repeat. Complete terminates the rolling sequence.

### 7.4 Fixed-calendar recurring

When a fixed scheduled occurrence closes unresolved:

- that occurrence becomes calculated Missed;
- future fixed schedule membership remains intact;
- Missed streak counts missed scheduled occurrences, not every intervening logical day;
- an older unresolved Missed condition can coexist with future scheduled origins; and
- no automatic explicit Missed row is required.

A later fixed occurrence remains in the fixed calendar. A same-Task delayed origin and normal fixed origin on one effective date are one effective obligation with one resolution and one streak contribution, while both immutable origins remain available for chronology.

## 8. Lifecycle, Archive, Trash, and In Progress at rollover

### Permanently Complete

Permanent Complete has no recurrence rollover, no new Missed, no reward from time passage, and no future active schedule projection. Its History remains visible as historical fact. A later explicit correction may reopen lifecycle only through the Phase 1B-2A correction contract; rollover never does.

### Archived and Trashed

Archive and Trash suspend active accrual while the container is inactive. Rollover does not create History for inactive time or build a backlog of persisted Missed rows. Restore re-evaluates from preserved canonical facts and boundaries. If prior container, cursor, or occurrence facts cannot be proven, preserve the safest inactive/proven state and emit a diagnostic rather than guessing.

### In Progress

In Progress remains a workflow fact and does not satisfy recurrence. If a due boundary passes, the underlying schedule may derive Missed while workflow remains In Progress when the metadata is valid. Rollover must not synthesize Done, Did My Best, or a History row.

If In Progress metadata is stale or irreconcilable:

- preserve the safest proven Task configuration, explicit History, and lifecycle facts;
- do not infer a success from the existence of a session marker;
- do not erase explicit History to make the marker fit;
- emit a diagnostic classified as warning or needs attention; and
- allow a later explicit user action or repair workflow to resolve it.

## 9. Rollover idempotence

### Level 1: pure state evaluation

For identical authoritative facts and identical LogicalDayContext, the evaluator returns the same canonical state, calculated chronology, streaks, diagnostics, projection values, and eligibility decision. It does not need a mutation to become idempotent.

Evaluation must not depend on:

- the number of times a timer fired;
- the last stored status alone;
- whether another tab already ran a rollover;
- a queue array index; or
- whether a previous projection write happened to succeed.

### Level 2: persistence and side effects

Every mutation or downstream effect has a deterministic identity appropriate to its domain:

| Domain | Required conceptual identity |
|---|---|
| Rollover coordination | User + logical-day boundary/generation + relevant context identity |
| Explicit Task action | User + Task + explicit canonical event identity/revision |
| History replacement | User + Task + logical date + authoritative event/replacement identity |
| Projection repair | User + Task + projection target/version + canonical input revision |
| Reward eligibility/effect | Canonical successful event identity + effective obligation resolution where needed + reward program/version |
| Banked reward item | Stable reward effect identity, not reward queue position |
| Claim/consumption | Stable banked item/effect identity + claim operation identity |
| Achievement evaluation | Canonical event/evaluation identity + catalog/rules version when relevant |

Exact database keys are deferred unless an existing schema clearly supports the identity. The required behavior is non-negotiable: retries, refreshes, two tabs, repeated resume, and delayed recovery must not double insert History, advance `due_on`, consume an occurrence, bank dice, award economy, claim a reward, or credit an achievement.

## 10. Streak semantics

Current positive and Missed streaks are derived from effective chronology. Rollover does not increment a stored counter as canonical truth.

Examples:

- Rolling overdue Monday, Tuesday, Wednesday derives a Missed streak of 3.
- Fixed Mondays missed on 8/3 and 8/10 derives a Missed streak of 2, not a count of all intervening days.
- One-time overdue 8/10, 8/11, and 8/12 before Complete on 8/13 derives a Missed streak of 3.

A projection/cache may store a summary for performance, but it must be reproducible, revision-aware, and unable to alter chronology. Discovery of old calculated Missed days never creates reward eligibility.

## 11. Reward eligibility and downstream side effects

### 11.1 Pure eligibility

Reward eligibility is a pure decision attached to the first handled-success transition for one user, Task entity, and logical date. A handled success is exactly `Done`, `Did My Best`, or `Complete`; each has equal value of one normal banked roll. Eligibility asks:

```text
Did this entity/date become a handled success,
and has this entity/date's handled-success entitlement already been consumed?
```

If yes and no, respectively, the entitlement is eligible for one banked roll. The policy is not tied to whether the entity was Due, early, Not Due, historical, recurring, one-time, parent, child, or affected by rollover. The same entity/date remains consumed after a later non-success History interpretation.

Reward eligibility must not:

- mutate recurrence;
- change status;
- write History;
- move `due_on`;
- resolve another occurrence;
- reset Steps; or
- grant or claim economy.

The result should carry enough stable context for a later effect, conceptually:

```text
RewardEligibility = {
  eligible,
  reason,
  canonicalEventIdentity,
  taskId,
  resolvedEffectiveObligationIdentity: optional,
  outcome,
  logicalDate,
  rewardProgramVersion,
  entityIdentity,
  entitlementIdentity,
  policyClass: handled_success | ineligible,
  canonicalEventKind: explicit_user_action | authorized_automation
}
```

`policyClass` deliberately distinguishes handled-success reward entitlement from obligation satisfaction. A one-time pre-due Done/DMB checkpoint earns a reward but does not satisfy the Complete-only obligation. A fixed Not Due success earns a reward but does not consume a future fixed occurrence. A rolling early success earns a reward while the Task engine alone performs the cadence rebase.

### 11.2 Side-effect ordering

The preferred ordering is:

1. Validate the canonical Task command against current facts and LogicalDayContext.
2. Persist the canonical Task/History transition together where atomicity is required by the action boundary.
3. Emit or record a stable handled-success entitlement identity from the successful canonical event.
4. Apply or reconcile the optional economy side effect idempotently.
5. Refresh projections, pending reward state, achievement consumers, and UI.

The reward side effect must never happen first and then become proof that the Task succeeded. If reward persistence fails after the Task transition succeeds, do not roll back the Task merely because the optional side effect failed. Preserve or reconstruct the pending entitlement associated with the successful entity/date and retry the same identity; never create a second roll.

### 11.3 Current coupling to migrate later

`finalizeRecurringTasks()` currently lives in the reward controller and performs legacy Missed persistence, recurrence/status advancement, and optional Step reset. The target migration is:

- canonical Task command/engine transition owns recurrence advancement and any required Step reset that is truly part of recurrence semantics;
- reward controller consumes the resulting successful event and never calculates a next due date;
- `reconcileOverdueTaskMisses()` becomes compatibility/migration-only and is removed from ordinary automatic paths after canonical deployment/runtime proof; and
- a reward failure leaves canonical Task chronology correct while marking or retrying only the downstream effect.

## 12. Outcome reward boundaries

### Locked non-reward outcomes

| Outcome/lifecycle event | Target reward rule |
|---|---|
| Delay | Never success reward eligible. It changes an obligation boundary only. |
| Missed | Never success reward eligible. Calculated Missed never independently grants economy. |
| In Progress | Never reward eligible merely for being active or crossing rollover. |
| Archive/Trash | Never reward eligible merely for a container transition. |
| Time passage | Never reward eligible. |

### Done and Did My Best

Done and Did My Best are handled-success outcomes. Each earns exactly one normal banked roll for the first handled success of that entity on that logical date. They have equal reward value, including when the outcome is a checkpoint, extra-credit success, early success, or historical correction. A later status change on the same entity/date does not create a new entitlement.

### Complete

Complete is also a handled-success outcome and earns exactly one normal banked roll for its entity/date. Complete remains a distinct terminal Task-state transition under Phase 1B-2A; equal reward value does not collapse its lifecycle meaning into Done or Did My Best. The canonical transition terminates the Task before reward finalization, and reward finalization does not perform terminal lifecycle mutation.

### Extra-credit, checkpoints, and early success

These chronology cases remain distinct, but all are reward eligible when they create a handled success:

- a one-time pre-due Done or Did My Best is a reward-bearing checkpoint and does not satisfy the Complete-only obligation;
- a fixed-calendar Not Due Done, Did My Best, or Complete is a reward-bearing extra-credit success and does not consume a future fixed origin;
- a rolling early Done, Did My Best, or Complete earns a reward while recurrence rebase remains owned by the canonical Task transition; and
- a rolling overdue success earns a reward under the same entity/date rule.

Reward logic reacts to the canonical successful event. It does not infer reward from a positive streak, current status, current `due_on`, or recurrence side effect.

### Same-Task merged effective obligation

Two immutable fixed-calendar origins that merge into one effective Task obligation still produce at most one handled-success reward for that Task entity and logical date. Occurrence provenance remains separate. The stable entitlement identity is the Task entity plus logical date plus reward program/version, not one identity per origin.

### Authorized automation

An authorized canonical automation may earn the same reward only when it actually creates a `Done`, `Did My Best`, or `Complete` outcome for a specific entity and logical date. The same one-entitlement rule applies. Time passing, rollover, calculated Missed, an active Task, or a stale `In Progress` marker is not success and earns nothing. No current automation is presumed to create a successful outcome merely because a rollover path runs. In particular, stale `In Progress` must not be converted to Did My Best solely by rollover.

## 13. Product decisions — all resolved

NO GENUINE REWARD PRODUCT DECISIONS REMAIN UNRESOLVED. Implementation, storage, migration, compatibility, and QA questions remain possible, but they are not product-policy questions.

### Decision A — one-time pre-due checkpoint reward — RESOLVED: YES

A one-time Task due 8/10 that receives Done or Did My Best on 8/8 earns one normal banked roll for logical date 8/8. The checkpoint remains insufficient to satisfy the one-time obligation, which still requires Complete under Phase 1B-1/1B-2A. A later Complete on 8/10 earns another roll because it is a different entity/date entitlement.

### Decision B — fixed-calendar Not Due / extra-credit success — RESOLVED: YES

A fixed-calendar Task explicitly changed to Done, Did My Best, or Complete on a Not Due date earns one normal banked roll for that entity/date. The action does not consume or alter a future fixed scheduled origin. A later success on the due date earns a separate roll for that separate logical date.

### Decision C — rolling early success — RESOLVED: YES

A rolling Task explicitly changed to Done, Did My Best, or Complete before its current due date earns one normal banked roll. The canonical Task transition owns cadence rebasing; reward finalization only reacts to the successful event and cannot perform the rebase.

### Decision D — Done versus Did My Best value — RESOLVED: equal value

Done = one normal banked roll. Did My Best = one normal banked roll. Complete = one normal banked roll. Their Task-state meanings remain different: Done and Did My Best use recurrence-family success semantics, while Complete is terminal.

### Decision E — Parent, Step, and Substep independence — RESOLVED: same policy

Parent Tasks, Steps, and Substeps are independent reward-bearing Task entities. Each can earn at most one normal banked roll per logical date when its own outcome becomes Done, Did My Best, or Complete. Parent success does not imply child success; child success does not imply parent success; hierarchy depth does not change the rule.

## 14. Historical corrections and rewards

Historical correction changes chronology, Calendar, streaks, recurrence replay, or lifecycle only through the canonical correction path. The reward rule distinguishes an explicit historical user action from downstream recalculation:

| Correction | Canonical chronology | Economy target |
|---|---|---|
| Historical Missed/Empty/Not Due -> Done, Did My Best, or Complete | Explicit entity/date success; replay chronology downstream according to earlier phases. | One normal banked roll if that entity/date entitlement is unused. |
| Historical Done -> Did My Best, Did My Best -> Done, or either -> Complete on the same date | Current successful outcome may change, but the date remains a handled success. | Zero additional rolls when the entitlement was already consumed. |
| Historical Done -> Missed/Not Due/Unscheduled/cleared History -> Done | Current History changes back to success. | Zero additional rolls if the original entity/date entitlement was consumed; current History alone cannot decide otherwise. |
| Historical success -> non-success | Chronology and streaks recalculate under the correction contract. | No automatic clawback of a prior banked roll, claim, ledger entry, or economy grant. |
| Historical edit causes downstream rolling chronology changes on later dates | Recalculate derived chronology and recurrence as required. | No reward for downstream calculated dates unless each also has an actual canonical handled-success event. |
| Editing a legacy automatic Missed row | Preserve provenance and recalculate safely. | Reward only if the explicit edit itself turns an unrewarded entity/date into a handled success; do not infer a reward from legacy provenance alone. |

The historical user action is therefore reward eligible, but historical chronology recalculation is not. A future economy-repair tool, if desired, must be explicit, auditable, and separately authorized. This document defines no such UI or SQL.

## 15. Reward idempotence and recovery

### 15.1 Stable event identity

The normal handled-success entitlement should be keyed conceptually by:

```text
user
+ entity identity
+ logical date
+ handled-success reward program/version
```

The canonical event/effect record should additionally carry the explicit event or correction identity, outcome, and effective-obligation provenance when relevant. Entity identity must support a Parent Task, Step, or Substep without treating hierarchy implication as a success event.

The reward identity must not be keyed by:

- current status string;
- Done versus Did My Best versus Complete;
- current `due_on`;
- queue position or list order;
- recurrence origin count;
- number of action retries; or
- number of rollover runs.

The design must support a durable answer to: “Has this entity already received its handled-success reward for this logical date?”

This identity must ensure:

- a network retry cannot grant twice;
- refresh cannot grant twice;
- two tabs cannot grant twice;
- a same-Task merged effective obligation cannot grant once per origin;
- a queue reorder cannot cause the wrong banked reward to be claimed; and
- an already claimed or granted reward returns a replay/already-consumed result rather than applying another economy delta;
- a success -> non-success -> success sequence does not grant again when the original entitlement was consumed; and
- a Step reset does not erase the prior same-date entitlement.

### 15.2 Failure domains

Canonical Task/History success and reward success are separate domains:

```text
canonical Task transition succeeds
  -> explicit event and recurrence truth exist
  -> reward eligibility/effect identity is known
  -> reward write fails
  -> Task remains correct; effect is pending/retryable/reconcilable
```

The inverse is invalid:

```text
reward grant succeeds
  -> infer that Task transition must have succeeded
```

A later retry must load or receive the canonical event, recompute pure eligibility under the event's policy/version, and apply the same effect identity. It must not recompute reward eligibility from mutable current status or a new current date.

If the Task/History transition succeeds before reward banking, the pending entitlement must remain associated with the successful entity/logical date until the grant is durably recorded or an explicit reconciliation decision is made. A timeout is not evidence that no grant occurred; retry must use the same identity and accept the existing result.

### 15.3 Bank and claim

Banking a reward is an idempotent downstream effect. Claiming a banked reward is a second idempotent effect that consumes a stable banked item/effect identity. The current pending-dice RPC operation/replay pattern is useful compatibility evidence, but the final design must bind the bank item to the canonical reward entitlement/event rather than only Task/date claim shape. A claim is evidence about economy consumption; it is not proof that Task chronology was correct.

The reward queue is a view. It is not the identity of the reward and cannot be used as the claim key.

## 16. Achievement integration boundary

Achievements may consume:

- canonical explicit Task events;
- canonical effective state snapshots; or
- a separately identified evaluation intent for a logical-day/context generation.

Achievements may not:

- mutate recurrence or Task status;
- insert ordinary Missed History for time passage;
- use a reward grant as proof of Task success;
- duplicate credit on action/rollover retry; or
- replay economy effects merely because historical chronology changed.

Achievement consumers must distinguish three downstream facts:

1. the canonical handled-success event;
2. the handled-success reward entitlement; and
3. the reward grant/claim effect.

An achievement event may be recorded from the canonical event according to its own contract. It is not proof that the reward entitlement was consumed, and a reward grant is not proof that Task chronology or achievement progress was correct. Repeated retries must not duplicate achievement effects.

Rollover should request achievement evaluation only for an explicit canonical event or a defined derived-state evaluation identity. A batch of explicit History events may be captured in one transaction and evaluated once, with a deterministic operation identity. A calculated Missed day without an explicit event is not, by itself, an achievement source event.

If an achievement evaluation fails, preserve canonical Task chronology and record a retryable achievement effect/diagnostic. Do not roll back the Task solely because the optional achievement consumer failed.

## 17. Step/Subtask and hierarchy boundaries

This phase does not redesign hierarchy structure. It locks reward ownership:

- Parent Tasks, Steps, and Substeps are independent reward-bearing entities under the same handled-success policy;
- parent Task recurrence/lifecycle transition belongs to the canonical Task command/engine;
- Step/Substep completion produces its own reward entitlement only when that child has its own canonical Done, Did My Best, or Complete transition;
- child reward claim/entitlement identity must be distinct from parent Task identity;
- finishing a parent does not imply that unfinished Steps/Substeps became successful;
- a child success does not mutate the parent or siblings; and
- opening or claiming a reward modal cannot be required to advance parent recurrence;
- a child reset that is genuinely part of recurrence semantics belongs in the canonical Task transition plan;
- a child reset that is optional presentation/reward behavior must be downstream and failure-isolated; and
- a reset never erases an already-consumed entity/date entitlement.

Examples:

- Parent Done only: Parent = one roll; every untouched child = zero rolls.
- Step Done only: that Step = one roll; Parent and other children = zero rolls.
- Substep Done only: that Substep = one roll; Step and Parent remain unchanged.
- Parent Done + two Steps Done: three rolls for three entity identities.
- If all five Steps and the Parent become successful on one date: six rolls.
- A Step reset followed by Done on the same logical date remains at most one roll; Done on a new logical date may earn a new roll.

If a canonical automation explicitly transitions children into handled-success outcomes, each actual child transition earns its own entity/date entitlement. A parent visual or semantic completion alone never creates child rewards.

Current `finalizeRecurringTasks()` resets child rows after its legacy parent recurrence update when `subtasks_auto_reset` is enabled. That is a migration seam, not target authority.

## 18. Conceptual RolloverEvaluation result

The next implementation phase may use a pure result shaped conceptually as:

```text
RolloverEvaluation {
  context: LogicalDayContext,
  fromLogicalDay: logical date or null,
  toLogicalDay: logical date,
  canonicalTaskStates: derived results,
  projectionRepairs: safe reproducible projections,
  canonicalEvents: explicit events only,
  rewardEligibilityIntents: explicit successful events only,
  achievementEvaluationIntents: explicitly identified events/evaluations,
  diagnostics: TaskStateDiagnostic[],
  idempotenceIdentity: stable context/effect identity
}
```

Its entries must be classified:

1. **Derived state requiring no persistence** — calculated Missed, streaks, future membership, and effective active status.
2. **Safe projection repair** — allow-listed Task fields that exactly match canonical facts and pass revision/concurrency guards.
3. **Canonical business events** — explicit user actions or separately authorized corrections, not ordinary time passage.
4. **Downstream side-effect intents** — rewards and achievement evaluations tied to canonical event identities.

Normal rollover may therefore contain mostly derived state and zero Task-row mutation. A non-empty plan is not proof that a business event occurred.

## 19. Legacy compatibility and retirement strategy

### Engine rollover path

Retain the pure engine and planning boundary. Change the target planner so calculated Missed chronology and stale In Progress do not produce synthetic rollover History. Keep projection allow-lists and guarded writes. Separate canonical explicit events from projection repairs and reward/achievement intents.

### Legacy RPC fallback

The legacy `adhdice_reconcile_task_rollover` semantics conflict with this contract because they derive transitions from stored `due_on`/status, write automatic Missed or Did My Best rows, advance recurrence inside rollover, and use a separate ledger authority. It may remain only as a migration/compatibility path while canonical deployment is proven. It must eventually be disabled/retired rather than used as a second business-state authority.

### `reconcileOverdueTaskMisses()`

Classify as compatibility/migration-only. It must not remain a normal automatic Missed writer under the target contract. Any future use must be an explicit legacy provenance reader, preview-first repair, or separately authorized data operation.

### `finalizeRecurringTasks()`

Classify as a legacy reward/recurrence coupling seam. It must eventually stop calculating next due, changing stored status, and resetting recurrence children. The canonical Task command/engine transition owns those facts. The reward controller retains only downstream effect orchestration and retry/reconciliation.

### Engine/legacy mutual exclusion

Once the canonical path and deployed runtime are proven, a fallback cannot run after a canonical result merely because a projection was stale or an optional reward effect failed. Authority selection must be explicit, generation-aware, and fail closed on unsupported/missing deployment rather than silently changing semantics.

## 20. Offline and long-gap evaluation

If the app closes on 8/10 and reopens on 8/15, the engine evaluates the full closed logical range from authoritative facts and the 8/15 LogicalDayContext. It does not assume five rollover jobs ran.

| Case | Reconstructed target |
|---|---|
| Rolling overdue | One frozen unresolved obligation; calculated Missed chronology for applicable closed logical days; no synthetic History. |
| Fixed recurring | Missed only on scheduled fixed occurrences; future fixed membership survives. |
| One-time overdue | One unresolved obligation with daily calculated overdue chronology until Complete. |
| Unscheduled | No obligation and no Missed from inactivity. |
| Archived/trashed | No inactive-time accrual; restore later re-evaluates preserved facts. |
| Permanently Complete | No new active schedule or Missed. |

Discovering old calculated Missed days does not grant rewards, bank dice, consume occurrences, or trigger an achievement merely because the app is now open.

## 21. Diagnostics contract for rollover and rewards

No diagnostics are implemented here. The locked diagnostic contract should classify at least these cases:

| Case | Preferred classification and behavior |
|---|---|
| Invalid timezone or rollover configuration | Error/needs attention; reject state-changing evaluation rather than silently use midnight/browser defaults. |
| Chronology cannot be reconstructed | Error/needs attention; preserve facts and reject unsafe projection/effect. |
| Legacy automatic Missed conflicts with explicit History | Warning or needs attention; read provenance, do not create another row or rewrite user fact. |
| Stale `due_on` projection | Safe projection repair only when canonical target and revision are proven; otherwise warning and no overwrite. |
| Duplicate rollover side-effect identity | Idempotent replay/no-op; never repeat Task/History/economy effects. |
| Reward eligibility exists but effect is missing | Warning/retryable effect; keep canonical Task transition. |
| Duplicate reward grant attempt | Reject or return existing effect result; no second economy delta. |
| Reward record exists without canonical successful event | Error/needs attention; reject new effect and require explicit audited repair. |
| Reward finalizer attempts recurrence after canonical transition | Error/reject compatibility mutation; emit migration diagnostic. |
| Achievement duplicate/conflicting evaluation | Idempotent replay when same identity; needs attention for conflicting payload/version. |
| Ambiguous legacy rollover rows | Error/needs attention; preserve safest facts and require explicit repair. |
| Stale/irreconcilable In Progress metadata | Warning/needs attention; no synthetic success or outcome. |

## 22. Transition and side-effect invariants

The following invariants lock the architecture. They are semantic acceptance criteria for later implementation, not tests added by this phase.

1. **One LogicalDayContext authority.** All Task state evaluation uses one user-scoped timezone, rollover boundary, instant, and derived logical date.
2. **Midnight alone does not roll.** Gregorian midnight cannot mark a Task Missed or advance recurrence before the configured boundary.
3. **Configured boundary is authoritative.** The same boundary rule applies regardless of whether the app is active, sleeping, or reopened later.
4. **DST uses local calculation.** Logical-day transitions are timezone-aware local calendar calculations, not fixed 24-hour millisecond arithmetic.
5. **Truth is reconstructable.** Canonical Task truth can be derived without a successful rollover mutation.
6. **Rollover is coordination.** A rollover run can repair projections or dispatch effects but cannot be the only reason a state exists.
7. **Calculated Missed is not ordinary explicit History.** A calculated Missed day remains derived unless an explicit user/repair event exists.
8. **Rollover does not manufacture automatic Missed History.** Time passage alone never inserts ordinary Missed rows.
9. **Legacy automatic provenance stays distinct.** Old automatic rows are read as compatibility provenance and never silently become new user-authored facts.
10. **Unscheduled inactivity is not Missed.** A genuinely unscheduled Task never becomes Missed merely because a logical day closes.
11. **One-time overdue remains one obligation.** Daily overdue Missed chronology does not create recurrence or consume checkpoints.
12. **Rolling overdue freezes one obligation.** Additional overdue days extend calculated chronology without creating new occurrences.
13. **Fixed misses are scheduled-occurrence misses.** Fixed Missed streaks count scheduled missed occurrences, not all elapsed days.
14. **Future fixed membership survives older Missed.** An older active Missed condition cannot erase future fixed schedule origins.
15. **Same-Task effective merging resolves once.** Multiple immutable origins on one effective date yield one effective outcome and at most one reward.
16. **Archive/Trash do not accrue active Missed.** Inactive container time creates no synthetic History backlog.
17. **Complete never rolls forward.** Permanent Complete prevents recurrence, new Missed, and time-passage rewards.
18. **In Progress is not success.** Rollover never auto-converts In Progress to Done or Did My Best.
19. **In Progress is orthogonal.** Valid workflow metadata may coexist with a derived active Missed schedule.
20. **Pure evaluation is idempotent.** Equal facts plus equal context produce equal state, projections, diagnostics, and eligibility.
21. **Persistence/effects are idempotent.** Repeated calls with one stable identity cannot duplicate state or side effects.
22. **Cross-tab retries are safe.** Two tabs/resume events cannot double History, cursor advancement, occurrence consumption, or rewards.
23. **Streaks are derived.** Stored counters or cached summaries never outrank recalculated effective chronology.
24. **Projection repair is subordinate.** A stale `Task.status`, `due_on`, or active field cannot overrule canonical facts.
25. **Projection failure is non-business failure.** A failed projection write does not create a new Task event or alter canonical truth.
26. **Reward eligibility is pure.** It cannot mutate Task state, History, recurrence, occurrence identity, or lifecycle.
27. **Delay is not reward eligible.** Delay changes an obligation boundary only.
28. **Missed is not reward eligible.** Calculated or explicit Missed never independently grants success economy.
29. **In Progress is not reward eligible.** Workflow activity alone never grants success economy.
30. **Time passage is not reward eligible.** Discovering overdue chronology never grants a reward.
31. **Reward finalization does not own recurrence.** Reward code cannot calculate or persist next due/status as a side effect.
32. **Canonical transition precedes reward effect.** A reward grant cannot be proof that Task/History state succeeded.
33. **Reward failure preserves Task truth.** An optional failed reward effect leaves canonical Task chronology correct and retryable.
34. **Reward identity is event-based.** Status, current cursor, queue index, and rollover count are insufficient reward identities.
35. **Historical recalculation does not manufacture rewards.** Downstream chronology changes after a historical edit do not create rewards; the explicit entity/date action that becomes an unrewarded handled success may earn one.
36. **History correction does not claw back.** Done -> Missed or cleared Complete does not automatically reverse prior economy.
37. **Achievement evaluation is downstream.** Achievements consume identified canonical events/state and cannot mutate recurrence/status.
38. **Achievement retries are idempotent.** Repeated evaluation identity cannot duplicate achievement credit or notifications.
39. **Reward claiming is item-based.** Queue reorder cannot cause the wrong banked reward to be consumed.
40. **Child reward is separate.** Step/Subtask reward effects cannot advance parent recurrence or parent lifecycle.
41. **Child reset ownership is explicit.** A child reset is either part of canonical recurrence transition or a failure-isolated downstream effect, never an accidental reward prerequisite.
42. **Diagnostics replace guesses.** Unsupported, stale, contradictory, and ambiguous facts produce a diagnostic and safe no-op/rejection rather than speculative mutation.

The following reward-policy invariants amend the earlier broad reward language and lock the final Phase 1B product contract:

43. **Handled-success set.** Done, Did My Best, and Complete are the only handled-success reward outcomes.
44. **Equal reward value.** Done, Did My Best, and Complete each have equal value: one normal banked roll.
45. **Entity/date scope.** Reward entitlement is scoped to user + Task entity + logical date + handled-success reward program/version.
46. **One maximum.** One entity/date can consume at most one handled-success reward entitlement.
47. **Status names are not identities.** Done, Did My Best, and Complete do not carry separate reward entitlements.
48. **Success-to-success is not additive.** Done -> Did My Best and Did My Best -> Complete on the same date do not create another roll.
49. **Reversal does not restore entitlement.** Success -> non-success -> success does not create another roll when the original entitlement was consumed.
50. **Entitlement survives History changes.** Later Missed, Not Due, Unscheduled, cleared History, Archive, Trash, or another non-success interpretation does not erase a consumed entitlement.
51. **Current History is insufficient.** Current History status alone cannot decide reward eligibility; durable entitlement or ledger evidence is required.
52. **Historical success is eligible.** An explicit historical user action that changes an unrewarded entity/date into Done, Did My Best, or Complete may consume one reward entitlement.
53. **Recalculation is not action.** Derived chronology, streak, recurrence replay, and downstream calculated dates never manufacture rewards.
54. **Historical reversal has no clawback.** Reversing a rewarded historical success does not automatically remove banked rolls, claims, ledger entries, or economy.
55. **One-time pre-due checkpoint.** Pre-due Done or Did My Best earns a reward without satisfying the one-time Complete obligation.
56. **One-time later completion.** A later Complete on a different logical date can earn a separate reward for that date.
57. **Fixed Not Due success.** Done, Did My Best, or Complete on a fixed-calendar Not Due date earns a reward for that date.
58. **Fixed future membership.** A fixed Not Due reward does not consume or alter a future fixed scheduled origin.
59. **Fixed later date.** A later fixed due-date success earns another reward for its different logical date.
60. **Rolling early success.** Rolling early Done, Did My Best, or Complete earns a reward.
61. **Rolling rebase ownership.** Rolling recurrence rebase remains Task-engine-owned; reward finalization cannot perform it.
62. **Overdue success.** Rolling overdue Done, Did My Best, or Complete earns a reward for the successful logical date.
63. **Hierarchy independence.** Parent, Step, and Substep are separate reward-bearing entities.
64. **Parent does not imply child.** Parent success does not create child success or child rewards.
65. **Child does not imply parent.** Child success does not create parent success or parent rewards.
66. **Nested child inclusion.** Substeps follow exactly the same reward rule as Parents and Steps.
67. **Same-Task merge.** Merged fixed origins produce at most one reward for one Task entity/date, while provenance remains separate.
68. **Reset preservation.** Resetting a recurring Step does not erase its consumed same-date entitlement.
69. **Reset new date.** Re-completion after reset may earn a reward only on a new logical date whose entitlement is unused.
70. **Automation boundary.** Authorized automation-created Done, Did My Best, or Complete may earn one entity/date reward; time passage, rollover, calculated Missed, active state, In Progress, Delay, Missed, Archive, and Trash cannot.

## 23. Scenario matrix

These 80 scenarios are concrete architecture fixtures. Rows 1–48 retain the useful logical-day, rollover, lifecycle, diagnostic, and idempotence coverage from the prior document; rows 49–80 make the final reward policy explicit. “History write” means a new explicit row, not a calculated Timeline day. “Effect” means reward/economy/achievement side effect.

| # | Scenario and starting facts | Logical-day/derived result | Persistence and History | Reward/economy | Idempotence/diagnostic |
|---:|---|---|---|---|---|
| 1 | Configured 06:00; 8/8 23:59 -> 8/9 00:01 | Same logical day; no rollover | No write; no Missed History | None | Repeated read same context; no diagnostic |
| 2 | Configured 06:00; 8/9 05:59 -> 06:00 | Context advances once at 06:00 | Derived changes only unless safe projection differs | None from time passage | Context identity changes once; repeat is no-op |
| 3 | Configured 14:30; 8/9 14:29 -> 14:30 | Same rule at non-default boundary | No midnight-based write | None | Uses configured boundary; no diagnostic |
| 4 | App sleeps across 06:00 and resumes at 11:00 | Engine evaluates current logical day and closed chronology | No required rollover job or synthetic rows | No discovery reward | Resume may retry safely |
| 5 | App closed 8/10, reopens 8/15 | Full gap reconstructed from facts | No five-job History backlog | No reward from old Missed discovery | Same facts replay identically |
| 6 | Unscheduled Task inactive across five days | Remains Unscheduled; no obligation | No due date, no History | No reward | No synthetic Missed diagnostic |
| 7 | One-time due 8/10 incomplete; evaluate 8/11 | Active Missed for one obligation | No automatic Missed row; cursor freezes | No reward | Repeated evaluation unchanged |
| 8 | One-time overdue second day 8/12 | Same unresolved obligation; second calculated Missed day | No new automatic row | No reward | Daily derivation does not create occurrence |
| 9 | One-time overdue with DMB checkpoint on 8/11 | Checkpoint explicit; obligation remains unresolved | Only user DMB History row | One reward for the 8/11 entity/date; later Complete on another date can earn another | Durable entitlement identity required |
| 10 | One-time Complete on 8/13 after Missed chain | Permanent Complete ends chain | Explicit Complete History; clear active projection if safe | 1 roll for 8/13; no reward from the Missed chain | Retry returns existing effect |
| 11 | Rolling due 8/10 unresolved, evaluate 8/11 | Active Missed; effective cursor frozen on 8/10 | No automatic History | No reward | Pure replay stable |
| 12 | Rolling overdue through 8/13 | Calculated Missed streak 3 under daily overdue rules | No rows required | No reward from time | No occurrence per day |
| 13 | Rolling overdue, Done on 8/13 | Explicit success rebases next due from action date | Canonical Task/History transition; no reward-side recurrence write | 1 roll for 8/13 | One canonical event/effect identity |
| 14 | Rolling early Done on 8/8 for due 8/10 | Cadence rebases from 8/8 under Phase 1B-1 | Explicit event; next cursor is projection | One reward for 8/8 | Retry cannot rebase or reward twice |
| 15 | Fixed Monday misses | Monday occurrence calculated Missed | No automatic row; future membership remains | No reward | Scheduled occurrence identity retained |
| 16 | Fixed M/W/F misses Monday and Wednesday | Missed streak counts two occurrences | No automatic rows | No reward | Intervening Tuesday is not a Missed occurrence |
| 17 | Fixed older Missed plus future Friday | Older active condition coexists with Friday membership | No rewrite of fixed schedule | No reward from old condition | Diagnostic only if cursor cannot identify origin |
| 18 | Fixed Friday delayed to next Monday plus normal Monday origin | One effective Monday obligation with two origins | Delayed event explicit; one Monday outcome | At most one reward for the effective resolution | Stable merged-obligation identity |
| 19 | Archived Task across several logical days | Evaluation suspended while archived | No inactive-time History | No reward | Restore later recalculates; no backlog |
| 20 | Trashed Task across several logical days | Evaluation suspended while trashed | No inactive-time History | No reward | Preserve restore facts; diagnose unknown container |
| 21 | Permanently Complete Task crosses rollover | No active schedule or Missed | No write | No time-passage reward | Repeat no-op |
| 22 | In Progress crosses due boundary | Schedule may derive Missed; workflow remains orthogonal | No synthetic DMB/Done History | No reward | Warning only for stale metadata |
| 23 | In Progress metadata stale with no occurrence proof | Safest provable schedule state; no guessed success | No synthetic outcome | No reward | Needs-attention diagnostic |
| 24 | Same rollover function called twice in one tab | Same pure plan; second coordination is no-op/replay | No duplicate rows/projection bump | No duplicate effect | Single-flight/local gate assist only |
| 25 | Two tabs call rollover simultaneously | One canonical identity wins; other observes replay/no-op | No duplicate History/cursor advancement | No double bank/award/claim | Durable effect identity required |
| 26 | Startup, visibility, pageshow, and timer all fire | Same context/generation is evaluated once semantically | No duplicate writes | No duplicate effect | In-flight and durable guards cooperate |
| 27 | Explicit Done event after canonical validation | Successful handled outcome | Task/History canonical transition first | One normal banked roll for entity/date | Event and entitlement identity survive refresh |
| 28 | Explicit Did My Best event after validation | Successful handled outcome | Task/History canonical transition first | One normal banked roll for entity/date | Same idempotence requirements as Done |
| 29 | Delay current obligation to future date | New effective boundary; no success | Explicit Delayed event only; no reward row | No success reward | Retry does not move cursor twice |
| 30 | Explicit Missed action | User-owned Missed fact | Explicit History permitted | No reward | Manual event identity prevents duplicates |
| 31 | Complete on Not Due/Unscheduled day | Permanent Complete; no future schedule | Explicit Complete event | 1 roll for the Complete logical date | Lifecycle never waits for reward |
| 32 | Reward write fails after Task/History success | Canonical Task remains resolved | Effect marked/reconstructed as pending later | No rollback; retry same effect identity | Warning/retryable diagnostic |
| 33 | Reward retry after network failure | Same eligibility recomputed from saved event | No duplicate Task/History | Existing effect returned or applied once | Stable operation identity |
| 34 | Reward finalizer tries to advance recurrence after engine action | Reject duplicate recurrence authority | No second Task mutation | Effect may continue independently | Migration diagnostic |
| 35 | Same effective obligation has two fixed origins | One resolution | One canonical event, origins preserved | At most one reward | Merged identity deduplicates |
| 36 | Claim queue reordered between display and click | Claim targets stable bank item | No Task mutation | Correct item consumed once | Queue position ignored |
| 37 | Achievement evaluation runs twice for one explicit event | Same achievement state/effect result | No Task mutation | No duplicate achievement credit or XP | Operation identity replay |
| 38 | Rollover discovers calculated Missed after five days | Calculated chronology appears | No automatic History | No reward/achievement from discovery alone | No synthetic event |
| 39 | Legacy automatic Missed row matches calculated Missed | Read as legacy corroborating provenance | No new row or rewrite | No reward | Warning only if provenance otherwise safe |
| 40 | Legacy automatic Missed conflicts with explicit Done | Explicit chronology wins per precedence; diagnose provenance conflict | Preserve explicit user fact; no automatic replacement | 1 roll if this explicit entity/date success is otherwise unrewarded; no replay from legacy row | Needs-attention/repair later |
| 41 | Past Missed manually changed to Done | History/streak chronology changes | Explicit correction only | One reward if that entity/date entitlement is unused | Correction and reward identities remain distinct |
| 42 | Past Done changed to Missed | History/streak chronology changes | Explicit correction only | No automatic clawback | No economy reverse |
| 43 | Historical Complete cleared | Lifecycle may reopen under explicit correction rules | Correction History/projection only | No automatic economy reversal | Needs explicit correction identity |
| 44 | Invalid timezone or rollover value | No authoritative logical date | Reject state-changing evaluation | No reward/effect | Error/needs attention |
| 45 | Stale `due_on` but chronology is reconstructable | Canonical cursor wins | Safe guarded projection may repair due field | No reward from repair | Projection identity/revision guards |
| 46 | Reward record exists without successful canonical event | No valid reward eligibility | Preserve evidence; do not invent Task success | Reject new effect; later audited repair | Error/needs attention |
| 47 | Step marked Done while parent remains open | Child event only | No parent recurrence/status mutation | One Step reward; no Parent reward | Separate child entitlement identity |
| 48 | Recurring parent canonical success includes child reset requirement | One canonical Task transition owns both if semantics require | Guarded Task/History/child plan later | Reward consumes result; does not reset | Failure boundary explicit |
| 49 | Today Empty -> Done | Today becomes handled success | Explicit canonical event | 1 roll | Retry uses same entity/date entitlement |
| 50 | Today Empty -> Did My Best | Today becomes handled success | Explicit canonical event | 1 roll | Same value as Done |
| 51 | Today Empty -> Complete | Today becomes terminal handled success | Explicit canonical event | 1 roll | Same value as Done/DMB; lifecycle remains terminal |
| 52 | Done -> Did My Best on the same date | Handled-success outcome remains true | History/status meaning may change | 0 additional rolls | Same entitlement |
| 53 | Did My Best -> Complete on the same date | Terminal success replaces prior success meaning | Complete transition remains canonical | 0 additional rolls | Same entitlement |
| 54 | Done -> Missed -> Done on one date | Later success restores chronology | Explicit changes preserved | 0 additional rolls | Consumed entitlement survives reversal |
| 55 | Recurring Done on 8/8 and 8/9 | Two successful logical dates | Two canonical success events | 1 roll per date = 2 | Date is part of identity |
| 56 | One-time pre-due Done on 8/8; due 8/10 | Checkpoint succeeds; Complete obligation remains | Explicit 8/8 History | 1 roll on 8/8 | Does not satisfy one-time obligation |
| 57 | One-time pre-due Did My Best on 8/8; due 8/10 | Checkpoint succeeds; Complete obligation remains | Explicit 8/8 History | 1 roll on 8/8 | Same value as Done |
| 58 | Later one-time Complete on 8/10 | One-time obligation is satisfied and Task terminates | Explicit 8/10 Complete | 1 additional roll | Different logical date |
| 59 | Fixed Friday Task explicitly Done on Not Due Wednesday | Extra-credit success; Friday membership remains | Explicit Wednesday event | 1 roll on Wednesday | Does not consume Friday |
| 60 | Same fixed Task explicitly Done on Friday | Friday scheduled occurrence succeeds | Explicit Friday event | 1 additional roll | Wednesday and Friday are distinct dates |
| 61 | Rolling Task due Friday explicitly Done Wednesday | Cadence rebases from Wednesday | Canonical Task transition owns rebase | 1 roll on Wednesday | Reward does not rebase |
| 62 | Rolling Task overdue then explicitly Done | Overdue occurrence resolves and cadence rebases | Canonical Task/History transition | 1 roll on success date | No reward from overdue discovery |
| 63 | Historical Missed -> Done with unused entitlement | Historical date becomes explicit handled success | Chronology replay is downstream | 1 roll if entitlement unused | Current status is not the authority |
| 64 | Historical Not Due -> Did My Best with unused entitlement | Historical date becomes explicit handled success | Fixed membership remains governed by recurrence | 1 roll if entitlement unused | No future-date consumption |
| 65 | Historical Done -> Did My Best after reward | Success meaning changes, date already handled | Explicit correction | 0 additional rolls | Same entity/date entitlement |
| 66 | Historical Done -> Missed -> Done after reward | Historical success is restored | Explicit corrections preserved | 0 additional rolls | No duplicate after reversal |
| 67 | Parent Done only | Parent succeeds; children unchanged | Parent event only | Parent = 1; children = 0 | No hierarchy implication |
| 68 | Step Done only | Step succeeds; Parent unchanged | Step event only | Step = 1; Parent = 0 | Independent entity identity |
| 69 | Substep Done only | Substep succeeds; ancestors unchanged | Substep event only | Substep = 1 | Nested depth does not exclude reward |
| 70 | Parent Done + two Steps Done | Three independent successes | Three canonical entity events | 3 rolls | No global one-per-day cap |
| 71 | Parent Complete with untouched Steps | Parent terminates; children remain untouched | Parent event only | Parent = 1; children = 0 | Completion does not infer child outcomes |
| 72 | Explicit child automation creates Step Done | Actual child handled-success event exists | Child transition is canonical/authorized | Step = 1 | Parent reward remains independent |
| 73 | Step Done -> reset -> Done on same date | Child is successful again on same date | Reset does not erase prior reward fact | Maximum 1 Step roll | Entitlement survives reset |
| 74 | Step reset -> Done on next logical date | New date becomes handled success | New canonical child event | 1 new Step roll | Date differs |
| 75 | Two tabs process the same success | One canonical entity/date success | Durable identity arbitrates replay | Maximum 1 roll | Second tab returns existing result/no-op |
| 76 | Reward write fails, then retry | Task/History success remains canonical | Pending entitlement is reconstructed/retried | Maximum 1 roll | Timeout is not evidence of no grant |
| 77 | Two fixed origins merge into Monday | One effective Task obligation with provenance retained | One canonical Monday resolution | Maximum 1 Task roll | No reward per origin |
| 78 | Rollover calculates Missed | Derived overdue chronology changes | No synthetic success event | 0 rolls | Time passage is not success |
| 79 | Stale In Progress crosses rollover | Workflow remains orthogonal; no synthetic success | No automatic DMB/Done History | 0 rolls | No stale-session reward |
| 80 | Historical edit changes downstream rolling chronology | Later dates may recalculate | Only explicitly edited success is an event | Only that entity/date may earn; derived dates earn 0 | No reward cascade from recalculation |

## 24. Handoff

### A. What Phase 1B now locks

- One timezone-and-boundary-based LogicalDayContext authority.
- Rollover as coordination rather than the creator of Task truth.
- Calculated Missed as non-persistent ordinary chronology.
- Scheduling-family-specific rollover semantics for unscheduled, one-time, rolling, and fixed-calendar Tasks.
- No automatic inactive-time History for Archive/Trash.
- No synthetic rollover success for In Progress.
- Derived streaks rather than rollover-incremented canonical counters.
- Pure reward eligibility separated from economy/achievement side effects.
- Done, Did My Best, and Complete as equal-value handled-success reward outcomes.
- One handled-success reward entitlement per entity per logical date, independent of status name, due-ness, chronology family, hierarchy, or rollover.
- Historical explicit success edits as reward eligible, while derived recalculation remains reward-ineligible.
- Parent, Step, and Substep reward independence, including reset preservation and explicit child automation.
- Canonical Task transition before optional reward effects.
- Durable entitlement/grant identity requirement, retry/recovery, and no duplicate effects.
- Historical corrections separated from derived recalculation, automatic clawback, and duplicate reward replay.
- Achievement and hierarchy consumers kept downstream of Task authority.

### B. Remaining genuine product decisions

None. Phase 1B product semantics are architecturally locked for recurrence, workflow/lifecycle, logical-day rollover, handled-success rewards, historical reward edits, hierarchy reward independence, and reward idempotence. Remaining questions are implementation, storage, migration, compatibility-retirement, command-contract, and QA concerns.

### C. Required later data/storage amendments

Later implementation planning must address:

- stable scheduled-versus-effective occurrence representation for Delay;
- same-Task effective-obligation grouping and provenance;
- canonical explicit event identity and revision semantics;
- durable handled-success entitlement identity, reward grant ledger identity, and retry state;
- proof/reconciliation rules for existing Task/Subtask reward claims, pending reward rows, reward rolls, banked rolls, and legacy ambiguity;
- stable banked reward item identity and claim consumption;
- achievement evaluation identity/version handling; and
- any transaction boundary needed for canonical Task/History action persistence.

No schema or SQL is changed here.

### D. Legacy paths to retire or narrow

- `adhdice_reconcile_task_rollover` as a business-state fallback;
- `reconcileOverdueTaskMisses()` as a normal automatic Missed writer;
- `finalizeRecurringTasks()` as reward-owned recurrence/status mutation;
- duplicate legacy recurrence/status resolvers once all callers use the canonical command/read contract; and
- rollover-triggered achievement evaluation from calculated/automatic Missed artifacts.

Retirement requires separate deployment and runtime proof. This document does not remove or disable any path.

### E. Recommended next phase

Phase 1C should define the final canonical command/read/output contract at a high level:

- one `LogicalDayContext` input;
- one canonical Task read result;
- one explicit action command result containing Task/History transition, projection, diagnostics, and reward eligibility;
- one rollover evaluation result that distinguishes derived state, safe projection repair, explicit events, and downstream effect intents;
- stable occurrence/effective-obligation identities; and
- adapter ownership and mutual exclusion rules for current engine/legacy callers.

Phase 1C should not start schema migration, reward UI, or broad legacy deletion until the contract and product reward decisions are accepted.

**Phase 1B product semantics are architecturally locked.** All product behavior necessary for recurrence, workflow/lifecycle, logical-day rollover, handled-success rewards, historical reward edits, hierarchy reward independence, and reward idempotence is now defined. Remaining issues are implementation, migration, storage, command-contract, compatibility-retirement, and QA concerns. Phase 1C is recommended next; it is not started by this document.

## Verification and scope record

This documentation pass performed source inspection only. Per the request, it did not run tests, lint, build, typecheck, browser automation, a dev server, SQL, or Supabase operations. The required verification is `git diff --check` after the authorized document is written.

Only the following file is authorized to change:

```text
docs/architecture/task-state-phase-1b2b-rollover-reward-semantics.md
```

Production code, tests, schema, SQL, Supabase, UI, diagnostics implementation, and version surfaces remain untouched.
