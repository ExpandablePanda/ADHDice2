# Current State

Last reviewed: 2026-08-19
Role: active working

## Current Release

- Current working app version: `7.10.3`.
- Current release group: `7.10.x` QA polish corrections for Health, Focus, and History Calendar.
- Version surfaces that should stay aligned for code-changing implementation work:
  - `package.json`
  - `package-lock.json`
- `public/app-version.json`
  - visible `APP_VERSION` / `HUD_VERSION` constants in `src/components/task-app.tsx`
- This document summarizes current authority and known limits; it does not establish browser parity or gate activation.

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

## 2026-08-19 7.10.3 permanent Task-day rewards

Canonical reward entitlements now snapshot a positive reward amount when first
earned and are unique by `(user_id, entity_id, logical_date)` regardless of
reward-program version. History replacement or clearing may set the provenance
History reference to null without removing or changing the entitlement. The
reviewed forward migration backfills existing fulfilled grants and pending
entitlements fail closed if a valid snapshot cannot be derived. SQL has not
been applied, Edge functions have not been deployed, and browser/live parity
remain unverified.

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

- Full canonical Task History for all Tasks is required at workspace startup. The
  former bounded critical-vs-modal-full distinction is transitional and must be
  collapsed; modal History is not a more authoritative state read.
- Query changes should reuse stable workspace facts and avoid invalidating canonical entities, status authority, Archive/Trash sets, or unrelated page data.
- Workspace performance diagnostics are development-only. Browser evidence for commit counts, inactive-page CPU, cross-tab/BFCache behavior, and Safari paint behavior remains unverified.
- [`docs/WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) is a qualified source diagnostic, not canonical runtime proof; its browser, deployment, and performance questions remain unresolved.

### Task History and Readiness

- Startup readiness includes the full canonical Task History snapshot. A failed
  or incomplete History load must expose error/retry and must not become an empty
  successful snapshot or a legacy fallback.
- History consumers must expose loading and retry states until the requested task's data is ready.
- History readiness must not widen unrelated startup work or replace canonical current-state facts with partial detail payloads.
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
