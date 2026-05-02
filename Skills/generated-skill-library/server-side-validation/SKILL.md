---
name: server-side-validation
description: Use this skill when performing server-side validation, input sanitization, business rule enforcement, and trusted boundary checks in backend code.
---

# Goal
Validate incoming data on the server so application logic only runs on trusted, well-formed, authorized input.

# Instructions
1. Identify the trust boundary and treat every external input as untrusted until validated.
2. Separate shape validation, type coercion, sanitization, and business rule validation so failure causes remain clear.
3. Validate as close to the request boundary as practical, then pass normalized data deeper into the system.
4. Return precise validation errors that help clients recover without exposing internal details.
5. Review for bypass paths, inconsistent rules across endpoints, and mismatches with frontend validation.

# Input
A request to validate API input, sanitize payloads, enforce constraints, or harden backend request handling.

# Output
Validation schemas, request guards, sanitization logic, and consistent validation error behavior.

# Best Practices
- Do not rely on frontend validation for safety-critical checks.
- Keep validation logic centralized enough to prevent drift.
- Reject unexpected fields when the API contract should be strict.
- Log validation failures carefully without storing sensitive raw input unnecessarily.
