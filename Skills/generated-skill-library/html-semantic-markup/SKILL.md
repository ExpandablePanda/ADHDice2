---
name: html-semantic-markup
description: Use this skill when performing semantic HTML page structure, content hierarchy, forms, navigation, and accessible document markup tasks.
---

# Goal
Create clean, semantic HTML that gives the interface a meaningful structure for users, browsers, assistive technology, SEO, and maintainability.

# Instructions
1. Identify the content model before writing tags: page regions, headings, actions, media, lists, and form controls.
2. Choose semantic elements first (`header`, `main`, `section`, `article`, `nav`, `aside`, `footer`, `button`, `label`) and use `div` only when no semantic element fits.
3. Build a valid heading hierarchy, associate labels with controls, and ensure interactive elements use the correct native element.
4. Add only the attributes that improve meaning or behavior, including `alt`, `type`, `aria-*`, `autocomplete`, and `data-*` when justified.
5. Review the final structure for readability, keyboard flow, and future styling flexibility before finishing.

# Input
A request to create or improve page markup, templates, content structure, forms, navigation, or component skeletons.

# Output
Semantic HTML snippets, templates, or component markup with correct document structure and accessible element choices.

# Best Practices
- Prefer native HTML behavior over custom scripting whenever possible.
- Preserve accessible names, labels, and heading order.
- Keep markup minimal and avoid wrapper-heavy DOM trees that hurt performance and maintainability.
- Validate that links navigate and buttons act, rather than swapping their responsibilities.
