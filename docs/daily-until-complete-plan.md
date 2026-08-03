# Daily Until Complete Rules

Last reviewed: 2026-08-03
Role: active product rules and unresolved decisions

## Purpose

This document records the current product rules for the `Daily Until Complete` repeat option and permanent `Complete` status. It stays compact and does not duplicate the Task State Engine's full state or persistence contract.

## Current Behavior

- The Repeat menu labels the option exactly `Daily Until Complete` and exposes it with the normal repeat choices.
- The option is valid for tasks, Steps, and nested descendants.
- Successful `Done` or `Did My Best` outcomes advance to the next eligible occurrence through the existing recurrence engine.
- The option continues until the user marks the task `Complete`; ordinary success does not permanently finish it.
- Current repeat summaries and client next-due helpers support `repeat_interval`, including `Every X days until complete` when the interval is greater than one.
- Client support for the documented repeat behavior does not prove deployed rollover RPC parity.

## Scheduling and Logical-Day Rules

- Logical-day and timezone handling follow the shared recurrence and Task State Engine authorities.
- At rollover, `Pending` becomes `Missed`; `In Progress` becomes `Did My Best`.
- An unresolved overdue task keeps its earlier due date visible while the current occurrence is evaluated.
- If another logical day passes after `Missed`, another missed History record may be added.
- When an overdue Daily Until Complete task is marked `Done` or `Did My Best`, the action backfills one `Missed` record per skipped day, records today's successful occurrence, and advances the next occurrence.
- Full missed-day backfill is specific to this repeat rule, not a general recurrence rewrite.
- Repeating behavior must use logical occurrence identity and explicit History; this document does not define those engine internals.

## Status and Completion Rules

- One-off tasks use `Pending`, `In Progress`, `Missed`, and `Complete`; occurrence-success statuses are for recurring tasks.
- Recurring tasks use `Done`, `Did My Best`, and `Missed` for occurrence outcomes. `Complete` means permanently finished.
- Permanent Complete requires confirmation, removes recurrence, preserves task metadata and due-date history, and stops future streak tracking.
- The user-facing History wording is `Marked Complete`; the internal event concept is `completed_permanently`.
- A parent cannot be permanently completed while any descendant remains unfinished; parent and child status remain independent otherwise.
- A failed multi-step completion path must report the error and use the owning guarded rollback behavior where available.

## History and Calendar Rules

- Permanent Complete creates one completion History event, with metadata recording whether it also counted as today's due occurrence.
- If Complete is applied on today's due occurrence, History and Calendar show one Complete marker rather than separate success and Complete markers.
- Daily Until Complete missed-day backfill creates one missed record per missed logical day.
- Calendar projection and History identity belong to the shared state authorities; this document records product expectations only.

## Rewards Boundary

Complete produces one reward event for the selected task, including when it is also the final successful Daily Until Complete occurrence. Already-completed descendants must not award again merely because a parent is completed.

Reward eligibility is calculated and routed through the owning application path; this document does not claim reward-bank runtime or deployment validation.

## Editing and Backfill Rules

- Daily Until Complete is edited through the normal Repeat control and retains its configured interval.
- Backfill occurs as part of the overdue successful action or the applicable rollover path; it is not an automatic migration of all historical rows.
- Editing, changing frequency, or changing the interval must preserve the current due-date and History guardrails.
- The exact behavior for backfilling after cross-frequency edits remains unresolved.
- Manual SQL or RPC deployment is not established by this documentation pass.

## Confirmed Limitations

- Daily Until Complete is documented and source-supported for daily cadence, including its current every-X-days interval behavior.
- Weekly and monthly Until Complete semantics are not established as equivalent shipped rules; ordinary weekly/monthly recurrence support must not be read as proof of Until Complete parity.
- Recurrence-model constraints, deployed rollover parity, reward-bank runtime behavior, Calendar rendering parity, and browser behavior require separate validation.
- Batch Complete, broad archive/restore redesign, and other deferred flows are not promoted to current behavior here.

## Unresolved Product Decisions

- Cross-frequency Until Complete semantics for weekly, monthly, and custom recurrence.
- How frequency or interval edits interact with overdue occurrences and missed-day backfill.
- Whether Calendar should expose additional metadata or controls for permanent completion.
- Product-level restore/undo behavior for permanently completed archived tasks.
- Any parent/child completion or recurrence coupling beyond the current independent rules; hierarchy decisions remain in the hierarchy document.
- Batch and bulk completion semantics where product behavior is not finalized.

## Non-Authorities

- [Task State Engine](TASK_STATE_ENGINE.md) owns state evaluation, logical dates, History identity, action planning, and persistence projection.
- [TaskApp architecture](TASKAPP_ARCHITECTURE.md) owns production routing and mutation ownership.
- [Hierarchy decisions](task-hierarchy-plan.md) own parent/Step/Substep product decisions.
- [Task QA](qa/TASKS.md) and [Rewards QA](qa/REWARDS_ROLL.md) own browser procedures.
- [Verification](VERIFICATION.md) and the [historical release archive](archive/2026-08-retired/current-state-release-history.md) own evidence limits and chronology.

## Related Documents

- [Task State Engine](TASK_STATE_ENGINE.md)
- [TaskApp architecture](TASKAPP_ARCHITECTURE.md)
- [TaskApp source map](TASKAPP_SOURCE_MAP.md)
- [UI system](UI_SYSTEM.md)
- [Agent workflow](AGENT_WORKFLOW.md)
- [Verification](VERIFICATION.md)
- [Task QA](qa/TASKS.md) and [Rewards QA](qa/REWARDS_ROLL.md)
- [Current State](CURRENT_STATE.md)
- [Archived prior Daily Until Complete plan](archive/2026-08-retired/daily-until-complete-plan.md)

## Historical Plan

The earlier data-contract, rollout, implementation, and release sequencing are preserved in the [archived Daily Until Complete plan](archive/2026-08-retired/daily-until-complete-plan.md). The archive is historical reference only.
