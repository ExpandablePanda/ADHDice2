# Current State

Last reviewed: 2026-08-15
Role: active working

## Current Release

- Current working app version: `7.9.5`.
- Current release group: `7.9.x` Task State and workspace corrections.
- Version surfaces that should stay aligned for code-changing implementation work:
  - `package.json`
  - `package-lock.json`
  - `public/app-version.json`
  - visible `APP_VERSION` / `HUD_VERSION` constants in `src/components/task-app.tsx`
- This document summarizes current authority and known limits; it does not establish browser parity or gate activation.
- Historical patch descriptions are intentionally excluded from this active document.

### 7.9.5 Historical rolling-outcome replay correction

- Historical outcome replay for rolling recurrence processes every later authoritative History row in logical-date order. An older edit cannot leave the rolling cursor at an intermediate date before a later success; the existing Effective Timeline remains the sole replay authority.
- The protected regression is the confirmed Shop sequence: rolling every 2 days, authoritative 2026-08-12 and 2026-08-13 `Did My Best`, then editing 2026-08-12. The projection remains pending with `due_on = 2026-08-15`, keeps the 2026-08-13 fact, and does not synthesize Missed on 2026-08-14. Fixed weekly/monthly cursor protection and ordinary rolling replay remain unchanged. Browser QA, live Supabase validation, and deployment verification remain unrun.

### 7.9.2 Derived Unscheduled display status

- Unscheduled is a UI-only active/display status for open pending Tasks and Steps/Substeps without a current due date. It is projected from the canonical active-status read and is used consistently by status chips, counts, filters, sorting, and status actions.
- Selecting Unscheduled clears the existing schedule/date mutation path; it does not write a database status or create History. Browser QA, live Supabase validation, and deployment verification remain unrun for this release.

### 7.9.4 Manual-list context correction

- Manual-list context removal now requires the exact Task ID to have a direct manual membership in the current eligible list; inherited hierarchy visibility remains display-only for this action. Browser QA, live Supabase validation, and deployment verification remain unrun for this release.

### 7.9.3 Tasks workspace refinements

- Manual-list context removal, exact Weekdays-first Repeat sorting, and History-authoritative Last Handled presentation are implemented without schema or recurrence-engine changes. Browser QA, live Supabase validation, and deployment verification remain unrun for this release.

### 7.8.18 Legacy History promotion rollback recovery

- Added an unapplied, preview-first rollback tool for one exact `legacy-history-promotion-v1` migration operation. It validates the stored source fingerprint, user, operation identity, provenance markers, expected fact count, and migration contract before a future service-role RPC can delete canonical migration facts. The operation row is retained and marked `failed_retryable` with `ROLLBACK_COMPLETED` metadata; legacy History, legacy evidence, Task State, and rewards are not mutated. Live promotion, rollback, SQL/RPC application, and browser validation remain unrun.

### 7.7.38 Canonical In Progress read projection

- The active-status read path now supplies canonical current-day `workflow_logical_date` through a presentation-only compatibility projection, so canonical In Progress tasks display as In Progress without changing the canonical Task row or persistence semantics. Stale prior-day workflow remains non-current; browser QA remains pending.

### 7.7.37 Canonical Task State runtime activation

- Canonical Task State browser commands are now enabled behind the reviewed trusted runtime boundary.
- Browser QA is pending; visible browser behavior and live runtime parity remain unverified.

## Current Architectural Authorities

### 7.7.40 Canonical creation source parsing

- The trusted canonical Task creation Edge boundary accepts both explicit `task_creation` and omitted creation sources, continues to accept explicit `task_import`, and rejects unsupported source values. SQL, RPC, planner, recurrence, History, reward, Import behavior, and deployment state are unchanged.

### 7.7.39 Trusted canonical Task creation

