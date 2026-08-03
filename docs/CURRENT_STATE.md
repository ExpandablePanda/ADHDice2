# Current State

Last reviewed: 2026-08-03
Role: active working

## Current Release

- Current working app version: `7.6.35`.
- Current release group: `7.6.x` Task State Engine.
- Version surfaces that should stay aligned for code-changing implementation work:
  - `package.json`
  - `package-lock.json`
  - `public/app-version.json`
- visible app constants in `src/components/task-app.tsx` (`APP_VERSION` / `HUD_VERSION`)
- This Phase 2A change is documentation-only and does not change the app version.
- Historical patch descriptions are intentionally excluded from this active document.

## Current Architectural Authorities

### Task State Engine

- The shared Task State Engine is the current authority for active-status reads, Calendar facts, action planning, rollover planning, and the allow-listed persistence projection.
- Engine-derived values remain distinct from persisted task-row values. In particular, engine-only `unscheduled` is projected to supported stored `pending`; engine-only cursor or occurrence metadata is not persisted as task-row metadata.
- Guarded revisions, explicit History identity, idempotent no-op handling, and engine/legacy mutual exclusion remain load-bearing safety boundaries.
- [`docs/TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) remains the canonical contract reference, but its release header stops at 7.6.19 and is not a complete current release summary.

### Workspace, Loading, and Cache Ownership

- Startup keeps critical current-state facts bounded; full per-task History and other detail data remain owned by explicit cached consumers rather than broad critical startup loading.
- Query changes should reuse stable workspace facts and avoid invalidating canonical entities, status authority, Archive/Trash sets, or unrelated page data.
- Workspace performance diagnostics are development-only. Browser evidence for commit counts, inactive-page CPU, cross-tab/BFCache behavior, and Safari paint behavior remains unverified.
- [`docs/WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) is a source-based 7.6.23 diagnostic, not a fully current architecture summary; its open measurements remain unresolved.

### Task History and Readiness

- Critical startup History remains narrow to current logical-day/live-occurrence facts; full per-task History is loaded through authenticated, readiness-aware cached consumers.
- History consumers must expose loading and retry states until the requested task's data is ready.
- History readiness must not widen unrelated startup work or replace canonical current-state facts with partial detail payloads.

### Task Hierarchy and Orchestration

- Same-table Steps/Substeps already have shared hierarchy derivation, previews, editor routing, and same-parent reorder/drag behavior.
- Remaining deferred hierarchy work is narrower: cross-parent movement, promote/demote, broader legacy-subtask migration, custom child metadata/reward rules, and any recurrence semantics that still require product approval.
- [`docs/taskapp-behavior-contract.md`](taskapp-behavior-contract.md), [`docs/taskapp-orchestrator-contract.md`](taskapp-orchestrator-contract.md), and [`docs/task-hierarchy-plan.md`](task-hierarchy-plan.md) describe the surrounding contracts and rollout boundaries.

### Persistence Boundaries

- Mutations must use the shared guarded task and History paths, preserve optimistic-concurrency checks, and avoid zero-effective writes.
- Manual SQL patches and live deployment state are not established by this documentation pass; do not assume a historical patch is deployed without separate verification.
- Existing release history records the exact repair scopes, SQL filenames, row counts, and verification limitations in the [historical archive](archive/2026-08-retired/current-state-release-history.md).

## Confirmed Open Issues and Unverified Risks

- The black/glitched HUD/UI state during reload or boot remains an open source-documented issue; it is not documented as fixed.
- Browser behavior remains unverified for the startup/rendering, Safari paint, performance, cross-tab, and BFCache claims recorded in the 7.6.x history.
- The current documentation contains freshness gaps in the Task State Engine and workspace architecture documents; those are not resolved by this phase.

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
- This documentation change does not authorize source, SQL, test, version, deployment, or product-scope changes.

## Immediate Priorities

1. Keep the black/glitched reload seam isolated for a dedicated diagnosis before changing adjacent UI or performance paths.
2. Obtain the missing browser/runtime evidence for startup, search responsiveness, History readiness, cross-tab/BFCache behavior, and Safari paint before claiming those risks resolved.
3. Keep future recurrence, hierarchy, persistence, and migration tickets bounded by their documented authority and approval requirements.
4. Treat snapshot/restore and broader legacy-subtask migration as deferred work; no implementation scope is inferred here.

## Related Canonical Documents

- [`docs/INDEX.md`](INDEX.md) — documentation roles and source-of-truth map.
- [`docs/AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) — work modes, scope control, and handoff rules.
- [`docs/VERIFICATION.md`](VERIFICATION.md) — production-path verification and reporting requirements.
- [`docs/taskapp-behavior-contract.md`](taskapp-behavior-contract.md) — current TaskApp behavior contract.
- [`docs/taskapp-orchestrator-contract.md`](taskapp-orchestrator-contract.md) — orchestration boundary contract.
- [`docs/TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) — canonical engine contract with the freshness caveat above.
- [`docs/WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) — source-based diagnostic with the freshness caveat above.
- [`docs/task-hierarchy-plan.md`](task-hierarchy-plan.md) — hierarchy rollout and deferred movement boundaries.
- [`docs/daily-until-complete-plan.md`](daily-until-complete-plan.md) — Daily Until Complete product rules and rollout plan.
- [Historical 7.6.x and earlier release notes](archive/2026-08-retired/current-state-release-history.md).

## Historical Release Notes

- Historical release chronology is preserved in [`docs/archive/2026-08-retired/current-state-release-history.md`](archive/2026-08-retired/current-state-release-history.md).
- The archive is reference-only and is not part of routine current-state context.
- This file is the operating summary; the archive is the detailed chronology.
- Keep new operational facts here only when they are confirmed by current documentation.
