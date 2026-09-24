# Current State

Last reviewed: 2026-09-24
Role: active working

## Current Release

- Current working app version: `7.15.36`.
- Current release group: `7.15.x`.
- Version surfaces that should stay aligned for code-changing implementation work:
  - `package.json`
  - `package-lock.json`
  - `public/app-version.json`
  - `src/lib/app-version.ts`
  - visible `APP_VERSION` / `HUD_VERSION` constants in `src/components/task-app.tsx`

## 2026-09-24 7.15.36 Domain-Scoped Workspace Realtime Refresh

7.15.36 replaces the broad workspace refresh previously used by the eight
non-Task workspace Realtime handlers with bounded domain snapshots. Task List
events now refresh the grouped Task List domain: `adhdice_task_lists`,
`adhdice_task_list_manual_memberships`, and the authoritative
`loadTaskListFolders()` read of `adhdice_task_list_folders`,
`adhdice_task_list_containers`, and `adhdice_task_list_rail_items`. Task
Content Folder events refresh only `adhdice_task_content_folders`. Focus
category and Task Focus Day events share a Focus snapshot of
`adhdice_focus_categories` and `adhdice_task_focus_days`, using the current
Task reference set for Focus-day mapping.

Each scoped domain has bounded single-flight/coalescing behavior with one
latest trailing refresh for an event burst. Owner, mounted-workspace, and
domain-generation checks prevent stale results from applying. Task List
missing-table compatibility, `taskListDataGeneration`, list/membership
readiness, folder/list ordering and identity, mapper/reconciliation authority,
Content Folder normalization, category merging and local persistence, and
`suppressCategoryReload` remain intact.

The broad paths retired here are only the eight handlers for those List,
Content Folder, and Focus tables. Task Realtime still reloads the broad
canonical Task snapshot and is explicitly deferred to the next ticket because
its Task-row and schedule-boundary correctness surface is larger. Manual,
resume, and mutation refreshes remain intentional workspace refreshes. Notes,
History, and Current Projection Realtime remain scoped as before; ordinary
startup remains Current Projection-led with lazy History from 7.15.35.

No SQL/schema/RLS or Edge deployment was performed for 7.15.36.

## 2026-09-24 7.15.35 Current Projection Certification + Lazy History Startup

The Current Projection rollout is certified complete. Read-only live
verification found `519/519` valid rows, all using schema
`task-current-projection-schema-v2` and algorithm
`task-current-projection-algorithm-v3`. Settled browser parity has zero active
semantic mismatches. No canonical Task or History data was rewritten, and no
Current Projection rows were rewritten by this ticket.

7.15.35 retires the automatic broad History and current-summary bootstrap from
ordinary workspace startup. Current Tasks/Home/Table/List state now boots from
fresh Current Projections and projection-specific readiness. History remains
lazy and on demand for historical consumers. Stale or missing projections
retain task-scoped History, Calendar override, and command-operation fallback
paths; one stale Task does not trigger a full-user History or broad
command-operation load. Full History synchronization, cache, delta, and fence
infrastructure remains available when a historical consumer explicitly asks
for it.

The completed certification supersedes the earlier `7.15.34` intermediate
checkpoint (`fresh=47`, `fallback=472`), which remains below as historical
rollout evidence only.

## 2026-09-24 7.15.33 Final Current Projection Semantic Convergence

This section records the pre-certification implementation checkpoint. Its
rollout gate was subsequently completed and is superseded by the 7.15.35
certification above.

The four live-derived semantic shapes are locked in deterministic source
fixtures. The shared canonical input path now preserves `scheduled_due_on` as
date metadata and supplies occurrence identity only from actual canonical
occurrence provenance. The ordinary History presentation mapper remains
unchanged; the narrower Active Status adapter strips synthesized occurrence
identity from canonical facts whose `occurrence_id` is null. Actual
occurrence-backed facts retain their canonical identity. Canonical occurrence
effective overrides are read into the same engine input, so the Current
Projection builder and Active Status read use equivalent semantic evidence.

The four root causes are now covered as follows:

- The `efc9690e...` and `e1ab421e...` rolling Custom shapes exposed that an
  explicitly supplied empty Calendar override array selected the replay
  timeline while an omitted option did not. Empty `calendarOverrides: []` is
  now neutral; a non-empty active override still has Calendar authority.
- The `34559ec3...` fixed-weekday shape exposed metadata-only automatic Missed
  facts being able to look occurrence-backed in the legacy transport. Their
  scheduled dates remain historical metadata and cannot consume a canonical
  occurrence cursor without provenance.
- The `233e433a...` delayed shape exposed the authoritative effective cursor
  being dropped when the delayed fact predated the latest schedule boundary.
  An occurrence-backed canonical Delay/effective override now keeps the
  current effective cursor at `2026-12-29` until superseded by canonical
  evidence.

Because these changes alter durable projection output, the schema remains V2
but `CURRENT_TASK_PROJECTION_ALGORITHM_VERSION` is now V3. The source
migration `patch_task_current_projection_v3_7_15_33` was applied without
direct projection-row writes. The initial read-only baseline was 519 valid V2
rows. During the rollout, an unrelated live canonical revision advanced and
its existing invalidation trigger marked one row `repair_required`; no direct
repair was performed. The current live pre-rebuild state is therefore 518
valid V2 rows and one repair-required V2 row, all stale under V3 by contract.

Trusted Edge deployment completed in dependency order:

- `task-state-command`: ACTIVE v43,
  `78f2482824b1bc51ccffc50e74e22e2a8a7d017f2504c1a31cd61f5195552490`.
- `task-current-projection-backfill`: ACTIVE v7,
  `97bb0c951a494eda1c4fcf75e0768aacb9b882c103c3c57ee57a5cf235f0a30b`.

The existing authenticated backfill endpoint verified all four target IDs as
V3 rebuild candidates and safe single-row cursors, but no row was rebuilt:
the stored user JWT was rejected as `UNAUTHORIZED_ASYMMETRIC_JWT`. No owner-wide
rebuild was attempted and no projection row was mutated directly. A fresh
authenticated operator session is required before the four-task rebuild,
then the broader controlled campaign.

Focused semantic tests and the webpack production build pass. Full typecheck
still has unrelated repository baseline errors. At this checkpoint History
startup remained active and the 7.15.35 retirement gate was still pending the
four-task rebuild, the 519-row V3 freshness/fence audit, and settled browser
parity.

## 2026-09-24 7.15.34 Durable Scoped Last Handled Parity Proof

This was an intermediate rollout checkpoint, not the final certified
population. The later 7.15.35 certification above supersedes its
`fresh=47`/`fallback=472` snapshot.

The 7.15.34 QA checkpoint records the confirmed Current Projection population
as `fresh=47` and `fallback=472`. Status and due semantic mismatches were zero
in the fresh population. The scoped Last Handled verifier reached zero for the
reported mismatches, but a later bulk streak-summary refresh overwrote the
mutable `taskHistoryStreakSummaries` entry and made the same stable identity
appear mismatched again.

The development-only parity coordinator now retains a successful scoped
Last Handled verification proof separately, keyed by the exact existing
identity of Task ID, canonical revision, projection `updated_at`, logical
date, and workspace generation. Parity uses that proof only for
`lastHandledDate` and `lastHandledAt`; ordinary application summaries remain
the mutable default and status, due, streak, Last Done, and History UI state
remain unchanged. Resolved-false scoped checks are not cached as equivalent
and remain blocking. Identity changes ignore the old proof and permit one new
verification.

No SQL, Edge deployment, or projection rebuild was performed by that
checkpoint. History startup was still active there; 7.15.35 now retires the
automatic startup bootstrap while preserving on-demand History.

## 2026-09-24 7.15.32 Scoped Last Handled Parity Oracle + V2 Campaign Resume Gate

The first-50 V2 expansion passed its structural checks. The reported live
campaign state is 519 eligible projections, 60 valid V2, 459 valid V1, zero
`repair_required`, unavailable, or missing rows. The two active parity
blockers were false Last Handled blockers: the temporary bulk legacy
`loadManualActionCommandOperations()` oracle queried the user's entire
command-operation history without Task scope or paging, so older manual
commands could be omitted and an older History fact could win.

The runtime now uses the existing task-scoped
`refreshTaskHistoryStreakSummary(taskId)` seam as a temporary development
parity oracle only when a fresh active Task's mismatch is limited to
`lastHandledDate` and/or `lastHandledAt`. It loads entity-scoped History,
active calendar overrides, and command operations; it does not add a second
Last Handled implementation, change V2 calculator semantics, or alter V2
rows. Identity-fenced coordination coalesces duplicates, runs once per Task
canonical revision/projection `updated_at`/logical date/workspace generation,
ignores stale results, and permits re-verification when that identity
changes. Genuine mismatches remain blockers. Dev diagnostics are emitted for
request, start, and completion, with only Task ID, identity, and Last Handled
values.

All-user command pagination was intentionally not added. History startup,
automatic migration, SQL, Edge deployment, and backfill behavior are
unchanged. The local isolated QA account available during this source turn
did not contain the reported 519-row production state, so the 60-row live
parity gate, manual 50-row campaign, all-row fence audit, and settled final
parity report were not run and no fixtures were restored. History retirement
is not unlocked; after a verified 519-row completion it moves to 7.15.33.

## 2026-09-24 7.15.31 Projection V2 Parity Gate Correction

The first-10 7.15.30 V2 pilot passed its read-only database audit: 10 valid
V2 rows, 509 valid V1 rows, zero `repair_required`, unavailable, or missing
rows, with all canonical revision, History frontier/epoch, logical-day,
projected-date, schedule, behavior, and timestamp-kind fences passing.

The initial settled browser parity report showed three false blockers: two
trashed/inactive Tasks and one active Task whose V2 `null` timestamp plus
`logical_day_presentation` kind reconstructed the same floating logical-day
midnight that legacy displayed. The comparator now excludes canonical
`trashed`, `archived`, and `permanently_complete` Tasks from ordinary semantic
parity while reporting them separately, and compares the reconstructed V2
History summary rather than raw persisted `last_*_at` storage. Raw storage,
kind, logical date, reconstructed presentation, and legacy values remain in
timestamp diagnostics. Projection calculator semantics, stored V2 rows,
History startup, SQL, and Edge deployment are unchanged.

The corrected first-10 parity gate is a manual reload-and-settle check. The
campaign remains manual and must continue only in controlled 50-row operations
after that gate passes. History retirement moves to 7.15.33.

## 2026-09-24 7.15.29 Current Projection Parity Root-Cause Lock

7.15.28 browser QA is recorded as PASS. The dedicated projection reconciliation
restored fresh projection authority across the cross-tab mutation and restored
the visible positive streak to `1`. History startup remains active; History
retirement is blocked only by settled projection parity correctness.

### Stable parity baseline

The recorded settled 7.15.28 parity capture had approximately 225–226 fresh,
comparable projections after History and authority-pending state settled. Its
field counts were: `displayStatus=2`, `displayDueOn=5–6`,
`currentPositiveStreak=3`, `currentMissedStreak` had no separately recorded
non-zero group, `lastHandledDate=126`, `lastHandledAt=195`, and
`lastDoneAt=101`; `lastDoneDate` did not dominate the recorded mismatch count.
The earlier runtime log did not persist the unique Task-ID union or separate
zero-count fields, so the exact live unique mismatch total cannot be
reconstructed from checked-in source alone; the deterministic fixture lock
below has an exact 5-Task sample with 2 representation-only and 3 semantic
mismatches. The just-mutated 7.15.28 QA Task is excluded from this baseline.

### Timestamp root cause and contract

The legacy Last Done and Last Handled helpers return a real event timestamp
when the source event timestamp is authoritative. For an older logical date,
they intentionally synthesize `${logicalDate}T00:00:00` when the source
timestamp cannot be exposed as the logical-day presentation time. That value
is a floating logical-day presentation timestamp, not an absolute instant.
The v1 `timestamptz` columns cannot preserve that distinction: PostgreSQL
readback of `2026-09-18T00:00:00+00:00` is an absolute instant and can render
as September 17 at 8:00 PM in `America/New_York`, while the floating value
renders as September 18 at midnight. A real event instant such as
`2026-09-18T14:30:00.000Z` remains an instant; a different offset string for
the same instant is representation-only noise.

Projection V2 therefore keeps `last_handled_logical_date` and
`last_done_logical_date` as the logical-date authorities, keeps
`last_handled_at`/`last_done_at` nullable and reserved for true absolute event
instants, and adds explicit nullable kind fields:
`last_handled_at_kind` and `last_done_at_kind`, each
`event_instant | logical_day_presentation`. A synthetic result stores a null
`last_*_at`, the logical date, and `logical_day_presentation`; it is never
silently reinterpreted from a v1 timestamptz row. The kind is derived from
canonical event/provenance evidence during rebuild, not from timestamp text.

### Semantic mismatch classes

The existing canonical evaluator remains semantic authority. The source audit
and focused fixtures did not reproduce a projection-builder divergence on the
current canonical read-model path; live row-specific proof still requires a
fresh settled capture. The locked classes are:

- `displayStatus`: `upcoming` versus `pending` is a genuine semantic mismatch;
  first classification is stale-but-valid v1 when a fresh rebuild matches the
  evaluator, otherwise projection input/read-model or behavior-policy context
  must be corrected. Blindly copying `clean_tasks.status` is not valid.
- `displayDueOn`: a later evaluator `nextDueDate` versus an older projection
  `next_due_on` is semantic. It is a schedule-boundary discrepancy when the
  current boundary/occurrence source differs, stale-but-valid v1 when the
  current rebuild matches, and input/read-model when the scoped source is
  incomplete. `next_due_on`, not `current_effective_due_on`, is the display
  due authority.
- `currentPositiveStreak`/`currentMissedStreak`: non-zero legacy versus zero
  projection is semantic. The locked Custom fixture records exact History
  facts, effective exclusion, ruleset revision, empty Calendar overrides,
  schedule boundary, active lifecycle, and the resulting effective timeline.
  A matching scoped source with a zero v1 row is stale-but-valid; a differing
  scoped source is an input/read-model or behavior-policy discrepancy.
- `lastHandledDate`: date differences are semantic and are classified against
  entity-scoped History, active Calendar overrides, eligible committed runtime
  command operations, lifecycle, logical-day calculation, compatibility
  evidence, and the current row version. An omitted entity operation is an
  input/read-model defect; migration/legacy-only evidence is not equivalent to
  canonical manual action evidence; inactive Tasks are excluded from ordinary
  parity rather than repaired by copying a legacy date.
- `lastHandledAt`/`lastDoneAt`: same instant with different serialization, or
  synthetic logical-day versus timestamptz with the same logical date, is
  representation-only. A different logical date or real event instant is
  semantic.

`history_source_revision=0` with existing canonical History is an expected
pre-ledger baseline when no entity frontier exists; it is not proof that the
History input was empty and is not, by itself, a freshness-fence gap. A
positive entity revision still requires its matching frontier. No freshness-
fence gap was proven by the deterministic fixtures; a live row can only be
called a fence gap after its current entity frontier and source snapshot are
captured.

### Projection V2 / 7.15.30 controlled rollout status

The additive migration `patch_task_current_projection_v2_7_15_30` is applied.
The pre-deploy live baseline was 519 eligible canonical-runtime parent/step/
substep Tasks, 519 existing valid projections, all 519 exact V1 rows, zero
missing, zero `repair_required`, and zero `unavailable`. After SQL, the same
519 rows remain valid V1, both new kind columns are null, and V2 candidates
read as 519. No Task or History canonical data was mutated.

The pre-deploy Edge baseline was `task-state-command` ACTIVE v40,
`114cfc1def1c21cb07d4f18cd23d81fb4309fa7af9f6be58d5685afd189e7609`, and
`task-current-projection-backfill` ACTIVE v3,
`5420f22eac4a392c10261cca95fe3a3835af08812699d94675747ce8ed2a42c9`.

The physical contract now has nullable `last_handled_at_kind` and
`last_done_at_kind` values `event_instant | logical_day_presentation`, exact
V1/V1 or V2/V2 version pairs, and strict V2 no-value, real-event, and
synthetic-logical-day consistency checks. V1 timestamp values remain
untouched. There is one projection row per `(user_id, entity_id)`; no same-
entity V1/V2 duplicate storage exists.

The V2 calculator returns explicit Last Handled and Last Done timestamp kind,
includes logical date plus persisted timestamp/null choice in its source
fingerprint, and continues to use the canonical evaluator for status, due,
occurrence, streak, handled-day, and source-fence semantics. The V2 consumer
gate accepts only fresh V2 rows. V1 rows are stale/unsupported for preferred
projection reads and fall back to the existing History/evaluator path. A V2
logical-day presentation is reconstructed as `${logicalDate}T00:00:00` without
timezone conversion.

The trusted writer accepts the exact V1 pair during transition and exact V2
pair thereafter, validates timestamp consistency, retains all existing owner,
revision, History, logical-day, schedule, behavior, fingerprint, and timestamp
race fences, and fails closed if a V1 candidate would downgrade a stored V2
row. Backend-only keyset candidate/count RPCs select missing, invalid,
non-valid, and non-V2 rows, ordered by Task ID with a maximum batch of 10.

Deployment order and result:

- `task-state-command`: ACTIVE v41, hash
  `0d0a5f8add2b6f3d7f683d98f984cbd3d4b4e284edc05d36c3cfd14bc38d20d3`.
- `task-current-projection-backfill`: ACTIVE v5, hash
  `545e9b9a8e95d51a232965724f08bd67a4ea585746e2c345058885108c208648`.

The manual UI operator is labeled “Rebuild Current Projections”; nearby
developer copy identifies the current algorithm as V3. It retains the
shared busy/rollover guard, serial 10-row primitives, five-call/50-row maximum,
keyset cursor, one retryable fence retry, failure stop, and authoritative
remaining count. Automatic execution is disabled. At the 7.15.30 release
boundary, the first-10 pilot had not been run: progress was written 0, failed
0, retries 0, remaining 519.
The verified first candidate page was read-only and contained 10 Task IDs.

The final all-row fence audit and settled V2 parity report are pending the
manual pilot and campaign. History startup remains active; History retirement
is not unlocked for 7.15.31.

## 2026-09-24 7.15.28 Projection Realtime Reliability + Bounded Self-Healing

The 7.15.27 capture isolated the cross-tab current-projection break. The
`clean_tasks` Realtime event succeeded, the remote Task reload completed with
the advanced canonical revision, and the fresh durable projection already
existed server-side before Tab B received the Task event. Tab B nevertheless
retained the prior projection revision; the capture contained no projection
Postgres callback, buffer enqueue/flush, or merge, so authority safely fell
back to legacy and the positive streak remained stale.

7.15.28 moves current-projection `INSERT` and `UPDATE` listeners out of the
general workspace channel and into the dedicated owner-scoped
`adhdice_task_current_projections:<userId>` channel. The dedicated lifecycle
tracks its ref, status, removal promise, generation/debug ID, subscribe count,
cleanup count, and late-callback guards. Visibility, focus, pageshow, and
online resume paths independently ensure that channel is healthy without
creating duplicates. The table remains in `supabase_realtime`; no publication
or SQL change is part of this release.

After a remote Task Realtime mutation advances `canonical_revision`, the
normal Task reload remains unchanged and then performs at most one narrow
owner/entity projection read using `CURRENT_TASK_PROJECTION_READ_COLUMNS` when
the in-memory projection is stale or missing. A stale or missing immediate
result may schedule one approximately 4.5-second retry; duplicate requests
coalesce, obsolete owner/generation work is ignored, and no polling loop is
introduced. Returned rows still pass `isCurrentTaskProjectionFresh()` before
they can become preferred authority. Local `shouldSkipTaskReload=true`
suppression remains intact, while projection events continue to merge for the
eventual fresh local projection.

The 7.15.27 diagnostics remain active and now include reconciliation request,
start, result (entity, canonical revision, validity, freshness), retry,
completion, and cancellation records. Projection parity and timestamp repair
are explicitly deferred to 7.15.29. History startup remains active and
History retirement remains blocked.

## 2026-09-23 7.15.27 Projection Cutover Runtime Diagnostics

7.15.26 browser QA established the current cutover baseline:

- History modal opens: PASS.
- History mutation works: PASS.
- Next-due presentation semantics: PASS.
- Startup projection reads: PASS.
- Normal same-tab current presentation: PASS.
- Two-tab Task synchronization: FAIL; Address Sorter and Pills (AM) stayed stale in tab B until refresh.
- Settled parity remains approximately 225–226 Tasks: `displayStatus` 2, `displayDueOn` 5–6, `currentPositiveStreak` 3, `lastHandledDate` 126, `lastHandledAt` 195, and `lastDoneAt` 101. `lastDoneDate` does not dominate the mismatch count.

The 7.15.27 runtime diagnostics ticket is diagnosis-only. It does not retire History startup, change Task State semantics, change projection builder/writer semantics, restructure Realtime channels, change Last Done/Last Handled persistence, add SQL, deploy Edge, backfill, or change publication membership.

The browser now has a bounded development-only `window.copyAdhdiceRealtimeDiagnostics()` / `window.clearAdhdiceRealtimeDiagnostics()` trace buffer. It records task-channel creation/generation, every subscribe status, Task Postgres events, skip decisions, reload queue/start/completion/error states, triggering Task revision fences, shared-channel projection events, projection buffer enqueue/flush/merge decisions, event-scoped authority selection, parity samples, and cleanup. It excludes access tokens, email, titles, notes, and other private content.

### Current live Realtime channel/publication matrix

| Runtime channel | Client handlers | Live publication evidence |
| --- | --- | --- |
| Dedicated `adhdice_tasks:<userId>` | `adhdice_clean_tasks` | Published; separate from the shared workspace channel |
| Shared `adhdice_workspace:<userId>` | `adhdice_task_list_folders`, `adhdice_task_content_folders`, `adhdice_task_list_containers`, `adhdice_task_list_rail_items`, `adhdice_focus_categories`, `adhdice_task_focus_days`, `adhdice_task_lists`, `adhdice_task_list_manual_memberships`, `adhdice_notes`, `adhdice_task_history_facts`, `adhdice_task_current_projections` | Projection table is published; `adhdice_notes`, `adhdice_task_focus_days`, and `adhdice_task_history_facts` currently have handlers but are not in `supabase_realtime` |

No publication membership or channel topology change is part of 7.15.27. Source tests make the two-channel shape and all shared bindings explicit for the next behavioral ticket.

### Timestamp diagnosis

The parity trace now preserves raw projected/legacy values, Task `canonical_revision`, projection `canonical_task_revision`, `history_source_revision`, and `updated_at`. Timestamp mismatches are classified as exact, same instant/different serialization, same logical date but floating-time versus timestamptz, different instant, or different logical date using the configured timezone and logical-day start.

The focused reproduction confirms that in `America/New_York`, `new Date("2026-09-18T00:00:00").toLocaleString(...)` displays September 18 while the equivalent persisted timestamptz readback `2026-09-18T00:00:00+00:00` displays September 17. That shape is synthesized logical-day presentation time versus an absolute event instant; it is not yet a schema/representation decision. Absolute event timestamps retain their instant when represented with an explicit offset.

### Small true parity groups

Development parity samples now emit a bounded event-scoped report for each sampled Task in the `displayStatus`, `displayDueOn`, and `currentPositiveStreak` groups. The report includes persisted Task status/due, projection status/next due/streak, legacy status/due/streak, safe latest History-fact metadata, behavior type/ruleset ID, direct/effective tracking exclusion, source-fence metadata, and whether the projection or legacy values agree with the canonical Active Status evaluator output. The actual Task-by-Task classification remains a runtime/browser evidence step; no production semantic change is made here.

History retirement remains blocked. 7.15.27 is diagnostics-only.

## 2026-09-23 7.15.26 Current Projection Cutover QA Corrections

The 7.15.25 browser QA pass was partial: fresh-launch projection reads,
current-field parity across visible views, and resume/auth lifecycle passed;
cross-tab status updated, but the visible cross-tab streak badge did not update
to `1-hot`. History mutation and historical-surfaces checks failed because the
History modal path referenced `computeTaskSpecificHistoryStats` without importing
it from `@/lib/task-history`.

The same QA pass found a display-due semantic mismatch: the current projection
read adapter used `current_effective_due_on`, which represents the current
occurrence, instead of `next_due_on`, the durable equivalent of legacy
`evaluated.nextDueDate`. The NBA 2K27 live example had Task `due_on`
`2026-09-24`, projection display `upcoming`, `current_effective_due_on`
`2026-09-23`, and `next_due_on` `2026-09-24`.

The NBA 2K27 durable projection correctly rebuilt to `current_positive_streak =
1`, `current_missed_streak = 0`, and valid freshness with the canonical revision
matching the Task. The shadow rebuild occurred about four seconds after the
canonical Task commit. The cross-tab correction therefore covers the visible
consumer/state propagation seam; it does not change projection-writer or
canonical Task State semantics.

Before 7.15.35, development parity diagnostics ran when the legacy full
History readiness state was true before Active Status and the bulk legacy
streak-summary oracle had settled.
7.15.26 adds an explicit parity-ready gate and bounded per-field mismatch
diagnostics after due values are compared as `next_due_on` / display due.

History retirement remains blocked pending 7.15.26 browser QA. History startup,
History-backed Calendar/History detail, Records, Stats, Achievements, rollover,
projection writer semantics, SQL, and Edge deployment are unchanged by this
correction ticket.

## 2026-09-23 7.15.25 First Current Projection Consumer Cutover

The first browser current-read consumer cutover is active. For each Task, a
projection is preferred only when `isCurrentTaskProjectionFresh()` accepts the
row against the current owner, entity identity/kind, canonical Task revision,
History sync epoch, profile `settings_revision`, logical date, projection
schema, algorithm, and `valid` state. Fresh rows now provide the current
display status, current effective due date, positive streak, missed streak,
Last Handled logical date/time, and Last Done logical date/time.

Stale, `repair_required`, `unavailable`, or missing rows fall back per entity
to the existing legacy Active Status/History result. Until that legacy result
is ready, the existing persisted Task snapshot remains the fallback. Projection
values are never written into `clean_tasks`, and no canonical mutation source
changed. The `unscheduled` presentation behavior remains owned by
`projectTasksForActiveStatusRead()`.

The startup critical-core request now loads the narrow projection column list
and the owner's History sync-state fence alongside the existing Task/profile
request. Projection reads do not wait for full History hydration, and a
projection query failure remains non-blocking. Projection Realtime is now
published through the existing `supabase_realtime` publication and subscribed
owner-scoped for `INSERT` and `UPDATE`; events are buffered/coalesced into
bounded in-memory state updates, with no per-row refetch or workspace reload.

The legacy History hydration/cache/delta path, active-status engine, streak
summary calculation, rollover History readiness, Calendar and History detail,
Records, Stats, and Achievements remain intact. Historical/window Smart List
facts remain History-backed and History-gated. Full History still hydrates in
the background for this release. Eager History retirement is deferred until a
post-browser-QA ticket.

Live projection state remains 519 eligible, 519 valid, 0 `repair_required`, 0
unavailable, and 0 missing after the publication-only SQL change. The runtime
projection remains rebuildable derived state; no canonical authority changed.

## 2026-09-23 7.15.24 Close Current Projection Freshness / Invalidation Matrix

The completed 7.15.23 backfill now has 519/519 eligible projections materialized:
519 valid, 0 repair-required, 0 unavailable, and 0 missing. Consumer cutover was
intentionally still blocked at the start of this ticket; browser consumers and
History startup remain unchanged, and no backfill was run for this release.

The live audit found that canonical-revision invalidation alone did not cover
direct or secondary changes to schedule, occurrence, effective override,
calendar, behavior-selection, behavior-policy, logical-day, History sync-epoch,
tracking-exclusion, or hierarchy sources. In particular,
`adhdice_set_task_tracking_exclusion` changes `exclude_from_tracking` and the
ordinary Task revision without advancing `canonical_revision`. Because inherited
tracking exclusion is part of projection semantics, a parent change can stale a
whole moved subtree even when descendants receive no canonical revision bump.

The source-only matrix is now installed in
`supabase/patch_task_current_projection_invalidation_matrix_7_15_24.sql` and
has been applied to the live project after fail-closed prerequisite checks. It
adds entity-scoped repair triggers for `adhdice_task_history_facts`,
`adhdice_task_schedule_boundaries`, `adhdice_task_occurrences`,
`adhdice_task_occurrence_effective_overrides`,
`adhdice_task_calendar_overrides`, and `adhdice_task_behavior_selections`.
History facts are the semantic source; the History change ledger's global
`current_revision` advancement does not independently invalidate unrelated
projections. It adds conservative owner-wide repair triggers for TaskType
behavior profiles, named Custom ruleset identities/revisions, logical-day
profile changes, and History sync epoch/protocol changes. Clean Task
`task_type`/`custom_ruleset_id` changes repair the entity, while tracking
exclusion and hierarchy parent changes use one bounded recursive subtree helper.
Malformed, cyclic, orphaned, or over-depth owner hierarchies fail closed to
owner-wide repair.

The existing behavior-policy source fence remains authoritative and now also
includes a bounded tracking-ancestry snapshot and effective exclusion value.
This closes the race where an old child candidate could otherwise pass the
trusted writer after an exclusion change that did not change
`canonical_revision`. The helpers only update existing projection validity and
`updated_at`; they never create rows, write canonical state, write History,
create occurrences, or calculate projection values. No automatic rebuild is
attached to these source triggers; the existing fresh-committed-command Edge
shadow rebuild remains the only automatic materialization path.

### 7.15.24 source invalidation matrix

| Source / field | Semantics and mutation path | Canonical revision necessarily changes? | Scope | Automatic rebuild | Legacy fallback |
| --- | --- | --- | --- | --- | --- |
| `adhdice_clean_tasks.canonical_revision` | Canonical Task State command / canonical hierarchy paths | Yes when that canonical path commits; proven by the live Task trigger path | Entity | Existing canonical-revision trigger plus the fresh-committed-command Edge shadow | Required until cutover |
| `adhdice_task_history_facts` | Canonical History insert/update/delete from command and History paths | No for arbitrary source-table DML; History sync ledger only advances global revision | Entity | No source-trigger rebuild | Required |
| `adhdice_task_schedule_boundaries` | Canonical schedule boundary writes and direct table mutations | Not proven for every writer | Entity | No source-trigger rebuild | Required |
| `adhdice_task_occurrences` | Canonical occurrence materialization/resolution writes | Not proven for every writer | Entity | No source-trigger rebuild | Required |
| `adhdice_task_occurrence_effective_overrides` | Canonical delay/effective-due writes | Not proven for every writer | Entity | No source-trigger rebuild | Required |
| `adhdice_task_calendar_overrides` | Canonical calendar override writes | Not proven for every writer | Entity | No source-trigger rebuild | Required |
| `adhdice_task_behavior_selections` | Effective-dated selection RPC and authenticated table DML | No universal proof | Entity | No source-trigger rebuild | Required |
| TaskType behavior profiles | Authenticated owner DML; rare effective-dated policy edits | No | Owner | No source-trigger rebuild | Required |
| Custom ruleset identity/revisions | Authenticated table DML and named-ruleset soft-delete RPC | No | Owner | No source-trigger rebuild | Required |
| `clean_tasks.task_type/custom_ruleset_id` | Canonical behavior-selection RPC / authorized Task writes | Not for every mutation path | Entity | No source-trigger rebuild | Required |
| `adhdice_user_profiles.timezone/day_start_time/settings_revision` | Profile update; the live BEFORE trigger advances settings revision for timezone/day-start changes | Timezone/day-start: yes through the profile trigger; not a sufficient projection invalidation boundary by itself | Owner | No source-trigger rebuild | Required |
| `adhdice_task_history_sync_state.sync_epoch/protocol_version` | History protocol/reset authority; normal `current_revision` changes are excluded | No | Owner | No source-trigger rebuild | Required |
| `clean_tasks.exclude_from_tracking` | Tracking-exclusion RPC/bulk path; ordinary revision only | No | Subtree | No source-trigger rebuild | Required |
| `clean_tasks.parent_task_id` | Canonical hierarchy move path | Moved Task/direct role changes may; deeper descendants need not | Moved subtree | No source-trigger rebuild | Required |

The pure future-consumer gate is `isCurrentTaskProjectionFresh()` in
`src/lib/task-current-projection-freshness.ts`. It accepts only a valid row with
supported schema/algorithm versions, matching user/entity and entity kind,
matching Task canonical revision and History sync epoch, matching profile
settings revision, and the current projected logical date. It is groundwork
only: no consumer cutover and no History startup removal occurred.

The runtime version is now `7.15.24`; Edge deployment status is unchanged.

