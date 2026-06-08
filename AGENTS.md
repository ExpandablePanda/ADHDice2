<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Local Agent Rules

Prioritize conserving usage and keeping context small.
Optimize for safe work, low regression risk, clean organization, and design consistency by default so the user does not need to remember to request those guardrails explicitly.

## Exploration
- Minimize token usage.
- Prefer quick edits when the request appears small and localized.
- Start with the smallest relevant file section before expanding scope.
- Inspect only the minimum necessary files.
- Do not scan the whole repository unless truly necessary.
- Do not read multiple large files unless necessary.
- Prefer targeted `rg` searches and short `sed` ranges over broad exploration.
- Keep intermediate reasoning compact.
- If a likely quick fix may be wrong without surrounding context, try the smallest reasonable change first and expand only if needed.
- Before doing work that is likely to consume a lot of tokens, summarize the reason and ask for approval first.

## Skills
- Do not use skills unless the user explicitly asks or the task clearly matches the skill description.
- Before using a skill, suggest it briefly and ask for approval if using it will add significant context or token cost.

## Documentation
- Treat `docs/INDEX.md` as the documentation map for this repo.
- Treat files listed there as either canonical, active working, tooling/generated, archived, or pointer-only according to their declared role.
- Use canonical docs for current implemented truth.
- Use active working docs for product direction and future-facing planning.
- Do not treat `docs/archive/` as current project context unless the user explicitly asks.
- Do not treat generated skill docs under `Skills/generated-skill-library/` as product truth.

## Editing
- Before editing, state the file(s) you plan to inspect or modify.
- For small edits, do not refactor unrelated code.
- For styling or copy changes, modify no more than 1-2 files unless absolutely necessary.
- Prefer preserving surrounding behavior over making broad “cleanups” during the same pass.
- When changing shared state, routing, data loading, or reusable UI, look for nearby dependent code paths before editing so a local fix does not quietly break another surface.
- For larger changes, prefer extracting or isolating code into clearly named files/modules instead of growing monolithic files further.
- Keep folder structure organized by responsibility. Prefer app-specific surfaces under app-specific folders, shared reusable UI under shared UI folders, hooks in hooks folders, and pure logic in lib folders.
- Avoid introducing duplicate helpers, duplicate constants, or copy-pasted logic when an existing local utility already covers the need.
- If the codebase already has a pattern, component style, naming scheme, or module boundary for the thing being edited, follow it unless there is a strong reason not to.

## Execution
- Do not run dev servers, builds, package installs, or full test suites unless asked.
- Do not open a local build or inspect the site in-browser unless the user explicitly asks for it. For this project, avoid using in-app browser/site inspection as a default verification step because it is token-heavy and the sandbox/browser path is unreliable.

## Verification
- After code changes, run `npm run lint` when the project provides a lint script, unless the user explicitly says not to.
- After code changes, run `npm run typecheck` when the project provides a typecheck script and the change touches TypeScript, shared logic, imports/exports, hooks, state, or multi-file code paths.
- Check `package.json` scripts before naming or running verification commands, and choose the smallest relevant available verification step for the change.
- For small localized UI or copy edits, lint plus source-level sanity checks may be enough.
- For logic changes, hooks, data loading, state management, reusable components, or multi-file refactors, run the relevant lightweight tests when available, such as `npm test`, and include `npm run typecheck` when TypeScript coverage matters.
- For structural changes that may affect compilation, imports/exports, routing, rendering boundaries, or framework behavior, run `npm run build` when the user has not asked to avoid heavier verification.
- If lint fails, fix issues that are directly related to the files changed in the current task and report any remaining unrelated lint findings clearly.
- In the final response, explicitly say what verification was run, what failed, and what was intentionally not run.
- If lint is unavailable or too expensive for a tiny source-only change, say that clearly in the final response.

## Architecture
- Prefer incremental refactors over rewrites. Stabilize first, then extract, then simplify.
- When a file is large or tangled, reduce future spaghetti by extracting coherent surfaces, helper modules, or shared controls into dedicated files with narrow responsibilities.
- Keep feature logic, presentation logic, and persistence logic from collapsing into the same place when a cleaner local boundary is available.
- When adding a new feature or menu, place it where a future developer would naturally look for it first.

