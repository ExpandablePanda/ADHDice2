# Documentation Index

Last reviewed: 2026-06-18

This file is the documentation map for the ADHDice repo. Use it to decide which markdown files are current source of truth, which are working context, and which are supporting or historical only.

## How to use this map

- Read `README.md` for setup and a high-level overview.
- Read `AGENTS.md` for repo-specific agent operating rules.
- Use canonical docs for current implemented behavior, design standards, architecture boundaries, and verification rules.
- Use active working docs for roadmap direction, product scope, and future-facing planning.
- Do not treat tooling/generated docs or archived docs as current product truth by default.
- Treat `CLAUDE.md` as a pointer-only file that defers to `AGENTS.md`.

## Canonical docs

- `README.md` - Setup and high-level repo overview.
- `AGENTS.md` - Durable agent operating rules for this repo.
- `docs/FRONTEND_UI_RULES.md` - Approved frontend reuse rules for chips, segmented toggles, and dropdown shells.
- `docs/UI_SOURCE_MAP.md` - Practical source map for approved, deferred, and off-model ADHDice UI surfaces.
- `docs/taskapp-behavior-contract.md` - Current TaskApp behavior contract.
- `docs/taskapp-orchestrator-contract.md` - Current TaskApp orchestration and extraction boundary contract.
- `docs/taskapp-quality-check-protocol.md` - Current TaskApp verification protocol.
- `docs/TASK_STATE_ENGINE.md` - Pure Task State Engine terminology, contracts, recurrence rules, and safety invariants.
- `docs/ui-design-system.md` - Current UI styling reference for chips, pills, and buttons.

## Active working docs

- `docs/ADHDICE_BUILD_BRIEF.md` - Active product-direction brief and target feature map.
- `docs/CURRENT_STATE.md` - Current stabilization state, known bugs, fragile areas, performance watchpoints, and next priorities.
- `docs/daily-until-complete-plan.md` - Active product rules and phased rollout plan for the Daily Until Complete repeat option and permanent Complete status.
- `docs/MANUAL_QA_CHECKLIST.md` - Repeatable manual browser smoke-test checklist for post-change QA and pre-deploy checks.
- `docs/task-hierarchy-plan.md` - Active decision record and rollout plan for same-table child-task hierarchy and legacy subtask bridge work.

## Tooling/generated docs

- `CLAUDE.md` - Pointer-only file that redirects readers to `AGENTS.md`.
- `Skills/generated-skill-library/**/SKILL.md` - Generated auxiliary skill docs for agent/tooling use. These are not product or app source of truth.

## Archived docs

Archived docs live under `docs/archive/`.

- Archived markdown is historical reference only.
- Do not use archived docs as default current context unless the user explicitly asks.
- When a doc is retired, move it into `docs/archive/YYYY-MM-retired/` and add a short retirement note explaining what replaced it.
