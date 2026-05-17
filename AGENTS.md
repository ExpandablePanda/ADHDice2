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
- Do not open a local build or inspect the site in-browser unless the user explicitly asks for it. For this project, avoid using in-app browser/site inspection as a default verification step because it is token-heavy and the sandbox/browser path is unreliable.

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