## Design
- Keep new UI in the spirit of the existing product: calm, cohesive, professional, and streamlined.
- Reuse existing spacing, typography, radii, button styles, menu patterns, icon usage, and interaction patterns before inventing new ones.
- Avoid random one-off styling decisions that make the product feel inconsistent.
- Prefer clear visual hierarchy, restrained type scale, and tidy alignment over decorative or novelty-heavy UI.
- When editing or adding menus, modals, panels, and controls, make them feel like part of the same design system rather than isolated inventions.
- If the repo already has a design language for chips, cards, toggles, list controls, or headers, continue that language consistently.
- When the user says a UI element should "match" another visible element, treat the target as visual/render-pattern matching, not just CSS-token matching.
- Before editing a visual match request, identify the exact render path for the current element, the exact render path for the target element that already looks correct, the actual visible text element type (`button`, `span`, `p`, `input`, etc.), the inner text element/class pattern, and any wrapper, layout, padding, line-height, focus, or browser-control differences.
- If the target element already looks correct, prefer reusing its exact inner markup/class pattern instead of approximating the same typography with separate classes.
- Example: if step title text renders as `<p className="...">New step</p>` and a parent task title should match it, make the parent title button act as a neutral click wrapper and render the visible title inside the same kind of inner `<p>` with the same class pattern.
- After one failed styling pass, stop adjusting typography tokens and compare the exact rendered structure of the current element versus the target element before editing again.
- For new chips, pills, and text-labeled controls, consult `docs/ui-design-system.md` first and default to the task-table chip scale unless the feature has a documented reason to diverge.
- If a control has visible text, default to a clickable chip using the shared task-table primitives in `src/components/ui/task-table-primitives.tsx` instead of introducing a conventional text button.
- Treat non-chip text buttons as exception-only and use them only when the UI truly needs a larger documented action treatment.
- Use `npm run audit:text-buttons` as the repo-level drift check for text-labeled `<button>` elements that have not been converted to approved chip patterns.

## Next.js
- This repo uses Next `16.2.4`. Do not assume older Next.js behavior is correct.
- Consult `node_modules/next/dist/docs/` when touching Next-specific behavior such as routing, server/client boundaries, rendering behavior, config, metadata, asset handling, or framework APIs.
- For small component-only edits that do not touch Next-specific behavior, do not expand scope by reading framework docs unnecessarily.

## Local Browser Access
- Treat `localhost`, `127.0.0.1`, `::1`, LAN IPs like `192.168.x.x`, and VPN/private-network dev URLs as potentially unreachable from Browser Use navigation, even if the in-app browser UI can show them.
- For this project, if the user confirms the LAN URL is working in the in-app browser, prefer `http://192.168.4.109:3000` as the known-good local preview URL.
- If the user already has the local app open in the in-app browser, attach to the current selected tab and continue from there.
- Do not repeatedly retry local URL navigation after one failed agent-side attempt.
- After one failed agent-side navigation attempt, ask the user to open the local URL manually in the in-app browser, then continue from the current tab without trying to re-navigate.
- Prefer using the current in-app browser tab over opening a new tab for local development work.
- Do not treat switching from `localhost` to a LAN or VPN IP as a reliable fix; try at most one alternate local-network URL before falling back to the user-opened tab workflow.
- If the user needs in-app browser annotation or review and local URLs are still blocked, create a temporary public tunnel to the local dev server and use that URL in the in-app browser instead of continuing to retry local navigation.
- Prefer an HTTPS tunnel URL when one is available.
- Browser skill/docs may claim local URLs are supported, but if agent-side navigation fails on both `localhost` and LAN IPs, assume Browser Use runtime session policy or network isolation is the problem rather than the app itself.
- Do not patch the bundled browser plugin cache under `.codex/plugins/cache/...` as a permanent fix; those files are runtime artifacts and may be overwritten.
- When asking Codex to inspect the local app in the in-app browser, open the app yourself first if agent-side navigation fails, then ask Codex to continue from the current tab.

## Workflow Discipline

- One implementation prompt should target one bug, one feature slice, one UI component family, or one performance bottleneck.
- Do not combine product design, debugging, refactoring, styling, and performance work in one prompt unless explicitly approved.
- For risky work, first inspect and return a plan. Do not edit until approved.
- If two attempted fixes do not solve the same issue, stop patching and switch to diagnosis-only mode.
- For performance complaints, identify the slow layer before refactoring.
- Always confirm the active render path before claiming a UI fix is complete.
- After each completed implementation prompt, bump the visible app version and return numbered manual checks.
- Do not create new documentation files unless explicitly asked.
- Do not add long historical thread summaries to active repo docs.
