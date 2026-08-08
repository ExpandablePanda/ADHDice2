# Phase 1D-2: Migration / Backfill / Compatibility Cutover Design

Status: architecture and migration design only
Branch: codex/chatgpt-diagnostic-branch
Repository: ExpandablePanda/ADHDice2
Implementation status: no migration, schema, SQL, Supabase, runtime cutover, diagnostics, UI, tests, generated types, or version change is authorized by this document.

## Scope and non-negotiable migration rule

Phase 1D-1 defines the target persistence model. This phase defines how existing rows and existing runtime authorities can move toward that model without turning missing evidence into fabricated canonical facts.

The central rule is:

> Do not turn uncertainty into fake canonical facts.

If a legacy record cannot prove its recurrence anchor, occurrence identity, Delay origin, explicit-versus-automatic Missed provenance, prior Trash container, Complete chronology, or reward entitlement, the migration preserves the record as compatibility evidence and classifies the uncertainty. It does not silently choose the most convenient interpretation.

This document does not:

- change production code or tests;
- create or modify schema or SQL;
- execute SQL or access Supabase;
- implement migration, diagnostics, repositories, adapters, or UI;
- change generated database types or version surfaces;
- disable a legacy writer;
- begin runtime cutover; or
- delete legacy rows or canonical migrated evidence.

The locked target is the Phase 1D-1 model: owner-scoped Task Entity identity; explicit schedule models; immutable effective-dated schedule-boundary snapshots; stable recurrence anchors; on-demand occurrence facts; immutable scheduledDueOn; separate effective-date overrides; separate explicit History and Calendar overrides; separate lifecycle/container/workflow axes; calculated Missed; due_on as projection; Task.status as compatibility/display projection; a command-operation ledger; handled-success reward entitlement; separate reward grant and claim; legacy automatic Missed as compatibility evidence only; no universal event sourcing; no future-occurrence materialization table; and no stored canonical streak counters.

## 1. Audit boundary and current source evidence

The required architecture sources are:

- [Phase 0 inventory](task-state-phase-0-inventory.md)
- [Phase 1A core model](task-state-phase-1a-core-model.md)
- [Phase 1B-1 recurrence transitions](task-state-phase-1b1-recurrence-transitions.md)
- [Phase 1B-2A workflow/lifecycle transitions](task-state-phase-1b2a-workflow-lifecycle-transitions.md)
- [Phase 1B-2B rollover/reward semantics](task-state-phase-1b2b-rollover-reward-semantics.md)
- [Phase 1C command/read/output contract](task-state-phase-1c-command-read-output-contract.md)
- [Phase 1D-1 persistence/storage contract](task-state-phase-1d1-persistence-storage-contract.md)

The checked-in source audit for this design covered the following seams. These observations describe source reachability and checked-in definitions only; they do not prove which historical patch or RPC is deployed.

| Area | Checked-in evidence | Migration consequence |
|---|---|---|
| Task storage | supabase/schema.sql; add_task_revision_concurrency.sql; add_delayed_task_status.sql; add_profile_settings_sync.sql | adhdice_clean_tasks.id and user_id are the strongest identity facts. status, due_on, scheduled_on, active_status_logical_date, active_occurrence_due_on, completed_at, trashed_at, and mutable Repeat columns have mixed authority and must be classified separately. |
| Task revision | The revision trigger increments revision for any changed Task row; task-db-mutations.ts uses guarded expected revisions and can perform a safe reapply for non-conflicting fields. | Existing revision is useful concurrency evidence, but it is row-wide rather than a semantic revision for History, schedule boundaries, occurrences, lifecycle, or rewards. It must seed conservative initial proof, not become historical event chronology. |
| Task hierarchy | adhdice_clean_tasks.parent_task_id is same-table hierarchy; adhdice_task_subtasks is a separate child table; adhdice_legacy_subtask_promotions maps legacy_subtask_id to a unique promoted Task id. | Same-table Task IDs remain canonical where valid. Separate legacy children require mapping proof and must not be double-created. Cycles, missing parents, owner mismatches, and ID collisions remain evidence/needs-attention. |
| History row shape | adhdice_task_history has one unique row per user_id, task_id, entry_date, with status, event_type, occurrence_key, occurrence_due_on, counted_as_due_occurrence, was_completed, and timestamps. | The current row is a useful fact container but not a complete provenance ledger. Replacement history is not recoverable from the final row alone. |
| History triggers | schema.sql has updated_at maintenance, occurrence capture for some Done/Did My Best rows, duration-evidence linking, and achievement capture/evaluation triggers. | Trigger-filled occurrence metadata is not proof that the user supplied that identity. Backfill must preserve the row and classify the metadata provenance. Achievement consumers must not be allowed to turn mixed legacy rows into new Task truth. |
| Direct History writers | useTaskHistoryActions.ts directly deletes/upserts History and may call resolveLiveTaskStatusFromHistory; TaskApp status and Calendar flows pass engine plans when available but retain caller-owned persistence. | Explicit History needs one command/repository authority. Existing row/date uniqueness can be preserved as a compatibility constraint while canonical fact identity and provenance are added. |
| Legacy recurrence | task-repeat.ts calculates next dates and status from mutable due_on/Repeat fields; task-history.ts contains another History/rebase and overdue-date family. | These helpers are compatibility readers during migration, not equal business authorities. A row with due_on must not seed a historical anchor without independent evidence. |
| Engine recurrence/read | task-state-engine/recurrence.ts, effective-timeline.ts, engine.ts, legacy-adapter.ts, read-authority.ts, and action-authority.ts provide the target semantic center, but the legacy adapter reports missing recurrence cursor and satisfied-occurrence identity. | Migrated canonical facts must be fed to the engine; adapter warnings/unsupported results become classification and diagnostics, not permission to guess. |
| Engine persistence boundary | persistence-projection.ts allow-lists status, dueOn, completedAt, activeStatusLogicalDate, and activeOccurrenceDueOn; engine-only cursor/occurrence facts do not cross the current Task-row boundary. | Those fields are temporary projections. Canonical backfill must not force engine-only facts into old columns merely to make a row look complete. |
| Legacy rollover RPC | add_task_rollover_rpc.sql and patch_secure_task_rollover_rpc.sql derive from stored due_on/status, write automatic Missed or DMB rows, advance due dates, and use a per-user logical-date ledger/advisory lock. | The RPC is a business-state writer, not a harmless cache repair. It remains fallback evidence only until canonical deployment and replay proof allow retirement. |
| Engine rollover RPC | patch_task_state_engine_rollover_7_6_13.sql accepts a client plan, uses expected Task revisions, date uniqueness, advisory locking, and deferred achievement evaluation, but still accepts proposed History rows from the current engine planner. | Deployment proof must cover the actual function signature and version. The target rollover plan must stop treating calculated Missed or stale In Progress as ordinary canonical events before this path is sole authority. |
| Rollover callers | TaskApp runDayReset can run on initial load, visibility, BFCache pageshow, and a 60-second timer; the coordinator is in-flight-only and the local-storage gate is not a cross-device ledger. | A migration lock and command identity are required for live-write safety. Browser gates cannot be treated as the migration consistency mechanism. |
| Automatic Missed | useTaskRewardController.reconcileOverdueTaskMisses() writes missed History rows from buildOverdueTaskMissedDateKeys(); the legacy RPC does similar work; Effective Timeline also calculates non-persistent Missed. | Three representations must remain distinguishable. Migration never creates new calculated Missed rows and never promotes an old automatic row to a user-authored Missed without proof. |
| Reward finalization | useTaskRewardController.finalizeRecurringTasks() can reconcile automatic Missed, calculate next due, update Task status/due fields, and reset legacy child Steps. | Reward code is a retirement-pending Task-state writer. Canonical recurrence must cut over before the reward consumer becomes intent-only. |
| Reward claims/effects | adhdice_task_reward_claims has parent and partial subtask/date uniqueness; pending reward dice has operation and item identities; reward rolls and point/economy records are separate. useEconomy.ts retains a non-universal multi-write compatibility path. | Existing claims/effects can prove consumed or pending economy only when identity and ownership are corroborated. A successful History row alone cannot bootstrap a historical reward entitlement. |
| Logical day | logical-day.ts defaults to America/New_York and 06:00, reads local storage, while TaskApp/profile and SQL have their own settings/context paths. | Profile settings and a captured LogicalDayContext outrank local-storage mirrors and defaults. A migration boundary must record whether the historical timezone/day-start scope is known. |
| Lifecycle | task-complete.ts, TaskApp, and useTaskCrudActions encode Complete, Archive-like status, Trash, restore, and hard-delete follow-up through overlapping fields. | Backfill terminal, container, and workflow axes independently. Do not infer Complete from Archive or prior Trash container from trashed_at alone. |

## 2. Migration classification vocabulary

Every migrated fact, row, relationship, and projection receives exactly one primary class. A fact may also carry a secondary diagnostic, but it may not silently move to a stronger class because a later reader prefers it.

| Class | Meaning | Canonical treatment |
|---|---|---|
| CANONICAL_PROVEN | The legacy evidence directly represents the target fact, or the target fact is uniquely determined by constrained evidence. | May be promoted into canonical storage. |
| CANONICAL_RECONSTRUCTABLE | The target fact is not directly stored but is deterministically reconstructed from a complete, non-conflicting evidence chain. | May be promoted if confidence is PROVEN or HIGH and the reconstruction recipe is recorded. |
| COMPATIBILITY_EVIDENCE | The row is useful to preserve legacy behavior, audit, or future repair, but is not a canonical authority under the target model. | Retain in an evidence/provenance store or unchanged legacy table; never let it outrank canonical facts. |
| AMBIGUOUS | More than one plausible canonical interpretation remains. | Do not silently promote; preserve evidence and emit needs-attention metadata. |
| CONTRADICTORY | Existing records assert mutually incompatible facts and precedence cannot prove which fact should win. | Preserve every available assertion and block only the affected unsafe operation. |
| INVALID / ORPHANED | Ownership, relationship, identifier, or value constraints are broken. | Do not repair by guess; isolate and report. |
| PROJECTION_ONLY | The value is a display/cache/compatibility representation that may be rebuilt from canonical facts. | It may be backfilled after canonical facts, but never seeds them. |

Rules use the class names exactly. For example, a legacy automatic Missed row is COMPATIBILITY_EVIDENCE even when its date is reliable; an explicit Done row with no occurrence key may be CANONICAL_PROVEN for outcome/date and AMBIGUOUS for occurrence linkage.

## 3. Migration confidence model

Confidence applies to reconstructed canonical facts, not to the usefulness of legacy evidence.

- PROVEN — directly represented by an authoritative legacy fact, a constrained relationship, or a unique reconstruction with no missing required input.
- HIGH — supported by multiple independent clues with no competing interpretation; safe to promote because the remaining uncertainty cannot change the target Task semantics.
- MEDIUM — plausible and useful for compatibility or repair, but a different interpretation could change recurrence, occurrence, lifecycle, or economy behavior.
- LOW / AMBIGUOUS — competing interpretations remain, or the source is too incomplete to establish a safe target fact.

Promotion policy:

1. Only PROVEN and HIGH facts may be silently promoted to canonical storage.
2. MEDIUM facts may be copied only as compatibility/provenance evidence unless the design proves that the uncertainty cannot change Task semantics.
3. LOW / AMBIGUOUS facts remain diagnostic evidence.
4. CONTRADICTORY facts never become canonical merely because one row is newer.
5. Confidence is recorded per fact, not once per Task. A Task can have a PROVEN schedule model, a HIGH future boundary, and an AMBIGUOUS historical anchor.

Historical replay confidence and future schedule operability are separate dimensions:

| Dimension | Question | Example result |
|---|---|---|
| HISTORICAL REPLAY CONFIDENCE | Can the migration say what schedule/occurrence governed an earlier date without guessing? | LOW: due_on was a moving cursor and no schedule-start evidence exists. |
| FUTURE SCHEDULE OPERABILITY | Can a new canonical boundary make future evaluation deterministic from a known point forward? | HIGH: current Repeat fields are valid, no conflicting future boundary exists, and migration establishes a new prospective boundary. |

## 4. Recommended staged migration

The recommended sequence is M0 through M9. The stage names are migration gates, not implementation authorization.

