# TaskApp Refactor Quality-Check Protocol

Last reviewed: 2026-06-04

Use this protocol during extraction waves to avoid long abandoned verification loops.

## Wave Gate (Required per wave)

1. Run targeted lint on changed files.
2. Run scope-limited type sanity checks.
3. Run focused tests for touched modules.

For the 5.0 stabilization path, user-approved verification is intentionally narrower: do not run lint, production builds, dev servers, browser tests, or any check likely to hang. Use `git diff --check` and focused Node tests such as `npm run test:taskapp-wave`, stopping checks that approach 90 seconds.

If full-suite checks are too slow at this stage, continue with wave gates and retry full checks at milestone boundaries.

## Milestone Gate (After major boundary completion)

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`

Triage failures into:
- regressions introduced in current wave (fix immediately),
- pre-existing unrelated failures (document and isolate).

## Final Release Gate

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `npm run dev` boot check
6. Manual smoke across pages (`Home`, `Tasks`, `Focus`, `Roll`, `Stats`, `Notes`, `Settings`, `Games`)
7. Explicit checks:
   - Supabase online/offline fallback behavior
   - old localStorage snapshot migration
   - list semantics and routing (`urgent`, `important`, `focus`)
