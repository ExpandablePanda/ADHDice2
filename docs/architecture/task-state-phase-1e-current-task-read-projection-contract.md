# Phase 1E: Current Task Read Projection Architecture

Status: locked architecture direction; documentation only
Ticket: ADHDice 7.15.11
Scope: ordinary current Task reads, projection persistence, freshness, invalidation,
repair, and migration sequencing
Implementation status: not implemented by this ticket; no runtime, SQL, schema,
generated type, Edge Function, or UI change is authorized here

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
    | "missed" | "delayed" | "upcoming" | "unscheduled" | "complete"
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

Every successful canonical Task command returns the authoritative after-state
and a deterministic current-projection write plan. In the target persistence
boundary, the trusted command transaction:

1. validates the command identity and expected canonical/fact revisions;
2. writes the canonical Task, History, occurrence, boundary, override,
   lifecycle, workflow, and command facts required by the command;
3. evaluates the after-state with the same canonical engine contract;
4. writes the corresponding `task_current_projection` record with the source
   fences from that after-state; and
5. commits both canonical facts and the projection atomically.

The projection write is allow-listed, idempotent, and guarded by the expected
source revisions. Either the canonical transition and its projection become
visible together, or the command does not report a successful canonical commit.
This prevents a newly accepted command from deliberately exposing a known
stale current read. A repairable pre-existing stale projection never permits a
projection writer to alter canonical facts.

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
- may read the complete History and boundary chain for one entity when the
  current checkpoint is missing or ambiguous;
- runs the canonical evaluator and writes only the current projection, its
  source fences, and diagnostic metadata;
- is fenced by the Task/fact revisions and retries only when the source is still
  the expected version; and
- is safe to repeat and safe to abandon without changing canonical truth.

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
4. **Command dual write.** Update the trusted canonical command boundary to
   write canonical facts and the projection atomically. Backfill existing
   entities through explicit, revision-fenced repair operations. Legacy direct
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
6. Successful canonical commands and their current projection commit
   atomically, or the command does not report success.
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

- Production code: untouched.
- Tests: untouched.
- SQL, schema, generated database types, and Edge Functions: untouched.
- UI and browser behavior: untouched and unverified.
- This document locks architecture and migration order only; implementation,
  deployment, and live Supabase proof require later tickets.
