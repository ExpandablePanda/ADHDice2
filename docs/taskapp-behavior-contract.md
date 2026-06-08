# TaskApp Behavior Contract

Last reviewed: 2026-06-04

This document freezes current `TaskApp` behavior so refactors can be validated against a stable target.

## Pages

- `Home`: shows cockpit-style task momentum and quick actions without mutating task semantics.
- `Tasks`: supports `list`, `grid`, `cards`, and `matrix` views with shared task data, filters, and routing semantics.
- `Focus`: supports focus categories, active sessions, history, and focus-day task selection.
- `Health`: supports check-ins, meals, weight logging, imported metrics, Apple Health import flow, and care-oriented achievements.
- `Roll`: supports roll/economy gameplay, reward boards, free-roll banking, prize baskets, and history without changing task routing semantics.
- `Achievements`: supports dice-face unlock tracking, set progress, and celebration overlays.
- `Games`: lazy-loaded surface; failures stay isolated behind error boundaries.
- `Stats`: reflects task/focus/economy aggregates from current workspace state.
- `Notes`: supports note CRUD and task linking behavior.
- `Settings`: supports profile and app-level configuration, including theme, calm-mode preferences, and economy reset.
- `Test`: internal sandbox surface for isolated prototypes and experiments that should not silently change production pages.

## Core Modals and Flows

- Task create/edit modal preserves existing save semantics.
- Batch edit + batch delete preserve current selection and task update behavior.
- Focus planner modal preserves "save selection by day" behavior.
- Import flow preserves existing parse, create, and feedback behavior.
- Task history + momentum modals preserve existing read/write behavior.
- Actual-time entry modal preserves task time update behavior.
- Task reward flow preserves current eligibility checks, roll resolution, and recurring-task follow-up behavior.
- Health import flow preserves preview, save-progress, and user-feedback behavior.
- Achievement celebration overlays stay dismissible and isolated from the surrounding page state.

## State and Routing Invariants

- Priority/list semantics remain explicit: `urgent`, `important`, `focus`.
- Built-in bucket/list routing behavior stays stable (`inbox`, `today`, `focus`, `urgent`, `quick_wins`, `recurring`, `waiting`, `later`, `done`, `missed`).
- Persisted UI state (active page, task view, filters, layout, collapse/open states) must continue to migrate from legacy snapshots.
- Supabase-compatible fallback behavior remains intact for known legacy schema variants.
- Focus-day persistence continues to normalize and dedupe task IDs.
- HUD task timers and the focus-alarm countdown remain live without one-second state updates in the top-level `TaskApp`.
- Focus alarms continue to persist an absolute next-ring timestamp and re-arm after ringing or reload.
- Test-page experiments stay isolated unless they are intentionally promoted into production surfaces.

## Refactor Acceptance Checklist

- No user-facing regression in page behavior above.
- No regression in modal flows above.
- No regression in routing/list semantics (`urgent`, `important`, `focus`).
- No regression in persisted UI state restore/reset/migration.
- No regression in online vs fallback behavior for supported schema variants.
