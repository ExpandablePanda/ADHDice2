# Workspace Loading Architecture

Last reviewed: 2026-09-23
Role: qualified source diagnostic; transitional loading implementation and
Phase 1E migration contract

## Purpose and evidence boundary

`useWorkspaceData` owns authenticated workspace hydration, current-projection
readiness, historical-read loading, cache ownership, and refresh coordination.
This document records the inspected source seams and the transition from the
old full-History current-read path to the Phase 1E current-projection contract.
The source contract does not claim frontend, Edge, SQL, browser, Realtime, or
live Supabase deployment parity. The canonical target is
[Phase 1E](architecture/task-state-phase-1e-current-task-read-projection-contract.md);
this qualified diagnostic must not be read as a second authority.

## Required startup boundary

The Phase 1E startup target requires canonical Task/entity rows, valid current
projections, profile/logical-day context, and each independently required domain.
It does not require a workspace-wide canonical History snapshot for current
Active Status, current due, current streaks, or Task readiness.

The current source still starts a full canonical History synchronization as
secondary work. That path is transitional: it remains available for historical
consumers, parity, migration, and explicit repair, but it is no longer a target
current-read authority and must not gain new current-surface dependencies.

Current-projection readiness and historical History readiness are separate. A
History load that is pending or failed does not make a valid current projection
invalid. A missing, stale, or invalid current projection produces an
entity-scoped unavailable/repair state; it does not authorize a full-workspace
History load or a raw Task-status fallback.

After cutover, TaskApp rollover uses valid current projections and targeted
temporal/canonical reconciliation. It is not gated on full History readiness.

Opening History is a lazy historical read. It may request selected dates or a
bounded range and may request a full entity read for explicit repair, but it
does not become more authoritative for current Task state because it loaded
older rows.

## Implemented source seams

The current source and target boundary are intentionally shown separately.

**Transitional source path**

- `useWorkspaceData.loadTaskHistory` already performs a paged workspace-wide
  load and stores full rows.
- The former bounded `loadCriticalTaskHistoryFacts`,
  `src/lib/workspace-critical-task-facts.ts`, and
  `selectCriticalTaskHistoryFacts` path have no production caller and were
  removed. They remain retired and are not an alternate History authority.
- `loadTaskHistoryForTask` and modal task caches may remain as presentation and
  retry mechanics, but they must read/refresh the same canonical authority and
  must not become a current projection or private truth.
- While this transitional source path remains, rollover History reads,
  streak-summary fallback reads, Realtime refreshes, and History mutation
  callbacks update the shared canonical snapshot or an explicitly consistent
  replacement. They must not create a second partial authority. The Phase 1E
  target replaces this broad current-read dependency with entity-scoped
  projection reconciliation.

The current History sync path uses `task-history-sync-v1`, the user-wide sync
watermark/epoch, revision-fenced deltas, and IndexedDB snapshot validation.
These are canonical-fact transport and cache mechanisms, not current
projection validity proof.

**Phase 1E target path**

- `useWorkspaceData` reads valid current projections for ordinary Task surfaces
  and tracks projection readiness separately from historical readiness.
- A Task/History/policy/time event invalidates and reconciles the affected
  entity. A list or Folder event refreshes only that domain.
- The canonical command result updates the current projection in the same
  trusted persistence boundary as canonical facts. Explicit repair may update
  only projection state and diagnostics.
- Historical snapshots remain available to the History modal, reports, parity,
  migration, and entity-scoped rebuilds. No normal Task read requires the full
  snapshot.

The canonical source is `adhdice_task_history_facts`. The retired
`adhdice_task_history` and duration-evidence tables are not current runtime
read or write paths.

## Readiness, failure, and cache ownership

Workspace visibility is satisfied by the critical Task/entity, valid current
projection, schedule-frontier, and profile inputs. Historical readiness is
tracked separately and becomes true only after its requested read succeeds. A
historical query failure must not be coerced to `[]`, because a History modal,
report, or repair path could then present incomplete evidence as complete.

The current-projection cache and historical cache must be user- and
workspace-generation scoped. A stale request cannot apply to a newer user or
workspace generation. Projection reads require the Phase 1E source fences;
History cache metadata requires the existing protocol/epoch/revision checks.
Realtime and successful mutations reconcile the affected entity/domain rather
than replacing the entire workspace by default.

Other domains remain consumer-scoped: Focus History, notes, timer detail, and
page-specific data need not become unconditional startup loads. Task History
is also consumer-scoped after Phase 1E cutover; its full snapshot is no longer
a direct normal-startup input to the current Task projection.

## Non-claims

This document does not claim that browser startup is fast or that deployed
Edge/RPC behavior matches source. The current source has not implemented the
Phase 1E projection cutover. This ticket does not propose a runtime repository,
SQL migration, generated type, or performance budget; those require separate
approved implementation tickets.

## Related documents

- [`TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) — History, Calendar, Active
  Status, recurrence, Missed, and streak authority.
- [`TASKAPP_ARCHITECTURE.md`](TASKAPP_ARCHITECTURE.md) — TaskApp ownership and
  current-projection routing.
- [`architecture/task-state-phase-1e-current-task-read-projection-contract.md`](architecture/task-state-phase-1e-current-task-read-projection-contract.md)
  — canonical current projection, freshness, invalidation, repair, and
  migration contract.
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — current closure state and verification boundaries.
- [`VERIFICATION.md`](VERIFICATION.md) — validation boundaries.
