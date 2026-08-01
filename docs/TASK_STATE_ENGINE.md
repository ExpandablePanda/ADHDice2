# Task State Engine

Version 7.6.19 protects valid future fixed-recurrence cursors from stale-status replay and provides an exact guarded correction for the 26 re-advanced live rows. History and stored status remain untouched.

## 7.6.19 Future fixed-cursor protection

The 7.6.13 legacy guard treated a matching stored `upcoming`/`not_due` status as evidence that an unkeyed success had already advanced the persisted future cursor. After the 7.6.18 reset, 26 corrected dates changed their derived display band without a status write. The equality check failed, older unkeyed successful History replayed, and each cursor advanced by one recurrence transition. Two interval-monthly rows remained at their correct future dates because their derived status stayed `not_due`.

For fixed weekly and monthly tasks, a persisted `due_on` strictly after the logical date is now protected when that date is valid under the configured schedule and the unkeyed successful History action date is older than the cursor. This evidence is recurrence and temporal state only; display-status equality is not consulted and status is not persisted to make the guard pass. A newly recorded action is not mistaken for legacy replay. Explicit successful occurrence identity retains priority and can consume the identified persisted future occurrence exactly once, including a later occurrence completed early. Equal-date and overdue reconciliation still use the existing engine path, and rolling recurrence never enters the fixed-cursor guard.

[patch_task_state_forward_reset_7_6_19.sql](../supabase/patch_task_state_forward_reset_7_6_19.sql) contains the exact 26 IDs, current re-advanced dates, latest live revisions, corrected forward boundaries, and recurrence snapshots from the post-rollover output. Its snapshot requires active lifecycle, exact date/revision, unchanged recurrence, a valid corrected forward boundary, and exactly one configured transition between corrected and current dates. The separate update assigns only `due_on`, `revision`, and `updated_at`; verification confirms all corrected rows. The two unchanged interval-monthly tasks are absent. The standalone [preview_task_state_forward_reset_7_6_19.sql](../supabase/preview_task_state_forward_reset_7_6_19.sql) contains no persistent mutation and ends with `ROLLBACK`.

After the runtime fix and correction, repeated rollover produces no unintended task patch. The correction preview reports 26 unchanged and zero eligible, and rerunning the update changes zero rows. History, rewards, streaks, status, recurrence configuration, Complete, Archive, and Trash are never modified.

## 7.6.18 Forward-only recurrence reset

[patch_task_state_forward_reset_7_6_18.sql](../supabase/patch_task_state_forward_reset_7_6_18.sql) calculates the current logical date from each task owner's stored timezone and logical-day rollover, with the existing America/New_York and 06:00 defaults. From that boundary it finds the first valid fixed occurrence for weekly single-day, weekly multiple-day, weekly empty-weekday anchored, monthly day-of-month, monthly interval, and monthly ordinal-weekday recurrence. Each affected ID carries its exact corrupted `due_on` from the successful 28-row live preview—seven at `2026-10-01` and 21 in 2027. That date is used only as a fail-closed equality guard and, when explicit fields omit an anchor, for stable weekday, day-of-month, or interval phase; its year is never selected as the desired future schedule.

Only explicit successful History occurrence identity can move the boundary forward. A Done, Did My Best, or Complete row marked as a due occurrence and carrying a valid `occurrence_due_on` may consume the candidate, including early completion of a future occurrence. Historical Missed gaps, delayed outcomes, and unkeyed History are ignored once they do not affect the current or future boundary.

The script creates one transaction-local snapshot for the read-only preview. Its separate update can touch only snapshot rows classified eligible and rechecks the exact affected ID, ID uniqueness, active recurring lifecycle, corrupted date, complete recurrence configuration, revision, timestamp, proposed occurrence validity, and forward boundary. Optimistic-concurrency drift skips the row. The only assignments are `due_on`, `revision`, and `updated_at`; the post-update statement verifies the resulting date and revision. After success, a rerun reports the rows as unchanged and updates zero rows.

This repair is forward-only. It does not insert, update, delete, infer, reconstruct, or otherwise repair old History. It does not write Calendar outcomes, rewards, streaks, status, recurrence configuration, completion state, Archive, Trash, or unrelated fields, and it calls no rollover or reward RPC.

