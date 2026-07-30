# Task State Engine

Version 7.6.1 keeps the 7.6.0 engine contract pure and adds a read-only legacy adapter and development shadow comparator. It is not connected to production mutations.

## Terminology and contract

- **Lifecycle** is `active`, `complete`, `archived`, or `trashed`. Only explicit user lifecycle commands may archive, trash, restore, or delete.
- **Active status** is the task-wide state: Unscheduled, Pending, In Progress, Missed, Upcoming, Not Due, Delayed, Done, Did My Best, or Complete.
- **Calendar state** is per logical date: Open, In Progress, Done, Did My Best, Missed, Delayed, Complete, Scheduled, Not Due, or No Entry.
- **History** contains only Done, Did My Best, Missed, Delayed, or Complete, with `manual`, `rollover`, `reconciliation`, or `import` provenance. Open is virtual.
- **Logical date** is calculated from the supplied timestamp, IANA timezone, and rollover time. The real timestamp remains separate.

`evaluateTaskState` accepts a task snapshot, explicit History, current timestamp, timezone, rollover time, recurrence, and an optional proposed action or forward-recompute boundary. It returns lifecycle, active status, Calendar states, handled/current-day facts, continuous overdue, recurrence facts, proposed History changes, an allow-listed task patch, streak disposition, reward eligibility, and validation errors. Identical input produces identical output.

## Outcome matrix

| Task type | Allowed success outcomes | Other valid handling |
| --- | --- | --- |
| Scheduled one-off | Did My Best, Complete | Missed, Delay |
| Dormant Unscheduled one-off | Did My Best, Complete; In Progress is snapshot state | No Missed or Done |
| Daily / Every X Days | Done, Did My Best | Missed, Delay |
| Daily / Every X Days Until Complete | Did My Best, Complete | Missed, Delay |
| Fixed weekly/monthly recurring | Done, Did My Best | Missed, Delay |
| Fixed weekly/monthly Until Complete | Did My Best, Complete | Missed, Delay |

Valid success outcomes are also allowed on Not Due days. Only one authoritative outcome and one stable reward identity exist per task/logical date.

## Rollover truth table

| Prior state | Rollover result |
| --- | --- |
| Scheduled/overdue Open | One Missed row per completed unresolved day; frozen `dueOn`; today Open |
| In Progress | Did My Best once, then normal recurrence behavior |
| Manual Missed | Already handled; no duplicate or advancement |
| Done / Did My Best | No duplicate; retain outcome-derived next due |
| Delayed | Already handled; preserve streak and wait for delayed due |
| Complete | No future occurrence |
| Unscheduled Open | No Missed; break positive streak; today remains Open |

## Recurrence and active status

Rolling intervals rebase from the actual logical success date and support every positive interval. Fixed weekdays/weeks and fixed-date/ordinal months retain their calendar pattern. Early success consumes only the nearest upcoming scheduled occurrence; its identity is returned. Further Not Due outcomes do not consume another occurrence before the next scheduled opportunity. Complete terminates recurrence.

An unresolved scheduled date enters continuous overdue: each completed logical day is Missed, today is Open, active status stays Missed, and `dueOn` stays frozen. A future due date is Upcoming at 1–7 logical days and Not Due at 8 or more. No due date plus no cadence is Unscheduled.

## Calendar, streaks, and rewards

Explicit History overrides virtual Calendar state. Handled Today requires an explicit current-date Done, Did My Best, Missed, Delayed, or Complete. Missed Today requires current-date Missed History; an older active Missed state is insufficient.

Done, Did My Best, and Complete increment/start a positive streak. Delay preserves it. Scheduled Missed increments/starts a missed streak. Unscheduled inactivity breaks only the positive streak. Eligible reward facts are returned for Done, Did My Best, Complete, and automatic In Progress rollover; Missed, Delay, Open, and inactivity are ineligible. The engine never awards rewards.

## Safety and recalculation

The proposed task patch is an allow-list limited to status, due/active occurrence fields, recurrence cursor/identity, and completion time. It cannot represent archive, trash, restore, deletion, content, list, folder, or metadata mutations. The engine performs no database, React, rewards, or Realtime work. Forward recomputation preserves History before its boundary; explicit History remains authoritative and stale derived plans are replaced only in returned proposals.

## Legacy adapter contract

`adaptLegacyTaskState` maps an already-loaded database-shaped Task and its already-loaded History rows into the engine input contract. It maps one-off, Daily, Every X Days/custom, Daily Until Complete, fixed weekly, fixed monthly-date, and fixed monthly-ordinal recurrence; lifecycle and active status; due/active occurrence dates; explicit History outcomes; and occurrence identity. The caller supplies the current timestamp, IANA timezone, and rollover time.

The adapter is pure, does not mutate source rows, and performs no query. Malformed dates, intervals, weekdays, statuses, and contradictory History flags become warnings. Unsupported combinations remain explicit, including a missing pre-Archive/pre-Trash active status, missing counted-occurrence identity, and within-day due-time behavior.

## Development shadow mode

Shadow mode compares the engine with current read-only status, History, Calendar, overdue, recurrence, and patch-derivation helpers over a bounded date window. Results are classified as `match`, `approved semantic difference`, `legacy value unavailable`, `adapter warning`, `possible engine defect`, or `legacy-data anomaly`. Reward eligibility and streak disposition are returned by the engine but marked unavailable where production has no equivalent pure read authority.

The runtime bridge is development-only, registers no subscription, performs no query, and never runs automatically. With a local development build open and hydrated, run:

```js
window.__ADHDICE_RUN_TASK_STATE_SHADOW__()
```

Optional targeting:

```js
window.__ADHDICE_RUN_TASK_STATE_SHADOW__({
  taskIds: ["TASK_ID"],
  startDate: "2026-06-01",
  endDate: "2026-07-30",
  includeMatches: false,
  includeTitles: true,
})
```

The command returns the report and stores it at `window.__ADHDICE_LATEST_TASK_STATE_SHADOW__`. Titles are omitted by default, and the console prints only grouped counts rather than full History tables.

The patch assertion accepts only `status`, `dueOn`, `activeStatusLogicalDate`, `activeOccurrenceDueOn`, `recurrenceCursor`, `satisfiedOccurrenceIdentity`, and `completedAt`. Any other field is a safety violation. Archived and Trashed tasks may be inspected when explicitly targeted but may not produce patches.

Expected differences from the 7.5.39 production system include the engine’s explicit virtual `Open` Calendar state where legacy Calendar says `Due`, handled-day treatment for Delay and Complete, a formal Unscheduled active state, nearest-occurrence consumption for early fixed-calendar success, and continuous logical-day overdue proposals where legacy helpers expose only scheduled misses. These are approved semantics, not changes to the engine.

Shadow mode performs no writes. It does not import or call Supabase writes, task mutation hooks, History synchronization, reward queues, rollover RPCs, lifecycle actions, SQL, or persistence.

## Future work

Persistence transactions, production behavior integration, SQL parity, and multiple-times-per-day recurrence are intentionally unresolved. Multiple daily occurrences will require occurrence-level outcome and reward identities.
