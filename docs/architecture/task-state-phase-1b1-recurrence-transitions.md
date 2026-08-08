# Phase 1B-1: Canonical Recurrence and Occurrence Transition Semantics

Status: active working architecture specification
Scope: recurrence, occurrence creation, resolution, advancement, early/late success, overdue chronology, No Repeat scheduling, fixed-calendar behavior, and historical schedule boundaries
Required sources: [Phase 0 inventory](task-state-phase-0-inventory.md), [Phase 1A core model](task-state-phase-1a-core-model.md)
Implementation status: specification only; not implemented

## Purpose and boundaries

Phase 1A defined the canonical Task domain. Phase 1B-1 defines how recurrence membership, successful outcomes, missed chronology, streaks, and schedule boundaries are interpreted over logical dates.

This phase covers:

- genuinely unscheduled Tasks and schedule activation;
- rolling and fixed-calendar recurrence families;
- occurrence creation and identity;
- Done and Did My Best resolution;
- rolling rebasing and rolling Missed chains;
- fixed-calendar date-by-date occurrences;
- Not Due and streak semantics;
- calculated Missed Calendar representation;
- historical corrections;
- manual due-date boundaries; and
- Repeat/schedule-change boundaries.

This phase does not define exact Delay behavior, Complete lifecycle semantics, Archive, Trash, In Progress workflow, rollover execution, or rewards/economy. Those remain Phase 1B-2 topics.

`CURRENT` statements describe inspected source and cite Phase 0, Phase 1A, or specific source functions/files. `TARGET` statements define the locked product contract and are not claims about implemented behavior. This correction replaces any earlier target rule in this document that conflicts with the contract below.

## Locked inputs from Phase 1A

`TARGET` — The transition model consumes:

```text
TaskConfiguration + RecurrenceAnchor + TaskLifecycle
                         +
              ExplicitHistoryEvent[]
                         +
              ScheduleBoundaryEvent[]
                         +
                 LogicalDayContext
                         ↓
          boundary-constrained chronology
                         ↓
              recurrence-family projection
                         ↓
                 EffectiveTaskState
```

The following rules remain in force:

- `logicalDate` is the History event date. A scheduled occurrence date is a separate fact.
- One explicit outcome exists per Task/logical date. Explicit History is authoritative for that date.
- Calculated Missed is derived Calendar/status chronology. Time passing alone does not create an ordinary explicit History row.
- A canonical occurrence identity includes the Task and its scheduled date: `task:{taskId}:occurrence:{occurrenceDueOn}`. Fixed-calendar dates are separate occurrence identities; a rolling overdue chain may reuse one identity across several calculated Missed logical dates.
- `due_on` is a current schedule cursor/projection, not a permission to reinterpret explicit History or a later schedule boundary.
- Recurrence family semantics must remain distinct. Rolling and fixed-calendar schedules do not share one unresolved-occurrence rule.

## Part 1: Recurrence families and schedule activation

### Genuinely unscheduled Tasks

`TARGET` — A Task is genuinely unscheduled exactly when both conditions hold:

```text
no due date
and
no repeat frequency selected
```

History does not activate a live schedule. Historical Done, Did My Best, Missed, Delayed, Complete, or any other History entry remains historical evidence only when the Task has no due date and no selected repeat frequency.

An unscheduled Task becomes scheduled only when:

- a due date is assigned; or
- a repeat frequency is explicitly selected.

If a No Repeat Task receives a due date while no repeat frequency is selected, it is an actually scheduled implicit rolling-daily Task with interval one. If a repeat frequency is selected, the selected recurrence begins at its schedule-change boundary. Neither behavior is inferred from History alone.

Unscheduled positive streaks are historical and consecutive-date based, not recurrence based:

```text
8/7 Done
8/8 no success
```

Result:

- 8/7 creates positive streak = 1;
- inactivity on 8/8 ends that positive streak;
- no Missed streak begins;
- no calculated Missed is created; and
- the Task remains unscheduled.