## 7.6.17 High-confidence date repair dry run

[diagnostic_task_state_date_repair_7_6_17.sql](../supabase/diagnostic_task_state_date_repair_7_6_17.sql) carries the exact 11 task IDs, expected corrupted dates, proposed repaired dates, and report recurrence contract into a CTE-only diagnostic. Each result includes current Task identity, ownership, status, date, weekly/monthly configuration, revision, timestamp, existence, exact-date, recurrence, proposed-occurrence, lifecycle, uniqueness, and repair-safety evidence. Windowed summary counts cover expected, found, missing, exact-date, recurrence, safe, and unsafe rows.

Safety fails closed. A row is a candidate only when its exact ID exists, its current `due_on` is the reported corrupted value, its current weekly interval and configured weekday exactly match the report, the proposed date remains a valid current occurrence, it remains an active recurring task, and the expected ID occurs once. Mismatches produce no inferred replacement. The SQL performs no repair, Task or History write, mutation/rollover/reward RPC, or persistent/temporary object creation.

The report's proposal wording also distinguishes a replay seed from the excluded consumed-occurrence boundary when no History rows remain to replay. This is a description correction only; proposal inference is unchanged.

## 7.6.16 Repair replay boundary

For fixed weekly and monthly recurrence, the report validates all occurrence evidence first, identifies the latest legitimately consumed occurrence, and seeds replay at the first unresolved scheduled occurrence strictly after it. Done and Did My Best rows whose occurrence identities are at or before that boundary are not replayed. This avoids the 7.6.15 mixed state in which the report precomputed consumed occurrences, seeded from that consumed evidence, and then supplied the same successful History to a full engine replay.

Replay boundaries use occurrence identity, not the History action date, so an action on `2026-07-27` that explicitly consumes `2026-08-03` seeds at `2026-08-10`. Later occurrence-relevant Missed and Delayed evidence retains engine behavior, Complete terminates recurrence, and `derived-missed:YYYY-MM-DD` is recognized as generated Missed evidence rather than a successful consumed occurrence.

Each task result exposes bounded, JSON-serializable `replaySeedOccurrence`, `firstReplayedHistoryRow`, and `lastReplayedHistoryRow` evidence alongside the inferred consumed occurrence and proposed next unresolved occurrence. The report remains development-only and cannot query or update Supabase, mutate Task or History data, generate repair SQL, call rollover RPCs, award rewards, change lifecycle state, or accept proposals.

## 7.6.15 Corrected repair inference

The fixed 28-task scope uses the original `723be9b2-64c0-43a9-b49a-5b7f648f57ea` identifier and is locked by an exact, unique set test. Explicit evidence accepts the existing compact `occurrence:YYYY-MM-DD` key and the Task State Engine task-scoped occurrence identity. A key and `occurrence_due_on` must agree, the resulting occurrence must match the shared weekly or monthly recurrence helpers, and duplicate action-date records may not claim incompatible identities. Entry date remains the action date and may legitimately precede or follow the occurrence date.

Validated History is replayed through `evaluateTaskState` from the earliest legitimate fixed occurrence rather than deriving a proposal from only the latest success. Done and Did My Best consume their identified occurrences; Missed and replayable Delayed History preserve the current unresolved occurrence; Complete terminates recurrence. Sequential weekly/monthly occurrences are therefore ordinary evidence, and the returned date is the engine's next currently unresolved occurrence. Missing identity needed to distinguish early/late completion, malformed identity, off-schedule identity, or genuine contradiction returns no proposal.

The JSON report adds bounded latest-validated-explicit-occurrence, latest occurrence-relevant outcome, proposal-basis, and rejected-evidence fields. The two development globals are unchanged. No task or History update, Supabase call, rollover RPC, reward, lifecycle mutation, repair SQL, or automatic proposal acceptance is possible from this report.

## 7.6.14 Recurring-date repair report

The pure report builder receives already-loaded Task and History arrays plus logical-day context and returns a stable JSON-serializable structure in the ticket's fixed affected-ID order. Each task record includes title, recurrence type/configuration, current persisted `due_on`, latest successful History date, a bounded recent History sequence, inferred last legitimate consumed occurrence, proposed next due date, confidence, reasoning, and explicit ambiguity or missing evidence. Summary counts cover all affected IDs, found/missing tasks, High/Medium/Low proposals, and tasks with no safe proposal.

