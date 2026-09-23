# Phase 1E: Current Task Read Projection Architecture

Status: locked architecture direction; 7.15.14 persistence protocol authored
Ticket: ADHDice 7.15.14 projection freshness correction and durable rebuild protocol
Scope: ordinary current Task reads, projection persistence, freshness, invalidation,
repair, and migration sequencing
Implementation status: source-only persistence protocol and un wired rebuild
helper; no runtime read/write cutover, backfill, Edge Function deployment, or
live SQL application is authorized here

Required inputs: [`TASK_STATE_ENGINE.md`](../TASK_STATE_ENGINE.md),
[`WORKSPACE_LOADING_ARCHITECTURE.md`](../WORKSPACE_LOADING_ARCHITECTURE.md),
[`TASKAPP_ARCHITECTURE.md`](../TASKAPP_ARCHITECTURE.md),
[Phase 1C](task-state-phase-1c-command-read-output-contract.md),
and [Phase 1D-1](task-state-phase-1d1-persistence-storage-contract.md).

## Decision

Canonical facts remain the only evidence and rebuild source. Ordinary current
Task surfaces will consume a compact, durable, rebuildable, revision-fenced
current projection instead of requiring a workspace-wide canonical History
snapshot or full chronological replay.

The projection is a read model, not a new Task State authority. The existing
canonical evaluator still defines the meaning of Active Status, effective
obligations, occurrence identity, streaks, lifecycle, workflow, rewards, and
Calendar history. A projection is valid only when its recorded source fences
prove that it was derived from the applicable canonical state and context.

The conceptual projection record is called `task_current_projection` below. It
may be implemented as a dedicated physical record or an equivalent
owner-scoped projection namespace. This document does not choose SQL, table
names, generated types, or deployment mechanics.

This decision does not change product semantics. It changes which already
defined result is transported and read during normal workspace use.

## 7.15.14 persistence correction

The earlier strict rule that a canonical command must calculate and write a
fully valid current projection inside the canonical command transaction is
superseded. The safe protocol is:

1. A semantic canonical command atomically marks an existing affected
   projection `repair_required`; it never fabricates a row.
2. Canonical Task/History and related facts commit normally. Projection
   availability never decides whether valid canonical facts may commit.
3. A trusted server immediately rebuilds the one affected entity with the
   TypeScript canonical calculator.
4. A service-role-only writer stores only a `valid` candidate after proving
   Task, entity History, sync epoch, logical-day, version, identity, and
   monotonic candidate fences.
5. A rebuild failure leaves canonical truth committed and the projection stale,
   `repair_required`, or absent. Consumers must not accept that row as current;
   entity-scoped retry/repair is the recovery path.

This separation is required because the projection calculator is TypeScript
canonical-engine composition, while SQL is the authority for final History
ledger sequence/identity/timestamps. Duplicating Task State, recurrence, or
streak calculation in PL/pgSQL is prohibited. The projection is a rebuildable
read model and must never become a canonical write-availability dependency.

## Current problem

The current 7.15 source still uses `useWorkspaceData` to hydrate the complete
canonical History snapshot for all Tasks as secondary startup work. The shared
Active Status resolver and current streak-summary path then use those History
arrays as ordinary inputs. The existing `task-history-sync-v1` IndexedDB cache,
sync watermark, and revision-fenced delta RPC reduce repeated transport, but
they still transport and retain the entire History fact set for current Task
reads.

That shape makes historical reconstruction scale with a user's lifetime data.
It also couples current Task readiness and rollover coordination to a full
History readiness gate. A logical-day transition or one History event can
therefore cause more historical work than the affected Task requires.

The existing engine contracts are sufficient for a safe projection boundary:
canonical Task rows already carry canonical revisions and lifecycle/workflow
facts; schedule boundaries, occurrences, History facts, overrides, command
operations, behavior selections, and logical-day settings are distinct inputs;
and the engine already returns current status, effective schedule facts, and
streak facts. No locked Task semantic must be reopened to materialize those
results.

## Target data flow

