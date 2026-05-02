---
name: form-handling-validation
description: Use this skill when performing web form implementation, client-side and server-side validation coordination, form UX, and submission flow handling.
---

# Goal
Build forms that are easy to complete, validate reliably, and recover gracefully from submission errors.

# Instructions
1. Clarify the user task, required fields, validation rules, and success destination before shaping the form.
2. Design the form around input grouping, defaults, helper text, and progressive disclosure where it reduces friction.
3. Coordinate client-side feedback with server-side validation so users get fast guidance without losing correctness.
4. Handle pending, success, error, retry, and partial-save states intentionally.
5. Review for accessibility, keyboard flow, field naming clarity, and resilience to interrupted submissions.

# Input
A request to build or improve forms, validation flows, submission UX, or form-processing integrations.

# Output
Form UI, validation logic, submission handlers, and error states that support reliable data entry.

# Best Practices
- Keep labels and errors specific enough that users know how to recover.
- Preserve entered data when recoverable errors occur.
- Validate near the user but enforce correctness on the server.
- Reduce unnecessary fields and steps in high-friction forms.