Inference is conservative and ordered: explicit History `occurrence_key`/`occurrence_due_on`; successful on-schedule History plus fixed recurrence configuration; persisted `active_occurrence_due_on`; a schedule-valid current future `due_on`; then recent History only when it maps unambiguously to the recurrence. Conflicting identity, off-schedule unkeyed success, invalid recurrence evidence, or an unresolved past date yields no proposal. A proposed next date is always later than the inferred legitimate consumed occurrence. `nextFixedOccurrence`, `scheduledOccurrences`, and `recurrenceAfterSuccess` remain the recurrence authorities; the report does not reproduce their calendar calculations.

Development hydration installs both surfaces:

```js
window.__ADHDICE_RECURRING_DATE_REPAIR_REPORT__
window.__ADHDICE_BUILD_RECURRING_DATE_REPAIR_REPORT__()
```

The first holds the latest report. The function rebuilds and replaces it from the latest loaded snapshot. Neither surface queries Supabase, mutates Tasks, writes History, awards rewards, changes lifecycle state, calls either rollover RPC, emits repair SQL, or accepts a proposal. They are absent in production builds.

## 7.6.13 Fixed-schedule rollover replay

The remaining live diagnostic contained 28 `dueOn`-only patches. Their stored dates were already the next fixed weekly or monthly occurrence, while projection advanced each by another configured interval. The affected legacy History rows had no usable occurrence identity. The engine treats an identified occurrence strictly before persisted `dueOn` as consumed. The original unkeyed-row matching-status evidence was replaced in 7.6.19 with schedule-valid future-cursor evidence because stored display status may be stale. Equal-date and overdue edits remain eligible, preserving same-day reconciliation without a logical-date ledger shortcut.

The persistence projection compares PostgreSQL-equivalent canonical values across all supported fields, including microsecond timestamp precision, date-only values, nullable clears, omitted fields, and derived `unscheduled` versus stored `pending`. Development rollover diagnostics retain at most 50 summaries containing only task ID, emitted keys, and canonical stored/projected values.

[patch_task_state_engine_rollover_7_6_13.sql](../supabase/patch_task_state_engine_rollover_7_6_13.sql) normalizes trimmed plan values once into typed status/date/timestamp targets, then uses those same targets for assignment and `IS DISTINCT FROM` checks. No effective no-op can reach revision or `updated_at` assignments. Committed task or History changes request one targeted reconciliation; zero committed tasks, History, and rewards request none.

## 7.6.12 Idempotent rollover persistence

The application projection compares canonical database representations rather than raw engine values. Derived `unscheduled` compares as persisted `pending`; database dates and timestamps compare in normalized forms; omitted fields remain omitted; and nullable cleanup fields are emitted only while their stored columns still need clearing. Completed tasks whose authoritative History-derived `completedAt` and cleared `dueOn` already match the reloaded row therefore produce no task patch.

[patch_task_state_engine_rollover_7_6_12.sql](../supabase/patch_task_state_engine_rollover_7_6_12.sql) independently normalizes and checks every supported patch field with `IS DISTINCT FROM` before the task `UPDATE`. An effective no-op does not change `revision` or `updated_at` and is not counted in `changed_task_count`; stale revision protection and Archive/Trash exclusion remain intact. Final Achievement evaluation occurs once when History was actually inserted and is skipped when no History was inserted. The client requests targeted Task/History reconciliation only when the RPC reports at least one changed task or inserted History row.

After successful persistence and reload, reevaluating the same task state for the same logical date must produce no database writes.

## 7.6.11 Deferred Achievement evaluation

[patch_task_state_engine_rollover_7_6_11.sql](../supabase/patch_task_state_engine_rollover_7_6_11.sql) applies the legacy rollover's achievement batching pattern to the engine RPC. Immediately before bulk History insertion it sets the transaction-local deferred-user marker. The installed History trigger still captures each achievement occurrence and refreshes any affected Step set, but skips its per-row full evaluation. Once bulk History and task writes finish, the RPC clears the marker and runs exactly one deterministic final `adhdice_evaluate_achievements` call for the user/logical date.

