# Phase 1B-1: Canonical Recurrence and Occurrence Transition Semantics

Status: active working architecture specification
Scope: scheduling models, recurrence, Calendar scheduling state, occurrence creation and resolution, successful outcomes, overdue chronology, streaks, manual overrides, diagnostics, and historical schedule boundaries
Required sources: [Phase 0 inventory](task-state-phase-0-inventory.md), [Phase 1A core model](task-state-phase-1a-core-model.md)
Implementation status: specification only; not implemented

## Purpose and boundaries

Phase 1A defined the canonical Task domain. Phase 1B-1 locks how four Task scheduling models, Calendar scheduling states, explicit History/checkpoint outcomes, active Task obligations, recurrence, missed chronology, streaks, manual overrides, and schedule boundaries are interpreted over logical dates.

This phase covers:

- genuinely unscheduled Tasks;
- one-time scheduled Tasks;
- rolling recurring Tasks;
- fixed-calendar recurring Tasks;
- Calendar `Unscheduled`, `Not Due`, `Due/Open`, and `Missed` interpretations;
- explicit History/checkpoint outcomes and active obligation state as separate facts;
- rolling rebasing and rolling overdue chains;
- fixed-calendar occurrence independence and scheduled-occurrence Missed streaks;
- Complete as the satisfying outcome for one-time obligations, without defining its persistence lifecycle;
- repeat selection and first-due calculation;
- manual due-date and Calendar scheduling-state overrides;
- historical schedule boundaries; and
- the canonical diagnostic/fail-safe contract.

This phase does not define exact Delay behavior, Complete lifecycle mutation/persistence, Archive, Trash, In Progress workflow, rollover execution/idempotence, rewards/economy, or the exact storage representation of historical schedule boundaries and manual Calendar overrides. Those remain Phase 1B-2 topics.

`CURRENT` statements describe inspected source and cite Phase 0, Phase 1A, or specific source functions/files. `TARGET` statements define the locked product contract and are not claims about implemented behavior. This specification supersedes earlier target language in this document wherever that language conflicts with the rules below.

## Locked inputs and canonical state model

`TARGET` — The transition model consumes:

```text
TaskConfiguration + RecurrenceAnchor + TaskLifecycle
                         +
              ExplicitHistoryEvent[]
                         +
              ScheduleBoundaryEvent[]
                         +
              ManualCalendarOverride[]
                         +
                 LogicalDayContext
                         ↓
          boundary-constrained chronology
                         ↓
              recurrence-family projection
                         ↓
          EffectiveTaskState + TaskStateDiagnostic[]
```

The canonical result must keep these facts distinct:

1. **Calendar scheduling state** — whether the Task is `Unscheduled`, `Not Due`, `Due/Open`, or represented as `Missed` for an unresolved obligation on a logical date.
2. **Explicit History/checkpoint outcome** — what the user recorded on that logical date, such as `Done`, `Did My Best`, or `Complete`.
3. **Active Task obligation state** — whether an obligation is open, unresolved/missed, satisfied, or terminated.
4. **Recurrence configuration and boundaries** — the selected family, cadence, due cursor, and later authoritative schedule decisions.

One logical date may therefore contain an explicit History event while the active obligation remains unresolved. For example:

```text
8/11 History = Did My Best
8/11 handled = yes

one-time obligation = still unresolved
active Task status = Missed
```

“What I did today” and “whether the Task obligation has been satisfied” are separate facts. No single field or generic outcome concept may silently represent both.

The following Phase 1A rules remain in force:

- `logicalDate` is the History event date. A scheduled occurrence date is a separate fact.
- One explicit outcome exists per Task/logical date. Explicit History is authoritative for that date, subject to the manual Calendar override rules below.
- Calculated Missed is derived Calendar/status chronology. Time passing alone does not create an ordinary explicit History row.
- A canonical occurrence identity includes the Task and its scheduled date: `task:{taskId}:occurrence:{occurrenceDueOn}`. Fixed-calendar dates are separate occurrence identities; a rolling overdue chain may reuse one identity across several calculated Missed logical dates.
- `due_on` is a current schedule cursor/projection, not permission to reinterpret explicit History or a later schedule boundary.
- Recurrence family semantics remain distinct. Rolling, fixed-calendar, one-time, and genuinely unscheduled behavior do not share one unresolved-obligation rule.

## Part 1: The four Task scheduling models

`TARGET` — The canonical recurrence model has exactly four scheduling categories:

| Category | Definition | Obligation meaning |
|---|---|---|
| **GENUINELY UNSCHEDULED** | No due date and no selected Repeat. | No live schedule or Missed obligation exists. History is historical evidence only. |
| **ONE-TIME SCHEDULED** | Has a due date and no selected Repeat. | Exactly one actual obligation exists at the due date. It is not implicit Daily. |
| **ROLLING RECURRING** | Daily, Every X Days, Daily Until Complete while active, or another explicitly rolling interval rule. | Success rebases the next due date from the success logical date. An unresolved due date can freeze into one overdue chain. |
| **FIXED-CALENDAR RECURRING** | Weekly, selected weekdays, Every N Weeks, monthly day-of-month, or monthly ordinal weekday. | Each scheduled calendar occurrence exists independently according to the fixed rule. |