```text
Canonical Task entity/configuration       Profile logical-day context
Canonical History, occurrences,           Effective-dated behavior policy
boundaries, overrides, commands, rewards
                    │
                    ▼
        Canonical read/evaluator and trusted command boundary
                    │
        ┌───────────┴────────────────┐
        │                            │
        ▼                            ▼
Canonical facts                task_current_projection
remain evidence               current status, due, occurrence,
and rebuild source             handled dates, and current streaks
        │                            │
        │                            ├─ source revisions/fingerprints
        │                            └─ projected logical date/version
        │
        ├───────────────┐
        ▼               ▼
Historical readers    Ordinary current Task surfaces
lazy/bounded/on       Table, List, Home, filters, counts,
demand                editor summaries, and current overlays
        │
        ▼
Explicit repair/rebuild only when a projection is missing,
stale, invalid, contradicted, or explicitly requested
```

Normal startup loads canonical Task entity rows, valid current projections,
profile context, and each independently required domain. It does not wait for
all canonical History. A projection miss is an entity-scoped readiness or
repair condition, not permission to hydrate the user's full History.

## Current versus historical data classification

| Data | Classification | Normal current read | Historical/repair read |
| --- | --- | --- | --- |
| Task identity, content, hierarchy, lifecycle, container, and workflow facts | Canonical Task entity facts | Required for row identity and lifecycle labels | Required for rebuild and command validation |
| Recurrence configuration and schedule boundaries | Canonical schedule facts | Current boundary/frontier only, through the projection or a bounded source read | Full boundary chain when rebuilding chronology |
| Occurrence identity and effective-date overrides | Canonical occurrence facts | Active occurrence fields from the projection | Detailed occurrences and origin groups on demand |
| Explicit History facts | Canonical evidence | Only the current projection result for ordinary current surfaces | Selected date/range, modal, reports, and rebuild input |
| Command operations and replay evidence | Canonical command evidence | Mutation reconciliation and repair fencing only | Command ledger inspection and explicit reconciliation |
| Reward/achievement evidence | Downstream durable evidence | Aggregate/result projections where needed | Detailed entitlement, grant, claim, or evaluation history on demand |
| `task_current_projection` | Rebuildable current read model | Primary source for ordinary current Task reads when valid | Rebuilt from canonical sources; never a fact source |
| IndexedDB History snapshot and delta ledger | Canonical-fact transport/cache | Not a current-projection readiness requirement | Reused by History views or explicit repair when valid |
| Stats, achievements, and reports | Aggregate/projection consumers | Load their own aggregate or bounded source contract | Request detailed evidence only for drill-down or repair |

The projection may summarize historical facts, but it does not become a
historical record. It cannot replace the History modal, old boundary inspection,
command-ledger inspection, detailed occurrence views, or audit/report evidence.

## Ownership: Task entity versus current projection

The canonical Task entity owns stable identity and current canonical axes that
must survive projection deletion. It does not become a bag of derived current
status and streak fields.

| Owner | Values | Rule |
| --- | --- | --- |
| Canonical Task entity | `entity_id`, owner, `entity_kind`, parent identity, content/configuration metadata, terminal lifecycle, container state, restore evidence, workflow state/facts, `canonical_revision`, canonical timestamps | Directly addressable canonical facts. A projection cannot replace or downgrade them. |
| Canonical schedule/occurrence/History stores | Schedule boundaries, stable recurrence anchor, occurrence origins, effective-date overrides, explicit outcomes, logical-date and provenance identity | Rebuild source. They are not inferred from current projection fields. |
| Profile and behavior authorities | Timezone, day-start, monotonic logical-day settings revision, effective-dated behavior selections and policy revisions | Current context and policy source. Browser/local settings are not authority. |
| Dedicated current projection | Current display status, current effective due, next due, active occurrence summary, handled/last-handled/last-Done values, current positive/Missed streaks, source fences, projection diagnostics/version | Replaceable read model. It is never a command input authority or History source. |
| Compatibility Task columns during migration | Stored `status`, `due_on`, active compatibility fields, completion display fields, projection metadata | May be dual-written or read by legacy adapters only until cutover. They cannot be a fallback current-state calculator after cutover. |