Only final `completed` or `inactive` evaluations are accepted. Any other result raises before return and rolls back all staged History/task writes; the marker is cleared before the final call and cannot escape the transaction. Existing planner output, recurrence/Calendar behavior, History identity/deduplication, revision/advisory safety, reward behavior, and Archive/Trash restrictions remain unchanged.

## 7.6.10 Set-based rollover persistence

[patch_task_state_engine_rollover_7_6_10.sql](../supabase/patch_task_state_engine_rollover_7_6_10.sql) is the corrective follow-up to the installed 7.6.9 RPC. It parses the engine payload once into transaction-local staging relations, validates statuses before enum casts, acquires the existing per-user advisory transaction lock once, locks eligible revision-matching task rows as a set, checks explicit-History conflicts as a set, bulk inserts History with the existing `(user_id, task_id, entry_date)` identity and `ON CONFLICT DO NOTHING`, and bulk updates only supported changed task fields. It returns actual changed-task, inserted-History, and deduplicated-outcome counts.

The RPC remains atomic and replay-safe: a statement failure rolls back every write, a same-payload replay inserts no duplicate History, a contradictory pre-existing History row excludes that task, and a stale revision excludes that task. It does not mutate Archive, Trash, recurrence metadata, Calendar state, or rewards. Development diagnostics separately show planned and committed task patch, History, and reward counts; committed counts are zero on RPC failure.

## 7.6.9 Unscheduled persistence boundary

`unscheduled` is a derived active/read status, not a database status. `projectPersistableTaskStatePatch()` drops an engine `unscheduled` status instead of emitting it to task updates, RPC payloads, History, or enum casts. Dormant task rows use supported stored `pending`; when they are read, the shared authority derives and displays Unscheduled.

For a stale In Progress dormant task, rollover writes one Did My Best History outcome, clears active tracking fields, and projects the task status to `pending`. A dormant row already stored as `pending` receives no status patch. [patch_task_state_engine_rollover_7_6_9.sql](../supabase/patch_task_state_engine_rollover_7_6_9.sql) is a required corrective follow-up to 7.6.7: it maps an incoming `unscheduled` patch value to `pending` and rejects every other unsupported JSON status/history outcome before an enum cast. It does not modify the enum or schema.

## 7.6.8 Rollover trigger lifecycle

`TaskApp` does not authorize an engine rollover from the empty pre-load render. It waits until the authenticated Task rows and paged task History are both ready; that first loaded-data invocation is the authoritative initial-load reconciliation. The coordinator holds only overlapping requests, not completed logical-day results, so the one-minute timer, an actual hidden-to-visible transition, and persisted BFCache `pageshow` can each evaluate current data.

Trigger callbacks read a stable current-input ref rather than their mount-time closure. Every owned run, including a loaded-data no-op, replaces `window.__ADHDICE_TASK_STATE_ROLLOVER_DIAGNOSTICS__` with authority, source, logical date, evaluated-task count, task/history/reward counts, deduplicated outcomes, duration, and error summary. A no-op still skips RPC and targeted refresh. Engine success never calls legacy; only an unavailable engine RPC selects the legacy fallback for that one execution.

## 7.6.7 Engine rollover authority

`TaskApp` owns only trigger wiring (authenticated load, one-minute safety check, visibility return, and persisted BFCache `pageshow`). All triggers use the one single-flight coordinator and the same engine rollover plan; no UI component contains rollover rules. The plan evaluates already-loaded Task and History rows using the profile timezone and configured logical-day start (default `06:00`), projects only supported task fields, and never proposes Archive, Trash, `recurrenceCursor`, or `satisfiedOccurrenceIdentity` writes.

When `TASK_STATE_ENGINE_INTEGRATION_ENABLED` is on, `adhdice_apply_task_state_engine_rollover` persists the plan under an advisory transaction lock with row revision and explicit-History precedence checks. Install [patch_task_state_engine_rollover_7_6_7.sql](../supabase/patch_task_state_engine_rollover_7_6_7.sql) before relying on engine persistence. If that RPC is unavailable, the coordinator uses the existing `adhdice_reconcile_task_rollover` fallback; it never invokes both for a run. Empty plans do not call an RPC or refresh workspace data. Development exposes the latest authority/run/count/timing/error diagnostic at `window.__ADHDICE_TASK_STATE_ROLLOVER_DIAGNOSTICS__`.