## 2026-09-23 7.15.23 Scalable Current Projection Backfill Candidate Query

The backfill candidate-discovery failure paused at 382 valid projections and
137 eligible Tasks still missing projections. Candidate discovery failed before
the first projection write: the old Edge path loaded every projected
`entity_id` and serialized hundreds of UUIDs into an unbounded PostgREST
exclusion request.

The new backend-only
`adhdice_list_missing_task_current_projection_candidates(uuid, integer, uuid)`
RPC performs the owner-scoped `NOT EXISTS` candidate selection in PostgreSQL,
with deterministic ID keyset ordering and a hard 1–10 limit. The Edge function
now receives at most ten UUIDs per request while retaining serial rebuilds, one
retry for retryable projection fences, failure continuation within a batch,
and the authoritative missing-count RPC.

No projection semantic change, canonical Task/History change, task-state-command
change, consumer cutover, or live backfill occurred. The SQL patch was applied
only after fail-closed prerequisite checks, and only
`task-current-projection-backfill` was redeployed as ACTIVE v3 with
`verify_jwt=true`. Andrew's manual QA remains: click `Backfill 50 Projections`
once.

## 2026-09-23 7.15.22 Stale Workflow Rollover Without Occurrence

This release corrects the 7.15.21 QA failure where a stale in-progress Task
without `workflow_occurrence_id` was planned with a non-null History
`scheduled_due_on`. The planner/Edge path now keeps the stale-workflow History
fact occurrence-unbound while preserving the stale logical date, workflow
clearing, rewards, Achievement capture, compatibility projection, and
projection shadow maintenance. A canonical workflow occurrence still supplies
its own canonical ID and scheduled due date.

The 7.15.21 busy guard worked: Settings blocked backfill while the rollover
sweep was genuinely active. That sweep processed 44 commands, deferred child
Achievement evaluation, and completed one final Achievement evaluation
successfully. One no-occurrence stale-workflow Task was rejected because the
planner supplied occurrence metadata that the canonical validator correctly
refused. The root cause was planner occurrence metadata, not projection or
backfill. The correction is planner/Edge-only; no SQL was applied, no live
projection backfill ran, and the projection migration remains paused.

## 2026-09-23 7.15.21 Rollover Achievement Deferral + Backfill Count Correction

This release corrects the two findings from the 7.15.20 live QA pass. The
50-row operator completed five serial batches: 50 projection writes succeeded,
0 failed, and 0 retried. Its displayed `519 remaining` value was incorrect;
519 was the total eligible Task count, not the missing-projection count. The
actual post-run state was 89 valid projections and 430 eligible Tasks still
missing projections, with no invalid projection rows.

The same QA pass recorded two automatic `reconcile_rollover` Task State RPC
statement timeouts inside the full Achievement rebuild:
`adhdice_execute_task_state_command` -> `adhdice_evaluate_achievements` ->
`adhdice_rebuild_achievement_progress` -> insert into
`adhdice_achievement_occurrence_matches`. The active scale was 2,212
Achievement occurrences, 2,085 qualifying occurrences, and 12,285
occurrence-match rows.

The backfill Edge response now returns an owner-scoped authoritative
`remainingCount` using the same canonical-runtime eligibility and missing-row
contract as candidate selection; the operator displays that value directly.
Rollover children now use the existing trusted Task State Edge orchestration
with deferred per-command Achievement evaluation and one deterministic final
evaluation per Achievement-affecting sweep. Finalizer failure leaves committed
Tasks intact, does not persist the processed-rollover gate, and retries the
finalizer without replaying successful child mutations. Backfill controls are
disabled while the rollover coordinator is busy and a 50-row run stops between
batches if rollover becomes active.

No projection consumer cutover or automatic backfill is included. SQL and Edge
deployment status must be verified separately from this source record; Andrew
must first allow rollover to settle, then click `Backfill 50 Projections` once
for manual QA.

## 2026-09-23 7.15.20 Controlled 50-Projection Backfill Operator

The first authenticated 10-Task `task-current-projection-backfill` pilot
passed with 10/10 valid projections, canonical revision, History frontier,
logical-day revision, schedule-fence, and behavior-fence matches; there were
0 failures, 0 retries, and 5,632 ms elapsed. There were no hierarchy-stale
errors or recurring PostgREST 504s. Before the later 50-run there were 23
valid projections and 496 eligible Tasks missing projections. After the
50-run, the actual state was 89 valid and 430 missing; no projection rows were
invalid.

Settings Developer tools retain `Backfill 10 Projections` and add the
development-only `Backfill 50 Projections` operator. The 50-row operator is
bounded to five sequential 10-row Edge requests. The browser's displayed
remaining value in this release was wrong because it used the total eligible
Task count rather than the missing count; 7.15.21 moves that count into the
Edge response. Existing projection rows remain the progress authority; no
cursor is carried between requests, so failed Tasks remain eligible for a
future run.