- With the canonical runtime gate enabled, normal Add Task, editor-based Task creation, and Import now send creation intent through the authenticated `task-create-canonical` Edge boundary. The Edge path derives the verified owner, validates the draft and parent entity kind, builds the canonical TypeScript creation plan, and invokes the service-role-only `adhdice_create_canonical_task` RPC.
- The RPC atomically inserts the Task with `canonical_revision = 1`, initialized terminal/container/workflow state, and its initial schedule boundary. Creation does not write legacy History or canonical reward records. Imported outcome/lifecycle snapshots that require provenance fail closed and remain visible as import errors; pending/open metadata and parent/Step/Substep relationships are preserved.
- The SQL and Edge implementation are source-only for this release. SQL execution, Edge deployment, live Supabase mutations, and browser QA remain unverified and unauthorized in this task.

### M3A.5 Trusted Task State Command Boundary

- The trusted M3A Task State backend/RPC and `task-state-command` Edge path are deployed and have been live-validated. Runtime gate activation is complete; browser QA remains pending.
- The trusted `task-state-command` Edge Function accepts authenticated intent only. Direct authenticated submission of canonical plans or privileged persistence sections is forbidden.
- The Edge Function derives owner identity from verified Supabase Auth, reads only that user's canonical Task State and logical-day profile, invokes the existing pure TypeScript planner, and sends its serialized plan through the backend-only invoker RPC using the modern secret-key admin client.
- Runtime provenance, command identity, entity/owner IDs, timestamps, migration fields, and the SHA-256 accepted-payload digest are established inside the trusted boundary. History/occurrence collection max revisions are not runtime fences; canonical Task `canonical_revision` remains authoritative and schedule `boundary_sequence` protection remains active.
- This trusted boundary is ready for M3B runtime cutover. Normal production Task mutations and the active Task UI remain behind the disabled gate.

### 7.7.36 M3B pre-activation reward correction behind the disabled gate

- Canonical reward fulfillment is now an authored, minimal RPC contract: `adhdice_fulfill_canonical_reward_entitlement(p_entitlement_id uuid)`. The server locks the owned entitlement, validates exact canonical History provenance, derives successful-occurrence streaks and the existing dice tier, builds one-task/one-claim pending-reward payloads, and records one canonical grant, pending dice item, and award operation. Browser reward payloads, streaks, dice counts, Task arrays, claim references, and token-generating Task counts are not accepted.
- The canonical reward client receives `reward_entitlement_id` from the committed canonical command and invokes only the entitlement ID. Transient fetch retry repeats that same deterministic entitlement identity; it does not read canonical History, recreate History, finalize legacy recurrence, or independently decide eligibility. Successful fulfillment retains the existing pending-reward refresh.
- `blocked` entitlements fail closed. Exact provenance requires the authenticated owner, the entitlement's exact `canonical_history_id`, matching owner/entity/entity kind/logical date/outcome snapshot, a successful `Done`/`Did My Best`/`Complete` outcome, and an authenticated-owner canonical Task. Missed has no entitlement and remains reward-ineligible.
- Reward streaks count consecutive successful logged canonical occurrences, not consecutive calendar dates. Explicit non-successful facts, including Missed, break the streak; one-time Tasks are capped at one occurrence. Existing 1/2/3/4/5/6-die tiers and the existing claim/economy pipeline are unchanged.
- Rewarded Calendar clear remains a temporary initial-activation limitation: if an explicit canonical Calendar fact is already linked to a reward entitlement, clear fails closed with a useful provenance-preservation error and never falls back to legacy History. No tombstone/void system is included here; this single correction path is not an initial activation blocker.
- `TASK_STATE_CANONICAL_COMMANDS_ENABLED` is `true` as of 7.7.37; browser QA remains pending.

#### M3B backend deployment parity checklist (source-only; not executed here)