Remaining work is browser/multi-tab QA around logical-day boundaries, BFCache, the installed SQL RPC, and reward-bank behavior.

## 7.6.6 Calendar and action integration

`TASK_STATE_ENGINE_INTEGRATION_ENABLED` in `read-authority.ts` is the one default-on, non-user-facing compatibility switch. It controls active-status reads, `calendar-authority.ts`, and `action-authority.ts`; disabling it keeps legacy Calendar/action behavior available. Development continues to identify the active read authority at `window.__ADHDICE_TASK_STATE_ACTIVE_STATUS_AUTHORITY__`.

Task History Calendar consumes centralized engine Calendar facts after explicit History, rather than computing recurrence/status rules in the UI. Done, Did My Best, Missed, Delay, and Complete evaluate through `action-authority.ts` before the existing guarded task mutation, History occurrence-key upsert, reward, confirmation, and hierarchy flows execute. In Progress continues to use the existing active-status tracking fields, which the engine reads for same-day state and rollover conversion.

The persistence projection remains restricted to supported task fields. `recurrenceCursor` and `satisfiedOccurrenceIdentity` are never task-row writes; occurrence identity remains in supported History `occurrence_key`/`occurrence_due_on` fields. Rollover RPCs, SQL, visibility listeners, and scheduled reconciliation remain legacy until 7.6.7.

## 7.6.5 active-status read authority

`src/lib/task-state-engine/read-authority.ts` is the one default-on compatibility owner. It adapts only already-hydrated Task and History arrays, evaluates each task once, and produces presentation-only active-status copies. Table View, List View, Home task displays, Edit Task status display, active-status filters, buckets, and overdue collections use that shared projection. Development reports `engine` or `legacy` at `window.__ADHDICE_TASK_STATE_ACTIVE_STATUS_AUTHORITY__`.

Setting `TASK_STATE_ENGINE_ACTIVE_STATUS_READ_ENABLED` to `false` switches every connected read back to the stored legacy task status. This is not a Settings control. Calendar rendering, user task-action writes, rewards, rollover RPCs, SQL, History persistence, and recurrence persistence continue to use legacy paths.

`projectPersistableTaskStatePatch()` is the future write boundary: it admits only current task-model fields (`status`, `dueOn`, `completedAt`, `activeStatusLogicalDate`, `activeOccurrenceDueOn`) and intentionally discards `recurrenceCursor` and `satisfiedOccurrenceIdentity`. No proposal is written in this release.

## Terminology and contract

- **Lifecycle** is `active`, `complete`, `archived`, or `trashed`. Only explicit user lifecycle commands may archive, trash, restore, or delete.
- **Active status** is the task-wide state: Unscheduled, Pending, In Progress, Missed, Upcoming, Not Due, Delayed, Done, Did My Best, or Complete.
- **Calendar state** is per logical date: Open, In Progress, Done, Did My Best, Missed, Delayed, Complete, Scheduled, Not Due, or No Entry.
- **History** contains only Done, Did My Best, Missed, Delayed, or Complete, with `manual`, `rollover`, `reconciliation`, or `import` provenance. Open is virtual.
- **Logical date** is calculated from the supplied timestamp, IANA timezone, and rollover time. The real timestamp remains separate.

`evaluateTaskState` accepts a task snapshot, explicit History, current timestamp, timezone, rollover time, recurrence, and an optional proposed action or forward-recompute boundary. It returns lifecycle, active status, Calendar states, handled/current-day facts, continuous overdue, recurrence facts, proposed History changes, an allow-listed task patch, streak disposition, reward eligibility, and validation errors. Identical input produces identical output.

## Outcome matrix

| Task type | Allowed success outcomes | Other valid handling |
| --- | --- | --- |
| Scheduled one-off | Did My Best, Complete | Missed, Delay |
| Dormant Unscheduled one-off | Did My Best, Complete; In Progress is snapshot state | No Missed or Done |
| Daily / Every X Days | Done, Did My Best | Missed, Delay |
| Daily / Every X Days Until Complete | Did My Best, Complete | Missed, Delay |
| Fixed weekly/monthly recurring | Done, Did My Best | Missed, Delay |
| Fixed weekly/monthly Until Complete | Did My Best, Complete | Missed, Delay |

