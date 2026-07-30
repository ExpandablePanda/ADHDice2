# Task State Engine

Version 7.6.0 introduces a pure, database-free contract. It is not connected to production callers.

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

## Future work

Production adapters, persistence transactions, UI integration, SQL parity, and multiple-times-per-day recurrence are intentionally unresolved. Multiple daily occurrences will require occurrence-level outcome and reward identities.
