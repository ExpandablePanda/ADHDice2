> Archived on 2026-08-03.
>
> This body preserves earlier rollout, implementation, and planning history.
> Current hierarchy decisions remain at [docs/task-hierarchy-plan.md](../../task-hierarchy-plan.md).
> Current Daily Until Complete rules remain at [docs/daily-until-complete-plan.md](../../daily-until-complete-plan.md).
> This archived file is historical reference only.
> Agents should not treat release-specific implementation phases as current authority.
>
# Daily Until Complete / Complete Status Plan

Last updated: 2026-06-20

Role: active working

## Scope

This document locks the product rules and phased rollout plan for the ADHDice
`Daily Until Complete` repeat option plus the permanent `Complete` task status.

`6.7.6` is the data-contract foundation only.

`6.7.7` implements the recurrence and rollover foundation for
`daily_until_complete`, including repeat-menu exposure, shared daily scheduling,
manual missed-day backfill on successful overdue occurrence completion, and the
manual SQL patch needed for the canonical rollover RPC.

`6.7.8` implements the first real `Complete` action path for single-task status
changes and editor saves: confirmation, descendant-recursive block checks,
permanent-complete history writes, one-time reward banking, recurrence removal,
and archive-bucket hiding via `status = 'complete'`. Calendar rendering,
restore/undo semantics, and broader filter polish still remain deferred.

`6.7.9` refines that Complete behavior so blocked parent completion rolls the
single-task UI status back immediately instead of leaving a stale local
`Complete` chip/circle, and so individually completed Steps/Substeps stay
visible under active parents. Completed child rows now archive/hide only when
their parent becomes completed/archive-like, using the existing derived
parent-child visibility rules rather than new descendant writes in this pass.

## Locked Product Rules

### One-off tasks

- One-off tasks use `Pending -> In Progress -> Missed / Complete`.
- One-off tasks do not expose occurrence-success statuses `Done` or `Did My Best`.
- One-off overdue tasks can stay `Pending` / `In Progress` or be marked `Missed`.
- One-off overdue tasks show red overdue title chips such as `Overdue 1d` and `Overdue 3d`.
- One-off `In Progress` stays `In Progress` overnight.
- One-off `Pending` stays `Pending` overnight and becomes visually overdue.

### Recurring tasks

- Recurring tasks use `Done`, `Did My Best`, and `Missed` for occurrence-level outcomes.
- `Done` means the current occurrence was completed.
- `Did My Best` means enough progress was made to preserve the occurrence or streak.
- `Missed` means the current occurrence was missed.
- `Complete` means the recurring task is permanently finished.
- `Missed` can be selected manually and can also be created by rollover, but not for one-off tasks.
- At rollover for recurring tasks:
- `In Progress` becomes `Did My Best`.
- `Pending` becomes `Missed`.
- Existing `Missed` stays `Missed`, and some repeat types may add another missed history record.

### Daily Until Complete

- Label exactly `Daily Until Complete`.
- It appears in the normal Repeat menu alongside existing repeat options.
- It has no helper text in the menu.
- It is valid for tasks, Steps, and nested descendants.
- It follows the existing streak and missed-streak model.
- If marked `Done` or `Did My Best`, it schedules the next daily occurrence using the existing daily recurrence engine.
- If left `Pending` at rollover, it becomes `Missed`.
- If left `In Progress` at rollover, it becomes `Did My Best`.
- If already `Missed` and another day passes, it adds another `Missed` history record.
- It backfills one `Missed` history record per missed day.
- While overdue, it keeps the old due date visible so the user can see how long it has been overdue.
- If overdue and marked `Done` or `Did My Best` today, it backfills missed records for skipped days, records today's successful occurrence, and then advances to the next daily occurrence.
- It stops recurring only when marked `Complete`.
- Full missed-day backfill is specific to `Daily Until Complete`, not a broad recurrence rewrite.