### Genuinely unscheduled

A Task is genuinely unscheduled exactly when both conditions hold:

```text
no due date
and
no selected Repeat
```

History alone does not schedule the Task. Done, Did My Best, Complete, Missed, or any other historical entry remains historical evidence and does not create recurrence or Missed obligations.

Done, Did My Best, and Complete may exist historically on an unscheduled Task. Where the outcome is a successful historical action, it can contribute to a positive streak under the unscheduled streak rules. It does not create a due date, choose a Repeat, or activate a live schedule.

### One-time scheduled

A Task with a due date and no selected Repeat is one-time scheduled. This is not implicit rolling Daily. There is one actual obligation, and `Complete` is the outcome that permanently satisfies it.

Done and Did My Best are activity/checkpoint outcomes for a one-time Task. They do not by themselves Complete the Task. Before the due date they can record progress and successful historical days; at and after the deadline they do not satisfy the overdue obligation.

The one-time obligation is eliminated if the Task is Completed before its due date. It is satisfied on the due date or later only by Complete. The semantic outcome is locked here; exact Complete lifecycle mutation and persistence remain Phase 1B-2.

### Rolling recurring

Rolling recurrence includes:

| Repeat rule | Rolling meaning |
|---|---|
| Daily | Interval of one logical day. |
| Every X Days | Explicit rolling interval of X logical days. |
| Daily Until Complete | Daily rolling interval while the Task remains active; Complete lifecycle handling remains Phase 1B-2. |
| Other explicitly rolling interval rules | Next due date is calculated from the logical date of the handled success plus the interval. |

Rolling success rebases the next due date. When the current due date passes unresolved, the due date freezes and the active obligation can form a rolling Missed chain until handled.

### Fixed-calendar recurring

Fixed-calendar recurrence includes:

| Repeat rule | Fixed-calendar meaning |
|---|---|
| Weekly | Configured weekly calendar membership. |
| Selected weekdays | The selected weekday set is the membership rule. |
| Every N Weeks | The selected weekday set repeats in a fixed week phase. |
| Monthly day-of-month | The configured month date, normalized to the last valid day when necessary. |
| Monthly ordinal weekday | The configured ordinal weekday in each eligible month. |

Each scheduled calendar date has its own occurrence identity. A missed fixed occurrence does not queue-block, consume, erase, or delay future fixed-calendar membership.

## Part 2: Calendar scheduling state

`TARGET` — Calendar scheduling state must distinguish `Unscheduled` from `Not Due`.

### Unscheduled day

An `Unscheduled` day means no active schedule applies to this Task on that logical date.

Examples:

- a genuinely unscheduled Task;
- a one-time scheduled Task before its first due date; and
- a date before an explicit schedule-start boundary.

An Unscheduled day is not a missed obligation. Inactivity on it cannot create a Missed result or a Missed streak.

### Not Due day

A `Not Due` day means an active recurring schedule exists, but this logical date falls between scheduled obligations.

Examples:

```text
Every 3 Days

8/5 Due
8/6 Not Due
8/7 Not Due
8/8 Due
```

Those dates are not Unscheduled. The distinction matters for streaks and for whether success rebases a rolling cadence.

### Due/Open and Missed

`Due/Open` means an active obligation applies on the logical date and has not yet passed its resolution boundary. For a one-time Task, the due date is the one actual obligation date. For recurring Tasks, it is the current or independently scheduled occurrence.

`Missed` means an obligation passed without the satisfying or family-appropriate handled outcome. It is an obligation/status interpretation, not permission to manufacture explicit History. A logical date can therefore have explicit checkpoint History while the active obligation remains Missed.

### State projection rule

The Calendar state, explicit History, and active Task obligation are projected together but are not collapsed:

```text
Calendar date state  ≠  explicit History/checkpoint  ≠  active obligation state
```

Calculated future or between-obligation facts are informational. They must not create History or mutate recurrence merely because they are projected.

## Part 3: Unscheduled streaks and scheduled Not Due streaks

### Unscheduled-day positive streak behavior

`TARGET` — On Unscheduled days, Done, Did My Best, and Complete where applicable count as successful historical days. Positive streaks require consecutive successful logical dates.

Example:

```text
8/5 Done
8/6 Done
→ positive streak = 2

8/7 no success
→ positive streak ends
```

Another example:

```text
8/5 Done
8/6 no success
8/7 Done
8/8 Done
→ current positive streak = 2
```

Inactivity on an Unscheduled day:

- breaks a positive streak;
- does not create Missed;
- does not create a Missed streak; and
- does not schedule the Task.

### Scheduled Not Due positive streak behavior

For a recurring scheduled Task, Not Due behavior is different:

| Calendar state and action | Positive streak | Missed behavior | Recurrence effect |
|---|---|---|---|
| Not Due + no success | Neutral: does not increase or break it. | Does not start a Missed streak unless an active Missed condition exists. | No change. |
| Not Due + Done | Counts as positive success. | Clears the family-appropriate active Missed condition. | Rolling rebases; fixed-calendar schedule does not move. |
| Not Due + Did My Best | Counts as positive success. | Clears the family-appropriate active Missed condition. | Rolling rebases; fixed-calendar schedule does not move. |