`Task.status`, `due_on`, `active_occurrence_due_on`, and
`active_status_logical_date` therefore remain compatibility fields where the
existing schema requires them. The target ordinary read path reads the named
projection contract, not those columns as independent truth.

## Current projection field contract

The minimum record is conceptually:

```ts
type CurrentTaskProjection = {
  userId: string;
  entityId: string;
  entityKind: "parent" | "step" | "substep";

  displayStatus: "pending" | "in_progress" | "done" | "did_my_best"
    | "missed" | "delayed" | "upcoming" | "not_due" | "unscheduled" | "complete"
    | "archived" | "trashed";
  currentEffectiveDueOn: string | null;
  nextDueOn: string | null;

  activeOccurrenceId: string | null;
  activeOccurrenceStatus: "none" | "open" | "overdue" | "delayed"
    | "handled" | "terminated";
  handledCurrentLogicalDay: boolean;
  lastHandledLogicalDate: string | null;
  lastHandledAt: string | null;
  lastDoneLogicalDate: string | null;
  lastDoneAt: string | null;
  currentPositiveStreak: number;
  currentMissedStreak: number;

  canonicalTaskRevision: number;
  historySyncEpoch: string;
  historySourceRevision: number;
  historySourceFingerprint: string;
  scheduleBoundaryRevision: string;
  behaviorPolicyRevision: string;
  logicalDaySettingsRevision: number;
  projectedLogicalDate: string;
  projectionSchemaVersion: string;
  projectionAlgorithmVersion: string;
  sourceFingerprint: string;
  validity: "valid" | "repair_required" | "unavailable";
  updatedAt: string;
};
```

Field semantics are defined by the canonical engine result, not by the names
alone:

- `displayStatus` is the one current status projection used by ordinary Task
  surfaces. Lifecycle/container status remains distinguishable from schedule
  status even if a UI combines them into one label.
- `currentEffectiveDueOn` is the effective date of the current unresolved or
  applicable obligation. `nextDueOn` is the next future obligation after the
  current resolution, or null when no next obligation exists. Neither is a
  recurrence anchor or occurrence identity.
- `activeOccurrenceId` and `activeOccurrenceStatus` summarize the current
  occurrence. A delayed occurrence retains its origin identity; a same-date
  merge retains all origins in the rebuild input even when the compact record
  exposes one active identity.
- `handledCurrentLogicalDay`, `lastHandled*`, and `lastDone*` are copies of
  canonical chronology results. “Handled” and “Done” use the existing command
  and engine outcome classifications; a projection writer must not invent a
  new outcome mapping.
- The two streak fields are current effective-chronology results. They are not
  counts of rows in the projection, nor counters that can be advanced merely
  because time passed.
- `historySourceRevision` is the latest entity-scoped History ledger revision
  included in the projection. The user-wide History `current_revision` and
  `sync_epoch` remain transport fences; the global revision alone cannot prove
  that an unrelated entity's projection is stale.
- `scheduleBoundaryRevision` and `behaviorPolicyRevision` are stable source
  identities/digests for every schedule and effective behavior segment that
  can affect the current result. Their physical representation is a later
  storage decision.
- `sourceFingerprint` covers all source identities and relevant canonical
  values. It is a diagnostic and optimistic-concurrency proof, not a reason to
  bypass narrower fences.

The projection may carry additional explanation or aggregate fields later, but
no consumer may require a full History array to render an ordinary current Task
row after cutover.

## 7.15.13 pure calculator seam

`src/lib/task-current-projection.ts` is the write-free calculator seam for the
physical 7.15.12 row contract. `buildCurrentTaskProjection()` accepts one
canonical `CanonicalTaskStateReadModel`, the existing behavior-policy context,
an entity-scoped History ledger frontier, the projected timestamp, and an
optional effective tracking-exclusion result for child entities. It maps the
read model through `buildCanonicalTaskStateEngineInput()` and the existing
`evaluateTaskState()` evaluator; it does not call Supabase, write rows, create
History, or mutate its inputs.

