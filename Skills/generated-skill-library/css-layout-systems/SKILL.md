---
name: css-layout-systems
description: Use this skill when performing CSS layout work with Flexbox, Grid, spacing systems, alignment, and complex responsive composition.
---

# Goal
Build robust CSS layouts that are predictable, responsive, and easy to extend without resorting to fragile positioning hacks.

# Instructions
1. Decide whether the problem is one-dimensional or two-dimensional before choosing Flexbox or Grid.
2. Define the parent layout contract first: flow, gap, alignment, track sizing, wrapping, and overflow behavior.
3. Use spacing, alignment, and intrinsic sizing deliberately instead of patching layouts with arbitrary margins or magic numbers.
4. Account for small screens, large screens, and awkward content lengths while building the layout rules.
5. Test the result against edge cases such as long labels, empty states, and unequal content blocks.

# Input
A request involving page sections, card grids, navigation bars, dashboards, split panes, or any layout alignment problem.

# Output
CSS or component styles that use Flexbox, Grid, and spacing tokens to create stable layouts.

# Best Practices
- Prefer `gap` over manual sibling margins for consistent spacing.
- Use `minmax()`, `auto-fit`, and intrinsic sizing to reduce breakpoint sprawl.
- Avoid absolute positioning for core layout unless the design truly requires layering.
- Keep layout logic composable so later content changes do not break the structure.