For a rolling recurrence, a Not Due success is extra credit and also rebases the cadence. For a fixed-calendar recurrence, it records a successful action on that logical date without consuming or moving any future scheduled occurrence.

Do not use a generic scenario that leaves dates Not Due after a rolling success has created an earlier due date:

```text
Every 3 Days
current due 8/10

8/5 Done
→ positive streak = 1
→ rolling next due = 8/8

8/6 Not Due
→ streak remains 1

8/7 Not Due
→ streak remains 1

8/8 Done
→ positive streak = 2
→ next due = 8/11
```

### Scheduled Missed interaction

Not Due inactivity is positive-streak neutral when no active Missed condition exists. Once a recurring Task already has an active Missed condition, later Not Due logical dates may continue the family-specific active Missed chronology. This does not turn Not Due into a new independent scheduled obligation.

## Part 4: ROLLING recurring transitions

### Rolling success rebases the due date

`TARGET` — For a rolling recurrence:

```text
nextDue = successLogicalDate + interval
```

Done or Did My Best on any logical date can be early, on time, late, or extra credit on a Not Due day. Each such rolling success rebases from its own success logical date.

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

Do not apply a lower-bound adjustment based on the prior due date. The success logical date is the rolling rebase date.

### Rolling occurrence identity

A rolling Task has one current obligation at a time. Its current due date supplies the occurrence identity. If that date passes unresolved, elapsed logical dates do not create a new rolling occurrence for each day.

After Done or Did My Best, the current rolling obligation is handled and the next due date becomes the next occurrence identity. Complete lifecycle handling is separate where the selected product rule requires termination.

### Rolling Missed chain

When a rolling due date passes without Done, Did My Best, or another later-defined handled action:

- the Task becomes actively Missed;
- `due_on` freezes at the unresolved due date;
- recurrence does not advance automatically; and
- the same obligation remains current until the Missed chain is handled.

For rolling overdue recurrence, Missed streak can count consecutive overdue logical days while this one frozen obligation remains unresolved.

Example:

```text
Every 3 Days
due Monday

Monday no success
→ active status Missed
→ due_on remains Monday
→ Missed streak = 1

Tuesday no success
→ due_on remains Monday
→ Missed streak = 2

Wednesday no success
→ due_on remains Monday
→ Missed streak = 3

Thursday Done
→ rolling Missed chain ends
→ positive streak = 1
→ next due = Sunday
```

Done or Did My Best ends a rolling Missed chain and rebases the cadence. Delay may also affect the chain, but exact Delay behavior remains Phase 1B-2.

### Rolling Calendar representation

A rolling overdue chain may display each completed overdue logical day as calculated Missed:

```text
Every 3 Days
due Monday
Done Thursday

Monday    calculated Missed
Tuesday   calculated Missed
Wednesday calculated Missed
Thursday  explicit Done
```

Monday through Wednesday reference the same underlying overdue obligation. They are not separate scheduled occurrences, do not create separate explicit Missed History rows, and do not advance recurrence by passage of time.

### Rolling historical correction butterfly effect

Explicit History remains authoritative for its logical date. When a rolling historical success is added or changed, later derived chronology is recalculated from that success date. This may change later calculated Missed days, active status, current streaks, and the rolling next due date.

The recalculation is intentionally constrained by later authoritative manual due-date or Repeat boundaries. It must preserve explicit History and must stop at a later schedule boundary instead of overwriting the user’s later scheduling decision.

## Part 5: ONE-TIME scheduled transitions

### One-time Calendar chronology

Example:

```text
due = 8/10
Repeat = none
```

Calendar interpretation before the deadline:

```text
8/5 Unscheduled
8/6 Unscheduled
8/7 Unscheduled
8/8 Unscheduled
8/9 Unscheduled
8/10 Due/Open
```

There is no recurrence after the one-time obligation is satisfied or terminated. Before the due date, the Task is scheduled in the one-time model, but dates before its first due date are Unscheduled Calendar days rather than Not Due recurring days.

### Before the due date

Done and Did My Best before the deadline are progress/checkpoint actions. They:

- create explicit successful History for their logical date;
- can build a consecutive Unscheduled-day positive streak; and
- do not move the due date or create a recurrence.

Example:

```text
8/6 Done
8/7 Done
→ positive streak = 2
→ due remains 8/10
```

### Complete before the due date

Complete is the satisfying outcome for the one-time obligation even when recorded early.

Example:

```text
8/6 Done
8/7 Complete
```

Result:

- the final positive streak record is 2;
- Complete counts as a successful historical day;
- the Task becomes permanently Complete under the later lifecycle mutation contract;
- the 8/10 obligation is eliminated; and
- 8/10 never becomes Missed.

The Task terminates for recurrence purposes after Complete; its positive streak cannot continue through future dates.

### At and after the deadline

Once the one-time due date is reached, the actual obligation is to Complete the Task. Done and Did My Best can still be recorded as checkpoints, but they do not satisfy the obligation.

