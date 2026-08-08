# Phase 1A: Canonical Task State Foundation

Status: active working architecture specification
Scope: canonical entities, facts, identity, precedence, and invariants
Required source: [Phase 0 inventory](task-state-phase-0-inventory.md)
Implementation status: specification only; not implemented

## Purpose and scope

Phase 1A defines the minimum conceptual model that a future canonical Task Engine can consume and return. It does not authorize production-code, test, schema, Supabase, migration, or persistence changes.

The target direction is:

```text
TaskConfiguration + RecurrenceAnchor
    + terminal/container/workflow facts
    + ExplicitHistoryEvent[]
    + ScheduleBoundaryEvent[]
    + ManualCalendarOverride[]
    + LogicalDayContext
          ↓
Canonical occurrence/timeline chronology
          ↓
EffectiveObligation grouping + projected future occurrences
          ↓
EffectiveTaskState + TaskStateDiagnostic[]
```

This document deliberately separates five categories:

1. stored configuration facts;
2. explicit persisted History facts;
3. calculated state;
4. persisted projections or caches; and
5. lifecycle facts.

`CURRENT` statements describe the inspected branch and cite the Phase 0 inventory or a specific source boundary. `TARGET` statements are recommendations for the future model and must not be read as implemented behavior.

## Current baseline from Phase 0

