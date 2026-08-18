# Task State Engine

Last reviewed: 2026-08-17
Role: canonical behavioral contract

## Purpose and architecture lock

The Task State Engine is the one domain authority for current Active Status,
recurrence, Calendar projection, streak derivation, action planning, and the
persistable Task State projection. This document records the locked simplified
model. It supersedes transitional rules that treated bounded History, calculated
Missed rows, modal History, or legacy compatibility status as a separate source
of truth.

The verified pre-7.9.33 production baseline includes migrations
`20260818045732 patch_task_state_auto_missed_history_copy_7_9_31` and
`20260818045827 migrate_legacy_history_copy_7_9_31`; `task-state-command` Edge
is ACTIVE at version 24 with `verify_jwt=true`, pinned commit
`17f6badd751fe38261aae9cbb5828a979f32de62`, and deployment SHA
`9c07a32e504333008d08ff79abf04b2641cbfa06dec4c546454e927a9b1d9d65`. This
document is not proof that the new
simplified architecture, future Auto Missed SQL/RPC changes, browser behavior,
or complete runtime convergence has been implemented or deployed.

## History authority

- Every saved Task History row is canonical fact. Its logical date belongs to the
  row and Calendar displays the recorded outcome on exactly that date.
- Manual History changes only through another manual action. Automatic Missed
  and automatic Did My Best are also real canonical History and count normally.
- Editing one History date does not rewrite unrelated saved dates.
- An automatic row may be removed or recalculated only when a manual correction
  proves that its underlying occurrence was not actually due. Independent daily
  obligations are not removed by correcting another date.
- History without modern occurrence metadata remains valid for its recorded
  date, Calendar, statistics, and streaks. It must not consume an arbitrary
  current or future recurrence occurrence.
- Rolling recurrence may use the latest relevant successful History row to
  establish the next occurrence even when that row is old. For example, Done on
  6/8 with Every 3 Months and no later relevant success makes 9/8 the next due
  date.

History is fact. Calculated schedule state is not a substitute History row.
Recovery may materialize a legitimately missing automatic outcome, but must not
reconstruct ancient History from recurrence guesses.

## Schedule and Calendar authority

The live Task due date/cursor is the authoritative start of future scheduling.
Recurrence calculates future obligations from that cursor and the current
schedule metadata; it does not rewrite saved History.

Calendar is a date projection, not a second state system:

- Past: saved History displays its recorded outcome. Without saved History the
  date is Not Due, except recovery may first materialize legitimate missing
  automatic outcomes after the last recorded History point.
- Today: saved History wins. Otherwise a live obligation is Open/Due; with no
  live obligation the date is Not Due.
- Future: Calendar is schedule projection only. A projected future Due date is
  not History and is not an additional active obligation.

Changing the live cursor changes future scheduling from that cursor. If a
Weekdays task is moved from Monday 8/17 to Tuesday 8/18, 8/15, 8/16, and 8/17
are Not Due, 8/18 is Due, and handling 8/18 resumes normal Weekdays recurrence.

Calendar edits use the same canonical command infrastructure as every other
Task State mutation. A History correction upserts or changes only the selected
logical-date fact, retaining known occurrence metadata; it does not silently
rewrite unrelated dates or create a parallel Calendar authority.

## One Active Status authority

There is one Active Status result consumed everywhere: Table, List, Home,
editor, Steps/Substeps, filters, counts, smart lists, and child previews.
Surfaces consume the projection; they do not recalculate current status from a
Task row, a selected Calendar cell, or a private History subset.

History date state and Active Status are different projections. An earlier
unresolved Missed can keep Active Status Missed while today’s Calendar cell is
Open/Due. After a successful recurring outcome, Active Status immediately uses
the next due date and becomes Upcoming or Not Due; the saved History date remains
Done or Did My Best. Complete is permanent lifecycle completion.

Unscheduled means no due date and no repeat frequency. It remains active until
permanently Complete or schedule metadata is added. Done/Did My Best records a
success for that date but does not permanently finish it. Unscheduled tasks do
not accumulate Missed because they were not done; a blank date is not a missed
obligation.

## Missed, recovery, and recurrence

A scheduled obligation left unresolved may become automatic Missed canonical
History. Automatic behavior follows obligation identity:

- Daily obligations are independent. Correcting 8/14 Auto Missed to Done does
  not remove valid Auto Missed rows on 8/15 or later.
- Rolling overdue continuation may create dependent automatic rows. For Every 3
  Days, an 8/16 Auto Missed can make 8/17 dependent; correcting 8/16 to Done
  moves the next due date to 8/19, so the dependent 8/17 automatic row may be
  removed or recomputed to Not Due.
- A manually entered 8/17 Missed is a manual fact and remains until manually
  changed.

Recovery may fill scheduled unresolved obligations missed during app/server
unavailability, but never goes farther backward than the last recorded History
instance for that Task. It must not infer ancient rows from a recurrence guess.

The recurrence authority owns logical-date arithmetic, fixed and rolling
membership, occurrence/cursor continuation, and next-due calculation. It must
preserve later saved successes when replaying an older correction. It must also
allow an old successful row without occurrence metadata to establish the next
rolling occurrence without assigning that row a new occurrence.

## Streak authority

Streaks derive from canonical History plus the schedule facts needed to decide
whether a Missed represents a real obligation:

- Done and Did My Best are positive successes.
- Missed contributes to missed streak only when it represents a real obligation.
- Not Due and an Unscheduled blank do not create missed streak.
- Optional/Unscheduled blank dates can break positive streak continuity without
  becoming Missed.

