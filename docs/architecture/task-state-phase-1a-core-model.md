# Phase 1A: Canonical Task State Foundation

Status: active working architecture specification
Scope: canonical entities, facts, identity, precedence, and invariants
Required source: [Phase 0 inventory](task-state-phase-0-inventory.md)
Implementation status: specification only; not implemented

## Purpose and scope

Phase 1A defines the minimum conceptual model that a future canonical Task Engine can consume and return. It does not authorize production-code, test, schema, Supabase, migration, or persistence changes.

The target direction is:

```text
Task configuration
    │
    ├── recurrence anchor
    │
    └── lifecycle
          +
Explicit History
          +
Logical Day
          ↓
Canonical occurrence chronology
          ↓
Current occurrence
          ↓
Derived active status / Calendar / streaks
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

The core model defines six canonical entities. `LogicalDayContext`, `RecurrenceAnchor`, and `OccurrenceIdentity` are supporting value objects used by those entities; they are not additional independent Task records.

### 1. TaskConfiguration

`TARGET` — `TaskConfiguration` contains user-controlled scheduling and descriptive facts. It is not the current calculated Task state.

Conceptual contents:

- `taskId`: stable Task identity;
- recurrence configuration: frequency, interval, selected weekdays, monthly rule, Daily Until Complete behavior, or No Repeat;
- schedule configuration: the stable schedule start/anchor, any user-selected schedule constraints, and any time-of-day presentation constraint that the engine explicitly supports;
- task metadata unrelated to recurrence state: title, description, list/folder placement, priority, tags, and similar user content;
- `lifecycle`: a `TaskLifecycle` value, described below.

The configuration is the source for determining whether a date is a scheduled opportunity. It does not itself say whether the opportunity is Pending, Missed, Done, or otherwise handled on a particular logical date.

`TARGET` — `due_on` must not be treated as a configuration field merely because it is currently stored on the Task row. The target role of `due_on` is the current occurrence cursor projection described in Part 2. A separate stable recurrence anchor is required whenever schedule membership cannot be reconstructed from recurrence rule fields alone.

### 2. ExplicitHistoryEvent

`TARGET` — `ExplicitHistoryEvent` is a persisted historical fact for one Task and one logical date.

Required conceptual fields:

| Field | Meaning |
|---|---|
| `taskId` | Task to which the event belongs. |
| `logicalDate` | The user-scoped logical date on which the explicit result applies. |
| `outcome` | Explicit result such as Done, Did My Best, Missed, Delayed, or Complete. |
| `occurrenceDueOn` | The due date of the occurrence the event refers to, when known. It is distinct from `logicalDate`. |
| `occurrenceIdentity` | Canonical identity of the occurrence, when known or safely reconstructed. It may be absent on legacy rows without invalidating the event. |
| `provenance` | How the fact was created, such as manual user entry, migrated legacy row, or legacy automatic reconciliation. Provenance is needed to distinguish an explicit user fact from a legacy inferred artifact. |
| replacement metadata | Created/updated ordering or repository identity used to replace the existing event for the same Task/logical date. |

`TARGET` — There is at most one authoritative explicit outcome for a Task on a logical date. Editing replaces that date’s explicit result. Clearing removes the explicit override and returns that date to calculated authority. Recurrence changes never rewrite explicit History.

`TARGET` — An Explicit History event remains a historical fact even when its occurrence metadata is missing or later shown to be stale. Outcome and logical date are not discarded merely because a cache or identity field is incomplete.

### 3. TaskOccurrence

`TARGET` — A `TaskOccurrence` is one obligation generated by a Task’s recurrence configuration. It is not a Calendar cell and it is not the Task row’s generic status.

Conceptual contents:

- `occurrenceIdentity`: one deterministic identity for the obligation;
- `occurrenceDueOn`: the scheduled/due logical date for that obligation;
- `recurrenceSource`: the configuration and recurrence rule that generated it;
- `resolutionState`: unresolved or resolved;
- `resolutionLogicalDate`: the logical date on which it was resolved, if resolved;
- `resolutionOutcome`: the outcome that resolved it, if resolved.

`TARGET` — The model must distinguish an occurrence’s due date from the date on which a user records an outcome. A Done event recorded on logical 8/8 can resolve an occurrence due on 8/10:

```text
ExplicitHistoryEvent.logicalDate     = 8/8
ExplicitHistoryEvent.occurrenceDueOn = 8/10
TaskOccurrence.occurrenceDueOn       = 8/10
```

The exact set of outcomes that advance or terminate a recurrence is deferred to Phase 1B. The core model nevertheless requires a separate resolution state so that “a date has an explicit row” is not confused with “a particular occurrence was consumed.”

### 4. EffectiveTimelineDay

`TARGET` — `EffectiveTimelineDay` is the calculated representation of one logical date in a Task’s effective chronology.

It contains, conceptually:

- `logicalDate`;
- `origin`: explicit History or calculated;
- effective day state: the explicit outcome when an event exists, otherwise a calculated state such as Pending/Open, Missed, Upcoming, or Not Due;
- `obligation`: whether the day represents a scheduled opportunity or unresolved obligation;
- `occurrenceIdentity` and `occurrenceDueOn` when the day can be associated with an occurrence;
- `handled`: a calculated chronology/display property, not an independent persisted fact.

`TARGET` — Explicit History wins for its logical date. A calculated Missed day may be visible, contribute to current Missed streak, and participate in effective chronology without acquiring an ordinary explicit History row. A calculated future date is informational and must not create an occurrence resolution or a History mutation.

`handled` must not be overloaded to mean “the occurrence was successfully consumed.” For example, an explicit Missed or Delayed event can be a handled calendar outcome while the associated obligation’s resolution semantics remain governed by the engine and Phase 1B rules.

### 5. EffectiveTaskState

`TARGET` — `EffectiveTaskState` is the high-level result returned by the future canonical engine for a Task at a supplied `LogicalDayContext`.

At 1A level it must provide, conceptually:

- the applicable `TaskLifecycle`;
- the current unresolved `TaskOccurrence`, if any;
- the effective active schedule state derived from configuration, explicit History, and logical day;
- the effective timeline/chronology facts needed by Calendar and current streak consumers;
- data-quality findings when persisted metadata is missing, stale, or contradictory;
- optional projection data for persistence, clearly marked as non-authoritative.

Detailed output shape, action plans, reward eligibility, and transition-specific fields belong to later phases, especially Phase 1C for final output shape.

### 6. TaskLifecycle

`TARGET` — `TaskLifecycle` is the Task’s durable visibility/termination state, separate from its current schedule state.

At minimum distinguish:

- `active`: eligible for normal schedule evaluation;
- `archived`: retained but excluded from the active workflow according to lifecycle policy;
- `trashed`: removed from normal workflow and subject to trash/deletion policy;
- `permanently_complete`: terminal lifecycle state, if and when the completion flow makes that transition.

Lifecycle is not the same as Pending, Missed, Delayed, or In Progress. An active Task can be Missed; an archived Task can retain historical Done events; a permanently complete Task can have a final explicit completion fact. Lifecycle controls whether current schedule evaluation is eligible, but it does not erase or rewrite explicit History.

### Supporting value objects

`TARGET` — The engine also consumes three supporting value objects:

- `LogicalDayContext`: timezone, configured rollover boundary, current logical date, and evaluation context;
- `RecurrenceAnchor`: stable schedule basis used to decide schedule membership;
- `OccurrenceIdentity`: deterministic identity of one actual obligation.

These objects are deliberately separate from `due_on`, current status, and Calendar display dates.

## Part 2: Canonical meaning of `due_on`

### Target definition

`TARGET` — For an active scheduled Task, `due_on` represents the current or next unresolved occurrence date. It is a cursor/projection for the active obligation, not a general-purpose date.

`due_on` is not simultaneously:

- the recurrence anchor;
- the historical creation date;
- the last completed date;
- a Calendar display date; or
- a generic status date.

`TARGET` — The canonical engine derives the current occurrence from TaskConfiguration, Explicit History, and LogicalDayContext. If `due_on` remains persisted, it is a guarded projection of that result. The engine must win when the stored projection conflicts with chronology.

### Recurrence-type evaluation

| Recurrence type | Target meaning of `due_on` | Separate anchor requirement |
|---|---|---|
| Daily | Current or next unresolved daily occurrence. | A stable start/anchor is needed when the schedule must not begin before an original date or when historical replay needs a fixed boundary. |
| Interval recurrence | Current or next unresolved interval occurrence. | Required. Interval membership must not be inferred solely from a moving cursor; a stable basis date is needed. |
| Weekly | Current or next unresolved occurrence selected by the weekly rule. | Usually required for schedule start and week alignment; selected weekdays alone do not necessarily preserve the original schedule boundary. |
| Selected weekdays | Current or next unresolved selected-weekday occurrence. | Required when configuration changes or the original schedule start affects which dates are eligible. |
| Monthly | Current or next unresolved monthly occurrence. | Required for the schedule start and for distinguishing day-of-month/ordinal rules from a moving cursor. |
| Daily Until Complete | Current or next unresolved obligation while the Task is not terminally complete. | Required. The start/anchor and the completion boundary are not the same as the active cursor. Exact advancement is Phase 1B. |
| No Repeat | The one unresolved occurrence date. | The anchor and cursor may contain the same date in storage, but they remain separate concepts in the model. |

`TARGET` — The recurrence kernel must be able to answer schedule membership from the stable anchor and recurrence configuration, then use explicit History and chronology to determine the unresolved occurrence. A moving `due_on` value alone is insufficient as the universal recurrence anchor.

## Part 3: Canonical occurrence identity

### Identity rules

`TARGET` — The following rules are strict core-model rules:

1. One recurrence obligation has one canonical occurrence identity.
2. A resolution-eligible History event resolves at most one occurrence.
3. Multiple successful History events must not accidentally claim or advance the same occurrence more than once.
4. `logicalDate` and `occurrenceDueOn` are different concepts and must remain independently represented.
5. Identity should be deterministic from the actual occurrence whenever possible.
6. Missing legacy identity does not automatically invalidate an otherwise valid explicit History event.
7. Stale or conflicting occurrence metadata is a data-quality problem and must not be blindly trusted.
8. Clearly reconstructable chronology outranks stale persisted projection/cache fields.

### Recommended identity form

`TARGET` — For the current recurrence model, the preferred deterministic identity is:

```text
task:{taskId}:occurrence:{occurrenceDueOn}
```

This is valid when a Task can have at most one recurrence obligation on a given due date. It makes the occurrence identity stable across the date on which the user resolves it and prevents `entry_date` from becoming an accidental occurrence key.

`TARGET` — If a future recurrence rule permits multiple obligations for the same Task on the same due date, the identity must include the additional deterministic discriminator, for example an occurrence ordinal or recurrence-sequence value:

```text
task:{taskId}:occurrence:{occurrenceDueOn}:{occurrenceOrdinal}
```

The model must not silently reuse the date-only form in a domain that permits more than one same-day obligation. Whether the current product needs this extension is a core-model validity gate, not a Phase 1B transition decision.

### Missing, stale, and duplicate identity

`TARGET` — A legacy event with no `occurrenceIdentity` still has potentially trustworthy `taskId`, `logicalDate`, `outcome`, provenance, and possibly `occurrenceDueOn`. The engine may infer identity only when recurrence and chronology make the inference safe. Otherwise it keeps the event valid but marks identity as unknown/data-quality-limited.

`TARGET` — A stale `occurrenceDueOn` or `occurrenceIdentity` must not override a clearly reconstructable chronology. The event remains an explicit fact; its metadata is flagged and may be repaired later. A conflict is not permission to delete or rewrite History in Phase 1A.

`TARGET` — If several successful events claim one occurrence identity, each event remains an explicit historical row subject to the one-row-per-logical-date rule, but the occurrence ledger may consume that identity once only. The duplicate claims are a data-quality anomaly. The engine must not advance repeatedly merely because the persisted rows repeat the same identity.

## Part 4: Recurrence cursor versus recurrence anchor

### Recurrence anchor

`TARGET` — The `RecurrenceAnchor` is the stable basis used to determine schedule membership. It answers questions such as “which dates belong to this schedule?” and “when did this recurrence begin?” It must remain conceptually stable when the current unresolved occurrence moves.

The anchor may be composed from an immutable schedule-start date plus recurrence-specific configuration. It is not the last completion date and is not a Calendar display date.

### Current occurrence cursor

`TARGET` — The current occurrence cursor identifies the current or next unresolved occurrence after applying configuration, explicit History, and logical-day context. `due_on` is the proposed persisted representation of this cursor for an active scheduled Task.

The cursor may move as future phases define completion, delay, rollover, and recurrence advancement. The anchor must not move merely because the cursor moves.

### Are existing repeat fields enough?

`CURRENT` — Phase 0 identifies repeat fields as configuration input but also reports that `due_on` is overloaded and that persisted recurrence-cursor/satisfied-occurrence fields are absent from the current Task shape. See [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) and [`src/lib/task-state-engine/legacy-adapter.ts`](../../src/lib/task-state-engine/legacy-adapter.ts).

`TARGET` — Existing repeat fields may be enough to describe the recurrence rule, but they are not assumed to be enough to recover a stable schedule anchor for every legacy row. The future model therefore requires an explicit conceptual anchor. Where an immutable anchor is recoverable from existing fields or chronology, the engine may use that fact; where it is not, a later migration or conservative data-quality state is required. Phase 1A does not choose a schema representation or perform repair.

## Part 5: Stored versus derived active status

### Lifecycle state

`TARGET` — Lifecycle is persisted because archive, trash, and permanent completion affect visibility, retention, and eligibility beyond a date-local schedule calculation.

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

`TARGET` — The canonical current occurrence should come directly from the engine. `active_occurrence_due_on` is therefore a persisted projection/cache or migration compatibility field, not an authority.

If retained during convergence, it should:

- represent the due date of the engine-derived current unresolved occurrence;
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
| `occurrence_due_on` | Canonical event metadata when valid; nullable compatibility fact otherwise | The due date of the occurrence referred to by the event. It is historical event metadata, not the current Task cursor. |
| `occurrence_key` | Canonical occurrence identity when valid; nullable compatibility field when absent | Identity of the actual occurrence resolved or referenced by the event. Missing identity does not invalidate the event. |
| `counted_as_due_occurrence` | Deterministic derived metadata / compatibility cache | Whether the row was counted as a due opportunity under the then-current interpretation. Derive from outcome, occurrence semantics, provenance, and chronology where possible; do not treat the boolean as stronger than those facts. |
| `was_completed` | Deterministic derived metadata / compatibility cache | A denormalized completion interpretation. Derive from outcome/event semantics; do not use it as a second independent completion authority. A terminal lifecycle fact must not be hidden inside an ambiguous boolean. |

`TARGET` — `counted_as_due_occurrence` and `was_completed` are not primary domain facts in the core model. They may be preserved for compatibility, statistics, or repair evidence, but conflicting values are data-quality metadata. The canonical event outcome, occurrence identity/due date, provenance, and chronology win.

## Part 8: Calculated state versus persisted projection

`TARGET` — Persistence can be used as a performance optimization only when it is explicitly labeled a projection/cache and can be recomputed. A projection must never become authority by virtue of being easier to query.

| Calculated or visible concept | Canonical source | May be persisted as projection? | Conflict rule |
|---|---|---:|---|
| Current visible active status | EffectiveTaskState from configuration + explicit History + logical day | Yes, including a compatibility `Task.status` projection | Re-derive; canonical engine output wins. |
| Current unresolved due date | Canonical TaskOccurrence/cursor from engine chronology | Yes, as `due_on` and possibly `active_occurrence_due_on` | Re-derive; stale stored dates are repaired later and cannot drive authority. |
| Current occurrence identity | Canonical occurrence chronology plus validated History metadata | Yes, if clearly labeled a projection | A conflicting cache is a data-quality finding; identity/chronology rules win. |
| Current completion streak | Effective timeline chronology | Yes, for read performance | Recompute from canonical effective days; never trust a stale cached streak. |
| Current Missed streak | Effective timeline chronology including calculated Missed | Yes, for read performance | Recompute from effective chronology; do not manufacture explicit History to support the cache. |
| Overdue state | TaskConfiguration + Explicit History + LogicalDayContext | Yes, as a visible status/projection | Canonical derivation wins; a stale `missed`, `pending`, or `not_due` value is compatibility data. |
| Calendar day state | EffectiveTimelineDay for the requested logical date | Yes, as a read cache if needed | Rebuild from the same engine; Calendar cache cannot override explicit History or schedule facts. |

`TARGET` — A projection conflict should produce a canonical result plus, where useful, a bounded data-quality signal. Phase 1A does not define the repair algorithm. It defines that canonical derivation wins and projection repair is a later concern.

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

`TARGET` — Precedence is layered because lifecycle and date-local History answer different questions:

1. **Irreversible lifecycle facts, where applicable.** Permanent completion, trash, or archive facts control current lifecycle eligibility and visibility. They do not erase historical History.
2. **Explicit History for the requested logical date.** A valid explicit event overrides calculated state for that date. Its outcome is authoritative even when a Task projection is stale.
3. **Canonical TaskConfiguration and RecurrenceAnchor.** Configuration determines schedule membership and recurrence structure where no explicit override applies.
4. **LogicalDayContext.** Timezone and rollover boundary determine the logical date and the current evaluation window.
5. **Canonical derived state.** The engine derives occurrence chronology, current active schedule state, Calendar facts, and current streak facts from the higher-priority inputs.
6. **Persisted projections/caches.** `Task.status`, `due_on`, active occurrence fields, streak caches, and overdue flags may accelerate reads but cannot override derivation.
7. **Stale compatibility metadata.** Conflicting legacy booleans, missing/invalid identity, old automatic-row conventions, and other denormalized metadata are evidence or diagnostics only until validated against stronger facts.

This hierarchy means lifecycle can control whether a Task is currently schedulable while explicit History still controls what happened on a historical logical date. No lower layer may silently rewrite a higher layer.

## Part 11: Core invariants

`TARGET` — The Phase 1A core model must preserve these invariants:

**INVARIANT 1 — One explicit event per date.** There is one authoritative Explicit History outcome per Task per logical date.

**INVARIANT 2 — Explicit History overrides calculation.** An explicit History event is authoritative for its logical date; clearing it returns that date to calculated authority.

**INVARIANT 3 — Calculated Missed is non-persistent by passage of time.** Time passing may calculate Missed state, but must not create ordinary explicit History merely because time passed.

**INVARIANT 4 — One occurrence, one identity.** Every recurrence obligation has one canonical occurrence identity.

**INVARIANT 5 — One resolution consumes at most one occurrence.** A successful or otherwise resolution-eligible event can resolve no more than one occurrence.

**INVARIANT 6 — No accidental duplicate consumption.** Multiple successful History events cannot consume the same occurrence more than once merely because they share stale or repeated metadata.

**INVARIANT 7 — One active-status derivation.** Current visible active status has one canonical derivation from configuration, explicit History, and logical-day context.

**INVARIANT 8 — Projections do not override authority.** Stored status, due dates, active fields, streaks, and overdue flags cannot override canonical derived state when they disagree.

**INVARIANT 9 — Configuration changes preserve History.** Recurrence configuration changes never rewrite explicit History.

**INVARIANT 10 — Logical day is the time boundary.** Canonical Task state uses the user-scoped logical day defined by timezone and rollover boundary, not raw midnight or arbitrary render time.

**INVARIANT 11 — Calendar and current state share a model.** Calendar state and current Task state may represent different logical dates, but both derive from the same configuration, History, occurrence, and logical-day model.

**INVARIANT 12 — Current streaks and historical statistics are separate.** Current completion/Missed streaks derive from effective chronology; historical statistics derive from their defined historical source and must not be conflated.

**INVARIANT 13 — Due and event dates remain distinct.** `logicalDate` is the date of the explicit event; `occurrenceDueOn` is the due date of the referenced obligation. Either may differ from the other.

**INVARIANT 14 — Lifecycle does not erase History.** Lifecycle transitions affect current eligibility and visibility but do not rewrite or silently delete explicit historical facts.

**INVARIANT 15 — Missing metadata is not automatic invalidation.** Missing or stale occurrence metadata is classified as a data-quality condition; otherwise trustworthy explicit outcome/date facts remain usable.

## Part 12: Canonical Stored vs Derived Model

`TARGET` — The following table is the Phase 1A summary. “Existing legacy representation” is a CURRENT observation cited to Phase 0; the other columns describe the target model.

| Concept | Canonical category | Source of truth | May be persisted as projection? | Existing legacy representation | Future concern |
|---|---|---|---|---|---|
| Task lifecycle | Canonical stored lifecycle fact | Lifecycle repository/Task configuration boundary | Not merely as a cache; lifecycle is authoritative | `status`, `trashed_at`, `completed_at`, and archive-like rules are split across TaskApp/CRUD and engine lifecycle inputs. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Define Complete versus Archive versus Trash transitions and visibility precedence in Phase 1B. |
| recurrence configuration | Canonical stored configuration fact | User-controlled Task configuration | Yes, because it is itself stored configuration | Repeat fields are consumed by both engine and legacy recurrence families. [Phase 0 § 3](task-state-phase-0-inventory.md#3-recurrence-implementations-and-authority-graph) | Converge all recurrence readers on one kernel. |
| recurrence anchor | Canonical schedule value/fact | Stable schedule-start/anchor information plus approved legacy inference | Yes, if the stored representation is stable and versioned | No dedicated persisted recurrence cursor/anchor is present in the current Task shape; `due_on` is overloaded. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Establish recoverability and migration policy before exact replay. |
| occurrence identity | Canonical occurrence fact | Actual scheduled occurrence plus validated History metadata | Yes, as a clearly labeled cache or event metadata | `occurrence_key`, `occurrence_due_on`, `active_occurrence_due_on`, and On-Time identity coexist with missing/contradictory cases. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Define duplicate detection and legacy reconstruction. |
| current occurrence | Derived canonical result | Engine chronology over configuration, History, and logical day | Yes, through `due_on`/active fields as projections | `due_on` and `active_occurrence_due_on` are used by multiple competing paths. [Phase 0 § 2](task-state-phase-0-inventory.md#2-current-status-authorities) | Define advancement and unresolved-chain behavior in Phase 1B. |
| due_on | Persisted cursor projection | Current/next unresolved occurrence from the engine | Yes; it is the intended projection | `due_on` is currently a schedule cursor, one-off due date, legacy status input, and recurrence anchor in different paths. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Remove anchor/date/status ambiguity. |
| explicit History outcome | Canonical persisted historical fact | ExplicitHistoryEvent for Task/logical date | Yes, because it is the fact itself | Direct single/batch upserts and deletes coexist with automatic Missed writes. [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) | Put all explicit writes behind one command/repository boundary. |
| calculated Missed | Canonical derived state | EffectiveTimelineDay from schedule, History, and logical day | A display/cache projection is acceptable; ordinary History persistence is not | Effective Timeline calculates it, while legacy/rollover paths can persist automatic Missed rows. [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) | Classify and migrate legacy automatic rows. |
| current active status | Canonical derived state, with optional workflow overlay | EffectiveTaskState | Yes, as visible `Task.status` projection | Engine read projection coexists with legacy cockpit, stored fallbacks, live resolver, and direct active tracking. [Phase 0 § 2](task-state-phase-0-inventory.md#2-current-status-authorities) | Converge every consumer on one projection. |
| Calendar day state | Canonical derived timeline fact | EffectiveTimelineDay for requested logical date | Yes, as a rebuildable read cache | Calendar uses Effective Timeline but still builds a legacy due-date set in parallel. [Phase 0 § 8](task-state-phase-0-inventory.md#8-ui-consumption-matrix) | Remove parallel Calendar derivation after parity. |
| current completion streak | Canonical derived current fact | Effective chronology | Yes, as a cache | Effective Timeline owns it when available; saved-stat fallbacks remain. [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) | Preserve separation from best/historical streak statistics. |
| current Missed streak | Canonical derived current fact | Effective chronology including calculated Missed | Yes, as a cache | Effective Timeline and saved-row legacy calculations coexist. [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) | Keep it mutually exclusive with current completion streak. |
| historical stats | Derived/report fact over explicit historical source | Defined saved-History statistics model | Yes, as a cache with a known revision/source | Saved-row stats and Effective Timeline summaries are consumed by overlapping surfaces. [Phase 0 § 5](task-state-phase-0-inventory.md#5-history-authority-map) | Define each statistic’s source and avoid using it for current status. |
| active_occurrence_due_on | Projection/cache or legacy compatibility field | Engine-derived current occurrence | Yes, temporarily, if clearly non-authoritative | Used as active anchor/cache and stale In Progress input. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Stop using it as an independent occurrence authority. |
| active_status_logical_date | In-progress-only workflow tracking or legacy field | Persisted workflow fact only when In Progress is meaningful | Yes, while that workflow exists | Direct active tracking and stale In Progress rollover use it. [Phase 0 § 6](task-state-phase-0-inventory.md#6-rollover-and-logical-day-authority) | Define cross-day In Progress semantics; otherwise remove its general-state meaning. |
| counted_as_due_occurrence | Derived/compatibility metadata | Outcome + occurrence + chronology + provenance | Yes, for compatibility/statistics | Stored History boolean used by legacy due/streak/reward helpers. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Make it repairable and non-authoritative. |
| was_completed | Derived/compatibility metadata | Outcome/event semantics and lifecycle facts | Yes, for compatibility/statistics | Stored History boolean participates in legacy interpretation. [Phase 0 § 7](task-state-phase-0-inventory.md#7-stored-versus-derived-task-state) | Replace ambiguous boolean meaning with explicit outcome/lifecycle semantics. |

## Part 13: Questions Deferred to Phase 1B

Phase 1A does not define transition algorithms. The following ten transition questions are deferred:

1. What exact occurrence does an early completion consume, and how does the next cursor advance?
2. What exact occurrence does a late completion consume, including a completion after one or more overdue dates?
3. How do Daily and interval recurrence advance and rebase after each resolution?
4. How does a Missed overdue chain behave, including whether it remains continuously overdue and which dates are virtual versus explicit?
5. What are the exact Delay semantics for due date, occurrence identity, explicit History, Calendar, and streaks?
6. How do Complete, Archive, Trash, and permanently complete lifecycle transitions interact with explicit Complete History?
7. What is the exact No Repeat transition after Done, Missed, Delayed, or Complete?
8. Which rollover actions are allowed, idempotent, and authoritative when the logical day changes?
9. What is the reward eligibility boundary for explicit outcomes, calculated Missed, rollover, and terminal completion?
10. How do monthly and selected-weekday schedules advance when configuration, anchor, and current cursor disagree?

### Core-model validity gates

These are not transition questions and must be answered before implementing the model if the current data cannot satisfy them:

- Is a stable recurrence anchor recoverable for every supported legacy recurrence type, or is a conservative migration/data-quality state required?
- Can any supported Task generate more than one obligation on one due date? If yes, the occurrence identity must include a deterministic same-day discriminator.

## Part 14: Phase 1A acceptance criteria

Another engineer should be able to answer these without guessing:

1. **What is a Task occurrence?** One recurrence obligation generated by TaskConfiguration, with its own due date, identity, recurrence source, resolution state, resolution date, and resolution outcome.
2. **What uniquely identifies it?** A deterministic identity derived from the actual occurrence, preferably `task:{taskId}:occurrence:{occurrenceDueOn}` while one Task has at most one obligation per due date; add a deterministic ordinal/sequence if that assumption is false.
3. **What does `due_on` mean?** The current or next unresolved occurrence date for an active scheduled Task; a cursor projection, not an anchor, history date, last-completed date, Calendar date, or generic status date.
4. **What is the recurrence anchor?** A stable schedule basis used for membership and alignment, separate from the moving current occurrence cursor.
5. **What is explicit History?** One persisted explicit outcome per Task/logical date, replaceable by editing and removable by clearing, with optional validated occurrence metadata and provenance.
6. **What is calculated state?** The engine-derived effective timeline, current occurrence, active schedule state, Calendar facts, overdue/Missed state, and current streaks from configuration + explicit History + logical day.
7. **Which statuses should be derived?** Pending/Open, Missed, Upcoming, Not Due, current active status, current unresolved occurrence, and current streak facts. Lifecycle and any truly durable workflow/session fact remain stored.
8. **Which Task states genuinely require persistence?** Lifecycle facts and only workflow facts that must survive the relevant boundary, such as In Progress if cross-session restoration requires it. Derived schedule state does not require authoritative persistence.
9. **Which existing DB fields are projections rather than authority?** `Task.status`, `due_on`, `active_occurrence_due_on`, current streak/overdue values, `counted_as_due_occurrence`, and `was_completed`; `active_status_logical_date` is in-progress-only tracking or legacy compatibility, not general Task state.
10. **When stored fields disagree with History/configuration, which source wins?** Applicable lifecycle facts govern current lifecycle; explicit History governs its logical date; configuration and anchor govern schedule membership; logical day scopes evaluation; canonical derived state wins over projections; stale compatibility metadata is evidence only.

## Phase 1A handoff

`TARGET` — The core model is ready for a later transition phase only if the two validity gates above are resolved and the implementation plan preserves the following boundary:

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
                         ↓
       active status / Calendar / current streak projections
```

`CURRENT` — The branch does not yet have this single fully converged path. Phase 0 documents the remaining competing readers, recurrence calculators, mutation entry paths, direct persistence boundaries, and rollover alternatives. See [Phase 0 § 14](task-state-phase-0-inventory.md#14-dependency-map) and [§ 15](task-state-phase-0-inventory.md#15-top-architectural-risks).
