# Current State

Last reviewed: 2026-08-06
Role: active working

## Current Release

- Current working app version: `7.7.25`.
- Current release group: `7.7.x` Flexible Meal Logging and Editing.
- Version surfaces that should stay aligned for code-changing implementation work:
  - `package.json`
  - `package-lock.json`
  - `public/app-version.json`
  - visible `APP_VERSION` / `HUD_VERSION` constants in `src/components/task-app.tsx`
- This document summarizes current authority and known limits; it does not establish deployed SQL, browser, or runtime parity.
- Historical patch descriptions are intentionally excluded from this active document.

## Current Architectural Authorities

### M3A.5 Trusted Task State Command Boundary

- The M3A canonical Task State source foundation exists, but its RPC remains undeployed and no live SQL execution or Edge deployment is claimed.
- The trusted `task-state-command` Edge Function accepts authenticated intent only. Direct authenticated submission of canonical plans or privileged persistence sections is forbidden.
- The Edge Function derives owner identity from verified Supabase Auth, reads only that user's canonical Task State and logical-day profile, invokes the existing pure TypeScript planner, and sends its serialized plan through the backend-only invoker RPC using the modern secret-key admin client.
- Runtime provenance, command identity, entity/owner IDs, timestamps, migration fields, and the SHA-256 accepted-payload digest are established inside the trusted boundary. History/occurrence collection max revisions are not runtime fences; canonical Task `canonical_revision` remains authoritative and schedule `boundary_sequence` protection remains active.
- This trusted boundary is required before M3B runtime cutover. Normal production Task mutations and the active Task UI have not been cut over.

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
