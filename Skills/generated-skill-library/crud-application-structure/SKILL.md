---
name: crud-application-structure
description: Use this skill when performing CRUD application architecture, resource workflows, data management screens, and create-read-update-delete product structure.
---

# Goal
Organize CRUD applications so data models, screens, forms, and backend operations remain clear as the app grows.

# Instructions
1. Identify the core resources, relationships, and lifecycle actions before structuring routes or screens.
2. Design consistent patterns for list, detail, create, edit, archive, and delete flows.
3. Align the frontend and backend around predictable resource naming, actions, and response contracts.
4. Support empty states, permissions, optimistic or pessimistic updates, and destructive-action safeguards intentionally.
5. Review the overall structure for duplication, navigability, and how easily new resources can follow the same pattern.

# Input
A request to build or refactor a CRUD app, resource management flow, admin area, or record-based application structure.

# Output
Application structure, routes, screens, handlers, and patterns that support CRUD features consistently.

# Best Practices
- Use repeatable conventions so each resource does not reinvent the app structure.
- Make destructive actions confirmable, reversible, or auditable when appropriate.
- Design for real data states including empty, stale, locked, or partially loaded records.
- Keep the resource model simple enough for teams to extend confidently.
