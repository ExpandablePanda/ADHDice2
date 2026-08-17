# Workspace Loading Architecture

Last reviewed: 2026-08-17
Role: qualified source diagnostic; converged Task loading contract

## Purpose and evidence boundary

`useWorkspaceData` owns authenticated workspace hydration, readiness, canonical
History loading, cache ownership, and refresh coordination. This document
records the required converged shape and the inspected source seams. It is not
proof of browser behavior, deployed infrastructure, live Supabase state,
Realtime delivery, or performance.

## Required startup boundary

The converged Task system requires a full canonical Task History load for all
Tasks during workspace startup, alongside canonical Task rows, schedule state,
hierarchy data, and profile facts needed by the workspace. “Full” means all
saved canonical History for the authenticated workspace, not only rows near the
current logical day, current due date, or active occurrence.

The full startup History snapshot is the input to the one Active Status result,
Calendar past-date projection, recurrence replay, streak derivation, counts,
filters, smart lists, and Task surfaces. A failed or incomplete canonical
History load is not a successful empty History result for occurrence-sensitive
work.

There is no semantic distinction between “bounded/critical startup History” and
“full modal History” in the converged Task system. Opening History must not load
a more authoritative truth, change current Task state, or alter a streak merely
because older saved rows became available. A modal may present the already
loaded snapshot and request an ordinary refresh after a mutation or explicit
retry.

## Source seams and required simplification

The current source contains both the desired full loader and transitional
bounded paths:

- `useWorkspaceData.loadTaskHistory` already performs a paged workspace-wide
  load and stores full rows.
- `loadCriticalTaskHistoryFacts`,
  `src/lib/workspace-critical-task-facts.ts`, and the
  `selectCriticalTaskHistoryFacts` path restrict startup inputs to selected
  dates. They must be removed or reduced to non-authoritative diagnostics once
  full startup History is the contract.
- `loadTaskHistoryForTask` and modal task caches may remain as presentation and
  retry mechanics, but they must read/refresh the same canonical authority and
  must not outrank or replace it with a private truth.
- Rollover History reads, streak-summary fallback reads, Realtime refreshes, and
  History mutation callbacks must update the shared canonical snapshot or an
  explicitly consistent replacement. They must not create a second partial
  authority.

The canonical source is `adhdice_task_history_facts` after runtime
canonicalization. Legacy `adhdice_task_history` may be read only as migration
or translation evidence while convergence is pending; it must not be silently
preferred for current state.

## Readiness, failure, and cache ownership

Workspace readiness is not satisfied until the canonical History snapshot is
ready or the workspace exposes a real error/retry state. A query failure must
not be coerced to `[]`, because that can make canonical-only actions disappear
and can cause a legacy fallback to decide current status.

The shared cache must be user- and workspace-generation scoped. A stale request
cannot apply to a newer user or workspace generation. Realtime and successful
mutations may replace or reconcile the canonical snapshot, preserving explicit
History rows and invalidating the one Active Status projection.

Other domains remain consumer-scoped: Focus History, notes, actual-time detail,
and page-specific data need not become unconditional startup loads. This rule
is specific to Task History because it is a direct input to the converged Task
projection.

## Non-claims

This document does not claim that the current source has completed the collapse,
that browser startup is fast, or that deployed Edge/RPC behavior matches source.
It does not propose a repository abstraction, durable cache layer, new table, or
performance budget. Any such change requires a separate approved ticket.

## Related documents

- [`TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) — History, Calendar, Active
  Status, recurrence, Missed, and streak authority.
- [`TASKAPP_ARCHITECTURE.md`](TASKAPP_ARCHITECTURE.md) — TaskApp ownership and
  projection routing.
- [`CURRENT_STATE.md`](CURRENT_STATE.md) — lock status and pending runtime work.
- [`VERIFICATION.md`](VERIFICATION.md) — validation boundaries.