- [ ] Install the reviewed `supabase/add_task_state_command_rpc.sql` source, including the canonical clear-outcome reward-provenance fence.
- [ ] Install the reviewed `supabase/add_canonical_reward_entitlement_bridge.sql` source, including removal of the old browser-authoritative overload and installation of `adhdice_fulfill_canonical_reward_entitlement(uuid)`.
- [ ] Deploy the exact reviewed `task-state-command` Edge bundle. Its complete local source graph is: `supabase/functions/task-state-command/index.ts`, `supabase/functions/task-state-command/auth.ts`, `supabase/functions/task-state-command/domain.ts`, `supabase/functions/task-state-command/orchestration.ts`; `src/lib/database.types.ts`, `src/lib/records/persisted-types.ts`; `src/lib/task-state-canonical/command-service.ts`, `src/lib/task-state-canonical/digest.ts`, `src/lib/task-state-canonical/engine-input.ts`, `src/lib/task-state-canonical/read-model.ts`, `src/lib/task-state-canonical/types.ts`; and `src/lib/task-state-engine/calendar.ts`, `src/lib/task-state-engine/engine.ts`, `src/lib/task-state-engine/legacy-adapter.ts`, `src/lib/task-state-engine/recurrence.ts`, `src/lib/task-state-engine/types.ts`. This is the full graph required by the packaging contract; changed canonical planner/domain/read-model/engine source must not be omitted from the bundle.
- [ ] Verify RPC signatures and privileges: authenticated can execute the minimal fulfillment RPC and the trusted command RPC remains service-role-only; anon/public cannot execute either privileged function.
- [ ] Verify deployed Edge version/source against the reviewed bundle (including the UUID auth boundary and `clear_outcome` intent support).
- [ ] Run a controlled authenticated backend smoke test for one canonical success, exact fulfillment retry, blocked entitlement rejection, and non-owner/provenance mismatch rejection. Do not use browser-supplied reward payload fields.
- [ ] Only after the SQL/RPC install, exact Edge deployment, privilege/signature checks, deployed-source proof, and controlled smoke test pass: enable the browser canonical gate, then perform browser QA.

### 7.7.34 M3B runtime wiring behind the disabled gate

- `src/lib/task-state-runtime-actions.ts` is the classification boundary for the next runtime cutover. It explicitly separates metadata-only fields (`title`, `notes`, priority/energy/presentation fields, links, tags, focus/editor metadata, and pin/sort fields) from Task State-owned fields (`status`, schedule/repeat fields, active-status projections, `completed_at`, `trashed_at`, and hierarchy parent changes).
- Runtime coordinator/executor wiring now covers workflow, lifecycle, Done/Did My Best/Missed, permanent Complete, due-date/repeat edits, supported History/Calendar outcome corrections, rollover/reconciliation, and supported batch actions while the gate remains off. Canonical responses reconcile the local Task from `canonical_task_patch`, `compatibility_projection`, and `next_revision`; History refreshes are read-only and never recreate legacy facts.
- Canonical History reads now use `adhdice_task_history_facts` through `history-projection.ts` for full workspace, task-scoped, streak, critical-fact, realtime, Records, and report-range refresh paths; the legacy table remains the read source while the gate is false. The adapter projects explicit facts only and never manufactures calculated Missed rows.
- Remaining-writer audit classification: `CANONICAL` = coordinator-routed lifecycle/outcome/schedule/History-calendar/rollover/batch paths; `METADATA_ONLY` = title, notes, priority, energy, links, tags, focus, pin, and sort persistence; `LEGACY_ONLY_NONCANONICAL_ENTITY` = intentionally unpromoted checklist rows, the inactive `/classic` demo surface, and Settings JSON restore while the gate is disabled; `MILESTONE_ATOMIC_TRUSTED_SEAM` = the existing trusted Milestone completion/trash/restore/delete transactions whose Milestone-specific atomicity cannot be split here. Promoted Steps/Substeps use the same-table canonical Task coordinator, and Milestone Done/Did My Best/Missed outcomes use the canonical coordinator. Settings JSON restore is explicitly fenced while the gate is enabled so its legacy ID-based upsert cannot overwrite canonical status or schedule state.
- Activation installation item: `supabase/add_canonical_reward_entitlement_bridge.sql` is authored for review but not installed. It consumes canonical entitlement identity, derives the existing dice tier from canonical successful facts, and is idempotent by entitlement/grant identity. Delay now resolves a materialized canonical occurrence and fails closed when none exists; undated bench Delay remains unsupported by the locked command contract.
- The previously failing legacy History runtime assertion was stale: a prior-day Calendar completion advances the recurring cursor but does not rewrite the stored Missed compatibility projection. The focused test now documents that locked behavior; calculated Missed remains non-persistent.
- Canonical Calendar replacement upserts the existing entity/logical-date fact while preserving its canonical identity. Clearing removes explicit facts and deactivates dependent Calendar/override references only when no reward entitlement references that fact; reward-linked clear fails closed because the locked entitlement-to-history foreign key cannot be safely orphaned or clawed back in this ticket.
- 7.7.34 activation blocker: the exact unsupported action is clearing an explicit Calendar outcome after its canonical reward entitlement exists. The smallest missing capability is a reviewed canonical void/tombstone outcome (or an equivalently reviewed entitlement-provenance retention change) that preserves the referenced fact without awarding twice; this ticket deliberately does not invent or install that capability.
- Before 7.7.37 activation, `TASK_STATE_CANONICAL_COMMANDS_ENABLED` remained `false` and normal production behavior stayed on the legacy path pending the reviewed activation boundary.

