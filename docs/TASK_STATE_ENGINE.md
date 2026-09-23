# Task State Engine

Last reviewed: 2026-09-23
Role: canonical behavioral contract

## Purpose and architecture lock

The Task State Engine is the one domain authority for current Active Status,
recurrence, Calendar projection, streak derivation, action planning, and the
persistable Task State projection. This document records the locked simplified
model. It supersedes transitional rules that treated bounded History, calculated
Missed rows, modal History, or legacy compatibility status as a separate source
of truth.

Phase 1E adds the read-transport boundary: ordinary current Task surfaces
consume a valid, rebuildable current projection derived from this engine rather
than requiring a workspace-wide canonical History snapshot. The projection is
not a second authority. Canonical facts and this evaluator remain the evidence
and rebuild source; History remains available for historical reads and explicit
entity-scoped repair/rebuild.

The source architecture is implemented through the existing canonical seams.
This source contract does not claim frontend, Edge, SQL, browser, or live
Supabase deployment parity. The verified pre-7.9.33 production baseline includes migrations
`20260818045732 patch_task_state_auto_missed_history_copy_7_9_31` and
`20260818045827 migrate_legacy_history_copy_7_9_31`; `task-state-command` Edge
is ACTIVE at version 24 with `verify_jwt=true`, pinned commit
`17f6badd751fe38261aae9cbb5828a979f32de62`, and deployment SHA
`9c07a32e504333008d08ff79abf04b2641cbfa06dec4c546454e927a9b1d9d65`. This
document is not proof of frontend, Edge, SQL, browser behavior, or live
production parity.

## History authority

- Every saved Task History row is canonical fact. Its logical date belongs to the
  row and Calendar displays the recorded outcome on exactly that date.
- Manual History changes only through another manual action. Automatic Missed
  and automatic Did My Best are also real canonical History and count normally.
- Editing one History date does not rewrite unrelated saved dates.
- An automatic row may be removed or recalculated only when a manual correction
  proves that its underlying occurrence was not actually due. Independent daily
  obligations are not removed by correcting another date.
- History without modern occurrence metadata remains valid for its recorded
  date, Calendar, statistics, and streaks. It must not consume an arbitrary
  current or future recurrence occurrence.
- Rolling recurrence may use the latest relevant successful History row to
  establish the next occurrence even when that row is old. For example, Done on
  6/8 with Every 3 Months and no later relevant success makes 9/8 the next due
  date.

History is fact. Calculated schedule state is not a substitute History row.
Recovery may materialize a legitimately missing automatic outcome, but must not
reconstruct ancient History from recurrence guesses.

## Schedule and Calendar authority

The live Task due date/cursor is the authoritative start of future scheduling.
Recurrence calculates future obligations from that cursor and the current
schedule metadata; it does not rewrite saved History.

Calendar is a date projection, not a second state system:

- Past: saved History displays its recorded outcome. Without saved History the
  date is Not Due, except recovery may first materialize legitimate missing
  automatic outcomes after the last recorded History point.
- Today: saved History wins. Otherwise a live obligation is Open/Due; with no
  live obligation the date is Not Due.
- Future: Calendar is schedule projection only. A projected future Due date is
  not History and is not an additional active obligation.

Changing the live cursor changes future scheduling from that cursor. If a
Weekdays task is moved from Monday 8/17 to Tuesday 8/18, 8/15, 8/16, and 8/17
are Not Due, 8/18 is Due, and handling 8/18 resumes normal Weekdays recurrence.

Calendar edits use the same canonical command infrastructure as every other
Task State mutation. A History correction upserts or changes only the selected
logical-date fact, retaining known occurrence metadata; it does not silently
rewrite unrelated dates or create a parallel Calendar authority.

## One Active Status authority

There is one Active Status result consumed everywhere: Table, List, Home,
editor, Steps/Substeps, filters, counts, smart lists, and child previews.
After the Phase 1E consumer cutover, those surfaces consume the valid current
projection of that result. The projection is written from the canonical engine
result and fenced by Task, History, schedule, behavior-policy, logical-day, and
projection-version inputs. Surfaces do not recalculate current status from a
Task row, a selected Calendar cell, or a private History subset.

