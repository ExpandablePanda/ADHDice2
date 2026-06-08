# Current State

Last reviewed: 2026-06-07

Role: active working

## Current App Version
- Current visible app/package version: the visible UI badge and `package.json` are aligned at `5.0.6`.
- Where version is displayed/updated: displayed in the top-level `TaskApp` header badge; package version is updated in `package.json`.

## Current Product Shape
Brief summary of current major surfaces:
- Tasks: primary dashboard with `list`, `grid`, `cards`, and `matrix` views, shared task data, filters, routing buckets, history, and reward-aware task flows.
- Focus: focus categories, timers, active sessions, history, and focus-day task selection.
- Roll: live reward/economy surface with boards, prize baskets, free-roll banking, point spending, and history.
- Achievements: dice-face unlock tracking, set progress, and celebration overlays.
- Health: check-ins, meals, weight logging, imported metrics, Apple Health import flow, and care-oriented achievements.
- Notes: note CRUD and task linking.
- Stats: task, focus, and economy aggregates from current workspace state.
- Settings: profile and app-level configuration, including theme, calm-mode preferences, and economy reset.
- Test: isolated sandbox for prototypes that should not silently affect production pages.

## Current Stabilization Priorities
1. Continue safe `TaskApp` extraction without behavior drift.
2. Protect task list semantics and routing invariants (`urgent`, `important`, `focus`, built-in buckets).
3. Keep Tasks, Focus, Roll, Health, and Achievements visually and behaviorally cohesive.
4. Preserve Supabase fallback, legacy snapshot migration, and realtime workspace loading behavior.
5. Resolve current version/documentation drift and keep active-working docs aligned with implemented truth.

## Known Bugs / Regressions To Watch
- Visible version drift: the header badge and `package.json` are currently out of sync.
- Large refactor risk remains around `TaskApp` extraction boundaries and page wiring.
- Test-page experiments must stay isolated; accidental promotion into live Tasks remains a regression risk.
- Realtime/sync and legacy fallback behavior should be treated as sensitive whenever workspace loading code moves.

## Known Performance Bottlenecks
- Task list switching: still a watch area because live task-table rendering and bucket selection remain sensitive.
- Search typing: still a watch area in large task views because Tasks is routed through a large orchestrator plus derived table state.
- Edit overlay typing: still a watch area when modal/editor state touches shared task data and cross-surface callbacks.
- Row delete/trash behavior: still a watch area around table mutation, reward flow side effects, and rerender cost.
- App startup/loading: still sensitive because auth/config/workspace loading and route orchestration remain concentrated in `TaskApp`.

## Fragile / High-Risk Areas
- `src/components/task-app.tsx`
- `src/components/ui/task-management-table-v2.tsx`
- task list / smart list evaluator
- task reward/economy flow
- Supabase workspace loading/realtime sync

## Areas Not To Touch Casually
- Auth/session flow
- Supabase schema/fallback handling
- Task routing/list semantics
- Reward/economy accounting
- Shared chip/button primitives
- TaskApp orchestration boundaries

## Next Recommended Work
- Align the visible header version badge with `package.json` and keep the bump path explicit.
- Continue extracting pure logic and standalone UI out of `src/components/task-app.tsx` without changing routing or persistence semantics.
- Audit high-traffic task-table interactions for rerender pressure during list switching, search, delete, and edit flows.
- Keep shared chip/button language consistent across remaining surfaces and avoid one-off text-button drift.
- Refresh active-working docs whenever implemented truth changes, especially around TaskApp boundaries and stabilization status.
