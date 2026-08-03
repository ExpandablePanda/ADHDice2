# Documentation Index

Last reviewed: 2026-08-03

This file is the documentation map for the ADHDice repo. Use it to decide which markdown files are current source of truth, which are working context, and which are supporting or historical only.

## How to use this map

- Read `README.md` for setup and a high-level overview.
- Read `AGENTS.md` for repo-specific agent operating rules.
- Read `docs/AGENT_WORKFLOW.md` for the ADHDice development workflow and role boundaries.
- Read `docs/VERIFICATION.md` for verification classes and reporting requirements.
- Use canonical docs for current implemented behavior, design standards, architecture boundaries, and verification rules.
- Use active working docs for roadmap direction, product scope, and future-facing planning.
- Load `docs/WORKSPACE_LOADING_ARCHITECTURE.md` only for a loading, readiness, History-loading, Realtime-refresh, or caching-ownership ticket; it is a qualified source diagnostic, not canonical runtime proof.
- Do not treat tooling/generated docs or archived docs as current product truth by default.
- Treat `CLAUDE.md` as a pointer-only file that defers to `AGENTS.md`.

## Canonical docs

- `README.md` - Setup and high-level repo overview.
- `AGENTS.md` - Durable agent operating rules for this repo.
- `docs/AGENT_WORKFLOW.md` - Canonical ADHDice development workflow, roles, work modes, and prompt shape.
- `docs/VERIFICATION.md` - Canonical verification standard for production-path evidence and reporting.
- `docs/UI_SYSTEM.md` - Canonical ADHDice visual, interaction, and reuse rules.
- `docs/UI_SOURCE_MAP.md` - Canonical implementation lookup for approved, deferred, and off-model UI surfaces.
- `docs/TASKAPP_ARCHITECTURE.md` - Canonical TaskApp production routing, ownership, and change-boundary contract.
- `docs/TASKAPP_SOURCE_MAP.md` - Current TaskApp source and symbol lookup; implementation locations may change.
- `docs/TASK_STATE_ENGINE.md` - Canonical active Task State Engine authority for state evaluation, status/action routing, recurrence, rollover, Calendar projection, rewards eligibility, and persistence projection.

## Qualified diagnostics

- `docs/WORKSPACE_LOADING_ARCHITECTURE.md` - Qualified source diagnostic for workspace hydration, readiness, History loading, Realtime refresh, and caching ownership; not canonical runtime proof.

## Active working docs

- `docs/ADHDICE_BUILD_BRIEF.md` - Active product-direction brief and target feature map.
- `docs/CURRENT_STATE.md` - Current stabilization state, known bugs, fragile areas, performance watchpoints, and next priorities.
- `docs/daily-until-complete-plan.md` - Active product rules and phased rollout plan for the Daily Until Complete repeat option and permanent Complete status.
- `docs/qa/` - Focused active browser QA checklists. Load `CORE_SMOKE.md` plus only the subsystem checklist relevant to the ticket: `TASKS.md`, `TASK_HIERARCHY.md`, `STEP_MIGRATION.md`, `REWARDS_ROLL.md`, `FOCUS.md`, `HEALTH.md`, `NOTES_STATS_SETTINGS.md`, or `DEPLOY.md`.
- `docs/task-hierarchy-plan.md` - Active decision record and rollout plan for same-table child-task hierarchy and legacy subtask bridge work.

## Tooling/generated docs

- `CLAUDE.md` - Pointer-only file that redirects readers to `AGENTS.md`.
- `Skills/generated-skill-library/**/SKILL.md` - Generated auxiliary skill docs for agent/tooling use. These are not product or app source of truth.

## Archived docs

Archived docs live under `docs/archive/`.

- Archived markdown is historical reference only.
- Do not use archived docs as default current context unless the user explicitly asks.
- [`docs/archive/2026-08-retired/current-state-release-history.md`](archive/2026-08-retired/current-state-release-history.md) - Preserved release chronology and retired Current State notes; historical reference only, not current product authority.
- [`docs/archive/2026-08-retired/manual-qa-checklist.md`](archive/2026-08-retired/manual-qa-checklist.md) - Former combined manual QA checklist preserved for historical reference; do not load as the default current QA source.
- [`docs/archive/2026-08-retired/FRONTEND_UI_RULES.md`](archive/2026-08-retired/FRONTEND_UI_RULES.md) - Retired UI rules preserved for historical reference; use `UI_SYSTEM.md` and `UI_SOURCE_MAP.md` instead.
- [`docs/archive/2026-08-retired/ui-design-system.md`](archive/2026-08-retired/ui-design-system.md) - Retired chip and text-control reference preserved for historical reference; use `UI_SYSTEM.md` and `UI_SOURCE_MAP.md` instead.
- [`docs/archive/2026-08-retired/taskapp-behavior-contract.md`](archive/2026-08-retired/taskapp-behavior-contract.md) - Retired TaskApp behavior contract; historical reference only. Use `TASKAPP_ARCHITECTURE.md` and `TASKAPP_SOURCE_MAP.md` instead.
- [`docs/archive/2026-08-retired/taskapp-orchestrator-contract.md`](archive/2026-08-retired/taskapp-orchestrator-contract.md) - Retired TaskApp orchestration addendum; historical reference only. Use `TASKAPP_ARCHITECTURE.md` and `TASKAPP_SOURCE_MAP.md` instead.
- [`docs/archive/2026-08-retired/TASK_STATE_ENGINE.md`](archive/2026-08-retired/TASK_STATE_ENGINE.md) - Preserved earlier release-specific Task State Engine authority; historical reference only. Use `TASK_STATE_ENGINE.md` instead.
- [`docs/archive/2026-08-retired/WORKSPACE_LOADING_ARCHITECTURE.md`](archive/2026-08-retired/WORKSPACE_LOADING_ARCHITECTURE.md) - Preserved earlier release-specific workspace-loading diagnostic; historical reference only. Use `WORKSPACE_LOADING_ARCHITECTURE.md` for qualified current source observations.
- When a doc is retired, move it into `docs/archive/YYYY-MM-retired/` and add a short retirement note explaining what replaced it.