| Stage | Purpose | Writes allowed | Runtime authority | Rollback ability | Required verification | Gate to next stage |
|---|---|---|---|---|---|---|
| M0 — Inventory and read-only classification | Produce the dry-run report, classify every relevant row, establish migration/version markers conceptually, and identify needs-attention populations. | None to canonical business facts. Read-only report and an attributable report artifact are allowed later. | Existing runtime remains unchanged. | Fully reversible. | Ownership, row counts, classifications, confidence, orphan/contradiction counts, and report reproducibility. | No unknown classification rule remains for a row category; live-write strategy and rollback owner are approved. |
| M1 — Introduce canonical storage structures | Add the Phase 1D-1 structures, ownership policies, provenance, uniqueness, and operation identity capability. | DDL/metadata only in a later schema phase; no backfill or business writes in this phase. | Existing legacy runtime. | Storage can be unused or disabled. | Deployed table/column/constraint/RLS/index/function proof in the later implementation phase. | Storage contract is actually deployed and version-marked; no source-only claim is accepted. |
| M2 — Backfill proven canonical facts | Populate entity identity, safe schedule boundaries, proven/reconstructable occurrence facts, explicit History, lifecycle/workflow facts, and reward consumed/pending evidence. | Canonical facts only when class/confidence permit; migration evidence and operation markers for every batch. No calculated Missed or retroactive reward grants. | Legacy reads/writes, with a per-user migration lock or write gate. | Switch runtime back to legacy reads; preserve canonical rows. | Integrity, idempotence, canonical/legacy semantic replay, economy non-regression, hierarchy mapping, and batch restart proof. | Every backfilled fact has provenance/version; no unexplained data loss; delta pass is clean. |
| M3 — Canonical read in shadow mode | Evaluate canonical EffectiveTaskState beside legacy-visible state for the same snapshots. | Optional guarded compatibility projection repair only when explicitly enabled and proven; no business-event writes. | Legacy-visible state remains user-facing; canonical result is comparator-only. | Disable comparator and leave facts intact. | Existing shadow/repair infrastructure, mismatch classes, and fixture replay; unknown/canonical-defect mismatches block. | All active read surfaces have an input path to canonical comparison; unexplained differences are zero or explicitly accepted as bounded ambiguity. |
| M4 — Canonical command write path | Route one command family at a time through the Phase 1C TaskCommand/Result contract and repositories. | Canonical fact writes first; compatibility projections after guarded canonical commit; legacy evidence is never rewritten as a substitute. | Canonical command for migrated/canonical-capable entities; explicit fallback only for unsupported entities. | Revert runtime authority to legacy for entities with no canonical-only facts; preserve canonical writes. | Command result, concurrency, replay, failure-domain, and projection tests for each family. | A command has no direct legacy business writer outside its adapter, and its canonical result is deterministic. |
| M5 — Compatibility projection synchronization | Keep old Task fields/legacy History read shapes usable for readers not yet cut over. | Canonical-write-first plus compatibility projection/mirror where needed; no universal equal-authority dual-write. | Canonical facts are authority; old columns/tables are projections/evidence. | Stop projection repair or route reads through canonical adapter; do not delete canonical facts. | Projection parity, zero projection-overrides-canonical findings, retry behavior, and no duplicate History/economy effect. | Every remaining compatibility writer has an owner, phase, failure behavior, and retirement gate. |
| M6 — Canonical read cutover | Make canonical read results the sole authority for Table/List, Home, Smart Lists, Calendar, History, editor, streaks, Paths, and On-Time. | Read-time no-op or safe projection repair only. | Canonical EffectiveTaskState and Effective Timeline. | Keep canonical data and re-enable a compatibility read adapter only as an emergency fallback; do not make raw status authoritative again. | Surface-by-surface gates in Section 33 and semantic comparison report. | No raw status/due fallback can change visible Task truth; all known ambiguity behavior is fail-safe and scoped. |
| M7 — Disable legacy business-state writers | Retire automatic Missed writes, reward-owned recurrence, legacy rollover business fallback, History live-status mutation, and duplicate recurrence writers in a controlled order. | Canonical commands, safe projections, explicit migration/repair commands only. | Canonical command/read/rollover authority. | Runtime rollback may re-enable a compatibility adapter only if it can preserve canonical facts; no destructive reversal. | Exact retirement gates in Sections 35 and 54; deployed function proof; offline, multi-day, and concurrency replay. | No legacy writer is needed for a supported canonical Task; unsupported population is isolated and owned. |
| M8 — Remove compatibility fallbacks after retention window | Stop depending on old columns/tables/read adapters while retaining them for audit/rollback. | Read-only legacy access and audited repair only. | Canonical storage and commands. | Runtime rollback uses canonical data/projections; legacy fallback is no longer assumed available. | Retention, export/audit, no-reader inventory, and rollback-window closure. | Product/operations approve retention completion; no unresolved needs-attention fact is hidden. |
| M9 — Cleanup only after proof | Deprecate or remove old projection/table paths under a separate authorized cleanup ticket. | Destructive cleanup only after retention/audit and rollback policy. | Canonical only. | Forward-only; restoration requires retained backup/audit policy. | Dependency scan, deployment proof, backup/restore proof, and final invariant report. | Separate cleanup authorization; never part of initial migration. |

No stage authorizes writing SQL here. The stage sequence is the design that a later implementation specification must detail.

## 5. Task Entity identity migration

### 5.1 Current Task row rules

For each adhdice_clean_tasks row:

1. Preserve the existing UUID as the canonical entity_id whenever it is a valid UUID, has one owner, and is not already claimed by an incompatible canonical entity.
2. Preserve user_id as owner_id. A missing owner, owner mismatch in related rows, or cross-user relationship is INVALID / ORPHANED.
3. Set entity_kind from proven hierarchy evidence:
   - null parent_task_id and no legacy parent relation: parent;
   - valid same-table parent_task_id: step or substep according to the complete parent chain;
   - a depth greater than one: substep;
   - a child row with a malformed or circular chain: entity identity may remain CANONICAL_PROVEN, but hierarchy classification is INVALID / ORPHANED or AMBIGUOUS.
4. Do not reparent a row merely to make a tree valid. A missing parent may receive a compatibility parent reference and needs-attention classification, not an invented root.
5. A same-table Step/Substep remains the same canonical entity. Migration must not create a second child because a legacy subtask has a similar title.
6. Seed the initial canonical entity revision from the existing Task revision only as a concurrency baseline. It does not mean the row has that many semantic command revisions.
7. Preserve title, descriptive metadata, list/folder placement, Repeat configuration, lifecycle markers, History, and reward references even when the Task state itself is ambiguous.

### 5.2 Hierarchy cases

| Current evidence | Class | Backfill rule |
|---|---|---|
| Top-level Task with valid owner and UUID | CANONICAL_PROVEN | Create one parent entity with the same ID and owner. |
| Same-table Step with a valid same-user parent chain | CANONICAL_RECONSTRUCTABLE | Create one child entity using the existing ID and mapped parent. |
| Same-table Substep with depth greater than one and valid chain | CANONICAL_RECONSTRUCTABLE | Preserve the full chain; entity_kind=substep. |
| parent_task_id points to missing Task | INVALID / ORPHANED | Preserve row and raw parent reference; do not reparent. It may be read as a detached entity only under a later explicit repair policy. |
| parent_task_id points to another user | INVALID / ORPHANED | Reject relationship migration; preserve both rows and owner mismatch evidence. |
| Circular parent chain | CONTRADICTORY or INVALID / ORPHANED | Preserve all IDs; block hierarchy-sensitive operations only. Do not choose a root. |
| Self-parent | INVALID / ORPHANED | Existing schema rejects it, but the classifier still reports any imported/legacy occurrence. |
| Complete/archived/trashed parent with active child | CANONICAL_PROVEN entity IDs plus needs-attention hierarchy state | Do not erase or implicitly change the child. Lifecycle reconciliation is separate. |

## 6. Legacy separate Subtask migration

The target is one Task Entity model. The current adhdice_task_subtasks table and adhdice_legacy_subtask_promotions are migration inputs and compatibility evidence, not a second permanent status authority.

### 6.1 Mapping classes

| Legacy condition | Class and confidence | Canonical action |
|---|---|---|
| Promotion row exists; legacy_subtask_id and mapped task_id exist; both have the same user; mapped Task parent/title/order relationship is consistent | CANONICAL_PROVEN or HIGH CANONICAL_RECONSTRUCTABLE | Map the legacy child to the existing Task Entity. Do not create another child. |
| Promotion row exists but mapped Task is missing | INVALID / ORPHANED | Preserve mapping and legacy row; do not recreate a Task with an unknown identity. |
| Promotion row has cross-user IDs | INVALID / ORPHANED | Reject mapping; retain evidence for security repair. |
| Unpromoted active legacy subtask; no same-table Task with the legacy UUID; parent Task and any legacy parent chain are valid | CANONICAL_RECONSTRUCTABLE, HIGH | Create one Task Entity using the legacy subtask UUID as entity ID when the target implementation supports that stable-ID preservation; map the legacy row. |
| Unpromoted legacy subtask whose UUID already exists as a same-table Task | CONTRADICTORY / stable ID collision | Do not double-create or merge by title. Require mapping/repair evidence. |
| Nested legacy subtask with a proven promotable parent | CANONICAL_RECONSTRUCTABLE, HIGH | Map parent first, then use the parent entity as canonical parent. Preserve depth/order. |
| Nested legacy subtask with missing parent or cycle | INVALID / ORPHANED or AMBIGUOUS | Preserve row; do not flatten or reparent silently. |
| Duplicate promotion evidence: one legacy subtask maps to multiple Tasks, or multiple legacy subtasks map to one Task without a documented one-to-one relationship | CONTRADICTORY | Keep all mappings as evidence; no reward/History merge until resolved. |
| Legacy row has a same-table equivalent with no mapping but unique owner, title, parent, and creation/order evidence | MEDIUM at best | Do not silently map; produce a repair candidate. Similarity is not identity. |

The existing promotion helper’s dry-run skip reasons—cycle, missing parent, mapped Task missing, stable ID collision, owner mismatch, and archived/trashed parent—are reusable classification concepts. A later migration tool should preserve its dry-run-first posture and extend it with History/reward mapping evidence.

### 6.2 Retirement evidence

adhdice_task_subtasks may stop being an active status authority only after:

- every active legacy row is mapped, explicitly preserved as an unmapped needs-attention row, or proven irrelevant under retention policy;
- all promoted rows are one-to-one and owner-safe;
- all History and reward references can resolve to one canonical entity or remain compatibility evidence;
- active readers no longer use legacy status as canonical state;
- child reset ownership is implemented in the canonical hierarchy/recurrence path or explicitly removed from recurrence semantics;
- reward claim mapping has no unreviewed duplicate parent/child identity; and
- retention/audit policy permits the legacy table to become read-only.

Do not delete legacy rows before that evidence exists.

## 7. Schedule-model classification

Schedule model is classified independently from anchor confidence and lifecycle eligibility.

| Current evidence | Target schedule model | Class rule |
|---|---|---|
| due_on is null and repeat_frequency=none | unscheduled | CANONICAL_PROVEN, even if old History exists. |
| due_on is non-null and repeat_frequency=none | one_time | CANONICAL_PROVEN. due_on is the current one-time boundary evidence, not a recurrence anchor. |
| repeat_frequency=daily, custom with valid interval, or daily_until_complete | rolling | CANONICAL_PROVEN for family when fields are valid; anchor/operability may still be AMBIGUOUS. |
| repeat_frequency=weekly with valid selected weekdays or a uniquely interpretable interval | fixed | CANONICAL_PROVEN/HIGH. Empty or contradictory membership is a rule diagnostic. |
| repeat_frequency=monthly with valid day-of-month or ordinal-weekday fields | fixed | CANONICAL_PROVEN/HIGH. Invalid monthly fields make the rule AMBIGUOUS/INVALID while the family remains fixed. |
| unknown repeat_frequency | AMBIGUOUS or INVALID / ORPHANED | Preserve raw configuration; do not silently map to none or rolling. |

Edge rules:

- Repeat present with no usable start/anchor: the schedule model can still be proven from the family, but recurrence operability and historical anchor are LOW/AMBIGUOUS.
- due_on null with valid recurring configuration: model is rolling or fixed as appropriate; anchor and first future occurrence are not invented from creation time. A prospective boundary may later make future operation safe.
- malformed Repeat fields: preserve raw fields and classify each invalid field. Do not normalize a malformed weekly/monthly rule into a different cadence.
- contradictory monthly fields: retain both the raw snapshot and a non-authoritative normalized candidate. No canonical monthly occurrence is created until the rule is uniquely repaired.
- Daily Until Complete: classify as rolling while configured. Complete/Archive/Trash changes active eligibility, not the historical fact that the configuration was rolling.
- delayed stored status: retain schedule model from Repeat/due configuration; delayed is workflow/effective-obligation evidence, not a fifth schedule model.
- completed, archived, or trashed recurring Task: preserve the configured model and schedule snapshot, but mark active recurrence suspended by lifecycle. Do not erase recurrence configuration or generate inactive-time Missed.
- stale extra Repeat columns when repeat_frequency=none: classify schedule model from the explicit selector, retain extra fields as compatibility evidence, and do not activate them.

## 8. Initial schedule-boundary backfill

The initial canonical boundary must mean:

> This schedule snapshot is authoritative from this known boundary forward.

It must not mean that the legacy Task has always had this exact configuration.

Each initial boundary should carry:

- source = legacy_migration;
- migration_version and classifier_version;
- schedule model and full normalized configuration snapshot;
- anchor value or null;
- anchor confidence;
- effective_from logical date;
- effective_from evidence;
- historical_scope_known boolean;
- prospective_only boolean;
- source Task revision and relevant row timestamps;
- unresolved diagnostics.

### 8.1 Choosing effective_from

Choose the earliest date that the current configuration is proven to govern, using this order:

1. A recorded explicit schedule-change command/event date, if one exists.
2. A uniquely corroborated History occurrence and configuration sequence that proves the current configuration was already active on that date.
3. A safely proven earliest occurrence under the current configuration, when no earlier change is possible and no contradiction exists.
4. The migration logical boundary for the user when the historical start cannot be proven.

Never use Task creation time merely because it is available. Never backdate beyond the earliest evidence. Never use the current due_on as effective_from simply because it is non-null.

When only the current row is known, the correct result is generally:

~~~text
effective_from = migration boundary
historical_scope_known = false
prospective_only = true
~~~

The earlier history remains preserved and may be interpreted only with the evidence available for each date.

### 8.2 Current configuration becomes active forward

The current mutable Repeat fields become the active canonical schedule snapshot at the chosen effective_from. It does not fabricate a sequence of old Repeat-change events from updated_at timestamps. updated_at proves row freshness only; it is not a semantic command date.

Later runtime Repeat/due commands append a new immutable boundary; they never mutate this snapshot or fabricate old change events.

The old Task Repeat columns remain a compatibility projection until all legacy readers retire. A later command writes the canonical boundary first, then projects the current configuration back to old columns for remaining readers.

## 9. Recurrence-anchor recovery and the prospective boundary strategy

Anchor recovery is high risk. The decision tree is:

1. Is a stable anchor directly represented by a canonical/history occurrence with a valid recurrence source boundary?
   - Yes: classify CANONICAL_PROVEN/HIGH and record the exact evidence.
2. If not, do explicit History dates, valid Repeat fields, and a complete schedule sequence uniquely reconstruct one anchor without relying on moving due_on?
   - Yes: classify CANONICAL_RECONSTRUCTABLE/HIGH and record the replay recipe.
3. If not, can the current configuration operate safely from a new forward boundary without claiming historical replay?
   - Yes: create a prospective boundary at the migration logical date or later proven boundary, with historical_scope_known=false.
4. If multiple anchors remain plausible:
   - preserve all candidates as diagnostic evidence; do not choose one.
5. If no usable anchor or future boundary can be established:
   - keep the Task readable using proven current/lifecycle facts, block only recurrence-sensitive mutations, and require repair.

### Anchor cases

| Case | Classification | Migration behavior |
|---|---|---|
| A. Exact anchor proven by explicit occurrence metadata and matching schedule boundary | CANONICAL_PROVEN, PROVEN | Store the anchor and boundary; occurrence replay may use it. |
| B. Anchor uniquely reconstructed from a complete fixed membership/History sequence | CANONICAL_RECONSTRUCTABLE, HIGH | Store with reconstruction provenance; preserve source rows. |
| C. Historical anchor unknown, but future schedule can be made deterministic from migration forward | COMPATIBILITY_EVIDENCE for historical anchor plus CANONICAL_PROVEN/HIGH prospective boundary | Store a prospective boundary; do not call it the historical anchor. |
| D. Multiple plausible anchors, including due_on-as-anchor and creation-time-as-anchor | AMBIGUOUS, LOW | Store no silently selected historical anchor. Keep candidates/diagnostic. |
| E. No usable anchor and no safe prospective schedule | AMBIGUOUS or INVALID / ORPHANED | Read safest lifecycle/current facts; block recurrence-sensitive operation pending repair. |