Valid success outcomes are also allowed on Not Due days. Only one authoritative outcome and one stable reward identity exist per task/logical date.

## Rollover truth table

| Prior state | Rollover result |
| --- | --- |
| Scheduled/overdue Open | One Missed row per completed unresolved day; frozen `dueOn`; today Open |
| In Progress | Did My Best once, then normal recurrence behavior |
| Manual Missed | Already handled; no duplicate or advancement |
| Done / Did My Best | No duplicate; retain outcome-derived next due |
| Delayed | Already handled; preserve streak and wait for delayed due |
| Complete | No future occurrence |
| Unscheduled Open | No Missed; break positive streak; today remains Open |

## Recurrence and active status

Rolling intervals rebase from the actual logical success date and support every positive interval. Fixed weekdays/weeks and fixed-date/ordinal months retain their calendar pattern. Early success consumes only the nearest upcoming scheduled occurrence; its identity is returned. Further Not Due outcomes do not consume another occurrence before the next scheduled opportunity. Complete terminates recurrence.

An unresolved scheduled date enters continuous overdue: each completed logical day is Missed, today is Open, active status stays Missed, and `dueOn` stays frozen. A future due date is Upcoming at 1–7 logical days and Not Due at 8 or more. No due date plus no cadence is Unscheduled.

## Calendar, streaks, and rewards

Explicit History overrides virtual Calendar state. Handled Today requires an explicit current-date Done, Did My Best, Missed, Delayed, or Complete. Missed Today requires current-date Missed History; an older active Missed state is insufficient.

Done, Did My Best, and Complete increment/start a positive streak. Delay preserves it. Scheduled Missed increments/starts a missed streak. Unscheduled inactivity breaks only the positive streak. Eligible reward facts are returned for Done, Did My Best, Complete, and automatic In Progress rollover; Missed, Delay, Open, and inactivity are ineligible. The engine never awards rewards.

## Safety and recalculation

The proposed task patch is an allow-list limited to status, due/active occurrence fields, recurrence cursor/identity, and completion time. It cannot represent archive, trash, restore, deletion, content, list, folder, or metadata mutations. The engine performs no database, React, rewards, or Realtime work. Forward recomputation preserves History before its boundary; explicit History remains authoritative and stale derived plans are replaced only in returned proposals.

## Legacy adapter contract

`adaptLegacyTaskState` maps an already-loaded database-shaped Task and its already-loaded History rows into the engine input contract. It maps one-off, Daily, Every X Days/custom, Daily Until Complete, fixed weekly, fixed monthly-date, and fixed monthly-ordinal recurrence; lifecycle and active status; due/active occurrence dates; explicit History outcomes; and occurrence identity. The caller supplies the current timestamp, IANA timezone, and rollover time.

The adapter is pure, does not mutate source rows, and performs no query. Malformed dates, intervals, weekdays, statuses, and contradictory History flags become warnings. Unsupported combinations remain explicit, including a missing pre-Archive/pre-Trash active status, missing counted-occurrence identity, and within-day due-time behavior.

## Development shadow mode

Shadow mode compares the engine with current read-only status, History, Calendar, overdue, recurrence, and patch-derivation helpers over a bounded date window. Results separate matches, approved semantic differences, representation-only differences, adapter limitations and warnings, unsupported legacy data, legacy-data anomalies, and possible engine defects. Calendar normalization records whether each date is past/current/future, actually scheduled, backed by explicit History, omitted by the sparse engine representation, or belongs to an Unscheduled task. For rolling Daily, Daily Until Complete, and Every X Days recurrence, a future legacy `Due` cell is representation-only when it depends on future success or continuous-overdue resolution; only the calculated next occurrence is scheduled. Fixed weekly/monthly missing occurrences and explicit History disagreements remain possible defects.

The report includes raw comparisons, classification totals, task summaries, and semantic-group summaries for active status, current-day Calendar, overdue classification, recurrence, proposed History, proposed task patches, sparse Calendar representation, adapter warnings, and unsupported legacy data. Its headline distinguishes excluded lifecycle tasks, fully skipped unsupported tasks, and evaluated tasks with adapter limitations. Each group preserves raw comparison counts and separately reports evaluated, differing, possible-defect, approved-difference, representation-only, and adapter-limited task counts.