Field authorities remain explicit:

- `display_status`, current effective due, next due, and current-day handled
  state come from canonical lifecycle plus the existing Task State evaluator.
- Last Handled uses `buildTaskHistoryLastHandledSummaryMap()` over this entity's
  canonical History, active Calendar overrides, and command operations. Last
  Done and both streaks use the existing History/timeline summary authority;
  effective tracking exclusion still zeros both streaks.
- An occurrence ID is emitted only from a matching materialized canonical
  occurrence row. Date-derived engine identities are never persisted as IDs.
  `none` means no materialized current row; `open` means unresolved/current,
  `overdue` means an active Missed obligation, `delayed` means a delayed
  current obligation, `handled` means a resolved handled occurrence, and
  `terminated` means terminal/lifecycle completion.

Schedule, behavior, and History fences are semantic SHA-256 digests in the
exact `sha256:<64 lowercase hex>` form. Boundary/occurrence/override arrays
and effective behavior selections are stably ordered before hashing. Source
fingerprints include authoritative result values, so a timestamp changes the
source only when that timestamp is itself exposed as the current Last Handled
or Last Done result. Invalid authority, malformed fences, ambiguous occurrence
state, and unproven child tracking exclusion fail closed as `unavailable` or
`repair_required`.

`test/task-current-projection-7-15-13.test.ts` is the shadow parity harness. It
compares the calculator with the current canonical Active Status, effective
timeline, Last Handled/Last Done, and streak authorities across lifecycle,
recurrence, occurrence, History correction, Calendar override, policy-boundary,
Custom, hierarchy, exclusion, and logical-day fixtures. The harness is source
only: no projection rows are written and `add_task_current_projection_7_15_12.sql`
is not applied.

## Physical storage contract (7.15.12 foundation)

The additive source contract is `public.adhdice_task_current_projections` in
`supabase/add_task_current_projection_7_15_12.sql`. It has one row per
owner/entity, keyed by `(user_id, entity_id)`, with the following exact groups:

- Identity: `user_id uuid`, `entity_id uuid`, and `entity_kind text` constrained
  to `parent`, `step`, or `substep`.
- Current result: `display_status text`, `current_effective_due_on date`,
  `next_due_on date`, `active_occurrence_id uuid`,
  `active_occurrence_status text`, `handled_current_logical_day boolean`,
  last-handled/last-Done logical dates and timestamps, and non-negative integer
  positive/Missed streaks.
- Freshness: `canonical_task_revision bigint`, `history_sync_epoch uuid`,
  `history_source_revision bigint`, SHA-256 `history_source_fingerprint`,
  SHA-256 `schedule_boundary_revision`, SHA-256
  `behavior_policy_revision`, `logical_day_settings_revision bigint`,
  `projected_logical_date date`, fixed schema/algorithm version strings, and
  SHA-256 `source_fingerprint`.
- State: `validity text` constrained to `valid`, `repair_required`, or
  `unavailable`, plus `created_at` and `updated_at`. Detailed diagnostics stay
  in rebuild/operator logs; no canonical fact is mutated to carry diagnostics.

### Physical fence decisions

- **History:** reuse `adhdice_task_history_changes`. Its existing global
  `sequence` remains the transport watermark and `sync_epoch` remains the
  user-wide transport fence. The new `(user_id, entity_id, sequence DESC)`
  index makes the latest affected sequence for one entity a bounded lookup.
  `history_source_revision` stores that sequence, or zero when the entity has
  no ledger row. `history_source_fingerprint` is a deterministic SHA-256 hash
  of the latest ledger frontier tuple (owner, entity, sequence, fact identity,
  logical date, operation, and row revision), with a deterministic empty tuple
  for zero-history entities. No per-entity History table is needed.
