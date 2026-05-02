<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Local Agent Rules

Prioritize conserving usage and keeping context small.

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

## Editing
- Before editing, state the file(s) you plan to inspect or modify.
- For small edits, do not refactor unrelated code.
- For styling or copy changes, modify no more than 1-2 files unless absolutely necessary.

## Execution
- Do not run dev servers, builds, package installs, or full test suites unless asked.