### Complete

- Status label is `Complete`.
- Status color is dark green.
- User-facing history wording is `Marked Complete`.
- Internal history event concept is `completed_permanently`.
- `Complete` means the task is permanently finished.
- `Complete` removes recurrence.
- `Complete` preserves metadata.
- `Complete` preserves the due date as historical metadata.
- `Complete` preserves final streak history but stops future streak tracking.
- `Complete` creates one `completed_permanently` history row with metadata recording whether the action also counted as today's due occurrence.
- If a `Daily Until Complete` task is due today and is marked `Complete`, history and calendar should show one Complete marker, not separate Done + Complete markers.
- `Complete` requires confirmation before applying:
- `Mark permanently Complete? This task will stop recurring and move to Archive.`
- If completion is blocked, the confirmation modal should not open first.
- Blocked message:
- `Complete all Steps before completing this task.`
- If completion fails partway through, later runtime code should roll back if feasible and show an error.

### Rewards / banked rolls

- Whenever something is marked `Complete`, it banks rolls.
- `Complete` creates one reward event total, not two.
- If a `Daily Until Complete` task is due today and is marked `Complete`, that one action counts as both the final successful occurrence and the permanent completion, but still creates only one reward event.
- One-off `Complete` uses the same reward logic as normal one-off completion.
- If a parent is completed and archives descendants, already-completed descendants do not bank rolls again.
- Only the selected task's `Complete` action banks rolls at that moment.

### Parent / Step / Substep rules

- Parent and child history are independent.
- Parent and child status are independent.
- Parent and child recurrence are independent.
- Parent rollover does not rewrite children.
- Child rollover does not require parent recurrence.
- A Step or deeper descendant can be `Daily Until Complete` even when its parent is not recurring.
- A parent can be `Done` or `Did My Best` even when Steps remain unfinished.
- A parent cannot be `Complete` until all descendants recursively are `Complete`.
- Descendants means Steps, Substeps, and deeper nested rows.
- Parents do not auto-complete when descendants become `Complete`.
- The user must manually complete the parent.
- Any unfinished descendant blocks parent `Complete`.
- Steps with no due date and no recurrence do not inherit parent rollover.

### Archive behavior

- `Complete` moves the selected task to Archive immediately after confirmation.
- If a parent is marked `Complete`, archive the completed parent and all completed descendants recursively.
- Descendants should already be `Complete` because parent completion is blocked otherwise.
- Undo should restore the parent and descendants to their prior archive or list state.
- If a completed archived task is restored, it stays `Complete` and recurrence remains removed.
- Restored `Complete` tasks stay hidden from normal active views unless Archive or another explicit filter shows them.
- If a `Complete` task is manually changed back later, recurrence does not automatically return.
- If recurrence is manually re-added later, old history stays visible but the active streak starts fresh.
- Changing a `Complete` task''s status while archived should not automatically move it out of Archive.

### History and calendar

- `completed_permanently` appears on the calendar as a distinct Complete marker.
- Calendar display uses `Marked Complete`.
- If `Complete` counted as today''s successful occurrence, calendar shows one Complete marker with metadata indicating it also counted as the due occurrence.
- Calendar must not show two separate markers for the same click.
- `Daily Until Complete` missed backfill creates one `Missed` record per missed day.

## Data Contract Chosen In 6.7.6

- `adhdice_clean_task_status` gains enum value `complete`.
- `adhdice_clean_task_repeat_frequency` gains enum value `daily_until_complete`.
- `adhdice_task_history` keeps the existing per-day unique row shape and gains:
- `event_type text not null default 'status' check (event_type in ('status', 'completed_permanently'))`
- `counted_as_due_occurrence boolean not null default false`

### Why this history shape