History date state and Active Status are different projections. An earlier
unresolved Missed can keep Active Status Missed while today’s Calendar cell is
Open/Due. After a successful recurring outcome, Active Status immediately uses
the next due date and becomes Upcoming or Not Due; the saved History date remains
Done or Did My Best. Complete is permanent lifecycle completion.

Unscheduled means no due date and no repeat frequency. It remains active until
permanently Complete or schedule metadata is added. Done/Did My Best records a
success for that date but does not permanently finish it. Unscheduled tasks do
not accumulate Missed because they were not done; a blank date is not a missed
obligation.

## Missed, recovery, and recurrence

A scheduled obligation left unresolved may become automatic Missed canonical
History. Automatic behavior follows obligation identity:

- Daily obligations are independent. Correcting 8/14 Auto Missed to Done does
  not remove valid Auto Missed rows on 8/15 or later.
- Rolling overdue continuation may create dependent automatic rows. For Every 3
  Days, an 8/16 Auto Missed can make 8/17 dependent; correcting 8/16 to Done
  moves the next due date to 8/19, so the dependent 8/17 automatic row may be
  removed or recomputed to Not Due.
- A manually entered 8/17 Missed is a manual fact and remains until manually
  changed.

Recovery may fill scheduled unresolved obligations missed during app/server
unavailability, but never goes farther backward than the last recorded History
instance for that Task. It must not infer ancient rows from a recurrence guess.

The recurrence authority owns logical-date arithmetic, fixed and rolling
membership, occurrence/cursor continuation, and next-due calculation. It must
preserve later saved successes when replaying an older correction. It must also
allow an old successful row without occurrence metadata to establish the next
rolling occurrence without assigning that row a new occurrence.

## Streak authority

Streaks derive from canonical History plus the schedule facts needed to decide
whether a Missed represents a real obligation:

- Done and Did My Best are positive successes.
- Missed contributes to missed streak only when it represents a real obligation.
- Not Due and an Unscheduled blank do not create missed streak.
- Optional/Unscheduled blank dates can break positive streak continuity without
  becoming Missed.

Thus 8/14 Done, blank 8/15, blank 8/16, and 8/17 Done yields current positive
streak 1 and missed streak 0. History statistics must not turn a calculated
gap into a saved outcome.

## Mutation and trusted persistence boundary

Status changes from Table, List, Home, Calendar, editor, and batch actions use
the same canonical command infrastructure. A successful semantic command
atomically invalidates any existing affected current projection, then commits
Task State, canonical History, recurrence/cursor, Calendar, streaks, and
rewards. A trusted post-commit TypeScript rebuild materializes the projection
through a revision-fenced service-role writer; projection availability never
blocks canonical commit. A projection repair may write only the rebuildable
projection and its validity metadata; it cannot create canonical History or
reward evidence.

The browser supplies intent only. Trusted server/Edge code derives privileged
outcome date, occurrence, provenance, timestamps, replay identity, and reward
facts. SQL/RPC enforces ownership, revision, replay, provenance, and
transactional persistence; it is not a second recurrence authority.

## Legacy and compatibility rule

Legacy rows and compatibility projections may remain as migration or translation
evidence. They must not independently decide current Active Status, recurrence,
Calendar truth, or current streaks after convergence. Existing explicit old
History is preserved, not reconstructed or arbitrarily assigned to a modern
occurrence.

## Implemented production seams

The Task State rewrite is the active architecture, not a pending design:

- `src/lib/task-state-engine/engine.ts`, `recurrence.ts`,
  `effective-timeline.ts`, `calendar-authority.ts`, `action-authority.ts`,
  and `rollover-authority.ts` remain the pure planning/projection seams.
- `src/lib/task-state-canonical/command-service.ts`, `engine-input.ts`,
  `history-projection.ts`, occurrence/schedule projection, and the trusted
  `supabase/functions/task-state-command/*` orchestration remain the canonical
  command boundary.
- `src/lib/task-history.ts` retains date identity, explicit-row normalization,
  Calendar row formatting, and canonical streak helpers under this contract.
