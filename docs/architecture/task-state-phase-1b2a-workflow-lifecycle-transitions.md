# Phase 1B-2A: Canonical Workflow and Lifecycle Transition Semantics

Status: active working architecture specification
Scope: Delay, Complete, Archive, Trash, In Progress, lifecycle precedence, historical workflow/lifecycle corrections, diagnostics, and persistence classification
Required architecture sources: [Phase 0 inventory](task-state-phase-0-inventory.md), [Phase 1A core model](task-state-phase-1a-core-model.md), [Phase 1B-1 recurrence transitions](task-state-phase-1b1-recurrence-transitions.md)
Implementation status: specification only; not implemented

## Purpose and boundaries

Phase 1B-1 locked the four scheduling models, Unscheduled versus Not Due, one-time obligation semantics, rolling and fixed recurrence, Calendar overrides, streak behavior, schedule boundaries, and the diagnostic fail-safe contract. Phase 1B-2A defines what the canonical workflow and lifecycle actions mean before implementation begins.

This phase defines:

- workflow actions versus outcomes versus lifecycle/container state;
- Delay for genuinely unscheduled, one-time, rolling, and fixed-calendar Tasks;
- the deferred-occurrence identity problem created by Delay;
- fixed-calendar same-Task Delay collision merge semantics and preserved provenance;
- Complete as a successful outcome and terminal lifecycle transition;
- Archive and Trash as lifecycle/container transitions;
- lifecycle/status precedence;
- In Progress as persisted workflow/session state;
- historical corrections involving Delay and Complete;
- invalid-transition diagnostics;
- persistence classification; and
- transition invariants and scenario fixtures.

This phase does not implement production behavior, UI, diagnostics, schema, SQL, Supabase, rollover execution/idempotence, persistence projection timing, rewards/economy, or reward side effects. Those remain later work, especially Phase 1B-2B.

`CURRENT` sections record source evidence only. Current production behavior is not automatically the target contract. `TARGET` sections define the canonical model. No rule in this document reopens Phase 1B-1 unless the required Delay identity amendment is explicitly recorded in Part 3.

## Locked inputs from Phase 1B-1

The following rules are fixed inputs:

- Four scheduling models exist: genuinely unscheduled, one-time scheduled, rolling recurring, and fixed-calendar recurring.
- `Unscheduled` and `Not Due` Calendar states are different.
- Due date plus no Repeat is one-time, not implicit Daily.
- Complete satisfies a one-time obligation.
- One-time overdue Done and Did My Best are checkpoints only.
- Rolling Done and Did My Best rebase `nextDue = successLogicalDate + interval`.
- Rolling Missed freezes the current due obligation.
- Fixed-calendar scheduled dates remain independent membership facts; a canonical same-Task effective-date merge may group their obligation outcomes without changing that membership.
- A fixed older Missed condition can coexist with future scheduled occurrences.
- Later fixed Done or Did My Best can clear active Missed without rewriting earlier Missed dates or consuming a future fixed occurrence.
- Fixed Missed streak counts missed scheduled occurrences; rolling Missed streak can count overdue logical days.
- Manual due-date and Repeat changes are forward-authoritative schedule boundaries.
- Manual Calendar scheduling-state overrides win for their date without automatically rewriting recurrence.
- Explicit History/checkpoint outcome and active obligation state are separate facts.
- The canonical engine emits diagnostics instead of silently guessing through unresolved contradictions.

## Part 1: Workflow actions, outcomes, and lifecycle

### Workflow action

`TARGET` — A workflow action changes how an active Task is currently being handled without necessarily ending the Task’s lifecycle.

The workflow actions in this phase are:

- **Delay** — change when one current or selected obligation is expected;
- **In Progress** — record that active work/session handling is underway.

Workflow actions are not interchangeable with successful outcomes. Delay may create an explicit Delayed History event for audit, but it does not satisfy an occurrence. In Progress is a workflow/session fact and does not create History by itself.

### Outcome

`TARGET` — An outcome is a user-recorded result on a logical date:

- **Done** — successful handling of the applicable occurrence, subject to Phase 1B-1 family rules;
- **Did My Best** — successful handling of the applicable occurrence, subject to Phase 1B-1 family rules;
- **Missed** — an explicit or calculated failure interpretation, never a success;
- **Delayed** — explicit audit of a Delay action, not a satisfying outcome; and
- **Complete** — successful terminal outcome that satisfies a one-time obligation and terminates future recurrence.

An outcome is not automatically a lifecycle state. Complete is the exception because it is both a user-recorded outcome and the semantic trigger for the terminal `permanently_complete` lifecycle fact.

### Lifecycle and container state

`TARGET` — Lifecycle is the long-lived existence and eligibility state of a Task. Archive and Trash are lifecycle/container transitions, not ordinary Task outcomes.

At minimum the canonical model distinguishes:

```text
terminalState: active | permanently_complete
containerState: active | archived | trashed
workflowState: none | in_progress
activeScheduleState: derived from recurrence, History, and LogicalDayContext
```

The Phase 1A names remain meaningful as compatibility summaries:

- `active` means `terminalState = active` and `containerState = active`;
- `archived` means active terminal state in an archived container;
- `trashed` means any non-deleted Task in the trashed container; and
- `permanently_complete` means the terminal completion fact, regardless of whether the completed Task is currently shown in an active, Archive, or Trash container.

The axes must not be collapsed into one overloaded status enum when that would erase the distinction between “Complete” and “stored in Archive.” A completed Task may therefore be both semantically `permanently_complete` and container-state `archived`.

### Current implementation evidence, not normative