Done and Did My Best on an unscheduled Task are historical successes. They do not create a due date, choose a repeat frequency, or activate implicit rolling-daily behavior.

### Rolling and fixed-calendar families

`TARGET` — The recurrence families are:

| Family | Members | Schedule meaning |
|---|---|---|
| ROLLING | Daily | Interval of one logical day. |
| ROLLING | Daily Until Complete | Daily rolling interval while the Task remains in its active recurrence lifecycle; Complete remains Phase 1B-2. |
| ROLLING | Every X Days | Explicit rolling interval of X logical days. |
| ROLLING | Other explicitly rolling intervals | Any recurrence whose next date is based on the success logical date. |
| ROLLING | Scheduled No Repeat | A No Repeat Task with an assigned due date uses implicit rolling interval one. |
| FIXED CALENDAR | Weekly | Configured weekly calendar membership. |
| FIXED CALENDAR | Selected weekdays | The selected weekday set is the membership rule. |
| FIXED CALENDAR | Every N Weeks | The selected weekday set repeats in a fixed week phase. |
| FIXED CALENDAR | Monthly day-of-month | The configured month date, normalized to the last valid day when necessary. |
| FIXED CALENDAR | Monthly ordinal weekday | The configured ordinal weekday in each eligible month. |

For ROLLING, success date is the cadence anchor for the next due date. For FIXED CALENDAR, the configured calendar rule remains the schedule; success on an extra Not Due day does not move it.

### Schedule membership is not occurrence resolution

`TARGET` — A schedule can say that a logical date is Not Due without creating a successful or missed outcome for that date. A scheduled date can be an occurrence even when a prior fixed-calendar date was Missed. An explicit History event can exist on a Not Due date without consuming or moving a future fixed occurrence.

The product therefore uses two different occurrence models:

- ROLLING has one current rolling obligation. When it becomes overdue, the obligation freezes and forms a Missed chain until handled.
- FIXED CALENDAR has an independent occurrence for each scheduled calendar date. A missed date does not queue-block, consume, or erase later scheduled dates.

## Part 2: ROLLING transitions

### Rolling success always rebases the due date

`TARGET` — For a rolling recurrence, Done or Did My Best on any logical date rebases the next due date from the success date:

```text
nextDue = successLogicalDate + interval
```

This applies when the success is early, on time, late, or voluntary on a Not Due day. Voluntary success on a Not Due day is extra positive progress and also rebases the rolling cadence.

Examples:

```text
Every 3 Days
due 8/10
Done 8/8
→ next due 8/11

Done again 8/9
→ next due 8/12
```

```text
Every 3 Days
due 8/10
Done 8/10
→ next due 8/13

Done again 8/12
→ next due 8/15
```

Do not apply a lower-bound adjustment based on the prior occurrence due date. The actual success logical date is always the rolling rebase date. The stable recurrence configuration and provenance may remain unchanged, but the active rolling due cursor moves from the success date.

### Rolling occurrence identity

`TARGET` — A scheduled rolling Task has one current obligation at a time. Its current due date supplies the occurrence identity. If the due date closes without a successful or later-defined handled outcome, the same obligation remains current; elapsed logical dates do not create a new rolling occurrence for each day.

After Done or Did My Best, the current rolling obligation is handled and the next due date is calculated from the success logical date plus the interval. The next due date becomes the next rolling occurrence identity.

### Rolling Missed chain

`TARGET` — When a rolling due date passes without Done, Did My Best, or another later-defined handling action:

- the Task becomes actively Missed;
- `due_on` freezes at the missed due date;
- recurrence does not advance automatically; and
- the Task remains in the Missed chain until the chain is broken.

For a logical date whose day has closed, calculated Missed chronology may represent the overdue chain. The chain starts from the missed due date and increases for each later completed logical day without a successful or handled outcome.

Example:

