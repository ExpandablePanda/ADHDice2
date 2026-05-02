---
name: react-component-development
description: Use this skill when performing React component development, hooks-based UI logic, props and state design, and React-specific rendering behavior.
---

# Goal
Create production-grade React components that fit the existing architecture, manage state clearly, and render predictably.

# Instructions
1. Match the project's React patterns, file conventions, and state ownership model before adding new components.
2. Model component state carefully: derive what can be derived and keep local state minimal but explicit.
3. Use hooks for lifecycle, async work, and event behavior in a way that avoids stale state and unnecessary complexity.
4. Keep render output declarative, split subcomponents when it improves clarity, and handle loading or error states intentionally.
5. Review for rendering cost, prop clarity, and whether the component is easy to test and reuse.

# Input
A request to build or improve React components, hooks, interactive UI, or React page sections.

# Output
React components, hooks, and related styles or tests that behave correctly in the target app.

# Best Practices
- Prefer straightforward data flow over clever indirection.
- Respect the team's established approach to server state, client state, and side effects.
- Keep forms, async actions, and derived UI states explicit.
- Avoid premature memoization unless profiling or the codebase pattern justifies it.