- **Schedule:** `schedule_boundary_revision` is a deterministic SHA-256
  fingerprint of the applicable existing schedule-boundary chain, built from
  boundary IDs/sequences/revisions and recurrence source fingerprints. It does
  not create a schedule authority or use timestamps as a revision.
- **Behavior:** `behavior_policy_revision` is a deterministic SHA-256
  fingerprint of the effective-dated Task behavior selections, applicable
  default/custom profile revisions, and named Custom ruleset identity/policy
  fields for the projected logical date. Semantic values and effective dates,
  not `updated_at`, define the fence.
- **Logical day:** `logical_day_settings_revision` reuses the authoritative
  monotonic `adhdice_user_profiles.settings_revision`, which advances only
  when timezone or day-start changes.

The projection has an owner-safe composite foreign key to
`adhdice_clean_tasks(user_id, id)` with `ON DELETE CASCADE`: deleting a
canonical Task removes its dependent read row, while deleting a projection can
never delete the Task. The entity-kind check is a projection contract; trusted
writers must also verify it against the canonical Task row.

RLS enables authenticated owner-scoped `SELECT` using
`((select auth.uid()) = user_id)`. `public`, `anon`, and `authenticated` have
no direct write grants; `service_role` is the reserved trusted-writer grant
for a future command/rebuild boundary. The only foundation indexes are the
owner/entity primary key, the reconciliation candidate index on
`(user_id, validity, projected_logical_date, entity_id)`, and the History
ledger entity-frontier index described above. Due/frontier indexes are deferred
until a reconciler query proves they are needed.

This foundation does not create rows, backfill data, change command or
Realtime writes, alter workspace loading, remove full History loading, or
change any current consumer.

## Revision and freshness contract

A current projection is consumable only when all applicable checks pass for the
same owner and entity:

1. `canonicalTaskRevision` equals the current canonical Task entity revision.
2. `historySyncEpoch` equals the current user History sync epoch.
3. The entity-scoped History source revision and fingerprint prove that every
   History fact affecting the entity is included. A higher unrelated global
   History revision does not invalidate every entity, but the reader must have
   an entity-scoped proof before accepting the record.
4. `scheduleBoundaryRevision` matches the current forward schedule boundary
   chain and relevant occurrence/effective-date source identity.
5. `behaviorPolicyRevision` matches the effective-dated selection and policy
   segments active for the projected logical date.
6. `logicalDaySettingsRevision` matches the profile's authoritative timezone
   and day-start settings.
7. `projectedLogicalDate` is current, or the time-reconciliation contract has
   advanced the record through every necessary logical-day frontier without
   requiring full historical replay.
8. `projectionSchemaVersion` and `projectionAlgorithmVersion` are supported
   exactly by the reader.
9. `validity` is `valid`, and no source diagnostic marks the entity ambiguous,
   contradictory, or incomplete.

Any failed check makes the record unavailable for ordinary current truth. The
reader may request an entity-scoped reconciliation; it must not silently fall
back to raw Task status, a selected History window, or a second recurrence
calculator.

The existing `task-history-sync-v1` protocol remains useful here, but it is not
by itself a projection-validity protocol. Its `sync_epoch` and user-wide
`current_revision` fence canonical History transport. The projection contract
additionally requires an entity-scoped affected revision or equivalent
fingerprint proof.

## Time passage and logical-day reconciliation

Time passage changes the logical-day context; it is not a canonical Task event.
The target behavior is:

- A logical-day tick advances a lightweight invalidation generation and marks
  only projections whose temporal frontier can change as reconciliation
  candidates.
- Candidate selection uses projection metadata such as current/effective due,
  next due, unresolved occurrence, policy boundary, and last projected logical
  date. It may also use a durable dependency index later. It does not fetch or
  replay every user's History.
- A temporal reconciler can advance a valid projection from its prior
  projection checkpoint using bounded schedule/policy facts. It may update
  `handledCurrentLogicalDay`, streak fields, status, and due fields for that
  entity only.
- If the checkpoint, source fence, or bounded interval is not sufficient, the
  reconciler performs an explicit entity-scoped rebuild from canonical facts or
  returns a diagnostic. It never manufactures History, occurrence resolution,
  reward entitlement, or achievement evidence because a day closed.