If the Task is not Complete by rollover:

- active status becomes Missed;
- `due_on` remains the original due date;
- Missed streak begins at the overdue obligation;
- Missed accumulates on each overdue logical day until Complete; and
- the one-time obligation remains the same frozen obligation.

Example:

```text
One-time Task, due 8/10

8/10 Did My Best, not Complete
8/11 Done, not Complete
8/12 no checkpoint
8/13 Complete
```

History/checkpoint facts are:

```text
8/10 Did My Best
8/11 Done
8/13 Complete
```

Obligation chronology is:

```text
8/10 Missed streak = 1
8/11 Missed streak = 2
8/12 Missed streak = 3
8/13 Complete ends the Missed chain
```

After the deadline, Done and Did My Best:

- remain checkpoint actions;
- do not satisfy or clear the one-time obligation;
- do not clear active Missed;
- do not earn positive streak credit while the overdue obligation remains incomplete; and
- do not create recurrence or move `due_on`.

Complete:

- satisfies the one-time obligation;
- ends the Missed chain;
- counts as a successful final historical day;
- may produce a final positive streak of 1; and
- terminates the Task so the streak cannot continue.

## Part 6: FIXED-CALENDAR recurring transitions

### Each scheduled date is its own occurrence

Fixed-calendar membership continues independently across scheduled dates. Each scheduled date has its own occurrence identity:

```text
task:{taskId}:occurrence:{scheduledCalendarDate}
```

One unresolved or missed fixed occurrence does not block a later calendar date. Do not use one globally unresolved occurrence to queue fixed dates behind an earlier Missed date.

Example:

```text
Monday / Wednesday / Friday Task

Monday    Missed
Wednesday Done
Friday    Done
```

Monday, Wednesday, and Friday remain separate date outcomes. Monday does not prevent Wednesday or Friday from becoming their own scheduled occurrences.

### Fixed-calendar success on a Not Due day

Done or Did My Best on a fixed-calendar Not Due day:

- creates explicit successful History for that logical date;
- contributes to positive streak;
- can clear an active fixed Missed condition;
- does not consume a future scheduled occurrence; and
- does not move the fixed recurrence schedule.

Example:

```text
Weekly Friday Task
next scheduled occurrence = Friday 8/10

Wednesday 8/8 Done
```

8/8 is explicit Done and positive success; Friday 8/10 remains the scheduled occurrence.

### Fixed-calendar Missed behavior and active state

When a fixed-calendar date is Missed:

- that scheduled date remains historical/calculated Missed;
- the active Task may remain Missed because of the unresolved condition;
- future fixed-calendar occurrences still exist independently; and
- a later explicit success can clear the active Missed condition without rewriting the earlier Missed date.

Example:

```text
Every Monday

8/10 Missed
Today 8/11
```

Result:

```text
active status = Missed
due_on = 8/10
future scheduled occurrence = 8/17
```

If 8/11 is then Done:

- 8/10 remains historical Missed;
- 8/11 becomes explicit Done;
- active Missed state clears;
- Missed streak ends;
- positive streak starts at 1;
- `due_on` advances to the next applicable fixed scheduled date, 8/17; and
- active status becomes the next schedule-derived state, such as Upcoming or Not Due.

Done on a later Not Due date does not consume the next Monday occurrence. It clears the active Missed condition while the fixed calendar continues normally.

### Fixed-calendar historical correction

Historical corrections on fixed-calendar Tasks update History, the Calendar outcome, streaks, and current interpretation where appropriate. They do not move the underlying fixed recurrence schedule.

If the user edits Monday itself from Missed to Done, Monday is corrected historically. That edit does not turn another date into Monday’s occurrence or rebase the fixed calendar.

## Part 7: Fixed-calendar Missed streaks

`TARGET` — For FIXED CALENDAR recurrence, Missed streak counts consecutive missed scheduled occurrences, not every calendar day.

Example:

```text
Every Monday

8/3 Missed
8/4–8/9 Not Due
8/10 Missed
```

The Missed streak is 2. The intervening Not Due dates do not create daily Missed entries and do not turn the two scheduled occurrences into a rolling overdue chain.

If 8/11 is Done:

- historical 8/3 Missed remains;
- historical 8/10 Missed remains;
- the active Missed streak ends;
- positive streak starts at 1; and
- the active Missed condition clears.

For a Monday / Wednesday / Friday Task:

```text
Monday    Missed
Wednesday Missed
Thursday  Done
Friday    scheduled normally
```

Monday and Wednesday remain Missed, Thursday is explicit Done, the Missed streak of 2 ends on Thursday, positive streak starts at 1, active Missed clears, and Friday remains due normally. Thursday Done does not consume Friday.

Rolling overdue recurrence has different behavior: its Missed streak can count consecutive overdue logical days while one frozen rolling obligation remains unresolved. These family rules must not be generalized into one counter.

## Part 8: Outcomes, obligations, and calculated Missed

### Family-aware success rules

`TARGET` — Done and Did My Best are not universally satisfying outcomes. Their effect depends on the scheduling model and obligation state:

| Model/state | Done or Did My Best |
|---|---|
| Genuinely unscheduled | Historical successful action; can count for unscheduled positive streak; no obligation is created. |
| One-time before due | Checkpoint/progress and successful historical day; can count for consecutive Unscheduled-day positive streak; due date remains. |
| One-time at/after due | Checkpoint only; does not Complete, clear active Missed, rebase, or earn positive streak credit while incomplete. |
| Rolling recurring | Handled success; ends rolling Missed chain when active and rebases `nextDue` from success date. |
| Fixed-calendar scheduled date | Resolves that scheduled occurrence and contributes positive success; future fixed dates remain independent. |
| Fixed-calendar Not Due date | Explicit positive History; can clear active Missed; does not consume or move a future fixed occurrence. |

Complete has a separate semantic role:

- for a one-time scheduled Task, Complete satisfies the sole obligation before, on, or after the due date;
- before the deadline it eliminates the future obligation and prevents Missed;
- after the deadline it ends the one-time Missed chain and terminates the Task; and
- on a genuinely unscheduled Task it may remain historical Complete without creating recurrence.

### Explicit versus calculated Missed

Explicit Missed History, where supported, is authoritative for its logical date. Calculated Missed is a derived representation of an obligation that passed without the appropriate satisfying outcome. Neither form is a successful outcome.

- rolling Missed freezes one due date and forms one overdue logical-day chain;
- one-time Missed freezes the original due date and accumulates each overdue logical day until Complete;
- fixed-calendar Missed marks its scheduled date while later fixed dates continue independently; and
- unscheduled History never activates a live schedule or Missed obligation.

No automatic explicit Missed History row is created merely because time passed.

## Part 9: Repeat selection and first-due calculation

### Selecting Repeat on a genuinely unscheduled Task

Given:

```text
no due date
no Repeat
today = 8/11
```

Selecting Repeat schedules the Task. The default first due date is the first matching occurrence on or after today:

| Selection | Default first due |
|---|---|
| Daily | 8/11 |
| Every 3 Days | 8/11 |
| Weekly Friday | Friday 8/14 |
| Monday / Wednesday / Friday | Wednesday 8/12 |
| Monthly on the 15th | 8/15 |
| Monthly on the 7th | 9/7 |

Repeat defines cadence. If the user explicitly supplies or manually changes a due date, that chosen date wins as the current schedule boundary. The first-due default is only used when no explicit due-date boundary is supplied.

### Repeat changes

A Repeat change applies from its change logical date forward:

- earlier Calendar dates are not reinterpreted under the new recurrence;
- earlier established chronology is preserved;
- explicit History is preserved; and
- the new recurrence begins at the change-date schedule boundary.

Opening History later must not reinterpret dates before that boundary using the current Repeat configuration.

Earlier established chronology remains earlier established chronology unless the user explicitly edits the past.

## Part 10: Schedule-boundary and manual due-date rules

### Manual due-date changes

Manual due-date changes are authoritative from their logical boundary forward. A due-date edit is not permission to reinterpret explicit History before the boundary.

For a rolling or one-time Task, the changed date becomes the current due boundary according to that model. For a fixed-calendar Task, a due-date edit can override the current occurrence without permanently changing the Repeat rule.

Example of a forward boundary:

```text
Daily Task
8/8: user manually changes due date from 8/8 to 8/10
```

Result:

- 8/8 = Unscheduled unless explicit History says otherwise;
- 8/9 = Unscheduled unless explicit History says otherwise; and
- 8/10 = Due/Open.

Daily Repeat must not later create Missed for 8/8 or 8/9 contrary to this authoritative boundary.

### Manual due-date override on fixed recurrence

Example:

```text
Repeat = Every Monday
current due = Monday 8/10
8/11: user manually changes due date to Thursday 8/13
```

Target meaning:

- 8/13 becomes the current overridden occurrence date;
- the Every Monday recurrence rule itself does not change; and
- after the 8/13 occurrence is handled, the normal Monday cadence resumes.

This is a current-occurrence/schedule-boundary override, not an automatic permanent rewrite of the recurrence family.

### Rolling historical corrections across boundaries

Rolling historical corrections can butterfly derived chronology forward from the edited date, but replay must stop at later authoritative manual due-date or Repeat boundaries. Fixed-calendar corrections can update date outcomes and active interpretation but cannot move the fixed schedule.

## Part 11: Manual Calendar scheduling-state override contract

### Escape hatch requirement

`TARGET` — Future Calendar editing must eventually let the user manually override calculated scheduling states such as:

- `Not Due`;
- `Unscheduled`; and
- `Due/Open`.

Existing outcome-style History edits are not enough for every rare historical edge case. The automatic engine should handle normal chronology, while the user has a correction escape hatch for exceptional dates.

### Override scope

A manual Calendar scheduling-state override:

- wins for that logical date;
- changes Calendar interpretation for that date;
- changes streak and statistic calculations that depend on that date;
- does not by itself change the underlying Repeat rule; and
- does not by itself rebase future recurrence.

Example:

```text
Calculated:
8/10 Missed
8/11 Missed
8/12 Missed

User override:
8/11 → Not Due [manual]
```

Result:

```text
8/10 Missed
8/11 Not Due [manual]
8/12 Missed
```