### 9.1 Exact prospective normalization rule

A prospective boundary is eligible only when all of the following hold:

- the current Repeat family and fields are syntactically valid;
- owner and Task identity are proven;
- no contradictory future schedule boundary or explicit future History fact exists;
- the lifecycle state permits future evaluation, or the Task is inactive with the snapshot intentionally retained;
- the current effective cursor, first future occurrence, or an explicit user-chosen future due date is uniquely known from the forward boundary;
- no unresolved Delay origin is required to determine the first post-boundary obligation;
- the boundary logical date is derived from a valid profile LogicalDayContext or an explicitly recorded migration context;
- the boundary records historical_scope_known=false; and
- every pre-boundary occurrence/History interpretation retains its original confidence and evidence.

For rolling Tasks, a known due_on may seed the post-boundary current effective cursor only when it is valid as a current unresolved obligation. It must not be copied into the historical anchor field. After the first canonical post-boundary handled success, future rolling recurrence can rebase from the action logical date under Phase 1B-1 without replaying the unknown past.

For fixed Tasks, the prospective boundary may establish fixed membership from the first uniquely known post-boundary occurrence. The anchor is the boundary’s future schedule basis, not an assertion about the original historical start. A past occurrence with unknown origin remains unlinked compatibility evidence.

For one-time Tasks, a future due date may be canonicalized as the one-time boundary if the current one-time obligation is proven. It does not imply any prior recurring anchor.

This is the preferred fail-safe outcome for a legacy Task whose historical anchor is unknowable: preserve historical uncertainty, establish a clean forward schedule, and make the distinction visible in provenance and diagnostics.

## 10. Mutable Repeat fields to immutable boundary snapshots

Migration copies the current valid configuration into one initial boundary. It does not fabricate a sequence of old Repeat-change events from updated_at timestamps. updated_at proves row freshness only; it is not a semantic command date.

If a later runtime change occurs:

1. validate the new configuration through the canonical command;
2. append a new boundary with effective_from equal to the command logical date;
3. preserve earlier boundaries and History;
4. derive occurrences separately under each effective boundary;
5. project the current configuration to mutable legacy Repeat columns; and
6. reject or diagnose stale commands using the relevant entity/boundary revision.

If a legacy configuration is malformed, migration may preserve a raw snapshot and an invalid candidate, but may not silently rewrite it to a valid schedule. A later repair command creates a new canonical boundary rather than mutating the raw legacy record.

## 11. History classification algorithm

The migration classifier evaluates every current adhdice_task_history row in the context of its Task, owner, schedule boundaries, surrounding chronology, rollout/operation evidence, and reward/economy evidence.

### 11.1 Provenance clues and their limits

| Clue | What it can prove | What it cannot prove alone |
|---|---|---|
| status | The final stored outcome label | User intent, writer, or whether Missed was automatic |
| event_type=completed_permanently plus status=complete | Strong Complete-event shape; often HIGH explicit terminal evidence | Exact caller or whether a later correction was overwritten |
| counted_as_due_occurrence | Legacy due-opportunity interpretation | Occurrence origin or user intent |
| was_completed | Legacy completion projection; useful corroboration | That the row was user-authored or that the occurrence was correctly linked |
| occurrence_key / occurrence_due_on | Possible occurrence link | Whether the key was supplied by the user, trigger, moving Task field, or an automatic writer |
| created_at / updated_at | Relative row freshness and chronology | Prior replaced values or semantic command identity |
| matching rollover ledger/RPC execution evidence | Can link a row to automatic rollover when the relation is uniquely established | That every row on a matching date was automatic |
| command/operation identity | Direct explicit/authorized provenance | Historical rows that predate the ledger |
| achievement source metadata | That a History row was consumed downstream | That it was canonical user intent |

The schema trigger adhdice_capture_task_history_occurrence can fill missing occurrence data for successful rows. That trigger-derived data is preserved but labeled trigger-inferred, not user-authored.

### 11.2 Deterministic classification matrix

| Evidence pattern | Primary classification | Confidence and canonical treatment |
|---|---|---|
| Explicit command identity or source record proves a user-selected Done, Did My Best, Delay, or Missed | explicit user-authored outcome | PROVEN; backfill canonical outcome/date; link occurrence only if separately safe. |
| Authorized automation command identity proves the outcome | explicit authorized outcome | PROVEN/HIGH; backfill with authorized provenance and command identity. |
| Complete status with completed_permanently event_type, owner-safe Task, and no incompatible later evidence | Complete terminal fact plus explicit outcome | HIGH; backfill Complete History and terminal fact, preserving any contradiction evidence. |
| Status Done/DMB/Delayed with no command identity but a complete non-conflicting chronology and direct writer context that excludes automatic rollover | explicit outcome | HIGH at most; promote outcome/date, retain legacy provenance and mark source limitation. |
| Missed row linked uniquely to a legacy rollover invocation/ledger and not overwritten by a later explicit action | legacy automatic Missed | HIGH compatibility evidence; do not backfill as canonical explicit Missed. |
| Missed row with no source identity, but automatic writer chronology is uniquely implied by a closed due date and rollover operation evidence | legacy automatic Missed | MEDIUM/HIGH compatibility evidence; never canonical explicit History. |
| Missed row with no provenance and both manual and automatic writers plausible | ambiguous Missed | LOW; preserve row as compatibility evidence; no canonical explicit Missed. |
| Any row whose owner/task relation is broken | INVALID / ORPHANED | Preserve raw row; no canonical fact. |
| Multiple assertions for one entity/date with no replacement/revision identity | CONTRADICTORY | Preserve all available evidence; do not select by timestamp alone. |
| A row that only describes a calculated/projection state and has no explicit action provenance | compatibility-only derived evidence | COMPATIBILITY_EVIDENCE or PROJECTION_ONLY; do not backfill canonical outcome. |

Do not infer user intent merely from status, was_completed, counted_as_due_occurrence, or a current display state.

## 12. Mixed explicit versus automatic Missed

The migration keeps automatic Missed distinguishable even when the current unique row has overwritten an earlier result.

| Case | Target treatment |
|---|---|
| A. Missed row clearly written by legacy rollover | COMPATIBILITY_EVIDENCE with legacy automatic provenance. Do not create a canonical explicit Missed. |
| B. Missed row clearly manually selected | CANONICAL_PROVEN explicit Missed, with manual provenance and occurrence link only when safe. |
| C. No provenance; either writer is plausible | AMBIGUOUS compatibility evidence. Do not silently promote. |
| D. Automatic Missed was later overwritten by proven explicit Done/DMB/Complete on the same date | Explicit proven outcome wins canonical precedence. Retain automatic evidence if it is separately recoverable; do not recreate the overwritten row as a second canonical outcome. |
| E. Automatic Missed conflicts with later explicit History correction on another date | Preserve both. The explicit proven correction controls its date and chronology; automatic rows remain compatibility evidence and cannot override it. |
| F. Existing row status=missed but a successful reward claim proves a prior handled success on the same entity/date | Classify the current row and reward independently. Do not infer which History version was overwritten; reward consumed evidence remains authoritative for economy. |

Migration never generates new automatic Missed rows. Calculated Missed after migration is derived by the canonical reader.

## 13. Canonical History backfill

For an explicit proven or high-confidence outcome, backfill the conceptual target:

- owner and canonical entity identity;
- logical date;
- outcome;
- explicit/authorized provenance;
- source legacy History id;
- occurrence identity when safe;
- scheduledDueOn when safe;
- effectiveDueOn when safe, especially for Delay;
- event_type/terminal meaning;
- canonical fact revision initialized from migration provenance;
- migration operation identity;
- source row timestamps and classifier version;
- diagnostic references for missing metadata.

An explicit outcome remains valid if occurrence metadata is absent. The canonical History fact may have null occurrenceIdentity/scheduledDueOn and a diagnostic such as occurrence_identity_unavailable. Do not delete, downgrade, or hide the outcome because its occurrence link is incomplete.

Legacy automatic Missed rows are copied to compatibility evidence with their raw values and source classification. They do not become ordinary canonical History facts.

## 14. Historical History collisions and precedence

Migration must distinguish a collision in current one-row storage from a collision in the evidence set.

Precedence:

1. proven explicit user outcome;
2. proven explicit authorized outcome;
3. canonical terminal Complete evidence when its event shape and chronology are proven;
4. high-confidence reconstructable explicit outcome;
5. legacy automatic inference;
6. projection-only status/boolean evidence.

Two distinct explicit outcomes for one entity/date without revision/replacement evidence are CONTRADICTORY, not a reason to use the newest timestamp. A later timestamp is only replacement evidence when the source path or command identity proves replacement semantics.

Subtask data, reward claims, achievement events, and Task status can corroborate or contradict a History row, but they do not silently rewrite it. Reward evidence controls consumed economy only; achievement evidence controls downstream achievement provenance only; Task.status remains a projection.

## 15. Occurrence identity reconstruction

The migration attempts an occurrence link only when the origin is safe:

1. Prefer an exact occurrence identity whose Task owner and scheduledDueOn match a proven schedule boundary.
2. Otherwise use a valid occurrence_due_on that matches one and only one scheduled occurrence under the applicable boundary.
3. For rolling success, map to the one unresolved current obligation only when the cursor and chronology prove that one mapping.
4. For one-time Tasks, map to the sole obligation when the one-time boundary is proven.
5. For fixed schedules, map a History date to its fixed origin only when the schedule boundary uniquely identifies that origin.
6. Preserve a valid explicit outcome without occurrence linkage when any step is uncertain.

Safe reconstruction includes exact occurrence_due_on matching a proven schedule; a fixed date action with a unique boundary; rolling success mapping to one unresolved obligation; and a one-time Task with one proven obligation.

Ambiguous reconstruction includes stale occurrence_due_on; occurrence_key formed from a moving due_on; multiple fixed origins that could match; History before the known boundary; and Delay where the original origin is unknown.

No fabricated UUID is created merely because the target schema prefers one. A deterministic natural key may be recorded only when its scheduled origin is proven. A migration operation id is not an occurrence identity.

## 16. Delay migration

Current Delay is often represented by status=delayed, due_on set to a future target, and/or Delayed History. That representation does not prove the original occurrence.

Safe canonical Delay backfill requires:

- original occurrence identity or scheduledDueOn is proven;
- delayed target/effectiveDueOn is proven;
- action logical date is proven;
- target is strictly after the action logical date;
- no conflicting later schedule boundary exists; and
- the Task/owner relation is valid.

Only then may migration create the canonical Delay History fact, effective-date occurrence override, and associated schedule-boundary provenance.

If the future target is known but the original occurrence is ambiguous:

- preserve the Delayed row and target as compatibility evidence;
- do not set scheduledDueOn from delayed due_on;
- do not create an occurrence override with an invented origin;
- mark the affected occurrence needs-attention; and
- allow unrelated reads or future prospective scheduling when safe.

The current TaskApp path has a compatibility branch for a null/indefinite delay target. The locked Phase 1B-2A model rejects indefinite/null Delay. Such rows are AMBIGUOUS/unsupported workflow evidence, not a canonical indefinite Delay.

## 17. Fixed same-date collision migration

If migration can prove:

~~~text
Friday origin -> Delayed to Monday
normal Monday origin -> Monday
~~~

it preserves both immutable origins and both scheduled dates, records the Friday effective-date override, and lets the canonical reader derive one Monday EffectiveObligation. It does not create a historical merged-obligation row, duplicate History, or duplicate reward entitlement.

If one origin is ambiguous, migration preserves the known origin and the unlinked Delay evidence. It does not fabricate the missing merge. A later repair may attach the delayed evidence to an origin by creating a new canonical fact; it must not rewrite raw legacy evidence.

The one Monday effective outcome contributes one History outcome, one streak result, and at most one entity/date reward entitlement.

## 18. Complete and lifecycle reconciliation

Complete, Archive, Trash, and workflow evidence are reconciled on separate axes.

| Case | Canonical treatment |
|---|---|
| A. Complete History, completed_at, and terminal-compatible status align | CANONICAL_PROVEN/HIGH Complete History plus terminal permanently_complete. Preserve schedule configuration but stop future recurrence. |
| B. Complete History exists, stored status is archived | Preserve Complete terminal fact and archived container when Archive evidence supports it. Archive does not replace Complete. |
| C. status=complete with no Complete History | Projection-only or AMBIGUOUS unless completed_at/event/source proves terminal completion. Do not silently create Complete History solely from status. |
| D. Complete History followed by later active explicit History without explicit reopen evidence | CONTRADICTORY. Preserve Complete and later History; do not silently reopen or delete later History. Recurrence-sensitive commands require repair. |
| E. completed_at exists without Complete History or a terminal-compatible source | Compatibility/projection evidence only. Do not assume terminal Complete because current code may use completed_at for other projections. |
| F. Complete plus Trash | Preserve terminal permanently_complete and trashed container when both are proven. Restore must not reopen recurrence. |
| G. Complete plus later schedule edits | Preserve the schedule boundary evidence and terminal fact. Later edit is contradictory unless an explicit reopen/correction command is proven. |
| H. Complete History status/event mismatch | CONTRADICTORY or invalid source row; preserve raw evidence and block unsafe terminal promotion. |

Do not silently delete later History, reopen from status, or infer a successful outcome from Archive.

## 19. Archive migration

Archive is canonical containerState=archived. It is not Complete, not a reward event, and not evidence that a Task was successfully handled.

Backfill:

- status=archived with no contradictory terminal fact -> archived container, terminal active;
- status=complete and top-level Archive-like behavior -> terminal Complete plus archived container only when Complete evidence is proven;
- archived child/task rows -> preserve hierarchy and schedule configuration;
- archive-like status with missing/contradictory fields -> archived compatibility evidence plus needs-attention, not inferred terminal success.

History, schedule boundaries, occurrences, and reward entitlement evidence remain intact. Archive suspends active evaluation from its proven container boundary and does not accrue inactive-time Missed.

## 20. Trash and restore evidence

A trashed Task may have status=trashed and trashed_at without a trustworthy prior container.

Classify prior container:

