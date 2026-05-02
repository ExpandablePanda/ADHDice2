---
name: component-based-ui-development
description: Use this skill when performing component-based UI architecture, reusable interface building, props design, composition patterns, and shared component implementation.
---

# Goal
Build reusable UI components with clear responsibilities, clean APIs, and styling patterns that scale across a product.

# Instructions
1. Define the component's single responsibility, public API, states, and composition boundaries before coding.
2. Separate presentational concerns, interaction logic, and data dependencies so the component stays reusable.
3. Design props and slots or children around real usage patterns rather than theoretical completeness.
4. Support important states explicitly: loading, empty, error, success, disabled, and interactive variants when relevant.
5. Review whether the component reduces duplication and improves consistency in the codebase.

# Input
A request to create, refactor, or expand reusable UI components or a component library.

# Output
Reusable component code, supporting styles, and clear interfaces for composing UI consistently.

# Best Practices
- Keep components small enough to reason about but large enough to remove meaningful duplication.
- Avoid prop explosions; prefer composition when variants become unwieldy.
- Preserve accessibility and testability across component states.
- Make defaults sensible so simple use cases stay simple.