The original three-day consecutive Missed streak is broken by the manual Not Due override. The current streak may therefore be only the later valid Missed segment. The underlying recurrence configuration is not automatically rewritten.

### Overriding an actual obligation date

At a high level, if the user changes an actual Missed obligation date itself to `Not Due` or `Unscheduled`, treat that as the user saying that obligation should not have existed. Remove that Missed obligation from the derived interpretation and recalculate active status and streaks accordingly.

Do not over-specify obscure combinations of manual overrides in Phase 1B-1. Exact UI, conflict handling, and storage remain later work.

### Overrides and active state on unrelated dates

Calendar date state and active Task state remain distinct.

Example:

```text
Every 3 Days
due 8/10, missed
today 8/11

User manually overrides 8/11 to Not Due
```

Result:

```text
Calendar:
8/10 Missed
8/11 Not Due [manual]

Active Task:
still Missed because the unresolved 8/10 obligation remains
```

Do not automatically clear active Missed merely because a later non-obligation date was manually changed to Not Due.

## Part 12: Delay boundary for Phase 1B-2

Do not define full Delay behavior here. The following product distinction is locked for the handoff:

```text
Monday / Wednesday / Friday

Monday Missed
Wednesday Missed
Thursday Done
Friday still due
```

If on Thursday the user instead intentionally Delays the upcoming Friday occurrence until Monday:

- Friday becomes Not Due; and
- Monday becomes the deferred due date according to the later Delay contract.

Done and Did My Best mean “I handled/worked on the Task today.” A historical edit means “what happened on that earlier date was different.” Delay means “change when an obligation is expected.” These are separate concepts.

Exact Delay transitions, persistence, interaction with active Missed state, and conflict behavior remain Phase 1B-2.

## Part 13: Monthly normalization

`TARGET` — A monthly day-of-month recurrence targeting a date that does not exist in a month uses the last valid day of that month.

Examples:

- Monthly 31st → April 30;
- Monthly 31st → February 28 in a non-leap year; and
- Monthly 31st → February 29 in a leap year.

The normalization changes the occurrence date for that month only. It does not convert monthly recurrence into rolling behavior.

## Part 14: Diagnostic and fail-safe architecture

### Canonical diagnostic contract

`TARGET` — The future canonical Task-state engine must not silently guess through contradictory, impossible, unsupported, or ambiguous state combinations. If it cannot safely determine canonical state, it returns the safest state that can be proven and emits a structured diagnostic.

Conceptually:

```text
EffectiveTaskState
+
TaskStateDiagnostic[]
```

Possible diagnostic severities include:

- `warning`; and
- `error` / `needs attention`.

Conditions that should produce diagnostics rather than silent guessing include:

- contradictory authoritative schedule boundaries;
- impossible occurrence chronology;
- multiple mutually exclusive canonical obligations;
- malformed or unsupported recurrence configuration;
- stale occurrence metadata that cannot be reconciled safely;
- manual overrides that produce an unresolved conflict; and
- missing information required to determine an authoritative transition.

Target behavior:

1. Preserve user data.
2. Do not automatically manufacture History to “fix” the contradiction.
3. Do not silently choose one competing authority when canonical precedence cannot resolve it.
4. Return the safest state that can be proven.
5. Attach a diagnostic explaining what could not be resolved.
6. Future UI should surface serious diagnostics visibly using the existing red/error-style attention treatment or equivalent.
7. The user should know the Task needs inspection instead of ADHDice quietly behaving incorrectly.

This is a future fail-safe and debugging mechanism. Phase 1B-1 defines only the architectural contract; it does not implement diagnostic UI, diagnostic persistence, or automatic repair.

## Part 15: Transition invariants

`TARGET` — The canonical transition layer must preserve these invariants:

**TRANSITION INVARIANT 1 — Four scheduling models are distinct.** Genuinely unscheduled, one-time scheduled, rolling recurring, and fixed-calendar recurring Tasks do not share one generic due-date rule.

**TRANSITION INVARIANT 2 — Unscheduled is no due plus no Repeat.** History alone cannot activate a live schedule or create a Missed obligation.

**TRANSITION INVARIANT 3 — Due plus no Repeat is one-time.** A due date with no selected Repeat creates exactly one obligation and never implies rolling Daily.

**TRANSITION INVARIANT 4 — Complete satisfies one-time.** Complete is the satisfying outcome for a one-time obligation before, on, or after the due date.

**TRANSITION INVARIANT 5 — One-time overdue Done/DMB are checkpoints.** After the deadline, Done and Did My Best do not Complete, clear active Missed, rebase, or earn positive streak credit while the obligation remains incomplete.

**TRANSITION INVARIANT 6 — Unscheduled and Not Due differ.** A one-time pre-due date can be Unscheduled; a recurring between-obligation date is Not Due.

**TRANSITION INVARIANT 7 — Unscheduled inactivity breaks positive streak without Missed.** No success on an Unscheduled day ends a positive streak but creates no Missed result or Missed streak.

**TRANSITION INVARIANT 8 — Scheduled Not Due inactivity is neutral.** Not Due with no success neither increases nor breaks positive streak and starts no Missed chain unless an active Missed condition already exists.