### Task State Engine

- The shared Task State Engine is the canonical active authority for pure state evaluation, active-status reads, Calendar facts, action planning, rollover planning, reward eligibility, and the allow-listed persistence projection.
- Engine-derived values remain distinct from persisted task-row values. In particular, engine-only `unscheduled` is projected to supported stored `pending`; engine-only cursor or occurrence metadata is not persisted as task-row metadata.
- Guarded revisions, explicit History identity, idempotent no-op handling, and engine/legacy mutual exclusion remain load-bearing safety boundaries.
- [`docs/TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) is the canonical contract reference; release chronology remains in the historical archive.

### Workspace, Loading, and Cache Ownership

- Startup keeps critical current-state facts bounded; full per-task History and other detail data remain owned by explicit cached consumers rather than broad critical startup loading. Task History modal rows stay in a task-scoped cache and do not widen shared bounded History.
- Query changes should reuse stable workspace facts and avoid invalidating canonical entities, status authority, Archive/Trash sets, or unrelated page data.
- Workspace performance diagnostics are development-only. Browser evidence for commit counts, inactive-page CPU, cross-tab/BFCache behavior, and Safari paint behavior remains unverified.
- [`docs/WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) is a qualified source diagnostic, not canonical runtime proof; its browser, deployment, and performance questions remain unresolved.

### Task History and Readiness

- Critical startup History remains narrow to current logical-day/live-occurrence facts; full per-task History is loaded through authenticated, readiness-aware cached consumers.
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
- Manual SQL patches and live deployment state are not established by this documentation pass; do not assume a historical patch is deployed without separate verification.
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
- Manual SQL/RPC deployment assumptions and any path that could reconcile stale state.
- Browser/Safari paint behavior around scaled shells, sticky/nested scrollers, and translucent layers remains an evidence problem, not a claimed fix.

## Active Warnings and Constraints

- Treat the Task State Engine switch and its connected read/action/Calendar/rollover consumers as one compatibility boundary.
- Do not persist engine-only status, cursor, or occurrence metadata, and do not replace canonical rows with partial payloads.
- Do not use historical release notes as current authority; use the linked canonical contracts and verify freshness caveats.
- Browser QA, live Supabase behavior, deployed RPC state, multi-tab behavior, BFCache behavior, and Safari rendering require separate authorized verification.

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