No automatic backfill, background continuation, canonical mutation path,
History startup/read change, or projection consumer cutover was added. The
Edge function and its maximum batch size remain unchanged and were not
redeployed. Andrew's manual QA is still required: click `Backfill 50
Projections` once.

## 2026-09-23 7.15.19 Controlled Current Projection Backfill Pilot

An authenticated `task-current-projection-backfill` Edge Function and one
development-only Settings control now provide a resumable owner-scoped pilot
backfill. Each request accepts a maximum batch of 10, uses deterministic
`id` keyset pagination, selects only missing non-deleted canonical-runtime
parent/step/substep projections, and rebuilds Tasks serially through the
existing `rebuildCurrentTaskProjection()` authority. A retryable stale fence
gets one immediate retry; failures do not abort the remaining batch.

The first live pilot had **not** been run at the 7.15.19 commit time. The control is
production-gated and never runs on startup. Browser projection consumers,
History startup, and projection Realtime remain unchanged; the expected live
projection count before Andrew's manual click remains 5.

## 2026-09-23 7.15.18 Contain Runaway Task Hierarchy RPCs

The browser hierarchy mutation boundary now deduplicates identical in-flight
intents, blocks the exact expected-revision intent after a `40001` stale
conflict, and coalesces one authoritative workspace refresh without retrying
the stale move. Success, different Tasks, and explicit later intents with
fresh revisions remain independent. No render/effect, dragover/pointermove,
timer, visibility, or retry caller was found in the checked-in Table/List
paths.

The hierarchy RPC source now performs a cheap owner-scoped revision check
before taking the Task row lock and repeats the revision fence after locking.
`supabase/patch_task_hierarchy_move_7_14_34.sql` remains source-only; it was
not applied to live Supabase. No projection backfill, projection read cutover,
History startup change, or task-state-command v38 change was made. GitHub
Pages deploys from `main`, whose current tracked source is still 7.14.46 and
does not contain this containment fix; public deployment must receive the fix
before normal hierarchy use resumes.

## 2026-09-23 7.15.17 Controlled Live Current Projection Infrastructure Rollout

The reviewed current Task projection infrastructure is installed live in
Supabase project `mnwcuinnshsncqrhvsks`. The locked 7.15.12 schema,
7.15.14 persistence trigger/writer, and 7.15.15 source-fence authority were
applied individually and verified by the read-only 7.15.16 SQL. The projection
table remains at 0 rows: no backfill occurred, no test Task or user Task was
mutated, and no projection Realtime path was added.

The `task-state-command` Edge Function was deployed from `codex/7.15` as
ACTIVE version 38 with `verify_jwt = true` and deployment SHA-256
`f6ae7d61cf1afda61293d3dbba34f558ec7915fec9efbd159243799a17d24bde`.
Shadow maintenance is active for fresh committed commands only; rejected
commands, semantic no-ops, and replays do not rebuild projections, and a
projection failure remains non-fatal to the existing command response.

The canonical command RPC was not replaced or patched; its definition
fingerprint remains `f875b0c36a844fcc101bc895fde212dc` and it remains
projection-agnostic. Canonical Task, History fact, and History ledger counts
remained 1,468, 17,535, and 115 respectively. Browser reads still use the
existing current architecture; no consumer cutover or History startup removal
occurred. Runtime web version remains `7.15.10`. Andrew's one-Task browser QA
is still required before projection QA can be called passed.

## 2026-09-23 7.15.16 Replace Fragile Projection RPC Patching + Wire Shadow Maintenance

The source-only 7.15.16 correction removes the fragile
`pg_get_functiondef`/string-replacement patch from
`patch_task_current_projection_persistence_7_15_14.sql` and removes the direct
projection invalidation block from `add_task_state_command_rpc.sql`. The locked
authority is: **canonical_revision advancement is the atomic projection
invalidation event.** An idempotent `AFTER UPDATE OF canonical_revision` trigger
on `adhdice_clean_tasks` marks only an existing owner/entity projection
`repair_required`; it never creates a missing row. Semantic no-ops and replays
do not advance the canonical revision and do not invalidate.

The canonical Task State RPC is projection-agnostic. The trusted
`task-state-command` Edge source now invokes `rebuildCurrentTaskProjection()`
only after a fresh successful committed result, using the existing 7.15.15
narrow entity loader and database-issued source fences. Rejected commands,
semantic no-ops, and replays invoke zero rebuilds. A retryable stale-fence result
gets at most one immediate retry; projection failure is logged server-side and
does not change the successful Task command response or browser contract.

Future manual install order: 7.15.12 projection schema, 7.15.14 writer and
canonical-revision trigger, 7.15.15 source fences, read-only
`verify_task_current_projection_7_15_16.sql`, then Edge deployment. SQL was not
applied, the Edge Function was not deployed, no rows were created or backfilled,
and no browser read cutover occurred. Runtime remains `7.15.10`.

## 2026-09-23 7.15.15 Harden Current Projection Source Fences and Rebuild Inputs

The source-only 7.15.15 projection patch adds one trusted PostgreSQL
`adhdice_get_task_current_projection_source_fences` authority for deterministic
schedule and behavior freshness tokens. The service-role writer recomputes that
same snapshot immediately before upsert and rejects stale candidates when
schedule boundaries, occurrences/overrides, effective behavior selections,
TaskType policy revisions, or named Custom ruleset sources changed. Future
policy rows that cannot affect the projected logical date are excluded from the
token unless they are the source's required baseline. TypeScript-local fence
serializers remain diagnostic/parity helpers; production persistence consumes
the DB-issued tokens.

Projection rebuilds now use a narrow entity-scoped canonical loader. It reads
only the target Task and required logical-day, command, schedule, occurrence,
override, History, Calendar, and behavior-selection inputs; it does not issue
unfiltered command/History reads or load reward grants/claim consumptions. A
bounded ancestor chain proves inherited tracking exclusion for Steps/Substeps,
and missing, cyclic, or cross-owner hierarchy evidence fails closed. The broad
canonical loader remains unchanged for other command paths.

This is source-only: 7.15.12, 7.15.14, and 7.15.15 SQL were not applied, the
task-state-command Edge Function was not deployed, no rebuild orchestration or
runtime read cutover occurred, and the runtime baseline remains `7.15.10`.

## 2026-09-23 7.15.14 Projection Freshness Correction + Durable Rebuild Protocol

The 7.15.13 calculator now accepts old canonical History as a valid
revision-zero `task-history-sync-v1` baseline when no entity ledger frontier
exists. A positive entity History revision still requires its matching
frontier; unrelated entity ledger changes do not invalidate a baseline Task.

The Phase 1E persistence rule is corrected to atomic invalidation plus
revision-fenced immediate post-commit materialization. A semantic canonical
command marks only an existing affected projection `repair_required` in its
transaction, then commits canonical Task/History facts without waiting for a
fully calculated projection. The new source-only trusted writer accepts only
valid service-role candidates and proves owner/Task identity, canonical Task
revision, History sync epoch and entity frontier, logical-day settings/date,
supported versions, fingerprint shape, and monotonic candidate time. A stale
or failed rebuild is retryable and never becomes a reason to roll back or
weaken canonical facts.

`rebuildCurrentTaskProjection()` is authored and tested as an entity-scoped
trusted TypeScript helper but is not wired into live command orchestration. It
uses existing canonical reads, the TypeScript calculator, and the trusted
writer; it does not load whole-workspace History or whole-user command
operations, write canonical facts, or fall back to raw Task status.

The invalidation/writer SQL is source-only: it has not been applied, no
projection backfill or Edge deployment occurred, no UI/workspace read cutover
occurred, and runtime behavior remains unchanged at `7.15.10`.

## 2026-09-23 7.15.13 Current Task Projection Calculator + Parity Harness

The pure `buildCurrentTaskProjection()` calculator now composes the canonical
Task State read-model adapter, existing evaluator, Last Handled/Last Done
semantics, effective-timeline streak authority, and entity-scoped freshness
fences into a complete in-memory `TaskCurrentProjection` row. It emits only
materialized canonical occurrence IDs, uses deterministic colon-prefixed
SHA-256 schedule/behavior/History/source fingerprints, and fails closed for
missing authority, malformed fences, contradictory occurrence state, or
unproven child tracking exclusion.

Focused parity and fingerprint tests cover current status/due/handled fields,
last handled/Done, positive/Missed streaks, recurrence and lifecycle cases,
occurrence identity, History/Calendar/policy boundaries, Custom, hierarchy,
tracking exclusion, logical-day handling, semantic ordering, and timestamp
churn. This remains a source-only shadow path: no projection rows were written,
`supabase/add_task_current_projection_7_15_12.sql` was not applied, no runtime
consumer or startup path changed, and the runtime baseline remains `7.15.10`.

## 2026-09-23 7.15.12 Current Task Projection Physical Schema Foundation

Phase 1E physical storage is now authored as a source-only additive contract.
`public.adhdice_task_current_projections` is owner-scoped and keyed by
`(user_id, entity_id)`, carries current status/due/occurrence/handled/streak
values, and is fenced by canonical Task revision, entity-scoped History
frontier plus the existing History sync epoch, schedule and behavior semantic
fingerprints, profile `settings_revision`, projected logical date, and fixed
projection schema/algorithm versions. Validity is explicitly `valid`,
`repair_required`, or `unavailable`.

The existing `adhdice_task_history_changes` ledger is reused for entity-scoped
History freshness through a new `(user_id, entity_id, sequence DESC)` index;
no second per-entity History authority was introduced. RLS permits only
authenticated owner-scoped reads, while direct browser writes remain revoked
for the future trusted command/rebuild boundary. No projection rows were
created or backfilled, and no command, Realtime, startup, consumer, Edge
Function, or live Supabase path changed.

The runtime baseline remains `7.15.10`. The 7.15.11 entry was
documentation-only and did not replace the runtime version.

## 2026-09-23 7.15.11 Lock Current Task Read Projection Architecture

Phase 1E locks the target read architecture for ordinary current Task surfaces.
Canonical History, occurrences, schedule boundaries, effective overrides,
commands, lifecycle/workflow facts, rewards, and achievements remain
authoritative evidence and rebuild sources. A rebuildable owner-scoped current
projection is designated to own the ordinary read result after cutover for
display/current Active Status, current effective and next due, active
occurrence summary, current-day handled
state, last handled/last Done values, and current positive/Missed streaks.

Projection validity is fenced by canonical Task revision, entity-scoped
History revision/fingerprint plus the existing History sync epoch, schedule
boundary revision, behavior-policy revision, logical-day settings revision,
projected logical date, and projection schema/algorithm version. The prior
strict atomic-projection-write rule is superseded by atomic invalidation plus
revision-fenced immediate post-commit materialization. Projection repair writes
no History, occurrence, reward, or achievement evidence.

The previous full canonical History startup requirement for current Active
Status, current streaks, and Task readiness is superseded. History, old
boundaries, command ledgers, and detailed occurrences become lazy/bounded
historical or explicit repair reads. Realtime and logical-day changes target
the affected entity/domain rather than broad workspace reload. The current
full-History source path remains transitional until shadow parity,
invalidation/materialization, consumer cutover, and retirement gates pass.

This was documentation/architecture only. The 7.15.12 foundation below adds
source SQL/schema/types/tests without changing runtime behavior. No live
Supabase state changed. The working runtime version remains `7.15.10`; no
runtime version bump is required for either source-only ticket.

## 2026-09-22 7.15.8 Retire Obsolete Task Grid Runtime

The retired Task Grid View runtime no longer participates in workspace
hydration, Realtime subscriptions, TaskApp state, local UI-state persistence,
derived settings revisions, or current Tasks view routing. The dormant
`adhdice_task_grid_layouts` schema/table and its historical data were not
changed or deleted. HUD shell/widget sizing and placement, HUD local/cloud
persistence, and current Table/List layout preferences remain unchanged.

## 2026-09-21 7.14.46 Consolidate Side Work into 7.14

Merged the completed `codex/Side` application work into the active `7.14`
development line while preserving the newer 7.14 Task authority, Active Status,
streak-summary, behavior-policy, hierarchy, folder, and Style Lab boundaries.

The integrated Side work includes the expanded Home To-do/Routine experience,
Routine hierarchy and ordering, Home completion and Record chases, Record
Evidence/freshness/cache work, tracking-exclusion application support, Move to
Day, task signals, row menus, and list-level long-press fast actions.

Tracking-exclusion SQL patches carried by Side remain source-only during this
branch consolidation. This merge does not apply SQL or mutate the live Supabase
schema. Native iOS work remains separate on `ios/native-development`.

## 2026-09-21 7.13.95 Home List-Level Fast Actions

Home fast-action mode is now scoped to the active Home list rather than the
Task that initiated the long press. Every eligible row in the active To-do or
Routine view expands together; any chevron collapses the shared mode, and tab
switching exits it. Existing pointer gesture and Home mutation behavior remain
unchanged.

## 2026-09-21 7.13.94 Home Gear Long-Press Fast Actions

Home To-do and Routine root gear buttons now support a 475ms pointer long
press that replaces the gear with persistent inline fast actions. Normal gear
clicks still open the existing dropdown, and long-press activation suppresses
the following click. To-do Move to day continues using the existing dropdown
destination view; Routine child rows remain unchanged.

## 2026-09-21 7.13.93 Home Row Action Menus

Home To-do and Routine anchor rows now consolidate their existing row actions
behind one compact gear menu. To-do Move to day uses the same anchored panel's
destination view, preserving Home day capacity/current disabling and the
existing Home-only mutation paths. Routine child rows remain unchanged.

## 2026-09-21 7.13.92 Home To-do Task Signals

Home To-do rows now consume the canonical Task History streak summary and
TaskApp Attention reason map beside the title. Missed streaks take precedence
with the existing Skull badge; otherwise the shared current-streak chip is
shown. Attention uses the existing TaskAttentionChip without Home-side rules.

## 2026-09-20 7.13.91 Home To-do Move to Day

Home To-do rows now expose a compact Move to day menu backed only by the
existing `taskDayOffsets` Home organization state. The menu uses the existing
seven day-section labels plus Later, disables full/current destinations, and
does not mutate Task scheduling or recurrence fields.

## 2026-09-20 7.13.90 Correct Rich Evidence Cache Payload + Safari Fallback

The client-only rich Records detail cache now writes an explicit schema-v2
payload containing only calculation time, session key, Task Evidence,
provisional candidates, and warnings. If the full localStorage write is
rejected, it retries with provisional candidates removed so current Record
Evidence can still restore. No SQL or database migration changed.

## 2026-09-20 7.13.84 Exclude Task from Tracking

Tasks now have an additive direct tracking-exclusion flag. Client tracking
projections inherit exclusion through same-table parent chains without mutating
descendant rows. The unpublished SQL patch was replaced before deployment by
the 7.13.85 correction below.

## 2026-09-20 7.13.85 Correct Tracking Exclusion Achievement Authority

The 7.13.85 version of the unpublished tracking-exclusion migration guarded
`adhdice_achievement_occurrences` before Task-derived qualification can reach
the evaluator. Exclusion dequalifies existing Task and Step-set evidence before
rebuilding progress, while re-inclusion drains the canonical resumable
Achievement recalculation cursor to completion. It was superseded before
deployment by 7.13.86, which remains source-only until manually applied and
verified; the unsafe 7.13.84 and superseded 7.13.85 migration files are no
longer present.

## 2026-09-20 7.13.86 Final Tracking Exclusion Authority + Cache Correction

The unpublished tracking-exclusion migration now scopes every Task-derived
Achievement evaluation and re-inclusion recalculation identity to the updated
Task revision, so repeated exclude/include toggles cannot replay an earlier
completed operation. Successful Task editor tracking mutations invalidate every
in-memory Records session snapshot for the current user; Record Evidence keeps
its explicit refresh after closing stale detail. The 7.13.86 migration remains
source-only until manual application and live verification.

## 2026-09-20 7.13.87 Bulk Record Evidence Tracking Exclusion

Record Evidence now deduplicates Task-level selections across repeated evidence
occurrences and submits one authenticated bulk exclusion RPC. The RPC validates
the complete request atomically, increments revisions only for direct flag
changes, blocks applicable pending rewards once, dequalifies affected
Task/Step-set Achievement evidence, and evaluates current Achievement progress
once. TaskApp reconciles returned Task rows, invalidates the current user's
Records session cache, and refreshes streak summaries once. Records closes stale
detail and runs exactly one explicit refresh with the existing pipeline stage
text while showing blocking progress. The 7.13.87 migration remains source-only
until manual application and live verification.

## 2026-09-20 7.13.88 Durable Records Freshness + Home Loading UX

Records now uses a narrow authenticated freshness RPC over the owner-protected
reconciliation metadata, with a 12-hour saved-result bootstrap, user-scoped
invalidation, and best-effort local rich Evidence details. Home shows explicit
loading status for Finished Today and saved Record targets, and the bulk Task
exclusion merge starts from the latest canonical Task state. The
`supabase/patch_records_freshness_read_7_13_88.sql` migration is source-only
until manual inspection and application.

## 2026-09-20 7.13.83 Fix Cached Record Detail Open Race

Records now opens a requested successful global Record synchronously inside the
deep-link effect, then marks the metric consumed and acknowledges the request.
The effect no longer defers the detail state update with a timer that cleanup
could cancel on the cached path. Missing Records retain the synchronous
consume-and-acknowledge fallback.

## 2026-09-20 7.13.82 Fix Cached Home Record Deep-Link Handoff

Home Record deep-links now keep the pending metric request until the Records
tab has a successful cached or freshly loaded projection and schedules the
matching global Record detail overlay. The Progress page no longer acknowledges
the request merely because it mounted; the Records consumer owns that handoff.

## 2026-09-19 7.13.81 Records Session Snapshot Across Navigation

Records now retains the complete successful in-memory UI projection in a
module-level session cache keyed by user, rules version, timezone, and logical
day start. Returning to Records restores current cards, events, provisional
candidates, Task evidence, warnings, and calculation time without rerunning
the pipeline. Explicit Refresh Records bypasses the cache and replaces it only
after a successful calculation; failed refreshes retain the prior snapshot.
Persisted Records rows and compact evidence schema v2 remain unchanged.

## 2026-09-19 7.13.80 Record Evidence Verification

Current Task-based aggregate Record details retain the exact Task/Step
occurrences from the successful in-memory Records evaluation for
`parent_tasks_day`, `parent_tasks_week`, `parent_tasks_month`, `steps_day`,
`steps_week`, `steps_month`, and `permanent_completes_day`. The detail overlay
shows chronological evidence rows, verifies the reconstructed count against
the Record value, and opens available Tasks through the existing shared editor.
Persisted Records continue using compact evidence schema v2; detail opening does
not run another Records query or pipeline.

## 2026-09-19 7.13.79 Deep-link Home Record Chases to Progress Records

Home Records to Beat rows now navigate to the existing Progress page, select
the Records tab, and open the matching global durable Record detail overlay by
metric key. No new AppPage, Records persistence, or Records pipeline was
introduced; the existing Records tab remains the source of the detail view.

## 2026-09-19 7.13.78 Add Finished Today Details and Correct Record Loading

Home now presents a unique-entity Finished Today summary grouped by canonical
Done, Did My Best, and Completed outcomes, with an expandable list of the
finished Tasks and Steps. The Home record-target loader now invokes its async
read lifecycle, so the Records to Beat panel can resolve its narrow persisted
target query instead of remaining in its initial loading state. Records remain
occurrence-based and Home does not run reconciliation or the Records pipeline.
No SQL or schema change was made.

## 2026-09-19 7.13.77 Add Home Daily Completion and Record Chases

Home now shows compact Daily Tasks Completed and Records to Beat panels above
the existing To-do/Routine workspace. Daily completion uses the shared loaded
Task History snapshot and `todayKey`, with unique Task entities in the summary
and canonical occurrence values for the three daily Records metrics. Home reads
only the persisted current targets for those metrics, does not run Records
reconciliation, and treats timezone/day-start mismatches as stale. No SQL or
schema change was made.

## 2026-09-19 7.13.73 Named Routine Sections and Quiet Routine Metadata

Home Routine now uses named ordinal Sections backed by Home state V5, migrating
the persisted V4 `routinesPerPhase` capacity without changing Routine
membership, hierarchy, or order. Routine rows show their own due metadata and
canonical History streak summaries, with missed streaks taking precedence over
active streaks. Home save/sync status remains internal and background
persistence remains unchanged; no SQL or schema change was made.

## 2026-09-19 7.13.74 Add Routine Top / Bottom Controls

Home Routine now exposes the existing Top and Bottom ordering controls on
directly displayed Routine anchors. The controls update the persisted flat
Routine order, so inherited Steps/Substeps move with their parent group while
ordinal Section names remain unchanged. To-do ordering and all other Home
Routine semantics are unchanged.

## 2026-09-19 7.13.76 Keep Complete Confirmation on the Initiating Page

Complete confirmation is now rendered by an app-level `TaskEditFlows`
instance using the existing `pendingCompleteAction` state. Tasks retains the
other workspace-only flows while passing `completeFlow={null}`, so Home,
shared-editor, Table, and List Complete actions show one confirmation over the
current surface without changing Complete semantics or page routing.

## 2026-09-19 7.13.75 Drag Routine Steps/Substeps Within Their Parent

Home Routine now exposes a compact child drag handle for visible Steps and
Substeps. Drops are restricted to visible siblings with the same immediate
parent and hierarchy depth, and valid before/after placements reuse TaskApp's
canonical `reorderChildTask` path. Root Routine anchors still use Home's
`routineTaskIds` ordering, while To-do behavior and Home child-order
persistence remain unchanged. No SQL or schema change was made.

## 2026-09-19 7.13.71 Routine Hierarchy, Ordering, and Phase Sections

Home Routine now derives hierarchical groups from direct Routine membership and
the canonical Task hierarchy. Group-anchor ordering and Routines-per-Phase are
persisted in the existing JSON-backed Home state, while Phase sections remain a
projection of that flat order. No Task hierarchy, Task ordering, SQL, or schema
changed.

## 2026-09-19 7.13.72 Protect Routine Order During Home State Hydration

Home state hydration now defers Routine order reconciliation until hydration
is resolved and bootstraps meaningful V4 Routine/capacity state even when
To-do IDs are empty. No Task-domain, SQL, or schema changes.

## 2026-09-18 7.13.68 Home To-do Metadata and Strict Daily Capacity

Home To-do quick creation now carries due date/time, recurrence cadence, tags,
numeric priority, and resolved Task Type metadata through the canonical Task
creation path. Home day projection treats Tasks Per Day as a hard capacity for
all seven normal sections, spilling preferred-day overflow forward and then to
Later without rewriting durable offsets or Task rows.

## 2026-09-18 7.13.69 Correct Home New Task Metadata UI

Home New Task keeps its 7.13.68 metadata and canonical creation behavior while
using the current Edit Task input, chip, cadence, and tag presentation directly
inside the composer. The legacy Task Details accordion and field components are
no longer used by Home.

## 2026-09-18 7.13.70 Merge Home To-do and Routine Tabs

Home now presents To-do and the built-in system-owned Routine list in one tabbed
task panel. To-do retains its seven-day planning and strict capacity projection;
Routine uses existing Routine memberships as an unlimited active-task list with
explicit membership removal and search/new-task enablement.

## 2026-09-21 7.14.40 Batch Task Type Changes and Determinate Operation Progress

Batch Edit now exposes the shared Task Type and named Custom Task Type choices,
routes each changed selection through the existing effective-dated behavior
authority, skips already-correct Tasks, and preserves canonical schedule and
History projections. The existing Batch Edit progress banner now presents a
real accessible determinate bar for known-count operations with failure and
skip counts. Browser QA remains Andrew's responsibility.

## 2026-09-20 7.14.39 Preserve Canonical Recurrence Across Metadata Updates and Enable Multi-Select Clear

Metadata-only Task Type, named Custom ruleset, and other Task-row responses now
reapply the existing canonical schedule projection without creating or mutating
a schedule boundary. Calendar History Clear is available for a multi-selection
only when every selected persisted entry is individually clearable, then uses
the existing sequential canonical clear path and one refresh. Browser QA remains
Andrew's responsibility.

## 2026-09-20 7.14.38 Use the Effective Behavior Policy Boundary for Current Missed Streaks

Current Missed streak reset now follows the effective policy revision inside the
active Task behavior selection. TaskType and named Custom revisions can reset
current no-miss projections at their own effective logical date, while explicit
History facts, historical policy interpretation, Calendar facts, and positive
streaks remain unchanged. Browser QA remains Andrew's responsibility.

## 2026-09-20 7.14.37 Correct Current Missed Projections Across Behavior Boundaries

Current Active Status and Missed streak projections now honor the effective
behavior-selection segment. Historical Missed facts and Calendar dates remain
unchanged, and no History cleanup or SQL change is included. Browser QA remains
Andrew's responsibility.

## 2026-09-20 7.14.36 Batch Unlink Selected Task Hierarchy Rows

The shared Task context menu can now unlink selected child Tasks in one
canonical hierarchy batch. The browser snapshots the hierarchy, processes
selected descendants deepest-first, preserves each root Task's Folder, and
reconciles each committed row without changing the hierarchy RPC contract or
SQL. Browser QA remains Andrew's responsibility.

## 2026-09-20 7.14.33 Canonical Task Hierarchy Move Path

Step/Substep detachment, parent moves, and direct Task Content Folder moves now
use the dedicated atomic `adhdice_move_task_hierarchy` authority. It owns the
mutually exclusive parent/Folder fields, applies revision fencing, preserves
root Folder inheritance on detach, and returns the committed Task row for local
reconciliation. Historical History facts and schedule boundaries are not
rewritten. The source SQL remains unapplied pending explicit database rollout;
browser QA remains Andrew's responsibility.

## 2026-09-20 7.14.35 Search Task Content Folders as Semantic Containers

Canonical Task search now indexes each root Task's inherited Task Content Folder
path, so matching Folder names reveal eligible contained Tasks while selected
list, status, energy, and structured filters remain intersections. Active search
also hides unrelated empty Folder branches; a directly matched actually empty
Folder may remain as structural search context. Browser QA remains Andrew's
responsibility.

## 2026-09-20 7.14.34 Reconcile Descendant Roles During Hierarchy Moves

The canonical hierarchy move authority now returns the moved Task plus each
direct canonical child whose current `entity_kind` changes because of the move.
Those rows receive coordinated canonical projection revisions in the same
transaction; grandchildren and unchanged child roles are not rewritten. The
browser keeps the moved Task and direct children pending until every returned
row is reconciled locally. The 7.14.34 replacement SQL is authored but remains
unapplied pending review; do not apply the earlier 7.14.33 patch separately.
Browser QA remains Andrew's responsibility.

## 2026-09-20 7.14.32 Keep Empty Folders Visible in All

The All Task list now authoritatively retains empty Task Content Folder rows
even when stale hierarchy, search, or structured filter state is present. Table
and List pass their actual current list ID through the shared visibility helper;
projection, nesting, ordering, collapse, and persistence remain unchanged.
Browser QA remains Andrew's responsibility.

## 2026-09-19 7.14.31 Reveal Newly Created Empty Folders

Structural empty Task Content Folders now sort before Task-anchored content
within their container, with deterministic `created_at`/`id` ordering. Creating
a child Folder under a collapsed parent explicitly expands that parent after a
successful create; existing collapse-state persistence remains unchanged.
Browser QA remains Andrew's responsibility.

## 2026-09-19 7.14.30 Fix False Search Gate Hiding Empty Folders

Task Content Folder empty visibility now uses only real search, hierarchy/status,
and structured-filter state. Search-selection result IDs no longer hide truly
empty Folders during ordinary Today/List browsing. Browser QA remains Andrew's
responsibility.

## 2026-09-19 7.14.29 Keep Truly Empty Task Content Folders Visible

Normal Task browsing now keeps Folders that are empty across the broad Task
universe visible in All, Today, Routine, Attention, and custom Lists. Folders
whose Tasks are filtered out remain hidden unless retained as ancestry for a
genuinely empty descendant. Table and List use the same actual-empty Folder
calculation and recursive projection. Browser QA remains Andrew's
responsibility.

## 2026-09-19 7.14.28 Finish Nested Folder Runtime Wiring and Filtered Visibility

Table Task-to-Folder movement now uses the exact shared callback prop, and Table
and List use one `shouldIncludeEmptyTaskContentFolders` decision: empty Folder
containers appear only in the broad, unfiltered All workspace while filtered
results retain only the ancestor context required by matching Tasks. The
checked-in nested migration was applied to live ADHDice project
`mnwcuinnshsncqrhvsks` as migration
`20260920020454 add_nested_task_content_folders_7_14_27`. Live schema,
constraint, trigger, function, and disposable authenticated promotion/cycle
checks passed with QA rows cleaned up. Security Advisor showed no new
nested-Folder finding; browser QA remains Andrew's responsibility.

## 2026-09-19 7.14.27 Add Nested Task Content Folders

Task Content Folders now use an owner-scoped `parent_folder_id` hierarchy with
application and database cycle protection. Table and List consume one shared
recursive projection that preserves Task order, filtered ancestor context,
independent collapse state, empty child Folders, and subtree Pin/Routine/
Attention/count semantics. Add Folder, Move Folder, nesting-aware Create
Folder, and transactional delete promotion preserve Folder identity and keep
Tasks outside Folder hierarchy. The additive migration and schema source are
authored but have not been applied to a live Supabase project in this worktree;
browser QA remains Andrew's responsibility.

## 2026-09-19 7.14.26 Restore Routine Assignment and Typed Folder Task Creation

Routine remains an app-owned system list while its dedicated Task and Folder
toolbar actions can persist manual membership through
`adhdice_task_list_manual_memberships`. Folder Add Task now uses a compact
left-aligned card with the shared Task Type selector, resolves active named
Custom identities before canonical Task creation, and assigns the created Task
to the Folder afterward. Browser QA remains Andrew's responsibility.

## 2026-09-19 7.14.25 Keep Folder Actions Beside the Title

Folder headers keep their full-width surface while using content-sized title
regions and a wrapping left-aligned action group, so Table and List controls
remain reachable without horizontal scrolling to the table edge.

## 2026-09-19 7.14.24 Polish Folder Rows and Refresh Missed Streaks

Folder headers now share bounded inline rename sizing and aggregate member
quick actions across Table and List, while remaining presentation-only
containers. Logical-day rollover, visibility resume, and refreshed History
snapshots now invalidate the shared Task streak-summary loader so current
Missed badges do not remain stale across a day boundary.

## 2026-09-16 7.14.0 Start Development Line

Version 7.13.81 was the completed consolidated 7.13 web release, and `main`
was advanced to that release. `ios/native-development` was merged with
consolidated `main`, and the native device build passed. Version 7.14.0 starts
the next active development line. No product behavior changed in this version
bump.

## 2026-09-16 7.13.81 Consolidate Side and Journal Web Work

Version 7.13.81 consolidates the unique Side and frozen Journal web work into
the current 7.13 branch. Typed Journal check-ins, event capture, configurable
questions, structured answers, occurrence display, Journal summaries,
quota-safe local persistence, and related Health integration are preserved.
Focus activity bars retain goal-normalized fills and overtime markers, and
Food retains projected-calorie goal warnings and status coloring.

The current 7.13 Task, Task State, Effective Timeline, current-policy backlog,
Success Outcomes, named Custom Task Type, presentation, child-creation,
Attention, recurrence, and reward architecture remains authoritative. The
Journal migration was originally authored as source-only during implementation,
but is now verified live in production project `mnwcuinnshsncqrhvsks` as
registry migration `20260912160312 add_health_journal_checkin_types_7_13_43`.
Production schema verification confirmed `journal_questions` and
`structured_answers` are non-null JSONB with their array/object defaults,
`entry_type` is nullable text with the expected three-value check, and all
expected Journal constraints exist. HealthKit persistence migration
`20260828210906 patch_healthkit_persistence_7_11_99` and Active Energy calorie
goal migration `20260829015901 add_health_active_energy_calorie_goal_7_12_3`
are also recorded live. `task-state-command` v37 remains the current deployed
Edge Function, pinned to 7.13.80 commit
`f9fa56cd7c03ba8e2c9a20511d5b2d2b8529c886`; no redeploy was required for 7.13.81.

## 2026-09-16 7.13.67 Color Projected Calories by Goal Status

Food Daily Totals now colors only the projected calorie amount green when it
is within the target and red when it exceeds the target. A missing target keeps
the projected amount neutral; consumed calories and all projection behavior
are unchanged.

## 2026-09-16 7.13.66 Add Projected Food Calories and Goal Warning

Food Daily Totals keeps consumed calories as the main value while showing
projected calories from active planned food when present. The shared meal
editor warns informationally when consumed, active planned, and live candidate
calories exceed the date-specific Active Energy-adjusted target; editing a plan
excludes that plan's prior calories before adding the candidate.

## 2026-09-15 7.13.65 Add Overtime Goal Marker to Focus Activity Bars

Goal-backed Focus Activity bars keep their fixed full-height tracks and capped
fills. When actual activity exceeds the displayed goal, a dashed goal marker
moves downward using the goal-to-actual ratio; no-goal bars retain their
relative-duration fallback and show no marker.

## 2026-09-15 7.13.64 Normalize Focus Activity Bars to Goal Completion

Focus Activity bars now use one shared full-height track. Goal-backed fills
represent actual time divided by the relevant goal and cap visually at 100%;
no-goal rows retain a relative-duration fallback and continue to show `No goal`.
Existing Focus Activity labels, modes, ranges, persistence, and goal authority
are unchanged.

## 2026-09-12 7.13.47 Journal QA Corrections

Journal Event and Start/End check-in controls use the compact time presentation
with a unified keyboard-accessible AM/PM control. Event Feeling occurrence
editing is viewport-safe, and Start of Day and End of Day expose explicit
mutually exclusive Yes/No choices. Historical Event notes remain preserved in
structured answers and summaries. Browser QA remains unverified.

## 2026-09-12 7.13.46 Event-Centered Feeling Logging

Type-driven Journal Events own tagged symptom and Feeling occurrences. Start of
Day and End of Day can optionally create and link one canonical Event while
preserving independent Event date/time and edit/retry identity. Browser QA
remains unverified.

## 2026-09-12 7.13.45 Journal Occurrence Date and Time Labels

Journal Feeling and symptom occurrence references show the occurrence name,
canonical score denominator, local calendar date, and local time across saved
Journal summaries and linked history references. Browser QA remains unverified.

## 2026-09-12 7.13.44 Health/Journal LocalStorage Quota Hotfix

Health local-cache persistence treats quota and unexpected browser storage write
failures as non-fatal. React state updates before the cache pass, quota failure
stops remaining cache writes without deleting Health or pending meal-plan keys,
and remote Supabase hydration continues. Browser QA remains unverified.

## 2026-09-12 7.13.43 Type-Driven Journal Check-ins

Journal supports Start of Day, End of Day, and Event entry types with structured
answers, linked Sleep/Food/Feeling data, open-ended writing, and configurable
historical-safe custom check-in questions. The additive Journal schema
migration was authored source-only and was not deployed during that
implementation run; its current live production application is recorded in
the 7.13.81 entry above. Browser QA remains unverified.

## 2026-09-15 7.13.73 Child Task Type Surface and Keyboard Navigation

Version 7.13.72 fixed selected Task Type retention in an open Table child draft;
browser QA passed pointer selection and Substep creation. The remaining
presentation polish was the reduced child accent footprint compared with parent
rows, and the remaining accessibility/input issue was browser page scrolling
on arrow keys while TaskTypeSelect had focus.

Version 7.13.73 aligns Table Step/Substep surface padding with the parent Task
row and adds explicit keyboard listbox navigation with trigger-retained focus.
No persistence, schema, or behavior-policy change was made.

## 2026-09-15 7.13.74 Stronger Custom Table Child Accent Surface

Version 7.13.73 browser QA passed Task Type pointer and keyboard navigation,
selected-value retention, Step/Substep creation, portal/layering, and title
geometry. Child surface size matched the parent through `py-1.5`, but named
Custom Step/Substep fills still appeared too faint; the generic purple Table
shadow could also muddy a non-purple Custom accent.

Version 7.13.74 adds a stronger TABLE CHILD surface authority to the shared
Task Type accent registry and applies it to normal same-table Step/Substep
preview rows and source/same-table child rows. Standard child Tasks remain
neutral, child rows retain `py-1.5`, and child hover elevation no longer uses
the generic purple shadow. Parent Task surface styling, TaskTypeSelect keyboard
behavior, child creation semantics, persistence, schema, and behavior policy
are unchanged.

## 2026-09-15 7.13.75 Remove Table Child Row Shadows

Browser QA for 7.13.74 confirmed that stronger Custom Step/Substep accent fills
were correct, but a residual purple hue remained from Table row shadow/elevation.
Version 7.13.75 removes resting/reveal and hover box shadows from normal
same-table Step/Substep rows and source/same-table child rows entirely.

The stronger shared child accent surfaces, neutral Standard child treatment,
`py-1.5`, focus-visible treatment, selection/accessibility treatment, parent
Task styling, TaskTypeSelect behavior, and child creation semantics are
unchanged. No persistence, schema, or behavior-policy change was made.

## 2026-09-15 7.13.76 Unified Table Parent/Child Accent Surface

Version 7.13.75 removed child row shadows, but browser QA still showed a
parent/child shade mismatch. Diagnosis confirmed that parents used the weaker
Table surface authority while children used the stronger child-only authority;
parents also retained purple hover/reveal shadows.

Version 7.13.76 gives all Table hierarchy rows one shared stronger accent
authority and removes Table row hover/reveal shadows. Each child still resolves
its own Task Type independently, Standard rows remain neutral, and non-Table
surfaces are unchanged. No persistence, schema, or behavior-policy change was
made.

## 2026-09-15 7.13.77 Accent-Aware Table Row Hover Border

Browser QA for 7.13.76 passed the unified parent/child Table fills and removed
shadows, but the loss of shadow made row hover identification too subtle.
Version 7.13.77 adds a semantic Task Type hover border for every Table
hierarchy row while preserving the exact row fill, reserved border width,
selection rings, focus-visible treatment, and existing hover motion. No
persistence, schema, or behavior-policy change was made.

## 2026-09-16 7.13.78 Configurable Success Outcomes

Version 7.13.77 closed the Custom Task Type presentation and child-creation QA
loop. Version 7.13.78 adds effective-dated configurable Success Outcomes to
Standard Task profiles and named Custom Task Type revisions. The allowed
outcomes are Done, Did My Best, and Complete; selected outcomes advance the
positive streak, while a handled positive outcome that is not selected breaks
it. An unresolved scheduled occurrence still breaks the positive streak.

Operational handled-outcome, reward, and recurrence semantics remain
independent and unchanged, and no positive-streak tracking toggle was added.
The source-only migration is
`supabase/add_success_outcomes_policy_7_13_78.sql`; live Supabase application
is recorded as live in 7.13.79 below. The trusted `task-state-command` uses the
same shared policy loader and its v36 / 7.13.79 deployment is also recorded
below. No behavior-policy beyond the requested Success Outcomes setting was
changed.

## 2026-09-16 7.13.79 Consolidated Schema Consistency

Version 7.13.79 is a source-schema consistency correction only. The
consolidated `supabase/schema.sql` now matches the 7.13.78 Success Outcomes
migration for both behavior tables, including the default, allowed vocabulary,
null-element prohibition, and valid empty-array behavior.

7.13.78 Success Outcomes behavior is unchanged. The Success Outcomes SQL is
live, and task-state-command v36 / 7.13.79 was deployed.

## 2026-09-16 7.13.80 Current-Policy Backlog Resolution During Schedule Replay

Live QA exposed that schedule replay used the historical effective-dated
policy when deciding whether newly unresolved backdated obligations should
become automatic Missed facts. Version 7.13.80 restores the invariant that the
current behavior policy controls new unresolved backlog resolution: a current
`blank` policy leaves past obligations calculated as unhandled blank, while a
current `missed` policy continues to materialize automatic Missed facts.

Existing explicit History facts remain interpreted by the behavior policy
effective on their historical logical date. Success Outcomes semantics remain
unchanged, no existing QA History rows are rewritten, and no schema change was
made.

## 2026-09-14 7.13.65 List View Child Preview Crash Hotfix

Browser QA for 7.13.64 exposed a List View runtime `ReferenceError` because
`StepsCardPreview` used `customBehaviorRulesets` without destructuring it from
its props. Version 7.13.65 binds the existing optional prop with an empty-array
default, restoring List rendering with no behavior or persistence change.

No behavior policy, Task State, History, recurrence, streak, reward, or Task
Type creation semantics changed. No SQL or schema change was made.

## 2026-09-15 7.13.69 Exact Inline Table Child Title Editor Treatment

Version 7.13.68 aligned the inline child title with the shared Table text class,
but browser QA still showed a visual mismatch. The remaining difference was
the draft input geometry and the explicit parent inline-title typography style.
Version 7.13.69 makes parent Task rename, existing Step/Substep rename, and new
Step/Substep creation consume the same exact inline-title authority.

No persistence or behavior change was made. No SQL or schema change was made.

## 2026-09-15 7.13.70 Vertical Breathing Room for New Child Title Input

Version 7.13.69 fixed the Step/Substep draft typography mismatch, and browser
QA confirmed that the text size, weight, line height, and general typography
were correct. The remaining issue was insufficient vertical space inside the
new child creation input because it inherited the compact `h-[15px]` rename
geometry. Version 7.13.70 separates the shared inline-title typography from
rename geometry and makes only the new Step/Substep creation field taller at
approximately 24px, with no persistence or behavior change.

No SQL or schema change was made.

## 2026-09-15 7.13.71 Safari Task Type Selection Child Draft Guard

Browser QA for 7.13.70 confirmed the child-title typography and vertical
breathing room, then exposed Safari blur-to-commit firing during portaled Task
Type interaction. Version 7.13.71 replaces relatedTarget-only inference with an
explicit Task Type pointer-interaction guard. Selecting a Task Type closes only
the dropdown and preserves the open child draft and title.

No persistence, SQL, schema, or behavior-policy change was made.

## 2026-09-15 7.13.72 Preserve Selected Task Type in Table Child Draft

Version 7.13.71 added explicit Task Type interaction authority, but Table View
mistakenly attached its callbacks to the title input instead of `TaskTypeSelect`.
Version 7.13.72 corrects that wiring so a chosen named Custom Task Type remains
selected in the open Table child draft until explicit child creation. List View
was already wired correctly, and full-editor child creation does not use the
same blur-to-commit path.

No persistence, SQL, schema, or behavior-policy change was made.

## 2026-09-14 7.13.68 Inline Table Child Title Typography

Version 7.13.67 fixed compact Task Type chooser sizing and layering for inline
child creation. Final browser polish found that the inline child title input
looked visually larger than existing written Table titles. Version 7.13.68
reuses the shared visible-title typography and aligns the draft input to the
same compact control height as the inline Task Type chooser.

No behavior or persistence change was made. No SQL or schema change was made.

## 2026-09-14 7.13.67 Compact Table Child Task Type Chooser

Version 7.13.66 made Step Task Type selection column-independent, but browser QA
then found that the inline control was oversized and its locally positioned
dropdown could be obscured by later Table rows. Version 7.13.67 adds a compact
inline presentation for dense Step/Substep creation and renders the selector
menu through the existing top-level dropdown shell with viewport-safe anchored
placement.

No persistence or Task behavior change was made. No SQL or schema change was
made.

## 2026-09-14 7.13.66 Table Step Task Type Selector Placement

Version 7.13.65 fixed the List View child-preview crash. Continued browser QA
found that the Table Step selector depended on the optional Task Type column:
when that column was hidden, the inline Step draft exposed no Task Type control.
Version 7.13.66 makes Task Type part of the inline title creation control itself
and renders the visible Task Type column as a read-only mirror.

No persistence or Task behavior change was made.

## 2026-09-14 7.13.64 Custom Task Type Presentation QA and Child Creation

Browser QA for 7.13.63 passed the primary presentation checks, then identified
three follow-up issues: neutral Table rows had visible outlines, icon browsing
and search were limited to the featured registry, and inline child creation
was still hardcoded to Standard Task. Version 7.13.64 corrects these paths.

Table neutral Tasks now visually blend into the Table background while named
Custom Task Type fills remain visible. Default icon browsing offers 120+ common
icons, while non-empty searches cover the full installed Lucide directory using
the shared dynamic-icon authority. Inline Step/Substep creation now supports
Task and active named Custom Task Types, with the selected identity persisted in
the initial canonical child draft and reset after success or Cancel.

No Task behavior semantics changed. No SQL or schema change was made.
## 2026-09-13 7.13.63 Custom Task Type Presentation QA Correction

Browser QA for 7.13.62 exposed three presentation issues: selected Custom Task
Type tabs did not maintain white text on the selected purple chip, Custom Task
Type accent identity stopped at Task Type controls instead of identifying the
actual Task row/card, and the icon registry was too limited to discover useful
choices. Version 7.13.63 corrects these presentation-only issues. The shared
Task Type presentation authority now supplies restrained accent-tinted surfaces
for real Task rows, cards, secondary Task surfaces, and PATHS Task nodes while
preserving normal content/status colors and selected/open/hover states. The icon
registry is substantially expanded and searchable by labels and keywords.

No Task behavior semantics changed, including Task State, History, recurrence,
streaks, rewards, Available Actions, behavior policy, defaults, or persistence
shape. No SQL or schema migration was required or applied.

## 2026-09-13 7.13.62 Custom Task Type Presentation Identity

Named Custom Task Types now have presentation identity: an icon key, semantic
accent key, and optional short description. These fields live on the stable
`adhdice_custom_behavior_rulesets` identity row, not on effective-dated behavior
revisions, so presentation edits do not create policy revisions. Current Task
Type selectors and displays share the same presentation registry and renderer;
Standard Task uses an application-owned fallback only. No Task defaults were
added and no behavior semantics changed. The presentation identity migration
`supabase/20260913000000_add_custom_task_type_presentation_identity_7_13_62.sql`
was already applied live before this presentation correction.

## 2026-09-13 7.13.61 Fully Retire Goal Task Type

Goal Task Type is fully retired. The sole remaining Goal row was disposable
test data and was intentionally deleted; its Task State, History, reward, and
schedule-boundary dependencies were deleted rather than mapped, migrated,
archived, converted, or translated. The final Task Type model is ordinary Task
plus named Custom Task Type, with Pursuit and Custom Default still retired.
Milestones, milestone persistence, promotion, completion, trophy/Aura behavior,
and milestone targets remain unchanged.

The source-only migration
`supabase/retire_goal_task_type_7_13_61.sql` is not applied to live Supabase in
this run and must be applied separately before browser QA.

## 2026-09-13 7.13.60 Add Custom Task Types to Home To-do New Task Creator

The Home To-do inline New task creator now supports Task followed by active
named Custom Task Types. Task Type is chosen before persistence, and named
selection is included in the initial canonical creation draft. The existing
Home To-do membership and ordering semantics remain unchanged. Custom Default,
Goal, and Pursuit remain unavailable, and deleted named Custom Task Types stay
hidden through the shared Task Type authority.

No persistence or schema migration occurred; no SQL or Supabase change was
made.

## 2026-09-13 7.13.59 Show Named Custom Task Types in Tasks New Menu

The Tasks workspace New dropdown now exposes Task first, followed by every
active named Custom Task Type. Its choices reuse the shared Task Type model,
so Custom Default, Goal, Pursuit, and deleted named Custom Task Types remain
absent. Selecting a named type carries `task_type = 'custom'` and its
`custom_ruleset_id` in the initial canonical Task creation intent, so the
shared editor opens with the assignment already persisted. Other Task
quick-create surfaces continue creating ordinary Tasks.

No persistence or schema change occurred; no SQL or Supabase change was made.

## 2026-09-13 7.13.58 Remove Anonymous Custom Default

Custom Default is no longer a saved or selectable Task Type. `custom` now
means a named Custom Task Type backed by a required `custom_ruleset_id`; Task
Type selectors expose Task and saved named Custom Task Types only. Goal remains
legacy-readable and is not assignable, while Pursuit remains fully retired.

Behavior Settings no longer loads, edits, resets, or writes the obsolete
generic `task_type = 'custom'` profile. `+ New Custom Task Type` opens a local
draft initialized from the canonical `DEFAULT_CUSTOM_TASK_TYPE_TEMPLATE`
(currently the Standard Task policy). The name and behavior controls persist
only after Create/Save; Cancel discards the draft. Creation retains atomic
named identity plus first behavior revision persistence and its orphan cleanup.

The source-only migration
`supabase/20260913000000_remove_anonymous_custom_task_type_7_13_58.sql`
normalizes anonymous legacy Custom Task assignments and selections to Task,
deletes only generic Custom profile rows, and tightens current Task and
selection constraints so Custom requires a named ruleset. Named Custom Task
Type identities, revisions, behavior selections, and valid assignments are
preserved. The migration was not applied to live Supabase in this run.

## 2026-09-13 7.13.57 Promote Named Custom Rulesets to Custom Task Types

Named custom behavior rulesets are now presented as first-class Custom Task
Types in active Task Type selectors and the existing management surface. Tasks
remain the single primary work object, and Custom Task Types still use the
existing Task behavior engine; no parallel type engine was added.

Persistence remains `task_type = 'custom'` plus the existing
`custom_ruleset_id` identity. No persistence or schema migration occurred.
Goal remains legacy-readable only and is not selectable for new Tasks. Pursuit
remains retired.

## 2026-09-13 7.13.56 Correct Pursuit Retirement Task-State Cleanup

The 7.13.55 live migration attempt successfully passed the combined Pursuit
table `TRUNCATE`, then rolled back when canonical schedule-boundary cleanup
violated `adhdice_task_schedule_boundaries_initial_check`. Diagnosis also
found that the pending history `command_id = null` update would violate
`adhdice_task_history_facts_runtime_provenance_check`. Both failed attempts
rolled back transactionally, so live data remains unchanged: 3 Pursuit-typed
Tasks, 6 standalone Pursuits, 5 Pursuit activities, and 1 Goal Task remain.

Version 7.13.56 replaces temporary invalid nulling with dependency-ordered
deletion: it clears only incoming workflow/cycle blockers, deletes History
facts and occurrences, removes schedule boundaries newest-to-oldest, then
commands and exact Pursuit Tasks. Goal data remains untouched. The corrected
live migration remains pending explicit application.

## 2026-09-13 7.13.55 Correct Pursuit Retirement TRUNCATE Dependency

The 7.13.54 live migration attempt failed before commit because PostgreSQL
rejected separate Pursuit-table `TRUNCATE` operations across the foreign key
from `adhdice_pursuit_activities` to `adhdice_pursuits`. The transaction rolled
back completely, so live data was unchanged: no Pursuit or Goal data was
deleted. The live project still has 3 `task_type = 'pursuit'` Task rows, 6
standalone Pursuits, 5 Pursuit activities, and 1 Goal Task row.

Version 7.13.55 changes the migration to truncate
`adhdice_pursuit_activities` and `adhdice_pursuits` together in one explicit
two-table operation, without `CASCADE`. Goal data remains untouched. The
corrected live migration still requires explicit application after this
correction; no live database change is claimed here.

## 2026-09-13 7.13.54 Tasks + Custom Task Types; Retire Pursuit Experiment

Tasks are the primary work object. Named Custom Task Types configure the
existing Task behavior engine; they do not create a parallel work-object
domain. The Pursuit experiment has been retired. All standalone Pursuit
records, Pursuit activity/history, and Task rows explicitly typed as Pursuit
were test data and are intentionally deleted by the 7.13.54 retirement
migration. The standalone Pursuit persistence and application domain were
removed, and no Pursuit history migration, translation, archive, or snapshot
was performed.

Goal creation and assignment are retired for new Tasks, but existing Goal rows
and Goal history were not destructively removed in this ticket. Goal remains
only as the minimum legacy-read compatibility needed by the existing Task
engine and persistence boundary. Custom Task Types continue to use the normal
Task lifecycle, recurrence, History, Attention, policy, rewards, and other
shared Task infrastructure. The migration is source-only until explicitly
applied; browser QA remains assigned to Andrew.

## 2026-09-13 7.13.53 Reuse Canonical Scrollbar Suppression for Full Edit Task

Safari QA still failed for 7.13.50, 7.13.51, and 7.13.52. Re-diagnosis
compared the failing full Edit Task implementation with ADHDice's existing
working site-wide `adhdice-scrollbar` utility, which already suppresses
Firefox, legacy Edge, and WebKit scrollbar chrome including track, thumb, and
hover treatment. The unnecessary 7.13.50 `adhdice-scrollbar-hidden` duplicate
was removed, and the desktop inner editor, desktop full-overlay owner, and
mobile full-editor owner now all reuse the canonical utility while retaining
scrolling. The unsuccessful 7.13.52 background-Table `overflow-hidden`
conditional was removed and the normal Table owner is restored to
`adhdice-scrollbar overflow-x-auto overflow-y-auto`. No scroll position reset,
Task/state/persistence, layout, navigation, or dismissal behavior changed. No
SQL, schema, migration, Supabase, or Edge Function changes were made; Safari
manual QA remains assigned to Andrew.

## 2026-09-13 7.13.52 Suppress Background Table Scrollbars During Full Edit Task

Safari QA for 7.13.51 still showed native scrollbars while full Edit Task was
open. Re-diagnosis found that the visible vertical and horizontal bars belonged
to the underlying Table scroll container, not the Edit Task scroll owners. Full
Edit Task now temporarily suppresses the background Table's overflow while
preserving its scrollTop and scrollLeft values; closing the editor restores
normal Table scrolling. Edit Task internal scrolling remains enabled, and the
previous hidden-scrollbar treatment remains in place. No Task, state, or
persistence changes were made; no SQL, schema, migration, Supabase, or Edge
Function changes were made, and browser QA remains assigned to Andrew.

## 2026-09-13 7.13.51 Hide Remaining Full Edit Task Outer Scrollbar

Browser QA for 7.13.50 failed in Safari because the inner desktop and mobile
Edit Task scrollbar treatment was correct but the outer full-overlay scroll
owner still displayed native scrollbar chrome. The same dedicated hidden-
scrollbar utility now covers that remaining outer full Edit Task owner while
its `overflow-y-auto` behavior remains enabled. No navigation, layout, state,
or persistence behavior changed. No SQL, schema, migration, Supabase, or Edge
Function changes were made; manual browser QA for this correction remains
assigned to Andrew.

## 2026-09-13 7.13.50 Hide Full Edit Task System Scrollbar

Browser QA for 7.13.49 passed, including Edit Task navigation, dismissal,
draft-safety, and status presentation. The full Edit Task native scrollbar
chrome is now hidden while scrolling remains enabled. The dedicated treatment
covers only the desktop and mobile full editor scroll containers; quick
overlays and other application scroll surfaces are unchanged. No navigation,
state, or persistence behavior changed. No SQL, schema, migration, Supabase,
or Edge Function changes were made; browser QA for this release remains
assigned to Andrew.

## 2026-09-13 7.13.49 List Edit Task Navigation Performance + Backdrop Dismissal

The 7.13.48 repeated-navigation shell stability fix worked, but browser QA
found List Edit Task Previous/Next switching slower than Table. The root cause
was full List row materialization through `getAllRows` during neighbor lookup.
The List editor now uses its existing `taskById` map for direct live Task-row
lookup and converts only the requested row, while preserving `getAllRows` for
compatibility paths that require the complete collection. Empty transparent
desktop gutters and dimmed backdrop space dismiss Edit Task again; the
Previous and Next controls remain safe interaction targets in their approved
side-gutter placement. Navigation ordering, shell stability, and persistence
semantics are unchanged. No SQL, schema, persistence, Supabase, or Edge
Function changes were made; browser acceptance remains assigned to Andrew.

## 2026-09-12 7.13.47 Edit Task Browsing + Status Glow Refinement

The shared Attention status-circle breathing cycle is now 6 seconds. Active
Missed current-status circles receive the same status-color red breathing
emphasis; Missed alone keeps its canonical X, while Missed plus final
Attention membership uses the existing X/Bell crossfade. Full Edit Task now
supports Previous and Next controls using a captured current-view sequence for
Table and List, keeping that order stable for the editor session while each
target resolves live Task data. Missing captured IDs are skipped, boundary
controls do not wrap, and existing draft commit and detached-task behavior is
preserved. No Task status, Attention membership, persistence, SQL, schema,
Supabase, or Edge Function changes were made. The 7.13.47 glow behavior passed
browser QA; Edit Task navigation browser QA exposed the repeated-navigation
dismissal corrected in 7.13.48.

## 2026-09-12 7.13.48 Edit Task Navigation Stability

The full Edit Task shell now keeps a stable identity across Previous/Next Task
changes, so repeated Table and List browsing updates live editor content without
remounting the outer session or triggering dismissal. Desktop arrows occupy
transparent side gutters and belong to the same interaction boundary as the
editor surface; genuine outside clicks still close the editor. Navigation
ordering and snapshot semantics are unchanged, including missing-ID skipping,
boundary disabling, live Task resolution, and draft-safe switching. No
persistence, schema, SQL, Supabase, or Edge Function changes were made.

## 2026-09-12 7.13.46 Attention Status Signal Polish

The Attention row Bell is now a filled yellow Bell. Final Attention members
receive a status-color breathing signal on the primary current-status circle,
with a crossfade between the canonical status glyph and a decorative Bell.
Attention remains presentation metadata and is still NOT a Task status; the
status-circle interaction remains status interaction. Reduced-motion and Low
Stimulation modes use a static status-color treatment with the normal glyph.
No membership, persistence, SQL, schema, Supabase, or Edge Function changes
were made. Browser QA for 7.13.46 passed and is assigned to Andrew.

## 2026-09-12 7.13.45 Attention Rule Authority + Editable System List

Attention is now a configurable, app-owned system list. Its locked
eligibility condition is resolved from effective behavior policy: only Tasks
whose effective missed-streak behavior is Ignore may participate. The default
editable Attention rule is `Due is overdue`; explicit rule edits are evaluated
by the normal Task List rule engine, and an explicit empty rule group matches
nothing. Legacy persisted Attention rows with `rules = null` use that default.

Behavior-profile `needsActionTriggers` remains persisted for compatibility but
no longer governs Attention. The yellow Bell, Attention count, list filtering,
and popover all consume final Attention list membership. Attention settings use
the normal list rule editor below a read-only eligibility explanation; the
system list remains fixed-name, non-deletable, and unavailable for manual
membership. No SQL migration, schema change, Supabase data migration, or Edge
Function deployment was performed. Browser QA passed for Attention rule
behavior, settings, and popover.

## 2026-09-12 7.13.44 Attention Correction

Tracked Missed outcomes no longer duplicate Attention when the effective
behavior profile increments missed streaks; Missed Attention remains available
when the profile ignores missed streaks and the Missed trigger is enabled. The
row Attention indicator is now a yellow icon-only Bell using the approved
row-toolbar primitive. Its informational popover now uses the approved
floating/portal presentation outside clipped row and table ancestors, with
viewport-safe anchoring and dismissal on outside click, Escape, scroll, or
resize. Due Today and Overdue trigger behavior remains unchanged. No SQL,
schema migration, Supabase data change, or Edge deployment was performed;
browser QA remains unverified.

## 2026-09-12 7.13.43 Attention System List + Notification Chip

Attention is now surfaced through the canonical Task list system as the
visible, app-owned `attention` system list. Membership is derived only when
the existing effective-policy Attention classifier returns `needs_action`, so
Missed, Due Today, and Overdue remain policy-controlled while In Progress and
Coming Up remain outside the notification list. Table and List rows expose a
small informational Attention chip with the current reason in an anchored
popover; no Task status, persistence field, manual membership, behavior
engine, SQL/schema change, or Edge deployment was added. Legacy persisted
`attention` surface state migrates to Tasks with the Attention list selected.
Browser QA remains unverified.
## 2026-09-12 7.13.41 Effective-Dated Needs Action Triggers

Task behavior policies now carry the presentation-only Needs Action trigger
set: Missed, Due Today, and Overdue. Task and Custom Default profiles plus
named Custom rulesets resolve these triggers through the existing effective-
dated TaskType selection and revision authority. Missed remains first-match
classification; disabling it does not make a Missed Task qualify as Overdue,
and disabling Due Today or Overdue allows the existing Attention classifier to
fall through to In Progress or Coming Up as applicable. Task facts, History,
status, due dates, recurrence, projections, streaks, rewards, and Pursuit
behavior remain unchanged. The Needs Action SQL migration has been applied to
live ADHDice Supabase and verified. No Edge deployment was required, and
browser QA remains unverified.

## 2026-09-12 7.13.42 Current-Policy Task Rollover Correction

Automatic rollover now resolves still-unresolved historical scheduled
occurrences with the Task's current resolved behavior policy. A current Blank
policy leaves that backlog without automatic Missed History or missed-streak
materialization; a current Missed policy retains intentional automatic
backfill. Existing History facts and effective-dated historical policy
resolution remain unchanged. The `task-state-command` Edge Function was
deployed from commit `378d2cb7580f6ab5221434322859e6ed0ea1b114`; the deployed
Edge Function version was 35 at QA time, and browser QA for the Blank/Ignore
unresolved-backlog correction passed. No SQL migration or schema change was
required.

## 2026-09-12 7.13.40 Available Actions UI Enforcement

Behavior Settings now exposes the effective-dated Available Actions controls
for Task, Custom Default, and named Custom rulesets. Existing contextual Task
status/action choices are filtered through the shared action authority, with
historical Calendar dates and multi-date selections using policy intersections.
Current and historical outcomes remain factual; workflow, lifecycle, Calendar
override, and automatic engine behavior remain unchanged. No SQL or Edge
deployment changed, and browser QA remains unverified.

## 2026-09-11 7.13.39 Trusted Available Actions Failure-Closed Correction

Trusted manual occurrence commands now distinguish the reviewed missing
additive-schema compatibility boundary from unexpected behavior-authority
failures. `set_outcome`, `delay_occurrence`, `complete_task`, and History batch
preflight return `behavior_policy_unavailable` with HTTP 503 before persistence
when Task/Custom behavior, named-ruleset, or selection authority is unavailable
or malformed; successfully resolved restrictive policies still return
`TASK_ACTION_NOT_AVAILABLE`. Only the recognized undeployed Available Actions
table/column absence retains the Standard all-actions compatibility fallback.
Automatic rollover and Missed reconciliation continue through the existing
compatibility fallback path. No UI or SQL migration changed; SQL and Edge
deployment were not performed. Browser and live Supabase QA remain unverified.

## 2026-09-11 7.13.38 Available Actions Policy Foundation

TaskType and named Custom ruleset revisions now carry an effective-dated
manual occurrence Available Actions upper bound: Done, Did My Best, Missed,
Delay, and Complete. Missing legacy fields normalize to all five actions;
invalid and duplicate values normalize safely, and an empty set remains valid.
The shared action authority resolves the policy for the command logical date,
while canonical planning and trusted `task-state-command` reject unavailable
manual actions with `TASK_ACTION_NOT_AVAILABLE`. History outcome batches
preflight all selected dates before any child commit. Automatic rollover and
Missed reconciliation, existing History facts, lifecycle/workflow commands,
Calendar overrides, rewards, streaks, and recurrence remain unchanged. The
focused migration and Edge source are review-only; SQL has not been applied,
`task-state-command` has not been redeployed, and browser QA remains
unverified. No Available Actions controls were added to Behavior Settings.

## 2026-09-11 7.13.37 Legacy Pursuit Hard Delete

Old separate Pursuit rows in the Tasks workspace now offer a confirmed Trash
action. `usePursuits` performs an owner-scoped hard delete for childless rows,
blocks parents until their loaded child Pursuits are deleted, and removes the
deleted Pursuit plus its locally loaded completion activities after success.
The database remains authoritative for the existing Pursuit activity cascade,
child `ON DELETE RESTRICT`, and Task-parent `ON DELETE SET NULL` behavior. No
SQL or Edge Function deployment was performed; browser QA and live Supabase
verification remain unverified.

## 2026-09-11 7.13.36 Ruleset Delete RPC Ambiguity Correction

The named Custom ruleset delete RPC now aliases its target ruleset table and
qualifies the final UPDATE predicate and returned columns, preventing
PL/pgSQL output-column variables from making `deleted_at` ambiguous. The
7.13.35 assignment guard remains unchanged: active, archived, and restorable
trashed Tasks block deletion, while permanently deleted Task tombstones do
not. The soft-delete RPC, historical selections, revisions, Task History,
grants, and security/search_path model are unchanged. The SQL migration and
consolidated schema are source-only; SQL deployment and browser QA remain
unverified.

## 2026-09-11 7.13.35 Permanently Deleted Task Ruleset Deletion Correction

Named Custom ruleset deletion now excludes permanently deleted Task tombstones
from its current-assignment count. Active, archived, and normally trashed
restorable Tasks still block deletion; a permanently deleted Task can retain
its historical ruleset identity without blocking the ruleset tombstone. The
RPC remains the final server-side concurrency guard, and no tombstone,
historical selection, revision, or Task History row is rewritten. The SQL
migration and consolidated schema are source-only; Edge Functions and browser
QA remain unchanged and unverified.

## 2026-09-11 7.13.34 Task Type Table Filtering and Ruleset Resolution

Table View now exposes Task Type as a persisted, reorderable column with
centralized TaskType/ruleset labels and active-selector-backed filters. Named
ruleset deletion remains server-blocked while current Tasks use it, but the
blocked UI can show the matching Task filter or move each assigned Task to
normal Task through the existing effective-dated selection mutation before
retrying the tombstone. Historical selections, ruleset identities, Task
History, SQL source, and Edge Functions are unchanged; browser and live
Supabase QA remain pending.

## 2026-09-10 7.13.31 Historical Behavior Selection Correction

Effective-dated behavior authority now stores the complete TaskType plus
optional named Custom ruleset selection in `adhdice_task_behavior_selections`.
The 7.13.28 Custom-only assignment rows are renamed and normalized as Custom
selections; a compatibility view supports the older canonical creation RPC
without retaining a second historical authority. Existing Tasks use the
current Task projection until their first selection change, which lazily writes
the creation-date baseline before the new current-date selection. New Tasks are
seeded at creation, and browser/direct/canonical/trusted resolution feeds the
same selection timeline into the existing Task Engine. No SQL or Edge source
has been deployed; browser QA and live Supabase verification remain pending.

## 2026-09-10 7.13.32 Ruleset Streak and Task History Label Cleanup

An unfinished scheduled occurrence now always breaks the derived positive
success streak, whether the unresolved occurrence is displayed as Missed or
Blank. Not Due and future dates remain neutral; missed-streak handling,
rewards, explicit History facts, and existing Delay behavior are unchanged.
The legacy `positive_streak_on_unhandled` persistence column remains accepted
as a deprecated compatibility field, but new Task and named Custom ruleset
writes emit `break` and the engine ignores persisted `preserve` values.

Task Calendar History now resolves its header and calendar label through the
centralized TaskType/ruleset display helper, so normal Task, Custom Default,
named Custom, Pursuit, and Goal labels remain consistent. The shared TypeScript
engine source used by the trusted Edge bundle changed, but no Edge Function or
SQL deployment was performed; browser and live Supabase QA remain pending.

## 2026-09-11 7.13.33 Named Custom Ruleset Tombstones

Named Custom rulesets can now be deleted from Behavior Settings through a
soft-delete tombstone. Current Task assignments block deletion with a useful
owner-scoped count, while revisions, effective-dated behavior selections, and
historical display identity remain intact. Deleted rulesets are excluded from
new/current selectors and editable settings; their names remain available to
historical label and policy resolution, and active name reuse is allowed. The
The SQL migration and consolidated schema are source-only. The shared ruleset
loader imported by the trusted Task command bundle changed to retain deleted
identities, but no Edge Function or SQL deployment was performed; browser/live
Supabase QA remains pending.

## 2026-09-10 7.13.24 Custom TaskType Behavior Profile

Custom is now the first active non-Task behavior profile and resolves through
the shared Task Engine using its own effective-dated, user-scoped revision
timeline. Custom is currently a shared TaskType-level experimental profile;
Task and Custom revisions remain independent. Pursuit and Goal remain
intentionally inactive and use the Standard fallback. Browser and trusted
command paths now receive the complete type-aware profile map, with the Edge
Function source updated accordingly. No schema or SQL changes were required;
Edge deployment remains pending review.

## 2026-09-10 7.13.25 Inactive TaskType Revision Boundary

The Task Engine input boundary now forwards effective-dated behavior
revisions only for Task and Custom. Persisted Pursuit and Goal rows remain
loadable for future activation, but inactive TaskTypes omit revision timelines
and retain Standard fallback through downstream projections and command
planning. No schema, SQL, or persistence changes were required; Edge source
remains updated and deployment is pending review.

## 2026-09-10 7.13.26 First-Revision Task Behavior Baseline

The shared effective-dated behavior resolver now uses the earliest revision
for an active TaskType as its baseline before that revision's effective date;
later revisions remain effective-dated changes. Task and Custom remain active,
while Pursuit and Goal retain Standard fallback. No schema, SQL, persistence, or
live-data changes were required; Edge deployment remains pending review.

## 2026-09-10 7.13.27 Named Custom Behavior Ruleset Foundation

Added source-only persistence for reusable named Custom behavior rulesets,
independent effective-dated revisions, and nullable `custom_ruleset_id` Task
assignment. Assigned Custom Tasks now select their named ruleset timeline in
browser/direct and trusted command planning; unassigned Custom Tasks retain the
7.13.26 TaskType-level Custom profile. Pursuit and Goal remain inactive with
Standard fallback, and existing History remains factual. No SQL or Edge source
has been deployed; browser QA and live Supabase verification remain pending.

## 2026-09-10 7.13.30 Named Custom Ruleset Management and Assignment UI

The Behavior Settings panel now manages reusable named Custom rulesets while
retaining `Custom Default` for the existing TaskType-level Custom profile.
Named rulesets seed their first effective-dated revision from Custom Default,
support independent current-day behavior revisions and identity-only renames,
and are surfaced through the shared Task metadata selector. Task assignment
changes retain the existing effective-dated assignment RPC authority, and
canonical Task creation continues to accept `task_type = 'custom'` with a
named `custom_ruleset_id`. Fixed System Rule cards were removed from the
customizable panel without changing engine semantics. No SQL or Edge source
was changed or deployed; browser QA and live Supabase verification remain
pending.

## 2026-09-10 7.13.28 Effective-Dated Custom Ruleset Assignment Correction

Task-to-named-Custom-ruleset assignment is now a separate effective-dated,
owner-scoped timeline. The Task row's nullable `custom_ruleset_id` remains a
current projection only; browser, canonical, and trusted command resolution
select the assignment effective on the requested logical date, with the first
assignment serving as the baseline before its effective date. The correction
migration also protects historical assignment meaning with restrictive
ruleset deletion FKs, routes assignment edits through an atomic owner-checked
RPC, and extends canonical creation to persist an owned initial assignment.
Existing Tasks are not backfilled, explicit History is not rewritten, and
Pursuit/Goal remain Standard fallback. SQL and Edge source are not deployed;
browser QA and live Supabase verification remain pending.

## 2026-09-10 7.13.23 Indexed Last-Handled Summary Construction

Global streak-summary preprocessing now indexes the latest manual action by
Task ID while scanning History, active manual Calendar overrides, and
committed runtime command operations once each. The existing manual-action
eligibility, logical-date/timestamp/identity ordering, presentation timestamp,
atomic publication, 10ms cooperative Task loop, and stale-work cancellation
remain unchanged. No Task semantics, persistence, SQL, schema, RLS, Realtime,
or Pursuit behavior changed.

## 2026-09-09 7.13.22 Non-blocking Global Task Behavior Recalculation

Global Active Status and behavior-policy streak-summary recalculations now run
through short cooperative CPU chunks with browser yields. Each calculation
keeps its complete result in local maps and publishes once atomically; a
lightweight token prevents superseded work from committing. The existing
per-Task Active Status cache remains incremental for ordinary mutations, and
the bulk streak path still reuses full History plus one collection-wide load
each for Calendar overrides and manual command operations. Rewards-only policy
changes remain outside both global recalculations. No Task semantics,
persistence, SQL, schema, RLS, Realtime, or Pursuit behavior changed.

## 2026-09-09 7.13.20 Task Engine Interaction Performance

Active Status now uses the existing stable projection cache incrementally by
Task. Each entry is keyed by semantic Task State inputs, that Task's canonical
History, logical-day context, and only the behavior-policy semantics that can
change Active Status. A single Task or History mutation therefore reevaluates
only that Task while unchanged Tasks reuse their in-memory results. Rewards are
not an Active Status dependency; unresolved-occurrence policy affects Active
Status; unresolved-occurrence plus positive/missed unhandled behavior affect
Effective Timeline streaks.

The History Calendar modal now memoizes its canonical Calendar/Effective
Timeline read and selected-date action authority by semantic dependencies. A
development-only diagnostic reports `active-status evaluatedTasks=N
reusedTasks=N` and `task-history-calendar recomputed taskId=...` when the
existing workspace performance diagnostic flag is enabled.

No Task semantics, canonical History facts, persistence, SQL, schema, RLS,
Realtime behavior, or Pursuit architecture changed.

## 2026-09-09 7.13.21 Behavior Profile Bulk Streak Reconciliation

Global changes to streak-affecting Task behavior policy now call the existing
bulk `loadTaskHistoryStreakSummaries()` authority once. It reuses loaded full
History, loads Calendar overrides and manual command operations collection-wide,
builds the complete summary map, and publishes one summary state update.
Single-Task History/task mutations continue using the targeted refresh path.
Rewards-only policy changes remain outside streak and Active Status revisions.

The existing workspace performance diagnostic reports bulk policy refreshes as
`[workspace:streak-summary] mode=bulk reason=behavior-policy tasks=N`.
No Task State, recurrence, History, Calendar, reward, persistence, SQL, schema,
RLS, Realtime, or Pursuit semantics changed.

## 2026-09-06 7.12.119 Saved View Editing

Saved Views now distinguish `Add View` from `Save Current View`. Applying or
creating a View establishes a transient `activeViewId` for the current session;
editing the layout does not clear that association. `Save Current View`
overwrites the same View ID, preserving its name, target, and `createdAt` while
refreshing the current layout or canonical/custom presentation and viewport.
Reset and deletion of the active View clear the association; deleting another
View does not. Measured legacy View migration continues updating the same ID.

The active selection is intentionally session-only. Saved-View schema version,
storage keys, persistence and export format remain unchanged, and no SQL/schema
change is involved. The existing shell interaction engine (semantic rows,
packing, drag, resize, arrows, and migration architecture) is unchanged.

## 2026-09-06 7.12.118 Sticky Semantic-Row Ownership During Shell Dragging

Vertical shell dragging no longer chooses an existing semantic row from the
nearest row top or any other distance fallback. Runtime ownership starts from
the source shell's `rowIndex` and remains sticky during free vertical movement;
it changes only after a valid plan for a deliberate direct shell/magnet target
or a candidate fully inside another row's visible available region. Invalid
existing-row candidates do not transfer ownership.

Blue `New Row` bands remain a separate transient structural override. Hovering a
blue band does not replace existing-row ownership, leaving it restores the
previously owned row, and a new semantic row is committed only by releasing in
the active blue zone. The selected existing row receives a subtle stronger row
guide while dragging.

The 12-column drag grid, dynamic axes, sub-row offsets, 2D geometry and
collision validation, direct magnets, body swaps, edge insertion, toolbar
arrows, Center/W12 behavior, packer math, migration, storage keys, saved Views,
and SQL/schema remain unchanged.

## 2026-09-06 7.12.117 Visual Drag Grid, Sub-Row Placement, and Explicit New-Row Zones

The user-facing sub-row concept is backed by the existing durable
`rowOffsetSteps`; no `subRowIndex`, pixel coordinate, storage-key, View, or
schema field was added. Dragging directly beneath or above a meaningfully
overlapping shell keeps the destination in the same semantic `rowIndex` and
uses the first valid 12px detent after the normal shell gap. The above and
below magnets are symmetric conveniences; ordinary valid free vertical
detents remain available, and the authoritative 2D validator still rejects
exact X+Y collisions without relocating unrelated shells.

Desktop editing now renders a transient drag grid from frozen pointer-down
geometry: the real `referenceGridBounds` supplies all 12 columns, while
frozen packed shell geometry supplies semantic row boundaries, row bottoms,
individual offsets, custom or natural heights, edit chrome, gaps, occupied
footprints, and the exact candidate footprint. Existing-row space is a subtle
purple treatment, occupied footprints are a light neutral overlay, and the
candidate is the strongest purple valid or red invalid treatment. The
horizontal `C1`-`C12` ruler and vertical 12px `0`/`+n` ruler remain in place;
dynamic H-to-V and V-to-H axis switching still holds the inactive coordinate.

Visible blue insertion bands now exist above the first row, between semantic
rows, and below the last row. A new semantic row is created only when the
current candidate targets one of those explicit zones; ordinary vertical
distance no longer triggers hidden midpoint or generic new-row transitions.
The former bounded stacking-corridor classifier and invisible midpoint gap
classifier were simplified away in favor of existing-row ownership, explicit
zones, direct shell magnets, and the shared planner. Body swaps, left/right
edge insertion, toolbar arrows, Center, and conservative W12 behavior remain
unchanged.

Persistence, saved Views, measured legacy migration, storage namespaces, and
SQL/schema are unchanged. Stacked arrangements continue to round-trip through
`rowIndex`, `columnStart`, `rowOffsetSteps`, `span`, and `heightPx`.

## 2026-09-06 7.12.116 Reliable Direction-Turn Detection

The 7.12.115 dynamic two-axis drag switch could still be intermittent because
each active-axis snap advanced both local switch anchors and erased accumulated
movement toward the opposite axis. Direction turns now use recent pointer
movement with independent opposite-axis accumulation: active-axis snap
advancement no longer erases turn intent, while current-axis dominance can
cancel a false candidate and prevent jitter. The 12px activation threshold,
20px switch threshold, and 8px dominance margin remain unchanged.

Held coordinates and both rulers remain unchanged. Pointer-down reference
geometry, pointer-up final planning, auto-scroll, grab offsets, stacking
corridor, 2D collision validation, structural rows, migration, persistence,
storage keys, Views, and schema remain unchanged.

## 2026-09-06 7.12.114 Stacking Corridor and Two-Axis Snap Feedback

Explicit vertical drags with a meaningfully aligned snapped X footprint now use
a bounded continuation corridor inside the existing semantic row before generic
new-row creation. The corridor uses the frozen pointer-down geometry, grab
offset, source height, 12px detents, and the midpoint before the next real row;
valid stacking targets therefore win over generic below-row insertion while real
gaps and above/below workspace placement still create rows. The 7.12.113
geometric collision validator remains authoritative, so early overlapping ticks
stay invalid and later non-colliding ticks remain selectable. Tall neighboring
shells beside a stack remain supported.

The existing vertical 12px ruler is retained. Horizontal dragging now shows
frozen 12-column snap feedback aligned to the real page-shell grid, including a
current `C<n>` column label, the snapped shell footprint, and purple/invalid-red
state. Grab-offset-aware target planning drives the displayed column, including
cross-row left/right edge insertion. Persistence, schema, storage keys,
migration, and Views are unchanged.

## 2026-09-06 7.12.115 Dynamic Two-Axis Shell Dragging

Shell drag axis intent is now dynamically switchable during one pointer
gesture. The inactive snapped coordinate is held while the active coordinate
changes: horizontal-to-vertical movement preserves `columnStart`, and
vertical-to-horizontal movement preserves `rowIndex` plus `rowOffsetSteps`.
Local switch anchors, a 20px switch threshold, and an 8px dominance margin
prevent small diagonal jitter from flickering the active axis. The horizontal
12-column ruler and vertical 12px detent ruler switch emphasis with the active
axis while the larger structural insertion guide remains available.

Held-coordinate targeting continues to use the frozen pointer-down reference
frame, grab offsets, the existing stacking corridor, and the authoritative 2D
collision validator. Structural new-row creation remains available in genuine
vertical gaps. Persistence, storage keys, schema, migration, and Views are
unchanged.

## 2026-09-06 7.12.113 2D Shell Stacking and Detent Feedback

Same-row explicit shell collision validation is now geometric: normal shells may
share horizontal columns when their packed vertical occupied footprints do not
overlap, while actual two-axis overlap remains rejected. `rowOffsetSteps`
supports deliberate vertical detents into empty space, and mixed-height row
targeting uses stable semantic row bands rather than only visible shell bottoms.
True inter-row gaps and above/below workspace placement still create rows, while
ordinary whitespace inside a row remains in that row. Cross-row left/right edge
insertion is deterministic and preserves the target footprint. Vertical drag
feedback now shows a 12px detent ruler, current tick, and invalid-candidate
feedback. Migration timing, storage keys, persisted authorities, Views, and SQL
schema remain unchanged.

## 2026-09-06 7.12.112 Semantic-Row Shell Interaction Cutover

Valid explicit shell layouts now mutate persisted semantic rows directly. Left
and Right stay within one `rowIndex` and exchange exact horizontal destinations;
Up and Down select adjacent visible semantic rows, preserve the requested
snapped X for empty footprints, and exchange semantic destinations for occupied
footprints. Successful moves compact empty source rows and maintain deterministic
row-major order without making `order` the row authority. Explicit drag edge
insertion, body swaps, empty-row placement, and new-row insertion write
`rowIndex` directly and validate exact capacity, Center, and full-width rules.
Explicit interactions no longer reconstruct rows through legacy packing or call
the retired reconciliation bridge. Legacy or malformed layouts retain the
compatibility planner. Measured migration, lazy View migration, persistence
keys, and the explicit packer remain unchanged; no SQL or schema migration was
added.

## 2026-09-06 7.12.111 Measured Semantic Row Migration and Explicit Packer Cutover

Measured semantic-row migration is active only after Edit Layout renders all
registered shells with complete stable measurements. Migration is parity-gated
against the preserved legacy packer; layouts that fail parity remain on legacy
compatibility packing and are not persisted as explicit. Valid explicit layouts
use persisted semantic row packing, while malformed or incomplete layouts use
legacy defensive recovery. Custom Views migrate lazily when applied and
measured, retaining their View IDs. Phase 3 now replaces the former legacy
targeting bridge for valid explicit layouts while leaving legacy interactions
compatible.
No storage-key, SQL, or schema migration was added.

## 2026-09-06 7.12.110 Semantic Shell Row Compatibility Foundation

Explicit semantic shell rows have begun. `PageShellPlacement.rowIndex` is
additive compatibility metadata: it is zero-based, durable, and required
only for complete explicit layouts; legacy saved layouts may omit it. All
registered canonical layouts now define semantic rows, including the
approved Water, Food, Fitness, Weight, and Test D20 mappings. Missing rows
are not fabricated during localStorage hydration, and the measured legacy
row inference helper is available but is not automatically invoked or
persisted yet. The current legacy `packPageShellLayout()` remains the live
rendering authority; planner/arrows and drag behavior are unchanged. Phase 2
will connect measured migration and later explicit-row packer cutover. No SQL
or schema migration was added.

## 2026-09-06 7.12.109 Direct Empty Vertical Shell Targets

Occupied vertical destinations continue to use the existing deterministic
`replace` swap planner. Empty Up/Down destinations now return a transient
direct target with `targetId: null`, the exact adjacent structural-row
baseline, and the source's snapped `columnStart`; unrelated peers are no
longer used as fake anchors. A pure row insertion helper keeps the source
inside the destination row's contiguous visible-order block, and the planner
validates the exact row membership, X placement, widths, capacity, and
non-overlap after real packing. Up and Down normalize `rowOffsetSteps` to zero
and move one structural row; mixed-height Water-like packing and reverse
movement are covered. Left/Right, drag, downstream reflow, Center, Views,
Reset, and persistence remain unchanged. No SQL or schema migration was
needed.

## 2026-09-06 7.12.108 Vertical Arrow Swaps for Occupied Shells

Vertical arrow destinations now inspect exactly the adjacent structural row
and compare snapped 12-column footprints. An overlapping destination selects a
deterministic target and uses the existing true `replace` swap planner;
different-width and full-width swaps remain valid only when both resulting rows
fit the strict 12-column capacity. An empty intended footprint keeps the
source's current snapped X and existing one-structural-row move behavior,
including vertical offset normalization. Center mode remains special and
preserved where normalized placement allows it. Up and Down are symmetrical,
repack after each committed move, and do not alter Left/Right or drag behavior.
No persistence or schema change was needed.

## 2026-09-06 7.12.107 Unified Structural Rows for Shell Moves

Directional controls and the explicit shell-move planner now share one
structural-row definition: packed `rowStart` minus the intentional Y detent
converted through the existing vertical-placement and packing-row constants.
Intentional Y detents no longer split one logical row, so target-row and
source-row discovery, `sourceWasInTargetRow`, row reconstruction, and width
validation include every structural peer. Left and Right planner behavior is
symmetrical, including sequential arrow moves that repack after each committed
layout, while existing offset values remain preserved. Up/Down, full-width and
Center behavior, downstream reflow, drag targeting, Views, and Reset remain
unchanged. No persistence or schema change was needed.

## 2026-09-06 7.12.106 Authoritative Shell Targets and Directional Move Controls

Direct page-shell hit testing now checks the captured real shell bounds before
consulting the previous target's proximity/hysteresis region. Hysteresis still
stabilizes ambiguous gaps and outside-shell space, while a shell physically
under the pointer always becomes authoritative; repeated Center/body drops no
longer retain an overlapping previous target and resolve true swaps reliably.

Editable shell toolbars now restore compact Up, Down, Left, and Right controls
inside the existing horizontally scrollable tool row. The controls resolve
one same-row horizontal position or one adjacent structural row and pass a
normal `PageShellDropTarget` through the current 12-column plan -> validate ->
commit planner, not the retired Column/Slot architecture. Full-width shells
remain standalone while supporting Up/Down, centered standalone shells retain
Center for vertical moves, downstream reflow and strict row validation remain
in force, and no SQL or schema migration was needed.

## 2026-09-06 7.12.105 Deterministic Pointer-Up Shell Drops

Successful shell drops now resolve their final target from the actual
pointer-up `clientX` and `clientY`, so a stale last `pointermove` no longer
determines the committed relationship. Preview and final commit continue
through the same target resolver, hysteresis, plan → validate → commit flow,
with stable pointer-down geometry, cancellation safety, downstream reflow,
Views, and Reset unchanged. No SQL or schema migration was needed.

## 2026-09-06 7.12.104 Deterministic Downstream Shell Reflow

Valid explicit shell moves now distinguish requested-destination collisions
from downstream vertical flow. The destination row remains strict: width
overflow, same-row geometric collisions, impossible vertical offsets, and
invalid Center placement still reject with the existing red preview and
warning. When the requested row is valid, the normal packer may move later
shells downward to clear a taller row, while preserving their horizontal
columns, widths, and relative order. Plan → validate → commit remains
authoritative; no arbitrary `rowStart` or Y coordinates are persisted. No SQL
or schema migration was needed.

## 2026-09-06 7.12.103 Axis-Intent-Locked Shell Dragging

Shell dragging now locks intent relative to pointer-down movement. Horizontal
or neutral movement changes structural order and snapped X placement without
deriving a new vertical offset from pointer Y. A deliberate vertical gesture
must clear the 12px axis threshold with vertical movement dominant; only then
do left/right targets calculate 12px `rowOffsetSteps` detents. The axis choice
is sticky for the gesture, so a horizontal reorder cannot acquire an accidental
vertical nudge later. Existing plan → validate → commit behavior, vertical
collision validation, auto-scroll, persistence, Views, Reset, narrow layouts,
and Center behavior remain unchanged. No SQL or schema migration was needed.

## 2026-09-06 7.12.102 Strict Planned Shell Moves

Explicit page-shell dragging now follows plan → validate → commit. Left and
right targets mean insert before and after; center targets perform true swaps.
Every affected row is checked against the 12-column capacity before commit, and
invalid moves no longer fall back to automatic downward packing. The planner
exposes a calculated maximum source width when a destination row is too wide.
Valid previews remain purple; invalid previews use the danger treatment, and an
invalid release leaves the layout unchanged while showing a short accessible
warning. Automatic packing remains available for canonical layout generation,
normal layout calculation, legacy normalization, and defensive recovery.
Vertical offsets and special odd-width Center placement are validated as exact
destinations; even-width centering remains ordinary grid placement. Layout
storage, Views, Reset, narrow behavior, and auto-scroll remain backward
compatible. No SQL or schema migration was needed.

## 2026-09-05 7.12.101 Directional Targets and Vertical Snap Detents

Page-shell dragging now resolves target-aware `above`, `below`, `left`,
`right`, and non-destructive `replace` relationships. Above/below use a
horizontal guide, left/right use a vertical guide, and replace highlights the
existing target shell without deleting it. Horizontal placement still uses the
12-column snap grid. Same-row shells can persist optional 12px vertical
`rowOffsetSteps`, with defensive normalization and stronger top, vertical-center,
and bottom magnetic alignments. The packer remains authoritative for collision
safety and region bottoms include downward-offset shells. Odd-width special
Center keeps a distinct full-width Center guide and ignores vertical offset;
even widths retain ordinary grid centering. The stable pointer-down geometry and
commit-on-release drag architecture remains in place, including auto-scroll and
pointer cancellation safety. Narrow single-column presentation ignores saved
horizontal and vertical custom placement values. Layout storage, Views, and
export/import remain backward-compatible; no SQL or schema migration was
needed.

## 2026-09-05 7.12.100 Stabilized Snap-Grid Drag Interaction

Shell drag hit testing now uses visible order, shell geometry, packed positions,
grid bounds, and grab offset captured at pointer-down for the entire drag. Move
previews update only the purple insertion/snap indicator; page layout no longer
live-repacks while the pointer moves. The final target is applied to the starting
layout once on successful release, then preview order and placements are committed
once. Existing insertion hysteresis is wired through drop targeting, and auto-scroll
continues to convert the client pointer Y into document coordinates against the
stable reference geometry. Direct snap-grid semantics, sizing, persistence, Views,
Reset, and narrow layouts are unchanged. No SQL or schema migration was needed.

## 2026-09-05 7.12.99 Odd-Width Special Center Mode

Special `mode: "centered"` now exists only for odd-width shells that require
the half-track render offset. Even widths use ordinary exact-centered grid
starts: W4 at 5, W6 at 4, W8 at 3, W10 at 2, and W12 at 1. Legacy even
centered placements normalize to those starts without changing order, size,
height, or unrelated placements. Odd-to-even width changes exit special
Center, while odd-to-odd centered changes preserve it. The 7.12.98 direct-row
precedence behavior remains intact. No SQL or schema migration was needed.

## 2026-09-05 7.12.98 Center-Snap Row Precedence

Direct snapped placement now takes precedence over center snap when the
snapped shell fits beside the shells in the pointer's insertion row. Center
snap remains available for standalone row placement, so compatible 4/12
shells can assemble into a shared 4 + 4 + 4 row without a centered row
boundary interrupting the composition.

## 2026-09-05 7.12.97 Direct Snap-Grid Shell Placement

The visible semantic Column/Slot editor has been retired. Desktop shell
placement now uses direct 12-column snap-grid starts plus visual order:
compatible widths share rows, collisions pack downward, and order is the
vertical authority. Center is a drag snap target with exact odd-width
centering; width/height resize, Natural/Shrink behavior, persistence, Views,
export/import, canonical Reset Layout, and narrow single-column flow remain
available. Legacy `columnStart`, optional `laneOrder`, and centered placement
records remain readable for compatibility. No SQL or schema migration was
needed.

## 2026-09-05 7.12.96 Centered Drag Semantic Isolation

Dragging a centered shell now changes only the visible row/order. Its
remembered `columnStart` and `laneOrder` stay unchanged, and the targeted
semantic column is not resequenced. Center → Column remains the explicit
semantic conversion path.

## 2026-09-05 7.12.95 Centered Row Behavior Completion

Centered shells retain `mode: "centered"` through drag/drop, regain Up/Down
row-order controls, and use an exact half-track visual offset for odd widths
such as 5/12 and 7/12. Centered shells still omit semantic Column and Slot
controls, and Center → Column conversion remains a normal semantic placement.

## 2026-09-05 7.12.94 Centered Row Shell Placement

Page-shell layouts can now place a non-full-width shell as a centered row.
This is an explicit `mode: "centered"` placement mode, not a semantic
Column: the saved column and lane remain intact while runtime packing centers
the shell and makes it a row boundary before normal semantic columns resume.
The layout editor exposes Center row in the placement menu and removes Column
Slot controls while it is active. Existing saved layouts and Views remain
backward-compatible.

## 2026-09-05 7.12.93 Short Shell Expansion

Naturally short shells can now intentionally grow taller through the existing
snapped resize interaction. `PAGE_SHELL_MIN_HEIGHT` remains the custom-height
floor but no longer disables custom growth solely because natural content is
short. Shrink and Natural still restore short shells to their natural height;
the existing `heightPx` storage and semantic Column/Slot placement model are
unchanged.

## 2026-09-05 7.12.92 Scrollable Shell Edit Toolbars

Narrow Edit Layout toolbars now keep the shell identity visible on the left
while the editor tools horizontally scroll inside the shell. The intrinsic
tool row remains unwrapped and controls retain their established sizes, so
controls no longer overflow neighboring shells. Column menus escape the
toolbar scroller by rendering the existing dropdown primitive through a local
body portal; resize and shell-drag pointer lifecycles remain unchanged. This
is a toolbar containment correction only: there is no shell layout or
persistence model change.

## 2026-09-05 7.12.91 Canonical Semantic Layout Seed and Stable Edit Topology

Canonical CSS grouping and the editable semantic placement model had drifted:
Water visibly placed its log left and its three supporting shells right, while
the editor derived those shells from an automatic pack and reported Today's
Water as Column A. Canonical multi-column layouts now carry edit placements
alongside their historical groups/classes. Water seeds `water-log` as A1 and
`water-pending`, `water-today`, and `water-history` as B1, B2, and B3 using the
5/12 + 7/12 split. Food, Fitness, Weight, Sleep, Insights, and Test D20 carry
the equivalent existing 7/12 + 5/12 or 6/12 + 6/12 semantic seeds.

The packed 12-column algorithm now treats each 12/12 shell in global semantic
order as a true vertical boundary: it packs the preceding two-column region,
places the full-width shell below the entire region, and starts the next region
after it. Runtime row coordinates remain derived and are not persisted.

Opening Edit Layout on a canonical page switches to this semantic packed DOM
immediately, while the page remains canonical until an actual layout mutation
commits. The canonical grouped DOM therefore does not disappear during a
resize, so pointer capture safeguards remain unchanged and width previews can
commit without snapping back. Nested shell expansion remains deferred pending
QA.

## 2026-09-05 7.12.90 Semantic Column + Slot Shell Positioning

The editable page-shell position model now matches the durable semantic
placement fields directly. Non-full-width shells expose a presentation-only
Column label derived from the sorted distinct `columnStart` values and a Slot
control mapped to `laneOrder + 1` within that column. Slot changes, Up/Down
shortcuts, and cross-column moves normalize affected lanes through the shared
semantic lane helper; Up/Down call the same explicit-slot implementation.
Cross-column moves preserve the approximate source slot when the destination
has room. New-column controls continue to place the selected shell at Slot 1,
and Column labels re-derive after structural changes.

Editable global `Pos N/N` is removed. Global column-major `order` is derived
only for compatibility, visual reading, Views/export, and persistence.
Full-width shells continue to show `Full` without Column or Slot; drag remains
an optional convenience and its semantic result is reflected by the same
controls. Nested shell expansion remains deferred pending browser QA.

## 2026-09-05 7.12.89 Deterministic Shell Columns and Navigator Anchor Stabilization

The page-shell editor now derives presentation-only Column A/B/C labels from
distinct semantic `columnStart` values. Explicit Column movement changes only
the selected shell's semantic column, preserves its lane where practical, and
offers at most one valid adjacent empty column per side. Horizontal arrows are
intentionally removed; Up/Down are lane-only semantic moves, Pos remains the
global column-major visual position, and current-frame free drag is retained as
an optional interaction.

Generic page-shell Navigator navigation keeps the measured fixed-header exact
top calculation, then holds a bounded post-landing anchor phase until the
target remains aligned for a consecutive stable-frame run. Browser scroll
anchoring is disabled only during that phase and restored on completion,
cancellation, or unmount. The target highlight begins only after final
stability. Top-level Settings search now uses the page-shell destinations once
while preserving child section targets. Nested expansion remains deferred
pending browser QA.

## 2026-09-05 7.12.88 Live Drag Geometry and Exact Shell-Top Navigation

The 7.12.87 drag regression came from continuing to hit-test against
drag-start rectangles and packed positions after live preview reflow. Move
previews now batch pointer updates through RAF, recapture the current rendered
shell geometry, repack metadata for that same preview frame, and derive each
preview from the immutable drag-start layout. Drop placement normalizes only
the source and destination semantic columns, preserving unrelated column
ownership while the visual global order is refreshed. Insertion indicators use
the same current-frame geometry.

Generic page-shell Navigator navigation now waits for consecutive stable shell
and header geometry frames after page-shell hydration. It measures the
rendered fixed top HUD wrapper, positions the requested shell top below that
header with a small gap, verifies on the next RAF, and permits one bounded
corrective scroll before starting the temporary highlight and clearing the
pending request. Nested-shell expansion remains deferred pending browser QA.
The dedicated Settings section exact-position issue remains deferred.

## 2026-09-05 7.12.87 Complete Navigator Shell Search and Reveal

Navigator now exposes the registered page shells as normal destination results.
The Food `food-library` shell supports direct nutrition, import, recipe, meal,
and saved-food aliases without creating duplicate destinations; nested Test/D20
shell destinations remain available under `test:d20`.

Generic shell navigation keeps its semantic request pending until the relevant
`pageKey` page-shell layout reports hydration readiness, then waits for the
mounted shell to have usable geometry before revealing it with centered smooth
scrolling. The resolved outer shell receives a temporary purple navigation
highlight that is removed automatically, safely replaced by a later shell
selection, and reduced to a static treatment for `prefers-reduced-motion`.

This completion does not change shell placement/order, packed layout, Views,
layout persistence, or shell dimensions. The dedicated Settings section
navigation exact-position issue remains deferred.

## 2026-09-04 7.12.85 Complete Empty-Column Shell Placement

Shell move previews retain the runtime-only horizontal grab offset, so the
source shell's intended left edge—not the raw pointer position—drives the
captured 12-column grid target. Empty horizontal destinations remain span-aware
and flow through semantic `columnStart` / `laneOrder` placement and live packed
reflow; no pointer pixel coordinates are persisted.

Edit-mode Left/Right controls now use the shared semantic placement model even
when no directional shell neighbor exists. They choose the nearest legal
adjacent empty column in source-span steps, clamp within the 12-column grid,
and place an empty destination in lane zero. Up/Down neighbor and lane
semantics remain unchanged. Empty drag indicators use the same captured grid
bounds, target column, and source span as the saved destination instead of a
full-width unrelated insertion line.

The focused page-shell suite covers grab offsets, empty horizontal movement,
span clamping, mixed packed layouts, semantic persistence, and the existing
pointer lifecycle. Browser QA for the remaining empty-column placement checks
is still pending with Andrew. No nested shells, SQL, schema, cloud persistence,
application-data, or iOS changes were added.

## 2026-09-04 7.12.84 Empty Packed-Column Drop Targeting

Custom shell dragging now maps the pointer into the captured 12-column grid
instead of inheriting a `columnStart` only from the nearest occupied shell.
Empty horizontal space can therefore create a new semantic right-hand (or
other available) column, clamped to the dragged shell's span. Existing occupied
columns still use their captured vertical lane geometry, and the resulting
`columnStart` / `laneOrder` flows through the existing placement and packing
authorities. Runtime grid bounds are captured only for the drag; no DOM
coordinates are persisted.

The regression is covered by the focused page-shell layout suite. No nested
shells, pointer lifecycle changes, SQL, schema, cloud persistence,
application-data, or iOS changes were added.

## 2026-09-04 7.12.83 Shell Pointer Lifecycle Hardening

Browser QA found that packed shell reflow could cause the originating move or
resize control to miss its release lifecycle, leaving the shared interaction
ref armed. Later mouse movement could then continue changing a shell after
physical release. `ReorderablePageShells` now centralizes move, width-only
resize, and width-plus-height resize lifecycle handling through one active
pointer ref and window-level capture-phase `pointermove`, `pointerup`, and
`pointercancel` fallbacks. Pointer capture remains a defensive enhancement;
capture and release are wrapped for controls that move or disappear during
reflow.

Matching `pointerup` clears the interaction and auto-scroll before committing
the preview once. Matching `pointercancel`, window blur, edit-mode exit,
preview invalidation from Reset/View application, and unmount cancel the
uncertain preview and clear all interaction indicators. A mouse-only stale
move with no pressed button also cancels; touch and pen button semantics are
left unchanged. The 7.12.82 visual shell QA remains pending until Andrew
passes the stuck-resize blocker checks.

No nested shells, SQL, schema, cloud persistence, application-data, or iOS
changes were added.

## 2026-09-04 7.12.82 Shell Growth, Semantic Placement, and Navigator Readiness

The shared page-shell engine now permits snapped custom heights above natural
content up to a shared safety maximum, preserves internal body scrolling for
short shells, and returns Expand to natural height. Custom layouts carry
portable semantic placement hints (`columnStart` and `laneOrder`); runtime
packing still fills gaps for unassigned shells, while drag/drop, directional
movement, and saved layout round trips preserve deliberate column/lane
placement. Legacy 7.12.79 through 7.12.81 layouts and saved Views derive the
same deterministic placement representation when metadata is absent.

Canonical Home and Settings widths remain unchanged. Custom shell workspaces
can use the available application width, and Reset Layout returns the
canonical width. Settings Navigator requests now wait for page-shell layout
hydration and final animation-frame geometry before acknowledging the request.
No SQL, schema, cloud persistence, or application-data changes were added.

Nested-shell audit for the next phase only; these candidates are not
implemented in 7.12.82:

- Health → Water: Totals, Daily Goal, Log Water, Water Trend.
- Health → Food → Favorites & Recent: Favorites, Recent Foods.
- Health → Food → Daily Totals: Nutrition Summary, Nutrition Details, Calorie Trend.
- Health → Journal → Journal Entry & History: Current Entry, Journal History.
- Tasks → On-Time: Schedule Summary, Preparation List, Destination & Timing.
- Tasks → Brainstorm → QA: Session Setup, Import Checklist, QA Checklist, Report/Results.
- Progress → Records: Global Task Records, Streak Records, Focus Records, Per-task Records.
- Test → D20 remains implemented and browser-QA passed.

Possible later boundary decisions are Health Today Snapshot cards, Health
Fitness Active Workout internals, Achievements, Task Report, and Brainstorm
Questionnaire. Keep Home task rows/day groups, Settings individual controls,
Notes individual note/search/tag controls, Stats mini-stat cards, Focus pager
internals, active Games internals, PATHS nodes/canvas, individual
Tasks/Steps/Substeps/table rows, and Roll internals out of generic nested
shell coverage for now. Roll should receive a page-level shell migration
first (Roll Station, Prize Board, Prize Basket, Recent Rolls) before any
nested decision.

## 2026-09-04 7.12.81 Shell Precision Controls, Packed Layouts, and Nested Test Scope

The shared page-shell editor now provides a top width-only resize affordance,
direct integer `W` span input clamped to 3/12 through 12/12, rendered pixel
width in the runtime-only dimension readout, and compact Up/Down/Left/Right
plus direct `Pos N/N` movement controls. Reorder controls remain hidden for a
single-shell page. Width and height edits repack custom layouts through a
deterministic earliest-fit 12-column occupancy algorithm: shells are processed
in authoritative semantic order, then placed at the earliest available row and
leftmost fitting column. Only semantic order, span, and height remain durable;
generated row/column coordinates and measured width remain runtime-only.

Food, Water, and Sleep canonical lane/group wrappers remain in place because
the packed custom layout does not replace those canonical arrangements exactly;
their Reset behavior and responsive grouping therefore remain protected. The
Water tall-log / short-neighbor regression is covered by the packed-placement
fixture.

Settings Navigator now scrolls the requested outer shell into the document
viewport and resets that shell body's internal scroll position, while retaining
the existing `settings-section-*` semantic targets. Test now has editable outer
shells `test-task-table`, `test-d20`, `test-dice-face`, `test-dice-material`,
`test-task-table-prototype`, `test-bucket-tray`, and `test-rule-builder`. The
D20 editor retains its nested `test-d20-sandbox` and `test-d20-controls` shells
under the separate `test:d20` layout scope. Clearly legacy 7.12.80 D20-shaped
`test` active preferences and saved Views migrate to `test:d20` without
overwriting valid target data or changing the layout/View schema.

Nested-shell source audit: Roll is a strong future candidate because its roll
board, history, prize pool/manager, and Vault are major independently useful
workspaces, but its reward persistence path remains outside this ticket.
Achievements / Progress is a possible candidate, although its Achievements,
Milestones, and Records regions are mutually exclusive tabs rather than
simultaneous workspaces. Games should stay a single shell while its hub and
modal games remain small; Focus already has the meaningful top-level timer,
goals, counter-history, and activity shells; Health already has tab-specific
major shells and protected Food/Water/Sleep grouping; Notes should retain its
two dashboard shells and editor boundary; Home should retain its single
`home-todo` shell; and Settings should retain its four major shells rather than
making individual controls movable. Tasks, Roll, Achievements / Progress, and
Games remain pending full page-shell migration.

No SQL, schema, cloud layout sync, application content, reward logic,
achievement calculations, Health calculations, Focus timer calculations, or
iOS-specific changes were added.

## 2026-09-04 7.12.80 Expanded Page-Shell Editing

Home now exposes one `home-todo` shell for the existing Home To-do List.
The main Settings page exposes the four major `settings-appearance`,
`settings-day-reset`, `settings-economy`, and `settings-import-export` shells
while preserving its Navigator section anchors. Notes exposes
`notes-scratch-paper` and `notes-library`; the full Note Editor remains an
editor/workspace state without dashboard shell chrome. Test exposes
`test-d20-sandbox` and `test-d20-controls` around the existing D20 mapper's
side-by-side regions.

All four pages inherit the generic page-shell editing, resizing, Reset Layout,
saved Web/iPhone Views, and layout-only JSON export systems; the three
multi-shell pages also inherit generic reorder. Home intentionally remains a
single non-reorderable shell.
Tasks / To-do, Roll, Achievements / Progress, and Games remain pending for the
next expansion wave. No SQL, schema, cloud layout sync, application content,
or iOS-specific changes were added.

## 2026-09-04 7.12.79 Page-shell shrinking and layout views

Explicit page-shell heights now remain effective at every viewport width. Shrink
and manual resize retain the 144px minimum for normally tall content, avoid
enlarging naturally short shells, and cap downward enlargement at measured
natural content height while PageShellSurface/PageShellBody keep frame and
internal scrolling ownership. Edit Layout reports width and current/natural
height. The shared shell hook now stores page-scoped named Web/iPhone layout
views in `adhdice-page-shell-views-v1:<user>` and exports registered page keys,
current layout presentation, saved views, target labels, and viewport metadata
as layout-only JSON. No SQL, cloud sync, application content, or deferred page
migrations were added.

## 2026-09-03 7.12.78 Canonical Page-Shell Lane and Stack Representation

Canonical page-shell metadata now supports independent lane groups whose shell
IDs render inside one grouped grid item. Food, Water, and Sleep use grouped
canonical lanes so one independent shell can sit beside a vertically stacked
set of shells while the existing mutable editing layout remains flat and
12-column based. Home, Settings, Notes, and Test page-shell expansion remains
pending.

## 2026-09-03 7.12.77 Canonical Page-Shell Layout Reset and Editing Foundation

Reset Layout now removes the current page/tab preference and returns Health
Today, Food, Water, Fitness, Journal, Weight, Sleep, Insights, Awards, and
Health Settings, plus Focus and Stats, to explicit pre-shell canonical layout metadata.
Food, Water, Fitness, Sleep, Weight, and Insights retain their original
placement/grouping and column relationships; natural height remains separate
from mutable custom order/span/height preferences. Custom-height shell slots no
longer clip the shell surface shadow; the visible surface owns its frame and
the shell body owns internal scrolling. Layout editing and resizing are
available for one valid shell, while reorder controls remain limited to pages
with at least two valid shells. Expansion of page-shell support to Home, Tasks,
Roll, Achievements, Games, Notes, the main Settings page, and Test remains pending.

## 2026-09-02 7.12.74 Responsive Shell Surfaces and Adaptive Fitness Content

Page shells now provide a reusable visual surface/body contract: explicit
height keeps the outer frame and header stationary while only the body scrolls.
Fitness Today and This Week use shell-width container queries for their metric
grids, and Focus Activity Summary and Focus Activity Trend are independent
reorderable shells. Legacy `focus-history` layouts migrate their saved slot and
size to both new shells. No SQL, schema, persistence authority, or iOS changes
were made.

## 2026-09-02 7.12.63 Health Report Nutrition Semantics and Presentation

Health Report nutrition target comparisons are descriptive: above target,
below target, or at target, without generic success/failure wording.
Incomplete macro coverage remains explicit, with null nutrients unknown and
numeric zero preserved as known data. Feeling/Symptom occurrence grammar is
singular or plural as appropriate, and Current Health Goals formats Sleep
with the shared human-readable duration formatter. Underlying Food/provider
nutrition anomalies are intentionally not repaired by Reports. No SQL,
schema, or persistence changes were made.

## 2026-09-02 7.12.62 Detailed Report Due Authority

Detailed ADHDice Report `Due` now uses the canonical presentation `due_on`
projection also shown by Table/List. Internal `active_occurrence_due_on` no
longer overrides the user-facing Due field. No Health reporting behavior
changed, and no SQL, schema, or persistence changes were made.

## 2026-09-02 7.12.61 ADHDice Report Health and Task Metadata

The existing Tasks -> Reports workspace now extends the copied/previewed
ADHDice Report with range-specific Health read data from persisted authority:
Food/Nutrition, confirmed Water, Journal, Feelings, Symptoms, Weight,
Movement, the Health sleep selector, and Workouts. Current Health goals and
settings are included as context and are not represented as historical goal
snapshots. Health Awards and Fitness Plans remain deferred from the behavioral
report.

All Available now includes dates from the fetched Health domains. Summary stays
compact and analytical; Detailed adds user-facing Health records and current
Task metadata including canonical Due, time, Energy, estimates, actual time,
Lists, Tags, links, and Notes. Task list names use the current membership
projection and retain the warning that historical membership is unavailable.
Health reads are independent of Health page activation, paginated for
unbounded ranges, and report domain failures as warnings without fabricating
zero data. No SQL, schema change, Health persistence change, Task State
authority change, report persistence, or Calendar work was added; Calendar
remains paused.

## 2026-09-01 7.12.59 Recurring Success Occurrence Identity

Recurring Done, Did My Best, and Complete outcomes now resolve and persist the
occurrence they actually satisfy through the canonical Task State authority.
Fixed recurrence targets the nearest scheduled occurrence on or after the
handled date; rolling recurrence resolves the current rolling obligation and
advances from its canonical cursor. Legacy identity-less successful History
facts self-heal during in-memory canonical read/replay when a prior Missed fact
makes the target safe to infer. Historical Missed facts remain preserved, and
Table/List, Calendar, and other projections continue to consume the shared
canonical result. No SQL, schema migration, or manual production-row repair
was used.

## 2026-09-02 7.12.60 Canonical Due Projection and Rolling Missed-Streak Read

Canonical current Due now travels through the shared Task read projection
alongside Active Status, so Table/List and related task surfaces no longer
rely on stale compatibility `due_on` when the engine derives a different
cursor. The projection revision includes canonical Due changes. Legacy rolling
success replay handles an already-advanced task cursor and closes the prior
active Missed streak while preserving historical Missed facts. The Play New
Game production Task was manually rescheduled by the user and was not altered
or repaired by this ticket. No SQL, schema change, or manual production data
repair was used.

## 2026-09-01 7.12.58 Metadata Home Navigation and Description Placement

Completed full-editor metadata edits now return to Summary after explicit
Save, Apply, terminal choice, or submit-key actions. Multi-select,
intermediate, textarea-blur, and ongoing timer interactions remain open until
Back; full-editor Delay returns to Summary after successful Apply without
closing Edit Task. Parent Description moved from the left column to the right
metadata card and follows the active Parent, Step, or Substep target. No SQL,
schema, or persistence changes were made.

## 2026-09-01 7.12.57 Edit Task Metadata Summary Navigation

The Metadata Summary is now the full-editor metadata home screen. The redundant
horizontal Metadata navigator was removed; existing property rows still open
the existing editors, and each non-Summary property editor provides a Back to
Summary control. Summary uses a compact responsive one-, two-, and three-column
layout. No persistence, schema, or SQL changes were made.

## 2026-09-01 7.12.56 Edit Task Metadata Summary

The full Edit Task inspector now defaults to a presentation-only Summary for
each newly opened Task, Step, or supported Substep metadata target. Summary
covers Title, Status, Priority, Energy, Due, Repeat, Estimated, Actual, Lists,
Tags, Link, and Notes; each property row routes into its existing editor.
Manual property selection remains open for the current target, while explicit
property focus requests still override the Summary default. No SQL, schema, or
persistence changes were made.

## 2026-09-01 7.12.55 Health Today Timeline

Health Today now adds a chronological Timeline beneath the existing Snapshot
and Quick Log. Timeline rows derive Food, Water, Feeling, Workout, Weight,
Journal, and precise Sleep events from canonical Health records, with no Today
persistence authority. Aggregate movement metrics and imported Sleep totals do
not receive fabricated activity times. No SQL or schema changes were made.

## 2026-09-01 7.12.54 Health Today Snapshot foundation

Health Today now provides a canonical-record-derived Snapshot for Journal,
Food, Water, Sleep, and Movement, plus Quick Log routes into the existing
Health tabs and forms. No Today database or persistence authority was added;
the chronological Today Timeline remains next. No SQL or schema changes were
made.

## 2026-09-01 7.12.53 Logged food calorie emphasis correction

Logged-food calories are emphasized inline within the existing metadata summary;
the standalone calorie line introduced in 7.12.52 was removed. The
snapshot-first calorie authority remains shared by logged cards and meal
totals, while planned food cards remain unchanged. No SQL or schema changes
were made.

## 2026-09-01 7.12.52 Logged food calorie readability

Individual logged foods in Health > Food now expose calories as a dedicated,
prominent line using the existing snapshot-first meal calorie authority. Meal
section totals and logged meal nutrition remain unchanged; planned food cards
are unchanged. The logged-card summary omits its calorie portion to avoid
duplicate display. No SQL or schema changes were made.

## 2026-09-01 7.12.51 Health Settings tab

Health Settings is now the final Health tab. The existing Health Settings
panel moved intact into that tab and no longer renders beneath every Health
section. The existing `profileDraft` and `saveProfile` profile persistence
authority remains unchanged. No SQL or schema changes were made.

## 2026-09-01 7.12.48 Journal QA and Feeling Trends UX

Journal History cards now keep Logged metadata collapsed independently per
entry, with `created_at` as the immutable Logged timestamp authority and
`MM/DD/YYYY` plus 12-hour AM/PM display when expanded. Core ratings and custom
Daily Template Feelings now flow through one responsive grid: one column on
mobile, two at medium widths, and three in the normal wide desktop Journal
pane; split mode remains at two columns for readability.

Feeling Trends now uses a grouped multi-select for All Feelings, category-all
groups, and individual cross-category blends. Selected no-history Feelings stay
selectable without zero-filled series, while active and archived-with-history
definition visibility remains unchanged. Successful Journal Save and Update
actions reuse `startNewJournalEntry()` to open a fresh entry while preserving
the selected Journal date and split workspace mode. No SQL, migration, or
schema changes were made.

## 2026-09-01 7.12.49 Journal rating cards, trend averages, and History dates

Journal core ratings and custom Feelings now use one shared rating-card design;
core cards show their scale descriptors, and the nested custom Feeling
`Not logged` shell is removed. Feeling Trends chips show a range-sensitive
visible-point average per Feeling, formatted as `Avg. N/10`, while selected
no-history Feelings still produce no chart line or zero chip. Journal History
date groups are independently collapsible by canonical `entry_date`, with
per-entry Logged metadata disclosure remaining independent. No SQL, migration,
schema, or persistence-model changes were made.

## 2026-09-01 7.12.50 Feeling Trends range polish

Feeling Trends now offers `1D`, `3D`, `7D`, `30D`, `90D`, and `All` in that
order. The 1D range is limited to the as-of date, the 3D range includes the
as-of date and prior two calendar dates, and existing longer/all-range
semantics remain unchanged. Existing per-Feeling visible-point averages and
no-zero-fill behavior apply automatically to the new ranges. No SQL or schema
changes were made.

## 2026-09-01 7.12.45 Journal UX correction

Journal now uses one responsive History/Journal toggle: short press switches
between Entry and History, while desktop long press or `ArrowDown` opens the
compact History Left/Right dock menu. Split History remains desktop-only, and
History mode keeps `+ New Entry`. Logged Date/Time metadata is collapsed behind
a chevron; Logged Date uses `MM/DD/YYYY`, and Logged Time reuses the compact
read-only AM/PM treatment. Core ratings and custom Daily Template Feelings now
share one `How are you feeling?` section, and all Journal scale pickers can be
closed without selecting a score. Feeling Trends include every active Feeling,
retain archived Feelings with occurrence history, and show occurrence notes in
History hashtag popovers. No SQL or schema changes were made.

## 2026-09-01 7.12.46 Journal metadata sizing correction

Journal and Logged Time now share one fixed compact `8.5rem × 32px` control
contract through `HealthStandardTimeInput` in both editable and read-only modes,
while retaining normalized storage and 12-hour AM/PM display. Journal Date and
Logged Date retain matching compact width, height, border, spacing, and responsive
typography; Logged Date remains read-only and uses `MM/DD/YYYY`. No SQL or schema
changes were made.

## 2026-09-01 7.12.47 Journal unsaved metadata sizing correction

Unsaved Logged Time now uses the shared read-only `HealthStandardTimeInput`
placeholder treatment, so `When saved` has the same compact `8.5rem × 32px`
control size as Journal Time and saved Logged Time without presenting a fake
timestamp. Unsaved Logged Date remains `When saved` with matching Journal Date
sizing. No SQL or schema changes were made.

## 2026-09-01 7.12.44 Journal workspace QA corrections

Journal workspace split controls (`History Left` and `History Right`) are now
desktop-only at `md+`; narrow screens retain the normal History single-pane
action. History-only mode now exposes `+ New Entry` in the workspace header and
uses the existing `startNewJournalEntry()` authority, while split-mode Entry
actions continue to preserve split mode. No SQL, schema, or migration changes
were made.

## 2026-09-01 7.12.43 Journal Feeling ownership, time display, and workspace

Journal is now the only rendered workspace for Feeling Occurrences. Symptom
occurrences are Journal-owned by required `journal_entry_id`; the authored-only
`supabase/enforce_health_feeling_journal_ownership_7_12_43.sql` removes known
orphan test rows, enforces the constraint, and verifies the cascade FK. It has
NOT been applied remotely.

Journal displays Journal Date/Time separately from immutable Logged Date/Time,
using the shared compact 12-hour AM/PM control for Journal and occurrence
times. Entry and History are one responsive workspace with exact-ID editing,
desktop History Left/Right split options, and a mobile single-pane fallback.

Feeling Trends graph raw timestamped occurrences for Symptoms, Emotions, and
Other Feelings as separate colored series, including archived definitions;
Daily Log snapshot ratings are excluded. Focused source/tests were updated.
Browser, live Supabase, deployment, full build, typecheck, and full-suite
verification remain outstanding.

## 2026-08-31 7.12.41 Journal snapshots and Feeling Occurrences

Journal Entries are now identified by row `id`, so multiple timestamped
snapshots may share one `entry_date`. Each snapshot requires an `entry_time`,
while immutable `created_at` remains the actual Logged time. The Journal editor
now combines core metrics and explicit Journal Library `in_template` Feelings
under `How are you feeling?` / `Your Daily Template`. Snapshot ratings remain
separate per Journal Entry and retain 0 versus Not logged semantics.

Symptoms, Emotions, and Other Feelings are presented as unified `Feeling
Occurrences`. Hashtags create occurrence drafts only; they do not add template
Feelings or snapshot ratings. Canonical symptom occurrences continue using
`adhdice_health_symptom_entries`; Emotion and Other Feeling occurrences persist
through `adhdice_health_journal_signal_occurrences` with 1–10 scores and
occurrence timestamps. The authored migration is
`supabase/add_health_journal_multiple_entries_7_12_41.sql`; it has NOT been
applied remotely. No schema deployment was performed. Browser, live Supabase,
and deployment verification remain outstanding.

## 2026-09-01 7.12.42 Journal persistence hardening

The approved 7.12.41 Journal architecture is preserved. Its authored-only
migration is hardened before live deployment with idempotent occurrence-table
policies/triggers, and database validation now restricts native Feeling
Occurrences to Emotion and Other signals. The migration remains NOT remotely
applied; no live schema deployment was performed. Focused source and
persistence checks cover the guard and preserve canonical symptom occurrence
storage.

## 2026-08-31 7.12.40 Journal Feeling overlay color picker

The Your Day post-hashtag rating overlay now exposes the existing shared color
control for Emotion and Other Feeling tags beside the compact `Skip` action.
Both controls use the anchored `HealthColorControl` / `HealthAccentColorPalette`
treatment and persist through the existing `HealthJournalSignal.color` and
`updateJournalSignal` authority. Symptom occurrence overlays remain on the
canonical `HealthSymptom.color` and `setSymptomColor` path. No SQL or schema
change was made. Multiple Journal Entries per day is deferred to 7.12.41.
Browser, live Supabase, and deployment verification remain outstanding.

## 2026-08-31 7.12.39 Journal History hashtag interaction and overlay stabilization

Journal History now preserves reflection prose while rendering recognized current
canonical Symptom, Emotion, and Other Feeling hashtags as accessible interactive
tags. Each tag opens a compact read-only detail popover: symptom tags show only
timestamped occurrences owned by that Journal Entry and canonical symptom,
repeated same-symptom tags show the same complete occurrence set, and a separate
Daily Log overall score is shown when present. Emotion and Other Feeling tags
show their Journal Entry rating or `Not logged` using the persisted scale labels.
Tag accents use the canonical symptom or Journal Feeling color. The Your Day
hashtag overlay remains floating and does not autofocus or scroll the page;
closing it restores the reflection caret with `preventScroll: true`. The
symptom occurrence overlay reuses the canonical symptom color picker, so color
changes update the HealthSymptom everywhere. The independent symptom-history
surface now uses softened user-facing terminology. No SQL or schema change was
made. Multiple Journal Entries per day is deferred to 7.12.41. Browser, live
Supabase, and deployment verification remain outstanding.

## 2026-08-31 7.12.38 Journal hashtag occurrence overlay and color correction

Journal hashtag selection still captures the active query before asynchronous
symptom-wrapper creation and replaces only that query in the latest controlled
reflection state, preserving newer prose and earlier tags. Symptom hashtag
selection adds or reuses one Daily Log row, then opens a compact floating
occurrence overlay with 1–10 severity and a time input. Saving appends a new
`journalOccurrences` draft with no database ID; repeated same-symptom hashtags
remain independent timestamped occurrences, while the Daily Log overall score
stays separate. Emotion and Other Feeling hashtags retain their 0–10,
0-versus-Not-logged Daily Log behavior through the same overlay authority.
Symptom, Emotion, and Other Feeling color controls now use the same anchored
palette popover treatment while preserving their existing color authorities.
There is no schema or SQL change. Multiple Journal Entries per day remains
deferred to 7.12.40. Browser, live Supabase, and deployment verification remain
outstanding.

## 2026-08-30 7.12.36 Journal readability/layout polish

Journal expanded scales now use readable two-column layouts with full labels.
Core metrics remain 1–10 with a separate `Not logged` action; custom Feelings
show an explicit score-0 `None` option while preserving null as Not logged.
Your Day fills the Journal Entry column, and the Journal Library now creates
Emotions and Other Feelings from compact section-local rows using default
labels. The hashtag picker keeps its existing behavior with clearer spacing
between Symptoms, Emotions, and Other Feelings. No SQL, schema, persistence,
History, native, or iOS behavior changed; browser verification remains
outstanding.

## 2026-08-30 7.12.35 Journal Feeling UX and unified Symptoms Library

Journal now presents user-facing Journal signals as Feelings and exposes one
Symptoms Library backed by canonical Health symptoms. Symptom-backed Journal
wrappers remain internal and are created or reused only when Journal behavior
needs them; canonical renames flow through to Journal display names, while
archived symptoms are excluded from new templates, Add, and hashtag choices.
Journal Feelings use normalized eleven-label 0–10 scales with legacy endpoint
compatibility, compact collapsed score controls, readable core metric labels,
and full-label editing. The Journal Library header is always visible and
manually collapsible; Manage Journal Library expands, scrolls, and focuses it.
Symptom color palettes use a full-width Library row. Typing `#` in Your Day
opens a keyboard-accessible picker that adds a selected Feeling to the current
Daily Log without assigning a score or synchronizing deletion from reflection
text. The authored migration is
`supabase/add_health_journal_scale_labels_7_12_35.sql`; it has not been
applied. Focused source/logic tests and diff checks passed; browser, live
Supabase, and deployment verification remain outstanding.