```text
Every 3 Days
due Monday

Monday no success
→ active status Missed
→ due_on remains Monday
→ Missed streak begins

Tuesday no success
→ still active Missed
→ due_on still Monday
→ Missed streak increases

Wednesday no success
→ still active Missed
→ due_on still Monday
→ Missed streak increases

Thursday Done
→ Missed chain ends
→ positive streak = 1
→ next due = Sunday
```

A rolling Missed chain may be broken by:

- Done;
- Did My Best; or
- Delay, with exact Delay behavior deferred to Phase 1B-2.

Done and Did My Best are always successful/handled outcomes. They do not leave the rolling due date frozen after the chain ends.

### Rolling Calendar representation

`TARGET` — A rolling overdue chain may display each completed overdue logical day as calculated Missed:

```text
Every 3 Days
due Monday
Done Thursday

Monday   = calculated Missed
Tuesday  = calculated Missed
Wednesday= calculated Missed
Thursday = explicit Done
```

The Monday, Tuesday, and Wednesday entries reference the same underlying overdue obligation. They are not separate scheduled occurrences, do not create separate explicit Missed History rows, and do not advance recurrence by themselves.

### Rolling historical correction butterfly effect

`TARGET` — Explicit History remains authoritative for its logical date. When a rolling historical success is added or changed, later derived chronology is recalculated from that success date. This intentional butterfly effect can change the rolling next due date, later calculated Missed days, active status, and current streaks.

Example: an Every 3 Days Task was originally due Monday and Monday through Friday are currently calculated Missed. On Saturday, the user changes Wednesday to Done:

```text
Monday    Missed
Tuesday   Missed
Wednesday Done
next due  Saturday
Saturday  current status Pending
positive streak = 1
```

If instead Tuesday is changed to Done:

```text
Monday   Missed
Tuesday  Done
next due Friday
Friday    Missed if unresolved
Saturday  active status Missed
```

The recalculation is intentional. It must preserve explicit History while recalculating only the derived chronology after the historical success.

## Part 3: FIXED CALENDAR transitions

### Each scheduled date is its own occurrence

`TARGET` — Fixed-calendar membership continues independently across scheduled dates. Each scheduled date has its own occurrence identity:

```text
task:{taskId}:occurrence:{scheduledCalendarDate}
```

One unresolved or missed fixed occurrence does not block a later calendar date. Do not use one globally unresolved occurrence to queue fixed dates behind an earlier missed date.

Example:

```text
Monday / Wednesday / Friday Task

Monday  missed
Wednesday Done
Friday   Done
```

Target chronology:

- Monday = Missed;
- Wednesday = Done; and
- Friday = Done.

Monday does not prevent Wednesday or Friday from becoming their own scheduled occurrences. The fixed schedule continues regardless of whether an earlier fixed date was Missed.

### Fixed-calendar success on a Not Due day

`TARGET` — Done or Did My Best on a fixed-calendar Not Due day:

- creates explicit success for that logical date;
- contributes to positive streak;
- may end an active Missed state;
- does not consume a future scheduled occurrence; and
- does not move the fixed recurrence schedule.

Example:

```text
Weekly Friday Task
next scheduled occurrence = Friday 8/10

Wednesday 8/8 Done
```

Result:

- 8/8 is explicit Done;
- positive streak increases by 1; and
- Friday 8/10 remains the scheduled occurrence.

If Friday is later completed, that Friday event consumes Friday’s occurrence. The Wednesday success did not consume it early.

### Fixed-calendar active Missed state

`TARGET` — A missed fixed-calendar occurrence may keep the Task’s active status as Missed until a later success or handling action clears that active state. The active Missed state does not remove or delay the next fixed scheduled occurrence.

Example:

```text
Weekly Monday Task

Monday Missed
Tuesday no success
```

Result:

- Monday remains historical/calculated Missed;
- active Task status remains Missed; and
- the next fixed scheduled occurrence still exists according to the calendar.

If Tuesday is Done:

- Monday remains historical Missed;
- Tuesday becomes explicit Done;
- active Missed state ends;
- positive streak starts at 1; and
- active status becomes whatever the next schedule implies, such as Upcoming or Not Due.