- A day transition can produce zero writes. Durable projection writes are
  needed only for affected entities or a later read/repair, not as a reason for
  a workspace-wide reload.

The projection's logical date is therefore a strict freshness input for current
status and streak consumption, while the reconciliation work remains narrow and
rebuildable.

## Command and update model

Every successful canonical Task command returns the authoritative after-state.
For a semantic mutation, the trusted command transaction:

1. validates the command identity and expected canonical/fact revisions;
2. marks the existing owner/entity projection `repair_required` without
   creating a row;
3. writes the canonical Task, History, occurrence, boundary, override,
   lifecycle, workflow, and command facts required by the command; and
4. commits canonical truth without waiting for projection reconstruction.

The immediate post-commit rebuild is a separate trusted server operation. It
loads one entity, composes the existing TypeScript canonical engine, and calls
the revision-fenced writer. The writer is allow-listed, valid-only,
idempotent, service-role-only, and rejects a stale candidate rather than
overwriting a newer row. A semantic no-op and a replay do not create needless
invalidation. Projection failure is retryable and cannot roll back canonical
facts or modify them during repair.

Reward and achievement intents remain downstream of the canonical commit.
Projection persistence does not grant rewards, remove rewards, create History,
resolve occurrences, or advance recurrence outside the command result.

Metadata-only Task/list/folder commands update only their own canonical or
presentation domain unless their declared source dependency changes current
Task state. List and Folder changes do not trigger Task projection rebuilds.

## Behavior-policy changes

An effective-dated behavior change preserves all historical facts and changes
only the current projection and any other explicitly named current aggregate
that depends on the new policy segment.

The behavior authority publishes the affected Task/entity set and the effective
logical date/revision. Each affected projection is rebuilt once with:

- the canonical Task revision;
- the complete behavior-selection/policy source identity relevant to the
  current logical date;
- the current schedule/occurrence source fences; and
- the same canonical evaluator used for normal reads.

The reconciler may update current Missed-streak and Active Status projections
at the policy boundary. It must not rewrite historical History, reinterpret old
Calendar facts, or force every current read to recalculate from the full
History snapshot. If the affected set or policy source cannot be proven, the
projection remains `repair_required` and the reader reports a diagnostic.

## Rebuild and repair model

Rebuild is an explicit, idempotent operation with a repair command identity and
source kind. It can be started by migration, a stale/missing projection read,
an explicit Retry, post-mutation reconciliation, Realtime, or an operator
repair path authorized separately.

A rebuild:

- reads the canonical Task entity and the smallest canonical source range that
  can prove the current result;
- reads the owner's History sync epoch and only the affected entity's latest
  History ledger frontier; the current helper loads one entity's canonical
  History and boundary/occurrence chain through the existing scoped read path;
- runs the canonical evaluator and writes only the current projection, its
  source fences, and diagnostic metadata;
- is fenced by the Task/fact revisions and treats a stale writer rejection as
  retryable; and
- is safe to repeat and safe to abandon without changing canonical truth.

The 7.15.14 TypeScript helper is authored but not imported by live command
orchestration. It never requests whole-workspace History or an unfiltered
whole-user command-operation read, and it never falls back to raw Task status.

Repair must never create, delete, rewrite, or reclassify canonical History;
create or remove occurrence facts; change schedule boundaries; alter command
operations; grant/revoke rewards; or emit achievement evidence. A canonical
repair is a separate command only when a human or authorized workflow is
actually correcting canonical facts; that is not projection repair.

## Realtime and invalidation model

Realtime is an invalidation and reconciliation hint, not proof of freshness and
not permission for a broad workspace reload.