## 2026-08-30 7.12.34 Journal Entry and customizable Daily Log foundation

Health Journal now has one date-unique Journal Entry editor with nullable Mood,
Energy, Stress, and Mental Clarity scores, reflection text, a persistent
per-user Journal Library, and a customizable Daily Log template. Signals are
stored independently from entries, support symptom-backed canonical names plus
emotion and other labels, preserve stable template order, and use explicit
0/Not logged semantics. Journal-owned symptom occurrences retain their own
timestamped severity rows and cascade with the parent entry; standalone symptom
history remains separate. Legacy symptom tags remain readable but are no longer
written by the Journal editor. The migration
`supabase/add_health_journal_daily_log_7_12_34.sql` is live; this 7.12.35
refinement follows its browser QA findings, while live deployment verification
for the refinement remains outstanding.

## 2026-08-30 7.12.31 Tasks Calendar Month View

Tasks now includes a first-class Calendar Month View with a Monday-through-Sunday
grid, compact timed and untimed task rows, and a collapsed No Due Date section.
Calendar placement is a live projection of each visible Task's `due_on` and
`due_time`, including the current resolved metadata for recurring Tasks; future
recurrence projection and drag-to-reschedule remain intentionally deferred.
Calendar uses the existing Tasks workspace scope, filters, hierarchy visibility,
Include Steps preference, Task editor, and Add Task flow. No SQL, schema,
Calendar-specific persistence, or independent recurrence behavior was added;
browser QA remains outstanding.