If the user edits Monday itself from Missed to Done, Monday is corrected historically. That correction changes Monday’s outcome; it does not turn Tuesday’s event into Monday’s occurrence or move the fixed schedule.

### Fixed-calendar historical correction

`TARGET` — Historical corrections on fixed-calendar Tasks update History, the Calendar outcome, streaks, and current interpretation where appropriate. They do not move the underlying fixed recurrence schedule.

Example:

```text
Monday Missed
Wednesday Done
Friday Done

Saturday: change Monday to Done
```

Result:

```text
Monday  Done
Wednesday Done
Friday   Done
next fixed due remains Monday
```

The fixed calendar is still determined by its configured weekday/month rule and stable schedule boundary. A historical edit does not rebase that rule.

## Part 4: Not Due and streak semantics

### Scheduled Not Due days

`TARGET` — For a scheduled Task, a Not Due day with no success is neutral for positive streak continuity:

- it does not increase the positive streak;
- it does not break the positive streak; and
- it does not start or increase a Missed streak unless the Task is already in an active Missed chain.

Not Due outcomes are:

| Logical date | Result |
|---|---|
| Not Due + no success | Positive streak unchanged; no new Missed chain. |
| Not Due + Done | Positive streak +1; rolling schedules rebase; fixed schedules do not move. |
| Not Due + Did My Best | Positive streak +1; rolling schedules rebase; fixed schedules do not move. |
| Not Due + no success while active Missed | Active Missed state continues; the active Missed chronology may increase according to the family’s chain rules. |

Example:

```text
Scheduled Task due 8/10

8/5 Done → positive streak 1
8/6 no entry → streak remains 1
8/7 no entry → streak remains 1
8/8 Done → positive streak 2
```

This differs from a genuinely unscheduled Task. For the unscheduled example `8/7 Done`, followed by no success on `8/8`, inactivity ends the positive streak and creates no Missed state because there is no live schedule.

### Explicit versus calculated Missed

`TARGET` — Explicit Missed History is authoritative for its logical date. Calculated Missed is a derived representation of a schedule obligation that passed without success. Neither is a successful outcome. Their recurrence effects are family-specific:

- rolling Missed freezes one due date and forms one overdue chain;
- fixed-calendar Missed marks that scheduled date while later fixed dates continue independently; and
- neither form activates a genuinely unscheduled Task merely because History exists.

No automatic explicit Missed History row is created merely because time passed.

## Part 5: Successful outcomes

### Done and Did My Best

`TARGET` — Done and Did My Best are always successful handled outcomes.

Both outcomes:

- contribute to positive streak;
- end an active Missed chain or active Missed state;
- resolve the relevant current rolling obligation when applicable;
- rebase a rolling next due date from the logical success date;
- consume a fixed-calendar occurrence only when the success is for that scheduled date; and
- behave like Done for recurrence handling except where future reward or statistics rules explicitly distinguish them.

For a fixed-calendar Not Due success, “relevant occurrence” is no future scheduled occurrence: the event is explicit positive History on its own logical date, can clear active Missed status, and leaves calendar membership unchanged.

Example:

```text
Every 3 Days
due Monday

Monday Missed
Tuesday Missed
Wednesday Did My Best
```

Result:

- the rolling Missed chain ends Wednesday;
- positive streak = 1; and
- next due = Saturday.

### Missed and Delay boundary

Missed is not a successful resolution. A calculated Missed day is non-mutating. Delay may break or transform an active chain, but exact Delay date movement, persistence, and lifecycle semantics are deferred to Phase 1B-2.

## Part 6: Historical chronology and schedule boundaries

### Event/boundary-based model

`TARGET` — Historical chronology is constrained by intentional historical facts and schedule decisions:

- explicit History outcomes;
- manual due-date changes; and
- Repeat or other schedule changes.

Derived calculation may occur between those boundaries. It must not cross a later explicit schedule boundary and overwrite the user’s later scheduling decision.

Conceptually:

```text
historical facts + schedule-change boundaries
                    ↓
       derive timeline between boundaries
```

No schema implementation is defined by this phase. The boundary concept is semantic: a later intentional schedule decision is part of the chronology input even if its storage representation is decided later.

### Manual due-date changes

`TARGET` — A manual due-date change is an authoritative schedule boundary from its logical date forward.

Example:

```text
Daily Task
8/8: user manually moves due date to 8/10
```

Result:

- 8/8 = Not Due unless explicit History says otherwise;
- 8/9 = Not Due unless explicit History says otherwise; and
- 8/10 = Due.

The fact that Repeat remains Daily must not cause 8/8 or 8/9 to later become Missed. Later historical recalculation must not overwrite the subsequent manual due-date decision. Manual schedule decisions act as boundaries in derived chronology.

### Repeat changes

`TARGET` — A Repeat change applies from its change logical date forward:

- earlier Calendar dates are not reinterpreted under the new recurrence;
- earlier established chronology is preserved;
- explicit History is preserved; and
- the new recurrence begins at the change-date schedule boundary.

Example:

```text
Every 3 Days through 8/8

8/9: change Repeat to Daily
```

Dates through 8/8 retain their prior established Calendar meaning. Daily recurrence begins from the 8/9 schedule boundary. Opening History later must not reinterpret 8/1–8/8 as though the Task had always been Daily.

This phase does not add a user-facing warning or a recalculate-history choice.

### Rolling correction across boundaries

For ROLLING recurrence, replay can recalculate derived chronology between boundaries. A historical success may rebase later rolling dates, but replay stops at a later manual due-date or Repeat boundary and must preserve that later scheduling decision.

For FIXED CALENDAR recurrence, replay may update date outcomes and active interpretation, but the fixed schedule rule and its boundaries remain unchanged. Historical corrections cannot turn a fixed schedule into a rolling schedule or move its next calendar date.

## Part 7: Monthly normalization

`TARGET` — A monthly day-of-month recurrence targeting a date that does not exist in a month uses the last valid day of that month.

Examples:

- Monthly 31st → April 30;
- Monthly 31st → February 28 in a non-leap year; and
- Monthly 31st → February 29 in a leap year.

The normalization changes the occurrence date for that month only; it does not convert monthly recurrence into rolling behavior.

## Part 8: Transition invariants

`TARGET` — The recurrence transition layer must preserve these invariants:

**TRANSITION INVARIANT 1 — Unscheduled means no due date and no selected repeat.** History alone cannot activate a live schedule.

**TRANSITION INVARIANT 2 — Unscheduled history is historical only.** Done and Did My Best can create historical positive streak facts without creating a due date, Missed state, or calculated Missed.

**TRANSITION INVARIANT 3 — Rolling success rebases from success date.** For every rolling interval, `nextDue = successLogicalDate + interval`, including early and Not Due success.

**TRANSITION INVARIANT 4 — Rolling Missed freezes the due date.** An unresolved rolling due date does not auto-advance after it becomes Missed.

**TRANSITION INVARIANT 5 — One rolling overdue chain uses one obligation.** Calculated Missed days in a rolling chain may share one occurrence identity and cannot create new rolling obligations by passage of time.

**TRANSITION INVARIANT 6 — Fixed schedules do not drift from extra success.** A fixed-calendar success on a Not Due day does not consume a future occurrence or move the calendar rule.

**TRANSITION INVARIANT 7 — Fixed dates do not queue-block.** A missed fixed-calendar date does not prevent later scheduled dates from becoming and resolving their own occurrences.

**TRANSITION INVARIANT 8 — Active fixed Missed state is separate from schedule membership.** Active Missed status may persist while the next fixed occurrence continues to exist.

**TRANSITION INVARIANT 9 — Not Due is positive-streak neutral without success.** A scheduled Not Due day with no success neither increases nor breaks positive streak, and it starts no Missed chain unless an active Missed chain already exists.