- PRIOR_ACTIVE_PROVEN — explicit prior active state/container or a command/projection sequence uniquely proves active.
- PRIOR_ARCHIVED_PROVEN — explicit Archive state before Trash.
- PRIOR_COMPLETE_ARCHIVED_PROVEN — proven terminal Complete plus archived container before Trash.
- PRIOR_UNKNOWN — trashed_at/status alone, or contradictory prior fields.

The target may create canonical containerState=trashed for all valid Task identities. It may create priorContainer/restore evidence only for the first three classes. PRIOR_UNKNOWN must not default to active on restore.

Restore behavior:

- known prior active: restore to active and re-evaluate canonical state without synthetic History;
- known prior archived: restore to archived;
- known Complete+archived: restore to archived while retaining terminal Complete;
- unknown prior container: keep the safest inactive container or require repair; do not guess active;
- hard deletion remains separate and is not part of this backfill.

## 21. In Progress migration

Current fields status=in_progress, active_status_logical_date, and active_occurrence_due_on may be valid workflow evidence, stale session evidence, or a mixed projection.

| Evidence | Class | Runtime behavior |
|---|---|---|
| In Progress status with valid current logical date, valid owner, and matching occurrence/session evidence | CANONICAL_RECONSTRUCTABLE/HIGH workflow fact | Preserve workflow state separately; do not count as success. |
| In Progress date before current logical day with no explicit outcome | COMPATIBILITY_EVIDENCE or AMBIGUOUS stale workflow | Do not convert to DMB or Done. Read schedule independently and emit stale-workflow diagnostic. |
| In Progress occurrence does not match current due/History | CONTRADICTORY | Preserve fields/evidence; block only occurrence-sensitive workflow mutation until resolved. |
| Archived/trashed/Complete Task still carries In Progress fields | CONTRADICTORY projection | Lifecycle wins; preserve stale workflow evidence; do not resume it automatically. |
| Missing active logical date | AMBIGUOUS workflow | Keep status as projection evidence, not canonical workflow. Require repair before resuming that session. |
| Missing active occurrence on an unscheduled Task | CANONICAL_PROVEN that no occurrence is known, but invalid for occurrence-bound workflow | Do not create an occurrence from due_on or current date. |

The migration must never convert stale In Progress into Did My Best. Clearing stale workflow fields, if later approved, is an explicit migration/projection rule that retains the old values in evidence.

## 22. Calendar override migration

The current model does not have canonical Calendar override storage. Generic History, absence of History, calculated Not Due, and old status values do not uniquely represent a user’s date-scoped Unscheduled/Not Due/Due/Open override.

Therefore:

- start canonical Calendar override storage empty;
- do not infer overrides from History absence or generic Missed/Done rows;
- preserve any source only if a later audit proves it uniquely represented the same override intent;
- future overrides begin after the canonical override command is cut over; and
- an outcome-style Calendar edit remains History until a distinct override command exists.

This conservative empty backfill prevents ordinary schedule interpretation from being rewritten into a false manual correction.

## 23. Reward entitlement migration

Target entitlement is scoped to user + canonical entity + logical date + handled-success reward program/version.

| Current evidence | Classification | Migration action |
|---|---|---|
| Parent/subtask claim row with owner-safe entity mapping, reward_date, linked reward_roll_id, and corroborating roll/economy/pending operation | PROVEN_CONSUMED_ENTITLEMENT | Create consumed entitlement with legacy_program version and preserve all linked economy records. |
| Pending reward dice operation/item with exact task/subtask claim reference, owner-safe mapping, no completed claim, and retryable operation identity | PROVEN_PENDING_ENTITLEMENT | Create pending entitlement/effect linkage. Do not grant another roll. |
| Economy record/point ledger/roll exists but canonical success event cannot be proven | LEGACY_REWARD_EFFECT_WITH_UNKNOWN_SUCCESS | Preserve effect evidence; do not create a new grant or mark the entitlement unused. |
| Claim identity cannot map uniquely to one canonical entity/date/program | AMBIGUOUS | Preserve claim/effect rows; block only the affected future reward grant or require repair. |
| Successful History exists with no claim/effect proof | No entitlement proof | Do not create a historical entitlement, grant, or banked roll solely from History. |

Migration never grants rolls and never claws back existing rewards. A credible consumed/pending record wins over the absence of a claim. A future explicit edit may create a new entitlement only when the canonical command proves that the entity/date is currently handled and no consumed entitlement exists.

### Reward program version

Legacy claims are tagged legacy_program (or an equivalent immutable compatibility version). They are not reinterpreted as the current policy version. New policy versions create new entitlement identity space without making all historical dates rewardable again.

## 24. Parent / Step / Substep reward mapping

Map reward claims by canonical entity identity:

- top-level Task claim -> same Task Entity;
- same-table Step/Substep claim -> same Task Entity, independent of parent;
- promoted legacy Subtask claim -> mapped Task Entity only when promotion mapping is owner-safe and one-to-one;
- unpromoted legacy Subtask claim -> legacy entity evidence until mapping is proven;
- duplicate old claim after promotion -> one real entity/date entitlement, not parent plus child double credit;
- claim tied to old subtask ID and new Task mapping -> preserve both IDs in provenance and bind one canonical entitlement only when the map is proven.

A parent success never creates a child entitlement, and a child success never creates a parent entitlement. Same-Task fixed-origin merges still have one entity/date entitlement.

## 25. Command ledger bootstrap

Do not manufacture a historical command row for every old Task mutation.

Backfill may create:

- one deterministic migration operation identity per user/batch/Task fact write;
- source legacy row IDs and classification version;
- a migration result/fingerprint needed to make retries idempotent;
- a command identity only where a legacy operation must be linked for replay or effect reconciliation.

The normal command ledger begins at canonical command cutover. Migration operation IDs identify migration work, not fictitious user intent.

## 26. Revision and bootstrap strategy

Initial revisions are conservative:

- Task Entity: existing Task revision when valid, otherwise migration revision baseline;
- schedule boundary: revision 1 for each initial snapshot;
- History fact: revision 1 per canonical entity/date fact, with migration provenance;
- Calendar override: no row unless proven;
- occurrence fact: revision 1 when materialized/proven;
- lifecycle/container/workflow: revision 1 for each canonical current fact;
- reward entitlement: revision 1 for each mapped consumed/pending entitlement;
- command ledger: migration operation identity and algorithm version, not a synthetic user command.

Do not treat updated_at as a semantic revision. Do not make unrelated legacy row changes appear as historical schedule boundaries. Later commands use narrow concurrency proofs: entity revision, relevant History date/revision, schedule-boundary sequence, occurrence revision, and entitlement/effect identity.

## 27. Projection bootstrap and retention

Compatibility projections are rebuilt only after canonical facts are available:

1. Before canonical readers own runtime: keep current projections synchronized where a safe canonical value exists; never overwrite explicit evidence with a projection repair.
2. During M5: canonical facts are authority; Task.status, due_on, scheduled_on, active fields, completed_at, and trashed_at are compatibility projections where their semantics permit.
3. After M6: readers use canonical output; projections may still be written for legacy consumers.
4. After M7/M8: projections are read-only legacy data and may be rebuilt/audited but cannot influence commands.
5. Removal is a separate M9 retention/cleanup decision.

Old columns are not deleted during initial migration.

| Field | ACTIVE_LEGACY_AUTHORITY | COMPATIBILITY_PROJECTION | READ_ONLY_LEGACY | DEPRECATED | REMOVABLE |
|---|---|---|---|---|---|
| status | Before canonical read/write cutover | M5-M6 while old readers exist | After M6 | After all legacy readers retire | Only after retention/cleanup proof |
| due_on | Before schedule/occurrence cutover | M5-M6 as effective cursor projection | After canonical readers and command path own it | After no legacy recurrence reader | Separate cleanup only |
| scheduled_on | While current readers use it | If a deterministic projection exists | After no active reader | After source inventory proves unused | Later cleanup |
| Repeat fields | Before boundary command cutover | M5-M8 current-configuration projection | After immutable boundary owns reads | After all legacy writers retire | Later cleanup |
| active_status_logical_date | Before workflow cutover | In Progress/compatibility projection only | After canonical workflow readers cut over | After stale-field repair/retention policy | Later cleanup |
| active_occurrence_due_on | Before occurrence cutover | Current occurrence projection only | After canonical occurrence reader cutover | After no timer/legacy reader | Later cleanup |
| completed_at | Before terminal cutover | Compatibility terminal projection only | After lifecycle authority cutover | After reports/readers migrate | Later cleanup |
| trashed_at | Before Trash container cutover | Compatibility timestamp/projection | After canonical container reader cutover | After restore/readers migrate | Later cleanup |

The same policy applies to adhdice_task_subtasks, automatic Missed evidence, the old rollover ledger, old reward claims/effects, and promotion mappings: retain, classify, make read-only, then remove only after an explicit retention and audit gate.

## 28. Dual-read strategy

Temporary dual-read is required because the current branch has multiple active readers and because the target semantics intentionally differ from legacy persisted Missed and raw status behavior.

Use the existing development-only shadow and recurring-date repair infrastructure where appropriate. Do not build a second unrelated diagnostic system as part of migration.

For the same Task snapshot, compare:

- legacy-visible active status;
- canonical EffectiveTaskState;
- current effective obligation/due projection;
- fixed future membership;
- Calendar chronology;
- positive and Missed streaks;
- lifecycle/container/workflow;
- History outcome/provenance;
- reward eligibility/consumed state;
- hierarchy identity.

Every mismatch receives one class:

- EXPECTED_DUE_TO_NEW_SEMANTICS — for example, calculated Missed replacing persisted automatic rows;
- SAFE_PROJECTION_DIFFERENCE — canonical fact is same and old projection is stale;
- MIGRATION_DATA_AMBIGUITY — missing anchor, occurrence, lifecycle, or reward evidence;
- CANONICAL_ENGINE_BUG — canonical result violates a locked invariant;
- LEGACY_BUG — old result violates the locked target but canonical result is proven;
- UNKNOWN — insufficient evidence.

Dual-read exit criteria:

1. no UNKNOWN mismatch remains for a supported migrated population;
2. no CANONICAL_ENGINE_BUG remains;
3. SAFE_PROJECTION_DIFFERENCE rows are repairable and do not change canonical meaning;
4. EXPECTED_DUE_TO_NEW_SEMANTICS matches the locked architecture fixtures;
5. every MIGRATION_DATA_AMBIGUITY is either an explicit needs-attention record or a bounded runtime policy;
6. all read surfaces use the same comparison input snapshot; and
7. repeat runs are deterministic and do not create rows, rewards, or new Missed evidence.

## 29. Dual-write strategy

Do not recommend universal dual-write with two equal business authorities.

| Fact category | Strategy | Failure behavior |
|---|---|---|
| Explicit outcome/History | Canonical-write first through command repository, then compatibility mirror to adhdice_task_history while old readers remain | Canonical commit remains; mirror is retryable and visibly incomplete. Never reverse canonical fact because a projection failed. |
| Schedule boundary/Repeat change | Canonical boundary first, then mutable Repeat-column projection | Old columns may lag; canonical readers remain correct. |
| Delay effective override | Canonical occurrence override and Delay History first; due_on/status projection second | Missing projection is non-business failure; do not recreate origin from due_on. |
| Lifecycle/container/workflow | Canonical axis first; status/completed_at/trashed_at compatibility projection second | Preserve canonical terminal/container/workflow fact; repair projection later. |
| Calendar override | No legacy dual-write because no current canonical equivalent exists | Future command writes canonical override only; old readers may not understand it until read cutover. |
| Calculated Missed | No dual-write | Never write ordinary legacy Missed as a side effect of canonical read/rollover. |
| Reward entitlement | Canonical entitlement first; existing claim/effect adapter only when a new reward intent is being consumed | Do not grant twice; pending effect retries independently. |
| Rollover | Canonical evaluation/command path first; legacy RPC only as an explicit unsupported fallback before retirement | Once canonical result commits, legacy business fallback cannot run because a projection or reward effect failed. |
| Legacy Subtask mapping | Canonical map/entity first; old row remains read-only evidence | No duplicate child; mapping failure leaves old row and needs-attention. |

A legacy writer that cannot be wrapped by the canonical command boundary is not safe for live dual-write. It requires a short per-user maintenance/write gate or must remain outside the migrated population.

## 30. Runtime cutover order

The safe order is dependency-first:

1. canonical read engine and migrated-fact adapter;
2. Table/List/Home/Smart List status projections;
3. Calendar and History timeline reads;
4. streak and Paths/On-Time reads;
5. explicit History commands: Done, Did My Best, Missed, ClearOutcome;
6. scheduling commands: due change and Repeat change;
7. DelayOccurrence;
8. CompleteTask;
9. Archive, Trash, restore, and container reads;
10. In Progress workflow commands;
11. batch commands as collections of the same commands;
12. reward entitlement consumer;
13. canonical rollover evaluation/projection reconciliation;
14. hierarchy/Step/Substep command and reward mapping;
15. disable legacy business-state writers and remove raw-status fallback branches.

The order keeps read authority ahead of writes, occurrence/boundary storage ahead of Delay and schedule changes, terminal/lifecycle facts ahead of restore, and entitlement proof ahead of reward effect retirement.

## 31. Read cutover gates

| Surface | Proof required before canonical read is sole authority |
|---|---|
| Table | Rows receive canonical display/lifecycle projection by entity ID; no raw status fallback changes status; stale due/status projection is classified only. |
| List | Sorting, bucket membership, child rows, and folder views consume canonical projection; open/finished filters do not use raw status when the canonical map is absent. |
| Home | Parent and child entities receive the same read contract; current state is independent of History window and render order. |
| Smart Lists | Current status predicates use canonical state; historical predicates explicitly name saved History versus Effective Timeline source. |
| Calendar | Effective Timeline is the sole date-state authority; fixed future membership, calculated Missed, Delay origin/effective dates, and same-date grouping replay deterministically. |
| History | Explicit outcome rows and calculated days are visibly/semantically distinct; missing occurrence metadata does not hide valid History; clear returns authority to timeline. |
| Editor | Draft status is initialized from canonical read; occurrence-sensitive saves dispatch commands, not generic patches; failed authoritative History load is fail-closed. |
| Streaks | Current streaks derive from effective chronology; saved-row statistics remain separate; calculated Missed does not become a saved row. |
| Paths | Parent/Step/Substep and archived/trashed/Complete precedence match canonical lifecycle axes; no raw child status fallback. |
| On-Time | Occurrence identity and scheduled/effective dates come from canonical occurrence evidence; missing identity is diagnostic, not due_on guesswork. |

## 32. Command cutover gates

