---
name: tailwind-css-development
description: Use this skill when performing Tailwind CSS styling, utility composition, component extraction, theme token usage, and Tailwind-driven UI implementation.
---

# Goal
Implement polished interfaces with Tailwind CSS while keeping utility usage intentional, readable, and aligned with the project design language.

# Instructions
1. Inspect the existing Tailwind conventions before adding classes, plugins, or theme extensions.
2. Compose utilities around layout, spacing, color, typography, and states in a clear order that is easy to scan.
3. Extract repeated patterns into components, variants, or utility helpers instead of duplicating long class strings everywhere.
4. Use theme tokens and configuration values rather than ad hoc arbitrary values when the system already has a design language.
5. Check hover, focus, active, dark-mode, and responsive variants so the component behaves consistently across states.

# Input
A request to build or restyle components, pages, or layouts in a codebase that uses Tailwind CSS.

# Output
Tailwind-based markup or component code with maintainable utility classes and reusable patterns.

# Best Practices
- Keep class lists purposeful and extract repetition before it becomes noise.
- Prefer semantic component boundaries over giant template files full of one-off utilities.
- Preserve accessible color contrast, focus visibility, and responsive behavior.
- Avoid arbitrary values unless they are necessary to realize a specific design decision.