| Event | Invalidation target | Required action |
| --- | --- | --- |
| Task entity or current projection change | One entity | Fence the local record, reconcile that entity, and publish the committed projection. |
| Canonical History event | The affected entity from the event/ledger | Reconcile that entity; advance History transport through the fenced sync protocol when historical cache consumers need it. |
| Schedule boundary, occurrence, or Calendar override | The owning entity | Rebuild that entity from the new source revision. |
| Behavior selection/policy change | Entities using the changed Task Type/ruleset, from the affected set | Rebuild each affected entity once at the effective logical date. |
| Profile timezone/day-start/settings change | The user's current-projection context | Invalidate context-dependent records and reconcile entities as consumed; do not replay full History solely for the settings change. |
| List membership, list container, or Folder change | That list/Folder domain | Refresh only list/Folder data and their presentation indexes. Do not invalidate Task State projections unless a declared dependency says so. |
| Realtime disconnect or uncertain payload | Affected domain, conservatively | Mark the domain uncertain and use the normal revision-fenced read/reconciliation path. Never treat a missing event as proof that all data changed. |

The browser may keep a local projection cache, but ownership and validity come
from the canonical source fences. Realtime does not advance the History sync
watermark or projection revision by itself.

## Historical reads and aggregate consumers

History is a lazy historical domain after consumer cutover:

- the History modal requests the selected Task/date range and explicit rows on
  demand;
- old schedule boundaries, command operations, and detailed occurrence origins
  are loaded only for the relevant inspection, reconciliation, or repair;
- full entity History is allowed for an explicit rebuild, parity run, migration,
  or repair, but not as an ordinary workspace readiness prerequisite; and
- canonical History transport/cache/delta infrastructure remains available for
  those callers and must continue to fail closed on invalid or raced state.

Stats, Achievements, and reporting consume named aggregates or projections with
their own freshness contracts. Their need for detailed historical evidence is
not a reason to hydrate complete History into every browser workspace. A
drill-down can request the evidence range it needs and identify that source in
its result.

## Migration sequence

The migration preserves current semantics by keeping the existing full-History
read as a shadow/reference path until parity gates pass. The phases are:

1. **Source contract.** Define the projection result, source-fence digest,
   entity-scoped History affected revision, temporal-frontier rules, diagnostic
   states, and consumer readiness states. Reuse the canonical evaluator and
   existing History sync/cache/delta transport; do not add a second recurrence
   engine.
2. **Schema and persistence.** Add the owner-scoped current-projection storage,
   source-fence metadata, entity-scoped invalidation/revision lookup, indexes,
   ownership policy, and repair-operation identity in a separately reviewed
   schema ticket. Existing canonical facts remain unchanged and source-only
   migrations remain unapplied until explicitly authorized.
3. **Shadow parity.** Build projections without changing consumers. Compare
   current status, effective/next due, active occurrence, handled dates,
   last-handled/last-Done values, and positive/Missed streaks against the
   existing full canonical read across normal, recurring, delayed, lifecycle,
   behavior-boundary, logical-day, and legacy-provenance fixtures. Classify
   every mismatch; do not silently normalize it.
4. **Atomic invalidation and post-commit materialization.** Update the trusted
   canonical command boundary to invalidate an existing affected projection in
   the canonical transaction, then rebuild it immediately after commit through
   the TypeScript calculator and revision-fenced trusted writer. Backfill
   existing entities only through explicit repair operations. Legacy direct
   writers remain compatibility paths and are instrumented until retired.
5. **Consumer cutover.** Move ordinary Task surfaces and current readiness to
   valid current projections. Keep History, Calendar detail, repair, and
   parity paths on canonical reads. A projection miss is entity-scoped
   unavailable/repair state, never a raw-status fallback.
6. **Realtime and temporal cutover.** Route Task/History/policy/time events to
   entity-scoped invalidation and bounded reconciliation. Route list/Folder
   events only to their domains. Prove no normal path performs a broad
   workspace reload for an entity-scoped change.
7. **Old-read retirement.** Remove the full-History startup dependency, the
   `isTaskHistoryLoaded` gate for current Task/rollover readiness, and legacy
   current-status/streak fallback calculators only after parity, command
   atomicity, repair, Realtime, and failure-mode evidence is complete. Retain
   lazy historical reads, explicit full rebuild, and migration diagnostics.

