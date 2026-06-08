# Documentation Maintenance

Last reviewed: 2026-06-04

This repo keeps markdown lightweight on purpose. Every markdown file must have one clear job so future sessions can load the right context quickly.

## Allowed roles

- `canonical` - Current source of truth for implemented behavior, design standards, architecture boundaries, or verification rules.
- `active working` - Live product direction, scope, or future-facing implementation planning.
- `tooling/generated` - Useful for agent capabilities or repo tooling, but not product truth.
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

- `README.md` - `canonical`
- `AGENTS.md` - `canonical`
- `CLAUDE.md` - `pointer-only`
- `docs/ADHDICE_BUILD_BRIEF.md` - `active working`
- `docs/CURRENT_STATE.md` - `active working`
- `docs/MANUAL_QA_CHECKLIST.md` - `active working`
- `docs/taskapp-behavior-contract.md` - `canonical`
- `docs/taskapp-orchestrator-contract.md` - `canonical`
- `docs/taskapp-quality-check-protocol.md` - `canonical`
- `docs/ui-design-system.md` - `canonical`
- `Skills/generated-skill-library/**/SKILL.md` - `tooling/generated`

## Archive policy

- `docs/archive/` exists as the home for retired documentation.
- If no file is being retired yet, leave the archive directory empty aside from repository placeholders.
- Do not delete old docs permanently during cleanup passes unless the user explicitly asks for deletion.