The headline possible-defect count is deduplicated by task and semantic group. Calendar defect records retain a normalized pattern, date count, first/last affected dates, and bounded date samples rather than repeated per-date value maps; full Calendar detail is opt-in with `includeFullDefectDetails`. Other records retain paired current/engine values, a concise reason, relevant adapter diagnostics, the sanitized allowlisted patch, and a bounded proposed-History summary. Equivalent `occurrence:YYYY-MM-DD` and `task:<id>:occurrence:YYYY-MM-DD` forms compare by task and date. Missing task-level recurrence cursor/identity metadata is an adapter limitation for metadata-only patches, while actual schema-field differences remain visible. Fully skipped lifecycle/filter tasks and evaluated tasks with adapter limitations are reported separately.

The runtime bridge is development-only, registers no subscription, performs no query, and never runs automatically. With a local development build open and hydrated, run:

```js
window.__ADHDICE_RUN_TASK_STATE_SHADOW__()
```

Optional targeting:

```js
window.__ADHDICE_RUN_TASK_STATE_SHADOW__({
  taskIds: ["TASK_ID"],
  startDate: "2026-06-01",
  endDate: "2026-07-30",
  includeMatches: false,
  includeTitles: true,
})
```

The command returns the report and stores it at `window.__ADHDICE_LATEST_TASK_STATE_SHADOW__`. Titles are omitted by default, and the console prints only grouped counts rather than full History tables.

Review the already-stored report without rerunning the engine or reading the hydrated snapshot:

```js
window.__ADHDICE_SUMMARIZE_TASK_STATE_SHADOW__({
  maxSamplesPerPattern: 5,
  includeTitles: false,
  semanticGroup: "current-day Calendar differences",
  taskType: "fixed-weekly",
})
```

Filters are optional. Titles can appear only when the original run used `includeTitles: true` and the review call also explicitly requests them. To paste the full sanitized latest report as formatted JSON, use `window.__ADHDICE_EXPORT_TASK_STATE_SHADOW__()`; pass `{ includeTitles: true }` only when titles were deliberately collected and should be exported. The export returns a string and does not access the clipboard, rerun the engine, or include notes, links, or unrelated task fields.

The patch assertion accepts only `status`, `dueOn`, `activeStatusLogicalDate`, `activeOccurrenceDueOn`, `recurrenceCursor`, `satisfiedOccurrenceIdentity`, and `completedAt`. Any other field is a safety violation. Archived and Trashed tasks may be inspected when explicitly targeted but may not produce patches.

Narrow approved differences from the 7.5.39 production system include current-day scheduled `Due` becoming `Open`, future scheduled `Due` becoming `Scheduled`, legacy `Pending` becoming `Unscheduled` only when no due date or recurrence obligation exists, active `Missed` for unresolved overdue scheduled work while today stays `Open`, handled-day treatment for Delay and Complete, nearest-occurrence consumption for early fixed-calendar success, and continuous logical-day overdue proposals where legacy helpers expose only scheduled misses. Sparse `Not Due`/`No Entry` cells without History or an occurrence are representation-only. These rules do not normalize explicit-History disagreement or a genuinely missing scheduled state.

The current task row has no persisted `recurrence_cursor` or task-level `satisfied_occurrence_identity`. `active_occurrence_due_on` is a live-occurrence cursor with different semantics, while History `occurrence_key` identifies individual persisted outcomes. The adapter reports this as unsupported task-level metadata. Engine callers may optionally supply current recurrence metadata; matching values suppress redundant patch proposals. No schema or persistence was added.

Shadow mode performs no writes. It does not import or call Supabase writes, task mutation hooks, History synchronization, reward queues, rollover RPCs, lifecycle actions, SQL, or persistence.

## Future work

Persistence transactions, Calendar integration, action-write integration, rollover/RPC integration, SQL parity, and multiple-times-per-day recurrence are intentionally unresolved. Whether a completely dormant Unscheduled task should eventually omit today's virtual `Open` cell remains a product-semantic question; 7.6.4 retains the existing documented and tested `Open` behavior. Multiple daily occurrences will require occurrence-level outcome and reward identities.