| Command family | Prerequisite and gate | Compatibility/rollback rule |
|---|---|---|
| Done / Did My Best | Canonical History, occurrence, schedule-boundary, revision, and reward-intent contracts; explicit result is deterministic. | Project status/due/active fields after canonical commit. A runtime rollback may read canonical data; it must not delete the fact. |
| Missed | Explicit manual provenance and date authority; automatic Missed is not routed through this command. | Legacy automatic writers remain separate evidence only. |
| ClearOutcome | Canonical date identity and replacement/clear revision proof. | Clearing removes canonical explicit outcome only; calculated chronology is recomputed, not persisted as replacement. |
| Complete | Atomic semantic result for Complete History plus terminal permanently_complete; lifecycle axes and descendant rules are explicit. | Do not infer from status; rollback preserves terminal fact and uses compatibility projection. |
| Delay | Proven target occurrence, scheduledDueOn/effectiveDueOn separation, future-only target, and same-date merge logic. | Unknown origin blocks only that deferred occurrence; no due_on-derived origin is fabricated. |
| due change | Canonical schedule boundary and current-occurrence semantics; prior History replay is boundary constrained. | Mutable due_on is a projection. Legacy due writer is disabled only after boundary command parity. |
| Repeat change | Valid four-way schedule model and immutable boundary snapshot. | Old Repeat columns mirror current boundary; historical rows are preserved. |
| Calendar override | Canonical override storage and date-scoped authority. | No legacy equivalent is required; old readers remain on canonical adapter before full read cutover. |
| Archive | Canonical container transition separate from Complete. | Preserve terminal/history/schedule; old archived status is projection. |
| Trash | Canonical trashed container plus preserve evidence. | No hard delete; old trashed_at/status mirror only. |
| restore | Proven prior container or explicit repair decision. | PRIOR_UNKNOWN cannot default active; rollback leaves canonical container fact intact. |
| In Progress | Workflow fact with session logical date/occurrence proof. | Never auto-convert at rollover; stale fields remain evidence. |
| batch | Collection of individually validated commands with declared partial/all-or-nothing behavior, per-entity revisions, and per-entity reward intents. | One bad entity cannot cause a hidden raw-patch fallback for the rest. |
| reward intent consumption | Canonical handled-success event and unused entitlement proof. | Claim/grant failures are retryable downstream; no recurrence/status mutation in reward code. |

## 33. Rollover cutover and retirement

Target rollover is re-evaluation plus safe projection/effect reconciliation. It does not create Task truth.

Staged retirement:

1. M3 proves canonical reads without depending on rollover.
2. M4/M5 route explicit commands and projections through canonical results.
3. Canonical rollover evaluation stops emitting ordinary calculated Missed rows and stale In Progress success rows.
4. The deployed canonical rollover repository/RPC is verified by signature, version marker, constraints, RLS, revision behavior, and no-op replay.
5. Offline and multi-day replay proves the canonical reader reconstructs chronology without first synthesizing every missed date.
6. Two-tab/resume replay proves one Task/History/effect identity wins safely.
7. Reward finalizer no longer owns recurrence for canonical candidates.
8. Only then is adhdice_reconcile_task_rollover disabled as a business-state fallback. It may remain available temporarily as an explicitly separate migration/compatibility operation only if its semantics cannot be reached by normal runtime.
9. reconcileOverdueTaskMisses() is retired as an automatic writer after calculated Missed parity and History provenance evidence are proven.
10. Any remaining legacy fallback is fail-closed on unsupported deployment, not silently selected because a projection or reward request failed.

The legacy RPC must not be disabled merely because the source contains the canonical RPC. The later deployment gate must prove the intended function is installed and callable for the target project.

## 34. Reward finalizer cutover

The target sequence is:

1. canonical Task command owns recurrence advancement and schedule boundary changes;
2. canonical result emits a handled-success reward intent;
3. reward controller consumes the intent, creates/uses one entity/date/program entitlement, and dispatches grant/bank/claim effects;
4. Step/Substep reset, if still product-required, is owned explicitly by hierarchy/recurrence transition and is not a reward prerequisite;
5. reward failure leaves Task/History truth committed and creates a retryable effect state;
6. finalizeRecurringTasks() no longer calculates next due, writes Task status, writes automatic Missed, or resets children as a side effect of reward;
7. reconcileOverdueTaskMisses() no longer writes ordinary automatic History.

Retirement gate for finalizeRecurringTasks():

- all recurring Done/DMB/Complete commands route through canonical recurrence;
- historical correction and batch paths use canonical commands;
- no reward candidate relies on old status transition inference;
- child reset ownership is explicitly assigned;
- canonical reward entitlement is durable and idempotent;
- shadow comparison shows no unexplained next-due or status divergence; and
- a deployed/runtime proof confirms no caller can reach the legacy Task mutation through reward code.

Do not delete either function in this phase.

## 35. Compatibility authority policy

Every compatibility component has one role, owner, failure behavior, target phase, and removal gate.

| Component | Role | Owner during migration | Failure behavior | Target/removal gate |
|---|---|---|---|---|
| task-cockpit status calculators | READ_ADAPTER, then RETIREMENT_PENDING | Read adapter owner | Cannot override canonical state; return adapter diagnostic on unsupported input | Retire after all active readers receive canonical projection and no fallback branch remains. |
| resolveLiveTaskStatusFromHistory | LEGACY_FALLBACK, then RETIREMENT_PENDING | History command adapter | Used only for explicitly unmigrated/unsupported entities before command cutover; no silent mixed write | Retire when History commands return canonical afterState/projection. |
| task-repeat mutation recurrence helpers | LEGACY_FALLBACK/READ_ADAPTER | Schedule command adapter | Read-only compatibility calculation; cannot write Task state | Mutation ownership retires when canonical recurrence covers all callers; formatting helpers may remain. |
| adhdice_reconcile_task_rollover | LEGACY_FALLBACK/MIGRATION_TOOL | Rollover deployment owner | Never runs after canonical result; unsupported deployment is visible failure | Retire business role after canonical deployment/replay proof. |
| reconcileOverdueTaskMisses | LEGACY_FALLBACK | Reward migration owner | No ordinary writer after M7; explicit repair only | Retire when calculated Missed is canonical and no reward path calls it. |
| finalizeRecurringTasks | LEGACY_FALLBACK | Reward migration owner | Reject compatibility recurrence mutation after canonical command | Retire Task mutation after reward-intent cutover and child-reset ownership proof. |
| legacy subtasks | READ_ADAPTER/COMPATIBILITY_EVIDENCE | Hierarchy migration owner | Legacy status cannot outrank canonical Task Entity; unmapped child remains isolated | Retire active authority after mapping/reward/history proof; retain for audit. |
| engine shadow.ts | SHADOW_COMPARATOR | Diagnostics/QA owner | Read-only report; never changes business data | Remove only after mismatch exit criteria and a separate diagnostic retirement decision. |
| recurring-date repair report | MIGRATION_TOOL | Data repair owner | Preview/read-only; no automatic repair | Retain until all needs-attention categories have an explicit repair path. |

No component remains “temporary” without an explicit phase and gate.

## 36. Ambiguous-data runtime policy

Canonical reads consume proven facts plus preserved ambiguity evidence and return the safest EffectiveTaskState plus diagnostics. A single ambiguous Task must not make the entire account unusable.

| Ambiguity | Read behavior | Mutation behavior |
|---|---|---|
| Historical anchor unknown but prospective boundary is valid | Allow current/future read with historical replay limitation diagnostic | Allow future schedule operations from the prospective boundary; do not claim earlier replay certainty. |
| Delay target known, origin unknown | Show target/evidence as compatibility state where safe | Block editing/resolving that deferred occurrence; allow unrelated metadata/lifecycle reads. |
| Contradictory Complete | Preserve terminal/history assertions and show needs attention | Block recurrence-sensitive and terminal-changing commands; allow narrow metadata/container inspection. |
| Unknown Trash prior container | Keep trashed/inactive and show restore ambiguity | Block automatic restore-to-active; require explicit repair choice. |
| Invalid hierarchy | Read entity content where ownership is proven | Block hierarchy movement, parent/child reward merge, and descendant lifecycle operations only. |
| Reward entitlement ambiguous | Preserve economy evidence | Do not grant a new reward for the affected entity/date; allow unrelated handled successes. |
| Stale In Progress | Read schedule independently and show workflow diagnostic | Do not auto-complete, auto-DMB, or resume without a valid session fact. |
| Malformed recurrence rule | Read lifecycle/history and raw configuration | Block recurrence-sensitive command; allow metadata/lifecycle operation if safe. |
| Missing occurrence metadata on explicit History | Preserve outcome/date | Allow non-occurrence-sensitive reads and edits; block only commands that require that origin. |

Needs-attention blocking is narrow: fact migration, recurrence-sensitive mutation, lifecycle restore, hierarchy mapping, or reward grant is blocked only where that specific uncertainty can change the result.

## 37. Prospective normalization-boundary policy

The prospective boundary is safe when historical replay is not required to establish a trustworthy future schedule, and when the boundary is explicit about its limited scope.

Eligibility:

- valid owner/entity;
- valid current schedule family/configuration;
- a known migration LogicalDayContext;
- no unresolved contradiction in current lifecycle/container that would make future evaluation unsafe;
- a unique first/current future effective obligation from the boundary;
- no unknown Delay origin required for that future obligation;
- no ambiguous reward or History fact that would change the first post-boundary command; and
- a recorded historical_scope_known=false.

The boundary is not safe when:

- two plausible current schedules remain;
- a fixed schedule’s first post-boundary occurrence cannot be determined;
- a rolling Task’s current unresolved obligation is ambiguous and a Delay/resolve command would consume it;
- contradictory Complete evidence could resume or stop recurrence;
- current owner/hierarchy identity is broken; or
- a reward action would need historical success inference.

A prospective boundary does not delete, rewrite, or “correct” earlier History. It creates a trustworthy future interpretation and makes the earlier uncertainty explicit.

## 38. Manual repair categories

Later tooling may need these repair intents. Each repair creates a new canonical fact/command with provenance; it does not mutate raw legacy evidence:

- confirm recurrence anchor;
- choose a schedule-start/effective boundary;
- resolve contradictory Complete;
- classify an ambiguous Missed;
- resolve a delayed occurrence origin;
- confirm prior Trash container;
- map a legacy Subtask to a canonical entity;
- resolve reward entitlement ambiguity;
- repair invalid owner/hierarchy reference;
- confirm a malformed Repeat rule; and
- accept or replace a prospective boundary.

Repair is not part of this phase and requires no UI design here.

## 39. Required read-only migration dry-run report

No migration write is permitted before a dry-run report exists for each user and for the overall population. It must be reproducible under a classifier version and include:

- total Tasks;
- schedule model distribution: unscheduled, one_time, rolling, fixed;
- safely classified anchors;
- ambiguous/unrecoverable anchors;
- prospective-boundary eligible/ineligible counts;
- explicit History rows;
- explicit authorized rows;
- legacy automatic Missed rows;
- ambiguous Missed rows;
- contradictory History dates;
- occurrence identities proven, reconstructable, and ambiguous;
- Delay rows safe and ambiguous;
- fixed same-date collision candidates;
- Complete contradictions;
- Archive/Trash prior-container classes;
- In Progress valid/stale/contradictory/missing-date counts;
- same-table hierarchy counts and invalid references;
- promoted, unpromoted, nested, duplicate, orphaned, and unmapped legacy Subtask counts;
- reward claims mapped, consumed-proven, pending-proven, unmapped, and ambiguous;
- orphaned Task/History/reward/hierarchy references;
- projection mismatches;
- users/Tasks by migration marker; and
- rows that would be blocked by needs-attention policy.

The report must distinguish “not canonicalized because it is compatibility evidence” from “not understood.” A nonzero ambiguity count is acceptable; an unexplained count is not.

## 40. Migration operation ledger

Every migration batch/write uses a deterministic identity derived from:

- migration version;
- classifier version;
- canonical schema contract version;
- user ID;
- bounded batch identity;
- Task/fact identity where applicable; and
- operation kind.

The ledger/result record must support:

- restartability;
- resumability;
- idempotent retries;
- bounded batches;
- attribution to one migration version;
- source row IDs and classification;
- deterministic input fingerprint;
- result/fact fingerprint;
- partial failure and retry status; and
- no duplicate canonical row after retry.

Migration operation IDs are not user command identities and must not produce fake user command history.

## 41. Backfill dependency order

The exact conceptual order is:

1. User/profile settings and migration context — LogicalDayContext and ownership are required for all date classification.
2. Task Entity identity and same-table hierarchy — History, reward, and boundaries need canonical entity IDs.
3. Legacy Subtask mapping candidates — child identity affects History/reward mapping, but unresolved rows remain evidence.
4. Schedule model and initial boundary snapshots — model can be proven before anchor; boundary defines future interpretation.
5. Anchor classification and prospective boundaries — occurrence reconstruction depends on the boundary/anchor scope.
6. Materialized occurrence facts — only proven/reconstructable occurrences required by explicit facts, Delay, or correction.
7. Legacy History classification/evidence — classify before canonical History so automatic rows do not become explicit.
8. Canonical explicit History — preserve outcome/date first; attach occurrence/effective dates only when safe.
9. Delay effective overrides — require proven origin and target; fixed collisions remain derived.
10. Lifecycle/container/workflow facts — reconcile Complete/Archive/Trash/In Progress independently from History.
11. Calendar overrides — normally zero backfilled rows; only uniquely proven legacy equivalents may enter.
12. Reward entitlement bootstrap — map consumed/pending evidence after entity/History identity is known; do not grant.
13. Projection rebuild — status/due/active/completed/trash fields are derived from canonical facts and guarded revisions.
14. Migration markers, command cutover markers, and dry-run/result closure — record what is complete and what still needs attention.

This order prevents a reward claim from being mapped to an entity that later turns out to be a duplicate child, and prevents a History row from being assigned an occurrence using a boundary that was subsequently found ambiguous.

## 42. Batch sizing and operational safety

Operational guidance:

- migrate per user or bounded owner-scoped batches;
- avoid one giant transaction across the population;
- keep each batch restartable and idempotent;
- lock only the user/entity scope being classified;
- make reads consistent across Task, History, hierarchy, and reward inputs;
- preserve application availability for users outside the current batch;
- make a user’s migration state visible to runtime routing;
- never infer completion from a partially loaded batch; and
- retain raw source IDs and classification results for audit.

No exact batch size is prescribed without measured database/runtime evidence. The implementation phase must choose bounds based on row counts, lock duration, and statement limits.