## 2026-08-30 7.12.32 Calendar TaskApp hook-order correction

The Calendar Tasks derivation now runs in TaskApp's unconditional derived-data
section before the boot and authentication render guards. This preserves the
React Rules-of-Hooks ordering across loading, signed-out, and ready renders.
Calendar UI, filtering, metadata authority, recurrence behavior, and persistence
are unchanged; browser QA remains outstanding.

## 2026-08-30 7.12.33 shared Task editor retirement

The obsolete `TaskEditorModal` and its modal-only state, flow contract, and
restore path are retired. `TaskManagementTableV2` is now the sole active Task
editor. Calendar Add, normal New Task, Scratch-created Tasks, and Health
reminder templates use canonical Task creation and immediately open the
persisted row in the shared editor; Calendar dates are stored as the real
`due_on` value. Existing Calendar metadata authority, filters, Include Steps,
No Due Date, and recurrence behavior are unchanged. Future recurrence
projection and drag-to-reschedule remain deferred. No SQL or schema change was
made; browser QA remains outstanding.

## 2026-08-30 7.12.23 Health Journal symptom management

Symptom Trends now supports an `All Symptoms` view with one persisted-color
series per symptom that has visible timestamped entries, including archived
symptoms with history. The shared activity chart derives date-axis labels from
the combined date domain, while preserving raw points and same-day positions.
Symptom Library now supports definition-only creation and reuses the approved
symptom color palette for persistent color editing. No schema, SQL, Supabase,
native, or iOS behavior changed; browser verification remains outstanding.

