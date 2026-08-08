# Phase 1B-1: Canonical Recurrence and Occurrence Transition Semantics

Status: active working architecture specification
Scope: recurrence, occurrence creation, resolution, advancement, early/late success, overdue chronology, No Repeat activation, and fixed-calendar behavior
Required sources: [Phase 0 inventory](task-state-phase-0-inventory.md), [Phase 1A core model](task-state-phase-1a-core-model.md)
Implementation status: specification only; not implemented

## Purpose and boundaries

Phase 1A defined what the canonical Task domain contains. Phase 1B-1 defines how recurrence occurrences move through time and how recurrence transitions are derived.

This phase covers:

- recurrence families and schedule membership;
- occurrence creation and identity use;
- Done and Did My Best resolution;
- recurrence advancement;
- early and late resolution;
- overdue and calculated Missed chronology;
- No Repeat activation; and
- fixed-calendar alignment.

This phase does not define Delay behavior, Complete lifecycle semantics, Archive, Trash, In Progress workflow, rollover execution, or rewards/economy. Those are Phase 1B-2 topics.

`CURRENT` statements describe inspected source and cite Phase 0, Phase 1A, or specific source functions/files. `TARGET` statements define the future semantic contract and are not claims about implemented behavior.

## Locked inputs from Phase 1A

`TARGET` — The transition model consumes:

```text
TaskConfiguration + RecurrenceAnchor + TaskLifecycle
                         +
              ExplicitHistoryEvent[]
                         +
                 LogicalDayContext
                         ↓
              canonical occurrence chronology
                         ↓
                    TaskOccurrence
                         ↓
                 EffectiveTaskState
```

The following Phase 1A rules are not reopened:

- For an active scheduled Task, `due_on` is the current or next unresolved occurrence date. It is a cursor/projection, not the recurrence anchor.
- The recurrence anchor is the stable schedule basis and does not move merely because an occurrence is completed.
- Current ADHDice supports at most one obligation per Task per due date. The canonical identity is `task:{taskId}:occurrence:{occurrenceDueOn}`.
- `logicalDate` is the History event date; `occurrenceDueOn` is the occurrence’s scheduled date. They may differ.
- One explicit outcome exists per Task/logical date. Explicit History wins for that date, and recurrence changes never rewrite it.
- Calculated Missed can affect Calendar, current status, overdue chronology, and current Missed streak without becoming ordinary explicit History merely because time passed.

