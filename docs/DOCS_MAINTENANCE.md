# Documentation Maintenance

Last reviewed: 2026-08-03

This repo keeps markdown lightweight on purpose. Every markdown file must have one clear job so future sessions can load the right context quickly.

## Allowed roles

- `canonical` - Current source of truth for implemented behavior, design standards, architecture boundaries, or verification rules.
- `active working` - Live product direction, scope, or future-facing implementation planning.
- `tooling/generated` - Useful for agent capabilities or repo tooling, but not product truth.
- `active lookup` - Current implementation lookup for a canonical subsystem; locations may change.
- `qualified source diagnostic` - Source-backed observations with explicit inference and runtime-evidence limits; not canonical runtime proof.
- `archived` - Historical reference only and not part of default current context.
- `pointer-only` - A file that exists only to redirect readers to another source of truth.

## Maintenance rules

- Every markdown file must have exactly one role.
- Add new project docs to `docs/INDEX.md`.
- Keep canonical docs concise and current.
- Keep active working docs focused on present direction, open work, and next actions rather than long historical logs.
- Treat archived docs as historical only.
- When retiring a doc, move it to `docs/archive/YYYY-MM-retired/`.
- Add a retirement note at the top of archived docs that says why the file was retired, what replaced it, and whether any information was preserved elsewhere.
- Group numerous generated or tooling docs in `docs/INDEX.md` instead of listing them one by one when they share the same role.
- Do not treat generated skill docs as product truth.

## Current role map

- `README.md` - `canonical`; concise project entry point, local setup, environment, and deployment-evidence boundaries.
- `AGENTS.md` - `canonical`
- `CLAUDE.md` - `pointer-only`
- `docs/ADHDICE_BUILD_BRIEF.md` - `active working`; high-level product direction and roadmap context, not implementation authority.
- `docs/CURRENT_STATE.md` - `active working`
- `docs/qa/*.md` - `active working`; focused subsystem browser QA checklists selected by ticket scope.
- `docs/archive/2026-08-retired/manual-qa-checklist.md` - `archived`; former combined QA checklist preserved as historical reference.
- `docs/TASKAPP_ARCHITECTURE.md` - `canonical`; current TaskApp production routing, ownership, and change-boundary authority.
- `docs/TASKAPP_SOURCE_MAP.md` - `active lookup`; current TaskApp implementation locations and symbols.
- `docs/task-hierarchy-plan.md` - `active working`; current hierarchy product decisions and unresolved movement/migration boundaries.
- `docs/daily-until-complete-plan.md` - `active working`; current Daily Until Complete and permanent-Complete rules plus unresolved product decisions.
- `docs/TASK_STATE_ENGINE.md` - `canonical`; current Task State Engine authority for state evaluation, status/action routing, recurrence, rollover, Calendar, reward eligibility, and persistence projection.
- `docs/WORKSPACE_LOADING_ARCHITECTURE.md` - `qualified source diagnostic`; source-backed workspace hydration, readiness, History loading, Realtime refresh, and caching observations.
- `docs/AGENT_WORKFLOW.md` - `canonical`
- `docs/VERIFICATION.md` - `canonical`
- `docs/UI_SYSTEM.md` - `canonical`; active ADHDice visual and interaction authority.
- `docs/UI_SOURCE_MAP.md` - `canonical`; active implementation lookup for UI sources and migration status.
- `docs/archive/2026-08-retired/FRONTEND_UI_RULES.md` - `archived`; historical UI rules replaced by `docs/UI_SYSTEM.md` and `docs/UI_SOURCE_MAP.md`.
- `docs/archive/2026-08-retired/ui-design-system.md` - `archived`; historical chip and text-control guidance replaced by `docs/UI_SYSTEM.md`.
- `docs/archive/2026-08-retired/taskapp-behavior-contract.md` - `archived`; historical TaskApp behavior contract replaced by `docs/TASKAPP_ARCHITECTURE.md` and `docs/TASKAPP_SOURCE_MAP.md`.
- `docs/archive/2026-08-retired/taskapp-orchestrator-contract.md` - `archived`; historical TaskApp orchestration addendum replaced by `docs/TASKAPP_ARCHITECTURE.md` and `docs/TASKAPP_SOURCE_MAP.md`.
- `docs/archive/2026-08-retired/task-hierarchy-plan.md` - `archived`; earlier hierarchy rollout and implementation history replaced by `docs/task-hierarchy-plan.md`.
- `docs/archive/2026-08-retired/daily-until-complete-plan.md` - `archived`; earlier recurrence and Complete rollout history replaced by `docs/daily-until-complete-plan.md`.
- `docs/archive/2026-08-retired/google-deployment-setup.md` - `archived`; historical and unverified Google setup material; no current deployment authority.
- `docs/archive/2026-08-retired/TASK_STATE_ENGINE.md` - `archived`; earlier release-specific engine authority preserved by `docs/TASK_STATE_ENGINE.md`.
- `docs/archive/2026-08-retired/WORKSPACE_LOADING_ARCHITECTURE.md` - `archived`; earlier release-specific loading diagnostic preserved by `docs/WORKSPACE_LOADING_ARCHITECTURE.md`.
- `Skills/generated-skill-library/**/SKILL.md` - `tooling/generated`

## Freshness policy

- Review `README.md` when setup commands, required environment, current version, or deployment entry points change.
- Review `docs/ADHDICE_BUILD_BRIEF.md` when high-level product scope or vision changes.
- Review `docs/task-hierarchy-plan.md` when hierarchy product rules or movement/archive semantics change.
- Review `docs/daily-until-complete-plan.md` when recurrence or completion rules change.
- Review `docs/TASK_STATE_ENGINE.md` when status, action, History, recurrence, rollover, Calendar, reward eligibility, or persistence projection changes.
- Review `docs/WORKSPACE_LOADING_ARCHITECTURE.md` when startup loading, readiness, History loading, Realtime refresh, or caching ownership changes.
- Archived originals remain historical reference only and must not be promoted to current authority without a new review.

## Cross-reference notes

- `AGENTS.md` carries the standing Codex workflow rules, including versioning policy.
- `docs/CURRENT_STATE.md` carries the live app version, release group, and roadmap.

## Archive policy

- `docs/archive/` exists as the home for retired documentation.
- Keep retired originals beneath a dated retirement directory with a note linking to their replacement.
- Do not delete old docs permanently during cleanup passes unless the user explicitly asks for deletion.
