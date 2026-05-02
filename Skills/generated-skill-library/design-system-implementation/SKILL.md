---
name: design-system-implementation
description: Use this skill when performing design system implementation, tokenization, shared component standards, theming, and UI consistency work.
---

# Goal
Translate a design language into reusable tokens, components, and rules that keep the product visually and behaviorally consistent.

# Instructions
1. Identify the system primitives first: color, type, spacing, radius, elevation, motion, and layout tokens.
2. Define how tokens map into components, states, and themes instead of treating them as isolated values.
3. Implement reusable UI building blocks with clear variants, state rules, and composition guidance.
4. Align naming and structure with the codebase so the system is easy to adopt incrementally.
5. Review for consistency drift, duplicated styles, and missing state coverage across components.

# Input
A request to build or expand a design system, theme layer, token set, or shared component foundation.

# Output
Design tokens, themed styles, reusable components, and implementation patterns that support a unified interface.

# Best Practices
- Keep token names semantic where possible so they survive redesigns.
- Cover hover, focus, disabled, error, and dark or alternate themes where relevant.
- Document variants through code structure and examples, not only comments.
- Optimize for consistency and adoption, not just visual completeness.