## 2026-08-30 7.12.24 Health Journal trend collision and Library row polish

Journal trend points that share a calendar date and severity now receive a small
timestamp-ordered visual micro-spread around the canonical date position, while
axis labels remain calendar dates and paths, circles, pointer selection, and
active markers share the adjusted coordinates. Opt-in Journal collision details
show every collided symptom entry together; Focus and Nutrition retain their
existing detail behavior. Symptom Library creation controls now share a compact
wrapping row on wider screens. No SQL, schema, persistence, native, or iOS
behavior changed; browser verification remains outstanding.

## 2026-08-30 7.12.25 Symptom Library create row sizing

The Symptom Library definition-creation row now lets its input fill the
available desktop/tablet width while keeping Cancel and Save compact at the
right edge. The row still wraps naturally on narrow mobile screens. Journal
trend, chart collision, symptom color, and persistence behavior are unchanged;
browser verification remains outstanding.

## 2026-08-30 7.12.26 overnight Quick Fix bundle

The Task Table Edit Task surface now selects visible Steps and Substeps as
metadata targets while retaining the parent editor root. HUD and Task Table
layout cloud freshness now arbitrate independently inside the existing account
settings envelope, including legacy timestamp fallback. Home Todo edge arrows
move within the current visible day or Later section. Water now supplements
its existing controls and history with the shared daily fl oz line chart, and
Nutrition calorie plus Sleep charts show their existing persisted goals as
optional shared reference lines. No SQL, schema, native, or iOS changes were
made; browser and cross-device verification remain outstanding.

## 2026-08-30 7.12.30 Water UI polish

Water new-entry amount and Daily Water Goal controls now use compact Health
input sizing. New-entry Date and Time share a compact wrapping row, while
historical Water entries use full-width expanded rows with readable compact
Amount, Unit, Date, and Time edit controls. Historical confirmed entries now
reuse the existing Delete action. Water goal controls stay on one row at
desktop/tablet widths and wrap on narrow mobile. Water persistence, Pending /
Confirm semantics, calculations, analytics, graphs, SQL, schema, native, and
iOS behavior are unchanged; browser QA remains outstanding.

## 2026-08-30 7.12.29 QA corrections and UI polish

Step/Substep title handoff now targets the active metadata child and starts
inline rename as one interaction, including when an earlier child rename
blurs. The desktop Edit Task metadata card keeps its natural height while
staying sticky in the existing editor scroller. Water entry controls now
separate Confirmed/Pending status from Fl oz/Cups/Custom mode, use 5/10/20 fl
oz or 1-cup presets, and pass the selected local date and time into new
entries. The Daily Water Goal editor is compact and collapsible, and Water
point details show current-goal over/under context. Navigator Search raises
only the active dock layer above sticky Table headers. No SQL, migration,
schema, native, or iOS changes were made; browser QA remains outstanding.

## 2026-08-30 7.12.28 QA failure corrections

Step/Substep title clicks in the current parent Edit Task surface now target
the clicked child in the existing metadata pane and begin the existing inline
rename, while the parent remains the editor root. Health Page now destructures
the existing Water confirmation callback, preventing the Water-page runtime
ReferenceError. No SQL, migration, schema, persistence, or Supabase changes
were made; browser QA remains outstanding.

## 2026-08-30 7.12.27 QA corrections and Water/import workflow

Edit Task source Step/Substep rows now use the existing current-editor routing
for neutral row clicks while preserving nested controls. Home Todo arrows now
move tasks to the absolute durable first/last positions and assign Today/Later
edge offsets. Water adds a persisted positive `water_goal_ml`, a shared-chart
goal line, and nullable `confirmed_at` Pending/Confirm semantics with
confirmed-only totals and history. The shared Import Tasks adapter now reports
real recursive persistence progress, including failed or skipped descendants.
The authored-only `supabase/add_health_water_goal_and_confirmation_7_12_27.sql`
migration was applied manually; browser, cross-device, and live SQL
verification remain outstanding.

## 2026-08-30 7.12.22 Health Journal color picker Safari correction

Health Journal symptom color actions and palette buttons now prevent pointer
focus transfer before click, keeping the parent `HealthDropdown` open while
the color action runs. Keyboard activation remains available, and symptom
selection still closes the parent dropdown. No schema, SQL, Supabase,
persistence, chart, native, or iOS behavior changed.

## 2026-08-30 7.12.21 Health Journal symptom colors

Health Journal symptom definitions now persist an approved accent color with a
purple fallback for legacy rows. Both Journal symptom dropdowns expose a
compact per-symptom palette action without nesting controls inside a label or
selecting the symptom. Symptom Trends passes the selected definition color to
the existing shared chart. The authored-only
`supabase/add_health_journal_symptom_colors_7_12_21.sql` migration must be
applied manually; no production SQL, browser, native, or iOS verification was
performed.

## 2026-08-30 7.12.20 Health Journal dropdown structure correction

Health Journal `HealthDropdown` controls now use neutral composite field wrappers
so Safari label activation cannot reopen a closed option panel after a pointer
selection. Focus and Nutrition chart defaults, symptom trends, symptom
persistence, and other Health UI behavior are unchanged.

## 2026-08-30 7.12.19 Health Journal trend QA corrections

Health → Journal Symptom Trends now uses the approved compact plot proportions,
groups same-day entries on one calendar-date X position without collapsing raw
points, and prevents pointer selection from reopening `HealthDropdown` after a
symptom choice. Focus and Nutrition chart defaults, symptom persistence, and
other Health UI behavior are unchanged.

## 2026-08-30 7.12.18 Health Journal trend summary correction

Health → Journal Symptom Trends now labels the graph summary `Latest` and
shows the severity from the last plotted timestamped entry in the selected
range. Raw entries remain separate points; symptom severities are not summed,
averaged, or otherwise aggregated. No persistence, schema, SQL, recovery,
dropdown, Focus, Nutrition, or browser behavior changed.

## 2026-08-30 7.12.17 Health Journal symptom trends

Health → Journal now includes a read-only Symptom Trends section backed by the
timestamped symptom-entry ledger. Users can select active symptoms or archived
symptoms with history, view 7D/30D/90D/All ranges (30D by default), and inspect
each severity 1–10 entry as its own chronological graph point, including
multiple entries on the same day. The graph reuses `ActivityLineChartCard`,
including its existing responsive, hover, keyboard, and pinning behavior. No
schema, SQL, persistence, mutation, native, Realtime, or browser work changed.

## 2026-08-29 7.12.8 Health Journal symptom recovery

Health symptom definitions and timestamped entries now reconcile local-only
rows into Supabase before successful remote hydration replaces the visible
snapshot. Definitions are recovered before dependent entries, recovery is
stable-ID based and idempotent, and local rows remain visible if either
recovery step fails. The existing 7.12.7 migration filename is unchanged;
symptom tables are not added to Realtime because no subscriber exists. No
production SQL, browser, native, or iOS verification was performed.
Journal Trends/Graphs were deferred here and are delivered in 7.12.17.

## 2026-08-28 7.12.7 Health Journal symptom tracking foundation

Health → Journal now keeps the existing daily check-in authority for Mood,
Energy, Signals, and Reflection, with Mood and Energy expanded to 1–10. A
separate user-owned symptom library and timestamped severity ledger support
multiple measurements of the same symptom on one day, including notes and
edit/delete controls. Definitions archive rather than being removed, so
historical entries continue to resolve their names. Symptom persistence has a
narrow local fallback boundary while the authored-only
`supabase/add_health_journal_symptom_tracking_7_12_7.sql` migration is pending;
no production SQL, browser, native, or iOS verification was performed.

## 2026-08-28 7.11.96 Commit-time Fitness scope invalidation

Fitness Goal and Level scope authority now synchronizes in a
commit-synchronous `useLayoutEffect`, before the passive Fitness reload
lifecycle effect runs. Scope and epoch changes therefore invalidate old
mutation responses as soon as the new committed Fitness activation, account,
or Supabase client is observable. Reload generation remains separate and
reload-only; ordinary reloads do not change the Fitness scope epoch. No Goal or
Level behavior or persistence semantics changed; no SQL, migration, Edge,
browser, or device work was performed.

## 2026-08-28 7.11.95 Fitness mutation scope epoch

Fitness Goal and Level mutations now capture both the active Fitness
client/user scope and a per-hook Fitness scope epoch. The epoch advances when
Fitness activation, account, or Supabase client scope changes, including leave
and re-entry with the same account/client; ordinary reloads advance only the
reload generation. Reload responses remain protected by scope plus reload
generation, while Goal/Level mutation responses remain protected by scope plus
scope epoch. No Fitness Goal behavior or persistence semantics changed; no SQL,
migration, Edge, browser, or device work was performed.

## 2026-08-28 7.11.94 Fitness mutation scope decoupling

Fitness Goal and Level mutations now use only their captured active
client/user scope for response validity. Same-scope reloads may still advance
reload generation without discarding a successful mutation response, while
reload responses remain protected by the existing scope-plus-generation guard.
No Fitness Goal behavior or persistence semantics changed; no SQL, migration,
Edge, browser, or device work was performed.

## 2026-08-28 7.11.93 Fitness Goals stale-scope mutation guard

Fitness Goal and Level mutations now capture the existing Fitness client/user
scope and reload generation before asynchronous work. Stale responses are
quietly ignored before Goal/Level state or hook errors are changed, and an
`updateGoal` Exercise Library lookup cannot continue into a Goal write after a
scope change. Reorder reload follow-ups retain the same guard while accepting
their own fresh reload generation. No Fitness Goal behavior or persistence
semantics changed; no SQL, migration, Edge, browser, or device work was
performed.

## 2026-08-28 7.11.92 Water History entry editing

Health → Water → Water History now exposes individual historical water entries
inside an ephemeral per-day `Entries` expansion. Historical rows reuse the same
canonical `WaterEntryCard` editor and `updateWaterEntry` save path as Today’s
Water, including amount/unit conversion and date/time recalculation. Successful
date edits re-group entries immediately; moving an entry to today removes it
from History and shows it in Today’s Water, while empty historical groups
disappear naturally. The existing 14-day History window remains unchanged. No
water schema, SQL, migration, persistence hook, deployment, or iOS behavior
changed.

## 2026-08-28 7.11.91 Fitness Goals UI metric authority

Health → Fitness exposes the existing canonical Fitness Goals system. Goal
metric selection is independent of the Exercise Library compatibility
`default_measurement` field; current PR, Goal progress, Level progress, and
reached state are derived from matching canonical Workout Exercise
observations and self-heal after corrections or deletions.

## 2026-08-28 7.11.89 Navigator Search inline mode

Navigator Search now opens inline inside the expanded Navigator. Search is the
far-left control; activating it temporarily replaces the Navigator icons with
a search field and dock-attached results. Existing destination registry,
ranking, and navigation authorities remain unchanged.

## 2026-08-28 7.11.88 Navigator Search

The expanded Navigator now includes a compact `Go To` search palette for direct
navigation to visible top-level pages, Tasks surfaces and views, canonical
Health tabs, and selected Settings sections and controls. Search uses a local
destination registry with simple title/breadcrumb/keyword ranking; it does not
search user content, query Supabase, or introduce another navigation authority.
Tasks reuse the existing surface and view state seams, Health reuses the shared
tab preference, and Settings uses a one-shot mount-aware section scroll request.

## 2026-08-27 7.11.84 Trusted History outcome batch

Multi-date History Calendar Done / Did My Best / Missed edits now use one
trusted browser-to-Edge `history_outcome_batch` request. The Edge branch
validates and deterministically orders the dates, then sequentially executes
ordinary canonical `set_outcome` children with threaded revisions and stable
child replay identities. Each child retains its own History fact, canonical
revision, and reward entitlement decision. Child Achievement evaluation is
deferred through a backend-only SQL wrapper and one deterministic final
Achievement evaluation runs after the children complete. Partial failures keep
earlier committed dates; final Achievement failure is reported as a
post-commit warning. Production has been verified with migration
`20260828033531 patch_task_state_history_batch_achievement_boundary_7_11_84`,
`adhdice_execute_task_state_command_deferred_achievements(uuid,jsonb)`,
`adhdice_finalize_task_history_batch_achievements(uuid,uuid)`, Task State
ACTIVE v27, and the Edge deployment pinned to reviewed 7.11.85 commit
`5b47fcf4ab03802ad57d6ef7cc0c0d006dc7c73e`. This is a documentation
correction; no SQL was reapplied and the Edge Function was not redeployed.

## 2026-08-27 7.11.85 Partial History batch Achievement finalization

Partial History outcome batches now run the same deterministic final
Achievement evaluation whenever at least one deferred child committed or
replayed before the batch stopped. The canonical child failure remains the
primary error, while finalizer failure is reported as a post-commit warning;
zero-commit failures do not run the finalizer. The outer replay identity and
deterministic Achievement operation identity remain unchanged for recovery.

## 2026-08-27 7.11.86 Non-blocking startup History hydration

Initial workspace rendering no longer waits for the full canonical Task History
table. Tasks/profile render after critical startup data is ready; full History
hydrates asynchronously, and rollover remains gated until History hydration
completes. A History failure leaves the workspace visible, keeps History
not-ready, and preserves the existing warning path.

- Active Workout Sandbox MVP is implemented as a temporary local runtime using the existing canonical Workout → Workout Exercise → Set system rather than introducing another permanent session authority.
- This document summarizes current authority and known limits; it does not establish browser parity or gate activation.

## 2026-08-28 7.11.87 History readiness boundary for Active Status

Workspace rendering remains non-blocking, but History-dependent Active Status
authority does not activate until full History readiness. While History is
pending or failed, persisted canonical compatibility Task status is used for
presentation rather than treating unloaded History as an empty History
snapshot. History-dependent smart-list rules likewise remain inactive until
the full snapshot is ready, while ordinary status filters and buckets use the
persisted status projection. Rollover remains gated by full History readiness.

## 2026-08-27 7.11.82 Multi-date History Calendar sync optimization

Multi-date History Calendar Done / Did My Best / Missed edits now use the
existing multi-date canonical sync path, preserving sequential revision-safe
commands while collapsing repeated History reload/streak reconciliation into
one final refresh.

## 2026-08-27 7.11.83 History Calendar Realtime containment

Multi-date History mutations now suppress their own Task Realtime echoes for
the full mutation lifetime, and known-task History Realtime changes use
targeted History reconciliation rather than whole-account History scans.

## 2026-08-27 7.11.81 Authoritative Task search selector excludes trashed descendants

Versions 7.11.79 and 7.11.80 corrected parallel derived search evidence, but
browser QA showed the authoritative Task search selector re-added trashed
descendants during selected-root hierarchy expansion. Version 7.11.81 fixes
that selector eligibility while preserving active descendant search,
manual/smart list descendant behavior, and Trash search.

## 2026-08-27 7.11.79 Active Task search excludes trashed child evidence

Normal active Task search no longer lets stored-trashed Step/Substep titles
pollute an active parent result. Active child title and tag ancestor-context
search remains supported, and direct Trash search remains findable through the
existing Trash scope and hierarchy behavior. No hierarchy, Task State,
recurrence, History, SQL, Edge, or iOS behavior changed.

## 2026-08-27 7.11.80 Real child-preview search filtering

The 7.11.79 source-child search filters did not cover the parallel child-preview
search path exposed by browser QA. Version 7.11.80 filters stored-trashed child
preview evidence outside Trash while preserving active child title/tag search
and existing Trash hierarchy behavior. No global child-preview construction,
hierarchy, delete, Task State, recurrence, History, SQL, Edge, or iOS behavior
changed.

## 2026-08-27 7.11.78 Task State Achievement-deferral RPC compatibility

The 7.11.77 Achievement-deferral architecture passed source review, but
production `pg_get_functiondef` compact formatting caused the two literal
loop/finalization migration anchors to miss. Version 7.11.78 makes only those
anchors whitespace-tolerant and fail-closed. Task State and Achievement
semantics are unchanged; SQL remains unapplied and no Edge source changed.

## 2026-08-27 7.11.77 Task State schedule-backfill Achievement deferral

Live QA task AB3 confirmed that Daily schedule backdating could return Edge
422 after roughly 9–10 seconds because the canonical Task State RPC inserted
each automatic Missed fact separately while the History trigger performed a
full Achievement evaluation for every row. The transaction rolled back
cleanly; this was a performance timeout, not a recurrence or business-rule
rejection. The authored-only
`supabase/patch_task_state_achievement_deferral_7_11_77.sql` reuses the
established `defer_rollover_achievement_evaluation_7_1_0.sql` architecture:
it keeps per-row Achievement source capture and Step-set refresh active,
defers only repeated full evaluation with a transaction-local setting, clears
that setting, then runs one deterministic command-scoped strict final
evaluation and raises on any non-success status. Automatic Missed generation,
History, Calendar, recurrence, streaks, rewards, and `statement_timeout` are
unchanged. The migration remains authored-only pending source review; no SQL
was applied and no Edge source or deployment changed.

## 2026-08-27 7.11.76 Task State client reconciliation

Canonical Due and Repeat commits now force a fresh task-scoped History read
before the existing local History and streak-summary reconciliation callback,
including schedule replays that generate automatic Missed facts without a
normal History side-effect ID. The committed canonical Task and fresh History
therefore update current streak, missed streak, Last Done, and related fields
without a page reload. Table, List, Step, and Substep Delay status surfaces now
share an eligibility rule requiring a real due date and an allowed lifecycle;
the direct Task-app Delay handler also fails closed for unscheduled Tasks.
Canonical occurrence validation remains authoritative. No SQL or Edge source
changed; no SQL application, Edge deployment, browser QA, or device QA was
performed.

## 2026-08-27 7.11.75 Task History Calendar correctness

Ordinary canonical Calendar projection now consumes a proven non-null
`effective_due_on` from a canonical Delay row, so the original obligation is
Not Due until the effective occurrence date; legacy identity-less Delay
fallback remains unchanged. History Calendar outcome replacements now send one
canonical `set_outcome` command, allowing the existing trusted planner and RPC
contract to atomically replace an automatic Missed outcome, remove dependent
automatic Missed facts, and replay the rolling recurrence. Not Due and explicit
Clear retain their `clear_outcome` plus Calendar-override semantics. No Edge
source or SQL changed; no Edge deployment, SQL application, browser QA, or
device QA was performed.

## 2026-08-27 7.11.74 Task State forward patch correction

The 7.11.73 TypeScript/source behavior passed architecture review. Review of
the installed production RPC formatting exposed an authored SQL anchor mismatch:
the forward patch assumed a pretty-printed automatic History guard while
production used the same guard in compact form. Version 7.11.74 corrected the
forward patch with an exact, whitespace-tolerant, fail-closed anchor check.
SQL and Edge deployment remain pending; browser QA and device QA were not
performed for this source correction.

## 2026-08-27 7.11.73 Canonical Task State correctness

Status-circle Delayed actions on Table/List task, Step, and Substep surfaces now
open the existing Delay date-selection flow; the selected date is committed
through canonical `delay_occurrence`, preserving the original occurrence and
updating the compatibility `due_on` projection to the effective delayed date.
Canonical schedule replay now materializes only past unresolved automatic
Missed facts for a backdated schedule change in the same command transaction.
Manual History and Calendar overrides remain authoritative, Not Due stays
derived, current logical day remains live, and automatic Missed facts carry no
positive completion or reward side effects. Fitness Goals migration is live and
verified; Goals UI remains explicitly parked. Focused source tests cover the
7.11.73 regressions. An authored-only forward RPC patch extends the existing
automatic History contract for schedule replay; no SQL was applied. Edge
deployment, browser QA, and device QA were not performed by this source change.

## 2026-08-26 7.11.72 Fitness Goals source-review corrections

The 7.11.71 Meal Plan pending mutation recovery source review passed. Fitness
Goals reload failures now use the shared error formatter: missing-table,
schema-cache, `42P01`, and `PGRST205` failures return only the friendly
7.11.69 migration message, while unrelated errors remain unchanged. The
consolidated `supabase/schema.sql` Goal and Level policies now mirror the
authored migration's authenticated owner predicates. The
`supabase/add_health_fitness_goals_7_11_69.sql` migration is now live and
verified. Goals UI remains parked; no performance/PR engine or generic Records
or Achievements integration was added.

## 2026-08-26 7.11.71 Explicit Meal Plan pending mutation recovery

The 7.11.70 source review found that absence-based Meal Plan recovery was
ambiguous across devices: an arbitrary local-only row could be either an
unsynced create or stale cache for a legitimate remote deletion. Version
7.11.71 replaces that rule with a per-user, Meal-Plan-specific pending mutation
journal. Local fallback create/edit/delete operations record explicit upsert or
delete intent; successful remote hydration replays only those journal entries,
clears only completed operations, and keeps failed local intent visible for
retry. Unmarked local-only cache now yields to successful remote authority.
No SQL or migration changed or was applied.

## 2026-08-26 7.11.70 Meal Plan recovery

Meal Plan hydration now reconciles local-only rows against successful remote
results, promotes those rows with owner-scoped idempotent upserts, and keeps
local rows visible for retry when promotion fails. The live Meal Plan Done RPC
is already the corrected two-argument function
`adhdice_confirm_health_meal_plan_entry(uuid, date)`: the 7.11.62 confirmation
correction and 7.11.63 qualified ambiguity correction are live. This source
inspection does not establish browser or device QA.

## 2026-08-26 7.11.69 Fitness Goals + Levels Foundation

The 7.11.68 On-Time source review passed; browser QA remains deferred. Fitness
Goals + Levels foundation adds `single_set_reps`, `session_total_reps`,
`longest_set_duration`, and `session_total_duration`, while keeping Workout →
Workout Exercise → Set as the canonical performance authority. Personal Records,
threshold reached state, and reached dates are derived from current canonical
rows, so corrections and deletions self-heal; no PR, record-history, or
achievement rows are persisted. Goals and Levels persist configuration only,
with owner-scoped relationships and explicit Level ordering. The
`supabase/add_health_fitness_goals_7_11_69.sql` migration is live and verified.
Goals UI remains parked; no Goals/Records UI, generic Records integration, or
Achievement integration was added.

## 2026-08-26 7.11.68 Preserve On-Time Stop & Save Progress

The 7.11.67 Table Due implementation/source review passed; real offline browser
failure-path QA remains deferred. On-Time Stop & Save now persists
occurrence-owned linked-item `savedElapsedSeconds` inside the existing JSON
`plan_state`. The root cause was active-timer-only elapsed accounting, which
lost progress when the timer row was deleted. `Task.actual_seconds` remains
lifetime Task time and is not planner-progress authority. Start continues saved
progress, Restart resets planner deadline progress semantics, and Reset Deadline
preserves saved progress. Recurring occurrences remain isolated, Finish & Log
records the same timer progress exactly once, and no SQL/schema migration was
added.

## 2026-08-26 7.11.66 Table Due optimistic failure reconciliation

Food work from 7.11.59 through 7.11.65 is QA accepted. The Coke/Open Food
Facts accuracy investigation remains deferred. Table Due mutations now receive
canonical success/failure acknowledgement; failed optimistic Due changes
restore their captured complete Table row snapshot, and stale failed requests
cannot overwrite newer Due edits. No SQL, schema, or canonical Task State
redesign was added.

## 2026-08-26 7.11.67 Distinguish persisted Due edits from refresh failures

The 7.11.66 source review found that Table's boolean acknowledgement conflated
true canonical persistence failure with post-commit reconciliation failure.
Table rollback now occurs only when the canonical Due mutation never persisted.
Committed-but-unreconciled Due changes keep their optimistic state and retain
the existing `Task was saved, but ADHDice couldn't refresh...` warning. The
existing complete-row snapshot, stale-generation, multi-target rollback, and
viewport-hold logic is preserved. No SQL, migration, Task State RPC, or schema
changes were added.

## 2026-08-25 7.11.65 Inline Food Date Chip

Meal Logging now keeps the selected Food date chip directly beside the
selected-day meal title and calorie total in a compact wrapping row. The
shared `SectionMiniTitle` default remains right-aligned for its existing
callers, and Daily Totals plus other Health section-title layouts are
unchanged. No SQL or migration was added.

## 2026-08-25 7.11.64 Compact Meal Logging Header

Meal Logging now opts into a compact `HealthPanel` header (`py-2` at mobile and
desktop) and minimal body top spacing (`pt-1`), while all other Health panels
retain the generic header padding and body defaults. Its collapse chevron gets
a small upward optical adjustment for the single-line label; the existing
full-header clickable collapse target and accessible state remain unchanged.
Daily Totals and other Health panels are unchanged. No SQL or migration was
added.

## 2026-08-25 7.11.63 Meal Plan Done SQL Fix + Food Scanner Reset

QA 3, 4, 5, and 8 passed in the 7.11.62 Food flow. The remaining Done failure
was diagnosed as a PL/pgSQL naming ambiguity: the `confirmed_at` output
variable collided with the plan table column in the unqualified update
predicate. The additive
`supabase/fix_health_meal_plan_done_ambiguity_7_11_63.sql` migration qualifies
the plan row references and preserves the row-locked, idempotent RPC behavior.
The 7.11.62 confirmation correction and this 7.11.63 ambiguity correction are
live; the current live RPC is the corrected two-argument
`adhdice_confirm_health_meal_plan_entry(uuid, date)` function.

Custom Food barcode scanning now captures a safe pre-scan draft baseline,
offers a compact Clear action, restores that baseline for both blank and
manually edited foods, and ignores stale lookup responses after Clear. Meal
Logging uses compact body spacing without changing other Health panels.
The native scanner architecture and barcode nutrition accuracy investigation
remain unchanged/deferred. Browser and device QA are not established by this
source inspection.

## 2026-08-25 7.11.62 Food Logging Speed + Meal Plan Done Correction

Combined Food QA corrections keep the native barcode scanner unchanged while
adding a shared draft Clear action, a compact Food | Measurement | Amount | Time
| Scan layout, Categories beneath Food without changing fast keyboard order,
Measurement open-on-focus behavior, and Amount Enter fast-submit for actual
food, new plans, and edited plans. Food times render as forced 12-hour AM/PM;
hydrated PostgreSQL `time` values accept and normalize both `HH:MM` and
`HH:MM:SS`.

Meal plans now use planned time as intention only. Done is available before,
at, or after the planned time and creates the actual meal with the user's local
current date and server confirmation timestamp while preserving the plan's
meal slot and immutable snapshots. The
`supabase/correct_health_meal_plan_confirmation_7_11_62.sql` correction keeps
confirmation row-locked and idempotent. That correction is live; the follow-up
7.11.63 ambiguity correction is also live, and the current live RPC is the
corrected two-argument `adhdice_confirm_health_meal_plan_entry(uuid, date)`
function.

Combined Food QA 1–3 passed. Barcode nutrition provider accuracy remains under
observation and is deferred for a separate basis/provider investigation.

## 2026-08-25 7.11.61 Meal Planning + Confirm to Actual

The 7.11.60 source-reviewed Food fast-entry workflow now supports a separate
planned-occurrence authority in `adhdice_health_meal_plan_entries`. Plan Food
reuses the shared inline MealDraft editor for Custom Foods, Favorites, Recent
options, Recipes, Saved Meals, Quick Entry, and barcode scanning. Unconfirmed
plans are excluded from actual meals, totals, Recently Eaten, food-log counts,
and consumption achievements. Future dates and planned times are supported;
actual Add Food keeps its future-timestamp protection. Confirm uses the
authenticated atomic/idempotent `adhdice_confirm_health_meal_plan_entry` RPC,
copies the current plan snapshots into one canonical HealthMealEntry, and
retains the confirmed plan audit anchor. Planned and actual nutrition totals
remain separate, including expanded nutrition coverage semantics. The
`supabase/add_health_meal_planning_7_11_61.sql` migration is live; the 7.11.62
confirmation correction and 7.11.63 ambiguity correction are also live. The
7.11.59/7.11.60 browser QA remains deferred and should be combined with later
QA; native scanner implementation is unchanged.

## 2026-08-25 7.11.60 Faster Add Food Entry

Inline Add Food no longer exposes a manual barcode input or Lookup action. Barcode acquisition remains scanner-only through the compact `ScanBarcode` icon, with the existing native and web scanner architecture unchanged. Custom Food category chips are collapsed by default, fresh meal editors clear any prior category filter, and a collapsed active filter remains visible on the Categories control. HealthAutocomplete options are not Tab stops; Arrow keys and Enter continue to select suggestions, Tab commits the highlighted food and advances through the normal Food → Measurement → Amount → Time order, and pointer selection keeps keyboard focus predictable. No SQL or migration changes were added. The 7.11.59 expanded-nutrition browser QA remains deferred and can be combined with 7.11.60 browser QA later.

## 2026-08-25 7.11.59 Expanded Nutrition Facts

Native barcode scanner real-device QA passed checks 1–6 and barcode scanning is closed for the 7.11.x cycle. The Food architecture now carries one canonical `HealthNutritionDetails` structure for fat subtypes, sodium, fiber, sugars, vitamins, minerals, caffeine, and omega fats. Unknown values remain null/blank and are never normalized to zero; a numeric zero remains a known value. Custom Food rows remain the current Food Library definition authority, while logged meals use immutable `food_snapshot` and `nutrition_snapshot` data. Recipes and Saved Meals copy and aggregate expanded nutrition, and daily totals report known-entry coverage for incomplete nutrients. Open Food Facts normalization now uses one explicit per-serving or per-100g basis across calories, macros, and expanded nutrients, and missing barcode calories remain null. The additive `supabase/add_health_expanded_nutrition_7_11_59.sql` migration adds `adhdice_health_food_library.nutrition_details` and is live. Browser QA remains deferred to the combined 7.11.60 pass.

