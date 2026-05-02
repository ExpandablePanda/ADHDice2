---
name: accessibility-frontend-development
description: Use this skill when performing frontend accessibility improvements, WCAG-aligned component work, keyboard interaction design, and inclusive UI implementation.
---

# Goal
Build and improve frontend code so more people can perceive, understand, navigate, and operate the interface reliably.

# Instructions
1. Identify the user flow, then inspect structure, semantics, focus order, labels, and announcements for barriers.
2. Prefer native elements and browser behaviors first, then add ARIA only where semantic HTML is insufficient.
3. Implement keyboard support, visible focus, and state communication for interactive components.
4. Check contrast, motion, timing, form feedback, and error messaging against likely WCAG issues.
5. Review the completed UI with screen-reader, keyboard, and zoom use cases in mind.

# Input
A request to make frontend code accessible, fix WCAG issues, improve keyboard support, or audit interaction patterns.

# Output
Accessible frontend code, improved semantics, interaction fixes, and guidance on remaining accessibility considerations.

# Best Practices
- Do not replace semantic HTML with ARIA-heavy custom widgets unless necessary.
- Ensure all interactive controls have accessible names and clear states.
- Keep error messages specific and programmatically associated with inputs.
- Treat accessibility as a product requirement, not a final polish pass.