`CURRENT` — The Task State Engine is an active canonical boundary for the main TaskApp status projection, occurrence-sensitive action planning, Calendar reads, and client rollover planning, but it is not yet the only reachable state system. The branch retains legacy cockpit status, legacy History live-status/rebase, stored-status fallbacks, multiple recurrence paths, automatic Missed persistence paths, and two rollover RPC families. See [Phase 0 § Executive findings](task-state-phase-0-inventory.md#executive-findings), [§ 2](task-state-phase-0-inventory.md#2-current-status-authorities), [§ 3](task-state-phase-0-inventory.md#3-recurrence-implementations-and-authority-graph), and [§ 6](task-state-phase-0-inventory.md#6-rollover-and-logical-day-authority).

`CURRENT` — The database-shaped Task model includes `status`, `due_on`, `active_status_logical_date`, `active_occurrence_due_on`, repeat fields, `completed_at`, and `trashed_at`. History includes `entry_date`, `occurrence_key`, `occurrence_due_on`, `status`, `event_type`, `counted_as_due_occurrence`, and `was_completed`. The adapter also reports that recurrence-cursor and satisfied-occurrence fields are not present as persisted Task fields. See [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) and [`src/lib/task-state-engine/legacy-adapter.ts`](../../src/lib/task-state-engine/legacy-adapter.ts).

`CURRENT` — Effective Timeline calculated Missed days are non-persistent, while legacy reconciliation and some engine rollover paths can persist automatic Missed rows. These are distinct current representations of “Missed,” not one uniform fact. See [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map).

`CURRENT` — The current branch has seven recurrence paths, fourteen Task mutation entry paths, seven direct Task/History persistence boundaries, and five active-status authority families as counted by Phase 0. These counts explain why the model must be established before behavior is rewritten. See [Phase 0 § Executive findings](task-state-phase-0-inventory.md#executive-findings).

## Part 1: Canonical entities

The core model defines six canonical entities. `LogicalDayContext`, `RecurrenceAnchor`, `OccurrenceIdentity`, `ScheduleBoundaryEvent`, `ManualCalendarOverride`, and `EffectiveObligation` are supporting value objects or persisted facts consumed by those entities; they are not additional independent Task records.

### 1. TaskConfiguration

`TARGET` — `TaskConfiguration` contains user-controlled scheduling and descriptive facts. It is not the current calculated Task state.

Conceptual contents:

- `taskId`: stable Task identity;
- schedule model: no schedule, one-time, rolling recurring, or fixed-calendar recurring;
- recurrence configuration: frequency, interval, selected weekdays, monthly rule, Daily Until Complete behavior, or No Repeat, as applicable to that model;
- schedule configuration: an optional due date for a one-time schedule, stable schedule start/anchor where applicable, user-selected schedule constraints, and any time-of-day presentation constraint that the engine explicitly supports;
- task metadata unrelated to recurrence state: title, description, list/folder placement, priority, tags, and similar user content;
- lifecycle/container/workflow facts are referenced by their separate canonical axes, described below, rather than forced into one lifecycle enum.

The configuration is the source for determining whether a date is a scheduled opportunity. It does not itself say whether the opportunity is Pending, Missed, Done, or otherwise handled on a particular logical date. Schedule-boundary facts and date-specific Calendar overrides are conceptually separate inputs when they are not static Task configuration; Phase 1A does not force them into the Task row.

`TARGET` — The canonical scheduling model has four mutually understood categories:

- genuinely unscheduled: no due date and no Repeat;
- one-time scheduled: a due date and no Repeat;
- rolling recurring: an explicitly rolling Repeat such as Daily, Every X Days, or Daily Until Complete while active; and
- fixed-calendar recurring: Weekly, selected weekdays, Every N Weeks, monthly day, monthly ordinal weekday, or equivalent fixed calendar membership.

No due date plus no Repeat is genuinely unscheduled. History alone does not activate recurrence and inactivity does not create Missed. A due date plus no Repeat is one-time scheduled, with exactly one obligation; it is not implicit Daily, and Complete is the satisfying terminal outcome for that obligation. The remaining two categories have explicit rolling or fixed-calendar configuration. The exact transition behavior belongs to Phase 1B, but the four-way distinction is part of the Phase 1A core model.

`TARGET` — `due_on` must not be treated as immutable configuration merely because it is currently stored on the Task row. The target role of `due_on` is the current effective obligation cursor/projection described in Part 2. A separate stable recurrence anchor is required whenever schedule membership cannot be reconstructed from recurrence rule fields alone.

### 2. ExplicitHistoryEvent

`TARGET` — `ExplicitHistoryEvent` is a persisted historical fact for one Task and one logical date.

Required conceptual fields:

| Field | Meaning |
|---|---|
| `taskId` | Task to which the event belongs. |
| `logicalDate` | The user-scoped logical date on which the explicit result applies. |
| `outcome` | Explicit result such as Done, Did My Best, Missed, Delayed, or Complete. |
| `occurrenceIdentity` | Immutable identity of the occurrence origin, when known or safely reconstructed. It may be absent on legacy rows without invalidating the event. |
| `scheduledDueOn` | Immutable scheduled/origin date of the referenced occurrence, when known. It is distinct from `logicalDate` and from any moved effective date. |
| `effectiveDueOn` | Current deferred/overridden expected date when relevant, especially for a Delayed event; otherwise it may equal `scheduledDueOn` conceptually or be absent. |
| `provenance` | How the fact was created, such as manual user entry, migrated legacy row, or legacy automatic reconciliation. Provenance is needed to distinguish an explicit user fact from a legacy inferred artifact. |
| replacement metadata | Created/updated ordering or repository identity used to replace the existing event for the same Task/logical date. |

`TARGET` — There is at most one authoritative explicit outcome for a Task on a logical date. Editing replaces that date’s explicit result. Clearing removes the explicit override and returns that date to calculated authority. Recurrence changes never rewrite explicit History.

`TARGET` — An Explicit History event remains a historical fact even when its occurrence metadata is missing or later shown to be stale. Outcome and logical date are not discarded merely because a cache or identity field is incomplete.

For ordinary Done, Did My Best, Missed, or Complete events, History should reference the applicable occurrence origin when it is safely known. A Delayed event must be capable of preserving both the original occurrence identity/scheduled origin and the delayed effective target. Legacy rows are not required to contain every field; missing or stale metadata is a diagnostic/data-quality condition, not automatic invalidation of the explicit user outcome.

### 3. TaskOccurrence

`TARGET` — A `TaskOccurrence` is one obligation generated by a Task’s recurrence configuration. It is not a Calendar cell and it is not the Task row’s generic status.

Conceptual contents:

- `occurrenceIdentity`: one deterministic identity for the obligation;
- `scheduledDueOn`: the immutable date generated by the original schedule/occurrence;
- `effectiveDueOn`: the currently expected date after a one-occurrence override such as Delay; it may equal `scheduledDueOn` conceptually or be nullable when unchanged;
- `recurrenceSource`: the configuration and recurrence rule that generated it;
- `resolutionState`: unresolved or resolved;
- `resolutionLogicalDate`: the logical date on which it was resolved, if resolved;
- `resolutionOutcome`: the outcome that resolved it, if resolved.

`TARGET` — The model must distinguish an occurrence’s due date from the date on which a user records an outcome. A Done event recorded on logical 8/8 can resolve an occurrence due on 8/10:

```text
ExplicitHistoryEvent.logicalDate       = 8/8
ExplicitHistoryEvent.scheduledDueOn    = 8/10
TaskOccurrence.scheduledDueOn          = 8/10
TaskOccurrence.effectiveDueOn         = 8/10
```

Occurrence identity remains tied to the immutable origin, not the moving effective date. If `scheduledDueOn = 8/10` is Delayed to `effectiveDueOn = 8/13`, the identity remains the 8/10 origin; 8/13 is not a brand-new occurrence merely because the obligation moved.

The exact set of outcomes that advance or terminate a recurrence is deferred to Phase 1B. The core model nevertheless requires a separate resolution state so that “a date has an explicit row” is not confused with “a particular occurrence was consumed.”

### Same-Task effective-obligation grouping

`TARGET` — `EffectiveObligation` is the minimal projection concept needed when multiple immutable origin occurrences of the same Task share one effective date. It groups user-facing resolution without merging or destroying origin identity.

For a fixed Monday/Wednesday/Friday Task, if the Friday origin is Delayed to Monday and Monday also has its normal origin:

```text
origin 1: scheduledDueOn = Friday, effectiveDueOn = Monday
origin 2: scheduledDueOn = Monday, effectiveDueOn = Monday

effective obligation: Monday
```

The chronology preserves both origins and their provenance. The effective projection exposes one Monday obligation, one resolution/outcome, and one streak contribution. Grouping is not a replacement occurrence identity and does not create a new occurrence.

### 4. EffectiveTimelineDay

`TARGET` — `EffectiveTimelineDay` is the calculated representation of one logical date in a Task’s effective chronology.

It contains, conceptually:

- `logicalDate`;
- `calendarSchedulingState`: `Unscheduled`, `Not Due`, `Due/Open`, or calculated `Missed` as applicable;
- explicit History/checkpoint outcome, such as Done, Did My Best, Delayed, or Complete, when present;
- `obligationState`: open, unresolved/missed, resolved, or terminated;
- `occurrenceOrigins`: immutable occurrence identity plus `scheduledDueOn` and `effectiveDueOn` when the day can be associated with an occurrence;
- `effectiveObligation`: the same-Task effective-date grouping when multiple origins share one effective date;
- `origin`: explicit History or calculated;
- `handled`: a calculated chronology/display property, not an independent persisted fact.

`TARGET` — Calendar scheduling state, explicit History/checkpoint outcome, obligation state, occurrence origin, and effective-obligation grouping remain separate concepts. An explicit checkpoint can therefore be handled for the logical date while its associated obligation remains unresolved and actively Missed. For example, a one-time obligation due 8/10 can have explicit Did My Best on 8/11 while the obligation remains actively Missed.

Explicit History is authoritative for its outcome/date. A calculated Missed day may be visible, contribute to current Missed streak, and participate in effective chronology without acquiring an ordinary explicit History row. A calculated future date is informational and must not create an occurrence resolution or a History mutation. A manual Calendar scheduling-state override is separately authoritative for its date’s Calendar state; it does not silently erase the explicit outcome or rewrite Repeat.

`handled` must not be overloaded to mean “the occurrence was successfully consumed.” For example, an explicit Missed or Delayed event can be a handled calendar outcome while the associated obligation’s resolution semantics remain governed by the engine and Phase 1B rules.

### 5. EffectiveTaskState

`TARGET` — `EffectiveTaskState` is the high-level result returned by the future canonical engine for a Task at a supplied `LogicalDayContext`.

At 1A level it must provide, conceptually:

- terminal lifecycle state and container state as separate facts;
- persisted workflow state, such as `In Progress`, as a separate overlay;
- the current effective obligation, if any, plus projected future occurrences when fixed-calendar membership continues independently;
- the effective active schedule state derived from configuration, boundaries, manual Calendar overrides, explicit History, and logical day;
- the effective timeline/chronology facts needed by Calendar and current streak consumers;
- current positive/Missed streak inputs and results;
- structured `TaskStateDiagnostic[]` findings when persisted metadata is missing, stale, contradictory, unsupported, or ambiguous;
- optional projection data for persistence, clearly marked as non-authoritative.

Detailed output shape, action plans, reward eligibility, and transition-specific fields belong to later phases, especially Phase 1C for final output shape.

### 6. Lifecycle, container, and workflow facts

`TARGET` — The canonical lifecycle model uses separate axes rather than one mutually exclusive `TaskLifecycle` enum:

```text
terminalState:  active | permanently_complete
containerState: active | archived | trashed
workflowState:  none | in_progress
```

Active schedule status is derived separately from recurrence, boundaries, overrides, History, and logical day. The older Phase 1A lifecycle names may remain compatibility summaries, but they are not the canonical axes:

- `active` summary: `terminalState = active` and `containerState = active`;
- `archived` summary: an active or permanently complete Task in `containerState = archived`;
- `trashed` summary: a non-deleted Task in `containerState = trashed`; and
- `permanently_complete` summary: `terminalState = permanently_complete`, regardless of container.

The canonical model must represent `permanently_complete + archived`, `permanently_complete + trashed`, `active + archived`, and `active + in_progress`. Archive and Trash are container/lifecycle facts and do not erase or downgrade permanent Complete. In Progress is persisted workflow state, not lifecycle termination, recurrence satisfaction, or a second active-status authority.

### Supporting value objects

`TARGET` — The engine also consumes three supporting value objects:

- `LogicalDayContext`: timezone, configured rollover boundary, current logical date, and evaluation context;
- `RecurrenceAnchor`: stable schedule basis used to decide schedule membership;
- `OccurrenceIdentity`: deterministic identity of one actual immutable occurrence origin;
- `ScheduleBoundaryEvent`: a forward-authoritative manual due-date or Repeat boundary;
- `ManualCalendarOverride`: a date-scoped manual Calendar scheduling-state input;
- `EffectiveObligation`: a same-Task projection grouping one or more origin occurrences that share an effective obligation date.

These objects/facts are deliberately separate from `due_on`, current status, and generic Calendar display dates. Phase 1A does not design their storage or SQL representation.

## Part 2: Canonical meaning of `due_on`

### Target definition

`TARGET` — `due_on` is a guarded persisted projection/cursor for the Task’s current effective obligation when the active workflow requires one. It is not an immutable configuration fact and is not a universal representation of every future occurrence.

`due_on` is not simultaneously:

- an occurrence identity;
- an immutable `scheduledDueOn` origin;
- the recurrence anchor;
- proof of fixed-calendar future membership;
- History authority; or
- a generic Calendar date.

`TARGET` — The canonical engine derives the current effective obligation from TaskConfiguration, RecurrenceAnchor, schedule boundaries, manual Calendar overrides, Explicit History, and LogicalDayContext. If `due_on` remains persisted, it is a guarded projection of that result. The engine must win when the stored projection conflicts with chronology.

For rolling Missed, `due_on` may freeze on the unresolved obligation’s effective due date. For one-time scheduling, it represents the one obligation’s current effective date while active. After Delay, it projects the moved `effectiveDueOn`, not the immutable scheduled origin. For fixed-calendar scheduling, it may represent the currently active unresolved/effective obligation while independent future scheduled occurrences continue separately. An older fixed Missed condition may therefore leave `due_on` on a past unresolved/effective date while a future fixed occurrence is still projected. After the active Missed condition is cleared, `due_on` may advance to the next applicable effective fixed obligation.

### Recurrence-type evaluation

| Scheduling model | Target meaning of `due_on` | Separate anchor/future-membership requirement |
|---|---|---|
| No Repeat, no due date | No active occurrence; the Task is genuinely unscheduled. History alone does not activate recurrence, and inactivity does not create Missed. | No active schedule anchor is required. |
| No Repeat, due date | The one-time scheduled obligation’s current effective date while that one obligation is active. | Preserve the one-time schedule boundary; do not infer Daily recurrence. |
| Rolling recurring | The current effective rolling obligation; an unresolved rolling Missed obligation may freeze this cursor. | A stable rolling anchor is separate from the moving cursor. |
| Fixed-calendar recurring | The currently active unresolved/effective obligation, when one exists. It is not the only representation of future membership. | Fixed future occurrence membership is calculated from the fixed rule and anchor independently; it may coexist with an older active Missed condition. |
| Daily Until Complete | The current effective rolling obligation while the Task is not terminally Complete. Complete terminates the active cadence under Phase 1B-2A. | The start/anchor and completion boundary are separate from the cursor. |

`TARGET` — The recurrence kernel must be able to answer schedule membership from the stable anchor, recurrence configuration, and forward schedule boundaries, then use manual Calendar overrides, explicit History, and chronology to determine effective obligations. A moving `due_on` value alone is insufficient as the universal recurrence anchor or as the only source for fixed-calendar future membership.

## Part 3: Canonical occurrence identity

### Identity rules

`TARGET` — The following rules are strict core-model rules:

1. One recurrence obligation has one canonical occurrence identity.
2. A resolution-eligible History event resolves at most one occurrence.
3. Multiple successful History events must not accidentally claim or advance the same occurrence more than once.
4. `logicalDate`, `scheduledDueOn`, and `effectiveDueOn` are different concepts and must remain independently represented.
5. Identity should be deterministic from the actual occurrence whenever possible.
6. Missing legacy identity does not automatically invalidate an otherwise valid explicit History event.
7. Stale or conflicting occurrence metadata is a data-quality problem and must not be blindly trusted.
8. Clearly reconstructable chronology outranks stale persisted projection/cache fields.

### Recommended identity form

`TARGET` — For the current recurrence model, the preferred deterministic identity is:

```text
task:{taskId}:occurrence:{scheduledDueOn}
```

The actual date-only identity remains valid for the currently supported recurrence model because each original scheduled occurrence for one Task has one scheduled origin date. Multiple origins may later share one `effectiveDueOn` because of Delay, but they do not share one occurrence identity.

### Resolved current same-day identity gate

`CURRENT` — The supported engine recurrence model permits at most one generated obligation per Task per due date. [`TaskRecurrence` in `types.ts`](../../src/lib/task-state-engine/types.ts#L31-L51) contains one recurrence rule per Task, with only `none`, `rolling`, `weekly`, and `monthly` variants. [`scheduledOccurrences()`](../../src/lib/task-state-engine/recurrence.ts#L90-L142) generates date keys and deduplicates them in a `Set<string>`; no current recurrence variant models multiple independent same-day obligations. [`occurrenceIdentity()`](../../src/lib/task-state-engine/recurrence.ts#L195-L197) already uses the Task ID plus occurrence due date.

`TARGET` — This validity gate is **RESOLVED**: the current supported product may use:

```text
task:{taskId}:occurrence:{scheduledDueOn}
```

This identity is stable across the date on which the user resolves or delays the occurrence and prevents `entry_date` or a moved effective date from becoming an accidental occurrence key.

`TARGET` — If ADHDice later supports multiple independent same-day obligations for one Task, occurrence identity must gain an additional deterministic discriminator, such as an occurrence ordinal or recurrence-sequence value:

```text
task:{taskId}:occurrence:{scheduledDueOn}:{occurrenceOrdinal}
```

The model must not silently reuse the date-only form in a future domain that permits more than one same-day obligation. No discriminator is required today.

### Missing, stale, and duplicate identity

`TARGET` — A legacy event with no `occurrenceIdentity` still has potentially trustworthy `taskId`, `logicalDate`, `outcome`, provenance, and possibly a scheduled-origin date. The engine may infer identity only when recurrence and chronology make the inference safe. Otherwise it keeps the event valid but marks identity as unknown/data-quality-limited.

`TARGET` — Stale scheduled/effective due metadata or `occurrenceIdentity` must not override a clearly reconstructable chronology. The event remains an explicit fact; its metadata is flagged and may be repaired later. A conflict is not permission to delete or rewrite History in Phase 1A.

`TARGET` — If several successful events claim one occurrence identity, each event remains an explicit historical row subject to the one-row-per-logical-date rule, but the occurrence ledger may consume that identity once only. The duplicate claims are a data-quality anomaly. The engine must not advance repeatedly merely because the persisted rows repeat the same identity.

## Part 4: Recurrence cursor versus recurrence anchor

### Recurrence anchor

`TARGET` — The `RecurrenceAnchor` is the stable basis used to determine schedule membership. It answers questions such as “which dates belong to this schedule?” and “when did this recurrence begin?” It must remain conceptually stable when the current unresolved occurrence moves.

The anchor may be composed from an immutable schedule-start date plus recurrence-specific configuration. It is not the last completion date and is not a Calendar display date.

### Current occurrence cursor

`TARGET` — The current occurrence cursor identifies the current effective obligation after applying configuration, recurrence anchor, forward schedule boundaries, manual Calendar overrides, explicit History, and logical-day context. `due_on` is the proposed persisted representation of this cursor when an active effective obligation requires one. Projected future fixed-calendar occurrences remain separately calculable.

The cursor may move as future phases define completion, delay, rollover, and recurrence advancement. The anchor must not move merely because the cursor moves.

### Are existing repeat fields enough?

`CURRENT` — Phase 0 identifies repeat fields as configuration input but also reports that `due_on` is overloaded and that persisted recurrence-cursor/satisfied-occurrence fields are absent from the current Task shape. See [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) and [`src/lib/task-state-engine/legacy-adapter.ts`](../../src/lib/task-state-engine/legacy-adapter.ts).

`CURRENT` — Weekly and monthly legacy adaptation currently assigns `anchorDate: dueOn`, while rolling recurrence has no separately persisted stable anchor in the engine snapshot. The adapter also reports that the current Task model has no persisted recurrence cursor field and that `active_occurrence_due_on` is a different live-occurrence value. See [`recurrenceFromLegacy()`](../../src/lib/task-state-engine/legacy-adapter.ts#L128-L208), [`adaptLegacyTaskState()`](../../src/lib/task-state-engine/legacy-adapter.ts#L285-L310), and the fallback behavior in [`isScheduledOccurrence()`](../../src/lib/task-state-engine/recurrence.ts#L64-L88) and [`scheduledOccurrences()`](../../src/lib/task-state-engine/recurrence.ts#L90-L142).

`TARGET` — This validity gate is **RESOLVED** with the result: **a stable recurrence anchor is not recoverable for every legacy Task; later migration/data-quality policy is required.** The canonical target remains:

```text
recurrence anchor != current occurrence cursor
```

Future canonical data must have a stable anchor representation rather than inferring the anchor indefinitely from moving `due_on`. Phase 1A does not choose or add a database column. A later migration must classify legacy anchor recovery as:

- deterministically recoverable;
- high-confidence reconstructable; or
- ambiguous/unrecoverable.

An ambiguous legacy row must not receive an invented anchor that is presented as historical fact.

## Part 5: Stored versus derived active status

### Lifecycle and container facts

`TARGET` — Terminal and container facts are persisted because permanent completion, archive, and trash affect visibility, retention, and eligibility beyond a date-local schedule calculation. They are separate axes: `terminalState` is `active` or `permanently_complete`, while `containerState` is `active`, `archived`, or `trashed`.

### Stored workflow state

`TARGET` — Persist only workflow facts that cannot be reconstructed and that must survive the relevant user/session boundary.

Recommended minimum:

- `in_progress` may remain a persisted workflow/session fact if the product must restore an unfinished active work state across reloads or logical-day boundaries. Its tracking date is not the Task’s general logical-day state.
- A separate durable `delayed` status is not required by the core model merely because Delayed is an explicit History outcome. Phase 1B must decide whether delay is a lasting workflow fact, a History event plus cursor change, or both before a second persisted status is introduced.
- No stored workflow status should be allowed to override an explicit History event for its logical date or the engine’s derived active schedule state.

### Derived schedule state

`TARGET` — The following are derived from TaskConfiguration, Explicit History, and LogicalDayContext:

- Pending/Open;
- Missed, including calculated overdue state;
- Upcoming;
- Not Due;
- the current unresolved occurrence;
- current active status visible to Task surfaces; and
- current completion or Missed streak facts.

`TARGET` — Calculated Missed is not an ordinary explicit History fact. Time passing may change the derived state and Calendar without creating a row.

### Role of the existing DB `Task.status`

`CURRENT` — Phase 0 finds `Task.status` consumed as a stored status, projection input, display fallback, bucket value, editor value, and compatibility value. It is not a sufficient sole authority. See [Phase 0 § 2](task-state-phase-0-inventory.md#2-current-status-authorities) and [§ 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state).

`TARGET` — The existing DB `Task.status` should eventually be treated as a persisted projection/cache plus legacy compatibility field. It may be retained for query performance and rollout compatibility, but it must not override canonical derived state when it disagrees. Lifecycle facts should be represented and reasoned about separately from this projection.

## Part 6: `active_occurrence_due_on` and `active_status_logical_date`

### `active_occurrence_due_on`

`CURRENT` — The field is currently used as an active occurrence anchor/cache, alongside `due_on`, active-status tracking, History metadata, timers, and stale In Progress rollover. Phase 0 identifies it as a contradiction site rather than a fully defined canonical fact. See [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) and [§ 15](task-state-phase-0-inventory.md#15-top-architectural-risks).

`TARGET` — The canonical current effective obligation should come directly from the engine. `active_occurrence_due_on` is therefore a persisted projection/cache or migration compatibility field for the effective current obligation, not an authority and not the immutable scheduled origin.

If retained during convergence, it should:

- represent the effective due date of the engine-derived current unresolved obligation;
- be allowed on an active scheduled Task even when the Task is not In Progress, if a current unresolved occurrence exists;
- be null when no current unresolved occurrence exists or lifecycle excludes active scheduling;
- never act as an implicit marker that the Task is In Progress; and
- lose to explicit History plus canonical chronology when it conflicts.

The exact write/update behavior is deferred; Phase 1A only fixes its category and precedence.

### `active_status_logical_date`

`CURRENT` — This field is used by direct active-status tracking and stale In Progress rollover. Phase 0 lists it as a persisted active-status origin/cache whose long-term meaning is unresolved. See [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) and [§ 16](task-state-phase-0-inventory.md#16-phase-1-inputs).

`TARGET` — It has meaning only for a persisted `in_progress` workflow/session fact. It is not the logical date for all Task state and should be null or ignored when the Task is not In Progress. The engine’s `LogicalDayContext` is the canonical time boundary for all derived state.

## Part 7: Explicit History metadata classification

`CURRENT` — The following fields exist on the current History shape and are used by normalization, Calendar, statistics, engine replay, repair, rewards, or cleanup. See [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map), [§ 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state), and [`src/lib/task-state-engine/types.ts`](../../src/lib/task-state-engine/types.ts).

`TARGET` — Their classifications are:

| Existing concept | Target classification | Canonical meaning |
|---|---|---|
| `entry_date` | Canonical fact | The explicit event’s logical date. It participates in the one-event-per-Task/logical-date identity. |
| `status` / outcome | Canonical fact | The explicit outcome recorded for that logical date. `event_type` may remain a separate canonical discriminator where terminal events need distinction. |
| `occurrence_due_on` | Legacy/compatibility event metadata when valid; nullable compatibility fact otherwise | The scheduled/origin due date of the occurrence referred to by the event when that interpretation is validated. It is historical event metadata, not the current effective Task cursor. |
| `occurrence_key` | Canonical occurrence identity when valid; nullable compatibility field when absent | Identity of the actual occurrence resolved or referenced by the event. Missing identity does not invalidate the event. |
| `counted_as_due_occurrence` | Deterministic derived metadata / compatibility cache | Whether the row was counted as a due opportunity under the then-current interpretation. Derive from outcome, occurrence semantics, provenance, and chronology where possible; do not treat the boolean as stronger than those facts. |
| `was_completed` | Deterministic derived metadata / compatibility cache | A denormalized completion interpretation. Derive from outcome/event semantics; do not use it as a second independent completion authority. A terminal lifecycle fact must not be hidden inside an ambiguous boolean. |

`TARGET` — `counted_as_due_occurrence` and `was_completed` are not primary domain facts in the core model. They may be preserved for compatibility, statistics, or repair evidence, but conflicting values are data-quality metadata. The canonical event outcome, occurrence identity/due date, provenance, and chronology win.

The canonical event concepts behind those legacy fields are `occurrenceIdentity`, immutable `scheduledDueOn`, and movable `effectiveDueOn`. Ordinary explicit outcomes should reference the applicable origin when safely known. A Delayed event must preserve the original origin and delayed effective target. Legacy rows may lack one or more of these metadata values without losing the explicit user outcome or logical date.

## Part 8: Calculated state versus persisted projection

`TARGET` — Persistence can be used as a performance optimization only when it is explicitly labeled a projection/cache and can be recomputed. A projection must never become authority by virtue of being easier to query.

| Calculated or visible concept | Canonical source | May be persisted as projection? | Conflict rule |
|---|---|---:|---|
| Current visible active status | EffectiveTaskState from configuration + explicit History + logical day | Yes, including a compatibility `Task.status` projection | Re-derive; canonical engine output wins. |
| Current effective obligation date | Canonical TaskOccurrence/effective-obligation cursor from engine chronology | Yes, as `due_on` and possibly `active_occurrence_due_on` | Re-derive; stale stored dates are repaired later and cannot drive authority. |
| Future fixed-calendar membership | Canonical projected occurrences from fixed recurrence and boundaries | Yes, as a rebuildable projection | Never infer solely from `due_on` or an older active Missed cursor. |
| Current occurrence identity | Canonical occurrence chronology plus validated History metadata | Yes, if clearly labeled a projection | A conflicting cache is a data-quality finding; identity/chronology rules win. |
| Current completion streak | Effective timeline chronology | Yes, for read performance | Recompute from canonical effective days; never trust a stale cached streak. |
| Current Missed streak | Effective timeline chronology including calculated Missed | Yes, for read performance | Recompute from effective chronology; do not manufacture explicit History to support the cache. |
| Overdue state | TaskConfiguration + Explicit History + LogicalDayContext | Yes, as a visible status/projection | Canonical derivation wins; a stale `missed`, `pending`, or `not_due` value is compatibility data. |
| Calendar day state | EffectiveTimelineDay for the requested logical date | Yes, as a read cache if needed | Rebuild from the same engine; Calendar cache cannot override explicit History or schedule facts. |

`TARGET` — A projection conflict should produce a canonical result plus, where useful, a bounded data-quality signal. Phase 1A does not define the repair algorithm. It defines that canonical derivation wins and projection repair is a later concern.

### Canonical `TaskStateDiagnostic[]`

`TARGET` — `EffectiveTaskState` must be able to return structured `TaskStateDiagnostic[]` findings alongside the safest state that can be proven. Phase 1A does not implement diagnostics or choose storage, but the core model must not silently guess through:

- stale or duplicate occurrence identity;
- scheduled/effective due-date contradiction;
- impossible terminal/container/workflow lifecycle combination;
- unresolved ScheduleBoundaryEvent conflict;
- ambiguous legacy occurrence or recurrence-anchor reconstruction;
- persisted projection mismatch; or
- unsupported or otherwise impossible chronology.

Diagnostics preserve the user’s explicit facts and explain what cannot be resolved safely. They are not permission to manufacture History, rewrite configuration, or select an arbitrary competing authority.

## Part 9: Contradictory legacy-state precedence

These examples define information trust, not repair operations.

### Example A: stored Missed versus explicit resolution

`TARGET` — If stored `Task.status = Missed` but explicit History resolves the currently due occurrence, the explicit History and canonical occurrence chronology win for the applicable logical date. Stored Missed is a stale projection. The engine derives the resulting current state; Phase 1B determines the exact next cursor after the resolution.

### Example B: `due_on = 8/5` and explicit Done on 8/5

`TARGET` — The explicit Done event clearly refers to the 8/5 occurrence when its metadata or chronology validates that interpretation. That occurrence is resolved at most once. The Task’s stored `due_on` is then only a cursor projection; exact advancement is deferred to Phase 1B and must not be inferred from a generic status field.

### Example C: `active_occurrence_due_on = 7/30`, chronology indicates 8/5

`TARGET` — The active occurrence field is treated as a stale projection/cache. The engine uses configuration, validated History, logical day, and reconstructable occurrence chronology. The 8/5 canonical result wins; the 7/30 field is a data-quality finding.

### Example D: several successful History rows claim occurrence 7/30

`TARGET` — Each explicit row remains a historical fact for its own logical date, subject to one row per Task/logical date. The occurrence ledger permits one successful resolution of 7/30 only. Repeated claims are a duplicate-identity anomaly, not permission for repeated advancement. No repair is performed in Phase 1A.

### Example E: History has no occurrence identity

`TARGET` — The event remains valid if its Task, logical date, outcome, provenance, and any trustworthy due-date/chronology evidence are valid. The engine may reconstruct identity when deterministic; otherwise it marks identity unknown and avoids false double consumption. Missing identity is a data-quality limitation, not automatic invalidation.

### Example F: legacy automatic Missed overlaps a calculated Missed day

`TARGET` — The automatic row is classified as a legacy inferred artifact by provenance, not automatically as a manually explicit user outcome. The calculated Missed remains derived and non-persistent. The overlap may be used as migration evidence, but Phase 1A does not promote, delete, or rewrite the row. If a true manual explicit outcome exists for that logical date, it retains explicit-History precedence.

`CURRENT` — Phase 0 confirms that this overlap is reachable because Effective Timeline calculates non-persistent Missed while legacy reconciliation and rollover can write automatic Missed rows. See [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) and [§ 13](task-state-phase-0-inventory.md#13-explicit-authority-tables).

## Part 10: Canonical information precedence

`TARGET` — Precedence is layered, and it is not a single scalar ranking because lifecycle, Calendar scheduling state, explicit History, and active obligation answer different questions:

1. **Authoritative input facts.** Consume canonical lifecycle facts, TaskConfiguration, RecurrenceAnchor, forward ScheduleBoundaryEvent facts, ExplicitHistoryEvent facts, ManualCalendarOverride facts, and LogicalDayContext. Preserve each fact rather than collapsing them into one status.
2. **Terminal lifecycle eligibility.** `terminalState = permanently_complete` remains semantically Complete and terminates future recurrence. It does not erase History or container facts.
3. **Container eligibility.** `containerState = archived` or `trashed` excludes active workflow and active recurrence evaluation while preserving configuration, boundaries, effective due information, occurrence evidence, and History.
4. **Schedule and occurrence derivation.** For an eligible active, non-terminal Task, derive schedule membership, immutable occurrence origins, effective dates, and projected future fixed occurrences from configuration, anchor, boundaries, and logical day.
5. **Manual Calendar override for its date.** A `ManualCalendarOverride` controls the Calendar scheduling state for its logical date, including `Unscheduled`, `Not Due`, or `Due/Open`, without automatically mutating Repeat or future recurrence.
6. **Explicit History authority for its outcome/date.** An explicit event controls the recorded outcome/checkpoint for its logical date. Its outcome remains valid even when the associated obligation remains unresolved or its metadata is incomplete.
7. **Derived effective obligation/status/timeline.** Combine the higher-priority facts into active obligation state, effective same-Task grouping, Calendar/timeline state, current active schedule status, and streak inputs/results. A manual scheduling override and an explicit History event may both apply to one date because they govern different fields; if their interaction leaves obligation authority genuinely unresolved, return a diagnostic rather than silently choosing.
8. **Workflow overlay.** Overlay valid persisted `In Progress` facts after schedule/obligation derivation. Workflow may coexist with Missed, Due/Open, or another derived schedule state; it does not satisfy recurrence or become a second status authority.
9. **Persisted projections and compatibility fields last.** `Task.status`, `due_on`, active occurrence fields, streak caches, overdue flags, legacy booleans, and stale occurrence metadata may accelerate reads or provide evidence, but cannot override reconstructable chronology.

This hierarchy means lifecycle can control whether a Task is currently schedulable while explicit History still controls what happened on a historical logical date. No lower layer may silently rewrite a higher layer.

## Part 11: Core invariants

`TARGET` — The Phase 1A core model must preserve these invariants:

**INVARIANT 1 — One explicit event per date.** There is one authoritative Explicit History outcome per Task per logical date.

**INVARIANT 2 — Explicit History is date-authoritative.** An explicit History event controls its logical-date outcome; clearing it returns that date to calculated authority.

**INVARIANT 3 — Calculated Missed is non-persistent by passage of time.** Time passing may calculate Missed state, but must not create ordinary explicit History merely because time passed.

**INVARIANT 4 — Four scheduling models remain distinct.** Genuinely unscheduled, one-time scheduled, rolling recurring, and fixed-calendar recurring Tasks do not share one generic due-date rule.

**INVARIANT 5 — No due plus no Repeat is unscheduled.** It has no active occurrence; History alone does not activate recurrence and inactivity does not create Missed.

**INVARIANT 6 — Due plus no Repeat is one-time.** It creates exactly one obligation and never implies rolling Daily.

**INVARIANT 7 — Stable anchor is separate from cursor.** Recurrence membership uses the stable anchor and boundaries; `due_on` is not the universal anchor or fixed-calendar future-membership authority.

**INVARIANT 8 — One occurrence, one immutable identity.** Every origin occurrence has one canonical identity based on immutable `scheduledDueOn` for the supported date-only model.

**INVARIANT 9 — Delay moves effective date, not identity.** Delay changes `effectiveDueOn`; it does not create a new occurrence identity from the target date.

**INVARIANT 10 — Scheduled, effective, and event dates remain distinct.** `scheduledDueOn`, `effectiveDueOn`, and `logicalDate` are independently represented even when their values happen to match.

**INVARIANT 11 — One resolution consumes at most one effective obligation.** A resolution-eligible event resolves one origin or one canonical effective grouping, not one outcome per contributing origin.

**INVARIANT 12 — Effective grouping preserves provenance.** Same-Task origin occurrences may group into one effective obligation; grouping does not merge, erase, or replace their immutable identities, and yields one outcome and one streak contribution.

**INVARIANT 13 — No accidental duplicate consumption.** Repeated or stale identity metadata cannot advance the same origin or effective obligation more than once.

**INVARIANT 14 — Rolling Missed freezes one obligation.** A rolling unresolved effective due date may remain frozen while overdue logical days derive from that one obligation.

**INVARIANT 15 — Fixed future membership is independent.** Future fixed-calendar occurrences can coexist with an older active Missed condition and must not be inferred solely from the older `due_on` cursor.

**INVARIANT 16 — `due_on` is an effective cursor projection.** It represents the current effective obligation when one is required, may freeze for rolling/one-time/fixed Missed, projects Delay’s moved effective date, and cannot stand for immutable origin, History authority, generic Calendar date, or all future fixed membership.

**INVARIANT 17 — Configuration and boundaries preserve History.** Repeat/due-date changes are forward-authoritative schedule boundaries and do not rewrite earlier explicit History or established chronology.

**INVARIANT 18 — Calendar state, History, and obligation state are separate.** A logical date may be Unscheduled, Not Due, Due/Open, or calculated Missed while also having an explicit outcome and a separately derived obligation state.

**INVARIANT 19 — Checkpoints need not resolve obligations.** Explicit Done/Did My Best or other handled checkpoints can exist while a one-time or other applicable obligation remains unresolved/Missed.

**INVARIANT 20 — Manual Calendar overrides are date-scoped authority.** They control Calendar scheduling state for their date without automatically rewriting Repeat or future recurrence; unresolved cross-field conflict produces a diagnostic.

**INVARIANT 21 — One active-status derivation.** Current active schedule status has one canonical derivation from the authoritative inputs, with workflow overlay applied separately.

**INVARIANT 22 — Lifecycle axes are separate.** Terminal state, container state, workflow state, and active schedule status are not one mutually exclusive enum.

**INVARIANT 23 — Complete remains Complete in Archive/Trash.** `terminalState = permanently_complete` is preserved regardless of `containerState`; Archive and Trash do not erase or downgrade it.

**INVARIANT 24 — Archive/Trash preserve historical facts.** Container transitions suspend active evaluation as specified but do not erase History, schedule boundaries, occurrence provenance, or historical Calendar outcomes.

**INVARIANT 25 — In Progress is workflow only.** In Progress is persisted workflow/session state, does not satisfy recurrence, does not move `due_on`, does not pause Missed, and is not a second active-status authority.

**INVARIANT 26 — Logical day is the time boundary.** Canonical Task state uses the user-scoped logical day defined by timezone and rollover boundary, not raw midnight or arbitrary render time.

**INVARIANT 27 — Calendar and current state share one model.** Calendar state and current Task state may represent different dates, but both derive from the same configuration, boundaries, History, occurrence, override, and logical-day model.

**INVARIANT 28 — Current streaks and historical statistics are separate.** Current completion/Missed streaks derive from effective chronology; historical statistics derive from their defined historical source and must not be conflated.

**INVARIANT 29 — Projections do not override authority.** Stored status, due dates, active fields, streaks, overdue flags, and compatibility booleans cannot override canonical derived state when they disagree.

**INVARIANT 30 — Missing metadata is not automatic invalidation.** Missing or stale occurrence metadata does not discard a trustworthy explicit outcome/date fact; it is classified as a data-quality condition.

**INVARIANT 31 — Diagnostics replace silent guessing.** Stale identity, scheduled/effective due contradiction, impossible lifecycle combination, unresolved schedule-boundary conflict, ambiguous legacy reconstruction, projection mismatch, and unsupported chronology must produce structured warnings/errors rather than speculative state.

## Part 12: Canonical Stored vs Derived Model

`TARGET` — The following table is the Phase 1A summary. “Existing legacy representation” is a CURRENT observation cited to Phase 0; the other columns describe the target model.

| Concept | Canonical category | Source of truth | May be persisted as projection? | Existing legacy representation | Future concern |
|---|---|---|---|---|---|
| terminal lifecycle state | Canonical stored lifecycle fact | Lifecycle boundary | Not merely as a cache; terminal state is authoritative | `completed_at` and completion status are split across TaskApp/CRUD and engine lifecycle inputs. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Preserve `permanently_complete` independently of container placement. |
| container state | Canonical stored lifecycle/container fact | Archive/Trash boundary | Not merely as a cache; container state is authoritative | `status`, `trashed_at`, and archive-like rules are split across TaskApp/CRUD and engine lifecycle inputs. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Keep `active`, `archived`, and `trashed` separate from terminal state. |
| workflow state | Canonical stored workflow fact when persistence is required | In Progress workflow boundary | Yes, only when clearly labeled workflow state | `active_status_logical_date` and active occurrence fields participate in legacy In Progress tracking. [Phase 0 § 6](task-state-phase-0-inventory.md#6-rollover-and-logical-day-authority) | In Progress must not satisfy recurrence or become active-status authority. |
| recurrence configuration | Canonical stored configuration fact | User-controlled Task configuration | Yes, because it is itself stored configuration | Repeat fields are consumed by both engine and legacy recurrence families. [Phase 0 § 3](task-state-phase-0-inventory.md#3-recurrence-implementations-and-authority-graph) | Converge all recurrence readers on one kernel. |
| recurrence anchor | Canonical schedule value/fact | Stable schedule-start/anchor information plus explicitly classified legacy inference | Yes, if the stored representation is stable and versioned | Weekly/monthly adaptation uses `due_on` as `anchorDate`; rolling recurrence lacks a separately persisted stable anchor, and the current Task shape lacks a persisted recurrence cursor. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state); [`legacy-adapter.ts`](../../src/lib/task-state-engine/legacy-adapter.ts) | Later migration must classify anchor recovery and preserve uncertainty rather than inventing historical anchors. |
| occurrence identity | Canonical occurrence fact | Actual immutable scheduled origin plus validated History metadata | Yes, as a clearly labeled cache or event metadata | `occurrence_key`, `occurrence_due_on`, `active_occurrence_due_on`, and On-Time identity coexist with missing/contradictory cases. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Define duplicate detection, scheduled/effective metadata, and legacy reconstruction. |
| current effective obligation | Derived canonical result | Engine chronology over configuration, boundaries, History, overrides, and logical day | Yes, through `due_on`/active fields as projections | `due_on` and `active_occurrence_due_on` are used by multiple competing paths. [Phase 0 § 2](task-state-phase-0-inventory.md#2-current-status-authorities) | Define advancement, Delay, grouping, and unresolved-chain behavior in Phase 1B. |
| due_on | Persisted effective cursor projection | Current effective obligation from the engine | Yes; it is the intended projection | `due_on` is currently a schedule cursor, one-off due date, legacy status input, and recurrence anchor in different paths. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Remove anchor/origin/date/status ambiguity; do not use it for future fixed membership. |
| future fixed-calendar membership | Derived projected occurrence set | Fixed recurrence rule + anchor + boundaries | Yes, as a rebuildable projection | Calendar builds a legacy due-date set alongside Effective Timeline. [Phase 0 § 8](task-state-phase-0-inventory.md#8-ui-consumption-matrix) | Keep it independent of an older active Missed cursor. |
| explicit History outcome | Canonical persisted historical fact | ExplicitHistoryEvent for Task/logical date | Yes, because it is the fact itself | Direct single/batch upserts and deletes coexist with automatic Missed writes. [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) | Put all explicit writes behind one command/repository boundary. |
| calculated Missed | Canonical derived state | EffectiveTimelineDay from schedule, History, and logical day | A display/cache projection is acceptable; ordinary History persistence is not | Effective Timeline calculates it, while legacy/rollover paths can persist automatic Missed rows. [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) | Classify and migrate legacy automatic rows. |
| current active status | Canonical derived state, with optional workflow overlay | EffectiveTaskState | Yes, as visible `Task.status` projection | Engine read projection coexists with legacy cockpit, stored fallbacks, live resolver, and direct active tracking. [Phase 0 § 2](task-state-phase-0-inventory.md#2-current-status-authorities) | Converge every consumer on one projection. |
| Calendar day state | Canonical derived timeline fact | EffectiveTimelineDay for requested logical date | Yes, as a rebuildable read cache | Calendar uses Effective Timeline but still builds a legacy due-date set in parallel. [Phase 0 § 8](task-state-phase-0-inventory.md#8-ui-consumption-matrix) | Remove parallel Calendar derivation after parity. |
| schedule boundary event | Canonical supporting persisted fact/value object | Manual due-date or Repeat change from its logical boundary forward | Yes, as the fact itself | Current due/repeat mutations are distributed across multiple Task mutation paths. [Phase 0 § 4](task-state-phase-0-inventory.md#4-task-mutation-matrix) | Preserve later boundaries during historical replay; no storage design in Phase 1A. |
| manual Calendar override | Canonical supporting persisted fact/value object | User’s date-scoped scheduling-state correction | Yes, as the fact itself | Current Calendar editing primarily writes outcome-style History. [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) | Keep date scope separate from Repeat mutation and explicit outcome. |
| current completion streak | Canonical derived current fact | Effective chronology | Yes, as a cache | Effective Timeline owns it when available; saved-stat fallbacks remain. [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) | Preserve separation from best/historical streak statistics. |
| current Missed streak | Canonical derived current fact | Effective chronology including calculated Missed | Yes, as a cache | Effective Timeline and saved-row legacy calculations coexist. [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) | Keep it mutually exclusive with current completion streak. |
| historical stats | Derived/report fact over explicit historical source | Defined saved-History statistics model | Yes, as a cache with a known revision/source | Saved-row stats and Effective Timeline summaries are consumed by overlapping surfaces. [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) | Define each statistic’s source and avoid using it for current status. |
| active_occurrence_due_on | Projection/cache or legacy compatibility field | Engine-derived current occurrence | Yes, temporarily, if clearly non-authoritative | Used as active anchor/cache and stale In Progress input. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Stop using it as an independent occurrence authority. |
| active_status_logical_date | In-progress-only workflow tracking or legacy field | Persisted workflow fact only when In Progress is meaningful | Yes, while that workflow exists | Direct active tracking and stale In Progress rollover use it. [Phase 0 § 6](task-state-phase-0-inventory.md#6-rollover-and-logical-day-authority) | Define cross-day In Progress semantics; otherwise remove its general-state meaning. |
| counted_as_due_occurrence | Derived/compatibility metadata | Outcome + occurrence + chronology + provenance | Yes, for compatibility/statistics | Stored History boolean used by legacy due/streak/reward helpers. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Make it repairable and non-authoritative. |
| was_completed | Derived/compatibility metadata | Outcome/event semantics and lifecycle facts | Yes, for compatibility/statistics | Stored History boolean participates in legacy interpretation. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Replace ambiguous boolean meaning with explicit outcome/lifecycle semantics. |

## Part 13: Questions Deferred to Phase 1B

Phase 1A does not define transition algorithms. The following implementation-detail questions are deferred; the four scheduling models and the No Repeat distinction are already locked by Phase 1B-1:

1. What exact occurrence does an early completion consume, and how does the next cursor advance?
2. What exact occurrence does a late completion consume, including a completion after one or more overdue dates?
3. How do Daily and interval recurrence advance and rebase after each resolution?
4. How does a Missed overdue chain behave, including whether it remains continuously overdue and which dates are virtual versus explicit?
5. What are the exact implementation/storage details for Delay while preserving scheduled and effective occurrence metadata?
6. How do Complete, Archive, Trash, and permanently complete lifecycle transitions persist alongside explicit Complete History?
7. Which rollover actions are allowed, idempotent, and authoritative when the logical day changes?
8. What is the reward eligibility boundary for explicit outcomes, calculated Missed, rollover, and terminal completion?
9. How do monthly and selected-weekday schedules advance when configuration, anchor, and current effective cursor disagree?
10. What exact output shape and projection timing should the later output-contract and implementation phases use?

### Resolved core-model validity gates

Both Phase 1A validity gates are closed:

1. **Same-day occurrence identity — RESOLVED.** The current supported recurrence model has one recurrence rule per Task, only `none`/`rolling`/`weekly`/`monthly` variants, date-key generation, and date-key deduplication. It permits at most one generated origin occurrence per Task per scheduled date, so `task:{taskId}:occurrence:{scheduledDueOn}` is sufficient today. A future multi-obligation same-day model would require a deterministic discriminator. See [`types.ts`](../../src/lib/task-state-engine/types.ts#L31-L51), [`scheduledOccurrences()`](../../src/lib/task-state-engine/recurrence.ts#L90-L142), and [`occurrenceIdentity()`](../../src/lib/task-state-engine/recurrence.ts#L195-L197).
2. **Legacy recurrence anchor — RESOLVED.** A stable anchor is not recoverable for every legacy Task because weekly/monthly adaptation uses `due_on` as `anchorDate`, rolling recurrence has no separately persisted stable anchor in the engine snapshot, and `due_on` historically acts as a moving cursor. Future canonical data must separate anchor from cursor; later migration must classify anchor provenance as deterministically recoverable, high-confidence reconstructable, or ambiguous/unrecoverable. See [`recurrenceFromLegacy()`](../../src/lib/task-state-engine/legacy-adapter.ts#L128-L208), [`adaptLegacyTaskState()`](../../src/lib/task-state-engine/legacy-adapter.ts#L285-L310), and [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state).

No core-model validity gate remains open. The remaining questions above are transition/product semantics assigned to Phase 1B.

## Part 14: Phase 1A acceptance criteria

Another engineer should be able to answer these without guessing:

1. **What is a Task occurrence?** One recurrence obligation generated by TaskConfiguration, with its own due date, identity, recurrence source, resolution state, resolution date, and resolution outcome.
2. **What uniquely identifies it?** For the current supported product, `task:{taskId}:occurrence:{scheduledDueOn}`; the same-day identity gate is resolved because current recurrence generation permits at most one origin occurrence per Task per scheduled date. Delay can move `effectiveDueOn` without changing identity, and a future multi-obligation same-day model would require a deterministic discriminator.
3. **What does `due_on` mean?** A guarded projection of the current effective obligation when one is required; it is not an occurrence identity, immutable scheduled origin, recurrence anchor, proof of fixed future membership, History authority, generic Calendar date, or the only current-state input.
4. **What is the recurrence anchor?** A stable schedule basis used for membership and alignment, separate from the moving current occurrence cursor.
5. **What is explicit History?** One persisted explicit outcome per Task/logical date, replaceable by editing and removable by clearing, with optional occurrence identity, immutable scheduled origin, effective deferred target, and provenance metadata. Missing legacy metadata does not invalidate the outcome.
6. **What is calculated state?** The engine-derived effective timeline, current effective obligation, projected future occurrences, active schedule state, Calendar facts, overdue/Missed state, and current streaks from configuration + boundaries + overrides + explicit History + logical day.
7. **Which statuses should be derived?** `Unscheduled`, `Not Due`, Due/Open, Missed, Upcoming, current active schedule status, current effective obligation, projected fixed membership, and current streak facts. Lifecycle axes and any durable workflow/session fact remain stored.
8. **Which Task facts genuinely require persistence?** Separate terminal and container lifecycle facts, plus only workflow facts that must survive the relevant boundary, such as In Progress if cross-session restoration requires it. Derived schedule state, effective grouping, and projections do not become authoritative merely because they are persisted.
9. **Which existing DB fields are projections rather than authority?** `Task.status`, `due_on`, `active_occurrence_due_on`, current streak/overdue values, `counted_as_due_occurrence`, and `was_completed`; `active_status_logical_date` is In Progress tracking or legacy compatibility, not general Task state.
10. **When stored fields disagree with canonical inputs, which source wins?** Terminal/container eligibility is evaluated first; schedule membership comes from configuration, anchor, boundaries, and logical day; manual Calendar overrides control their date’s Calendar state; explicit History controls its outcome/date; canonical effective derivation wins over projections; stale compatibility metadata is evidence or diagnostics only.

## Phase 1A handoff

`TARGET` — Both core-model validity gates are resolved. The current supported product uses date-based occurrence identity because it permits at most one generated obligation per Task per due date. Legacy anchor recovery is explicitly uncertain for some rows, so future canonical implementation and migration must preserve anchor provenance and must not invent ambiguous historical anchors. The implementation plan must preserve the following boundary:

```text
TaskConfiguration + RecurrenceAnchor
    + terminalState + containerState + workflowState
    + ExplicitHistoryEvent[]
    + ScheduleBoundaryEvent[]
    + ManualCalendarOverride[]
    + LogicalDayContext
                         ↓
              canonical occurrence/timeline chronology
                         ↓
       TaskOccurrence[] + EffectiveObligation grouping
          + projected future fixed occurrences
                         ↓
                 EffectiveTaskState
                         ↓
       active schedule / Calendar / streak projections
              + TaskStateDiagnostic[]
```

`CURRENT` — The branch does not yet have this single fully converged path. Phase 0 documents the remaining competing readers, recurrence calculators, mutation entry paths, direct persistence boundaries, and rollover alternatives. See [Phase 0 § 14](task-state-phase-0-inventory.md#14-dependency-map) and [§ 15](task-state-phase-0-inventory.md#15-top-architectural-risks). The remaining deferred work is later transition implementation, output shape, persistence timing, and Phase 1B-2B work; this synchronization amendment does not begin Phase 1B-2B.