## 2026-08-25 7.11.58 Native iOS Food Barcode Scanner

Real iOS QA proved that `BarcodeDetector` is unavailable in the installed WKWebView, so 7.11.58 adds the official `@capacitor/barcode-scanner` 3.1.1 native fallback behind the shared `HealthBarcodeScanner` boundary. Native Capacitor scanning now uses the rear camera and returns the raw barcode to the existing Add Food and Custom Food flows; the browser keeps the existing `BarcodeDetector` plus `getUserMedia` fallback and browser-only unsupported message. Open Food Facts remains the lookup authority, scanning never saves automatically, and no-match barcodes remain available for manual completion. No SQL or migration was added.

## 2026-08-25 7.11.57 iOS Barcode Camera Permission Readiness

The 7.11.56 scanner source review passed, but real iOS review found that `ios/App/App/Info.plist` did not declare `NSCameraUsageDescription`. This checkpoint adds the required native camera privacy declaration for real-device scanner QA. The scanner still uses the shared `HealthBarcodeScanner` with `BarcodeDetector` plus `getUserMedia`; no native scanner plugin has been added. Real device QA is the next gate. If `BarcodeDetector` or WKWebView support fails after camera permission is correct, diagnose a native scanner implementation in a follow-up rather than assuming the shared WebView path is sufficient.

## 2026-08-25 7.11.56 Compact Food entry and shared barcode scanning

The 7.11.55 inline meal-ledger workflow otherwise passed manual QA. Add Food now removes public USDA/text search, keeps custom-food autocomplete, Favorites, Recent Foods, Recipes/Saved Meals, and barcode lookup, and presents the useful controls in a tighter inline layout. Barcode camera behavior is implemented by the reusable shared `HealthBarcodeScanner`, using `BarcodeDetector` plus `getUserMedia` with a rear-camera preference; Open Food Facts remains the barcode lookup provider. A scanned no-match barcode stays on the meal draft for manual completion, and scanning never saves automatically. Custom Nutrition Library Foods now support typed or scanned barcodes, barcode persistence, edit preservation, and review-before-save Open Food Facts prefilling. No SQL or migration was added. Barcode scanning is now part of the 7.11.x native/iOS scope; real iOS device QA is required, and if WKWebView support is insufficient, a follow-up native scanner implementation is required. No native barcode plugin, native build, simulator, or device deployment ran for this checkpoint.

## 2026-08-25 7.11.55 Food shortcuts use the inline meal ledger

Favorites and Recent Foods now only populate a visible active inline meal editor. With no active Breakfast, Lunch, Dinner, or Snack editor, both shortcut actions are disabled with `Open a meal first`; they cannot save or mutate a hidden draft. Favorite and Recent Food selection preserves the selected history date, active meal section, current time, and normal inline Add confirmation. All new food persistence remains on `handleSaveMeal` → `addMealEntry`. No SQL or migration was added.

## 2026-08-25 7.11.54 Inline meal ledger food entry

The global Food composer has been removed. The selected-day meal ledger is now the creation authority: Breakfast, Lunch, Dinner, and Snack each expose an inline `Add Food` editor, with Date and Meal implicit from the selected ledger date and active section. Successful Add stays open, preserves date, meal slot, and time, and clears only food-specific data for rapid multi-add. Completely empty selected days still render all four sections and actions. Existing canonical Health Meal Entry persistence, editing, deletion, nutrition snapshots, and totals remain unchanged. No SQL or migration was added.

## 2026-08-25 7.11.53 Selected-day meal logging

Health Food logging now keeps the selected meal-history date aligned with the meal composer. Breakfast, Lunch, Dinner, and Snack each expose an `Add Food` action that targets the selected date and slot, reveals the existing composer, and preserves editable Date and Meal controls. Successful logging clears food-specific draft data while preserving date, meal slot, and time for multi-add; Quick Entry follows the same context rules. Completely empty selected days still render all four meal sections and their add actions. Existing canonical Health Meal Entry persistence, editing, deletion, nutrition snapshots, and totals remain unchanged. No SQL or migration was added.

## 2026-08-25 7.11.52 Fitness Runtime Stabilization

The 7.11.51 Active Workout functionality passed manual browser QA; visual redesign and polish remain deferred. This release corrects partial-Finish timer locking, preserves removed historical Workout Type values in the active runtime selector, and guards Fitness Plans and Structured Fitness reloads against stale user, active-scope, client, generation, loading, and error responses. The 7.11.46 Structured Fitness Sessions migration, 7.11.46 index-name correction, and 7.11.50 Exercise sort-order migration are live. No new migration is expected for 7.11.52.

## 2026-08-25 7.11.50 Fitness settings reorder, set flow, and history totals

The structured Set builder now grows above a bottom Add Set action. Workout Types and Exercises share the same clean settings-row treatment and pointer-based reorder implementation. Exercise Library ordering is persisted per user through `adhdice_health_exercises.sort_order`, with existing rows backfilled alphabetically and new rows appended after active exercises. Structured Workout History now shows per-exercise aggregate reps or duration while preserving individual Set values and the canonical Workout duration. The `add_health_exercise_sort_order_7_11_50.sql` migration is live. No new SQL, builds, or device deployment ran for this checkpoint; browser QA was covered by the 7.11.51 manual QA pass.

## 2026-08-25 7.11.51 Active Workout Sandbox MVP

Active Workout is a temporary versioned local runtime at `adhdice-health-active-workout:<userId>` (version 1). It restores after same-device navigation or reload and uses timestamp-derived overall and per-Set elapsed time; display intervals are not time authority. The canonical Workout is created or reused only during Finish Workout, followed by structured Workout Exercise/Set persistence and explicit Fitness Plan links. Partial saves retain the runtime and `canonicalWorkoutId` for retry, while Discard refuses to silently remove a partially canonicalized workout. Cross-device runtime sync is deferred. Active Workout functionality passed manual browser QA; visual redesign and polish remain deferred. No new SQL was added or run; no native build or device deployment ran.

## 2026-08-25 7.11.49 Exercise selection, per-workout measurement, and chip alignment

Exercise Library entries are reusable exercise identities: Settings requires only an exercise name and archive/rename behavior. The existing `default_measurement` column remains in the live-compatible schema as deprecated compatibility data; new rows receive `reps`, and the application does not present or edit that value. `adhdice_health_workout_exercises.measurement_type` is the actual measurement authority for each Workout Exercise occurrence. Every occurrence exposes both Reps and Duration, and switching modes clears incompatible set values while preserving set IDs, count, and notes. The selector retains its current active or archived exercise option alongside active alternatives, and replacement updates only the Workout Exercise ID/name snapshot without deriving measurement from the library. Shared icon-bearing `AdhdChip` controls now use compact `gap-1`, a centered shrink-resistant icon wrapper, and slightly reduced leading padding while text-only/count-only chips and `AdhdIconButton` remain unchanged. No live SQL was run; browser QA, builds, and device deployment remain unverified. The next planned feature is `7.11.50 Active Workout Sandbox MVP`.

## 2026-08-25 7.11.47 Fitness retry safety and Home capacity

Fitness Plan saves now reconcile each newly created planned item’s returned database ID into the open editor draft before later item/archive operations continue, so a partial save retry updates the successful item instead of inserting it again. Structured Fitness saves now return a reconciled draft result; newly created Workout Exercise and Set rows reconcile their returned database IDs into the editor before any later child or association failure, while the canonical workout remains in edit mode for retry. Home To-Do automatic placement now consumes only each day’s remaining capacity after explicit manual placements; pinned items stay authoritative, Later pins do not consume normal-day capacity, and overflow remains Later. The existing Health tab preference signal now gates Fitness Plan and Structured Fitness hook loading to the Fitness tab. The 7.11.46 Structured Fitness Sessions migration, its index-name correction, and the 7.11.50 Exercise sort-order migration are live; no SQL was applied or run in this source checkpoint. Focused Plan, Structured Fitness, Home, and Health regression tests passed 130/130; narrow focused-file ESLint passed, while broader changed files retain pre-existing warnings/errors outside this ticket. Browser QA, live SQL, builds, and device deployment remain unverified for that checkpoint.

## 2026-08-24 7.11.46 Structured Fitness sessions

Fitness keeps `adhdice_health_workouts` as the canonical manual/imported session ledger and adds isolated Exercise Library, Workout Exercise snapshot, and ordered Set child data. Manual workout create/edit saves the canonical row first, then diffs structured children by stable IDs, then saves optional Fitness Plan links; partial child or association failures preserve the workout and keep the editor open for retry. Library entries archive rather than delete, workout deletion cascades children in SQL and clears local structured state after canonical success, and imported workout edit restrictions remain unchanged. Focused structured Fitness tests passed 25/25, targeted new-file ESLint passed, and `git diff --check` passed; browser QA, live SQL, builds, and device deployment remain unverified. The 7.11.46 Structured Fitness Sessions migration and index-name correction are live.

## 2026-08-24 7.11.45 Fitness Plan item workflow

The Fitness Plan editor keeps its existing Add Planned Item behavior in the bottom action group beside Save Plan and Cancel, so additional planned items can be appended after editing the last item without returning to the section header. Fitness Plan persistence, associations, completion semantics, week behavior, and the authored-only 7.11.44 migration are unchanged. Browser QA, live SQL, builds, and device deployment remain unverified.

## 2026-08-24 7.11.44 Multiple Fitness Plans

Fitness now has durable multiple-plan structures (`adhdice_health_fitness_plans`, planned items, and explicit workout links) alongside the canonical `adhdice_health_workouts` ledger. Health > Fitness supports active-plan creation/edit/archive, Monday–Sunday current-week completion, first-week start-date semantics, and optional multi-select associations from the existing workout form. Workouts remain the authority for actual activity; plan loading/recovery is isolated from Health workout recovery. Focused Fitness Plan and Health regression tests are the implementation verification boundary; browser QA, live SQL, builds, and device deployment remain unverified. The migration is authored only and must be applied manually before the database-backed plan UI can persist data.

## 2026-08-19 7.10.1 QA polish

Health Food Logging now searches and applies custom Foods, Recipes, and Saved
Meals through the existing meal snapshot path; Health dropdown keyboard
navigation keeps the highlighted option visible. Activity Summary supports
Focus Type and primary Focus Subtype filters across Daily, Weekly, and Monthly
views. Task History Calendar multi-select now exposes only the canonical Not
Due override and applies selected eligible dates sequentially. No SQL or Edge
changes were required; browser and live Supabase parity remain unverified.

## 2026-08-19 7.10.2 History Calendar replacement

Task History Calendar now replaces same-date handled outcomes before applying
Not Due, clears active Not Due overrides before outcome edits, processes
multi-select Not Due sequentially, and surfaces clear/override/reconciliation
failures through the existing Task edit notification. No SQL or Edge changes
were required; browser and live Supabase parity remain unverified.

- Historical patch descriptions are intentionally excluded from this active document.

## 2026-08-19 7.10.5 permanent Task-day rewards

Canonical reward entitlements now snapshot a positive reward amount when first
earned and are unique by `(user_id, entity_id, logical_date)` regardless of
reward-program version. History replacement or clearing may set the provenance
History reference to null without removing or changing the entitlement. The
authoritative 7.10.5 migration combines the fail-closed existing-data backfill
with the updated Task State command and fulfillment RPC definitions in one
transaction. Pending entitlement backfill accepts a later successful History
label edit without changing the original outcome snapshot. SQL has not been
applied, Edge functions have not been deployed, and browser/live parity remain
unverified.

The earlier 7.10.3 and 7.10.4 artifacts were superseded before any live
application; only `patch_task_reward_entitlement_permanence_7_10_5.sql` is deployable for
this release.

## 2026-08-19 Dead tables and legacy plumbing retirement

The 7.9.50 source retires the approved dead tables, separate Subtask and
promotion runtime, completed pending-reward and Focus migration bootstraps,
the obsolete direct reward path, and the reward-claim `subtask_id` relationship.
Canonical parent/Step/Substep rows remain in `adhdice_clean_tasks`.
Canonical reward entitlement fulfillment, pending dice, reward rolls/claims,
Focus counters/events, canonical Achievement tables, and
`adhdice_task_migration_operations` remain current. The forward SQL migration is
authored only; live SQL, deployment, and browser parity remain unverified.

The reviewed backend seam order for any future activation remains:

- `supabase/add_task_state_command_rpc.sql`
- `supabase/add_canonical_reward_entitlement_bridge.sql`
- `supabase/functions/task-state-command/index.ts`
- `supabase/functions/task-state-command/auth.ts`
- `supabase/functions/task-state-command/domain.ts`
- `supabase/functions/task-state-command/orchestration.ts`
- `src/lib/task-state-canonical/command-service.ts`
- `src/lib/task-state-canonical/engine-input.ts`
- `src/lib/task-state-canonical/read-model.ts`
- `src/lib/task-state-engine/engine.ts`

Install the reviewed SQL. Deploy the exact reviewed Edge bundle. Verify RPC signatures. Verify deployed Edge version. Run controlled authenticated backend smoke test, then enable the browser canonical gate. None of those live steps is claimed here.

## 2026-08-19 Dead architecture purge

The 7.9.49 source now retires the obsolete `adhdice_task_history` and
`adhdice_task_actual_time_entries` paths, migration/backfill support tables and
functions, learned-duration code, and proven-dead blob/prize-board tables.
Canonical History remains `adhdice_task_history_facts`; active Task Timer
seconds remain on the current timer/task paths. `adhdice_task_migration_operations`
and its canonical provenance references remain intentionally intact. The purge
SQL is authored only; live SQL, deployment, and browser parity remain
unverified.

## 2026-08-18 Achievement canonical History cleanup

Task Achievement evidence now targets `adhdice_task_history_facts` exclusively.
The 7.9.48 source patch preserves the legacy `p_history_id` SQL parameter name
because PostgreSQL `CREATE OR REPLACE FUNCTION` cannot rename input parameters;
the parameter identifies `adhdice_task_history_facts.id`. It retains the 7.9.46
canonical logical-identity Tier E reconciliation
after ordered source evidence and zero-row Task/date fallback. It preserves one
completed nonrecurring lifetime Achievement occurrence across repeated
canonical terminal facts, while true Tier D ambiguity still creates the
canonical fallback and dequalifies stale siblings without deleting rows or
touching permanent awards/notifications. The patch and consolidated SQL are
authored only; one-time and resumable Task sources now exclude irrelevant
nonqualifying facts while retaining evidence-backed corrections. Live SQL,
deployment, and browser parity remain unverified.

## 2026-08-18 Milestone canonicalization

Milestones remain metadata attached to canonical top-level parent Tasks.
Complete, Trash, and Restore use the trusted `task-state-command` boundary and
an atomic backend-only orchestration that invokes the existing canonical Task
State executor before committing Milestone awards, reminders, and events.
Milestone Complete now preserves returned canonical History/reward side-effect
IDs, refreshes/reconciles canonical History, and fulfills only the returned
canonical reward entitlement. Permanent deletion uses the normal Task deletion
path, preserving nullable historical Milestone rows. The old Milestone
Task-mutating RPCs and legacy History writes were removed from production
wiring. Reverse completion remains explicitly unavailable because canonical
Task State has no reopen command; no snapshot restoration is performed. The
7.9.42 SQL patch is authored only and has not been applied or deployed.

## 2026-08-18 Task State closure

The simplified Task State model is now the product authority. All saved Task
History is canonical fact with its recorded logical date; automatic Missed and
automatic Did My Best are real History; old History without occurrence metadata
remains valid and cannot consume an arbitrary current/future occurrence. Calendar
projects saved past/today facts and future schedule only. One shared Active Status
result is consumed by every surface. Scheduled unresolved obligations may
materialize canonical automatic Missed, while Unscheduled blank dates never do.
All status-changing surfaces use one canonical command infrastructure.

Full canonical Task History for all Tasks is loaded into the shared startup
snapshot. `resolveActiveTaskStatuses` is the sole shared Active Status
authority; Calendar uses canonical/effective-timeline authority; and Task State
mutations route through the canonical command infrastructure. The rewrite is
active architecture, not pending design.

The final production facts are: 0 active `legacy_uninitialized`, 0 active
`needs_attention`, 0 active canonical Tasks missing a schedule boundary, 581
active canonical Tasks (181 `canonical_proven`, 400 `canonical_runtime`), and
0 remaining legacy-only History rows. Remaining legacy-only History and fake
`legacy_uninitialized` Tasks were intentionally deleted; no old data was
migrated or reconstructed.

The 7.9.33 History migration and 7.9.34–7.9.37 canonical initialization
artifacts are retired historical source records and must not be applied. No
replacement migration SQL was created. Frontend, Edge, SQL, browser, live
Supabase, and deployment parity remain unverified unless separately stated.

## Historical release chronology (not current authority)

### 7.9.34 Final canonical Task initialization correction

- Added dynamic preview, forward migration, and read-only verification for
  active `legacy_uninitialized` Tasks. Initialization preserves raw Task
  metadata, sets canonical lifecycle/workflow state, and creates one
  prospective schedule boundary from the current stored schedule settings.
  It creates no History, occurrences, Calendar overrides, rewards, workflow
  dates, or occurrence identity; malformed schedules fail closed and reruns
  find no candidates after successful initialization.
- Active canonical direct reads now fail closed when their schedule boundary is
  missing, so raw status/repeat/due fields cannot silently regain authority.
- 7.9.35 corrects the preview/migration parent alias and scopes strict
  initialization semantics in the verifier to 7.9.34 migration-created Tasks.
- 7.9.36 corrects the verifier's monthly weekday column alias only; it does not
  change Task State or migration behavior.
- 7.9.37 corrects the initialization migration/preview's raw monthly weekday
  alias so normalized `candidate.*` expansion has no duplicate output column;
  it does not change Task State or migration semantics.
- No 7.9.34/7.9.35/7.9.36/7.9.37 SQL was applied, no Edge Function was deployed, and no production
  data was mutated. The existing 7.9.33 literal History-copy artifacts remain
  unchanged. Browser/live validation remains pending.

### 7.9.33 Final legacy Task State authority cutover

- Added dynamic, execution-time preview/copy/verification SQL for every
  remaining legacy-only History date. The copy preserves Task/date/outcome,
  source legacy ID, and only present `occurrence_due_on` metadata; canonical
  same-date facts win, reruns are safe, legacy rows remain archival, and no
  Task, schedule, occurrence, override, reward, or automation data is created.
- Active Status, Calendar, rollover, action planning, and canonical command
  input now use one direct canonical engine-input mapper. Canonical lifecycle,
  workflow, schedule boundaries, canonical History, occurrences, and Calendar
  overrides are authoritative; raw compatibility status/repeat/due values do
  not overrule them. The legacy adapter remains only as explicit migration/test
  compatibility.
- Added focused cutover and SQL-contract regressions. No SQL was applied, no
  Edge Function was deployed, and no production Tasks/History were changed.
  Browser/live validation remains pending.

### Verified production deployment baseline

For Supabase project `mnwcuinnshsncqrhvsks`, the existing Task State backend is
installed and deployed:

- Before the 7.9.33 deployment, production migration history was verified to
  include `20260818045732 patch_task_state_auto_missed_history_copy_7_9_31`
  and `20260818045827 migrate_legacy_history_copy_7_9_31`.
- `task-state-command` Edge Function is ACTIVE at version `24` with
  `verify_jwt=true`.
- Pinned commit:
  `17f6badd751fe38261aae9cbb5828a979f32de62`.
- Deployment SHA:
  `9c07a32e504333008d08ff79abf04b2641cbfa06dec4c546454e927a9b1d9d65`.

This baseline proves the listed pre-7.9.33 production migrations and the
existing Edge deployment only. It does not prove 7.9.33 or 7.9.34 SQL/app
cutover. The 7.9.33 History copy and 7.9.34/7.9.35 Task initialization artifacts are prepared
but unapplied; production data, remaining legacy decision paths, and browser QA
remain unchanged.

### 7.9.32 Migration Delayed read-authority correction

- Canonical History projection now marks only a `migration_reconstruction`
  Delayed fact with `effective_due_on = NULL` as
  `recurrence_authoritative = false`. The copied fact remains visible on its
  historical Calendar/History date, but cannot establish current Delay state,
  move recurrence, change the due date, or act as a Delay target.
- Normal runtime/user Delayed History with a real `effective_due_on` remains
  recurrence-authoritative. Auto Missed logic and migration SQL structure were
  not changed. Focused source regressions cover historical display, unchanged
  future scheduling, and normal runtime Delay Active Status.
- No SQL was applied, no Edge Function was deployed, and production data was
  not mutated. Browser/live validation remains pending.

### 7.9.31 Final Auto Missed persistence and literal legacy History copy

- Canonical rollover candidate selection now executes a trusted
  `reconcile_rollover` command when the plan contains either a Task patch or
  planned History inserts/deletes. Daily History-only recovery therefore
  persists passed Auto Missed facts without reintroducing settled-task command
  storms; a successful retry is a semantic no-op.
- Zero-History recovery still accepts the current due/cursor, but a historical
  schedule boundary now qualifies only when `anchor_confidence = proven`.
  `high_confidence` alone cannot create historical Auto Missed facts.
- The 7.9.31 exact-ID migration is a literal copy of supported legacy
  Task/date/outcome facts. It preserves `source_legacy_history_id` and only an
  explicitly stored `occurrence_due_on`; it creates no occurrence, schedule
  boundary, effective Delay target, recurrence metadata, Task update, reward,
  automation replay, or additional History inference. Existing canonical
  Task/date facts win and the migration is fail-closed and rerunnable.
- Canonical History now permits `effective_due_on = NULL` for Delayed only when
  the row is a copied historical `migration_reconstruction` fact with migration
  actor, operation, and source-legacy identity. Normal runtime/user Delay
  remains strict and requires a later effective due date.
- Added one forward 7.9.31 SQL patch for the currently installed 7.9.20 RPC
  baseline, plus read-only preview, forward copy, and read-only verification
  artifacts. The three 7.9.30 migration artifacts are marked
  `SUPERSEDED - DO NOT APPLY`.
- Source changes are complete. No SQL was applied to Supabase, no Edge Function
  was deployed, no production migration was executed, and production
  Tasks/History/rewards remain unchanged. Next step: ChatGPT review, then
  explicit production authorization for any SQL, Edge, or migration action.

### 7.9.30 Canonical Auto Missed and legacy migration preparation (superseded)

- Source now extends the existing trusted `reconcile_rollover` command to persist idempotent authorized-automation Missed facts only for passed, provable scheduled obligations. Recovery starts after the latest saved History date, or at a proven current cursor/boundary when History is empty, and never materializes the current open logical day.
- Manual correction can reconcile only later authorized-automation Missed rows that depend on the same rolling occurrence. Independent Daily/fixed facts and manual Missed facts are preserved. Existing stale In Progress automatic Did My Best remains on the same command path, and Missed creates no reward entitlement.
- The 7.9.30 migration preview, forward migration, and verifier are superseded
  by the 7.9.31 literal-copy artifacts and must not be applied.
- This is source implementation only. The Task State SQL/RPC and Edge source changes are **not deployed**, the legacy migration is **not applied**, and production Tasks/History remain unchanged. The next step is ChatGPT review followed by explicit SQL/Edge deployment and migration approval.

### Confirmed legacy-only History finding for later migration

Read-only production audit found legacy-only explicit History dates. The product
owner confirmed these real Task names must be preserved during the later,
preview-first migration: Voids; Advanced Cosmetic and Implant Dentistry, 17th
St Allentown; Bethlehem Smile Design LLC; Gummy Vitamins; Call Jasmine Mavani
and get referall faxed; Chicken Legs; Confirm Referral was faxed; Get Pills;
Ground Turkey; Otter Lego Bootleg; Popsicles; See a Friend.

The 7.9.31 source includes an exact-ID migration that re-queries these rows at
execution time, plus preview and post-verification SQL. It has not been applied;
obvious QA/test Tasks and duplicate-title Tasks outside the confirmed IDs remain
out of scope.

### 7.9.25 Semantic no-action scope correction

- The Edge semantic no-action RPC bypass is now constrained to `reconcile_rollover` only. Other canonical commands retain their existing RPC behavior; the existing production Edge baseline is ACTIVE at v23, while browser/live QA for the simplified architecture remains pending.

### 7.9.26 Rollover History read/cache ownership correction

- Read-only production inspection verified that Vera Reports and Roth Reports still retain their complete canonical History; no History repair, backfill, migration, or other data correction was required.
- The UI regression came from internal rollover History reads sharing the user-visible task-scoped `ready` cache. Rollover now uses an isolated, ephemeral, batched canonical History read lifecycle and does not populate `taskHistoryByTaskId` or `taskHistoryLoadStateByTaskId`.
- Opening the Task History modal revalidates complete canonical Task History with a forced task-scoped read. Existing rows are retained until a successful response replaces them; failures remain in the existing error/retry state, and Retry forces a fresh canonical request.
- The 7.9.23 active-status authority remains intact: an actually hydrated task-scoped canonical History cache outranks sparse workspace History for status, counts, streaks, and Calendar. Internal rollover reads do not opt a Task into that modal-cache lifecycle.
- The 7.9.26 source change itself did not modify SQL or Edge code and did not mutate live data. The verified production baseline is the ACTIVE v23 `task-state-command` deployment and the installed 7.9.20 migration; browser QA remains pending.

### 7.9.27 Simplified Task State read/runtime convergence

- Startup now loads all paged canonical Task History for the authenticated workspace before Task State readiness. TaskApp, Calendar, streaks, filters, counts, smart lists, child previews, editor, Table, and List consume the shared snapshot; task-scoped History refreshes replace that same snapshot, and opening History cannot establish a private status authority.
- Active Status now always uses the Task State Engine projection. The legacy Active Status switch is retained only as a compatibility input surface and no longer selects a current-state result.
- Calendar reads show exact saved outcomes on their recorded dates, Not Due for unsaved past dates, live Open/Due for an unsaved current obligation, and schedule projection only for future dates. Identity-less History before the live fixed or rolling cursor cannot consume that cursor; rolling replay uses the latest relevant successful point.
- Added production-shaped regression coverage for Vera Reports, Roth Reports, FedEx child recurrence, Address Corrections, bounded/full History invariance, unresolved Missed with today Due, rolling correction, Unscheduled streaks, unrelated old History, and zero-History recovery boundaries.
- Persistence-side automatic Missed creation, legacy-only production History canonicalization, SQL/RPC and Edge deployment parity, live Supabase validation, and browser QA remain deferred. No SQL/Edge source or production data changed in this pass.

### 7.9.28 Active Status read/command convergence correction

- `evaluateTaskState` now calculates Active Status once from the resolved engine inputs. Canonical `calendarOverrides` and `workflow` presence no longer selects a competing Effective Timeline status; Effective Timeline remains the Calendar/streak projection.
- Recurring Done and Did My Best facts remain on their Calendar dates while the resolved next due date immediately drives Active Status to Upcoming or Not Due. Unresolved Missed remains higher priority than future schedule labels, including when today is an unsaved Due/Open date.
- Read authority no longer lets stale stored Done/Missed compatibility values override an engine-derived Unscheduled result. Legitimate current workflow and permanent lifecycle states remain engine-derived.
- Added ordinary-read/canonical-plan parity coverage for Done, Did My Best, omitted versus empty canonical inputs, stale Unscheduled statuses, and actual Every 3 Days correction replay. Vera, Roth, FedEx, and Address regression coverage remains passing.
- Auto Missed persistence, legacy History migration, SQL/RPC changes, Edge deployment, live Supabase validation, production data work, and browser QA remain deferred. No SQL/Edge source or production data changed in this pass.

### 7.9.29 Final narrow read-convergence cleanup

- Removed the schedule-change compatibility exception that allowed stored Done or Did My Best to override the resulting future schedule. Active Status now remains derived from the resolved schedule, while saved Done/Did My Best remains History for its handled date.
- Added command/planner regressions for recurring Done and Did My Best due-date changes, repeat changes after a handled outcome, and unresolved Missed precedence over a future schedule.
- Removed standalone Effective Timeline assertions for calculated historical Missed rows and aligned the remaining coverage with saved History, unsaved past Not Due, and current Open/Due rules.
- Auto Missed persistence, legacy History migration, SQL/RPC changes, Edge deployment, live Supabase validation, production data work, and browser QA remain deferred. No SQL/Edge source or production data changed in this pass.

### 7.9.24 Canonical rollover orchestration and no-op correction

- Production rejected invalid `reconcile_rollover` commands during the 7.9.22 source-level SQL/Edge activation attempt, including empty canonical patches and repeated canonical revision increments. The compatibility candidate planner had omitted real stale canonical In Progress workflows when `active_status_logical_date` was null or compatibility status was Missed, while compatibility output could also misclassify current-day canonical workflows. This historical note is not deployment proof.
- Canonical rollover eligibility now uses `workflow_state = in_progress` plus a stale `workflow_logical_date`; current-day canonical workflows are excluded, and compatibility-only rollover projections remain eligible only when no canonical workflow owns the Task.
- Semantic `reconcile_rollover` no-ops return success before the canonical RPC, create no operation row, and preserve `canonical_revision`. Partial sweeps reconcile successful/no-op Tasks and retain only failed candidates for retry, preventing settled Tasks from receiving new revisions on timer, visibility, or pageshow reruns.
- Automatic Did My Best remains the existing trusted 7.9.20–7.9.23 contract, including explicit stale-date History precedence, occurrence identity, recurrence/streak parity, reward-entitlement idempotence, and workflow clearing. The existing 7.9.20 SQL/RPC patch is installed and the task-state-command Edge baseline is ACTIVE at v23. Future SQL/RPC changes required for simplified canonical Auto Missed remain pending; browser QA remains pending, and no live data was mutated by this docs pass.

### 7.9.23 Canonical History active-status read correction

- The production-visible regression was a read-boundary split: a sparse active-status History input could retain an older Missed boundary without the later canonical Done/Did My Best evidence that resolved it. The Task State engine itself returns `pending` (user-facing Open) when the complete canonical chronology is supplied.
- The workspace critical read correction used a preceding scheduled occurrence as a bounded causal boundary. That is transitional implementation evidence, not the locked loading contract: converged startup must load the full canonical History snapshot and the modal must not become more authoritative.
- Added exact Log Calories mixed-history coverage, unresolved-Missed and Done/Did My Best controls, Not Due/Delayed non-success controls, canonical-over-legacy precedence, cache invalidation, status-count parity, and child/Table/List shared-map contracts. No SQL or Edge code changed in that source correction and no live data was mutated; the existing production SQL/RPC and ACTIVE v23 Edge baseline remain installed. Browser QA remains pending.

### 7.9.22 Rollover SQL migration parser correction

- The reviewed 7.9.20 rollover migration was attempted against production and failed atomically at PostgreSQL parse/compile time with `42601` (`syntax error at end of input`) while executing the generated RPC definition. At that failed attempt, the then-current migration history, RPC source/MD5, grants, Tasks, History, and reward data were verified unchanged after rollback. A later verified production migration history now contains `20260817162634 patch_task_state_command_rollover_7_9_20`.
- The defect was the trusted provenance predicates' unparenthesized `<> CASE WHEN ... END` expressions inside PL/pgSQL `IF` conditions. PostgreSQL's PL/pgSQL condition grammar parsed the CASE as an unfinished condition and reached end-of-input. The authoritative `supabase/add_task_state_command_rpc.sql` source and the forward patch now parenthesize those CASE expressions.
- Added an executable local PostgreSQL regression that installs the exact pre-7.9.20 RPC from repository history, applies the real forward migration, and verifies compilation, automatic-rollover guard replacement, authorized-automation provenance fencing, and service-role-only execution. SQL contract coverage remains required.
- At the time of the 7.9.22 correction, reapplication and deployment were still pending. The later verified baseline includes the 7.9.20 migration and ACTIVE task-state-command Edge v23; simplified Auto Missed changes and browser/live QA remain pending.

### 7.9.14 Persistent Batch Edit progress

- Batch Edit preflight remains modal-owned. After the full `taskPlans` preflight succeeds, the modal closes before sequential execution begins.
- A TaskApp-owned session notification reports real `BatchTaskPlan` progress: processed includes both successes and failures, and remaining derives from actual plan completion.
- The final result reports updated and failed counts, while low-energy fallback remains separate from failure accounting. There is no cancellation/retry behavior, no routing architecture change, and no schema change.

### 7.9.15 Batch Edit committed-row reconciliation