Each phase must preserve the existing engine's canonical outcomes and reward
semantics. No phase may promote calculated Missed into explicit History or use
the projection as a new source of chronology.

## Superseded loading rules

This Phase 1E contract supersedes the following normal-workspace rules wherever
they appear in earlier architecture documents:

- Full canonical History for every Task is not a required normal startup
  authority for Active Status, current due, current streaks, or current Task
  readiness.
- TaskApp rollover is not gated on a workspace-wide full History snapshot.
  Rollover consumes valid current projections and performs targeted temporal or
  canonical reconciliation when required.
- Opening the History modal is not required to wait for or replace current
  projection readiness. It is a historical consumer with bounded/on-demand
  reads.
- A History cache hit, delta sync, or full bootstrap is not itself a current
  projection proof. It is canonical-fact transport and cache state.
- Realtime, Task mutation, and logical-day events do not target broad workspace
  reload as the architecture. They target the affected entity or domain.
- Raw `Task.status`, `due_on`, compatibility active fields, selected History
  windows, and reward state are not allowed fallbacks for a missing or stale
  current projection.

The old full-History startup implementation remains a transitional source path
until the migration gates retire it. It is not the target architecture and
must not be extended with new current-surface dependencies.

## Acceptance invariants

1. Canonical History, occurrences, boundaries, commands, lifecycle/workflow,
   reward, and achievement facts remain authoritative evidence.
2. Current Task surfaces consume one valid current projection per entity.
3. Equal canonical inputs and context produce equal projection values,
   regardless of whether the projection was created during a command or repair.
4. Projection freshness is proven by Task, History, schedule, behavior-policy,
   logical-day, projected-date, and algorithm/schema fences.
5. The user-wide History sync revision is not treated as an entity revision.
6. Successful canonical commands atomically invalidate any existing affected
   projection, while projection materialization is an immediate,
   revision-fenced, retryable post-commit operation that cannot block canonical
   commit.
7. Projection repair cannot write canonical History or reward evidence.
8. Time passage can invalidate and reconcile projections, but cannot by itself
   create History, resolve recurrence, or grant rewards.
9. Historical reads are lazy/bounded/on-demand except for explicit repair,
   migration, or parity work.
10. Realtime invalidates the affected entity/domain and never becomes a broad
    workspace reload policy.
11. Behavior-policy changes rebuild affected current projections once while
    preserving historical facts.
12. A missing, raced, ambiguous, or invalid projection fails closed to a
    targeted diagnostic/repair path rather than a second calculator.

## Related documents

- [`TASK_STATE_ENGINE.md`](../TASK_STATE_ENGINE.md) — canonical semantics and
  evaluator authority.
- [`TASKAPP_ARCHITECTURE.md`](../TASKAPP_ARCHITECTURE.md) — TaskApp ownership
  and consumer routing.
- [`WORKSPACE_LOADING_ARCHITECTURE.md`](../WORKSPACE_LOADING_ARCHITECTURE.md) —
  transitional source loading seams and the post-cutover loading contract.
- [`CURRENT_STATE.md`](../CURRENT_STATE.md) — current release and architecture
  status.
- [Phase 1C](task-state-phase-1c-command-read-output-contract.md) — command,
  read, result, and projection contracts.
- [Phase 1D-1](task-state-phase-1d1-persistence-storage-contract.md) —
  conceptual canonical persistence and revision requirements.

## Scope record

- Production runtime code: untouched; the rebuild helper is authored but not
  wired into command orchestration.
- Source SQL/schema/types/tests: 7.15.12 physical foundation plus 7.15.14
  invalidation/writer protocol authored.
- Edge Functions: not deployed or cut over.
- UI and browser behavior: untouched and unverified.
- SQL remains unapplied. No backfill, deployment, live Supabase proof, or
  runtime cutover occurred; those require later tickets. The old strict
  atomic-projection-write rule is superseded by atomic invalidation plus
  revision-fenced immediate post-commit materialization.