**TRANSITION INVARIANT 9 — Not Due success is positive.** Done or Did My Best on Not Due counts as positive success; rolling recurrence rebases and fixed recurrence does not move.

**TRANSITION INVARIANT 10 — Rolling success rebases from success date.** For every rolling interval, `nextDue = successLogicalDate + interval`, including early and Not Due success.

**TRANSITION INVARIANT 11 — Rolling Missed freezes one obligation.** An unresolved rolling due date freezes `due_on`; calculated overdue logical days may share one occurrence identity.

**TRANSITION INVARIANT 12 — Rolling Missed streak can count logical days.** A rolling overdue chain may count consecutive overdue logical days while its one obligation remains unresolved.

**TRANSITION INVARIANT 13 — Fixed dates are independent.** A missed fixed-calendar date does not block, consume, erase, or delay later scheduled dates.

**TRANSITION INVARIANT 14 — Fixed Missed streak counts occurrences.** Fixed-calendar Missed streak counts consecutive missed scheduled occurrences, not every calendar day.

**TRANSITION INVARIANT 15 — Fixed future schedule coexists with active Missed.** An older unresolved fixed Missed condition may remain active while future fixed schedule membership continues.

**TRANSITION INVARIANT 16 — Fixed late success clears active Missed without consuming future date.** A later Done or Did My Best can clear active fixed Missed while the next fixed occurrence remains due normally.

**TRANSITION INVARIANT 17 — History/checkpoint and obligation state are separate.** An explicit checkpoint may exist while the active one-time obligation remains Missed.

**TRANSITION INVARIANT 18 — Calculated Missed is non-mutating.** Time passing may produce derived Calendar/status Missed but does not create explicit History or advance recurrence by itself.

**TRANSITION INVARIANT 19 — Explicit History is date-authoritative.** Historical edits update their logical date and may alter later derived chronology without being overwritten by calculation.

**TRANSITION INVARIANT 20 — Calendar overrides win for their date.** A manual scheduling-state override controls that logical date’s Calendar interpretation and dependent streak/stat calculations.

**TRANSITION INVARIANT 21 — Calendar override does not rewrite Repeat.** A scheduling-state override does not by itself mutate recurrence configuration or rebase future recurrence.

**TRANSITION INVARIANT 22 — Actual-obligation override may remove that obligation.** Changing an actual Missed due date to Not Due or Unscheduled means the obligation should not have existed; active interpretation must recalculate.

**TRANSITION INVARIANT 23 — Schedule boundaries are forward-authoritative.** Manual due-date changes and Repeat changes apply from their logical boundary forward; later History inspection cannot reinterpret earlier established chronology.

**TRANSITION INVARIANT 24 — Fail-safe beats silent guessing.** The canonical engine emits a structured diagnostic when unresolved contradictions, impossible chronology, unsupported configuration, or missing authoritative information prevents safe determination.

**TRANSITION INVARIANT 25 — One family-aware authority.** Recurrence, Calendar, active status, streaks, diagnostics, and persistence projections must consume the same family-aware canonical result rather than independently applying competing rules.

## Part 16: Scenario fixtures

`TARGET` — The following 32 fixtures are concrete semantic checks for this phase. “Explicit” means a saved History outcome. “Calculated” means a derived Calendar/status result and not a new History row. Fixtures are semantic targets only; they are not implementation tests in Phase 1B-1.