Thus 8/14 Done, blank 8/15, blank 8/16, and 8/17 Done yields current positive
streak 1 and missed streak 0. History statistics must not turn a calculated
gap into a saved outcome.

## Mutation and trusted persistence boundary

Status changes from Table, List, Home, Calendar, editor, and batch actions use
the same canonical command infrastructure. A successful command reconciles
Task State, canonical History, recurrence/cursor, Calendar, streaks, rewards,
and all UI projections from the returned authoritative result.

The browser supplies intent only. Trusted server/Edge code derives privileged
outcome date, occurrence, provenance, timestamps, replay identity, and reward
facts. SQL/RPC enforces ownership, revision, replay, provenance, and
transactional persistence; it is not a second recurrence authority.

## Legacy and compatibility rule

Legacy rows and compatibility projections may remain as migration or translation
evidence. They must not independently decide current Active Status, recurrence,
Calendar truth, or current streaks after convergence. Existing explicit old
History is preserved, not reconstructed or arbitrarily assigned to a modern
occurrence.

## Implementation impact map (pending implementation)

### Can remain as the convergence target

- `src/lib/task-state-engine/engine.ts`, `recurrence.ts`,
  `effective-timeline.ts`, `calendar-authority.ts`, `action-authority.ts`,
  and `rollover-authority.ts` remain the pure planning/projection seams.
- `src/lib/task-state-canonical/command-service.ts`, `engine-input.ts`,
  `history-projection.ts`, occurrence/schedule projection, and the trusted
  `supabase/functions/task-state-command/*` orchestration remain the canonical
  command boundary.
- `src/lib/task-history.ts` can retain date identity, explicit-row
  normalization, Calendar row formatting, and canonical streak helpers after
  their inputs and calculated-gap semantics are aligned to this contract.
- Existing canonical History facts, occurrences, schedule boundaries,
  provenance, command-operation, revision, and reward-entitlement structures are
  sufficient for this lock. No new Task table or architecture layer is implied.

### Must be simplified or rewritten

- `src/lib/task-state-engine/effective-timeline.ts` must distinguish saved
  canonical History from schedule projection and automatic canonical outcomes;
  calculated Missed cannot remain a non-persistent substitute for a real
  automatic Missed fact.
- `src/lib/task-history.ts` helpers that synthesize overdue or missing Missed
  dates, including `buildMissingScheduledMissedHistoryDateKeys` and
  `buildOverdueTaskMissedDateKeys`, must become recovery/diagnostic-only or be
  replaced by obligation-aware canonical command planning.
- `src/lib/task-state-engine/read-authority.ts` must return the one Active
  Status projection from complete canonical History. Its legacy switch and
  `getTaskDisplayStatusWithHistory` fallback cannot remain current-state
  authorities.
- Canonical compatibility projection may continue serving legacy columns, but
  it must be derived output only; it cannot override canonical History,
  recurrence, or Active Status.

### Paths that must stop making decisions

- Direct List/row/child calls to `getTaskDisplayStatusWithHistory`, stored-status
  fallbacks, and any surface-local status/count/filter calculation must consume
  `resolveActiveTaskStatuses` and its shared projection instead.
- `src/lib/task-state-engine/legacy-adapter.ts` and legacy History reads may
  translate data at the boundary, but may not select current status, recurrence,
  Calendar truth, or migration rows.
- The old direct rollover path in
  `supabase/patch_secure_task_rollover_rpc.sql` must not routinely synthesize or
  overwrite legacy History. The canonical trusted rollover command must own
  automatic Did My Best/Missed materialization and dependent-row correction.

### Loading and cache paths to collapse

- `useWorkspaceData` must load the full canonical History snapshot for all Tasks
  during workspace startup. Remove the semantic split represented by
  `loadCriticalTaskHistoryFacts`, `selectCriticalTaskHistoryFacts`, and a
  modal-only authoritative `loadFullTaskHistory` path.
- The task-scoped modal cache, full-workspace History cache, streak-summary
  fallback, and rollover-only History read must converge on one canonical
  startup snapshot plus ordinary mutation/realtime refreshes. A modal must not
  become more authoritative merely because it loaded older rows.

### Tests to rewrite or add

- Rewrite engine, Effective Timeline, Calendar, History action, rollover, and
  streak tests that expect calculated/non-persistent Missed or bounded-vs-full
  History authority.
- Add focused coverage for canonical automatic Missed, independent daily
  obligations, rolling dependent-row recomputation, recovery’s last-History
  boundary, old rows without occurrence metadata, old rolling success anchoring,
  Unscheduled blanks, and the Monday-to-Tuesday cursor example.
- Add projection parity tests proving every Task surface consumes one Active
  Status map and every mutation route uses the same command result.
- Add SQL/Edge contract tests for trusted automatic History provenance,
  occurrence ownership, replay/idempotence, and rejection of the old direct
  rollover behavior. These remain source/contract checks until deployment is
  separately verified.

### Schema conclusion

No genuine schema change is required by the locked rules. Existing canonical
History, occurrence, schedule-boundary, provenance, replay, and entitlement
fields express the needed identity and trust boundaries. If later implementation
work finds a hard invariant the existing schema cannot express, stop and report
that contradiction before adding fields or tables.

## Related documents

- [`WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) — full
  canonical startup History and cache ownership.
- [`TASKAPP_ARCHITECTURE.md`](TASKAPP_ARCHITECTURE.md) — shared Active Status
  read authority and UI projection routing.
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — architecture-lock status, pending
  convergence work, migration finding, and verification boundaries.
- [`VERIFICATION.md`](VERIFICATION.md) — evidence and runtime-validation rules.