## 43. Live-write race strategy and migration consistency snapshot

The safest realistic strategy is a hybrid of a per-user migration gate, a consistent snapshot, and a final delta pass:

1. Acquire a user-scoped migration lease/lock recognized by every canonical command and every still-supported legacy writer.
2. If a writer cannot participate in the gate, place that user in a short read-only/queued-write window rather than running live backfill against it.
3. Read Tasks, History, hierarchy, schedule inputs, and reward evidence from one consistent snapshot or from revision/fingerprint proofs that are equivalent.
4. Classify and write one bounded batch under attributable migration operation IDs.
5. Re-read relevant entity/task/history/reward revisions before releasing the gate.
6. Apply a delta pass for changes made before the snapshot or by an allowed queued writer.
7. Verify no relevant revision changed between final classification and canonical insert; otherwise retry the affected Task/user batch.
8. Release the gate only after canonical markers and compatibility projections are consistent.

Comparison of options:

- Maintenance/read-only window alone is safest but disruptive and does not scale well.
- Change capture/delta pass alone is unsafe while current direct writers bypass a shared gate.
- Universal dual-write is not realistic while direct History, rollover, reward, and Subtask writers remain reachable.
- Per-user migration lock plus a short write gate and delta pass is the recommended balance.

Required race behavior:

| Race | Required result |
|---|---|
| User marks Done during Task backfill | Command is queued/rejected behind the user migration gate, then re-evaluated against canonical facts; it is never lost or applied to the stale legacy snapshot. |
| History changes after classification | Revision/fingerprint mismatch causes that Task batch to retry; no duplicate canonical History is written. |
| due/repeat changes during boundary migration | Boundary classification retries from the newer command; old mutable fields do not become an invented historical boundary. |
| reward claim during entitlement bootstrap | Reward operation waits for the gate or is reconciled by stable claim/effect identity; migration never grants a second roll. |
| two tabs write concurrently | One canonical command/operation wins; the other re-reads/replays or returns stale-command evidence. |
| legacy RPC runs during migration | It is blocked by the per-user gate, or the user is excluded from live backfill. There is no silent mixed authority. |

## 44. Rollback strategy

Rollback means changing runtime authority, not deleting canonical migrated data.

| Stage | Safe rollback |
|---|---|
| M0 | Stop; no business data changed. |
| M1 | Leave unused canonical structures in place or disable their runtime path; no canonical facts need deletion. |
| M2 | Switch reads/writes back to legacy compatibility for entities without canonical-only facts; retain migrated rows, evidence, and operation markers. |
| M3 | Disable shadow comparison; canonical data remains intact. |
| M4 | For commands that only mirror old facts, route runtime back to the compatibility adapter while retaining canonical command results. |
| M5 | Stop projection synchronization or retry it later; canonical facts remain authority. |
| M6 | Emergency read fallback may use a canonical-to-legacy adapter only if it cannot overwrite canonical facts or hide a needs-attention state. Raw status must not silently become truth. |
| M7 | Do not re-enable a retired automatic writer merely to “repair” projections. Use canonical replay or an explicit compatibility operation. |
| M8/M9 | Forward-only after retention/cleanup; rollback requires retained backup/audit and a separate operational decision. |

Canonical rows should remain intact after a runtime rollback. Correct forward from canonical facts. Destructive deletion is not a rollback mechanism.

## 45. Point of no return

Migration becomes semantically forward-only when any live canonical fact is not losslessly representable in the legacy schema, including:

- canonical-only schedule boundaries;
- Calendar overrides;
- occurrence effective-date Delay overrides;
- canonical occurrence identities not expressible by old keys;
- reward entitlements/grants/claims with program version;
- command-operation identities and replay results; or
- explicit lifecycle/workflow combinations that old status cannot represent.

Before that point, runtime fallback may be comparatively simple for a supported subset. After that point, rollback means compatibility/read fallback with canonical data preserved and projections maintained where possible. It does not mean reverting the database to the old shape or deleting canonical truth.

## 46. Verification strategy

Every stage requires evidence in five categories.

### Data integrity

- owner/task/entity counts reconcile;
- no cross-user canonical references;
- no orphan canonical facts;
- no duplicate canonical History per entity/date;
- no duplicate reward entitlement per entity/date/program;
- no schedule-boundary overlap for one entity where boundaries are supposed to be ordered;
- no occurrence natural-key collision;
- no effective override without a proven origin or an explicit ambiguity classification;
- lifecycle axes have no impossible combination;
- migration operation retry produces no duplicate rows; and
- every canonical row has migration provenance or a live command identity.

### Semantic replay

- canonical state before and after migration is compared against legacy-visible state;
- differences are classified, not counted blindly;
- recurrence fixtures cover rolling, fixed, one-time, malformed, and prospective-boundary cases;
- Calendar chronology is independent of window bounds;
- current status and streaks use canonical chronology;
- historical corrections replay deterministically;
- calculated Missed is not materialized; and
- long-offline evaluation reconstructs chronology without synthetic backlog rows.

### Economy

- existing claims/rolls/banked items are preserved;
- no migration-created grant or banked roll exists;
- consumed and pending entitlement counts map correctly;
- duplicate claim attempts return the existing effect or a no-op;
- parent/child identity is not conflated; and
- reward failure does not roll back canonical Task truth.

### Hierarchy

- every mapped child has one canonical entity;
- parent mappings are owner-safe;
- nested mappings preserve depth/order;
- promoted children are not displayed or rewarded twice;
- orphan/cycle/collision counts equal the dry-run report; and
- child reset behavior is not hidden inside reward migration.

### Rollover

- no migration batch creates ordinary automatic Missed;
- no stale In Progress becomes DMB;
- no recurrence advances from time passage alone;
- canonical read works without a successful rollover call;
- repeated rollover/replay is a no-op;
- projection repair is guarded by the current revision; and
- legacy rollover rows remain distinguishable.

## 47. Verification-query categories

The later implementation may express these as read-only queries, views, or repository checks. No SQL is authored or executed by this phase.

- orphan canonical entities/facts;
- canonical fact owner differs from entity owner;
- duplicate explicit History entity/date;
- explicit History lacking required migration/live-command provenance;
- automatic Missed incorrectly inserted into canonical explicit History;
- duplicate reward entitlement entity/date/program;
- reward grant without entitlement;
- reward claim without grant;
- claim/effect mapped to a missing or cross-user entity;
- schedule-boundary overlap or non-monotonic effective dates;
- prospective boundary incorrectly marked historical_scope_known;
- occurrence natural-key duplication;
- occurrence with scheduledDueOn outside its source boundary;
- effective override without origin;
- effective override target not after Delay action date;
- Complete terminal mismatch with Complete History;
- Archive incorrectly used as Complete;
- trashed Task lacking prior-container classification;
- restore evidence claiming a prior container not proven by source;
- active workflow on terminal/trashed entity;
- stale In Progress fields with no workflow fact classification;
- History occurrence identity derived from due_on without proof;
- canonical row missing migration operation/version;
- migration marker says complete while needs-attention rows remain;
- projection differs from canonical result without a classified stale-projection reason;
- cross-user parent/legacy promotion reference;
- legacy Subtask mapped more than once;
- promoted child and same-table child duplicate;
- canonical entity missing from reward claim mapping; and
- canonical read producing a state that depends on Calendar window lower bound.

Expected assertions are set-based: no violating row, count matches dry-run/reconciliation report, or a specific bounded ambiguity is present and visible.

## 48. Semantic comparison report

For each entity/context, store or emit a comparison record containing:

- user/entity identity;
- migration and classifier version;
- source Task/History/reward revision fingerprints;
- legacy-visible state;
- canonical EffectiveTaskState;
- projected compatibility state;
- mismatch class;
- confidence and diagnostic IDs;
- whether the mismatch blocks a read or command gate; and
- comparison timestamp/context identity.

Gate on unexplained differences, not raw mismatch count. A large set of expected calculated-Missed versus persisted-automatic-Missed differences can be safe; one unexplained canonical occurrence consumption is not.

## 49. Deployment ordering

The conceptual deployment order is:

1. canonical storage structures and ownership/security constraints;
2. read-only classifier/dry-run report;
3. migration operation and per-user/task markers;
4. canonical repositories/adapters and target types;
5. proven-fact backfill;
6. semantic shadow reads;
7. canonical command path for one family at a time;
8. compatibility projections/mirrors;
9. reward entitlement/effect path;
10. canonical rollover path and deployment/version proof;
11. read-surface cutover;
12. legacy writer disablement;
13. retention/read-only legacy period; and
14. later cleanup.

Do not deploy runtime code that assumes a canonical RPC/table exists before the deployment proof for that dependency succeeds. Do not claim a checked-in SQL function is installed.

## 50. Supabase deployment-proof requirements

This phase does not access or modify live Supabase. Later implementation must prove, in the target project:

- canonical tables/columns exist;
- ownership foreign keys and uniqueness constraints exist;
- indexes support owner/entity/date/revision access;
- RLS policies and grants match the owner-scoped contract;
- canonical RPC signatures are present;
- function source/version marker matches the intended implementation;
- triggers are present and have the intended provenance/effect behavior;
- reward entitlement/grant/claim constraints exist;
- command/migration operation identity is unique and retryable;
- expected migration version is installed;
- legacy RPC availability/disable state is known;
- no schema-cache mismatch remains; and
- the deployed runtime/repository path actually calls the intended function.

Source inspection, generated types, or checked-in SQL alone do not establish any of these deployment facts.

## 51. Legacy retirement gates

### getTaskDisplayStatus / task-cockpit calculators

Retire as calculators when all active readers receive canonical display/lifecycle projections, no caller needs raw status fallback, shadow mismatches are classified, and formatting-only uses are isolated.

### resolveLiveTaskStatusFromHistory

Retire when History commands always return canonical afterState/projection and no direct History writer recalculates Task status/due fields.

### task-repeat mutation recurrence helpers

Retire mutation ownership when all schedule/outcome callers use canonical commands and boundary snapshots. Keep a helper only if it is demonstrably formatting-only or a read adapter with no policy authority.

### adhdice_reconcile_task_rollover

Retire business fallback when canonical reads are proven, canonical facts exist for the migrated population, the deployed canonical RPC/repository is verified, offline/multi-day replay passes, and no canonical command can fall through to it after a projection/effect failure.

### reconcileOverdueTaskMisses

Retire when calculated Missed is read-authoritative, no ordinary automatic Missed rows are needed, explicit Missed/repair paths are distinct, and reward finalization no longer calls it.

### finalizeRecurringTasks

Retire Task mutation ownership when canonical commands perform recurrence, no reward caller calculates next due/status, Step-reset ownership is explicit, and entity/date reward entitlement is durable.

### Legacy subtasks status authority

Retire after all active children have canonical Task Entity mappings or explicit needs-attention classifications, History/reward paths resolve by canonical entity, and no active reader/writer uses legacy status as business truth.

## 52. Legacy table retention policy

| Legacy source | Initial migration | After read cutover | Later cleanup |
|---|---|---|---|
| adhdice_task_subtasks | Preserve and map/classify | Read-only evidence; no active status authority | Retain through hierarchy/reward audit and retention window. |
| legacy automatic Missed rows | Preserve raw rows and classification | Compatibility evidence only | Remove only under explicit audit/retention policy; never use deletion as semantic correction. |
| adhdice_task_rollover_ledger | Preserve migration-era coordination evidence | Read-only/retirement-pending | Retain until all legacy rollover callers are gone and rollback window closes. |
| old reward claim/roll/pending structures | Preserve and link consumed/pending/ambiguous effects | Read-only compatibility/effect adapter | Retain through economy audit and claim recovery window. |
| adhdice_legacy_subtask_promotions | Preserve one-to-one mappings and anomalies | Read-only mapping evidence | Retain until legacy rows and all reward/history references are retired. |
| compatibility migration maps/evidence | Active audit source | Read-only audit source | Retain according to operational/audit policy; no automatic deletion. |

No destructive deletion, cascade, or retention duration is selected here.

## 53. Partial migration markers and versioning

Use a hybrid scope:

- per-user marker for lease, batch progress, cutover eligibility, and overall status;
- per-Task/entity marker for classification, canonical backfill, shadow verification, command cutover, and needs-attention;
- per-fact/operation records for retries and partial failure.

Allowed conceptual states:

~~~text
not_started
classified
canonical_backfilled
shadow_verified
command_cutover
complete
needs_attention
~~~

A user may be command-cutover for some entities while another Task is needs_attention. A single global flag must not hide that state.

Record at least:

- migration_version;
- classifier_version;
- canonical_schema_contract_version;
- reward_program_migration_version;
- source revision/fingerprint;
- operation identity;
- classification timestamp;
- last successful stage; and
- diagnostic/repair references.

When classification logic improves, reprocess only with a new classifier version and preserve the old result. Do not silently reinterpret old classifications in place.

## 54. Needs-attention population and blocking

Expected categories:

- ambiguous historical anchor;
- contradictory schedule boundaries;
- unknown Delay origin;
- contradictory Complete;
- unknown Trash prior container;
- stale/contradictory In Progress;
- invalid hierarchy/cross-user reference;
- unmapped or duplicate legacy Subtask;
- ambiguous reward entitlement;
- malformed Repeat configuration;
- orphan History or effect row; and
- projection contradiction that cannot be safely repaired.

Default blocking is narrow:

- block only the affected fact migration when possible;
- block recurrence-sensitive commands for anchor/occurrence ambiguity;
- block Delay/occurrence resolution for unknown origin;
- block lifecycle restore for unknown prior container;
- block reward grant for entitlement ambiguity;
- block hierarchy movement/descendant operations for invalid mapping;
- allow metadata reads/edits and unrelated entities; and
- block all Task commands only when owner identity, canonical entity identity, or terminal precedence cannot be safely established.

## 55. Economy non-regression contract

Migration must never:

- grant a roll because a historical Done/DMB/Complete exists;
- bank dice merely because a Task predates entitlement storage;
- claw back existing rewards;
- mark a consumed entitlement unused;
- create duplicate grant/claim/economy deltas;
- conflate parent and child reward identity;
- infer a consumed reward from current History alone;
- let a later reversal restore an entitlement; or
- let reward migration mutate recurrence, status, due dates, History, or lifecycle.

After cutover, a historical Missed -> Done action creates one reward intent only when the entitlement is unused. If credible legacy evidence proves it was consumed, no second intent is created. If evidence is ambiguous, safest behavior is no new grant plus a diagnostic.

## 56. Long-offline and new-user behavior