| # | Scenario | Expected result |
|---:|---|---|
| 1 | Genuinely unscheduled: no due date, no Repeat, no History | No live schedule, no obligation, no calculated Missed. |
| 2 | Genuinely unscheduled: 8/5 Done, 8/6 Done | Consecutive positive streak = 2; no due date or recurrence is created. |
| 3 | Genuinely unscheduled: 8/5 Done, 8/6 no success, 8/7 Done, 8/8 Done | 8/6 breaks the prior streak; current positive streak on 8/7–8/8 = 2; no Missed. |
| 4 | One-time due 8/10, Repeat none | 8/5–8/9 are Unscheduled Calendar days; 8/10 is Due/Open; no implicit Daily recurrence. |
| 5 | One-time due 8/10: 8/6 Done, 8/7 Did My Best | Both are pre-due checkpoints and successful Unscheduled-day history; due remains 8/10. |
| 6 | One-time due 8/10: 8/6 Done, 8/7 Complete | Final positive streak record = 2; obligation is eliminated; 8/10 never becomes Missed. |
| 7 | One-time due 8/10, no Complete by rollover | Active status becomes Missed; `due_on` remains 8/10; the one-time obligation is frozen. |
| 8 | One-time due 8/10: 8/10 Did My Best, not Complete | Explicit checkpoint exists; obligation remains unresolved; active status is Missed after rollover; no overdue positive credit. |
| 9 | One-time due 8/10: 8/11 Done, not Complete | Explicit checkpoint exists; it does not Complete or clear active Missed and earns no positive credit while overdue. |
| 10 | One-time due 8/10: Missed through 8/12, Complete 8/13 | Missed streak reaches 3; Complete satisfies the obligation, ends the chain, counts as final positive success, and terminates recurrence. |
| 11 | One-time due 8/10: Complete on 8/10 | The due-date obligation is satisfied; no Missed chain begins; Task terminates after Complete semantics apply. |
| 12 | Every 3 Days, current due 8/10: Done 8/5, then Done 8/8 | 8/5 is extra-credit success and rebases due to 8/8; 8/8 success rebases next due to 8/11. |
| 13 | Every 3 Days, due Monday: no success Monday–Wednesday, Done Thursday | `due_on` freezes Monday; Monday–Wednesday may be calculated Missed for one obligation; Thursday ends chain; next due is Sunday. |
| 14 | Every 3 Days, due 8/10: Done 8/5, no success 8/6–8/7 | 8/6–8/7 are Not Due and positive-streak neutral; no Missed chain starts. |
| 15 | Every Monday: 8/3 Missed, 8/10 Missed | Missed streak = 2 because it counts missed scheduled occurrences, not 8/4–8/9 calendar days. |
| 16 | Every Monday: 8/10 Missed, 8/11 Done | 8/10 remains Missed; 8/11 is explicit Done; active Missed clears; positive streak starts at 1; next due is 8/17. |
| 17 | Monday/Wednesday/Friday: Monday Missed, Wednesday Missed, Thursday Done, Friday scheduled | Monday and Wednesday remain Missed; Thursday ends Missed streak of 2 and starts positive streak at 1; Friday remains due. |
| 18 | Weekly Friday: Wednesday Done before Friday | Wednesday is explicit positive History; Friday remains the scheduled occurrence and is not consumed. |
| 19 | Fixed Monday: Monday Missed, Tuesday no success | Monday remains Missed; active status may remain Missed; next Monday occurrence still exists. |
| 20 | Fixed Monday: user edits Monday Missed to Done | Monday is corrected historically; fixed recurrence and later dates do not rebase. |
| 21 | Selecting Daily on completely unscheduled Task, today 8/11 | First due defaults to 8/11. |
| 22 | Selecting Every 3 Days on completely unscheduled Task, today 8/11 | First due defaults to 8/11; later successes rebase by three logical days. |
| 23 | Selecting Weekly Friday or Monday/Wednesday/Friday, today Tuesday 8/11 | Weekly Friday first due is 8/14; weekday-set first due is Wednesday 8/12. |
| 24 | Selecting monthly recurrence on 8/11 | Monthly 15th first due is 8/15; monthly 7th first due is 9/7. |
| 25 | Fixed Every Monday due 8/10 manually changed on 8/11 to Thursday 8/13 | 8/13 is the current overridden occurrence; Repeat remains Every Monday; normal Monday cadence resumes after it is handled. |
| 26 | Daily due moved from 8/8 to 8/10 on 8/8 | 8/8 and 8/9 become Unscheduled unless explicit History says otherwise; 8/10 is Due/Open; no later Missed is manufactured for 8/8–8/9. |
| 27 | Calculated 8/10–8/12 Missed; user overrides 8/11 to Not Due | 8/11 manual Not Due breaks the three-day Missed streak; recurrence rule remains unchanged. |
| 28 | Every 3 Days: 8/10 Missed, 8/11 manually overridden to Not Due | 8/10 remains active Missed because the later unrelated-date override does not remove the unresolved 8/10 obligation. |
| 29 | User changes the actual 8/10 Missed obligation date to Not Due | Treat the obligation as not having existed; remove it from derived active status and streak interpretation; do not rewrite Repeat automatically. |
| 30 | Repeat Every 3 Days through 8/8, changed to Daily on 8/9 | Dates through 8/8 retain earlier chronology; Daily applies from the 8/9 boundary forward. |
| 31 | Rolling history with later manual due boundary, then an earlier History edit | Recalculate rolling derived chronology only up to the later boundary; preserve the later manual schedule decision. |
| 32 | Contradictory boundaries or unsupported occurrence metadata | Preserve user data, return only the safest provable state, attach a warning/error diagnostic, create no synthetic History, and do not silently choose an unresolved authority. |

## Part 17: Remaining ambiguity and Phase 1B-2 handoff

The recurrence, one-time, and Calendar-state semantics are locked enough for Phase 1B-2. The remaining ambiguity is implementation/storage scope, not permission to reopen these core distinctions:

- exact Delay behavior, including date movement, whether it ends or transforms an active Missed state, and persistence;
- Complete lifecycle mutation and persistence details;
- Archive;
- Trash;
- In Progress;
- rollover execution and idempotence;
- rewards/economy eligibility;
- exact diagnostics presentation and persistence, if needed; and
- exact storage representation of historical schedule boundaries and manual Calendar overrides.

Phase 1B-2 must preserve the four scheduling models, the Unscheduled versus Not Due distinction, one-time Complete obligation semantics, family-specific Missed chains, forward schedule boundaries, manual Calendar override contract, and diagnostic fail-safe contract. It must not begin by implementing a generic implicit-Daily rule for due date plus no Repeat.

No production code, tests, schema, SQL, Supabase, UI, diagnostics implementation, version change, commit, or push is defined or authorized by this specification.
