---
name: full-stack-feature-development
description: Use this skill when performing full-stack feature development that spans frontend UI, backend logic, data flow, and end-to-end user behavior.
---

# Goal
Ship cohesive features across the stack so the user experience, server behavior, and data model all move together coherently.

# Instructions
1. Trace the feature from user intent to UI states, network requests, backend rules, persistence, and side effects.
2. Define the contracts between layers before implementing so payloads, validation, and states stay aligned.
3. Build the smallest end-to-end slice first, then expand edge cases and polish once the path works.
4. Handle loading, success, empty, and error states across both client and server behavior.
5. Review the completed feature for consistency, rollback safety, and integration with existing architecture.

# Input
A request to implement a new feature or change that touches both frontend and backend behavior.

# Output
Coordinated frontend, backend, and data-layer code that delivers a complete product feature.

# Best Practices
- Favor vertical slices over disconnected layer-by-layer rewrites.
- Keep API contracts and UI assumptions synchronized.
- Add targeted verification around the core user journey.
- Preserve security, authorization, and validation at each boundary.