For a user absent for weeks or months:

- migration/backfill creates canonical facts only;
- canonical read reconstructs applicable rolling, one-time, and fixed chronology when the user returns;
- calculated Missed remains derived;
- no ordinary Missed row is synthesized for every elapsed date;
- no recurrence is advanced merely because the user was offline;
- no reward is created from elapsed time; and
- Archive/Trash inactivity does not accrue a backlog.

For a new user after canonical storage deployment:

- creation writes canonical Task Entity, schedule boundary, lifecycle/container/workflow, and command facts directly;
- no legacy backfill is needed;
- compatibility projections are written only while legacy readers still require them;
- no legacy Subtask or automatic-Missed evidence is created; and
- the user is not placed on a permanent migration compatibility path.

## 57. Migration invariants

The following invariants are required acceptance criteria. They extend the locked Phase 1A-1D-1 model.

1. Migration never invents user History.
2. Migration never writes calculated Missed as canonical History.
3. An ambiguous anchor never becomes silently canonical.
4. due_on is never assumed to be a recurrence anchor.
5. Schedule model and recurrence anchor are classified separately.
6. Existing Task identity remains stable when valid.
7. Legacy subtasks never double-create promoted children.
8. Canonical History preserves every explicit proven outcome.
9. Automatic Missed remains distinguishable from explicit Missed.
10. Missing occurrence metadata does not invalidate explicit History.
11. scheduledDueOn is never replaced by a delayed target.
12. Delay override requires a proven origin.
13. Same-date fixed merge remains derived.
14. Complete contradictions are preserved and diagnosed.
15. Archive does not imply Complete.
16. Trash restore never guesses a prior container.
17. Stale In Progress never becomes automatic success.
18. Calendar overrides are not inferred from History absence.
19. Migration grants no rewards.
20. Migration claws back no rewards.
21. Reward bootstrap avoids duplicate grants.
22. Parent and child reward identities remain independent.
23. Promotion mappings prevent legacy/new child duplication.
24. Command ledger does not fabricate user command history.
25. Backfill is idempotent.
26. Migration batches are restartable.
27. Live writes cannot disappear between classification and cutover.
28. Projection fields never outrank canonical facts.
29. Canonical rows retain migration provenance.
30. User ownership is preserved.
31. Cross-user references never migrate silently.
32. New users may use the canonical path without legacy evidence.
33. Runtime rollback does not delete canonical evidence.
34. Legacy writers remain enabled only until explicit retirement gates pass.
35. Old columns are not removed during initial cutover.
36. Canonical-only live writes define the forward-only point.
37. Shadow mismatches must be classified.
38. Unexplained canonical/legacy differences block cutover.
39. Migration version is recorded.
40. Needs-attention blocks are narrow rather than globally destructive.
41. A prospective boundary never claims historical scope it cannot prove.
42. A boundary effective_from is never backdated beyond evidence.
43. Trigger-inferred occurrence metadata remains distinguishable from user-supplied identity.
44. Legacy row timestamps never become fake schedule-change events.
45. Automatic rollover evidence never outranks proven explicit History.
46. Contradictory explicit outcomes are not resolved by timestamp alone.
47. A canonical explicit outcome can remain valid without an occurrence link.
48. Future projected occurrences are not materialized merely by Calendar read.
49. Archive/Trash create no inactive-time Missed backlog.
50. A prospective boundary permits future operation only when its first future obligation is deterministic.
51. A canonical projection failure cannot undo a committed canonical fact.
52. A legacy writer cannot run after a canonical command commits the same business transition.
53. Migration does not infer Calendar override intent from generic status.
54. Reward program version is explicit and legacy claims are not relabeled as current policy.
55. A reward grant cannot prove Task success.
56. A claim/effect without canonical success remains legacy economy evidence.
57. A consumed entitlement survives History reversal.
58. Complete terminal state is independent of container state.
59. Restoring a Task creates no inactive-time History.
60. New commands append schedule boundaries instead of mutating migrated history.

## 58. Migration scenario matrix

Each scenario records current evidence, classification, canonical backfill, retained evidence, confidence, runtime behavior, cutover impact, and repair need. These are design fixtures, not tests executed by this phase.

### Scheduling and anchor cases

1. Clean unscheduled Task — Evidence: valid owner, no due_on, repeat_frequency=none, no History. Class: CANONICAL_PROVEN. Backfill: one unscheduled Task Entity and boundary; no anchor/occurrence. Retain: raw Task row. Confidence: PROVEN. Runtime: no live obligation or Missed. Cutover: direct canonical read/command path. Repair: none.
2. Clean one-time Task — Evidence: valid due_on, repeat_frequency=none. Class: CANONICAL_PROVEN. Backfill: one-time boundary and one current obligation only if due fact is valid. Retain: due_on/source revision. Confidence: PROVEN. Runtime: one obligation; pre-due dates are Unscheduled. Cutover: schedule command gate required. Repair: none.
3. Rolling Task with obvious anchor — Evidence: valid rolling Repeat, explicit occurrence metadata and matching History. Class: CANONICAL_PROVEN. Backfill: stable anchor, boundary, needed occurrence facts, explicit History. Retain: source rows. Confidence: PROVEN. Runtime: rolling rebase uses success date. Cutover: eligible for canonical commands. Repair: none.
4. Rolling Task with ambiguous anchor — Evidence: valid rolling Repeat, moving due_on, no independent start/occurrence chain. Class: AMBIGUOUS historical anchor plus prospective-boundary candidate. Backfill: preserve ambiguity; create prospective boundary only if eligible. Retain: due_on and all History evidence. Confidence: LOW historical, HIGH future only after gate. Runtime: read with limitation; block origin-sensitive mutation before boundary. Cutover: Task may be partially cut over. Repair: optional anchor confirmation.
5. Fixed weekly Task — Evidence: valid weekdays, interval, and a unique future boundary. Class: CANONICAL_RECONSTRUCTABLE/HIGH. Backfill: fixed snapshot and safe future anchor; historical occurrences only when proven. Retain: old Repeat fields. Confidence: HIGH. Runtime: independent fixed occurrences/future membership. Cutover: Calendar gate applies. Repair: none unless historical anchor is uncertain.
6. Monthly ordinal Task — Evidence: ordinal, weekday, interval valid. Class: CANONICAL_PROVEN family/HIGH rule. Backfill: fixed monthly boundary; normalized historical dates only where schedule scope is proven. Retain: raw monthly fields. Confidence: HIGH for future, possibly MEDIUM historical. Runtime: month normalization follows locked rules. Cutover: monthly replay fixture required. Repair: historical start if missing.
7. Malformed Repeat — Evidence: unknown frequency, invalid weekday/month field, or contradictory monthly fields. Class: INVALID / ORPHANED or AMBIGUOUS. Backfill: raw configuration evidence and no unsafe canonical rule. Retain: all raw fields. Confidence: LOW. Runtime: read lifecycle/history; block recurrence mutation. Cutover: needs attention. Repair: confirm new schedule boundary.
8. Recurring Task with null due_on — Evidence: valid recurring family but no due_on/start/anchor. Class: CANONICAL_PROVEN schedule model, AMBIGUOUS anchor. Backfill: prospective boundary only if first future occurrence is uniquely chosen; otherwise no active occurrence. Retain: raw Repeat. Confidence: HIGH family, LOW anchor. Runtime: no fabricated current obligation. Cutover: read allowed; recurrence command blocked without boundary. Repair: choose schedule start.
9. due_on used as moving cursor — Evidence: due_on changes after successes/rollover; no stable anchor. Class: PROJECTION_ONLY due_on plus AMBIGUOUS historical anchor. Backfill: current effective cursor only if valid; do not seed historical anchor. Retain: row revisions/History. Confidence: HIGH cursor at snapshot, LOW anchor. Runtime: prospective operation after boundary. Cutover: projection parity only. Repair: anchor optional.
10. Delayed stored status — Evidence: status=delayed, future due_on, Delayed History but no origin. Class: COMPATIBILITY_EVIDENCE or AMBIGUOUS Delay. Backfill: target evidence only; no scheduledDueOn/override origin without proof. Retain: row/History. Confidence: MEDIUM target, LOW origin. Runtime: show deferred evidence; block that occurrence mutation. Cutover: partial. Repair: resolve origin.
11. Completed recurring Task with Repeat fields — Evidence: complete status or Complete History plus retained Repeat config. Class: terminal Complete and schedule model separately. Backfill: terminal fact, Complete History when proven, preserve boundary. Retain: Repeat configuration. Confidence: PROVEN/HIGH terminal only if evidence aligns. Runtime: recurrence suspended. Cutover: lifecycle gate. Repair: contradictory later edits only.

### History, Missed, and occurrence cases

12. Explicit Done History — Evidence: command/source proof or non-conflicting explicit writer context. Class: CANONICAL_PROVEN/HIGH explicit outcome. Backfill: outcome/date; occurrence only if safe. Retain: source id/timestamps. Confidence: PROVEN/HIGH. Runtime: explicit outcome authoritative. Cutover: reward intent only for new/unused entitlement. Repair: occurrence link optional.
13. Explicit Did My Best History — Evidence: explicit command/source proof. Class: CANONICAL_PROVEN/HIGH. Backfill: outcome/date and safe occurrence. Retain: raw row. Confidence: PROVEN/HIGH. Runtime: handled success under family rules. Cutover: same command gate as Done. Repair: none unless occurrence required.
14. Manual Missed — Evidence: explicit manual command/source proof. Class: CANONICAL_PROVEN explicit Missed. Backfill: canonical Missed outcome/date; occurrence only if safe. Retain: source identity. Confidence: PROVEN. Runtime: explicit Missed remains distinct from calculated. Cutover: manual Missed command enabled. Repair: no reward.
15. Legacy automatic Missed — Evidence: unique rollover invocation/ledger relationship and automatic chronology. Class: COMPATIBILITY_EVIDENCE. Backfill: evidence classification only. Retain: raw History and rollover evidence. Confidence: HIGH for compatibility, never canonical explicit. Runtime: canonical reader may use as provenance/diagnostic only. Cutover: no new automatic rows. Repair: classify only if later evidence changes confidence.
16. Ambiguous Missed — Evidence: status=missed with no source; manual and automatic writers plausible. Class: AMBIGUOUS. Backfill: no canonical explicit Missed. Retain: raw row. Confidence: LOW. Runtime: safest chronology plus warning. Cutover: recurrence-sensitive action may need repair. Repair: classify explicit versus automatic.
17. Automatic Missed overwritten by Done — Evidence: current Done row plus recoverable rollover evidence or prior snapshot. Class: explicit Done canonical; automatic evidence compatibility. Backfill: Done outcome/date; no second outcome. Retain: all recoverable source evidence. Confidence: HIGH Done. Runtime: Done wins. Cutover: one handled-success entitlement only if unused. Repair: none unless overwrite evidence conflicts.
18. Missing occurrence_key — Evidence: explicit outcome/date, no key, perhaps valid occurrence_due_on absent. Class: canonical outcome plus AMBIGUOUS occurrence link. Backfill: History outcome/date with null link and diagnostic. Retain: raw row. Confidence: PROVEN outcome, LOW occurrence. Runtime: reads allowed; origin-required mutation blocked. Cutover: no data loss. Repair: optional occurrence confirmation.
19. Malformed occurrence_key — Evidence: key has unsupported format or date mismatch. Class: COMPATIBILITY_EVIDENCE plus AMBIGUOUS occurrence. Backfill: do not parse into canonical identity; preserve raw key. Retain: source field. Confidence: LOW link. Runtime: outcome remains valid; origin-sensitive actions blocked. Cutover: needs attention. Repair: map only with schedule proof.
20. Safe occurrence reconstruction — Evidence: occurrence_due_on equals one scheduled date under a proven boundary. Class: CANONICAL_RECONSTRUCTABLE. Backfill: occurrence UUID/natural key, scheduledDueOn, source boundary. Retain: source metadata. Confidence: HIGH. Runtime: occurrence actions allowed. Cutover: eligible. Repair: none.
21. Ambiguous occurrence reconstruction — Evidence: stale date, multiple fixed origins, or pre-boundary History. Class: AMBIGUOUS. Backfill: no origin assignment. Retain: all candidate dates/evidence. Confidence: LOW. Runtime: outcome/date readable; origin-sensitive mutation blocked. Cutover: partial. Repair: choose origin.
22. Explicit Complete History — Evidence: event_type=completed_permanently, status=complete, aligned terminal fields. Class: CANONICAL_PROVEN/HIGH. Backfill: Complete History plus terminal state. Retain: source row and later evidence. Confidence: HIGH. Runtime: terminal precedence. Cutover: Complete command gate. Repair: only if later explicit reopen contradiction.

### Delay, lifecycle, and workflow cases