- It is minimal and column-based.
- It does not require a new table.
- It preserves the existing unique `user_id + task_id + entry_date` history row model.
- A future permanent-complete action can use one row with:
- `status = 'complete'`
- `event_type = 'completed_permanently'`
- `counted_as_due_occurrence = true/false`
- `was_completed = true/false` according to the final occurrence semantics
- That one-row contract is enough for later calendar code to render one `Marked Complete` marker instead of separate Done + Complete markers.

## Phased Rollout

### R1 data contract

- Add SQL migration for enum expansion and history metadata columns.
- Update local TypeScript database types.
- Add plan/spec documentation.
- Sync version and release notes.

### R2 recurrence / rollover

- Teach client and SQL recurrence helpers about `daily_until_complete`.
- Implement missed-day backfill rules.
- Keep overdue due date behavior for `daily_until_complete`.
- Preserve existing ordinary recurrence behavior outside the new repeat type.
- Implemented in `6.7.7`:
- Repeat menus now expose `Daily Until Complete` in the same selection surfaces as the other repeat options.
- Shared client recurrence helpers now treat `daily_until_complete` as daily for next due calculation, due-date classification, and repeat summaries.
- User-driven `Done` / `Did My Best` for overdue `daily_until_complete` rows now backfills one `Missed` history row per skipped day before advancing to the next daily occurrence.
- A new manual SQL patch file, `supabase/patch_daily_until_complete_rollover_rpc.sql`, updates the canonical rollover RPC path so app-load/day-change rollover can backfill missed days and preserve anchored overdue `due_on` values for unresolved `daily_until_complete` rows once the SQL is run manually.

### R3 Complete action / rewards / archive

- Add runtime `Complete` action semantics.
- Add descendant-recursive block checks.
- Add permanent completion history writes.
- Add reward banking rules.
- Add archive move and later undo/restore handling.
- Implemented in `6.7.8`:
- Single-task status-change surfaces and existing-task editor saves now route `Complete` through a confirmation modal instead of the generic direct status write path.
- Parent rows are blocked immediately with `Complete all Steps before completing this task.` until all descendants recursively already have `status = 'complete'`.
- Confirmed `Complete` writes now set `status = 'complete'`, clear recurrence back to `repeat_frequency = 'none'`, preserve the row's due date and other metadata, and write one task-history row for today with `event_type = 'completed_permanently'`.
- If the source task was `daily_until_complete`, overdue skipped days are backfilled as `Missed` before the single permanent-complete history row is written for today.
- Reward banking now reuses the existing completion reward path and treats `Complete` as rewardable exactly once, so `done -> complete` does not bank twice.
- Active/archive derived views now treat `status = 'complete'` as archive-like, which hides completed rows from normal active views without redesigning the archive schema in this phase.
- Still deferred after `6.7.8`:
- Batch `Complete` flows.
- Calendar rendering for `Marked Complete`.
- Restore/undo semantics for completed archived rows.
- Any broader archive/trash redesign beyond treating `complete` as archive-like.

### R3 follow-up refinement in 6.7.9

- Blocked parent `Complete` attempts now roll the single-task status UI back to the prior status instead of leaving a stale local `Complete` selection.
- Child Step/Substep `Complete` keeps its own confirmation path, recurrence removal, history write, and one-time reward banking, but no longer uses Archive wording or immediate archive-like hiding.
- Individual completed child rows remain visible under active parents and only hide/archive together when the parent itself is completed/archive-like.

### R4 calendar / filters / UI polish

- Add calendar rendering for `Marked Complete`.
- Add one-off vs recurring status menu restrictions.
- Add overdue chip refinements.
- Polish filters, status chips, and archive visibility rules.

## Explicit Non-Goals Still Deferred After 6.7.9

- Batch `Complete` from bulk-edit flows is still deferred.
- No Complete calendar marker rendering yet.
- No product-level restore or undo semantics yet for completed archived rows.
- No broader archive/trash redesign.
- No final status/filter polish beyond the archive-like hiding/refinement needed through `6.7.9`.