**TRANSITION INVARIANT 10 — Done and Did My Best are handled successes.** Both contribute positive streak, end active Missed state, and follow the same recurrence handling except for explicitly future reward/statistics distinctions.

**TRANSITION INVARIANT 11 — Calculated Missed is non-mutating.** Time passing may produce calculated Calendar/status Missed but does not create explicit History or advance recurrence.

**TRANSITION INVARIANT 12 — Explicit History wins for its logical date.** Historical edits update that date’s outcome and may alter derived chronology without being overwritten by later calculation.

**TRANSITION INVARIANT 13 — Manual due changes are schedule boundaries.** Later derived calculation cannot turn dates before a manual due-date boundary into Missed contrary to that decision.

**TRANSITION INVARIANT 14 — Repeat changes apply forward only.** A new recurrence cannot reinterpret established chronology before its change-date boundary.

**TRANSITION INVARIANT 15 — One canonical family-aware transition authority.** Recurrence, Calendar, current status, streaks, and persistence projections must consume the same family-aware result rather than independently applying rolling or fixed rules.

## Part 9: Scenario fixtures

`TARGET` — The following 24 fixtures are the concrete semantic checks for this phase. “Explicit” means a saved History outcome. “Calculated” means a derived Calendar/status result and not a new History row.

| # | Scenario | Expected result |
|---:|---|---|
| 1 | No Repeat, no due date, no History | Genuinely unscheduled; no due, no recurrence, no calculated Missed. |
| 2 | Unscheduled: 8/7 Done, 8/8 no success | 8/7 positive streak = 1; 8/8 ends that streak; no Missed streak or calculated Missed; Task remains unscheduled. |
| 3 | Unscheduled: historical Did My Best | Historical positive success only; no due date, no repeat activation, no live recurrence. |
| 4 | No Repeat due assignment | Assigned due date makes the Task scheduled implicit rolling-daily; History was not required for activation. |
| 5 | Explicit repeat selection with no prior due | Selected recurrence begins at its change-date schedule boundary; it is scheduled from that boundary, not from older History. |
| 6 | Every 3 Days, due 8/10, Done 8/8 | Positive success on 8/8; rolling next due = 8/11. No lower-bound formula. |
| 7 | Every 3 Days, due 8/10, Done 8/10 | Next due = 8/13. |
| 8 | Every 3 Days, due 8/10, Done 8/12 | Late success rebases from 8/12; next due = 8/15. |
| 9 | Every 3 Days, due 8/10, Done 8/8, Done 8/9 | First next due = 8/11; second success rebases it to 8/12. |
| 10 | Rolling due Monday, no success through Wednesday, Done Thursday | Monday due freezes; Monday–Wednesday may be calculated Missed for one obligation; Thursday ends chain; next due is Sunday for a 3-day interval. |
| 11 | Rolling chain Calendar display | Monday, Tuesday, Wednesday are calculated Missed sharing the Monday obligation; Thursday is explicit Done; no automatic explicit Missed rows. |
| 12 | Weekly Friday, Done Wednesday 8/8 | 8/8 explicit Done and positive +1; Friday 8/10 remains the scheduled occurrence. |
| 13 | Monday/Wednesday/Friday: Monday Missed, Wednesday Done, Friday Done | Three independent date outcomes: Monday Missed, Wednesday Done, Friday Done; Monday does not block later dates. |
| 14 | Scheduled Task: 8/5 Done, 8/6–8/7 no entry, 8/8 Done | Positive streak is 1 on 8/5, remains 1 through Not Due inactivity, then becomes 2 on 8/8. |
| 15 | Fixed Monday Missed, Tuesday no success | Monday remains historical/calculated Missed; active status remains Missed; next fixed occurrence still exists. |
| 16 | Fixed Monday Missed, Tuesday Done | Tuesday is explicit Done and positive streak starts at 1; active Missed ends; Monday remains Missed; schedule does not move. |
| 17 | User edits fixed Monday from Missed to Done | Monday is corrected historically; the edit does not reinterpret Tuesday or rebase the fixed calendar. |
| 18 | Rolling Every 3 Days: Monday–Friday calculated Missed; Wednesday changed to Done on Saturday | Monday and Tuesday remain Missed; Wednesday Done; next due Saturday; Saturday is Pending; positive streak = 1. |
| 19 | Same rolling history, Tuesday changed to Done instead | Tuesday Done; next due Friday; unresolved Friday is Missed; Saturday active status is Missed. |
| 20 | Fixed Mon Missed, Wed Done, Fri Done; Saturday changes Mon to Done | Mon/Wed/Fri are all Done; next fixed due remains Monday. |
| 21 | Daily due moved manually on 8/8 from 8/8 to 8/10 | 8/8 and 8/9 are Not Due unless explicit History says otherwise; 8/10 is Due; Daily does not later create Missed for 8/8–8/9. |
| 22 | Every 3 Days through 8/8; Repeat changed to Daily on 8/9 | Dates through 8/8 retain prior meaning; Daily begins at 8/9; opening History does not reinterpret 8/1–8/8. |
| 23 | Rolling due Monday, Monday/Tuesday Missed, Wednesday Did My Best | Missed chain ends; positive streak = 1; next due Saturday. |
| 24 | Monthly 31st in April and February | April occurrence normalizes to April 30; February normalizes to February 28 or 29; monthly family remains fixed-calendar. |

