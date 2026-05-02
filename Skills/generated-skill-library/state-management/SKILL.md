---
name: state-management
description: Use this skill when performing frontend or full-stack state management, shared UI state design, async data flow coordination, and store architecture work.
---

# Goal
Model application state so data flow stays understandable, updates remain predictable, and UI behavior scales without confusion.

# Instructions
1. Classify state first: server state, local UI state, derived state, form state, or cross-cutting app state.
2. Keep state as close to where it is used as practical, then elevate only when multiple consumers truly need it.
3. Choose the lightest state-management pattern that fits the complexity and existing project conventions.
4. Define loading, stale, optimistic, and error transitions clearly for async state.
5. Review for duplicated sources of truth, unnecessary synchronization, and hard-to-debug update chains.

# Input
A request to manage shared state, refactor stores, coordinate async UI, or reduce data-flow complexity.

# Output
State models, store code, hooks, reducers, or data-flow structure that make application behavior predictable.

# Best Practices
- Avoid global state for data that can remain local.
- Keep a single source of truth for each piece of meaningful state.
- Separate derived values from writable state to reduce bugs.
- Use established libraries only when the problem size justifies them.