- Existing canonical History facts, occurrences, schedule boundaries,
  provenance, command-operation, revision, and reward-entitlement structures are
  sufficient for this lock. No new Task table or architecture layer is implied.

`resolveActiveTaskStatuses` is the shared Active Status authority. Production
readers require canonical lifecycle/state and a canonical schedule boundary;
raw Task status, due, and recurrence fields are available only through the
explicit compatibility-only translation path used by tests and migration
boundaries.

### Paths that do not make decisions

- Direct List/row/child calls, stored-status fallbacks, and surface-local
  status/count/filter calculations consume `resolveActiveTaskStatuses` and its
  shared projection.
- `src/lib/task-state-engine/legacy-adapter.ts` and legacy History reads may
  translate data at the boundary, but may not select current status, recurrence,
  Calendar truth, or migration rows.
- The old direct rollover path in
  `supabase/patch_secure_task_rollover_rpc.sql` must not routinely synthesize or
  overwrite legacy History. The canonical trusted rollover command must own
  automatic Did My Best/Missed materialization and dependent-row correction.

### Loading and cache ownership

- Phase 1E target: `useWorkspaceData` loads canonical Task rows, valid current
  projections, profile context, and independently required domain data during
  normal startup. It does not require a full canonical History snapshot for
  current Active Status, current streaks, or Task readiness.
- The current full-History startup path is transitional until the Phase 1E
  migration gates pass. It must not gain new current-surface dependencies.
- The task-scoped modal cache, full-workspace History cache, and
  `task-history-sync-v1` IndexedDB/delta transport serve historical readers and
  explicit repair/rebuild. They are not current-projection validity proof by
  themselves.
- Task/History/policy/time events invalidate the affected entity or domain.
  Realtime and logical-day changes do not target a broad workspace reload.
- A missing or stale projection fails closed to an entity-scoped diagnostic or
  rebuild path. Raw `Task.status`, `due_on`, or a bounded History subset is not
  a fallback authority.

### Focused contract coverage

- Focused coverage protects canonical automatic Missed, independent daily
  obligations, rolling dependent-row recomputation, recovery’s last-History
  boundary, old rows without occurrence metadata, old rolling success anchoring,
  Unscheduled blanks, and the Monday-to-Tuesday cursor example.
- Projection parity tests prove every Task surface consumes one Active Status
  map and every mutation route uses the same command result.
- SQL/Edge contract tests for trusted automatic History provenance,
  occurrence ownership, replay/idempotence, and rejection of the old direct
  rollover behavior. These remain source/contract checks until deployment is
  separately verified. The 7.9.33 History-copy and 7.9.34–7.9.37
  initialization artifacts are retained as `RETIRED / HISTORICAL ONLY / DO NOT
  APPLY` source records; no replacement migration SQL was created.

### Schema conclusion

Existing canonical History, occurrence, schedule-boundary, provenance, replay,
and entitlement fields express the evidence and trust boundaries needed to
rebuild current state. Phase 1E now explicitly requires a durable,
owner-scoped current-projection record or equivalent projection namespace for
ordinary current reads, plus an entity-scoped History freshness proof. Its
physical schema, indexes, RLS, and migration are a later implementation ticket;
this document does not authorize SQL or runtime changes. If implementation
finds that the existing canonical facts cannot prove a projection field without
reopening a locked Task semantic, stop and report that contradiction.

## Related documents

- [`WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) —
  transitional source loading seams and post-cutover current-read loading.
- [`TASKAPP_ARCHITECTURE.md`](TASKAPP_ARCHITECTURE.md) — shared Active Status
  read authority and UI projection routing.
- [`architecture/task-state-phase-1e-current-task-read-projection-contract.md`](architecture/task-state-phase-1e-current-task-read-projection-contract.md)
  — current Task projection, freshness, invalidation, repair, and migration
  authority.
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — architecture-lock status, pending
  convergence work, migration finding, and verification boundaries.
- [`VERIFICATION.md`](VERIFICATION.md) — evidence and runtime-validation rules.