`CURRENT` — Phase 0 records multiple active-status and mutation authorities. The engine action authority can derive a Task patch and History plan, while lifecycle/archive/trash/delete operations remain outside the engine patch allow-list. See [Phase 0 § 2](task-state-phase-0-inventory.md#2-current-status-authorities), [§ 4](task-state-phase-0-inventory.md#4-task-mutation-matrix), and [§ 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state).

`CURRENT` — `src/components/task-app.tsx` routes Done, Did My Best, Missed, and Delayed through `evaluateTaskActionAuthority()` when enabled. Complete uses a separate confirmation and completion flow. The current source therefore already distinguishes ordinary action planning from lifecycle completion, but this is evidence rather than a claim that every branch is canonical.

`CURRENT` — [`src/lib/task-complete.ts`](../../src/lib/task-complete.ts) describes Complete as permanent and Archive-like, hides top-level Complete from primary views, and builds a `completed_permanently` History payload. [`src/components/task-app.tsx`](../../src/components/task-app.tsx) currently clears repeat fields and active occurrence tracking during completion and displays a top-level completion as “moved to Archive.” The target contract below preserves the semantic completion fact while separating it from container placement.

`CURRENT` — [`useTaskCrudActions.deleteTasks()`](../../src/hooks/useTaskCrudActions.ts) first moves a Task to `status = trashed` with `trashed_at`, and a later invocation can call the delete boundary. [`src/lib/task-trash.ts`](../../src/lib/task-trash.ts) exposes a 30-day recent-trash calculation. These facts establish current evidence only; permanent deletion and hierarchy cascade behavior are not defined by this document.

`CURRENT` — [`applyTaskActiveStatusTracking()`](../../src/lib/task-active-status.ts) records `active_status_logical_date` and `active_occurrence_due_on` when entering `in_progress` and clears them when leaving. The engine currently has a stale-In-Progress path that proposes rollover Did My Best. The target contract intentionally treats In Progress as a separate workflow fact and does not let it silently become a recurrence outcome.

## Part 2: Delay semantics by scheduling model

### Common Delay contract

`TARGET` — Delay targets one identifiable current or selected obligation. It does not mean “I handled the Task,” does not satisfy an occurrence, and does not permanently change Repeat.

A valid Delay action must have:

- an active Task lifecycle (`terminalState = active`, `containerState = active`);
- a target obligation that can be identified safely;
- a target date strictly later than the action logical date; and
- no unresolved conflict with another authoritative occurrence or schedule boundary after applying the canonical same-Task fixed-calendar merge rule below.

The canonical Delay action:

1. records an explicit Delayed History event on the action logical date, with the targeted occurrence identity and target effective due date when safely known;
2. creates a forward schedule boundary from the action logical date for that current/selected obligation;
3. moves the effective due cursor for that obligation to the target date;
4. leaves the Repeat rule and stable recurrence anchor unchanged;
5. does not create a successful outcome or reward eligibility;
6. does not erase earlier explicit or calculated Missed facts; and
7. merges a same-Task fixed-calendar collision when the delayed and normal origins land on the same effective date, while preserving both origins; and
8. emits a diagnostic only when a conflict remains genuinely ambiguous after the canonical merge rule is applied.

`due_on` after Delay is the effective current obligation date when it is retained as a persisted projection. It is not the immutable scheduled date and not permission to rewrite earlier chronology.

### Delay target-date rules

| Target date | Target behavior |
|---|---|
| Before the action logical date | Reject with no History, no Task mutation, and a validation diagnostic. A historical edit is a different operation. |
| Same day as the action | Reject as a no-op; do not write Delayed History or move the cursor. |
| Strictly after the action date | Eligible if the obligation and occurrence identity are safe. |
| `null` / indefinite “benched” | Not part of the Phase 1B-2A canonical Delay contract. Reject or return needs-attention until a separate indefinite-workflow decision exists. |
| Target crosses a later authoritative schedule boundary outside the same-Task fixed-date merge rule | Do not silently overwrite the later boundary. Reject or return a conflict diagnostic. |

Delay does not automatically create a new Repeat. A Delay boundary is a current-occurrence/obligation boundary, not a recurrence-family change.

### Delay and streaks

`TARGET` — Delayed is not a positive success and never increases a positive streak. Its effect on continuity follows the underlying Calendar state rather than one global “Delay breaks streak” shortcut:

- on a one-time pre-due Unscheduled day, a Delayed action is not success, so the Unscheduled-day positive streak ends for that date;
- on a recurring Not Due day, Delay is a handled workflow action but remains positive-streak neutral, matching scheduled Not Due inactivity;
- on a Due/Open or already Missed date, Delay does not create positive credit; any active Missed chain is handled according to whether Delay targets that same obligation; and
- a Delay that targets the same unresolved obligation ends that obligation’s active Missed chain by replacing its effective due expectation, while historical Missed facts remain.

If Delay targets a different future fixed occurrence while an older fixed Missed condition remains active, it does not clear or reset the older Missed condition.

### A. Genuinely unscheduled Task

`TARGET` — Delay is invalid for a genuinely unscheduled Task because there is no current obligation to delay. It must not assign a due date as a hidden side effect.

Result of an attempted Delay:

- no explicit Delayed History;
- no due date;
- no Repeat activation;
- no streak mutation; and
- a validation error/needs-attention diagnostic explaining that no obligation exists.

If the user wants to schedule an unscheduled Task, that is an explicit due-date or Repeat-selection action governed by Phase 1B-1, not Delay.

### B. One-time scheduled Task

`TARGET` — Delay can target the one actual obligation when the Task has a due date, no Repeat, and the obligation is not terminally Complete.

Before the original due date:

- the original due date remains an earlier schedule boundary/fact;
- the obligation’s effective due date moves to the future target;
- the dates between the action and new target are Unscheduled Calendar dates because this remains a one-time model;
- the Task remains one-time and Complete remains the satisfying outcome; and
- no Missed fact is manufactured for the original due date merely because it was delayed before its deadline.

After the original due date:

- historical/calculated Missed facts through the Delay action remain;
- the active Missed condition for that same one-time obligation ends and is replaced by the delayed effective due date;
- the current Missed streak ends, but historical Missed streak facts are not erased;
- dates between the action and target are Unscheduled Calendar dates for the one-time schedule;
- `due_on` projects the target date; and
- Complete remains required at the delayed due date or later.

Example:

```text
One-time Task
due 8/10
today 8/11, active Missed

8/11 Delay until 8/15
```

Target result:

```text
8/10 historical/calculated Missed remains
8/11 explicit Delayed History; active Missed chain ends
8/12–8/14 Unscheduled
8/15 Due/Open
due_on = 8/15
Repeat = none
Complete is still required
```

Delay creates a new one-time schedule boundary, not a recurring schedule.

### C. Rolling recurring Task

`TARGET` — Delay can target the one current rolling obligation. It moves that obligation’s effective due date without changing its interval family or stable recurrence identity.

Example:

```text
Every 3 Days
current due Monday
Monday and Tuesday currently Missed
Tuesday: Delay until Friday
```

Target result:

- Monday and Tuesday historical/calculated Missed facts remain;
- Tuesday receives explicit Delayed History for the same rolling obligation;
- the active Missed condition for that obligation ends and becomes a delayed future obligation;
- current Missed streak ends at the Delay transition, without deleting prior Missed facts;
- `due_on` becomes Friday as the effective current due projection;
- Wednesday and Thursday are between-obligation recurring dates, with Delayed workflow annotation if a Calendar surface exposes it;
- Friday is Due/Open; and
- if Friday is successfully handled, the rolling rule resumes from Friday: `nextDue = Friday + 3 days`.

Delay does not rebase from the original Monday Missed date and does not create a second rolling obligation.

An early rolling Delay before the due date follows the same identity rule: it moves the current obligation’s effective due date and creates a forward boundary, but it does not create a new recurrence family.

### D. Fixed-calendar recurring Task

`TARGET` — Delay can target one specific fixed-calendar occurrence as a one-occurrence effective-date override. It does not rewrite fixed-calendar membership.

Example without a collision:

```text
Weekly Friday Task
Friday occurrence due 8/14
Thursday: Delay that occurrence until Sunday 8/16
```

Target result:

- Thursday receives explicit Delayed History for the Friday occurrence;
- Friday is Not Due for that deferred occurrence;
- Sunday is the effective Due/Open date for that occurrence;
- the weekly Repeat rule remains Friday; and
- after Sunday is handled, the next normal Friday occurrence resumes.

An older fixed Missed condition is independent. If the delayed occurrence is not the older unresolved Missed occurrence, Delay does not clear the older condition.

### Fixed-calendar Delay example and same-date collision

The Phase 1B-1 example has two branches:

```text
Monday / Wednesday / Friday

Monday Missed
Wednesday Missed
Thursday Done
Friday scheduled
```

If Thursday is instead a Delay action rather than Done, the target Friday occurrence is deferred until the next Monday. The Thursday action cannot also be Done because one Task has at most one authoritative explicit outcome per logical date.

The next Monday is also a normal fixed-calendar occurrence. Therefore the deferred Friday occurrence and the normal Monday occurrence have the same effective date but different recurrence origins.

`TARGET` — Merge these same-Task origins into one effective Monday obligation for ordinary use. Do not replace, erase, or rewrite either occurrence identity. Friday becomes Not Due for the delayed occurrence, and its explicit Delayed History preserves that Friday was deferred to Monday. Monday presents one Due/Open obligation containing both the normal Monday origin and the delayed Friday origin. One Done, Did My Best, or Complete action on Monday satisfies the combined obligation; it must not create two outcomes or count the Monday obligation twice for History or streaks.

The fixed M/W/F Repeat rule remains unchanged. After the merged Monday obligation is handled, normal fixed-calendar membership continues. This canonical rule resolves this specific same-Task collision, so no needs-attention diagnostic is required merely because the two origins share Monday as their effective date. Diagnostics remain appropriate for genuinely ambiguous conflicts that this merge rule does not resolve.

### Same-Task merged obligation and provenance

The merge is an effective-obligation projection, not a replacement occurrence identity. The canonical model retains both immutable origin occurrences:

```text
effective obligation date = Monday

origin occurrences:
- Friday scheduled occurrence, delayed to Monday
- normal Monday scheduled occurrence
```

Each origin remains available for chronology, audit, and later reconciliation. The effective Monday date has one combined resolution and one outcome, not one outcome per origin. The earlier Friday Delayed History remains a separate provenance fact even after the combined Monday obligation is handled or missed.

If Monday is missed, the merged obligation contributes one Missed outcome and one Missed-streak increment for Monday, never two. If Monday is successfully handled, one Done, Did My Best, or Complete outcome resolves the combined obligation.

### Delay creates a schedule boundary, not a Repeat change

For every scheduling model in which Delay is valid, the action logical date becomes a forward-authoritative boundary for the targeted obligation. Later History replay must preserve that boundary. Delay does not alter:

- Repeat frequency;
- interval;
- selected weekdays;
- monthly rule;
- stable recurrence anchor; or
- earlier explicit/calculated History.

## Part 3: Delay identity and the Phase 1A occurrence model

### The identity problem

`TARGET` — Phase 1A’s preferred identity is:

```text
task:{taskId}:occurrence:{scheduledDueOn}
```

Phase 1A also defines `TaskOccurrence.occurrenceDueOn` as the scheduled/due date generated by recurrence. For this Phase 1B-2A contract, that immutable origin date is the `scheduledDueOn`. Delay can move the effective expected date while conceptually preserving the same obligation:

```text
original scheduled due = 8/10
effective delayed due  = 8/13
```

If the identity were changed from `...:8/10` to `...:8/13`, the canonical engine could incorrectly treat one delayed obligation as two different obligations. If the identity remained date-only without distinguishing the two dates, it would be unclear whether 8/13 is the original schedule date, the current cursor, or the deferred effective date. A fixed-calendar collision adds the inverse implication: distinct immutable origins may contribute to one effective same-Task obligation date.

### Smallest proposed amendment

This is a genuine model clarification, not a silent Phase 1A rewrite.

The smallest target amendment is:

```text
TaskOccurrence
  occurrenceIdentity: immutable obligation identity
  scheduledDueOn: original date generated by recurrence
  effectiveDueOn: current expected date after Delay, nullable when equal to scheduledDueOn
  recurrenceSource: stable Repeat/anchor origin
  resolutionState / resolutionLogicalDate / resolutionOutcome
```

The existing Phase 1A `occurrenceDueOn` concept should be renamed or normatively interpreted as `scheduledDueOn` for an immutable occurrence. `due_on` remains the current effective cursor projection; it is not the occurrence identity.

For a Delay from 8/10 to 8/13:

- occurrence identity remains `task:{taskId}:occurrence:8/10`;
- `scheduledDueOn = 8/10`;
- `effectiveDueOn = 8/13`;
- `due_on = 8/13` only as the current effective projection; and
- the Delayed History event references the original identity and stores the target effective date.

For fixed-calendar recurrence, the normal schedule occurrence keeps its scheduled date. A deferred occurrence is an effective-date override of that occurrence, not a permanent change to fixed membership.

When a delayed fixed occurrence and a normal fixed occurrence for the same Task share an effective date, the transition/projection layer groups their origin occurrences into one effective obligation for that date. This grouping preserves each origin identity and provenance while producing one resolution, one History outcome, and one streak contribution. It does not create a new replacement occurrence identity and does not require a second user action.

### Consequence for current fields and storage

Current source has `occurrence_key`, `occurrence_due_on`, `active_occurrence_due_on`, and `due_on`, but Phase 0 and Phase 1A identify their meanings as split or projection-like. No schema change is authorized here.

Future implementation must choose a canonical event/repository representation that can preserve both scheduled origin and effective deferred date. A future storage migration must classify legacy delayed rows as:

- safely reconstructable;
- reconstructable with a warning; or
- ambiguous and requiring a diagnostic.

Treating a delayed target as a new occurrence identity is not safe.

### Required later documentation correction

Phase 1A documentation should receive a later explicit correction to name `scheduledDueOn` and optional `effectiveDueOn` (or equivalent names). This document records the amendment requirement but does not edit Phase 1A because that file is not authorized for this ticket.

## Part 4: Complete semantics

### Canonical Complete transition

`TARGET` — Complete is a successful terminal outcome and a lifecycle transition:

1. record explicit Complete History on the action logical date;
2. resolve the applicable one-time or recurring obligation when one exists;
3. end any active Missed chain for the resolved obligation;
4. terminate future recurrence and active schedule projection;
5. set terminal lifecycle to `permanently_complete`;
6. clear the active current-occurrence cursor projection (`due_on` and active occurrence tracking) while retaining historical facts elsewhere; and
7. preserve all earlier History, schedule boundaries, and historical Calendar outcomes.

Complete is not Archive. The container may be Archive-like for visibility, but the semantic completion fact remains `permanently_complete`.

Complete is not reversible by merely restoring a completed Task from Archive or Trash. Reopening requires an explicit completion correction/reopen transition governed by Part 10.

### Complete by scheduling model

| Scheduling model/state | Complete target semantics |
|---|---|
| Genuinely unscheduled | Records successful Complete History and becomes `permanently_complete`; no schedule is created. |
| One-time before due | Complete satisfies the sole obligation early, prevents the future due date from becoming Missed, ends future schedule projection, and may complete the positive streak on that Unscheduled date. |
| One-time on due date | Complete satisfies the one actual Due/Open obligation and prevents a Missed chain. |
| One-time overdue | Complete satisfies the frozen obligation, ends the Missed chain, retains historical Missed facts, and terminates recurrence. |
| Rolling recurring | Complete resolves the current rolling obligation and stops all future rolling rebasing. No next rolling due is created. |
| Daily Until Complete | Complete is the explicit terminal purpose of the family and stops the active Daily Until Complete cadence. |
| Fixed-calendar recurring | Complete terminates future fixed-calendar occurrences without rewriting historical scheduled dates or outcomes. |
| Already Missed | Complete clears the active Missed condition for the applicable obligation; prior Missed History remains. |
| Already archived and not Complete | Reject an active Complete mutation until the Task is restored; do not silently mutate an archived Task. |
| Already trashed and not Complete | Reject an active Complete mutation until the Task is restored; do not silently mutate a trashed Task. |
| Already permanently Complete | Idempotent read/no-op when the same terminal fact is confirmed; contradictory competing Complete facts require a diagnostic. |

### Complete History and streaks

Complete creates explicit History with Complete outcome and `completed_permanently` event semantics. It is a successful final historical day under Phase 1B-1:

- early one-time Complete counts on its Unscheduled date;
- on-time Complete counts on the due date;
- overdue Complete ends Missed and may produce a final positive streak of 1; and
- recurring Complete counts as the final successful action but cannot be followed by future positive recurrence dates unless explicitly reopened.

Complete never earns a reward or economy side effect in this phase; reward eligibility is only a canonical result consumed by Phase 1B-2B.

### Complete and future Calendar dates

Historical Calendar dates remain visible with their original explicit or calculated outcomes. Future active recurrence projections stop at the terminal lifecycle boundary. Future dates must not be retroactively rewritten as new Missed, Due, or Not Due obligations.

If a Calendar surface needs a cell after terminal completion, it should show a lifecycle-terminated/no-entry presentation rather than treating the completed Task as an active schedule. This is a projection choice, not a new recurrence state.

### Complete precedence over Archive

`TARGET` — Permanent Complete remains the meaningful completion state inside Archive. Archive may control where the completed Task is displayed, but it must not replace Complete with a generic archived meaning.

The canonical facts are therefore:

```text
terminalState = permanently_complete
containerState = archived
activeScheduleState = not evaluated for active obligations
```

## Part 5: Complete and recurrence examples

### Daily recurring Complete

```text
Daily Task
Done History through 8/10
8/11 user selects Complete
```

Target result:

- 8/11 receives explicit Complete History;
- recurrence stops immediately at the terminal transition;
- no 8/12 or later active Due/Open dates are projected;
- History through 8/10 remains intact; and
- the final positive streak includes 8/11 according to the recurring success rules, but cannot continue after termination.

### Daily Until Complete

Complete is the explicit terminal operation of Daily Until Complete. Done and Did My Best continue the rolling cadence under Phase 1B-1; Complete ends it. No automatic “complete after enough Done” inference is allowed.

### Fixed recurring Complete

```text
Monday / Wednesday / Friday
Monday Missed
Wednesday Done
Thursday Complete
Friday and later dates
```

Target result:

- Monday Missed remains historical;
- Wednesday Done remains historical;
- Thursday Complete is explicit terminal History even if Thursday is Not Due;
- active Missed conditions end if the terminal Complete resolves the Task-level obligation;
- Friday and all later fixed occurrences stop being active schedule obligations; and
- no earlier fixed occurrence is rewritten or consumed by a generic future-date mutation.

## Part 6: Archive semantics

### Archive as a lifecycle/container transition

`TARGET` — Archive moves a Task into the archived container while preserving its configuration, History, terminal completion fact, and schedule-boundary evidence.

Archive:

- is not an ordinary History outcome;
- does not create explicit History;
- removes the Task from active workflow and active recurrence/status evaluation;
- prevents new Missed accrual while archived;
- preserves Repeat, schedule boundaries, effective due information, and all History for restore/reconciliation;
- does not change historical Calendar outcomes or streak history; and
- does not erase or downgrade `permanently_complete`.

An archived Task can retain an unresolved Missed condition as historical/current evidence, but the active view reports lifecycle `archived` rather than allowing Missed to drive active workflow.

### Archive while Missed, Delayed, or In Progress

- **Missed + Archive:** historical Missed facts remain; active accrual stops; restore recalculates whether the unresolved obligation is still Missed.
- **Delayed + Archive:** the Delayed History and effective target remain; no active delayed cursor progresses while archived; restore resumes from the preserved boundary.
- **In Progress + Archive:** the active workflow session ends for lifecycle purposes and its tracking fields are cleared or marked inactive; no synthetic History is created; restore does not silently resume the session.

### Restore from Archive

Restore changes `containerState` from `archived` to `active` while preserving `terminalState`:

- an archived active Task is re-evaluated at the current logical day;
- an unresolved due date may become derived Missed on restore if it was not resolved while archived;
- no automatic explicit History is manufactured merely because time passed in Archive;
- fixed future schedule membership is recalculated independently; and
- a permanently Complete Task remains permanently Complete after restore and does not resume recurrence.

Restore uses the preserved current occurrence/effective boundary when safe. If the cursor or deferred occurrence cannot be reconstructed, restore returns a diagnostic rather than inventing a new due date.

### Hierarchy boundary

This phase does not define parent/child Archive cascade or restoration cascade. Current source contains hierarchy-aware visibility and milestone behavior, but a hierarchy-specific contract must define whether a parent transition affects descendants. Phase 1B-2A treats the selected Task lifecycle transition as local unless a later hierarchy contract says otherwise.

## Part 7: Trash semantics

### Trash as a separate lifecycle/container transition

`TARGET` — Trash moves a Task into a reversible trashed container. It is not the same as Archive and is not hard deletion.

Trash:

- removes the Task from active workflow and active recurrence/status evaluation;
- retains History, Repeat configuration, schedule boundaries, occurrence identity evidence, and terminal completion facts until permanent deletion is separately authorized;
- does not create explicit History;
- does not rewrite historical Calendar outcomes or streak history;
- prevents new Missed accrual while trashed; and
- ends active In Progress workflow without manufacturing an outcome.

Trash does not mean “uncomplete.” A permanently Complete Task moved to Trash remains permanently Complete.

### Restore from Trash

Restore removes the trashed container state and returns the Task to its proven prior container state when that state is available:

- active before Trash → active after restore;
- archived before Trash → archived after restore;
- permanently Complete before Trash → permanently Complete after restore; and
- permanently Complete plus archived before Trash → permanently Complete plus archived after restore.

If the prior container or terminal state cannot be proven from canonical facts, restore must return a diagnostic and require explicit resolution rather than silently reopening recurrence.

Restore does not create History for time spent in Trash. Active schedule evaluation resumes only when the resulting container is active and terminal state is not permanently Complete.

### Trash and hard deletion

Hard delete/permanent deletion is a separate destructive lifecycle operation. This phase does not define its timing, cascade, retention, History deletion, or recovery semantics. The current 30-day trash helper and later delete boundary are source evidence only, not a Phase 1B-2A storage contract.

## Part 8: Lifecycle and active-status precedence

### Canonical precedence

`TARGET` — Evaluate canonical state in this order:

1. Validate lifecycle facts and emit diagnostics for contradictory authoritative terminal/container combinations.
2. Apply terminal completion: `permanently_complete` ends recurrence and remains semantically Complete.
3. Apply container eligibility: `archived` and `trashed` exclude active workflow and active recurrence evaluation.
4. For an active, non-terminal Task, derive the active schedule state from Phase 1B-1 inputs.
5. Overlay persisted In Progress workflow only when its lifecycle and tracking facts are valid; it must not override Missed, Due/Open, or recurrence-derived state.

Lifecycle and active schedule state are therefore separate:

```text
terminalState/containerState ≠ activeScheduleState ≠ workflowState
```

### Required precedence cases

| Combination | Canonical meaning |
|---|---|
| Complete + Archived | Semantically permanently Complete; stored in Archive; no recurrence. |
| Complete + Trashed | Semantically permanently Complete; stored in Trash; no recurrence. |
| Missed + Archived | Historical/current unresolved Missed is preserved; active workflow and new accrual are suspended. |
| Delayed + Archived | Delayed boundary and target are preserved; no active progression while archived. |
| In Progress + Archived | Invalid as an active combination; Archive ends workflow session and lifecycle wins. |
| In Progress + Trashed | Invalid as an active combination; Trash ends workflow session and lifecycle wins. |
| Restored archived active Task | Container becomes active; schedule is re-evaluated without synthetic History. |
| Restored trashed active Task | Proven prior container is restored; schedule is re-evaluated without synthetic History. |
| Restored permanently Complete Task | Completion remains terminal; recurrence does not resume. |

### Legacy status projection

The existing `Task.status` may continue as a compatibility projection during migration, but no consumer may infer that `status = archived` has erased a Complete fact or that `status = complete` alone fully expresses container placement. A future projection can expose a display status, but the canonical engine consumes separate lifecycle/container/workflow facts.

## Part 9: In Progress semantics

### Meaning

`TARGET` — In Progress means that the user has an active workflow/session relationship with the Task. It is not a recurrence outcome, not a successful History event, and not a second active-status authority.

The canonical facts are:

```text
workflowState = in_progress
workflowLogicalDate = the session tracking date
workflowOccurrence = the occurrence being worked, if known
activeScheduleState = independently derived
```

`active_status_logical_date` has meaning only as the persisted In Progress tracking date. `active_occurrence_due_on` may identify the occurrence being worked, but it does not establish authority by itself.

### In Progress transition rules

Entering In Progress:

- requires an active, non-terminal, non-trashed/non-archived Task;
- may persist the current logical date and occurrence reference so the session survives refresh/restart;
- creates no explicit History;
- does not satisfy an occurrence;
- does not move `due_on`;
- does not pause or clear Missed; and
- is neutral for positive streak calculation on the current logical date.

If the Task is one-time pre-due, an In Progress day with no later success remains an Unscheduled day with no successful outcome. If the Task is recurring Not Due, In Progress remains positive-streak neutral. If the Task is Due/Open, In Progress does not convert the obligation to handled.

### In Progress crossing a due boundary

If a due date passes while In Progress remains persisted:

- the workflow fact may survive the logical-day boundary;
- the recurrence engine still derives the underlying obligation as Missed when the due date is unresolved;
- In Progress does not pause, satisfy, or clear Missed;
- active schedule state is Missed while workflow state may remain In Progress as an orthogonal fact; and
- no automatic Done, Did My Best, or Missed History is manufactured merely because the session crossed a boundary.

This target intentionally does not adopt the current stale-In-Progress conversion to automatic Did My Best. The user must explicitly end the session with Done, Did My Best, Complete, or a valid Delay action.

### Ending In Progress

- Done or Did My Best ends the workflow session, clears In Progress tracking, and applies the Phase 1B-1 family-specific success rule.
- Complete ends the workflow session, records Complete History, satisfies the applicable obligation, and transitions to permanently Complete.
- Delay ends or suspends the current workflow session as part of one composite transition and records Delayed History; it must not leave two competing active workflow authorities.
- Explicitly abandoning/clearing In Progress ends the workflow fact without creating History; recurrence then derives from the underlying schedule and logical day.

### Session and lifecycle interactions

- Refresh/session restart restores persisted In Progress only when its tracking date and occurrence can be safely reconciled.
- Archive or Trash ends active In Progress for lifecycle eligibility; no History is created.
- Restore does not silently resume an ended In Progress session; the user must explicitly begin workflow again.
- An In Progress Task can be Delayed only through the composite transition above.

## Part 10: Historical corrections involving workflow and lifecycle

### General rule

`TARGET` — Historical corrections are intentional edits to explicit History or manual Calendar interpretation. They do not retroactively manufacture rewards/economy effects, delete unrelated facts, or cross later authoritative schedule boundaries.

Workflow/lifecycle corrections must use the same canonical recurrence result as live actions, but a historical edit may intentionally recalculate derived chronology from its edited logical date forward.

### Historical Complete

Editing a past logical date to Complete is a terminal historical correction:

- the edited date receives explicit Complete History;
- the Task becomes permanently Complete from that historical boundary forward if no later correction removes the terminal fact;
- recurrence after that date stops;
- later explicit History remains preserved as historical data but may become contradictory if it assumes active recurrence;
- later authoritative schedule boundaries are preserved as facts rather than silently deleted; and
- no reward/economy side effect is replayed.

If later records conflict with the terminal Complete, the engine must emit a diagnostic instead of silently reviving recurrence or silently deleting the later facts.

### Clearing a prior Complete

Clearing a prior Complete is a distinct explicit reopen/correction transition, not an ordinary status toggle:

- if another later authoritative Complete fact exists, the Task remains terminal;
- otherwise remove/replace the explicit Complete fact for that logical date;
- recalculate lifecycle and schedule from that correction boundary;
- preserve later due-date/Repeat boundaries and explicit History; and
- do not automatically reverse any reward/economy effects.

Recommendation: support this as an explicit, auditable correction command rather than allowing a generic Archive/Trash restore or raw `status` update to reopen a permanently Complete Task.

### Historical Delay

Editing a past logical date to Delayed:

- records explicit Delayed History on the selected logical date;
- associates the original occurrence identity and target effective due date when safe;
- preserves earlier Missed facts unless the edited Delay targets that same obligation and changes its active effective state;
- creates a forward boundary from the edited date;
- recalculates later derived chronology only until a later authoritative schedule boundary; and
- does not replay rewards/economy.

Clearing a prior Delayed event returns that date to calculated authority, subject to later explicit History and schedule boundaries. It must not blindly restore a legacy `due_on` value when the current effective cursor cannot be proven.

### Historical lifecycle edits

Historical Archive, Trash, or In Progress edits are not ordinary date-local History outcomes. They require lifecycle/workflow commands with explicit scope. A past lifecycle command must not silently rewrite all Calendar dates or create synthetic History.

## Part 11: Diagnostics and invalid transitions

### Fail-safe contract

The Phase 1B-1 contract applies unchanged: preserve user data, return the safest provable state, attach structured diagnostics, and never silently guess through unresolved authority.

### Diagnostic classes

| Condition | Target behavior |
|---|---|
| Delay on genuinely unscheduled Task | Reject transition; no write; diagnostic explaining that no obligation exists. |
| Delay target before or equal to action date | Reject transition; no History or cursor mutation. |
| Indefinite/null Delay target | Reject until separately specified; no hidden benched state. |
| Delay target conflicts with a later schedule boundary | Reject or require explicit resolution; preserve both facts. |
| Same-Task fixed deferred occurrence collides with a normal fixed occurrence on the same effective date | Merge into one effective obligation; preserve both origin identities and the earlier Delayed History; one outcome and one streak contribution; no collision diagnostic required. |
| Delay cannot identify the targeted occurrence | Reject mutation; diagnostic; do not invent an identity from a moving `due_on`. |
| Complete after contradictory terminal lifecycle facts | Require explicit resolution; do not choose one terminal authority. |
| Complete mutation on archived/trashed active Task | Reject active mutation; restore first or use an explicit historical correction. |
| Multiple mutually exclusive Complete facts | Preserve History; diagnostic; no silent recurrence restart/termination choice. |
| Archived/trashed Task receives active workflow mutation | Reject or accept only lifecycle-safe clearing; diagnostic if the caller cannot prove intent. |
| In Progress tracking date/occurrence cannot be reconciled | Keep lifecycle/data intact; do not synthesize Did My Best; attach needs-attention diagnostic. |
| Restore cannot reconstruct cursor/container/terminal state | Do not resume active recurrence; require explicit resolution. |
| Stale projection disagrees with reconstructable chronology | Accept the proven canonical chronology with warning; do not treat projection as authority. |

Diagnostics are an architectural result only. No diagnostic UI or diagnostic persistence is implemented in Phase 1B-2A.

## Part 12: Persistence classification

No SQL or schema is designed here. The following classification describes canonical facts and projections that a later implementation must preserve.

| Fact | Classification | Target meaning |
|---|---|---|
| Delay action/event | **A. Canonical persisted fact** | Explicit Delayed History on the action logical date with target occurrence/effective date metadata when known. |
| Delayed target/effective due date | **E. Unresolved pending storage design**, with a required event/boundary representation | Must survive reload and preserve scheduled origin versus effective target; multiple same-Task origins may project into one effective obligation date; must not live only in `due_on` or `status`. |
| Complete History event | **A. Canonical persisted fact** | Explicit Complete outcome and terminal event semantics. |
| Permanent Complete lifecycle | **A. Canonical persisted fact** | Terminal `permanently_complete`; not inferred from a display status alone. |
| Archive lifecycle/container | **A. Canonical persisted fact** | Archived container state; preserves History and terminal completion. |
| Trash lifecycle/container | **A. Canonical persisted fact** | Reversible trashed container state; preserves data until separately authorized deletion. |
| In Progress workflow/session | **A. Canonical persisted fact** when cross-refresh/session continuity is required | Explicit active workflow fact, separate from recurrence outcome. |
| `active_status_logical_date` | **A. In Progress workflow fact** while In Progress; otherwise **C. projection/cache** | Session tracking date only; never general Task logical date. |
| `active_occurrence_due_on` | **C. Derived projection/cache** unless a later repository makes it canonical | Current occurrence component; not an independent authority. |
| `due_on` after Delay/Complete | **C. Derived cursor projection** | Effective current due while active; null/unused after terminal Complete; scheduled origin remains historical. |
| `Task.status` | **C. Projection/cache** plus **D. compatibility-only legacy field** | Query/display projection; cannot override lifecycle, History, or canonical recurrence. |
| active schedule status | **B. Derived state** | Pending, Missed, Not Due, Due/Open, and related effective status from canonical inputs. |
| current positive/Missed streak | **B. Derived state** | Recalculated from effective chronology; not changed by Archive/Trash as a historical rewrite. |
| reward/economy claim | **E. Later Phase 1B-2B dependency** | Not persisted or mutated by this architecture phase. |

## Part 13: Workflow and lifecycle transition invariants

`TARGET` — The canonical transition layer must preserve these invariants:

**WORKFLOW/LIFECYCLE INVARIANT 1 — Actions, outcomes, and lifecycle are distinct.** Delay and In Progress are workflow actions/facts; Done, Did My Best, Missed, Delayed, and Complete are outcomes; Archive and Trash are container/lifecycle transitions.

**WORKFLOW/LIFECYCLE INVARIANT 2 — Delay targets an obligation.** Delay cannot create a due date for a genuinely unscheduled Task or silently activate recurrence.

**WORKFLOW/LIFECYCLE INVARIANT 3 — Delay does not change Repeat.** A valid Delay moves one current/selected effective obligation date and creates a forward boundary; it does not rewrite recurrence configuration.

**WORKFLOW/LIFECYCLE INVARIANT 4 — Delay preserves historical Missed.** Delay cannot silently erase already-established explicit or calculated Missed facts.

**WORKFLOW/LIFECYCLE INVARIANT 5 — Delay and Done/Did My Best differ.** Delay never provides positive success or occurrence satisfaction; Done and Did My Best follow Phase 1B-1 success rules.

**WORKFLOW/LIFECYCLE INVARIANT 6 — Delay target dates are future-only.** Targets before or equal to the action logical date are invalid in the live workflow contract.

**WORKFLOW/LIFECYCLE INVARIANT 7 — Fixed Delay is one-occurrence override.** Fixed Delay does not move fixed-calendar membership; a same-Task delayed origin and normal fixed origin on one effective date merge into one effective obligation while retaining separate origin facts.

**WORKFLOW/LIFECYCLE INVARIANT 8 — A merged effective date resolves once.** One Task on one effective logical due date produces one effective obligation outcome and one streak contribution, regardless of how many preserved origin occurrences contribute to that date.

**WORKFLOW/LIFECYCLE INVARIANT 9 — Delayed identity is stable.** Delay preserves the original occurrence identity and distinguishes scheduled/original due from effective/deferred due; grouping origins for one effective date does not replace those identities.

**WORKFLOW/LIFECYCLE INVARIANT 10 — Complete satisfies one-time.** Complete resolves a one-time obligation before, on, or after its due date.

**WORKFLOW/LIFECYCLE INVARIANT 11 — Complete terminates recurrence.** Complete stops rolling, Daily Until Complete, and fixed-calendar future obligations unless an explicit correction/reopen transition is later accepted.

**WORKFLOW/LIFECYCLE INVARIANT 12 — Complete is semantically permanent.** Archive and Trash may contain a completed Task, but neither replaces or erases `permanently_complete`.

**WORKFLOW/LIFECYCLE INVARIANT 13 — Complete clears active obligation projection.** Complete ends active Missed for the applicable obligation and clears the active current cursor while preserving History.

**WORKFLOW/LIFECYCLE INVARIANT 14 — Archive preserves data.** Archive does not create History, erase History, rewrite Calendar outcomes, or accrue new Missed while inactive.

**WORKFLOW/LIFECYCLE INVARIANT 15 — Trash preserves data until deletion.** Trash is reversible container state, not hard deletion, and does not erase permanent completion.

**WORKFLOW/LIFECYCLE INVARIANT 16 — Restore does not synthesize History.** Archive/Trash restore recalculates current state from preserved facts without manufacturing outcomes for inactive time.

**WORKFLOW/LIFECYCLE INVARIANT 17 — Lifecycle precedes active schedule.** Permanent Complete, Archive, and Trash eligibility determine whether active recurrence/workflow is evaluated; they do not erase historical dates.

**WORKFLOW/LIFECYCLE INVARIANT 18 — In Progress is not recurrence satisfaction.** In Progress neither resolves an occurrence nor moves `due_on` nor pauses Missed.

**WORKFLOW/LIFECYCLE INVARIANT 19 — In Progress is not a second status authority.** Workflow state may coexist as an orthogonal fact, but canonical active schedule state remains engine-derived.

**WORKFLOW/LIFECYCLE INVARIANT 20 — In Progress crosses rollover without synthetic success.** A persisted session may survive a logical-day boundary; it does not become Done, Did My Best, or Missed by automatic guess.

**WORKFLOW/LIFECYCLE INVARIANT 21 — Explicit actions end workflow cleanly.** Done, Did My Best, Complete, Delay, Archive, and Trash must clear or transition In Progress without leaving competing active workflow facts.

**WORKFLOW/LIFECYCLE INVARIANT 22 — Historical corrections are boundary-constrained.** Past Complete and Delay corrections preserve later authoritative schedule boundaries and explicit History.

**WORKFLOW/LIFECYCLE INVARIANT 23 — Historical Complete is terminal from its correction boundary.** Clearing it requires an explicit reopen/correction transition; Archive/Trash restore alone cannot reopen it.

**WORKFLOW/LIFECYCLE INVARIANT 24 — No reward replay in this phase.** Workflow/lifecycle replay must not manufacture or reverse rewards/economy side effects.

**WORKFLOW/LIFECYCLE INVARIANT 25 — Ambiguity fails safe.** Invalid or ambiguous transitions emit diagnostics, preserve user data, and do not silently choose competing lifecycle, occurrence, or schedule authorities. The canonical same-Task fixed-date merge is not an ambiguity.

**WORKFLOW/LIFECYCLE INVARIANT 26 — One canonical transition authority.** Delay, Complete, Archive, Trash, In Progress, Calendar, streak, and persistence projections consume the same Phase 1B-1 family-aware recurrence result rather than independently applying competing schedule rules.

## Part 14: Workflow and lifecycle scenario matrix

`TARGET` — The following 24 fixtures are semantic transition checks. “Explicit” means a saved History fact. “Derived” means canonical projection. No fixture is an implementation test in Phase 1B-2A.

| # | Scheduling model; starting lifecycle and active state | Action | History effect | Lifecycle effect | `due_on` / cursor | Recurrence effect | Calendar effect | Streak effect | Resulting active status | Diagnostic |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | Rolling Every 3 Days; active; current due Wednesday/Open | Delay Tuesday until Friday | Tuesday explicit Delayed for current occurrence | Remains active | Effective due becomes Friday | Repeat/anchor unchanged; same rolling obligation | Wednesday/Thursday between-obligation with Delayed annotation; Friday Due/Open | No positive credit; recurring neutral unless same obligation was Missed | Upcoming/Not Due before Friday | None if identity is safe |
| 2 | Rolling Every 3 Days; active Missed; Monday/Tuesday Missed | Delay Tuesday until Friday | Monday/Tuesday Missed remain; Tuesday Delayed references same obligation | Remains active | `due_on = Friday` | Friday success later rebases to Monday | Historical Missed retained; Wed/Thu no current obligation; Friday Due/Open | Active Missed streak ends; historical Missed facts remain | Delayed/Upcoming before Friday | None if identity is safe |
| 3 | One-time due 8/15; active; 8/11 pre-due Unscheduled | Delay 8/11 until 8/20 | 8/11 explicit Delayed | Remains active | `due_on = 8/20` | Still one-time; no Repeat created | 8/12–8/19 Unscheduled; 8/20 Due/Open | 8/11 is not positive success; Unscheduled streak ends | Due/Open projection for 8/20 | None |
| 4 | One-time due 8/10; active Missed on 8/11 | Delay 8/11 until 8/15 | 8/10 Missed remains; 8/11 Delayed | Remains active | `due_on = 8/15` | Same one-time obligation, new forward boundary | 8/12–8/14 Unscheduled; 8/15 Due/Open | Current Missed streak ends; prior Missed remains historical | Delayed/Upcoming before 8/15 | None if original identity is safe |
| 5 | Fixed weekly Friday; active; Friday occurrence due 8/14 | Delay Thursday until Sunday 8/16 | Thursday Delayed references scheduled 8/14 occurrence | Remains active | Effective due 8/16 | Friday Repeat unchanged; one occurrence override | Friday Not Due for that occurrence; Sunday Due/Open; next Friday resumes | No positive credit; no future fixed streak rewrite | Upcoming/Not Due before Sunday | None without collision |
| 6 | M/W/F; active Missed from Monday/Wednesday; Friday future | Delay Friday occurrence to Sunday | Friday Delayed; Monday/Wednesday Missed remain | Remains active | Current effective target Sunday | M/W/F membership unchanged | Friday Not Due; Sunday deferred Due/Open; older Missed remains | Older Missed streak unchanged; Delay adds no positive credit | Missed or diagnostic if older obligation remains active | None if target identity is distinct |
| 7 | M/W/F; active; Friday occurrence deferred to next Monday, which is normal Monday | Delay Friday until Monday; handle Monday once | Thursday Delayed preserves Friday origin and target Monday; one Monday outcome resolves the combined obligation | Remains active | Effective obligation Monday with both origins | M/W/F membership unchanged; later fixed occurrences continue normally | Friday is Not Due for the delayed occurrence; Monday has one Due/Open obligation | Monday contributes at most one outcome/streak result; Friday Delayed provenance is not counted as a second obligation | One effective Monday status/outcome | None for this resolved collision |
| 8 | Genuinely unscheduled; active; no due/Repeat | Delay to any date | No History | Unchanged | Unchanged null | No schedule activation | Remains Unscheduled | No streak mutation | Unscheduled | Validation diagnostic: no obligation |
| 9 | One-time due 8/10; active; pre-due | Complete 8/7 | Explicit Complete on 8/7 | `permanently_complete` | Active cursor cleared/null | Future obligation eliminated | 8/10 never becomes Missed; future active cells terminate | Complete counts as successful Unscheduled day | Permanently Complete | None |
| 10 | One-time due 8/10; active; Due/Open on 8/10 | Complete 8/10 | Explicit Complete | `permanently_complete` | Cursor cleared/null | One obligation satisfied | Due date resolves; no future recurrence | Final positive success | Permanently Complete | None |
| 11 | One-time due 8/10; active Missed through 8/12 | Complete 8/13 | Complete added; earlier Missed retained | `permanently_complete` | Cursor cleared/null | Frozen one-time obligation satisfied; no future recurrence | Missed chain ends; history remains | Final positive success may be 1 | Permanently Complete | None |
| 12 | Rolling Daily; active; current due 8/11 | Complete 8/11 | Explicit Complete resolves current occurrence | `permanently_complete` | No next due | Rolling cadence stops | Future dates terminate; prior dates remain | Final success included; no continuation | Permanently Complete | None |
| 13 | Daily Until Complete; active; Done history through 8/10 | Complete 8/11 | Explicit terminal Complete | `permanently_complete` | Cursor cleared/null | Daily Until Complete stops immediately | No later daily obligations | Final positive success; no future streak | Permanently Complete | None |
| 14 | Fixed M/W/F; active; Monday Missed, Wednesday Done | Complete Thursday | Thursday Complete; prior dates retained | `permanently_complete` | Cursor cleared/null | Future fixed membership terminates; historical fixed dates unchanged | Friday and later no active occurrences | Complete is final positive action | Permanently Complete | None |
| 15 | Active permanently Complete Task in Archive container | Read/open Archive; no new action | No new History | Remains terminal + archived | Null/unused | No recurrence | Historical Calendar remains; no active cells | Historical streak unchanged | Permanently Complete in Archive | None |
| 16 | Active Task with unresolved Missed; active container | Archive | No History | Container becomes archived | Preserve cursor/boundary for restore | Evaluation suspended; no new Missed accrual | Historical Missed remains; no active progression | Historical streak unchanged | Archived | None unless cursor is contradictory |
| 17 | Archived active Task with preserved due/Repeat and no terminal fact | Restore Archive | No synthetic History | Container becomes active | Reuse proven cursor; recalculate | Active schedule resumes from preserved boundaries | Current state may be Missed if obligation remains unresolved; no synthetic row | Recalculate derived current streak | Engine-derived active status | Diagnostic if cursor cannot be proven |
| 18 | Active non-terminal Task, possibly In Progress | Trash | No History | Container becomes trashed; workflow ends | Preserve for restore; no active cursor mutation authority | Evaluation suspended | History unchanged; no new Missed accrual | Historical streak unchanged | Trashed | None unless lifecycle facts conflict |
| 19 | Trashed active Task with proven prior active container | Restore Trash | No synthetic History | Returns to prior active container | Recalculate from preserved boundary | Recurrence resumes only after restore | Current derived state returns; no inactive-time History | Recalculate derived streaks | Engine-derived active status | Diagnostic if prior container/cursor unknown |
| 20 | Permanently Complete + archived Task, then Trash and Restore | Trash, then Restore | No History | Terminal Complete preserved; container returns archived | Null/unused | Recurrence never resumes | Complete remains meaningful in Archive after restore | No new streak | Permanently Complete + Archived | None |
| 21 | One-time due 8/15; active; 8/11 Unscheduled/Open workflow | Enter In Progress 8/11 | No History | Remains active | Cursor unchanged; track session date/occurrence if known | No satisfaction/rebase | 8/11 workflow overlay; due remains 8/15 | Neutral; no positive credit yet | In Progress workflow over active schedule | None |
| 22 | Rolling due 8/10; active In Progress persisted across 8/10 to 8/11 | No explicit outcome by rollover | No synthetic Done/DMB/Missed History | Remains active; workflow may persist | Cursor remains unresolved | Due obligation becomes derived Missed; no pause | Schedule Missed; workflow fact remains orthogonal | No positive credit; Missed chronology applies | Active schedule Missed + workflow In Progress | None if session identity is valid |
| 23 | Active In Progress on current occurrence | Done, Did My Best, or Complete | Explicit selected outcome; In Progress tracking cleared | Complete becomes terminal; Done/DMB remains active | Done/DMB apply family cursor rule; Complete clears cursor | Phase 1B-1 success/terminal rule applies | Calendar outcome becomes selected explicit result | Done/DMB positive; Complete final positive | Derived success or Permanently Complete | None |
| 24 | Any model; active state has ambiguous occurrence/lifecycle boundary | Delay, Complete, or restore attempted | Preserve existing History; no synthetic event | No unsafe lifecycle mutation | Do not guess cursor | No speculative recurrence change | Safest provable projection only | No speculative streak mutation | Safest provable state | Error/needs attention diagnostic |

## Part 15: Product decision and architectural consequences

Decision A records the product rule that was previously unresolved. Decisions B and C record the architectural/storage and fail-safe restoration consequences that implement or protect that rule; they are not unresolved product choices.

### Decision A: Fixed deferred occurrence colliding with a normal fixed occurrence — RESOLVED

Concrete example: M/W/F; Friday is Delayed until Monday, and Monday is already a normal occurrence.

**Resolved product rule:** Merge the normal Monday origin and delayed Friday origin into one effective Monday obligation. Preserve both immutable origin identities and the Friday Delayed History/provenance. The user sees one Monday obligation, and one Monday Done, Did My Best, or Complete outcome satisfies the combined obligation without double-counting History or streaks. The fixed M/W/F Repeat membership remains unchanged, and this resolved collision does not require a diagnostic.

### Decision B: Occurrence identity names for Delay — ARCHITECTURAL/STORAGE CONSEQUENCE

Concrete example: occurrence identity remains `...:8/10`, but Delay changes effective due to 8/13.

**Required architectural consequence:** Keep immutable `scheduledDueOn` and add `effectiveDueOn` (or equivalent names). A delayed target must not become a new occurrence identity, and multiple fixed-calendar origins may project into one effective obligation date. This requires a later Phase 1A documentation/storage amendment and migration handling, but is not an unresolved product question. No schema is changed here.

### Decision C: Restore when legacy data cannot prove prior container or deferred cursor — ARCHITECTURAL/SAFETY CONSEQUENCE

Concrete example: a trashed Task has no reliable prior container marker and its `due_on` conflicts with Delayed History.

**Required safety consequence:** If prior lifecycle/container or deferred-cursor state cannot be safely reconstructed, do not guess. Keep the Task inactive/in the safest proven state, emit a diagnostic, and require later explicit resolution before recurrence resumes. This is a fail-safe restoration consequence, not an unresolved product question.

No genuine product decision remains unresolved in Decisions A–C. Indefinite/null Delay is intentionally rejected in this phase rather than treated as a hidden lifecycle state.

## Part 16: Handoff to Phase 1B-2B

Workflow and lifecycle semantics are locked enough for Phase 1B-2B. The fixed-collision merge rule and preserved-provenance requirement are now part of the canonical contract; the scheduled/effective occurrence distinction remains a later architectural/storage implementation consequence.

Phase 1B-2B owns:

- logical-day rollover execution;
- rollover idempotence;
- removal of automatic synthetic Missed persistence;
- persistence projection timing;
- rewards/economy eligibility;
- historical correction reward boundaries;
- reward interaction with Complete, Done, Did My Best, and Delay;
- relationship between canonical engine output and rollover/reward side effects; and
- implementation of the later occurrence-model/storage amendment for scheduled versus effective due dates.

Phase 1B-2B must preserve:

- workflow actions versus outcomes versus lifecycle/container state;
- Delay as a current-obligation override, not a Repeat mutation;
- same-Task fixed-calendar collisions merging into one effective obligation when origins share an effective date, with all origin/provenance facts preserved;
- one History outcome and one streak contribution for one Task on one effective logical due date, even when multiple origins contribute;
- stable occurrence identity across Delay;
- Complete as terminal recurrence satisfaction;
- Complete remaining semantically Complete inside Archive/Trash;
- Archive/Trash data preservation and no synthetic inactive-time History;
- In Progress as a separate workflow fact that does not satisfy recurrence; and
- diagnostic fail-safe behavior for invalid or ambiguous transitions.

No rollover, rewards/economy, diagnostics UI/persistence, production code, tests, schema, SQL, Supabase, UI, version change, commit, or push is implemented by this specification itself.