23. Clean Delay — Evidence: Delayed History with proven origin, action date, and future target. Class: CANONICAL_PROVEN. Backfill: Delay History, occurrence effective override, boundary. Retain: raw row. Confidence: PROVEN. Runtime: origin preserved, target effective. Cutover: Delay command enabled. Repair: none.
24. Delay with unknown origin — Evidence: future due target/status but no unique origin. Class: AMBIGUOUS. Backfill: compatibility Delay evidence only. Retain: target/status/raw History. Confidence: LOW origin. Runtime: read target cautiously; block that deferred occurrence. Cutover: partial. Repair: resolve origin.
25. Fixed Delay collision — Evidence: proven Friday delayed to proven normal Monday. Class: CANONICAL_RECONSTRUCTABLE/HIGH. Backfill: both occurrence origins and override; no merged row. Retain: Delayed History. Confidence: HIGH. Runtime: one derived Monday obligation/outcome. Cutover: collision fixture must pass. Repair: none.
26. Complete fully consistent — Evidence: Complete History, completed_at, status/terminal fields align. Class: CANONICAL_PROVEN. Backfill: terminal Complete and History. Retain: schedule config/older History. Confidence: PROVEN. Runtime: no future recurrence. Cutover: lifecycle can cut over. Repair: none.
27. Complete plus Archive — Evidence: Complete History and archived container/status. Class: CANONICAL_PROVEN axes. Backfill: terminal Complete plus archived container. Retain: raw status. Confidence: HIGH. Runtime: Complete remains Complete in Archive. Cutover: Archive/Complete parity. Repair: none.
28. Complete plus Trash — Evidence: Complete History plus status=trashed/trashed_at. Class: terminal Complete plus trashed container; prior container may be unknown. Backfill: both axes, prior container only if proven. Retain: Trash fields. Confidence: HIGH terminal, MEDIUM prior. Runtime: no recurrence; restore does not reopen. Cutover: restore gate. Repair: prior container if needed.
29. status=complete without Complete History — Evidence: stored status only. Class: PROJECTION_ONLY or AMBIGUOUS. Backfill: no terminal Complete unless independent proof. Retain: status/completed_at. Confidence: LOW. Runtime: safe read warning; do not fabricate terminal event. Cutover: lifecycle-sensitive commands blocked. Repair: confirm Complete.
30. Complete History followed by later active History — Evidence: terminal row and later Done/DMB with no reopen. Class: CONTRADICTORY. Backfill: preserve Complete terminal evidence and later History as evidence/canonical explicit date if independently proven. Retain: all rows. Confidence: LOW terminal chronology. Runtime: no silent reopen. Cutover: recurrence/terminal commands blocked. Repair: resolve contradiction.
31. Archived active Task — Evidence: status=archived, no terminal Complete proof, valid schedule config. Class: CANONICAL_PROVEN container plus active terminal. Backfill: archived container and schedule snapshot. Retain: due/Repeat/History. Confidence: HIGH. Runtime: suspended active evaluation. Cutover: Archive read gate. Repair: none unless prior container conflict.
32. Trashed Task with known prior active — Evidence: prior active snapshot/command plus status=trashed. Class: CANONICAL_PROVEN Trash and prior active. Backfill: trashed container/prior container. Retain: trashed_at. Confidence: HIGH. Runtime: restore active then re-read; no backlog History. Cutover: Trash/restore gate. Repair: none.
33. Trashed Task with unknown prior container — Evidence: status=trashed and trashed_at only. Class: canonical Trash, PRIOR_UNKNOWN. Backfill: trashed container, no restore target. Retain: all raw fields. Confidence: PROVEN Trash, LOW prior. Runtime: no default active restore. Cutover: restore blocked. Repair: confirm prior container.
34. Valid In Progress — Evidence: current logical date and matching active occurrence. Class: CANONICAL_RECONSTRUCTABLE/HIGH workflow. Backfill: workflow fact separate from schedule. Retain: active fields. Confidence: HIGH. Runtime: workflow overlay, no reward/satisfaction. Cutover: In Progress command gate. Repair: none.
35. Stale In Progress — Evidence: prior-day active status with no outcome. Class: COMPATIBILITY_EVIDENCE/AMBIGUOUS. Backfill: preserve stale workflow evidence; no DMB. Retain: fields and timestamp. Confidence: LOW current workflow. Runtime: derived schedule may be Missed; no synthetic success. Cutover: stale workflow retirement proof. Repair: clear/confirm workflow.
36. In Progress on archived Task — Evidence: archived container plus active fields. Class: CONTRADICTORY projection. Backfill: archived container; workflow evidence retained but not active. Retain: fields. Confidence: HIGH container, LOW workflow. Runtime: lifecycle wins. Cutover: lifecycle gate. Repair: stale workflow cleanup.

### Hierarchy and reward cases

37. Current same-table Step — Evidence: valid Task row and same-user parent. Class: CANONICAL_RECONSTRUCTABLE/HIGH. Backfill: same entity ID, entity_kind=step, parent mapping. Retain: parent_task_id. Confidence: HIGH. Runtime: independent state/reward. Cutover: child read/command gate. Repair: none.
38. Nested Substep — Evidence: valid same-table chain depth greater than one. Class: CANONICAL_RECONSTRUCTABLE/HIGH. Backfill: preserve chain/entity IDs. Retain: all parent IDs. Confidence: HIGH. Runtime: independent entity, hierarchy-aware UI. Cutover: hierarchy gate. Repair: none.
39. Already promoted legacy Subtask — Evidence: mapping row, existing Task, same owner. Class: CANONICAL_PROVEN/HIGH. Backfill: map legacy ID to existing Task; no new child. Retain: legacy row/mapping. Confidence: HIGH. Runtime: one reward/history identity. Cutover: legacy child filtered as evidence. Repair: mapping inconsistency only.
40. Unpromoted legacy Subtask — Evidence: legacy row, valid parent, no same-ID Task. Class: CANONICAL_RECONSTRUCTABLE/HIGH when stable ID preservation is allowed. Backfill: create/map one Task Entity using legacy UUID. Retain: legacy row. Confidence: HIGH. Runtime: canonical child. Cutover: legacy status read retired after mapping. Repair: none unless collision.
41. Ambiguous legacy Subtask equivalent — Evidence: similar title/parent but different Task ID and no mapping. Class: AMBIGUOUS. Backfill: no merge/double-create. Retain: both rows. Confidence: LOW. Runtime: keep separate evidence, block merge-sensitive reward/history. Cutover: needs attention. Repair: map explicitly.
42. Duplicate promotion evidence — Evidence: multiple mappings/one-to-many child identity. Class: CONTRADICTORY. Backfill: preserve mappings; no canonical merge. Retain: all mapping rows. Confidence: LOW. Runtime: reward blocked for affected identity. Cutover: partial. Repair: resolve mapping.
43. Clean reward claim — Evidence: owner-safe claim, linked roll, matching entity/date, unique key. Class: PROVEN_CONSUMED_ENTITLEMENT. Backfill: consumed legacy_program entitlement. Retain: claim/roll/ledger. Confidence: PROVEN/HIGH. Runtime: no duplicate grant. Cutover: reward path eligible elsewhere. Repair: none.
44. Legacy Subtask reward claim — Evidence: claim subtask_id and proven promotion map. Class: PROVEN_CONSUMED_ENTITLEMENT for mapped entity. Backfill: one mapped child entitlement. Retain: old subtask ID and claim. Confidence: HIGH. Runtime: parent not credited. Cutover: child reward gate. Repair: map if promotion evidence later conflicts.
45. Ambiguous reward claim — Evidence: claim/effect identity cannot map uniquely. Class: AMBIGUOUS. Backfill: no canonical consumed/unconsumed choice; preserve effect evidence. Retain: claim/roll/pending records. Confidence: LOW. Runtime: no new grant for affected scope. Cutover: narrow reward block. Repair: resolve entitlement.
46. History success with no reward claim — Evidence: explicit Done/DMB/Complete but no legacy economy proof. Class: canonical History, no historical entitlement proof. Backfill: no entitlement/grant. Retain: History. Confidence: PROVEN History, unknown economy. Runtime: future explicit edit can earn if unused. Cutover: no retroactive award. Repair: not required unless policy changes.
47. Consumed reward then History reversed — Evidence: consumed claim/effect, later Missed/cleared History. Class: PROVEN_CONSUMED_ENTITLEMENT plus explicit History correction. Backfill: entitlement remains consumed; preserve History sequence/evidence. Retain: all economy rows. Confidence: PROVEN economy. Runtime: no clawback or second grant on re-success. Cutover: reversal fixture. Repair: none.

### Race, rollback, and population cases

48. Two-tab write during migration — Evidence: same user/task revision race. Class: operational concurrency case. Backfill: one operation wins; other retries/replays under gate. Retain: operation/conflict evidence. Confidence: determined by revision/identity. Runtime: no lost write/duplicate History. Cutover: blocks release without concurrency proof. Repair: stale-command resolution.
49. Repeat edited during migration — Evidence: schedule field changed after snapshot. Class: live-write race. Backfill: retry from newer boundary; no fake historical boundary. Retain: old/new revision evidence. Confidence: only after delta pass. Runtime: newest canonical command wins. Cutover: schedule gate. Repair: none if replay succeeds.
50. History edited during migration — Evidence: entity/date revision changed after classification. Class: live-write race. Backfill: retry date; preserve explicit replacement. Retain: both operation fingerprints. Confidence: after stable snapshot. Runtime: no duplicate/overwrite. Cutover: History gate. Repair: contradiction only if both explicit assertions survive.
51. Reward claimed during migration — Evidence: pending/claim operation races entitlement bootstrap. Class: operational economy race. Backfill: claim/effect identity reconciled; no second grant. Retain: operation/effect rows. Confidence: high if operation id stable. Runtime: one consumed entitlement. Cutover: reward gate. Repair: ambiguous effect only.
52. Migration batch retry — Evidence: same deterministic migration operation repeated. Class: operational idempotence case. Backfill: return existing canonical result; no duplicate facts. Retain: operation record. Confidence: PROVEN after unique identity check. Runtime: unchanged. Cutover: required before M2 gate. Repair: partial failed batch only.
53. Rollback before command cutover — Evidence: canonical facts backfilled but no canonical-only live writes. Class: reversible stage. Backfill: leave canonical rows; switch runtime compatibility. Retain: migration markers. Confidence: stable. Runtime: legacy authority with canonical evidence preserved. Cutover: rerun M3/M4 later. Repair: none.
54. Runtime rollback after canonical-only write — Evidence: Calendar override/Delay/entitlement/command not representable in old schema. Class: forward-only. Backfill: do not delete canonical fact; project what is representable. Retain: canonical and operation evidence. Confidence: PROVEN forward-only. Runtime: canonical read/compatibility adapter, not raw legacy truth. Cutover: no destructive rollback. Repair: forward correction.
55. Long-offline user — Evidence: weeks/months since last app open; no rollover run. Class: valid migration population. Backfill: canonical facts only, prospective boundary if needed. Retain: old rows. Confidence: per fact. Runtime: reconstruct chronology; no synthetic Missed/reward backlog. Cutover: offline replay gate. Repair: only existing ambiguity.
56. New user after canonical storage deployment — Evidence: no legacy Task/History/subtask/reward rows. Class: canonical-only clean state. Backfill: none; create canonical facts directly. Retain: no compatibility evidence. Confidence: PROVEN. Runtime: canonical path, projections only for old readers. Cutover: not blocked by legacy migration. Repair: none.
57. Canonical projection mismatch — Evidence: canonical state says Not Due/Complete but status/due projection differs. Class: PROJECTION_ONLY / SAFE_PROJECTION_DIFFERENCE if canonical facts are sound. Backfill: guarded projection repair only. Retain: old value and repair provenance. Confidence: HIGH canonical, LOW projection. Runtime: canonical wins. Cutover: mismatch cannot block if classified and repairable. Repair: projection repair.
58. Orphan History — Evidence: History task_id missing or owner mismatch. Class: INVALID / ORPHANED. Backfill: no canonical History; preserve raw evidence. Retain: orphan report/source row. Confidence: PROVEN invalid. Runtime: exclude from Task state; do not delete. Cutover: account can proceed for other entities. Repair: owner/entity restoration only.
59. Cross-user reference — Evidence: Task parent, History, reward, or promotion row points to another owner. Class: INVALID / ORPHANED. Backfill: reject relationship and preserve security evidence. Retain: raw IDs. Confidence: PROVEN invalid. Runtime: fail closed. Cutover: affected relation blocked. Repair: security/data repair.
60. User with partial needs-attention Tasks — Evidence: some Tasks complete/shadow-verified, others ambiguous. Class: hybrid per-user state. Backfill: finish proven Tasks; mark ambiguous Tasks needs_attention. Retain: all evidence. Confidence: per fact. Runtime: account remains usable; narrow blocks apply. Cutover: user can be partially command-cutover. Repair: only affected categories.

## 59. Migration-readiness checklist

Before any migration SQL is authored, all of the following must be true:

- target model remains locked;
- required target structures and ownership boundaries are specified;
- classifier vocabulary is complete;
- confidence rules are complete;
- schedule model and anchor rules are separate;
- prospective-boundary eligibility is explicit;
- History and automatic-versus-explicit Missed classification is deterministic;
- occurrence/Delay rules are explicit;
- Complete/Archive/Trash/In Progress reconciliation is explicit;
- hierarchy and legacy Subtask mapping rules are explicit;
- reward entitlement bootstrap and program-version policy are explicit;
- no-retroactive-grant and no-clawback rules are explicit;
- command ledger/revision bootstrap is explicit;
- projection bootstrap/retention phases are explicit;
- dual-read mismatch classes and exit criteria are explicit;
- dual-write choices are category-specific;
- runtime read/command cutover order is explicit;
- rollover retirement gates are explicit;
- reward finalizer retirement gate is explicit;
- live-write race strategy is chosen;
- migration consistency snapshot/lock/delta behavior is chosen;
- batch/retry/idempotence behavior is explicit;
- rollback strategy and point of no return are explicit;
- dry-run report fields are complete;
- verification assertions and comparison report are explicit;
- Supabase deployment-proof requirements are explicit;
- legacy retirement owners and gates are assigned;
- partial migration markers are defined;
- migration/classifier/schema/reward versions are defined;
- needs-attention blocking is narrow and explicit;
- at least 40 invariants are accepted;
- at least 50 migration scenarios are accepted;
- no product behavior is changed by the design; and
- a separate implementation specification authorizes the actual schema/SQL work.

This checklist is a gate for a future implementation phase. It is not a request to author SQL in Phase 1D-2.

## 60. Product decisions

No new product decisions are required by Phase 1D-2.

The difficult choices in this phase are migration mechanics, evidence classification, rollback, concurrency, compatibility windows, and retirement gates. Phase 1B recurrence, workflow/lifecycle, rollover, and reward semantics remain locked. The prospective boundary is a safety mechanism for preserving uncertainty while enabling future correctness, not a change to product semantics.

## 61. Handoff

The smallest safe next phase is:

~~~text
PHASE 1E-1
Schema / Migration Implementation Specification
~~~

It should specify, separately and in this order:

1. canonical schema structures, constraints, ownership, RLS, indexes, and operation identities;
2. read-only classifier and dry-run report implementation;
3. migration markers and per-user/task lease/consistency strategy;
4. backfill transaction/batch algorithm and delta pass;
5. canonical repositories and types;
6. canonical read authority and legacy adapter;
7. command implementations;
8. compatibility projections and mirrors;
9. reward entitlement/grant/claim integration;
10. rollover deployment and proof;
11. legacy writer retirement;
12. contract tests and semantic replay fixtures;
13. browser QA for visible read/command behavior; and
14. live Supabase migration and deployment verification.

Writing migration SQL, implementing canonical repositories/types, implementing read authority, implementing commands, retiring legacy code, writing contract tests, performing browser QA, and applying a live Supabase migration are separate deliverables. None is started by this document.

## Scope and verification record

This document is architecture/migration design only. Production code, tests, schema, SQL files, Supabase, generated database types, UI, diagnostics implementation, version surfaces, and production migration/runtime cutover were not changed or started.

The required verification for this phase is git diff --check only. No tests, lint, build, typecheck, browser automation, dev server, SQL execution, or Supabase access is part of this pass.