- Authoritative Task rows returned by a committed update are reconciled into local Task state even when the containing plan later fails its required History write. Plan accounting remains unchanged: the plan is processed and failed, but not updated. No rollback, schema, or live-data change was introduced.

### 7.9.16 Batch Edit selection cleanup

- Batch Edit now clears selection after any actually applied batch effect, including a committed Task row whose required History write later failed. Plan accounting remains unchanged.

### 7.9.21 Canonical workflow occurrence coherence correction

- Canonical engine input now resolves a non-null workflow occurrence ID against `readModel.occurrences` and uses that occurrence's `scheduled_due_on` as `task.activeOccurrenceDueOn` while the workflow is In Progress. The trusted automatic rollover command and planned History fact therefore use the same canonical occurrence identity and due date as recurrence, streak, and reward planning.
- A dangling non-null workflow occurrence reference fails closed with `WORKFLOW_OCCURRENCE_REFERENCE_INVALID` before the privileged RPC; compatibility `active_occurrence_due_on` remains only the fallback when no canonical workflow occurrence is present. SQL source remains unchanged and retains its existing occurrence agreement validation.
- At the time of the 7.9.21 source correction, SQL/RPC installation and Edge deployment validation were pending. The later verified baseline includes the 7.9.20 migration and ACTIVE task-state-command Edge v23; browser QA and live-data validation for the new architecture remain pending.

### 7.9.20 Automatic stale In Progress rollover

- Canonical rollover now derives a trusted automatic Did My Best only when an active In Progress workflow's logical date is stale and has no authoritative explicit History outcome. The existing engine record-outcome path supplies the stale logical date, actual command execution timestamp, recurrence/cursor behavior, streak resolution, and normal reward entitlement identity; late reconciliation finalizes only the one stale workflow date.
- Existing explicit History wins. No-stale rollover is a no-op at the planner boundary. Successful rollover clears workflow_state, workflow_logical_date, workflow_occurrence_id, workflow_command_id, workflow_revision, active_status_logical_date, and active_occurrence_due_on through the existing canonical/compatibility projection.
- Added the forward-only `supabase/patch_task_state_command_rollover_7_9_20.sql` contract patch. It allows only server-derived authorized-automation `did_my_best` for a stale workflow date, keeps ownership/revision/replay guards, rejects unrelated schedule/Calendar/Delay/terminal/reward payloads, and preserves canonical reward entitlement idempotence. The patch is present in verified production migration history and the task-state-command Edge baseline is ACTIVE at v23; simplified Auto Missed behavior, live data changes, and browser validation remain pending.
- Focused source/test checks are being run for engine rollover, canonical planning, Edge intent/orchestration, recurrence, rewards, replay/idempotence, and SQL contracts. Full build/lint/typecheck and any baseline failures are reported separately after the final edit.

### 7.9.17 Calendar / streak / active-status reconciliation

- Calendar projection presents unhandled dates as Due or Not Due, while active status presents an ordinary pending task as Open. Fixed recurrence non-occurrence dates remain Not Due, unresolved Missed chains outrank Upcoming/Not Due, Not Due and Delayed pause both streak types, and Delayed windows remain Not Due until the delayed due date. Automatic stale In Progress finalization is implemented in 7.9.20; the 7.9.17 behavior itself remains unchanged.

### 7.9.18 Canonical Delay effective-due correction

- Canonical Delay now carries the selected `effective_due_on` into the existing Effective Timeline replay cursor, so the command's History fact, occurrence effective override, compatibility projection, RPC payload, and committed local Task all retain the selected next due date. Delay does not create a schedule boundary or alter recurrence configuration. Source and focused tests are updated; those checks did not independently validate deployment, while the existing SQL/RPC and ACTIVE v23 Edge baseline are verified separately. Simplified-architecture browser validation remains pending.

### 7.9.19 Active Delay History Calendar reconstruction correction

- Failed browser QA found that a canonical Delay saved the live Task due date and Delayed status correctly, but reopening History Calendar reconstructed from the old recurrence anchor. The persisted canonical `effective_due_on` stopped at the History projection boundary, so the ordinary read path could not rebase the active occurrence; a pre-cursor Delayed row was then skipped.
- The read-side correction carries canonical `effective_due_on` through the existing History transport into Effective Timeline reconstruction. Only an authoritative Delayed fact whose effective target agrees with the currently active Delayed Task and current Task due cursor can seed the active cursor. Older or stale Delay facts do not rebase it, and the active Delay is retained even when its action date precedes the original scheduled occurrence.
- Changed-path Effective Timeline, recurrence, non-batch Task History, canonical History projection/read-input, and targeted lint checks passed, plus `git diff --check`. The existing Task History batch-action suite still has 14 baseline failures, the raw-Node read-authority test remains blocked by its `.tsx` loader boundary, and full typecheck retains unrelated baseline errors. Manual browser QA is still required for the live Test I flow: reopen History after Delay, confirm 8/16 Delayed, 8/18–9/5 Not Due, 9/6 Due, resumed Daily recurrence, and unchanged Active Status. Existing SQL/RPC and ACTIVE v23 Edge deployment are verified; simplified-architecture live data and browser validation remain pending.

### 7.9.11 Independent Step/Substep pinning

- Pinning is entity-local for canonical Task, Step, and Substep rows. Table and List child rows can Pin/Unpin independently through the existing Task mutation callback, and the canonical child preview exposes the Task row's `pinned_at` state.
- Pinned membership is the exact entity's non-null `pinned_at`. Directly pinned children appear in Pinned even when Include Steps is off; a pinned parent does not pull unpinned descendants into Pinned.
- Required ancestors may render as hierarchy context only. Context ancestors are not Pinned members and do not inflate the Pinned count. No schema, SQL, or Task State changes are included.

### 7.9.12 Pinned active-search parity

- Pinned active search is direct-entity only: a matching pinned parent does not expand independently pinned descendants, and Include Steps does not change that membership rule. Required ancestors remain hierarchy context only and do not enter Pinned counts or status facets. No persistence or schema changes are included.

### 7.9.13 Pinned hierarchy visibility

- Pinned membership remains the exact entity-local non-null `pinned_at`. The existing Include Steps option can reveal descendants beneath directly pinned entities for hierarchy browsing; revealed descendants are visibility/context only unless independently pinned. Pinned counts remain direct-membership only, and the 7.9.12 direct-only active-search behavior is unchanged. No persistence, SQL, schema, or live-data changes are included.

### 7.9.10 Browser-QA correction: Table hierarchy origin and status footprint

- The 7.9.8 and 7.9.9 browser-alignment attempts remained incomplete because header/parent grids began at a 10px inset while canonical, draft, and source/legacy hierarchy grids began at zero. All Table hierarchy grids now share one origin, preserving the established parent/header geometry; title hierarchy indentation remains internal to the title cell. Normal Table current-status circles use one uniform Task/Step/Substep size, and the Unscheduled Calendar glyph uses the standard status-glyph footprint. Status-state behavior, selectable statuses, and persistence are unchanged.

### 7.9.9 Browser-QA correction: Step/Substep Table alignment

- Attempted to correct the failed 7.9.8 browser-QA portion for Step/Substep Table alignment. Child horizontal alignment follows the resolved column setting while every child cell remains vertically centered; Task Title remains horizontally left aligned with its hierarchy indentation, notes, and multiline behavior intact. Browser QA still found the parent/child grid-origin and current-status footprint mismatches corrected by 7.9.10. No manual-list search behavior changed.

### 7.9.8 Manual-list search and Table alignment parity

- Add Existing Task search in an eligible manual list matches the task title or the task's own tags, case-insensitively, while preserving existing open-task, exclusion, ordering, limit, and direct-membership rules.
- Step and Substep Table cells inherit their configured column alignment through the shared child-cell alignment authority; Task Title remains left aligned regardless of its configured alignment.

### 7.9.7 Repeat filter correction

- The canonical Tasks workspace Repeat filter uses the same `getTaskRepeatCategory` classification as the visible Repeat column. A task displayed as `Weekdays` therefore matches the `Weekdays` filter and does not match `Weekly`; ordinary Weekly, Daily, Daily Until Complete, Monthly, Custom, and No Repeat categories retain their existing identities. Weekdays remains a derived UI/read-model category backed by the existing weekly recurrence configuration; no storage value, recurrence persistence, or scheduling behavior changes.

### 7.9.6 QA correction pass

- Repeat structured filtering and normal ascending/descending sorting classify the exact Monday-Friday weekly interval-1 preset as the derived `weekdays` category. Weekdays has no separate sort mode and remains a normal category between Daily/Daily Until Complete and generic Weekly; recurrence persistence and editor labels are unchanged.
- Last Handled is the latest logical date of an explicit manual Task State action. Its compact workspace summary unions canonical user History facts, active manual Calendar overrides, and committed runtime/manual command operations, while excluding calculated states, rollover, automation, migration reconstruction, repeat configuration, and metadata-only edits. Logical date orders first; legitimate same-date timestamps remain presentation metadata under cutover/provenance rules. Explicit Unscheduled carries an action-origin marker through the existing canonical command result reference so ordinary due-date clears do not count.
- Manual Not Due is neutral for the current positive completion streak and therefore does not break `Did My Best`, `Done`, or `Complete` success continuity. It remains a Missed-streak boundary. Calculated Not Due remains neutral. Browser QA, live Supabase validation, and deployment verification remain unrun.

### 7.9.5 Historical rolling-outcome replay correction

- Historical outcome replay for rolling recurrence processes every later authoritative History row in logical-date order. An older edit cannot leave the rolling cursor at an intermediate date before a later success; the existing Effective Timeline remains the sole replay authority.
- The protected regression is the confirmed Shop sequence: rolling every 2 days, authoritative 2026-08-12 and 2026-08-13 `Did My Best`, then editing 2026-08-12. The projection remains pending with `due_on = 2026-08-15`, keeps the 2026-08-13 fact, and does not synthesize Missed on 2026-08-14. Fixed weekly/monthly cursor protection and ordinary rolling replay remain unchanged. Browser QA, live Supabase validation, and deployment verification remain unrun.

### 7.9.2 Derived Unscheduled display status

- Unscheduled is a UI-only active/display status for open pending Tasks and Steps/Substeps without a current due date. It is projected from the canonical active-status read and is used consistently by status chips, counts, filters, sorting, and status actions.
- Selecting Unscheduled clears the existing schedule/date mutation path; it does not write a database status or create History. Browser QA, live Supabase validation, and deployment verification remain unrun for this release.

### 7.9.4 Manual-list context correction

- Manual-list context removal now requires the exact Task ID to have a direct manual membership in the current eligible list; inherited hierarchy visibility remains display-only for this action. Browser QA, live Supabase validation, and deployment verification remain unrun for this release.

### 7.9.3 Tasks workspace refinements

- Manual-list context removal and the initial Last Handled/Repeat presentation pass were corrected by 7.9.6; see the current release contract above.

### 7.8.18 Legacy History promotion rollback recovery

- Added an unapplied, preview-first rollback tool for one exact `legacy-history-promotion-v1` migration operation. It validates the stored source fingerprint, user, operation identity, provenance markers, expected fact count, and migration contract before a future service-role RPC can delete canonical migration facts. The operation row is retained and marked `failed_retryable` with `ROLLBACK_COMPLETED` metadata; legacy History, legacy evidence, Task State, and rewards are not mutated. Live promotion, rollback, SQL/RPC application, and browser validation remain unrun.

### 7.7.38 Canonical In Progress read projection

- The active-status read path now supplies canonical current-day `workflow_logical_date` through a presentation-only compatibility projection, so canonical In Progress tasks display as In Progress without changing the canonical Task row or persistence semantics. Stale prior-day workflow remains non-current; browser QA remains pending.

### 7.7.37 Canonical Task State runtime activation (historical source note)

- The reviewed trusted Task State boundary is deployed in production through
  `task-state-command` Edge version 23 and the installed Task State SQL/RPC,
  including migration `20260817162634 patch_task_state_command_rollover_7_9_20`.
  This establishes the existing baseline, not completion of the 2026-08-17
  architecture lock; runtime convergence remains pending.
- Browser QA, live runtime parity, and legacy-path removal remain unverified.

## Current Architectural Authorities

### 7.7.40 Canonical creation source parsing

- The trusted canonical Task creation Edge boundary accepts both explicit `task_creation` and omitted creation sources, continues to accept explicit `task_import`, and rejects unsupported source values. SQL, RPC, planner, recurrence, History, reward, Import behavior, and deployment state are unchanged.

### 7.7.39 Trusted canonical Task creation

- With the canonical runtime gate enabled, normal Add Task, editor-based Task creation, and Import now send creation intent through the authenticated `task-create-canonical` Edge boundary. The Edge path derives the verified owner, validates the draft and parent entity kind, builds the canonical TypeScript creation plan, and invokes the service-role-only `adhdice_create_canonical_task` RPC.
- The RPC atomically inserts the Task with `canonical_revision = 1`, initialized terminal/container/workflow state, and its initial schedule boundary. Creation does not write legacy History or canonical reward records. Imported outcome/lifecycle snapshots that require provenance fail closed and remain visible as import errors; pending/open metadata and parent/Step/Substep relationships are preserved.
- The `task-create-canonical` SQL and Edge implementation were source-only for
  that release; this historical note does not describe the existing deployed
  `task-state-command` v23 baseline. SQL execution, live mutations, and browser
  QA for that creation path remain separately unverified.

### M3A.5 Trusted Task State Command Boundary

- The trusted M3A Task State backend/RPC and `task-state-command` Edge path are
  installed/deployed in the verified production baseline: Edge version 23,
  function ID `a2c74ca6-8ddb-4100-8902-5e527fe552c4`, active SHA256
  `7eb64fa20f7eedc2c000bc0c4f3ee1bed3e3de406f31e609afbc54994927e8fd`.
  Runtime convergence and the simplified architecture remain pending.
- The trusted `task-state-command` Edge Function accepts authenticated intent only. Direct authenticated submission of canonical plans or privileged persistence sections is forbidden.
- The Edge Function derives owner identity from verified Supabase Auth, reads only that user's canonical Task State and logical-day profile, invokes the existing pure TypeScript planner, and sends its serialized plan through the backend-only invoker RPC using the modern secret-key admin client.
- Runtime provenance, command identity, entity/owner IDs, timestamps, migration fields, and the SHA-256 accepted-payload digest are established inside the trusted boundary. History/occurrence collection max revisions are not runtime fences; canonical Task `canonical_revision` remains authoritative and schedule `boundary_sequence` protection remains active.
- This trusted boundary is the installed existing baseline. New simplified
  Auto Missed behavior, full-History startup, legacy decision-path removal, and
  active-UI convergence remain pending.

### 7.7.36 M3B pre-activation reward correction behind the disabled gate

- Canonical reward fulfillment is now an authored, minimal RPC contract: `adhdice_fulfill_canonical_reward_entitlement(p_entitlement_id uuid)`. The server locks the owned entitlement, validates exact canonical History provenance, derives successful-occurrence streaks and the existing dice tier, builds one-task/one-claim pending-reward payloads, and records one canonical grant, pending dice item, and award operation. Browser reward payloads, streaks, dice counts, Task arrays, claim references, and token-generating Task counts are not accepted.
- The canonical reward client receives `reward_entitlement_id` from the committed canonical command and invokes only the entitlement ID. Transient fetch retry repeats that same deterministic entitlement identity; it does not read canonical History, recreate History, finalize legacy recurrence, or independently decide eligibility. Successful fulfillment retains the existing pending-reward refresh.
- `blocked` entitlements fail closed. Exact provenance requires the authenticated owner, the entitlement's exact `canonical_history_id`, matching owner/entity/entity kind/logical date/outcome snapshot, a successful `Done`/`Did My Best`/`Complete` outcome, and an authenticated-owner canonical Task. Missed has no entitlement and remains reward-ineligible.
- Reward streaks count consecutive successful logged canonical occurrences, not consecutive calendar dates. Explicit non-successful facts, including Missed, break the streak; one-time Tasks are capped at one occurrence. Existing 1/2/3/4/5/6-die tiers and the existing claim/economy pipeline are unchanged.
- Rewarded Calendar clear remains a temporary initial-activation limitation: if an explicit canonical Calendar fact is already linked to a reward entitlement, clear fails closed with a useful provenance-preservation error and never falls back to legacy History. No tombstone/void system is included here; this single correction path is not an initial activation blocker.
- The source gate value is not deployment or convergence evidence; browser QA and
  runtime parity remain pending.

#### Simplified-architecture deployment follow-up (pending)

- [x] Existing Task State SQL/RPC is installed; production migration history includes `20260817162634 patch_task_state_command_rollover_7_9_20`.
- [x] Existing `task-state-command` Edge Function is ACTIVE at version 23 with the verified deployment ID and SHA256 recorded above.
- [ ] Apply future reviewed SQL/RPC changes required for canonical automatic Missed behavior.
- [ ] Install the reviewed `supabase/add_canonical_reward_entitlement_bridge.sql` source, including removal of the old browser-authoritative overload and installation of `adhdice_fulfill_canonical_reward_entitlement(uuid)`.
- [ ] Deploy and verify any future Edge bundle changes required by the simplified architecture; do not treat v23 as proof of those changes.
- [ ] Verify RPC signatures and privileges for the future changes: authenticated can execute the minimal fulfillment RPC and the trusted command RPC remains service-role-only; anon/public cannot execute either privileged function.
- [x] Record the current deployed Edge version/source identity; future source parity must be checked against the active v23 baseline before cutover.
- [ ] Run the new authenticated smoke and browser QA required by the simplified architecture after its SQL/RPC and Edge changes are installed.

### 7.7.34 M3B runtime wiring behind the disabled gate

- `src/lib/task-state-runtime-actions.ts` is the classification boundary for the next runtime cutover. It explicitly separates metadata-only fields (`title`, `notes`, priority/energy/presentation fields, links, tags, focus/editor metadata, and pin/sort fields) from Task State-owned fields (`status`, schedule/repeat fields, active-status projections, `completed_at`, `trashed_at`, and hierarchy parent changes).
- Runtime coordinator/executor wiring covers the named Task State commands as source implementation evidence, but runtime convergence remains pending. Canonical responses are intended to reconcile the local Task from `canonical_task_patch`, `compatibility_projection`, and `next_revision`; History refreshes must preserve canonical facts and must not recreate legacy truth.
- Canonical History reads are wired through `adhdice_task_history_facts` in the source for workspace, task-scoped, streak, realtime, Records, and report-range paths. The retired legacy table is no longer a runtime read or translation path; the adapter projects explicit facts, including automatic Missed, without synthetic substitutes.
- Remaining-writer audit classification: `CANONICAL` = coordinator-routed lifecycle/outcome/schedule/History-calendar/rollover/batch paths; `METADATA_ONLY` = title, notes, priority, energy, links, tags, focus, pin, and sort persistence; `LEGACY_ONLY_NONCANONICAL_ENTITY` = intentionally unpromoted checklist rows, the inactive `/classic` demo surface, and Settings JSON restore while the gate is disabled; `MILESTONE_ATOMIC_TRUSTED_SEAM` = the trusted Milestone metadata orchestration that invokes canonical Task State for completion/trash/restore. Promoted Steps/Substeps use the same-table canonical Task coordinator, and Milestone Done/Did My Best/Missed outcomes use the canonical coordinator. Settings JSON restore is explicitly fenced while the gate is enabled so its legacy ID-based upsert cannot overwrite canonical status or schedule state.
- Activation installation item: `supabase/add_canonical_reward_entitlement_bridge.sql` is authored for review but not installed. It consumes canonical entitlement identity, derives the existing dice tier from canonical successful facts, and is idempotent by entitlement/grant identity. Delay now resolves a materialized canonical occurrence and fails closed when none exists; undated bench Delay remains unsupported by the locked command contract.
- The prior-day Calendar completion assertion is historical implementation
  evidence only. Under the architecture lock, saved automatic Missed is
  canonical History and may be recomputed only when a manual correction proves
  the dependent obligation was not due; a calculated Missed must not substitute
  for that canonical fact.
- Canonical Calendar replacement upserts the existing entity/logical-date fact while preserving its canonical identity. Clearing removes explicit facts and deactivates dependent Calendar/override references only when no reward entitlement references that fact; reward-linked clear fails closed because the locked entitlement-to-history foreign key cannot be safely orphaned or clawed back in this ticket.
- 7.7.34 activation blocker: the exact unsupported action is clearing an explicit Calendar outcome after its canonical reward entitlement exists. The smallest missing capability is a reviewed canonical void/tombstone outcome (or an equivalently reviewed entitlement-provenance retention change) that preserves the referenced fact without awarding twice; this ticket deliberately does not invent or install that capability.
- Earlier gate-state notes are superseded by the architecture lock: legacy paths
  are migration/translation evidence only and must stop deciding current state
  after convergence.

### Task State Engine

- The shared Task State Engine is the canonical active authority for pure state evaluation, active-status reads, Calendar facts, action planning, rollover planning, reward eligibility, and the allow-listed persistence projection.
- Engine-derived values remain distinct from persisted task-row values. In particular, engine-only `unscheduled` is projected to supported stored `pending`; engine-only cursor or occurrence metadata is not persisted as task-row metadata.
- Guarded revisions, explicit History identity, idempotent no-op handling, and engine/legacy mutual exclusion remain load-bearing safety boundaries.
- [`docs/TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) is the canonical contract reference; release chronology remains in the historical archive.

### Workspace, Loading, and Cache Ownership

- Phase 1E supersedes the former full canonical Task History startup authority
  for current Active Status, current streaks, and Task readiness. Normal
  startup targets canonical Task/entity rows, valid current projections, and
  profile context; full History is lazy, bounded, or explicit-repair work.
- The current full-History source path remains transitional until projection
  shadow parity, command dual-write, consumer cutover, and old-read retirement
  gates pass. Modal History is not a more authoritative state read.
- Query changes should reuse stable workspace facts and avoid invalidating canonical entities, status authority, Archive/Trash sets, or unrelated page data.
- Workspace performance diagnostics are development-only. Browser evidence for commit counts, inactive-page CPU, cross-tab/BFCache behavior, and Safari paint behavior remains unverified.
- [`docs/WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) is a qualified transitional source diagnostic, not canonical runtime proof; [`Phase 1E`](architecture/task-state-phase-1e-current-task-read-projection-contract.md) is the target current-read authority.

### Task History and Readiness

- Current-projection readiness is separate from historical History readiness. A
  failed or incomplete historical load must expose error/retry to its consumer
  and must not become an empty successful snapshot, but it does not block a
  valid current projection.
- History consumers must expose loading and retry states until the requested task's data is ready.
- Current Task consumers must use valid, revision-fenced projections and must
  not replace them with raw Task fields, partial History detail, or a second
  calculator. Realtime, logical-day, and policy changes target affected
  entities/domains rather than broad workspace reload.
- Existing task/History contradictions are not repaired by this runtime correction; they require a separate preview-first data-repair ticket after runtime QA.

### 7.7.11 Task State Engine Authority Hardening

- Confirmed failure modes: task-scoped History query failures returned `false`, while multi-task callers discarded those failures and continued with cached, partial, or empty arrays; full editor and batch saves also continued after Task State Engine `validationErrors`.
- The corrected loader contract is `TaskHistoryLoadResult`: `{ status: "ready", history, error: null }` for a complete load or `{ status: "error", history: null, error }` for a failed/incomplete load. `loadTaskHistoryForTasks` returns that result per task and never substitutes stale cache data for a failed load.
- Generic task updates, full editor saves, batch edits, TaskApp status/delay/complete actions, and engine rollover now abort occurrence-sensitive work on a failed authoritative History load before task, History, reward, recurrence, or fallback writes. The successful History snapshot is forwarded into the History writer to avoid a second unguarded reload.
- The shared occurrence-sensitive classification covers changed `status`, `due_on`, `due_time`, all repeat/cadence fields (`repeat_frequency`, `repeat_interval`, `repeat_days_of_week`, `repeat_day_of_month`, `repeat_monthly_mode`, `repeat_monthly_ordinal`, `repeat_monthly_weekday`), `completed_at`, `active_status_logical_date`, `active_occurrence_due_on`, and explicit engine/history actions (`engineManaged`, `historyStatus`, `historyEntry`, or `historyEntries`).
- Metadata-only title, notes, link, priority, tags, energy, estimate, focus, and related non-occurrence edits do not force a full task History reload. Batch preflight rejects the whole batch before any task write when an occurrence-sensitive task fails loading or authority validation.
- Verification performed for this slice: 118 focused Task State Engine, workspace-data, integration, and task-action-hook tests passed; targeted ESLint for changed production hooks/libs reported 0 errors and 2 existing workspace warnings; `git diff --check` passed; `npm run build` passed with Next.js 16.2.4/Turbopack.
- Deferred risks: browser-visible failure notifications, live Supabase/deployed RPC behavior, multi-tab/BFCache behavior, broad lint/typecheck/full-suite debt, batch History query optimization, rollover concurrency changes, stale In Progress schedule-edit behavior, and historical data repair remain separate tickets.

### 7.7.12 Live Task Status Reconciliation

- Failed 7.7.12 browser result: after moving a recurring task due today to a future date, persistence and Calendar recalculation succeeded, but the open Table status circle stayed Pending/Open until refresh.
- The prior cache-only diagnosis was incomplete: 7.7.12 reconciled the task-scoped History cache, but the visible Table row projection did not consume the resulting active-status authority map.
- Affected paths: generic due-date/task updates, full editor schedule saves, batch schedule edits, Task History calendar updates, and shared direct status actions that reconcile through the same History writer.
- Reconciliation mechanism: successful schedule mutations now pass their authoritative loaded Task History snapshot through the shared local mutation callback; successful History inserts, replacements, and removals pass their complete post-mutation snapshot through the same callback. The callback updates an already-open task cache and its one-task streak summary, while the Task State Engine still derives visible status from the updated Task plus History inputs.
- Focused verification: 108 focused hook, Task History, Task State Engine, rollover, streak-summary, and workspace-data tests passed, including immediate future Not Due, restored-today Pending, History replacement, Test D fail-closed behavior, and no-cache-mutation failure paths.
- Deferred risks: browser QA, live Supabase/deployed RPC parity, multi-tab/BFCache behavior, stale In Progress schedule handling, batch History-query optimization, rollover concurrency optimization, historical repair, and full lint/typecheck/full-suite debt remain separate.

### 7.7.13 Live Active Status Row Projection Correction

- Confirmed runtime diagnosis: the due-date-only schedule mutation carried the raw persisted `missed` state into `change_schedule`; the active-status evaluator then let ambiguous older Missed History override the later `Done` outcome and non-overdue future schedule. The renderer, row cache, and display-status map correctly displayed that upstream result.
- Correction: due-date-only intent remains limited to changed schedule fields, while `change_schedule` derives the post-edit active status from the updated schedule, logical date, authoritative History, active occurrence fields, overdue authority, current-day outcome, and recurrence authority. Ambiguous or non-matching older Missed rows no longer force active `missed`; a concrete active Missed occurrence or genuine overdue authority is required.
- Older Missed History and the later Done History remain intact. No History rows are inserted, deleted, or rewritten for the confirmed future-date case, and explicit Missed status actions retain their status and History behavior. Temporary status tracing was removed completely.
- Focused verification: `test/task-state-engine.test.ts` and `test/task-state-engine-integration.test.ts` passed 76/76; `test/task-live-status-render-integration.test.ts` passed 1/1. Narrow semantic ESLint passed cleanly. Broader targeted lint remains baseline-red with 51 existing errors and 76 warnings in protected TaskApp/Table/List surfaces. `git diff --check` passed, and elevated `npm run build` passed with Next.js 16.2.4/Turbopack.
- Browser QA remains Andrew's next step: move Test D with the 8/3 and 8/4 Missed plus 8/5 Done History to a future date, confirm the circle immediately becomes the existing future/Not Due state, then refresh and confirm it remains unchanged.

### Task Hierarchy and Orchestration

- Same-table Steps/Substeps already have shared hierarchy derivation, previews, editor routing, and same-parent reorder/drag behavior.
- Remaining deferred hierarchy work is narrower: cross-parent movement, promote/demote, broader legacy-subtask migration, custom child metadata/reward rules, and any recurrence semantics that still require product approval.
- [`docs/TASKAPP_ARCHITECTURE.md`](TASKAPP_ARCHITECTURE.md) and [`docs/TASKAPP_SOURCE_MAP.md`](TASKAPP_SOURCE_MAP.md) describe current TaskApp ownership and source boundaries; [`docs/task-hierarchy-plan.md`](task-hierarchy-plan.md) is the active hierarchy decisions document.

### Persistence Boundaries

- Mutations must use the shared guarded task and History paths, preserve optimistic-concurrency checks, and avoid zero-effective writes.
- The existing Task State deployment baseline is verified separately: ACTIVE `task-state-command` Edge v23 and migration `20260817162634 patch_task_state_command_rollover_7_9_20`. Future simplified-architecture SQL/RPC changes still require separate installation and verification.
- Optional Google integration configuration exists in source, but public Pages variables, Edge deployment, and user-facing activation remain unverified.
- Existing release history records the exact repair scopes, SQL filenames, row counts, and verification limitations in the [historical archive](archive/2026-08-retired/current-state-release-history.md).

## Confirmed Open Issues and Unverified Risks

- The black/glitched HUD/UI state during reload or boot remains an open source-documented issue; it is not documented as fixed.
- Browser behavior remains unverified for the startup/rendering, Safari paint, performance, cross-tab, and BFCache claims recorded in the 7.6.x history.
- The refreshed engine authority and workspace diagnostic still require review when their covered seams change; runtime evidence gaps remain unresolved.

## Fragile and High-Risk Seams

- Root workspace ownership and startup sequencing around `TaskApp` and `useWorkspaceData`.
- Task History readiness, recurrence rollover, and explicit occurrence identity.
- Shared task mutation, reward, revision/conflict, and persistence-projection paths.
- Shared Table/List hierarchy rendering, editor routing, row-model caching, and render boundaries.
- The boundary between the verified existing SQL/RPC and future simplified-architecture deployment, including any path that could reconcile stale state.
- Browser/Safari paint behavior around scaled shells, sticky/nested scrollers, and translucent layers remains an evidence problem, not a claimed fix.

## Active Warnings and Constraints

- Treat the Task State Engine switch and its connected read/action/Calendar/rollover consumers as one compatibility boundary.
- Do not persist engine-only status, cursor, or occurrence metadata, and do not replace canonical rows with partial payloads.
- Do not use historical release notes as current authority; use the linked canonical contracts and verify freshness caveats.
- Browser QA, simplified-architecture live Supabase behavior, future RPC state, multi-tab behavior, BFCache behavior, and Safari rendering require separate authorized verification; the existing Edge v23/migration baseline is recorded above.

## Immediate Priorities

1. Keep the black/glitched reload seam isolated for a dedicated diagnosis before changing adjacent UI or performance paths.
2. Obtain the missing browser/runtime evidence for startup, search responsiveness, History readiness, cross-tab/BFCache behavior, and Safari paint before claiming those risks resolved.
3. Keep future recurrence, hierarchy, persistence, and migration tickets bounded by their documented authority and approval requirements.
4. Treat snapshot/restore and broader legacy-subtask migration as deferred work; no implementation scope is inferred here.

## Related Canonical Documents

- [`docs/INDEX.md`](INDEX.md) — documentation roles and source-of-truth map.
- [`docs/AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) — work modes, scope control, and handoff rules.
- [`docs/VERIFICATION.md`](VERIFICATION.md) — production-path verification and reporting requirements.
- [`docs/TASKAPP_ARCHITECTURE.md`](TASKAPP_ARCHITECTURE.md) — current TaskApp production routing and ownership contract.
- [`docs/TASKAPP_SOURCE_MAP.md`](TASKAPP_SOURCE_MAP.md) — current TaskApp source and symbol lookup.
- [`docs/TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) — canonical engine authority and persistence boundary.
- [`docs/WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) — qualified source diagnostic for loading and readiness ownership.
- [`docs/task-hierarchy-plan.md`](task-hierarchy-plan.md) — current hierarchy decisions and unresolved movement/migration boundaries.
- [`docs/daily-until-complete-plan.md`](daily-until-complete-plan.md) — current Daily Until Complete rules, limitations, and unresolved decisions.
- [Historical 7.6.x and earlier release notes](archive/2026-08-retired/current-state-release-history.md).

## Historical Release Notes

- Historical release chronology is preserved in [`docs/archive/2026-08-retired/current-state-release-history.md`](archive/2026-08-retired/current-state-release-history.md).
- The archive is reference-only and is not part of routine current-state context.
- This file is the operating summary; the archive is the detailed chronology.
- Keep new operational facts here only when they are confirmed by current documentation.