## Part 10: Remaining product ambiguity

The locked semantics leave only implementation-level questions for later phases; they do not reopen the recurrence contract:

- exact Delay behavior, including whether and how Delay ends or transforms a rolling or fixed active Missed state, remains Phase 1B-2;
- exact storage and provenance representation for manual due-date and Repeat boundaries remains unspecified; and
- future reward/statistics rules may distinguish Done from Did My Best even though recurrence handling treats both as successful handled outcomes.

No user-facing warning or recalculate-history choice is added in Phase 1B-1. No schema, SQL, Supabase, or production implementation is defined here.

## Locked Recurrence Transition Contract

Phase 1B-2 may rely on these rules without reopening them:

- A Task is genuinely unscheduled only when it has no due date and no selected repeat frequency.
- History alone never activates an unscheduled Task. Unscheduled Done and Did My Best are historical successes; unscheduled inactivity ends positive streak without creating Missed.
- A scheduled No Repeat Task with a due date is implicit rolling-daily. Other explicitly selected frequencies use their selected family.
- ROLLING includes Daily, Daily Until Complete, Every X Days, other explicit rolling intervals, and scheduled No Repeat. FIXED CALENDAR includes weekly, selected weekdays, every N weeks, monthly day-of-month, and monthly ordinal weekday.
- For ROLLING, every Done or Did My Best rebases `nextDue` from its logical success date plus the interval, including early and Not Due success.
- A rolling Missed chain freezes `due_on` at the missed due date and does not auto-advance. Calculated Missed days may share that one obligation identity.
- For FIXED CALENDAR, each scheduled date is its own occurrence. A missed date does not block later dates, and an extra Not Due success does not consume or move a future scheduled date.
- Scheduled Not Due inactivity is neutral for positive streak continuity unless an active Missed chain already exists. Not Due Done and Did My Best each add positive streak.
- Did My Best is always a successful handled outcome and follows Done for recurrence handling.
- Rolling historical corrections can recalculate later derived chronology between boundaries; fixed historical corrections do not move the fixed schedule.
- Manual due-date changes and Repeat changes are forward schedule boundaries. Later calculation must preserve the user’s subsequent scheduling decision and must not rewrite earlier established chronology.
- Monthly day-of-month dates normalize to the last valid day when the target day is absent from the month.
- Calculated Missed remains derived and non-mutating; time passing alone does not create explicit Missed History.

The remaining Phase 1B-2 topics are workflow/lifecycle boundaries only:

- Delay;
- Complete;
- Archive;
- Trash;
- In Progress;
- rollover execution and idempotence; and
- rewards/economy eligibility.

No behavior for those topics is specified here.