`CURRENT` — Phase 0 found competing recurrence calculators, status authorities, mutation paths, and automatic-Missed persistence paths. The Task State Engine and Effective Timeline are active boundaries but are not yet the only reachable behavior. See [Phase 0 § Executive findings](task-state-phase-0-inventory.md#executive-findings), [§ 3](task-state-phase-0-inventory.md#3-recurrence-implementations-and-authority-graph), [§ 5](task-state-phase-0-inventory.md#5-history-authority-map), and [§ 14](task-state-phase-0-inventory.md#14-dependency-map).

## Part 1: Recurrence families

`TARGET` — The model defines ten recurrence/scheduling modes: one genuinely unscheduled state and nine scheduled family variants. Selected weekdays and every N weeks are parameterizations of the fixed weekly family in the current engine model, but they are listed separately because their product semantics must be explicit.

### Rolling versus fixed-calendar

`TARGET` — A **ROLLING** schedule uses the active occurrence and its resolution chronology to determine the next cursor. A late success can move the next date relative to the actual success date. The stable recurrence anchor remains provenance/schedule-start information and is not rewritten as a side effect of each success.

`TARGET` — A **FIXED CALENDAR** schedule has membership determined by a stable anchor plus a calendar rule. Early or late resolution consumes one already-established scheduled occurrence; the next occurrence remains the first valid calendar occurrence after the consumed occurrence. Completion date does not drift the calendar schedule.

| Mode | Classification | Target recurrence meaning |
|---|---|---|
| Genuinely unscheduled | Neither; no recurrence | No due date and no meaningful History means no active occurrence, no schedule membership, no calculated Missed, and no recurrence advancement. |
| Activated implicit rolling-daily / No Repeat | ROLLING | A No Repeat Task that receives a meaningful due date or qualifying History activation enters an effective rolling-daily mode until the user explicitly selects another cadence. Stored `repeat_frequency = none` does not distinguish this mode from genuinely unscheduled. |
| Daily | ROLLING | Interval of one logical day. The next cursor follows the rolling success rule: on-time success advances one day; late success advances one day from the success date; early success cannot create a next cursor before the consumed occurrence plus one day. |
| Daily Until Complete | ROLLING | Daily rolling cadence with an until-complete configuration marker. This phase defines only recurrence/occurrence movement; terminal Complete lifecycle behavior remains Phase 1B-2. |
| Rolling every N days | ROLLING | Interval of N logical days. It is relative to the active occurrence and success chronology, with the early-completion lower bound defined in Part 4. |
| Weekly | FIXED CALENDAR | One or more configured weekdays in a stable weekly calendar, with an interval in weeks. A single weekday is the ordinary weekly case. |
| Selected weekdays | FIXED CALENDAR | The configured weekday set is the membership rule. Monday/Wednesday/Friday is one fixed weekly schedule with three calendar occurrences per eligible week, while only one occurrence can be the current unresolved obligation. |
| Every N weeks | FIXED CALENDAR | The configured weekday set repeats every N calendar weeks from the stable anchor. Early or late success does not change the week phase. |
| Monthly day-of-month | FIXED CALENDAR | The configured day-of-month repeats every N months from the stable anchor. The current engine’s monthly normalization uses the last valid day when a configured day exceeds a month’s length; this is retained as the target baseline unless product confirmation changes it. |
| Monthly ordinal weekday | FIXED CALENDAR | The first, second, third, fourth, or last configured weekday repeats every N months from the stable anchor. |

`CURRENT` — The engine snapshot has `none`, `rolling`, `weekly`, and `monthly` recurrence variants; the legacy adapter maps daily, custom, and Daily Until Complete to rolling, weekly fields to the weekly variant, and monthly fields to the monthly variant. See [`TaskRecurrence`](../../src/lib/task-state-engine/types.ts#L31-L51) and [`recurrenceFromLegacy()`](../../src/lib/task-state-engine/legacy-adapter.ts#L128-L208). The current legacy `task-repeat.ts` helper also formats daily, Daily Until Complete, weekly, monthly, and custom cadences. See [`calcNextDueDateFromDate()`](../../src/lib/task-repeat.ts#L113-L146) and [`formatRepeatSummary()`](../../src/lib/task-repeat.ts#L223-L262).

## Part 2: Occurrence generation

### One current unresolved occurrence

`TARGET` — ADHDice models **A: one current unresolved obligation at a time**.

The engine may project future fixed-calendar dates as informational Calendar schedule members, but those dates are not additional active unresolved obligations. They cannot be resolved by an unrelated History row while an older occurrence remains unresolved. Once the current occurrence is resolved, the engine advances to the next occurrence according to the family’s rules.

This model prevents an overdue chain from creating one new unresolved occurrence identity per elapsed day. Multiple Calendar Missed days can refer to the same occurrence identity.

`CURRENT` — Effective Timeline calculates historical Missed days from one occurrence due date through the day before a later successful History event, and calculated days carry the same occurrence due date/identity. The engine also explicitly protects an unresolved active Missed occurrence from being replaced by a fixed-calendar projection. See [`buildTaskEffectiveTimeline()`](../../src/lib/task-state-engine/effective-timeline.ts#L118-L177), [`buildTaskEffectiveTimeline()` overdue projection](../../src/lib/task-state-engine/effective-timeline.ts#L200-L248), and [`evaluateTaskState()` unresolved-Missed handling](../../src/lib/task-state-engine/engine.ts#L382-L420).

### Generation rules by family

| Mode | What generates an occurrence? | Due date and identity | Before first scheduled occurrence | Next occurrence after current one | Missed behavior | Older unresolved occurrence and future dates |
|---|---|---|---|---|---|---|
| Genuinely unscheduled | Nothing. | No occurrence; no identity; `due_on = null`. | The Task remains unscheduled. | None until a due date or qualifying History activates it. | No calculated Missed because there is no obligation. | No future occurrences. |
| Activated implicit rolling-daily | First meaningful due date or qualifying History activation creates the first rolling occurrence. | Activation date or imported/explicit occurrence due date; identity uses that due date. | No occurrence before activation. | One logical day after the successful rolling base. | Current occurrence remains unresolved; later closed days are calculated Missed with the same identity. | Future dates are not active until the current occurrence resolves. |
| Daily | The active cursor, initially the configured due/anchor date and thereafter the rolling result. | Cursor date; `task:{taskId}:occurrence:{date}`. | Dates before the first cursor are Not Due/No Entry, not obligations. | `max(successLogicalDate, consumedDueDate) + 1 day`. | Same occurrence remains current; no new daily identity per missed day. | No additional active occurrences; future daily projection is informational only. |
| Daily Until Complete | Same as Daily, while the Task remains in its active recurrence lifecycle. | Cursor date and canonical identity. | Same as Daily. | Same rolling daily rule; terminal completion is Phase 1B-2. | Same single unresolved occurrence/overdue chain. | No additional active occurrences. |
| Rolling every N days | Active cursor plus interval N. | Cursor date; canonical identity. | No obligation before the first cursor. | `max(successLogicalDate, consumedDueDate) + N days`. | Current cursor freezes; elapsed closed days are calculated Missed for that identity. | No additional active occurrences. |
| Weekly | Stable anchor plus configured weekday set and week interval. | First valid calendar date; canonical identity. | Dates before anchor or outside membership are Not Due. | First valid fixed occurrence strictly after consumed due date. | Current fixed occurrence remains unresolved; later schedule members may be projected but cannot replace it. | Future fixed dates may be shown as scheduled, but only the older occurrence is active/unresolved. |
| Selected weekdays | Weekly calendar membership for the configured weekday set. | Each valid weekday date; canonical identity. | Non-selected dates are Not Due. | First selected date strictly after consumed due date. | Same as Weekly; no additional active identity per elapsed day. | Future selected dates are informational until the current occurrence resolves. |
| Every N weeks | Stable anchor + selected weekdays + week interval N. | First valid selected weekday in an eligible week; canonical identity. | Before the first eligible week, no occurrence. | First valid selected weekday in a later eligible week. | Same fixed-calendar overdue rule. | Future dates may be projected but not independently resolved. |
| Monthly day-of-month | Stable anchor + month interval + day-of-month rule. | Normalized monthly date; canonical identity. | Before the first eligible month, no occurrence. | First normalized monthly date strictly after consumed due date. | Same fixed-calendar overdue rule. | Future monthly dates are informational while an older occurrence is unresolved. |
| Monthly ordinal weekday | Stable anchor + month interval + ordinal/weekday rule. | Calculated ordinal weekday date; canonical identity. | Before the first eligible month, no occurrence. | First matching ordinal weekday strictly after consumed due date. | Same fixed-calendar overdue rule. | Future monthly dates are informational while an older occurrence is unresolved. |

`TARGET` — A future fixed-calendar date can therefore exist in the Calendar projection while the Task still has one older current unresolved occurrence. It is not a second simultaneously consumable obligation.

## Part 3: Successful resolution

### Resolution outcomes in this phase

`TARGET` — Only `Done` and `Did My Best` are successful occurrence outcomes in Phase 1B-1. Permanent Complete is excluded.

For either successful outcome:

- the event resolves the associated current occurrence exactly once;
- the consumed occurrence is identified by explicit `occurrenceIdentity`, validated `occurrenceDueOn`, or safe current chronology;
- recurrence advances exactly once;
- the event contributes one positive effective-chronology success on its `logicalDate`;
- the event ends the current overdue/Missed state for the consumed occurrence, but does not erase earlier calculated Missed days; and
- a second successful event claiming the same occurrence is a duplicate-resolution anomaly and cannot advance recurrence again.

`TARGET` — An early success contributes positive streak chronology on the action logical date, not again on the occurrence due date. A late success contributes positive chronology on its late action date, while the earlier calculated Missed days remain visible and continue to explain the chronology.

`CURRENT` — The engine’s successful-outcome set contains Done, Did My Best, and Complete, while the current engine action and History paths distinguish occurrence identity and reject a successful row that repeats an already successful occurrence identity. Phase 1B-1 narrows the transition contract to Done and Did My Best and leaves Complete to Phase 1B-2. See [`evaluateTaskState()`](../../src/lib/task-state-engine/engine.ts#L184-L239) and [`TaskHistoryOutcome`](../../src/lib/task-state-engine/types.ts#L23-L26).

## Part 4: Early completion

### Fixed-calendar early completion

`TARGET` — Completing early consumes the already-established fixed-calendar occurrence. The next occurrence remains aligned to the fixed schedule and is the first valid occurrence strictly after the consumed occurrence due date, not after the early action date.

Example:

```text
Weekly Sunday occurrence due 2026-08-10
Done entered on logical 2026-08-08

logicalDate       = 2026-08-08
occurrenceDueOn   = 2026-08-10
occurrenceIdentity= task:{taskId}:occurrence:2026-08-10
next occurrence   = 2026-08-17
```

Calendar semantics:

- 8/8 shows the explicit Done event with `occurrenceDueOn = 8/10`.
- 8/10 is covered/resolved by that same occurrence and must not become a second explicit History row or a new unresolved obligation.
- 8/17 is the next fixed scheduled occurrence.

The Calendar may choose the final presentation label in a later read-model phase, but the semantic result is “8/10 satisfied by the 8/8 resolution,” not “8/10 is still due.”

### Rolling early completion

`TARGET` — Rolling recurrence uses the actual success date for late drift but has an early lower bound so that advancing an occurrence never creates a next cursor before the consumed occurrence’s own cadence boundary.

For interval `N`:

```text
rollingNextDue = max(successLogicalDate, consumedOccurrenceDueOn) + N days
```

Therefore:

- on-time success uses either equal date;
- late success advances from the actual success date; and
- early success advances from the consumed due date, preventing the next occurrence from moving backward before the occurrence just consumed.

This gives rolling schedules action-date drift for late completion without making early completion produce an impossible earlier current cursor.

`CURRENT` — The current pure recurrence helper advances rolling recurrence from `actionDate`, while the engine carries separate fixed-cursor protections and occurrence metadata. See [`recurrenceAfterSuccess()`](../../src/lib/task-state-engine/recurrence.ts#L170-L193) and [`evaluateTaskState()` rolling replay](../../src/lib/task-state-engine/engine.ts#L261-L278). This specification is the target contract, not a claim that every current caller already follows it.

## Part 5: Late completion

`TARGET` — A late success resolves the original occurrence, not each elapsed calendar day.

Example:

```text
Occurrence due: 2026-08-05
No resolution on 8/5 or 8/6
Done entered on logical 2026-08-07

logicalDate       = 2026-08-07
occurrenceDueOn   = 2026-08-05
occurrenceIdentity= task:{taskId}:occurrence:2026-08-05
```

Expected chronology:

- 8/5 is a calculated Missed day tied to the 8/5 occurrence.
- 8/6 is a calculated Missed day tied to the same 8/5 occurrence.
- 8/7 is the explicit Done event and resolves the 8/5 occurrence.
- The 8/5 and 8/6 calculated Missed days remain visible; the success does not delete or rewrite them.
- The current Missed streak ends at the successful 8/7 event. A positive current streak may begin at 8/7.

Advancement depends on family:

- fixed calendar: next occurrence is the first valid fixed date strictly after 8/5, even if it is on or before 8/7; a newly selected date is not consumed by the late 8/7 success;
- rolling interval N: next occurrence is `8/7 + N days` because late rolling success drifts from the actual action date.

If the next fixed occurrence is already past on the action date, it becomes the next current unresolved occurrence rather than being silently skipped. This preserves one occurrence identity per obligation and prevents a late success from consuming two occurrences.

## Part 6: Rolling recurrence advancement

### Daily

`TARGET` — Daily is rolling interval one.

```text
Due 8/1, Done 8/1 → next due 8/2
Due 8/4, Done 8/6 → next due 8/7
Due 8/5, Done early 8/3 → next due 8/6
```

The early example consumes the 8/5 occurrence and uses the lower-bound rule; it does not create a due date on 8/4. If the due occurrence remains unresolved through 8/6, `due_on` remains 8/4, 8/4 and 8/5 become calculated Missed chronology days tied to the same occurrence, and 8/6 is the current overdue/open representation. A Done on 8/6 resolves 8/4 and advances to 8/7.

### Every N days

`TARGET` — Every N days uses the same rolling rule with interval N.

Example with anchor 8/1 and N=3:

```text
Initial membership/cursor: 8/1, 8/4, 8/7, 8/10
Done on 8/1 → due_on 8/4
Done on 8/4 → due_on 8/7
8/4 unresolved through 8/6 → due_on remains 8/4
Done recorded on 8/6 for 8/4 → due_on 8/9
```

In the overdue case, 8/4 and 8/5 are calculated Missed days for the same occurrence; 8/6 is the current overdue/open day. The model does not create separate unresolved identities for 8/5 and 8/6.

### Daily Until Complete

`TARGET` — Daily Until Complete uses the same daily rolling occurrence contract. It does not create an independent obligation for every day that passes. Done and Did My Best resolve one current occurrence and advance by one day using the rolling early/late rule. The “until complete” termination and Complete outcome belong to Phase 1B-2 and are intentionally not specified here.

## Part 7: Fixed-calendar advancement

`TARGET` — Fixed-calendar advancement always uses the stable anchor and recurrence rule. It consumes the identified scheduled occurrence and selects the first valid scheduled occurrence strictly after the consumed occurrence due date.

### Weekly and every N weeks

For a Monday schedule with occurrence due 8/10:

```text
Done early on 8/8 → consume 8/10 → next due 8/17
Done late on 8/12 → consume 8/10 → next due 8/17
```

For every N weeks, the same week phase remains in force. Completion date does not become the new week anchor.

### Selected weekdays

For Monday/Wednesday/Friday with Monday occurrence due 8/10:

```text
Done on Monday 8/10 → next due Wednesday 8/12
Done early Sunday 8/9 → consume Monday 8/10 → next due Wednesday 8/12
Done late Tuesday 8/11 → consume Monday 8/10 → next due Wednesday 8/12
```

If a late success occurs after Wednesday as well, Wednesday becomes the next current occurrence because it is the first fixed occurrence after the consumed Monday occurrence. It is not silently skipped merely because the action was late.

### Monthly day-of-month

For the 15th of every month:

```text
August 15 completed August 12 → next due September 15
August 15 completed August 20 → next due September 15
```

The month phase remains anchored to the schedule. A late success does not move the next occurrence to September 20.

### Monthly ordinal weekday

For the second Tuesday of each month:

```text
Second Tuesday in August completed early → next due second Tuesday in September
Second Tuesday in August completed late → next due second Tuesday in September
```

The same rule applies to first, third, fourth, and last weekday modes. The ordinal/month phase is not rebased from action date.

## Part 8: Unresolved overdue occurrence model

`TARGET` — An occurrence becomes overdue without becoming resolved or being replaced. The current occurrence remains the same identity until Done or Did My Best resolves it, or a later Phase 1B-2 workflow action changes its state.

Example:

```text
Occurrence due 8/4
Logical days pass: 8/4, 8/5, 8/6, 8/7
No explicit outcome
```

The result is:

- `due_on` remains 8/4;
- the current unresolved occurrence remains `task:{taskId}:occurrence:8/4`;
- 8/4, 8/5, and 8/6 are calculated Missed chronology days, all tied to the same occurrence;
- 8/7, if it is the current logical day, is an Open/Pending day with an overdue unresolved obligation rather than a new occurrence;
- completed overdue days contribute to current Missed streak chronology, and the current overdue/open day activates the current Missed-streak condition according to the Effective Timeline contract;
- future fixed-calendar dates may remain visible as informational schedule members, but they cannot replace 8/4 as the active unresolved occurrence; and
- no automatic explicit History row is created merely because 8/4, 8/5, or 8/6 passed.

`CURRENT` — Effective Timeline treats a past unresolved occurrence as calculated Missed and the current overdue day as Open with an overdue obligation; current Missed streak calculation walks the closed calculated Missed days while recognizing current overdue Open. See [`buildTaskEffectiveTimeline()`](../../src/lib/task-state-engine/effective-timeline.ts#L220-L275) and [Phase 1A Part 8](task-state-phase-1a-core-model.md#part-8-calculated-state-versus-persisted-projection).

## Part 9: Explicit Missed versus calculated Missed

### Calculated Missed

`TARGET` — Calculated Missed means that time passed while the current occurrence remained unresolved.

- It creates no explicit History row.
- It does not resolve or advance the occurrence.
- It uses the same occurrence identity across the overdue chronology.
- It can affect Calendar, current active overdue status, and current Missed streak.
- A later Done or Did My Best resolves the original occurrence and leaves the calculated Missed days visible.

### Explicit Missed

`TARGET` — Explicit Missed is a user-recorded outcome for one logical date. It overrides that date’s Calendar state and becomes explicit History, but it does **not** count as a successful resolution in Phase 1B-1.

The target recurrence effect is:

- it does not consume the occurrence;
- it does not advance `due_on`;
- it leaves the current occurrence unresolved/frozen;
- it may replace a calculated Missed representation on that exact logical date with an explicit Missed row;
- it contributes Missed chronology rather than positive chronology; and
- it does not create additional occurrence identities for later days.

This deliberately distinguishes explicit Missed from calculated Missed: explicit Missed records user intent and wins for its date, while calculated Missed records elapsed unresolved time. Both leave the recurrence occurrence unresolved, but only the explicit form creates a History fact.

`CURRENT` — The current engine can propose or accept Missed History in some action/reconciliation paths while Effective Timeline also calculates non-persistent Missed. Phase 0 documents that these paths coexist; this target contract prevents either form from advancing a successful occurrence. See [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) and [`evaluateTaskState()` Missed validation](../../src/lib/task-state-engine/engine.ts#L198-L207).

## Part 10: No Repeat activation model

### Activation rule

`TARGET` — A current `repeat_frequency = none` value is not sufficient to determine whether a Task is genuinely unscheduled or has entered the implicit rolling-daily behavior.

The target distinction is:

```text
No due date + no meaningful History
    → genuinely unscheduled

First meaningful due date or qualifying History activation
    → effective rolling-daily schedule, interval 1
```

### Qualifying activation events

| Event | Activates implicit rolling-daily mode? | Target effect |
|---|---:|---|
| Assigning a first due date | Yes | Establishes the first occurrence/cursor at that due date, even if it is future-dated. |
| Manual Done | Yes | If no occurrence due date exists, the History logical date becomes the first occurrence due date; the success resolves it and next due is the following logical day. |
| Manual Did My Best | Yes | Same activation and resolution rule as Done. |
| Manual Missed | Yes, if it has a meaningful logical date | Establishes the first occurrence at that date but leaves it unresolved; `due_on` remains that date and later days follow overdue chronology. |
| Manual Delayed | Activation signal only | It establishes that the Task is no longer genuinely unscheduled, but due movement and delayed workflow behavior are Phase 1B-2. |
| Imported Done/Did My Best/Missed/Delayed with meaningful dates | Yes, when provenance and dates are trustworthy | Imported History can establish the first effective occurrence; ambiguous imported identity or anchor is marked for data quality. |
| Legacy automatic/reconciliation Missed with no user activation | No by itself | Inferred legacy artifacts must not silently activate a genuinely unscheduled Task. |
| Complete-only History | Not an active recurrence activation in this phase | Complete lifecycle semantics are Phase 1B-2; it must not be used to invent an active daily schedule. |

### Behavior after activation

Example:

```text
No Repeat Task
First due date: 8/1
8/1 Done

Effective recurrence: rolling daily
Consumed occurrence: task:{taskId}:occurrence:8/1
Next active occurrence: 8/2
due_on projection: 8/2
```

If 8/2 remains unresolved and the logical day becomes 8/3, 8/2 is a calculated Missed day tied to the 8/2 occurrence and 8/3 is the current overdue/open representation. No additional 8/3 occurrence is created.

### Recommended later representation

`TARGET` — Recommend **C: derived effective mode from canonical schedule/History facts**, with an optional future projection/cache. Do not automatically rewrite stored `repeat_frequency = none` merely to encode activation. The canonical engine should derive:

- genuinely unscheduled when no due date and no meaningful History exist;
- effective rolling-daily when the activation evidence exists; and
- the explicitly selected recurrence family after the user selects another cadence.

This preserves the user’s stored configuration history while allowing the target product behavior. No schema change is defined here.

## Part 11: Recurrence configuration change

`TARGET` — A recurrence configuration change creates a forward schedule boundary. It never rewrites Explicit History.

### Boundary and anchor behavior

- The edit logical date is the effective boundary for the new recurrence rule.
- A known stable anchor for the new schedule is retained or explicitly established by the schedule command; the old anchor is not rewritten as historical fact.
- If a current unresolved occurrence exists, its identity and due date remain current through the configuration change unless the new schedule explicitly invalidates that date. The new rule controls the next occurrence after that unresolved occurrence is resolved.
- If no current unresolved occurrence exists, the new rule’s first valid occurrence on or after the edit boundary becomes the cursor.
- `due_on` is projected from the resulting current/next unresolved occurrence, not copied from a stale stored status or moving legacy anchor.

### Historical and future Calendar behavior

- Explicit rows remain exactly as they were.
- Calculated dates before the boundary are not rewritten into explicit History.
- Calculated dates on or after the boundary use the new recurrence rule.
- A calculated historical date may change when the schedule boundary/rule changes, but only where the new chronology can prove the result; uncertain legacy dates remain neutral/data-quality-limited rather than becoming asserted Missed facts.
- Future Calendar dates recalculate from the new rule and anchor.

Example:

```text
Old recurrence: Daily, anchor 8/1
Explicit History: 8/1 Missed, 8/2 Done, 8/3 Did My Best
Schedule change on 8/4: Every 3 Days
```

The 8/1, 8/2, and 8/3 explicit rows remain unchanged. The new schedule begins at the 8/4 boundary; the current/next occurrence is calculated from the unresolved chronology and new cadence, and `due_on` is only the resulting cursor projection. No old explicit row is rebased or deleted.

`CURRENT` — Phase 0 and Phase 1A identify recurrence configuration as stored input, explicit History as authoritative, and calculated state as recomputable. They also identify `due_on` as overloaded and schedule changes as a competing mutation path. See [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state), [Phase 0 § 16](task-state-phase-0-inventory.md#16-phase-1-inputs), and [Phase 1A Part 11](task-state-phase-1a-core-model.md#part-11-core-invariants).

## Part 12: Anchor uncertainty

`TARGET` — Anchor uncertainty affects how far backward the engine may assert schedule facts. It must not cause a speculative historical anchor to be presented as truth.

### Known anchor

Use the stable anchor normally. Fixed-calendar membership and future occurrence generation may be calculated across the supported range.

### Safely reconstructable anchor

Use the reconstructed anchor only when recurrence configuration and chronology make it deterministic or high-confidence. Attach a data-quality/provenance marker to the engine result and retain the distinction between “stored/known” and “reconstructed.”

### Ambiguous anchor

Do not invent an anchor. Until later migration resolves it:

- preserve a safe current/future schedule boundary from a valid current `due_on`, explicit occurrence metadata, or another directly supported fact;
- do not claim historical calculated Missed dates before the safe boundary;
- do not replay old identity-less History as though it proved a schedule anchor;
- do not advance or repair the cursor solely from stale display status; and
- surface an anchor data-quality issue to diagnostics.

The conservative result may have a valid current/future cursor while historical Calendar chronology is incomplete. That is preferable to asserting unproven historical obligations.

`CURRENT` — The legacy adapter uses `due_on` as the weekly/monthly `anchorDate`, maps rolling recurrence without a separate stable anchor, and reports unavailable persisted recurrence-cursor metadata. See [`recurrenceFromLegacy()`](../../src/lib/task-state-engine/legacy-adapter.ts#L128-L208), [`adaptLegacyTaskState()`](../../src/lib/task-state-engine/legacy-adapter.ts#L285-L310), and [Phase 1A Part 4](task-state-phase-1a-core-model.md#part-4-recurrence-cursor-versus-recurrence-anchor).

## Part 13: Transition invariants

`TARGET` — The recurrence transition layer must preserve these invariants:

**TRANSITION INVARIANT 1 — One success consumes at most one occurrence.** Done or Did My Best resolves no more than one canonical occurrence.

**TRANSITION INVARIANT 2 — One occurrence advances at most once.** Replaying the same successful occurrence cannot produce a second next cursor.

**TRANSITION INVARIANT 3 — Fixed calendars do not drift.** Early or late success does not move a fixed-calendar schedule off its anchor/rule.

**TRANSITION INVARIANT 4 — Event and occurrence dates remain distinct.** `logicalDate` never silently replaces `occurrenceDueOn`.

**TRANSITION INVARIANT 5 — Calculated Missed is non-mutating.** A calculated Missed day does not create explicit History, consume an occurrence, or advance recurrence.

**TRANSITION INVARIANT 6 — Recurrence changes preserve History.** Configuration changes never rewrite, delete, or re-date explicit History rows.

**TRANSITION INVARIANT 7 — The cursor follows unresolved chronology.** `due_on` is derived from the current/next unresolved occurrence, not from stale status or an unrelated Calendar date.

**TRANSITION INVARIANT 8 — Duplicate metadata cannot double-advance.** Repeated/stale occurrence identity claims are data-quality anomalies and cannot advance recurrence repeatedly.

**TRANSITION INVARIANT 9 — Historical rows cannot consume future occurrences accidentally.** An identity-less or stale historical success must not claim a future occurrence without schedule and temporal proof.

**TRANSITION INVARIANT 10 — One canonical transition engine.** Recurrence advancement is defined once and all callers consume the same result; UI, Calendar, rewards, and rollover must not independently advance the cursor.

**TRANSITION INVARIANT 11 — One active unresolved occurrence.** Elapsed days and future fixed projections do not create multiple simultaneously consumable unresolved occurrences.

**TRANSITION INVARIANT 12 — No Repeat mode is derived.** `repeat_frequency = none` alone cannot override the distinction between genuinely unscheduled and activated implicit rolling-daily behavior.

## Part 14: Scenario matrix

`TARGET` — The following scenarios are concrete semantic fixtures. “Covered” means the scheduled occurrence is satisfied by an explicit event on a different logical date; it is not a second History row.

| # | Scenario/configuration | Anchor | Explicit History | Logical day | Consumed occurrence | Current occurrence | `due_on` projection | Calculated Calendar state | Positive streak | Missed streak |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | Daily, on-time Done | 8/1 | 8/1 Done, due 8/1 | 8/1 | occurrence 8/1 | 8/2 | 8/2 | 8/1 explicit Done; 8/2 scheduled | +1 on 8/1 | Reset |
| 2 | Daily, late Done | 8/1 | 8/3 Done, due 8/1 | 8/3 | occurrence 8/1 | 8/4 | 8/4 | 8/1 and 8/2 calculated Missed; 8/3 explicit Done | +1 on 8/3 | Ends at 8/3; earlier Missed remains visible |
| 3 | Daily, early Done | 8/5 | 8/3 Done, due 8/5 | 8/3 | occurrence 8/5 | 8/6 | 8/6 | 8/3 explicit Done; 8/5 covered by early resolution; 8/6 scheduled | +1 on 8/3 | Reset |
| 4 | Every 3 days, on-time | 8/1 | 8/1 Done, due 8/1 | 8/1 | occurrence 8/1 | 8/4 | 8/4 | 8/1 explicit Done; 8/4 scheduled | +1 | Reset |
| 5 | Every 3 days, late | 8/1 | 8/6 Done, due 8/4 | 8/6 | occurrence 8/4 | 8/9 | 8/9 | 8/4 and 8/5 calculated Missed; 8/6 explicit Done | +1 on 8/6 | Ends at 8/6 |
| 6 | Weekly Sunday, early Done | 8/10 | 8/8 Done, due 8/10 | 8/8 | occurrence 8/10 | 8/17 | 8/17 | 8/8 explicit Done; 8/10 covered; 8/17 scheduled | +1 on 8/8 | Reset |
| 7 | Weekly Sunday, late Done | 8/10 | 8/12 Done, due 8/10 | 8/12 | occurrence 8/10 | 8/17 | 8/17 | 8/10 and 8/11 calculated Missed; 8/12 explicit Done | +1 on 8/12 | Ends at 8/12 |
| 8 | Monday/Wednesday/Friday, early Done | 8/10 | 8/9 Done, due 8/10 | 8/9 | occurrence 8/10 | 8/12 | 8/12 | 8/9 explicit Done; 8/10 covered; 8/12 scheduled | +1 on 8/9 | Reset |
| 9 | Monday/Wednesday/Friday, late Done | 8/10 | 8/11 Done, due 8/10 | 8/11 | occurrence 8/10 | 8/12 | 8/12 | 8/10 calculated Missed; 8/11 explicit Done; 8/12 scheduled | +1 on 8/11 | Ends at 8/11 |
| 10 | Monthly day 15, early Done | 8/15 | 8/12 Done, due 8/15 | 8/12 | occurrence 8/15 | 9/15 | 9/15 | 8/12 explicit Done; 8/15 covered; 9/15 scheduled | +1 on 8/12 | Reset |
| 11 | Monthly day 15, late Done | 8/15 | 8/20 Done, due 8/15 | 8/20 | occurrence 8/15 | 9/15 | 9/15 | 8/15–8/19 calculated Missed; 8/20 explicit Done | +1 on 8/20 | Ends at 8/20 |
| 12 | Daily, unresolved overdue chain | 8/4 | None | 8/7 | None | occurrence 8/4 | 8/4 | 8/4–8/6 calculated Missed, 8/7 open/overdue; all Missed days share occurrence 8/4 | 0 | Active from closed Missed days/current overdue |
| 13 | Daily, explicit Missed | 8/4 | 8/4 explicit Missed, due 8/4 | 8/5 | None | occurrence 8/4 | 8/4 | 8/4 explicit Missed; 8/5 open/overdue | 0/broken | Active |
| 14 | Daily, calculated Missed | 8/4 | None | 8/6 | None | occurrence 8/4 | 8/4 | 8/4–8/5 calculated Missed; 8/6 open/overdue; no History row created | 0/broken | Active |
| 15 | No Repeat, genuinely unscheduled | None | None | 8/1 | None | None | null | No Entry/unscheduled; no due or Missed | 0 | 0 |
| 16 | No Repeat, first due activation | 8/1 | None | 8/1 | None | occurrence 8/1 | 8/1 | 8/1 open/due; effective mode is rolling daily | 0 | 0 |
| 17 | No Repeat, first Done after activation | 8/1 | 8/1 Done, due 8/1 | 8/1 | occurrence 8/1 | occurrence 8/2 | 8/2 | 8/1 explicit Done; 8/2 scheduled | +1 on 8/1 | Reset |
| 18 | Daily → Every 3 Days schedule change | 8/1 old; 8/4 new boundary | 8/1 Done | 8/4 | occurrence 8/1 | first new valid occurrence on/after 8/4, e.g. 8/4 | new cursor | Explicit 8/1 preserved; post-boundary Calendar uses Every 3 Days | Existing positive chronology preserved | No new Missed from the config edit |
| 19 | Stale duplicate occurrence identity | 8/10 fixed | 8/8 Done due 8/10; 8/9 Did My Best due 8/10 | 8/10 | occurrence 8/10 once | 8/17 | 8/17 | Both explicit rows remain facts; duplicate consumption is flagged; no second advancement | One occurrence opportunity only; anomaly flagged | No calculated Missed for the consumed occurrence |
| 20 | Ambiguous legacy anchor | Unknown; safe boundary 8/5 | Identity-less/ambiguous legacy History only | 8/7 | Only if directly proven | Safe current/future occurrence from valid boundary, otherwise unknown | Safe persisted cursor if valid; no invented anchor | No historical Missed asserted before safe boundary; diagnostics report ambiguity | Only proven explicit successes | No unproven historical Missed |

## Part 15: Decisions Requiring Product Confirmation

Only the following decisions remain genuinely product-sensitive after applying Phase 0, Phase 1A, and current source evidence. The recommendations are the target defaults; confirmation is required before a later implementation treats the alternatives as impossible.

### 1. Rolling early-success lower bound

**Question:** Should an early rolling success use the actual success date even when that would make the next occurrence precede the consumed occurrence’s due date?

- **Option A — bounded rolling rule (recommended):** `max(successDate, occurrenceDueOn) + interval`. Early completion does not move the cursor backward; late completion drifts from the action date.
- **Option B — pure action-date rule:** `successDate + interval` in all cases. This is simpler but can create a next due date before the occurrence just consumed.
- **Architectural recommendation:** Option A, because it preserves chronological occurrence identity while retaining meaningful late-completion drift.
- **Consequence:** A future product decision to allow early rolling completion to pull the next due date earlier would need an explicit change to the cursor invariant and scenario fixtures.

### 2. Fixed schedule after multiple missed calendar members

**Question:** If a selected-weekday or monthly schedule has another scheduled date before a late success is recorded, should that next date remain the next current occurrence or be skipped?

- **Option A — preserve the first next fixed occurrence (recommended):** after resolving the older occurrence, the first scheduled date strictly after its due date becomes current, even if already overdue.
- **Option B — skip to the first scheduled date after the action date:** this avoids an immediately overdue cursor but silently discards a scheduled occurrence.
- **Architectural recommendation:** Option A, because one success cannot consume two occurrences and fixed calendars must not drift or erase obligations.
- **Consequence:** A late success may immediately expose another overdue current occurrence; that is represented by the same one-current-unresolved model.

### 3. No Repeat activation by Delayed or imported legacy facts

**Question:** Should a manual Delayed event or an imported legacy Delayed/Missed event activate implicit rolling-daily mode when no due date exists?

- **Option A — activation signal, workflow transition deferred (recommended):** such a fact establishes that the Task is no longer genuinely unscheduled, but Delay date movement and legacy provenance remain governed by Phase 1B-2/migration rules.
- **Option B — only a due date or Done/Did My Best activates:** this is simpler but can discard meaningful user/import intent and leave the Task falsely unscheduled.
- **Architectural recommendation:** Option A, with automatic legacy reconciliation rows excluded unless a trustworthy user/import provenance exists.
- **Consequence:** Phase 1B-2 must define the resulting due/cursor behavior for Delayed activation; Phase 1B-1 does not invent that workflow transition.

## Locked Recurrence Transition Contract

Phase 1B-2 may rely on these recurrence rules without reopening them:

- A genuinely unscheduled Task has no due date and no meaningful History; it has no current occurrence and no calculated Missed chronology.
- A No Repeat Task becomes effective rolling-daily after a meaningful due date or qualifying activation; the mode is derived rather than inferred from stored `repeat_frequency = none` alone.
- Current ADHDice has one current unresolved occurrence at a time. Future fixed-calendar dates may be projected but cannot replace or be independently consumed while an older occurrence remains unresolved.
- `due_on` is the current/next unresolved occurrence cursor; it is not the recurrence anchor.
- The canonical occurrence identity is `task:{taskId}:occurrence:{occurrenceDueOn}` for the current supported product.
- Done and Did My Best each resolve at most one occurrence, advance recurrence at most once, contribute positive chronology on the action logical date, and cannot double-consume an occurrence.
- Fixed-calendar early and late success consumes the scheduled occurrence and keeps the next occurrence aligned to the stable calendar rule.
- Rolling recurrence uses the actual success date for late drift and the consumed due date as the lower bound for early completion: `max(successDate, consumedDueOn) + interval`.
- Calculated Missed days remain derived, share the unresolved occurrence identity, and never create ordinary explicit History merely because time passed.
- Explicit Missed overrides its logical date but does not consume or advance the occurrence in this phase.
- Late success leaves earlier calculated Missed days visible and understandable; it does not erase them.
- Recurrence configuration changes apply forward from an edit boundary, preserve explicit History, and recalculate future derived chronology without inventing uncertain historical anchors.
- Known or safely reconstructed anchors may drive membership; ambiguous legacy anchors must preserve uncertainty and avoid unproven historical schedule claims.

The remaining Phase 1B-2 topics are workflow/lifecycle boundaries only:

- Delay;
- Complete;
- Archive;
- Trash;
- In Progress;
- rollover execution and idempotence; and
- rewards/economy eligibility.

No behavior for those topics is specified here.
